import { catalogoTigre, tabelaTigre, TIGRE_FABRICANTE } from './tigreComum.ts';

/*
 * Tigre, linha elétrica: eletrodutos Tigreflex (amarelo e reforçado), caixas de luz e de embutir, e caixa de passagem
 * elétrica de parede (CPT). Transcrição MANUAL das tabelas "Dimensões (mm)" do texto do pdftotext. Cada PDF é um catálogo
 * (fonte própria, com SHA-256). Os significados das letras das caixas são nossos (CONFERIR). Todo item nasce CONFERIR.
 * Nas caixas, B e C são outras cotas: o validador acusa "B maior que C" nelas, e isso é esperado (ver o teste).
 */

const ELETRODUTO = {
  DE: 'diâmetro externo do eletroduto',
  Di: 'diâmetro interno do eletroduto',
  e: 'espessura da parede',
};

const caixa = (...letras: string[]): Record<string, string> =>
  Object.fromEntries(letras.map((l) => [l, `cota ${l} do desenho (significado CONFERIR)`]));

const LUVA_PRESSAO = { A: 'cota A do desenho (CONFERIR)', B: 'cota B do desenho (CONFERIR)', C: 'cota C do desenho (CONFERIR)' };
const BITOLAS_ELETRODUTO = ['20', '25', '32'];

export const TIGRE_TIGREFLEX_AMARELO = catalogoTigre({
  id: 'catalogo_tigre_tigreflex_amarelo',
  nome: 'Tigre Tigreflex Amarelo (eletroduto e caixas)',
  dominio: 'eletrica',
  fonte: {
    fabricante: TIGRE_FABRICANTE,
    documento: 'Ficha Técnica Tigreflex Amarelo (eletroduto corrugado)',
    edicao: 'impressa como 09/2025',
    url: 'https://tigresite.s3.amazonaws.com/2025/08/FT_Tigreflex-Amarelo-2025-1-1.pdf',
    sha256: 'e122867d181bc4ce1641618c1d00b98420c0edda0c63470598af3a24b63ad660',
  },
  itens: [
    tabelaTigre({
      id: 'eletroduto_corrugado_amarelo',
      nome: 'Eletroduto Corrugado Tigreflex Amarelo (½” a 1”)',
      tipo: 'eletroduto',
      serie: 'Elétrica Tigreflex amarelo',
      pagina: 3,
      colunas: ELETRODUTO,
      bitolas: BITOLAS_ELETRODUTO,
      cotas: { DE: [20, 25, 32], Di: [15, 19.5, 25.7], e: [2.5, 2.8, 3.2] },
      notas: { '20': 'Impresso como 20 (½”); a rolagem (50 m ou 100 m) não é cota e não foi transcrita.' },
    }),
    tabelaTigre({
      id: 'luva_pressao_amarela',
      nome: 'Luva de Pressão Tigreflex Amarela',
      tipo: 'luva',
      serie: 'Elétrica Tigreflex amarelo',
      pagina: 3,
      colunas: LUVA_PRESSAO,
      bitolas: BITOLAS_ELETRODUTO,
      cotas: { A: [41, 41, 41], B: [19.5, 19.5, 19.5], C: [2, 2, 2] },
      notas: { '20': 'Bitola ½” (linha D em polegada não transcrita).' },
    }),
    tabelaTigre({
      id: 'caixa_luz_tigreflex_4x2',
      nome: 'Caixa de Luz Tigreflex 4x2',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex amarelo',
      pagina: 3,
      colunas: caixa('A', 'B', 'C', 'F'),
      bitolas: ['4x2'],
      cotas: { A: [70], B: [108.5], C: [47.5], F: [83.5] },
    }),
    tabelaTigre({
      id: 'caixa_luz_tigreflex_4x4',
      nome: 'Caixa de Luz Tigreflex 4x4',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex amarelo',
      pagina: 3,
      colunas: caixa('A', 'B', 'C', 'F', 'F1'),
      bitolas: ['4x4'],
      cotas: { A: [112], B: [112], C: [47.5], F: [83.5], F1: [45] },
    }),
    tabelaTigre({
      id: 'caixa_3x3_anel_deslizante_tigreflex',
      nome: 'Caixa 3x3 com Anel Deslizante Tigreflex',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex amarelo',
      pagina: 3,
      colunas: caixa('A', 'B', 'C'),
      bitolas: ['3x3'],
      cotas: { A: [83.4], B: [73.9], C: [50.8] },
    }),
    tabelaTigre({
      id: 'caixa_octogonal_fundo_movel_tigreflex',
      nome: 'Caixa de Embutir Octogonal Fundo Móvel Tigreflex',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex amarelo',
      pagina: 3,
      colunas: caixa('A', 'B', 'C'),
      bitolas: ['4x4'],
      cotas: { A: [105.6], B: [85.5], C: [60.5] },
    }),
    tabelaTigre({
      id: 'prolongador_caixa_octogonal_tigreflex',
      nome: 'Prolongador Caixa Octogonal Tigreflex',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex amarelo',
      pagina: 4,
      colunas: caixa('A', 'B', 'C'),
      bitolas: ['4x4'],
      cotas: { A: [105.6], B: [85.5], C: [60.5] },
    }),
  ],
});

