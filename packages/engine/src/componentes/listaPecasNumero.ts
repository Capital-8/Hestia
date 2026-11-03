/*
 * Formatação numérica da lista de peças (ficha E6-lista). Medidas em milímetros com até 3 casas e área em m2 com 4 casas,
 * sempre com vírgula decimal: é assim que o marceneiro lê e que a planilha brasileira abre. Funções puras.
 */

/** Metros → milímetros arredondados a 3 casas (evita ruído de ponto flutuante nas chaves de agrupamento). */
export function paraMilimetros(metros: number): number {
  return Math.round(metros * 1e6) / 1e3;
}

interface PartesNumero {
  negativo: boolean;
  inteiro: number;
  fracao: string;
}

function partes(v: number, casas: number): PartesNumero {
  const escala = 10 ** casas;
  const n = Math.round(v * escala);
  const absoluto = Math.abs(n);
  return {
    negativo: n < 0,
    inteiro: Math.floor(absoluto / escala),
    fracao: String(absoluto % escala).padStart(casas, '0'),
  };
}

/** Número com até `casas` casas decimais, sem zeros à toa, decimal com vírgula ("764", "12,5"). */
export function numeroSemZeros(v: number, casas: number): string {
  const { negativo, inteiro, fracao } = partes(v, casas);
  const limpa = fracao.replace(/0+$/, '');
  return `${negativo ? '-' : ''}${inteiro}${limpa === '' ? '' : `,${limpa}`}`;
}

/** Número com exatamente `casas` casas decimais, decimal com vírgula ("0,3920"). */
export function numeroComCasas(v: number, casas: number): string {
  const { negativo, inteiro, fracao } = partes(v, casas);
  return `${negativo ? '-' : ''}${inteiro},${fracao}`;
}
