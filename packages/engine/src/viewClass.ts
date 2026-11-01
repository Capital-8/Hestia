import {
  openingTypeById,
  ceilingTypeThickness,
  ceilingsOnLevel,
  isCeiling,
  floorTypeThickness,
  floorsOnLevel,
  isFloor,
  isOpening,
  isRoof,
  isSlab,
  isStair,
  isWall,
  levelElevation,
  openingHeight,
  openingSill,
  roofsOnLevel,
  slabRiseAt,
  slabTypeThickness,
  slabsOnLevel,
  stairBaseZ,
  stairTopZ,
  stairsOnLevel,
  wallsOnLevel,
  type Element,
  type Id,
  type Project,
  type ViewRange,
} from '@hestia/model';
import { resolveAllFloors, type ResolvedFloor } from './floors.ts';
import { planeZ, resolveAllRoofs, resolveRoofs, roofThickness, type ResolvedRoof } from './roofs.ts';
import { resolveAllSlabs, type ResolvedSlab } from './slabs.ts';
import { wallZRange } from './wallZ.ts';

/**
 * Estado de um elemento na planta do nível (decisão 0013 §2): `cut` atravessa o plano de corte; `projection-above` fica
 * entre o corte e o topo (tracejado); `projection-below` fica abaixo do corte, acima da base; `beyond` fica abaixo da
 * base, dentro da profundidade de vista; `hidden` está fora do intervalo.
 */
export type ViewClass = 'cut' | 'projection-above' | 'projection-below' | 'beyond' | 'hidden';

/** Categoria do elemento para avisos e tabelas (decisão 0013 §3). */
export type ViewCategory = 'wall' | 'opening' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'stair';

/** Faixa de cotas absolutas [z0, z1] de um elemento (z0 ≤ z1). */
export interface ElementZRange {
  z0: number;
  z1: number;
}

/**
 * Cotas resolvidas do projeto que as faixas de paredes precisam (paredes anexadas a piso, laje ou telhado). Montar uma
 * vez por projeto com `viewContextOf`; campos ausentes são resolvidos por `elementZRange`.
 */
export interface ViewContext {
  floors: ResolvedFloor[];
  slabs: ResolvedSlab[];
  roofs: ResolvedRoof[];
}

/** Elemento do nível com a categoria e o estado na vista. */
export interface ViewEntry {
  id: Id;
  category: ViewCategory;
  cls: ViewClass;
}

/** Tolerância (m) nas comparações de cota: uma borda exata conta como dentro. */
const EPS = 1e-9;

/**
 * Classifica uma faixa de cotas [z0, z1] na vista (decisão 0013 §2). `elevation` é a cota do nível; as cotas do
 * intervalo são relativas a ela. `extendBelow` (piso, laje, escada) faz a base e a profundidade valerem −∞: o
 * elemento abaixo da base aparece como `projection-below` e nunca fica oculto.
 * Vista de cima (`direction: 'up'`, planta de forro, decisão 0021): o topo não limita (tudo acima do corte aparece, como
 * forro a 2,60 m com topo padrão de 2,30 m), o que está abaixo do corte não aparece, e não há base nem profundidade.
 */
export function viewClassOf(range: ViewRange, elevation: number, z0: number, z1: number, opts: { extendBelow?: boolean } = {}): ViewClass {
  const lo = Math.min(z0, z1);
  const hi = Math.max(z0, z1);
  const top = elevation + range.top;
  const cut = elevation + range.cut;
  if (range.direction === 'up') {
    if (hi < cut - EPS) return 'hidden';
    if (lo <= cut + EPS && hi >= cut - EPS) return 'cut';
    return 'projection-above';
  }
  const extend = opts.extendBelow === true;
  const bottom = extend ? -Infinity : elevation + range.bottom;
  const depth = extend ? -Infinity : elevation + range.depth;
  if (lo > top + EPS) return 'hidden';
  if (hi < depth - EPS) return 'hidden';
  if (lo <= cut + EPS && hi >= cut - EPS) return 'cut';
  if (lo > cut + EPS) return 'projection-above';
  if (hi >= bottom - EPS) return 'projection-below';
  if (hi >= depth - EPS) return 'beyond';
  return 'hidden';
}

const contextoPorProjeto = new WeakMap<Project, ViewContext>();

/** Cotas resolvidas do projeto inteiro (todos os níveis), para as faixas de paredes anexadas. Em cache por projeto (o projeto é imutável: cada edição gera outro objeto):
 * o painel de Propriedades e a planta pedem o mesmo contexto várias vezes por edição, e resolvê-lo custa segundos. */
export function viewContextOf(p: Project): ViewContext {
  let c = contextoPorProjeto.get(p);
  if (!c) {
    c = { floors: resolveAllFloors(p), slabs: resolveAllSlabs(p), roofs: resolveAllRoofs(p) };
    contextoPorProjeto.set(p, c);
  }
  return c;
}

/** Categoria do elemento; sempre uma das seis (o tipo `Element` é fechado). */
function categoryOf(e: Element): ViewCategory {
  if (isWall(e)) return 'wall';
  if (isOpening(e)) return 'opening';
  if (isFloor(e)) return 'floor';
  if (isSlab(e)) return 'slab';
  if (isRoof(e)) return 'roof';
  if (isCeiling(e)) return 'ceiling';
  return 'stair';
}

