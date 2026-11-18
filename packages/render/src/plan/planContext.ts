import type { ResolvedLevel, ResolvedRamp, ResolvedStair } from '@hestia/engine';
import { annotationIdsOnHiddenHosts, categoryVisibleInView, isOpening, isWall, planViewOf, type AreaPlanAnnotations, type Id, type Project } from '@hestia/model';
import { ambientesDoNivel, escadasDoNivel, lajesDoNivel, pisosDoNivel, rampasDoNivel, telhadosDoNivel } from './resolucao.ts';
import { planStyleOf, type PlanStyle } from './style.ts';
import { resolvedPlanViewOf, type ResolvedPlanView } from './view.ts';
import type { PlanInput, PlanInputResolvido } from './planInput.ts';

/**
 * Pavimento de baixo como referência apagada (D1–D4): o nível e o que ele tem de desenhar. `on` desliga a referência
 * (opção "mostrar o nível de baixo"); `resolve` é a resolução do nível (o app a guarda em cache).
 */
/**
 * Pavimento de referência da planta: a escolha do usuário, se for um nível abaixo do atual; senão o de baixo, que é o
 * automático. Desligado (`on` falso) ou sem nível abaixo, não há referência. A planta e a captura usam esta função.
 */
export function underlayIdOf(p: Project, levelId: Id, on: boolean, choice: Id | null = null): Id | null {
  const idx = p.levels.findIndex((l) => l.id === levelId);
  if (!on || idx <= 0) return null;
  const ci = choice ? p.levels.findIndex((l) => l.id === choice) : -1;
  return ci >= 0 && ci < idx ? p.levels[ci]!.id : p.levels[idx - 1]!.id;
}

export function planBelowOf(p: Project, levelId: Id, resolve: (id: Id) => ResolvedLevel, on: boolean, choice: Id | null = null): Pick<PlanInput, 'below' | 'belowFloors' | 'belowSlabs' | 'belowRoofs' | 'belowRooms'> {
  const id = underlayIdOf(p, levelId, on, choice);
  if (!id) return { below: null };
  return { below: resolve(id), belowFloors: pisosDoNivel(p, id), belowSlabs: lajesDoNivel(p, id), belowRoofs: telhadosDoNivel(p, id), belowRooms: ambientesDoNivel(p, id) };
}

/** Filtra as anotações de uma vista de área pelos ids ocultos (o mesmo `hidden` do modelo). */
export function anotacoesSemOcultos(a: AreaPlanAnnotations, hidden: ReadonlySet<Id> | undefined): AreaPlanAnnotations {
  if (!hidden?.size) return a;
  const keep = <T extends { id: Id }>(xs: T[]): T[] => xs.filter((x) => !hidden.has(x.id));
  return { dimensions: keep(a.dimensions), texts: keep(a.texts), detailLines: keep(a.detailLines), detailRegions: keep(a.detailRegions), tags: keep(a.tags) };
}

/**
 * Projeto do nível sem as anotações ocultas (cotas, textos, linhas/regiões de detalhe, separadores e etiquetas) e sem as
 * marcas de corte ocultas: `noteOps` e as etiquetas leem a vista, não recebem um conjunto de ocultos, então o filtro
 * entra antes do desenho. O projeto DERIVADO guarda as anotações filtradas nas vistas do nível (Fase 2: `planViews`); a
 * vista que não perde nada mantém a identidade. Sem ocultos, o mesmo projeto (o caminho comum não cria objeto novo).
 */
export function semAnotacoesOcultas(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined): Project {
  if (!hidden?.size) return p;
  const keep = <T extends { id: Id }>(xs: T[]): T[] => (xs.some((x) => hidden.has(x.id)) ? xs.filter((x) => !hidden.has(x.id)) : xs);
  const planViews = p.planViews.map((v) => {
    if (v.levelId !== levelId) return v;
    const a = v.annotations;
    const next = { dimensions: keep(a.dimensions), texts: keep(a.texts), detailLines: keep(a.detailLines), detailRegions: keep(a.detailRegions), tags: keep(a.tags) };
    return Object.keys(next).every((k) => next[k as keyof typeof next] === a[k as keyof typeof next]) ? v : { ...v, annotations: next };
  });
  const levels = p.levels.map((l) => (l.id === levelId && l.roomSeparators ? { ...l, roomSeparators: l.roomSeparators.filter((x) => !hidden.has(x.id)) } : l));
  return { ...p, levels, planViews, views: p.views.filter((v) => !hidden.has(v.id)) };
}

