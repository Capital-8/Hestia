import type { Command } from './commands.ts';
import { isFloor, isSlab, type Project } from './types.ts';
import { t, type Lang } from './i18n.ts';

/** Comando de contorno associativo (decisão 0023 §8.2), fora do `switch` de `commands.ts`. */
export type OutlineCommand = Extract<Command, { type: 'detachOutline' | 'relinkOutline' }>;

/**
 * Aplica um comando de vínculo do contorno de piso ou laje. Soltar (`detachOutline`) vira estático mantendo o último
 * contorno; revincular (`relinkOutline`) religa às paredes pela origem guardada (o contorno novo sai no motor).
 */
export function applyOutlineCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'detachOutline': {
      const e = p.elements[c.id];
      if (!isFloor(e) && !isSlab(e)) throw new Error(t(lang, 'md_cmd_element_missing'));
      if (e.outlineSource) e.outlineSource = { ...e.outlineSource, linked: false };
      return true;
    }
    case 'relinkOutline': {
      const e = p.elements[c.id];
      if (!isFloor(e) && !isSlab(e)) throw new Error(t(lang, 'md_cmd_element_missing'));
      if (!e.outlineSource) throw new Error(t(lang, 'md_cmd_outline_source_missing'));
      e.outlineSource = { ...e.outlineSource, linked: true };
      return true;
    }
    default:
      return false;
  }
}
