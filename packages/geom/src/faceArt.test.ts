import { describe, expect, it } from 'vitest';
import {
  concaveSlatMinGap,
  generateSlatStrips,
  intersection,
  multiArea,
  partitionFacePaint,
  shapeToMultiPolygon,
  transformDxfPaths,
  v2,
} from './index.ts';

describe('faceArt: shapeToMultiPolygon', () => {
  it('converts rect with normalized bounds and rejects degenerate rects', () => {
    const m = shapeToMultiPolygon({ kind: 'rect', u0: 3, v0: 4, u1: 1, v1: 2 });
    expect(multiArea(m)).toBeCloseTo(4, 9);
    expect(shapeToMultiPolygon({ kind: 'rect', u0: 1, v0: 0, u1: 1, v1: 2 })).toEqual([]);
    expect(shapeToMultiPolygon({ kind: 'rect', u0: 0, v0: 2, u1: 3, v1: 2 })).toEqual([]);
    expect(shapeToMultiPolygon({ kind: 'rect', u0: NaN, v0: 0, u1: 1, v1: 1 })).toEqual([]);
  });

  it('converts circle and rejects zero/negative radius', () => {
    const c = shapeToMultiPolygon({ kind: 'circle', center: v2(2, 3), radius: 1 });
    expect(c).toHaveLength(1);
    expect(multiArea(c)).toBeCloseTo(Math.PI, 2);
    expect(shapeToMultiPolygon({ kind: 'circle', center: v2(0, 0), radius: 0 })).toEqual([]);
    expect(shapeToMultiPolygon({ kind: 'circle', center: v2(0, 0), radius: -0.5 })).toEqual([]);
  });

  it('converts ellipse with rotation and rejects degenerate axes', () => {
    const e = shapeToMultiPolygon({ kind: 'ellipse', center: v2(1, 1), rx: 2, ry: 0.5, rotation: Math.PI / 4 });
    expect(e).toHaveLength(1);
    expect(multiArea(e)).toBeCloseTo(Math.PI * 2 * 0.5, 2);
    expect(shapeToMultiPolygon({ kind: 'ellipse', center: v2(0, 0), rx: 0, ry: 1 })).toEqual([]);
  });

  it('converts tall arch, semicircular arch, and short clipped dome', () => {
    // w = 2 (r = 1), h = 3 -> rect 2x2 + semicircle pi/2
    const tall = shapeToMultiPolygon({ kind: 'arch', u0: 0, v0: 0, u1: 2, v1: 3 });
    expect(multiArea(tall)).toBeCloseTo(4 + Math.PI / 2, 2);

    // w = 2 (r = 1), h = 1 -> semicircle pi/2
    const semi = shapeToMultiPolygon({ kind: 'arch', u0: 0, v0: 0, u1: 2, v1: 1 });
    expect(multiArea(semi)).toBeCloseTo(Math.PI / 2, 2);

    // w = 2 (r = 1), h = 0.5 -> circular segment of height 0.5
    const cap = shapeToMultiPolygon({ kind: 'arch', u0: 0, v0: 0, u1: 2, v1: 0.5 });
    const theta = 2 * Math.acos(1 - 0.5);
    const expectedCap = 0.5 * (theta - Math.sin(theta));
    expect(multiArea(cap)).toBeCloseTo(expectedCap, 2);

    expect(shapeToMultiPolygon({ kind: 'arch', u0: 0, v0: 0, u1: 0, v1: 2 })).toEqual([]);
  });

  it('converts lineBand and arcBand without corner gaps', () => {
    const lShape = shapeToMultiPolygon({
      kind: 'lineBand',
      pts: [v2(0, 0), v2(2, 0), v2(2, 2)],
      width: 0.2,
    });
    expect(lShape).toHaveLength(1);
    // Two 2x0.2 legs minus overlap at corner (~0.04) plus caps > 0.76
    expect(multiArea(lShape)).toBeGreaterThan(0.75);
    expect(multiArea(lShape)).toBeLessThan(0.85);

    const closedBand = shapeToMultiPolygon({
      kind: 'arcBand',
      pts: [v2(0, 0), v2(2, 0), v2(2, 2), v2(0, 2)],
      width: 0.1,
      closed: true,
    });
    expect(closedBand).toHaveLength(1);
    expect(closedBand[0]!.length).toBe(2); // outer + inner hole!
    expect(multiArea(closedBand)).toBeCloseTo(4 * 2 * 0.1 - 4 * 0.01, 1);

    expect(shapeToMultiPolygon({ kind: 'lineBand', pts: [v2(0, 0)], width: 0.2 })).toEqual([]);
    expect(shapeToMultiPolygon({ kind: 'lineBand', pts: [v2(0, 0), v2(1, 0)], width: 0 })).toEqual([]);
    expect(shapeToMultiPolygon({ kind: 'lineBand', pts: [v2(1, 1), v2(1, 1)], width: 0.2 })).toEqual([]);
  });

  it('validates poly shapes including holes', () => {
    const withHole = shapeToMultiPolygon({
      kind: 'poly',
      rings: [
        [v2(0, 0), v2(4, 0), v2(4, 4), v2(0, 4)],
        [v2(1, 1), v2(1, 2), v2(2, 2), v2(2, 1)],
      ],
    });
    expect(multiArea(withHole)).toBeCloseTo(15, 9);
    expect(shapeToMultiPolygon({ kind: 'poly', rings: [] })).toEqual([]);
    expect(shapeToMultiPolygon({ kind: 'poly', rings: [[v2(0, 0), v2(1, 0)]] })).toEqual([]);
  });
});

