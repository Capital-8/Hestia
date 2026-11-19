import type { LinhaLista, PecaResolvida, PlanoCorte } from '@hestia/engine';
import { CATALOGO_PADRAO, type Chapa } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import {
  chapasPresentes,
  geometriaDaChapa,
  linhasDaChapa,
  nomeDoArquivo,
  pecasEfetivas,
  simboloVeio,
  textoArea,
  textoDimensoesEnv,
  textoMetros,
  textoMm,
  textoMoeda,
  textoPercentual,
} from './familiaLista.ts';

const peca = (dados: Pick<PecaResolvida, 'id' | 'nome' | 'papel' | 'eixo' | 'origem' | 'tamanho' | 'espessura' | 'extensao'>): PecaResolvida => ({
  indice: 1,
  vazio: false,
  contorno: null,
  material: null,
  fita: null,
  veio: null,
  grupo: null,
  chapa: null,
  usinagens: [],
  deAninhado: null,
  ...dados,
});

const linha = (dados: Pick<LinhaLista, 'nome' | 'chapa'> & Partial<LinhaLista>): LinhaLista => ({
  nomes: [dados.nome],
  papel: 'lateral',
  quantidade: 1,
  comprimento: 100,
  largura: 50,
  espessura: 18,
  material: null,
  veio: null,
  fita: { c1: null, c2: null, l1: null, l2: null },
  furos: 0,
  rasgos: 0,
  recortes: 0,
  area: 0.005,
  ids: [dados.nome],
  ...dados,
});

describe('pecasEfetivas', () => {
  const lateral = peca({
    id: 'lat', nome: 'Lateral', papel: 'lateral', eixo: 'x',
    origem: [0, 0, 0], tamanho: [0.6, 0.72], espessura: 0.018, extensao: [0.018, 0.6, 0.72],
  });
  const base = peca({
    id: 'base', nome: 'Base', papel: 'base', eixo: 'z',
    origem: [0.018, 0, 0], tamanho: [0.8, 0.6], espessura: 0.018, extensao: [0.8, 0.6, 0.018],
  });
  const pecas = [lateral, base];

  it('sem cavilhas devolve a mesma lista, sem furos novos', () => {
    const efetivas = pecasEfetivas(pecas, false);
    expect(efetivas).toBe(pecas);
    expect(efetivas.map((p) => p.usinagens.length)).toEqual([0, 0]);
  });

  it('com cavilhas gera 3 furos na face e 3 na borda (6 no total)', () => {
    const efetivas = pecasEfetivas(pecas, true);
    expect(efetivas).not.toBe(pecas);
    expect(efetivas.map((p) => p.usinagens.length)).toEqual([3, 3]);
    expect(efetivas[0]!.usinagens.map((u) => u.face)).toEqual(['b', 'b', 'b']);
    expect(efetivas[1]!.usinagens.map((u) => u.face)).toEqual(['o', 'o', 'o']);
    expect(pecas.map((p) => p.usinagens.length)).toEqual([0, 0]);
  });
});

describe('recorte por chapa', () => {
  const linhas = [
    linha({ nome: 'A', chapa: 'mdf18' }),
    linha({ nome: 'B', chapa: 'mdf15' }),
    linha({ nome: 'C', chapa: 'mdf18' }),
    linha({ nome: 'D', chapa: null }),
  ];

  it('linhasDaChapa mantém a ordem das linhas da chapa', () => {
    expect(linhasDaChapa(linhas, 'mdf18').map((l) => l.nome)).toEqual(['A', 'C']);
    expect(linhasDaChapa(linhas, 'mdf25')).toEqual([]);
  });

  it('chapasPresentes segue a ordem do catálogo e ignora chapa nula ou fora dele', () => {
    expect(chapasPresentes(linhas, CATALOGO_PADRAO).map((c) => c.id)).toEqual(['mdf15', 'mdf18']);
    expect(chapasPresentes([linha({ nome: 'X', chapa: 'inexistente' })], CATALOGO_PADRAO)).toEqual([]);
  });
});

describe('geometriaDaChapa', () => {
  const chapa: Chapa = {
    id: 'mdf18', nome: 'MDF 18 mm', material: 'MDF', espessura: 18,
    largura: 1000, altura: 600, veio: true, refilo: 10,
  };
  const plano: PlanoCorte = {
    chapas: [{
      posicoes: [
        { peca: 0, x: 10, y: 20, w: 100, h: 50, girada: false },
        { peca: 1, x: 200, y: 20, w: 50, h: 100, girada: true },
      ],
      areaUsada: 10000,
    }],
    naoCouberam: [2],
    areaPecas: 10000,
    areaChapas: 980 * 580,
    aproveitamento: 10000 / (980 * 580),
  };

  it('converte as posições para o sistema do SVG (Y para baixo)', () => {
    const g = geometriaDaChapa(plano, chapa);
    expect(g.chapas).toHaveLength(1);
    expect(g.chapas[0]!.util).toEqual({ x: 10, y: 10, w: 980, h: 580 });
    expect(g.chapas[0]!.pecas).toEqual([
      { peca: 0, x: 10, y: 530, w: 100, h: 50, girada: false },
      { peca: 1, x: 200, y: 480, w: 50, h: 100, girada: true },
    ]);
    expect(g.chapas[0]!.areaUsada).toBe(10000);
    expect(g.aproveitamento).toBe(10000 / (980 * 580));
    expect(g.naoCouberam).toEqual([2]);
  });
});

describe('nomeDoArquivo', () => {
  it('junta família, tipo e extensão em minúsculas', () => {
    expect(nomeDoArquivo('fam_armario_baixo', 'A80', 'csv')).toBe('fam_armario_baixo-a80.csv');
    expect(nomeDoArquivo('fam_armario_baixo', 'A80', 'DXF')).toBe('fam_armario_baixo-a80.dxf');
  });

  it('tira acentos, espaços e barras', () => {
    expect(nomeDoArquivo('Família Armário', 'Tipo A/B', 'csv')).toBe('familia-armario-tipo-a-b.csv');
  });

  it('usa reservas quando a parte fica vazia', () => {
    expect(nomeDoArquivo('!!!', '???', '')).toBe('familia-tipo.arquivo');
  });
});

describe('textos da interface', () => {
  it('medidas em milímetros sem zeros à toa', () => {
    expect(textoMm(764)).toBe('764');
    expect(textoMm(12.5)).toBe('12,5');
    expect(textoMm(0.45)).toBe('0,45');
    expect(textoMm(1234.5678)).toBe('1234,568');
  });

  it('área, metros, moeda e porcentagem', () => {
    expect(textoArea(0.392, 4)).toBe('0,3920 m²');
    expect(textoArea(1.5)).toBe('1,5000 m²');
    expect(textoMetros(12.345)).toBe('12,35 m');
    expect(textoMoeda(123.4)).toBe('R$ 123,40');
    expect(textoPercentual(0.725)).toBe('72,5%');
    expect(textoPercentual(0)).toBe('0,0%');
  });

  it('símbolos do veio', () => {
    expect([simboloVeio('comprimento'), simboloVeio('largura'), simboloVeio('livre'), simboloVeio(null)]).toEqual(['↔', '↕', '◌', '']);
  });

  it('dimensões do env em milímetros', () => {
    expect(textoDimensoesEnv({ L: 800, A: 720, P: 560 })).toBe('800 × 720 × 560');
    expect(textoDimensoesEnv({ L: 800, A: 720 })).toBe('800 × 720 × —');
  });
});
