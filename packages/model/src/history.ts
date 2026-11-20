import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { applyCommand, type Command } from './commands.ts';
import type { CollabDeltaMeta, CollabUndoResult } from './collabTypes.ts';
import {
  extractTouchedIds,
  performAuthorRedo,
  performAuthorUndo,
  type CollabEntry,
} from './collabHistory.ts';
import type { Project } from './types.ts';
import type { Lang } from './i18n.ts';
import { labelOf } from './historyRotulos.ts';

export { labelOf } from './historyRotulos.ts';

enablePatches();

type Entry = CollabEntry;

type Listener = () => void;

interface ActiveTx {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  cmds: Command[];
  basePresent: Project;
  intercepted: boolean;
}

/**
 * Armazena o projeto e o histórico. Toda escrita passa por `exec`; transações agrupam
 * vários comandos num único passo de desfazer (arrastar = 1 passo).
 */
export class ProjectStore {
  private present: Project;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private authorRedo = new Map<string, Entry[]>();
  private listeners = new Set<Listener>();
  private tx: ActiveTx | null = null;
  /** Última transação de uma sessão (ex.: Copiar): novas transações da mesma sessão entram nesse passo. */
  private lastSession: { key: object; entry: Entry } | null = null;
  /** Incrementa a cada mudança; serve de chave de cache. */
  version = 0;
  /** Versão do último salvamento, para o aviso de alterações não salvas. */
  savedVersion = 0;

  /** Identidade do autor local aplicada às alterações gravadas por `exec` e `transaction`. */
  authorId = 'local';
  authorName = 'Local';

  /**
   * Interceptador opcional para clientes convidados: quando retorna `true`, os comandos
   * são redirecionados ao anfitrião em vez de mutar o estado local imediatamente.
   */
  collabInterceptor: ((cmds: Command[], label: string) => boolean) | null = null;

  /** Notificado sempre que uma alteração local é confirmada (fora de `applyRemotePatches`/`execAsAuthor`). */
  onDelta: ((meta: CollabDeltaMeta) => void) | null = null;

  constructor(initial: Project) {
    this.present = initial;
  }

