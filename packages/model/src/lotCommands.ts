import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { isLot, normalizarLote } from './lot.ts';
import type { Lot } from './lotTypes.ts';
import { lotIssue } from './validateLot.ts';
import type { Project } from './types.ts';

/** Comando de lote, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type LotCommand = Extract<Command, { type: 'addLot' | 'updateLot' | 'setLotContorno' }>;

/** Garante contorno anti-horário (com os lados juntos) e valida; lança com a mensagem do modelo se o lote for inválido. */
function aceitar(l: Lot, lang: Lang): Lot {
  const { contorno, lados } = normalizarLote(l.contorno ?? [], l.lados ?? []);
  const next = { ...l, contorno, lados, limites: { ...(l.limites ?? {}) } };
  const issue = lotIssue(next, lang);
  if (issue) throw new Error(issue);
  return next;
}

/**
 * Aplica um comando de lote (A.3 item 4). Devolve false quando o comando não é de lote. Lote inválido é recusado
 * (lança) e o projeto não muda. Apagar usa o comando genérico `deleteElements`.
 */
export function applyLotCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addLot': {
      if (!p.levels.some((l) => l.id === c.lot.levelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.lot.levelId }));
      const l = aceitar({ ...c.lot, order: 0 }, lang);
      p.elements[l.id] = { ...l, order: p.nextOrder++ };
      return true;
    }
    case 'updateLot': {
      const e = p.elements[c.id];
      if (!isLot(e)) throw new Error(t(lang, 'md_cmd_lot_missing'));
      p.elements[c.id] = { ...aceitar({ ...e, ...c.patch }, lang), id: e.id, kind: 'lot', levelId: e.levelId, order: e.order };
      return true;
    }
    case 'setLotContorno': {
      const e = p.elements[c.id];
      if (!isLot(e)) throw new Error(t(lang, 'md_cmd_lot_missing'));
      p.elements[c.id] = aceitar({ ...e, contorno: c.contorno, lados: c.lados }, lang);
      return true;
    }
    default:
      return false;
  }
}
