import {
  arcSample,
  boxOf,
  boxesOverlap,
  difference,
  expandBox,
  multiArea,
  closeGapsSafe,
  unionClipper,
  type Box,
  type MultiPolygon,
} from '@hestia/geom';
import {
  coreSpan,
  FUNCTION_PRIORITY,
  layerPriority,
  layerSpans,
  openingHeight,
  openingRough,
  openingSill,
  openingType,
  openingsOfWall,
  wallBaseElevation,
  wallMaxHeight,
  wallsOnLevel,
  wallType,
  type Id,
  type Opening,
  type Project,
} from '@hestia/model';
import { buildFrame, normalAt, pointAt, sAtDepth, tangentAt, toLocal, type WallFrame } from './frame.ts';
import type { EndSpec, WallEnds } from './joins.ts';
import { despachanteDeNivel } from './resolveDespacho.ts';
import { estruturaDasJuncoes, furosDe, pinturasDoCluster, pintarCompartilhado } from './resolveMemo.ts';
import { endPoint, layerQuad, membranesOf, sideAt, withBottomProfile, withProfile } from './layerGeom.ts';
import { flatEnd } from './joinSides.ts';
import { layerCoreFlags } from './junctionPlanar.ts';
import { makeReturnClipper } from './clipReturn.ts';
import { endReturns, insertMode, insertReturns } from './wrap.ts';
import { cutHalfOf, openingRect } from './openingCut.ts';
import { attachTargets } from './attachTargets.ts';
import { resolveAllRoofs } from './roofs.ts';
import { wallZRange, type WallZ } from './wallZ.ts';
import { withWallZ } from './wallFrameZ.ts';
import { round, ringsOfShape, sigCanonica } from './geomSig.ts';
import type { LayerBand, OpeningGeometry, Region, ResolvedCluster, ResolvedLayer, ResolvedLevel, ResolvedWall } from './types.ts';

const MIN_AREA = 1e-9;
const EPS_Z = 1e-6;
const CLUSTER_PAD = 0.02;

/** Item por camada (e faixa vertical) de uma parede; exportado para a referência da sub-etapa A2 do kernel Rust (decisão 0047). */
export interface Item {
  wallId: Id;
  layerIndex: number;
  materialId: Id;
  priority: number;
  /** Camada dentro do núcleo da parede (0023 §1.2). */
  core: boolean;
  order: number;
  /** Espessura do núcleo da parede: desempata camadas de mesma prioridade entre paredes sem junção (a mais robusta domina). */
  coreT: number;
  /** A parede atravessa um T (outra parede termina nela): em prioridade igual ela continua e a que chega para na face. */
  through: boolean;
  /** Identificador estável dentro do cluster (chave de cache do pintor). */
  uid: number;
  /** Altura absoluta em que o item existe (camadas: a parede inteira; faixas: o intervalo da faixa). */
  z0: number;
  z1: number;
  /** Aparece na planta (a faixa só aparece se atravessar o plano de corte). */
  inPlan: boolean;
  /** Parede fora do corte que a planta quer só como contorno (`PlanResolveOptions.outlineWalls`). */
  outline: boolean;
  thickness: number;
  shape: MultiPolygon;
  box: Box;
}


/** Altura (relativa à base) do plano de corte da planta: faixas que não o atravessam não aparecem em planta. */
const PLAN_CUT = 1.2;

/**
 * Opções de planta do nível (decisão 0013 §4). Omitidas, valem as regras de sempre: o corte fica 1,20 m acima da base de
 * cada parede e todas as aberturas furam a parede. A planta da vista passa as três. Só mudam a geometria de planta
 * (`fragment`, `cut`, regiões e silhueta); 3D, quantitativos e cortes seguem a resolução padrão, em cache à parte.
 */
export interface PlanResolveOptions {
  /** Cota absoluta do plano de corte (m). Parede ou faixa que o atravessa entra na planta cortada. */
  cutZ?: number;
  /** Aberturas que furam a parede na planta; as demais deixam a parede inteira. Omitido: todas. */
  planOpenings?: ReadonlySet<Id>;
  /**
   * Paredes que não atravessam o corte e aparecem só como contorno (projeção ou "além"). A geometria delas fica em
   * `fragment`, pintada só entre si, com `cut` vazio: não entram em regiões nem na silhueta.
   */
  outlineWalls?: ReadonlySet<Id>;
  /** Interno: anexa as paredes ao contorno de piso e laje, sem as camadas com término (usado pelo próprio término). */
  flatAttach?: boolean;
}

