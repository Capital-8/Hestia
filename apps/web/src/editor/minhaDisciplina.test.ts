import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, makePlanView, type Discipline, type Element, type Project } from '@hestia/model';
import { useUi } from './state.ts';
import { visibilityOf } from './viewVisibility.ts';

/*
 * Minha disciplina (decisão 0060, adendo 3, decisão 5): a disciplina de trabalho é pessoal, mora só na sessão e
 * muda o tom das categorias da planta. Valores literais da tabela §4.2 (linha Arquitetura e linha Estrutura).
 * Nenhum teste aqui grava `minhaDisciplina` no projeto.
 */

afterEach(() =>
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, minhaDisciplina: null, sectionId: null, viewTemp: {}, selection: [], hover: null, subElemento: null }),
);

const projetoBase = (): Project => structuredClone(buildTemplate('house2'));
const doTipo = (p: Project, kind: Element['kind']): Element => Object.values(p.elements).find((e) => e.kind === kind)!;

/** Elemento de teste sem geometria: o tom só lê `id`, `kind` e (no componente) a família. */
function elementoForjado(p: Project, id: string, kind: Element['kind']): Element {
  const e = { id, kind, levelId: 'lv_0' } as unknown as Element;
  p.elements[id] = e;
  return e;
}

const vista = (planViewId: string | null, minhaDisciplina: Discipline | null) => ({
  ...useUi.getState(),
  view: 'plan' as const,
  planKind: 'floor' as const,
  levelId: 'lv_0',
  areaPlanId: null,
  planViewId,
  minhaDisciplina,
  sectionId: null,
  viewTemp: {},
});

describe('minha disciplina pessoal muda o tom por categoria (adendo 3, decisão 5)', () => {
  it('sem minhaDisciplina, a planta padrão (Arquitetura) mantém o desenho de hoje', () => {
    const p = projetoBase();
    const vis = visibilityOf(p, vista(null, null));
    expect(vis.halftone.size).toBe(0);
    expect(vis.hidden.size).toBe(0);
    expect(vis.revealed.size).toBe(0);
  });

  it("com minhaDisciplina 'estrutura' na planta padrão, parede/porta ficam em meio-tom e pilar/viga normais", () => {
    const p = projetoBase();
    const parede = doTipo(p, 'wall');
    const porta = doTipo(p, 'door');
    const pilar = elementoForjado(p, 'col_teste', 'column');
    const viga = elementoForjado(p, 'viga_teste', 'beam');

    const vis = visibilityOf(p, vista(null, 'estrutura'));
    expect(vis.halftone.has(parede.id)).toBe(true);
    expect(vis.halftone.has(porta.id)).toBe(true);
    expect(vis.hidden.has(parede.id)).toBe(false);
    expect(vis.halftone.has(pilar.id)).toBe(false);
    expect(vis.hidden.has(pilar.id)).toBe(false);
    expect(vis.halftone.has(viga.id)).toBe(false);
    expect(vis.hidden.has(viga.id)).toBe(false);
  });

  it("com minhaDisciplina 'estrutura' numa planta de Elétrico, o tom de Estrutura vence o da planta", () => {
    const p = projetoBase();
    p.planViews = [makePlanView({ id: 'pv_ele', levelId: 'lv_0', name: 'Elétrico', discipline: 'eletrico' })];
    const parede = doTipo(p, 'wall');
    const pilar = elementoForjado(p, 'col_teste', 'column');

    // Sem minha disciplina, a planta de Elétrico põe Arquitetura e Estrutura em meio-tom (§4.2, linha Elétrico).
    const semMinha = visibilityOf(p, vista('pv_ele', null));
    expect(semMinha.halftone.has(parede.id)).toBe(true);
    expect(semMinha.halftone.has(pilar.id)).toBe(true);

    // Com a disciplina de trabalho Estrutura, a parede continua em meio-tom e o pilar passa a normal.
    const comMinha = visibilityOf(p, vista('pv_ele', 'estrutura'));
    expect(comMinha.halftone.has(parede.id)).toBe(true);
    expect(comMinha.halftone.has(pilar.id)).toBe(false);
    expect(comMinha.hidden.has(pilar.id)).toBe(false);
  });

  it('voltar minhaDisciplina para null restaura os tons da planta (o cache não reaproveita o tom anterior)', () => {
    const p = projetoBase();
    const parede = doTipo(p, 'wall');

    useUi.setState({ minhaDisciplina: 'estrutura' });
    const comMinha = visibilityOf(p, vista(null, 'estrutura'));
    expect(comMinha.halftone.has(parede.id)).toBe(true);

    useUi.setState({ minhaDisciplina: null });
    const semMinha = visibilityOf(p, vista(null, null));
    expect(semMinha.halftone.has(parede.id)).toBe(false);
    expect(semMinha.hidden.has(parede.id)).toBe(false);
  });

  it('o projeto serializado não ganha minhaDisciplina', () => {
    const p = projetoBase();
    const antes = JSON.stringify(p);

    useUi.setState({ minhaDisciplina: 'estrutura' });
    visibilityOf(p, vista(null, 'estrutura'));

    expect(JSON.stringify(p)).toBe(antes);
    expect(Object.keys(JSON.parse(JSON.stringify(p)) as Record<string, unknown>)).not.toContain('minhaDisciplina');
  });
});
