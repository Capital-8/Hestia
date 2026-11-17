import { describe, expect, it } from 'vitest';
import { alturaInclinada, aplicarInclinacaoNaMalha, girarPonto, inclinacaoDaCortina, type PlanoInclinado } from './cortinaInclinada.ts';
import type { MalhaCortinaProjeto } from './kernelCortinaServico.ts';

const plano: PlanoInclinado = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, zBase: 1, tilt: 45 };

describe('cortina inclinada: rotação em torno da linha de base', () => {
  it('ponto 2 m acima da base (slant) vai para 2·sen45° à esquerda (+y) e a cota sobe 2·cos45°', () => {
    const [x, y, z] = girarPonto(plano, [2, 0, 3]);
    expect(x).toBeCloseTo(2, 12);
    expect(y).toBeCloseTo(1.4142136, 6);
    expect(z).toBeCloseTo(1 + 1.4142136, 6);
  });
  it('a linha de base não se move e tilt negativo vai para -y', () => {
    expect(girarPonto(plano, [3, 0, 1])).toEqual([3, 0, 1]);
    const [, y] = girarPonto({ ...plano, tilt: -45 }, [2, 0, 3]);
    expect(y).toBeCloseTo(-1.4142136, 6);
  });
  it('altura inclinada = H/cos(tilt): 2 m a 60° pede 4 m ao longo da face; sem tilt, a própria altura', () => {
    expect(alturaInclinada(2, 60)).toBeCloseTo(4, 12);
    expect(alturaInclinada(2, 0)).toBe(2);
  });
  it('só parede reta inclina: arco com tilt vale 0', () => {
    expect(inclinacaoDaCortina({ tilt: 20, sag: 0 })).toBe(20);
    expect(inclinacaoDaCortina({ tilt: 20, sag: 0.5 })).toBe(0);
    expect(inclinacaoDaCortina({ sag: 0 })).toBe(0);
  });
  it('a malha: matriz identidade vira a rotação; vértices avulsos giram; parede sem plano fica igual', () => {
    const m: MalhaCortinaProjeto = {
      protos: new Map(),
      instancias: [
        { wallId: 'a', proto: 1, papel: 0, materialId: null, transparente: false, matrizes: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]), n: 1 },
        { wallId: 'b', proto: 1, papel: 0, materialId: null, transparente: false, matrizes: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]), n: 1 },
      ],
      grupos: [{ wallId: 'a', papel: 0, materialId: null, transparente: false, vertices: Float32Array.from([2, 0, 3]), indices: Uint32Array.from([0, 0, 0]) }],
    };
    const r = aplicarInclinacaoNaMalha(m, new Map([['a', plano]]));
    expect(Array.from(r.grupos[0]!.vertices).map((v) => +v.toFixed(5))).toEqual([2, 1.41421, 2.41421]);
    expect(r.instancias[1]).toBe(m.instancias[1]);
    // M·(2,0,3,1): linha y = [0, cos45, -sen45·(-1)...] aplicada ao ponto dá o mesmo que `girarPonto`.
    const M = r.instancias[0]!.matrizes;
    const y = M[4]! * 2 + M[5]! * 0 + M[6]! * 3 + M[7]!;
    const z = M[8]! * 2 + M[9]! * 0 + M[10]! * 3 + M[11]!;
    expect(y).toBeCloseTo(1.41421, 4);
    expect(z).toBeCloseTo(2.41421, 4);
    expect(aplicarInclinacaoNaMalha(m, new Map())).toBe(m);
  });
});
