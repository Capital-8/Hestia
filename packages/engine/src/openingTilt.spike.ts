/**
 * SPIKE S4 (descartável): corte de abertura e referencial do caixilho em parede reta inclinada.
 * Eixos locais: x = linha de base (u), y = normal horizontal (n), z = vertical. O plano médio da parede passa
 * pela origem e inclina para +y: y = z·tanθ. Espessura perpendicular t; horizontal t/cosθ.
 */
export type Vec3 = [number, number, number];
export type TiltMode = 'vertical' | 'inclinado';

export interface TiltOpeningInput {
  mode: TiltMode;
  /** Inclinação (rad), ≥ 0. */
  theta: number;
  t: number;
  /** Largura ao longo da linha de base; centro em `center` (x). */
  w: number;
  h: number;
  /** Peitoril: cota z (sempre vertical). */
  s: number;
  center?: number;
  /** Folga extra do cortador ao longo do eixo de corte (m). */
  margin?: number;
  /** Altura da parede medida em z no plano médio. */
  wallH?: number;
  wallL?: number;
}

export interface TiltOpeningResult {
  /** Hexaedro de corte: 4 cantos da face frontal (+) e 4 da traseira (−), ordem: ie, id, sd, se (inferior/superior). */
  cutter: { front: Vec3[]; back: Vec3[] };
  /** Referencial do caixilho: origem no centro, eixos u (largura), v (altura no plano), n (normal do plano). */
  frame: { origin: Vec3; u: Vec3; v: Vec3; n: Vec3 };
  topZ: number;
  /** Deslocamento horizontal (y) do centro do caixilho. */
  frameShift: number;
  /** Profundidade horizontal (y) do corte, sem folga. */
  horizontalDepth: number;
  /** Volume de parede retirado (fórmula fechada). */
  removedVolume: number;
  /** Recuo (distância do plano do caixilho às superfícies do corte) nas bordas esq, dir, inf, sup: todos ≥ 0 se o caixilho está no vão. */
  reveal: { left: number; right: number; bottom: number; top: number };
  /** Parede (laje inclinada) menos o corte: malha triangular. */
  mesh: { vertices: Vec3[]; triangles: [number, number, number][] };
  /** Volume da parede inteira (sem corte) para conferência. */
  wallVolume: number;
}

