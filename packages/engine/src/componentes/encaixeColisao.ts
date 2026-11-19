import type { Colisoes, CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';
import type { Vec2 } from '@hestia/geom';

/** Retângulo da caixa no plano (mundo): os 4 cantos em sentido anti-horário, na ordem local (min,min), (max,min), (max,max), (min,max). */
export function retanguloNoMundo(pose: Pose, caixa: CaixaLocal): [Vec2, Vec2, Vec2, Vec2] {
  const cos = Math.cos(pose.rotation);
  const sen = Math.sin(pose.rotation);
  const ponto = (x: number, y: number): Vec2 => {
    const lx = pose.mirrored ? -x : x;
    return { x: pose.x + lx * cos - y * sen, y: pose.y + lx * sen + y * cos };
  };
  const [x0, y0] = caixa.min;
  const [x1, y1] = caixa.max;
  return [ponto(x0, y0), ponto(x1, y0), ponto(x1, y1), ponto(x0, y1)];
}

/** Penetração mínima (m) para contar como colisão: encostar ou menos de 1 mm de sobreposição não conta. */
const PENETRACAO_MINIMA = 0.001;

/** Os 4 cantos de `retanguloNoMundo`. */
type Cantos = readonly [Vec2, Vec2, Vec2, Vec2];

/** Normal unitária perpendicular a `dx, dy` (o lado sólido de uma face é a normal girada −90°). `null` se degenerado. */
function normalUnitaria(dx: number, dy: number): Vec2 | null {
  const n = Math.hypot(dx, dy);
  if (n === 0) return null;
  return { x: -dy / n, y: dx / n };
}

/** Os dois eixos de separação (normais às direções das arestas) de um retângulo orientado; ignora arestas nulas. */
function eixosDoRetangulo(cantos: Cantos): Vec2[] {
  const eixos: Vec2[] = [];
  for (const e of [normalUnitaria(cantos[1].x - cantos[0].x, cantos[1].y - cantos[0].y), normalUnitaria(cantos[3].x - cantos[0].x, cantos[3].y - cantos[0].y)]) {
    if (e) eixos.push(e);
  }
  return eixos;
}

/** Extremos da projeção dos cantos sobre o eixo unitário `e`. */
function projecao(cantos: Cantos, e: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of cantos) {
    const s = p.x * e.x + p.y * e.y;
    if (s < min) min = s;
    if (s > max) max = s;
  }
  return [min, max];
}

/** Sobreposição em planta (SAT): verdadeiro se os dois retângulos se sobrepõem mais que `PENETRACAO_MINIMA` em TODOS os eixos candidatos. */
function sobrepoeNaPlanta(a: Cantos, b: Cantos): boolean {
  for (const e of [...eixosDoRetangulo(a), ...eixosDoRetangulo(b)]) {
    const [minA, maxA] = projecao(a, e);
    const [minB, maxB] = projecao(b, e);
    if (Math.min(maxA, maxB) - Math.max(minA, minB) <= PENETRACAO_MINIMA) return false;
  }
  return true;
}

/** Faixa de altura do corpo no mundo: z da base + caixa local em z. */
function faixaDeAltura(c: Corpo): [number, number] {
  return [c.pose.z + c.caixa.min[2], c.pose.z + c.caixa.max[2]];
}

/** Sobreposição em altura maior que `PENETRACAO_MINIMA`. */
function sobrepoeNaAltura(a: Corpo, b: Corpo): boolean {
  const [minA, maxA] = faixaDeAltura(a);
  const [minB, maxB] = faixaDeAltura(b);
  return Math.min(maxA, maxB) - Math.max(minA, minB) > PENETRACAO_MINIMA;
}

/**
 * O móvel atravessa a face: algum canto está a mais de `PENETRACAO_MINIMA` no lado SÓLIDO (direita de a→b) e a projeção do canto
 * sobre a direção da face cai dentro do comprimento dela.
 */
function atravessaFace(cantos: Cantos, face: FaceDeParede): boolean {
  const dx = face.b.x - face.a.x;
  const dy = face.b.y - face.a.y;
  const n = Math.hypot(dx, dy);
  if (n === 0) return false;
  const ux = dx / n;
  const uy = dy / n;
  const nx = uy;
  const ny = -ux;
  for (const p of cantos) {
    const px = p.x - face.a.x;
    const py = p.y - face.a.y;
    const profundidade = px * nx + py * ny;
    const aoLongo = px * ux + py * uy;
    if (profundidade > PENETRACAO_MINIMA && aoLongo >= 0 && aoLongo <= n) return true;
  }
  return false;
}

/**
 * Colisões do móvel: com outros móveis (retângulos orientados que se sobrepõem em planta por mais de 1 mm de penetração E em altura
 * por mais de 1 mm; encostar NÃO conta; teste de eixos separadores) e com faces de parede (o retângulo tem algum canto mais de 1 mm
 * além da face, no lado SÓLIDO = direita de a→b, dentro do comprimento da face). Os índices e ids saem em ordem crescente/por id.
 * O móvel de mesmo id na lista `outros` é ignorado.
 */
export function colisoes(alvo: Corpo, outros: readonly Corpo[], faces: readonly FaceDeParede[] = []): Colisoes {
  const cantos = retanguloNoMundo(alvo.pose, alvo.caixa);
  const vistos = new Set<string>([alvo.id]);
  const moveis: string[] = [];
  for (const outro of outros) {
    if (vistos.has(outro.id)) continue;
    vistos.add(outro.id);
    if (sobrepoeNaPlanta(cantos, retanguloNoMundo(outro.pose, outro.caixa)) && sobrepoeNaAltura(alvo, outro)) {
      moveis.push(outro.id);
    }
  }
  moveis.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const paredes: number[] = [];
  faces.forEach((face, i) => {
    if (atravessaFace(cantos, face)) paredes.push(i);
  });
  return { moveis, paredes };
}
