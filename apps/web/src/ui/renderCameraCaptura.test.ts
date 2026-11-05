import { describe, expect, it } from 'vitest';
import type { SheetView3DCamera } from '@hestia/model';
import { cameraParaRenderCamera, fovHorizontalDeg, retanguloDaPrevia } from './renderCameraCaptura.ts';

const CAM: SheetView3DCamera = { azimuth: -0.7, elevation: 0.45, distance: 18, target: { x: 2, y: 3, z: 1.5 }, ortho: false };

describe('campo de visão da câmera de render', () => {
  it('converte 38° vertical para horizontal em 16:9 (2·atan(tan(19°)·16/9))', () => {
    const esperado = (2 * Math.atan(Math.tan((19 * Math.PI) / 180) * (16 / 9)) * 180) / Math.PI;
    expect(fovHorizontalDeg(38, 16 / 9)).toBeCloseTo(esperado, 9);
    expect(fovHorizontalDeg(38, 16 / 9)).toBeGreaterThan(62.9);
    expect(fovHorizontalDeg(38, 16 / 9)).toBeLessThan(63.1);
  });

  it('em proporção 1:1 o horizontal é igual ao vertical', () => {
    expect(fovHorizontalDeg(38, 1)).toBeCloseTo(38, 9);
  });
});

describe('cameraParaRenderCamera', () => {
  it('posição = posição absoluta da órbita (Z para cima) e alvo copiado', () => {
    const c = cameraParaRenderCamera(CAM, 'lv_1', { w: 16, h: 9 }, 'Fachada');
    const ce = Math.cos(CAM.elevation);
    expect(c.position.x).toBeCloseTo(2 + 18 * ce * Math.cos(-0.7), 9);
    expect(c.position.y).toBeCloseTo(3 + 18 * ce * Math.sin(-0.7), 9);
    expect(c.position.z).toBeCloseTo(1.5 + 18 * Math.sin(0.45), 9);
    expect(c.target).toEqual({ x: 2, y: 3, z: 1.5 });
    expect(c.levelId).toBe('lv_1');
    expect(c.name).toBe('Fachada');
    expect(c.aspect).toEqual({ w: 16, h: 9 });
    expect(c.fovDeg).toBeCloseTo(fovHorizontalDeg(38, 16 / 9), 9);
    expect(c.id).toMatch(/^rcam/);
  });

  it('não compartilha objetos com a câmera de origem nem com a proporção', () => {
    const aspect = { w: 4, h: 3 };
    const c = cameraParaRenderCamera(CAM, 'lv_0', aspect, 'A');
    expect(c.target).not.toBe(CAM.target);
    expect(c.position).not.toBe(CAM.target);
    expect(c.aspect).not.toBe(aspect);
    c.target.x = 99;
    c.aspect.w = 99;
    expect(CAM.target.x).toBe(2);
    expect(aspect.w).toBe(4);
  });

  it('a distância entre posição e alvo é a distância da órbita', () => {
    const c = cameraParaRenderCamera(CAM, 'lv_0', { w: 16, h: 9 }, 'A');
    const d = Math.hypot(c.position.x - c.target.x, c.position.y - c.target.y, c.position.z - c.target.z);
    expect(d).toBeCloseTo(18, 9);
  });
});

describe('retanguloDaPrevia', () => {
  it('canvas mais largo que a proporção (1600x900 = 16:9): quadro do tamanho do canvas', () => {
    const r = retanguloDaPrevia(1600, 900, 16 / 9);
    expect(r.h).toBeCloseTo(900, 9);
    expect(r.w).toBeCloseTo(1600, 9);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(0, 9);
  });

  it('canvas mais largo que a proporção pedida (1200x800 > 4:3): altura inteira, centralizado, com a proporção certa', () => {
    const r = retanguloDaPrevia(1200, 800, 4 / 3);
    expect(r.h).toBeCloseTo(800, 9);
    expect(r.w).toBeCloseTo(800 * (4 / 3), 9);
    expect(r.w / r.h).toBeCloseTo(4 / 3, 9);
    expect(r.x).toBeCloseTo((1200 - r.w) / 2, 9);
    expect(r.y).toBeCloseTo(0, 9);
  });

  it('canvas mais estreito que a proporção: largura inteira, altura pela proporção, centralizado na vertical', () => {
    const r = retanguloDaPrevia(600, 800, 16 / 9);
    expect(r.w).toBeCloseTo(600, 9);
    expect(r.h).toBeCloseTo(600 * (9 / 16), 9);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 9);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo((800 - r.h) / 2, 9);
  });

  it('1:1 num canvas retangular fica quadrado e centralizado', () => {
    const r = retanguloDaPrevia(1200, 700, 1);
    expect(r.w).toBeCloseTo(700, 9);
    expect(r.h).toBeCloseTo(700, 9);
    expect(r.x).toBeCloseTo(250, 9);
    expect(r.y).toBeCloseTo(0, 9);
  });

  it('entradas inválidas devolvem retângulo vazio', () => {
    expect(retanguloDaPrevia(0, 500, 16 / 9)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(retanguloDaPrevia(500, 500, 0)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(retanguloDaPrevia(500, 500, Number.NaN)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});
