/*
 * Funções extras da linguagem de fórmulas (CONTRATO §8, ficha A1): trigonometria em graus, `pow` e a tabela `busca`.
 * Puras e determinísticas. Ângulos no texto da família são GRAUS: `sin`, `cos` e `tan` recebem graus; `asin`, `acos`,
 * `atan` e `atan2` devolvem graus.
 * Erro de domínio lança `ErroFuncao`; `avaliar` (em `expressao.ts`) converte em `ErroExpressao`. Este arquivo não importa
 * `expressao.ts`, para não criar ciclo de módulos.
 */

export class ErroFuncao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroFuncao';
  }
}

const RAD = Math.PI / 180;
const GRAUS = 180 / Math.PI;

function conferirIntervalo(nome: string, x: number): void {
  if (x < -1 || x > 1) throw new ErroFuncao(`${nome}: argumento fora de −1 a 1`);
}

/**
 * `busca(chave, k1, v1, k2, v2, ..., padrao?)`: devolve o valor do primeiro par cuja chave é igual (===) a `chave`.
 * Com número ímpar de argumentos depois da chave, o último é o padrão. Sem achar a chave e sem padrão, erro.
 */
export function busca(...a: number[]): number {
  const [chave = 0, ...resto] = a;
  const temPadrao = resto.length % 2 === 1;
  const pares = temPadrao ? resto.slice(0, -1) : resto;
  for (let i = 0; i < pares.length; i += 2) {
    if (pares[i] === chave) return pares[i + 1] ?? 0;
  }
  if (temPadrao) return resto[resto.length - 1] ?? 0;
  throw new ErroFuncao('busca: chave sem valor');
}

export const FUNCOES_EXTRAS: Readonly<Record<string, { min: number; max: number; f: (...a: number[]) => number }>> = {
  sin: { min: 1, max: 1, f: (x = 0) => Math.sin(x * RAD) },
  cos: { min: 1, max: 1, f: (x = 0) => Math.cos(x * RAD) },
  tan: { min: 1, max: 1, f: (x = 0) => Math.tan(x * RAD) },
  asin: { min: 1, max: 1, f: (x = 0) => { conferirIntervalo('asin', x); return Math.asin(x) * GRAUS; } },
  acos: { min: 1, max: 1, f: (x = 0) => { conferirIntervalo('acos', x); return Math.acos(x) * GRAUS; } },
  atan: { min: 1, max: 1, f: (x = 0) => Math.atan(x) * GRAUS },
  atan2: { min: 2, max: 2, f: (y = 0, x = 0) => Math.atan2(y, x) * GRAUS },
  pow: { min: 2, max: 2, f: (x = 0, y = 0) => x ** y },
  busca: { min: 1, max: 255, f: busca },
};
