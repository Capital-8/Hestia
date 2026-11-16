import { describe, expect, it } from 'vitest';
import { orientedRect } from '@hestia/geom';
import { meshStats, openingTilt } from './openingTilt.spike.ts';

const TH = (15 * Math.PI) / 180;
const T = 0.2;
const janela = (mode: 'inclinado' | 'vertical', theta = TH) => openingTilt({ mode, theta, t: T, w: 1.2, h: 1.0, s: 1.0, center: 2 });
const porta = (mode: 'inclinado' | 'vertical', theta = TH) => openingTilt({ mode, theta, t: T, w: 0.9, h: 2.1, s: 0, center: 2 });

describe('S4 abertura em parede inclinada (tabela do documento)', () => {
  it('janela 1,2x1,0 s=1,0 inclinada', () => {
    const r = janela('inclinado');
    expect(r.topZ).toBeCloseTo(1.9659, 4);
    expect(r.frameShift).toBeCloseTo(0.3974, 4);
    expect(r.removedVolume).toBeCloseTo(0.24, 4);
    const m = meshStats(r.mesh);
    expect(r.wallVolume - m.volume).toBeCloseTo(0.24, 4);
  });
  it('porta 0,9x2,1 s=0 vertical', () => {
    const r = porta('vertical');
    expect(r.horizontalDepth).toBeCloseTo(0.7697, 4);
    expect(r.removedVolume).toBeCloseTo(0.3913, 4);
    expect(r.frameShift).toBeCloseTo(0.2813, 4);
    expect(r.frame.origin[1]).toBeCloseTo(0.2813, 4);
    const m = meshStats(r.mesh);
    expect(r.wallVolume - m.volume).toBeCloseTo(0.3913, 4);
  });
  it('parede menos corte e malha fechada (os dois modos, janela e porta)', () => {
    for (const mode of ['inclinado', 'vertical'] as const) for (const f of [janela, porta]) {
      expect(meshStats(f(mode).mesh).closed).toBe(true);
    }
  });
  it('theta=0: os dois modos dao o mesmo corte, igual ao retangulo atual (openingRect, folga 0,02)', () => {
    const a = openingTilt({ mode: 'inclinado', theta: 0, t: T, w: 0.9, h: 2.1, s: 0, center: 2, margin: 0.02 });
    const b = openingTilt({ mode: 'vertical', theta: 0, t: T, w: 0.9, h: 2.1, s: 0, center: 2, margin: 0.02 });
    expect(a.cutter).toEqual(b.cutter);
    expect(a.removedVolume).toBeCloseTo(0.9 * 2.1 * 0.2, 9);
    const atual = orientedRect(2, 0, 1, 0, 0.45, T / 2 + 0.02);
    const ys = a.cutter.front.concat(a.cutter.back).map((p) => p[1]);
    const xs = a.cutter.front.map((p) => p[0]);
    const poly = atual as unknown as { x: number; y: number }[];
    const px = poly.map((p) => p.x), py = poly.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(Math.min(...px), 9);
    expect(Math.max(...xs)).toBeCloseTo(Math.max(...px), 9);
    expect(Math.min(...ys)).toBeCloseTo(Math.min(...py), 9);
    expect(Math.max(...ys)).toBeCloseTo(Math.max(...py), 9);
  });
  it('recuo >= 0 nas quatro bordas: passa no modo inclinado e nas laterais do vertical', () => {
    for (const f of [janela, porta]) {
      const r = f('inclinado').reveal;
      for (const v of [r.left, r.right, r.bottom, r.top]) expect(v).toBeGreaterThanOrEqual(-1e-9);
      const q = f('vertical').reveal;
      expect(q.left).toBeGreaterThanOrEqual(-1e-9);
      expect(q.right).toBeGreaterThanOrEqual(-1e-9);
    }
  });
  it('FALHA DO CRITERIO no modo vertical: caixilho no plano central fica fora da face em baixo e em cima', () => {
    // t/(2cosθ) − (h/2)·tanθ: porta −0,1778; janela −0,0304 (valor negativo = o plano do caixilho sai da parede)
    const d = porta('vertical').reveal;
    expect(d.bottom).toBeCloseTo(-0.1778, 4);
    expect(d.top).toBeCloseTo(-0.1778, 4);
    expect(janela('vertical').reveal.bottom).toBeCloseTo(-0.0304, 4);
  });
});
