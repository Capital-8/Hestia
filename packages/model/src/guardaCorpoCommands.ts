import type { Command } from './commands.ts';
import { tipoGuardaCorpoIssue } from './guardaCorpo.ts';
import { prunePlanElementTags } from './areaPlanCommands.ts';
import { materializarPerfisNorma, NORMA_GC_PADRAO_ID, perfilNormaIssue, perfisNormaDo } from './guardaCorpoNorma.ts';
import { t, type Lang } from './i18n.ts';
import { isGuardaCorpo, type Id, type Project } from './types.ts';

/** Comando de guarda-corpo, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type GuardaCorpoCommand = Extract<
  Command,
  {
    type:
      | 'addGuardaCorpo'
      | 'updateGuardaCorpo'
      | 'deleteGuardaCorpo'
      | 'upsertTipoGuardaCorpo'
      | 'deleteTipoGuardaCorpo'
      | 'upsertPerfilNorma'
      | 'deletePerfilNorma'
      | 'setNormaGuardaCorpo';
  }
>;

/** Perfis de norma que um guarda-corpo ou tipo referencia, por id. */
function normaEmUso(p: Project, id: Id): boolean {
  if (Object.values(p.tiposGuardaCorpo ?? {}).some((tipo) => tipo.normaId === id)) return true;
  return Object.values(p.elements).some((e) => isGuardaCorpo(e) && e.sobrescritas?.normaId === id);
}

/**
 * Aplica um comando de guarda-corpo (decisão 0055 §4.4). Devolve false quando o comando não é de guarda-corpo: quem
 * chama segue o `switch` normal de `applyCommand`.
 */
export function applyGuardaCorpoCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addGuardaCorpo': {
      if (!p.tiposGuardaCorpo?.[c.guardaCorpo.typeId]) throw new Error(t(lang, 'md_cmd_gc_type_missing'));
      p.elements[c.guardaCorpo.id] = { ...c.guardaCorpo, order: p.nextOrder++ };
      return true;
    }
    case 'updateGuardaCorpo': {
      const e = p.elements[c.id];
      if (!isGuardaCorpo(e)) throw new Error(t(lang, 'md_cmd_gc_missing'));
      if (c.patch.typeId && !p.tiposGuardaCorpo?.[c.patch.typeId]) throw new Error(t(lang, 'md_cmd_gc_type_missing'));
      p.elements[c.id] = { ...e, ...c.patch };
      return true;
    }
    case 'deleteGuardaCorpo': {
      // Guarda-corpo é folha: sai do modelo e das marcações de planta (como deleteElements).
      delete p.elements[c.id];
      for (const level of p.levels) if (level.tags?.length) level.tags = level.tags.filter((tag) => tag.hostId !== c.id);
      prunePlanElementTags(p);
      return true;
    }
    case 'upsertTipoGuardaCorpo': {
      const issue = tipoGuardaCorpoIssue(c.tipo, lang);
      if (issue) throw new Error(issue);
      p.tiposGuardaCorpo = { ...(p.tiposGuardaCorpo ?? {}), [c.tipo.id]: c.tipo };
      return true;
    }
    case 'deleteTipoGuardaCorpo': {
      const tipos = p.tiposGuardaCorpo ?? {};
      if (Object.values(p.elements).some((e) => isGuardaCorpo(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      if (Object.keys(tipos).length <= 1) throw new Error(t(lang, 'md_cmd_gc_last_type'));
      delete tipos[c.id];
      return true;
    }
    case 'upsertPerfilNorma': {
      const issue = perfilNormaIssue(c.perfil, lang);
      if (issue) throw new Error(issue);
      materializarPerfisNorma(p, lang)[c.perfil.id] = c.perfil;
      return true;
    }
    case 'deletePerfilNorma': {
      if (!perfisNormaDo(p)[c.id]) throw new Error(t(lang, 'md_cmd_gc_norm_missing'));
      if (c.id === (p.settings.normaGuardaCorpoId ?? NORMA_GC_PADRAO_ID)) throw new Error(t(lang, 'md_cmd_gc_norm_project'));
      if (normaEmUso(p, c.id)) throw new Error(t(lang, 'md_cmd_gc_norm_in_use'));
      delete materializarPerfisNorma(p, lang)[c.id];
      return true;
    }
    case 'setNormaGuardaCorpo': {
      if (!perfisNormaDo(p)[c.id]) throw new Error(t(lang, 'md_cmd_gc_norm_missing'));
      p.settings.normaGuardaCorpoId = c.id;
      return true;
    }
    default:
      return false;
  }
}
