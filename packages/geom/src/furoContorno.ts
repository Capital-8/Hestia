/**
 * Furo de parede por contorno: cliente TypeScript da exportação `furo_contorno_furar` (docs/estudo-esquadrias/21-abi-furo-contorno.md).
 *
 * Mesmo padrão da ABI v2 (`kernel/v2`): o wasm é compilado uma vez e instanciado; a versão é conferida; cada buffer
 * de entrada é reservado com `abi2_alocar` (depois da alocação a view é refeita sobre `memory.buffer`) e liberado com
 * `abi2_liberar`, mesmo se a chamada falhar. As saídas são do wasm e valem até a próxima chamada, então são copiadas
 * antes de devolver e liberadas com `furo_saida_liberar`. Código ≠ 0 vira `ErroKernelLeve` (ENTRADA, LIMITE) ou
 * `ErroKernelGrave` (INTERNO, VERSAO, trap), com o texto do `furo_erro_*`.
 *
 * Este módulo não carrega o artefato do app: quem chama passa os bytes (testes, ou um futuro carregador).
 */
import { CODIGOS, TIPOS } from './kernel/v2/esquema.gerado.ts';
import { ErroKernelGrave, ErroKernelLeve, ehCodigoLeve } from './kernel/v2/erros.ts';
import { mensagem } from './kernel/v2/gerenciador.ts';

/** Versão do layout desta ABI (`furo_abi_versao`). */
export const VERSAO_ABI_FURO = 1;

/** Um vão a furar. `contorno` é aberto, anti-horário, em metros, com origem no meio da base do vão. */
export interface VaoContorno {
  contorno: ReadonlyArray<readonly [number, number]>;
  /** Posição x da origem do vão, ao longo da parede. */
  x: number;
  /** Cota z da origem do vão (soleira ou peitoril). */
  soleira: number;
}

/** Malha de uma camada. `vertices` é x, y, z intercalados; `indices` são locais à camada (0-based, triângulos). */
export interface MalhaCamadaFuro {
  y0: number;
  y1: number;
  volume: number;
  volumeSemFuro: number;
  vertices: Float64Array;
  indices: Uint32Array;
}

export interface ResultadoFuroParede {
  camadas: MalhaCamadaFuro[];
  volumeTotal: number;
  volumeRemovido: number;
}

interface ExportsFuro {
  abi2_alocar(bytes: number): number;
  abi2_liberar(ptr: number, bytes: number): void;
  furo_abi_versao(): number;
  furo_contorno_furar(
    nVaos: number,
    nPontos: number,
    ptrPontos: number,
    ptrVaos: number,
    ptrX: number,
    ptrSoleira: number,
    nCamadas: number,
    ptrEspessuras: number,
    comprimento: number,
    altura: number,
  ): number;
  furo_saida_n(): number;
  furo_saida_tipo(i: number): number;
  furo_saida_ptr(i: number): number;
  furo_saida_len(i: number): number;
  furo_saida_liberar(): void;
  furo_erro_ptr(): number;
  furo_erro_len(): number;
}

interface InstanciaFuro {
  readonly exports: ExportsFuro;
  readonly memory: WebAssembly.Memory;
}

/** Saídas, na ordem fixada pela ABI (doc 21 §5). */
const SAIDA = { meta: 0, contagens: 1, vertices: 2, indices: 3, totais: 4 } as const;
const SAIDAS_ESPERADAS = 5;
const TIPO_F64 = TIPOS.f64.codigo;
const TIPO_U32 = TIPOS.u32.codigo;

let atual: InstanciaFuro | null = null;

/**
 * Compila e instancia o wasm que contém `furo_contorno_*` (o mesmo módulo da ABI v2, que traz `abi2_alocar`).
 * Versão errada ou exportações ausentes: `ErroKernelGrave(VERSAO)`.
 */
