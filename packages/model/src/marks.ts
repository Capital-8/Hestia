import type { Id, Project } from './types.ts';

/** Prefixo da marca por categoria (convenção brasileira de esquadrias: P de porta, J de janela). */
export const MARK_PREFIX = { door: 'P', window: 'J' } as const;
export type MarkKind = keyof typeof MARK_PREFIX;

export interface MarkAssignment { id: Id; mark: string }

/** Marca com prefixo e número em 2 dígitos: P01, J12, P100. */
export const formatMark = (kind: MarkKind, n: number): string => `${MARK_PREFIX[kind]}${String(n).padStart(2, '0')}`;

interface Placed { id: Id; kind: MarkKind; mark: string; elevation: number; x: number; y: number }

function placedOpenings(p: Project): Placed[] {
  const out: Placed[] = [];
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'door' && e.kind !== 'window') continue;
    const host = p.elements[e.hostId];
    if (!host || host.kind !== 'wall') continue;
    const level = p.levels.find((l) => l.id === host.levelId);
    const dx = host.b.x - host.a.x;
    const dy = host.b.y - host.a.y;
    const len = Math.hypot(dx, dy) || 1;
    out.push({
      id: e.id,
      kind: e.kind,
      mark: typeof e.mark === 'string' ? e.mark : '',
      elevation: level?.elevation ?? 0,
      x: host.a.x + (dx * e.offset) / len,
      y: host.a.y + (dy * e.offset) / len,
    });
  }
  // Ordem de leitura: pavimento de baixo para cima, depois de cima para baixo e da esquerda para a direita na planta.
  return out.sort((a, b) => a.elevation - b.elevation || b.y - a.y || a.x - b.x || a.id.localeCompare(b.id));
}

/** Número de uma marca no formato `<prefixo><número>`, ou null. */
function numberOf(kind: MarkKind, mark: string): number | null {
  const m = new RegExp(`^${MARK_PREFIX[kind]}(\\d+)$`).exec(mark.trim());
  return m ? Number(m[1]) : null;
}

/**
 * Marcas a gravar. `onlyEmpty` (padrão) numera só quem está sem marca, continuando depois do maior número em uso;
 * `onlyEmpty: false` renumera tudo do zero, na ordem de leitura. Devolve só o que muda.
 */
export function markAssignments(p: Project, opts: { onlyEmpty?: boolean; kinds?: readonly MarkKind[]; ids?: ReadonlySet<Id> } = {}): MarkAssignment[] {
  const onlyEmpty = opts.onlyEmpty !== false;
  const kinds: readonly MarkKind[] = opts.kinds ?? ['door', 'window'];
  const all = placedOpenings(p);
  const out: MarkAssignment[] = [];
  for (const kind of kinds) {
    const mine = all.filter((o) => o.kind === kind);
    if (onlyEmpty) {
      const used = new Set(mine.map((o) => o.mark.trim()).filter((m) => m !== ''));
      let next = Math.max(0, ...mine.map((o) => numberOf(kind, o.mark) ?? 0)) + 1;
      for (const o of mine) {
        if (o.mark.trim() !== '' || (opts.ids && !opts.ids.has(o.id))) continue;
        let mark = formatMark(kind, next);
        while (used.has(mark)) { next += 1; mark = formatMark(kind, next); }
        used.add(mark);
        next += 1;
        out.push({ id: o.id, mark });
      }
    } else {
      mine.forEach((o, i) => {
        const mark = formatMark(kind, i + 1);
        if (o.mark !== mark) out.push({ id: o.id, mark });
      });
    }
  }
  return out;
}

/** Marcas repetidas entre esquadrias da mesma categoria: marca → ids. Marca vazia não conta. */
export function duplicateMarks(p: Project): Map<string, Id[]> {
  const byMark = new Map<string, Id[]>();
  for (const o of placedOpenings(p)) {
    const m = o.mark.trim();
    if (m === '') continue;
    byMark.set(m, [...(byMark.get(m) ?? []), o.id]);
  }
  for (const [m, ids] of [...byMark]) if (ids.length < 2) byMark.delete(m);
  return byMark;
}
