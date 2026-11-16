/**
 * Limites de execução de suplementos de script (docs/plugins/08 §2 e §7). O manifesto só PEDE; o host LIMITA ao teto e
 * nunca amplia. Tempos em milissegundos (ms), memória em mebibytes (MiB), lote em bytes.
 */

/** Limites efetivos de um suplemento de script. */
export interface ScriptLimits {
  /** Tempo máximo de UMA chamada ao script, em ms (o tempo esperando o host responder não conta). */
  timeoutMs: number;
  /** Memória máxima estimada do Worker, em MiB. */
  memoryMiB: number;
  /** Comandos por aplicação de lote (`model.apply`). */
  maxCommandsPerAction: number;
}

export const DEFAULT_SCRIPT_LIMITS: Readonly<ScriptLimits> = { timeoutMs: 2000, memoryMiB: 64, maxCommandsPerAction: 5000 };
export const MAX_SCRIPT_LIMITS: Readonly<ScriptLimits> = { timeoutMs: 30000, memoryMiB: 256, maxCommandsPerAction: 50000 };

/** Tamanho máximo de um lote de comandos: 8 MiB (em bytes, medido pelo JSON). */
export const MAX_BATCH_BYTES = 8 * 1024 * 1024;
/** Janela das falhas consecutivas, em ms. */
export const FAILURE_WINDOW_MS = 60000;
/** Falhas dentro da janela que levam o suplemento ao estado `failed`. */
export const MAX_FAILURES_IN_WINDOW = 3;

function clamp(v: unknown, def: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1) return def;
  return Math.min(Math.floor(v), max);
}

/** Resolve o pedido do manifesto: ausente ou inválido = padrão; acima do teto = teto. */
export function resolveLimits(requested?: Partial<ScriptLimits> | null): ScriptLimits {
  const d = DEFAULT_SCRIPT_LIMITS;
  const m = MAX_SCRIPT_LIMITS;
  return {
    timeoutMs: clamp(requested?.timeoutMs, d.timeoutMs, m.timeoutMs),
    memoryMiB: clamp(requested?.memoryMiB, d.memoryMiB, m.memoryMiB),
    maxCommandsPerAction: clamp(requested?.maxCommandsPerAction, d.maxCommandsPerAction, m.maxCommandsPerAction),
  };
}

/** Tamanho aproximado, em bytes, de um valor clonável (JSON); `Infinity` se não for serializável. */
export function approxBytes(value: unknown): number {
  try {
    const s = JSON.stringify(value);
    return s === undefined ? 0 : s.length * 2;
  } catch {
    return Infinity;
  }
}