export function openingTilt(i: TiltOpeningInput): TiltOpeningResult {
  const { theta: th, t, w, h, s } = i;
  const cx = i.center ?? 0;
  const margin = i.margin ?? 0;
  const L = i.wallL ?? 4;
  const H = i.wallH ?? 3;
  const sn = Math.sin(th), cs = Math.cos(th), tn = Math.tan(th);
  const a0 = cx - w / 2, a1 = cx + w / 2;
  // Slab: ponto = (a, b·sinθ + c·cosθ, b·cosθ − c·sinθ); b ao longo da inclinação (plano médio), c ao longo da normal da face.
  const P = (a: number, b: number, c: number): Vec3 => [a, b * sn + c * cs, b * cs - c * sn];
  const bMin = -1, bMax = H / cs + 1;

  // Cantos do furo por face (c = ±t/2) em coordenadas (b).
  let bBot: (c: number) => number, bTop: (c: number) => number;
  let frame: TiltOpeningResult['frame'];
  let topZ: number, frameShift: number, depth: number, removed: number;
  if (i.mode === 'inclinado') {
    bBot = () => s / cs; // base do prisma perpendicular à face passa pelo plano médio em z = s
    bTop = () => s / cs + h;
    topZ = s + h * cs;
    frameShift = (s + (h * cs) / 2) * tn;
    frame = { origin: [cx, frameShift, s + (h * cs) / 2], u: [1, 0, 0], v: [0, sn, cs], n: [0, cs, -sn] };
    depth = t / cs + h * sn; // pegada horizontal do prisma inclinado
    removed = w * h * t;
  } else {
    bBot = (c) => (s + c * sn) / cs; // planos horizontais z = s e z = s + h
    bTop = (c) => (s + h + c * sn) / cs;
    topZ = s + h;
    frameShift = (s + h / 2) * tn;
    frame = { origin: [cx, frameShift, s + h / 2], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] };
    depth = t / cs + h * tn;
    removed = (w * h * t) / cs;
  }
  const hc = (c: number, m = 0): Vec3[] => {
    const b0 = bBot(c), b1 = bTop(c);
    return [P(a0, b0, c), P(a1, b0, c), P(a1, b1, c), P(a0, b1, c)].map(
      (p) => [p[0], p[1] + (c > 0 ? 1 : -1) * m, p[2]] as Vec3,
    );
  };
  // Folga ao longo do eixo de corte: vertical = +y/−y; inclinado = normal da face (aprox. por c).
  const front = i.mode === 'vertical' ? hc(t / 2, margin) : hc(t / 2 + margin);
  const back = i.mode === 'vertical' ? hc(-t / 2, margin) : hc(-t / 2 - margin);

  // Recuo: distância do plano do caixilho aos limites do cortador ao longo do eixo de corte, por borda.
  const alongN = (p: Vec3): number => (i.mode === 'vertical' ? p[1] : p[1] * cs - p[2] * sn);
  const f0 = alongN(frame.origin);
  const edge = (pf: Vec3, pb: Vec3) => Math.min(alongN(pf) - f0, f0 - alongN(pb));
  const reveal = {
    left: edge(front[0]!.map((_, k) => (front[0]![k]! + front[3]![k]!) / 2) as Vec3, back[0]!.map((_, k) => (back[0]![k]! + back[3]![k]!) / 2) as Vec3),
    right: edge(front[1]!.map((_, k) => (front[1]![k]! + front[2]![k]!) / 2) as Vec3, back[1]!.map((_, k) => (back[1]![k]! + back[2]![k]!) / 2) as Vec3),
    bottom: edge(front[0]!.map((_, k) => (front[0]![k]! + front[1]![k]!) / 2) as Vec3, back[0]!.map((_, k) => (back[0]![k]! + back[1]![k]!) / 2) as Vec3),
    top: edge(front[3]!.map((_, k) => (front[3]![k]! + front[2]![k]!) / 2) as Vec3, back[3]!.map((_, k) => (back[3]![k]! + back[2]![k]!) / 2) as Vec3),
  };

  // Malha: laje [0,L]×[bMin,bMax]×[−t/2,t/2] com furo passante. Grade 4×4 por face.
  const aa = [0, a0, a1, L];
  const vertices: Vec3[] = [];
  const idx = new Map<string, number>();
  const bFace = (c: number) => [bMin, bBot(c), bTop(c), bMax];
  const V = (ai: number, bi: number, c: number): number => {
    const key = `${ai},${bi},${c}`;
    let k = idx.get(key);
    if (k === undefined) { k = vertices.length; vertices.push(P(aa[ai]!, bFace(c)[bi]!, c)); idx.set(key, k); }
    return k;
  };
  const triangles: [number, number, number][] = [];
  const quad = (q: number[], out: Vec3) => {
    const p = q.map((k) => vertices[k]!);
    const e1 = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]];
    const e2 = [p[2]![0] - p[0]![0], p[2]![1] - p[0]![1], p[2]![2] - p[0]![2]];
    const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!, ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!, nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
    const o = nx * out[0] + ny * out[1] + nz * out[2] >= 0 ? q : [q[0]!, q[3]!, q[2]!, q[1]!];
    triangles.push([o[0]!, o[1]!, o[2]!], [o[0]!, o[2]!, o[3]!]);
  };
  const nF: Vec3 = [0, cs, -sn], nB: Vec3 = [0, -cs, sn];
  for (const [c, nrm] of [[t / 2, nF], [-t / 2, nB]] as [number, Vec3][]) {
    for (let ai = 0; ai < 3; ai++) for (let bi = 0; bi < 3; bi++) {
      if (ai === 1 && bi === 1) continue;
      quad([V(ai, bi, c), V(ai + 1, bi, c), V(ai + 1, bi + 1, c), V(ai, bi + 1, c)], nrm);
    }
  }
  // Laterais externas (a=0, a=L, b=bMin, b=bMax): segmentos entre vértices da grade.
  for (let k = 0; k < 3; k++) {
    quad([V(0, k, t / 2), V(0, k + 1, t / 2), V(0, k + 1, -t / 2), V(0, k, -t / 2)], [-1, 0, 0]);
    quad([V(3, k, t / 2), V(3, k + 1, t / 2), V(3, k + 1, -t / 2), V(3, k, -t / 2)], [1, 0, 0]);
    quad([V(k, 0, t / 2), V(k + 1, 0, t / 2), V(k + 1, 0, -t / 2), V(k, 0, -t / 2)], [0, -sn, -cs]);
    quad([V(k, 3, t / 2), V(k + 1, 3, t / 2), V(k + 1, 3, -t / 2), V(k, 3, -t / 2)], [0, sn, cs]);
  }
  // Paredes do furo, normais apontando para o vazio (centro do furo).
  const mid = (c: number): Vec3 => P(cx, (bBot(c) + bTop(c)) / 2, c);
  const holeQuad = (p: [number, number][], q: [number, number][]) => {
    const [pa, pb] = [V(p[0]![0], p[0]![1], t / 2), V(p[1]![0], p[1]![1], t / 2)];
    const [qa, qb] = [V(q[0]![0], q[0]![1], -t / 2), V(q[1]![0], q[1]![1], -t / 2)];
    const ctr = mid(0);
    const c4 = [pa, pb, qb, qa].map((k) => vertices[k]!);
    const cen = [0, 1, 2].map((k) => (c4[0]![k]! + c4[1]![k]! + c4[2]![k]! + c4[3]![k]!) / 4);
    quad([pa, pb, qb, qa], [ctr[0] - cen[0]!, ctr[1] - cen[1]!, ctr[2] - cen[2]!]);
  };
  holeQuad([[1, 1], [2, 1]], [[1, 1], [2, 1]]);
  holeQuad([[2, 1], [2, 2]], [[2, 1], [2, 2]]);
  holeQuad([[2, 2], [1, 2]], [[2, 2], [1, 2]]);
  holeQuad([[1, 2], [1, 1]], [[1, 2], [1, 1]]);

  const wallVolume = L * (bMax - bMin) * t;
  return { cutter: { front, back }, frame, topZ, frameShift, horizontalDepth: depth, removedVolume: removed, reveal, mesh: { vertices, triangles }, wallVolume };
}

/** Volume (teorema da divergência) e conferência de malha fechada: cada aresta dirigida aparece uma vez e sua oposta também. */
export function meshStats(m: { vertices: Vec3[]; triangles: [number, number, number][] }): { volume: number; closed: boolean } {
  let vol = 0;
  const edges = new Map<string, number>();
  for (const [a, b, c] of m.triangles) {
    const p = m.vertices[a]!, q = m.vertices[b]!, r = m.vertices[c]!;
    vol += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6;
    for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) edges.set(`${x}>${y}`, (edges.get(`${x}>${y}`) ?? 0) + 1);
  }
  let closed = true;
  for (const [k, n] of edges) {
    const [x, y] = k.split('>');
    if (n !== 1 || edges.get(`${y}>${x}`) !== 1) closed = false;
  }
  return { volume: vol, closed };
}
