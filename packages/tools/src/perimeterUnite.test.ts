import { describe, expect, it } from 'vitest';
import { polygonArea } from '@hestia/geom';
import { PerimeterTool } from './perimeterTool.ts';
import { unirFormas } from './perimeterUnite.ts';
import { addSegs, newDraft, type NewSeg } from './perimeterSession.ts';
import { clickAt, makeEnv } from './testEnv.ts';

const rect = (x0: number, y0: number, x1: number, y1: number): NewSeg[] => [
  { a: { x: x0, y: y0 }, b: { x: x1, y: y0 } },
  { a: { x: x1, y: y0 }, b: { x: x1, y: y1 } },
  { a: { x: x1, y: y1 }, b: { x: x0, y: y1 } },
  { a: { x: x0, y: y1 }, b: { x: x0, y: y0 } },
];

describe('Unir formas', () => {
  it('dois retângulos 4x4 em (0,0) e (2,2) viram 1 contorno de 8 vértices e área 28', () => {
    const r = unirFormas(addSegs(newDraft('mass'), [...rect(0, 0, 4, 4), ...rect(2, 2, 6, 6)]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.before).toBe(2);
    expect(r.after).toBe(1);
    expect(r.area).toBeCloseTo(28, 9);
    expect(r.draft.segs).toHaveLength(8);
  });

  it('formas disjuntas: recusa "none" e o rascunho não muda', () => {
    expect(unirFormas(addSegs(newDraft('mass'), [...rect(0, 0, 2, 2), ...rect(5, 5, 7, 7)]))).toEqual({ ok: false, reason: 'none' });
  });

  it('uma forma só: recusa "few"', () => {
    expect(unirFormas(addSegs(newDraft('mass'), rect(0, 0, 2, 2)))).toEqual({ ok: false, reason: 'few' });
  });

  it('duas sobrepostas + uma solta: recusa "separate"', () => {
    expect(unirFormas(addSegs(newDraft('mass'), [...rect(0, 0, 4, 4), ...rect(2, 2, 6, 6), ...rect(20, 20, 22, 22)]))).toEqual({ ok: false, reason: 'separate' });
  });

  it('pela ferramenta: dois polígonos de 6 lados sobrepostos, união = 1 passo; Ctrl+Z (undoDraft) devolve as 12 linhas; Concluir fica ok', () => {
    const { env } = makeEnv();
    const t = new PerimeterTool(env, 'mass');
    t.start();
    t.setShape('inscribedPolygon');
    clickAt(t, 0, 0); clickAt(t, 2, 0);
    clickAt(t, 1.1, 0.5); clickAt(t, 3.1, 0.5);
    expect(t.draft().segs).toHaveLength(12);
    expect(t.closeInfo().ok).toBe(false);
    expect(t.uniteShapes()).toBe(true);
    expect(t.closeInfo().ok).toBe(true);
    const ring = t.closeInfo().loops[0]!.ring;
    // hexágono de raio 2 (área 6*sqrt(3)/4*4 = 10,3923) e o de centro (1,1;0,5): união entre 10,39 e 20,78
    const area = Math.abs(polygonArea([ring]));
    expect(area).toBeGreaterThan(10.39);
    expect(area).toBeLessThan(20.79);
    expect(t.undoDraft()).toBe(true);
    expect(t.draft().segs).toHaveLength(12);
  });
});
