import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { applyCommand, type Command } from './commands.ts';
import type { Project } from './types.ts';
import type { Lang } from './i18n.ts';
import { labelOf } from './historyRotulos.ts';

export { labelOf } from './historyRotulos.ts';

enablePatches();

interface Entry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

type Listener = () => void;

/**
 * Armazena o projeto e o histórico. Toda escrita passa por `exec`; transações agrupam
 * vários comandos num único passo de desfazer (arrastar = 1 passo).
 */
export class ProjectStore {
  private present: Project;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private listeners = new Set<Listener>();
  private tx: { label: string; patches: Patch[]; inverse: Patch[] } | null = null;
  /** Última transação de uma sessão (ex.: Copiar): novas transações da mesma sessão entram nesse passo. */
  private lastSession: { key: object; entry: Entry } | null = null;
  /** Incrementa a cada mudança; serve de chave de cache. */
  version = 0;
  /** Versão do último salvamento, para o aviso de alterações não salvas. */
  savedVersion = 0;

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

  markSaved(): void {
    this.savedVersion = this.version;
    this.emit();
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
    this.tx = null;
    this.emit();
    this.savedVersion = this.version;
  }

  exec(cmd: Command, label = labelOf(cmd), lang: Lang = 'pt'): void {
    const [next, patches, inverse] = produceWithPatches(this.present, (draft) => {
      applyCommand(draft as Project, cmd, lang);
    });
    if (patches.length === 0) return;
    this.present = next;
    if (this.tx) {
      this.tx.patches.push(...patches);
      this.tx.inverse.unshift(...inverse);
    } else {
      this.past.push({ label, patches, inverse });
      this.future = [];
    }
    this.emit();
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
    this.tx = { label, patches: [], inverse: [] };
    try {
      fn();
    } finally {
      const done = this.tx;
      this.tx = null;
      if (done.patches.length > 0) {
        const last = this.past[this.past.length - 1];
        const s = this.lastSession;
        if (session && s && s.key === session && s.entry === last) {
          // Undo do passo: o inverso das novas alterações vai antes do inverso já guardado.
          s.entry.patches.push(...done.patches);
          s.entry.inverse.unshift(...done.inverse);
        } else {
          this.past.push(done);
          this.lastSession = session ? { key: session, entry: done } : null;
        }
        this.future = [];
        this.emit();
      }
    }
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
