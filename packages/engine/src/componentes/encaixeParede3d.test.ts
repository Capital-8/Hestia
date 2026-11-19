import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { posarArrastado } from './encaixeArrasto.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import { encaixarNaParede } from './encaixeParede.ts';
import type { CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';

const TOL = 1e-9;
const PROFUNDIDADE = 0.56;
const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [0.8, PROFUNDIDADE, 0.72] };

/**
 * Parede horizontal ao longo de (0,0)→(4,0) com 15 cm de espessura:
 * - faces[0]: face frontal em y = +0,075, lado livre y > +0,075 (normal (0, 1)).
 * - faces[1]: face oposta em y = −0,075, lado livre y < −0,075 (normal (0, −1)).
 */
const PAREDE_15CM: readonly FaceDeParede[] = [
  { a: { x: 0, y: 0.075 }, b: { x: 4, y: 0.075 } },
  { a: { x: 4, y: -0.075 }, b: { x: 0, y: -0.075 } },
];

function pose(x: number, y: number, rotation = Math.PI): Pose {
  return { x, y, rotation, mirrored: false, z: 0 };
}

function v2(x: number, y: number): Vec2 {
  return { x, y };
}

describe('encaixe na parede para arrasto 3D', () => {
  it('(1) com cameraPos na frente de uma parede de 15 cm, mover cruzando a parede NUNCA encaixa na face oposta', () => {
    const cameraPos = v2(2.0, 3.0);

    // Movendo o móvel da frente da parede até cruzar completamente para trás (y negativo).
    for (const fundoY of [0.25, 0.12, 0.075, 0.0, -0.075, -0.2, -0.35, -0.6]) {
      // Com rotation = π, fundo fica em pose.y - PROFUNDIDADE -> pose.y = fundoY + PROFUNDIDADE.
      const desejada = pose(2.4, fundoY + PROFUNDIDADE, Math.PI);
      const res = encaixarNaParede(desejada, CAIXA, PAREDE_15CM, 0.22, { cameraPos });
      if (res) {
        expect(res.face).toBe(0);
        expect(res.pose.rotation).toBeCloseTo(Math.PI, 9);
      }

      const arrasto = posarArrastado(
        { alvo: { id: 'm1', pose: desejada, caixa: CAIXA }, outros: [], faces: PAREDE_15CM },
        { cameraPos },
      );
      expect(arrasto.parede).not.toBe(1);
    }
  });

  it('(2) com faceTravada, mantém o lado correto da parede mesmo se o cursor passar para trás da linha da parede', () => {
    // Cursor passou bastante para trás da linha y = 0,075 (centro do móvel em y = −0,22, bem atrás da face 0).
    const poseAtras = pose(2.4, -0.22 + PROFUNDIDADE / 2, Math.PI);
    const r = encaixarNaParede(poseAtras, CAIXA, PAREDE_15CM, 0.22, { faceTravada: 0 });
    expect(r).not.toBeNull();
    expect(r!.face).toBe(0);
    expect(r!.pose.rotation).toBeCloseTo(Math.PI, 9);
    const cantos = retanguloNoMundo(r!.pose, CAIXA);
    // Fundo (cantos 2 e 3) colado em y = +0,075 e frente (0 e 1) voltada para o lado livre (y > 0,075).
    expect(Math.abs(cantos[2]!.y - 0.075)).toBeLessThan(TOL);
    expect(Math.abs(cantos[3]!.y - 0.075)).toBeLessThan(TOL);
    expect(cantos[0]!.y).toBeCloseTo(0.075 + PROFUNDIDADE, 9);

    // Quando afasta para o lado livre além de distanciaMax * 1,8 (~0,396 m), solta da trava.
    const longeFrente = pose(2.4, 0.075 + 0.42 + PROFUNDIDADE, Math.PI);
    expect(encaixarNaParede(longeFrente, CAIXA, PAREDE_15CM, 0.22, { faceTravada: 0 })).toBeNull();
  });

  it('(3) DISTANCIA_PAREDE_PADRAO (0,22 m) não puxa móvel a 80 cm de distância, mas encaixa a 20 cm', () => {
    // Fundo em y = 0,075 + 0,80 → a 80 cm da face frontal.
    const a80cm: Corpo = { id: 'm1', pose: pose(2.4, 0.075 + 0.8 + PROFUNDIDADE, Math.PI), caixa: CAIXA };
    const semPuxar = posarArrastado({ alvo: a80cm, outros: [], faces: PAREDE_15CM });
    expect(semPuxar.parede).toBeUndefined();
    expect(semPuxar.pose).toEqual(a80cm.pose);

    // Fundo em y = 0,075 + 0,20 → a 20 cm da face frontal (<= 22 cm).
    const a20cm: Corpo = { id: 'm1', pose: pose(2.4, 0.075 + 0.2 + PROFUNDIDADE, Math.PI), caixa: CAIXA };
    const encaixado = posarArrastado({ alvo: a20cm, outros: [], faces: PAREDE_15CM });
    expect(encaixado.parede).toBe(0);
    expect(encaixado.pose.y).toBeCloseTo(0.075 + PROFUNDIDADE, 9);
  });

  it('pontoNaParede prioriza a face atingida pelo cursor no 3D', () => {
    // Canto em L: faces[0] em y = 0 (livre y > 0), faces[1] em x = 0 (livre x > 0).
    const canto: readonly FaceDeParede[] = [
      { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
      { a: { x: 0, y: 4 }, b: { x: 0, y: 0 } },
    ];
    // Móvel mais perto da parede x=0 (fundo a 5 cm), mas o cursor aponta para a parede y=0 em (1,5; 0,02).
    const desejada = pose(0.85, 0.8, 0);
    const r = encaixarNaParede(desejada, CAIXA, canto, 0.22, {
      cameraPos: v2(2, 2),
      pontoNaParede: v2(1.5, 0.02),
    });
    expect(r).not.toBeNull();
    expect(r!.face).toBe(0);
  });
});
