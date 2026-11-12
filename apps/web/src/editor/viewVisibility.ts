import { categoryOfElement, hiddenByUserInView, hiddenIdsInView, hiddenTargetOfView, normalizeViewHiddenTarget, planViewHiddenOf, planViewOf as vistaDoModelo, type GraphicsCategory, type Id, type Project, type ViewHiddenTarget, type ViewHidden } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { resolvedPlanViewOf } from '@hestia/render';
import { nivelAtivo, planViewIdAtivo, planViewIdDeFundo, tipoDeVistaAtivo } from './vistaAtiva.ts';
import { annotationIdsOfActiveView, selectedAnnotations } from './viewAnnotations.ts';

type ViewState = Pick<ReturnType<typeof useUi.getState>, 'view' | 'planKind' | 'levelId' | 'planViewId' | 'sectionId'>;

/** Estado temporário de visibilidade de uma vista (não vai para o arquivo do projeto). */
export interface TempViewVisibility {
  /** Hide temporário (HH): elementos/categorias que somem até HR. */
  hidden?: ViewHidden;
  /** Isolate temporário (HI/IC): só estes ficam visíveis até HR. */
  isolated?: ViewHidden;
  /** Modo Reveal (RH): mostra os ocultos com bordas azuis enquanto ativo. */
  reveal?: boolean;
}

/** Chave estável da vista ativa (a mesma ideia de `Editor.viewKey`, mas para a visibilidade). */
export function visibilityKeyOf(st: Pick<ReturnType<typeof useUi.getState>, 'view' | 'planKind' | 'levelId' | 'planViewId' | 'sectionId'>): string | null {
  if (st.view === 'sheet') return null;
  if (st.view === '3d') return '3d';
  if (st.view === 'section') return st.sectionId ? `section:${st.sectionId}` : null;
  const viewId = planViewIdAtivo(st);
  if (!viewId) return null;
  const tipo = tipoDeVistaAtivo(st);
  if (tipo === 'area') return `area:${viewId}`;
  return tipo === 'roof' ? `roof:${nivelAtivo(st)}` : `plan:${nivelAtivo(st)}`;
}

/**
 * Vista alvo de ocultação permanente para o estado atual; null na prancha ou sem vista. Com `p`, o alvo da planta sai de
 * `hiddenTargetOfView(p, viewId)`; sem `p` (ou com vista que não existe no projeto) o alvo vem do tipo da vista ativa.
 */
export function viewHiddenTargetOf(st: Pick<ReturnType<typeof useUi.getState>, 'view' | 'planKind' | 'levelId' | 'planViewId' | 'sectionId'>, p?: Project): ViewHiddenTarget | null {
  if (st.view === 'sheet') return null;
  if (st.view === '3d') return { kind: '3d' };
  if (st.view === 'section') return st.sectionId ? { kind: 'section', viewId: st.sectionId } : null;
  const viewId = planViewIdAtivo(st);
  if (!viewId) return null;
  // Forma única: a planta é identificada pelo id da vista (com ou sem o projeto).
  return p && vistaDoModelo(p, viewId) ? hiddenTargetOfView(p, viewId) : { kind: 'plan', viewId };
}

/** Ocultação permanente da vista atual, já normalizada. */
export function permanentHiddenOf(p: Project, target: ViewHiddenTarget | null): ViewHidden {
  if (!target) return {};
  const alvo = normalizeViewHiddenTarget(target);
  switch (alvo.kind) {
    case 'plan': return planViewHiddenOf(p, alvo.viewId);
    case 'section': return p.views.find((v) => v.id === alvo.viewId)?.hidden ?? {};
    case '3d': return p.view3d?.hidden ?? {};
  }
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)];
const redesenhar = (): void => useUi.setState((s) => ({ previewTick: s.previewTick + 1 }));


/**
 * Ids dos elementos que pertencem às categorias dadas. Com `st`, a categoria 'annotation' também alcança as anotações
 * da vista ativa (cotas, textos, etiquetas...), que não são elementos do modelo.
 */
export function categoryIdsOf(p: Project, categories: readonly GraphicsCategory[] | undefined, st?: ViewState): Id[] {
  if (!categories?.length) return [];
  const cats = new Set(categories);
  const doModelo = Object.values(p.elements)
    .filter((e) => {
      const c = categoryOfElement(e);
      return c !== null && cats.has(c);
    })
    .map((e) => e.id);
  return cats.has('annotation') && st ? [...doModelo, ...annotationIdsOfActiveView(p, st)] : doModelo;
}

