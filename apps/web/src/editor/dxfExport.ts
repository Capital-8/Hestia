import { openingSymbolPaths, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { buildOpeningModel, computeSection, junctionLevel, resolveCeilings, levelFrames, openingGeometry, resolveFloors, resolveRoofs, resolveRooms, resolveRampsOnLevel, resolveSlabs, resolveStairsOnLevel, type ResolvedRamp, type ResolvedStair, type JunctionLevel, type SectionOrigin, type ViewClass } from '@hestia/engine';
import { climbWalk, openingPlanWorldPaths, ownerOf, planViewOf, risersInClimbOrder, roofFootprint, roomFullText, roomLabelAt, spiralByComponent, spiralPostRing, stairCut, type PlanView, type StairCut } from '@hestia/render';
import {
  dxfDocOf,
  dxfGenericEntities,
  dxfLayerStyleOf,
  dxfLayersOf,
  dxfLineRoleOf,
  DXF_LINE_WEIGHT_DEFAULT,
  DXF_LAYER_RAMP_TEXT,
  DXF_LAYER_ROOM_TEXT,
  DXF_LAYER_GENERIC,
  dxfLineWeight,
  dxfSectionLayersOf,
  dxfSectionLayerStyleOf,
  dxfSectionLineRoleOf,
  exportSectionDxf,
  notesDxfOf,
  sectionMarksDxfOf,
  sectionNotesDxfOf,
  writeDxf2000,
  type DxfLevelGeometry,
  type DxfNoteText,
  type DxfNotes,
  type DxfOpening,
  type DxfPoint,
  type DxfSectionGeometry,
  type DxfSectionItem,
  type DxfSymbolPath,
  type DxfUnit,
  type DxfViewState,
} from '@hestia/io';
import { areaPlanOf, openingTypeById, GRAPHICS_CATEGORIES, formatRampSlope, graphicsOf, isCad, levelGraphicsOf, lineWeightMm, openingAngle2d, openingLeafPlan, openingPlanDisplay, openingShowSwing, openingSwingStyle, openingsOfWall, sectionGraphicsOf, sectionPoints, unitsOf, type CadDrawing, type DxfLayerStyle, type GraphicsCategory, type Id, type Project } from '@hestia/model';
import { AREA_LAYER_NAMES, areaLayerStyleOf, areaPlanDxf as areaPlanDxfOf } from './dxfAreaPlan.ts';

/**
 * Região de um piso ou laje para o DXF (F7.1, 0023 §6): a região resolvida pela junção quando houve corte; sem corte, a camada
 * de cima (como a planta, para o término por camada valer também no DXF).
 */
function resolvedRegion(jl: JunctionLevel, id: Id, polygon: MultiPolygon): MultiPolygon {
  const el = jl.elements.get(id);
  return el?.cut ? el.region : polygon;
}

type StairDxf = NonNullable<DxfLevelGeometry['stairs']>[number];
type RampDxf = NonNullable<DxfLevelGeometry['ramps']>[number];

/** Tolerância (m) nas comparações de cota, como na tela (a borda exata conta como dentro). */
const EPS = 1e-9;

/**
 * Zoom usado no símbolo de corte da escada: `stairCut` dá 8 px de avanço em cada lado; com zoom 80 são 0,10 m, em metros.
 * Os dentes do zigue-zague seguem `cutSymbol` da planta (4 px de amplitude, zoom 80: 0,05 m).
 */
const STAIR_CUT_ZOOM = 80;

/**
 * Seta de subida ao longo da caminhada `pts` (do primeiro ao último espelho, como a tela): um LINE por trecho da haste e,
 * no fim, as duas pontas a 30° da última direção, de 0,20 m ou um quarto do comprimento total (o menor). Pontos repetidos
 * e vértices no meio de um trecho reto saem (os pontos médios de um lance reto são colineares: a seta fica um só trecho,
 * como antes). Vazia sem comprimento.
 */
export function arrowOfPath(pts: DxfPoint[]): Array<[DxfPoint, DxfPoint]> {
  const distinct = pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1]!.x, q.y - pts[i - 1]!.y) > 1e-9);
  const path = distinct.filter((q, i) => {
    if (i === 0 || i === distinct.length - 1) return true;
    const a = distinct[i - 1]!;
    const c = distinct[i + 1]!;
    const ux = q.x - a.x;
    const uy = q.y - a.y;
    const vx = c.x - q.x;
    const vy = c.y - q.y;
    const straight = Math.abs(ux * vy - uy * vx) < 1e-9 && ux * vx + uy * vy > 0;
    return !straight;
  });
  if (path.length < 2) return [];
  const shaft: Array<[DxfPoint, DxfPoint]> = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    shaft.push([a, b]);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const tip = path[path.length - 1]!;
  const before = path[path.length - 2]!;
  const dx = tip.x - before.x;
  const dy = tip.y - before.y;
  const len = Math.hypot(dx, dy);
  const bx = -dx / len;
  const by = -dy / len;
  const L = Math.min(0.2, total * 0.25);
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  // Gira a direção de volta de ±30° para as duas pontas.
  const barb = (sg: 1 | -1): DxfPoint => ({ x: tip.x + (bx * c - sg * by * s) * L, y: tip.y + (sg * bx * s + by * c) * L });
  return [...shaft, [tip, barb(1)], [tip, barb(-1)]];
}

