import type { Vec2 } from '@hestia/geom';
import { coreSpan, type Id, type Project, type ProfilePoint } from '@hestia/model';
import { resolveAllFloors } from './floors.ts';
import { resolveAllRoofs } from './roofs.ts';
import { resolveAllSlabs } from './slabs.ts';
import type { WallEnds } from './joinTypes.ts';
import { pointAt, sAtDepth, type WallFrame } from './frame.ts';
import { computeEnds } from './joins.ts';
import { endPoint } from './layerGeom.ts';
import { levelFrames } from './resolve.ts';
import { wallZRange } from './wallZ.ts';
import { analyzeLevelTilt, type WallTiltJoin } from './wallTiltJoinLevel.ts';
import { tiltPlanMap, type PlanMap } from './wallTiltPlan.ts';

/** Ponto 3D do topo da parede: (x, y) em planta e z ABSOLUTO (m). */
export interface TopPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Face SUPERIOR de uma parede (topo), para captura de snap, Alinhar e escolha de face de telhado/forro. Toda aresta é
 * uma polilinha 3D de a para b. Reta sem perfil: 2 pontos; reta com perfil de topo (topo anexado a piso/telhado ou
 * `topProfile`): um ponto por quebra do perfil (degrau = dois pontos com o mesmo (x, y) e z diferentes); arco: amostras.
 */
export interface WallTopFaces {
  wallId: Id;
  /** Cota absoluta da base e do ponto mais alto do topo. */
  baseZ: number;
  topZ: number;
  tilt: number;
  /** Perfil de topo (relativo a `baseZ`), só quando o topo não é horizontal. */
  profile?: ProfilePoint[];
  /** Aresta superior da face externa e da interna (o lado externo respeita `flipped`). */
  exterior: TopPoint[];
  interior: TopPoint[];
  /** Arestas superiores do núcleo: do lado externo e do lado interno. */
  coreExterior: TopPoint[];
  coreInterior: TopPoint[];
  /** Linha de locação (eixo) no topo. */
  axis: TopPoint[];
  /** Cantos superiores das pontas: externo-a, interno-a, interno-b, externo-b (nessa ordem, contorno fechado). */
  corners: TopPoint[];
  /** Contorno superior da parede (exterior a→b e interior b→a). */
  outline: TopPoint[];
}

/** Segmentos por arco: pelo menos 8, ~1 a cada 0,2 m, no máximo 64. */
const arcSteps = (length: number): number => Math.max(8, Math.min(64, Math.ceil(length / 0.2)));

/** Altura do topo (relativa à base) em cada ponto do perfil. */
function stations(f: WallFrame, height: number, profile: ProfilePoint[] | undefined): Array<{ t: number; h: number }> {
  if (profile && profile.length >= 2 && !f.arc) return profile.map((q) => ({ t: q.t, h: q.h }));
  if (f.arc) {
    const n = arcSteps(f.length);
    return Array.from({ length: n + 1 }, (_, i) => ({ t: (f.length * i) / n, h: height }));
  }
  return [{ t: 0, h: height }, { t: f.length, h: height }];
}

/** Mapa de planta de um ponto no topo: o da parede inclinada e, nos cantos casados com o anel `raw` da junção, o da junção. */
function mapPoint(base: PlanMap, join: WallTiltJoin | undefined, v: Vec2, h: number): Vec2 {
  if (join && join.H > 0) {
    for (const l of join.layers) {
      for (let i = 0; i < l.raw.length; i++) {
        const r = l.raw[i]!;
        if (Math.abs(r.x - v.x) < 5e-4 && Math.abs(r.y - v.y) < 5e-4) {
          const k = h / join.H;
          const a = l.p0[i]!, c = l.pH[i]!;
          return { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k };
        }
      }
    }
  }
  const [x, y] = base(v.x, v.y, h);
  return { x, y };
}