function flatT(f: WallFrame, which: 'a' | 'b', spec: EndSpec, sFace: number): number {
  const side = sideAt(f, spec, sFace);
  if (side.kind === 'flat') return side.t;
  return toLocal(f, endPoint(f, which, spec, sFace)).t;
}

export function buildItems(
  f: WallFrame,
  ends: WallEnds,
  freeEnds: Array<'a' | 'b'>,
  z: { z0: number; z1: number },
  through: boolean,
  planCut: number,
  outlineWall: boolean,
): Item[] {
  const items: Item[] = [];
  const coreT = Math.round((coreSpan(f.type).to - coreSpan(f.type).from) * 1e6) / 1e6;
  const coreFlags = layerCoreFlags(f.type.layers);
  const endWraps = new Map<number, MultiPolygon>();
  if (f.type.wrapEnds !== 'none') {
    for (const which of freeEnds) {
      for (const r of endReturns(f, which, f.type.wrapEnds)) endWraps.set(r.layerIndex, [...(endWraps.get(r.layerIndex) ?? []), ...r.poly]);
    }
  }
  const mk = (layerIndex: number, materialId: Id, priority: number, thickness: number, shape: MultiPolygon, z0: number, z1: number): void => {
    items.push({
      wallId: f.wall.id,
      layerIndex,
      materialId,
      priority,
      core: layerIndex >= 0 && (coreFlags[layerIndex] ?? false),
      order: f.wall.order,
      coreT,
      through,
      uid: 0,
      z0,
      z1,
      inPlan: z0 <= planCut + EPS_Z && z1 >= planCut - EPS_Z,
      outline: outlineWall && !(z0 <= planCut + EPS_Z && z1 >= planCut - EPS_Z),
      thickness,
      shape,
      box: boxOf(shape.flatMap((p) => p[0] ?? [])),
    });
  };
  for (const sp of layerSpans(f.type)) {
    if (sp.layer.thickness < 1e-6) continue;
    const ring = layerQuad(f, ends, sAtDepth(f, sp.from), sAtDepth(f, sp.to));
    let shape: MultiPolygon = [[ring]];
    const wrap = endWraps.get(sp.index);
    if (wrap) shape = [...shape, ...wrap];
    mk(sp.index, sp.layer.materialId, layerPriority(sp.layer), sp.layer.thickness, shape, z.z0, z.z1);
  }
  // Faixas verticais (rodapé, barra de azulejo): fora da espessura da parede, com prioridade de acabamento.
  (f.type.strips ?? []).forEach((st, k) => {
    const z0 = z.z0 + Math.max(0, st.z0);
    const z1 = Math.min(z.z1, z.z0 + st.z1);
    if (z1 - z0 < EPS_Z || st.thickness < 1e-6) return;
    const sFace = st.side === 'exterior' ? f.sExt : f.sInt;
    const outward = st.side === 'exterior' ? f.sign : -f.sign;
    const ta = flatT(f, 'a', ends.a, sFace);
    const tb = flatT(f, 'b', ends.b, sFace);
    const ring = layerQuad(f, { a: flatEnd(ta), b: flatEnd(tb) }, sFace, sFace + outward * st.thickness);
    mk(-(k + 1), st.materialId, FUNCTION_PRIORITY.finish2, st.thickness, [[ring]], z0, z1);
  });
  return items;
}

