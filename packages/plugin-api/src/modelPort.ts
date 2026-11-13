/**
 * Portas de escrita e leitura do modelo para suplementos (docs/plugins/08 §5 e §6, decisão 0057).
 * Aqui só há tipos e um portão de permissões: nada de React, store nem `@hestia/model`. O aplicativo implementa
 * a porta (`apps/web/src/plugins/appModelPort.ts`); o plugin só enxerga cópias e devolve comandos como DADOS.
 */

/** Cópia imutável do projeto (JSON). O tipo exato é o `Project` de `@hestia/model`; aqui fica opaco de propósito. */
export type ProjectSnapshot = { readonly [key: string]: unknown };

export type ApplyResult = { ok: true; applied: number } | { ok: false; index: number; error: string };

export interface ApplyOptions {
  /** Teto menor de comandos por lote (ex.: `limits.maxCommandsPerAction`); o host nunca amplia o dele (5000). */
  maxCommands?: number;
}

export interface ModelPort {
  /** Cópia imutável do projeto (`model.read`). */
  read(): ProjectSnapshot;
  /** Pede um id novo ao host (ids inventados pelo plugin são recusados no lote). */
  newId(pluginId: string, prefix: string): string;
  /**
   * Valida e aplica o lote (`model.write`): atômico e UM passo de desfazer, rótulo "<plugin>: <label>".
   * Erro de lote inteiro (formato, tamanho) usa `index: -1`.
   */
  apply(pluginId: string, label: string, commands: unknown[], opts?: ApplyOptions): ApplyResult;
}

/** Espaço de dados do PRÓPRIO plugin (`plugindata.rw`); o host força o id do plugin. */
export interface PluginDataPort {
  get(pluginId: string, key: string): unknown;
  keys(pluginId: string): string[];
  /** Lança se o espaço for somente leitura (schema do projeto mais novo) ou passar dos limites (1 MiB por plugin, 4 MiB no projeto). */
  set(pluginId: string, key: string, value: unknown): void;
  delete(pluginId: string, key: string): void;
  /** true se o projeto traz dados de um `dataSchema` maior que o instalado. */
  readOnly(pluginId: string): boolean;
}

/** Limites de um lote de comandos (espelham `PLUGIN_BATCH_LIMITS` de `@hestia/model`; o host é quem os impõe). */
export const MODEL_BATCH_LIMITS = { maxCommands: 5000, maxBytes: 8 * 1024 * 1024 } as const;

/** Nomes das permissões (a tabela oficial entra em `permissions.ts` na Fase B; aqui só os textos usados no portão). */
const READ = 'model.read';
const WRITE = 'model.write';
const DATA = 'plugindata.rw';

/** Vista do plugin sobre o modelo: o que o script/processo recebe em `ctx.model`. */
export interface PluginModelApi {
  read(): ProjectSnapshot;
  newId(prefix: string): string;
  apply(label: string, commands: unknown[], opts?: ApplyOptions): ApplyResult;
}

export interface PluginDataApi {
  get(key: string): unknown;
  keys(): string[];
  set(key: string, value: unknown): void;
  delete(key: string): void;
  readOnly(): boolean;
}

export class PermissionDeniedError extends Error {
  constructor(readonly capability: string) {
    super(`permission_denied: ${capability}`);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Portão de permissões: confere a concessão A CADA CHAMADA (a lista pode mudar durante a sessão) e fixa o `pluginId`
 * (o plugin não escolhe de quem é o espaço de dados). `model.write` exige também `model.read` (dependência).
 */
export function pluginModelApi(port: ModelPort, pluginId: string, granted: () => readonly string[]): PluginModelApi {
  const need = (cap: string): void => { if (!granted().includes(cap)) throw new PermissionDeniedError(cap); };
  return {
    read() { need(READ); return port.read(); },
    newId(prefix) { need(WRITE); need(READ); return port.newId(pluginId, prefix); },
    apply(label, commands, opts) {
      try { need(WRITE); need(READ); } catch (e) { return { ok: false, index: -1, error: (e as Error).message }; }
      return port.apply(pluginId, label, commands, opts);
    },
  };
}

export function pluginDataApi(port: PluginDataPort, pluginId: string, granted: () => readonly string[]): PluginDataApi {
  const need = (): void => { if (!granted().includes(DATA)) throw new PermissionDeniedError(DATA); };
  return {
    get(key) { need(); return port.get(pluginId, key); },
    keys() { need(); return port.keys(pluginId); },
    set(key, value) { need(); port.set(pluginId, key, value); },
    delete(key) { need(); port.delete(pluginId, key); },
    readOnly() { need(); return port.readOnly(pluginId); },
  };
}
