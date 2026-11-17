/**
 * Protocolo das ferramentas interativas de suplementos (spec 08 §4 `tools`, fase H). O host captura cliques e posições
 * com os snaps do app e os envia ao handler como EVENTOS; o handler responde com uma RESPOSTA: rascunho de prévia e, ao
 * confirmar, um lote de comandos. A resposta vem de código de terceiros: `sanitizeToolReply` valida e LIMITA tudo.
 */
import type { ToolPromptKind } from './contributesTypes.ts';

export interface ToolPoint { x: number; y: number }

/** O que foi coletado dos `prompts`: ponto, linha (2 pontos), polilinha (N pontos) ou elemento escolhido. */
export type ToolCollected = ToolPoint | ToolPoint[] | { elementId: string };

export type ToolEvent =
  /** Ferramenta ativada. `values` são os valores validados do diálogo que a abriu (metro e radiano), se houve. */
  | { type: 'start'; tool: string; prompts: Array<{ key: string; kind: ToolPromptKind }>; values?: Record<string, unknown> }
  /** Clique confirmado (já com snap, em metros). `complete`: todos os `prompts` foram respondidos; `collected` por `key`. */
  | { type: 'point'; key: string; kind: ToolPromptKind; point: ToolPoint; elementId?: string; complete: boolean; collected: Record<string, ToolCollected> }
  /** Cursor movido (já com snap, em metros), com o que foi coletado até agora. */
  | { type: 'move'; key: string; point: ToolPoint; collected: Record<string, ToolCollected> }
  /** Tecla de comando: `Enter`, `Tab` ou `Space`. Esc não chega aqui: vira `cancel`. */
  | { type: 'key'; key: 'Enter' | 'Tab' | 'Space' }
  | { type: 'cancel' };

export interface ToolDraft {
  lines: Array<{ a: ToolPoint; b: ToolPoint; dashed?: boolean }>;
  points: ToolPoint[];
  labels: Array<{ at: ToolPoint; text: string }>;
}

export interface ToolReply {
  /** Rascunho de pré-visualização; ausente mantém o anterior, vazio (`{ lines: [] ... }`) limpa. */
  draft?: ToolDraft;
  /** Lote de comandos aplicado pela porta de escrita (um passo de desfazer). */
  commit?: { label: string; commands: unknown[] };
  /** Mensagem curta para a barra de estado. */
  message?: string;
  /** Encerra a ferramenta. */
  done?: boolean;
}

/** Limites do rascunho e da resposta (o handler é código não confiável). Coordenadas em metro. */
export const TOOL_LIMITS = { lines: 500, points: 500, labels: 50, labelChars: 80, messageChars: 200, commitLabelChars: 80, coord: 1e6 } as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function pt(v: unknown): ToolPoint | null {
  if (!isObj(v)) return null;
  const { x, y } = v;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > TOOL_LIMITS.coord || Math.abs(y) > TOOL_LIMITS.coord) return null;
  return { x, y };
}

/** Rascunho válido ou `null`. Itens inválidos são descartados; o excesso é cortado nos limites. */
export function sanitizeDraft(raw: unknown): ToolDraft | null {
  if (!isObj(raw)) return null;
  const draft: ToolDraft = { lines: [], points: [], labels: [] };
  if (Array.isArray(raw.lines)) {
    for (const l of raw.lines.slice(0, TOOL_LIMITS.lines)) {
      const a = isObj(l) ? pt(l.a) : null, b = isObj(l) ? pt(l.b) : null;
      if (a && b) draft.lines.push({ a, b, ...(isObj(l) && l.dashed === true ? { dashed: true } : {}) });
    }
  }
  if (Array.isArray(raw.points)) for (const p of raw.points.slice(0, TOOL_LIMITS.points)) { const q = pt(p); if (q) draft.points.push(q); }
  if (Array.isArray(raw.labels)) {
    for (const l of raw.labels.slice(0, TOOL_LIMITS.labels)) {
      const at = isObj(l) ? pt(l.at) : null;
      if (at && isObj(l) && typeof l.text === 'string') draft.labels.push({ at, text: l.text.slice(0, TOOL_LIMITS.labelChars) });
    }
  }
  return draft;
}

/**
 * Valida a resposta do handler. Qualquer coisa que não seja objeto vira resposta vazia. `commit` exige lista de comandos
 * (o conteúdo de cada comando é validado depois, pela porta de escrita, contra a lista branca do host).
 */
export function sanitizeToolReply(raw: unknown): ToolReply {
  if (!isObj(raw)) return {};
  const out: ToolReply = {};
  const draft = raw.draft === undefined ? null : sanitizeDraft(raw.draft);
  if (draft) out.draft = draft;
  if (isObj(raw.commit) && Array.isArray(raw.commit.commands)) {
    const label = typeof raw.commit.label === 'string' && raw.commit.label.trim() !== '' ? raw.commit.label.slice(0, TOOL_LIMITS.commitLabelChars) : 'ferramenta';
    out.commit = { label, commands: raw.commit.commands };
  }
  if (typeof raw.message === 'string' && raw.message !== '') out.message = raw.message.slice(0, TOOL_LIMITS.messageChars);
  if (raw.done === true) out.done = true;
  return out;
}
