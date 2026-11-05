import { cameraBasis } from '@hestia/render';
import { t, type Dict, type Lang } from '../editor/i18n.ts';
import { CUBE_HALF_PX } from './viewcube.ts';

/**
 * Anel de bússola do ViewCube, sem DOM: geometria projetada no plano do chão (a mesma base de câmera do cubo, então
 * o anel gira junto com a vista). Convenção dos eixos: norte é +Y e leste é +X, como nas elevações do app. Clicar numa
 * letra leva a câmera ao azimute dela, que é o ângulo da letra no chão.
 */

export type CompassKey = 'N' | 'L' | 'S' | 'O';

export interface CompassLetter {
  key: CompassKey;
  /** Direção no idioma ativo (usada no título da zona). */
  name: string;
  /** Ângulo da letra no chão (= azimute da vista dela). */
  angle: number;
}

/** `key` é o identificador estável (L = leste, O = oeste); a letra desenhada vem de `compassLetter`. */
export const COMPASS: readonly CompassLetter[] = [
  { key: 'N', name: 'norte', angle: Math.PI / 2 },
  { key: 'L', name: 'leste', angle: 0 },
  { key: 'S', name: 'sul', angle: -Math.PI / 2 },
  { key: 'O', name: 'oeste', angle: Math.PI },
];

const COMPASS_NAME_KEY: Record<CompassKey, keyof Dict> = {
  N: 'cvn_vc_compass_north',
  L: 'cvn_vc_compass_east',
  S: 'cvn_vc_compass_south',
  O: 'cvn_vc_compass_west',
};

const COMPASS_LETTER_KEY: Record<CompassKey, keyof Dict> = {
  N: 'cvn_vc_compass_letter_north',
  L: 'cvn_vc_compass_letter_east',
  S: 'cvn_vc_compass_letter_south',
  O: 'cvn_vc_compass_letter_west',
};

/** Nome da direção no idioma pedido ("norte" / "north"). */
export function compassName(key: CompassKey, lang: Lang = 'pt'): string {
  return t(lang, COMPASS_NAME_KEY[key]);
}

/** Letra desenhada no anel no idioma pedido (PT: N/L/S/O; EN: N/E/S/W). */
export function compassLetter(key: CompassKey, lang: Lang = 'pt'): string {
  return t(lang, COMPASS_LETTER_KEY[key]);
}

/** Bússola com os nomes traduzidos (mesmos ângulos e identificadores de `COMPASS`). */
export function compassFor(lang: Lang = 'pt'): readonly CompassLetter[] {
  return COMPASS.map((c) => ({ ...c, name: compassName(c.key, lang) }));
}

/**
 * Geometria do anel em meios-lados do cubo (cubo de lado 2, centrado na origem). O anel fica no plano da face de baixo
 * (z = −1): o cubo "assenta" sobre ele. `inner` e `outer` delimitam a faixa; `letter` é o raio das letras.
 */
export const RING = { inner: 1.6, outer: 1.86, letter: 1.73, floor: -1 } as const;
/** Desvio angular (rad) até o qual um ponto da faixa conta como a letra. */
const LETTER_TOL = 0.3;
/** Pontos por arco ao desenhar a faixa e a sombra. */
const STEPS = 96;
/** Raio da sombra no chão (sob o cubo). */
const SHADOW_RAD = 1.2;

type V3 = [number, number, number];

interface Basis {
  d: V3;
  r: V3;
  u: V3;
}

function basisOf(azimuth: number, elevation: number): Basis {
  const { toCamera, right, up } = cameraBasis(azimuth, elevation);
  return {
    d: [toCamera.x, toCamera.y, toCamera.z],
    r: [right.x, right.y, right.z],
    u: [up.x, up.y, up.z],
  };
}

const dot = (a: V3, p: V3): number => a[0] * p[0] + a[1] * p[1] + a[2] * p[2];
const wrap = (t: number): number => Math.atan2(Math.sin(t), Math.cos(t));

/** Ponto do chão (x, y, floor) em px a partir do centro do palco (y para baixo). */
function pxOf(b: Basis, x: number, y: number, half: number): [number, number] {
  const p: V3 = [x, y, RING.floor];
  return [half * dot(b.r, p), -half * dot(b.u, p)];
}

/** Ponto do chão em px, a partir do centro do palco (y para baixo). Útil para testes e depuração. */
export function floorToPx(azimuth: number, elevation: number, x: number, y: number, half = CUBE_HALF_PX): [number, number] {
  return pxOf(basisOf(azimuth, elevation), x, y, half);
}