export async function carregarFuroContorno(bytes: ArrayBuffer | Uint8Array | WebAssembly.Module): Promise<void> {
  const modulo = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes as BufferSource);
  const instancia = new WebAssembly.Instance(modulo, {});
  const memory = instancia.exports.memory;
  if (!(memory instanceof WebAssembly.Memory)) throw new ErroKernelGrave(CODIGOS.VERSAO, 'o módulo não exporta "memory"');
  const exports = instancia.exports as unknown as ExportsFuro;
  let versao: number;
  try {
    if (typeof exports.abi2_alocar !== 'function' || typeof exports.abi2_liberar !== 'function') {
      throw new Error('abi2_alocar/abi2_liberar ausentes');
    }
    versao = exports.furo_abi_versao();
  } catch (e) {
    throw new ErroKernelGrave(CODIGOS.VERSAO, `exportações do furo ausentes ou com falha (${mensagem(e)})`);
  }
  if (versao !== VERSAO_ABI_FURO) throw new ErroKernelGrave(CODIGOS.VERSAO, `furo_abi_versao=${versao}, esperado ${VERSAO_ABI_FURO}`);
  atual = { exports, memory };
}

/** Diz se `carregarFuroContorno` já rodou com sucesso. */
export const furoContornoCarregado = (): boolean => atual !== null;

function instanciaCarregada(): InstanciaFuro {
  if (atual === null) throw new Error('furo por contorno: wasm não carregado (chame carregarFuroContorno antes)');
  return atual;
}

interface Reserva {
  ptr: number;
  bytes: number;
}

/** Reserva e copia um buffer. Tamanho zero não aloca: ponteiro 0 (a ABI aceita com n = 0). */
function reservar(inst: InstanciaFuro, src: Float64Array | Uint32Array, reservas: Reserva[]): number {
  const bytes = src.byteLength;
  if (bytes === 0) return 0;
  const ptr = inst.exports.abi2_alocar(bytes);
  if (ptr === 0) throw new ErroKernelLeve(CODIGOS.LIMITE, `abi2_alocar(${bytes}) falhou`);
  reservas.push({ ptr, bytes });
  // A view é criada depois da alocação: ela pode ter crescido a memória.
  const view = src instanceof Float64Array ? new Float64Array(inst.memory.buffer, ptr, src.length) : new Uint32Array(inst.memory.buffer, ptr, src.length);
  view.set(src);
  return ptr;
}

function liberarTudo(inst: InstanciaFuro, reservas: Reserva[]): void {
  for (const r of reservas) {
    try {
      inst.exports.abi2_liberar(r.ptr, r.bytes);
    } catch {
      // Se a instância já está quebrada, quem chamou recarrega o módulo.
    }
  }
}

function lerErro(inst: InstanciaFuro): string {
  try {
    const len = inst.exports.furo_erro_len();
    if (len === 0) return '';
    const ptr = inst.exports.furo_erro_ptr(); // antes de ler `buffer`
    return new TextDecoder('utf-8').decode(new Uint8Array(inst.memory.buffer, ptr, len));
  } catch {
    return '';
  }
}

function falhaGrave(texto: string): ErroKernelGrave {
  return new ErroKernelGrave(CODIGOS.INTERNO, texto);
}

/** Copia uma saída do wasm para um array próprio, conferindo tipo e tamanho. */
function lerSaida(inst: InstanciaFuro, i: number, tipo: number, nome: string): Float64Array | Uint32Array {
  if (inst.exports.furo_saida_tipo(i) !== tipo) throw falhaGrave(`saída ${nome}: tipo inesperado`);
  const len = inst.exports.furo_saida_len(i);
  const ptr = inst.exports.furo_saida_ptr(i); // chamar antes de ler `buffer`
  if (len === 0) return tipo === TIPO_F64 ? new Float64Array(0) : new Uint32Array(0);
  const ArrayTipado = tipo === TIPO_F64 ? Float64Array : Uint32Array;
  if (ptr % ArrayTipado.BYTES_PER_ELEMENT !== 0 || ptr + len * ArrayTipado.BYTES_PER_ELEMENT > inst.memory.buffer.byteLength) {
    throw falhaGrave(`saída ${nome}: ponteiro ${ptr} inválido para ${len} elementos`);
  }
  return new ArrayTipado(inst.memory.buffer, ptr, len).slice();
}

