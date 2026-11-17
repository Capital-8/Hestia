import { duplicateOpeningType, isOpening, type Id, type OpeningType, type Project } from '@hestia/model';
import type { Lang } from '../../../editor/i18n.ts';

/** Projeto com o tipo em edição (rascunho) no lugar do gravado: duplicar e exportar levam o que está na tela. */
export const comRascunho = (p: Project, t: OpeningType): Project => ({ ...p, openingTypes: { ...p.openingTypes, [t.id]: t } });

/**
 * Cópia do rascunho com id, nome e código únicos (a mesma regra da biblioteca, em `duplicateOpeningType`). Não grava:
 * quem chama grava pelo comando e decide o que mostrar depois.
 */
export function copiaDoRascunho(p: Project, rascunho: OpeningType, lang: Lang): OpeningType {
  return duplicateOpeningType(comRascunho(p, rascunho), rascunho.id, lang);
}

/** Aberturas da seleção que usam o tipo `typeId` (as que um "Aplicar este tipo" trocaria). */
export function aberturasComTipo(p: Project, selecao: readonly Id[], typeId: Id): Id[] {
  return selecao.filter((id) => {
    const e = p.elements[id];
    return isOpening(e) && e.typeId === typeId;
  });
}
