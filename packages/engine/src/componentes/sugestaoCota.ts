import type { RegrasConexao } from './posicaoConexao.ts';

/*
 * Sugestão de mudança de cota (fase 3, ficha B5). Função PURA: dado o tipo de tubulação (só as peças `curva45` e `curva90` importam)
 * e a geometria do trecho, diz a MENOR mudança de cota (mm) que faz o trecho sair bem feito. Só geometria: nenhum valor de norma.
 *
 * - 45°: o trecho fica com Δz igual à distância em planta. Vale subir ou descer; a menor mudança é |distância − |desnível||.
 * - 90°: o desnível vira prumada (joelho de 90° + trecho vertical). Um trecho único com distância em planta não fica vertical só
 *   mudando a cota, então o 90° é a prumada: `minimoVertical` (mm) é o desvio vertical que a prumada precisa, e a mudança é o que falta.
 *
 * Devolve `null` quando o tipo não tem a peça do ângulo, quando não há regras ou quando a distância em planta é ~0 (trecho vertical).
 */

/** Ângulo que a sugestão pode alcançar. */
export type AnguloSugerido = 45 | 90;

/** Distância em planta (mm) abaixo da qual o trecho é vertical e não há sugestão de 45°. */
const PLANTA_NULA = 1e-6;

/**
 * Menor mudança de cota (mm, em módulo) para o trecho ficar em `angulo`. `distanciaPlanta` e `desnivel` em mm, `desnivel` com sinal
 * (ponta final mais alta = positivo). `minimoVertical` (mm) só vale para 90°.
 */
export function sugerirMudancaDeCota(regras: Pick<RegrasConexao, 'curva45' | 'curva90'> | null, angulo: AnguloSugerido, distanciaPlanta: number, desnivel: number, minimoVertical = 0): number | null {
  if (!regras) return null;
  if (!(distanciaPlanta > PLANTA_NULA)) return null;
  const peca = angulo === 45 ? regras.curva45 : regras.curva90;
  if (peca === '') return null;
  const atual = Math.abs(desnivel);
  if (angulo === 45) return Math.abs(distanciaPlanta - atual);
  return Math.max(0, minimoVertical - atual);
}
