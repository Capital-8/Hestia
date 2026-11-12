import { afterEach, describe, expect, it, vi } from 'vitest';
import { servicoGuardaCorpo, type LinhaVistaGC, type SectionResult } from '@hestia/engine';
import { createEmptyProject, makeGuardaCorpo, makeStair, defaultStairTypeId, ProjectStore, type Id, type Project } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { guardaCorpoNaCaixaDoCorte, guardaCorposVisiveisNoCorte } from './guardaCorpo.ts';

/**
 * Realce do guarda-corpo no corte e na elevação (decisão 0016 e 0055 §25): ele é desenhado pelo kernel, fora do `SectionResult`,
 * então o realce de seleção e de cursor sai da MESMA camada de linhas do kernel (aqui, simuladas), como parede e escada.
 */

const retangulo = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
/** gc_e: uma peça cortada (estilo 0) e uma projetada (estilo 1); gc_r: uma peça projetada longe dali. */
const LINHAS: LinhaVistaGC[] = [
  { guardaId: 'gc_e', papel: 1, estilo: 0, pontos: retangulo(1, 0, 1.1, 1) },
  { guardaId: 'gc_e', papel: 2, estilo: 1, pontos: retangulo(2, 0, 2.1, 1) },
  { guardaId: 'gc_r', papel: 1, estilo: 1, pontos: retangulo(6, 0, 6.1, 1) },
];

function projeto(): Project {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [] }) });
  const lado = { lance: true, patamar: true };
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_e', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'escada', escadaId: 'st1', lados: { esquerdo: lado, direito: lado }, posicaoBase: 'degrau' } }) });
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_r', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: { tipo: 'manual', uso: 'livre', ladoDeslocamento: 'centro', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 3, y: 0, dz: 0 }], fechado: false } }) });
  return store.project;
}

const secao = (): SectionResult => ({
  length: 10, zMin: 0, zMax: 3, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [],
  plano: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth: 3 },
} as unknown as SectionResult);

