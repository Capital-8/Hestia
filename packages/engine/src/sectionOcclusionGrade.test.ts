import { boxOf, boxesOverlap, differenceClipper, multiArea, multiPoints, type Box, type MultiPolygon } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { MIN_VISIBLE_AREA, MIN_VISIBLE_WIDTH, cotaKeys, visibleParts, type OcclusionItem } from './sectionOcclusion.ts';

const perimetro = (m: MultiPolygon): number => {
  let s = 0;
  for (const p of m) for (const r of p) for (let i = 0; i < r.length; i++) s += Math.hypot(r[(i + 1) % r.length]!.x - r[i]!.x, r[(i + 1) % r.length]!.y - r[i]!.y);
  return s;
};

/** Referência: a versão original, com a varredura de todas as partes visíveis anteriores por item (O(n²) em caixas). */
function referencia(items: OcclusionItem[]): MultiPolygon[] {
  const out: MultiPolygon[] = items.map((): MultiPolygon => []);
  const keys = cotaKeys(items);
  const order = items
    .map((_, i) => i)
    .filter((i) => items[i]!.polygons.length > 0)
    .sort((i, j) => items[i]!.depth - items[j]!.depth || items[i]!.rank - items[j]!.rank || (keys[j] ?? 0) - (keys[i] ?? 0) || i - j);
  const occluders: Array<{ box: Box; polygons: MultiPolygon }> = [];
  for (const i of order) {
    const item = items[i]!;
    const box = boxOf(multiPoints(item.polygons));
    const hits: MultiPolygon[] = [];
    for (const o of occluders) if (boxesOverlap(o.box, box, 1e-9)) hits.push(o.polygons);
    const visible = hits.length > 0 ? differenceClipper(item.polygons, ...hits) : item.polygons;
    if (visible.length === 0) continue;
    const area = multiArea(visible);
    if (area < MIN_VISIBLE_AREA || (2 * area) / perimetro(visible) < MIN_VISIBLE_WIDTH) continue;
    out[i] = visible;
    occluders.push({ box: boxOf(multiPoints(visible)), polygons: visible });
  }
  return out;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const rect = (x0: number, z0: number, x1: number, z1: number): MultiPolygon => [[[{ x: x0, y: z0 }, { x: x1, y: z0 }, { x: x1, y: z1 }, { x: x0, y: z1 }]]];

describe('visibleParts com grade espacial: igual à varredura completa', () => {
  it('centenas de retângulos espalhados, pequenos e longos, com profundidades repetidas', () => {
    const r = rng(42);
    const items: OcclusionItem[] = [];
    for (let i = 0; i < 700; i++) {
      const x = r() * 200;
      const z = r() * 25;
      const larg = i % 17 === 0 ? 60 + r() * 100 : 0.2 + r() * 4;
      const alt = i % 23 === 0 ? 10 : 0.1 + r() * 2.5;
      items.push({ depth: Math.round(r() * 12) / 2, rank: i % 3, polygons: rect(x, z, x + larg, z + alt) });
    }
    items.push({ depth: 0, rank: 0, polygons: [] });
    const a = visibleParts(items);
    const b = referencia(items);
    expect(a).toEqual(b);
    expect(a.filter((m) => m.length > 0).length).toBeGreaterThan(100);
  });

  it('itens que só se tocam na borda (folga de 1e-9) e itens iguais', () => {
    const items: OcclusionItem[] = [
      { depth: 0, rank: 0, polygons: rect(0, 0, 1, 1) },
      { depth: 1, rank: 0, polygons: rect(1, 0, 2, 1) },
      { depth: 1, rank: 0, polygons: rect(1 + 5e-10, 0, 2, 1) },
      { depth: 2, rank: 0, polygons: rect(0, 0, 2, 1) },
      { depth: 2, rank: 1, polygons: rect(0, 0, 2, 1) },
    ];
    expect(visibleParts(items)).toEqual(referencia(items));
  });
});

describe('visibleParts com muitos oclusores sobre a mesma peça (subtração em lotes)', () => {
  it('a região visível é a mesma da diferença em uma passada só', () => {
    const items: OcclusionItem[] = [];
    for (let i = 0; i < 30; i++) items.push({ depth: 0, rank: 0, polygons: rect(i * 0.07, 0.2 + (i % 5) * 0.1, i * 0.07 + 0.3, 0.6 + (i % 5) * 0.1) });
    const alvo = rect(0, 0, 3, 1.5);
    items.push({ depth: 5, rank: 0, polygons: alvo });
    const visivel = visibleParts(items);
    const frente = items.slice(0, 30).map((_, i) => visivel[i]!).filter((m) => m.length > 0);
    const esperado = differenceClipper(alvo, ...frente);
    const obtido = visivel[30]!;
    expect(multiArea(obtido)).toBeCloseTo(multiArea(esperado), 9);
    expect(multiArea(differenceClipper(obtido, esperado)) + multiArea(differenceClipper(esperado, obtido))).toBeLessThan(1e-9);
  });
});