/** Projeto sem os elementos ocultos (o CAD importado é desenhado pelo projeto inteiro, sem receber `hidden`). */
export function semElementosOcultos(p: Project, hidden: ReadonlySet<Id> | undefined): Project {
  if (!hidden?.size) return p;
  const elements = { ...p.elements };
  let mudou = false;
  for (const id of hidden) {
    if (!elements[id]) continue;
    delete elements[id];
    mudou = true;
  }
  return mudou ? { ...p, elements } : p;
}

/**
 * A vista é resolvida sem as paredes ocultas (junção das vizinhas), o que também a deixa sem as aberturas delas. Elemento
 * hospedado tem visibilidade própria: aqui o estado de cada abertura de parede oculta (corte, projeção, intervalo,
 * categoria) volta da vista do projeto inteiro, para ela ser decidida pelo próprio id e não pelo hospedeiro.
 */
function comEsquadriasIndependentes(p: Project, view: ResolvedPlanView, levelId: Id, viewId: Id, paredesOcultas: readonly Id[] | undefined): ResolvedPlanView {
  if (!paredesOcultas?.length) return view;
  const donas = new Set(paredesOcultas);
  const cheia = resolvedPlanViewOf(p, levelId, viewId);
  const cls = new Map(view.cls);
  const hidden = new Set(view.hidden);
  const categoryHidden = new Set(view.categoryHidden);
  for (const [id, e] of Object.entries(p.elements)) {
    if (!isOpening(e) || !donas.has(e.hostId)) continue;
    const c = cheia.cls.get(id);
    if (c) cls.set(id, c);
    if (cheia.hidden.has(id)) hidden.add(id);
    if (cheia.categoryHidden.has(id)) categoryHidden.add(id);
  }
  return { ...view, cls, hidden, categoryHidden };
}

/**
 * Junta dois conjuntos de ocultos sem repetição. Sem nenhum id, `undefined` (o caminho comum, sem filtro).
 */
function uniaoOcultos(a: ReadonlySet<Id> | undefined, b: readonly Id[] | undefined): ReadonlySet<Id> | undefined {
  if (!b?.length) return a;
  if (!a?.size) return new Set(b);
  const s = new Set<Id>(a);
  for (const id of b) s.add(id);
  return s;
}

/**
 * Projetos com as paredes ocultas no Hide in View fora (memo por projeto e conjunto de paredes): a resolução da planta
 * (`planViewOf`) enxerga o nível sem elas, então a junção dos vizinhos fecha e nenhuma silhueta da parede oculta sobra.
 * As aberturas dessas paredes saem junto (não há mais hospedeiro). O projeto é imutável, então o memo não envelhece.
 */
const semParedes = new WeakMap<Project, Map<string, Project>>();

function projetoSemParedes(p: Project, levelId: Id, ids: readonly Id[]): Project {
  if (ids.length === 0) return p;
  const key = `${levelId}|${[...ids].sort().join(',')}`;
  let porChave = semParedes.get(p);
  if (!porChave) {
    porChave = new Map();
    semParedes.set(p, porChave);
  }
  const hit = porChave.get(key);
  if (hit) return hit;
  const ocultas = new Set(ids.filter((id) => {
    const e = p.elements[id];
    return isWall(e) && e.levelId === levelId;
  }));
  const elements = { ...p.elements };
  for (const id of ocultas) delete elements[id];
  for (const [id, e] of Object.entries(p.elements)) if (isOpening(e) && ocultas.has(e.hostId)) delete elements[id];
  const next: Project = { ...p, elements };
  porChave.set(key, next);
  return next;
}

/**
 * Contexto derivado do nível e da vista: o mesmo para a geometria e para a sobreposição. Não depende de pan, de
 * seleção nem do cursor; só do projeto, do nível, do zoom e da planta de cobertura. Por isso a sobreposição pode ser
 * redesenhada sem refazer a geometria (ver `PlanFrame`).
 */
