import type { Vec2 } from '@hestia/geom';
import type { PosicaoNaFila, PreenchimentoDeVao } from './encaixeTipos.ts';

/**
 * Fecha um vão de `vao` (m) com módulos das larguras disponíveis (m, podem repetir) mais, se precisar, um painel de enchimento entre
 * `painelMin` e `painelMax` (m, padrões 0,02 e 0,15). Objetivo, nesta ordem: (1) cobrir o vão (sobra 0), (2) menos painel, (3) menos módulos,
 * (4) larguras maiores primeiro. Resultado determinístico (mesma entrada, mesma saída). Sem solução exata: usa a combinação que deixa
 * a MENOR sobra não negativa, devolvendo essa sobra. `vao` ≤ 0 ou sem larguras: modulos [], painel 0, sobra = max(vao, 0).
 */
export function preencherVao(
  _vao: number,
  _larguras: readonly number[],
  _opcoes: { painelMin?: number; painelMax?: number } = {},
): PreenchimentoDeVao {
  throw new Error('não implementado');
}

/**
 * Redistribui a diferença entre `total` (m) e a soma das larguras entre os módulos que podem crescer ou encolher: cada um tem
 * `limites[i] = [min, max]` (m). Divide igualmente a diferença entre os módulos flexíveis (min < max) respeitando os limites e
 * repartindo o excedente entre os demais, até esgotar. Devolve as novas larguras (mesma ordem). Se não couber nos limites, devolve
 * as larguras no limite mais próximo e a soma continua diferente de `total` (o chamador confere). Arredonda a 1 µm.
 */
export function ajustarLarguras(_larguras: readonly number[], _limites: ReadonlyArray<readonly [number, number]>, _total: number): number[] {
  throw new Error('não implementado');
}

/** Posições (e poses) dos módulos de uma fila da linha `a`→`b`, na ordem recebida, colados um ao outro a partir de `a`. Ver `PosicaoNaFila`. */
export function posicoesDaFila(_a: Vec2, _b: Vec2, _larguras: readonly number[], _profundidade: number, _z = 0): PosicaoNaFila[] {
  throw new Error('não implementado');
}
