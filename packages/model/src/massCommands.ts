import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { copiarSecoes, isMass, normalizarSecoes } from './mass.ts';
import { arranjoIssue, massIssue, secoesIssue } from './validateMass.ts';
import type { Mass } from './massTypes.ts';
import type { Project } from './types.ts';

/** Comando de massa, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type MassCommand = Extract<Command, { type: 'addMass' | 'updateMass' | 'setMassSecoes' | 'setMassArranjo' }>;

/** Garante sentido anti-horário nos perfis livres e valida; lança com a mensagem do modelo se a massa for inválida. */
function aceitar(m: Mass, lang: Lang): Mass {
  const next = { ...m, secoes: normalizarSecoes(m.secoes ?? []) };
  const issue = massIssue(next, lang);
  if (issue) throw new Error(issue);
  return next;
}

/**
 * Aplica um comando de massa (A.3 item 4). Devolve false quando o comando não é de massa. Massa inválida é recusada
 * (lança) e o projeto não muda. Apagar usa o comando genérico `deleteElements`.
 */
export function applyMassCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addMass': {
      if (!p.levels.some((l) => l.id === c.mass.levelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.mass.levelId }));
      const m = aceitar({ ...c.mass, order: 0 }, lang);
      p.elements[m.id] = { ...m, secoes: copiarSecoes(m.secoes), order: p.nextOrder++ };
      return true;
    }
    case 'updateMass': {
      const e = p.elements[c.id];
      if (!isMass(e)) throw new Error(t(lang, 'md_cmd_mass_missing'));
      if (c.patch.levelId && !p.levels.some((l) => l.id === c.patch.levelId)) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.patch.levelId }));
      p.elements[c.id] = { ...aceitar({ ...e, ...c.patch }, lang), id: e.id, kind: 'mass', order: e.order };
      return true;
    }
    case 'setMassSecoes': {
      const e = p.elements[c.id];
      if (!isMass(e)) throw new Error(t(lang, 'md_cmd_mass_missing'));
      const secoes = normalizarSecoes(c.secoes);
      const issue = secoesIssue(secoes, lang);
      if (issue) throw new Error(issue);
      p.elements[c.id] = { ...e, secoes: copiarSecoes(secoes) };
      return true;
    }
    case 'setMassArranjo': {
      const e = p.elements[c.id];
      if (!isMass(e)) throw new Error(t(lang, 'md_cmd_mass_missing'));
      if (c.arranjo === null) {
        const { arranjo: _arranjo, ...sem } = e;
        p.elements[c.id] = sem;
        return true;
      }
      const issue = arranjoIssue(c.arranjo, lang);
      if (issue) throw new Error(issue);
      p.elements[c.id] = { ...e, arranjo: { ...c.arranjo } };
      return true;
    }
    default:
      return false;
  }
}
