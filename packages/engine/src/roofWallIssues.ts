import { formatQuantity, isWall, unitsOf, wallBaseElevation, type Project, type ValidationIssue } from '@hestia/model';
import { resolveAllFloors } from './floors.ts';
import { t, type Lang } from './i18nMessages.ts';
import { resolveAllRoofs } from './roofs.ts';
import { roofAxisReport } from './roofWall.ts';
import { resolveAllSlabs } from './slabs.ts';
import { wallZRange } from './wallZ.ts';

/** Folga (m) para a parede encostar na face inferior sem contar como atravessamento. */
const TOP_TOL = 1e-3;
/** Trecho sem telhado menor que isto (m) não é avisado. */
const UNCOVERED_TOL = 1e-3;

/**
 * Avisos entre paredes e telhados (docs/paridade/telhados C2). `wall-roof-uncovered`: parede anexada ao telhado cujo eixo
 * está fora do telhado em parte (ou todo). `wall-roof-pierce`: parede sem anexo que fica mais alta que a face inferior
 * do telhado num ponto do eixo coberto (atravessa o telhado). Parede curva entra pela face inferior amostrada ao longo do
 * arco (≤ 0,25 m); fica na altura normal, sem topo ajustado. O motor calcula; a interface junta.
 */
export function roofWallIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const roofs = resolveAllRoofs(p);
  const floors = resolveAllFloors(p);
  const slabs = resolveAllSlabs(p);
  const out: ValidationIssue[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e)) continue;
    const rep = roofAxisReport(e, roofs, wallBaseElevation(p, e));
    if (!rep) continue;
    if (e.attachTopToRoof) {
      if (rep.uncovered <= UNCOVERED_TOL) continue;
      const whole = rep.uncovered >= rep.length - UNCOVERED_TOL;
      out.push({
        severity: 'warning',
        code: 'wall-roof-uncovered',
        message: whole
          ? t(lang, 'egb_issue_wall_roof_none', { id: e.id })
          : t(lang, 'egb_issue_wall_roof_partial', { id: e.id, length: formatQuantity(unitsOf(p), 'length', rep.uncovered) }),
        elementId: e.id,
      });
    } else if (rep.minBottom !== null) {
      const z = wallZRange(p, e, floors, slabs, roofs);
      const top = z.z0 + z.height;
      if (top > rep.minBottom + TOP_TOL) {
        out.push({
          severity: 'warning',
          code: 'wall-roof-pierce',
          message: t(lang, 'egb_issue_wall_roof_over', { id: e.id, length: formatQuantity(unitsOf(p), 'length', top - rep.minBottom) }),
          elementId: e.id,
        });
      }
    }
  }
  return out;
}
