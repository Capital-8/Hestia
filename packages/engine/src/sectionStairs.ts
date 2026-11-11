import { add, dot, intersection, mul, norm, perp, sub, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { stairArrivalTop } from './stairArrival.ts';
import { stairBodyForDrawing, type StairBodyPiece } from './stairBody.ts';
import { stairFinishModel } from './stairFinish.ts';
import type { ResolvedStair, ResolvedStairRiser } from './stairs.ts';
import type { SectionBeyond } from './section.ts';
import { prismSnapRings, type SectionSnapRing } from './sectionSnapRings.ts';
import { EPS_T, lineIntervals, rect, sectionFrame, type SectionLine } from './sectionGeom.ts';

/**
 * Escadas no corte e na elevação (decisões 0011 §6 e 0012). Estilo montado: cada degrau e patamar é um bloco em planta
 * entre as cotas z0 e z1 (degrau: z − `treadThickness` até z; patamar: z − `landingThickness` até z). No plano de corte,
 * o bloco vira um retângulo sobre o intervalo que a linha atravessa. Os espelhos do montado são lâminas de
 * `riserThickness` atrás da linha de espelho. Estilo monolítico: as peças de `stairBody` (degraus, patamares e espelho
 * de chegada, cada uma com topo plano em `zTop` e fundo plano ou linear, `zFundo(x, y) = a·x + b·y + c`). No corte, o
 * fundo é linear ao longo da linha, então cada intervalo vira um trapézio de `zFundo` a `zTop`. Estilo poste (decisão
 * 0014 §8): as mesmas peças, degraus sem espelho e o poste central (fundo plano no piso base), que vira retângulo, no
 * material `postMaterialId`. Além do plano, cada bloco e peça projeta-se em (t, z).
 */
export interface StairSection {
  /** Corte por escada: material e a escada de origem (`stairId`). */
  cut: Array<{ materialId: Id; polygon: Polygon; stairId: Id }>;
  beyond: SectionBeyond[];
  /** Aneis (t, z) antes da uniao e da envoltoria, so para captura (snap). */
  snapRings: SectionSnapRing[];
  /** Cotas extremas (Infinity/−Infinity sem escada na linha). */
  zMin: number;
  zMax: number;
}

/** Bloco de escada: anel em planta entre as cotas z0 (base) e z1 (topo). */
export interface StairBlock {
  ring: Ring;
  z0: number;
  z1: number;
  /** Material do bloco; ausente = o do tipo (estrutura). Os acabamentos têm o próprio. */
  materialId?: Id;
}

/**
 * Lâminas dos espelhos de cada lance (tipo montado). O espelho k sai da linha do espelho e ocupa `rt` no sentido de
 * baixo, sobre o degrau anterior, entre as cotas z0 e z1 do próprio espelho. O sentido de subida vem da caminhada
 * dentro do lance (até o espelho seguinte, ou do anterior no último). Lance com um só espelho não tem sentido: sem lâmina.
 */
export function riserBoards(risers: ResolvedStairRiser[], rt: number): StairBlock[] {
  if (!(rt > EPS_T)) return [];
  const runs = new Map<number, ResolvedStairRiser[]>();
  for (const r of risers) runs.set(r.componentIndex, [...(runs.get(r.componentIndex) ?? []), r]);
  const out: StairBlock[] = [];
  for (const list of runs.values()) {
    if (list.length < 2) continue;
    const mids = list.map((r) => ({ x: (r.a.x + r.b.x) / 2, y: (r.a.y + r.b.y) / 2 }));
    list.forEach((r, i) => {
      const up = i + 1 < list.length ? sub(mids[i + 1]!, mids[i]!) : sub(mids[i]!, mids[i - 1]!);
      let nrm = perp(norm(sub(r.b, r.a)));
      if (dot(nrm, up) < 0) nrm = mul(nrm, -1);
      const off = mul(nrm, -rt);
      out.push({ ring: [r.a, r.b, add(r.b, off), add(r.a, off)], z0: r.z0, z1: r.z1 });
    });
  }
  return out;
}

/** Envoltória convexa (cadeia monótona), anel anti-horário; com menos de 3 vértices, pontos colineares. */
export function convexHull(pts: Vec2[]): Ring {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const chain = (seq: Vec2[]): Vec2[] => {
    const h: Vec2[] = [];
    for (const q of seq) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...chain(s), ...chain([...s].reverse())];
}

/** Sentido do fundo de uma peça monolítica: zFundo(x, y) = a·x + b·y + c. */
const bottomAt = (piece: StairBodyPiece, v: Vec2): number => piece.bottom.a * v.x + piece.bottom.b * v.y + piece.bottom.c;

/**
 * Corte e projeção das escadas do nível para a linha de corte (ou de elevação, com `depth` grande). `p` dá a cota do topo
 * da chegada monolítica (`stairArrivalTop`): a face inferior da laje que cobre o último espelho ou, sem laje nem piso, o
 * próprio nível de topo (`topZ`), com a chegada flush.
 */
export function sectionOfStairs(stairs: ResolvedStair[], line: SectionLine, p: Project): StairSection {
  const out: StairSection = { cut: [], beyond: [], snapRings: [], zMin: Infinity, zMax: -Infinity };
  const { length, d, n, slab } = sectionFrame(line);
  if (length < 1e-6 || stairs.length === 0) return out;
  const along = (v: Vec2): number => (v.x - line.a.x) * d.x + (v.y - line.a.y) * d.y;
  const dist2 = (v: Vec2): number => (v.x - line.a.x) * n.x + (v.y - line.a.y) * n.y;
  const at = (t: number): Vec2 => ({ x: line.a.x + d.x * t, y: line.a.y + d.y * t });

  for (const s of stairs) {
    const materialId = s.type.materialId;
    const grow = (z0: number, z1: number): void => {
      out.zMin = Math.min(out.zMin, z0);
      out.zMax = Math.max(out.zMax, z1);
    };

    // Monolítico e poste: cada peça de `stairBody` tem fundo linear (ou plano) e topo plano; no corte, o trapézio vai de
    // zFundo a zTop em cada intervalo que a linha atravessa; na vista, a projeção convexa dos vértices (exata para peças
    // convexas). O poste (peça `post`) sai com o material do poste.
    if (s.type.runStyle === 'monolithic' || s.type.runStyle === 'post') {
      const arrivalTopZ = stairArrivalTop(p, s).top;
      for (const piece of stairBodyForDrawing(s, { arrivalTopZ }).pieces) {
        const pieceMaterial = piece.kind === 'post' ? s.type.postMaterialId : materialId;
        for (const [t0, t1] of lineIntervals([piece.polygon], line.a, d, n)) {
          const lo = Math.max(0, t0);
          const hi = Math.min(length, t1);
          if (hi - lo < EPS_T) continue;
          const f0 = bottomAt(piece, at(lo));
          const f1 = bottomAt(piece, at(hi));
          const ring: Ring = [
            { x: lo, y: f0 },
            { x: hi, y: f1 },
            { x: hi, y: piece.zTop },
            { x: lo, y: piece.zTop },
          ];
          out.cut.push({ materialId: pieceMaterial, polygon: [ring], stairId: s.id });
          out.snapRings.push({ hostId: s.id, ring });
          grow(Math.min(f0, f1), piece.zTop);
        }
        for (const sp of intersection([[piece.polygon]], slab)) {
          const outer = sp[0];
          if (!outer || outer.length < 3) continue;
          const ts = outer.map(along);
          const tMin = Math.max(0, Math.min(...ts));
          const tMax = Math.min(length, Math.max(...ts));
          if (tMax - tMin < EPS_T) continue;
          const pts: Vec2[] = outer.flatMap((v) => [
            { x: along(v), y: piece.zTop },
            { x: along(v), y: bottomAt(piece, v) },
          ]);
          const hull = convexHull(pts);
          if (hull.length < 3) continue;
          out.snapRings.push(...prismSnapRings(s.id, outer, along, () => piece.zTop, (v) => bottomAt(piece, v)));
          const zLow = Math.min(...pts.map((q) => q.y));
          out.beyond.push({
            stairId: s.id,
            materialId: pieceMaterial,
            layerIndex: 0,
            depth: Math.max(0, Math.min(...outer.map(dist2))),
            polygons: [[hull]],
          });
          grow(zLow, piece.zTop);
        }
      }
    }

    // Montado: bloco de degrau ou patamar (espessura do piso e do patamar), como nos pisos.
    const blocks: StairBlock[] = [];
    if (s.type.runStyle === 'assembled') {
      for (const st of s.steps) {
        const t = st.kind === 'landing' ? s.type.landingThickness : s.type.treadThickness;
        if (t > EPS_T) blocks.push({ ring: st.polygon, z0: st.z - t, z1: st.z });
      }
    }
    blocks.push(...riserBoards(s.risers, s.type.riserThickness));
    // Acabamentos (piso com bocel e espelho): blocos de cota constante, cada um no seu material.
    for (const f of stairFinishModel(s)?.solids ?? []) blocks.push({ ring: f.polygon, z0: f.z0, z1: f.z1, materialId: f.materialId });

    for (const b of blocks) {
      // Corte: cada intervalo que a linha atravessa vira um retângulo (t × z) do material do tipo.
      for (const [t0, t1] of lineIntervals([b.ring], line.a, d, n)) {
        const lo = Math.max(0, t0);
        const hi = Math.min(length, t1);
        if (hi - lo < EPS_T) continue;
        out.cut.push({ materialId: b.materialId ?? materialId, polygon: [rect(lo, hi, b.z0, b.z1)], stairId: s.id });
        out.snapRings.push({ hostId: s.id, ring: rect(lo, hi, b.z0, b.z1) });
        grow(b.z0, b.z1);
      }
      // Além do plano (dentro da visão): projeção do bloco, do mais longe ao mais perto pelo `depth`.
      for (const sp of intersection([[b.ring]], slab)) {
        const outer = sp[0];
        if (!outer || outer.length < 3) continue;
        const ts = outer.map(along);
        const tMin = Math.max(0, Math.min(...ts));
        const tMax = Math.min(length, Math.max(...ts));
        if (tMax - tMin < EPS_T) continue;
        out.snapRings.push(...prismSnapRings(s.id, outer, along, () => b.z1, () => b.z0));
        out.beyond.push({
          stairId: s.id,
          materialId: b.materialId ?? materialId,
          layerIndex: 0,
          depth: Math.max(0, Math.min(...outer.map(dist2))),
          polygons: [[rect(tMin, tMax, b.z0, b.z1)]],
        });
        grow(b.z0, b.z1);
      }
    }
  }
  return out;
}