describe('faceArt: generateSlatStrips', () => {
  it('generates vertical and diagonal strips clipped to region', () => {
    const region = shapeToMultiPolygon({ kind: 'rect', u0: 0, v0: 0, u1: 1, v1: 2 });
    // pitch = 0.2 (0.1 width + 0.1 gap), vertical strips (90 deg -> d=(0,1), p=(-1,0))
    const strips = generateSlatStrips(region, {
      width: 0.1,
      gap: 0.1,
      depth: 0.02,
      angleDeg: 90,
      slatMaterialId: 'mat_wood',
    });
    expect(strips.length).toBeGreaterThanOrEqual(5);
    const totalArea = strips.reduce((s, m) => s + multiArea(m), 0);
    // Region width 1.0, height 2.0, 50% duty cycle -> ~1.0 m2
    expect(totalArea).toBeCloseTo(1.0, 1);

    const diag = generateSlatStrips(region, {
      width: 0.05,
      gap: 0.05,
      depth: 0.02,
      angleDeg: 45,
      slatMaterialId: 'mat_wood',
    });
    expect(diag.length).toBeGreaterThan(5);
  });

  it('returns empty for invalid specs or empty region', () => {
    const region = shapeToMultiPolygon({ kind: 'rect', u0: 0, v0: 0, u1: 1, v1: 1 });
    expect(generateSlatStrips([], { width: 0.1, gap: 0.1, depth: 0.02, angleDeg: 0, slatMaterialId: 'm' })).toEqual([]);
    expect(generateSlatStrips(region, { width: 0, gap: 0.1, depth: 0.02, angleDeg: 0, slatMaterialId: 'm' })).toEqual([]);
    expect(generateSlatStrips(region, { width: 0.1, gap: -0.01, depth: 0.02, angleDeg: 0, slatMaterialId: 'm' })).toEqual([]);
  });
});

