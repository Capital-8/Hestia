import { isOpening, type Id, type Project } from './types.ts';
import { t, type Lang } from './i18n.ts';

/**
 * Remoção segura de tipo de abertura e de material (suplementos, decisão 0057, fase G). Não existiam comandos para isso:
 * o catálogo só crescia. Ambos recusam o que está em uso (o app e o lote de plugin viram erro e nada muda).
 */
export type PluginContentCommand = { type: 'deleteOpeningType'; id: Id } | { type: 'deleteMaterial'; id: Id };

/** Quantas vezes o id aparece entre as referências do projeto (fora do próprio cadastro de materiais e dos dados de plugin). */
export function materialReferences(p: Project, id: Id): number {
  const rest = JSON.stringify({ ...p, materials: undefined, plugins: undefined });
  return rest.split(`"${id}"`).length - 1;
}

/** Aplica o comando. Devolve false quando o comando não é desta família (quem chama segue o `switch`). */
export function applyPluginContentCommand(p: Project, c: { type: string; id?: Id }, lang: Lang): boolean {
  if (c.type === 'deleteOpeningType') {
    const id = c.id as Id;
    if (!p.openingTypes[id]) return true;
    if (Object.values(p.elements).some((e) => isOpening(e) && e.typeId === id)) throw new Error(t(lang, 'md_cmd_type_in_use'));
    if (p.defaults.doorTypeId === id || p.defaults.windowTypeId === id) throw new Error(t(lang, 'md_cmd_default_type_undeletable'));
    delete p.openingTypes[id];
    const fav = p.settings?.favoriteOpeningTypes;
    if (fav?.includes(id)) p.settings = { ...p.settings, favoriteOpeningTypes: fav.filter((x) => x !== id) };
    return true;
  }
  if (c.type === 'deleteMaterial') {
    const id = c.id as Id;
    if (!p.materials[id]) return true;
    if (materialReferences(p, id) > 0) throw new Error(t(lang, 'md_cmd_type_in_use'));
    delete p.materials[id];
    return true;
  }
  return false;
}
