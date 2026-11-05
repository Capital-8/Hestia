import { asMulti, closestOnSegment, cross, dist, dot, intersectSegments, len, norm, offsetMulti, perp, pointInRing, ringArea, sub, type Ring, type Vec2 } from '@hestia/geom';
import { wallMaxHeight, wallsOnLevel, type Id, type Project, type RoofShape } from '@hestia/model';
import { t as translate, type Lang } from './i18n.ts';

/** Maior inclinação aceita para telhado, em % (200 % = 63,4°). Acima disso o telhado vira parede. */
export const ROOF_SLOPE_LIMIT = 200;

/** Percentual de inclinação para graus: % = tan(graus) × 100. */
export const percentToDeg = (percent: number): number => (Math.atan(percent / 100) * 180) / Math.PI;

/** Graus para percentual de inclinação: % = tan(graus) × 100. */
export const degToPercent = (deg: number): number => Math.tan((deg * Math.PI) / 180) * 100;

/**
 * Inclinação (%) gravada pelo campo em graus ao sair dele. Sem edição, o campo lê o valor mostrado (1 casa decimal):
 * nesse caso a inclinação atual em % fica como estava, senão o arredondamento trocaria 45 % por 44,94 %.
 */
export function roofSlopeFromDegField(typedDeg: number, currentDeg: number, currentPercent: number): number {
  const shownDeg = Math.round(currentDeg * 10) / 10;
  return Math.abs(typedDeg - shownDeg) < 1e-9 ? currentPercent : degToPercent(typedDeg);
}

/** Erro da inclinação de telhado (não finita, não positiva ou acima do limite), ou null quando é aceita. */
export function roofSlopeError(percent: number, lang: Lang = 'pt'): string | null {
  if (!Number.isFinite(percent)) return translate(lang, 'tl_msg_slope_invalid');
  if (percent <= 0) return translate(lang, 'tl_msg_slope_positive');
  if (percent > ROOF_SLOPE_LIMIT) return translate(lang, 'tl_msg_slope_above_limit', { limit: ROOF_SLOPE_LIMIT });
  return null;
}

/** Deslocamento padrão do beiral sem paredes no nível (m). */
export const ROOF_DEFAULT_OFFSET = 2.8;

/** Cota do beiral quando o usuário não digitou uma: altura da parede mais alta do nível, ou 2,8 m sem paredes. */
export function roofAutoOffset(p: Project, levelId: Id): number {
  const heights = wallsOnLevel(p, levelId).map((w) => wallMaxHeight(p, w));
  return heights.length ? Math.max(...heights) : ROOF_DEFAULT_OFFSET;
}

/** Ordena o sinal da direção (x positivo, ou x nulo e y positivo) para que o mesmo eixo nunca saia invertido. */
function canonicalDir(d: Vec2): Vec2 {
  const flip = Math.abs(d.x) > 1e-12 ? d.x < 0 : d.y < 0;
  // `+ 0` converte -0 em 0: a comparação de eixos e o JSON do projeto ficam estáveis.
  return flip ? { x: -d.x + 0, y: -d.y + 0 } : { x: d.x + 0, y: d.y + 0 };
}

/**
 * Eixo do lado MAIOR do retângulo envolvente de mínima área do contorno (rotating calipers sobre as arestas).
 * É a direção da cumeeira por padrão: as águas caem sobre os lados menores. Função pura e determinística.
 */
export function defaultRoofDir(boundary: Vec2[]): Vec2 {
  let best = { area: Infinity, dir: { x: 1, y: 0 } };
  const n = boundary.length;
  for (let i = 0; i < n; i++) {
    const e = sub(boundary[(i + 1) % n]!, boundary[i]!);
    if (len(e) < 1e-9) continue;
    const u = norm(e);
    const v = perp(u);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const q of boundary) {
      const pu = dot(q, u);
      const pv = dot(q, v);
      minU = Math.min(minU, pu);
      maxU = Math.max(maxU, pu);
      minV = Math.min(minV, pv);
      maxV = Math.max(maxV, pv);
    }
    const su = maxU - minU;
    const sv = maxV - minV;
    const area = su * sv;
    if (area < best.area - 1e-9) best = { area, dir: su >= sv ? u : v };
  }
  return canonicalDir(best.dir);
}

/**
 * Direção que o telhado usa para a forma: duas águas = cumeeira no eixo `base`; uma água = subida perpendicular
 * ao eixo (a água cai sobre o lado maior, como nas duas águas); quatro águas não usa direção (devolve `base`).
 * `alt` (Tab) troca para o outro eixo ortogonal.
 */