/** Seta de subida de um só trecho de `a` a `b` (haste e duas pontas). Caso particular de `arrowOfPath`. */
export function stairArrow(a: DxfPoint, b: DxfPoint): Array<[DxfPoint, DxfPoint]> {
  return arrowOfPath([a, b]);
}

/** Símbolo de corte em zigue-zague de oito dentes, em metros (espelha `cutSymbol` da planta). */
function cutSymbolDxf(c: StairCut): DxfPoint[] {
  const teeth = 8;
  const amp = 4 / STAIR_CUT_ZOOM;
  return Array.from({ length: teeth + 1 }, (_, j) => {
    const s = -c.half + (2 * c.half * j) / teeth;
    const k = j % 2 === 0 ? -amp : amp;
    return { x: c.at.x + c.across.x * s + c.walk.x * k, y: c.at.y + c.across.y * s + c.walk.y * k };
  });
}

/**
 * Escada resolvida em geometria de DXF, na vista do nível (decisão 0013 §4): degraus até o topo do intervalo, divididos
 * pela cota de corte (cheios até ela, tracejados acima); espelhos e seta só até o topo; símbolo de corte quando o plano
 * cruza a escada. A seta segue a caminhada da tela (`climbWalk`: a explícita do lance, senão os pontos médios). Caracol:
 * o poste (círculo de `rInner`, `spiralPostRing`) na cota de corte ou abaixo, senão acima (tracejado, como os degraus).
 */
export function stairDxf(p: Project, r: ResolvedStair, view: { cutZ: number; topZ: number }): StairDxf {
  const risers = risersInClimbOrder(r).filter((k) => k.z1 <= view.topZ + EPS);
  const steps = r.steps.filter((st) => st.z <= view.topZ + EPS);
  const outline = (st: (typeof steps)[number]): DxfPoint[] => st.polygon.map((q) => ({ x: q.x, y: q.y }));
  const cut = stairCut(r, risers, STAIR_CUT_ZOOM, view.cutZ);
  const walk: Vec2[] = climbWalk(p, r, risers);
  const posts = [...spiralByComponent(p, r).values()].map((sp) => ({ pts: spiralPostRing(sp.center, sp.rInner), above: r.baseZ > view.cutZ + EPS }));
  return {
    outlines: steps.filter((st) => st.z <= view.cutZ + EPS).map(outline),
    outlinesAbove: steps.filter((st) => st.z > view.cutZ + EPS).map(outline),
    risers: risers.map((k): [DxfPoint, DxfPoint] => [k.a, k.b]),
    arrow: arrowOfPath(walk),
    cut: cut ? cutSymbolDxf(cut) : undefined,
    ...(posts.length > 0 ? { posts } : {}),
  };
}

