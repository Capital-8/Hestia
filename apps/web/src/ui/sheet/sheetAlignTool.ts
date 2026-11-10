import {
  planViewOf,
  sheetInnerBox,
  viewportAnchor,
  type Id,
  type Project,
  type Sheet,
  type SheetViewport,
} from '@hestia/model';
import { levelBox, type SheetDrawList, type SheetGroup, type SheetPoint } from '@hestia/render';
import { alignFeaturesAt, type AlignKind, type AlignPrefer } from '@hestia/tools';
import { t, type Lang } from '../../editor/i18n.ts';

/**
 * Alinhar nas pranchas: as mesmas feições do Alinhar do modelo (`alignFeaturesAt`), levadas para o papel, mais a moldura
 * da vista, as linhas do desenho de corte/tabela e a área de desenho da folha. Tudo em mm de papel, com y para cima.
 *
 * A captura é a mesma do modelo: a vista da planta em papel vira um ponto do mundo por uma conta afim (âncora, centro do
 * conteúdo e escala); o resultado volta para o papel pela conta inversa. As feições só servem para guiar o alinhamento —
 * quem move a vista é o chamador.
 */

export interface PaperPoint {
  x: number;
  y: number;
}

/** Reta no papel: ponto e direção unitária (mm de papel). */
export interface PaperLine {
  p: PaperPoint;
  d: PaperPoint;
}

export type SheetAlignKind = AlignKind | 'moldura' | 'folha';

export interface SheetAlignFeature {
  /** Chave estável entre passadas do mouse. */
  key: string;
  /** "face da parede", "eixo da parede", "moldura da vista", "borda da folha"... */
  label: string;
  kind: SheetAlignKind;
  /** Reta em mm de papel, y para cima. */
  line: PaperLine;
  owner: { type: 'viewport'; id: Id } | { type: 'sheet' };
  /** Distância do cursor à feição, em mm de papel (serve só para ordenar). */
  distance: number;
  /** Pontas no papel, para desenhar a guia. */
  seg?: { a: PaperPoint; b: PaperPoint };
}

export interface SheetAlignQuery {
  project: Project;
  sheet: Sheet;
  drawList: SheetDrawList;
  /** Cursor em mm de papel. */
  at: PaperPoint;
  /** Pixels de tela por mm de papel. */
  zoom: number;
  /** Padrão 'faces' (a mesma opção "Preferir" do Alinhar do modelo). */
  prefer?: AlignPrefer;
  /** Idioma dos rótulos das feições (ausente = português). */
  lang?: Lang;
}

/** Tolerância de captura em pixels de tela, como no Alinhar do modelo. */
const TOL_PX = 8;

/** Comprimento mínimo de um traço do desenho: 15% da caixa da vista no eixo do traço. */
const MIN_TRACE_FRACTION = 0.15;

/** Passo do arredondamento das linhas do desenho (mm): junta os traços que são a mesma linha. */
const TRACE_STEP_MM = 0.05;

const EPS_AXIS = 1e-6;
const EPS_PARALLEL = 1e-3;
const EPS_ALIGNED = 1e-6;

interface ViewMapping {
  anchor: PaperPoint;
  centre: PaperPoint;
  /** mm de papel por metro do mundo. */
  k: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Centro da caixa do nível, a mesma conta do render (`planPartsOf`); sem paredes, a origem. */
function levelCentre(project: Project, levelId: Id): PaperPoint {
  const b = levelBox(project, levelId);
  return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 };
}

const viewMappingOf = (vp: SheetViewport, centre: PaperPoint): ViewMapping => ({
  anchor: viewportAnchor(vp),
  centre,
  k: 1000 / vp.scale,
});

/** Mundo → papel: o centro do conteúdo cai na âncora da vista, como em `toPaper` do render. */
const toPaper = (m: ViewMapping, p: PaperPoint): PaperPoint => ({
  x: m.anchor.x + (p.x - m.centre.x) * m.k,
  y: m.anchor.y + (p.y - m.centre.y) * m.k,
});

/** Papel → mundo: a inversa de `toPaper`, usada para consultar o Alinhar do modelo no ponto do cursor. */
const toWorld = (m: ViewMapping, p: PaperPoint): PaperPoint => ({
  x: m.centre.x + (p.x - m.anchor.x) / m.k,
  y: m.centre.y + (p.y - m.anchor.y) / m.k,
});