/** Aresta superior da linha de coordenada transversal `s`, na cota real do topo de cada estação. */
function topEdge(f: WallFrame, ends: WallEnds, base: PlanMap, join: WallTiltJoin | undefined, z0: number, st: Array<{ t: number; h: number }>, s: number): TopPoint[] {
  return st.map((q, i) => {
    const raw = i === 0 ? endPoint(f, 'a', ends.a, s) : i === st.length - 1 ? endPoint(f, 'b', ends.b, s) : pointAt(f, q.t, s);
    const m = mapPoint(base, join, raw, q.h);
    return { x: m.x, y: m.y, z: z0 + q.h };
  });
}

/**
 * Faces superiores das paredes do nível. Em planta o topo sai de `tiltPlanMap` na altura real do ponto (deslocamento
 * d = h·tanθ pela normal esquerda e espessura horizontal t/cosθ), com os cantos do anel da junção inclinada
 * (`analyzeLevelTilt`: p0 + (pH − p0)·h/H) quando o canto casa com ele; sem inclinação o contorno do topo é o da base
 * em planta. A cota z vem de `wallZRange` (nível + offset ou height, topo anexado a piso/laje/telhado, `topProfile`).
 */
export function wallTopFaces(p: Project, levelId: Id): WallTopFaces[] {
  const frames = levelFrames(p, levelId);
  if (!frames.length) return [];
  const ends = computeEnds(frames, p.settings?.joinTolerance);
  // Pisos, lajes e telhados só entram quando alguma parede se anexa a eles: sem anexo `wallZRange` não os consulta, e
  // assim o contorno vinculado de piso/laje no topo (T-F) não fecha um ciclo com `resolveAllFloors`.
  const anexa = frames.some((f) => f.wall.attachBottomToFloor === true || f.wall.attachTopToFloor === true || f.wall.attachTopToRoof === true);
  const floors = anexa ? resolveAllFloors(p) : [];
  const slabs = anexa ? resolveAllSlabs(p) : [];
  const roofs = frames.some((f) => f.wall.attachTopToRoof === true) ? resolveAllRoofs(p) : undefined;
  const zs = new Map(frames.map((f) => [f.wall.id, wallZRange(p, f.wall, floors, slabs, roofs)] as const));
  const joins = frames.some((f) => f.wall.tilt) ? analyzeLevelTilt(frames, new Map([...zs].map(([id, z]) => [id, z.height] as const)), p.settings?.joinTolerance).joins : undefined;
  return frames.map((f) => {
    const e = ends.get(f.wall.id)!;
    const z = zs.get(f.wall.id)!;
    const tilt = f.wall.tilt ?? 0;
    const base = tiltPlanMap({ a: f.a, b: f.b, n: f.n, sag: f.wall.sag }, tilt);
    const join = joins?.get(f.wall.id);
    const profile = z.profile ?? (f.wall.topProfile && f.wall.sag === 0 ? f.wall.topProfile : undefined);
    const st = stations(f, z.height, profile);
    const cs = coreSpan(f.type);
    const edge = (s: number): TopPoint[] => topEdge(f, e, base, join, z.z0, st, s);
    const exterior = edge(f.sExt);
    const interior = edge(f.sInt);
    const last = exterior.length - 1;
    return {
      wallId: f.wall.id,
      baseZ: z.z0,
      topZ: z.z0 + Math.max(...st.map((q) => q.h)),
      tilt,
      ...(profile ? { profile } : {}),
      exterior,
      interior,
      coreExterior: edge(sAtDepth(f, cs.from)),
      coreInterior: edge(sAtDepth(f, cs.to)),
      axis: edge(0),
      corners: [exterior[0]!, interior[0]!, interior[last]!, exterior[last]!],
      outline: [...exterior, ...[...interior].reverse()],
    };
  });
}

/** Faces superiores do nível em cache por projeto (imutável, com Immer), como `wallFacesCached`. */
const topCache = new WeakMap<Project, Map<Id, WallTopFaces[]>>();
export function wallTopFacesCached(p: Project, levelId: Id): WallTopFaces[] {
  let byLevel = topCache.get(p);
  if (!byLevel) {
    byLevel = new Map();
    topCache.set(p, byLevel);
  }
  let r = byLevel.get(levelId);
  if (!r) {
    r = wallTopFaces(p, levelId);
    byLevel.set(levelId, r);
  }
  return r;
}
