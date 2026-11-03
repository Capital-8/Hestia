import { buildOpeningModel, computeSection, frameOfWall, openingGeometry, resolveLevel, type OpeningGeometry, type OpeningModel, type SectionLine, type SectionResult } from '@hestia/engine';
import { buildPlanDrawList, buildSectionDrawList, DARK, LIGHT, sectionBox, type PlanDrawList, type PlanTheme } from '@hestia/render';
import { openingAngle2d, openingDetail2d, type Opening, type OpeningLineConvention, type OpeningType, type Project } from '@hestia/model';
import { t, type Lang } from '../../../editor/i18n.ts';
import { drawListToSvg, expandDrawBox, type DrawBox } from './drawListToSvg.ts';
import { previewOpening, previewProject, previewWall } from './previewProject.ts';

export type PreviewViewKind = 'plan' | 'elevation' | 'section';

export interface PreviewViewOptions {
  flipHand?: boolean;
  flipFacing?: boolean;
  /** Ângulo do controle da prévia (graus); no plano entra como `angle2d` e no 3D como `angle3d`. */
  angle?: number;
  dark?: boolean;
  width?: number;
  height?: number;
  /** Convenção do V do projeto; ausente usa o padrão por leitura (`latch`/`toward`). */
  openingLine?: OpeningLineConvention;
  /** Idioma dos títulos desenhados/aria (default `pt`). */
  lang?: Lang;
}

export interface PreviewDraw {
  drawList: PlanDrawList;
  /** Enquadramento em metros, com 0,5 m de margem em volta do vão. */
  box: DrawBox;
  svg: string;
}

/** Margens de enquadramento (m): a planta abre espaço para o arco; a elevação mostra um pouco do piso. */
const MARGIN_PLAN = 0.6;
const MARGIN_ELEVATION = 0.3;
const MARGIN_SECTION = 0.5;

/** Folga horizontal dos detalhes do corte em volta da espessura da parede (m), para eles ficarem ampliados. */
const DETAIL_SIDE_MARGIN = 0.12;
const DETAIL_SILL_SIDE_MARGIN = 0.18;

const themeOf = (dark: boolean): PlanTheme => (dark ? DARK : LIGHT);
const clampAngle = (angle: number): number => Math.max(0, Math.min(120, angle));

/** Detalhe efetivo da planta da prévia: em `'scale'` a prévia é ampliada, então usa o desenho alto (folha aberta e fechada). */
export function previewPlanDetail(type: Pick<OpeningType, 'detail2d'>): 'low' | 'mid' | 'high' | 'off' {
  const detail = openingDetail2d(type);
  return detail === 'scale' ? 'high' : detail;
}

/** Projeto com o tipo de prévia trocado no catálogo (para o plano usar o detalhe e o ângulo do diálogo). */
function withType(p: Project, type: OpeningType): Project {
  return { ...p, openingTypes: { ...p.openingTypes, [type.id]: type } };
}

/** Projeto com a convenção do V do projeto real (as vistas de seção e de 3D a leem de `settings`). */
function withSettings(p: Project, options: PreviewViewOptions): Project {
  if (!options.openingLine) return p;
  return { ...p, settings: { ...p.settings, openingLine: options.openingLine } };
}

function openingOf(p: Project): { opening: Opening; geometry: OpeningGeometry; model: OpeningModel } | null {
  const opening = previewOpening(p);
  if (!opening) return null;
  const frame = frameOfWall(p, opening.hostId);
  if (!frame) return null;
  const geometry = openingGeometry(p, opening, frame);
  return { opening, geometry, model: buildOpeningModel(p, opening, geometry, frame) };
}

/**
 * Caixa do vão no mundo: a largura, a espessura e o alcance do arco da folha aberta (raio do modelo único), com 0,6 m
 * de margem. É o enquadramento pedido para a planta ampliada da prévia.
 */
function planBox(p: Project, margin = MARGIN_PLAN): DrawBox {
  const found = openingOf(p);
  if (!found) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  const { geometry: g, model } = found;
  const reach = Math.max(g.thickness / 2, ...model.openings.map((o) => o.radius));
  return {
    minX: g.center.x - g.width / 2 - margin,
    maxX: g.center.x + g.width / 2 + margin,
    minY: g.center.y - reach - margin,
    maxY: g.center.y + reach + margin,
  };
}

/** Tipo para o plano: o detalhe efetivo da prévia e o `angle2d` do controle. */
function planType(type: OpeningType, angle: number | undefined): OpeningType {
  return { ...type, detail2d: previewPlanDetail(type), angle2d: clampAngle(angle ?? openingAngle2d(type)) };
}