const feature = (
  key: string,
  label: string,
  kind: SheetAlignKind,
  line: PaperLine,
  owner: SheetAlignFeature['owner'],
  distance: number,
  seg?: { a: PaperPoint; b: PaperPoint },
): SheetAlignFeature => ({ key, label, kind, line, owner, distance, ...(seg ? { seg } : {}) });

/** Distância do ponto ao segmento (mm de papel). */
function segmentDistance(p: PaperPoint, a: PaperPoint, b: PaperPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Moldura da vista: as três verticais e as três horizontais da caixa, quando o cursor está na faixa em volta dela. */
function frameFeatures(vp: SheetViewport, at: PaperPoint, tol: number, lang: Lang): SheetAlignFeature[] {
  const x0 = vp.at.x;
  const y0 = vp.at.y;
  const x1 = x0 + vp.size.w;
  const y1 = y0 + vp.size.h;
  if (at.x < x0 - tol || at.x > x1 + tol || at.y < y0 - tol || at.y > y1 + tol) return [];

  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  const owner: SheetAlignFeature['owner'] = { type: 'viewport', id: vp.id };
  const out: SheetAlignFeature[] = [];
  const columns: Array<{ slot: string; x: number }> = [
    { slot: 'esq', x: x0 },
    { slot: 'meio', x: xm },
    { slot: 'dir', x: x1 },
  ];
  const rows: Array<{ slot: string; y: number }> = [
    { slot: 'base', y: y0 },
    { slot: 'meio', y: ym },
    { slot: 'topo', y: y1 },
  ];
  for (const c of columns) {
    out.push(
      feature(
        `${vp.id}:moldura:v:${c.slot}`,
        t(lang, 'cvs_feat_frame'),
        'moldura',
        { p: { x: c.x, y: ym }, d: { x: 0, y: 1 } },
        owner,
        Math.abs(at.x - c.x),
        { a: { x: c.x, y: y0 }, b: { x: c.x, y: y1 } },
      ),
    );
  }
  for (const r of rows) {
    out.push(
      feature(
        `${vp.id}:moldura:h:${r.slot}`,
        t(lang, 'cvs_feat_frame'),
        'moldura',
        { p: { x: xm, y: r.y }, d: { x: 1, y: 0 } },
        owner,
        Math.abs(at.y - r.y),
        { a: { x: x0, y: r.y }, b: { x: x1, y: r.y } },
      ),
    );
  }
  return out;
}

/** Geometria do modelo na vista de planta: `alignFeaturesAt` no mundo e o resultado de volta ao papel. */
function modelFeatures(
  project: Project,
  vp: SheetViewport,
  at: PaperPoint,
  zoom: number,
  prefer: AlignPrefer,
  lang: Lang,
): SheetAlignFeature[] {
  let levelId: Id;
  if (vp.view.kind === 'plan') {
    levelId = vp.view.levelId;
  } else if (vp.view.kind === 'areaPlan') {
    const plan = planViewOf(project, vp.view.planId);
    if (!plan) return [];
    levelId = plan.levelId;
  } else {
    return [];
  }
  if (!(vp.scale > 0)) return [];

  const m = viewMappingOf(vp, levelCentre(project, levelId));
  const world = toWorld(m, at);
  const features = alignFeaturesAt({
    project,
    levelId,
    at: world,
    metersPerPixel: vp.scale / (1000 * zoom),
    prefer,
    lang,
  });
  return features.map((f): SheetAlignFeature => {
    const seg = f.seg ? { a: toPaper(m, f.seg.a), b: toPaper(m, f.seg.b) } : undefined;
    return {
      key: `${vp.id}:${f.key}`,
      label: f.label,
      kind: f.kind,
      line: { p: toPaper(m, f.line.p), d: { x: f.line.d.x, y: f.line.d.y } },
      owner: { type: 'viewport', id: vp.id },
      distance: f.distance * m.k,
      ...(seg ? { seg } : {}),
    };
  });
}

/** Unidade inteira de 0,05 mm, usada para deduplicar as linhas do desenho sem depender de arredondamento binário. */
const traceUnits = (v: number): number => Math.round(v / TRACE_STEP_MM);

/**
 * Linhas do desenho de uma vista sem captura no modelo (corte, quadro de áreas e 3D): só os traços axiais, longos o
 * bastante para serem uma linha e perto o suficiente do cursor. Uma feição por coordenada arredondada a 0,05 mm.
 */
function drawingFeatures(
  vp: SheetViewport,
  group: SheetGroup | undefined,
  at: PaperPoint,
  tol: number,
  lang: Lang,
): SheetAlignFeature[] {
  if (!group) return [];
  const minV = MIN_TRACE_FRACTION * vp.size.h;
  const minH = MIN_TRACE_FRACTION * vp.size.w;
  const owner: SheetAlignFeature['owner'] = { type: 'viewport', id: vp.id };
  const kept = new Map<string, { feature: SheetAlignFeature; length: number }>();

  /** Guarda o candidato se ele é a linha mais próxima (ou a mais longa, em caso de empate) daquela coordenada. */
  const consider = (axis: 'v' | 'h', units: number, a: SheetPoint, b: SheetPoint, length: number, distance: number): void => {
    const key = `${vp.id}:linha:${axis}:${units}`;
    const prev = kept.get(key);
    if (prev && (prev.feature.distance < distance - EPS_AXIS || (Math.abs(prev.feature.distance - distance) <= EPS_AXIS && prev.length >= length))) {
      return;
    }
    const coord = units * TRACE_STEP_MM;
    const p = axis === 'v' ? { x: coord, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: coord };
    const d = axis === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 };
    kept.set(key, {
      feature: feature(key, t(lang, 'cvs_feat_line'), 'linhaEsboco', { p, d }, owner, distance, { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }),
      length,
    });
  };

  for (const path of group.paths) {
    const pts = path.pts;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = i + 1 < n ? pts[i + 1]! : path.closed && n > 2 ? pts[0]! : null;
      if (!b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const vertical = Math.abs(dx) <= EPS_AXIS && Math.abs(dy) > EPS_AXIS;
      const horizontal = Math.abs(dy) <= EPS_AXIS && Math.abs(dx) > EPS_AXIS;
      if (!vertical && !horizontal) continue;
      const length = vertical ? Math.abs(dy) : Math.abs(dx);
      if (length < (vertical ? minV : minH)) continue;
      const distance = segmentDistance(at, a, b);
      if (distance > tol) continue;
      const units = traceUnits(vertical ? (a.x + b.x) / 2 : (a.y + b.y) / 2);
      consider(vertical ? 'v' : 'h', units, a, b, length, distance);
    }
  }
  return [...kept.values()].map((k) => k.feature);
}

