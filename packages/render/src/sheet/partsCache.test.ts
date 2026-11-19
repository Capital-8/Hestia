import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, emptyTitleBlock, makeWall, type Project, type Sheet, type SheetViewport, type Wall } from '@hestia/model';
import { buildSheetDrawList, buildSheetLayers, drawListOfLayers, viewportPartsCached } from './build.ts';
import { sameSig, SigCache } from './cache.ts';
import { cachedViewportParts, sheetCacheStats, viewportPartsKey } from './partsCache.ts';
import type { ViewportParts } from './types.ts';

const vp = (over: Partial<SheetViewport> = {}): SheetViewport => ({ id: 'v1', view: { kind: 'plan', levelId: 'lv_0' }, at: { x: 20, y: 20 }, size: { w: 200, h: 150 }, scale: 100, ...over });

const sheetOf = (viewports: SheetViewport[]): Sheet => ({
  id: 'sh1',
  number: 'A-101',
  name: 'Planta',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: { ...emptyTitleBlock(), project: 'Casa' },
  viewports,
});

function projectWithWall(viewports: SheetViewport[]): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 } as Wall;
  p.nextOrder = 2;
  p.sheets = [sheetOf(viewports)];
  return p;
}

describe('SigCache', () => {
  it('acerta com a mesma assinatura, erra com outra e conta acertos e erros', () => {
    const c = new SigCache<string>(4);
    const a = {};
    expect(c.get('k', [a])).toBeUndefined();
    c.set('k', [a], 'valor');
    expect(c.get('k', [a])).toBe('valor');
    expect(c.get('k', [{}])).toBeUndefined();
    expect(c.hits).toBe(1);
    expect(c.misses).toBe(2);
  });

  it('expulsa a entrada menos usada ao passar do teto', () => {
    const c = new SigCache<number>(2);
    const s: unknown[] = [];
    c.set('a', s, 1);
    c.set('b', s, 2);
    c.get('a', s); // 'a' vira a mais recente
    c.set('c', s, 3);
    expect(c.get('b', s)).toBeUndefined();
    expect(c.get('a', s)).toBe(1);
    expect(c.get('c', s)).toBe(3);
    expect(c.size).toBe(2);
  });

  it('sameSig compara tamanho e referências', () => {
    const o = {};
    expect(sameSig([1, o], [1, o])).toBe(true);
    expect(sameSig([1, o], [1, {}])).toBe(false);
    expect(sameSig([1], [1, 2])).toBe(false);
  });
});

describe('chave do desenho da vista', () => {
  it('não depende da posição, mas depende da escala, do tamanho e da âncora relativa', () => {
    const base = viewportPartsKey(vp(), 'pt');
    expect(viewportPartsKey(vp({ at: { x: 90, y: 5 } }), 'pt')).toBe(base);
    expect(viewportPartsKey(vp({ scale: 50 }), 'pt')).not.toBe(base);
    expect(viewportPartsKey(vp({ size: { w: 201, h: 150 } }), 'pt')).not.toBe(base);
    expect(viewportPartsKey(vp({ anchor: { x: 21, y: 20 } }), 'pt')).not.toBe(base);
    expect(viewportPartsKey(vp(), 'en')).not.toBe(base);
    // âncora que acompanha a caixa (centro) = mesma chave de "sem âncora"
    expect(viewportPartsKey(vp({ at: { x: 50, y: 50 }, anchor: { x: 150, y: 125 } }), 'pt')).toBe(base);
  });
});

