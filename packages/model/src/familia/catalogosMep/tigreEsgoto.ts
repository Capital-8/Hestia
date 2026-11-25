import { catalogoTigre, tabelaTigre, TIGRE_FABRICANTE } from './tigreComum.ts';

/*
 * Tigre, esgoto predial: tubos das séries normal e reforçada (fichas técnicas em PDF, texto do pdftotext).
 * Transcrição MANUAL, número a número. Conexões destas fichas ficaram de fora: os títulos das tabelas não aparecem
 * no texto extraído (ver o README de catálogos, seção Tigre). Todo item nasce CONFERIR.
 */

const TUBO_COLUNAS = {
  B: 'profundidade da bolsa',
  D: 'diâmetro do tubo e da bolsa (leitura nossa: diâmetro externo, CONFERIR)',
  e: 'espessura da parede',
  L: 'comprimento do tubo',
};

const BITOLAS_NORMAL = ['40', '50', '75', '100', '150', '200'];
const BITOLAS_REFORCADA = ['40', '50', '75', '100', '150'];

const NORMAL_FONTE = {
  fabricante: TIGRE_FABRICANTE,
  documento: 'Ficha Técnica Linha Esgoto Série Normal',
  edicao: 'impressa como 03/2015 (URL de 2023)',
  url: 'https://tigresite.s3.amazonaws.com/2023/07/FT_Esgoto-Serie-Normal_2023_final_compressed-1.pdf',
  sha256: 'c9bd25d62ec26433b4c956f07b182f92e8c1ce2c5d962e58a429ee2bab45d43e',
};

const REFORCADA_FONTE = {
  fabricante: TIGRE_FABRICANTE,
  documento: 'Ficha Técnica Esgoto Série Reforçada',
  edicao: 'impressa como 02/2015',
  url: 'https://tigresite.s3.amazonaws.com/fichastecnica/fichas/default/files/produtos/ficha-tecnica/Esgoto Série Reforçada_2015.pdf',
  sha256: '15e0948b9a72b9d21e30df72805687336d148c3236adeee6d60884732e505c35',
};

export const TIGRE_ESGOTO_NORMAL = catalogoTigre({
  id: 'catalogo_tigre_esgoto_normal',
  nome: 'Tigre Esgoto Série Normal',
  dominio: 'esgoto',
  fonte: NORMAL_FONTE,
  itens: [
    tabelaTigre({
      id: 'tubo_esgoto_serie_normal_6m',
      nome: 'Tubo de PVC Esgoto Série Normal 6 m',
      tipo: 'tubo',
      serie: 'Esgoto série normal',
      pagina: 1,
      colunas: TUBO_COLUNAS,
      bitolas: BITOLAS_NORMAL,
      cotas: {
        B: [26, 42, 48, 55, 73, 77],
        D: [40, 50.7, 75.5, 101.6, 150, 200],
        e: [1.2, 1.6, 1.7, 1.8, 2.5, 3.6],
        L: [6000, 6000, 6000, 6000, 6000, 6000],
      },
      notas: { '40': 'Pela ficha, o DN 40 tem bolsa para junta soldável (ver texto da ficha).' },
    }),
    tabelaTigre({
      id: 'tubo_esgoto_serie_normal_3m',
      nome: 'Tubo de PVC Esgoto Série Normal 3 m',
      tipo: 'tubo',
      serie: 'Esgoto série normal',
      pagina: 4,
      colunas: TUBO_COLUNAS,
      bitolas: BITOLAS_NORMAL,
      cotas: {
        B: [26, 42, 48, 55, 73, 77],
        D: [40, 50.7, 75.5, 101.6, 150, 200],
        e: [1.2, 1.6, 1.7, 1.8, 2.5, 3.6],
        L: [3000, 3000, 3000, 3000, 3000, 3000],
      },
      notas: { '200': 'O cabeçalho impresso diz "1200" (erro de impressão); a coluna é a do DN 200.' },
    }),
  ],
});

export const TIGRE_ESGOTO_REFORCADA = catalogoTigre({
  id: 'catalogo_tigre_esgoto_reforcada',
  nome: 'Tigre Esgoto Série Reforçada',
  dominio: 'esgoto',
  fonte: REFORCADA_FONTE,
  itens: [
    tabelaTigre({
      id: 'tubo_esgoto_serie_reforcada_6m',
      nome: 'Tubo de PVC Esgoto Série Reforçada 6 m',
      tipo: 'tubo',
      serie: 'Esgoto série reforçada',
      pagina: 3,
      colunas: TUBO_COLUNAS,
      bitolas: BITOLAS_REFORCADA,
      cotas: {
        B: [40, 42, 48, 55, 73],
        D: [40, 50.7, 75.5, 101.6, 150],
        e: [1.8, 1.8, 2, 2.5, 3.6],
        L: [6000, 6000, 6000, 6000, 6000],
      },
    }),
    tabelaTigre({
      id: 'tubo_esgoto_serie_reforcada_3m',
      nome: 'Tubo de PVC Esgoto Série Reforçada 3 m',
      tipo: 'tubo',
      serie: 'Esgoto série reforçada',
      pagina: 3,
      colunas: TUBO_COLUNAS,
      bitolas: BITOLAS_REFORCADA,
      cotas: {
        B: [40, 42, 48, 55, 73],
        D: [40, 50.7, 75.5, 101.6, 150],
        e: [1.8, 1.8, 2, 2.5, 3.6],
        L: [3000, 3000, 3000, 3000, 3000],
      },
      notas: { '40': 'Profundidade da bolsa B = 40 mm no DN 40 reforçado (na série normal, 26 mm).' },
    }),
  ],
});