/**
 * Lista de desenho da planta pelo pipeline do projeto (`render/plan`), com o detalhe 2D do tipo e o corte padrão da
 * vista. O enquadramento é o vão com 0,5 m de margem.
 */
export function previewPlanDrawList(type: OpeningType, options: PreviewViewOptions = {}): { drawList: PlanDrawList; box: DrawBox } {
  const base = previewProject(type, options.flipHand ?? false, options.flipFacing ?? false, options.lang ?? 'pt');
  const p = withType(withSettings(base, options), planType(type, options.angle));
  const levelId = p.levels[0]!.id;
  const wall = previewWall(p);
  const center = wall ? (wall.a.x + wall.b.x) / 2 : 0;
  const viewport = { cx: center, cy: 0, zoom: 100, width: 800, height: 600 };
  const drawList = buildPlanDrawList({
    project: p,
    levelId,
    resolved: resolveLevel(p, levelId),
    below: null,
    viewport,
    theme: themeOf(options.dark ?? false),
    dark: options.dark ?? false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
  });
  return { drawList, box: planBox(p) };
}

/** Linha de elevação paralela à parede, com o observador do lado `+n` (a tela cresce no sentido de `d`). */
function elevationLine(p: Project): SectionLine {
  const wall = previewWall(p);
  const length = wall ? Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) : 6;
  return { a: { x: length, y: 1 }, b: { x: 0, y: 1 }, depth: 2 };
}

/** Linha de corte perpendicular à parede pelo centro do vão. */
function crossLine(p: Project): SectionLine {
  const found = openingOf(p);
  const x = found?.geometry.center.x ?? 0;
  return { a: { x, y: -1 }, b: { x, y: 1 }, depth: 2 };
}

/** Caixa da vista de seção em (distância ao longo da linha, cota), com a margem dada. */
function sectionViewBox(section: SectionResult, cut: boolean, margin: number): DrawBox {
  const opening = section.openings[0];
  if (!opening) {
    const b = sectionBox(section);
    return expandDrawBox(b, margin);
  }
  const cx = (opening.t0 + opening.t1) / 2;
  const span = cut ? opening.model.thickness : opening.model.width;
  return {
    minX: cx - span / 2 - margin,
    maxX: cx + span / 2 + margin,
    minY: opening.z0 - margin,
    maxY: opening.z1 + margin,
  };
}

interface SectionPreviewScene {
  section: SectionResult;
  drawList: PlanDrawList;
}

/** Cena da seção da prévia: o projeto mínimo, o resultado do motor e a lista de desenho do render. */
function sectionScene(type: OpeningType, cut: boolean, options: PreviewViewOptions): SectionPreviewScene {
  const project = withSettings(previewProject(type, options.flipHand ?? false, options.flipFacing ?? false, options.lang ?? 'pt'), options);
  const section = computeSection(project, cut ? crossLine(project) : elevationLine(project));
  const dark = options.dark ?? false;
  const drawList = buildSectionDrawList({
    project,
    section,
    viewport: { cx: 0, cy: 1.5, zoom: 100, width: 800, height: 600 },
    theme: themeOf(dark),
    dark,
    showGrid: false,
  });
  return { section, drawList };
}

function sectionDraw(type: OpeningType, cut: boolean, options: PreviewViewOptions): { drawList: PlanDrawList; box: DrawBox } {
  const scene = sectionScene(type, cut, options);
  return { drawList: scene.drawList, box: sectionViewBox(scene.section, cut, cut ? MARGIN_SECTION : MARGIN_ELEVATION) };
}

/** Lista de desenho da elevação pelo pipeline de seção (`engine/section` + `render/section`). */
export function previewElevationDrawList(type: OpeningType, options: PreviewViewOptions = {}): { drawList: PlanDrawList; box: DrawBox } {
  return sectionDraw(type, false, options);
}

/** Lista de desenho do corte transversal pelo pipeline de seção, com a linha passando no centro do vão. */
export function previewSectionDrawList(type: OpeningType, options: PreviewViewOptions = {}): { drawList: PlanDrawList; box: DrawBox } {
  return sectionDraw(type, true, options);
}

/** Quadro do corte da prévia: o corte inteiro e os detalhes ampliados da cabeça e da soleira. */
export interface PreviewSectionFrame {
  id: 'full' | 'head' | 'sill';
  title: string;
  drawList: PlanDrawList;
  box: DrawBox;
  svg: string;
}

/** Caixa do detalhe da cabeça: `H − 0,40` a `H + 0,35` em volta da espessura da parede. */
function headBox(section: SectionResult): DrawBox | null {
  const opening = section.openings[0];
  if (!opening) return null;
  const cx = (opening.t0 + opening.t1) / 2;
  const half = opening.model.thickness / 2 + DETAIL_SIDE_MARGIN;
  return {
    minX: cx - half,
    maxX: cx + half,
    minY: opening.z0 + opening.model.height - 0.4,
    maxY: opening.z0 + opening.model.height + 0.35,
  };
}

