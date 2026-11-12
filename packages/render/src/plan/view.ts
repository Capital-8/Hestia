import { difference, orientedRect, union, type MultiPolygon } from '@hestia/geom';
import {
  applyPartialStructure,
  classifyLevelEntries,
  cutLevelByJunction,
  frameOfWall,
  junctionLevel,
  openingGeometry,
  resolveFloors,
  resolveLevel,
  resolveRoofs,
  resolveRampsOnLevel,
  resolveRooms,
  resolveSlabs,
  resolveStairsOnLevel,
  type OpeningGeometry,
  type OpeningModel,
  type ResolvedLevel,
  type ViewClass,
} from '@hestia/engine';
import {
  GRAPHICS_CATEGORIES,
  categoryVisibleInView,
  isOpening,
  isWall,
  floorViewId,
  levelElevation,
  openingsOfWall,
  planViewRangeOf,
  viewGraphicsOf,
  wallsOnLevel,
  type GraphicsCategory,
  type Id,
  type PartialStructure,
  type Project,
  type ViewRange,
} from '@hestia/model';
import { roofFootprint } from './roofs.ts';
import { planFootprint } from './stairs.ts';
import { rampFootprint } from './ramps.ts';
import { openingSymbol, type OpeningSymbolOptions } from './symbols.ts';
import { contextoDaVista, projetoDaJuncao } from './viewContext.ts';
import type { Espessura, PlanTheme, StrokeOp } from './types.ts';

/** Estados de parede que a planta desenha só como contorno (fora do corte, dentro do intervalo). */
type OutlineClass = 'projection-above' | 'projection-below' | 'beyond';

/** Contorno de paredes de um estado fora do corte: a área (já sem a parte sobre a silhueta cortada). */
interface OutlineShape {
  cls: OutlineClass;
  shape: MultiPolygon;
}

/**
 * Vista da planta de um nível (decisão 0013): o intervalo da vista (`planViewRangeOf`), as cotas absolutas do corte e do
 * topo, o estado de cada elemento na vista e a geometria de planta resolvida com essas opções.
 */
export interface ResolvedPlanView {
  range: ViewRange;
  /** Cota absoluta do plano de corte: elevação do nível mais `cut`. */
  cutZ: number;
  /** Cota absoluta do topo: elevação do nível mais `top`. */
  topZ: number;
  /** Estado de cada elemento do nível (paredes, aberturas, pisos, lajes, telhados e escadas). */
  cls: ReadonlyMap<Id, ViewClass>;
  /** Elementos fora do intervalo (`hidden`): não são desenhados. */
  hidden: ReadonlySet<Id>;
  /** Paredes fora do corte e dentro do intervalo: só contorno (projeção ou "além"). */
  outlineWalls: ReadonlySet<Id>;
  /** Contornos das paredes fora do corte, por estado (ver `wallOutlineOps`). */
  outlines: OutlineShape[];
  /** Geometria do nível para a planta, resolvida com o corte, as aberturas da vista e a exibição parcial de estrutura. */
  geo: ResolvedLevel;
  /**
   * Elementos ocultos pela substituição de visibilidade da categoria (decisão 0015 §2.4). Também estão em `hidden`, então
   * somem da seleção, das etiquetas e do desenho; só o contorno fantasma (`hiddenSelectionOps`) os deixa de fora, porque
   * o usuário os ocultou de propósito e não por estarem fora do intervalo.
   */
  categoryHidden: ReadonlySet<Id>;
  /** Exibição parcial de estrutura aplicada a `geo` (decisão 0015 §2.5). */
  partial: PartialStructure;
}

/**
 * Vista por projeto, VISTA (`viewId`), exibição parcial e categorias ocultas: o projeto é imutável (cada edição cria
 * outro objeto), então o cache não envelhece. Depende de intervalo de vista e gráficos, que são da vista: duas vistas do
 * mesmo nível (piso e planta de área) não dividem entrada. A chave inclui só o que muda a resolução; pan, zoom e hover
 * reaproveitam a vista.
 */
const memo = new WeakMap<Project, Map<string, ResolvedPlanView>>();

const OUTLINE_CLASSES: OutlineClass[] = ['projection-above', 'projection-below', 'beyond'];

