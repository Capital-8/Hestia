import type { Command } from './commands.ts';
import type { Footing } from './estrTypes.ts';
import { footingTypesOf, isFooting } from './footing.ts';
import { t, type Lang } from './i18n.ts';
import type { Project } from './types.ts';
import { footingIssue, footingTypeIssue, hospedeiroIssue, materiaisIssue, nivelIssue } from './validateEstr.ts';

/** Comando de fundação, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type FootingCommand = Extract<Command, { type: 'addFooting' | 'updateFooting' | 'setFootingType' | 'upsertFootingType' | 'deleteFootingType' }>;

/** Valida a fundação contra o projeto (nível, tipo, parede e regras da própria fundação); lança se inválida. */
function aceitar(p: Project, f: Footing, lang: Lang): Footing {
  const tipo = footingTypesOf(p)[f.typeId];
  if (!tipo) throw new Error(t(lang, 'md_cmd_footing_type_missing'));
  const issue = nivelIssue(p, f.levelId, lang) ?? hospedeiroIssue(p, f.hostWallId, lang) ?? footingIssue(f, tipo, lang);
  if (issue) throw new Error(issue);
  return f;
}

/** Aplica um comando de fundação (A.3). Devolve false quando o comando não é de fundação. Apagar usa `deleteElements`. */
export function applyFootingCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addFooting': {
      const f = aceitar(p, { ...structuredClone(c.footing), order: 0 }, lang);
      p.elements[f.id] = { ...f, order: p.nextOrder++ };
      return true;
    }
    case 'updateFooting': {
      const e = p.elements[c.id];
      if (!isFooting(e)) throw new Error(t(lang, 'md_cmd_footing_missing'));
      p.elements[c.id] = { ...aceitar(p, { ...e, ...structuredClone(c.patch) }, lang), id: e.id, kind: 'footing', order: e.order };
      return true;
    }
    case 'setFootingType': {
      // A troca de tipo não pode mudar o modo (isolada tem `pos`, corrida tem `a` e `b`): cada fundação é revalidada.
      if (!footingTypesOf(p)[c.typeId]) throw new Error(t(lang, 'md_cmd_footing_type_missing'));
      for (const id of c.ids) {
        const e = p.elements[id];
        if (isFooting(e)) p.elements[id] = aceitar(p, { ...e, typeId: c.typeId }, lang);
      }
      return true;
    }
    case 'upsertFootingType': {
      const tipo = structuredClone(c.footingType);
      const issue = footingTypeIssue(tipo, lang) ?? materiaisIssue(p, [tipo.materialId], lang);
      if (issue) throw new Error(issue);
      const modoMudou = Object.values(p.elements).some((e) => isFooting(e) && e.typeId === tipo.id && footingTypesOf(p)[tipo.id]?.modo !== tipo.modo);
      if (modoMudou) throw new Error(t(lang, 'md_cmd_type_in_use'));
      p.footingTypes = { ...footingTypesOf(p), [tipo.id]: tipo };
      return true;
    }
    case 'deleteFootingType': {
      if (Object.values(p.elements).some((e) => isFooting(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      const { [c.id]: _fora, ...resto } = footingTypesOf(p);
      p.footingTypes = resto;
      return true;
    }
    default:
      return false;
  }
}
