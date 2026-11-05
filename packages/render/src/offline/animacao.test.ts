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
});
