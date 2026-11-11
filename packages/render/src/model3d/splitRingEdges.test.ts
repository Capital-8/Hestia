import { describe, expect, it } from 'vitest';
import { generateLShape, resolveStairsOnLevel, stairBodyForDrawing, stairFinishModel, type StairComponentSketch } from '@hestia/engine';
import { sub, type Ring, type Vec2 } from '@hestia/geom';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, makeStair, type StairLanding, type StairRun, type StairType } from '@hestia/model';
import { splitRingEdges } from './stairSolids.ts';

const VERTEX_TOL = 1e-6;

/** Referência: a varredura completa de todos os vértices por aresta (a forma original, O(V²)). */
function referencia(rings: Ring[]): Ring[] {
  const all = rings.flatMap((r, i) => r.map((p) => ({ p, i })));
  return rings.map((r, i) => {
    const out: Ring = [];
    r.forEach((p, e) => {
      out.push(p);
      const q = r[(e + 1) % r.length]!;
      const d = sub(q, p);
      const L = Math.hypot(d.x, d.y);
      if (L < VERTEX_TOL) return;
      const found: Array<{ t: number; v: Vec2 }> = [];
      for (const o of all) {
        if (o.i === i) continue;
        const w = sub(o.p, p);
        const t = (w.x * d.x + w.y * d.y) / L;
        if (t <= VERTEX_TOL || t >= L - VERTEX_TOL) continue;
        if (Math.abs(w.x * d.y - w.y * d.x) / L < VERTEX_TOL && !found.some((f) => Math.abs(f.t - t) < VERTEX_TOL)) found.push({ t, v: o.p });
      }
      found.sort((a, b) => a.t - b.t);
      for (const f of found) out.push(f.v);
    });
    return out;
  });
}

const FIN = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 };

function escadaL(): { rings: Ring[] } {
  const sk: StairComponentSketch[] = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, tread: 0.27, risersFirst: 10, risersSecond: 9 });
  const components = sk.map((c, i) => (c.kind === 'run' ? ({ id: `c${i}`, kind: 'run', ...c.run } as StairRun) : ({ id: `c${i}`, kind: 'landing', ...c.landing } as StairLanding)));
  const s = new ProjectStore(createEmptyProject());
  const base = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;
  s.exec({ type: 'upsertStairType', stairType: { ...base, id: 'stt_t', ...FIN } as StairType });
  s.exec({ type: 'upsertLevel', level: { id: 'lv_top', name: 'Topo', elevation: 3.06 } as never });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_t', levelId: 'lv_0', topLevelId: 'lv_top', components }) });
  const st = resolveStairsOnLevel(s.project, 'lv_0')[0]!;
  const rings = [...stairBodyForDrawing(st).pieces.map((p) => p.polygon), ...(stairFinishModel(st)?.solids ?? []).map((f) => f.polygon)];
  return { rings };
}

describe('splitRingEdges: a grade acha os mesmos vértices da varredura completa', () => {
  it('escada em L com acabamentos (estrutura + pisos + espelhos + bocel)', () => {
    const { rings } = escadaL();
    expect(rings.length).toBeGreaterThan(30);
    expect(splitRingEdges(rings)).toEqual(referencia(rings));
  });

  it('retângulos que dividem só parte de uma aresta (T na planta), inclusive longe da origem e com coordenadas negativas', () => {
    const rects: Ring[] = [];
    for (let i = 0; i < 12; i++) {
      const x = -3.3 + i * 0.7;
      const y = (i % 3) * 0.55 - 1.1;
      rects.push([{ x, y }, { x: x + 0.7, y }, { x: x + 0.7, y: y + 0.55 }, { x, y: y + 0.55 }]);
    }
    rects.push([{ x: -3.3, y: 2 }, { x: 5.1, y: 2 }, { x: 5.1, y: 2.4 }, { x: -3.3, y: 2.4 }]);
    rects.push([{ x: 0.05, y: 2.4 }, { x: 1.9, y: 2.4 }, { x: 1.9, y: 3 }, { x: 0.05, y: 3 }]);
    expect(splitRingEdges(rects)).toEqual(referencia(rects));
  });
});