/** Junta duas ocultações (elementos e categorias, sem repetição). */
export function mergeHidden(a: ViewHidden | undefined, b: ViewHidden | undefined): ViewHidden | undefined {
  const elements = uniq([...(a?.elements ?? []), ...(b?.elements ?? [])]);
  const categories = uniq([...(a?.categories ?? []), ...(b?.categories ?? [])]) as GraphicsCategory[];
  if (elements.length === 0 && categories.length === 0) return undefined;
  return { ...(elements.length ? { elements } : {}), ...(categories.length ? { categories } : {}) };
}

/** Remove elementos/categorias de uma ocultação; devolve undefined quando não sobra nada. */
export function removeHidden(a: ViewHidden | undefined, remove: ViewHidden): ViewHidden | undefined {
  const remE = new Set(remove.elements ?? []);
  const remC = new Set(remove.categories ?? []);
  const elements = (a?.elements ?? []).filter((id) => !remE.has(id));
  const categories = (a?.categories ?? []).filter((c) => !remC.has(c));
  if (elements.length === 0 && categories.length === 0) return undefined;
  return { ...(elements.length ? { elements } : {}), ...(categories.length ? { categories } : {}) };
}

/** Conjuntos efetivos de visibilidade da vista ativa. `hidden` não é desenhado; `revealed` é desenhado com borda azul. */
export interface ViewVisibilitySets {
  hidden: ReadonlySet<Id>;
  revealed: ReadonlySet<Id>;
  reveal: boolean;
  temporary: boolean;
}

const VAZIO: ViewVisibilitySets = { hidden: new Set(), revealed: new Set(), reveal: false, temporary: false };

/** Corte e 3D (fora da regra de planta): ocultação permanente + temporária expandida em ids, com isolamento. */
function hiddenForaDePlanta(p: Project, st: ReturnType<typeof useUi.getState>, target: ViewHiddenTarget, temp: TempViewVisibility, allIds: readonly Id[]): Id[] {
  const permanent = permanentHiddenOf(p, target);
  const permanentIds = uniq([...(permanent.elements ?? []), ...categoryIdsOf(p, permanent.categories, st)]);
  const tempIds = uniq([...(temp.hidden?.elements ?? []), ...categoryIdsOf(p, temp.hidden?.categories, st)]);
  const isolate = temp.isolated;
  const isolateIds = uniq([...(isolate?.elements ?? []), ...categoryIdsOf(p, isolate?.categories, st)]);
  const isolateSet = new Set(isolateIds);
  return isolateIds.length > 0 ? allIds.filter((id) => !isolateSet.has(id)) : uniq([...permanentIds, ...tempIds]);
}

/** Resolve permanente + temporário + Reveal para a vista ativa. */
export function visibilityOf(p: Project, st: ReturnType<typeof useUi.getState>): ViewVisibilitySets {
  const target = viewHiddenTargetOf(st, p);
  const key = visibilityKeyOf(st);
  if (!target || !key) return VAZIO;
  const temp = st.viewTemp[key] ?? {};
  const reveal = temp.reveal === true;
  const allIds = [...Object.keys(p.elements), ...annotationIdsOfActiveView(p, st)];
  // Planta: a regra única (`hiddenByUserInView`: categoria oculta, Hide in View, ocultar/isolar temporário). Corte e 3D
  // não são vistas de planta (a regra 4.5 é de planta) e seguem pelo caminho antigo.
  const alvo = normalizeViewHiddenTarget(target);
  const baseHidden = alvo.kind === 'plan'
    ? allIds.filter((id) => hiddenByUserInView(p, alvo.viewId, id, { temporary: { hidden: temp.hidden, isolated: temp.isolated } }))
    : hiddenForaDePlanta(p, st, alvo, temp, allIds);
  // Reveal mostra tudo o que está fora da vista: ocultos (permanente/temporário), isolados-fora e categorias.
  const revealedIds = reveal ? baseHidden : [];
  const revealed = new Set(revealedIds);
  const hidden = new Set(baseHidden.filter((id) => !revealed.has(id)));
  const temporary = !!(temp.hidden || temp.isolated || temp.reveal);
  return { hidden, revealed, reveal, temporary };
}

