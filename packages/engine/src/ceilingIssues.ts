import { ceilingTypeThickness, followsRoom, formatQuantity, isCeiling, isWall, levelElevation, unitsOf, wallsOnLevel, type Ceiling, type Id, type Project, type ValidationIssue } from '@hestia/model';
import { ceilingOutline, roomsById, type CeilingRoomProblem, type RoomsById } from './ceilings.ts';
import { t, type DictKey, type Lang } from './i18nMessages.ts';
import { elementZRange } from './viewClass.ts';

/** Tolerância (m) para a comparação de cotas: 1 mm. */
const EPS = 1e-3;

const label = (c: Ceiling): string => (c.mark ? `"${c.mark}" (${c.id})` : `"${c.id}"`);

const ROOM_PROBLEM_TEXT: Record<CeilingRoomProblem, DictKey> = {
  aberto: 'egb_ceiling_room_open',
  fora: 'egb_ceiling_room_outside',
  apagado: 'egb_ceiling_room_deleted',
};

/**
 * Avisos dos forros (decisão 0021): forro sem contorno, tipo ausente, e forro cuja face inferior fica acima da parede
 * mais baixa do nível (o forro deveria ficar abaixo do topo das paredes que o cercam). Não bloqueia nada.
 * `forro-ambiente-aberto` (decisão 0023 §13, P-5): forro que acompanha o ambiente e não o segue (vão, ponto fora ou
 * ambiente apagado); o forro mantém o último contorno gravado.
 */
export function ceilingIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const units = unitsOf(p);
  const out: ValidationIssue[] = [];
  const roomsCache = new Map<Id, RoomsById>();
  for (const c of Object.values(p.elements).filter(isCeiling)) {
    const name = label(c);
    if (c.boundary.length < 3) {
      out.push({ severity: 'error', code: 'ceiling-no-boundary', message: t(lang, 'egb_issue_ceiling_no_boundary', { name }), elementId: c.id });
      continue;
    }
    const ceilingType = p.ceilingTypes[c.typeId];
    if (!ceilingType) {
      out.push({ severity: 'error', code: 'ceiling-type-missing', message: t(lang, 'egb_issue_ceiling_type_missing', { name }), elementId: c.id });
      continue;
    }
    if (followsRoom(c)) {
      if (!roomsCache.has(c.levelId)) roomsCache.set(c.levelId, roomsById(p, c.levelId));
      const { problem } = ceilingOutline(p, c, roomsCache.get(c.levelId));
      if (problem) {
        out.push({
          severity: 'warning',
          code: 'forro-ambiente-aberto',
          message: t(lang, 'egb_issue_ceiling_follows_room', { name, problem: t(lang, ROOM_PROBLEM_TEXT[problem]) }),
          elementId: c.id,
        });
      }
    }
    const walls = wallsOnLevel(p, c.levelId).filter(isWall);
    if (walls.length === 0) continue;
    const lowestTop = Math.min(...walls.map((w) => elementZRange(p, w)?.z1 ?? Infinity));
    const underside = levelElevation(p, c.levelId) + c.heightOffset - ceilingTypeThickness(ceilingType);
    if (underside > lowestTop + EPS) {
      out.push({
        severity: 'warning',
        code: 'ceiling-above-wall',
        message: t(lang, 'egb_issue_ceiling_above_wall', {
          name,
          a: formatQuantity(units, 'length', underside),
          b: formatQuantity(units, 'length', lowestTop),
        }),
        elementId: c.id,
      });
    }
  }
  return out;
}
