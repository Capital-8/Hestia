/**
 * Tipos TypeScript das portas de um suplemento de script do Hestia (SDK, fase J do ADR 0057).
 *
 * Uso em JavaScript, no começo do `main.js`:
 *   // @ts-check
 *   /** @param {import('./hestia-plugin').HestiaContext} ctx *\/
 *   export async function contar(ctx) { ... }
 *
 * O `ctx` só traz as portas que o usuário CONCEDEU: sem `model.read` e sem `model.write` não existe `ctx.model`; sem
 * `plugindata.rw` não existe `ctx.data`. Toda porta é assíncrona. Unidades do modelo: comprimento em metro (m), área em
 * metro quadrado (m2), volume em metro cúbico (m3), ângulo em radiano (rad). Este arquivo NÃO entra no `.hestiapkg`.
 */

/** Texto visível: uma string vale para os dois idiomas; ou `{ pt, en }`. */
export type HestiaText = string | { pt: string; en: string };

/** JSON puro (sem `undefined`, funções, `NaN`, `Infinity`). */
export type HestiaJson = null | boolean | number | string | HestiaJson[] | { [k: string]: HestiaJson };

/** Registro por suplemento (anel de 500 entradas, até 500 caracteres cada). Nunca registre dados do modelo. */
export interface HestiaLog {
  info(text: unknown): void;
  warn(text: unknown): void;
  error(text: unknown): void;
}

/** Cópia imutável do projeto (`model.read`). O formato é o `Project` do Hestia; aqui fica solto de propósito. */
export interface HestiaProject {
  readonly levels: ReadonlyArray<{ id: string; name: string; elevation: number; [k: string]: unknown }>;
  readonly elements: { readonly [id: string]: { id: string; kind: string; [k: string]: unknown } };
  readonly [k: string]: unknown;
}

/** Resultado de `model.apply`: lote aplicado inteiro (um passo de Desfazer) ou recusado inteiro. */
export type HestiaApplyResult = { ok: true; applied: number } | { ok: false; index: number; error: string };

/** Porta do modelo. `read` exige `model.read`; `apply` e `newId` exigem `model.write` (que exige `model.read`). */
export interface HestiaModel {
  read?(): Promise<HestiaProject>;
  /**
   * Aplica uma lista de comandos de `packages/model` (lista branca; ver docs/plugins/10-referencia-da-api.md). Atômico.
   * `index: -1` = o lote todo foi recusado (formato, tamanho ou permissão).
   */
  apply?(label: string, commands: HestiaCommand[]): Promise<HestiaApplyResult>;
  /** Pede um id novo ao Hestia (`prefix`: letras minúsculas e dígitos, até 16). Ids inventados pelo script são recusados. */
  newId?(prefix: string): Promise<string>;
}

/** Um comando de modelo: objeto com `type` (ex.: `addWall`) e os campos daquele comando. */
export interface HestiaCommand {
  type: string;
  [k: string]: unknown;
}

/** Espaço de dados do PRÓPRIO suplemento (`plugindata.rw`): JSON puro, 1 MiB por suplemento, chaves de até 64 caracteres. */
export interface HestiaData {
  get(key: string): Promise<HestiaJson | undefined>;
  /** Rejeita se o espaço estiver somente leitura (o projeto traz um `dataSchema` maior que o instalado) ou passar do limite. */
  set(key: string, value: HestiaJson): Promise<void>;
  delete(key: string): Promise<void>;
}

/** O que cada handler recebe como primeiro argumento. */
export interface HestiaContext {
  readonly pluginId: string;
  readonly log: HestiaLog;
  readonly model?: HestiaModel;
  readonly data?: HestiaData;
}

// ---- resultados dos handlers ----

/** Resultado de um handler de comando/botão: texto, `{ title?, message }`, ou qualquer JSON (mostrado como texto). */
export type HestiaHandlerResult = void | null | HestiaText | { title?: HestiaText; message: HestiaText } | HestiaJson;

/** Valores validados de um diálogo (`length` em metro, `angle` em radiano). */
export type HestiaDialogValues = Record<string, number | string | boolean>;

/** Handler de ação: comando, botão de diálogo ou de painel. `values` só existe quando vem de diálogo/painel. */
export type HestiaHandler<V = HestiaDialogValues | undefined> = (ctx: HestiaContext, values: V) => HestiaHandlerResult | Promise<HestiaHandlerResult>;