/** Atualiza o estado temporário da vista ativa. */
function setTemp(patch: Partial<TempViewVisibility> | null): void {
  const st = useUi.getState();
  const key = visibilityKeyOf(st);
  if (!key) return;
  const next = { ...st.viewTemp };
  if (patch === null) delete next[key];
  else next[key] = { ...(next[key] ?? {}), ...patch };
  useUi.setState((s) => ({ viewTemp: next, previewTick: s.previewTick + 1 }));
}

/** Ocultação permanente (Hide in View) dos elementos/categorias na vista ativa. */
export function hideInView(elements: readonly Id[], categories: readonly GraphicsCategory[] = []): void {
  if (elements.length === 0 && categories.length === 0) {
    useUi.setState({ status: { key: 'eds_msg_hide_select' } });
    return;
  }
  const st = useUi.getState();
  const target = viewHiddenTargetOf(st, editor.project);
  if (!target) return;
  const atual = permanentHiddenOf(editor.project, target);
  const hidden = mergeHidden(atual, {
    ...(elements.length ? { elements: [...elements] } : {}),
    ...(categories.length ? { categories: [...categories] } : {}),
  });
  editor.store.exec({ type: 'setViewHidden', target, hidden }, 'eds_undo_hide_view');
  redesenhar();
  useUi.setState({ status: { key: 'eds_msg_hidden_done' } });
}

/** Reexibe elementos/categorias na vista ativa (modo Reveal). */
export function unhideInView(elements: readonly Id[], categories: readonly GraphicsCategory[] = []): void {
  if (elements.length === 0 && categories.length === 0) {
    useUi.setState({ status: { key: 'eds_msg_unhide_select' } });
    return;
  }
  const st = useUi.getState();
  const target = viewHiddenTargetOf(st, editor.project);
  if (!target) return;
  const atual = permanentHiddenOf(editor.project, target);
  const remover = {
    ...(elements.length ? { elements: [...elements] } : {}),
    ...(categories.length ? { categories: [...categories] } : {}),
  };
  const hidden = removeHidden(atual, remover);
  // Oculto temporário (HH) e isolamento (HI): o elemento reexibido sai do oculto, sem tocar no modo Reveal.
  const key = visibilityKeyOf(st);
  const temp = key ? st.viewTemp[key] : undefined;
  if (key && temp?.hidden) setTemp({ hidden: removeHidden(temp.hidden, remover) });
  if (key && temp?.isolated) setTemp({ isolated: mergeHidden(temp.isolated, remover) });
  if (JSON.stringify(hidden ?? {}) !== JSON.stringify(atual)) {
    editor.store.exec({ type: 'setViewHidden', target, hidden }, 'eds_undo_unhide_view');
  }
  redesenhar();
  useUi.setState({ status: { key: 'eds_msg_unhidden_done' } });
}

/**
 * Tira as categorias do ocultar/isolar temporário (sessão) da vista ativa; o que está permanente não é tocado. Quem mostra
 * categoria "nesta vista" usa isto junto com o comando de vista (aviso de criação em categoria oculta). Devolve se mexeu em algo.
 */
export function liberarCategoriasTemporarias(categories: readonly GraphicsCategory[]): boolean {
  if (categories.length === 0) return false;
  const st = useUi.getState();
  const key = visibilityKeyOf(st);
  const temp = key ? st.viewTemp[key] : undefined;
  if (!key || !temp) return false;
  const remover = { categories: [...categories] };
  let mudou = false;
  if (temp.hidden) { setTemp({ hidden: removeHidden(temp.hidden, remover) }); mudou = true; }
  if (temp.isolated) { setTemp({ isolated: mergeHidden(temp.isolated, remover) }); mudou = true; }
  return mudou;
}

/** Limpa toda a ocultação permanente da vista ativa. */
export function clearViewHidden(): void {
  const st = useUi.getState();
  const target = viewHiddenTargetOf(st, editor.project);
  if (!target || !permanentHiddenOf(editor.project, target)) return;
  editor.store.exec({ type: 'setViewHidden', target, hidden: undefined }, 'eds_undo_unhide_all_view');
  redesenhar();
  useUi.setState({ status: { key: 'eds_msg_unhide_all_done' } });
}

