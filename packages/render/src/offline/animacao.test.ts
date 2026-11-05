import { describe, expect, it } from 'vitest';
import type { SheetView3DCamera } from '@hestia/model';
import { defaultSequence, frameCount, sampleCamera, sampleSun } from './animacao.ts';

const CAM: SheetView3DCamera = { azimuth: 0, elevation: 0.5, distance: 10, target: { x: 1, y: 2, z: 3 }, ortho: false };

describe('animação: sequência e amostragem', () => {
  it('frameCount usa duração × fps, com piso em 1', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM });
    seq.duration = 2.5;
    seq.fps = 30;
    expect(frameCount(seq)).toBe(75);
    seq.duration = 0;
    expect(frameCount(seq)).toBe(1);
  });

  it('turntable dá uma volta completa no fim e mantém o alvo', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM });
    const inicio = sampleCamera(seq, 0);
    const meio = sampleCamera(seq, seq.duration / 2);
    const fim = sampleCamera(seq, seq.duration);
    expect(inicio.azimuth).toBeCloseTo(0, 6);
    expect(meio.azimuth).toBeCloseTo(Math.PI, 6);
    expect(fim.azimuth).toBeCloseTo(0, 6);
    expect(fim.target).toEqual(CAM.target);
    expect(fim.distance).toBe(CAM.distance);
  });

  it('keyframes interpolam e respeitam as pontas', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM }, 'keyframes');
    seq.keyframes = [
      { id: 'a', t: 0, camera: { ...CAM, azimuth: 0, distance: 10 } },
      { id: 'b', t: 10, camera: { ...CAM, azimuth: Math.PI / 2, distance: 20, target: { x: 1, y: 2, z: 5 } } },
    ];
    const antes = sampleCamera(seq, -1);
    const meio = sampleCamera(seq, 5);
    const depois = sampleCamera(seq, 99);
    expect(antes.azimuth).toBeCloseTo(0, 6);
    expect(meio.azimuth).toBeCloseTo(Math.PI / 4, 6);
    expect(meio.distance).toBeCloseTo(15, 6);
    expect(meio.target.z).toBeCloseTo(4, 6);
    expect(depois.azimuth).toBeCloseTo(Math.PI / 2, 6);
  });

  it('keyframes com um ponto fica estático', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM }, 'keyframes');
    seq.keyframes = [{ id: 'a', t: 0, camera: CAM }];
    expect(sampleCamera(seq, 5)).toEqual(CAM);
  });

  it('estudo solar devolve uma posição finita e muda com o tempo', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM }, 'solar');
    seq.solar = { date: '2026-06-21', latitude: -23.55, longitude: -46.63, startHour: 8, endHour: 17 };
    const manha = sampleSun(seq, 0);
    const tarde = sampleSun(seq, seq.duration);
    expect(manha).not.toBeNull();
    expect(tarde).not.toBeNull();
    expect(Number.isFinite(manha!.azimuth)).toBe(true);
    expect(Number.isFinite(manha!.elevation)).toBe(true);
    expect(manha!.azimuth).not.toBeCloseTo(tarde!.azimuth, 1);
  });

  it('T1: turntable com keyframes usa os keyframes e devolve cada um nos seus tempos', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM });
    seq.keyframes = [
      { id: 'a', t: 0, camera: { azimuth: 0.2, elevation: 0.3, distance: 10, target: { x: 0, y: 0, z: 0 }, ortho: false } },
      { id: 'b', t: 4, camera: { azimuth: 1.0, elevation: 0.6, distance: 15, target: { x: 2, y: -1, z: 0.5 }, ortho: false } },
      { id: 'c', t: 8, camera: { azimuth: 2.4, elevation: 0.2, distance: 12, target: { x: -3, y: 1, z: 2 }, ortho: false } },
    ];
    for (const kf of seq.keyframes) {
      const c = sampleCamera(seq, kf.t);
      expect(c.azimuth).toBeCloseTo(kf.camera.azimuth, 9);
      expect(c.elevation).toBeCloseTo(kf.camera.elevation, 9);
      expect(c.distance).toBeCloseTo(kf.camera.distance, 9);
      expect(c.target.x).toBeCloseTo(kf.camera.target.x, 9);
      expect(c.target.y).toBeCloseTo(kf.camera.target.y, 9);
      expect(c.target.z).toBeCloseTo(kf.camera.target.z, 9);
    }
  });

  it('T2: keyframes passam exatamente por cada keyframe, na ordem', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM }, 'keyframes');
    seq.keyframes = [
      { id: 'a', t: 0, camera: { azimuth: 0.1, elevation: 0.2, distance: 8, target: { x: 0, y: 0, z: 0 }, ortho: false } },
      { id: 'b', t: 2, camera: { azimuth: 1.0, elevation: 0.7, distance: 11, target: { x: 1, y: 0, z: 2 }, ortho: false } },
      { id: 'c', t: 5, camera: { azimuth: 2.5, elevation: 0.4, distance: 20, target: { x: 3, y: -2, z: 1 }, ortho: false } },
      { id: 'd', t: 9, camera: { azimuth: 3.0, elevation: 0.1, distance: 9, target: { x: -1, y: 4, z: 0 }, ortho: false } },
    ];
    for (const kf of seq.keyframes) {
      const c = sampleCamera(seq, kf.t);
      expect(c.azimuth).toBeCloseTo(kf.camera.azimuth, 9);
      expect(c.elevation).toBeCloseTo(kf.camera.elevation, 9);
      expect(c.distance).toBeCloseTo(kf.camera.distance, 9);
      expect(c.target.x).toBeCloseTo(kf.camera.target.x, 9);
      expect(c.target.y).toBeCloseTo(kf.camera.target.y, 9);
      expect(c.target.z).toBeCloseTo(kf.camera.target.z, 9);
    }
  });

  it('T3: com 2 keyframes a interpolação é cúbica (não linear) e fica entre os extremos', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM }, 'keyframes');
    seq.keyframes = [
      { id: 'a', t: 0, camera: { ...CAM, distance: 10 } },
      { id: 'b', t: 10, camera: { ...CAM, distance: 20 } },
    ];
    const d = sampleCamera(seq, 2.5).distance;
    const linear = 10 + 10 * 0.25;
    expect(Math.abs(d - linear)).toBeGreaterThan(1e-3);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(20);
  });

  it('T4: azimute entre 0 e 2π-0.2 passa pelo arco curto (perto de -0.1, não de π)', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM }, 'keyframes');
    seq.keyframes = [
      { id: 'a', t: 0, camera: { ...CAM, azimuth: 0 } },
      { id: 'b', t: 10, camera: { ...CAM, azimuth: 2 * Math.PI - 0.2 } },
    ];
    const meio = sampleCamera(seq, 5).azimuth;
    expect(meio).toBeCloseTo(2 * Math.PI - 0.1, 6);
    expect(Math.abs(meio - Math.PI)).toBeGreaterThan(1);
  });

  it('T5: sem keyframes, turntable preserva o comportamento antigo (azimute cresce com t)', () => {
    const seq = defaultSequence({ name: 'A', camera: CAM });
    expect(seq.keyframes).toEqual([]);
    const a0 = sampleCamera(seq, 0).azimuth;
    const a2 = sampleCamera(seq, 2).azimuth;
    const a4 = sampleCamera(seq, 4).azimuth;
    expect(a0).toBeCloseTo(0, 9);
    expect(a2).toBeCloseTo(Math.PI / 2, 9);
    expect(a4).toBeCloseTo(Math.PI, 9);
  });
});
