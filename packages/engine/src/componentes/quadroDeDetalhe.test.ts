import { describe, expect, it } from 'vitest';
import type { DetalheResolvido } from './detalharFamilia.ts';
import { quadroDeDetalhe } from './quadroDeDetalhe.ts';

/** Detalhe sintético (sem família): um corte retangular de 1 m × 0,5 m e uma cota horizontal de 1000 mm. */
function detalhe(over: Partial<DetalheResolvido> = {}): DetalheResolvido {
  return {
    id: 'corte-a',
    nome: 'Corte A',
    vista: 'corte',
    escala: 20,
    eixoVista: 'y',
    cortados: [[0, 0, 1, 0, 1, 0.5, 0, 0.5]],
    contornos: [],
    simbolos: [],
    cotas: [
      {
        id: 'larg',
        de: [0, -0.1],
        ate: [1, -0.1],
        linha: { de: [0, -0.2], ate: [1, -0.2] },
        eixo: 'x',
        valorMm: 1000,
        medidoMm: 1000,
        texto: '1000',
        parametro: null,
        alturaTexto: 0.05,
      },
    ],
    alturaTexto: 0.05,
    diagnosticos: [],
    ...over,
  };
}

describe('quadroDeDetalhe', () => {
  it('converte metros em mm de papel na escala pedida (1 m a 1:100 = 10 mm)', () => {
    const q = quadroDeDetalhe(detalhe(), 100);
    const corte = q.linhas.find((l) => l.tipo === 'corte');
    expect(corte?.fechada).toBe(true);
    expect(corte?.pontos).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
  });

  it('usa a escala do pedido, não a do detalhe, e aplica a origem no papel', () => {
    const q = quadroDeDetalhe(detalhe(), 50, { x: 20, y: 30 });
    expect(q.escala).toBe(50);
    const corte = q.linhas.find((l) => l.tipo === 'corte');
    expect(corte?.pontos[1]).toEqual({ x: 40, y: 30 });
    expect(corte?.pontos[2]).toEqual({ x: 40, y: 40 });
  });

  it('cada cota vira linha de cota, duas extensões e um texto de 2,5 mm no meio da linha', () => {
    const q = quadroDeDetalhe(detalhe(), 100);
    const tipos = q.linhas.map((l) => l.tipo);
    expect(tipos.filter((t) => t === 'cota')).toHaveLength(1);
    expect(tipos.filter((t) => t === 'extensao')).toHaveLength(2);
    expect(q.textos).toHaveLength(1);
    expect(q.textos[0]).toEqual({ cotaId: 'larg', texto: '1000', posicao: { x: 5, y: -2 }, alturaMm: 2.5 });
  });

  it('a altura do texto é 2,5 mm de papel em qualquer escala', () => {
    for (const escala of [20, 50, 100, 200]) {
      expect(quadroDeDetalhe(detalhe(), escala).textos[0]?.alturaMm).toBe(2.5);
    }
  });

  it('escala inválida devolve quadro vazio com diagnóstico, sem lançar', () => {
    for (const escala of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const q = quadroDeDetalhe(detalhe(), escala);
      expect(q.linhas).toEqual([]);
      expect(q.textos).toEqual([]);
      expect(q.diagnosticos).toHaveLength(1);
    }
  });

  it('descarta pares de coordenadas não finitos sem lançar', () => {
    const q = quadroDeDetalhe(detalhe({ cortados: [[0, 0, Number.NaN, 0, 1, 0.5]] }), 100);
    const corte = q.linhas.find((l) => l.tipo === 'corte');
    expect(corte?.pontos).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ]);
  });

  it('repassa os diagnósticos do detalhe em forma de texto com o local', () => {
    const q = quadroDeDetalhe(detalhe({ diagnosticos: [{ mensagem: 'escala inválida; usando 1:1', onde: 'detalhe:corte-a' }] }), 100);
    expect(q.diagnosticos).toEqual(['detalhe:corte-a: escala inválida; usando 1:1']);
  });

  it('é determinística: mesma entrada, mesma saída', () => {
    expect(quadroDeDetalhe(detalhe(), 100)).toEqual(quadroDeDetalhe(detalhe(), 100));
  });
});
