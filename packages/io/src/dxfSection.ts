import type { DxfLayerStyle, GraphicsCategory, Id, Project } from '@hestia/model';
import type { DxfPoint, DxfPolygons } from './dxf.ts';
import { DXF_CATEGORY_COLORS, DXF_LINE_WEIGHT_DEFAULT } from './dxf.ts';
import { writeDxf2000, type DxfDoc, type DxfDocEntity, type DxfDocLayer, type DxfUnit } from './dxfDoc.ts';
import { DXF_LAYER_COTAS, DXF_LAYER_DETALHE, DXF_LAYER_ETIQUETAS, DXF_LAYER_TEXTOS, dxfTextEntity, type DxfNotes } from './dxfNotes.ts';
import { dxfLayerCanonical, dxfLayerName, t, type Lang } from './i18n.ts';

/**
 * DXF do corte e da elevação (decisão 0015 §2.7). O desenho é (t, z), com z para cima; o peso da categoria na escala da
 * vista fica em `lineWeights`, que vira o 370 de cada camada no R2000. O io não conhece o motor: quem monta a geometria é o
 * app, que entrega os polígonos já visíveis e a categoria de cada um.
 */

/** Categoria de uma camada do corte/elevação e se o peso é o de corte ou o de projeção. */
export type DxfSectionRole = { category: GraphicsCategory; view: 'cut' | 'projection' };

/** Item do desenho: polígonos em (t, z) e a categoria gráfica que dá cor/peso à camada. */
export interface DxfSectionItem {
  category: GraphicsCategory;
  polygons: DxfPolygons;
}

/** Geometria do corte/elevação para o DXF. */
export interface DxfSectionGeometry {
  /** Regiões atravessadas pelo plano de corte (peso de corte). */
  cut: DxfSectionItem[];
  /** O que está além do plano, visível (peso de projeção). */
  beyond: DxfSectionItem[];
  /** Vãos visíveis: corte ou projeção, com a categoria porta/janela. */
  openings?: Array<DxfSectionItem & { cut: boolean }>;
  /** Contorno externo do desenho (peso de corte da parede). */
  silhouette?: DxfPolygons;
  /**
   * Largura de linha de cada camada, em centésimos de mm (arredondada ao valor DXF válido). Quem monta preenche com
   * `sectionLineWeightsOf` (apps/web), na escala da vista; sai no código 370 da tabela LAYER.
   */
  lineWeights?: Partial<Record<string, number>>;
  /** Estilo por camada vindo da tabela editável do projeto; ausente = `dxfSectionLayerStyleOf`. */
  layerStyles?: Record<string, DxfLayerStyle>;
  /**
   * Anotações da vista no plano `(t,z)` (cotas, textos, detalhes e etiquetas), nas mesmas camadas da planta. Quem monta
   * preenche com `sectionNotesDxfOf`; ausente = o corte sai só com a geometria, como antes.
   */
  notes?: DxfNotes;
  /** Unidade de saída do arquivo; ausente = metros. A geometria (t, z) continua em metros. */
  units?: DxfUnit;
}

/** Camadas de anotação do corte/elevação (as mesmas da planta); são anotação para o peso de linha (0). */
const NOTE_LAYERS: readonly string[] = [DXF_LAYER_COTAS, DXF_LAYER_TEXTOS, DXF_LAYER_DETALHE, DXF_LAYER_ETIQUETAS];

const CATEGORY_LAYER: Record<GraphicsCategory, string> = {
  wall: 'CORTE_PAREDE',
  door: 'CORTE_PORTA',
  window: 'CORTE_JANELA',
  floor: 'CORTE_PISO',
  slab: 'CORTE_LAJE',
  roof: 'CORTE_TELHADO',
  stair: 'CORTE_ESCADA',
  railing: 'CORTE_GUARDA_CORPO',
  columns: 'CORTE_PILAR',
  beams: 'CORTE_VIGA',
  footings: 'CORTE_FUNDACAO',
  room: 'CORTE_AMBIENTE',
  annotation: 'CORTE_ANOTACAO',
  generic: 'CORTE_IMPORTADO',
};

