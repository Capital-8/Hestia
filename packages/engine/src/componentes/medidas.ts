import { areaContorno } from './contorno.ts';
import type { PecaResolvida } from './pecas.ts';

/*
 * Medidas das peças resolvidas (caixa, áreas, volumes, resumo). FICHA E2-medidas: implementar as funções abaixo. Testes em
 * `medidas.test.ts`. Puras e numéricas (metros, m2, m3). Usa `areaContorno` de `./contorno.ts` (outra ficha o implementa em
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
  const incluirVazios = opcoes.incluirVazios ?? false;
  let caixa: Caixa | null = null;
  for (const p of pecas) {
    if (p.vazio && !incluirVazios) continue;
    if (caixa === null) {
      caixa = {
        min: [p.origem[0], p.origem[1], p.origem[2]],
        max: [p.origem[0] + p.extensao[0], p.origem[1] + p.extensao[1], p.origem[2] + p.extensao[2]],
      };
      continue;
    }
    for (let i = 0; i < 3; i++) {
      const inicio = p.origem[i]!;
      const fim = inicio + p.extensao[i]!;
      if (inicio < caixa.min[i]!) caixa.min[i] = inicio;
      if (fim > caixa.max[i]!) caixa.max[i] = fim;
    }
  }
  return caixa;
}

/** Área da face da peça (m2): `|areaContorno|` se há contorno, senão `tamanho[0] * tamanho[1]`. */
export function areaFace(p: PecaResolvida): number {
  if (p.contorno !== null) return Math.abs(areaContorno(p.contorno));
  return p.tamanho[0] * p.tamanho[1];
}

/** Volume da peça (m3): `areaFace * espessura`. */
export function volumePeca(p: PecaResolvida): number {
  return areaFace(p) * p.espessura;
}

export interface ResumoPecas {
  /** Peças não vazias. */
  quantidade: number;
  /** Peças vazias (não contam em mais nada). */
  vazios: number;
  /** Soma dos volumes das peças não vazias (m3). */
  volume: number;
  /** Área de face somada por espessura (m2). Chave = espessura em mm como texto sem zeros à toa: 0.018 → "18", 0.0065 → "6.5". */
  areaPorEspessura: Record<string, number>;
  /** Contagem de peças não vazias por papel. */
  porPapel: Record<string, number>;
}

/** Chave da espessura em mm como texto limpo (sem zeros à toa). */
function chaveEspessura(espessura: number): string {
  return String(Math.round(espessura * 1e6) / 1e3);
}

export function resumirPecas(pecas: readonly PecaResolvida[]): ResumoPecas {
  const resumo: ResumoPecas = { quantidade: 0, vazios: 0, volume: 0, areaPorEspessura: {}, porPapel: {} };
  for (const p of pecas) {
    if (p.vazio) {
      resumo.vazios++;
      continue;
    }
    resumo.quantidade++;
    resumo.volume += volumePeca(p);
    const chave = chaveEspessura(p.espessura);
    resumo.areaPorEspessura[chave] = (resumo.areaPorEspessura[chave] ?? 0) + areaFace(p);
    resumo.porPapel[p.papel] = (resumo.porPapel[p.papel] ?? 0) + 1;
  }
  return resumo;
}