/** Ids dos elementos do nível cuja categoria está oculta na vista (paredes, aberturas, pisos, lajes, telhados, escadas e ambientes). */
function categoryHiddenIds(p: Project, levelId: Id, hiddenCats: HiddenCats): Set<Id> {
  const out = new Set<Id>();
  if (hiddenCats.size === 0) return out;
  const add = (c: GraphicsCategory, id: Id): void => {
    if (hiddenCats.has(c)) out.add(id);
  };
  for (const w of wallsOnLevel(p, levelId)) {
    add('wall', w.id);
    for (const o of openingsOfWall(p, w.id)) add(o.kind, o.id);
  }
  for (const f of resolveFloors(p, levelId)) add('floor', f.floorId);
  for (const s of resolveSlabs(p, levelId)) add('slab', s.slabId);
  for (const r of resolveRoofs(p, levelId)) add('roof', r.roofId);
  for (const s of resolveStairsOnLevel(p, levelId)) add('stair', s.id);
  for (const r of resolveRampsOnLevel(p, levelId)) add('stair', r.id);
  for (const r of resolveRooms(p, levelId)) add('room', r.roomId);
  return out;
}

type HiddenCats = ReadonlySet<GraphicsCategory>;

function computePlanView(p: Project, levelId: Id, viewId: Id, partial: PartialStructure, hiddenCats: HiddenCats): ResolvedPlanView {
  const range = planViewRangeOf(p, viewId);
  const elevation = levelElevation(p, levelId);
  const cutZ = elevation + range.cut;
  const cls = new Map<Id, ViewClass>();
  const hidden = new Set<Id>();
  const cutOpenings = new Set<Id>();
  const outlineWalls = new Set<Id>();
  const categoryHidden = categoryHiddenIds(p, levelId, hiddenCats);
  // Mesma classificação de `openingsCrossingCut` (aberturas `cut`), numa só passada pelo nível. Categoria oculta vira `hidden`.
  for (const e of classifyLevelEntries(p, levelId, range, contextoDaVista(p, levelId))) {
    const cl: ViewClass = categoryHidden.has(e.id) ? 'hidden' : e.cls;
    cls.set(e.id, cl);
    if (cl === 'hidden') hidden.add(e.id);
    if (e.category === 'opening' && cl === 'cut') cutOpenings.add(e.id);
    if (e.category === 'wall' && cl !== 'cut' && cl !== 'hidden') outlineWalls.add(e.id);
  }
  for (const id of categoryHidden) {
    cls.set(id, 'hidden');
    hidden.add(id);
  }
  // Parede oculta pela categoria: a geometria do nível sai sem nenhuma parede (nada delas aparece, nem juntas nem silhueta).
  const walls0 = hiddenCats.has('wall')
    ? ({ levelId, walls: {}, clusters: [] } as ResolvedLevel)
    // Paredes cortadas pela junção (P7c parte 2): cada camada sai só onde sobra da camada que a vence, na cota do plano da vista.
    : cutLevelByJunction(resolveLevel(p, levelId, undefined, { cutZ, planOpenings: cutOpenings, outlineWalls }), junctionLevel(projetoDaJuncao(p, levelId), levelId), { planZ: cutZ, outline: outlineWalls });
  const geo = applyPartialStructure(p, walls0, partial);
  // Silhueta cortada: o contorno das paredes fora do corte não deve riscá-la.
  const cutSilhouette = union(...geo.clusters.map((c) => c.silhouette));
  const walls = wallsOnLevel(p, levelId);
  const outlines: OutlineShape[] = [];
  for (const c of OUTLINE_CLASSES) {
    const parts: MultiPolygon[] = [];
    for (const w of walls) {
      if (cls.get(w.id) !== c) continue;
      for (const l of geo.walls[w.id]?.layers ?? []) parts.push(l.fragment);
    }
    if (parts.length === 0) continue;
    let shape = union(...parts);
    if (cutSilhouette.length > 0) shape = difference(shape, cutSilhouette);
    outlines.push({ cls: c, shape });
  }
  return { range, cutZ, topZ: elevation + range.top, cls, hidden, outlineWalls, outlines, geo, categoryHidden, partial };
}

