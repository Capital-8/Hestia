import { arcFromSagitta, arcSample, orientedRect, perp, sub, norm, add, mul, type Vec2 } from '@hestia/geom';
import type { Project } from '@hestia/model';
import type { Guide, Inference, PreviewItem, PreviewTone } from '@hestia/tools';
import { sectionMarkOps } from './sectionMarks.ts';
import type { FillOp, LabelOp, PlanTheme, StrokeOp } from './types.ts';
import { cantosDoQuadrado, tracoEm } from './marcadores.ts';
import { t, type DictKey, type Lang } from '../i18n.ts';

export interface Overlay {
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
}

const P = (x: number, y: number): Vec2 => ({ x, y });

/** Meio lado do marcador de captura, em pixels de tela. */
const CAPTURA_PX = 6;

/**
 * Marcador de captura: a forma diz qual regra foi usada (extremidade, meio, interseção…). É um marcador em pixels
 * ancorado no ponto capturado (ver `marcadores.ts`): tem o mesmo tamanho na tela para qualquer zoom.
 */
export function snapMarker(inf: Inference, theme: PlanTheme): StrokeOp[] {
  const c = inf.point;
  const h = CAPTURA_PX;
  const mk = (offs: Vec2[], closed: boolean): StrokeOp => ({ ...tracoEm(c, offs, closed), widthPx: 2, color: theme.accent, alpha: 1 });
  const fino = (offs: Vec2[]): StrokeOp => ({ ...tracoEm(c, offs, false), widthPx: 1.2, color: theme.accent, alpha: 0.9 });
  switch (inf.kind) {
    case 'endpoint':
      return [mk(cantosDoQuadrado(h), true)];
    case 'face':
      // Canto de face: quadrado com ponto central (diferencia do extremo do eixo).
      return [mk(cantosDoQuadrado(h), true), mk([P(-h * 0.2, 0), P(h * 0.2, 0)], false)];
    case 'core':
      return [mk([P(0, -h * 1.2), P(h * 1.2, 0), P(0, h * 1.2), P(-h * 1.2, 0)], true)];
    case 'midpoint':
      return [mk([P(-h, -h), P(h, -h), P(0, h)], true)];
    case 'intersection':
      return [mk([P(-h, -h), P(h, h)], false), mk([P(-h, h), P(h, -h)], false)];
    case 'perpendicular':
      return [mk([P(-h, h), P(-h, -h), P(h, -h)], false)];
    case 'nearest':
      return [mk([P(-h * 0.8, -h), P(h * 0.8, -h), P(-h * 0.8, h), P(h * 0.8, h)], true)];
    case 'alignment':
      return [mk([P(-h * 0.7, -h * 0.7), P(h * 0.7, h * 0.7)], false), mk([P(-h * 0.7, h * 0.7), P(h * 0.7, -h * 0.7)], false)];
    case 'center':
      return [mk(cantosDoQuadrado(h * 0.5), true), mk([P(-h, 0), P(h, 0)], false), mk([P(0, -h), P(0, h)], false)];
    case 'tangent':
      return [mk([P(-h, h), P(h, h)], false), mk([P(0, h), P(0, -h * 0.6)], false)];
    case 'grid':
      return [fino([P(-h * 0.6, 0), P(h * 0.6, 0)]), fino([P(0, -h * 0.6), P(0, h * 0.6)])];
    case 'polar':
      return [fino([P(-h * 0.8, 0), P(h * 0.8, 0)]), fino([P(-h * 0.3, -h * 0.3), P(h * 0.3, h * 0.3)])];
    default:
      return [];
  }
}

/** Chave do tooltip de captura por tipo de inferência. */
const SNAP_TOOLTIP_KEYS: Record<string, DictKey> = {
  endpoint: 'rn_snap_endpoint',
  face: 'rn_snap_face',
  core: 'rn_snap_core',
  midpoint: 'rn_snap_midpoint',
  intersection: 'rn_snap_intersection',
  perpendicular: 'rn_snap_perpendicular',
  nearest: 'rn_snap_nearest',
  alignment: 'rn_snap_alignment',
  ortho: 'rn_snap_ortho',
  polar: 'rn_snap_polar',
  center: 'rn_snap_center',
  tangent: 'rn_snap_tangent',
};

/** Nome do hospedeiro no tooltip: `parede 04` (PT) / `wall 04` (EN). */
const hostName = (mark: string | undefined, lang: Lang): string =>
  mark ? t(lang, 'rn_snap_host_wall_mark', { mark }) : t(lang, 'rn_snap_host_wall');

/** Rótulo flutuante junto ao cursor com a captura ativa (AutoCAD / Revit Snap Tooltip). */
export function snapTooltipLabel(inf: Inference, p?: Project, lang: Lang = 'pt'): LabelOp | null {
  if (inf.kind === 'none' || inf.kind === 'grid') return null;
  const key = SNAP_TOOLTIP_KEYS[inf.kind];
  if (!key) return null;
  const base = t(lang, key);
  // Nome da parede de origem, quando a captura é de uma parede (S-tooltip): ajuda a saber qual elemento foi capturado.
  const host = inf.hostId && p ? p.elements[inf.hostId] : undefined;
  const name = host && host.kind === 'wall' ? hostName(host.mark, lang) : null;
  const text = name ? `${base} · ${name}` : base;
  return {
    at: inf.point,
    text,
    dx: 12,
    dy: -12,
    tone: 'accent',
  };
}

