/* eslint-disable max-lines -- visibilidade, tons, apresentação, bloqueio de edição, Hide/Reveal e temporários no mesmo dono. */
import { apresentacaoDaCategoria, categoriaDoElemento, categoriasPorDisciplina, DEFAULT_DISCIPLINE, disciplineOfElement, planHiddenOf, planOf, podeEditar, tomDaCategoria, view3dOf, type Apresentacao, type Discipline, type GraphicsCategory, type Id, type PlanView, type Project, type Tone, type ViewGraphics, type ViewHiddenTarget, type ViewHidden } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { planViewIdDe, visibilityKeyOfFields } from './viewIdentity.ts';
import { annotationIdsOfActiveView, selectedAnnotations } from './viewAnnotations.ts';

type ViewState = Pick<ReturnType<typeof useUi.getState>, 'view' | 'planKind' | 'levelId' | 'areaPlanId' | 'sectionId'> & Partial<Pick<ReturnType<typeof useUi.getState>, 'planViewId'>>;

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
export function visibilityKeyOf(st: ViewState): string | null {
  return visibilityKeyOfFields(st);
}

/** Vista alvo de ocultação permanente para o estado atual; null na prancha ou sem vista. */
export function viewHiddenTargetOf(st: ViewState): ViewHiddenTarget | null {
  if (st.view === 'sheet' || st.view === 'face') return null;
  if (st.view === '3d') return { kind: '3d' };
  if (st.view === 'section') return st.sectionId ? { kind: 'section', viewId: st.sectionId } : null;
  if (st.planKind === 'area') return st.areaPlanId ? { kind: 'area', planId: st.areaPlanId } : null;
  if (st.planKind === 'roof') return { kind: 'roof', levelId: st.levelId };
  // Planta de disciplina: a ocultação permanente grava na própria cópia (`PlanView.hidden`), nunca no nível.
  const planId = planViewIdDe(st);
  if (planId) return { kind: 'planView', planId };
  return { kind: 'plan', levelId: st.levelId };
}

/** Ocultação permanente da vista atual, já normalizada. */
export function permanentHiddenOf(p: Project, target: ViewHiddenTarget | null): ViewHidden {
  if (!target) return {};
  switch (target.kind) {
    case 'plan': return planHiddenOf(p, target.levelId);
    case 'roof': return p.levels.find((l) => l.id === target.levelId)?.roofHidden ?? {};
    case 'area': return p.areaPlans?.find((a) => a.id === target.planId)?.hidden ?? {};
    case 'planView': return p.planViews?.find((x) => x.id === target.planId)?.hidden ?? {};
    case 'section': return p.views.find((v) => v.id === target.viewId)?.hidden ?? {};
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
      const c = categoriaDoElemento(e, p);
      return c !== null && cats.has(c);
    })
    .map((e) => e.id);
  return cats.has('annotation') && st ? [...doModelo, ...annotationIdsOfActiveView(p, st)] : doModelo;
}

/** Terrenos, regiões e lotes do projeto com a categoria deles (guardado por projeto: a lista só muda com o projeto). */
const sitioPorProjeto = new WeakMap<Project, Array<{ id: Id; categoria: 'site' | 'lot' }>>();

function elementosDoSitio(p: Project): Array<{ id: Id; categoria: 'site' | 'lot' }> {
  let lista = sitioPorProjeto.get(p);
  if (!lista) {
    lista = [];
    for (const e of Object.values(p.elements)) {
      const c = categoriaDoElemento(e, p);
      if (c === 'site' || c === 'lot') lista.push({ id: e.id, categoria: c });
    }
    sitioPorProjeto.set(p, lista);
  }
  return lista;
}

/**
 * Ocultos da planta que valem para a seleção e a captura (snaps): os da vista de planta (`base`) mais os terrenos, regiões e lotes ocultos pela
 * categoria `site` ou `lot` (override de gráficos do nível) ou pelo Hide in View e o temporário (`vista`). Oculto não é selecionável nem dá snap.
 * `vista` só é lida quando o projeto tem terreno ou lote (`visibilityOf` varre todos os elementos); sem nada a acrescentar devolve o próprio `base`.
 */