/** Algoritmo do pintor por prioridade (docs/05 §1): o menor número de prioridade é aceito primeiro e corta os demais. */
export function paint(items: Item[]): Map<Item, MultiPolygon> {
  // Prioridade igual: a parede que atravessa um T vem primeiro (a que chega para na face dela, como no Revit);
  // só depois valem o núcleo mais robusto e a ordem de criação (paredes sobrepostas sem junção).
  const sorted = [...items].sort((x, y) => x.priority - y.priority || Number(y.through) - Number(x.through) || y.coreT - x.coreT || x.order - y.order || x.layerIndex - y.layerIndex);
  const result = new Map<Item, MultiPolygon>();
  const higher: Item[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j]!.priority === sorted[i]!.priority) j++;
    const group = sorted.slice(i, j);
    const accepted: Item[] = [];
    for (const it of group) {
      const subs: MultiPolygon[] = [];
      for (const h of higher) if (boxesOverlap(h.box, it.box)) subs.push(h.shape);
      // Mesma prioridade: o mais antigo vence, então a camada nova não duplica a área do canto.
      for (const g of accepted) if (g.wallId !== it.wallId && boxesOverlap(g.box, it.box)) subs.push(g.shape);
      const vis = subs.length ? difference(it.shape, ...subs) : it.shape;
      result.set(it, vis.filter((p) => multiArea([p]) > MIN_AREA));
      accepted.push(it);
    }
    higher.push(...group);
    i = j;
  }
  return result;
}

/** Grupos de paredes por caixas sobrepostas (exportada para a referência da sub-etapa A1 do kernel Rust, decisão 0047). */
export function clusterWalls(frames: WallFrame[], ends: Map<string, WallEnds>): WallFrame[][] {
  const boxes = frames.map((f) => {
    const e = ends.get(f.wall.id)!;
    const pts = [f.sHi, f.sLo].flatMap((s) => [
      endPoint(f, 'a', e.a, s),
      endPoint(f, 'b', e.b, s),
      ...(f.arc ? arcSample(f.arc, 0, f.length, s, 0.05) : []),
    ]);
    return expandBox(boxOf(pts), CLUSTER_PAD);
  });
  const parent = frames.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    return r;
  };
  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      if (boxesOverlap(boxes[i]!, boxes[j]!)) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, WallFrame[]>();
  frames.forEach((f, i) => {
    const k = find(i);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  });
  return [...groups.values()];
}

export function openingGeometry(p: Project, o: Opening, f: WallFrame): OpeningGeometry {
  const t = openingType(p, o);
  // Altura efetiva da instância também define o vão bruto: a folga do tipo cresce o furo, não a esquadria.
  const height = openingHeight(t, o);
  const rough = openingRough({ ...t, height });
  return {
    openingId: o.id,
    hostId: o.hostId,
    kind: o.kind,
    center: pointAt(f, o.offset, f.sMid),
    u: tangentAt(f, o.offset),
    n: normalAt(f, o.offset),
    width: t.width,
    height,
    roughWidth: rough.width,
    roughHeight: rough.height,
    sill: openingSill(t, o),
    thickness: f.thickness,
    sHi: f.sHi,
    sLo: f.sLo,
    leaves: t.leaves,
    plan: t.plan,
    flipHand: o.flipHand,
    flipFacing: o.flipFacing,
    offset: o.offset,
    ...(f.arc ? { cutHalf: cutHalfOf(f, rough.width / 2) } : {}),
  };
}

function clusterKey(items: Item[], opens: OpeningGeometry[]): string {
  const it = items.map((i) => `${i.wallId}|${i.layerIndex}|${i.materialId}|${i.priority}|${i.order}|${i.through ? 1 : 0}|${round(i.z0)}:${round(i.z1)}:${i.inPlan ? 1 : 0}:${i.outline ? 1 : 0}|${ringsOfShape(i.shape)}`);
  const op = opens.map((g) => `${g.openingId}|${g.hostId}|${round(g.center.x)},${round(g.center.y)}|${round(g.width)}|${round(g.height)}|${round(g.roughWidth)}|${round(g.roughHeight)}|${round(g.sill)}|${round(g.u.x)},${round(g.u.y)}|${round(g.thickness)}|${round(g.cutHalf ?? 0)}`);
  return `${it.join('\n')}\n--\n${op.join('\n')}`;
}

interface ClusterCore {
  layers: Map<Id, ResolvedLayer[]>;
  regions: Region[];
  silhouette: MultiPolygon;
}

/** Altura absoluta (m) ocupada por uma parede. */
interface ZRange {
  z0: number;
  z1: number;
}