describe('faceArt: partitionFacePaint', () => {
  const wallFace = shapeToMultiPolygon({ kind: 'rect', u0: 0, v0: 0, u1: 4, v1: 3 }); // 12 m2

  it('partitions coplanar layers by descending order and preserves total area', () => {
    const res = partitionFacePaint(wallFace, 'mat_base', [
      { id: 'low', shape: { kind: 'rect', u0: 0, v0: 0, u1: 3, v1: 2 }, materialId: 'mat_a', order: 1 },
      { id: 'high', shape: { kind: 'rect', u0: 2, v0: 1, u1: 5, v1: 3 }, materialId: 'mat_b', order: 2 },
    ]);
    expect(res.extrusions).toEqual([]);
    const byId = Object.fromEntries(res.coplanar.map((c) => [c.itemId ?? 'base', multiArea(c.poly)]));
    // high clipped to [2,4]x[1,3] = 2*2 = 4
    expect(byId['high']).toBeCloseTo(4, 9);
    // low [0,3]x[0,2] (6) minus [2,3]x[1,2] (1) = 5
    expect(byId['low']).toBeCloseTo(5, 9);
    // base = 12 - 4 - 5 = 3
    expect(byId['base']).toBeCloseTo(3, 9);
  });

  it('clips overlapping extrusions in clipBelow mode and skips clipping for overlay or disjoint depth', () => {
    const res = partitionFacePaint(wallFace, 'mat_base', [
      // Horizontal lower-order strip at depth [0, 0.02]
      {
        id: 'horiz',
        shape: { kind: 'rect', u0: 0, v0: 1, u1: 4, v1: 2 },
        materialId: 'mat_wood',
        order: 1,
        baseOffset: 0,
        thickness: 0.02,
      },
      // Vertical higher-order strip at depth [0, 0.03] (overlaps depth!)
      {
        id: 'vert',
        shape: { kind: 'rect', u0: 1, v0: 0, u1: 2, v1: 3 },
        materialId: 'mat_stone',
        order: 2,
        baseOffset: 0,
        thickness: 0.03,
      },
      // Overlay lower-order badge at same depth [0, 0.02]: NOT clipped
      {
        id: 'badge',
        shape: { kind: 'rect', u0: 1, v0: 1, u1: 2, v1: 2 },
        materialId: 'mat_brass',
        order: 0,
        baseOffset: 0,
        thickness: 0.02,
        cutMode: 'overlay',
      },
      // Stacked cap in front of vert at depth [0.03, 0.05]: disjoint depth -> NOT clipped by vert
      {
        id: 'cap',
        shape: { kind: 'rect', u0: 1, v0: 0, u1: 2, v1: 3 },
        materialId: 'mat_cap',
        order: 0,
        baseOffset: 0.03,
        thickness: 0.02,
      },
    ]);

    const findExt = (id: string) => res.extrusions.find((e) => e.itemId === id)!;
    expect(multiArea(findExt('vert').poly)).toBeCloseTo(3, 9);
    // horiz was 4x1=4, clipped by 1x1 from vert -> 3
    expect(multiArea(findExt('horiz').poly)).toBeCloseTo(3, 9);
    expect(multiArea(intersection(findExt('horiz').poly, findExt('vert').poly))).toBeCloseTo(0, 9);
    // badge (overlay) keeps its full 1x1 area
    expect(multiArea(findExt('badge').poly)).toBeCloseTo(1, 9);
    // cap (disjoint depth [0.03, 0.05]) keeps its full 3 m2 area
    expect(multiArea(findExt('cap').poly)).toBeCloseTo(3, 9);
  });

  it('handles slats with backMaterialId and higher-order extrusion clipping before slat generation', () => {
    const res = partitionFacePaint(wallFace, 'mat_base', [
      {
        id: 'slatPanel',
        shape: { kind: 'rect', u0: 0, v0: 0, u1: 2, v1: 2 },
        materialId: 'mat_ignored',
        order: 1,
        baseOffset: 0,
        slats: {
          width: 0.1,
          gap: 0.1,
          depth: 0.03,
          angleDeg: 90,
          slatMaterialId: 'mat_slat',
          backMaterialId: 'mat_back',
        },
      },
      {
        id: 'cutBox',
        shape: { kind: 'rect', u0: 0, v0: 0, u1: 1, v1: 2 },
        materialId: 'mat_stone',
        order: 2,
        baseOffset: 0,
        thickness: 0.03,
      },
    ]);

    const back = res.coplanar.find((c) => c.itemId === 'slatPanel');
    expect(back?.materialId).toBe('mat_back');
    expect(multiArea(back!.poly)).toBeCloseTo(4, 9);
    const base = res.coplanar.find((c) => c.itemId === undefined);
    expect(multiArea(base!.poly)).toBeCloseTo(8, 9);

    const slats = res.extrusions.filter((e) => e.itemId === 'slatPanel');
    expect(slats.length).toBeGreaterThan(0);
    for (const s of slats) {
      expect(s.materialId).toBe('mat_slat');
      expect(s.thickness).toBeCloseTo(0.03, 9);
      // Must not overlap cutBox ([0,1]x[0,2])
      const cutBoxPoly = shapeToMultiPolygon({ kind: 'rect', u0: 0, v0: 0, u1: 1, v1: 2 });
      expect(multiArea(intersection(s.poly, cutBoxPoly))).toBeCloseTo(0, 9);
    }
  });
});

describe('faceArt: concaveSlatMinGap & transformDxfPaths', () => {
  it('computes concaveSlatMinGap edge cases and formula', () => {
    expect(concaveSlatMinGap(5, 0.05, 0)).toBe(0);
    expect(concaveSlatMinGap(5, 0, 0.03)).toBe(0);
    expect(concaveSlatMinGap(0.03, 0.05, 0.03)).toBe(Infinity);
    expect(concaveSlatMinGap(0.02, 0.05, 0.03)).toBe(Infinity);
    expect(concaveSlatMinGap(Infinity, 0.05, 0.03)).toBe(0);
    expect(concaveSlatMinGap(1.03, 0.05, 0.03)).toBeCloseTo((0.05 * 0.03) / 1.0, 9);
  });

  it('scales, rotates, and translates DXF paths', () => {
    const out = transformDxfPaths(
      [{ pts: [v2(1, 0), v2(2, 0)], closed: true }],
      v2(10, 20),
      90,
      2,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.closed).toBe(true);
    expect(out[0]!.pts[0]!.x).toBeCloseTo(10, 9);
    expect(out[0]!.pts[0]!.y).toBeCloseTo(22, 9);
    expect(out[0]!.pts[1]!.x).toBeCloseTo(10, 9);
    expect(out[0]!.pts[1]!.y).toBeCloseTo(24, 9);
  });
});
