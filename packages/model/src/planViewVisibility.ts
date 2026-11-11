import type { GraphicsCategory, ViewHidden } from './graphics.ts';
import { planViewOf, viewGraphicsOf, viewProfileOf, type PlanView } from './planView.ts';
import type { Id, Project } from './types.ts';
import type { ProfileLayers } from './viewProfile.ts';

/**
 * Visibilidade numa vista de planta: a regra única (docs/vistas/PLANO-MESTRE.md §4.5, ordem do Revit). Desenho, seleção,
 * captura, DXF e prancha perguntam aqui. Um item aparece se passar por TODAS as etapas:
 *
 * 1. alcance: nível e intervalo de vista (`session.outOfRange`, que o motor classifica; o `model` não importa o engine);
 * 2. tipo de vista: a camada do perfil da vista existe (planta de área: paredes, aberturas, pisos, cotas, textos, detalhes);
 * 3. categoria: sem substituição de visibilidade da categoria nos gráficos (`overrides[cat].visible`) nem em `hidden.categories`;
 * 4. filtros (Fase 4, ainda não existem);
 * 5. elemento: fora de `hidden.elements`;
 * 6. temporário (`session.temporary`): sessão, nunca salvo, e por isso nunca vale para prancha, PDF nem DXF (quem monta
 *    essas saídas simplesmente não passa `temporary`);
 * 7. anotação presa a elemento: raia I da Fase 3, ainda não aqui.
 *
 * O nível do item continua sendo responsabilidade de quem enumera (todo consumidor percorre os elementos de um nível, ou
 * o de baixo no subpavimento); por isso a etapa 1 não compara `levelId`.
 */
export interface VisibilitySession {
  /** Etapa 1: ids que o motor classificou fora do intervalo da vista (`ResolvedPlanView.hidden`). */
  outOfRange?: ReadonlySet<Id>;
  /** Etapa 6: ocultar/isolar temporário (HH/HC e HI/IC). */
  temporary?: { hidden?: ViewHidden; isolated?: ViewHidden };
  /** Modo "revelar ocultos": `hidden.categories`, `hidden.elements` e o temporário deixam de esconder. */
  revealing?: boolean;
}

/** Categoria gráfica de um elemento do modelo (o que "Ocultar categoria" atinge); `null` quando não há. */
export function categoryOfElement(e: { kind: string }): GraphicsCategory | null {
  switch (e.kind) {
    case 'wall': return 'wall';
    case 'door': return 'door';
    case 'window': return 'window';
    case 'floor': return 'floor';
    case 'slab': return 'slab';
    case 'ceiling': return 'floor';
    case 'roof': return 'roof';
    case 'stair':
    case 'ramp': return 'stair';
    case 'room': return 'room';
    case 'cad':
    case 'generic': return 'generic';
    case 'dimension':
    case 'text':
    case 'detailLine':
    case 'detailRegion':
    case 'tag':
    case 'roomSeparator': return 'annotation';
    default: return null;
  }
}

type AnnotationLayer = 'dimensions' | 'texts' | 'detail' | 'tags';

const annotationLayers = new WeakMap<PlanView, Map<Id, AnnotationLayer>>();

/** Camada do perfil de cada anotação da vista (memória por vista). */
function annotationLayersOf(v: PlanView): Map<Id, AnnotationLayer> {
  let m = annotationLayers.get(v);
  if (!m) {
    m = new Map();
    const a = v.annotations;
    for (const d of a.dimensions) m.set(d.id, 'dimensions');
    for (const d of a.texts) m.set(d.id, 'texts');
    for (const d of a.detailLines) m.set(d.id, 'detail');
    for (const d of a.detailRegions) m.set(d.id, 'detail');
    for (const d of a.tags) m.set(d.id, 'tags');
    annotationLayers.set(v, m);
  }
  return m;
}

interface ItemInfo {
  category: GraphicsCategory | null;
  /** A camada do perfil que desliga o item está desligada? */
  layerOff: (l: ProfileLayers) => boolean;
}

/** O que o item é para a regra: a categoria e a camada do perfil que o desliga. */
function infoOf(p: Project, v: PlanView | undefined, id: Id): ItemInfo {
  const e = p.elements[id];
  if (e) {
    const kind = e.kind as string;
    return {
      category: categoryOfElement(e),
      layerOff: (l) => (kind === 'wall' ? l.walls === 'hidden' : kind === 'door' || kind === 'window' ? !l.openings : kind === 'floor' ? !l.floors : false),
    };
  }
  const layer = v ? annotationLayersOf(v).get(id) : undefined;
  if (layer) return { category: 'annotation', layerOff: (l) => !l[layer] };
  return { category: null, layerOff: () => false };
}

