import { formatQuantity, isRoof, unitsOf, type Project, type Roof, type ValidationIssue } from '@hestia/model';
import { t, type Lang } from './i18nMessages.ts';
import { resolveAllRoofs } from './roofs.ts';

/** Nome do telhado no aviso: a marca quando existe, com o id entre parênteses (como o validador do modelo). */
const label = (r: Roof): string => (r.mark ? `"${r.mark}" (${r.id})` : `"${r.id}"`);

/**
 * Aviso não bloqueante (`roof-surface-step`): a superfície do telhado tem degrau num canto reentrante, onde uma empena
 * encosta em beiral. O telhado continua criado e desenhado; o aviso aponta o telhado para o painel de avisos ("Ir para").
 * Vem do motor (depende da geometria resolvida), como `roofWallIssues`.
 */
export function roofSurfaceIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const units = unitsOf(p);
  const out: ValidationIssue[] = [];
  for (const res of resolveAllRoofs(p)) {
    const steps = res.steps ?? [];
    if (steps.length === 0) continue;
    const roof = p.elements[res.roofId];
    if (!isRoof(roof)) continue;
    const worst = Math.max(...steps.map((s) => s.dz));
    const where =
      steps.length === 1
        ? t(lang, 'egb_issue_roof_step_one', { v: formatQuantity(units, 'smallLength', worst) })
        : t(lang, 'egb_issue_roof_step_many', { v: formatQuantity(units, 'smallLength', worst), n: steps.length });
    out.push({
      severity: 'warning',
      code: 'roof-surface-step',
      message: t(lang, 'egb_issue_roof_surface_step', { roof: label(roof), where }),
      elementId: roof.id,
    });
  }
  return out;
}
