import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import type { PreviewItem } from '@hestia/tools';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { previewOverlay, snapTooltipLabel } from './overlay.ts';
import { buildPlanHoverOverlay } from './planOverlay.ts';
import { AVISO, AVISO_ALPHA } from '../aviso.ts';
import { DARK, LIGHT, type PlanTheme } from './types.ts';
import type { Viewport } from '../viewport.ts';

const VIEW: Viewport = { cx: 0, cy: 0, zoom: 100, width: 800, height: 600 };
const A = { x: 0, y: 0 };
const B = { x: 1, y: 0 };
const RING = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];
const noHighlight = () => [];

/** Um item de cada tom da escada, na ordem: limite, espelho, caminhada, patamar e degrau calculado. */
const TONED: PreviewItem[] = [
  { kind: 'line', a: A, b: B, tone: 'boundary' },
  { kind: 'line', a: A, b: B, tone: 'riser' },
  { kind: 'line', a: A, b: B, tone: 'path' },
  { kind: 'polygon', ring: RING, tone: 'landing' },
  { kind: 'polygon', ring: RING, tone: 'tread' },
];

/** Cor do traço (ou do preenchimento, se o item só tem polígono) de cada item, na ordem. */
function colorsOf(items: PreviewItem[], theme: PlanTheme): string[] {
  const ov = previewOverlay(items, theme, noHighlight);
  return items.map((_, i) => {
    const stroke = ov.strokes[i];
    return stroke?.color ?? '';
  });
}

describe('prévia da escada por tom (decisão 0011 · interface)', () => {
  for (const [name, theme] of [
    ['tema claro', LIGHT],
    ['tema escuro', DARK],
  ] as const) {
    it(`${name}: cada tom tem cor própria, distinta das demais e da cor de destaque`, () => {
      const colors = colorsOf(TONED, theme);
      expect(colors).toEqual([theme.stairBoundary, theme.stairRiser, theme.stairPath, theme.stairLanding, theme.stairTread]);
      expect(new Set(colors).size).toBe(TONED.length);
      expect(colors).not.toContain(theme.accent);
    });
  }

  it('os degraus calculados saem translúcidos, com contorno fino', () => {
    const ov = previewOverlay([TONED[4]!], LIGHT, noHighlight);
    expect(ov.fills[0]).toMatchObject({ color: LIGHT.stairTread, alpha: 0.2 });
    expect(ov.strokes[0]).toMatchObject({ closed: true, widthPx: 1, color: LIGHT.stairTread });
  });

  it('itens sem tom saem exatamente como antes (cor de destaque, mesmos traços e alfas)', () => {
    const ov = previewOverlay([{ kind: 'line', a: A, b: B }, { kind: 'polygon', ring: RING }], LIGHT, noHighlight);
    expect(ov.strokes[0]).toEqual({ pts: [A, B], closed: false, widthPx: 1.5, color: LIGHT.accent, alpha: 0.95, dash: undefined });
    expect(ov.fills[0]).toEqual({ polygons: [[RING]], color: LIGHT.accent, alpha: 0.14 });
    expect(ov.strokes[1]).toEqual({ pts: RING, closed: true, widthPx: 1.5, color: LIGHT.accent, alpha: 0.95, dash: undefined });
  });

  it('cota do Medir (halo): contorno claro por baixo e traço mais grosso na cor de destaque', () => {
    const ov = previewOverlay([{ kind: 'line', a: A, b: B, halo: true }], DARK, noHighlight);
    expect(ov.strokes).toHaveLength(2);
    expect(ov.strokes[0]).toMatchObject({ widthPx: 4.5, color: '#ffffff' });
    expect(ov.strokes[1]).toMatchObject({ widthPx: 2.25, color: DARK.accent });
  });

  it('o PlanDrawList da prévia leva as cores por tom e mantém a cor de destaque nos itens sem tom', () => {
    const p = createEmptyProject();
    const input: PlanInput = {
      project: p,
      levelId: 'lv_0',
      resolved: resolveLevel(p, 'lv_0', new Map()),
      below: null,
      viewport: VIEW,
      theme: LIGHT,
      dark: false,
      selection: [],
      hover: null,
      preview: [...TONED, { kind: 'line', a: A, b: B }],
      inference: null,
      showGrid: false,
    };
    const dl = buildPlanDrawList(input);
    const colors = new Set(dl.strokes.map((s) => s.color));
    for (const c of [LIGHT.stairBoundary, LIGHT.stairRiser, LIGHT.stairPath, LIGHT.stairLanding, LIGHT.stairTread, LIGHT.accent]) {
      expect(colors.has(c)).toBe(true);
    }
    expect(dl.strokes.filter((s) => s.color === LIGHT.accent && s.widthPx === 1.5 && s.pts.length === 2)).toHaveLength(1);
  });

  it('snapTooltipLabel gera rótulo flutuante para capturas geométricas', () => {
    const pt = { x: 10, y: 20 };
    expect(snapTooltipLabel({ point: pt, kind: 'endpoint', guides: [] })).toEqual({
      at: pt,
      text: 'Extremidade',
      dx: 12,
      dy: -12,
      tone: 'accent',
    });
    expect(snapTooltipLabel({ point: pt, kind: 'midpoint', guides: [] })?.text).toBe('Ponto médio');
    expect(snapTooltipLabel({ point: pt, kind: 'alignment', guides: [] })?.text).toBe('Alinhamento');
    expect(snapTooltipLabel({ point: pt, kind: 'none', guides: [] })).toBeNull();
    expect(snapTooltipLabel({ point: pt, kind: 'grid', guides: [] })).toBeNull();
  });
});

describe('realce do aviso (decisão 0044)', () => {
  it('a parede em conflito sai em amarelo, com preenchimento e contorno, na camada de hover', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    const p = store.project;
    const input: PlanInput = {
      project: p,
      levelId: 'lv_0',
      resolved: resolveLevel(p, 'lv_0', new Map()),
      below: null,
      viewport: VIEW,
      theme: LIGHT,
      dark: false,
      selection: [],
      hover: null,
      aviso: 'w1',
      preview: [],
      inference: null,
      showGrid: false,
    };
    const com = buildPlanHoverOverlay(input);
    expect(com.fills.some((f) => f.color === AVISO && f.alpha === AVISO_ALPHA)).toBe(true);
    expect(com.strokes.some((s) => s.color === AVISO && s.widthPx === 2.5)).toBe(true);
    const sem = buildPlanHoverOverlay({ ...input, aviso: null });
    expect(sem.fills).toHaveLength(0);
    expect(sem.strokes).toHaveLength(0);
  });
});
