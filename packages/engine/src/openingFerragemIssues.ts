import type { Opening, Project, ValidationIssue } from '@hestia/model';
import { t as tr, type Lang } from './i18nMessages.ts';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';

/**
 * Avisos de ferragem em vão com forma (docs/estudo-esquadrias/42): a folha não tem aresta de articulação longa o bastante para todas as
 * dobradiças do tipo (`ferragem-dobradicas-reduzidas`), ou nenhum lugar para a maçaneta (`ferragem-macaneta-removida`). A esquadria
 * já sai sem a ferragem que sobraria solta; o aviso diz quanto coube. Monta o modelo da esquadria (só para vãos com forma e ferragem).
 */
export function ferragemIssues(p: Project, o: Opening, lang: Lang): ValidationIssue[] {
  const f = frameOfWall(p, o.hostId);
  if (!f) return [];
  let avisos;
  try {
    avisos = buildOpeningModel(p, o, openingGeometry(p, o, f), f).ferragemAvisos ?? [];
  } catch {
    return []; // a falha do modelo é de outra validação
  }
  return avisos.map((a) =>
    a.tipo === 'hinge'
      ? { severity: 'warning', code: 'ferragem-dobradicas-reduzidas', message: tr(lang, 'egb_issue_opening_hinges', { id: o.id, leaf: a.folha, placed: a.colocado, wanted: a.pedido }), elementId: o.id }
      : { severity: 'warning', code: 'ferragem-macaneta-removida', message: tr(lang, 'egb_issue_opening_handle', { id: o.id, leaf: a.folha }), elementId: o.id },
  );
}