/** Pontos de quebra vertical: bases, topos, limites das faixas e dos vãos de todas as paredes do cluster. */
function breakpoints(items: Item[], zr: Map<Id, ZRange>, opens: OpeningGeometry[]): number[] {
  const set = new Set<number>();
  const add = (z: number): void => void set.add(Math.round(z / EPS_Z) * EPS_Z);
  for (const r of zr.values()) {
    add(r.z0);
    add(r.z1);
  }
  for (const i of items) {
    add(i.z0);
    add(i.z1);
  }
  for (const g of opens) {
    const w = zr.get(g.hostId);
    if (!w) continue;
    for (const z of [w.z0 + g.sill, w.z0 + g.sill + g.roughHeight]) if (z > w.z0 + EPS_Z && z < w.z1 - EPS_Z) add(z);
  }
  return [...set].sort((a, b) => a - b);
}

/** Perfis derivados da parede (topo e base por trecho), relativos à base, só quando existem (decisão 0023 §6, P9). */
const perfisDoResolvido = (z: WallZ): Pick<ResolvedWall, 'profileTop' | 'profileBottom'> => ({
  ...(z.profile ? { profileTop: z.profile } : {}),
  ...(z.bottomProfile ? { profileBottom: z.bottomProfile } : {}),
});

type Returns = Map<string, Array<{ openingId: Id; poly: MultiPolygon }>>;

function solveCluster(items: Item[], opens: OpeningGeometry[], zr: Map<Id, ZRange>, returns: Returns, planOpen: (id: Id) => boolean): ClusterCore {
  const compartilhadas = pinturasDoCluster(items);
  const paintCache = new Map<string, Map<Item, MultiPolygon>>();
  const paintFor = (active: Item[]): Map<Item, MultiPolygon> => {
    const key = active.map((i) => i.uid).sort((x, y) => x - y).join(',');
    let m = paintCache.get(key);
    if (!m) {
      m = pintarCompartilhado(compartilhadas, key, active, paint);
      paintCache.set(key, m);
    }
    return m;
  };
  const plan = paintFor(items.filter((i) => i.inPlan));
  // Paredes só de contorno (fora do corte) pintam só entre si: não cortam as paredes que o corte atravessa.
  const outlinePaint = paint(items.filter((i) => i.outline));
  // Retornos de acabamento não invadem paredes vizinhas (ver clipReturn.ts).
  const clipReturn = makeReturnClipper(items);
  const layers = new Map<Id, ResolvedLayer[]>();
  const byMaterial = new Map<Id, MultiPolygon[]>();
  const bandsOf = new Map<Item, LayerBand[]>();

  // Faixas verticais: cada uma resolve a prioridade só entre os itens que existem naquela altura.
  const zs = breakpoints(items, zr, opens);
  for (let k = 0; k + 1 < zs.length; k++) {
    const za = zs[k]!;
    const zb = zs[k + 1]!;
    if (zb - za < EPS_Z) continue;
    const mid = (za + zb) / 2;
    const active = items.filter((i) => i.z0 <= za + EPS_Z && i.z1 >= zb - EPS_Z);
    if (active.length === 0) continue;
    const painted = paintFor(active);
    for (const it of active) {
      const frag = painted.get(it);
      if (!frag || frag.length === 0) continue;
      const w = zr.get(it.wallId)!;
      const holes = opens
        .filter((g) => g.hostId === it.wallId && mid > w.z0 + g.sill && mid < w.z0 + g.sill + g.roughHeight)
        .map(openingRect);
      let poly = holes.length ? furosDe(frag, holes) : frag;
      // Retorno do acabamento no vão: só nas faixas de altura que o vão atravessa.
      for (const r of returns.get(`${it.wallId}|${it.layerIndex}`) ?? []) {
        const g = opens.find((x) => x.openingId === r.openingId);
        if (g && mid > w.z0 + g.sill && mid < w.z0 + g.sill + g.roughHeight) poly = [...poly, ...clipReturn(r, it.wallId, painted)];
      }
      if (poly.length === 0) continue;
      const list = bandsOf.get(it) ?? [];
      const prev = list[list.length - 1];
      const rel0 = za - w.z0;
      const rel1 = zb - w.z0;
      if (prev && Math.abs(prev.z1 - rel0) < EPS_Z && (prev.poly === poly || sigCanonica(prev.poly) === sigCanonica(poly))) prev.z1 = rel1;
      else list.push({ z0: rel0, z1: rel1, poly });
      bandsOf.set(it, list);
    }
  }

  for (const it of items) {
    const fragment = it.inPlan ? (plan.get(it) ?? []) : it.outline ? (outlinePaint.get(it) ?? []) : [];
    if (it.inPlan && fragment.length === 0) continue;
    let cut = fragment;
    if (it.inPlan && fragment.length) {
      // Só as aberturas que furam a parede na planta; o retorno do vão sai junto com o seu vão.
      const rects = opens.filter((g) => g.hostId === it.wallId && planOpen(g.openingId)).map(openingRect);
      cut = rects.length ? difference(fragment, ...rects) : fragment;
      for (const r of returns.get(`${it.wallId}|${it.layerIndex}`) ?? []) if (planOpen(r.openingId)) cut = [...cut, ...clipReturn(r, it.wallId, plan)];
    }
    if (it.outline) cut = [];
    const bands = bandsOf.get(it) ?? [];
    if (!fragment.length && bands.length === 0) continue;
    const arr = layers.get(it.wallId) ?? [];
    arr.push({ layerIndex: it.layerIndex, materialId: it.materialId, priority: it.priority, core: it.core, fragment, cut, bands, raw: it.shape });
    layers.set(it.wallId, arr);
    if (cut.length) byMaterial.set(it.materialId, [...(byMaterial.get(it.materialId) ?? []), cut]);
  }
  const regions: Region[] = [...byMaterial.entries()].map(([materialId, parts]) => ({ materialId, polygons: closeGapsSafe(unionClipper(...parts)) }));
  // Silhueta pela união das regiões por material. Unir todos os cortes numa só operação do Clipper foi tentado (semente 18
  // dos testes de propriedade: um bolsão fechado de 0,029 metros quadrados entre três paredes que se cruzam fica preenchido nesta união),
  // mas em outras sementes essa união única preencheu ambientes inteiros (até 8,9 metros quadrados a mais): o erro de 0,1% é o menor.
  const silhouette = closeGapsSafe(unionClipper(...regions.map((r) => r.polygons)));
  for (const arr of layers.values()) arr.sort((a, b) => a.layerIndex - b.layerIndex);
  return { layers, regions, silhouette };
}