/**
 * Ponto da faixa do anel sob um ponto da tela (`px`, `py` a partir do centro do palco, y para baixo), ou null fora dela.
 * Resolve no plano do chão a posição que a tela mostra (a projeção é afim nesse plano) e mede o raio e o ângulo ali.
 * `letter` vem preenchido quando o ângulo fica perto de uma letra da bússola.
 */
export function ringHit(
  azimuth: number,
  elevation: number,
  px: number,
  py: number,
  half = CUBE_HALF_PX,
): { angle: number; letter: CompassLetter | null } | null {
  const { r, u } = basisOf(azimuth, elevation);
  // Pela projeção: px = half·(p·r) e −py = half·(p·u), com p = (x, y, floor). Termos conhecidos vão para o outro lado.
  const ra = px / half - RING.floor * r[2];
  const rb = -py / half - RING.floor * u[2];
  const det = r[0] * u[1] - r[1] * u[0];
  if (Math.abs(det) < 1e-6) return null; // chão de perfil: o anel vira uma linha e não tem área clicável
  const x = (ra * u[1] - r[1] * rb) / det;
  const y = (r[0] * rb - u[0] * ra) / det;
  const rad = Math.hypot(x, y);
  if (rad < RING.inner || rad > RING.outer) return null;
  const angle = Math.atan2(y, x);
  const letter = COMPASS.find((c) => Math.abs(wrap(angle - c.angle)) <= LETTER_TOL) ?? null;
  return { angle, letter };
}

export interface RingLetter {
  key: CompassKey;
  /** Se a letra está do lado da câmera (desenhada sobre o cubo) ou atrás dele (desenhada sob o cubo). */
  front: boolean;
  /** Atributo `transform` do SVG: a letra deitada no chão, com o topo apontando para o norte (+Y). */
  transform: string;
}

export interface RingGeometry {
  /** Faixa inteira (camada de trás, sob o cubo), em `fill-rule: evenodd`. */
  back: string;
  /** Parte da faixa do lado da câmera (camada da frente, sobre o cubo). */
  front: string;
  /** Sombra elíptica no chão, sob o cubo. */
  shadow: string;
  letters: RingLetter[];
}

// units-ok: formato de máquina (coordenada SVG)
const num = (n: number): string => (Math.abs(n) < 1e-9 ? '0' : n.toFixed(2));

function pathOf(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`).join('') + 'Z';
}

/**
 * Geometria do anel para a vista dada, em px do palco (centro na origem, y para baixo). A parte da frente é a que
 * fica do lado da câmera: pontos do chão com d·p > 0. Em cada raio, o arco da frente é [az − α, az + α], com
 * cos α = d₂ / (raio · cos(elevação)).
 */
export function ringGeometry(azimuth: number, elevation: number, half = CUBE_HALF_PX): RingGeometry {
  const b = basisOf(azimuth, elevation);
  const arc = (rad: number, t0: number, t1: number): [number, number][] =>
    Array.from({ length: STEPS + 1 }, (_, k) => {
      const t = t0 + ((t1 - t0) * k) / STEPS;
      return pxOf(b, rad * Math.cos(t), rad * Math.sin(t), half);
    });
  const TAU = 2 * Math.PI;
  // Meio-arco da frente no raio dado; clampado: 0 quando o raio nunca fica do lado da câmera, π quando sempre fica.
  const halfFront = (rad: number): number => Math.acos(Math.max(-1, Math.min(1, b.d[2] / (rad * Math.hypot(b.d[0], b.d[1])))));
  const ao = halfFront(RING.outer);
  const ai = halfFront(RING.inner);
  const back = pathOf(arc(RING.outer, 0, TAU)) + pathOf(arc(RING.inner, 0, TAU));
  // Sem parte da frente (vista de cima), o polígono teria área zero e o traço da borda deixaria uma linha: não gera nada.
  const front = ao < 1e-6 && ai < 1e-6 ? '' : pathOf([...arc(RING.outer, azimuth - ao, azimuth + ao), ...arc(RING.inner, azimuth + ai, azimuth - ai)]);
  const shadow = pathOf(arc(SHADOW_RAD, 0, TAU));
  const letters: RingLetter[] = COMPASS.map((c) => {
    const cx = RING.letter * Math.cos(c.angle);
    const cy = RING.letter * Math.sin(c.angle);
    // Glifo em px: (gx, gy) → chão (cx + gx/half, cy − gy/half). Com a escala 1/half, a matriz só tem os eixos projetados.
    const [e, f] = pxOf(b, cx, cy, half);
    const m = [b.r[0], -b.u[0], -b.r[1], b.u[1], e, f].map(num).join(' ');
    return { key: c.key, front: dot(b.d, [cx, cy, RING.floor]) > 0, transform: `matrix(${m})` };
  });
  return { back, front, shadow, letters };
}