/** Bordas e centro da área de desenho da folha (mm de papel). */
function sheetFeatures(sheet: Sheet, at: PaperPoint, lang: Lang): SheetAlignFeature[] {
  const inner = sheetInnerBox(sheet);
  const xm = (inner.x0 + inner.x1) / 2;
  const ym = (inner.y0 + inner.y1) / 2;
  const owner: SheetAlignFeature['owner'] = { type: 'sheet' };
  const out: SheetAlignFeature[] = [];
  const edge = t(lang, 'cvs_feat_sheet_edge');
  const centre = t(lang, 'cvs_feat_sheet_center');
  const columns: Array<{ slot: string; x: number; label: string }> = [
    { slot: 'borda0', x: inner.x0, label: edge },
    { slot: 'centro', x: xm, label: centre },
    { slot: 'borda1', x: inner.x1, label: edge },
  ];
  const rows: Array<{ slot: string; y: number; label: string }> = [
    { slot: 'borda0', y: inner.y0, label: edge },
    { slot: 'centro', y: ym, label: centre },
    { slot: 'borda1', y: inner.y1, label: edge },
  ];
  for (const c of columns) {
    out.push(
      feature(
        `folha:v:${c.slot}`,
        c.label,
        'folha',
        { p: { x: c.x, y: ym }, d: { x: 0, y: 1 } },
        owner,
        Math.abs(at.x - c.x),
        { a: { x: c.x, y: inner.y0 }, b: { x: c.x, y: inner.y1 } },
      ),
    );
  }
  for (const r of rows) {
    out.push(
      feature(
        `folha:h:${r.slot}`,
        r.label,
        'folha',
        { p: { x: xm, y: r.y }, d: { x: 1, y: 0 } },
        owner,
        Math.abs(at.y - r.y),
        { a: { x: inner.x0, y: r.y }, b: { x: inner.x1, y: r.y } },
      ),
    );
  }
  return out;
}

