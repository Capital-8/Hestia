import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, createEmptyProject, makeWall, openingFamilyOf, ProjectStore, type Opening } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import { openingPlanPaths } from './openingPlan.ts';
import type { OpeningModel, PartBox } from './openingModelTypes.ts';

/* Porta pivotante: a folha ocupa quase todo o vão, nunca varre a ombreira ao girar e os arcos da planta chegam ao batente. */
// Pivotante de vidro (`frameStyle` 'block', sem caixilho) não tem ombreira: a folga e os arcos contra o batente não se aplicam.
const PIVOTANTES = DEFAULT_OPENING_TYPES.filter((t) => t.kind === 'door' && openingFamilyOf(t)?.id === 'door_pivot' && t.frameStyle !== 'block');

function modelo(typeId: string, flipHand: boolean, flipFacing: boolean): OpeningModel {
  const t = DEFAULT_OPENING_TYPES.find((x) => x.id === typeId)!;
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertOpeningType', openingType: t });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: 'door', typeId, hostId: 'w', offset: 4, flipHand, flipFacing, sillOverride: null, mark: '' } });
  const p = s.project;
  const o = p.elements.v as Opening;
  const f = frameOfWall(p, 'w')!;
  return buildOpeningModel(p, o, openingGeometry(p, o, f), f);
}

/** Retângulo (caixa t×s) girado de `ang` em torno de (pt, ps), como cantos (t, s). */
function cantos(b: PartBox, pt: number, ps: number, ang: number): Array<[number, number]> {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return ([[b.t0, b.s0], [b.t1, b.s0], [b.t1, b.s1], [b.t0, b.s1]] as Array<[number, number]>).map(([t, q]) => [pt + (t - pt) * c - (q - ps) * s, ps + (t - pt) * s + (q - ps) * c]);
}

/** Penetração (m) de um quadrilátero convexo numa caixa alinhada (SAT); ≤ 0 = sem sobreposição. */
function penetracao(poly: Array<[number, number]>, b: PartBox): number {
  const eixos: Array<[number, number]> = [[1, 0], [0, 1]];
  for (let i = 0; i < 2; i++) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[i + 1]!;
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const n = Math.hypot(nx, ny) || 1;
    eixos.push([nx / n, ny / n]);
  }
  const rect: Array<[number, number]> = [[b.t0, b.s0], [b.t1, b.s0], [b.t1, b.s1], [b.t0, b.s1]];
  let min = Infinity;
  for (const [ax, ay] of eixos) {
    const pa = poly.map(([x, y]) => x * ax + y * ay);
    const pb = rect.map(([x, y]) => x * ax + y * ay);
    min = Math.min(min, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)));
  }
  return min;
}

describe('porta pivotante', () => {
  it('há tipos pivotantes no catálogo', () => {
    expect(PIVOTANTES.length).toBeGreaterThanOrEqual(3);
  });

  for (const t of PIVOTANTES) {
    for (const [fh, ff] of [[false, false], [true, true], [false, true], [true, false]] as const) {
      it(`${t.id} (flipHand=${fh}, flipFacing=${ff}): a folha não varre as ombreiras de −90° a 90° e a folga é de poucos mm`, () => {
        const m = modelo(t.id, fh, ff);
        const folha = m.parts.find((q) => q.role === 'leaf')!;
        const eixo = m.openings[0]!.pivot;
        const ombreiras = m.parts.filter((q) => q.role === 'jamb');
        expect(ombreiras).toHaveLength(2);
        for (let g = -90; g <= 90; g += 1) {
          const poly = cantos(folha.box, eixo.t, eixo.s, (g * Math.PI) / 180);
          for (const j of ombreiras) expect(penetracao(poly, j.box), `${t.id} ${g}°`).toBeLessThanOrEqual(1e-9);
        }
        // Folga entre cada ponta da folha fechada e a face interna da ombreira: entre 3 e 7 mm.
        const faceInterna = [ombreiras.map((j) => j.box.t1).sort((a, b) => a - b)[0]!, ombreiras.map((j) => j.box.t0).sort((a, b) => b - a)[0]!];
        expect(folha.box.t0 - faceInterna[0]!).toBeGreaterThanOrEqual(0.003);
        expect(folha.box.t0 - faceInterna[0]!).toBeLessThanOrEqual(0.007);
        expect(faceInterna[1]! - folha.box.t1).toBeGreaterThanOrEqual(0.003);
        expect(faceInterna[1]! - folha.box.t1).toBeLessThanOrEqual(0.007);
      });
    }

    it(`${t.id}: os dois arcos da planta nascem a até 7 mm da ombreira`, () => {
      const m = modelo(t.id, false, false);
      const ombreiras = m.parts.filter((q) => q.role === 'jamb').map((q) => q.box);
      const arcos = openingPlanPaths(m, { detail: 'mid', angle: Math.PI / 2, planDisplay: 'symbolic', showSwing: true, swingStyle: 'arc', cutZ: 1 }).filter((p) => !p.closed && p.pts.length > 4);
      expect(arcos).toHaveLength(2);
      const dist = (e: { t: number; s: number }, b: PartBox): number => Math.hypot(Math.max(b.t0 - e.t, 0, e.t - b.t1), Math.max(b.s0 - e.s, 0, e.s - b.s1));
      for (const a of arcos) {
        const perto = Math.min(...[a.pts[0]!, a.pts.at(-1)!].map((e) => Math.min(...ombreiras.map((b) => dist(e, b)))));
        expect(perto).toBeLessThanOrEqual(0.007);
      }
    });
  }
});