/**
 * Vista da planta do nível (memorizada por projeto, vista, exibição parcial e categorias ocultas). `viewId` opcional:
 * sem ele vale a planta de piso do nível (o que as outras pastas sempre pediram). A cobertura não tem vista de planta
 * (ver `planContext`): quem desenha passa o id do piso ou o da planta de área.
 */
export function resolvedPlanViewOf(p: Project, levelId: Id, viewId: Id = floorViewId(levelId)): ResolvedPlanView {
  const g = viewGraphicsOf(p, viewId);
  const hiddenCats = new Set(GRAPHICS_CATEGORIES.filter((c) => !categoryVisibleInView(p, viewId, c)));
  const key = `${viewId}|${g.partialStructure}|${[...hiddenCats].join(',')}`;
  let byKey = memo.get(p);
  if (!byKey) {
    byKey = new Map();
    memo.set(p, byKey);
  }
  let view = byKey.get(key);
  if (!view) {
    view = computePlanView(p, levelId, viewId, g.partialStructure, hiddenCats);
    byKey.set(key, view);
  }
  return view;
}

type OutlineStyle = Omit<StrokeOp, 'pts' | 'closed'>;

/**
 * Contorno das paredes fora do corte (decisão 0013 §4): projeção acima do corte tracejada e fina; abaixo do corte e
 * "além", linha fina clara (a "além", mais clara ainda). Sem preenchimento. A parte que cai sobre a silhueta cortada já
 * saiu em `computePlanView`. `proj`: largura de projeção da parede (decisão 0015 §2.1), em papel ou em px.
 */
export function wallOutlineOps(view: ResolvedPlanView, theme: PlanTheme, proj: number | Espessura): StrokeOp[] {
  const e: Espessura = typeof proj === 'number' ? { widthPx: proj } : proj;
  const styles: Record<OutlineClass, OutlineStyle> = {
    'projection-above': { ...e, color: theme.inkSoft, alpha: 1, dash: [6, 3] },
    'projection-below': { ...e, color: theme.inkSoft, alpha: 0.8 },
    beyond: { ...e, color: theme.underlay, alpha: 0.9 },
  };
  const out: StrokeOp[] = [];
  for (const o of view.outlines) {
    for (const ring of o.shape.flat()) out.push({ pts: ring, closed: true, ...styles[o.cls] });
  }
  return out;
}

/**
 * Símbolo de uma abertura conforme o estado na vista (decisão 0013 §4). `cut`, ou sem classificação: símbolo normal, com
 * a espessura de corte. `projection-above` (peitoril acima do corte): tracejado sobre a parede inteira. `projection-below`
 * e `beyond`: símbolo leve, na cor de traço secundária. Os dois últimos e o tracejado usam a espessura de projeção.
 * `hidden`: nada. `widths` vem de `PlanPaint` da categoria (porta ou janela), com o peso de papel de cada espessura.
 * O desenho vem do modelo único (`openingPlanPaths`), com o nível de detalhe e a convenção de abertura da vista.
 */
export function openingViewOps(
  g: OpeningGeometry,
  cls: ViewClass | undefined,
  theme: PlanTheme,
  widths: { cut: Espessura; proj: Espessura },
  opts: OpeningSymbolOptions & { model: OpeningModel },
): StrokeOp[] {
  if (cls === 'hidden') return [];
  if (cls === 'projection-above') return openingSymbol(g, opts.model, theme, widths.proj, opts).map((s) => ({ ...s, dash: [6, 3] as [number, number] }));
  if (cls === 'projection-below' || cls === 'beyond') return openingSymbol(g, opts.model, { ...theme, ink: theme.inkSoft }, widths.proj, opts);
  return openingSymbol(g, opts.model, theme, widths.cut, opts);
}

/**
 * Contorno fantasma dos elementos selecionados que estão fora do intervalo de vista (decisão 0013 §4). O aviso "Selecionar"
 * põe os ocultos na seleção, mas a planta não os desenha; aqui cada um ganha o contorno da sua categoria, sem
 * preenchimento e em tracejado fino na cor de seleção. Parede: o contorno inteiro (a geometria da vista não resolve as
 * ocultas, então elas são resolvidas à parte, como contorno); abertura: o vão sobre a parede; piso, laje, telhado e escada:
 * a pegada, a mesma que a planta usa para o destaque. Elementos visíveis ou de outro nível não entram.
 */
