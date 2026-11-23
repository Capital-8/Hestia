import type { FaceLayerTarget, FaceSlot, Id, Project } from '@hestia/model';
import type { PlanKind } from './openViews.ts';

/**
 * Identidade de uma vista (decisão 0060, §3.2): a ÚNICA fonte da chave de vista. Câmera 2D, visibilidade temporária,
 * abas, seletor de painel, marcação de prancha e alvo do DXF chamam as funções daqui; nenhum outro arquivo monta
 * `plan:<nível>` à mão (guarda de texto em `viewIdentity.test.ts`).
 *
 * Formato das chaves (o de `viewKey` de sempre, mais `pv:`):
 *   plan:<levelId>      planta de piso padrão
 *   pv:<planViewId>     planta de disciplina (planta de piso ADICIONAL do nível)
 *   roof:<levelId>      cobertura
 *   area:<areaPlanId>   planta de área
 *   section:<viewId>    corte ou elevação
 *   sheet:<sheetId>     prancha
 *   3d                  modelo 3D padrão
 *   3d:<viewId>         vista 3D salva (`Project.view3dViews`)
 *   face:<elementId>:<face>:<layer>
 */

/** Vista descrita por tipo: o formato de `OpenView` (aceita também `PaneView`). */
export type ViewIdentity =
  | { kind: 'plan'; levelId: Id; planKind?: PlanKind; areaPlanId?: Id | null; planViewId?: Id | null }
  | { kind: '3d'; viewId?: Id }
  | { kind: 'section'; viewId: Id }
  | { kind: 'sheet'; sheetId: Id }
  | { kind: 'face'; elementId: Id; face: FaceSlot; layer: FaceLayerTarget };

/** Vista descrita pelos campos da interface (subconjunto de `UiState`, `ActiveViewFields` e `PaneViewFields`). */
export interface ViewIdentityFields {
  view: 'plan' | '3d' | 'section' | 'sheet' | 'face';
  levelId: Id;
  sectionId?: Id | null;
  sheetId?: Id | null;
  planKind?: PlanKind;
  areaPlanId?: Id | null;
  planViewId?: Id | null;
  /** Vista 3D salva ativa quando `view` é '3d'; ausente ou nula = 3D padrão. */
  view3dViewId?: Id | null;
  faceView?: { elementId: Id; face: FaceSlot; layer: FaceLayerTarget } | null;
}

/**
 * Chave canônica da vista. Total: planta de área sem id cai no nível (`area:<nível>`), como sempre fez `viewKey`.
 * `planViewId` só vale na planta de piso (cobertura e área o ignoram).
 */
export function viewKey(v: ViewIdentity): string {
  switch (v.kind) {
    case 'plan':
      if (v.planKind === 'area') return `area:${v.areaPlanId ?? v.levelId}`;
      if (v.planKind === 'roof') return `roof:${v.levelId}`;
      return v.planViewId ? `pv:${v.planViewId}` : `plan:${v.levelId}`;
    case '3d':
      return v.viewId ? `3d:${v.viewId}` : '3d';
    case 'section':
      return `section:${v.viewId}`;
    case 'sheet':
      return `sheet:${v.sheetId}`;
    case 'face':
      return `face:${v.elementId}:${v.face}:${v.layer}`;
  }
}

/** Chave da planta de piso de um nível: a padrão, ou a de disciplina quando `planViewId` é dado. */
export function planKey(levelId: Id, planViewId?: Id | null): string {
  return viewKey({ kind: 'plan', levelId, planViewId });
}

/** Chave da planta (piso/cobertura/área/disciplina) descrita pelos campos, qualquer que seja `view`. É a da câmera 2D de painel de 3D, que segue a planta do nível. */
export function planKeyOfFields(f: Pick<ViewIdentityFields, 'levelId' | 'planKind' | 'areaPlanId' | 'planViewId'>): string {
  return viewKey({ kind: 'plan', levelId: f.levelId, planKind: f.planKind, areaPlanId: f.areaPlanId, planViewId: f.planViewId });
}

/**
 * Identidade da vista dos campos da interface; null quando o campo que a define falta (corte sem id, prancha sem id,
 * face sem estúdio). Planta de área sem id devolve a identidade com `areaPlanId` nulo (a chave cai no nível).
 */
export function identityOfFields(f: ViewIdentityFields): ViewIdentity | null {
  switch (f.view) {
    case 'plan':
      return { kind: 'plan', levelId: f.levelId, planKind: f.planKind, areaPlanId: f.areaPlanId, planViewId: f.planViewId };
    case '3d':
      return { kind: '3d', ...(f.view3dViewId ? { viewId: f.view3dViewId } : {}) };
    case 'section':
      return f.sectionId ? { kind: 'section', viewId: f.sectionId } : null;
    case 'sheet':
      return f.sheetId ? { kind: 'sheet', sheetId: f.sheetId } : null;
    case 'face':
      return f.faceView ? { kind: 'face', elementId: f.faceView.elementId, face: f.faceView.face, layer: f.faceView.layer } : null;
  }
}

