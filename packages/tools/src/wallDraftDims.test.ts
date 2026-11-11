import { describe, expect, it } from 'vitest';
import { createEmptyProject, floorViewId, makeWall, ProjectStore, viewAnnotationsOf } from '@hestia/model';
import { P, makeEnv, tool } from './testEnv.ts';
import { connectedLineAt } from './anglePreview.ts';

const distanceToLine = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);

describe('cota dinâmica do trecho reto da parede', () => {
  it('com o modo ortogonal, a cota segue o ponto travado e é só comprimento', () => {
    const ctx = makeEnv();
    ctx.options.orthoLock = true;
    const t = tool('wall', ctx.env);
    t.click(P(0, 0));
    t.move(P(3, 1));

    const dims = t.tempDims?.() ?? [];
    expect(dims).toHaveLength(1);
    expect(dims[0]!.key).toBe('wall:draft:length');
    expect(dims[0]!.b).toEqual({ x: 3, y: 0 });
    expect(dims[0]!.value).toBeCloseTo(3);

    // O trecho reto não tem rótulo de comprimento/ângulo: a cota dinâmica é a única medida.
    const labels = t.preview().filter((i) => i.kind === 'label');
    expect(labels.some((l) => l.text.includes('°'))).toBe(false);
    expect(labels).toEqual([]);
  });

  it('ao começar numa parede existente, mostra o menor ângulo sem virar anotação', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } }) });
    const ctx = makeEnv(store);
    const t = tool('wall', ctx.env);
    t.click(P(2, 0));
    t.move(P(2, 1));
    const labels = t.preview().filter((i) => i.kind === 'label');
    expect(labels.some((l) => l.text.includes('90'))).toBe(true);
    expect(viewAnnotationsOf(store.project, floorViewId('lv_0')).dimensions).toHaveLength(0);
  });

  it.each(['wallCenter', 'finishExterior', 'finishInterior'] as const)('a prévia angular vai de eixo a eixo com linha de localização %s', (locationLine) => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, locationLine }) });
    const ctx = makeEnv(store);
    ctx.options.locationLine = locationLine;
    const t = tool('wall', ctx.env);
    t.click(P(2, 0));
    t.move(P(2, 1));

    const arc = t.preview().filter((item): item is { kind: 'line'; a: { x: number; y: number }; b: { x: number; y: number } } => item.kind === 'line');
    expect(arc.length).toBeGreaterThan(2);
    const start = arc[0]!.a;
    const end = arc.at(-1)!.b;
    const previousAxis = connectedLineAt(store.project, 'lv_0', P(2, 0).raw, ctx.env.metersPerPixel())!;
    const band = t.preview().find((item) => item.kind === 'wallBand');
    expect(band?.kind).toBe('wallBand');
    if (band?.kind !== 'wallBand') throw new Error('Faixa da parede em prévia ausente.');
    const dx = band.b.x - band.a.x;
    const dy = band.b.y - band.a.y;
    const length = Math.hypot(dx, dy);
    const offset = { x: (-dy / length) * band.sMid, y: (dx / length) * band.sMid };
    const currentAxisStart = { x: band.a.x + offset.x, y: band.a.y + offset.y };
    const currentAxisEnd = { x: band.b.x + offset.x, y: band.b.y + offset.y };
    expect(distanceToLine(start, previousAxis.a, previousAxis.b)).toBeLessThan(1e-6);
    expect(distanceToLine(end, currentAxisStart, currentAxisEnd)).toBeLessThan(1e-6);

    const label = t.preview().find((item) => item.kind === 'label' && item.text.includes('°'));
    expect(label?.kind === 'label' && label.dimensionStyle).toBe(true);
  });
});
