import { formatQuantity, isWall, unitsOf, wallMaxHeight, wallBaseElevation, type Project, type ValidationIssue, type Wall } from '@hestia/model';
import { resolveAllFloors } from './floors.ts';
import { t, type Lang } from './i18nMessages.ts';
import { attachSpans } from './wallAttach.ts';
import { resolveAllSlabs } from './slabs.ts';

/** Trecho sem piso ou laje menor que isto (m) não é avisado. */
const UNCOVERED_TOL = 1e-3;

/**
 * Avisos entre paredes e pisos/lajes (decisão 0023 §6, P9). `wall-floor-partial` (informativo): a base ou o topo anexado
 * só é coberto em parte do eixo; só o trecho coberto foi ajustado. `wall-attach-none` (aviso): anexada à base ou ao topo,
 * mas nenhum piso ou laje do nível cobre o eixo, então a cota fica no modelo. O topo não é avaliado quando o topo vem do
 * telhado (`attachTopToRoof`) ou quando a parede tem perfil superior (o perfil já define o topo). O motor calcula; a
 * interface junta. Como em `roofWallIssues`, a cobertura vem dos mesmos trechos que a geometria usa.
 */
export function wallFloorIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const floors = resolveAllFloors(p);
  const slabs = resolveAllSlabs(p);
  const out: ValidationIssue[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e)) continue;
    const bottom = e.attachBottomToFloor === true;
    const top = e.attachTopToFloor === true && e.topLevelId !== null && !(e.topProfile && e.sag === 0) && e.attachTopToRoof !== true;
    if (!bottom && !top) continue;
    const base = wallBaseElevation(p, e);
    const spans = attachSpans(e, base, base + wallMaxHeight(p, e), bottom ? e.levelId : null, top ? e.topLevelId : null, floors, slabs);
    const L = spans.reduce((s, sp) => s + (sp.t1 - sp.t0), 0);
    if (bottom) out.push(...endIssues(e, 'base', L, spans.filter((s) => s.onBottom), unitsOf(p), lang));
    if (top) out.push(...endIssues(e, 'topo', L, spans.filter((s) => s.onTop), unitsOf(p), lang));
  }
  return out;
}

/** Aviso de uma extremidade (base ou topo) pela soma dos trechos aplicados. */
function endIssues(e: Wall, nome: 'base' | 'topo', L: number, aplicados: Array<{ t0: number; t1: number }>, units: ReturnType<typeof unitsOf>, lang: Lang): ValidationIssue[] {
  const coberto = aplicados.reduce((s, sp) => s + (sp.t1 - sp.t0), 0);
  if (coberto >= L - UNCOVERED_TOL) return [];
  const base = nome === 'base';
  const doAnexo = t(lang, base ? 'egb_wf_side_base' : 'egb_wf_side_top');
  if (coberto <= UNCOVERED_TOL) {
    const fim = t(lang, base ? 'egb_wf_end_base' : 'egb_wf_end_top');
    const cobre = t(lang, base ? 'egb_wf_cover_level' : 'egb_wf_cover_top');
    return [{ severity: 'warning', code: 'wall-attach-none', message: t(lang, 'egb_issue_wall_floor_none', { id: e.id, side: doAnexo, cover: cobre, end: fim }), elementId: e.id }];
  }
  return [
    {
      severity: 'info',
      code: 'wall-floor-partial',
      message: t(lang, 'egb_issue_wall_floor_partial', {
        id: e.id,
        side: doAnexo,
        a: formatQuantity(units, 'length', coberto),
        b: formatQuantity(units, 'length', L),
      }),
      elementId: e.id,
    },
  ];
}
