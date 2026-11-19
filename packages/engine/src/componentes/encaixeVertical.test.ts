import { describe, expect, it } from 'vitest';
import { posarArrastado } from './encaixeArrasto.ts';
import { colisoes } from './encaixeColisao.ts';
import type { CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';
import { encaixarNoVizinho, guiasDeAlinhamento } from './encaixeVizinho.ts';

/** Balcão de cozinha no piso: zMin = 0, zMax = 0.88 m. */
const CAIXA_BALCAO: CaixaLocal = { min: [0, 0, 0], max: [0.8, 0.56, 0.88] };
/** Armário aéreo fixado a 1,45 m (pose.z = 0, caixa.min[2] = 1.45 m, caixa.max[2] = 2.15 m). */
const CAIXA_AEREO: CaixaLocal = { min: [0, 0, 1.45], max: [0.8, 0.32, 2.15] };
/** Torre alta de piso: zMin = 0, zMax = 2.15 m. */
const CAIXA_TORRE: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 2.15] };

/** Face de parede no eixo X (y = 0, sólido em y < 0, livre em y > 0). */
const PAREDE: FaceDeParede = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };

const pose = (x: number, y: number, rotation = 0, z = 0): Pose => ({
  x,
  y,
  rotation,
  mirrored: false,
  z,
});

describe('encaixe vertical (móvel embaixo de aéreo)', () => {
  it('balcão passa livremente e encaixa na parede abaixo de um aéreo sem ser empurrado para o lado e sem colisão', () => {
    // Aéreo encostado na parede: com rotação π, fundo (yMax = 0.32) toca y = 0 ⇒ pose.y = 0.32; ocupação X ∈ [1.2, 2.0].
    const aereo: Corpo = { id: 'aereo1', pose: pose(2.0, 0.32, Math.PI, 0), caixa: CAIXA_AEREO };

    // Balcão perto da parede, passando quase exatamente embaixo do aéreo (deslocado 3 cm em X).
    // Com a falha antiga (pose.z === vizinho.pose.z), encaixarNoVizinho tentaria colar lateralmente ao aéreo.
    const balcao: Corpo = { id: 'balcao1', pose: pose(2.03, 0.62, Math.PI, 0), caixa: CAIXA_BALCAO };

    expect(encaixarNoVizinho(balcao.pose, balcao.caixa, [aereo])).toBeNull();
    expect(colisoes(balcao, [aereo], [PAREDE])).toEqual({ moveis: [], paredes: [] });

    const arrasto = posarArrastado(
      { alvo: balcao, outros: [aereo], faces: [PAREDE] },
      { distanciaParede: 0.3, distanciaVizinho: 0.2 },
    );

    // Encosta o fundo na parede (pose.y = 0.56) e preserva X = 2.03 (não empurra para fora de baixo do aéreo).
    expect(arrasto.parede).toBe(0);
    expect(arrasto.vizinho).toBeUndefined();
    expect(arrasto.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(arrasto.pose.y).toBeCloseTo(0.56, 9);
    expect(arrasto.pose.x).toBeCloseTo(2.03, 9);
    expect(arrasto.colisoes).toEqual({ moveis: [], paredes: [] });
  });

  it('balcão exatamente sob o aéreo não gera colisão nem encaixe lateral mesmo com distância zero', () => {
    const aereo: Corpo = { id: 'aereo1', pose: pose(2.0, 0.32, Math.PI, 0), caixa: CAIXA_AEREO };
    const balcao: Corpo = { id: 'balcao1', pose: pose(2.0, 0.56, Math.PI, 0), caixa: CAIXA_BALCAO };

    expect(encaixarNoVizinho(balcao.pose, balcao.caixa, [aereo])).toBeNull();
    expect(colisoes(balcao, [aereo], [PAREDE])).toEqual({ moveis: [], paredes: [] });
  });

  it('gera guias sutis de alinhamento vertical (esquerda, direita, centro-x) com aéreo acima sem mover contra ele', () => {
    const aereo: Corpo = { id: 'aereo1', pose: pose(2.0, 0.32, Math.PI, 0), caixa: CAIXA_AEREO };
    // Balcão de mesma largura alinhado exatamente sob o aéreo, ambos com o fundo na parede y = 0.
    const balcaoAlinhado: Corpo = { id: 'balcao1', pose: pose(2.0, 0.56, Math.PI, 0), caixa: CAIXA_BALCAO };

    const guias = guiasDeAlinhamento(balcaoAlinhado.pose, balcaoAlinhado.caixa, [aereo]);
    expect(guias.map((g) => g.tipo)).toEqual(['esquerda', 'direita', 'centro-x']);
    expect(guias.every((g) => g.com === 'aereo1')).toBe(true);

    // Mesmo encostados na mesma parede (fundo coincidente), não emite guias de profundidade ('frente'/'fundo'/'centro-y').
    expect(guias.some((g) => g.tipo === 'fundo' || g.tipo === 'frente' || g.tipo === 'centro-y')).toBe(false);

    // Balcão de largura 0,5 m alinhando apenas uma borda lateral com o aéreo:
    const caixaEstreita: CaixaLocal = { min: [0, 0, 0], max: [0.5, 0.56, 0.88] };
    const guiasEstreito = guiasDeAlinhamento(pose(2.0, 0.56, Math.PI, 0), caixaEstreita, [aereo]);
    expect(guiasEstreito.map((g) => g.tipo)).toEqual(['esquerda']);
  });

  it('dois aéreos na mesma cota zFixacao continuam encaixando lateralmente entre si', () => {
    const aereo1: Corpo = { id: 'aereo1', pose: pose(1.0, 0.32, Math.PI, 0), caixa: CAIXA_AEREO };
    const aereo2Pose = pose(1.83, 0.32, Math.PI, 0);
    const encaixe = encaixarNoVizinho(aereo2Pose, CAIXA_AEREO, [aereo1]);
    expect(encaixe).not.toBeNull();
    expect(encaixe!.vizinho).toBe('aereo1');
    expect(encaixe!.pose.x).toBeCloseTo(1.8, 9);
  });

  it('balcão e torre (que se sobrepõem em altura) continuam encaixando lateralmente', () => {
    const torre: Corpo = { id: 'torre1', pose: pose(1.0, 0.56, Math.PI, 0), caixa: CAIXA_TORRE };
    const balcaoPose = pose(1.83, 0.56, Math.PI, 0);
    const encaixe = encaixarNoVizinho(balcaoPose, CAIXA_BALCAO, [torre]);
    expect(encaixe).not.toBeNull();
    expect(encaixe!.vizinho).toBe('torre1');
    expect(encaixe!.pose.x).toBeCloseTo(1.8, 9);
  });
});
