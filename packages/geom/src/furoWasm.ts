/**
 * Helpers de memória do wasm para as ABIs de furo (`furo_contorno_*` e `furo_prisma_*`): reserva e libera buffers de entrada
 * com `abi2_alocar`/`abi2_liberar`, lê as saídas que o wasm guarda e o texto de erro. Cópia mínima das funções privadas de
 * `furoContorno.ts` (que não foi alterado), com a mesma semântica.
 */
import { CODIGOS, TIPOS } from './kernel/v2/esquema.gerado.ts';
import { ErroKernelGrave, ErroKernelLeve, ehCodigoLeve } from './kernel/v2/erros.ts';
import { mensagem } from './kernel/v2/gerenciador.ts';

/** Exportações de memória e saída comuns às ABIs de furo. */
export interface ExportsMemoriaFuro {
  abi2_alocar(bytes: number): number;
  abi2_liberar(ptr: number, bytes: number): void;
  furo_saida_n(): number;
  furo_saida_tipo(i: number): number;
  furo_saida_ptr(i: number): number;
  furo_saida_len(i: number): number;
  furo_saida_liberar(): void;
  furo_erro_ptr(): number;
  furo_erro_len(): number;
}

export interface InstanciaWasmFuro {
  readonly exports: ExportsMemoriaFuro;
  readonly memory: WebAssembly.Memory;
}

export interface Reserva {
  ptr: number;
  bytes: number;
}

export const TIPO_F64 = TIPOS.f64.codigo;
export const TIPO_U32 = TIPOS.u32.codigo;

/** Reserva e copia um buffer. Tamanho zero não aloca: ponteiro 0 (a ABI aceita com n = 0). */
export function reservar(inst: InstanciaWasmFuro, src: Float64Array | Uint32Array, reservas: Reserva[]): number {
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

export function liberarTudo(inst: InstanciaWasmFuro, reservas: Reserva[]): void {
  for (const r of reservas) {
    try {
      inst.exports.abi2_liberar(r.ptr, r.bytes);
    } catch {
      // Se a instância já está quebrada, quem chamou recarrega o módulo.
    }
  }
}

export function lerErro(inst: InstanciaWasmFuro): string {
  try {
    const len = inst.exports.furo_erro_len();
    if (len === 0) return '';
    const ptr = inst.exports.furo_erro_ptr(); // antes de ler `buffer`
    return new TextDecoder('utf-8').decode(new Uint8Array(inst.memory.buffer, ptr, len));
  } catch {
    return '';
  }
}

export function falhaGrave(texto: string): ErroKernelGrave {
  return new ErroKernelGrave(CODIGOS.INTERNO, texto);
}

/** Copia uma saída do wasm para um array próprio, conferindo tipo e tamanho. */
export function lerSaida(inst: InstanciaWasmFuro, i: number, tipo: number, nome: string): Float64Array | Uint32Array {
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

/** Lê um elemento de uma saída; fora do intervalo é falha interna (a ABI devolve tamanhos fixos). */
export function num(arr: ArrayLike<number>, i: number): number {
  const v = arr[i];
  if (v === undefined) throw falhaGrave(`saída com menos elementos que o esperado (índice ${i})`);
  return v;
}

/** Converte um código de erro da ABI na exceção certa: leve (ENTRADA, LIMITE) ou grave (o resto). */
export function erroDoCodigo(codigo: number, texto: string): ErroKernelLeve | ErroKernelGrave {
  return ehCodigoLeve(codigo) ? new ErroKernelLeve(codigo, texto) : new ErroKernelGrave(codigo, texto);
}

/** Converte exceção de chamada ao wasm: erros do cliente passam; qualquer outra coisa é trap do WebAssembly. */
export function erroDeChamada(e: unknown): ErroKernelLeve | ErroKernelGrave {
  if (e instanceof ErroKernelLeve || e instanceof ErroKernelGrave) return e;
  return new ErroKernelGrave(null, mensagem(e));
}