function lerResultado(inst: InstanciaFuro, camadas: number): ResultadoFuroParede {
  if (inst.exports.furo_saida_n() !== SAIDAS_ESPERADAS) throw falhaGrave(`furo_saida_n != ${SAIDAS_ESPERADAS} após sucesso`);
  const meta = lerSaida(inst, SAIDA.meta, TIPO_F64, 'meta') as Float64Array;
  const contagens = lerSaida(inst, SAIDA.contagens, TIPO_U32, 'contagens') as Uint32Array;
  const vertices = lerSaida(inst, SAIDA.vertices, TIPO_F64, 'vertices') as Float64Array;
  const indices = lerSaida(inst, SAIDA.indices, TIPO_U32, 'indices') as Uint32Array;
  const totais = lerSaida(inst, SAIDA.totais, TIPO_F64, 'totais') as Float64Array;
  if (meta.length !== 4 * camadas || contagens.length !== 2 * camadas || totais.length !== 2) {
    throw falhaGrave('tamanhos de saída incoerentes com o número de camadas');
  }
  let somaV = 0;
  let somaT = 0;
  for (let k = 0; k < camadas; k++) {
    somaV += num(contagens, 2 * k);
    somaT += num(contagens, 2 * k + 1);
  }
  if (vertices.length !== 3 * somaV || indices.length !== somaT) throw falhaGrave('tamanhos de vértices ou índices incoerentes com as contagens');

  const saida: MalhaCamadaFuro[] = [];
  let offV = 0;
  let offT = 0;
  for (let k = 0; k < camadas; k++) {
    const nv = num(contagens, 2 * k);
    const nt = num(contagens, 2 * k + 1);
    saida.push({
      y0: num(meta, 4 * k),
      y1: num(meta, 4 * k + 1),
      volume: num(meta, 4 * k + 2),
      volumeSemFuro: num(meta, 4 * k + 3),
      vertices: vertices.slice(3 * offV, 3 * (offV + nv)),
      indices: indices.slice(offT, offT + nt),
    });
    offV += nv;
    offT += nt;
  }
  return { camadas: saida, volumeTotal: num(totais, 0), volumeRemovido: num(totais, 1) };
}

/** Lê um elemento de uma saída; fora do intervalo é falha interna (a ABI devolve tamanhos fixos). */
function num(arr: ArrayLike<number>, i: number): number {
  const v = arr[i];
  if (v === undefined) throw falhaGrave(`saída com menos elementos que o esperado (índice ${i})`);
  return v;
}

/**
 * Fura uma parede em camadas com os vãos dados e devolve a malha de cada camada.
 * `espessuras` vão em y crescente (camada 0 ocupa `[0, e0]`); `comprimento` e `altura` são a parede em metros.
 * Erro de entrada ou de limite: `ErroKernelLeve` (código ENTRADA ou LIMITE, com o texto do wasm). Falha interna: `ErroKernelGrave`.
 */
export function furarParedePorContorno(
  vaos: readonly VaoContorno[],
  espessuras: readonly number[],
  comprimento: number,
  altura: number,
): ResultadoFuroParede {
  const inst = instanciaCarregada();
  const nVaos = vaos.length;
  let nPontos = 0;
  for (const v of vaos) nPontos += v.contorno.length;

  const pontos = new Float64Array(2 * nPontos);
  const idxVaos = new Uint32Array(nVaos + 1);
  const xs = new Float64Array(nVaos);
  const soleiras = new Float64Array(nVaos);
  let p = 0;
  vaos.forEach((v, i) => {
    for (const [px, pz] of v.contorno) {
      pontos[2 * p] = px;
      pontos[2 * p + 1] = pz;
      p++;
    }
    idxVaos[i + 1] = p;
    xs[i] = v.x;
    soleiras[i] = v.soleira;
  });
  const esp = Float64Array.from(espessuras);

  const reservas: Reserva[] = [];
  let codigo: number;
  try {
    const pPontos = reservar(inst, pontos, reservas);
    const pVaos = reservar(inst, idxVaos, reservas);
    const pX = reservar(inst, xs, reservas);
    const pSoleira = reservar(inst, soleiras, reservas);
    const pEsp = reservar(inst, esp, reservas);
    codigo = inst.exports.furo_contorno_furar(nVaos, nPontos, pPontos, pVaos, pX, pSoleira, esp.length, pEsp, comprimento, altura);
  } catch (e) {
    if (e instanceof ErroKernelLeve || e instanceof ErroKernelGrave) throw e;
    throw new ErroKernelGrave(null, mensagem(e)); // trap do WebAssembly
  } finally {
    liberarTudo(inst, reservas);
  }

  if (codigo !== CODIGOS.OK) {
    const texto = lerErro(inst);
    throw ehCodigoLeve(codigo) ? new ErroKernelLeve(codigo, texto) : new ErroKernelGrave(codigo, texto);
  }

  try {
    return lerResultado(inst, esp.length);
  } finally {
    inst.exports.furo_saida_liberar();
  }
}