/** Hide temporário (HH): some até HR, sem gravar no projeto. */
export function temporaryHide(elements: readonly Id[], categories: readonly GraphicsCategory[] = []): void {
  if (elements.length === 0 && categories.length === 0) {
    useUi.setState({ status: { key: 'eds_msg_temp_hide_select' } });
    return;
  }
  const st = useUi.getState();
  const key = visibilityKeyOf(st);
  if (!key) return;
  const temp = st.viewTemp[key];
  setTemp({ hidden: mergeHidden(temp?.hidden, {
    ...(elements.length ? { elements: [...elements] } : {}),
    ...(categories.length ? { categories: [...categories] } : {}),
  }), isolated: undefined });
  useUi.setState({ status: { key: 'eds_msg_temp_hidden' } });
}

/** Isolate temporário (HI/IC): só a seleção/categoria fica visível até HR. */
export function temporaryIsolate(elements: readonly Id[], categories: readonly GraphicsCategory[] = []): void {
  if (elements.length === 0 && categories.length === 0) {
    useUi.setState({ status: { key: 'eds_msg_temp_isolate_select' } });
    return;
  }
  const st = useUi.getState();
  const key = visibilityKeyOf(st);
  if (!key) return;
  setTemp({ isolated: {
    ...(elements.length ? { elements: [...elements] } : {}),
    ...(categories.length ? { categories: [...categories] } : {}),
  }, hidden: undefined });
  useUi.setState({ status: { key: 'eds_msg_temp_isolated' } });
}

/** Reexibe tudo da vista: ocultação permanente e temporária (não mexe no modo Reveal). */
export function unhideAllInView(): void {
  const st = useUi.getState();
  const target = viewHiddenTargetOf(st, editor.project);
  if (target && permanentHiddenOf(editor.project, target)) {
    editor.store.exec({ type: 'setViewHidden', target, hidden: undefined }, 'eds_undo_unhide_all_view');
  }
  setTemp({ hidden: undefined, isolated: undefined });
  useUi.setState({ status: { key: 'eds_msg_unhide_all_reveal' } });
}

/** Reset do hide/isolate temporário (HR). */
export function resetTemporaryHidden(): void {
  setTemp({ hidden: undefined, isolated: undefined });
  useUi.setState({ status: { key: 'eds_msg_temp_reset' } });
}

/** Liga/desliga o modo Reveal da vista ativa (RH). */
export function toggleRevealHidden(): void {
  const st = useUi.getState();
  const key = visibilityKeyOf(st);
  if (!key) return;
  const atual = st.viewTemp[key]?.reveal === true;
  setTemp({ reveal: !atual });
  useUi.setState({ status: !atual ? { key: 'eds_msg_reveal_on' } : { key: 'eds_msg_reveal_off' } });
}

/** Limpa o temporário ao trocar/abrir projeto. */
export function resetAllTemporary(): void {
  useUi.setState({ viewTemp: {} });
}

/** Elemento oculto na vista ativa? (para seleção/hit-test) */
export function isHiddenInView(id: Id): boolean {
  return visibilityOf(editor.project, useUi.getState()).hidden.has(id);
}

/** Categorias gráficas presentes na seleção atual. */
export function selectedCategories(p: Project, ids: readonly Id[] = useUi.getState().selection): GraphicsCategory[] {
  const out = new Set<GraphicsCategory>();
  for (const id of ids) {
    const e = p.elements[id];
    const c = e ? categoryOfElement(e) : null;
    if (c) out.add(c);
  }
  // Anotações (cotas, textos, etiquetas...) da vista ativa pertencem à categoria 'annotation'.
  if (selectedAnnotations(p, useUi.getState(), ids).length > 0) out.add('annotation');
  return [...out];
}

/** Hide in View dos elementos selecionados. */
export function hideSelectionInView(): void {
  hideInView(useUi.getState().selection);
}

/** Hide in View da categoria dos elementos selecionados (só se todos forem da mesma categoria). */
export function hideSelectedCategoryInView(): void {
  const cats = selectedCategories(editor.project);
  if (cats.length !== 1) {
    useUi.setState({ status: { key: 'eds_msg_hide_category_select' } });
    return;
  }
  hideInView([], cats);
}