/** Caixa do detalhe da soleira: porta de −0,15 a +0,35; janela de −0,35 a +0,35 (peitoril, soleira e contraverga). */
function sillBox(section: SectionResult, kind: OpeningType['kind']): DrawBox | null {
  const opening = section.openings[0];
  if (!opening) return null;
  const cx = (opening.t0 + opening.t1) / 2;
  const half = opening.model.thickness / 2 + DETAIL_SILL_SIDE_MARGIN;
  const below = kind === 'door' ? 0.15 : 0.35;
  return {
    minX: cx - half,
    maxX: cx + half,
    minY: opening.z0 - below,
    maxY: opening.z0 + 0.35,
  };
}

/**
 * Os três quadros do corte transversal da prévia, todos desenhados pelo pipeline do projeto: o corte inteiro (pequeno)
 * e dois detalhes ampliados, "Cabeça" e "Soleira". Cada quadro tem o seu enquadramento e o seu SVG.
 */
export function previewSectionFrames(type: OpeningType, options: PreviewViewOptions = {}): PreviewSectionFrame[] {
  const lang = options.lang ?? 'pt';
  const scene = sectionScene(type, true, options);
  const full = sectionViewBox(scene.section, true, MARGIN_SECTION);
  const head = headBox(scene.section) ?? full;
  const sill = sillBox(scene.section, type.kind) ?? full;
  const frame = (id: PreviewSectionFrame['id'], title: string, box: DrawBox): PreviewSectionFrame => ({
    id,
    title,
    drawList: scene.drawList,
    box,
    svg: svgOf(scene.drawList, box, options, title),
  });
  return [frame('full', t(lang, 'dlo_sec_full'), full), frame('head', t(lang, 'dlo_sec_head'), head), frame('sill', t(lang, 'dlo_sec_sill'), sill)];
}

function svgOf(drawList: PlanDrawList, box: DrawBox, options: PreviewViewOptions, title: string): string {
  return drawListToSvg(drawList, box, { width: options.width, height: options.height, title });
}

export function previewPlanSvg(type: OpeningType, options: PreviewViewOptions = {}): string {
  const { drawList, box } = previewPlanDrawList(type, options);
  return svgOf(drawList, box, options, t(options.lang ?? 'pt', 'dlo_prev_title_plan'));
}

export function previewElevationSvg(type: OpeningType, options: PreviewViewOptions = {}): string {
  const { drawList, box } = previewElevationDrawList(type, options);
  return svgOf(drawList, box, options, t(options.lang ?? 'pt', 'dlo_prev_title_elevation'));
}

export function previewSectionSvg(type: OpeningType, options: PreviewViewOptions = {}): string {
  const { drawList, box } = previewSectionDrawList(type, options);
  return svgOf(drawList, box, options, t(options.lang ?? 'pt', 'dlo_prev_title_section'));
}

/**
 * Assinatura visual do tipo: só os campos que mudam o desenho (nome, código, custo e dados BIM ficam de fora). É a
 * chave do cache das miniaturas.
 */
/** Campos que não mudam o desenho (identificação e custo): todo o resto entra na assinatura, inclusive campos novos do esquema. */
const NAO_VISUAIS = new Set<string>(['id', 'name', 'code', 'description', 'cost']);

export function previewTypeSignature(type: OpeningType): string {
  // Regra de exclusão, não lista: um campo novo do tipo (composição, recuo do batente, ferragens...) sempre refaz a prévia.
  const visuais = Object.entries(type)
    .filter(([k, v]) => !NAO_VISUAIS.has(k) && v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(visuais);
}

const miniCache = new Map<string, string>();
const MINI_CACHE_MAX = 96;

/** Miniatura (elevação) gerada pelo mesmo caminho da prévia grande, com cache por assinatura visual do tipo. */
export function previewMiniatureSvg(type: OpeningType, width = 96, height = 64, lang: Lang = 'pt'): string {
  const key = `${previewTypeSignature(type)}|${width}x${height}|${lang}`;
  const hit = miniCache.get(key);
  if (hit !== undefined) return hit;
  const svg = previewElevationSvg(type, { width, height, lang });
  if (miniCache.size >= MINI_CACHE_MAX) miniCache.delete(miniCache.keys().next().value as string);
  miniCache.set(key, svg);
  return svg;
}

/** Esvazia o cache das miniaturas (testes). */
export function clearMiniatureCache(): void {
  miniCache.clear();
}
