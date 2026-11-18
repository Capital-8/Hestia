/**
 * Recuo (inset) do contorno do vão e faixas de perfil ao longo dele: base geométrica das PEÇAS da esquadria em vão com forma
 * (batente, alizar, folha, vidro). Arquivo novo; `openingShape.ts` fica como está (docs/estudo-esquadrias/28).
 *
 * Mesmo sistema do contorno: x ao longo da parede (origem no meio da base), z para cima (origem na base do vão), metros,
 * anéis anti-horários e abertos. O recuo de arco é CONCÊNTRICO (raio R - d), não uma aproximação por faixas: as cordas têm erro
 * máximo `tol` (padrão 1 mm) como em `outline`. Distância negativa expande (alizar, que fica por fora do vão).
 * Vale para `round`, `segmental`, `pointed`, `horseshoe` (arco com laterais retas) e `circle` (elipse, recuo paralelo). Empena,
 * trapézio e polígono recuam por reta (`openingShapePolyInset.ts`); não têm coroa. `rect` só nas funções de região.
 */
import { CHORD_TOL, validateOpeningShape, type OPt, type OpeningShape } from './openingShape.ts';
import { horseshoeCrown } from './openingShapeHorseshoe.ts';
import { isPolygonForm, polygonInset } from './openingShapePolyInset.ts';

const EPS = 1e-9;

/** Distâncias de recuo: laterais, arco/topo e base. Número = o mesmo recuo nas laterais e no arco, base sem recuo. */
export type OpeningInset = number | { side: number; arc: number; base?: number };

const norm = (i: OpeningInset): { side: number; arc: number; base: number } =>
  typeof i === 'number' ? { side: i, arc: i, base: 0 } : { side: i.side, arc: i.arc, base: i.base ?? 0 };

/** Pontos do arco de centro (cx, cz) e raio r de a0 a a1 (inclui as pontas), corda com sagita <= tol; passo par (coroa vira vértice). */
function arco(cx: number, cz: number, r: number, a0: number, a1: number, tol: number): OPt[] {
  const dθ = 2 * Math.acos(Math.max(-1, 1 - tol / Math.max(r, 1e-9)));
  const n = Math.max(2, 2 * Math.ceil(Math.abs(a1 - a0) / dθ / 2));
  const out: OPt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return out;
}

const dedupe = (pts: OPt[]): OPt[] => pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > EPS);

/** Área com sinal (positiva no sentido anti-horário) do anel. */
export function ringSignedArea(r: readonly OPt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Perímetro do anel fechado. */
export function ringPerimeter(r: readonly OPt[]): number {
  let l = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    l += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return l;
}

/** Coroa (do arco) de um vão: do arranque direito ao esquerdo, anti-horário. `null` quando o recuo consome o arco. */
export interface Crown {
  /** Pontos do arranque direito ao esquerdo (o primeiro e o último ficam em x = ±(w/2 - lateral)). */
  pts: OPt[];
  /** Cota do arranque (menor z da coroa). */
  spring: number;
  /** Meia-largura do vão recuado (lateral). */
  half: number;
}

/**
 * Coroa do contorno recuado: laterais por `side`, arco por `arc`. Arco concêntrico: o raio cai `arc` e o centro fica. Se o
 * arco recuado é mais estreito que a lateral (recuo de arco maior que o lateral), a coroa ganha uma prateleira na cota do
 * centro: a lateral sobe até lá e segue horizontal até o arco.
 */
export function crownOf(shape: OpeningShape, ins: OpeningInset, tol = CHORD_TOL): Crown | null {
  if (validateOpeningShape(shape).length > 0) return null;
  const { side, arc: dA } = norm(ins);
  const w = shape.width;
  const h = shape.height;
  const half = w / 2;
  const xs = half - side;
  if (!(xs > EPS)) return null;
  if (shape.kind === 'round' || shape.kind === 'segmental') {
    const f = shape.kind === 'round' ? half : shape.rise;
    const R = (half * half + f * f) / (2 * f);
    const zc = h - R;
    const rr = R - dA;
    if (!(rr > EPS)) return null;
    let pts: OPt[];
    if (rr >= xs) {
      const a0 = Math.acos(Math.min(1, xs / rr));
      pts = arco(0, zc, rr, a0, Math.PI - a0, tol);
    } else pts = [[xs, zc], ...arco(0, zc, rr, 0, Math.PI, tol), [-xs, zc]];
    const d = dedupe(pts);
    return { pts: d, spring: Math.min(d[0]![1], d[d.length - 1]![1]), half: xs };
  }
  if (shape.kind === 'horseshoe') return horseshoeCrown(shape, side, dA, tol);
  if (shape.kind === 'pointed') {
    const f = shape.rise;
    const zs = h - f;
    const r = (f * f + half * half) / (2 * half);
    const cx = half - r;
    const rr = r - dA;
    if (!(rr > EPS)) return null;
    const cosA = (r - half) / rr; // o ápice fica em x = 0
    if (cosA > 1 + EPS) return null;
    const aA = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const cosB = (r - side) / rr;
    const aB = cosB >= 1 ? 0 : Math.acos(Math.max(-1, cosB));
    if (aB > aA + EPS) return null;
    const right: OPt[] = [...(cosB > 1 ? [[xs, zs] as OPt] : []), ...arco(cx, zs, rr, aB, aA, tol)];
    const left = right.slice(0, -1).map((p): OPt => [-p[0], p[1]]).reverse();
    const d = dedupe([...right, ...left]);
    return { pts: d, spring: Math.min(d[0]![1], d[d.length - 1]![1]), half: xs };
  }
  return null;
}

/** Anel da região do vão recuada, sem a base: o primeiro ponto é o arranque direito. Interno a `outlineInset`. */
function ringDeArco(shape: OpeningShape, ins: OpeningInset, tol: number): OPt[] | null {
  const { base } = norm(ins);
  const c = crownOf(shape, ins, tol);
  if (!c) return null;
  const xs = c.half; // meia-largura das ombreiras recuadas (a da ferradura é a do pescoço)
  const baixo = Math.min(0, base) - 1; // anel largo para baixo; o recorte pela base vem depois
  return recortaZ([[xs, baixo], ...c.pts, [-xs, baixo]], base);
}

/** Recorta o anel pelo semiplano z >= zMin (Sutherland-Hodgman, vale para anel não convexo que não separa em duas partes). */
function recortaZ(ring: readonly OPt[], zMin: number): OPt[] {
  const out: OPt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const pin = p[1] >= zMin - EPS;
    const qin = q[1] >= zMin - EPS;
    if (pin) out.push(p);
    if (pin !== qin) {
      const k = (zMin - p[1]) / (q[1] - p[1]);
      out.push([p[0] + k * (q[0] - p[0]), zMin]);
    }
  }
  return dedupe(out);
}

