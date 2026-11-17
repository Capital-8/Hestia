/**
 * Leitor de CSV de pontos de levantamento (x y z ou n e z). Detecta o separador (`;`, `,`, tabulação ou espaço), a vírgula
 * decimal e o cabeçalho; linhas inválidas são contadas e puladas. Só devolve pontos (FONTES do terreno), em metros.
 */

export type SeparadorCsv = ';' | ',' | '\t' | ' ';

/** Ordem das três primeiras colunas: `xyz` = leste, norte, cota; `nez` = norte, leste, cota. */
export type OrdemColunasCsv = 'xyz' | 'nez';

/** Separadores candidatos, na ordem de preferência em caso de empate. */
export const SEPARADORES_CSV: readonly SeparadorCsv[] = ['\t', ';', ' ', ','];

export interface OpcoesCsv {
  /** Ausente = detectado. */
  separador?: SeparadorCsv;
  /** Ausente = detectada pelo cabeçalho (`n`/`norte` na 1ª coluna = `nez`); sem cabeçalho, `xyz`. */
  ordem?: OrdemColunasCsv;
}

export interface ResultadoCsv {
  separador: SeparadorCsv;
  ordem: OrdemColunasCsv;
  /** A primeira linha é cabeçalho (não numérica) e foi descartada. */
  cabecalho: boolean;
  /** Algum número usa vírgula como decimal. */
  virgulaDecimal: boolean;
  /** Pontos em ordem de arquivo: x0, y0, z0, x1, y1, z1... (x = leste, y = norte), em metros. */
  pontos: number[];
  /** Linhas com conteúdo (sem o cabeçalho). */
  linhas: number;
  /** Linhas com conteúdo que não viraram ponto. */
  invalidas: number;
  /** Faixa de cota dos pontos lidos (null sem ponto). */
  zMin: number | null;
  zMax: number | null;
}

const NUMERO = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

/** Divide a linha no separador (espaço = qualquer sequência de espaços/tabulações). */
function dividir(linha: string, sep: SeparadorCsv): string[] {
  const l = linha.trim();
  return sep === ' ' ? l.split(/\s+/) : l.split(sep).map((c) => c.trim());
}

/** Número do campo (ponto ou vírgula decimal; os dois juntos são inválidos); null se não for número. */
function lerNumero(campo: string, sep: SeparadorCsv): { valor: number; virgula: boolean } | null {
  const c = campo.replace(/^"|"$/g, '');
  if (!NUMERO.test(c)) return null;
  const virgula = c.includes(',');
  if (virgula && sep === ',') return null;
  const valor = Number(virgula ? c.replace(',', '.') : c);
  return Number.isFinite(valor) ? { valor, virgula } : null;
}

/** Os três primeiros campos são numéricos? */
function tresNumeros(campos: string[], sep: SeparadorCsv): { n: [number, number, number]; virgula: boolean } | null {
  if (campos.length < 3) return null;
  const a = lerNumero(campos[0]!, sep);
  const b = lerNumero(campos[1]!, sep);
  const c = lerNumero(campos[2]!, sep);
  if (!a || !b || !c) return null;
  return { n: [a.valor, b.valor, c.valor], virgula: a.virgula || b.virgula || c.virgula };
}

/** Separador com mais linhas válidas na amostra (empate: ordem de `SEPARADORES_CSV`). */
export function detectarSeparadorCsv(linhas: readonly string[]): SeparadorCsv {
  const amostra = linhas.slice(0, 50);
  let melhor: SeparadorCsv = ';';
  let melhorPontos = 0;
  for (const sep of SEPARADORES_CSV) {
    const pontos = amostra.filter((l) => tresNumeros(dividir(l, sep), sep) !== null).length;
    if (pontos > melhorPontos) {
      melhor = sep;
      melhorPontos = pontos;
    }
  }
  return melhor;
}

/** `n`/`norte`/`north`/`northing` na primeira coluna do cabeçalho indica a ordem `nez`. */
function ordemDoCabecalho(campos: string[]): OrdemColunasCsv {
  return /^(n|norte|north|northing)$/i.test((campos[0] ?? '').replace(/^"|"$/g, '')) ? 'nez' : 'xyz';
}

/** Lê o texto do CSV. Linhas vazias são ignoradas; a primeira linha não numérica (e só ela) é o cabeçalho. */
export function lerCsvPontos(texto: string, opcoes: OpcoesCsv = {}): ResultadoCsv {
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  const separador = opcoes.separador ?? detectarSeparadorCsv(linhas);
  let cabecalho = false;
  let ordem: OrdemColunasCsv | undefined = opcoes.ordem;
  if (linhas.length > 0) {
    const primeira = dividir(linhas[0]!, separador);
    if (tresNumeros(primeira, separador) === null) {
      // Cabeçalho: só se a linha tem 3 ou mais campos (senão é lixo de uma linha só e vira inválida).
      if (primeira.length >= 3) {
        cabecalho = true;
        ordem ??= ordemDoCabecalho(primeira);
      }
    }
  }
  ordem ??= 'xyz';
  const dados = cabecalho ? linhas.slice(1) : linhas;
  const pontos: number[] = [];
  let invalidas = 0;
  let virgulaDecimal = false;
  let zMin: number | null = null;
  let zMax: number | null = null;
  for (const linha of dados) {
    const r = tresNumeros(dividir(linha, separador), separador);
    if (r === null) {
      invalidas++;
      continue;
    }
    const [a, b, z] = r.n;
    pontos.push(ordem === 'xyz' ? a : b, ordem === 'xyz' ? b : a, z);
    if (r.virgula) virgulaDecimal = true;
    zMin = zMin === null ? z : Math.min(zMin, z);
    zMax = zMax === null ? z : Math.max(zMax, z);
  }
  return { separador, ordem, cabecalho, virgulaDecimal, pontos, linhas: dados.length, invalidas, zMin, zMax };
}