const entrada = (p: Project, s: SectionResult, extra: Partial<SectionInput> = {}): SectionInput => ({
  project: p, section: s, viewport: { cx: 5, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false, ...extra,
});

const mesmoAnel = (a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>): boolean => a.length === b.length && a.every((q, i) => q.x === b[i]!.x && q.y === b[i]!.y);
const doGuarda = (r: { strokes: Array<{ pts: Array<{ x: number; y: number }>; color: string; widthPx: number; alpha: number }> }, cor: string) =>
  r.strokes.filter((s) => s.color === cor && LINHAS.some((l) => mesmoAnel(l.pontos, s.pts)));

afterEach(() => vi.restoreAllMocks());

describe('guarda-corpo no corte: realce de seleção e de cursor', () => {
  const p = projeto();
  const s = secao();
  const falso = () => vi.spyOn(servicoGuardaCorpo(), 'corte').mockReturnValue({ linhas: LINHAS, poligonos: [] });

  it('sem seleção, nenhuma linha do guarda-corpo usa a cor de seleção', () => {
    falso();
    const r = buildSectionDrawList(entrada(p, s, { highlight: { selection: [], hover: null } }));
    expect(doGuarda(r, LIGHT.select)).toHaveLength(0);
  });

  it('selecionado: todas as peças dele ganham contorno de 2 px na cor de seleção e preenchimento 0,25; o outro guarda-corpo não', () => {
    falso();
    const r = buildSectionDrawList(entrada(p, s, { highlight: { selection: ['gc_e'], hover: null } }));
    const sel = doGuarda(r, LIGHT.select);
    expect(sel).toHaveLength(2);
    expect(sel.every((x) => x.widthPx === 2 && x.alpha === 1)).toBe(true);
    expect(sel.some((x) => mesmoAnel(x.pts, LINHAS[2]!.pontos))).toBe(false);
    const fills = r.fills.filter((f) => f.color === LIGHT.select && f.alpha === 0.25 && f.polygons.some((poly) => poly.some((ring) => LINHAS.slice(0, 2).some((l) => mesmoAnel(l.pontos, ring)))));
    expect(fills).toHaveLength(2);
  });

  it('o realce sai depois de todas as linhas normais do guarda-corpo (fica por cima)', () => {
    falso();
    const r = buildSectionDrawList(entrada(p, s, { highlight: { selection: ['gc_e'], hover: null } }));
    const ultimaNormal = r.strokes.map((x, i) => (LINHAS.some((l) => mesmoAnel(l.pontos, x.pts)) && x.color !== LIGHT.select ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const primeiraSelecao = r.strokes.findIndex((x) => x.color === LIGHT.select && LINHAS.some((l) => mesmoAnel(l.pontos, x.pts)));
    expect(primeiraSelecao).toBeGreaterThan(ultimaNormal);
  });

  it('cursor por cima (sem seleção): contorno fraco (1,5 px, alpha 0,55), sem preenchimento', () => {
    falso();
    const r = buildSectionDrawList(entrada(p, s, { highlight: { selection: [], hover: 'gc_r' } }));
    const sel = doGuarda(r, LIGHT.select);
    expect(sel).toHaveLength(1);
    expect(sel[0]).toMatchObject({ widthPx: 1.5, alpha: 0.55 });
    expect(r.fills.some((f) => f.color === LIGHT.select)).toBe(false);
  });

  it('selecionado vence o cursor; oculto na vista (ou fora do isolamento) não ganha realce', () => {
    falso();
    const sobre = buildSectionDrawList(entrada(p, s, { highlight: { selection: ['gc_e'], hover: 'gc_e' } }));
    expect(doGuarda(sobre, LIGHT.select).every((x) => x.widthPx === 2)).toBe(true);
    const oculto = buildSectionDrawList(entrada(p, s, { hidden: new Set<Id>(['gc_e']), highlight: { selection: ['gc_e'], hover: null } }));
    expect(doGuarda(oculto, LIGHT.select)).toHaveLength(0);
  });

  it('revelado (Reveal) continua com a borda azul própria e o realce de seleção soma por cima', () => {
    falso();
    const r = buildSectionDrawList(entrada(p, s, { revealed: new Set<Id>(['gc_e']), highlight: { selection: ['gc_e'], hover: null } }));
    expect(r.strokes.some((x) => x.color === '#2563eb' && LINHAS.some((l) => mesmoAnel(l.pontos, x.pts)))).toBe(true);
    expect(doGuarda(r, LIGHT.select).length).toBeGreaterThan(0);
  });
});

describe('guarda-corpo no corte: caixa de seleção (janela e cruzamento)', () => {
  const p = projeto();
  const s = secao();
  const falso = () => vi.spyOn(servicoGuardaCorpo(), 'corte').mockReturnValue({ linhas: LINHAS, poligonos: [] });

  it('janela (esquerda para a direita) pega só o guarda-corpo com TODAS as peças dentro', () => {
    falso();
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 0.5, y: -0.5 }, { x: 2.5, y: 1.5 })).toEqual(['gc_e']);
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 0.5, y: -0.5 }, { x: 1.5, y: 1.5 })).toEqual([]); // só uma das peças dentro
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 0.5, y: -0.5 }, { x: 7, y: 1.5 }).sort()).toEqual(['gc_e', 'gc_r']);
  });

  it('cruzamento (direita para a esquerda) pega o guarda-corpo que a caixa toca, mesmo em parte', () => {
    falso();
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 1.5, y: 1.5 }, { x: 0.5, y: 0.5 })).toEqual(['gc_e']);
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 6.05, y: 0.5 }, { x: 5, y: 0.2 })).toEqual(['gc_r']);
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 4, y: 0.5 }, { x: 3, y: 0.2 })).toEqual([]);
    // a caixa inteira dentro de uma peça também toca
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 1.07, y: 0.6 }, { x: 1.03, y: 0.4 })).toEqual(['gc_e']);
  });

  it('oculto na vista não entra na caixa nem na lista de visíveis', () => {
    falso();
    const oculto = new Set<Id>(['gc_e']);
    expect(guardaCorpoNaCaixaDoCorte(p, s, oculto, { x: 0, y: -1 }, { x: 7, y: 2 })).toEqual(['gc_r']);
    expect(guardaCorposVisiveisNoCorte(p, s, oculto)).toEqual(['gc_r']);
    expect(guardaCorposVisiveisNoCorte(p, s, undefined).sort()).toEqual(['gc_e', 'gc_r']);
  });

  it('sem kernel pronto (corte devolve null), nada é pego', () => {
    vi.spyOn(servicoGuardaCorpo(), 'corte').mockReturnValue(null);
    expect(guardaCorpoNaCaixaDoCorte(p, s, undefined, { x: 0, y: -1 }, { x: 7, y: 2 })).toEqual([]);
  });
});
