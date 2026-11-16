/**
 * Ponte de importar e exportar dos suplementos (spec 08 §4 e §11, fase F; ADR 0057). Sem React: tudo entra por
 * `IoBridgeDeps`, por isso roda igual no app e nos testes de integração.
 *
 * Garantias: o suplemento só recebe CÓPIAS (modelo congelado, bytes copiados); o que ele devolve é dado não confiável
 * (tamanho, nome e extensão conferidos aqui); o lote do importador passa pela porta de escrita da fase C (lista
 * branca, atomicidade, UM passo de desfazer) e só depois de prévia e confirmação do usuário; erro de handler vira
 * resultado `error` + registro, nunca exceção para o app.
 */
import type { ContributionRegistry, ModelPort, PluginAction, RehearsalResult } from '@hestia/plugin-api';
import {
  PluginIoError, checkImportFile, deepFreeze, parseExportResult, parseImportResult, previewCommands, renderTemplate,
  type ImportPreview, toExportBytes,
} from '@hestia/io';

/** Importação preparada, à espera da confirmação do usuário (estado observável pela interface). */
export interface PendingImport {
  pluginId: string;
  pluginName: string;
  importerId: string;
  fileName: string;
  preview: ImportPreview;
  /** Ensaio do lote no projeto (fase I): criados, alterados, apagados e erros. Ausente se a porta não ensaia. */
  rehearsal?: RehearsalResult;
  report?: string;
}

export type IoOutcome =
  | { kind: 'exported'; pluginName: string; fileName: string; text: string }
  | { kind: 'prepared'; pluginName: string; created: number }
  | { kind: 'imported'; pluginName: string; created: number; applied: number }
  | { kind: 'cancelled'; pluginName: string }
  /** `code`: `io_*` do contrato, `handler`, `denied`, `unknown`, `busy` ou `apply` (lote recusado pela porta de escrita). */
  | { kind: 'error'; pluginName: string; code: string; detail: string };

export interface IoBridgeDeps {
  registry: ContributionRegistry;
  /** Chama um handler do suplemento (rejeita com `ScriptError`). */
  call: (pluginId: string, handler: string, args: unknown[]) => Promise<unknown>;
  model: ModelPort;
  /** Entrega o arquivo (download no navegador, salvar no desktop) e devolve a frase de status. */
  deliver: (fileName: string, bytes: Uint8Array, mime: string) => Promise<string>;
  /** Nome de exibição do suplemento (padrão: o id). */
  nameOf?: (pluginId: string) => string;
  log?: (pluginId: string, level: 'info' | 'warn' | 'error', text: string) => void;
  /** Resultado de cada operação (barra de estado). */
  onOutcome?: (o: IoOutcome) => void;
  /** Falha de handler (para o aviso geral de "suplemento falhou nesta ação"). */
  onHandlerError?: (pluginId: string) => void;
}

const MODEL_WRITE = 'model.write';
const MODEL_READ = 'model.read';

export class IoBridge {
  private pending: { info: PendingImport; commands: unknown[] } | null = null;
  private busy = false;
  private readonly subs = new Set<() => void>();
  private snap: PendingImport | null = null;

  constructor(private readonly d: IoBridgeDeps) {}

  // ---- estado observável (useSyncExternalStore) ----

  subscribe = (cb: () => void): (() => void) => {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  };

  /** Foto estável da importação pendente (muda de referência só quando ela muda). */
  snapshot = (): PendingImport | null => this.snap;

  private setPending(p: { info: PendingImport; commands: unknown[] } | null): void {
    this.pending = p;
    this.snap = p ? p.info : null;
    for (const cb of [...this.subs]) {
      try { cb(); } catch { /* um assinante com defeito não derruba os demais */ }
    }
  }

  private name(id: string): string { return this.d.nameOf?.(id) ?? id; }

  private out(o: IoOutcome): IoOutcome {
    try { this.d.onOutcome?.(o); } catch { /* aviso falho não vira erro */ }
    return o;
  }

  private fail(pluginId: string, code: string, detail: string, handler = false): IoOutcome {
    this.d.log?.(pluginId, 'error', `${code}: ${detail}`.slice(0, 500));
    if (handler) this.d.onHandlerError?.(pluginId);
    return this.out({ kind: 'error', pluginName: this.name(pluginId), code, detail: detail.slice(0, 300) });
  }

  private errOf(pluginId: string, e: unknown, handler: boolean): IoOutcome {
    if (e instanceof PluginIoError) return this.fail(pluginId, `io_${e.code}`, e.message);
    const code = (e as { code?: string }).code;
    return this.fail(pluginId, handler ? 'handler' : (code ?? 'unknown'), e instanceof Error ? e.message : String(e), handler);
  }

  // ---- exportar ----