/**
 * Rampa resolvida em geometria de DXF: lances e patamares até o topo do intervalo, divididos pela cota de corte (cheios
 * até ela, tracejados acima); seta por lance no eixo `start → end`; linha de corte transversal no lance cruzado e o texto
 * da inclinação no meio do primeiro lance, girado com o eixo. O lance que cruza o corte aparece nas duas camadas.
 */
export function rampDxf(_p: Project, rr: ResolvedRamp, view: { cutZ: number; topZ: number }): RampDxf {
  const outline = (ring: { x: number; y: number }[]): DxfPoint[] => ring.map((q) => ({ x: q.x, y: q.y }));
  const outlines: DxfPoint[][] = [];
  const outlinesAbove: DxfPoint[][] = [];
  for (const f of rr.flights) {
    const poly = outline(f.polygon);
    if (f.z0 <= view.cutZ + EPS) outlines.push(poly);
    if (f.z1 > view.cutZ + EPS && f.z1 <= view.topZ + EPS) outlinesAbove.push(poly);
  }
  for (const l of rr.landings) {
    if (l.z > view.topZ + EPS) continue;
    if (l.z <= view.cutZ + EPS) outlines.push(outline(l.polygon));
    else outlinesAbove.push(outline(l.polygon));
  }
  const arrow = rr.flights.flatMap((f) => stairArrow({ x: f.start.x, y: f.start.y }, { x: f.end.x, y: f.end.y }));
  const cut = rr.flights
    .filter((f) => f.z0 < view.cutZ && view.cutZ < f.z1)
    .map((f): [DxfPoint, DxfPoint] => {
      const t = (view.cutZ - f.z0) / (f.z1 - f.z0);
      const at = (a: { x: number; y: number }, b: { x: number; y: number }): DxfPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      return [at(f.startEdge[0], f.endEdge[0]), at(f.startEdge[1], f.endEdge[1])];
    });
  const first = rr.flights[0];
  const texts = first
    ? [
        {
          at: { x: (first.start.x + first.end.x) / 2, y: (first.start.y + first.end.y) / 2 },
          text: formatRampSlope(rr.slope),
          height: ROOM_TEXT_HEIGHT_M,
          rotation: (Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x) * 180) / Math.PI,
          layer: DXF_LAYER_RAMP_TEXT,
        },
      ]
    : [];
  return { outlines, outlinesAbove, arrow, cut, texts };
}

/**
 * Estado de um elemento para o DXF, a partir da vista da tela: `null` quando está fora do intervalo (não sai). Sem
 * classificação, vale o corte (o vão desenhado como antes).
 */
function dxfStateOf(cls: ViewClass | undefined): DxfViewState | null {
  if (cls === undefined || cls === 'cut') return 'cut';
  if (cls === 'hidden') return null;
  return cls;
}

/**
 * Largura de linha (centésimos de mm) de cada camada da planta: o peso da categoria na escala da vista (decisão 0015 §2
 * item 7). Corte e projeção usam o peso próprio; a substituição da vista (`overrides[cat].cutWeight` e `projectionWeight`)
 * vale sobre o do projeto. A escala da vista entra pela tabela `lineWeightMm`. Marcas de escada saem com 0.
 */
export function lineWeightsOf(p: Project, levelId: Id, geo: DxfLevelGeometry): Record<string, number> {
  const pg = graphicsOf(p);
  const vg = levelGraphicsOf(p, levelId);
  const out: Record<string, number> = {};
  for (const layer of dxfLayersOf(p, geo)) {
    const role = dxfLineRoleOf(layer);
    if (role === undefined) continue;
    if (role === 'annotation') {
      out[layer] = 0;
      continue;
    }
    const over = vg.overrides[role.category];
    const base = pg.categories[role.category];
    const weight = role.view === 'cut' ? (over.cutWeight ?? base.cutWeight) : (over.projectionWeight ?? base.projectionWeight);
    out[layer] = dxfLineWeight(lineWeightMm(pg.lineWeights, weight, vg.scale) * 100);
  }
  return out;
}

/**
 * Nome de camada do CAD importado no DXF: `CAD_<DESENHO>_<CAMADA>`, em maiúsculas, sem acento, símbolos viram `_` e no
 * máximo 60 caracteres. O nome do desenho e o da camada ficam separados por `_`.
 */