/**
 * Faixa de cotas absolutas de um elemento (decisão 0013 §3). Parede: base até o topo mais alto (perfil ou altura, com
 * os anexos). Abertura: base da parede + peitoril até + altura do tipo. Piso e laje: face inferior até a superior (laje
 * inclinada: menor e maior cota dos vértices do contorno). Telhado: face inferior do beiral até a cumeeira. Escada:
 * base até topo. Telhado sem águas (tipo ausente, contorno inválido) fica na cota do beiral. Null quando o elemento não
 * tem como ser localizado: abertura sem parede anfitriã ou sem tipo.
 */
export function elementZRange(p: Project, e: Element, ctx: Partial<ViewContext> = {}): ElementZRange | null {
  if (isWall(e)) {
    const z = wallZRange(p, e, ctx.floors, ctx.slabs, ctx.roofs);
    return { z0: z.z0, z1: z.z0 + z.height };
  }
  if (isOpening(e)) {
    const host = p.elements[e.hostId];
    const t = openingTypeById(p, e.typeId);
    if (!isWall(host) || !t) return null;
    const z0 = wallZRange(p, host, ctx.floors, ctx.slabs, ctx.roofs).z0 + openingSill(t, e);
    return { z0, z1: z0 + openingHeight(t, e) };
  }
  if (isFloor(e)) {
    const t = p.floorTypes[e.typeId];
    const top = levelElevation(p, e.levelId) + e.heightOffset;
    return { z0: top - (t ? floorTypeThickness(t) : 0), z1: top };
  }
  if (isCeiling(e)) {
    const t = p.ceilingTypes[e.typeId];
    const top = levelElevation(p, e.levelId) + e.heightOffset;
    return { z0: top - (t ? ceilingTypeThickness(t) : 0), z1: top };
  }
  if (isSlab(e)) {
    const t = p.slabTypes[e.typeId];
    const base = levelElevation(p, e.levelId) + e.heightOffset;
    const tops = e.boundary.length > 0 ? e.boundary.map((v) => base + slabRiseAt(e.slope, v)) : [base];
    return { z0: Math.min(...tops) - (t ? slabTypeThickness(t) : 0), z1: Math.max(...tops) };
  }
  if (isRoof(e)) {
    const eave = levelElevation(p, e.levelId) + e.heightOffset;
    const rr = (ctx.roofs ?? resolveRoofs(p, e.levelId)).find((r) => r.roofId === e.id);
    let lo = Infinity;
    let hi = -Infinity;
    for (const pl of rr?.planes ?? []) {
      for (const poly of pl.polygon) {
        for (const ring of poly) {
          for (const v of ring) {
            const z = planeZ(pl, v);
            lo = Math.min(lo, z);
            hi = Math.max(hi, z);
          }
        }
      }
    }
    // Sem águas (telhado sem tipo, contorno inválido ou sem superfície): a faixa fica na cota do beiral.
    if (!rr || !Number.isFinite(lo)) return { z0: eave, z1: eave };
    return { z0: lo - roofThickness(rr), z1: hi };
  }
  if (!isStair(e)) return null;
  const z0 = stairBaseZ(p, e);
  const z1 = stairTopZ(p, e);
  return { z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
}

/** Ordem por id: o resultado não depende da ordem de inserção dos elementos. */
const byId = (a: ViewEntry, b: ViewEntry): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Todos os elementos do nível (paredes, aberturas das paredes do nível, pisos, lajes, telhados e escadas) com a categoria
 * e o estado na vista. Ordenados por id, então o resultado não depende da ordem em que os elementos foram criados.
 * Elementos sem faixa calculável (ver `elementZRange`) ficam de fora.
 */
export function classifyLevelEntries(p: Project, levelId: Id, range: ViewRange, ctx: ViewContext = viewContextOf(p)): ViewEntry[] {
  const elevation = levelElevation(p, levelId);
  const walls = wallsOnLevel(p, levelId);
  const hostIds = new Set<Id>(walls.map((w) => w.id));
  const openings = Object.values(p.elements).filter(isOpening).filter((o) => hostIds.has(o.hostId));
  const list: Element[] = [
    ...walls,
    ...openings,
    ...floorsOnLevel(p, levelId),
    ...slabsOnLevel(p, levelId),
    ...ceilingsOnLevel(p, levelId),
    ...roofsOnLevel(p, levelId),
    ...stairsOnLevel(p, levelId),
  ];
  const out: ViewEntry[] = [];
  for (const e of list) {
    const r = elementZRange(p, e, ctx);
    if (!r) continue;
    const category = categoryOf(e);
    // Piso, laje e escada estendem para baixo: nunca ficam ocultos nem "além" por estarem abaixo da base. Na planta de
    // forro (vista de cima) não estendem: o que está abaixo do corte não sai.
    const extendBelow = range.direction === 'down' && (category === 'floor' || category === 'slab' || category === 'stair');
    out.push({ id: e.id, category, cls: viewClassOf(range, elevation, r.z0, r.z1, { extendBelow }) });
  }
  return out.sort(byId);
}

/** Estado na vista de cada elemento do nível, por id (decisão 0013 §2). Ver `classifyLevelEntries`. */
export function classifyLevelForView(p: Project, levelId: Id, range: ViewRange): Map<Id, ViewClass> {
  return new Map<Id, ViewClass>(classifyLevelEntries(p, levelId, range).map((e) => [e.id, e.cls]));
}
