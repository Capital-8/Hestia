import { arcPointAt, arcTangentAt, type Vec2 } from '@hestia/geom';
import {
  beamArc,
  beamElevationSpan,
  beamProfileRingSZ,
  beamsOnLevel,
  columnElevationSpan,
  columnPolygon,
  columnsOnLevel,
  findBeamType,
  findColumnType,
  findFootingType,
  footingElevationSpan,
  footingPolygon,
  footingsOnLevel,
  type Beam,
  type BeamType,
  type GraphicsCategory,
  type Id,
  type Project,
} from '@hestia/model';
import { emitFace, extrudePolygon, ofElement, push, type SolidBatch } from './solids.ts';

function emitBeamSegment(
  b: SolidBatch,
  ring: readonly Vec2[],
  p0: Vec2,
  n0: Vec2,
  p1: Vec2,
  n1: Vec2,
  nMid: Vec2,
): void {
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const ds = q.x - p.x;
    const dz = q.y - p.y;
    const segLen = Math.hypot(ds, dz);
    if (segLen < 1e-9) continue;
    const ns = dz / segLen;
    const nz = -ds / segLen;
    const ax0 = p0.x + p.x * n0.x;
    const ay0 = p0.y + p.x * n0.y;
    const ax1 = p0.x + q.x * n0.x;
    const ay1 = p0.y + q.x * n0.y;
    const bx0 = p1.x + p.x * n1.x;
    const by0 = p1.y + p.x * n1.y;
    const bx1 = p1.x + q.x * n1.x;
    const by1 = p1.y + q.x * n1.y;
    push(
      b,
      [ax0, ay0, p.y, ax1, ay1, q.y, bx1, by1, q.y, bx0, by0, p.y],
      [ns * nMid.x, ns * nMid.y, nz],
      [0, 1, 2, 0, 2, 3],
    );
  }
}

function extrudeBeamProfile(b: SolidBatch, beam: Beam, type: BeamType, z0: number, z1: number): void {
  const ring = beamProfileRingSZ(beam, type, z0, z1);
  if (ring.length < 3) return;
  const arc = beamArc(beam);
  if (arc) {
    const steps = Math.max(8, Math.min(72, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 18))));
    const pts: Array<{ pt: Vec2; u: Vec2; n: Vec2 }> = [];
    for (let i = 0; i <= steps; i++) {
      const t = (arc.length * i) / steps;
      const pt = arcPointAt(arc, t, 0);
      const u = arcTangentAt(arc, t);
      pts.push({ pt, u, n: { x: -u.y, y: u.x } });
    }
    const s0 = pts[0]!;
    const sN = pts[pts.length - 1]!;
    emitFace(b, [[ring]], (s, z) => [s0.pt.x + s * s0.n.x, s0.pt.y + s * s0.n.y, z], [-s0.u.x, -s0.u.y, 0]);
    emitFace(b, [[ring]], (s, z) => [sN.pt.x + s * sN.n.x, sN.pt.y + s * sN.n.y, z], [sN.u.x, sN.u.y, 0]);
    for (let i = 0; i < steps; i++) {
      const cur = pts[i]!;
      const nxt = pts[i + 1]!;
      const cdx = nxt.pt.x - cur.pt.x;
      const cdy = nxt.pt.y - cur.pt.y;
      const clen = Math.hypot(cdx, cdy);
      const nMid = clen > 1e-9 ? { x: -cdy / clen, y: cdx / clen } : cur.n;
      emitBeamSegment(b, ring, cur.pt, cur.n, nxt.pt, nxt.n, nMid);
    }
    return;
  }
  const dx = beam.b.x - beam.a.x;
  const dy = beam.b.y - beam.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx / len;
  const uy = dy / len;
  const n: Vec2 = { x: -uy, y: ux };
  emitFace(b, [[ring]], (s, z) => [beam.a.x + s * n.x, beam.a.y + s * n.y, z], [-ux, -uy, 0]);
  emitFace(b, [[ring]], (s, z) => [beam.b.x + s * n.x, beam.b.y + s * n.y, z], [ux, uy, 0]);
  emitBeamSegment(b, ring, beam.a, n, beam.b, n, n);
}

function batchOf(byMat: Map<string, SolidBatch>, m: Id, cat: GraphicsCategory): SolidBatch {
  const key = `${m}:${cat}`;
  let b = byMat.get(key);
  if (!b) {
    b = { materialId: m, category: cat, positions: [], normals: [], indices: [], ids: [] };
    byMat.set(key, b);
  }
  return b;
}

/**
 * Constrói os sólidos 3D dos elementos estruturais (pilares, vigas e sapatas) do nível.
 */
export function buildStructuralSolids(
  p: Project,
  levelId: Id,
  oculto?: (id: Id) => boolean,
): SolidBatch[] {
  const byMat = new Map<string, SolidBatch>();

  // Pilares: categoria 'wall', extrusão de z0 a z1.
  for (const c of columnsOnLevel(p, levelId)) {
    if (oculto?.(c.id)) continue;
    const type = findColumnType(p, c.typeId);
    const span = columnElevationSpan(p, c);
    const poly = columnPolygon(c, type);
    const b = batchOf(byMat, type.materialId, 'wall');
    ofElement(b, c.id, () => {
      extrudePolygon(b, [poly], span.z0, span.z1);
    });
  }

  // Vigas: categoria 'slab', extrusão horizontal da seção transversal (retangular, T ou perfil I/W) de a até b.
  for (const b of beamsOnLevel(p, levelId)) {
    if (oculto?.(b.id)) continue;
    const type = findBeamType(p, b.typeId);
    const span = beamElevationSpan(p, b, type);
    const batch = batchOf(byMat, type.materialId, 'slab');
    ofElement(batch, b.id, () => {
      extrudeBeamProfile(batch, b, type, span.z0, span.z1);
    });
  }

  // Sapatas: categoria 'slab', extrusão de z0 a z1.
  for (const f of footingsOnLevel(p, levelId)) {
    if (oculto?.(f.id)) continue;
    const type = findFootingType(p, f.typeId);
    const span = footingElevationSpan(p, f, type);
    const poly = footingPolygon(f, type);
    const batch = batchOf(byMat, type.materialId, 'slab');
    ofElement(batch, f.id, () => {
      extrudePolygon(batch, [poly], span.z0, span.z1);
    });
  }

  return [...byMat.values()];
}
