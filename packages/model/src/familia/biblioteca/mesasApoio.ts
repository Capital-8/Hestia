import type { Familia } from '../tipos.ts';
import { gerarMesa } from './mesasGerador.ts';

/*
 * Mesas de apoio da Biblioteca: de centro, lateral, bancada alta e de escritório reta (mesmo gerador das mesas de jantar:
 * tampo em madeira, vidro, mármore ou quartzo sobre bases escolhidas). Medidas em mm; alturas nominais de uso.
 */

export const FAMILIA_MESA_CENTRO: Familia = gerarMesa({
  id: 'fam_mesa_centro',
  nome: 'Mesa de centro',
  descricao: 'Mesa de centro baixa (400 mm), retangular ou redonda de 64 lados, com tampo em madeira, vidro, mármore ou quartzo e base em 4 pés, prateleira, laterais ou pedestal.',
  formas: ['ret', 'redonda'],
  L: [1000, 300, 1400], A: [400, 250, 550], P: [600, 300, 1000],
  bases: ['pes4', 'prateleira', 'laterais', 'pedestal'],
  perna: 50, painel: 30,
  tipos: [
    { id: 'centro100', nome: 'Centro retangular (1000 × 600)', valores: { L: 1000, P: 600, A: 400, formato: 'ret' } },
    { id: 'centro_redonda', nome: 'Centro redonda (800 × 800)', valores: { L: 800, P: 800, A: 380, formato: 'redonda' } },
    { id: 'cubo', nome: 'Cubo (600 × 600)', valores: { L: 600, P: 600, A: 350, formato: 'ret' } },
  ],
  tipoPadrao: 'centro100',
});

export const FAMILIA_MESA_LATERAL: Familia = gerarMesa({
  id: 'fam_mesa_lateral',
  nome: 'Mesa lateral',
  descricao: 'Mesa lateral de apoio (550 mm), quadrada ou redonda de 64 lados, com tampo em madeira, vidro, mármore ou quartzo e base em 4 pés, pedestal ou cruz.',
  formas: ['ret', 'redonda'],
  L: [450, 300, 700], A: [550, 350, 700], P: [450, 300, 700],
  bases: ['pes4', 'pedestal', 'cruz'],
  perna: 40, painel: 25,
  tipos: [
    { id: 'lateral45', nome: 'Lateral quadrada (450 × 450)', valores: { L: 450, P: 450, A: 550, formato: 'ret' } },
    { id: 'lateral_redonda', nome: 'Lateral redonda (500 × 500)', valores: { L: 500, P: 500, A: 520, formato: 'redonda' } },
    { id: 'lateral_alta', nome: 'Lateral alta (400 × 400)', valores: { L: 400, P: 400, A: 650, formato: 'ret' } },
  ],
  tipoPadrao: 'lateral45',
});

export const FAMILIA_BANCADA_ALTA: Familia = gerarMesa({
  id: 'fam_bancada_alta',
  nome: 'Bancada alta',
  descricao: 'Bancada alta de apoio (1000 mm, para banquetas), em tampo de madeira, vidro, mármore ou quartzo, sobre 4 pés, cavalete ou laterais em painel.',
  formas: ['ret'],
  L: [1600, 800, 3000], A: [1000, 850, 1150], P: [600, 400, 900],
  bases: ['pes4', 'cavalete', 'laterais'],
  perna: 70, painel: 40,
  tipos: [
    { id: 'bancada120', nome: 'Bancada 1,20 m (1200 × 500)', valores: { L: 1200, P: 500, A: 1000 } },
    { id: 'bancada160', nome: 'Bancada 1,60 m (1600 × 600)', valores: { L: 1600, P: 600, A: 1000 } },
    { id: 'bancada_bar', nome: 'Bancada de bar 2,00 m (2000 × 600, 1100)', valores: { L: 2000, P: 600, A: 1100 } },
  ],
  tipoPadrao: 'bancada160',
});

export const FAMILIA_MESA_ESCRITORIO: Familia = gerarMesa({
  id: 'fam_mesa_escritorio',
  nome: 'Mesa de escritório reta',
  descricao: 'Mesa de escritório reta de 740 mm de altura, com tampo em madeira, vidro, mármore ou quartzo e base em 4 pés, laterais em painel, cavalete ou trapézio.',
  formas: ['ret'],
  L: [1400, 900, 2200], A: [740, 700, 780], P: [700, 500, 900],
  bases: ['laterais', 'pes4', 'cavalete', 'trapezio'],
  perna: 50, painel: 25,
  tipos: [
    { id: 'esc120', nome: 'Escritório 1,20 m (1200 × 600)', valores: { L: 1200, P: 600 } },
    { id: 'esc140', nome: 'Escritório 1,40 m (1400 × 700)', valores: { L: 1400, P: 700 } },
    { id: 'esc180', nome: 'Escritório 1,80 m (1800 × 750)', valores: { L: 1800, P: 750 } },
  ],
  tipoPadrao: 'esc140',
});

export const MESAS_APOIO: Familia[] = [FAMILIA_MESA_CENTRO, FAMILIA_MESA_LATERAL, FAMILIA_BANCADA_ALTA, FAMILIA_MESA_ESCRITORIO];
