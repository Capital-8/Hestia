import type {
  OpeningModel,
  OpeningPart,
  OpenState,
  PartBox,
  PartMotion,
  PartProfile,
} from './openingModelTypes.ts';

/** Ponto no sistema local do vão. */
export interface ModelPoint {
  t: number;
  s: number;
  z: number;
}

/**
 * Caixa orientada depois do movimento: 8 vértices (base 0..3 e topo 4..7, no sentido t0s0, t1s0, t1s1, t0s1), o
 * centro e a caixa alinhada que a contém.
 */
export interface OrientedBox {
  corners: ModelPoint[];
  center: ModelPoint;
  bounds: PartBox;
}

/** Anel de corte a uma altura `z`, em (t, s). */
export interface SliceRing {
  part: OpeningPart;
  ring: Array<{ t: number; s: number }>;
}

/** Retângulo projetado numa vista: `u` é a horizontal (t na elevação, s no corte) e `z` a altura. */
export interface ProjectedRing {
  part: OpeningPart;
  ring: Array<{ u: number; z: number }>;
  /** Profundidade média no eixo de visão, para a ordem de pintura. */
  depth: number;
}

const BOX_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

function boxCorners(b: PartBox): ModelPoint[] {
  const { t0, t1, s0, s1, z0, z1 } = b;
  return [
    { t: t0, s: s0, z: z0 },
    { t: t1, s: s0, z: z0 },
    { t: t1, s: s1, z: z0 },
    { t: t0, s: s1, z: z0 },
    { t: t0, s: s0, z: z1 },
    { t: t1, s: s0, z: z1 },
    { t: t1, s: s1, z: z1 },
    { t: t0, s: s1, z: z1 },
  ];
}

/**
 * Painel `index` de uma cadeia dobrável: gira em torno da própria dobradiça de ângulo alternado (±θ) e a dobradiça anda
 * junto com o fim do painel anterior; a ponta livre recua ao dobrar. Com θ = 0 todo painel fica onde estava.
 */
function foldPoint(p: ModelPoint, m: Extract<PartMotion, { kind: 'fold' }>, theta: number): ModelPoint {
  let ht = m.tAnchor;
  let hs = m.s;
  for (let j = 0; j < m.index; j++) {
    const a = (j % 2 === 0 ? 1 : -1) * m.sign * theta;
    ht += m.panelWidth * m.dir * Math.cos(a);
    hs += m.panelWidth * Math.sin(a);
  }
  const alpha = (m.index % 2 === 0 ? 1 : -1) * m.sign * theta;
  const phi = m.dir * alpha;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dt = p.t - (m.tAnchor + m.dir * m.index * m.panelWidth);
  const ds = p.s - m.s;
  return { t: ht + dt * cos - ds * sin, s: hs + dt * sin + ds * cos, z: p.z };
}

function movePoint(p: ModelPoint, motion: PartMotion | undefined, state: OpenState): ModelPoint {
  if (!motion) return { ...p };
  if (motion.kind === 'slide') {
    const k = Math.min(1, Math.max(0, Number.isFinite(state.slide) ? state.slide : 0));
    return {
      t: p.t + motion.dt * motion.travel * k,
      s: p.s + motion.ds * motion.travel * k,
      z: p.z + motion.dz * motion.travel * k,
    };
  }
  const angle = Number.isFinite(state.angle) ? state.angle : 0;
  if (motion.kind === 'fold') return foldPoint(p, motion, angle);
  const phi = motion.sign * angle;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  if (motion.axis === 'z') {
    const dt = p.t - motion.t;
    const ds = p.s - motion.s;
    return { t: motion.t + dt * cos - ds * sin, s: motion.s + dt * sin + ds * cos, z: p.z };
  }
  const ds = p.s - motion.s;
  const dz = p.z - motion.z;
  return { t: p.t, s: motion.s + ds * cos - dz * sin, z: motion.z + ds * sin + dz * cos };
}

/** Caixa orientada da peça depois de aplicar o estado de abertura (`angle` em radianos, `slide` 0..1). */
export function partTransformed(part: OpeningPart, state: OpenState): OrientedBox {
  const corners = boxCorners(part.box).map((p) => movePoint(p, part.motion, state));
  let t0 = Infinity;
  let t1 = -Infinity;
  let s0 = Infinity;
  let s1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let ct = 0;
  let cs = 0;
  let cz = 0;
  for (const p of corners) {
    t0 = Math.min(t0, p.t);
    t1 = Math.max(t1, p.t);
    s0 = Math.min(s0, p.s);
    s1 = Math.max(s1, p.s);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
    ct += p.t;
    cs += p.s;
    cz += p.z;
  }
  return {
    corners,
    center: { t: ct / corners.length, s: cs / corners.length, z: cz / corners.length },
    bounds: { t0, t1, s0, s1, z0, z1 },
  };
}