  /** Exporta com o exportador `<pluginId>:<exporterId>`. Nunca lança. */
  async exportWith(pluginId: string, exporterId: string): Promise<IoOutcome> {
    const x = this.d.registry.exporters().find((e) => e.pluginId === pluginId && e.id === exporterId);
    if (!x) return this.fail(pluginId, 'denied', 'exportador não registrado ou sem permissão');
    if (this.busy) return this.fail(pluginId, 'busy', 'outra operação de arquivo em andamento');
    this.busy = true;
    try {
      // Cópia imutável do modelo: o handler (ou o modelo declarativo) nunca toca no projeto vivo.
      const project = deepFreeze(this.d.model.read());
      const base = typeof project.name === 'string' ? project.name : 'projeto';
      let file: { name: string; bytes: Uint8Array };
      if (x.template !== undefined) {
        file = parseExportResult(renderTemplate(x.template, project), x.extension, base);
      } else if (x.handler !== undefined) {
        const value = await this.callHandler(pluginId, x.handler, [{ project, fileName: `${base}.${x.extension}` }]);
        file = parseExportResult(value, x.extension, base);
      } else return this.fail(pluginId, 'unknown', 'exportador sem handler nem template');
      toExportBytes(file.bytes);
      const text = await this.d.deliver(file.name, file.bytes, x.mime);
      this.d.log?.(pluginId, 'info', `exportou ${file.name} (${file.bytes.byteLength} bytes)`);
      return this.out({ kind: 'exported', pluginName: this.name(pluginId), fileName: file.name, text });
    } catch (e) {
      return this.errOf(pluginId, e, e instanceof HandlerFailure);
    } finally {
      this.busy = false;
    }
  }

  // ---- importar ----

  /** Passo 1: entrega o arquivo ao handler e guarda o lote devolvido como importação pendente (nada é aplicado). */
  async prepareImport(pluginId: string, importerId: string, file: { name: string; bytes: Uint8Array }): Promise<IoOutcome> {
    const imp = this.d.registry.importers().find((i) => i.pluginId === pluginId && i.id === importerId);
    if (!imp || !this.d.registry.isGranted(pluginId, MODEL_WRITE) || !this.d.registry.isGranted(pluginId, MODEL_READ)) {
      return this.fail(pluginId, 'denied', 'importador não registrado ou sem permissão');
    }
    if (this.busy) return this.fail(pluginId, 'busy', 'outra operação de arquivo em andamento');
    this.busy = true;
    try {
      checkImportFile(file.name, file.bytes.byteLength, imp.extensions);
      // O handler recebe uma CÓPIA dos bytes como ArrayBuffer (o original do usuário não é transferido).
      const copy = file.bytes.slice().buffer;
      const value = await this.callHandler(pluginId, imp.handler, [{ name: file.name, bytes: copy }]);
      const batch = parseImportResult(value);
      const preview = previewCommands(batch.commands);
      let rehearsal: RehearsalResult | undefined;
      try { rehearsal = this.d.model.rehearse?.(pluginId, batch.commands); } catch { rehearsal = undefined; } // a prévia não depende do ensaio
      const info: PendingImport = { pluginId, pluginName: this.name(pluginId), importerId, fileName: file.name, preview, ...(rehearsal ? { rehearsal } : {}), ...(batch.report ? { report: batch.report } : {}) };
      this.setPending({ info, commands: batch.commands });
      return this.out({ kind: 'prepared', pluginName: info.pluginName, created: preview.created });
    } catch (e) {
      return this.errOf(pluginId, e, e instanceof HandlerFailure);
    } finally {
      this.busy = false;
    }
  }

  /** Passo 2 (o usuário confirmou): aplica o lote pela porta de escrita, atômico e com UM passo de desfazer. */
  confirmImport(): IoOutcome | null {
    const p = this.pending;
    if (!p) return null;
    this.setPending(null);
    const { pluginId, pluginName, fileName } = p.info;
    try {
      if (!this.d.registry.isGranted(pluginId, MODEL_WRITE)) return this.fail(pluginId, 'denied', 'permissão model.write revogada');
      const r = this.d.model.apply(pluginId, `importar ${fileName}`.slice(0, 120), p.commands);
      if (!r.ok) return this.fail(pluginId, 'apply', r.error);
      this.d.log?.(pluginId, 'info', `importou ${fileName}: ${p.info.preview.created} elemento(s)`);
      return this.out({ kind: 'imported', pluginName, created: p.info.preview.created, applied: r.applied });
    } catch (e) {
      return this.errOf(pluginId, e, false);
    }
  }

  cancelImport(): IoOutcome | null {
    const p = this.pending;
    if (!p) return null;
    this.setPending(null);
    return this.out({ kind: 'cancelled', pluginName: p.info.pluginName });
  }

  // ---- ações (menu, faixa, busca de comandos) ----

  /**
   * Ação `exporter` roda direto; `importer` pede o arquivo à interface (`pickFile`), porque só ela tem o seletor.
   * Nunca lança.
   */
  run(pluginId: string, action: PluginAction, pickFile?: (extensions: readonly string[]) => Promise<{ name: string; bytes: Uint8Array } | null>): Promise<IoOutcome | null> {
    if (action.type === 'exporter') return this.exportWith(pluginId, action.ref);
    if (action.type === 'importer' && pickFile) {
      const imp = this.d.registry.importers().find((i) => i.pluginId === pluginId && i.id === action.ref);
      if (!imp) return Promise.resolve(this.fail(pluginId, 'denied', 'importador não registrado ou sem permissão'));
      return pickFile(imp.extensions).then((f) => (f ? this.prepareImport(pluginId, action.ref, f) : null)).catch((e) => this.errOf(pluginId, e, false));
    }
    return Promise.resolve(null);
  }

  private async callHandler(pluginId: string, handler: string, args: unknown[]): Promise<unknown> {
    try {
      return await this.d.call(pluginId, handler, args);
    } catch (e) {
      throw new HandlerFailure(e);
    }
  }
}

/** Marca erro que veio do handler do suplemento (diferente de erro de validação do host). */
class HandlerFailure extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'HandlerFailure';
  }
}