/** Prioridade do empate: geometria (modelo e desenho) antes de moldura, e moldura antes de folha. */
const rank = (f: SheetAlignFeature): number => (f.kind === 'moldura' ? 1 : f.kind === 'folha' ? 2 : 0);

/**
 * Todas as feições alinháveis perto do cursor na prancha, ordenadas por distância. O empate respeita a prioridade da
 * geometria, para a face da parede ganhar da moldura que passa por cima dela.
 */
export function sheetAlignFeatures(q: SheetAlignQuery): SheetAlignFeature[] {
  if (!(q.zoom > 0)) return [];
  const prefer = q.prefer ?? 'faces';
  const lang: Lang = q.lang ?? 'pt';
  const tol = TOL_PX / q.zoom;
  const out: SheetAlignFeature[] = [];
  q.sheet.viewports.forEach((vp, i) => {
    // A ordem dos grupos é a das vistas; o último grupo é o mobiliário da folha (fora da captura das vistas).
    const group = i < q.drawList.groups.length - 1 ? q.drawList.groups[i] : undefined;
    out.push(...frameFeatures(vp, q.at, tol, lang));
    out.push(...modelFeatures(q.project, vp, q.at, q.zoom, prefer, lang));
    if (vp.view.kind === 'section' || vp.view.kind === 'areaTable' || vp.view.kind === '3d') {
      out.push(...drawingFeatures(vp, group, q.at, tol, lang));
    }
  });
  out.push(...sheetFeatures(q.sheet, q.at, lang));
  // A distância do modelo vem com atalhos (uma abertura "dentro" do vão vale 0,001 m em qualquer ponto): recalcula no
  // papel e descarta o que está longe do cursor, para a moldura não perder para uma feição que está a metros de distância.
  return out
    .map((f) => ({ ...f, distance: trueDistance(f, q.at) }))
    .filter((f) => f.distance <= tol + 1e-6)
    .sort((a, b) => {
      const d = a.distance - b.distance;
      if (Math.abs(d) > EPS_ALIGNED) return d;
      return rank(a) - rank(b);
    });
}

/** Distância real do cursor à reta da feição (ao segmento, quando há pontas), em mm de papel. */
function trueDistance(f: SheetAlignFeature, at: PaperPoint): number {
  if (f.seg) return segmentDistance(at, f.seg.a, f.seg.b);
  const n = { x: -f.line.d.y, y: f.line.d.x };
  return Math.abs((at.x - f.line.p.x) * n.x + (at.y - f.line.p.y) * n.y);
}

const unit = (d: PaperPoint): PaperPoint | null => {
  const len = Math.hypot(d.x, d.y);
  return len > 1e-9 ? { x: d.x / len, y: d.y / len } : null;
};

/**
 * Delta que leva a reta do alvo até a reta da referência, quando são paralelas. A normal da referência é a esquerda
 * (`(-d.y, d.x)`); a projeção do alvo nela mede o afastamento, e o delta é o oposto — mover o alvo por ele faz as duas
 * retas coincidirem. Retas perpendiculares (ou direções nulas): null.
 */
export function alignDelta(ref: SheetAlignFeature, target: SheetAlignFeature): { dx: number; dy: number } | null {
  const r = unit(ref.line.d);
  const t = unit(target.line.d);
  if (!r || !t) return null;
  if (Math.abs(r.x * t.y - r.y * t.x) > EPS_PARALLEL) return null;
  const n = { x: -r.y, y: r.x };
  const proj = (target.line.p.x - ref.line.p.x) * n.x + (target.line.p.y - ref.line.p.y) * n.y;
  if (Math.abs(proj) < EPS_ALIGNED) return { dx: 0, dy: 0 };
  return { dx: -n.x * proj, dy: -n.y * proj };
}

/** Mesma vista (ou as duas da folha). */
export const sameOwner = (a: SheetAlignFeature, b: SheetAlignFeature): boolean =>
  a.owner.type === 'viewport' && b.owner.type === 'viewport'
    ? a.owner.id === b.owner.id
    : a.owner.type === b.owner.type;