function addUnique(list: Array<{ t: number; s: number }>, p: { t: number; s: number }): void {
  for (const q of list) if (Math.abs(q.t - p.t) < 1e-9 && Math.abs(q.s - p.s) < 1e-9) return;
  list.push(p);
}

function polygonArea(ring: Array<{ t: number; s: number }>): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p.t * q.s - q.t * p.s;
  }
  return a / 2;
}

function crossSection(corners: ModelPoint[], z: number): Array<{ t: number; s: number }> {
  const pts: Array<{ t: number; s: number }> = [];
  const eps = 1e-9;
  for (const [ia, ib] of BOX_EDGES) {
    const a = corners[ia]!;
    const b = corners[ib]!;
    const za = a.z - z;
    const zb = b.z - z;
    if (Math.abs(za) <= eps && Math.abs(zb) <= eps) {
      addUnique(pts, { t: a.t, s: a.s });
      addUnique(pts, { t: b.t, s: b.s });
    } else if (Math.abs(za) <= eps) {
      addUnique(pts, { t: a.t, s: a.s });
    } else if (Math.abs(zb) <= eps) {
      addUnique(pts, { t: b.t, s: b.s });
    } else if (za * zb < 0) {
      const k = za / (za - zb);
      addUnique(pts, { t: a.t + (b.t - a.t) * k, s: a.s + (b.s - a.s) * k });
    }
  }
  if (pts.length < 3) return [];
  let ct = 0;
  let cs = 0;
  for (const p of pts) {
    ct += p.t;
    cs += p.s;
  }
  ct /= pts.length;
  cs /= pts.length;
  pts.sort((p, q) => Math.atan2(p.s - cs, p.t - ct) - Math.atan2(q.s - cs, q.t - ct));
  return Math.abs(polygonArea(pts)) > 1e-12 ? pts : [];
}

/** Primeiras coordenadas em que o contorno (a, v) cruza a cota `v = z` (vértice na cota entra uma vez). */
function cruzamentosEm(pts: Array<[number, number]>, z: number): number[] {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [sa, za] = pts[i]!;
    const [sb, zb] = pts[(i + 1) % pts.length]!;
    if (Math.abs(za - z) <= 1e-9) xs.push(sa);
    if (Math.abs(zb - z) <= 1e-9) xs.push(sb);
    if ((za - z) * (zb - z) < 0) xs.push(sa + ((sb - sa) * (z - za)) / (zb - za));
  }
  return xs;
}

/**
 * Anel horizontal (t, s) do perfil na cota `z`. No plano `ts` a seção é o próprio polígono (extrudado em z); no plano
 * `sz` o corte horizontal é o intervalo em `s` entre as interseções do polígono com a cota, ao longo de toda a extrusão
 * em `t` (spec E3 §2); no plano `tz` é o intervalo em `t`, ao longo da extrusão em `s`.
 */
function profileRingAtZ(part: OpeningPart, profile: PartProfile, z: number): Array<{ t: number; s: number }> {
  const { box: b } = part;
  if (z < b.z0 - 1e-9 || z > b.z1 + 1e-9) return [];
  if (profile.plane === 'ts') return profile.pts.map(([t, s]) => ({ t, s }));
  const xs = cruzamentosEm(profile.pts, z);
  if (xs.length < 2) return [];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  if (x1 - x0 < 1e-9) return [];
  const [u0, u1, v0, v1] = profile.plane === 'sz' ? [b.t0, b.t1, x0, x1] : [x0, x1, b.s0, b.s1];
  return [
    { t: u0, s: v0 },
    { t: u1, s: v0 },
    { t: u1, s: v1 },
    { t: u0, s: v1 },
  ];
}

/** Intervalos [x0, x1] em que a seção (x, z) contém a cota `z` (regra par-ímpar, vértice na cota conta uma vez). */
function intervalosEmZ(pts: Array<[number, number]>, z: number): Array<[number, number]> {
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [xa, za] = pts[i]!;
    const [xb, zb] = pts[(i + 1) % pts.length]!;
    if (za <= z !== zb <= z) xs.push(xa + ((xb - xa) * (z - za)) / (zb - za));
  }
  xs.sort((a, b) => a - b);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1]! - xs[i]! > 1e-9) out.push([xs[i]!, xs[i + 1]!]);
  return out;
}

