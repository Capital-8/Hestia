import type { Vec2 } from '@hestia/geom';
import { mix } from '../plan/color.ts';
import type { PlanDrawList, PlanTheme } from '../plan/types.ts';
import { hatchPartsOf } from './hatch.ts';
import type { SheetPoint, ViewportParts } from './types.ts';
import type { SheetViewport } from '@hestia/model';
import { viewportAnchor } from '@hestia/model';

type VpBox = Pick<SheetViewport, 'at' | 'size' | 'scale'> & Partial<Pick<SheetViewport, 'offset' | 'anchor'>>;
type ToPaperBox = Pick<SheetViewport, 'at' | 'size'> & Partial<Pick<SheetViewport, 'offset' | 'anchor'>>;

/**
 * Conversão do mundo (m) e das listas de desenho da tela para a folha (mm de papel). A vista é montada com zoom
 * `1e6 / escala`, de modo que 1 mm de papel vale 1000 px: a largura de linha vira `px / 1000` sem o mínimo de 1 px do
 * `paperMmToPx`, e a escala da vista (1:S) sai certa sem outra conta.
 */
export const SHEET_PX_PER_MM = 1000;
/** Altura padrão do texto de rótulos sem tamanho próprio (mm de papel). */
export const LABEL_MM = 2.5;
/** Deslocamento de rótulo em px de tela (96 dpi) convertido para mm de papel. */
const SCREEN_PX_MM = 25.4 / 96;
const WHITE = '#ffffff';

/** Centro da caixa do conteúdo, no mundo: a vista é centrada nele (a prancha não tem deslocamento de vista). */
export interface ViewMapping {
  /** Zoom da lista de desenho: px por metro. */
  zoom: number;
  /** Caixa da vista na tela (px), igual à caixa de papel × SHEET_PX_PER_MM. */
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** mm de papel por metro. */
  k: number;
}

export function viewMappingOf(v: Pick<VpBox, 'size' | 'scale'>, centre: Vec2): ViewMapping {
  return {
    zoom: (SHEET_PX_PER_MM * 1000) / v.scale,
    width: v.size.w * SHEET_PX_PER_MM,
    height: v.size.h * SHEET_PX_PER_MM,
    cx: centre.x,
    cy: centre.y,
    k: 1000 / v.scale,
  };
}

/**
 * Mundo → folha: o centro do desenho cai na âncora da vista (mm de papel). A âncora é o que permite redimensionar a
 * caixa sem mover o desenho; sem ela, vale o centro da caixa mais o `offset` (arquivos antigos).
 */
export const toPaper = (vp: ToPaperBox, m: ViewMapping) => {
  const a = viewportAnchor(vp);
  return (q: Vec2): SheetPoint => ({
    x: a.x + (q.x - m.cx) * m.k,
    y: a.y + (q.y - m.cy) * m.k,
  });
};

/** Ponto de rótulo com deslocamento de tela: a tela tem y para baixo, o papel para cima. */
const shifted = (p: SheetPoint, dx: number, dy: number): SheetPoint => ({ x: p.x + dx * SCREEN_PX_MM, y: p.y - dy * SCREEN_PX_MM });

/** Cor da tinta de uma lista (texto, traços) com a transparência já misturada ao branco do papel. */
const inkOf = (color: string, alpha: number): string => (alpha >= 1 ? color : mix(WHITE, color, Math.max(0, alpha)));

/** Converte a lista de desenho (mundo + px) para as partes da folha (mm de papel). `theme` dá a cor do texto. */
export function partsOf(list: PlanDrawList, to: (q: Vec2) => SheetPoint, theme: PlanTheme): ViewportParts {
  // Cada preenchimento com hachura vira o próprio preenchimento mais as partes da hachura (B6), na mesma ordem.
  const filled = list.fills.map((f) => {
    const polygons = f.polygons.map((poly) => poly.map((ring) => ring.map(to)));
    const base = { polygons, color: inkOf(f.color, f.alpha) };
    if (!f.hatch) return { fills: [base], paths: [] };
    const hatch = hatchPartsOf(polygons, f.hatch.kind, inkOf(f.hatch.color, f.hatch.alpha ?? 1), f.hatch.papel);
    return { fills: [base, ...hatch.fills], paths: hatch.paths };
  });
  const fills = filled.flatMap((f) => f.fills);
  const paths = [...filled.flatMap((f) => f.paths), ...list.strokes.map((s) => ({
    pts: s.pts.map(to),
    closed: s.closed,
    // Traço com espessura de papel (`papel`): o `widthPx` da vista da folha já é mm × 1000. Traço sem ela (e todo tracejado)
    // é medido em pixels de tela: vale 96 dpi, como os deslocamentos de rótulo, e não px / 1000 (um fio de 0,001 mm e um
    // tracejado de 0,01 mm, que saía contínuo no PDF).
    widthMm: s.papel ? s.widthPx / SHEET_PX_PER_MM : s.widthPx * SCREEN_PX_MM,
    color: inkOf(s.color, s.alpha),
    ...(s.dash ? { dashMm: [s.dash[0] * SCREEN_PX_MM, s.dash[1] * SCREEN_PX_MM] as [number, number] } : {}),
  }))];
  const texts = list.labels.map((l) => {
    const base = to(l.at);
    const at = l.dx !== undefined || l.dy !== undefined ? shifted(base, l.dx ?? 0, l.dy ?? 0) : base;
    return {
      at,
      text: l.text,
      sizeMm: l.fontPx !== undefined ? l.fontPx / SHEET_PX_PER_MM : LABEL_MM,
      rotation: -(l.rotation ?? 0),
      center: l.center === true,
      color: l.tone === 'soft' ? mix(theme.ink, theme.bg, 0.45) : theme.ink,
    };
  });
  return { fills, paths, texts };
}

