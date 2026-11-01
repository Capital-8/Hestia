import { cross, dist, dot, norm, sub, type Vec2 } from '@hestia/geom';
import { isWall, type Id, type Project, type Wall } from './types.ts';

/** Abaixo disso a parede não tem direção definida. */
export const MIN_WALL_LENGTH = 0.001;
/** Trecho comum mínimo para duas paredes colineares serem consideradas sobrepostas (item C14). */
export const WALL_OVERLAP_MIN = 0.05;
/** Ângulo máximo entre eixos para serem "praticamente colineares" (1°). */
export const COLLINEAR_ANGLE = (1 * Math.PI) / 180;
/** Distância lateral máxima entre eixos para serem "praticamente colineares" (1 cm). */
export const COLLINEAR_OFFSET = 0.01;

export interface WallOverlap {
  /** Trecho em comum dos eixos, em metros. */
  length: number;
  /** Distância entre os eixos no meio do trecho comum, em metros. */
  lateral: number;
}

/** O que o critério olha: só o eixo a→b (a curvatura e o resto da parede não entram). */
export type WallAxis = Pick<Wall, 'a' | 'b'>;

/**
 * Sobreposição de eixos de duas paredes: colineares (ângulo < 1°), eixos a menos de 1 cm no meio do
 * trecho e trecho comum maior que 5 cm. É o mesmo critério do item C14 da validação, usado também
 * para impedir que uma parede seja criada em cima de outra (decisão 0044).
 *
 * A conta usa só os eixos (a→b), como o C14: a curvatura (`sag`) não entra.
 * Devolve null quando não há sobreposição; sobreposição parcial conta pelo trecho comum.
 */
export function wallOverlap(a: WallAxis, b: WallAxis): WallOverlap | null {
  const la = dist(a.a, a.b);
  const lb = dist(b.a, b.b);
  if (la < MIN_WALL_LENGTH || lb < MIN_WALL_LENGTH) return null;
  const uA = norm(sub(a.b, a.a));
  const uB = norm(sub(b.b, b.a));
  // Ângulo entre as retas (sentido ignorado: paredes em sentidos opostos também se sobrepõem).
  const angle = Math.atan2(Math.abs(cross(uA, uB)), Math.abs(dot(uA, uB)));
  if (angle >= COLLINEAR_ANGLE) return null;
  const tB1 = dot(sub(b.a, a.a), uA);
  const tB2 = dot(sub(b.b, a.a), uA);
  const lo = Math.max(0, Math.min(tB1, tB2));
  const hi = Math.min(la, Math.max(tB1, tB2));
  const length = hi - lo;
  if (length <= WALL_OVERLAP_MIN) return null;
  const mid: Vec2 = { x: a.a.x + uA.x * ((lo + hi) / 2), y: a.a.y + uA.y * ((lo + hi) / 2) };
  const lateral = Math.abs(cross(uB, sub(mid, b.a)));
  return lateral < COLLINEAR_OFFSET ? { length, lateral } : null;
}

/** Parede existente que conflita com `w`, com o trecho em comum. */
export interface WallConflict {
  wall: Wall;
  overlap: WallOverlap;
}

/** Parede a conferir: eixo, id e nível bastam (a candidata pode ainda não estar no projeto). */
export type WallCandidate = Pick<Wall, 'id' | 'levelId' | 'a' | 'b'>;

/**
 * Primeira parede do projeto que fica por baixo de `w` (mesmo nível, eixos sobrepostos).
 * `ignore` pula ids que não devem contar (ex.: o próprio conjunto sendo transformado).
 */
export function wallConflict(p: Project, w: WallCandidate, ignore?: ReadonlySet<Id>): WallConflict | null {
  for (const e of Object.values(p.elements)) {
    if (!isWall(e) || e.id === w.id || e.levelId !== w.levelId) continue;
    if (ignore?.has(e.id)) continue;
    const overlap = wallOverlap(w, e);
    if (overlap) return { wall: e, overlap };
  }
  return null;
}
