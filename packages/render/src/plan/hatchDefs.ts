import type { HatchKind } from '@hestia/model';

/**
 * Hachuras por primitivas: cada padrão é uma lista de até `MAX_PRIMS` primitivas, desenhadas igual na planta (shader, canvas
 * e espelho em software) e na folha. Passos e trechos são múltiplos do passo base `p` da vista (`HATCH_SPACING` na tela com
 * o padrão antigo, 1,5 mm de papel em prancha). Os padrões antigos (diagonal, cross, dots, gesso e os cinco de EP-1) seguem
 * com a implementação própria; estes são os novos.
 *
 * - `line`: família de retas com o ângulo `ang` (graus), passo normal `pitch`; tracejada quando `on` e `off` existem
 *   (trecho pintado e vazio ao longo da reta), com `phase` de início (tudo em múltiplos de `p`, fase 0 na origem do mundo).
 * - `dots`: pontos (traços curtos de `p / 4`) em linhas horizontais de passo `pitch`, ao longo das quais o passo é o mesmo;
 *   as linhas ímpares ficam deslocadas meio passo.
 */
export type HatchPrim =
  | { t: 'line'; ang: number; pitch: number; on?: number; off?: number; phase?: number }
  | { t: 'dots'; pitch: number };

/** Máximo de primitivas por padrão (o tamanho do vetor de uniformes do shader). */
export const MAX_PRIMS = 4;

/** Primeiro código de shader dos padrões por primitivas; o do padrão `k` é `PRIM_CODE_BASE + índice na tabela`. */
export const PRIM_CODE_BASE = 10;

export const PRIM_HATCHES: Partial<Record<HatchKind, readonly HatchPrim[]>> = {
  // Bloco de concreto: quadriculado largo.
  cmu: [{ t: 'line', ang: 0, pitch: 3 }, { t: 'line', ang: 90, pitch: 3 }],
  // Tijolo aparente: fiadas horizontais e juntas verticais tracejadas.
  exposedBrick: [{ t: 'line', ang: 0, pitch: 1.5 }, { t: 'line', ang: 90, pitch: 3, on: 1.5, off: 1.5 }],
  // Concreto armado: diagonal esparsa, pontos e a diagonal oposta tracejada (a armadura).
  rcConcrete: [
    { t: 'line', ang: 45, pitch: 3 },
    { t: 'dots', pitch: 1.3 },
    { t: 'line', ang: 135, pitch: 6, on: 2, off: 1 },
  ],
  // Pedra: duas famílias tracejadas irregulares.
  stone: [
    { t: 'line', ang: 45, pitch: 2, on: 1, off: 0.5 },
    { t: 'line', ang: 135, pitch: 3, on: 0.75, off: 1.5, phase: 0.5 },
  ],
  // Brita: duas malhas de pontos de passos diferentes.
  gravel: [{ t: 'dots', pitch: 1 }, { t: 'dots', pitch: 1.7 }],
  // Areia: pontos densos.
  sand: [{ t: 'dots', pitch: 0.7 }],
  // EPS: linhas pontilhadas.
  eps: [{ t: 'line', ang: 0, pitch: 1.2, on: 0.3, off: 0.9 }],
  // Lã mineral: duas diagonais tracejadas em contrafase (zigue-zague).
  woolZigzag: [
    { t: 'line', ang: 45, pitch: 0.8, on: 0.8, off: 0.8 },
    { t: 'line', ang: 135, pitch: 0.8, on: 0.8, off: 0.8, phase: 0.8 },
  ],
  // Gesso acartonado: diagonal tracejada.
  gypsum: [{ t: 'line', ang: 45, pitch: 2, on: 3, off: 1 }],
  // Madeira em corte de topo: xadrez diagonal fechado.
  timberEnd: [{ t: 'line', ang: 45, pitch: 2.4 }, { t: 'line', ang: 135, pitch: 2.4 }],
  // Aço: diagonal densa.
  steel: [{ t: 'line', ang: 45, pitch: 0.5 }],
};

/** Padrões por primitivas, na ordem da tabela (o índice dá o código de shader). */
export const PRIM_KINDS = Object.keys(PRIM_HATCHES) as HatchKind[];

/** Código de shader de um padrão por primitivas; `undefined` se `kind` não é um deles. */
export function primCode(kind: HatchKind): number | undefined {
  const i = PRIM_KINDS.indexOf(kind);
  return i < 0 ? undefined : PRIM_CODE_BASE + i;
}

/** Primitivas de um padrão pelo código de shader; vazio se o código não é de um padrão por primitivas. */
export function primsOfCode(code: number): readonly HatchPrim[] {
  const kind = PRIM_KINDS[code - PRIM_CODE_BASE];
  return kind ? PRIM_HATCHES[kind] ?? [] : [];
}