export function hiddenSelectionOps(p: Project, levelId: Id, view: ResolvedPlanView, selection: readonly Id[], theme: PlanTheme): StrokeOp[] {
  // Ocultos pela categoria (substituição da vista) ficam de fora: o fantasma é do intervalo de vista (decisão 0013).
  const ids = selection.filter((id) => view.hidden.has(id) && !view.categoryHidden.has(id));
  if (ids.length === 0) return [];
  // A planta chama esta função a cada quadro (pan, zoom, hover) enquanto há um oculto selecionado. O resultado depende
  // só da vista (um objeto por projeto e nível), dos ids e da cor: guarda-se por vista e o quadro seguinte reaproveita.
  const key = `${levelId}|${theme.select}|${ids.join(',')}`;
  const memoOf = ghostMemo.get(view) ?? new Map<string, StrokeOp[]>();
  ghostMemo.set(view, memoOf);
  const hit = memoOf.get(key);
  if (hit) return hit;
  const out = ghostOps(p, levelId, view, ids, theme);
  if (memoOf.size >= GHOST_MEMO_LIMIT) memoOf.delete(memoOf.keys().next().value as string);
  memoOf.set(key, out);
  return out;
}

/** Contornos fantasma por vista (ver `hiddenSelectionOps`): até `GHOST_MEMO_LIMIT` seleções por vista. */
const ghostMemo = new WeakMap<ResolvedPlanView, Map<string, StrokeOp[]>>();
const GHOST_MEMO_LIMIT = 8;

/** Contorno fantasma dos ocultos `ids` (já filtrados): sem memo, ver `hiddenSelectionOps`. */
function ghostOps(p: Project, levelId: Id, view: ResolvedPlanView, ids: Id[], theme: PlanTheme): StrokeOp[] {
  const style: OutlineStyle = { widthPx: 1, color: theme.select, alpha: 0.9, dash: [5, 3] };
  const out: StrokeOp[] = [];
  const addRings = (m: MultiPolygon): void => {
    for (const ring of m.flat()) out.push({ pts: ring, closed: true, ...style });
  };
  const wallIds = ids.filter((id) => isWall(p.elements[id]));
  if (wallIds.length > 0) {
    // Mesmo corte da vista; as ocultas entram como contorno (`outlineWalls`), então o `fragment` é a parede inteira.
    const walls = cutLevelByJunction(resolveLevel(p, levelId, undefined, { cutZ: view.cutZ, planOpenings: new Set<Id>(), outlineWalls: new Set<Id>(wallIds) }), junctionLevel(projetoDaJuncao(p, levelId), levelId), { outline: new Set<Id>(wallIds) });
    const geo = applyPartialStructure(p, walls, view.partial);
    for (const id of wallIds) addRings(union(...(geo.walls[id]?.layers ?? []).map((l) => l.fragment)));
  }
  const footprints = new Map<Id, MultiPolygon>();
  for (const f of resolveFloors(p, levelId)) footprints.set(f.floorId, f.polygon);
  for (const s of resolveSlabs(p, levelId)) footprints.set(s.slabId, s.polygon);
  for (const r of resolveRoofs(p, levelId)) footprints.set(r.roofId, roofFootprint(r));
  for (const s of resolveStairsOnLevel(p, levelId)) footprints.set(s.id, planFootprint(s));
  for (const r of resolveRampsOnLevel(p, levelId)) footprints.set(r.id, rampFootprint(r));
  for (const id of ids) {
    const e = p.elements[id];
    if (isOpening(e)) {
      const f = frameOfWall(p, e.hostId);
      if (!f) continue;
      const g = openingGeometry(p, e, f);
      out.push({ pts: orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, g.width / 2, g.thickness / 2 + 0.02), closed: true, ...style });
      continue;
    }
    const m = footprints.get(id);
    if (m) addRings(m);
  }
  return out;
}
