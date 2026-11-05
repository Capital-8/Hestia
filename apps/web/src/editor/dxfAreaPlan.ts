/**
 * DXF R2000 da planta de área (decisão 0027/0037): as operações do render viram LINE e TEXT nas camadas AMBIENTES,
 * AMBIENTES_REFERENCIA, AMBIENTES_CHAMADA e AMBIENTES_TEXTO, com as cotas e os textos de `plan.annotations` que o render
 * ainda não desenha. Cada camada leva cor e espessura da tabela do projeto (`Project.dxfLayers`) ou o padrão daqui.
 */
import type { Vec2 } from '@hestia/geom';
import { resolveAngularDimension, resolveLevel, resolveRoofs } from '@hestia/engine';
import { areaPlanProfile, buildPlanGeometry, drawnAnnotations, levelBox, LIGHT, resolverZoom, roofFootprint, type PlanOps, type PlanProfile } from '@hestia/render';
import { angularDimensionGeometry, areaPlanOf, DIM_TEXT_MM, dimensionGeometry, dimensionPoints, dimensionText, unitsOf, type AreaPlan, type DxfLayerLineType, type DxfLayerStyle, type Id, type Project } from '@hestia/model';
import { dxfDocOf, DXF_LINE_WEIGHT_DEFAULT, writeDxf2000, type DxfDoc, type DxfDocEntity, type DxfDocLayer, type DxfLevelGeometry, type DxfUnit } from '@hestia/io';
import { dxfGeometryOf } from './dxfExport.ts';
import { t, useI18n, type Lang } from './i18n.ts';

/** Camada de um traço da planta de área: referência, chamada ou contorno. */
const areaLayerOf = (color: string, pts: number): string => (color === '#4b5563' ? 'AMBIENTES_REFERENCIA' : color === '#111827' && pts === 2 ? 'AMBIENTES_CHAMADA' : 'AMBIENTES');

/** Estilo padrão de uma camada da planta de área, antes das edições do projeto. */
const AREA_LAYER_STYLE: Record<string, { color: number; linetype: DxfLayerLineType }> = {
  AMBIENTES: { color: 7, linetype: 'CONTINUOUS' },
  AMBIENTES_REFERENCIA: { color: 8, linetype: 'CONTINUOUS' },
  AMBIENTES_CHAMADA: { color: 7, linetype: 'CONTINUOUS' },
  AMBIENTES_TEXTO: { color: 7, linetype: 'CONTINUOUS' },
  ANOTACOES: { color: 7, linetype: 'CONTINUOUS' },
  ANOTACOES_TEXTO: { color: 7, linetype: 'CONTINUOUS' },
  ANOTACOES_DETALHE: { color: 7, linetype: 'CONTINUOUS' },
};

/** Estilo efetivo de uma camada da planta de área: o do projeto ou o padrão da área (espessura -3). */
export function areaLayerStyleOf(p: Project, layer: string): DxfLayerStyle {
  return p.dxfLayers?.[layer] ?? { ...(AREA_LAYER_STYLE[layer] ?? { color: 7, linetype: 'CONTINUOUS' }), lineWeight: DXF_LINE_WEIGHT_DEFAULT };
}

/** Camadas de uma lista de entidades: `0` e as usadas, em ordem, com o estilo efetivo da planta de área. */
function layersOfEntities(p: Project, entities: DxfDocEntity[]): DxfDocLayer[] {
  const names = new Set(['0', ...entities.map((e) => e.layer)]);
  return [...names].sort().map((name) => ({ name, ...areaLayerStyleOf(p, name) }));
}

/**
 * Documento R2000 da planta de área a partir das operações do render: cada traço vira LINE e cada rótulo TEXT, nas camadas
 * AMBIENTES, AMBIENTES_REFERENCIA, AMBIENTES_CHAMADA e AMBIENTES_TEXTO (como no R12 anterior; antes o arquivo declarava
 * AC1015 sem a estrutura do R2000 e o AutoCAD o recusava com "DXF read error").
 */
