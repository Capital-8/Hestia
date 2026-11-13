import { openingSymbolPaths, type MultiPolygon } from '@hestia/geom';
import { buildOpeningModel, computeSection, junctionLevel, resolveCeilings, levelFrames, openingGeometry, resolveFloors, resolveRoofs, resolveRooms, resolveRampsOnLevel, resolveSlabs, resolveStairsOnLevel, servicoCortina, temCortina, ESTILO_PLANTA_CORTINA, PAPEL_PLANTA_CORTINA, type JunctionLevel, type SectionOrigin, type ViewClass } from '@hestia/engine';
import { openingPlanWorldPaths, ownerOf, planViewOf, roofFootprint, roomFullText, roomLabelAt, type PlanView } from '@hestia/render';
import {
  dxfDocOf,
  dxfGenericEntities,
  dxfLayerCanonical,
  dxfLayerName,
  dxfLayerStyleOf,
  dxfLayersOf,
  dxfLineRoleOf,
  DXF_LINE_WEIGHT_DEFAULT,
  DXF_LAYER_ROOM_TEXT,
  DXF_LAYER_GENERIC,
  DXF_LAYER_CURTAIN_GLASS,
  DXF_LAYER_CURTAIN_MULLION,
  DXF_LAYER_CURTAIN_SOLID,
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
  type DxfNotes,
  type DxfOpening,
  type DxfSectionGeometry,
  type DxfSectionItem,
  type DxfSymbolPath,
  type DxfUnit,
  type DxfViewState,
} from '@hestia/io';
import { areaPlanOf, openingTypeById, GRAPHICS_CATEGORIES, graphicsOf, levelGraphicsOf, lineWeightMm, openingAngle2d, openingLeafPlan, openingPlanDisplay, openingShowSwing, openingSwingStyle, openingsOfWall, sectionGraphicsOf, sectionPoints, unitsOf, type DxfLayerStyle, type GraphicsCategory, type Id, type Project } from '@hestia/model';
import { AREA_LAYER_NAMES, areaLayerStyleOf, areaPlanDxf as areaPlanDxfOf } from './dxfAreaPlan.ts';
import { EPS, ROOM_TEXT_HEIGHT_M } from './dxfConstantes.ts';
import { cadDxfOf } from './dxfCad.ts';
import { rampDxf, stairDxf } from './dxfEscadas.ts';
import { useI18n, t as tr, type Lang } from './i18n.ts';
export { arrowOfPath, rampDxf, stairArrow, stairDxf } from './dxfEscadas.ts';
export { cadDxfLayerName } from './dxfCad.ts';

/** Idioma ativo (fora do React): quem chama pode fixar outro `lang`. */
const activeLang = (): Lang => useI18n.getState().lang;

/**
 * Região de um piso ou laje para o DXF (F7.1, 0023 §6): a região resolvida pela junção quando houve corte; sem corte, a camada
 * de cima (como a planta, para o término por camada valer também no DXF).
 */
