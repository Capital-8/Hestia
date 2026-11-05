import type { ContadoresPerf } from './contadores.ts';
import { t, type Lang } from '../i18n.ts';

export interface InstrumentacaoWebGpu {
  remover(): void;
}

interface FilaWebGpu {
  writeBuffer?: (...args: unknown[]) => unknown;
}

/**
 * Conta os `queue.writeBuffer` do WebGPU como uploads de quadro. A contagem de desenho não é interceptada aqui: o
 * `WebGPURenderer` do three informa `info.render` e o `gpu.ts` usa esse fallback. Se a fila não expuser `writeBuffer`,
 * devolve `null` e o motivo fica registrado como indisponível.
 */
export function instrumentarWebGpu(dispositivo: unknown, contadores: ContadoresPerf, lang: Lang = 'pt'): InstrumentacaoWebGpu | null {
  const fila = (dispositivo as { queue?: FilaWebGpu } | null | undefined)?.queue;
  const original = fila?.writeBuffer;
  if (!fila || typeof original !== 'function') {
    contadores.registrarIndisponivel(t(lang, 'rn_gpu_queue_not_exposed'));
    return null;
  }
  const proprio = original.bind(fila);
  try {
    fila.writeBuffer = (...args: unknown[]): unknown => {
      try {
        const dados = args[2];
        const bytes = dados && typeof dados === 'object' && typeof (dados as { byteLength?: unknown }).byteLength === 'number' ? (dados as { byteLength: number }).byteLength : 0;
        const tamanho = typeof args[4] === 'number' && Number.isFinite(args[4]) ? args[4] : bytes;
        contadores.contarUpload(tamanho);
      } catch {
        // medição nunca derruba a submissão
      }
      return proprio(...args);
    };
  } catch {
    contadores.registrarIndisponivel(t(lang, 'rn_gpu_queue_intercept_failed'));
    return null;
  }
  return {
    remover() {
      try {
        fila.writeBuffer = original;
      } catch {
        // dispositivo perdido
      }
    },
  };
}
