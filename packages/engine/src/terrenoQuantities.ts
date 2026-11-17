import type { Id } from '@hestia/model';

/**
 * Quantidades do terreno (A.4 regra 12; consultas 165 e 166). O Rust calcula tudo; aqui só se decodifica e se soma para os totais da tabela
 * "Terreno: corte e aterro". Áreas em metros quadrados, volumes em metros cúbicos, cotas em metros (absolutas no projeto).
 */
export interface QuantidadesTerreno {
  terrenoId: Id;
  /** Área em planta (da superfície proposta). */
  areaPlanta: number;
  areaSuperficieExistente: number;
  areaSuperficieProposta: number;
  zMin: number;
  zMax: number;
  volumeCorte: number;
  volumeAterro: number;
  nTriangulos: number;
}

export interface QuantidadesRegiaoTN {
  regiaoId: Id;
  terrenoId: Id;
  areaPlanta: number;
  areaSuperficie: number;
  volumeCorte: number;
  volumeAterro: number;
}

/** `linhas` `[terreno_num]` e `valores` de 8 colunas de `quant_terreno`. Formato inesperado lança (não há valor de reserva). */
export function decodificarQuantidadesTN(linhas: ArrayLike<number>, valores: ArrayLike<number>, terrenoIdDe: (n: number) => Id | undefined): QuantidadesTerreno[] {
  if (valores.length !== linhas.length * 8) throw new Error('saída de quant_terreno do Rust com formato inesperado');
  const out: QuantidadesTerreno[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const terrenoId = terrenoIdDe(linhas[i]!);
    if (terrenoId === undefined) continue;
    const v = (k: number): number => valores[8 * i + k]!;
    out.push({ terrenoId, areaPlanta: v(0), areaSuperficieExistente: v(1), areaSuperficieProposta: v(2), zMin: v(3), zMax: v(4), volumeCorte: v(5), volumeAterro: v(6), nTriangulos: v(7) });
  }
  return out;
}

/** `linhas` `[regiao_num, terreno_num]` e `valores` de 4 colunas de `quant_terreno_regioes`. */
export function decodificarQuantidadesRegioesTN(
  linhas: ArrayLike<number>,
  valores: ArrayLike<number>,
  terrenoIdDe: (n: number) => Id | undefined,
  regiaoIdDe: (n: number) => Id | undefined,
): QuantidadesRegiaoTN[] {
  if (linhas.length % 2 !== 0 || valores.length !== (linhas.length / 2) * 4) throw new Error('saída de quant_terreno_regioes do Rust com formato inesperado');
  const out: QuantidadesRegiaoTN[] = [];
  for (let i = 0; i < linhas.length / 2; i++) {
    const regiaoId = regiaoIdDe(linhas[2 * i]!);
    const terrenoId = terrenoIdDe(linhas[2 * i + 1]!);
    if (regiaoId === undefined || terrenoId === undefined) continue;
    out.push({ regiaoId, terrenoId, areaPlanta: valores[4 * i]!, areaSuperficie: valores[4 * i + 1]!, volumeCorte: valores[4 * i + 2]!, volumeAterro: valores[4 * i + 3]! });
  }
  return out;
}

export interface TotaisTerreno {
  areaPlanta: number;
  volumeCorte: number;
  volumeAterro: number;
  /** Aterro menos corte: positivo falta terra (traz-se), negativo sobra (retira-se). */
  saldo: number;
}

/** Soma de `volumeCorte`, `volumeAterro` e `areaPlanta` (rodapé da tabela). O saldo é aterro menos corte. */
export function totaisTerreno(q: ReadonlyArray<Pick<QuantidadesTerreno, 'areaPlanta' | 'volumeCorte' | 'volumeAterro'>>): TotaisTerreno {
  const t = { areaPlanta: 0, volumeCorte: 0, volumeAterro: 0, saldo: 0 };
  for (const x of q) {
    t.areaPlanta += x.areaPlanta;
    t.volumeCorte += x.volumeCorte;
    t.volumeAterro += x.volumeAterro;
  }
  t.saldo = t.volumeAterro - t.volumeCorte;
  return t;
}