/** Recuo paralelo de uma elipse (círculo quando w = h) de semi-eixos a e b, centrada em (0, b), a distância `d` (>0 para dentro). */
function elipseRecuada(a: number, b: number, d: number, tol: number): OPt[] {
  const rMin = Math.min((a * a) / b, (b * b) / a);
  if (d >= rMin - EPS || a - d <= EPS || b - d <= EPS) return [];
  const M = Math.max(a, b);
  const dt = Math.min(Math.PI / 2, Math.sqrt(8 * tol * rMin) / M);
  const n = 4 * Math.max(1, Math.ceil((2 * Math.PI) / dt / 4));
  const out: OPt[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const nx = Math.cos(t) / a;
    const nz = Math.sin(t) / b;
    const m = Math.hypot(nx, nz);
    out.push([a * Math.cos(t) - (d * nx) / m, b + b * Math.sin(t) - (d * nz) / m]);
  }
  return out;
}

/**
 * Região do vão recuada, como anel anti-horário aberto. Arcos com laterais: a base fica em `base` (padrão 0, ou seja, sem
 * recuo embaixo; porta) e o anel é recortado nela. Elipse: recuo paralelo uniforme (o maior de lateral e arco); a base não
 * existe. Retângulo: caixa recuada. `[]` quando o recuo consome a forma ou ela é inválida.
 */
export function outlineInset(shape: OpeningShape, ins: OpeningInset = 0, tol = CHORD_TOL): OPt[] {
  if (validateOpeningShape(shape).length > 0) return [];
  const { side, arc, base } = norm(ins);
  const w = shape.width;
  const h = shape.height;
  if (shape.kind === 'rect') {
    const xs = w / 2 - side;
    return xs > EPS && h - arc - base > EPS ? [[xs, base], [xs, h - arc], [-xs, h - arc], [-xs, base]] : [];
  }
  if (shape.kind === 'circle') return elipseRecuada(w / 2, h / 2, Math.max(side, arc), tol);
  if (isPolygonForm(shape)) return polygonInset(shape, { side, arc, base }, tol); // empena, trapézio e polígono (offset por reta)
  const r = ringDeArco(shape, ins, tol);
  return r && r.length >= 3 && ringSignedArea(r) > EPS ? r : [];
}

/** Faixa de perfil ao longo da coroa: região entre o contorno a `dOut` e o recuado a `dIn` (`dIn > dOut`), acima do piso. */
export interface CrownBand {
  /** Anel anti-horário (forma de arco com duas pernas curtas). */
  pts: OPt[];
  /** Cota em que a faixa termina embaixo: o menor arranque entre os dois contornos. As ombreiras sobem até aqui. */
  floor: number;
}

