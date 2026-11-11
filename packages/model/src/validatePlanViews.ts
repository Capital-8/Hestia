import { floorViewId, roofViewId } from './planViewIds.ts';
import { ANNOTATION_FAMILIES } from './planViewAnnotations.ts';
import type { ValidationIssue } from './validate.ts';
import type { Project } from './types.ts';

/**
 * Validação das vistas de planta (`Project.planViews`, esquema 24): cada vista aponta para um nível que existe, todo nível
 * tem exatamente uma planta de piso (`pv_<nível>`) e uma de cobertura (`pvr_<nível>`), ids de vista únicos, ids de anotação
 * únicos no projeto e o bloco `area` presente se e só se a vista é de área.
 */
export function planViewProblems(p: Project): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const views = p.planViews ?? [];
  const levels = new Set(p.levels.map((l) => l.id));
  const error = (code: string, message: string, elementId?: string): void => {
    out.push({ severity: 'error', code, message, ...(elementId ? { elementId } : {}) });
  };

  const seen = new Set<string>();
  for (const v of views) {
    const name = v.name.trim() || v.id;
    if (seen.has(v.id)) error('plan-view-id-duplicate', `A vista de planta "${name}" repete o id "${v.id}".`, v.id);
    seen.add(v.id);
    if (!levels.has(v.levelId)) error('plan-view-level-missing', `A vista de planta "${name}" (${v.id}) aponta para o nível "${v.levelId}", que não existe.`, v.id);
    if (v.kind === 'area' && !v.area) error('plan-view-area-block', `A vista de planta "${name}" (${v.id}) é de área e não tem os dados da planta de área.`, v.id);
    if (v.kind !== 'area' && v.area) error('plan-view-area-block', `A vista de planta "${name}" (${v.id}) tem dados de planta de área, mas não é de área.`, v.id);
  }

  for (const l of p.levels) {
    for (const [kind, id] of [['floor', floorViewId(l.id)], ['roof', roofViewId(l.id)]] as const) {
      const n = views.filter((v) => v.id === id && v.kind === kind && v.levelId === l.id).length;
      const nome = kind === 'floor' ? 'planta de piso' : 'planta de cobertura';
      if (n === 0) error('plan-view-main-missing', `O nível "${l.name}" (${l.id}) não tem a ${nome} principal ("${id}").`, l.id);
      else if (n > 1) error('plan-view-main-duplicate', `O nível "${l.name}" (${l.id}) tem mais de uma ${nome} principal ("${id}").`, l.id);
    }
  }

  const annotationIds = new Set<string>();
  for (const v of views) {
    for (const family of ANNOTATION_FAMILIES) {
      for (const x of v.annotations?.[family] ?? []) {
        if (annotationIds.has(x.id)) error('plan-view-annotation-id-duplicate', `O id de anotação "${x.id}" aparece mais de uma vez no projeto (vista "${v.name}").`, x.id);
        annotationIds.add(x.id);
      }
    }
  }
  return out;
}
