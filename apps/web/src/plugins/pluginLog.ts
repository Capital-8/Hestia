/**
 * Log por suplemento (docs/plugins/08 §7.6): anel de 500 entradas, texto de até 500 caracteres, visível só no
 * gerenciador de suplementos. Nunca recebe dados do modelo (quem chama passa só mensagens). Não lança exceção.
 */

export type PluginLogLevel = 'info' | 'warn' | 'error';

export interface PluginLogEntry {
  /** Instante em ms desde 1970 (UTC). */
  at: number;
  level: PluginLogLevel;
  text: string;
}

/** Entradas guardadas por suplemento. */
export const PLUGIN_LOG_CAPACITY = 500;
/** Caracteres por entrada. */
export const PLUGIN_LOG_TEXT_MAX = 500;

export class PluginLog {
  private readonly rings = new Map<string, PluginLogEntry[]>();
  private readonly listeners = new Set<(pluginId: string) => void>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  append(pluginId: string, level: PluginLogLevel, text: string): void {
    try {
      let ring = this.rings.get(pluginId);
      if (!ring) {
        ring = [];
        this.rings.set(pluginId, ring);
      }
      ring.push({ at: this.now(), level, text: String(text).slice(0, PLUGIN_LOG_TEXT_MAX) });
      if (ring.length > PLUGIN_LOG_CAPACITY) ring.splice(0, ring.length - PLUGIN_LOG_CAPACITY);
      for (const l of this.listeners) {
        try {
          l(pluginId);
        } catch {
          /* ouvinte com defeito não pode quebrar o log */
        }
      }
    } catch {
      /* o log nunca derruba quem o chama */
    }
  }

  /** Cópia das entradas, da mais antiga para a mais nova. */
  entries(pluginId: string): PluginLogEntry[] {
    return [...(this.rings.get(pluginId) ?? [])];
  }

  clear(pluginId: string): void {
    this.rings.delete(pluginId);
    for (const l of this.listeners) l(pluginId);
  }

  subscribe(listener: (pluginId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Instância única do app. */
export const pluginLog = new PluginLog();
