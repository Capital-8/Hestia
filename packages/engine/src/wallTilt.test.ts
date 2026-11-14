import { describe, it, expect } from 'vitest';
import {
  tiltOffset, thicknessHorizontal, axisAtLevel, axisLengthAtLevel, volumeStraight, faceAreaStraight,
  volumeArc, faceAreaArc, tiltValid, arcTiltSide,
} from './wallTilt';

const t = 0.2, H = 3, PHI = Math.PI / 2;

describe('wallTilt: tabela 4.2', () => {
  it('reta 15 graus', () => {
    expect(tiltOffset(H, 15)).toBeCloseTo(0.8038, 4);
    expect(thicknessHorizontal(t, 15)).toBeCloseTo(0.2071, 4);
    expect(volumeStraight({ L: 4, H, t, tiltDeg: 15 })).toBeCloseTo(2.4847, 4);
    expect(faceAreaStraight({ L: 4, H, t, tiltDeg: 15 })).toBeCloseTo(12.4233, 4);
  });
  it('reta 30 graus', () => {
    expect(tiltOffset(H, 30)).toBeCloseTo(1.7321, 4);
    expect(thicknessHorizontal(t, 30)).toBeCloseTo(0.2309, 4);
    expect(volumeStraight({ L: 4, H, t, tiltDeg: 30 })).toBeCloseTo(2.7713, 4);
    expect(faceAreaStraight({ L: 4, H, t, tiltDeg: 30 })).toBeCloseTo(13.8564, 4);
  });
  it('arco afastando e aproximando', () => {
    expect(volumeArc({ R: 5, phi: PHI, H, t, tiltDeg: 15, s: 1 })).toBeCloseTo(5.2708, 4);
    expect(faceAreaArc({ R: 5, phi: PHI, H, tiltDeg: 15, s: 1 })).toBeCloseTo(26.354, 4);
    expect(volumeArc({ R: 5, phi: PHI, H, t, tiltDeg: 15, s: -1 })).toBeCloseTo(4.4865, 4);
    expect(faceAreaArc({ R: 5, phi: PHI, H, tiltDeg: 15, s: -1 })).toBeCloseTo(22.4323, 4);
  });
  it('tilt zero', () => {
    expect(tiltOffset(H, 0)).toBe(0);
    expect(thicknessHorizontal(t, 0)).toBeCloseTo(0.2, 4);
    expect(volumeStraight({ L: 4, H, t, tiltDeg: 0 })).toBeCloseTo(2.4, 4); // 4*3*0,2
    expect(volumeArc({ R: 5, phi: PHI, H, t, tiltDeg: 0, s: 1 })).toBeCloseTo(4.7124, 4); // 1,5708*3*0,2*5
    expect(faceAreaStraight({ L: 4, H, t, tiltDeg: 0 })).toBeCloseTo(12, 4);
  });
  it('sinal negativo: volume igual, deslocamento oposto', () => {
    expect(tiltOffset(H, -15)).toBeCloseTo(-0.8038, 4);
    expect(volumeStraight({ L: 4, H, t, tiltDeg: -15 })).toBeCloseTo(2.4847, 4);
  });
});

describe('wallTilt: eixo no nivel z', () => {
  it('reta: desloca pela normal esquerda', () => {
    const r = axisAtLevel({ x: 0, y: 0 }, { x: 4, y: 0 }, 0, H, 15);
    expect(r.a.x).toBeCloseTo(0, 4); expect(r.a.y).toBeCloseTo(0.8038, 4);
    expect(r.b.x).toBeCloseTo(4, 4); expect(r.b.y).toBeCloseTo(0.8038, 4);
    expect(r.sag).toBe(0);
    expect(axisAtLevel({ x: 0, y: 0 }, { x: 0, y: 4 }, 0, H, 15).a.x).toBeCloseTo(-0.8038, 4);
  });
  it('arco com sag<0 (centro à esquerda de a→b): tilt>0 leva o topo à esquerda e APROXIMA, R = 5 - 0,8038', () => {
    // Convenção de arcFromSagitta: sag > 0 abaula à esquerda e o centro fica à DIREITA; sag < 0, o oposto.
    // corda 5*sqrt2, 90 graus, R=5; sag<0 => centro à esquerda; topo à esquerda (tilt>0) aproxima: R = 4,1962.
    const c = 5 * Math.SQRT2;
    const sag = -5 * (1 - Math.SQRT1_2);
    const r = axisAtLevel({ x: 0, y: 0 }, { x: c, y: 0 }, sag, H, 15);
    expect(r.sag).toBeCloseTo(-4.1962 * (1 - Math.SQRT1_2), 4);
    expect(Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y)).toBeCloseTo(2 * 4.1962 * Math.SQRT1_2, 3);
    expect(arcTiltSide(sag, 15)).toBe(-1);
  });
  it('arco com sag>0 (centro à direita de a→b): tilt>0 AFASTA, R = 5 + 0,8038', () => {
    const c = 5 * Math.SQRT2;
    const r = axisAtLevel({ x: 0, y: 0 }, { x: c, y: 0 }, 5 * (1 - Math.SQRT1_2), H, 15);
    expect(r.sag).toBeCloseTo(5.8038 * (1 - Math.SQRT1_2), 4);
    expect(Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y)).toBeCloseTo(2 * 5.8038 * Math.SQRT1_2, 3);
    expect(arcTiltSide(1, 15)).toBe(1);
    expect(arcTiltSide(-1, -15)).toBe(1);
    expect(arcTiltSide(1, -15)).toBe(-1);
    expect(arcTiltSide(1, 0)).toBe(0);
  });
  it('comprimento', () => {
    expect(axisLengthAtLevel(4, H, 15)).toBe(4);
    expect(axisLengthAtLevel(5, PHI, H, 15, 1)).toBeCloseTo(9.1167, 3);
    expect(axisLengthAtLevel(5, PHI, H, 15, -1)).toBeCloseTo(6.5915, 3);
    expect(axisLengthAtLevel(5, PHI, 0, 15, 1)).toBeCloseTo(7.854, 3);
  });
});

describe('wallTilt: validade', () => {
  it('limites', () => {
    expect(tiltValid({ tiltDeg: NaN, H, t })).toBe(false);
    expect(tiltValid({ tiltDeg: 60, H, t })).toBe(true);
    expect(tiltValid({ tiltDeg: -60, H, t })).toBe(true);
    expect(tiltValid({ tiltDeg: 61, H, t })).toBe(false);
    expect(tiltValid({ tiltDeg: Infinity, H, t })).toBe(false);
  });
  it('arco que se fecha', () => {
    expect(tiltValid({ tiltDeg: 15, H, t, R: 5 })).toBe(true); // 5-0,80 > 0,10+0,01
    expect(tiltValid({ tiltDeg: 30, H, t, R: 1.8 })).toBe(false); // 1,8-1,73=0,07 < 0,2309/2+0,01
    expect(tiltValid({ tiltDeg: 45, H, t, R: 3 })).toBe(false); // 3-3=0
    expect(tiltValid({ tiltDeg: 0, H, t, R: 0.1 })).toBe(false); // 0,1 < 0,11
    expect(tiltValid({ tiltDeg: 15, H, t, R: NaN })).toBe(false);
  });
});