describe('cache do desenho por vista', () => {
  beforeEach(() => sheetCacheStats.clear());
  const parts: ViewportParts = { fills: [], paths: [{ pts: [{ x: 1, y: 2 }], closed: false, widthMm: 0.2, color: '#000' }], texts: [] };

  it('acerta ao repetir, translada ao mover e erra ao mudar a escala', () => {
    const p = createEmptyProject();
    let calls = 0;
    const compute = (): ViewportParts => {
      calls++;
      return parts;
    };
    const a = cachedViewportParts(p, vp(), 'pt', compute);
    expect(calls).toBe(1);
    expect(a.shift).toEqual({ x: 0, y: 0 });
    const b = cachedViewportParts(p, vp(), 'pt', compute);
    expect(calls).toBe(1);
    expect(b.parts).toBe(a.parts);
    const moved = cachedViewportParts(p, vp({ at: { x: 50, y: 65 } }), 'pt', compute);
    expect(calls).toBe(1);
    expect(moved.shift).toEqual({ x: 30, y: 45 });
    cachedViewportParts(p, vp({ scale: 200 }), 'pt', compute);
    expect(calls).toBe(2);
    expect(sheetCacheStats.parts()).toEqual({ hits: 2, misses: 2, size: 2 });
  });

  it('modo exato só aceita a mesma posição e recalcula ao mover', () => {
    const p = createEmptyProject();
    let calls = 0;
    const compute = (): ViewportParts => {
      calls++;
      return parts;
    };
    cachedViewportParts(p, vp(), 'pt', compute);
    cachedViewportParts(p, vp({ at: { x: 21, y: 20 } }), 'pt', compute, undefined, true);
    expect(calls).toBe(2);
  });

  it('invalida por versão do modelo: mudar qualquer campo do projeto, menos as pranchas', () => {
    const p = createEmptyProject();
    let calls = 0;
    const compute = (): ViewportParts => {
      calls++;
      return parts;
    };
    cachedViewportParts(p, vp(), 'pt', compute);
    cachedViewportParts({ ...p, sheets: [] }, vp(), 'pt', compute);
    expect(calls).toBe(1);
    cachedViewportParts({ ...p, elements: { ...p.elements } }, vp(), 'pt', compute);
    expect(calls).toBe(2);
  });

  it('vista 3D nunca entra no cache', () => {
    const p = createEmptyProject();
    let calls = 0;
    const v3 = vp({ view: { kind: '3d' } });
    cachedViewportParts(p, v3, 'pt', () => (calls++, parts));
    cachedViewportParts(p, v3, 'pt', () => (calls++, parts));
    expect(calls).toBe(2);
    expect(sheetCacheStats.parts().size).toBe(0);
  });
});

describe('camadas da prancha com cache', () => {
  beforeEach(() => sheetCacheStats.clear());

  it('mover uma vista reaproveita o desenho e a lista de papel acompanha a nova posição', () => {
    const p1 = projectWithWall([vp()]);
    const l1 = buildSheetLayers(p1, 'sh1')!;
    expect(l1.layers[0]!.shift).toEqual({ x: 0, y: 0 });
    const p2 = { ...p1, sheets: [sheetOf([vp({ at: { x: 120, y: 70 } })])] };
    const l2 = buildSheetLayers(p2, 'sh1')!;
    expect(l2.layers[0]!.parts).toBe(l1.layers[0]!.parts);
    expect(l2.layers[0]!.shift).toEqual({ x: 100, y: 50 });
    expect(l2.layers[0]!.clip).toEqual({ x: 120, y: 70, w: 200, h: 150 });
    // A lista em coordenadas de papel é o desenho do cache somado ao deslocamento (100, 50).
    const moved = drawListOfLayers(l2).groups[0]!;
    const orig = drawListOfLayers(l1).groups[0]!;
    expect(moved.paths.length).toBe(orig.paths.length);
    expect(moved.paths[0]!.pts[0]!.x).toBeCloseTo(orig.paths[0]!.pts[0]!.x + 100, 9);
    expect(moved.paths[0]!.pts[0]!.y).toBeCloseTo(orig.paths[0]!.pts[0]!.y + 50, 9);
  });

  it('editar o modelo refaz o desenho (a vista não fica desatualizada)', () => {
    const p1 = projectWithWall([vp()]);
    const before = buildSheetLayers(p1, 'sh1')!.layers[0]!.parts;
    const w2 = makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 4, y: 3 } });
    const p2: Project = { ...p1, elements: { ...p1.elements, w2: { ...w2, order: 2 } as Wall } };
    const after = buildSheetLayers(p2, 'sh1')!.layers[0]!.parts;
    expect(after).not.toBe(before);
    expect(after.fills.length).toBeGreaterThan(before.fills.length);
  });

  it('o PDF/DXF (lista de desenho) sai igual ao cálculo direto mesmo com o cache quente', () => {
    const p = projectWithWall([vp()]);
    sheetCacheStats.clear();
    const frio = JSON.stringify(buildSheetDrawList(p, 'sh1'));
    buildSheetLayers(p, 'sh1');
    const quente = JSON.stringify(buildSheetDrawList(p, 'sh1'));
    expect(quente).toBe(frio);
    // Vista movida: o modo exato recalcula e bate com o cálculo de um cache vazio.
    const pm = { ...p, sheets: [sheetOf([vp({ at: { x: 33, y: 41 } })])] };
    const direto = (() => {
      sheetCacheStats.clear();
      return JSON.stringify(buildSheetDrawList(pm, 'sh1'));
    })();
    sheetCacheStats.clear();
    buildSheetLayers(p, 'sh1');
    expect(JSON.stringify(buildSheetDrawList(pm, 'sh1'))).toBe(direto);
  });

  it('viewportPartsCached devolve o mesmo objeto de partes nas duas chamadas', () => {
    const p = projectWithWall([vp()]);
    const a = viewportPartsCached(p, vp(), 'pt');
    const b = viewportPartsCached(p, vp(), 'pt');
    expect(b.parts).toBe(a.parts);
  });
});