/** Contorno externo do corte/elevação (união das regiões visíveis). */
export const DXF_SECTION_LAYER_SILHOUETTE = 'CORTE_CONTORNO';
/** Linhas de nível: anotação, sem largura de linha (0). */
export const DXF_SECTION_LAYER_LEVELS = 'CORTE_NIVEIS';

/** Camada de uma categoria no corte (`view = 'cut'`) ou na projeção (`view = 'projection'`). */
export function dxfSectionLayerOf(category: GraphicsCategory, view: 'cut' | 'projection' = 'cut', lang: Lang = 'pt'): string {
  const base = dxfLayerName(CATEGORY_LAYER[category], lang);
  return view === 'projection' ? `${base}${t(lang, 'io_dxf_layer_section_projection_suffix')}` : base;
}

/** Categoria e papel de uma camada do corte/elevação; `annotation` para os níveis e as anotações; `undefined` para a camada 0. */
export function dxfSectionLineRoleOf(layer: string): DxfSectionRole | 'annotation' | undefined {
  const canonical = dxfLayerCanonical(layer);
  if (canonical === DXF_SECTION_LAYER_LEVELS || NOTE_LAYERS.includes(canonical)) return 'annotation';
  if (canonical === DXF_SECTION_LAYER_SILHOUETTE) return { category: 'wall', view: 'cut' };
  for (const category of Object.keys(CATEGORY_LAYER) as GraphicsCategory[]) {
    if (canonical === CATEGORY_LAYER[category]) return { category, view: 'cut' };
    if (canonical === `${CATEGORY_LAYER[category]}_PROJECAO`) return { category, view: 'projection' };
  }
  return undefined;
}

/** Camadas das anotações presentes na geometria (as mesmas da planta). */
function noteLayersOf(notes: DxfNotes | undefined): string[] {
  if (!notes) return [];
  const found = new Set<string>();
  for (const t of notes.texts) found.add(t.layer);
  for (const l of notes.otherLines ?? []) found.add(l.layer);
  if (notes.lines.length > 0) found.add(DXF_LAYER_COTAS);
  return [...found].filter((l) => NOTE_LAYERS.includes(l)).sort();
}

/** Anel sem o vértice de fechamento repetido; com menos de 3 vértices não há área. */
function openRing(ring: DxfPoint[]): DxfPoint[] | null {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const repeated = ring.length > 1 && first !== undefined && last !== undefined && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9;
  const pts = repeated ? ring.slice(0, -1) : ring;
  return pts.length >= 3 ? pts : null;
}

interface Shape {
  layer: string;
  pts: DxfPoint[];
}

/** Polilinhas fechadas do desenho, na ordem de pintura (projeção antes do corte). */
function shapesOf(geo: DxfSectionGeometry): Shape[] {
  const out: Shape[] = [];
  const push = (layer: string, polygons: DxfPolygons): void => {
    for (const poly of polygons) {
      for (const ring of poly) {
        const pts = openRing(ring);
        if (pts) out.push({ layer, pts });
      }
    }
  };
  for (const b of geo.beyond) push(dxfSectionLayerOf(b.category, 'projection'), b.polygons);
  for (const o of geo.openings ?? []) push(dxfSectionLayerOf(o.category, o.cut ? 'cut' : 'projection'), o.polygons);
  for (const c of geo.cut) push(dxfSectionLayerOf(c.category), c.polygons);
  if (geo.silhouette) push(DXF_SECTION_LAYER_SILHOUETTE, geo.silhouette);
  return out;
}

/** Nomes das camadas que `exportSectionDxf` põe na tabela (a base de `lineWeights`). */
export function dxfSectionLayersOf(geo: DxfSectionGeometry, lang: Lang = 'pt'): string[] {
  return [...new Set(['0', ...shapesOf(geo).map((s) => s.layer), ...noteLayersOf(geo.notes)])].map((name) => dxfLayerName(name, lang)).sort();
}

