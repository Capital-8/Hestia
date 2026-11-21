import type { Familia } from '../tipos.ts';
import { bloco, chapaZ, comprimento, derivado, enumerado, nova, placaX, placaY } from './novosApoio.ts';

/*
 * Equipamentos de ambiente da Biblioteca: coifa de parede (copa trapezoidal e chaminé), ar-condicionado split, televisor com suporte
 * de parede e TV com painel (painel de madeira clara com a TV aninhada). Todos em chapas e prismas retos; a frente fica em y = 0.
 * Medidas em mm; telas 16:9 de 43 a 75 polegadas.
 */

const IN = 'mat_metal';
const EL = 'mat_eletro';
const PR = 'mat_preto';

export const FAMILIA_COIFA: Familia = nova({
  id: 'fam_coifa',
  nome: 'Coifa de parede',
  categoria: 'equipamento',
  descricao: 'Coifa de parede em inox: copa em trapézio (perfil com a frente inclinada), filtro inferior e chaminé retangular. Nominal 0,90 m de largura.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura', 900, 600, 1200),
    comprimento('A', 'Altura total', 700, 450, 1000),
    comprimento('P', 'Profundidade', 500, 350, 550),
    comprimento('cW', 'Largura da chaminé', 300, 200, 500),
    derivado('hC', 'Altura da copa', 'min(250, A * 0.4)'),
  ],
  pecas: [
    chapaZ('filtro', 'Filtro de gordura', 'base', '20', '20', '0', 'L - 40', 'P - 40', '8', IN),
    placaX('copa', 'Copa', 'bloco', '0', '0', '8', 'P', 'hC - 8', 'L', IN, {
      contorno: { tipo: 'poligono', pontos: [['0', '0'], ['P', '0'], ['P', 'hC - 8'], ['P * 0.45', 'hC - 8']] },
    }),
    bloco('chamine', 'Chaminé', '(L - cW) / 2', 'P * 0.45', 'hC', 'cW', 'P * 0.55', 'A - hC', IN),
  ],
  ferragens: [],
  tipos: [
    { id: 'coifa90', nome: 'Coifa 90 cm (900 × 500 × 700)', valores: { L: 900, P: 500, A: 700 } },
    { id: 'coifa60', nome: 'Coifa 60 cm (600 × 450 × 650)', valores: { L: 600, P: 450, A: 650 } },
    { id: 'coifa120', nome: 'Coifa 120 cm (1200 × 520 × 800)', valores: { L: 1200, P: 520, A: 800 } },
  ],
  tipoPadrao: 'coifa90',
});

export const FAMILIA_AR_SPLIT: Familia = nova({
  id: 'fam_ar_split',
  nome: 'Ar-condicionado split',
  categoria: 'equipamento',
  disciplina: 'hvac',
  descricao: 'Evaporadora de parede de ar-condicionado split (9.000 a 24.000 BTU): caixa branca com frontal e saída de ar inferior preta. Nominal 0,90 × 0,22 × 0,29 m.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura', 900, 700, 1100),
    comprimento('A', 'Altura', 290, 250, 350),
    comprimento('P', 'Profundidade', 220, 200, 260),
  ],
  pecas: [
    bloco('corpo', 'Corpo', '0', '8', '0', 'L', 'P - 8', 'A', EL),
    placaY('frontal', 'Frontal', 'painel', '0', '0', 'A * 0.3', 'L', 'A * 0.7', '8', EL),
    placaY('saida', 'Saída de ar', 'painel', '0', '0', '0', 'L', 'A * 0.3', '8', PR),
  ],
  ferragens: [],
  tipos: [
    { id: 'split9', nome: 'Split 9.000 BTU (0,80 × 0,20 × 0,28 m)', valores: { L: 800, P: 200, A: 280 } },
    { id: 'split12', nome: 'Split 12.000 BTU (0,90 × 0,22 × 0,29 m)', valores: { L: 900, P: 220, A: 290 } },
    { id: 'split24', nome: 'Split 24.000 BTU (1,10 × 0,25 × 0,33 m)', valores: { L: 1100, P: 250, A: 330 } },
  ],
  tipoPadrao: 'split12',
});

