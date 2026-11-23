import type { FaceLayerTarget, FaceSlot, Id } from '@hestia/model';
import { viewKey as identityKey } from './viewIdentity.ts';

/**
 * Planta de piso (padrão), de cobertura ou de área. A de cobertura é a planta do nível com o telhado completo
 * e opaco; a de área é uma vista própria (`AreaPlan`) com linhas de referência, etiquetas e quadro. A planta de
 * disciplina NÃO é um tipo novo: é `floor` com `planViewId` (decisão 0060, §3.1).
 */
export type PlanKind = 'floor' | 'roof' | 'area';

/**
 * Vista aberta na barra de vistas. É estado de sessão (não é salvo no projeto): separa "níveis do projeto"
 * de "vistas abertas". Plantas são por nível (`planKind` ausente = piso); corte/elevação por id da vista; prancha por id da folha.
 */
export type OpenView =
  | { kind: 'plan'; levelId: Id; planKind?: PlanKind; areaPlanId?: Id; planViewId?: Id }
  | { kind: '3d'; viewId?: Id }
  | { kind: 'section'; viewId: Id }
  | { kind: 'sheet'; sheetId: Id }
  | { kind: 'face'; elementId: Id; face: FaceSlot; layer: FaceLayerTarget };

/** Campos de vista da interface que determinam a vista ativa (subconjunto de `UiState`). */
export interface ActiveViewFields {
  view: 'plan' | '3d' | 'section' | 'sheet' | 'face';
  levelId: Id;
  sectionId: Id | null;
  sheetId: Id | null;
  /** Tipo da planta quando `view` é 'plan'; ausente = piso. */
  planKind?: PlanKind;
  /** Planta de área ativa quando `planKind` é 'area'. */
  areaPlanId?: Id | null;
  /** Planta de disciplina ativa quando `planKind` é 'floor'; ausente ou nulo = planta padrão do nível. */
  planViewId?: Id | null;
  /** Vista 3D salva quando `view` é '3d'; ausente ou nulo = 3D padrão. */
  view3dViewId?: Id | null;
  /** Estúdio da face (2D) ativo quando `view` é 'face'. */
  faceView?: { elementId: Id; face: FaceSlot; layer: FaceLayerTarget } | null;
}

/** Tipo da planta de uma vista: 'floor' para qualquer vista que não seja de cobertura ou de área. */
export function planKindOf(v: { planKind?: PlanKind }): PlanKind {
  return v.planKind === 'roof' ? 'roof' : v.planKind === 'area' ? 'area' : 'floor';
}

/** Padrão ao abrir um projeto: só o nível ativo, que é o primeiro nível do projeto. */
export function defaultOpenViews(levelIds: readonly Id[]): OpenView[] {
  return [{ kind: 'plan', levelId: levelIds[0] ?? 'lv_0' }];
}

/** Chave estável de uma vista (serve de `key` na barra e para comparar vistas). Piso, cobertura, área e planta de disciplina são distintas. Ver `viewIdentity.ts`. */
export function viewKey(v: OpenView): string {
  return identityKey(v);
}

/** Duas vistas são a mesma quando têm a mesma chave. */
export function sameView(a: OpenView, b: OpenView): boolean {
  return viewKey(a) === viewKey(b);
}

/** Indica se a vista já está na lista. */
export function hasView(list: readonly OpenView[], v: OpenView): boolean {
  return list.some((x) => sameView(x, v));
}

/**
 * Acrescenta a vista ao fim, se ainda não estiver aberta. Se já estiver, devolve a própria lista (só ativa, sem duplicar).
 * Não muta a lista recebida.
 */
export function addView(list: readonly OpenView[], v: OpenView): OpenView[] {
  return hasView(list, v) ? (list as OpenView[]) : [...list, v];
}

/** Remove a vista da lista (a ordem das demais se mantém). Não muta a lista recebida. */
export function removeView(list: readonly OpenView[], v: OpenView): OpenView[] {
  return list.filter((x) => !sameView(x, v));
}

/**
 * Vista que ocupa o lugar de `v` ao fechá-la: a da direita; na última posição, a da esquerda.
 * Devolve null quando `v` não está na lista ou é a única.
 */
export function neighborOf(list: readonly OpenView[], v: OpenView): OpenView | null {
  const i = list.findIndex((x) => sameView(x, v));
  if (i < 0 || list.length < 2) return null;
  return list[i + 1] ?? list[i - 1] ?? null;
}

/** Resultado de fechar uma vista: a nova lista (pode ficar vazia) e a vista a ativar (só se a fechada era a ativa e há vizinha). */
export interface CloseResult {
  list: OpenView[];
  activate: OpenView | null;
}

/**
 * Regras de fechar uma aba (sem efeitos colaterais). `active` é a vista ativa agora. Qualquer vista pode fechar,
 * inclusive a última: a área de desenho então mostra o estado vazio.
 * - Vista que não está aberta: nada muda.
 * - Fechar a ativa: a nova lista e a vizinha (`activate`, null se não sobrou nenhuma) para o chamador ativar.
 * - Fechar outra vista: só sai da lista; a ativa não muda.
 */
export function closeView(list: readonly OpenView[], target: OpenView, active: OpenView | null): CloseResult {
  if (!hasView(list, target)) return { list: [...list], activate: null };
  const wasActive = active !== null && sameView(active, target);
  return { list: removeView(list, target), activate: wasActive ? neighborOf(list, target) : null };
}

/**
 * Nível cuja planta é liberada ao fechar a aba; null para as demais vistas. A de cobertura não libera: usa a mesma
 * resolução do nível que a de piso, que pode estar aberta ao lado. A de área também não libera, nem a planta de disciplina (compartilha a resolução do nível com a planta padrão).
 */
export function levelToRelease(v: OpenView): Id | null {
  return v.kind === 'plan' && planKindOf(v) === 'floor' && !v.planViewId ? v.levelId : null;
}

/**
 * Mantém só as vistas que ainda existem no projeto (ex.: nível ou corte excluído). Preserva a ordem.
 */
export function pruneViews(list: readonly OpenView[], exists: (v: OpenView) => boolean): OpenView[] {
  return list.filter(exists);
}

/** Vista ativa segundo os campos da interface; null quando a vista pede um id que não está definido (corte ou prancha sem id). */
export function activeViewOf(ui: ActiveViewFields): OpenView | null {
  switch (ui.view) {
    case 'plan':
      if (planKindOf(ui) === 'area') return ui.areaPlanId ? { kind: 'plan', levelId: ui.levelId, planKind: 'area', areaPlanId: ui.areaPlanId } : null;
      if (planKindOf(ui) === 'roof') return { kind: 'plan', levelId: ui.levelId, planKind: 'roof' };
      return ui.planViewId ? { kind: 'plan', levelId: ui.levelId, planViewId: ui.planViewId } : { kind: 'plan', levelId: ui.levelId };
    case '3d':
      return ui.view3dViewId ? { kind: '3d', viewId: ui.view3dViewId } : { kind: '3d' };
    case 'section':
      return ui.sectionId ? { kind: 'section', viewId: ui.sectionId } : null;
    case 'sheet':
      return ui.sheetId ? { kind: 'sheet', sheetId: ui.sheetId } : null;
    case 'face':
      return ui.faceView ? { kind: 'face', elementId: ui.faceView.elementId, face: ui.faceView.face, layer: ui.faceView.layer } : null;
  }
}