/** Estilo padrão de uma camada do corte: cor da categoria (cinza na projeção), contínua e a espessura pedida. */
export function dxfSectionLayerStyleOf(layer: string, lineWeight = DXF_LINE_WEIGHT_DEFAULT): DxfLayerStyle {
  const role = dxfSectionLineRoleOf(layer);
  if (role === undefined || role === 'annotation') return { color: 7, lineWeight, linetype: 'CONTINUOUS' };
  return { color: role.view === 'projection' ? 8 : DXF_CATEGORY_COLORS[role.category], lineWeight, linetype: 'CONTINUOUS' };
}

/**
 * Documento R2000 (AC1015) do corte ou da elevação: unidades em metros, z para cima. As camadas seguem a categoria
 * (`CORTE_PAREDE`, `CORTE_PISO`, …, `_PROJECAO` para o que está além) e o contorno externo vai em `CORTE_CONTORNO`. Cada
 * camada leva a largura de linha de `geo.lineWeights` (código 370, o que o R12 não guardava) e o estilo de `layerStyles`,
 * ou o padrão de `dxfSectionLayerStyleOf`.
 */
export function sectionDxfDocOf(geo: DxfSectionGeometry, lang: Lang = 'pt'): DxfDoc {
  const shapes = shapesOf(geo);
  const notes = geo.notes;
  const noteLines = (notes?.lines ?? []).map(([a, b]): DxfDocEntity => ({ kind: 'line', layer: dxfLayerName(DXF_LAYER_COTAS, lang), a, b }));
  const noteLeaders = (notes?.otherLines ?? []).map((l): DxfDocEntity => ({ kind: 'line', layer: dxfLayerName(l.layer, lang), a: l.a, b: l.b }));
  const noteRegions = (notes?.regions ?? []).filter((r) => r.length >= 3).map((r): DxfDocEntity => ({ kind: 'polyline', layer: dxfLayerName(DXF_LAYER_DETALHE, lang), points: r, closed: true }));
  const noteTexts = (notes?.texts ?? []).map((text) => dxfTextEntity({ ...text, layer: dxfLayerName(text.layer, lang) }));
  const layerNames = [...new Set(['0', ...shapes.map((s) => s.layer), ...noteLayersOf(notes)])].sort();
  const layers: DxfDocLayer[] = layerNames.map((name) => {
    const style = geo.layerStyles?.[name] ?? dxfSectionLayerStyleOf(name, geo.lineWeights?.[name] ?? DXF_LINE_WEIGHT_DEFAULT);
    return { name: dxfLayerName(name, lang), color: style.color, linetype: style.linetype, lineWeight: style.lineWeight };
  });
  const entities: DxfDocEntity[] = [
    ...shapes.map((s): DxfDocEntity => ({ kind: 'polyline', layer: dxfLayerName(s.layer, lang), points: s.pts, closed: true })),
    ...noteRegions,
    ...noteLines,
    ...noteLeaders,
    ...noteTexts,
  ];
  const all = [
    ...shapes.flatMap((s) => s.pts),
    ...(notes?.lines ?? []).flatMap(([a, b]) => [a, b]),
    ...(notes?.otherLines ?? []).flatMap((l) => [l.a, l.b]),
    ...(notes?.texts ?? []).map((t) => t.at),
    ...(notes?.regions ?? []).flat(),
  ];
  const lo = all.reduce((m, p) => ({ x: Math.min(m.x, p.x), y: Math.min(m.y, p.y) }), { x: 0, y: 0 });
  const hi = all.reduce((m, p) => ({ x: Math.max(m.x, p.x), y: Math.max(m.y, p.y) }), { x: 0, y: 0 });
  return { layers, entities, extMin: lo, extMax: hi, ...(geo.units === undefined ? {} : { units: geo.units }) };
}

/**
 * Corte ou elevação em DXF R2000 (AC1015): o `writeDxf2000` do documento de `sectionDxfDocOf`. Só a existência da vista é
 * conferida aqui (o io não conhece o motor): quem monta a geometria é o app.
 */
export function exportSectionDxf(project: Project, viewId: Id, geo: DxfSectionGeometry, lang: Lang = 'pt'): string {
  if (!project.views.some((v) => v.id === viewId)) throw new Error(t(lang, 'io_err_dxf_view_missing', { id: viewId }));
  return writeDxf2000(sectionDxfDocOf(geo, lang));
}
