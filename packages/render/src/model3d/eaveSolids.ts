import { dist, pointInMulti, type Vec2 } from '@hestia/geom';
import { planeZ, roofThickness, type ResolvedRoof, type ResolvedRoofPlane } from '@hestia/engine';
import type { Id, Material, Project } from '@hestia/model';
import { mix } from '../plan/color.ts';
import { extrudePolygon, ofElement, type SolidBatch } from './solids.ts';

/** Espessura da testeira (m). */
export const FASCIA_THICKNESS = 0.025;
/** Calha em U: 10 cm de largura e 8 cm de altura, paredes de 1 cm; a borda superior fica na face inferior da água. */
const GUTTER_W = 0.1;
const GUTTER_H = 0.08;
const GUTTER_WALL = 0.01;
/** Placa do forro (m). */
const SOFFIT_T = 0.01;
/** Afastamento (m) para dentro da aresta, para achar a água que a encosta. */
const EPS_IN = 1e-4;
/** Extensão (m) da faixa além das pontas da aresta: os planos de corte das esquadrias aparam o excesso. */
const REACH = 1;

export interface EaveSolids {
  batches: SolidBatch[];
  /** Materiais que não estão em `p.materials` (testeira escurecida): o chamador os consulta por id quando não os acha no projeto. */
  materials: Record<Id, Material>;
}

/**
 * Aresta do contorno do telhado (beiral ou empena). `plane` é a água que a encosta por dentro quando a aresta é beiral
 * (a água desce para fora dela); null quando é empena (sem inclinação para fora, sem água ou sem linha de beiral).
 */
interface Piece {
  a: Vec2;
  b: Vec2;
  /** Unitário de `a` para `b`. */
  t: Vec2;
  /** Normal unitária para dentro do telhado. */
  nIn: Vec2;
  plane: ResolvedRoofPlane | null;
}