/** Item que um handler de verificação (`checks[].handler`) devolve: a lista vira itens do painel de problemas. */
export interface HestiaCheckIssue {
  elementId?: string;
  /** Sem `message`, vale a da verificação preenchida com os campos do elemento. */
  message?: string;
}
export type HestiaCheckHandler = (ctx: HestiaContext) => HestiaCheckIssue[] | Promise<HestiaCheckIssue[]>;

/** Exportador (`exporters[].handler`): recebe o projeto e o nome sugerido; devolve texto/bytes ou `{ data, name? }`. */
export type HestiaExporter = (
  ctx: HestiaContext,
  input: { project: HestiaProject; fileName: string },
) => string | Uint8Array | { data: string | Uint8Array; name?: string } | Promise<string | Uint8Array | { data: string | Uint8Array; name?: string }>;

/** Importador (`importers[].handler`): recebe o arquivo escolhido; devolve um lote de comandos (aplicado só após a prévia). */
export type HestiaImporter = (
  ctx: HestiaContext,
  file: { name: string; bytes: Uint8Array },
) => HestiaCommand[] | { commands: HestiaCommand[]; report?: string } | Promise<HestiaCommand[] | { commands: HestiaCommand[]; report?: string }>;

// ---- ferramentas interativas (`tools`) ----

export interface HestiaPoint {
  /** Metro. */
  x: number;
  y: number;
}
export type HestiaToolCollected = HestiaPoint | HestiaPoint[] | { elementId: string };
export type HestiaPromptKind = 'point' | 'line' | 'polyline' | 'pick-element';

export type HestiaToolEvent =
  | { type: 'start'; tool: string; prompts: Array<{ key: string; kind: HestiaPromptKind }>; values?: HestiaDialogValues }
  | { type: 'point'; key: string; kind: HestiaPromptKind; point: HestiaPoint; elementId?: string; complete: boolean; collected: Record<string, HestiaToolCollected> }
  | { type: 'move'; key: string; point: HestiaPoint; collected: Record<string, HestiaToolCollected> }
  | { type: 'key'; key: 'Enter' | 'Tab' | 'Space' }
  | { type: 'cancel' };

export interface HestiaToolDraft {
  lines: Array<{ a: HestiaPoint; b: HestiaPoint; dashed?: boolean }>;
  points: HestiaPoint[];
  labels: Array<{ at: HestiaPoint; text: string }>;
}

/** Resposta de `onCommit`. Rascunho: até 500 linhas, 500 pontos, 50 rótulos; coordenadas finitas até 1e6 m. */
export interface HestiaToolReply {
  draft?: HestiaToolDraft;
  commit?: { label: string; commands: HestiaCommand[] };
  message?: string;
  done?: boolean;
}
export type HestiaToolHandler = (ctx: HestiaContext, event: HestiaToolEvent) => HestiaToolReply | void | Promise<HestiaToolReply | void>;

// ---- manifesto 2.0 (subconjunto para autocompletar; o validador do Hestia é a fonte de verdade) ----

export type HestiaRuntime = 'declarative' | 'script' | 'external';
export type HestiaCapability =
  | 'scene.read' | 'camera.read' | 'events.subscribe' | 'camera.write' | 'overrides.write'
  | 'model.read' | 'model.write' | 'plugindata.rw'
  | 'ui.commands' | 'ui.ribbon' | 'ui.panels' | 'ui.dialogs' | 'ui.tools'
  | 'io.import' | 'io.export' | 'checks.run'
  | 'content.families' | 'content.materials' | 'content.schedules';

export interface HestiaManifest {
  manifestVersion: 2;
  /** Reverso-DNS minúsculo, por exemplo `com.minhaempresa.contador`. */
  id: string;
  name: string;
  /** semver `x.y.z`. */
  version: string;
  /** `major.minor` da API do Hestia (hoje `"1.0"`). */
  hestiaApi: string;
  runtime: HestiaRuntime;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
  capabilities: HestiaCapability[];
  /** Só `script`: arquivo `.js`/`.mjs` do pacote. */
  entry?: string;
  limits?: { timeoutMs?: number; memoryMiB?: number; maxCommandsPerAction?: number };
  dataSchema?: number;
  contributes?: { [ponto: string]: unknown };
  i18n?: Record<string, Record<string, string>>;
}