export const TIGRE_TIGREFLEX_REFORCADO = catalogoTigre({
  id: 'catalogo_tigre_tigreflex_reforcado',
  nome: 'Tigre Tigreflex Reforçado (eletroduto e caixas)',
  dominio: 'eletrica',
  fonte: {
    fabricante: TIGRE_FABRICANTE,
    documento: 'Ficha Técnica Tigreflex Reforçado (eletroduto, caixas e luvas)',
    edicao: 'impressa como 10/2025',
    url: 'https://tigresite.s3.amazonaws.com/2025/10/FT_Tigreflex-Reforcado-2025_Rev-5.pdf',
    sha256: 'd883c5c14e4df79c45ad7cfe82500d6b33add58f562f661fe3d636a843a2372b',
  },
  itens: [
    tabelaTigre({
      id: 'eletroduto_corrugado_reforcado',
      nome: 'Eletroduto Corrugado Tigreflex Reforçado (½” a 1”)',
      tipo: 'eletroduto',
      serie: 'Elétrica Tigreflex reforçado',
      pagina: 3,
      colunas: ELETRODUTO,
      bitolas: BITOLAS_ELETRODUTO,
      cotas: { DE: [20, 25, 32], Di: [14.6, 18.6, 25.4], e: [2.7, 3.2, 3.3] },
      notas: { '20': 'Impresso como 20 (½”); a rolagem (50 m ou 100 m) não é cota e não foi transcrita.' },
    }),
    tabelaTigre({
      id: 'luva_pressao_reforcada',
      nome: 'Luva de Pressão Tigreflex Reforçada',
      tipo: 'luva',
      serie: 'Elétrica Tigreflex reforçado',
      pagina: 3,
      colunas: LUVA_PRESSAO,
      bitolas: BITOLAS_ELETRODUTO,
      cotas: { A: [41, 41, 41], B: [19.5, 19.5, 19.5], C: [2, 2, 2] },
    }),
    tabelaTigre({
      id: 'caixa_octogonal_fundo_movel_reforcada',
      nome: 'Caixa de Embutir Octogonal Fundo Móvel Tigreflex Reforçado',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex reforçado',
      pagina: 3,
      colunas: caixa('A', 'B', 'C'),
      bitolas: ['4x4'],
      cotas: { A: [105.6], B: [85.5], C: [60.5] },
    }),
    tabelaTigre({
      id: 'prolongador_caixa_octogonal_reforcada',
      nome: 'Prolongador Caixa Octogonal Tigreflex Reforçado',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex reforçado',
      pagina: 3,
      colunas: caixa('A', 'B', 'C'),
      bitolas: ['4x4'],
      cotas: { A: [105.6], B: [85.5], C: [60.5] },
    }),
    tabelaTigre({
      id: 'caixa_3x3_anel_deslizante_reforcada',
      nome: 'Caixa 3x3 com Anel Deslizante Tigreflex Reforçado',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex reforçado',
      pagina: 3,
      colunas: caixa('A', 'B', 'C'),
      bitolas: ['3x3'],
      cotas: { A: [83.4], B: [73.9], C: [50.8] },
    }),
    tabelaTigre({
      id: 'caixa_octogonal_suporte_lajota_reforcada',
      nome: 'Caixa de Embutir Octogonal Fundo Móvel com Suporte para Lajota Tigreflex Reforçado',
      tipo: 'caixa',
      serie: 'Elétrica Tigreflex reforçado',
      pagina: 3,
      colunas: { A: 'cota A mínima (CONFERIR)', Amax: 'cota A máxima (CONFERIR)', B: 'cota B do desenho (CONFERIR)', H: 'altura (CONFERIR)' },
      bitolas: ['4x4'],
      cotas: { A: [250], Amax: [310], B: [112], H: [74] },
      notas: { '4x4': 'A tem faixa de 250 (mín.) a 310 (máx.) mm: a faixa está em duas colunas, A e Amax.' },
    }),
  ],
});

export const TIGRE_CAIXA_PASSAGEM_PAREDE = catalogoTigre({
  id: 'catalogo_tigre_caixa_passagem_parede',
  nome: 'Tigre Caixa de Passagem Elétrica de Parede (CPT)',
  dominio: 'eletrica',
  fonte: {
    fabricante: TIGRE_FABRICANTE,
    documento: 'Ficha Técnica Caixa de Passagem Elétrica de Parede',
    edicao: 'impressa como 01/03 (sem data legível)',
    url: 'https://tigresite.s3.amazonaws.com/fichastecnica/fichas/default/files/produtos/ficha-tecnica/Caixa de Passagem Eletrica Parede_2016.pdf',
    sha256: 'bce96a380f469792b486f8e839aae26161fcaf315bd934927a28af7e4d0ba7f6',
  },
  itens: [
    tabelaTigre({
      id: 'caixa_passagem_parede_embutir',
      nome: 'Caixa de Passagem Elétrica de Parede/Embutir (CPT)',
      tipo: 'caixa',
      serie: 'Caixa de passagem de parede',
      pagina: 3,
      colunas: caixa('A', 'B', 'C', 'D', 'E'),
      bitolas: ['CPT 15', 'CPT 20', 'CPT 30', 'CPT 40'],
      cotas: { A: [173.3, 250, 355.4, 447], B: [186, 240, 525, 447], C: [78.7, 85, 78.7, 85], D: [141, 200, 313, 400], E: [148, 200, 468, 400] },
      notas: {
        'CPT 30': 'B = 525 aqui e 350 na tabela de sobrepor; E = 468 é maior que D = 313. Conferir a impressão.',
        'CPT 40': 'A e B iguais (447) na impressão: conferir.',
      },
    }),
    tabelaTigre({
      id: 'caixa_passagem_parede_sobrepor',
      nome: 'Caixa de Passagem Elétrica de Parede/Sobrepor (CPT)',
      tipo: 'caixa',
      serie: 'Caixa de passagem de parede',
      pagina: 3,
      colunas: caixa('A', 'B', 'C'),
      bitolas: ['CPT 15', 'CPT 20', 'CPT 30', 'CPT 40'],
      cotas: { A: [173, 240, 379, 447], B: [186, 240, 350, 447], C: [88.5, 98, 85.5, 98] },
    }),
  ],
});