/** Reexibe os elementos selecionados. */
export function unhideSelectionInView(): void {
  unhideInView(useUi.getState().selection);
}

/** Reexibe a categoria dos elementos selecionados. */
export function unhideSelectedCategoryInView(): void {
  const cats = selectedCategories(editor.project);
  if (cats.length !== 1) {
    useUi.setState({ status: { key: 'eds_msg_unhide_category_select' } });
    return;
  }
  unhideInView([], cats);
}

/** Hide temporário da seleção (HH). */
export function temporaryHideSelection(): void {
  temporaryHide(useUi.getState().selection);
}

/** Isolate temporário da seleção (HI). */
export function temporaryIsolateSelection(): void {
  temporaryIsolate(useUi.getState().selection);
}

/** Hide/isolate temporário da categoria dos selecionados (HC/IC). */
export function temporarySelectedCategory(only: boolean): void {
  const cats = selectedCategories(editor.project);
  if (cats.length !== 1) {
    useUi.setState({ status: { key: 'eds_msg_category_select' } });
    return;
  }
  if (only) temporaryIsolate([], cats);
  else temporaryHide([], cats);
}

/** O modo Reveal está ativo na vista atual? */
export function revealActive(): boolean {
  return visibilityOf(editor.project, useUi.getState()).reveal;
}

/** Há hide/isolate temporário ativo na vista atual? */
export function temporaryActive(): boolean {
  const st = useUi.getState();
  const key = visibilityKeyOf(st);
  const t = key ? st.viewTemp[key] : undefined;
  return !!(t?.hidden || t?.isolated);
}

/** O modo "revelar ocultos" está ligado na planta aberta? (a seleção deixa de excluir o que o usuário oculta) */
export function revealingActive(st: ReturnType<typeof useUi.getState>): boolean {
  const key = st.view === 'plan' ? visibilityKeyOf(st) : null;
  return !!key && st.viewTemp[key]?.reveal === true;
}

/** Há hide temporário (não Reveal) ativo na vista atual? */
export function temporaryHideActive(): boolean {
  return temporaryActive();
}

let ultimoOcultoDaVista: { p: Project; viewId: Id; levelId: Id; view: string; planKind: string; temp: TempViewVisibility | undefined; revelando: boolean; ids: ReadonlySet<Id> } | null = null;

/**
 * Ids que a vista de planta ativa (ou, em 3D, corte e prancha, a planta de fundo) esconde: a regra única
 * (`hiddenIdsInView`, etapas 1 a 6) sobre todos os elementos do projeto. É o que as ferramentas usam para não capturar
 * nem selecionar o que a vista não mostra (`ToolEnv.hiddenInView`). Ocultar temporário só vale na planta aberta. Modo
 * "revelar ocultos": o que o usuário oculta volta a valer como alvo (o alcance da vista continua escondendo).
 */
export function hiddenInActiveView(p: Project, st: ReturnType<typeof useUi.getState>): ReadonlySet<Id> {
  const viewId = planViewIdDeFundo(st);
  if (!viewId) return new Set();
  const levelId = nivelAtivo(st);
  const key = st.view === 'plan' ? visibilityKeyOf(st) : null;
  const temp = key ? st.viewTemp[key] : undefined;
  const revelando = temp?.reveal === true;
  const c = ultimoOcultoDaVista;
  if (c && c.p === p && c.viewId === viewId && c.levelId === levelId && c.view === st.view && c.planKind === st.planKind && c.temp === temp && c.revelando === revelando) return c.ids;
  // A cobertura não usa intervalo de vista (o desenho a resolve sem ele): só as vistas com intervalo têm etapa 1.
  const outOfRange = st.planKind === 'roof' ? undefined : resolvedPlanViewOf(p, levelId, viewId).hidden;
  const candidatos = st.view === 'plan' ? [...Object.keys(p.elements), ...annotationIdsOfActiveView(p, st)] : Object.keys(p.elements);
  const ids = hiddenIdsInView(p, viewId, candidatos, { outOfRange, temporary: temp ? { hidden: temp.hidden, isolated: temp.isolated } : undefined, revealing: revelando });
  ultimoOcultoDaVista = { p, viewId, levelId, view: st.view, planKind: st.planKind, temp, revelando, ids };
  return ids;
}