function opsDocOf(p: Project, ops: PlanOps, zoom: number): DxfDoc {
  const entities: DxfDocEntity[] = [];
  for (const s of ops.strokes) {
    const layer = areaLayerOf(s.color, s.pts.length);
    const pts = s.closed && s.pts.length > 2 ? [...s.pts, s.pts[0]!] : s.pts;
    for (let i = 0; i + 1 < pts.length; i++) entities.push({ kind: 'line', layer, a: pts[i]!, b: pts[i + 1]! });
  }
  for (const l of ops.labels) {
    if (!l.text) continue;
    entities.push({ kind: 'text', layer: 'AMBIENTES_TEXTO', at: l.at, height: (l.fontPx ?? 12) / zoom, text: l.text, rotation: l.rotation ?? 0 });
  }
  return { layers: layersOfEntities(p, entities), entities };
}

const samePoint = (a: Vec2, b: Vec2): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/**
 * Entidades R2000 das anotações da planta de área (cotas, textos e detalhes). A geometria da planta já as desenha quando o
 * render da área passou a incluí-las; o que ainda não estiver nas operações entra aqui, sem duplicar.
 */
function areaAnnotationEntities(p: Project, plan: AreaPlan, ops: PlanOps): DxfDocEntity[] {
  const a = drawnAnnotations(p, plan.levelId, plan);
  if (a.dimensions.length + a.texts.length + a.detailLines.length + a.detailRegions.length === 0) return [];
  const out: DxfDocEntity[] = [];
  const line = (layer: string, start: Vec2, end: Vec2): void => {
    out.push({ kind: 'line', layer, a: start, b: end });
  };
  const text = (layer: string, at: Vec2, height: number, value: string, rotation = 0): void => {
    out.push({ kind: 'text', layer, at, height, text: value, rotation });
  };
  const rendered = new Set(ops.labels.map((l) => l.text).filter((x): x is string => !!x));
  const mPerMm = plan.scale / 1000;
  for (const d of a.dimensions) {
    const rd = d.angular ? resolveAngularDimension(p, plan.levelId, d) : d;
    const value = dimensionText(p, rd, unitsOf(p));
    if (rendered.has(value)) continue;
    const textMm = d.textHeight ?? DIM_TEXT_MM;
    if (d.angular) {
      const g = angularDimensionGeometry(rd);
      if (!g) continue;
      for (let i = 1; i < g.arc.length; i++) line('ANOTACOES', g.arc[i - 1]!, g.arc[i]!);
      for (const seg of [...g.extensions, ...g.ticks]) line('ANOTACOES', seg[0], seg[1]);
      text('ANOTACOES_TEXTO', rd.textAt ?? g.textAt, (textMm * plan.scale) / 1000, value, g.textRotation);
      continue;
    }
    const { a: pa, b: pb } = dimensionPoints(p, d);
    const g = dimensionGeometry(pa, pb, d.offset, mPerMm, textMm, d.textAt);
    for (const seg of [g.line, ...g.extensions, ...g.ticks]) line('ANOTACOES', seg[0], seg[1]);
    text('ANOTACOES_TEXTO', g.textAt, (textMm * plan.scale) / 1000, value, g.textRotation);
  }
  for (const t of a.texts) {
    if (rendered.has(t.text)) continue;
    text('ANOTACOES_TEXTO', t.at, (t.height * plan.scale) / 1000, t.text, t.rotation);
  }
  const hasSegment = (start: Vec2, end: Vec2): boolean =>
    ops.strokes.some((s) => s.pts.length === 2 && samePoint(s.pts[0]!, start) && samePoint(s.pts[1]!, end));
  for (const x of a.detailLines) if (!hasSegment(x.a, x.b)) line('ANOTACOES_DETALHE', x.a, x.b);
  for (const x of a.detailRegions) {
    const drawn = ops.strokes.some((s) => s.pts.length === x.boundary.length && x.boundary.every((q, i) => samePoint(s.pts[i]!, q)));
    if (drawn) continue;
    for (let i = 0; i < x.boundary.length; i++) line('ANOTACOES_DETALHE', x.boundary[i]!, x.boundary[(i + 1) % x.boundary.length]!);
  }
  return out;
}
/** DXF da planta de área, com as camadas AMBIENTES, AMBIENTES_REFERENCIA, AMBIENTES_CHAMADA e AMBIENTES_TEXTO. */
export function areaPlanDxf(p: Project, planId: Id, units?: DxfUnit, lang: Lang = useI18n.getState().lang): string {
  const plan = areaPlanOf(p, planId);
  if (!plan) throw new Error(t(lang, 'io_err_area_plan_missing'));
  const box = levelBox(p, plan.levelId) ?? { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  const zoom = 100;
  const width = Math.max(400, (box.maxX - box.minX) * zoom + 200);
  const height = Math.max(300, (box.maxY - box.minY) * zoom + 200);
  const viewport = { cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2, zoom, width, height };
  const g = plan.graphics;
  // Modelo: as mesmas categorias/intervalo da planta de piso, filtradas pelos gráficos da área. As anotações do nível
  // não entram aqui: a área usa as anotações da própria vista (abaixo).
  const base = dxfGeometryOf(p, plan.levelId, g.showRoofs !== false);
  const modelGeo: DxfLevelGeometry = {
    ...base,
    rooms: [],
    roomTexts: [],
    clusters: g.showWalls === 'hidden' ? [] : base.clusters,
    wallOutlines: g.showWalls === 'hidden' ? [] : base.wallOutlines,
    openings: g.showOpenings ? base.openings : [],
    floors: g.showFloors ? base.floors : [],
    slabs: g.showFloors ? base.slabs : [],
    stairs: g.showStairs !== false ? base.stairs : [],
    ramps: g.showStairs !== false ? base.ramps : [],
    // A área mostra o telhado só como projeção, como na tela (não a água cheia).
    roofs: [],
    roofProjections: g.showRoofs !== false ? resolveRoofs(p, plan.levelId).flatMap((r) => roofFootprint(r)) : [],
    notes: undefined,
    sectionMarks: undefined,
  };
  // Só o que é da área: ambientes, referenciais, chamadas, textos, legenda e quadro. O perfil desliga o modelo para
  // não duplicar o que já veio no documento do modelo.
  const profile: PlanProfile = {
    ...areaPlanProfile(plan),
    walls: 'hidden',
    openings: false,
    floors: false,
    stairs: false,
    ramps: false,
    roofs: 'hidden',
    underlay: false,
    elementTags: false,
    generic: false,
    ceilings: false,
  };
  const ops = resolverZoom(buildPlanGeometry({
    project: p,
    levelId: plan.levelId,
    resolved: resolveLevel(p, plan.levelId),
    below: null,
    areaPlan: plan,
    profile,
    viewport,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    lang,
  }), zoom);
  // Cotas/textos/detalhes de `plan.annotations`: o render da área pode já desenhá-los; o que faltar entra aqui.
  const areaEntities = [...opsDocOf(p, ops, zoom).entities, ...areaAnnotationEntities(p, plan, ops)];
  const modelDoc = dxfDocOf(p, plan.levelId, modelGeo);
  const layers = new Map<string, DxfDocLayer>();
  for (const layer of [...modelDoc.layers, ...layersOfEntities(p, areaEntities)]) layers.set(layer.name, layer);
  const sorted = [...layers.values()].sort((a, b) => a.name.localeCompare(b.name));
  return writeDxf2000({
    ...modelDoc,
    layers: sorted,
    entities: [...modelDoc.entities, ...areaEntities],
    ...(units === undefined ? {} : { units }),
  });
}

/** Nomes das camadas fixas da planta de área (base da tabela editável do diálogo). */
export const AREA_LAYER_NAMES: readonly string[] = Object.keys(AREA_LAYER_STYLE);
