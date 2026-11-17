import { describe, expect, it } from 'vitest';
import { openingPlaneOf } from '@hestia/model';
import { inclinedFitsArc, openingTiltGeom, tiltCutZ, type TiltCut } from './openingTilt.ts';
import { openingTilt as spike } from './openingTilt.spike.ts';

const TH = (15 * Math.PI) / 180;
const janela = { theta: TH, t: 0.2, w: 1.2, h: 1.0, s: 1.0 };
const porta = { theta: TH, t: 0.2, w: 0.9, h: 2.1, s: 0 };

describe('F2.8: geometria do vão em parede inclinada (valores do S4)', () => {
  it('janela inclinada: topo 1,9659, deslocamento 0,3974, volume 0,2400', () => {
    const r = openingTiltGeom({ ...janela, plane: 'inclinado' });
    expect(r.topZ).toBeCloseTo(1.9659, 4);
    expect(r.frameShift).toBeCloseTo(0.3974, 4);
    expect(r.removedVolume).toBeCloseTo(0.24, 4);
  });
  it('porta vertical: profundidade 0,7697, volume 0,3913, plano 0,2813', () => {
    const r = openingTiltGeom({ ...porta, plane: 'vertical' });
    expect(r.horizontalDepth).toBeCloseTo(0.7697, 4);
    expect(r.removedVolume).toBeCloseTo(0.3913, 4);
    expect(r.frameShift).toBeCloseTo(0.2813, 4);
  });
  it('confere com o spike aprovado (valores comuns)', () => {
    for (const [i, mode] of [[janela, 'inclinado'], [janela, 'vertical'], [porta, 'inclinado'], [porta, 'vertical']] as const) {
      const a = openingTiltGeom({ ...i, plane: mode });
      const b = spike({ mode, theta: i.theta, t: i.t, w: i.w, h: i.h, s: i.s });
      expect(a.topZ).toBeCloseTo(b.topZ, 9);
      expect(a.frameShift).toBeCloseTo(b.frameShift, 9);
      expect(a.horizontalDepth).toBeCloseTo(b.horizontalDepth, 9);
      expect(a.removedVolume).toBeCloseTo(b.removedVolume, 9);
    }
  });
  it('recuo ≥ 0 nas quatro bordas nos dois modos (vertical ancorado na face)', () => {
    for (const i of [janela, porta]) for (const plane of ['inclinado', 'vertical'] as const) {
      for (const sign of [1, -1]) {
        const r = openingTiltGeom({ ...i, theta: sign * i.theta, plane }).reveal;
        for (const v of [r.left, r.right, r.bottom, r.top]) expect(v).toBeGreaterThanOrEqual(0);
      }
    }
    const v = openingTiltGeom({ ...porta, plane: 'vertical' });
    expect(v.reveal.bottom).toBe(0);
    expect(v.reveal.top).toBeCloseTo(0.5627, 4);
    expect(v.overhang).toBeCloseTo(0.356, 3);
    expect(v.frame.origin[1]).toBeCloseTo(0.1035, 4);
  });
  it('θ=0: os dois modos dão exatamente o mesmo corte', () => {
    const a = openingTiltGeom({ ...porta, theta: 0, plane: 'inclinado' });
    const b = openingTiltGeom({ ...porta, theta: 0, plane: 'vertical' });
    expect(a.topZ).toBe(b.topZ);
    expect(a.removedVolume).toBeCloseTo(b.removedVolume, 12);
    expect(a.horizontalDepth).toBeCloseTo(b.horizontalDepth, 12);
    const cut: TiltCut = { cx: 0, cy: 0, ux: 1, uy: 0, nx: 0, ny: 1, halfW: 0.45, halfD: 0.12, z0: 0, z1: 2.1, sn: 0, cs: 1 };
    expect(tiltCutZ([cut], 0.1, 0.1, 2.1)).toBe(2.1);
  });
  it('limite do arco w² ≤ 0,4·R; plano padrão: janela inclinado, porta vertical', () => {
    expect(inclinedFitsArc(1.2, 3.6)).toBe(true);
    expect(inclinedFitsArc(1.2, 3.5)).toBe(false);
    expect(inclinedFitsArc(0.9, 2.0)).toBe(false);
    expect(inclinedFitsArc(0.9, 2.1)).toBe(true);
    expect(inclinedFitsArc(5)).toBe(true);
    expect(openingPlaneOf({ kind: 'window' })).toBe('inclinado');
    expect(openingPlaneOf({ kind: 'door' })).toBe('inclinado'); // P1: porta segue a parede
    expect(openingPlaneOf({ kind: 'door', plano: 'inclinado' })).toBe('inclinado');
  });
});
