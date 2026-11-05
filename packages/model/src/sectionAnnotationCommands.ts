import { cleanSectionAnnotations, type SectionAnnotations } from './sectionAnnotations.ts';
import type { Project } from './types.ts';
import { t, type Lang } from './i18n.ts';

/**
 * Substitui o conjunto de anotações de uma vista de corte/elevação. É um comando completo para o desfazer guardar a
 * vista inteira; as ferramentas leem o conjunto atual e devolvem a próxima versão.
 */
export function applySectionAnnotations(p: Project, sectionId: string, annotations: SectionAnnotations | undefined, lang: Lang = 'pt'): void {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) throw new Error(t(lang, 'md_cmd_section_view_missing'));
  const clean = cleanSectionAnnotations(annotations);
  if (clean) view.annotations = clean;
  else delete view.annotations;
}