export function ocultosDoSitio(p: Project, base: ReadonlySet<Id>, graficos: Pick<ViewGraphics, 'overrides'>, vista: () => ReadonlySet<Id>): ReadonlySet<Id> {
  const lista = elementosDoSitio(p);
  if (lista.length === 0) return base;
  const daVista = vista();
  let out: Set<Id> | null = null;
  for (const { id, categoria } of lista) {
    if (base.has(id)) continue;
    if (graficos.overrides[categoria].visible && !daVista.has(id)) continue;
    out ??= new Set(base);
    out.add(id);
  }
  return out ?? base;
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

/** Conjuntos efetivos de visibilidade da vista ativa. `hidden` não é desenhado nem seleciona; `halftone` desenha atenuado e só serve de captura/cota; `revealed` é desenhado com borda azul. */
export interface ViewVisibilitySets {
  hidden: ReadonlySet<Id>;
  halftone: ReadonlySet<Id>;
  /**
   * Elementos visíveis (não ocultos) que a disciplina de trabalho não pode editar: são desenhados normalmente, mas não
   * selecionam; snap e cota continuam. “Liberar edição” esvazia o conjunto.
   */
  bloqueados: ReadonlySet<Id>;
  revealed: ReadonlySet<Id>;
  reveal: boolean;
  temporary: boolean;
  /** Tom por categoria da disciplina de trabalho (usado pela cena 3D e pelo corte; na planta o tom é por elemento). */
  toneCategories: Partial<Record<GraphicsCategory, Tone>>;
  /**
   * Apresentação (tom, clareamento e opacidade) de cada categoria na disciplina de trabalho (plano de UX de 2026-11-23).
   * Usada pela 3D, pelo corte e pela planta; `toneCategories` é o derivado legado (só o tom) para os chamadores antigos.
   */
  apresentacoes: Partial<Record<GraphicsCategory, Apresentacao>>;
}

const VAZIO: ViewVisibilitySets = { hidden: new Set(), halftone: new Set(), bloqueados: new Set(), revealed: new Set(), reveal: false, temporary: false, toneCategories: {}, apresentacoes: {} };

/**
 * Apresentação de cada categoria na disciplina de trabalho (plano de UX de 2026-11-23). Lê pelo registro único de
 * categorias (`categoriasPorDisciplina`) e pela função única de precedência (`apresentacaoDaCategoria`): `geral` sai
 * normal opaco. `null`/`'todas'` = sem disciplina de trabalho: nada vira referência (mapa vazio).
 */
export function apresentacoesPorCategoria(p: Project, trabalho: Discipline | 'todas' | null, plano?: Pick<PlanView, 'discipline' | 'tones'>): Partial<Record<GraphicsCategory, Apresentacao>> {
  const out: Partial<Record<GraphicsCategory, Apresentacao>> = {};
  if (trabalho === null || trabalho === 'todas') return out;
  const vista = plano?.discipline ? plano : { discipline: trabalho };
  for (const grupo of categoriasPorDisciplina()) {
    for (const categoria of grupo.categorias) out[categoria] = apresentacaoDaCategoria(p, vista, categoria);
  }
  return out;
}

/**
 * Tom de cada categoria na disciplina de trabalho (adendo 3, decisão 4), para os chamadores antigos da cena 3D. É o
 * derivado de `apresentacoesPorCategoria` (só o tom); `geral` sai `normal`.
 */
export function tonsPorCategoria(p: Project, trabalho: Discipline): Partial<Record<GraphicsCategory, Tone>> {
  const out: Partial<Record<GraphicsCategory, Tone>> = {};
  for (const [categoria, ap] of Object.entries(apresentacoesPorCategoria(p, trabalho)) as Array<[GraphicsCategory, Apresentacao]>) out[categoria] = ap.tone;
  return out;
}

/**
 * Conjuntos de tom de disciplina da planta ativa, já separados por efeito: `hidden` (o tom `hidden` da disciplina
 * do elemento) e `halftone`. Ficam guardados por projeto (a tabela de predefinidos e os desvios só mudam com o
 * projeto), por planta e pela disciplina de trabalho pessoal. Elementos `geral` nunca entram: o tom é só de
 * disciplina (decisão 0060 §4.1) e agora é resolvido por categoria (`tomDaCategoria`).
 */
interface TonsDaPlanta {
  hidden: ReadonlySet<Id>;
  halftone: ReadonlySet<Id>;
  apresentacoes: Partial<Record<GraphicsCategory, Apresentacao>>;
}

/**
 * Cache por projeto. Além da identidade do projeto (o store cria um projeto novo a cada comando), o mapa de famílias é
 * conferido: trocar/alterar a família de um componente muda a disciplina dele e tem de refazer os tons.
 */
interface CacheDeTons {
  familias: Project['componentFamilies'];
  plantas: Map<string, TonsDaPlanta>;
}

const tonsPorProjeto = new WeakMap<Project, CacheDeTons>();

function tonsDaPlanta(p: Project, levelId: Id, planViewId: Id | undefined, minhaDisciplina: Discipline | null): TonsDaPlanta {
  let cache = tonsPorProjeto.get(p);
  if (!cache || cache.familias !== p.componentFamilies) {
    cache = { familias: p.componentFamilies, plantas: new Map() };
    tonsPorProjeto.set(p, cache);
  }
  // Tom por categoria (adendo 3, decisão 4): a planta entra com a disciplina de trabalho (`minhaDisciplina` ou a da vista);
  // a exceção de tom da própria planta continua valendo dentro de `apresentacaoDaCategoria`.
  const plano = planOf(p, levelId, planViewId);
  const trabalho = minhaDisciplina ?? plano.discipline;
  const planoDeTrabalho = { discipline: trabalho, tones: plano.tones };
  const apresentacoes = apresentacoesPorCategoria(p, planoDeTrabalho.discipline, planoDeTrabalho);
  // A disciplina de trabalho e a apresentação são pessoais: entram na chave para o cache não reaproveitar o mapa de outra.
  const chave = `${levelId}\u0000${planViewId ?? ''}\u0000${minhaDisciplina ?? ''}\u0000${JSON.stringify(apresentacoes)}`;
  const guardado = cache.plantas.get(chave);
  if (guardado) return guardado;
  const hidden = new Set<Id>();
  const halftone = new Set<Id>();
  for (const e of Object.values(p.elements)) {
    const categoria = categoriaDoElemento(e, p);
    if (categoria === null) continue;
    const disciplina = disciplineOfElement(e, p);
    if (disciplina === 'geral') continue;
    const tom = tomDaCategoria(p, planoDeTrabalho, categoria, disciplina);
    if (tom === 'hidden') hidden.add(e.id);
    else if (tom === 'halftone') halftone.add(e.id);
  }
  const resultado = { hidden, halftone, apresentacoes };
  cache.plantas.set(chave, resultado);
  return resultado;
}

/** Cache dos elementos que a disciplina de trabalho não edita (muda só com o projeto, a disciplina ou “Liberar edição”). */
interface CacheDeBloqueados {
  familias: Project['componentFamilies'];
  porTrabalho: Map<string, ReadonlySet<Id>>;
}

const bloqueadosPorProjeto = new WeakMap<Project, CacheDeBloqueados>();

/** Elementos que `podeEditar` recusa para a disciplina de trabalho (sem considerar a ocultação da vista). */
function bloqueadosDaDisciplina(p: Project, trabalho: Discipline | 'todas', liberar: boolean): ReadonlySet<Id> {
  let cache = bloqueadosPorProjeto.get(p);
  if (!cache || cache.familias !== p.componentFamilies) {
    cache = { familias: p.componentFamilies, porTrabalho: new Map() };
    bloqueadosPorProjeto.set(p, cache);
  }
  const chave = `${trabalho}\u0000${liberar ? '1' : '0'}`;
  const guardado = cache.porTrabalho.get(chave);
  if (guardado) return guardado;
  const out = new Set<Id>();
  if (trabalho !== 'todas' && !liberar) {
    for (const el of Object.values(p.elements)) if (!podeEditar(p, el, trabalho, false)) out.add(el.id);
  }
  cache.porTrabalho.set(chave, out);
  return out;
}

/**
 * Resolve permanente + temporário + Reveal para a vista ativa, e o meio-tom da disciplina (decisão 0060 §4.1):
 * (1) oculto vence (Hide in View, categoria, temporário ou tom `hidden`); (2) senão, tom `halftone`; (3) normal.
 * Os bloqueados de edição (plano de UX de 2026-11-23) são o que sobra visível e que `podeEditar` recusa.
 */
export function visibilityOf(p: Project, st: ReturnType<typeof useUi.getState>): ViewVisibilitySets {
  const target = viewHiddenTargetOf(st);
  const key = visibilityKeyOf(st);
  if (!target || !key) return VAZIO;
  const temp = st.viewTemp[key] ?? {};
  // Planta de disciplina: a ocultação permanente é a da própria planta (`planHiddenOf`); a padrão e as outras, a do alvo.
  const planta = planViewIdDe(st);
  const permanent = planta ? planHiddenOf(p, st.levelId, planta) : permanentHiddenOf(p, target);
  const permanentIds = uniq([...(permanent.elements ?? []), ...categoryIdsOf(p, permanent.categories, st)]);
  const tempIds = uniq([...(temp.hidden?.elements ?? []), ...categoryIdsOf(p, temp.hidden?.categories, st)]);
  const isolate = temp.isolated;
  const isolateIds = uniq([...(isolate?.elements ?? []), ...categoryIdsOf(p, isolate?.categories, st)]);
  const reveal = temp.reveal === true;
  const allIds = [...Object.keys(p.elements), ...annotationIdsOfActiveView(p, st)];
  const isolateSet = new Set(isolateIds);
  // Disciplina de trabalho: a pessoal vence; sem ela, a da vista (3D, planta de disciplina ou padrão). Na 3D ausente =
  // todas as disciplinas (nenhuma vira referência); no corte, a padrão.
  const disciplinaDaVista3d = st.view === '3d' ? view3dOf(p).discipline : undefined;
  const trabalho: Discipline | 'todas' =
    st.minhaDisciplina ??
    (st.view === '3d'
      ? (disciplinaDaVista3d ?? 'todas')
      : st.view === 'plan'
        ? planOf(p, st.levelId, planta).discipline
        : DEFAULT_DISCIPLINE);
  const apresentacoes =
    st.view === '3d' || st.view === 'section'
      ? apresentacoesPorCategoria(p, trabalho)
      : {};
  // O tom por elemento continua valendo só na planta (regra da ficha F4); o mapa por categoria vale nas três vistas.
  const tons = st.view === 'plan' ? tonsDaPlanta(p, st.levelId, planta, st.minhaDisciplina ?? null) : null;
  // A apresentação da planta é a do cache de tons (mesma precedência, com os desvios da própria planta).
  const apresentacoesDaVista = tons?.apresentacoes ?? apresentacoes;
  const toneCategories: Partial<Record<GraphicsCategory, Tone>> = {};
  for (const [categoria, ap] of Object.entries(apresentacoesDaVista) as Array<[GraphicsCategory, Apresentacao]>) toneCategories[categoria] = ap.tone;
  // Corte/elevação: a disciplina de trabalho (`st.minhaDisciplina` ou a padrão) oculta por categoria. O meio-tom continua
  // desenhado, então só o tom `hidden` entra no conjunto.
  let toneHidden: ReadonlySet<Id> = tons?.hidden ?? new Set<Id>();
  if (st.view === 'section') {
    const ocultas = new Set<Id>();
    for (const e of Object.values(p.elements)) {
      const categoria = categoriaDoElemento(e, p);
      if (categoria !== null && toneCategories[categoria] === 'hidden') ocultas.add(e.id);
    }
    toneHidden = ocultas;
  }
  let baseHidden: Id[];
  if (isolateIds.length > 0) {
    baseHidden = allIds.filter((id) => !isolateSet.has(id));
    // O tom `hidden` da disciplina vence até o isolamento: isolar não reexibe outra disciplina.
    for (const id of toneHidden) if (isolateSet.has(id) && !baseHidden.includes(id)) baseHidden.push(id);
  } else {
    baseHidden = uniq([...permanentIds, ...tempIds, ...toneHidden]);
  }
  const baseHiddenSet = new Set(baseHidden);
  // Reveal mostra tudo o que está fora da vista: ocultos (permanente/temporário/tom), isolados-fora e categorias.
  const revealedIds = reveal ? baseHidden : [];
  const revealed = new Set(revealedIds);
  const hidden = new Set(baseHidden.filter((id) => !revealed.has(id)));
  // O meio-tom só vale para quem não caiu na etapa 1 (oculto vence o tom, inclusive no Reveal).
  const halftone = new Set([...(tons?.halftone ?? [])].filter((id) => !baseHiddenSet.has(id)));
  // Bloqueados de edição: visíveis na vista (não ocultos), independentemente do tom. Não entram em hidden/halftone.
  const bloqueados = new Set<Id>();
  for (const id of bloqueadosDaDisciplina(p, trabalho, st.liberarEdicao)) if (!hidden.has(id)) bloqueados.add(id);
  const temporary = !!(temp.hidden || temp.isolated || temp.reveal);
  return { hidden, halftone, bloqueados, revealed, reveal, temporary, toneCategories, apresentacoes: apresentacoesDaVista };
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

/** Remove da seleção os elementos que passaram a ficar ocultos na vista ativa. */
function pruneHiddenSelection(status: ReturnType<typeof useUi.getState>['status']): void {
  const cur = useUi.getState();
  const vis = visibilityOf(editor.project, cur);
  const nextSel = cur.selection.filter((id) => !vis.hidden.has(id));
  const nextSub = cur.subElemento && vis.hidden.has(cur.subElemento.wallId) ? null : cur.subElemento;
  useUi.setState({ selection: nextSel, subElemento: nextSub, status });
}

/** Ocultação permanente (Hide in View) dos elementos/categorias na vista ativa. */
export function hideInView(elements: readonly Id[], categories: readonly GraphicsCategory[] = []): void {
  if (elements.length === 0 && categories.length === 0) {
    useUi.setState({ status: { key: 'eds_msg_hide_select' } });
    return;
  }
  const st = useUi.getState();
  const target = viewHiddenTargetOf(st);
  if (!target) return;
  const atual = permanentHiddenOf(editor.project, target);
  const hidden = mergeHidden(atual, {
    ...(elements.length ? { elements: [...elements] } : {}),
    ...(categories.length ? { categories: [...categories] } : {}),
  });
  editor.store.exec({ type: 'setViewHidden', target, hidden }, 'eds_undo_hide_view');
  redesenhar();
  pruneHiddenSelection({ key: 'eds_msg_hidden_done' });
}

/** Reexibe elementos/categorias na vista ativa (modo Reveal). */
export function unhideInView(elements: readonly Id[], categories: readonly GraphicsCategory[] = []): void {
  if (elements.length === 0 && categories.length === 0) {
    useUi.setState({ status: { key: 'eds_msg_unhide_select' } });
    return;
  }
  const st = useUi.getState();
  const target = viewHiddenTargetOf(st);
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

/** Limpa toda a ocultação permanente da vista ativa. */
export function clearViewHidden(): void {
  const st = useUi.getState();
  const target = viewHiddenTargetOf(st);
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
  pruneHiddenSelection({ key: 'eds_msg_temp_hidden' });
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
  pruneHiddenSelection({ key: 'eds_msg_temp_isolated' });
}

/**
 * Reexibe tudo na vista ativa (HR): limpa o Hide in View permanente (elementos e categorias, num passo de desfazer) e
 * o estado temporário (HH/HI/IC e o modo Reveal). Não toca no perfil de disciplina nem em "Visibilidade e gráficos".
 */
export function unhideAllInView(): void {
  const st = useUi.getState();
  const key = visibilityKeyOf(st);
  const target = viewHiddenTargetOf(st);
  const permanente: ViewHidden = target ? permanentHiddenOf(editor.project, target) : {};
  const temPermanente = (permanente.elements?.length ?? 0) > 0 || (permanente.categories?.length ?? 0) > 0;
  const temp = key ? st.viewTemp[key] : undefined;
  const temTemporario = !!(temp?.hidden || temp?.isolated || temp?.reveal);
  if (temPermanente && target) {
    editor.store.exec({ type: 'setViewHidden', target, hidden: undefined }, 'eds_undo_unhide_all_view');
  }
  if (temTemporario) setTemp(null);
  redesenhar();
  useUi.setState({ status: { key: temPermanente || temTemporario ? 'eds_msg_unhide_all_done' : 'eds_msg_unhide_all_none' } });
}

/** Reset do hide/isolate temporário (botão da barra da vista; o HR reexibe tudo por `unhideAllInView`). */
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

/** A categoria 'mass' está visível na vista ativa? (ocultação permanente por categoria; na prancha, não.) */
export function massaVisivelNaVista(p: Project, st: ViewState = useUi.getState()): boolean {
  const target = viewHiddenTargetOf(st);
  if (!target) return false;
  return !(permanentHiddenOf(p, target).categories ?? []).includes('mass');
}

/** "Mostrar massa": liga e desliga a categoria 'mass' na vista ativa, pelo mesmo mecanismo do Ocultar categoria. */
export function alternarMassaNaVista(): void {
  if (massaVisivelNaVista(editor.project)) hideInView([], ['mass']);
  else unhideInView([], ['mass']);
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
    const c = e ? categoriaDoElemento(e, p) : null;
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

/** Há hide temporário (não Reveal) ativo na vista atual? */
export function temporaryHideActive(): boolean {
  return temporaryActive();
}