/**
 * Faixa entre dois contornos do mesmo vão, de `dOut` (lado de fora) a `dIn` (de dentro), apenas na parte do arco: da cota
 * `floor` (arranque mais baixo) para cima. As ombreiras retas do vão (batente, alizar) ocupam o que fica abaixo de `floor`,
 * e as duas peças fecham sem sobra nem sobreposição. `null` para forma sem arco ou recuo que consome o contorno.
 */
export function crownBand(shape: OpeningShape, dOut: OpeningInset, dIn: OpeningInset, tol = CHORD_TOL): CrownBand | null {
  const out = crownOf(shape, dOut, tol);
  const inn = crownOf(shape, dIn, tol);
  if (!out || !inn || norm(dIn).arc <= norm(dOut).arc + EPS) return null;
  const floor = Math.min(out.spring, inn.spring);
  const xo = out.half;
  const xi = inn.half;
  const pts: OPt[] = [];
  if (out.pts[0]![1] > floor + EPS) pts.push([xo, floor]);
  pts.push(...out.pts);
  if (out.pts[out.pts.length - 1]![1] > floor + EPS) pts.push([-xo, floor]);
  if (inn.pts[inn.pts.length - 1]![1] > floor + EPS) pts.push([-xi, floor]);
  pts.push(...[...inn.pts].reverse());
  if (inn.pts[0]![1] > floor + EPS) pts.push([xi, floor]);
  const d = dedupe(pts);
  return d.length >= 3 && ringSignedArea(d) > EPS ? { pts: d, floor } : null;
}

/** Duas metades (direita e esquerda) do anel entre dois recuos de um círculo/elipse; cada uma é um anel anti-horário. */
export function ringHalves(shape: OpeningShape, dOut: number, dIn: number, tol = CHORD_TOL): { right: OPt[]; left: OPt[] } | null {
  if (shape.kind !== 'circle' || validateOpeningShape(shape).length > 0 || dIn <= dOut + EPS) return null;
  const a = shape.width / 2;
  const b = shape.height / 2;
  const fora = elipseRecuada(a, b, dOut, tol);
  const dentro = elipseRecuada(a, b, dIn, tol);
  if (fora.length === 0 || dentro.length !== fora.length) return null;
  const n = fora.length;
  // Os pontos i = 0 (x máximo), n/4 (topo), n/2 (x mínimo) e 3n/4 (base): n é múltiplo de 4, então cada metade fecha em x = 0.
  const fatia = (i0: number, i1: number): OPt[] => {
    const o: OPt[] = [];
    const k: OPt[] = [];
    for (let i = i0; i <= i1; i++) {
      o.push(fora[((i % n) + n) % n]!);
      k.push(dentro[((i % n) + n) % n]!);
    }
    return [...o, ...k.reverse()];
  };
  return { right: fatia(-n / 4, n / 4), left: fatia(n / 4, (3 * n) / 4) };
}

/** Recorta o anel `subject` pelo retângulo (Sutherland-Hodgman); devolve [] quando nada sobra. */
export function clipRect(subject: readonly OPt[], x0: number, x1: number, z0: number, z1: number): OPt[] {
  let ring: OPt[] = [...subject];
  const lados: Array<{ dentro: (p: OPt) => boolean; cruza: (p: OPt, q: OPt) => OPt }> = [
    { dentro: (p) => p[0] >= x0 - EPS, cruza: (p, q) => [x0, p[1] + ((x0 - p[0]) / (q[0] - p[0])) * (q[1] - p[1])] },
    { dentro: (p) => p[0] <= x1 + EPS, cruza: (p, q) => [x1, p[1] + ((x1 - p[0]) / (q[0] - p[0])) * (q[1] - p[1])] },
    { dentro: (p) => p[1] >= z0 - EPS, cruza: (p, q) => [p[0] + ((z0 - p[1]) / (q[1] - p[1])) * (q[0] - p[0]), z0] },
    { dentro: (p) => p[1] <= z1 + EPS, cruza: (p, q) => [p[0] + ((z1 - p[1]) / (q[1] - p[1])) * (q[0] - p[0]), z1] },
  ];
  for (const l of lados) {
    const next: OPt[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const pin = l.dentro(p);
      const qin = l.dentro(q);
      if (pin) next.push(p);
      if (pin !== qin) next.push(l.cruza(p, q));
    }
    ring = dedupe(next);
    if (ring.length < 3) return [];
  }
  return ringSignedArea(ring) > EPS ? ring : [];
}
