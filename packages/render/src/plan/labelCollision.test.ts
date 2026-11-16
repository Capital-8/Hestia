import { describe, expect, it } from 'vitest';
import { separateAutoLabels } from './labelCollision.ts';
import type { LabelOp } from './types.ts';

describe('anti-colisão de etiquetas automáticas', () => {
  it('afasta duas etiquetas automáticas sobrepostas', () => {
    const labels: LabelOp[] = [
      { at: { x: 2, y: 2 }, text: 'P01', auto: true, papel: { escala: 100, fontMm: 1.6 } },
      { at: { x: 2, y: 2 }, text: 'J01', auto: true, papel: { escala: 100, fontMm: 1.6 } },
    ];
    const moved = separateAutoLabels(labels, 100);
    expect(moved).toBe(2);
    const dist = Math.hypot(labels[0]!.at.x - labels[1]!.at.x, labels[0]!.at.y - labels[1]!.at.y);
    expect(dist).toBeGreaterThan(0.1);
  });

  it('mantém parada a etiqueta posicionada pelo usuário e move apenas a automática', () => {
    const labels: LabelOp[] = [
      { at: { x: 5, y: 3 }, text: 'P01', papel: { escala: 100, fontMm: 1.6 }, badge: { shape: 'circle', fill: true } },
      { at: { x: 5, y: 3 }, text: 'WT-14', auto: true, papel: { escala: 100, fontMm: 1.6 } },
    ];
    const moved = separateAutoLabels(labels, 100);
    expect(moved).toBe(1);
    expect(labels[0]!.at).toEqual({ x: 5, y: 3 });
    expect(Math.hypot(labels[1]!.at.x - 5, labels[1]!.at.y - 3)).toBeGreaterThan(0.1);
  });
});