export interface PlanContext {
  /** Vista que o desenho representa (piso, cobertura ou planta de área), calculada uma vez em `planContext`. */
  viewId: Id;
  style: PlanStyle;
  /** Planta de cobertura (D6). */
  rp: boolean;
  view: ResolvedPlanView | null;
  /** Planta de forro (decisão 0021): vista para cima. */
  up: boolean;
  /** Geometria do nível que a planta desenha (com o intervalo de vista, ou a padrão). */
  geo: ResolvedLevel;
  /** Ocultos efetivos da vista: intervalo, categoria (em `view`) e Hide in View + temporário (`input.hidden`), sem os revelados. */
  hidden: ReadonlySet<Id> | undefined;
  /** Telhados ocultos pela categoria. */
  roofOff: ReadonlySet<Id> | undefined;
  /** Telhados ocultos para a seleção e o realce (a vista, a categoria ou o Hide in View). */
  roofHidden: ReadonlySet<Id> | undefined;
  /** Escadas do nível que a planta mostra (sem as ocultas pela vista). */
  stairs: ResolvedStair[];
  /** Rampas do nível que a planta mostra (sem as ocultas pela vista). */
  ramps: ResolvedRamp[];
}

export function planContext(input: PlanInputResolvido): PlanContext {
  const { project: p, viewport: v } = input;
  const rp = input.roofPlanMode;
  const viewId = input.viewId;
  const style = planStyleOf(p, input.levelId, v.zoom, input.areaPlan?.scale, viewId);
  const revealed = input.revealed;
  // Hide in View (permanente + temporário) que não está no modo Reveal. O Reveal o desenha de novo, com borda azul.
  const doUsuario = input.hidden ? [...input.hidden].filter((id) => !revealed?.has(id)) : undefined;
  // Parede oculta pelo usuário: a vista é resolvida sem ela (as vizinhas fecham a junção); o id continua em `hidden`.
  const paredesOcultas = doUsuario?.filter((id) => {
    const e = p.elements[id];
    return isWall(e) && e.levelId === input.levelId;
  });
  const pVis = paredesOcultas?.length ? projetoSemParedes(p, input.levelId, paredesOcultas) : p;
  // A cobertura não usa intervalo de vista (`view = null`); piso e planta de área leem o da própria vista.
  const view = rp ? null : comEsquadriasIndependentes(p, resolvedPlanViewOf(pVis, input.levelId, viewId), input.levelId, viewId, paredesOcultas);
  const up = view?.range.direction === 'up';
  const geo: ResolvedLevel = view ? view.geo : input.resolved;
  // `view.hidden` já traz o intervalo e a categoria; ele manda sobre o Reveal (o intervalo não é Hide in View).
  const efetivos = uniaoOcultos(view?.hidden, doUsuario);
  // Etapa 7 (regra 4.5): a cota e a etiqueta somem com o elemento que referenciam. O editor já traz as do Hide in View em
  // `input.hidden`; as presas a elemento fora do intervalo ou de categoria desligada saem daqui. Vale só para as anotações
  // da vista desenhada: cada planta de área tem as suas etiquetas (nenhuma é lida da planta de piso).
  const vistaDesenhada = planViewOf(p, viewId);
  const presas = efetivos?.size && vistaDesenhada ? annotationIdsOnHiddenHosts([vistaDesenhada], efetivos) : undefined;
  const hidden = uniaoOcultos(efetivos, presas);
  const roofOff: ReadonlySet<Id> | undefined = view ? view.categoryHidden : categoryVisibleInView(p, viewId, 'roof') ? undefined : new Set(telhadosDoNivel(p, input.levelId).map((r) => r.roofId));
  const roofHidden = view ? hidden : uniaoOcultos(roofOff, doUsuario);
  const stairs = escadasDoNivel(p, input.levelId).filter((s) => !hidden?.has(s.id));
  const ramps = rampasDoNivel(p, input.levelId).filter((r) => !hidden?.has(r.id));
  return { viewId, style, rp, view, up, geo, hidden, roofOff, roofHidden, stairs, ramps };
}
