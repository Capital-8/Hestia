import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Id } from '@hestia/model';
import { validateSketch, type SketchDraft } from '@hestia/geom';
import type { Viewport } from '../viewport.ts';
import { planFrameUpdateOf, resolucaoVazia, type PlanSketch, type PlanViewState } from './planFrame.ts';
import { sketchOps } from './sketch.ts';
import { LIGHT } from './types.ts';

const V: Viewport = { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 };

/** Retângulo de 4 x 3 m, com as quatro linhas soltas (o laço é deduzido pela conexão das pontas). */
const draft: SketchDraft = {
  target: 'floor',
  segs: [
    { id: 's1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
    { id: 's2', a: { x: 4, y: 0 }, b: { x: 4, y: 3 } },
    { id: 's3', a: { x: 4, y: 3 }, b: { x: 0, y: 3 } },
    { id: 's4', a: { x: 0, y: 3 }, b: { x: 0, y: 0 } },
  ],
  selected: [],
  defaults: { definesSlope: true, slopePct: 30, overhang: 0.5 },
};

function estado(levelId: Id, sketch: PlanSketch | null): PlanViewState {
  return {
    project: createEmptyProject('vazio'), version: 1, levelId, v: V, theme: LIGHT, dark: false, gpu: false, showGrid: false,
    showUnderlay: false, showRoofProjection: false, thinLines: false, selection: [], hover: null, preview: [], inference: null,
    resolve: () => resolucaoVazia(levelId), sketch,
  };
}

describe('esboço do perímetro na camada viva da planta', () => {
  const levelId = Object.keys(createEmptyProject('vazio').levels)[0]!;
  const result = validateSketch(draft.segs);

  it('sem esboço, a camada viva não muda; com esboço, leva as operações de sketchOps', () => {
    const sem = planFrameUpdateOf(estado(levelId, null)).live!();
    const com = planFrameUpdateOf(estado(levelId, { draft, result, hover: null })).live!();
    const k = sketchOps(draft, result, LIGHT, V, null);
    expect(com.strokes.length).toBe(sem.strokes.length + k.strokes.length);
    expect(com.fills.length).toBe(sem.fills.length + k.fills.length);
  });

  it('a chave da camada viva muda com o cursor sobre uma linha e com o zoom; a da seleção não', () => {
    const u = planFrameUpdateOf(estado(levelId, { draft, result, hover: null }));
    expect(planFrameUpdateOf(estado(levelId, { draft, result, hover: 's2' })).liveKey).not.toBe(u.liveKey);
    expect(planFrameUpdateOf({ ...estado(levelId, { draft, result, hover: null }), v: { ...V, zoom: 80 } }).liveKey).not.toBe(u.liveKey);
    expect(planFrameUpdateOf({ ...estado(levelId, { draft, result, hover: null }), v: { ...V, zoom: 80 } }).overlayKey).toBe(u.overlayKey);
  });
});
