import {
  applyCommand as aplicar,
  createEmptyProject,
  FAMILIA_ARMARIO,
  isComponent,
  type Command,
  type Component,
  type ComponentGroup,
  type Familia,
  type Project,
} from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverComponente } from './instancia.ts';
import { montarFila } from './montarFila.ts';
import { orcamentoDoProjeto } from './orcamento.ts';
import { lateraisCompartilhadas } from './orcamentoLaterais.ts';

const aplicarCopia = (p: Project, c: Command): Project => {
  const q = structuredClone(p);
  aplicar(q, c);
  return q;
};

interface Cenario {
  p: Project;
  grupo: ComponentGroup;
}

/** Fila de `quantidade` módulos A60 colados; `regra` liga a lateral compartilhada. */
const montarCenario = (regra: boolean, familia: Familia = FAMILIA_ARMARIO, quantidade = 3): Cenario => {
  let p = createEmptyProject('t');
  p = aplicarCopia(p, { type: 'upsertFamily', family: structuredClone(familia) });
  const largura = 0.6;
  const resultado = montarFila(p, {
    levelId: p.levels[0]!.id,
    face: { a: { x: 0, y: 0 }, b: { x: quantidade * largura, y: 0 } },
    inicio: 0,
    comprimento: quantidade * largura,
    modulos: Array.from({ length: quantidade }, () => ({ familyId: familia.id, typeId: 'A60' })),
    preencher: false,
    nome: 'Fila',
    idBase: 'f',
  });
  for (const componente of resultado.componentes) p = aplicarCopia(p, { type: 'addComponent', component: componente });
  const regras: ComponentGroup['regras'] = regra ? ['alinhar-frente', 'lateral-compartilhada'] : ['alinhar-frente'];
  const grupo: ComponentGroup = { ...resultado.grupo, regras };
  p = aplicarCopia(p, { type: 'upsertComponentGroup', group: grupo });
  return { p, grupo };
};

const componente = (p: Project, id: string): Component => {
  const e = p.elements[id];
  if (e === undefined || !isComponent(e)) throw new Error(`componente ${id} não existe`);
  return e;
};

/** Move um módulo ao longo da fila (eixo X), abrindo espaço entre os vizinhos. */
const deslocar = (p: Project, id: string, dx: number): Project => {
  const c = componente(p, id);
  return aplicarCopia(p, { type: 'updateComponent', id, patch: { x: c.x + dx } });
};

/** Família igual ao armário, sem nenhuma peça de papel `lateral`. */
const familiaSemLateral = (): Familia => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.id = 'fam_armario_sem_lateral';
  f.nome = 'Armário sem lateral';
  f.pecas = f.pecas.filter((peca) => peca.papel !== 'lateral');
  return f;
};

describe('lateraisCompartilhadas', () => {
  it('fila de 3 módulos colados desconta as laterais dos pares consecutivos', () => {
    const { p, grupo } = montarCenario(true);
    const laterais = lateraisCompartilhadas(p);
    expect(laterais).toEqual([
      { grupoId: grupo.id, descontadoDe: 'f_2', peca: 'latD' },
      { grupoId: grupo.id, descontadoDe: 'f_3', peca: 'latD' },
    ]);
  });

  it('módulos separados por 10 cm não compartilham lateral', () => {
    let { p } = montarCenario(true);
    p = deslocar(p, 'f_2', 0.1);
    p = deslocar(p, 'f_3', 0.2);
    expect(lateraisCompartilhadas(p)).toEqual([]);
  });

  it('fila sem a regra não desconta nada e mantém as linhas do orçamento', () => {
    const { p } = montarCenario(false);
    expect(lateraisCompartilhadas(p)).toEqual([]);
    const comGrupo = orcamentoDoProjeto(p);
    expect(comGrupo.economia).toEqual({ laterais: 0, areaChapaM2: 0 });
    const semGrupo = aplicarCopia(p, { type: 'deleteComponentGroup', id: 'f' });
    const orcSemGrupo = orcamentoDoProjeto(semGrupo);
    expect(comGrupo.linhas).toEqual(orcSemGrupo.linhas);
    expect(comGrupo.resumo).toEqual(orcSemGrupo.resumo);
    expect(comGrupo.custo).toEqual(orcSemGrupo.custo);
  });

  it('a soma de peças com a regra é a soma sem a regra menos 2', () => {
    const comRegra = orcamentoDoProjeto(montarCenario(true).p);
    const semRegra = orcamentoDoProjeto(montarCenario(false).p);
    expect(comRegra.economia.laterais).toBe(2);
    expect(comRegra.resumo.totalPecas).toBe(semRegra.resumo.totalPecas - 2);
    expect(comRegra.custo.chapas).toBeLessThan(semRegra.custo.chapas);
  });

  it('a área descontada é 2 × a área da lateral do módulo seguinte', () => {
    const { p } = montarCenario(true);
    const lateral = resolverComponente(p, componente(p, 'f_2')).pecas.find((peca) => peca.id === 'latD' && !peca.vazio);
    expect(lateral).toBeDefined();
    const area = lateral!.tamanho[0] * lateral!.tamanho[1];
    expect(orcamentoDoProjeto(p).economia.areaChapaM2).toBeCloseTo(2 * area, 9);
  });

  it('é determinística: duas leituras do mesmo projeto dão a mesma saída', () => {
    const { p } = montarCenario(true);
    expect(JSON.stringify(lateraisCompartilhadas(p))).toBe(JSON.stringify(lateraisCompartilhadas(structuredClone(p))));
    expect(JSON.stringify(orcamentoDoProjeto(p))).toBe(JSON.stringify(orcamentoDoProjeto(structuredClone(p))));
  });

  it('família sem peça de papel lateral não gera desconto', () => {
    const { p } = montarCenario(true, familiaSemLateral(), 2);
    expect(lateraisCompartilhadas(p)).toEqual([]);
    expect(orcamentoDoProjeto(p).economia).toEqual({ laterais: 0, areaChapaM2: 0 });
  });
});
