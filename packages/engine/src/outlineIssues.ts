import type { Vec2 } from '@hestia/geom';
import { isFloor, isSlab, type Floor, type Project, type ValidationIssue } from '@hestia/model';
import { t, type DictKey, type Lang } from './i18nMessages.ts';
import { resolveBoundary, type OutlineProblem } from './outlineBound.ts';

/** Tolerância (m) para dizer que dois contornos são o mesmo circuito: 1 mm. */
const SAME_EPS = 1e-3;

const PROBLEM_TEXT: Record<OutlineProblem, DictKey> = {
  aberto: 'egb_outline_problem_open',
  fora: 'egb_outline_problem_outside',
};

const label = (e: { id: string; mark: string }): string => (e.mark ? `"${e.mark}" (${e.id})` : `"${e.id}"`);

/** Mesmo anel: mesmo número de vértices e cada vértice de um tem par no outro (até 1 mm). */
function sameRing(a: Vec2[], b: Vec2[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((q) => b.some((r) => Math.abs(q.x - r.x) <= SAME_EPS && Math.abs(q.y - r.y) <= SAME_EPS));
}

/** Mesmo contorno resolvido (anel externo e furos de ilhas, na mesma ordem). */
function samePolygon(a: Vec2[][], b: Vec2[][]): boolean {
  return a.length === b.length && a.every((ring, i) => sameRing(ring, b[i]!));
}

/**
 * Avisos dos contornos associativos (decisão 0023 §8.2c), do motor porque o circuito é derivado nele:
 * - `contorno-aberto`: piso ou laje vinculado às paredes cujo circuito não fecha mais; o motor mantém o último contorno.
 * - `piso-circuito-duplicado`: dois pisos vinculados ao mesmo circuito no mesmo nível (permitido; só informa a área repetida).
 */
export function outlineIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const resolvedFloors: { f: Floor; polygon: Vec2[][] }[] = [];
  for (const e of Object.values(p.elements)) {
    if (!(isFloor(e) || isSlab(e)) || !e.outlineSource?.linked) continue;
    const r = resolveBoundary(p, e.levelId, e);
    if (r.problem) {
      const kind = isFloor(e) ? t(lang, 'egb_kind_floor') : t(lang, 'egb_kind_slab');
      out.push({
        severity: 'warning',
        code: 'contorno-aberto',
        message: t(lang, 'egb_issue_outline_broken', {
          kind,
          label: label(e),
          problem: t(lang, PROBLEM_TEXT[r.problem]),
        }),
        elementId: e.id,
      });
    } else if (isFloor(e) && r.polygon) {
      resolvedFloors.push({ f: e, polygon: r.polygon });
    }
  }
  for (let i = 0; i < resolvedFloors.length; i++) {
    for (let j = i + 1; j < resolvedFloors.length; j++) {
      const a = resolvedFloors[i]!;
      const b = resolvedFloors[j]!;
      if (a.f.levelId !== b.f.levelId || !samePolygon(a.polygon, b.polygon)) continue;
      const levelName = p.levels.find((l) => l.id === a.f.levelId)?.name ?? a.f.levelId;
      out.push({
        severity: 'warning',
        code: 'piso-circuito-duplicado',
        message: t(lang, 'egb_issue_outline_duplicate', { a: label(a.f), b: label(b.f), level: levelName }),
        elementId: a.f.id,
        ids: [a.f.id, b.f.id],
      });
    }
  }
  return out;
}