export function roofDirFor(shape: RoofShape, base: Vec2, alt: boolean): Vec2 {
  const axis = alt ? perp(base) : base;
  if (shape === 'shed') return canonicalDir(perp(axis));
  return canonicalDir(axis);
}

/** Retângulo com dois cantos opostos, em ordem de contorno. */
export const rectRing = (a: Vec2, c: Vec2): Vec2[] => [a, { x: c.x, y: a.y }, c, { x: a.x, y: c.y }];

/**
 * Contorno do beiral a partir do contorno externo da edificação: deslocado para fora pelo balanço, com cantos em
 * esquadria (Clipper, miter). Balanço zero ou negativo devolve o próprio contorno.
 */
export function eaveOutline(outer: Ring, overhang: number): Ring {
  if (!(overhang > 1e-9)) return outer;
  const grown = offsetMulti(asMulti(outer), overhang);
  let best: Ring | null = null;
  let bestArea = -Infinity;
  for (const poly of grown) {
    const ring = poly[0];
    if (!ring || ring.length < 3) continue;
    const a = Math.abs(ringArea(ring));
    if (a > bestArea) {
      best = ring;
      bestArea = a;
    }
  }
  return best ?? outer;
}

/** Normal unitária de `a` até `b` apontando para fora do contorno; zero quando a aresta é nula. */
function outwardNormal(a: Vec2, b: Vec2, sign: number): Vec2 {
  const e = sub(b, a);
  if (len(e) < 1e-9) return { x: 0, y: 0 };
  const u = norm(e);
  // Contorno anti-horário (área positiva): a normal para fora é a direita da aresta; no sentido horário, a esquerda.
  return { x: sign * u.y, y: -sign * u.x };
}

/**
 * Contorno do beiral com balanço por aresta: cada aresta i (de outer[i] a outer[i+1]) anda para fora `overhangs[i]`
 * metros, e cada vértice vira a interseção das duas arestas deslocadas que o cercam (cantos em esquadria). Com todos
 * os balanços iguais, coincide com `eaveOutline`. Balanço zero mantém a aresta no lugar. Em vértice de arestas
 * paralelas não há interseção: o vértice anda a média dos deslocamentos das duas arestas.
 */
export function eaveOutlinePerEdge(outer: Ring, overhangs: number[]): Ring {
  const n = outer.length;
  if (n < 3) return outer;
  const sign = ringArea(outer) >= 0 ? 1 : -1;
  const normals = outer.map((a, i) => outwardNormal(a, outer[(i + 1) % n]!, sign));
  return outer.map((p, j) => {
    const i1 = (j - 1 + n) % n;
    const n1 = normals[i1]!;
    const n2 = normals[j]!;
    const d1 = overhangs[i1] ?? 0;
    const d2 = overhangs[j] ?? 0;
    // Deslocamento δ do vértice: n1·δ = d1 e n2·δ = d2 (regra de Cramer; det = cross(n1, n2)).
    const det = cross(n1, n2);
    if (Math.abs(det) < 1e-9) {
      const d = (d1 + d2) / 2;
      return { x: p.x + ((n1.x + n2.x) / 2) * d, y: p.y + ((n1.y + n2.y) / 2) * d };
    }
    return { x: p.x + (n2.y * d1 - n1.y * d2) / det, y: p.y + (n1.x * d2 - n2.x * d1) / det };
  });
}

/** Vetor de `n` balanços iguais a `v` (m), um por aresta. */
export const uniformEdges = (n: number, v: number): number[] => Array.from({ length: n }, () => v);

/** Dois contornos com os mesmos vértices, na mesma ordem e a menos de 1 µm. */
export function sameRing(a: Ring, b: Ring): boolean {
  return a.length === b.length && a.every((q, i) => Math.hypot(q.x - b[i]!.x, q.y - b[i]!.y) < 1e-6);
}

/**
 * Desvio de direção (graus) abaixo do qual dois lados seguidos, com os mesmos valores, são um só trecho. Um arco do
 * esboço chega amostrado em lados de corda 2 mm (sketchLoops); cada lado vira ~4° no vértice seguinte, então o arco
 * inteiro fica num trecho. Arco e retas tangentes a ele (mesma inclinação e balanço) também se juntam.
 * Decisão: o motor guarda um valor por lado (o arco não é um lado só); a contagem de águas e a mensagem usam trechos.
 * Beiral de arco: o balanço d sobre um arco de raio R sai a R + d/cos(θ/2) nos vértices amostrados, com θ = 2·acos(1 − tol/R);
 * o erro sobre o raio R + d é d·tol/R (ex.: d = 0,5 m e R = 3 m dá 0,3 mm), dentro de 2 mm.
 */