function resolvedRegion(jl: JunctionLevel, id: Id, polygon: MultiPolygon): MultiPolygon {
  const el = jl.elements.get(id);
  return el?.cut ? el.region : polygon;
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

/** Junta as anotações do nível com as do CAD (o CAD sai mesmo com a categoria 'anotação' oculta). */
function mergeNotes(a: DxfNotes | undefined, b: DxfNotes | undefined): DxfNotes | undefined {
  if (!a) return b;
  if (!b) return a;
  return { lines: [...a.lines, ...b.lines], texts: [...a.texts, ...b.texts], otherLines: [...(a.otherLines ?? []), ...(b.otherLines ?? [])], regions: a.regions };
}

/**
 * Cortinas do nível para o DXF (decisão 0056, §11): as linhas de `cortina_planta` no detalhe médio, na mesma cota de corte da vista, sem as paredes
 * ocultas na vista. Cada linha vai à camada da peça (`CORTINA-MONTANTE` para o montante e o contorno do sistema, `CORTINA-VIDRO` para o vidro,
 * `CORTINA-SOLIDO` para o painel sólido); o oculto sai tracejado. Sem kernel pronto ou sem cortina no nível, `undefined`; com a categoria de
 * parede oculta, `undefined` também (nenhuma camada de cortina sai).
 */
function curtainDxfOf(p: Project, levelId: Id, cutZ: number, hidden: ReadonlySet<Id>, visible: boolean): DxfLevelGeometry['curtains'] {
  if (!visible || !temCortina(p)) return undefined;
  const s = servicoCortina();
  if (!s.pronto()) return undefined;
  const linhas = s.planta(p, levelId, cutZ, 1);
  if (!linhas) return undefined;
  const camada = (papel: number): string =>
    papel === PAPEL_PLANTA_CORTINA.vidro ? DXF_LAYER_CURTAIN_GLASS : papel === PAPEL_PLANTA_CORTINA.solido ? DXF_LAYER_CURTAIN_SOLID : DXF_LAYER_CURTAIN_MULLION;
  return linhas
    .filter((l) => !hidden.has(l.wallId) && l.pontos.length >= 2)
    .map((l) => {
      const pts = l.pontos.map((q) => ({ x: q.x, y: q.y }));
      // Contorno fechado repete o primeiro ponto no fim (como a planta da tela); a linha aberta do eixo do vidro não.
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      const closed = pts.length > 3 && Math.abs(first.x - last.x) < EPS && Math.abs(first.y - last.y) < EPS;
      return { layer: camada(l.papel), pts: closed ? pts.slice(0, -1) : pts, closed, ...(l.estilo === ESTILO_PLANTA_CORTINA.oculto ? { dashed: true } : {}) };
    });
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
  const curtains = curtainDxfOf(p, levelId, view.cutZ, hidden, shown('wall'));
  const geo: DxfLevelGeometry = {
    ...(curtains === undefined ? {} : { curtains }),
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

export { areaPlanDxf } from './dxfAreaPlan.ts';

export function planDxf(p: Project, levelId: Id, showRoofProjection = true, units?: DxfUnit, lang: Lang = activeLang()): string {
  const doc = dxfDocOf(p, levelId, dxfGeometryOf(p, levelId, showRoofProjection, units), lang);
  const shown = levelGraphicsOf(p, levelId).overrides.generic.visible !== false;
  const generics = shown ? dxfGenericEntities(p, levelId, dxfLayerName(DXF_LAYER_GENERIC, lang)) : [];
  // A camada dos importados entra com a cor da categoria (cinza), como as do nível.
  const genericLayer = dxfLayerName(DXF_LAYER_GENERIC, lang);
  const layers = generics.length > 0 && !doc.layers.some((l) => l.name === genericLayer)
    ? [...doc.layers, { name: genericLayer, ...(p.dxfLayers?.[DXF_LAYER_GENERIC] ?? dxfLayerStyleOf(DXF_LAYER_GENERIC)) }]
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
export function dxfLayerTableOf(p: Project, target: DxfExportTarget, lang: Lang = activeLang()): DxfLayerRow[] {
  if (target.kind === 'plan') {
    const geo = dxfGeometryOf(p, target.levelId, target.showRoofProjection ?? true);
    const rows = dxfLayersOf(p, geo, lang).map((name) => {
      const canonical = dxfLayerCanonical(name);
      return { name, style: geo.layerStyles?.[canonical] ?? dxfLayerStyleOf(name, geo.lineWeights?.[canonical]) };
    });
    // A camada dos importados só entra no arquivo quando há `Generic` no nível e a categoria está visível.
    const generic = levelGraphicsOf(p, target.levelId).overrides.generic.visible !== false
      && Object.values(p.elements).some((e) => e.kind === 'generic' && e.levelId === target.levelId);
    if (generic && !rows.some((r) => r.name === dxfLayerName(DXF_LAYER_GENERIC, lang))) {
      rows.push({ name: dxfLayerName(DXF_LAYER_GENERIC, lang), style: p.dxfLayers?.[DXF_LAYER_GENERIC] ?? dxfLayerStyleOf(DXF_LAYER_GENERIC) });
      rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }
  if (target.kind === 'section') {
    const geo = sectionDxfGeometryOf(p, target.sectionId);
    return dxfSectionLayersOf(geo, lang).map((name) => {
      const canonical = dxfLayerCanonical(name);
      return { name, style: geo.layerStyles?.[canonical] ?? dxfSectionLayerStyleOf(name, geo.lineWeights?.[canonical]) };
    });
  }
  if (!areaPlanOf(p, target.planId)) throw new Error(tr(lang, 'io_err_area_plan_missing'));
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
export function sectionDxfGeometryOf(p: Project, sectionId: Id, units?: DxfUnit, lang: Lang = activeLang()): DxfSectionGeometry {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) throw new Error(tr(lang, 'io_err_dxf_view_missing', { id: sectionId }));
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
export function sectionDxf(p: Project, sectionId: Id, units?: DxfUnit, lang: Lang = activeLang()): string {
  return exportSectionDxf(p, sectionId, sectionDxfGeometryOf(p, sectionId, units, lang), lang);
}

/** Vista de planta exportável: a planta de piso do nível ou uma planta de área (perfil + anotações próprias). */
export interface PlanViewRef {
  levelId: Id;
  areaPlanId?: Id | null;
  showRoofProjection?: boolean;
}

/** Ponto único de exportação do DXF de uma planta: a de área segue o perfil da vista; a de piso é inalterada. */
export function viewDxf(p: Project, v: PlanViewRef, lang: Lang = activeLang()): string {
  return v.areaPlanId ? areaPlanDxfOf(p, v.areaPlanId) : planDxf(p, v.levelId, v.showRoofProjection ?? true, undefined, lang);
}


