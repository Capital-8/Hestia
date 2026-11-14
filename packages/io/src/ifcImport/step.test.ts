import { describe, expect, it } from 'vitest';
import { parseStep, schemaOf, type StepValue } from './step.ts';

/**
 * Arquivo STEP mínimo, mas com o cabeçalho e a seção DATA na ordem real: exercita de uma vez espaço em volta do `=`,
 * comentário, apóstrofo dobrado, escapes, `$`/`*`, listas aninhadas, valor tipado, expoente e uma entidade quebrada.
 * A entidade `#60` tem um parâmetro vazio (`1,,2`): deve cair em `broken` sem derrubar as vizinhas.
 */
const TEXTO = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('teste.ifc','2026-10-28',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
/* comentário entre as entidades */
#1 = IFCPROJECT('guid-1',#2,'Projeto',$,$,$,$,(#3),#4);
#10 = IFCWALL('guid-wall',#2,'Parede com ''aspas''',$,#11,#12,$,$,.T.);
#20 = IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(1.2E-3),#21);
#30 = IFCTESTLIST(((1,2),(3,4)),(),'texto');
#40 = IFCTESTESCAPE('caf\\X2\\00E9\\X0\\ e \\S\\c');
#50 = IFCTESTNULL($,*);
#60 = IFCBAD(1,,2);
#70 = IFCAFTER('ok');
ENDSEC;
END-ISO-10303-21;`;

const arquivo = parseStep(TEXTO);
const entidade = (id: number) => arquivo.entities.get(id)!;
const args = (id: number): StepValue[] => entidade(id).args;

describe('schemaOf', () => {
  it('lê o schema do FILE_SCHEMA em maiúsculas', () => {
    expect(schemaOf(TEXTO)).toBe('IFC4');
    expect(schemaOf("FILE_SCHEMA ( ( 'ifc2x3' ) )")).toBe('IFC2X3');
  });

  it('devolve string vazia quando não há FILE_SCHEMA', () => {
    expect(schemaOf('')).toBe('');
    expect(schemaOf('DATA;\nENDSEC;')).toBe('');
  });
});

describe('parseStep', () => {
  it('lê o cabeçalho e as entidades com espaço em volta do "=" e comentário no meio', () => {
    expect(arquivo.schema).toBe('IFC4');
    expect(entidade(1).type).toBe('IFCPROJECT');
    // #1 vem logo depois do comentário: prova que o comentário foi pulado
    expect(entidade(1).id).toBe(1);
    expect(entidade(10).type).toBe('IFCWALL');
  });

  it('decodifica apóstrofo dobrado como um apóstrofo', () => {
    expect(args(10)[2]).toEqual({ k: 'str', v: "Parede com 'aspas'" });
  });

  it('decodifica os escapes \\X2\\...\\X0\\ e \\S\\', () => {
    expect(args(40)[0]).toEqual({ k: 'str', v: 'café e ã' });
  });

  it('distingue parâmetro omitido ($) de derivado (*)', () => {
    expect(args(50)).toEqual([{ k: 'null' }, { k: 'derived' }]);
  });

  it('mantém listas aninhadas e listas vazias', () => {
    expect(args(30)[0]).toEqual({
      k: 'list',
      items: [
        { k: 'list', items: [{ k: 'num', v: 1 }, { k: 'num', v: 2 }] },
        { k: 'list', items: [{ k: 'num', v: 3 }, { k: 'num', v: 4 }] },
      ],
    });
    expect(args(30)[1]).toEqual({ k: 'list', items: [] });
  });

  it('lê valor tipado e número com expoente', () => {
    expect(args(20)[0]).toEqual({ k: 'type', name: 'IFCLENGTHMEASURE', arg: { k: 'num', v: 1.2e-3 } });
  });

  it('uma entidade quebrada não derruba as outras', () => {
    expect(arquivo.broken).toBe(1);
    expect(arquivo.entities.has(60)).toBe(false);
    // a entidade seguinte ao erro continua no mapa
    expect(entidade(70).type).toBe('IFCAFTER');
    expect(args(70)[0]).toEqual({ k: 'str', v: 'ok' });
  });

  it('lê referências de entidade com "#"', () => {
    expect(args(1)[1]).toEqual({ k: 'ref', id: 2 });
    expect(args(10)[4]).toEqual({ k: 'ref', id: 11 });
    expect(args(10)[5]).toEqual({ k: 'ref', id: 12 });
  });

  it('lê enumeração entre pontos e o mantém em maiúsculas', () => {
    expect(args(10)[8]).toEqual({ k: 'enum', v: 'T' });
  });
});

describe('parseStep preguiçoso', () => {
  const T = `DATA;
#1 = IFCA('a;b ''c'' ;',(#2,#3),$,*,.ENUM.,IFCLEN(2.5),-3,1.E2);
#2 = IFCB(
  'multi;
linha' ,
  ((1.,2.),(3.,4.)), IFCNEST(IFCINNER('x;')) );
#3 = IFCC();
#4 = IFCC('\\X2\\00E9\\X0\\;');
ENDSEC;`;
  const f = parseStep(T);
  it('lê strings com ; e aspas duplicadas, listas, $, *, enum, refs e tipos', () => {
    expect(f.broken).toBe(0);
    expect(f.entities.get(1)!.args).toEqual([
      { k: 'str', v: "a;b 'c' ;" },
      { k: 'list', items: [{ k: 'ref', id: 2 }, { k: 'ref', id: 3 }] },
      { k: 'null' },
      { k: 'derived' },
      { k: 'enum', v: 'ENUM' },
      { k: 'type', name: 'IFCLEN', arg: { k: 'num', v: 2.5 } },
      { k: 'num', v: -3 },
      { k: 'num', v: 100 },
    ]);
  });
  it('entidade multilinha e tipo aninhado', () => {
    const a = f.entities.get(2)!.args;
    expect(a[0]).toEqual({ k: 'str', v: 'multi;\nlinha' });
    expect(a[2]).toEqual({ k: 'type', name: 'IFCNEST', arg: { k: 'type', name: 'IFCINNER', arg: { k: 'str', v: 'x;' } } });
    expect(f.entities.get(3)!.args).toEqual([]);
    expect(f.entities.get(4)!.args).toEqual([{ k: 'str', v: 'é;' }]);
  });
  it('mantém ordem do arquivo, contagem e agrupamento por tipo sob demanda', () => {
    expect(f.entities.size).toBe(4);
    expect([...f.entities.values()].map((e) => e.id)).toEqual([1, 2, 3, 4]);
    expect([...f.entities.entries()].map(([id, e]) => [id, e.type])).toEqual([[1, 'IFCA'], [2, 'IFCB'], [3, 'IFCC'], [4, 'IFCC']]);
    expect(f.types.get('IFCC')!.map((e) => e.id)).toEqual([3, 4]);
    expect(f.types.get('NADA')).toBeUndefined();
    expect([...f.types.keys()]).toEqual(['IFCA', 'IFCB', 'IFCC']);
    expect(f.entities.get(1)!.type).toBe(f.entities.get(1)!.type);
    expect(f.entities.get(99)).toBeUndefined();
  });
});
