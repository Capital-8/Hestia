import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, wallsOnLevel } from '@hestia/model';
import { assinaturaDasCortinas, assinaturasDasCortinasPorNivel, ehParedeCortina, entradaCortinaDoProjeto, paredesCortina, semCortina, temCortina } from './cortinaProjeto.ts';
import { cortinaAvisosDeGeometria, cortinaAvisosSemKernel } from './cortinaIssues.ts';
import { montarCenaA1 } from './kernelA1.ts';
import { resolveLevelTs } from './resolve.ts';
import { especCortinaTeste, projetoComCortina } from './fixtureCortina.ts';
import { AVISO_CORTINA } from './kernelCortinaTabelas.ts';

describe('parede cortina: separação da parede comum', () => {
  it('reconhece a cortina e só ela', () => {
    const p = projetoComCortina();
    expect(temCortina(p)).toBe(true);
    expect(ehParedeCortina(p, p.elements.ct1 as never)).toBe(true);
    expect(ehParedeCortina(p, p.elements.w1 as never)).toBe(false);
    expect(paredesCortina(p).map((c) => c.wall.id)).toEqual(['ct1']);
    expect(semCortina(p, wallsOnLevel(p, 'lv_0')).map((w) => w.id)).toEqual(['w1']);
  });

  it('a cortina não entra na seção 1 nem no resolvedor de camadas; a comum continua', () => {
    const p = projetoComCortina();
    const a1 = montarCenaA1(p);
    expect(a1.idDe.has('ct1')).toBe(false);
    expect(a1.idDe.has('w1')).toBe(true);
    expect(a1.nLinhas.paredes).toBe(1);
    const r = resolveLevelTs(p, 'lv_0');
    expect(Object.keys(r.walls)).toEqual(['w1']);
  });
});

describe('entrada do adaptador a partir do projeto', () => {
  it('monta tipos, montantes, painéis e a cortina com cota e altura', () => {
    const e = entradaCortinaDoProjeto(projetoComCortina());
    expect(e.entrada.cortinas).toHaveLength(1);
    const c = e.entrada.cortinas[0]!;
    expect(c).toMatchObject({ id: 'ct1', levelNum: 0, typeId: 'wt_ct', zBase: 0, height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } });
    expect(e.entrada.tipos.map((t) => t.id)).toEqual(['wt_ct']);
    expect(e.entrada.montantes.map((m) => m.id)).toEqual(['mul_ret_50x100']);
    expect(e.entrada.paineis.map((m) => m.id)).toEqual(['pnl_vidro_10']);
    expect(e.entrada.materialNum!('mat_vidro')).toBeGreaterThan(0);
    expect(e.ignoradas).toEqual([]);
  });

  it('cortina com montante inexistente é ignorada, sem lançar', () => {
    // O modelo recusa o tipo inexistente nos comandos; um arquivo corrompido ainda pode trazê-lo.
    const p = structuredClone(projetoComCortina());
    p.mullionTypes = {};
    const e = entradaCortinaDoProjeto(p);
    expect(e.entrada.cortinas).toHaveLength(0);
    expect(e.ignoradas).toEqual(['ct1']);
  });

  it('o limiar da sobra do sistema vai para os dois eixos', () => {
    const e = entradaCortinaDoProjeto(projetoComCortina(especCortinaTeste({ minRemainder: 0.08 })));
    expect(e.entrada.tipos[0]!.u.minRemainder).toBe(0.08);
    expect(e.entrada.tipos[0]!.v.minRemainder).toBe(0.08);
  });
});

describe('assinatura por hash', () => {
  it('muda ao editar a grade, não ao editar parede comum; tamanho fixo', () => {
    const p = projetoComCortina();
    const h0 = assinaturaDasCortinas(p);
    const s = new ProjectStore(p);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 8 }, b: { x: 3, y: 8 }, height: 3 }) });
    expect(assinaturaDasCortinas(s.project)).toBe(h0);
    const q = projetoComCortina(especCortinaTeste({ u: { mode: 'fixedNumber', count: 40 } }));
    const grande = projetoComCortina(especCortinaTeste({ u: { mode: 'manual', positions: Array.from({ length: 100 }, (_, i) => 0.05 * (i + 1)) } }));
    expect(assinaturaDasCortinas(q)).not.toBe(h0);
    expect(assinaturaDasCortinas(grande)).not.toBe(h0);
    // O hash não cresce com o número de linhas da grade (nunca o JSON como chave).
    expect(Math.abs(assinaturaDasCortinas(grande).length - h0.length)).toBeLessThanOrEqual(2);
    expect(assinaturaDasCortinas(createEmptyProject())).toBe('');
  });

  it('hash por nível só existe para níveis com cortina', () => {
    expect([...assinaturasDasCortinasPorNivel(projetoComCortina()).keys()]).toEqual(['lv_0']);
  });
});

describe('avisos da cortina', () => {
  it('traduz medidas do Rust, com informativos separados, e o aviso sem kernel', () => {
    const base = { i: null, j: null, medido: 0.1, limite: 0.15, x: 0, y: 0, z: 0, wallId: 'ct1' };
    const r = cortinaAvisosDeGeometria([{ ...base, codigo: AVISO_CORTINA.celulaPequena }, { ...base, codigo: AVISO_CORTINA.sobraFundida }, { ...base, codigo: 99 }]);
    expect(r.map((x) => [x.code, x.severity, x.elementId])).toEqual([
      ['cortina-celula-pequena', 'warning', 'ct1'],
      ['cortina-sobra-fundida', 'info', 'ct1'],
    ]);
    expect(r[0]!.message).toContain('0.1');
    expect(cortinaAvisosDeGeometria(null)).toEqual([]);
    const sk = cortinaAvisosSemKernel(projetoComCortina());
    expect(sk).toHaveLength(1);
    expect(sk[0]!.code).toBe('cortina-sem-kernel');
  });
});