export const FAMILIA_TV: Familia = nova({
  id: 'fam_tv',
  nome: 'TV com suporte de parede',
  categoria: 'equipamento',
  descricao: 'Televisor 16:9 de parede: corpo preto, tela de vidro e suporte metálico atrás. Nominal 55 polegadas = 1,22 × 0,69 m.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura da tela', 1218, 700, 1800),
    comprimento('A', 'Altura da tela', 685, 400, 1050),
    comprimento('P', 'Profundidade com suporte', 80, 60, 120, 5),
  ],
  pecas: [
    bloco('corpo', 'Corpo', '0', '6', '0', 'L', 'P - 31', 'A', PR),
    placaY('tela', 'Tela', 'painel', '10', '0', '10', 'L - 20', 'A - 20', '6', 'mat_vidro'),
    bloco('suporte', 'Suporte de parede', 'L * 0.35', 'P - 25', 'A * 0.35', 'L * 0.3', '25', 'A * 0.3', IN),
  ],
  ferragens: [],
  tipos: [
    { id: 'tv43', nome: 'TV 43 polegadas (952 × 535)', valores: { L: 952, A: 535, P: 80 } },
    { id: 'tv50', nome: 'TV 50 polegadas (1107 × 623)', valores: { L: 1107, A: 623, P: 80 } },
    { id: 'tv55', nome: 'TV 55 polegadas (1218 × 685)', valores: { L: 1218, A: 685, P: 80 } },
    { id: 'tv65', nome: 'TV 65 polegadas (1439 × 809)', valores: { L: 1439, A: 809, P: 80 } },
    { id: 'tv75', nome: 'TV 75 polegadas (1660 × 934)', valores: { L: 1660, A: 934, P: 85 } },
  ],
  tipoPadrao: 'tv55',
});

export const FAMILIA_TV_PAINEL: Familia = nova({
  id: 'fam_tv_painel',
  nome: 'TV com painel',
  categoria: 'equipamento',
  descricao: 'Painel de madeira clara de 18 mm com a TV (TV com suporte de parede aninhada) centralizada, de 43 a 75 polegadas.',
  hospedagem: 'parede',
  parametros: [
    comprimento('L', 'Largura do painel', 2400, 2000, 3600),
    comprimento('A', 'Altura do painel', 1500, 1200, 2400),
    comprimento('P', 'Profundidade total', 98, 80, 130, 2),
    enumerado('diag', 'Tamanho da TV', '55', [['43', '43 polegadas'], ['50', '50 polegadas'], ['55', '55 polegadas'], ['65', '65 polegadas'], ['75', '75 polegadas']]),
    derivado('tvL', 'Largura da TV', 'diag == "43" ? 952 : (diag == "50" ? 1107 : (diag == "55" ? 1218 : (diag == "65" ? 1439 : 1660)))'),
    derivado('tvH', 'Altura da TV', 'diag == "43" ? 535 : (diag == "50" ? 623 : (diag == "55" ? 685 : (diag == "65" ? 809 : 934)))'),
  ],
  pecas: [
    placaY('painel', 'Painel de madeira', 'painel', '0', 'P - 18', '0', 'L', 'A', '18', 'mat_madeira_clara'),
  ],
  aninhados: [
    { id: 'tv', nome: 'TV', familiaId: 'fam_tv', valores: { L: 'tvL', A: 'tvH', P: 'P - 18' }, origem: ['(L - tvL) / 2', '0', '(A - tvH) / 2'] },
  ],
  ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '6' }],
  tipos: [
    { id: 'painel55', nome: 'Painel 2,40 m com TV de 55"', valores: { L: 2400, A: 1500, diag: '55' } },
    { id: 'painel65', nome: 'Painel 2,60 m com TV de 65"', valores: { L: 2600, A: 1600, diag: '65' } },
    { id: 'painel43', nome: 'Painel 2,00 m com TV de 43"', valores: { L: 2000, A: 1300, diag: '43' } },
  ],
  tipoPadrao: 'painel55',
});

export const EQUIPAMENTOS_OUTROS: Familia[] = [FAMILIA_COIFA, FAMILIA_AR_SPLIT, FAMILIA_TV, FAMILIA_TV_PAINEL];