/** Corte horizontal do modelo na altura `z`, no estado pedido: as peças que o plano atravessa com o anel (t, s). */
export function slicePartsAtZ(m: OpeningModel, z: number, state: OpenState): SliceRing[] {
  const out: SliceRing[] = [];
  for (const part of m.parts) {
    // Peça em arco/círculo (seção `tz` com mais de um intervalo na cota): um anel por intervalo, com o movimento aplicado.
    if (part.profile?.plane === 'tz' && part.role !== 'handle') {
      for (const [x0, x1] of intervalosEmZ(part.profile.pts, z)) {
        const cantos = [[x0, part.box.s0], [x1, part.box.s0], [x1, part.box.s1], [x0, part.box.s1]] as const;
        const ring = cantos.map(([t, s]) => {
          const q = movePoint({ t, s, z }, part.motion, state);
          return { t: q.t, s: q.s };
        });
        out.push({ part, ring });
      }
      continue;
    }
    if (part.profile && !part.motion) {
      const ring = profileRingAtZ(part, part.profile, z);
      if (ring.length) out.push({ part, ring });
      continue;
    }
    const ob = partTransformed(part, state);
    if (z < ob.bounds.z0 - 1e-9 || z > ob.bounds.z1 + 1e-9) continue;
    const ring = crossSection(ob.corners, z);
    if (ring.length) out.push({ part, ring });
  }
  return out;
}

function convexHull(points: Array<{ u: number; z: number }>): Array<{ u: number; z: number }> {
  const pts = [...points].sort((a, b) => a.u - b.u || a.z - b.z);
  const uniq: Array<{ u: number; z: number }> = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (!last || Math.abs(last.u - p.u) > 1e-9 || Math.abs(last.z - p.z) > 1e-9) uniq.push(p);
  }
  if (uniq.length <= 2) return uniq;
  const cross = (o: { u: number; z: number }, a: { u: number; z: number }, b: { u: number; z: number }): number =>
    (a.u - o.u) * (b.z - o.z) - (a.z - o.z) * (b.u - o.u);
  const lower: Array<{ u: number; z: number }> = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<{ u: number; z: number }> = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Projeção ortográfica das peças: `axis = 's'` é a elevação (horizontal em `t`, observada ao longo de `s`); `axis =
 * 't'` é o corte transversal (horizontal em `s`, observado ao longo de `t`).
 */
export function projectParts(m: OpeningModel, axis: 's' | 't', state: OpenState): ProjectedRing[] {
  const out: ProjectedRing[] = [];
  for (const part of m.parts) {
    if (part.profile?.plane === 'tz' && axis === 's') {
      // Elevação de disco/cilindro com eixo em s: a seção (t, z) real, com o movimento aplicado no meio da espessura.
      const sMid = (part.box.s0 + part.box.s1) / 2;
      const moved = part.profile.pts.map(([t, z]) => movePoint({ t, s: sMid, z }, part.motion, state));
      const depth = moved.reduce((acc, p) => acc + p.s, 0) / moved.length;
      out.push({ part, ring: moved.map((p) => ({ u: p.t, z: p.z })), depth });
      continue;
    }
    if (part.profile && !part.motion) {
      const b = part.box;
      const depth = axis === 's' ? (b.s0 + b.s1) / 2 : (b.t0 + b.t1) / 2;
      // Elevação: retângulo envolvente. Corte transversal: a travessa mostra o L em (s, z); a ombreira, o retângulo.
      const ring: Array<{ u: number; z: number }> =
        axis === 't' && part.profile.plane === 'sz'
          ? part.profile.pts.map(([s, z]) => ({ u: s, z }))
          : axis === 's'
            ? [
                { u: b.t0, z: b.z0 },
                { u: b.t1, z: b.z0 },
                { u: b.t1, z: b.z1 },
                { u: b.t0, z: b.z1 },
              ]
            : [
                { u: b.s0, z: b.z0 },
                { u: b.s1, z: b.z0 },
                { u: b.s1, z: b.z1 },
                { u: b.s0, z: b.z1 },
              ];
      out.push({ part, ring, depth });
      continue;
    }
    const ob = partTransformed(part, state);
    let depth = 0;
    const projected = ob.corners.map((p) => {
      if (axis === 's') {
        depth += p.s;
        return { u: p.t, z: p.z };
      }
      depth += p.t;
      return { u: p.s, z: p.z };
    });
    const ring = convexHull(projected);
    if (ring.length < 3) continue;
    out.push({ part, ring, depth: depth / ob.corners.length });
  }
  return out;
}
