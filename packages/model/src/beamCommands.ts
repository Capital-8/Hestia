import { beamTypesOf, isBeam } from './beam.ts';
import type { Command } from './commands.ts';
import type { Beam } from './estrTypes.ts';
import { t, type Lang } from './i18n.ts';
import type { Project } from './types.ts';
import { beamIssue, beamTypeIssue, materiaisIssue, nivelIssue } from './validateEstr.ts';

/** Comando de viga, sem o `switch` de `commands.ts` (aquele arquivo passa do limite de linhas). */
export type BeamCommand = Extract<Command, { type: 'addBeam' | 'updateBeam' | 'setBeamType' | 'upsertBeamType' | 'deleteBeamType' }>;

/** Valida a viga contra o projeto (nível, tipo e regras da própria viga); lança se inválida. */
function aceitar(p: Project, b: Beam, lang: Lang): Beam {
  if (!beamTypesOf(p)[b.typeId]) throw new Error(t(lang, 'md_cmd_beam_type_missing'));
  const issue = nivelIssue(p, b.levelId, lang) ?? beamIssue(b, lang);
  if (issue) throw new Error(issue);
  return b;
}

/** Aplica um comando de viga (A.3). Devolve false quando o comando não é de viga. Apagar usa `deleteElements`. */
export function applyBeamCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addBeam': {
      const b = aceitar(p, { ...structuredClone(c.beam), order: 0 }, lang);
      p.elements[b.id] = { ...b, order: p.nextOrder++ };
      return true;
    }
    case 'updateBeam': {
      const e = p.elements[c.id];
      if (!isBeam(e)) throw new Error(t(lang, 'md_cmd_beam_missing'));
      p.elements[c.id] = { ...aceitar(p, { ...e, ...structuredClone(c.patch) }, lang), id: e.id, kind: 'beam', order: e.order };
      return true;
    }
    case 'setBeamType': {
      if (!beamTypesOf(p)[c.typeId]) throw new Error(t(lang, 'md_cmd_beam_type_missing'));
      for (const id of c.ids) {
        const e = p.elements[id];
        if (isBeam(e)) p.elements[id] = { ...e, typeId: c.typeId };
      }
      return true;
    }
    case 'upsertBeamType': {
      const tipo = structuredClone(c.beamType);
      const issue = beamTypeIssue(tipo, lang) ?? materiaisIssue(p, [tipo.materialId], lang);
      if (issue) throw new Error(issue);
      p.beamTypes = { ...beamTypesOf(p), [tipo.id]: tipo };
      return true;
    }
    case 'deleteBeamType': {
      if (Object.values(p.elements).some((e) => isBeam(e) && e.typeId === c.id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
      const { [c.id]: _fora, ...resto } = beamTypesOf(p);
      p.beamTypes = resto;
      return true;
    }
    default:
      return false;
  }
}
