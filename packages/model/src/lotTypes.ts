import type { Vec2 } from '@hestia/geom';
import type { Id } from './types.ts';

export type PapelLadoLote = 'frente' | 'lateral' | 'fundo';

export interface LadoLote {
  papel: PapelLadoLote;
  /** Recuo obrigatório deste lado (m), 0 ou mais. */
  recuo: number;
}

export interface LimitesLote {
  /** Frações (0,5 = 50 %). Ausente = sem limite informado. Sempre digitados pelo usuário (a conferir na lei local). */
  taxaOcupacaoMax?: number;
  coefAproveitamentoMax?: number;
  permeabilidadeMin?: number;
  /** Altura máxima (m) acima da cota do nível do lote. Usada pelo "Envelope legal". */
  gabaritoMax?: number;
}

export interface Lot {
  id: Id;
  kind: 'lot';
  levelId: Id;
  name: string;
  /** Polígono simples, anti-horário, 3 a 256 pontos. */
  contorno: Vec2[];
  /** Mesmo tamanho de `contorno`. O lado i vai de contorno[i] a contorno[i+1] (o último fecha no primeiro). */
  lados: LadoLote[];
  limites: LimitesLote;
  /** Desenha a área edificável (lote menos recuos) tracejada. Padrão true. */
  mostrarEdificavel: boolean;
  color?: string;
  order: number;
}

export const LOTE_LIMITES = { pontos: 256, recuoMax: 1000 } as const;
