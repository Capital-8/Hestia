import { pointInMulti, type Polygon, type Vec2 } from '@hestia/geom';
import { planeZ, roofThickness, type ResolvedRoof, type RoofStepGap } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { poligonoSoldado, trechosSemEmenda } from './roofEmendas3d.ts';
import { batchOf, extrudeCaps, ofElement, oriented, push, pushWall, type SolidBatch } from './solids.ts';

const STEP_FASCIA_THICKNESS = 0.025;

/** Parede vertical que omite triângulos degenerados quando uma extremidade afunila a altura zero (tp == bp ou tq == bq). */
function pushWedgeWall(b: SolidBatch, p: Vec2, q: Vec2, bp: number, bq: number, tp: number, tq: number): void {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return;
  const hp = tp - bp;
  const hq = tq - bq;
  if (hp <= 1e-6 && hq <= 1e-6) return;
  const n: [number, number, number] = [dy / L, -dx / L, 0];
  if (hp > 1e-6 && hq > 1e-6) {
    push(b, [p.x, p.y, bp, q.x, q.y, bq, q.x, q.y, tq, p.x, p.y, tp], n, [0, 1, 2, 0, 2, 3]);
  } else if (hq > 1e-6) {
    push(b, [p.x, p.y, bp, q.x, q.y, bq, q.x, q.y, tq], n, [0, 1, 2]);
  } else {
    push(b, [p.x, p.y, bp, q.x, q.y, tq, p.x, p.y, tp], n, [0, 1, 2]);
  }
}

/**
 * Fecha um vão de degrau vertical entre duas águas adjacentes com uma faixa vertical de espessura `STEP_FASCIA_THICKNESS`
 * apoiada na face superior da água mais baixa até a face inferior da água mais alta.
 */
function extrudeStepGap(b: SolidBatch, r: ResolvedRoof, gap: RoofStepGap, T: number): void {
  const dx = gap.b.x - gap.a.x;
  const dy = gap.b.y - gap.a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  const tx = dx / L;
  const ty = dy / L;
  const lx = -ty;
  const ly = tx;

  const dzA = gap.zHighA - gap.zLowA;
  const dzB = gap.zHighB - gap.zLowB;
  if (dzA <= T + 1e-6 && dzB <= T + 1e-6) return;

  // Recorta o segmento para o trecho em que há vão aberto entre o topo da água baixa e a base da água alta (dz >= T).
  let s0 = 0;
  let s1 = 1;
  if (dzA < T) s0 = Math.max(0, Math.min(1, (T - dzA) / (dzB - dzA)));
  if (dzB < T) s1 = Math.max(0, Math.min(1, (T - dzA) / (dzB - dzA)));
  if (s1 - s0 < 1e-6) return;

  // Identifica de que lado fica a água mais alta para embutir a espessura da testeira sob ela.
  const mx = (gap.a.x + gap.b.x) / 2;
  const my = (gap.a.y + gap.b.y) / 2;
  const zMidHigh = (gap.zHighA + gap.zHighB) / 2;
  let highSide = 0;
  for (const s of [1, -1]) {
    const pt = { x: mx + lx * s * 1e-4, y: my + ly * s * 1e-4 };
    if (r.planes.some((pl) => pointInMulti(pt, pl.polygon) && Math.abs(planeZ(pl, { x: mx, y: my }) - zMidHigh) < 1e-2)) {
      highSide = s;
      break;
    }
  }
  const off0 = highSide === 0 ? -STEP_FASCIA_THICKNESS / 2 : 0;
  const off1 = highSide === 0 ? STEP_FASCIA_THICKNESS / 2 : STEP_FASCIA_THICKNESS;
  const nx = highSide === 0 ? lx : lx * highSide;
  const ny = highSide === 0 ? ly : ly * highSide;

  const p0x = gap.a.x + dx * s0;
  const p0y = gap.a.y + dy * s0;
  const p1x = gap.a.x + dx * s1;
  const p1y = gap.a.y + dy * s1;
  const ring = oriented(
    [
      { x: p0x + nx * off0, y: p0y + ny * off0 },
      { x: p1x + nx * off0, y: p1y + ny * off0 },
      { x: p1x + nx * off1, y: p1y + ny * off1 },
      { x: p0x + nx * off1, y: p0y + ny * off1 },
    ],
    true,
  );

  // Funções lineares sem clamp (o cálculo de normais de `extrudeCaps` consulta deslocamentos unitários).
  const uOf = (x: number, y: number): number => ((x - gap.a.x) * tx + (y - gap.a.y) * ty) / L;
  const topAt = (x: number, y: number): number => gap.zHighA + uOf(x, y) * (gap.zHighB - gap.zHighA) - T;
  const bottomAt = (x: number, y: number): number => gap.zLowA + uOf(x, y) * (gap.zLowB - gap.zLowA);
  extrudeCaps(b, [ring], 0, 1, topAt, bottomAt);
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    pushWedgeWall(b, p, q, bottomAt(p.x, p.y), bottomAt(q.x, q.y), topAt(p.x, p.y), topAt(q.x, q.y));
  }
}

