import { openingHeight, openingPlaneOf, openingRough, openingsOfWall, openingType, wallsOnLevel, type Project, type ValidationIssue } from '@hestia/model';
import { t as tr, type Lang } from './i18nMessages.ts';
import { levelFrames } from './resolveFrames.ts';
import { inclinedFitsArc } from './openingTilt.ts';

/**
 * Aviso F2.8: abertura em plano 'inclinado' (declarado ou padrão da janela) numa parede de arco inclinada cujo vão não
 * cabe no limite w² ≤ 0,4·R. O sólido usa o modo vertical nesse vão.
 */
export function openingPlaneIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  if (!Object.values(p.elements).some((e) => e.kind === 'wall' && !!e.tilt)) return [];
  const out: ValidationIssue[] = [];
  for (const lv of p.levels) {
    if (wallsOnLevel(p, lv.id).length === 0) continue;
    for (const f of levelFrames(p, lv.id)) {
      if (!f.wall.tilt || !f.arc) continue;
      for (const o of openingsOfWall(p, f.wall.id)) {
        if (openingPlaneOf(o) !== 'inclinado') continue;
        const t = openingType(p, o);
        const w = openingRough({ ...t, height: openingHeight(t, o) }).width;
        if (inclinedFitsArc(w, f.arc.radius)) continue;
        out.push({ severity: 'warning', code: 'aberturaPlanoVerticalNoArco', message: tr(lang, 'egb_issue_opening_plane_arc', { id: o.id }), elementId: o.id });
      }
    }
  }
  return out;
}
