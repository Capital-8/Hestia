import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { encaixarNaParede } from './encaixeParede.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import type { CaixaLocal, FaceDeParede, Pose } from './encaixeTipos.ts';

const TOL = 1e-9;
const PROFUNDIDADE = 0.56;
const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [0.8, PROFUNDIDADE, 0.72] };

function pose(x: number, y: number, rotation = 0, mirrored = false, z = 0): Pose {
  return { x, y, rotation, mirrored, z };
}

function v2(x: number, y: number): Vec2 {
  return { x, y };
}

/** Face do "chão" da planta: a=(0,0)→b=(4,0); sólido em y<0, livre em y>0. */
const FACE_Y0: FaceDeParede = { a: v2(0, 0), b: v2(4, 0) };

function centroRect(c: readonly [Vec2, Vec2, Vec2, Vec2]): Vec2 {
  return { x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 };
}

describe('encaixarNaParede', () => {
  it('fundo encosta na face, frente à profundidade e centro preservado ao longo da face', () => {
    const antes = pose(2.0, 0.7, 0.1);
    const r = encaixarNaParede(antes, CAIXA, [FACE_Y0], 2.0);
    expect(r).not.toBeNull();
    const encaixado = r!;
    const c = retanguloNoMundo(encaixado.pose, CAIXA);
    expect(Math.abs(c[2].y)).toBeLessThan(TOL);
    expect(Math.abs(c[3].y)).toBeLessThan(TOL);
    expect(Math.abs(c[0].y - PROFUNDIDADE)).toBeLessThan(TOL);
    expect(Math.abs(c[1].y - PROFUNDIDADE)).toBeLessThan(TOL);
    const antesC = centroRect(retanguloNoMundo(antes, CAIXA));
    const depoisC = centroRect(c);
    expect(Math.abs(depoisC.x - antesC.x)).toBeLessThan(TOL);
    expect(encaixado.face).toBe(0);
  });

  it('com mirrored continua encostado e espelhado', () => {
    const antes = pose(2.0, 0.7, 0.1, true);
    const r = encaixarNaParede(antes, CAIXA, [FACE_Y0], 2.0)!;
    expect(r.pose.mirrored).toBe(true);
    const c = retanguloNoMundo(r.pose, CAIXA);
    expect(Math.abs(c[2].y)).toBeLessThan(TOL);
    expect(Math.abs(c[3].y)).toBeLessThan(TOL);
    expect(Math.abs(c[0].y - PROFUNDIDADE)).toBeLessThan(TOL);
    expect(Math.abs(centroRect(c).x - centroRect(retanguloNoMundo(antes, CAIXA)).x)).toBeLessThan(TOL);
  });

  it('fundo a 0,5 m: null com o padrão 0,3; encaixa com 0,6 e reporta a distância de antes', () => {
    // Rotação π: fundo em y = pose.y − 0,56; com pose.y = 1,06 o fundo fica a 0,5 da face.
    const p = pose(2.0, 1.06, Math.PI);
    expect(encaixarNaParede(p, CAIXA, [FACE_Y0])).toBeNull();
    const r = encaixarNaParede(p, CAIXA, [FACE_Y0], 0.6);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.distancia - 0.5)).toBeLessThan(TOL);
    const c = retanguloNoMundo(r!.pose, CAIXA);
    expect(Math.abs(c[2].y)).toBeLessThan(TOL);
  });

  it('duas faces: escolhe a mais próxima do fundo e devolve o índice dela', () => {
    // faces[0]: y=0 com livre em y>0; faces[1]: x=0 com livre em x>0 (a=(0,4)→b=(0,0)).
    const faces: FaceDeParede[] = [FACE_Y0, { a: v2(0, 4), b: v2(0, 0) }];
    const r = encaixarNaParede(pose(0.5, 2.0), CAIXA, faces, 3.0)!;
    expect(r.face).toBe(1);
    const c = retanguloNoMundo(r.pose, CAIXA);
    expect(Math.abs(c[2].x)).toBeLessThan(TOL);
    expect(Math.abs(c[3].x)).toBeLessThan(TOL);
    expect(Math.abs(centroRect(c).y - 2.28)).toBeLessThan(TOL);
  });

  it('móvel com o centro no lado sólido da face é ignorado', () => {
    // Centro em y = −0,4 + 0,28 = −0,12 (sólido), fundo a 0,16 da face, dentro do alcance.
    expect(encaixarNaParede(pose(2.0, -0.4), CAIXA, [FACE_Y0], 2.0)).toBeNull();
  });

  it('projeção do fundo fora do segmento é ignorada (com 1 mm de tolerância)', () => {
    // Fundo centrado em x = 4,6 (> 4 + 0,001): fora.
    expect(encaixarNaParede(pose(4.2, 0.2), CAIXA, [FACE_Y0], 2.0)).toBeNull();
    // Fundo centrado em x = 4,0 (no fim da face): dentro.
    expect(encaixarNaParede(pose(3.6, 0.2), CAIXA, [FACE_Y0], 2.0)).not.toBeNull();
  });

  it('idempotência: encaixar o resultado de novo dá a mesma pose com distância ~0', () => {
    const r1 = encaixarNaParede(pose(2.0, 0.7, 0.1), CAIXA, [FACE_Y0], 2.0)!;
    const r2 = encaixarNaParede(r1.pose, CAIXA, [FACE_Y0], 2.0)!;
    expect(Math.abs(r2.pose.x - r1.pose.x)).toBeLessThan(TOL);
    expect(Math.abs(r2.pose.y - r1.pose.y)).toBeLessThan(TOL);
    expect(Math.abs(r2.pose.rotation - r1.pose.rotation)).toBeLessThan(TOL);
    expect(r2.pose.mirrored).toBe(r1.pose.mirrored);
    expect(r2.pose.z).toBe(r1.pose.z);
    expect(Math.abs(r2.distancia)).toBeLessThan(TOL);
  });

  it('z preservado e rotação sempre em (−π, π]', () => {
    const r = encaixarNaParede(pose(2.0, 0.7, 0.1, false, 0.4), CAIXA, [FACE_Y0], 2.0)!;
    expect(r.pose.z).toBe(0.4);
    expect(r.pose.rotation).toBeGreaterThan(-Math.PI);
    expect(r.pose.rotation).toBeLessThanOrEqual(Math.PI);
    // Face vertical (x=0, livre x>0) e face invertida (y=0 vista de a=(4,0)→b=(0,0), livre y<0).
    const vertical = encaixarNaParede(pose(0.5, 2.0), CAIXA, [{ a: v2(0, 4), b: v2(0, 0) }], 2.0)!;
    expect(vertical.pose.rotation).toBeGreaterThan(-Math.PI);
    expect(vertical.pose.rotation).toBeLessThanOrEqual(Math.PI);
    const invertida = encaixarNaParede(pose(2.0, -0.7, 0.1), CAIXA, [{ a: v2(4, 0), b: v2(0, 0) }], 2.0)!;
    expect(invertida.pose.rotation).toBeGreaterThan(-Math.PI);
    expect(invertida.pose.rotation).toBeLessThanOrEqual(Math.PI);
  });
});