const vsub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const vadd = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const vscale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const vdot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
const vperp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });
const vlen = (a: Vec2): number => Math.hypot(a.x, a.y);
const vunit = (a: Vec2): Vec2 => {
  const l = vlen(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** Subida por metro da água (gradiente da cota): percentual × direção de subida. */
const gradOf = (pl: ResolvedRoofPlane): Vec2 => ({ x: (pl.percent / 100) * pl.up.x, y: (pl.percent / 100) * pl.up.y });

/**
 * Arestas do contorno (linhas 'eave' e 'gable' do telhado), classificadas pela água que as encosta: beiral quando a água
 * desce para fora da aresta; empena caso contrário (também a aresta de extrusão que corta o perfil). A classificação é
 * geométrica, não o tipo da linha, porque a extrusão marca todo o contorno como beiral.
 */
function piecesOf(r: ResolvedRoof): Piece[] {
  return r.lines
    .filter((l) => (l.kind === 'eave' || l.kind === 'gable') && dist(l.a, l.b) >= 1e-6)
    .map((l): Piece => {
      const t = vunit(vsub(l.b, l.a));
      const left = { x: -t.y, y: t.x };
      const m = { x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 };
      for (const s of [1, -1]) {
        const nIn = vscale(left, s);
        const plane = r.planes.find((pl) => pointInMulti(vadd(m, vscale(nIn, EPS_IN)), pl.polygon));
        if (plane) {
          // Água plana (inclinação 0) também é beiral: a cota não sobe nem desce, então não é empena.
          const descends = plane.percent === 0 || vdot(gradOf(plane), vscale(nIn, -1)) < -1e-9;
          return { a: l.a, b: l.b, t, nIn, plane: descends ? plane : null };
        }
      }
      return { a: l.a, b: l.b, t, nIn: left, plane: null };
    });
}

/** Pontos de contorno coincidentes: a chave identifica o vértice, e cada ponta de aresta aponta para as que o encostam. */
const keyOf = (p: Vec2): string => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;

interface Link {
  i: number;
  end: 0 | 1;
}

function linksOf(ps: Piece[]): Map<string, Link[]> {
  const m = new Map<string, Link[]>();
  ps.forEach((p, i) => {
    for (const end of [0, 1] as const) {
      const k = keyOf(end === 0 ? p.a : p.b);
      m.set(k, [...(m.get(k) ?? []), { i, end }]);
    }
  });
  return m;
}

/** Plano de corte de uma ponta de aresta: a zona da aresta é o lado `w·(p − V) ≥ 0`. */
interface Half {
  V: Vec2;
  w: Vec2;
}

/**
 * Esquadria de uma ponta de beiral (V), pelo lado da aresta (E):
 * - outra aresta de beiral com a mesma água, ou com água de outra inclinação e cantos: bissetor do ângulo em planta
 *   (esquadria de faces verticais, sem fresta nem sobreposição entre as duas faixas). Com inclinações diferentes a
 *   cota da testeira muda pela água sobre a esquadria: o degrau é a diferença entre as duas águas (a esquadria em planta
 *   continua exata; a coincidência de cota só existe quando as águas têm a mesma inclinação);
 * - outra aresta de beiral colinear com água de outra inclinação (mudança de água sobre a aresta): o espigão/rincão, a
 *   reta onde as duas águas têm a mesma cota (a esquadria pelo ângulo 3D, sem corte reto);
 * - empena (ou sem vizinho): a reta da própria empena (o beiral termina no plano da empena, sem sobrar nem faltar).
 */
function halfAt(ps: Piece[], links: Map<string, Link[]>, i: number, end: 0 | 1): Half {
  const E = ps[i]!;
  const V = end === 0 ? E.a : E.b;
  const uE = end === 0 ? E.t : vscale(E.t, -1);
  const other = (links.get(keyOf(V)) ?? []).find((l) => l.i !== i);
  let d: Vec2;
  if (!other) {
    d = vperp(uE);
  } else {
    const N = ps[other.i]!;
    const far = other.end === 0 ? N.b : N.a;
    const uN = vunit(vsub(far, V));
    const sum = vadd(uE, uN);
    if (!N.plane) d = uN;
    else if (vlen(sum) > 1e-9) d = sum;
    else if (N.plane !== E.plane) {
      const diff = vsub(gradOf(E.plane!), gradOf(N.plane));
      d = vlen(diff) > 1e-12 ? vperp(diff) : vperp(uE);
    } else d = vperp(uE);
  }
  let w = vperp(vunit(d));
  if (vdot(w, uE) < 0) w = vscale(w, -1);
  return { V, w };
}

/** Recorte de um polígono convexo pelo lado `w·(p − V) ≥ 0` (Sutherland–Hodgman com um plano). */
function clipHalf(poly: Vec2[], h: Half): Vec2[] {
  const out: Vec2[] = [];
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const P = poly[k]!;
    const Q = poly[(k + 1) % n]!;
    const fp = vdot(h.w, vsub(P, h.V));
    const fq = vdot(h.w, vsub(Q, h.V));
    if (fp >= 0) out.push(P);
    if (fp >= 0 !== fq >= 0) {
      const u = fp / (fp - fq);
      out.push({ x: P.x + (Q.x - P.x) * u, y: P.y + (Q.y - P.y) * u });
    }
  }
  return out;
}

/**
 * Faixa de uma aresta entre as profundidades s0 e s1 (m, positivo para dentro, negativo para fora), estendida além das
 * pontas e aparada pelas duas esquadrias. Vazia quando o recorte não sobra área.
 */
function bandOfPiece(E: Piece, s0: number, s1: number, h0: Half, h1: Half): Vec2[] {
  const at = (p: Vec2, k: number, s: number): Vec2 => vadd(vadd(p, vscale(E.t, k)), vscale(E.nIn, s));
  let poly = [at(E.a, -REACH, s0), at(E.b, REACH, s0), at(E.b, REACH, s1), at(E.a, -REACH, s1)];
  poly = clipHalf(poly, h0);
  poly = poly.length >= 3 ? clipHalf(poly, h1) : poly;
  return poly.length >= 3 ? poly : [];
}

/** Pé da projeção de (x, y) sobre a linha de `E`. */
const footOn = (E: Piece, x: number, y: number): Vec2 => vadd(E.a, vscale(E.t, vdot(vsub({ x, y }, E.a), E.t)));

/** Aresta de beiral cujo trecho contém o pé `q` (sobre a mesma linha); `E` quando nenhuma contém. */
function ownerAt(eaves: Piece[], E: Piece, q: Vec2): Piece {
  const f = footOn(E, q.x, q.y);
  return (
    eaves.find((o) => {
      const u = vdot(vsub(f, o.a), o.t);
      const off = vlen(vsub(vsub(f, o.a), vscale(o.t, u)));
      return off < 1e-9 && u >= -1e-9 && u <= vlen(vsub(o.b, o.a)) + 1e-9;
    }) ?? E
  );
}

/**
 * Cotas de calha e forro: a cota do beiral (água) sob o pé da projeção, de `owner`, a aresta de beiral que contém a faixa
 * do pedaço. Dentro de um pedaço a cota é linear (um só dono), então o triângulo interpola certo; entre pedaços vizinhos
 * a cota é a mesma na esquadria.
 */
const topOwner = (E: Piece, owner: Piece, T: number, dz: number) => (x: number, y: number): number =>
  planeZ(owner.plane!, footOn(E, x, y)) - T + dz;

/** Posições (m, ao longo de `E`) das pontas das arestas colineares: onde a água sob o pé da projeção muda. */
function cutsOf(E: Piece, eaves: Piece[]): number[] {
  const len = vlen(vsub(E.b, E.a));
  const out: number[] = [];
  for (const o of eaves) {
    if (o === E || Math.abs(o.t.x * E.t.y - o.t.y * E.t.x) > 1e-9) continue;
    if (Math.abs(vdot(vsub(o.a, E.a), vperp(E.t))) > 1e-9) continue;
    for (const X of [o.a, o.b]) {
      const c = vdot(vsub(X, E.a), E.t);
      if (c > -REACH + 1e-9 && c < len + REACH - 1e-9) out.push(c);
    }
  }
  return out;
}

/**
 * Faixa de uma aresta de beiral entre s0 e s1 (vazia se não sobra), cortada nas pontas das arestas colineares. Cada pedaço
 * devolve a água que o domina (a de `ownerAt` no centro do pedaço).
 */
function bandPieces(E: Piece, eaves: Piece[], s0: number, s1: number, h0: Half, h1: Half): Array<{ poly: Vec2[]; owner: Piece }> {
  const poly = bandOfPiece(E, s0, s1, h0, h1);
  if (!poly.length) return [];
  let parts: Vec2[][] = [poly];
  for (const c of cutsOf(E, eaves)) {
    const V = vadd(E.a, vscale(E.t, c));
    parts = parts.flatMap((q) => [clipHalf(q, { V, w: E.t }), clipHalf(q, { V, w: vscale(E.t, -1) })]).filter((q) => q.length >= 3);
  }
  return parts.map((q) => {
    const cen = { x: q.reduce((a, v) => a + v.x, 0) / q.length, y: q.reduce((a, v) => a + v.y, 0) / q.length };
    return { poly: q, owner: ownerAt(eaves, E, cen) };
  });
}

/** Material da testeira: o da camada estrutural do tipo (ou a de topo, sem estrutural), escurecido 35 %. */
function fasciaMaterialOf(p: Project, r: ResolvedRoof): Material | undefined {
  const layers = p.roofTypes[r.typeId]?.layers ?? [];
  const id = (layers.find((l) => l.function === 'structure') ?? layers[0])?.materialId;
  const m = id ? p.materials[id] : undefined;
  return m ? { ...m, id: `${m.id}#testeira`, color: mix(m.color, '#000000', 0.35) } : undefined;
}

/** Lote do material `id`, criado na primeira vez. */
function batchOf(byMat: Map<Id, SolidBatch>, id: Id): SolidBatch {
  let b = byMat.get(id);
  if (!b) {
    b = { materialId: id, category: 'roof', positions: [], normals: [], indices: [], ids: [] };
    byMat.set(id, b);
  }
  return b;
}

/**
 * Acabamentos do beiral em 3D (C5), por telhado, ao longo das arestas de beiral (as que descem para fora). Cada aresta
 * gera a sua faixa; as faixas de duas arestas vizinhas se encontram numa esquadria exata (ver `halfAt`), sem fresta nem
 * sobreposição:
 * - testeira (`eave.fascia`): faixa de 2,5 cm junto ao contorno, da face inferior da água para baixo por `fasciaHeight`
 *   (na vertical), no material da camada estrutural escurecido;
 * - calha (`eave.gutter`): U de 10 × 8 cm para fora do contorno, com a borda superior na face inferior da água (segue a
 *   cota do beiral), em alumínio. Nunca passa do plano de uma empena;
 * - forro (`eave.soffit`): placa horizontal de 1 cm sob o beiral, na cota do beiral menos a espessura, com largura
 *   = balanço médio menos a espessura do telhado (gesso).
 * Calha e forro não dependem da testeira. Sem nenhum acabamento, nada é gerado.
 */
export function buildEaveSolids(p: Project, roofs: ResolvedRoof[]): EaveSolids {
  const byMat = new Map<Id, SolidBatch>();
  const materials: Record<Id, Material> = {};
  for (const r of roofs) {
    if (r.closeStepGaps === true && r.stepGaps?.length) {
      const m = fasciaMaterialOf(p, r);
      if (m) materials[m.id] = m;
    }
    const eave = r.eave;
    if (!eave || (!eave.fascia && !eave.gutter && !eave.soffit) || !r.planes.length) continue;
    const ps = piecesOf(r);
    if (!ps.some((x) => x.plane)) continue;
    const links = linksOf(ps);
    const T = roofThickness(r);
    const eaves = ps.map((piece, i) => ({ piece, i })).filter((x) => x.piece.plane);
    const eaveList = eaves.map((x) => x.piece);
    /** Faixa de uma aresta de beiral entre as profundidades s0 e s1, com as duas esquadrias de suas pontas (vazia se não sobra). */
    const band = (E: Piece, i: number, s0: number, s1: number): Vec2[] => bandOfPiece(E, s0, s1, halfAt(ps, links, i, 0), halfAt(ps, links, i, 1));
    if (eave.fascia) {
      const m = fasciaMaterialOf(p, r);
      const id = m ? m.id : 'mat_madeira#testeira';
      if (m) materials[id] = m;
      const b = batchOf(byMat, id);
      const h = eave.fasciaHeight;
      ofElement(b, r.roofId, () => {
        for (const { piece: E, i } of eaves) {
          const top = (x: number, y: number): number => planeZ(E.plane!, { x, y }) - T;
          const bottom = (x: number, y: number): number => top(x, y) - h;
          const poly = band(E, i, 0, FASCIA_THICKNESS);
          if (poly.length) extrudePolygon(b, [poly], 0, 1, top, bottom);
        }
      });
    }
    // Calha: três regiões do U (parede interna, fundo, parede externa), com a cota do beiral e o fundo a GUTTER_H abaixo.
    if (eave.gutter) {
      const b = batchOf(byMat, 'mat_aluminio');
      const regions: Array<[number, number, number]> = [
        [-GUTTER_WALL, 0, 0],
        [-(GUTTER_W - GUTTER_WALL), -GUTTER_WALL, GUTTER_WALL - GUTTER_H],
        [-GUTTER_W, -(GUTTER_W - GUTTER_WALL), 0],
      ];
      ofElement(b, r.roofId, () => {
        for (const { piece: E, i } of eaves) {
          for (const [s0, s1, dzTop] of regions) {
            for (const { poly, owner } of bandPieces(E, eaveList, s0, s1, halfAt(ps, links, i, 0), halfAt(ps, links, i, 1))) {
              const top = topOwner(E, owner, T, dzTop);
              const bottom = topOwner(E, owner, T, -GUTTER_H);
              extrudePolygon(b, [poly], 0, 1, top, bottom);
            }
          }
        }
      });
    }
    if (eave.soffit) {
      const width = Math.max(0, (r.eaveOverhang ?? 0) - T);
      if (width > 0) {
        const b = batchOf(byMat, 'mat_gesso');
        ofElement(b, r.roofId, () => {
          for (const { piece: E, i } of eaves) {
            for (const { poly, owner } of bandPieces(E, eaveList, 0, width, halfAt(ps, links, i, 0), halfAt(ps, links, i, 1))) {
              const top = topOwner(E, owner, T, 0);
              const bottom = topOwner(E, owner, T, -SOFFIT_T);
              extrudePolygon(b, [poly], 0, 1, top, bottom);
            }
          }
        });
      }
    }
  }
  return { batches: [...byMat.values()], materials };
}