export function cadDxfLayerName(drawing: string, layer: string): string {
  return `CAD_${cadLayerSafe(drawing) || 'DESENHO'}_${cadLayerSafe(layer) || '0'}`.slice(0, 60);
}

/** Texto para nome de camada do CAD: sem acentos, maiúsculas, fora de `A-Z0-9_` vira `_`. */
function cadLayerSafe(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Desenhos CAD do nível, visíveis, na ordem de desenho. */
function cadDrawingsOf(p: Project, levelId: Id): CadDrawing[] {
  return Object.values(p.elements)
    .filter((e): e is CadDrawing => isCad(e) && e.levelId === levelId && e.visible !== false)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Cor ACI da camada do desenho; ausente = a da entidade (ou a padrão, 7). */
const cadLayerColorOf = (d: CadDrawing, layer: string): number | undefined => d.layers.find((l) => l.name === layer)?.color;

/** O CAD importado em geometria de DXF: trechos de reta, textos e o estilo de cada camada `CAD_*`. */
interface CadDxf {
  lines: Array<{ a: DxfPoint; b: DxfPoint; layer: string }>;
  texts: DxfNoteText[];
  styles: Record<string, DxfLayerStyle>;
}

/**
 * CAD importado do nível para o DXF (fase 5): cada traço vira LINE por trecho (fechado: o último trecho volta ao início) e
 * cada texto vira TEXT, todos na camada `CAD_<DESENHO>_<CAMADA>`, com a cor ACI original (a da entidade, quando ela tem,
 * senão a da camada; ausente = 7), linha contínua e espessura 0. Categoria `generic` oculta = nada sai.
 */
function cadDxfOf(p: Project, levelId: Id, visible: boolean): CadDxf {
  const out: CadDxf = { lines: [], texts: [], styles: {} };
  if (!visible) return out;
  const styleOfLayer = (layer: string, aci: number | undefined): void => {
    out.styles[layer] ??= { color: aci ?? 7, linetype: 'CONTINUOUS', lineWeight: 0 };
  };
  for (const d of cadDrawingsOf(p, levelId)) {
    for (const path of d.paths) {
      if (path.pts.length < 2) continue;
      const layer = cadDxfLayerName(d.name, path.layer);
      styleOfLayer(layer, path.color ?? cadLayerColorOf(d, path.layer));
      const pts = path.closed ? [...path.pts, path.pts[0]!] : path.pts;
      for (let i = 1; i < pts.length; i++) out.lines.push({ a: pts[i - 1]!, b: pts[i]!, layer });
    }
    for (const t of d.texts) {
      if (t.text === '') continue;
      const layer = cadDxfLayerName(d.name, t.layer);
      styleOfLayer(layer, t.color ?? cadLayerColorOf(d, t.layer));
      out.texts.push({ at: t.at, text: t.text, height: t.height > 0 ? t.height : ROOM_TEXT_HEIGHT_M, rotation: t.rotation, layer });
    }
  }
  return out;
}

/** Junta as anotações do nível com as do CAD (o CAD sai mesmo com a categoria 'anotação' oculta). */
function mergeNotes(a: DxfNotes | undefined, b: DxfNotes | undefined): DxfNotes | undefined {
  if (!a) return b;
  if (!b) return a;
  return { lines: [...a.lines, ...b.lines], texts: [...a.texts, ...b.texts], otherLines: [...(a.otherLines ?? []), ...(b.otherLines ?? [])], regions: a.regions };
}

/**
 * Geometria do nível para o DXF, na mesma vista da planta na tela (decisão 0013 §4, `planViewOf`): paredes e aberturas
 * pela geometria com o plano de corte da vista, paredes fora do corte como contorno de projeção, pisos, lajes, telhados e
 * escadas com a cota de corte e o topo do intervalo. O que está fora do intervalo não sai, exceto a projeção do telhado
 * (a tela a mostra tracejada por padrão, só com a preferência "Mostrar projeção da cobertura" ligada; `showRoofProjection`
 * reflete essa preferência). Categoria oculta na vista (`overrides[cat].visible === false`, decisão 0015 §2 item 4) não
 * sai. Cada camada leva a largura de linha da categoria na escala da vista (`lineWeightsOf`). O io não importa o engine,
 * então a montagem fica aqui, no web.
 */
export function dxfGeometryOf(p: Project, levelId: Id, showRoofProjection = true, units?: DxfUnit): DxfLevelGeometry {
  const view: PlanView = planViewOf(p, levelId);
  const { hidden } = view;
  const vg = levelGraphicsOf(p, levelId);
  const shown = (c: GraphicsCategory): boolean => vg.overrides[c].visible !== false;
  const openings: DxfOpening[] = levelFrames(p, levelId).flatMap((f) =>
    openingsOfWall(p, f.wall.id).flatMap((o) => {
      const state = shown(o.kind) ? dxfStateOf(view.cls.get(o.id)) : null;
      if (state === null) return [];
      const g = openingGeometry(p, o, f);
      // Planta da esquadria pelo modelo único (spec E §4.1), no nível médio: o mesmo desenho da tela. O DXF põe a
      // camada; o desenho vem de `openingPlanPaths` e vale no corte (ABERTURAS) e na projeção (ABERTURA_*).
      const type = openingTypeById(p, o.typeId);
      const model = type ? buildOpeningModel(p, o, g, f) : null;
      // No corte, a cota local desconta a base da parede e a soleira; na projeção, corta no meio do modelo.
      const cutZ = state === 'cut' ? view.cutZ - (f.z?.z0 ?? 0) - g.sill : (model?.height ?? 0) / 2;
      const symbol: DxfSymbolPath[] = type && model
        ? openingPlanWorldPaths(g, model, {
            detail: 'mid',
            angle: (openingAngle2d(type) * Math.PI) / 180,
            planDisplay: openingPlanDisplay(type),
            showSwing: openingShowSwing(type),
            swingStyle: openingSwingStyle(type),
            leafPlan: openingLeafPlan(type),
            cutZ,
          }).map((s) => ({ pts: s.pts, closed: s.closed, dashed: s.dash !== undefined }))
        : openingSymbolPaths(g).map((s) => ({ pts: s.pts, closed: s.closed, dashed: s.dash !== undefined }));
      return [{ center: g.center, u: g.u, width: g.width, thickness: g.thickness, state, symbol }];
    }),
  );
  const roofs = resolveRoofs(p, levelId);
  const jl = junctionLevel(p, levelId);
  // Ambientes (decisão 0018, 0037): contorno em AMBIENTES e rótulo completo (nome, número, área) em AMBIENTES_TEXTO; sem circuito, nada sai.
  const rooms = shown('room') ? resolveRooms(p, levelId).filter((r) => r.polygon && !hidden.has(r.roomId)) : [];
  const geo: DxfLevelGeometry = {
    rooms: rooms.map((r) => ({ outline: r.polygon![0] ?? [], holes: r.polygon!.slice(1) })),
    roomTexts: rooms.flatMap((r) => {
      const at = roomLabelAt(r);
      return at ? [{ at, text: roomFullText(r, unitsOf(p)), height: ROOM_TEXT_HEIGHT_M, rotation: 0, layer: DXF_LAYER_ROOM_TEXT }] : [];
    }),
    clusters: shown('wall') ? view.geo.clusters : [],
    openings,
    wallOutlines: shown('wall') ? view.outlines.map((o) => ({ state: o.cls, polygons: o.shape })) : [],
    roofProjections: shown('roof') && showRoofProjection ? roofs.filter((r) => hidden.has(r.roofId)).flatMap((r) => roofFootprint(r)) : [],
    floors: shown('floor')
      ? resolveFloors(p, levelId)
          .filter((f) => !hidden.has(f.floorId))
          .flatMap((f) => resolvedRegion(jl, f.floorId, f.layers.find((l) => !l.membrane)?.polygon ?? f.polygon).map((poly) => ({ outline: poly[0] ?? [], holes: poly.slice(1), typeCode: p.floorTypes[f.typeId]?.code ?? '' })))
      : [],
    // Forros: só na planta de forro (decisão 0021); na planta baixa ficam acima do topo e não saem.
    ceilings: shown('floor') && view.range.direction === 'up'
      ? resolveCeilings(p, levelId)
          .filter((c) => !hidden.has(c.ceilingId))
          .flatMap((c) => c.polygon.map((poly) => ({ outline: poly[0] ?? [], holes: poly.slice(1) })))
      : [],
    slabs: shown('slab')
      ? resolveSlabs(p, levelId)
          .filter((s) => !hidden.has(s.slabId))
          .flatMap((s) => resolvedRegion(jl, s.slabId, s.layers.find((l) => !l.membrane)?.polygon ?? s.polygon).map((poly) => ({ outline: poly[0] ?? [], holes: poly.slice(1), typeCode: p.slabTypes[s.typeId]?.code ?? '' })))
      : [],
    // Escadas: degraus e patamares (contorno), espelhos, seta de subida e símbolo de corte, com a cota de corte da vista.
    stairs: shown('stair')
      ? resolveStairsOnLevel(p, levelId)
          .filter((s) => !hidden.has(s.id))
          .map((s) => stairDxf(p, s, { cutZ: view.cutZ, topZ: view.topZ }))
      : [],
    // Rampas: mesma categoria gráfica da escada; contornos, seta, corte e inclinação.
    ramps: shown('stair')
      ? resolveRampsOnLevel(p, levelId)
          .filter((rr) => !hidden.has(rr.id))
          .map((rr) => rampDxf(p, rr, { cutZ: view.cutZ, topZ: view.topZ }))
      : undefined,
    // Telhado: contorno do beiral e linhas de cumeeira, espigão e rincão (as de beiral já estão no contorno).
    roofs: shown('roof')
      ? roofs
          .filter((r) => !hidden.has(r.roofId))
          .map((r) => ({
            outline: p.elements[r.roofId]?.kind === 'roof' ? (p.elements[r.roofId] as { boundary: Array<{ x: number; y: number }> }).boundary : [],
            ridges: r.lines.filter((l) => l.kind !== 'eave' && l.kind !== 'gable' && l.kind !== 'break').map((l): [typeof l.a, typeof l.b] => [l.a, l.b]),
            gables: r.lines.filter((l) => l.kind === 'gable').map((l): [typeof l.a, typeof l.b] => [l.a, l.b]),
            breaks: r.lines.filter((l) => l.kind === 'break').map((l): [typeof l.a, typeof l.b] => [l.a, l.b]),
            typeCode: p.roofTypes[r.typeId]?.code ?? '',
          }))
      : [],
  };
  // Cotas, textos (decisão 0019) e marcas de corte/elevação seguem a visibilidade da categoria 'anotação' e a escala.
  // O CAD importado (fase 5) entra pelas mesmas listas de anotações (LINE por trecho e TEXT), mas independe da categoria
  // 'anotação': só a 'generic' o desliga. As camadas dele já saem daqui com a cor ACI do arquivo.
  const cad = cadDxfOf(p, levelId, shown('generic'));
  const cadNotes: DxfNotes | undefined = cad.lines.length + cad.texts.length > 0 ? { lines: [], texts: cad.texts, otherLines: cad.lines } : undefined;
  const notes = mergeNotes(shown('annotation') ? notesDxfOf(p, levelId, vg.scale) : undefined, cadNotes);
  const withNotes: DxfLevelGeometry = {
    ...geo,
    ...(notes === undefined ? {} : { notes }),
    ...(shown('annotation') ? { sectionMarks: sectionMarksDxfOf(p, vg.scale) } : {}),
  };
  const lineWeights = lineWeightsOf(p, levelId, withNotes);
  const layerStyles = Object.fromEntries(
    dxfLayersOf(p, withNotes).map((layer): [string, DxfLayerStyle] => [
      layer,
      p.dxfLayers?.[layer] ?? cad.styles[layer] ?? dxfLayerStyleOf(layer, lineWeights[layer] ?? DXF_LINE_WEIGHT_DEFAULT),
    ]),
  );
  return { ...withNotes, lineWeights, layerStyles, ...(units === undefined ? {} : { units }) };
}

/** Altura (m de desenho) do texto do ambiente no DXF. */
const ROOM_TEXT_HEIGHT_M = 0.2;

export { areaPlanDxf } from './dxfAreaPlan.ts';

export function planDxf(p: Project, levelId: Id, showRoofProjection = true, units?: DxfUnit): string {
  const doc = dxfDocOf(p, levelId, dxfGeometryOf(p, levelId, showRoofProjection, units));
  const shown = levelGraphicsOf(p, levelId).overrides.generic.visible !== false;
  const generics = shown ? dxfGenericEntities(p, levelId) : [];
  // A camada dos importados entra com a cor da categoria (cinza), como as do nível.
  const layers = generics.length > 0 && !doc.layers.some((l) => l.name === DXF_LAYER_GENERIC)
    ? [...doc.layers, { name: DXF_LAYER_GENERIC, ...(p.dxfLayers?.[DXF_LAYER_GENERIC] ?? dxfLayerStyleOf(DXF_LAYER_GENERIC)) }]
    : doc.layers;
  return writeDxf2000({ ...doc, layers, entities: [...doc.entities, ...generics] });
}

/** Alvo da tabela de camadas do diálogo de exportação (o que a vista atual exporta). */
export type DxfExportTarget =
  | { kind: 'plan'; levelId: Id; showRoofProjection?: boolean }
  | { kind: 'section'; sectionId: Id }
  | { kind: 'area'; planId: Id };

/** Camada e estilo efetivo, como a tabela do diálogo de exportação mostra. */
export interface DxfLayerRow {
  name: string;
  style: DxfLayerStyle;
}

/**
 * Camadas do DXF que a vista exportaria, com o estilo efetivo (padrão por categoria/escala + o que o projeto guarda em
 * `dxfLayers`). É a base da tabela editável do diálogo: a mesma ordem e os mesmos nomes que o arquivo leva.
 */
export function dxfLayerTableOf(p: Project, target: DxfExportTarget): DxfLayerRow[] {
  if (target.kind === 'plan') {
    const geo = dxfGeometryOf(p, target.levelId, target.showRoofProjection ?? true);
    const rows = dxfLayersOf(p, geo).map((name) => ({ name, style: geo.layerStyles?.[name] ?? dxfLayerStyleOf(name, geo.lineWeights?.[name]) }));
    // A camada dos importados só entra no arquivo quando há `Generic` no nível e a categoria está visível.
    const generic = levelGraphicsOf(p, target.levelId).overrides.generic.visible !== false
      && Object.values(p.elements).some((e) => e.kind === 'generic' && e.levelId === target.levelId);
    if (generic && !rows.some((r) => r.name === DXF_LAYER_GENERIC)) {
      rows.push({ name: DXF_LAYER_GENERIC, style: p.dxfLayers?.[DXF_LAYER_GENERIC] ?? dxfLayerStyleOf(DXF_LAYER_GENERIC) });
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }
  if (target.kind === 'section') {
    const geo = sectionDxfGeometryOf(p, target.sectionId);
    return dxfSectionLayersOf(geo).map((name) => ({ name, style: geo.layerStyles?.[name] ?? dxfSectionLayerStyleOf(name, geo.lineWeights?.[name]) }));
  }
  if (!areaPlanOf(p, target.planId)) throw new Error('Planta de área inexistente');
  return ['0', ...AREA_LAYER_NAMES].sort().map((name) => ({ name, style: areaLayerStyleOf(p, name) }));
}

/** Categoria gráfica de uma origem do corte (parede, piso, laje, telhado ou escada). */
function sectionCategoryOf(o: SectionOrigin): GraphicsCategory {
  return ownerOf(o)?.kind ?? 'wall';
}

/**
 * Largura de linha (centésimos de mm) de cada camada do corte/elevação: o peso da categoria na escala da vista
 * (decisão 0015 §2.7), com a substituição da vista valendo sobre o peso do projeto. Níveis são anotação (0).
 */
export function sectionLineWeightsOf(p: Project, geo: DxfSectionGeometry): Record<string, number> {
  const pg = graphicsOf(p);
  const vg = sectionGraphicsOf(p);
  const out: Record<string, number> = {};
  for (const layer of dxfSectionLayersOf(geo)) {
    const role = dxfSectionLineRoleOf(layer);
    if (role === undefined) continue;
    if (role === 'annotation') {
      out[layer] = 0;
      continue;
    }
    const over = vg.overrides[role.category];
    const base = pg.categories[role.category];
    const weight = role.view === 'cut' ? (over.cutWeight ?? base.cutWeight) : (over.projectionWeight ?? base.projectionWeight);
    out[layer] = dxfLineWeight(lineWeightMm(pg.lineWeights, weight, vg.scale) * 100);
  }
  return out;
}

/**
 * Geometria do corte/elevação para o DXF, a partir do mesmo `computeSection` da tela. Categoria oculta na vista
 * (`sectionGraphics.overrides[cat].visible === false`) não sai. As camadas levam a largura da categoria na escala.
 */
export function sectionDxfGeometryOf(p: Project, sectionId: Id, units?: DxfUnit): DxfSectionGeometry {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) throw new Error(`Vista ausente: ${sectionId}`);
  const pts = sectionPoints(p, view);
  const section = computeSection(p, { a: pts.a, b: pts.b, depth: view.depth });
  const vg = sectionGraphicsOf(p);
  const shown = (c: GraphicsCategory): boolean => vg.overrides[c].visible !== false;
  const cut: DxfSectionItem[] = [];
  for (const r of section.cut) {
    const cats = [...new Set(r.sources.map(sectionCategoryOf))];
    const cat = cats.find(shown);
    if (cat) cut.push({ category: cat, polygons: r.polygons });
  }
  const beyond: DxfSectionItem[] = section.beyond.flatMap((b) => {
    const cat = sectionCategoryOf(b);
    return shown(cat) ? [{ category: cat, polygons: b.polygons }] : [];
  });
  const openings = section.openings.flatMap((o) => (shown(o.kind) ? [{ category: o.kind, polygons: o.polygons, cut: o.cut }] : []));
  const allShown = GRAPHICS_CATEGORIES.every(shown);
  // Anotações da vista (cotas, textos, detalhes e etiquetas) nas camadas da planta: a categoria oculta não sai, como na tela.
  const notes = shown('annotation') ? sectionNotesDxfOf(p, sectionId, vg.scale) : undefined;
  const geo: DxfSectionGeometry = { cut, beyond, openings, ...(allShown ? { silhouette: section.silhouette } : {}), ...(notes === undefined ? {} : { notes }) };
  const lineWeights = sectionLineWeightsOf(p, geo);
  const layerStyles = Object.fromEntries(
    dxfSectionLayersOf(geo).map((layer): [string, DxfLayerStyle] => [layer, p.dxfLayers?.[layer] ?? dxfSectionLayerStyleOf(layer, lineWeights[layer] ?? DXF_LINE_WEIGHT_DEFAULT)]),
  );
  return { ...geo, lineWeights, layerStyles, ...(units === undefined ? {} : { units }) };
}

/** Texto DXF do corte/elevação, com as camadas e as larguras de linha da vista. */
export function sectionDxf(p: Project, sectionId: Id, units?: DxfUnit): string {
  return exportSectionDxf(p, sectionId, sectionDxfGeometryOf(p, sectionId, units));
}

/** Vista de planta exportável: a planta de piso do nível ou uma planta de área (perfil + anotações próprias). */
export interface PlanViewRef {
  levelId: Id;
  areaPlanId?: Id | null;
  showRoofProjection?: boolean;
}

/** Ponto único de exportação do DXF de uma planta: a de área segue o perfil da vista; a de piso é inalterada. */
export function viewDxf(p: Project, v: PlanViewRef): string {
  return v.areaPlanId ? areaPlanDxfOf(p, v.areaPlanId) : planDxf(p, v.levelId, v.showRoofProjection ?? true);
}


