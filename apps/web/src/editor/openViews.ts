import { floorViewId, planViewRef, roofViewId, type Id } from '@hestia/model';

/**
 * Planta de piso (padrão), de cobertura ou de área. A de cobertura é a planta do nível com o telhado completo
 * e opaco; a de área é uma vista própria (`AreaPlan`) com linhas de referência, etiquetas e quadro.
 */
export type PlanKind = 'floor' | 'roof' | 'area';

/**
 * Vista aberta na barra de vistas. É estado de sessão (não é salvo no projeto): separa "níveis do projeto"
 * de "vistas abertas". Plantas pelo id da vista (`PlanView`: piso, cobertura ou área); corte/elevação por id da vista;
 * prancha por id da folha.
 */
export type OpenView =
  | { kind: 'plan'; viewId: Id }
  | { kind: '3d' }
  | { kind: 'section'; viewId: Id }
  | { kind: 'sheet'; sheetId: Id };

/** Campos de vista da interface que determinam a vista ativa (subconjunto de `UiState`). */
export interface ActiveViewFields {
  view: 'plan' | '3d' | 'section' | 'sheet';
  levelId: Id;
  sectionId: Id | null;
  sheetId: Id | null;
  /** Vista de planta (forma única); quando falta, o estado é o antigo e a vista sai de `planKind`/`areaPlanId`. */
  planViewId?: Id | null;
  /** @deprecated Estado antigo: tipo da planta, ausente = piso. Só usado sem `planViewId` (o estado atual não o guarda). */
  planKind?: PlanKind;
  /** @deprecated Estado antigo: planta de área ativa quando `planKind` é 'area'. */
  areaPlanId?: Id | null;
}

/**
 * Id da vista de planta na FORMA ANTIGA da aba/estado (`levelId` + `planKind` + `areaPlanId`): `floorViewId`,
 * `roofViewId` ou o id da planta de área; `null` na planta de área sem `areaPlanId`. Serve à sessão salva no formato
 * antigo; o resto do código usa o `viewId` direto.
 */
export function planViewIdDaAba(v: { levelId: Id; planKind?: string; areaPlanId?: Id | null }): Id | null {
  if (v.planKind === 'area') return v.areaPlanId ?? null;
  return v.planKind === 'roof' ? roofViewId(v.levelId) : floorViewId(v.levelId);
}

/** Padrão ao abrir um projeto: só o nível ativo, que é o primeiro nível do projeto. */
export function defaultOpenViews(levelIds: readonly Id[]): OpenView[] {
  return [{ kind: 'plan', viewId: floorViewId(levelIds[0] ?? 'lv_0') }];
}

/** Chave estável de uma vista (serve de `key` na barra e para comparar vistas). Piso, cobertura e área são distintas. */
export function viewKey(v: OpenView): string {
  switch (v.kind) {
    case 'plan':
      return `plan:${v.viewId}`;
    case '3d':
      return '3d';
    case 'section':
      return `section:${v.viewId}`;
    case 'sheet':
      return `sheet:${v.sheetId}`;
  }
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
 * resolução do nível que a de piso, que pode estar aberta ao lado. A de área também não libera. Só a planta de piso
 * principal (`pv_<nível>`) se reconhece sem o projeto, e é ela que libera.
 */
export function levelToRelease(v: OpenView): Id | null {
  const ref = v.kind === 'plan' ? planViewRef(v.viewId) : undefined;
  return ref?.kind === 'floor' ? ref.levelId : null;
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
      {
        const viewId = ui.planViewId ?? planViewIdDaAba(ui);
        return viewId ? { kind: 'plan', viewId } : null;
      }
    case '3d':
      return { kind: '3d' };
    case 'section':
      return ui.sectionId ? { kind: 'section', viewId: ui.sectionId } : null;
    case 'sheet':
      return ui.sheetId ? { kind: 'sheet', sheetId: ui.sheetId } : null;
  }
}
