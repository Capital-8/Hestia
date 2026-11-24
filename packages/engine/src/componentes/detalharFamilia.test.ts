import { describe, expect, it } from 'vitest';
import { FAMILIA_FORMATO, FAMILIA_VERSAO, type CotaFamilia, type DetalheFamilia, type Familia, type Ligacao } from '@hestia/model';
import { alturaTextoDoModelo, detalharFamilia } from './detalharFamilia.ts';

const lig = (id: string, posicao: [string, string, string]): Ligacao => ({
  id, nome: id, dominio: 'agua_fria', secao: 'redonda', posicao, direcao: ['0', '0', '1'], diametro: '25', fluxo: 'ambos',
});

/** Caixa 1000 × 600 × 800 com planos nas faces, duas ligações e dois símbolos (planta e elevação lateral). */
function caixa(detalhes: DetalheFamilia[]): Familia {
  return {
    formato: FAMILIA_FORMATO, versao: FAMILIA_VERSAO, id: 'caixa', nome: 'Caixa', categoria: 'marcenaria', unidade: 'mm', hospedagem: 'nivel', origem: 'canto',
    parametros: [
      { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 1000, min: 300, max: 2000 },
      { id: 'A', nome: 'Altura', tipo: 'comprimento', escopo: 'instancia', padrao: 800 },
      { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: 600 },
    ],
    planos: [
      { id: 'x0', nome: 'Esquerda', eixo: 'x', posicao: '0' },
      { id: 'x1', nome: 'Direita', eixo: 'x', posicao: 'L' },
      { id: 'y0', nome: 'Frente', eixo: 'y', posicao: '0' },
      { id: 'y1', nome: 'Fundo', eixo: 'y', posicao: 'P' },
      { id: 'z1', nome: 'Topo', eixo: 'z', posicao: 'A' },
    ],
    pecas: [{ id: 'bloco', nome: 'Bloco', papel: 'lateral', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'A', material: 'm' }],
    aninhados: [], ferragens: [],
    ligacoes: [lig('a', ['0', '0', '0']), lig('b', ['L', '0', '0'])],
    simbolos: [
      { id: 'cruz', nome: 'Cruz', vistas: ['planta'], plano: 'xy', primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['L', 'P'] }] },
      { id: 'lado', nome: 'Lado', vistas: ['elevacao'], plano: 'yz', primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['P', 'A'] }] },
    ],
    detalhes,
    tipos: [],
  };
}

const cotaL: CotaFamilia = { id: 'cL', de: { tipo: 'plano', id: 'x0' }, ate: { tipo: 'plano', id: 'x1' }, parametro: 'L', deslocamento: '-100' };
const cotaP: CotaFamilia = { id: 'cP', de: { tipo: 'plano', id: 'y0' }, ate: { tipo: 'plano', id: 'y1' }, parametro: 'P' };
const planta: DetalheFamilia = { id: 'pl', nome: 'Planta', vista: 'planta', escala: 20, cotas: [cotaL, cotaP], simbolos: ['cruz'] };