  get project(): Project {
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoLabel(): string | null {
    return this.past[this.past.length - 1]?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  get dirty(): boolean {
    return this.version !== this.savedVersion;
  }

  /** Define a identidade do autor local para futuras gravações no histórico. */
  setAuthor(id: string, name?: string): void {
    this.authorId = id;
    this.authorName = name ?? id;
  }

  markSaved(): void {
    // Avisa os ouvintes primeiro (o `emit` sobe a versão) e só então grava a versão salva; ao contrário, o projeto salvo continuaria "sujo".
    this.emit();
    this.savedVersion = this.version;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    this.version += 1;
    for (const l of this.listeners) l();
  }

  /** Substitui o projeto inteiro (abrir arquivo) e zera o histórico. */
  load(p: Project): void {
    this.present = p;
    this.past = [];
    this.future = [];
    this.authorRedo.clear();
    this.tx = null;
    this.lastSession = null;
    this.emit();
    this.savedVersion = this.version;
  }

  exec(cmd: Command, label = labelOf(cmd), lang: Lang = 'pt'): void {
    if (!this.tx && this.collabInterceptor?.([cmd], label)) return;
    if (this.tx) this.tx.cmds.push(cmd);

    const [next, patches, inverse] = produceWithPatches(this.present, (draft) => {
      applyCommand(draft as Project, cmd, lang);
    });
    if (patches.length === 0) return;

    this.present = next;
    if (this.tx) {
      this.tx.patches.push(...patches);
      this.tx.inverse.unshift(...inverse);
      if (!this.tx.intercepted) this.emit();
    } else {
      const touchedIds = extractTouchedIds(patches);
      this.past.push({
        label,
        patches,
        inverse,
        authorId: this.authorId,
        authorName: this.authorName,
        touchedIds,
      });
      this.future = [];
      this.authorRedo.delete(this.authorId);
      this.emit();
      this.onDelta?.({
        label,
        patches,
        inverse,
        authorId: this.authorId,
        authorName: this.authorName,
        touchedIds,
      });
    }
  }

  /**
   * Executa vários comandos como um único passo de desfazer. Com `session` (chave da sessão da ferramenta),
   * a transação se junta ao passo anterior da mesma sessão enquanto ele ainda for o último do histórico
   * (ex.: várias cópias num mesmo Copiar viram um só Ctrl+Z).
   */
  transaction(label: string, fn: () => void, session?: object): void {
    if (this.tx) {
      fn();
      return;
    }
    const intercepted = this.collabInterceptor !== null;
    this.tx = { label, patches: [], inverse: [], cmds: [], basePresent: this.present, intercepted };
    let ok = false;
    try {
      fn();
      ok = true;
    } finally {
      const done = this.tx;
      this.tx = null;
      if (done.intercepted) {
        this.present = done.basePresent;
        const blocked = ok && done.patches.length > 0 && this.collabInterceptor?.(done.cmds, done.label);
        if (!blocked && ok && done.patches.length > 0) {
          this.present = applyPatches(done.basePresent, done.patches);
          this.commitTransaction(done, session);
        }
      } else if (done.patches.length > 0) {
        this.commitTransaction(done, session);
      }
    }
  }

  private commitTransaction(
    done: { label: string; patches: Patch[]; inverse: Patch[] },
    session?: object,
  ): void {
    const touchedIds = extractTouchedIds(done.patches);
    const last = this.past[this.past.length - 1];
    const s = this.lastSession;
    if (
      session &&
      s &&
      s.key === session &&
      s.entry === last &&
      last.authorId === this.authorId &&
      !last.undone
    ) {
      // Undo do passo: o inverso das novas alterações vai antes do inverso já guardado.
      s.entry.patches.push(...done.patches);
      s.entry.inverse.unshift(...done.inverse);
      s.entry.touchedIds = extractTouchedIds(s.entry.patches);
    } else {
      const entry: Entry = {
        label: done.label,
        patches: done.patches,
        inverse: done.inverse,
        authorId: this.authorId,
        authorName: this.authorName,
        touchedIds,
      };
      this.past.push(entry);
      this.lastSession = session ? { key: session, entry } : null;
    }
    this.future = [];
    this.authorRedo.delete(this.authorId);
    this.emit();
    this.onDelta?.({
      label: done.label,
      patches: done.patches,
      inverse: done.inverse,
      authorId: this.authorId,
      authorName: this.authorName,
      touchedIds,
    });
  }

  /**
   * Aplica patches recebidos do anfitrião (em sessões de convidado) mantendo o histórico sincronizado,
   * sem disparar `onDelta`.
   */
  applyRemotePatches(
    patches: Patch[],
    inverse: Patch[],
    meta: { label: string; authorId: string; authorName: string; seq?: number; touchedIds?: string[] },
  ): void {
    if (patches.length === 0) return;
    this.present = applyPatches(this.present, patches);
    const touchedIds = meta.touchedIds ?? extractTouchedIds(patches);
    this.past.push({
      label: meta.label,
      patches,
      inverse,
      authorId: meta.authorId,
      authorName: meta.authorName,
      seq: meta.seq,
      touchedIds,
    });
    this.future = [];
    this.authorRedo.delete(meta.authorId);
    this.lastSession = null;
    this.emit();
  }

  /**
   * Executa comandos em nome de `authorId` numa única transação atômica, ignorando `collabInterceptor`
   * e sem disparar `onDelta` (o Host difunde explicitamente o delta retornado).
   */
  execAsAuthor(
    authorId: string,
    authorName: string,
    cmds: Command[],
    label?: string,
    lang: Lang = 'pt',
  ): CollabDeltaMeta | null {
    if (cmds.length === 0) return null;
    const [next, patches, inverse] = produceWithPatches(this.present, (draft) => {
      for (const cmd of cmds) {
        applyCommand(draft as Project, cmd, lang);
      }
    });
    if (patches.length === 0) return null;
    const resolvedLabel = label ?? (cmds.length === 1 ? labelOf(cmds[0]!) : 'Várias alterações');
    const touchedIds = extractTouchedIds(patches);
    this.present = next;
    this.past.push({
      label: resolvedLabel,
      patches,
      inverse,
      authorId,
      authorName,
      touchedIds,
    });
    this.future = [];
    this.authorRedo.delete(authorId);
    this.lastSession = null;
    this.emit();
    return {
      label: resolvedLabel,
      patches,
      inverse,
      authorId,
      authorName,
      touchedIds,
    };
  }

  /**
   * Desfaz a última alteração ativa de `authorId` sem afetar outros autores.
   * Não dispara `onDelta`; o Host difunde o resultado quando `ok === true`.
   */
  undoByAuthor(authorId: string): CollabUndoResult {
    const { result, nextPresent } = performAuthorUndo(
      { present: this.present, past: this.past, authorRedo: this.authorRedo },
      authorId,
    );
    if (result.ok && nextPresent) {
      this.present = nextPresent;
      this.lastSession = null;
      this.emit();
    }
    return result;
  }

  /**
   * Refaz a última alteração desfeita de `authorId`.
   * Não dispara `onDelta`; o Host difunde o resultado quando `ok === true`.
   */
  redoByAuthor(authorId: string): CollabUndoResult {
    const { result, nextPresent } = performAuthorRedo(
      { present: this.present, past: this.past, authorRedo: this.authorRedo },
      authorId,
    );
    if (result.ok && nextPresent) {
      this.present = nextPresent;
      this.lastSession = null;
      this.emit();
    }
    return result;
  }

  undo(): void {
    const e = this.past.pop();
    if (!e) return;
    this.present = applyPatches(this.present, e.inverse);
    this.future.push(e);
    this.emit();
  }

  redo(): void {
    const e = this.future.pop();
    if (!e) return;
    this.present = applyPatches(this.present, e.patches);
    this.past.push(e);
    this.emit();
  }
}
