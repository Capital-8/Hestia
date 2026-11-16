/**
 * Prévia confirmável de lotes de comandos propostos por suplementos (por exemplo, de IA). Sem React: tudo entra por
 * `BatchPreviewDeps`, por isso roda igual no app e nos testes.
 *
 * Fluxo (sem atalho): o suplemento DEVOLVE um lote (`{ proposal: { label, commands, note? } }`); o host o ENSAIA numa
 * cópia do projeto (`ModelPort.rehearse`, as mesmas validações de `apply`), mostra quantos elementos seriam criados,
 * alterados e apagados e quais erros ocorreriam, e só aplica (`ModelPort.apply`, atômico, UM passo de Desfazer) depois
 * do clique em "Aplicar". Lote com erro não pode ser aplicado. Depois de aplicado, um passo de desfazer desta aplicação.
 * O suplemento nunca recebe o resultado do ensaio nem escolhe quando aplicar; o texto que ele devolve é dado não confiável.
 */
import type { ModelPort, RehearsalResult } from '@hestia/plugin-api';

export interface BatchProposal {
  pluginId: string;
  pluginName: string;
  label: string;
  commands: unknown[];
  /** Mensagem do suplemento (texto simples, no máximo 500 caracteres). */
  note?: string;
  rehearsal: RehearsalResult;
}

export interface AppliedBatch { pluginName: string; label: string; created: number; changed: number; deleted: number }

export type BatchOutcome =
  | { kind: 'proposed'; pluginName: string; commands: number }
  | { kind: 'applied'; pluginName: string; created: number; changed: number; deleted: number }
  | { kind: 'cancelled'; pluginName: string }
  | { kind: 'undone'; pluginName: string }
  | { kind: 'error'; pluginName: string; detail: string };

export interface BatchPreviewState { pending: BatchProposal | null; applied: AppliedBatch | null }

export interface BatchPreviewDeps {
  model: ModelPort;
  /** O suplemento tem `model.write` e `model.read` agora? (conferido na proposta e de novo ao aplicar). */
  canWrite: (pluginId: string) => boolean;
  /** Contador de versão do projeto (muda a cada alteração) e desfazer um passo. */
  version: () => number;
  undo: () => void;
  /** Teto de comandos do manifesto (`limits.maxCommandsPerAction`), opcional. */
  maxCommands?: (pluginId: string) => number | undefined;
  log?: (pluginId: string, level: 'info' | 'warn' | 'error', text: string) => void;
  onOutcome?: (o: BatchOutcome) => void;
}

const LABEL_MAX = 80;
const NOTE_MAX = 500;

/** Extrai a proposta do valor devolvido pelo handler; só a chave `proposal` conta (um valor qualquer nunca vira lote). */
export function parseProposal(value: unknown): { label: string; commands: unknown[]; note?: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const p = (value as { proposal?: unknown }).proposal;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  const { label, commands, note } = p as { label?: unknown; commands?: unknown; note?: unknown };
  if (!Array.isArray(commands)) return null;
  return {
    label: (typeof label === 'string' && label.trim() ? label.trim() : 'Alterações propostas').slice(0, LABEL_MAX),
    commands,
    ...(typeof note === 'string' && note ? { note: note.slice(0, NOTE_MAX) } : {}),
  };
}

export class BatchPreview {
  private state: BatchPreviewState = { pending: null, applied: null };
  private appliedVersion = -1;
  private readonly subs = new Set<() => void>();

  constructor(private readonly d: BatchPreviewDeps) {}

  subscribe = (cb: () => void): (() => void) => {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  };

  /** Foto estável (muda de referência só quando o estado muda). */
  snapshot = (): BatchPreviewState => this.state;

  private set(next: Partial<BatchPreviewState>): void {
    this.state = { ...this.state, ...next };
    for (const cb of [...this.subs]) {
      try { cb(); } catch { /* um assinante com defeito não derruba os demais */ }
    }
  }

  private out(o: BatchOutcome): BatchOutcome {
    try { this.d.onOutcome?.(o); } catch { /* aviso falho não vira erro */ }
    return o;
  }

  private fail(pluginId: string, pluginName: string, detail: string): BatchOutcome {
    this.d.log?.(pluginId, 'error', detail.slice(0, 500));
    return this.out({ kind: 'error', pluginName, detail: detail.slice(0, 300) });
  }

  /**
   * Recebe o valor devolvido por um handler. Devolve `null` se não for uma proposta (o chamador segue o caminho normal);
   * senão ensaia o lote e deixa a prévia pendente. NADA é aplicado aqui. Nunca lança.
   */
  offer(pluginId: string, pluginName: string, value: unknown): BatchOutcome | null {
    const parsed = parseProposal(value);
    if (!parsed) return null;
    try {
      if (!this.d.canWrite(pluginId)) return this.fail(pluginId, pluginName, 'permissão model.write não concedida');
      if (!this.d.model.rehearse) return this.fail(pluginId, pluginName, 'a porta de modelo não oferece ensaio; o lote não pode ser mostrado');
      const max = this.d.maxCommands?.(pluginId);
      const rehearsal = this.d.model.rehearse(pluginId, parsed.commands, max === undefined ? undefined : { maxCommands: max });
      this.set({ pending: { pluginId, pluginName, label: parsed.label, commands: parsed.commands, ...(parsed.note ? { note: parsed.note } : {}), rehearsal } });
      return this.out({ kind: 'proposed', pluginName, commands: rehearsal.commands });
    } catch (e) {
      return this.fail(pluginId, pluginName, e instanceof Error ? e.message : String(e));
    }
  }

  /** O usuário clicou em "Aplicar". Só aplica se o ensaio estava sem erros e a permissão continua valendo. */
  confirm(): BatchOutcome | null {
    const p = this.state.pending;
    if (!p) return null;
    this.set({ pending: null });
    if (!p.rehearsal.ok) return this.fail(p.pluginId, p.pluginName, p.rehearsal.errors[0]?.message ?? 'lote com erros');
    if (!this.d.canWrite(p.pluginId)) return this.fail(p.pluginId, p.pluginName, 'permissão model.write revogada');
    const max = this.d.maxCommands?.(p.pluginId);
    const r = this.d.model.apply(p.pluginId, p.label, p.commands, max === undefined ? undefined : { maxCommands: max });
    if (!r.ok) return this.fail(p.pluginId, p.pluginName, r.error);
    const { created, changed, deleted } = p.rehearsal;
    this.appliedVersion = this.d.version();
    this.set({ applied: { pluginName: p.pluginName, label: p.label, created, changed, deleted } });
    this.d.log?.(p.pluginId, 'info', `aplicou "${p.label}": ${created} criado(s), ${changed} alterado(s), ${deleted} apagado(s)`);
    return this.out({ kind: 'applied', pluginName: p.pluginName, created, changed, deleted });
  }

  cancel(): BatchOutcome | null {
    const p = this.state.pending;
    if (!p) return null;
    this.set({ pending: null });
    return this.out({ kind: 'cancelled', pluginName: p.pluginName });
  }

  /** Há uma aplicação que ainda é o último passo do histórico (nada mudou depois dela)? */
  canUndo(): boolean {
    return this.state.applied !== null && this.d.version() === this.appliedVersion;
  }

  /** Desfaz a aplicação (UM passo), só se ela ainda for a última alteração do projeto. */
  undo(): BatchOutcome | null {
    const a = this.state.applied;
    if (!a || !this.canUndo()) return null;
    this.d.undo();
    this.set({ applied: null });
    return this.out({ kind: 'undone', pluginName: a.pluginName });
  }
}