/**
 * Chave da câmera 2D: cada planta tem a sua (cobertura, área e planta de disciplina do mesmo nível são outras); cada
 * corte ou elevação tem a própria. Em 3D, prancha e face a câmera 2D é a da planta do nível, como sempre foi.
 */
export function cameraKeyOf(f: ViewIdentityFields): string {
  return f.view === 'section' ? viewKey({ kind: 'section', viewId: String(f.sectionId) }) : planKeyOfFields(f);
}

/**
 * Chave da visibilidade temporária da vista ativa; null na prancha e no estúdio da face (não têm), e quando a vista
 * pede um id que não está definido (corte sem id, planta de área sem id).
 */
export function visibilityKeyOfFields(f: ViewIdentityFields): string | null {
  if (f.view === 'sheet' || f.view === 'face') return null;
  if (f.view === 'plan' && f.planKind === 'area' && !f.areaPlanId) return null;
  const id = identityOfFields(f);
  return id ? viewKey(id) : null;
}

/**
 * Chave do alvo do DXF da vista ativa: planta de piso (padrão ou de disciplina), área e corte. Cobertura, prancha e 3D
 * não têm DXF próprio e devolvem null.
 */
export function dxfTargetKeyOfFields(f: ViewIdentityFields): string | null {
  if (f.view === 'plan') {
    if (f.planKind === 'roof') return null;
    if (f.planKind === 'area') return f.areaPlanId ? viewKey({ kind: 'plan', levelId: f.levelId, planKind: 'area', areaPlanId: f.areaPlanId }) : null;
    return planKey(f.levelId, f.planViewId);
  }
  if (f.view === 'section' && f.sectionId) return viewKey({ kind: 'section', viewId: f.sectionId });
  return null;
}

/**
 * Planta de disciplina válida para a vista: só existe na planta de piso, e precisa existir no projeto e ser do mesmo
 * nível; senão null (a vista abre na planta padrão). Único ponto que aplica a regra.
 */
export function normalizaPlanViewId(p: Pick<Project, 'planViews'>, levelId: Id, planKind: PlanKind | string | undefined, planViewId: Id | null | undefined): Id | null {
  if (!planViewId) return null;
  if (planKind === 'roof' || planKind === 'area') return null;
  return (p.planViews ?? []).some((x) => x.id === planViewId && x.levelId === levelId) ? planViewId : null;
}

/**
 * Id da planta de disciplina da vista, no formato que o modelo recebe (`planGraphicsOf`, `planHiddenOf`, `planOf`):
 * `undefined` = planta padrão do nível. Só a planta de piso tem planta de disciplina; cobertura e área devolvem `undefined`.
 */
export function planViewIdDe(f: { view: string; planKind?: string; planViewId?: Id | null }): Id | undefined {
  if (f.view !== 'plan' || f.planKind === 'roof' || f.planKind === 'area') return undefined;
  return f.planViewId ?? undefined;
}

/** Alvo do diálogo de gráficos de uma planta de piso: o id do nível (planta padrão) ou `pv:<planViewId>` (disciplina). */
export function planDialogTarget(levelId: Id, planViewId?: Id | null): string {
  return planViewId ? `pv:${planViewId}` : levelId;
}

/** Aba do diálogo de gráficos: as substituições por categoria ou os tons por disciplina (decisão 0060 §4.2). */
export type GraphicsDialogTab = 'categories' | 'tones';
const TONES_TAB_SUFFIX = '#tones';

/** Alvo do diálogo de gráficos já aberto na aba de tons; o atalho da barra de vista usa este alvo. */
export function planTonesDialogTarget(levelId: Id, planViewId?: Id | null): string {
  return `${planDialogTarget(levelId, planViewId)}${TONES_TAB_SUFFIX}`;
}

/** Alvo do diálogo sem o sufixo da aba (o id do nível ou `pv:<id>`). */
export function dialogTargetWithoutTab(target: string): string {
  return target.endsWith(TONES_TAB_SUFFIX) ? target.slice(0, -TONES_TAB_SUFFIX.length) : target;
}

/** Aba inicial do diálogo de gráficos: `tones` quando o alvo veio do atalho de tons; senão, as categorias. */
export function graphicsDialogTabOfTarget(target: string): GraphicsDialogTab {
  return target.endsWith(TONES_TAB_SUFFIX) ? 'tones' : 'categories';
}

/** Id da planta de disciplina de um alvo do diálogo (`pv:<id>`, com ou sem o sufixo da aba); `undefined` quando o alvo é um nível. */
export function planViewIdOfDialogTarget(target: string): Id | undefined {
  const base = dialogTargetWithoutTab(target);
  return base.startsWith('pv:') ? base.slice(3) : undefined;
}
