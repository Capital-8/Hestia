/**
 * Codificação dirigida por `esquema.gerado.ts` (decisão 0046 §3.2): seções em colunas (column-major), cada
 * coluna contígua e preenchida a múltiplo de 8 bytes; saídas lidas por código de tipo.
 *
 * Regra de ouro do ABI: depois de QUALQUER chamada ao wasm a memória pode ter crescido e o `ArrayBuffer`
 * anterior fica destacado. Por isso as funções daqui recebem a `WebAssembly.Memory` (ou um `ArrayBuffer`
 * recém-lido) e nunca guardam views entre chamadas.
 */
import { SECOES, TIPOS } from './esquema.gerado.ts';

export type NomeSecao = keyof typeof SECOES;
export type NomeTipo = keyof typeof TIPOS;
export type ArrayTipado = Uint32Array | Int32Array | Float64Array | Uint8Array;
export type ColunasDeEntrada = Readonly<Record<string, ArrayLike<number>>>;

export const alinhar8 = (n: number): number => (n + 7) & ~7;

const CONSTRUTORES = {
  u32: Uint32Array,
  i32: Int32Array,
  f64: Float64Array,
  u8: Uint8Array,
} as const;

const NOME_POR_CODIGO = new Map<number, NomeTipo>(
  (Object.entries(TIPOS) as [NomeTipo, { codigo: number }][]).map(([nome, t]) => [t.codigo, nome]),
);

export interface ColunaDef {
  readonly nome: string;
  readonly tipo: NomeTipo;
}
export interface SecaoDef {
  readonly id: number;
  readonly chave: string;
  readonly colunas: readonly ColunaDef[];
}

export const definicaoDaSecao = (nome: NomeSecao): SecaoDef => SECOES[nome] as SecaoDef;

/** Bytes de uma coluna de `n` linhas, já com o preenchimento a 8. */
export const bytesDaColuna = (tipo: NomeTipo, n: number): number => alinhar8(n * TIPOS[tipo].bytes);

/** Bytes totais de uma seção com `n` linhas. */
export function bytesDaSecao(secao: SecaoDef, n: number): number {
  let total = 0;
  for (const c of secao.colunas) total += bytesDaColuna(c.tipo, n);
  return total;
}

/**
 * Escreve a seção em `buffer` a partir de `ptr` (que deve ser múltiplo de 8). Valida o comprimento de cada
 * coluna. Devolve os bytes escritos.
 */
export function escreverSecao(buffer: ArrayBuffer, ptr: number, secao: SecaoDef, colunas: ColunasDeEntrada, n: number): number {
  if (ptr % 8 !== 0) throw new RangeError(`ponteiro ${ptr} não alinhado a 8`);
  let desloc = ptr;
  for (const c of secao.colunas) {
    const dados = colunas[c.nome];
    if (!dados) throw new RangeError(`coluna "${c.nome}" ausente`);
    if (dados.length !== n) throw new RangeError(`coluna "${c.nome}" tem ${dados.length} valores, esperado ${n}`);
    const Ctor = CONSTRUTORES[c.tipo];
    const alvo = new Ctor(buffer, desloc, n);
    for (let i = 0; i < n; i++) alvo[i] = dados[i]!;
    desloc += bytesDaColuna(c.tipo, n);
  }
  return desloc - ptr;
}

/** Codifica a seção num buffer próprio (zerado, múltiplo de 8). Útil em testes e no falso. */
export function codificarSecao(secao: SecaoDef, colunas: ColunasDeEntrada, n: number): Uint8Array {
  const buf = new ArrayBuffer(bytesDaSecao(secao, n));
  escreverSecao(buf, 0, secao, colunas, n);
  return new Uint8Array(buf);
}

/** Lê uma seção (inverso de `escreverSecao`); devolve cópias, uma por coluna. */
export function lerSecao(buffer: ArrayBuffer, ptr: number, secao: SecaoDef, n: number): Record<string, ArrayTipado> {
  const saida: Record<string, ArrayTipado> = {};
  let desloc = ptr;
  for (const c of secao.colunas) {
    saida[c.nome] = new CONSTRUTORES[c.tipo](buffer, desloc, n).slice();
    desloc += bytesDaColuna(c.tipo, n);
  }
  return saida;
}

/** Copia `n` elementos do tipo de código `codigoTipo` a partir de `ptr`. A cópia sobrevive à próxima chamada. */
export function lerSaida(buffer: ArrayBuffer, codigoTipo: number, ptr: number, n: number): ArrayTipado {
  const nome = NOME_POR_CODIGO.get(codigoTipo);
  if (!nome) throw new RangeError(`código de tipo desconhecido: ${codigoTipo}`);
  const Ctor = CONSTRUTORES[nome];
  if (n === 0) return new Ctor(0);
  if (ptr % Ctor.BYTES_PER_ELEMENT !== 0) throw new RangeError(`ponteiro ${ptr} desalinhado para ${nome}`);
  if (ptr + n * Ctor.BYTES_PER_ELEMENT > buffer.byteLength) throw new RangeError(`saída fora da memória (ptr ${ptr}, n ${n})`);
  return new Ctor(buffer, ptr, n).slice();
}

export const codigoDoTipo = (tipo: NomeTipo): number => TIPOS[tipo].codigo;
export const bytesDoTipo = (tipo: NomeTipo): number => TIPOS[tipo].bytes;