export type ResolveCache = Map<string, ClusterCore>;
const sharedCache: ResolveCache = new Map();
const CACHE_LIMIT = 400;

// `frameOfWall` e `levelFrames` moraram aqui; foram para `resolveFrames.ts` (limite de linhas) e seguem exportados por este módulo.
export { frameOfWall, levelFrames } from './resolveFrames.ts';

/** Com o despachante do kernel Rust instalado (`resolveDespacho.ts`), ele decide o resultado; senão é o TypeScript de sempre. */
export function resolveLevel(p: Project, levelId: Id, cache: ResolveCache = sharedCache, opts: PlanResolveOptions = {}): ResolvedLevel {
  const d = despachanteDeNivel();
  return d ? d(p, levelId, opts, () => resolveLevelTs(p, levelId, cache, opts)) : resolveLevelTs(p, levelId, cache, opts);
}

/** O motor TypeScript, sem despacho (a referência do Rust e o retorno de qualquer falha do kernel). */
export function resolveLevelTs(p: Project, levelId: Id, cache: ResolveCache = sharedCache, opts: PlanResolveOptions = {}): ResolvedLevel {
  const walls = wallsOnLevel(p, levelId);
  const planOpenSet = opts.planOpenings;
  const planOpen = (id: Id): boolean => !planOpenSet || planOpenSet.has(id);
  // Chave das opções de planta: só o que muda a geometria de planta (o corte já entra pelo `inPlan` dos itens).
  const planSig = planOpenSet ? `open:${[...planOpenSet].sort().join(',')}` : 'open:*';
  const frames = withWallZ(p, walls.map((w) => buildFrame(w, wallType(p, w))).filter((f): f is WallFrame => f !== null));
  const estrutura = estruturaDasJuncoes(levelId, frames, p.settings?.joinTolerance);
  const out: ResolvedLevel = { levelId, walls: {}, clusters: [] };
  // Parede anexada enxerga o piso e a laje por camada (término esvazia o contorno); o próprio término usa o contorno
  // do elemento (`flatAttach`), porque as camadas dependem das paredes (sem ciclo, decisão 0025).
  const { floors, slabs } = attachTargets(p, walls, opts.flatAttach === true);
  // Telhados de todos os níveis só entram se alguma parede deste nível se anexa ao topo do telhado (senão não são lidos).
  const roofs = walls.some((w) => w.attachTopToRoof === true) ? resolveAllRoofs(p) : [];
  for (const group of clusterWalls(frames, estrutura.ends)) {
    const freeOf = (f: WallFrame): Array<'a' | 'b'> =>
      (['a', 'b'] as const).filter((w) => {
        const k = estrutura.status(f.wall.id, w).kind;
        return k === 'free' || k === 'disallowed';
      });
    const throughIds = new Set<Id>();
    for (const f of group) {
      for (const w of ['a', 'b'] as const) {
        const st = estrutura.status(f.wall.id, w);
        if (st.kind === 'tee') throughIds.add(st.hostId);
      }
    }
    const wz = new Map(group.map((f) => [f.wall.id, wallZRange(p, f.wall, floors, slabs, roofs)] as const));
    const items = group.flatMap((f) => {
      const { z0, height } = wz.get(f.wall.id)!;
      // Sem `cutZ`, o corte fica 1,20 m acima da base desta parede (como antes).
      const planCut = opts.cutZ ?? z0 + PLAN_CUT;
      return buildItems(f, estrutura.ends.get(f.wall.id)!, freeOf(f), { z0, z1: z0 + height }, throughIds.has(f.wall.id), planCut, opts.outlineWalls?.has(f.wall.id) === true);
    });
    items.forEach((it, i) => {
      it.uid = i;
    });
    const returns: Returns = new Map();
    for (const f of group) {
      for (const o of openingsOfWall(p, f.wall.id)) {
        const ot = openingType(p, o);
        const mode = insertMode(f.type, ot);
        for (const r of insertReturns(f, o.offset, ot.width, mode, { ot, side: o.flipFacing ? -1 : 1 })) {
          const key = `${f.wall.id}|${r.layerIndex}`;
          returns.set(key, [...(returns.get(key) ?? []), { openingId: o.id, poly: r.poly }]);
        }
      }
    }
    const opens = group.flatMap((f) => openingsOfWall(p, f.wall.id).map((o) => openingGeometry(p, o, f)));
    const heights = new Map(group.map((f) => [f.wall.id, wz.get(f.wall.id)!.height] as const));
    const zr = new Map(
      group.map((f) => {
        const { z0, height } = wz.get(f.wall.id)!;
        return [f.wall.id, { z0, z1: z0 + height }] as const;
      }),
    );
    const retSig = [...returns].map(([k, v]) => `${k}=${v.map((x) => `${x.openingId}:${ringsOfShape(x.poly)}`).join('+')}`).join('\n');
    const key = `${clusterKey(items, opens)}\n--\n${[...zr].map(([k, v]) => `${k}:${round(v.z0)}:${round(v.z1)}`).join(',')}\n--\n${retSig}\n--\n${planSig}`;
    let core = cache.get(key);
    if (!core) {
      core = solveCluster(items, opens, zr, returns, planOpen);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(key, core);
    }
    const cluster: ResolvedCluster = { wallIds: group.map((f) => f.wall.id), regions: core.regions, silhouette: core.silhouette };
    out.clusters.push(cluster);
    for (const f of group) {
      const rw: ResolvedWall = {
        wallId: f.wall.id,
        a: f.a,
        b: f.b,
        u: f.u,
        n: f.n,
        length: f.length,
        sHi: f.sHi,
        sLo: f.sLo,
        baseZ: wz.get(f.wall.id)!.z0,
        height: heights.get(f.wall.id)!,
        nominalZ0: wallBaseElevation(p, f.wall),
        nominalZ1: wallBaseElevation(p, f.wall) + wallMaxHeight(p, f.wall),
        layers: withProfile(withBottomProfile(core.layers.get(f.wall.id) ?? [], f, wz.get(f.wall.id)!.bottomProfile), f, wz.get(f.wall.id)!.profile),
        membranes: membranesOf(f, estrutura.ends.get(f.wall.id)!),
        ...perfisDoResolvido(wz.get(f.wall.id)!),
      };
      out.walls[f.wall.id] = rw;
    }
  }
  return out;
}
