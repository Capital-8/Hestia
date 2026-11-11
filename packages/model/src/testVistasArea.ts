import type { AreaPlan } from './areaPlan.ts';
import { inheritedAnnotations, normalizeAnnotations } from './planViewAnnotations.ts';
import { floorViewId, type PlanAnnotations, type PlanView } from './planView.ts';
import type { Id, Project } from './types.ts';
import { DEFAULT_VIEW_RANGE } from './viewRange.ts';
import type { ViewGraphics, ViewHidden } from './graphics.ts';
import type { ViewRange } from './viewRange.ts';

/** Auxiliares de TESTE que devolvem projeto NOVO (ver `testVistas.ts` para os que alteram no lugar). */
type ViewPatch = { viewRange?: ViewRange; graphics?: ViewGraphics; hidden?: ViewHidden; name?: string; annotations?: Partial<PlanAnnotations> };

/** Projeto novo com a vista alterada (a vista alterada é nova; o resto compartilha). `undefined` num campo apaga o campo. */
export function withViewPatchOfTest(p: Project, viewId: Id, patch: ViewPatch): Project {
  const { annotations, ...rest } = patch;
  return {
    ...p,
    planViews: p.planViews.map((v) => {
      if (v.id !== viewId) return v;
      const next = { ...v, ...rest } as PlanView;
      for (const [k, x] of Object.entries(rest)) if (x === undefined) delete (next as unknown as Record<string, unknown>)[k];
      if (annotations) next.annotations = { ...v.annotations, ...annotations };
      return next;
    }),
  };
}

/** A planta de piso do nível alterada, num projeto novo. */
export const withFloorPatchOfTest = (p: Project, levelId: Id, patch: ViewPatch): Project => withViewPatchOfTest(p, floorViewId(levelId), patch);

/**
 * Registra plantas de área (objetos `AreaPlan` montados à mão) como vistas `area` do projeto, num projeto novo. A vista leva
 * o intervalo e os gráficos da planta de piso do nível. `annotations` ausente (a antiga herança) vira cópia das anotações
 * do nível que a planta desenha, como o comando `addAreaPlan` faz; uma planta já registrada com o mesmo id é substituída.
 */
export function withAreaPlansOfTest(p: Project, areas: readonly AreaPlan[]): Project {
  const ids = new Set(areas.map((a) => a.id));
  const views = areas.map((a): PlanView => {
    const floor = p.planViews.find((v) => v.id === floorViewId(a.levelId));
    const view: PlanView = {
      id: a.id, name: a.name, levelId: a.levelId, kind: 'area', viewRange: floor?.viewRange ?? { ...DEFAULT_VIEW_RANGE },
      annotations: a.annotations ? normalizeAnnotations(a.annotations) : inheritedAnnotations(floor?.annotations, a.id, a.graphics),
      area: { scale: a.scale, graphics: a.graphics, tags: a.tags },
    };
    if (floor?.graphics) view.graphics = floor.graphics;
    if (a.hidden) view.hidden = a.hidden;
    if (a.schemeId !== undefined) view.area!.schemeId = a.schemeId;
    if (a.legend) view.area!.legend = a.legend;
    if (a.table) view.area!.table = a.table;
    return view;
  });
  return { ...p, planViews: [...p.planViews.filter((v) => !ids.has(v.id)), ...views] };
}
