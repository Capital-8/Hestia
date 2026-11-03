import type { PecaResolvida } from './pecas.ts';

/*
 * Medidas das peças resolvidas (caixa, áreas, volumes, resumo). FICHA E2-medidas: implementar as funções abaixo. Testes em
 * `medidas.test.ts`. Puras e numéricas (metros, m², m³). Usa `areaContorno` de `./contorno.ts` (outra ficha o implementa em
 * paralelo; importe e use pelo contrato).
 */

export interface Caixa {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Caixa que envolve as peças (`origem` até `origem + extensao`). Por padrão IGNORA peças vazias; com
 * `incluirVazios: true` elas entram. Sem nenhuma peça considerada: `null`.
 */
export function caixaEnvolvente(pecas: readonly PecaResolvida[], opcoes: { incluirVazios?: boolean } = {}): Caixa | null {
  void pecas;
  void opcoes;
  throw new Error('não implementado: ficha E2-medidas');
}

/** Área da face da peça (m²): `|areaContorno|` se há contorno, senão `tamanho[0] * tamanho[1]`. */
export function areaFace(p: PecaResolvida): number {
  void p;
  throw new Error('não implementado: ficha E2-medidas');
}

/** Volume da peça (m³): `areaFace * espessura`. */
export function volumePeca(p: PecaResolvida): number {
  void p;
  throw new Error('não implementado: ficha E2-medidas');
}

export interface ResumoPecas {
  /** Peças não vazias. */
  quantidade: number;
  /** Peças vazias (não contam em mais nada). */
  vazios: number;
  /** Soma dos volumes das peças não vazias (m³). */
  volume: number;
  /** Área de face somada por espessura (m²). Chave = espessura em mm como texto sem zeros à toa: 0.018 → "18", 0.0065 → "6.5". */
  areaPorEspessura: Record<string, number>;
  /** Contagem de peças não vazias por papel. */
  porPapel: Record<string, number>;
}

export function resumirPecas(pecas: readonly PecaResolvida[]): ResumoPecas {
  void pecas;
  throw new Error('não implementado: ficha E2-medidas');
}