export function guideStrokes(guides: Guide[], theme: PlanTheme): StrokeOp[] {
  return guides.map((g) => ({
    pts: [g.from, g.to],
    closed: false,
    widthPx: 1.2,
    color: g.kind === 'perpendicular' ? theme.accent : theme.guide,
    alpha: 0.95,
    dash: [6, 4] as [number, number],
  }));
}

function bandRing(a: Vec2, b: Vec2, thickness: number, sMid: number, sag = 0): Vec2[] {
  const arc = arcFromSagitta(a, b, sag);
  if (arc) {
    const lo = arcSample(arc, 0, arc.length, sMid - thickness / 2);
    const hi = arcSample(arc, arc.length, 0, sMid + thickness / 2);
    return [...lo, ...hi];
  }
  const u = norm(sub(b, a));
  const n = perp(u);
  const lo = sMid - thickness / 2;
  const hi = sMid + thickness / 2;
  const p = (base: Vec2, s: number): Vec2 => add(base, mul(n, s));
  return [p(a, lo), p(b, lo), p(b, hi), p(a, hi)];
}

/** Cor de um tom da prévia; sem tom, a cor de destaque da ferramenta. `invalid` é a abertura sem espaço (vermelho). */
export function toneColor(tone: PreviewTone | undefined, theme: PlanTheme): string {
  switch (tone) {
    case 'invalid':
      return '#dc2626';
    case 'boundary':
      return theme.stairBoundary;
    case 'riser':
      return theme.stairRiser;
    case 'path':
      return theme.stairPath;
    case 'landing':
      return theme.stairLanding;
    case 'tread':
      return theme.stairTread;
    default:
      return theme.accent;
  }
}

/** Pré-visualização da ferramenta ativa. Itens com tom (escada) usam a cor do tom; os demais, a de destaque. */
export function previewOverlay(items: PreviewItem[], theme: PlanTheme, highlight: (ids: string[]) => FillOp[]): Overlay {
  const o: Overlay = { fills: [], strokes: [], labels: [] };
  for (const it of items) {
    switch (it.kind) {
      case 'line':
        // Cota do Medir (halo): contorno claro por baixo e traço mais grosso, para aparecer sobre a hachura.
        if (it.halo) o.strokes.push({ pts: [it.a, it.b], closed: false, widthPx: 4.5, color: '#ffffff', alpha: 0.85 });
        o.strokes.push({ pts: [it.a, it.b], closed: false, widthPx: it.halo ? 2.25 : 1.5, color: toneColor(it.tone, theme), alpha: 0.95, dash: it.dashed ? [7, 5] : undefined });
        break;
      case 'polygon':
        if (it.tone === 'tread') {
          // Degraus calculados: preenchimento translúcido e contorno fino, sem competir com os limites e espelhos.
          o.fills.push({ polygons: [[it.ring]], color: theme.stairTread, alpha: 0.2 });
          o.strokes.push({ pts: it.ring, closed: true, widthPx: 1, color: theme.stairTread, alpha: 0.9, dash: it.dashed ? [7, 5] : undefined });
          break;
        }
        o.fills.push({ polygons: [[it.ring]], color: toneColor(it.tone, theme), alpha: 0.14 });
        o.strokes.push({ pts: it.ring, closed: true, widthPx: 1.5, color: toneColor(it.tone, theme), alpha: 0.95, dash: it.dashed ? [7, 5] : undefined });
        break;
      case 'wallBand': {
        const ring = bandRing(it.a, it.b, it.thickness, it.sMid, it.sag);
        const arcAxis = arcFromSagitta(it.a, it.b, it.sag ?? 0);
        const axis = arcAxis ? arcSample(arcAxis, 0, arcAxis.length) : [it.a, it.b];
        o.fills.push({ polygons: [[ring]], color: theme.accent, alpha: 0.18 });
        o.strokes.push({ pts: ring, closed: true, widthPx: 1.5, color: theme.accent, alpha: 0.95 });
        o.strokes.push({ pts: axis, closed: false, widthPx: 1, color: theme.accent, alpha: 0.7, dash: [8, 5] });
        break;
      }
      case 'label':
        if (it.dimensionStyle) o.labels.push({ at: it.at, text: it.text, fontPx: 11, center: true, rotation: it.rotation, color: theme.accent, appearance: 'dimension-preview' });
        else o.labels.push({ at: it.at, text: it.text, dx: 10, dy: -14, tone: 'accent' });
        break;
      case 'point':
        o.strokes.push({ ...tracoEm(it.at, cantosDoQuadrado(3), true), widthPx: 1.5, color: theme.accent, alpha: 1 });
        break;
      case 'highlight':
        o.fills.push(...highlight(it.ids));
        break;
      case 'sectionLine': {
        const m = sectionMarkOps(it, theme);
        o.fills.push(...m.fills);
        o.strokes.push(...m.strokes);
        o.labels.push(...m.labels);
        break;
      }
    }
  }
  return o;
}

export { orientedRect };
