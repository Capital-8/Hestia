import { describe, expect, it } from 'vitest';
import { alturaDoOlho, alvoAPartirDaDirecao, cameraEmPonto, direcaoDaCamera, poligonoDoCone } from './renderCameraPlanta.ts';

const angulosEntre = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number => {
  const v1 = { x: a.x - o.x, y: a.y - o.y };
  const v2 = { x: b.x - o.x, y: b.y - o.y };
  // atan2(cruz, produto escalar): ângulo com sinal, sem a perda de precisão do arco-cosseno perto de 0 e de π.
  return Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y);
};

describe('câmera de render na planta (H13)', () => {
  it('direção para +X tem ângulo 0 e direção para +Y tem π/2', () => {
    expect(direcaoDaCamera({ x: 1, y: 2 }, { x: 5, y: 2 }).angulo).toBe(0);
    expect(direcaoDaCamera({ x: 1, y: 2 }, { x: 1, y: 9 }).angulo).toBeCloseTo(Math.PI / 2, 12);
  });

  it('cone de 60° tem ângulo entre as pontas exatamente 60° (tolerância 1e-9 rad)', () => {
    const pos = { x: 3, y: -2 };
    for (const angulo of [0, 0.7, Math.PI, -2.1]) {
      const [o, esq, dir] = poligonoDoCone(pos, angulo, 60, 10);
      expect(Math.abs(angulosEntre(o!, esq!, dir!) - Math.PI / 3)).toBeLessThan(1e-9);
    }
  });

  it('as pontas do cone ficam em angulo ∓ fov/2 e a distância pedida', () => {
    const pos = { x: 0, y: 0 };
    const [o, esq, dir] = poligonoDoCone(pos, Math.PI / 2, 60, 7);
    expect(o).toEqual(pos);
    expect(Math.hypot(esq!.x, esq!.y)).toBeCloseTo(7, 9);
    expect(Math.hypot(dir!.x, dir!.y)).toBeCloseTo(7, 9);
    expect(Math.atan2(esq!.y, esq!.x)).toBeCloseTo(Math.PI / 2 - Math.PI / 6, 12);
    expect(Math.atan2(dir!.y, dir!.x)).toBeCloseTo(Math.PI / 2 + Math.PI / 6, 12);
  });

  it('alvo fica à distância pedida e, para +X, tem o mesmo y da posição', () => {
    const pos = { x: 4, y: 7 };
    const a = alvoAPartirDaDirecao(pos, 0.9, 10, 1.6);
    expect(Math.hypot(a.x - pos.x, a.y - pos.y)).toBeCloseTo(10, 9);
    expect(a.z).toBe(1.6);
    const px = alvoAPartirDaDirecao(pos, 0, 10, 0);
    expect(px.y).toBe(pos.y);
    expect(px.x).toBeCloseTo(14, 12);
  });

  it('altura do olho: elevação + 1,6 m; elevação NaN dá 1,6 m', () => {
    expect(alturaDoOlho(Number.NaN)).toBe(1.6);
    expect(alturaDoOlho(3)).toBeCloseTo(4.6, 12);
    expect(alturaDoOlho(-0.45)).toBeCloseTo(1.15, 12);
  });

  it('clique na posição ou dentro do cone encontra a câmera; fora dos dois, nada', () => {
    const cams = [{ id: 'c1', position: { x: 0, y: 0 }, target: { x: 10, y: 0 }, fovDeg: 60 }];
    expect(cameraEmPonto(cams, { x: 0.1, y: 0.05 }, 0.5)).toBe('c1');
    expect(cameraEmPonto(cams, { x: 6, y: 0 }, 0.5)).toBe('c1');
    expect(cameraEmPonto(cams, { x: -3, y: 0 }, 0.5)).toBeNull();
    expect(cameraEmPonto(cams, { x: 6, y: 9 }, 0.5)).toBeNull();
  });
});