describe('detalharFamilia (D4)', () => {
  it('caixa 1000 × 600 × 800: cotas L e P por plano de referência', () => {
    const d = detalharFamilia(caixa([planta]), undefined, {}, 'pl')!;
    expect(d.diagnosticos).toEqual([]);
    const [l, p] = d.cotas;
    expect(l).toMatchObject({ id: 'cL', eixo: 'x', valorMm: 1000, medidoMm: 1000, texto: '1000', parametro: 'L' });
    expect(p).toMatchObject({ id: 'cP', eixo: 'y', valorMm: 600, texto: '600' });
    // A linha de cota de L fica 100 mm abaixo (deslocamento −100) da face da frente.
    expect(l?.de).toEqual([0, 0]);
    expect(l?.ate).toEqual([1, 0]);
    expect(l?.linha).toEqual({ de: [0, -0.1], ate: [1, -0.1] });
    expect(d.contornos[0]).toEqual([0, 0, 1, 0, 1, 0.6, 0, 0.6]);
    expect(d.simbolos.map((s) => s.id)).toEqual(['cruz']);
  });

  it('valores da instância mudam a cota dirigida (L = 1200)', () => {
    const d = detalharFamilia(caixa([planta]), undefined, { L: 1200 }, 'pl')!;
    expect(d.cotas[0]).toMatchObject({ valorMm: 1200, medidoMm: 1200, texto: '1200' });
  });

  it('cota entre ligações mede no eixo dominante e não é dirigida', () => {
    const entre: DetalheFamilia = { ...planta, cotas: [{ id: 'cl', de: { tipo: 'ligacao', id: 'a' }, ate: { tipo: 'ligacao', id: 'b' } }] };
    const d = detalharFamilia(caixa([entre]), undefined, {}, 'pl')!;
    expect(d.diagnosticos).toEqual([]);
    expect(d.cotas[0]).toMatchObject({ eixo: 'x', valorMm: 1000, medidoMm: 1000, parametro: null });
  });

  it('cota entre pontos: eixo dominante do segmento', () => {
    const entre: DetalheFamilia = { ...planta, cotas: [{ id: 'cp', de: { tipo: 'ponto', ponto: ['0', '0', '0'] }, ate: { tipo: 'ponto', ponto: ['100', '300', '0'] } }] };
    const d = detalharFamilia(caixa([entre]), undefined, {}, 'pl')!;
    expect(d.cotas[0]).toMatchObject({ eixo: 'y', medidoMm: 300 });
  });

  it('corte em plano: seção da caixa em y = 300 mm (frontal xz) com a cota de L', () => {
    const corte: DetalheFamilia = { id: 'c', nome: 'Corte', vista: 'corte', plano: { eixo: 'y', posicao: '300' }, escala: 20, cotas: [cotaL] };
    const d = detalharFamilia(caixa([corte]), undefined, {}, 'c')!;
    expect(d.diagnosticos).toEqual([]);
    expect(d.cortados).toHaveLength(1);
    expect(d.cortados[0]).toEqual([0, 0, 1, 0, 1, 0.8, 0, 0.8]);
    expect(d.cotas[0]).toMatchObject({ eixo: 'x', valorMm: 1000 });
    // Corte fora da caixa não acha seção.
    const fora = { ...corte, plano: { eixo: 'y' as const, posicao: '900' } };
    expect(detalharFamilia(caixa([fora]), undefined, {}, 'c')!.cortados).toEqual([]);
  });

  it('elevação lateral escolhe o símbolo do plano yz e recusa o de outro plano', () => {
    const lateral: DetalheFamilia = { id: 'e', nome: 'Lateral', vista: 'elevacao', plano: { eixo: 'x', posicao: '0' }, escala: 10, cotas: [cotaP], simbolos: ['lado', 'cruz'] };
    const d = detalharFamilia(caixa([lateral]), undefined, {}, 'e')!;
    expect(d.simbolos.map((s) => s.id)).toEqual(['lado']);
    expect(d.diagnosticos).toHaveLength(1);
    expect(d.cotas[0]).toMatchObject({ eixo: 'y', valorMm: 600 });
  });

  it('cota ao longo de z não cabe na planta: vira diagnóstico, sem lançar', () => {
    const ruim: DetalheFamilia = { ...planta, cotas: [{ id: 'cz', de: { tipo: 'plano', id: 'z1' }, ate: { tipo: 'ponto', ponto: ['0', '0', '0'] } }] };
    const d = detalharFamilia(caixa([ruim]), undefined, {}, 'pl')!;
    expect(d.cotas).toEqual([]);
    expect(d.diagnosticos[0]?.onde).toBe('detalhe:pl.cota:cz');
  });

  it('escala 1:20 converte a altura do texto (2,5 mm de papel → 50 mm de modelo)', () => {
    expect(alturaTextoDoModelo(20)).toBeCloseTo(0.05, 9);
    expect(alturaTextoDoModelo(50)).toBeCloseTo(0.125, 9);
    const d = detalharFamilia(caixa([planta]), undefined, {}, 'pl')!;
    expect(d.alturaTexto).toBeCloseTo(0.05, 9);
    expect(d.cotas[0]?.alturaTexto).toBeCloseTo(0.05, 9);
  });

  it('texto da cota em fórmula e detalhe inexistente', () => {
    const t: DetalheFamilia = { ...planta, cotas: [{ ...cotaL, texto: 'L / 2' }] };
    expect(detalharFamilia(caixa([t]), undefined, {}, 'pl')!.cotas[0]?.texto).toBe('500');
    expect(detalharFamilia(caixa([t]), undefined, {}, 'nao')).toBeNull();
  });

  it('é determinístico', () => {
    const f = caixa([planta]);
    expect(JSON.stringify(detalharFamilia(f, undefined, {}, 'pl'))).toBe(JSON.stringify(detalharFamilia(f, undefined, {}, 'pl')));
  });
});
