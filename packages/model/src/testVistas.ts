import { legacyRoofViewId } from './planViewIds.ts';
import { floorViewId, type PlanAnnotations, type PlanView } from './planView.ts';
import type { Id, Project } from './types.ts';

/**
 * Auxiliar de TESTE (exportado pelo `index.ts` só para os testes dos outros pacotes; nenhum código de produção o usa): monta e altera, pela forma nova (`Project.planViews`), o que os testes
 * antigos montavam à mão em `level.viewRange`, `level.graphics`, `level.hidden`, `level.roofHidden`, `level.dimensions` etc.
 * e em `Project.areaPlans`. Altera o projeto no lugar (use sobre projeto próprio do teste, não sobre o de um `ProjectStore`
 * com histórico).
 */
type ViewPatch = Partial<Pick<PlanView, 'viewRange' | 'graphics' | 'hidden' | 'name'>> & { annotations?: Partial<PlanAnnotations> };

/** Vista pelo id; lança se não existe (erro de montagem do teste). */
export function viewOfTest(p: Project, viewId: Id): PlanView {
  const v = p.planViews.find((x) => x.id === viewId);
  if (!v) throw new Error(`teste: vista "${viewId}" não existe`);
  return v;
}

/** Altera a vista (mescla `annotations` família a família). `undefined` num campo apaga o campo. */
export function patchViewOfTest(p: Project, viewId: Id, patch: ViewPatch): Project {
  const v = viewOfTest(p, viewId);
  const { annotations, ...rest } = patch;
  for (const [k, x] of Object.entries(rest)) {
    if (x === undefined) delete (v as unknown as Record<string, unknown>)[k];
    else (v as unknown as Record<string, unknown>)[k] = x;
  }
  if (annotations) v.annotations = { ...v.annotations, ...annotations };
  return p;
}

/** Atalho: a planta de piso do nível (o que antes era "o nível"). */
export const patchFloorOfTest = (p: Project, levelId: Id, patch: ViewPatch): Project => patchViewOfTest(p, floorViewId(levelId), patch);

/** Atalho: a cobertura migrada do nível (`pvr_<nível>`, só existe em projeto vindo da migração). */
export const patchRoofOfTest = (p: Project, levelId: Id, patch: ViewPatch): Project => patchViewOfTest(p, legacyRoofViewId(levelId), patch);
