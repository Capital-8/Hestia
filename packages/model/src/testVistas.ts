import { createEmptyProject } from './defaults.ts';
import { legacyRoofViewId } from './planViewIds.ts';
import { floorViewId, type PlanAnnotations, type PlanView } from './planView.ts';
import type { Id, Project } from './types.ts';
import { DEFAULT_VIEW_RANGE } from './viewRange.ts';

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

/** A cobertura migrada de um nível (`pvr_<nível>`: planta de piso com `showRoofOnTop`), como a migração 24 → 25 a deixa. */
export function coberturaMigradaDeTeste(p: Pick<Project, 'planViews'>, nivel: { id: Id; name: string }): PlanView {
  const piso = p.planViews.find((v) => v.id === floorViewId(nivel.id));
  return {
    id: legacyRoofViewId(nivel.id), name: `Cobertura: ${nivel.name}`, levelId: nivel.id, kind: 'floor', showRoofOnTop: true,
    viewRange: { ...(piso?.viewRange ?? DEFAULT_VIEW_RANGE) }, annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] },
  };
}

/**
 * Projeto vazio em que todo nível (ou só `levelId`) tem a cobertura migrada logo depois do piso, como a migração
 * 24 → 25 deixa. Os testes que antes contavam com a cobertura automática de todo nível partem daqui.
 */
export function projetoComCoberturaDeTeste(levelId?: Id): Project {
  const p = createEmptyProject();
  const views: PlanView[] = [];
  for (const v of p.planViews) {
    views.push(v);
    const nivel = p.levels.find((l) => l.id === v.levelId);
    if (v.id === floorViewId(v.levelId) && nivel && (levelId === undefined || levelId === nivel.id)) views.push(coberturaMigradaDeTeste(p, nivel));
  }
  p.planViews = views;
  return p;
}
