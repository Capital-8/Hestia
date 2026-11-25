import type { Vec2 } from '@hestia/geom';
import { mix } from './color.ts';

/**
 * Azimute padrão do sol do 3D (graus, 0 = leste, anti-horário): a mesma posição de `View3DSettings` antes da vista 3D
 * configurável. A luz do tom da água sai da vista 3D do projeto (`view3dOf`), então a planta e o 3D concordam.
 */
export const DEFAULT_SUN_AZIMUTH = 324.46;

/** Direção horizontal (unitária, no plano da planta) de onde vem a luz para o azimute do sol. */
export function direcaoDoSol(azimuth: number): Vec2 {
  const a = (azimuth * Math.PI) / 180;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/** Variação de luminosidade de uma água a 45° com a queda voltada para o sol (o outro extremo é o simétrico). */
export const TONE_45 = 0.22;

/**
 * Tom de uma água na planta: a cor base do material (já misturada com o papel) clareia ou escurece conforme a direção
 * da queda e a inclinação. A normal horizontal da água (a componente horizontal da normal do plano) aponta para a
 * descida e cresce com a inclinação; o fator `0,5 + 0,5 · dot(queda, sol)` dá 0,5 na água plana. A luz é a do sol do 3D
 * (`direcaoDoSol(azimuth)`), e não uma constante: o lado claro da planta coincide com o do 3D. O contraste é calibrado
 * para ±22 % de luminosidade numa água de 45° com a queda na direção do sol; numa água de 45° voltada para norte, sul,
 * leste ou oeste a variação fica em cerca de ±15,6 % (o `dot` cai por √2/2).
 */
export function tomDaAgua(color: string, up: Vec2, percent: number, azimuth = DEFAULT_SUN_AZIMUTH): string {
  const n = Math.hypot(up.x, up.y);
  if (n < 1e-12) return color;
  // tanθ = percent/100; a normal horizontal tem módulo sinθ = tanθ/√(1+tan²θ).
  const tan = Math.abs(percent) / 100;
  const sin = tan / Math.sqrt(1 + tan * tan);
  const down = { x: -up.x / n, y: -up.y / n };
  const luz = direcaoDoSol(azimuth);
  const factor = 0.5 + 0.5 * sin * (down.x * luz.x + down.y * luz.y);
  // Calibra (fator − 0,5) para ±TONE_45 quando sinθ = √2/2 (45°).
  const tone = (factor - 0.5) * (TONE_45 / (0.5 * Math.SQRT1_2));
  return tone >= 0 ? mix(color, '#ffffff', tone) : mix(color, '#000000', -tone);
}

/**
 * Cor das arestas internas (cumeeira, espigão e rincão): um pouco mais escura que o preenchimento das águas. No tema
 * escuro a mistura com preto continua legível porque a base já vem misturada com o fundo (`surfaceColor`).
 */
export const corDaAresta = (fill: string): string => mix(fill, '#000000', 0.38);

/**
 * Visual de prancha de CAD (linha oculta): as águas ficam em papel, sem o tom por orientação, e as arestas (cumeeira,
 * espigão, rincão) na tinta cheia: derivar a aresta de um preenchimento branco a deixaria num cinza lavado.
 */
export const emPrancha = (pt: { visual: string; prancha?: boolean } | undefined): boolean => pt?.visual === 'hiddenLine' && pt.prancha === true;