/** Etapa 3: a categoria está visível nos gráficos da vista (`overrides[cat].visible`)? */
export function categoryVisibleInView(p: Project, viewId: Id, category: GraphicsCategory): boolean {
  return viewGraphicsOf(p, viewId).overrides[category].visible;
}

function inHidden(h: ViewHidden | undefined, id: Id, category: GraphicsCategory | null): boolean {
  return !!h && (h.elements?.includes(id) === true || (category !== null && h.categories?.includes(category) === true));
}

const isolationMemo = new WeakMap<ViewHidden, { p: Project; v: PlanView | undefined; active: boolean }>();

/**
 * O isolamento temporário vale? Só se isolar algo: elementos listados ou categorias que casam com pelo menos um
 * elemento do projeto ou anotação da vista (categoria sem elementos não esconde nada, como sempre foi).
 */
function isolationActive(p: Project, v: PlanView | undefined, isolated: ViewHidden): boolean {
  if ((isolated.elements?.length ?? 0) > 0) return true;
  const cats = isolated.categories;
  if (!cats?.length) return false;
  const hit = isolationMemo.get(isolated);
  if (hit && hit.p === p && hit.v === v) return hit.active;
  const set = new Set(cats);
  let active = Object.values(p.elements).some((e) => {
    const c = categoryOfElement(e);
    return c !== null && set.has(c);
  });
  if (!active && set.has('annotation') && v) active = annotationLayersOf(v).size > 0;
  isolationMemo.set(isolated, { p, v, active });
  return active;
}

/**
 * Ocultação escolhida pelo usuário (etapas 3, só `hidden.categories`, 5 e 6): é o que o "revelar ocultos" mostra de novo
 * e o que vai ao desenho como `hidden`. Com isolamento temporário ativo, só o isolado aparece (e ele manda sobre o
 * oculto permanente, como no Revit).
 */
export function hiddenByUserInView(p: Project, viewId: Id, id: Id, session: VisibilitySession = {}): boolean {
  const v = planViewOf(p, viewId);
  const { category } = infoOf(p, v, id);
  const t = session.temporary;
  const isolated = t?.isolated;
  if (isolated && isolationActive(p, v, isolated)) return !inHidden(isolated, id, category);
  return inHidden(v?.hidden, id, category) || inHidden(t?.hidden, id, category);
}

/** A regra única: o item aparece na vista? (etapas 1 a 6; ver o cabeçalho do arquivo). */
export function visibleInView(p: Project, viewId: Id, id: Id, session: VisibilitySession = {}): boolean {
  if (session.outOfRange?.has(id)) return false;
  const v = planViewOf(p, viewId);
  const { category, layerOff } = infoOf(p, v, id);
  if (layerOff(viewProfileOf(p, viewId).layers)) return false;
  if (category !== null && !categoryVisibleInView(p, viewId, category)) return false;
  return session.revealing ? true : !hiddenByUserInView(p, viewId, id, session);
}

/**
 * Ids que o usuário oculta na vista (`hiddenByUserInView`) entre todos os elementos do projeto e as anotações da vista.
 * É o `hidden` que o desenho recebe. Sem `session.temporary`, é o que vale para prancha, PDF e DXF (etapa 6 nunca vale ali).
 */
export function hiddenByUserIdsInView(p: Project, viewId: Id, session: VisibilitySession = {}, extra: Iterable<Id> = []): Set<Id> {
  const out = new Set<Id>();
  const v = planViewOf(p, viewId);
  const temTemporario = !!session.temporary?.hidden || !!session.temporary?.isolated;
  if (!temTemporario && !v?.hidden?.elements?.length && !v?.hidden?.categories?.length) return out;
  const ids = [...Object.keys(p.elements), ...(v ? annotationLayersOf(v).keys() : []), ...extra];
  for (const id of ids) if (hiddenByUserInView(p, viewId, id, session)) out.add(id);
  return out;
}

/** Ids, dentre `ids`, que a regra única esconde na vista. */
export function hiddenIdsInView(p: Project, viewId: Id, ids: Iterable<Id>, session: VisibilitySession = {}): Set<Id> {
  const out = new Set<Id>();
  for (const id of ids) if (!visibleInView(p, viewId, id, session)) out.add(id);
  return out;
}