export const ARC_TURN_DEG = 15;

/** Esquadria máxima do beiral: distância do vértice do beiral à pegada, em múltiplos do maior balanço vizinho. */
export const MITER_LIMIT = 10;

/**
 * Trecho lógico de cada lado do contorno. Lados seguidos com a mesma inclinação e o mesmo balanço, que viram menos de
 * `ARC_TURN_DEG` entre si, são um trecho só: um arco amostrado em muitos lados vira um trecho. Canto de 90° separa.
 * Devolve o índice do trecho de cada lado (0, 1, …); contorno fechado sem canto devolve tudo 0.
 */
export function edgeGroupsOf(boundary: Vec2[], edgeSlopes: Array<number | null>, edgeOverhangs: number[]): number[] {
  const n = boundary.length;
  const sideOf = (i: number): Vec2 => sub(boundary[(i + 1) % n]!, boundary[i]!);
  const sameValues = (i: number, j: number): boolean => {
    const a = edgeSlopes[i] ?? null;
    const b = edgeSlopes[j] ?? null;
    const slopeSame = a === null || b === null ? a === b : Math.abs(a - b) < 1e-9;
    return slopeSame && Math.abs((edgeOverhangs[i] ?? 0) - (edgeOverhangs[j] ?? 0)) < 1e-9;
  };
  // O lado i continua o trecho do lado anterior: mesmos valores e desvio pequeno no vértice que os separa.
  const continues = (i: number): boolean => {
    const prev = (i - 1 + n) % n;
    if (!sameValues(prev, i)) return false;
    const a = sideOf(prev);
    const b = sideOf(i);
    if (len(a) < 1e-9 || len(b) < 1e-9) return true;
    return (Math.abs(Math.atan2(cross(a, b), dot(a, b))) * 180) / Math.PI < ARC_TURN_DEG;
  };
  const out = new Array<number>(n).fill(0);
  const breaks = [...Array(n).keys()].filter((i) => !continues(i));
  if (breaks.length === 0) return out;
  let g = -1;
  for (let k = 0; k < n; k++) {
    const i = (breaks[0]! + k) % n;
    if (!continues(i)) g++;
    out[i] = g;
  }
  return out;
}

/** Número de águas que o contorno gera: trechos lógicos que definem inclinação (um arco conta uma vez). */
export function waterGroupCount(boundary: Vec2[], edgeSlopes: Array<number | null>, edgeOverhangs: number[]): number {
  const groups = edgeGroupsOf(boundary, edgeSlopes, edgeOverhangs);
  const defining = new Set<number>();
  edgeSlopes.forEach((s, i) => {
    if (s !== null && s !== undefined && s > 0) defining.add(groups[i] ?? 0);
  });
  return defining.size;
}

/** Distância do ponto ao contorno (menor distância a qualquer lado). */
const distToRing = (p: Vec2, ring: Ring): number => {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) best = Math.min(best, dist(p, closestOnSegment(p, ring[i]!, ring[(i + 1) % ring.length]!)));
  return best;
};

/** Algum par de lados não adjacentes do anel se cruza (o anel se corta sozinho). */
function ringCrosses(ring: Ring): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (intersectSegments(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/**
 * Motivo para o beiral (contorno com balanço) não representar a pegada, ou null. Duas falhas: a esquadria dispara num
 * canto agudo demais (vértice do beiral mais longe que MITER_LIMIT vezes o balanço); e o beiral se corta ou deixa a
 * pegada para fora, o que acontece quando o balanço é maior que o raio de um trecho côncavo e o arco se inverte.
 */
export function eaveProblem(footprint: Vec2[], eave: Vec2[], overhangs: number[]): string | null {
  const n = footprint.length;
  if (eave.length !== n) return 'o beiral não tem o mesmo número de vértices da pegada';
  for (let j = 0; j < n; j++) {
    const d = Math.max(overhangs[j] ?? 0, overhangs[(j - 1 + n) % n] ?? 0);
    if (d > 1e-9 && dist(footprint[j]!, eave[j]!) > MITER_LIMIT * d) {
      return 'o balanço não cabe num canto agudo da planta (a esquadria do beiral dispara); reduza o balanço ou aumente o ângulo';
    }
  }
  const holds = !ringCrosses(eave) && footprint.every((q) => pointInRing(q, eave) || distToRing(q, eave) < 1e-6);
  return holds ? null : 'o balanço é maior que o raio de um trecho côncavo e o beiral se cruza; reduza o balanço';
}