/**
 * Sólidos dos telhados (D2): por água e por camada, uma extrusão cujo topo segue o plano da água menos `below` e cuja
 * base está `thickness` abaixo, na vertical. Empenas não entram aqui: a parede ajusta o topo no motor.
 * Quando `r.closeStepGaps === true`, fecha os vãos de degrau (`r.stepGaps`) com o material da testeira.
 */
export function buildRoofSolids(roofs: ResolvedRoof[]): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const r of roofs) {
    r.planes.forEach((pl, k) => {
      // As emendas entre águas de mesma cota (facetas de um arco) não levam parede: sem elas, a vista de arestas não
      // desenha um raio em cada lado amostrado.
      const emenda = trechosSemEmenda(r, k);
      for (const l of r.layers) {
        if (l.thickness < 1e-6) continue;
        const b = batchOf(byMat, l.materialId, 'roof');
        const topAt = (x: number, y: number): number => planeZ(pl, { x, y }) - l.below;
        const bottomAt = (x: number, y: number): number => topAt(x, y) - l.thickness;
        ofElement(b, r.roofId, () => {
          for (const poly of pl.polygon) extrudeRoofPolygon(b, poligonoSoldado(r, k, poly), l.thickness, topAt, bottomAt, emenda);
        });
      }
    });
    if (r.closeStepGaps === true && r.stepGaps?.length) {
      const fasciaId = r.fasciaMaterialId ?? (r.layers[0]?.materialId ? `${r.layers[0].materialId}#testeira` : 'mat_madeira#testeira');
      const b = batchOf(byMat, fasciaId, 'roof');
      const T = roofThickness(r);
      ofElement(b, r.roofId, () => {
        for (const gap of r.stepGaps!) extrudeStepGap(b, r, gap, T);
      });
    }
  }
  return [...byMat.values()];
}

/** Extrusão de uma água por camada (como `extrudePolygon`), sem a parede das emendas com outra água (`emenda`). */
function extrudeRoofPolygon(b: SolidBatch, poly: Polygon, espessura: number, topAt: (x: number, y: number) => number, bottomAt: (x: number, y: number) => number, emenda: (p: Vec2, q: Vec2) => Array<[Vec2, Vec2]>): void {
  if (espessura < 1e-6 || !poly[0]) return;
  extrudeCaps(b, poly, 0, espessura, topAt, bottomAt);
  for (const ring of poly.map((r, i) => oriented(r, i === 0))) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      // Só os trechos sem água de mesma cota do outro lado levam parede (a aresta é partida nas junções em T).
      for (const [a, c] of emenda(p, q)) pushWall(b, a, c, bottomAt(a.x, a.y), bottomAt(c.x, c.y), topAt(a.x, a.y), topAt(c.x, c.y));
    }
  }
}
