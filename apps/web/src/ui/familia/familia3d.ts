import { caixaEnvolvente, type PecaResolvida } from '@hestia/engine';
import type { EixoCorte } from './familiaStore.ts';

/*
 * Apoio puro da vista 3D: o visualizador recebe índices da lista resolvida, mas o editor seleciona pelo id da peça
 * (a mesma peça repetida aparece várias vezes). Os limites do corte vêm da caixa envolvente, em metros.
 */

export type Vista3D = 'iso' | 'frente' | 'lateral' | 'planta';

export interface LimitesCorte {
  min: number;
  max: number;
}

export type LimitesPorEixo = Readonly<Record<EixoCorte, LimitesCorte | null>>;

/** Índice da PRIMEIRA peça com `id` na lista resolvida (o visualizador realça uma por vez); `null` quando não há. */
export function indiceDaPeca(pecas: readonly PecaResolvida[], id: string | null): number | null {
  if (id === null) return null;
  const indice = pecas.findIndex((p) => p.id === id);
  return indice >= 0 ? indice : null;
}

/** Limites de cada eixo da caixa envolvente das peças não vazias; eixos sem peças ficam `null`. */
export function limitesDaFamilia(pecas: readonly PecaResolvida[]): LimitesPorEixo {
  const caixa = caixaEnvolvente(pecas);
  if (caixa === null) return { x: null, y: null, z: null };
  return {
    x: { min: caixa.min[0], max: caixa.max[0] },
    y: { min: caixa.min[1], max: caixa.max[1] },
    z: { min: caixa.min[2], max: caixa.max[2] },
  };
}

/** Prende a posição do plano de corte ao intervalo da família; sem limites, devolve a posição (ou 0 se não finita). */
export function limitarPosicao(posicao: number, limites: LimitesCorte | null): number {
  if (limites === null) return Number.isFinite(posicao) ? posicao : 0;
  if (!Number.isFinite(posicao)) return limites.min;
  return Math.min(limites.max, Math.max(limites.min, posicao));
}
