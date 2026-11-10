/**
 * Serialização determinística do ouro. Não conhece o projeto: só transforma valores em texto estável.
 *
 * - números arredondados a 6 casas (e `-0` vira `0`), para não oscilar entre execuções;
 * - chaves de objeto em ordem alfabética, `undefined` descartado;
 * - uma linha por elemento até a profundidade pedida, para a diferença sair legível (qual operação mudou).
 */

const CASAS = 1e6;

function numero(n: number): number | string {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * CASAS) / CASAS;
  return Object.is(r, -0) ? 0 : r;
}

/** JSON compacto, de chaves ordenadas e números arredondados. */
export function jsonEstavel(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'number':
      return JSON.stringify(numero(v));
    case 'string':
    case 'boolean':
      return JSON.stringify(v);
    case 'undefined':
      return 'null';
    case 'object': {
      if (Array.isArray(v)) return `[${v.map(jsonEstavel).join(',')}]`;
      if (v instanceof Set) return jsonEstavel([...v].sort());
      if (v instanceof Map) return jsonEstavel([...v.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
      const chaves = Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort();
      return `{${chaves.map((k) => `${JSON.stringify(k)}:${jsonEstavel((v as Record<string, unknown>)[k])}`).join(',')}}`;
    }
    default:
      return JSON.stringify(String(v));
  }
}

/**
 * Texto linha a linha: desce em arrays e objetos até `profundidade` níveis (cada folha vira `caminho = json`).
 * Um valor vazio (`[]`, `{}`) também ocupa uma linha, para a ausência de itens aparecer no ouro.
 */
export function linhas(valor: unknown, profundidade: number, caminho = ''): string[] {
  const ehLista = Array.isArray(valor);
  const ehObjeto = valor !== null && typeof valor === 'object' && !ehLista && !(valor instanceof Set) && !(valor instanceof Map);
  if (profundidade > 0 && (ehLista || ehObjeto)) {
    const entradas: Array<[string, unknown]> = ehLista
      ? (valor as unknown[]).map((x, i) => [`${caminho}[${i}]`, x])
      : Object.keys(valor as object).filter((k) => (valor as Record<string, unknown>)[k] !== undefined).sort().map((k) => [caminho ? `${caminho}.${k}` : k, (valor as Record<string, unknown>)[k]]);
    if (entradas.length > 0) return entradas.flatMap(([c, x]) => linhas(x, profundidade - 1, c));
  }
  return [`${caminho || '$'} = ${jsonEstavel(valor)}`];
}

/** Texto final de uma saída: linhas unidas por quebra de linha, com quebra final. */
export const texto = (valor: unknown, profundidade: number): string => `${linhas(valor, profundidade).join('\n')}\n`;
