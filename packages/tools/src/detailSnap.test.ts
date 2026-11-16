import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, type AreaPlan } from '@hestia/model';
import { detailEdges, detailPoints } from './detailSnap.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { Inference } from './types.ts';

const LV0 = 'lv_0';
const v = (x: number, y: number) => ({ x, y });

/** Projeto com uma linha de detalhe no nível: (0,0) a (4,0). */
function comLinha() {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addDetailLine', levelId: LV0, item: { id: 'dl_1', a: v(0, 0), b: v(4, 0) } });
  return store;
}

describe('captura de linhas de detalhe: fornecedores (detailSnap)', () => {
  it('detailEdges: a linha vira uma aresta a→b com o dono', () => {
    const p = comLinha().project;
    expect(detailEdges(p, LV0)).toEqual([{ a: v(0, 0), b: v(4, 0), hostId: 'dl_1' }]);
  });

  it('detailPoints: pontas e ponto médio (2,0) com os tipos endpoint e midpoint', () => {
    const p = comLinha().project;
    expect(detailPoints(p, LV0)).toEqual([
      { x: 0, y: 0, hostId: 'dl_1', kind: 'endpoint' },
      { x: 4, y: 0, hostId: 'dl_1', kind: 'endpoint' },
      { x: 2, y: 0, hostId: 'dl_1', kind: 'midpoint' },
    ]);
  });

  it('linha oculta na vista não entra na captura', () => {
    const p = comLinha().project;
    expect(detailEdges(p, LV0, undefined, new Set(['dl_1']))).toEqual([]);
    expect(detailPoints(p, LV0, undefined, new Set(['dl_1']))).toEqual([]);
  });

  it('planta de área: só as linhas da própria planta; as do nível não vazam', () => {
    const store = comLinha();
    const plano: AreaPlan = { id: 'ap1', name: 'Planta de área ap1', levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [] };
    store.exec({ type: 'addAreaPlan', plan: plano });
    store.exec({ type: 'addDetailLine', levelId: LV0, planId: 'ap1', item: { id: 'dl_ap', a: v(0, 5), b: v(4, 5) } });
    expect(detailEdges(store.project, LV0, 'ap1')).toEqual([{ a: v(0, 5), b: v(4, 5), hostId: 'dl_ap' }]);
    expect(detailEdges(store.project, LV0)).toEqual([{ a: v(0, 0), b: v(4, 0), hostId: 'dl_1' }]);
  });
});

/** Ferramenta Linha de detalhe sobre um projeto com as linhas dadas; devolve a inferência depois do movimento. */
function inferirComLinhas(linhas: Array<[string, [number, number], [number, number]]>, inicio: [number, number], cursor: [number, number]): Inference {
  const store = new ProjectStore(createEmptyProject());
  for (const [id, a, b] of linhas) store.exec({ type: 'addDetailLine', levelId: LV0, item: { id, a: v(a[0], a[1]), b: v(b[0], b[1]) } });
  const { env } = makeEnv(store);
  const t = tool('detailLine', env);
  clickAt(t, inicio[0], inicio[1]);
  t.move(P(cursor[0], cursor[1]));
  return (t as unknown as { inference(): Inference }).inference();
}

describe('captura de linhas de detalhe pela ferramenta Linha de detalhe (ToolBase.ctx)', () => {
  it('perpendicular: pé de (1,3) sobre a linha (0,0)-(4,0) é (1,0)', () => {
    // O cursor fica sobre o pé (1,0); o ponto médio da linha (2,0) fica longe e não compete.
    const r = inferirComLinhas([['dl_1', [0, 0], [4, 0]]], [1, 3], [1, 0.03]);
    expect(r.kind).toBe('perpendicular');
    expect(r.point.x).toBeCloseTo(1, 9);
    expect(r.point.y).toBeCloseTo(0, 9);
  });

  it('ponto médio: (2,0) captura midpoint', () => {
    const r = inferirComLinhas([['dl_1', [0, 0], [4, 0]]], [2, 3], [2.02, 0.01]);
    expect(r.kind).toBe('midpoint');
    expect(r.point).toEqual(v(2, 0));
  });

  it('extremidade: (4,0) captura endpoint', () => {
    const r = inferirComLinhas([['dl_1', [0, 0], [4, 0]]], [9, 8], [4.02, 0.01]);
    expect(r.kind).toBe('endpoint');
    expect(r.point).toEqual(v(4, 0));
  });

  it('duas linhas de detalhe cruzadas em (1,0) geram intersection', () => {
    const r = inferirComLinhas([['dl_1', [0, 0], [4, 0]], ['dl_2', [1, -2], [1, 2]]], [9, 8], [1.02, 0.01]);
    expect(r.kind).toBe('intersection');
    expect(r.point.x).toBeCloseTo(1, 9);
    expect(r.point.y).toBeCloseTo(0, 9);
  });
});
