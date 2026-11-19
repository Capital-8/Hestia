import type { Familia } from '../tipos.ts';
import { gerarMesa } from './mesasGerador.ts';

/*
 * Mesas de jantar da Biblioteca (ficha "famílias novas"): retangular, redonda (tampo de 64 lados), oval (pista com pontas
 * semicirculares) e extensível (abas que abrem o comprimento). Tampo em madeira, vidro, mármore ou quartzo; base em 4 pés,
 * pedestal prismático, cavalete, trapézio ou cruz. Altura nominal 750 mm. Medidas em mm.
 */

const BASES_JANTAR = ['pes4', 'pedestal', 'cavalete', 'trapezio', 'cruz'] as const;

export const FAMILIA_MESA_JANTAR: Familia = gerarMesa({
  id: 'fam_mesa_jantar',
  nome: 'Mesa de jantar retangular',
  descricao: 'Mesa de jantar retangular de 750 mm de altura, com tampo em madeira, vidro, mármore ou quartzo e base em 4 pés, pedestal prismático, cavalete, trapézio ou cruz.',
  formas: ['ret'],
  L: [1600, 1000, 2800], A: [750, 700, 800], P: [900, 700, 1200],
  bases: [...BASES_JANTAR],
  perna: 60, painel: 50,
  tipos: [
    { id: 'mesa120', nome: 'Mesa de jantar 1,20 m (1200 × 800)', valores: { L: 1200, P: 800 } },
    { id: 'mesa160', nome: 'Mesa de jantar 1,60 m (1600 × 900)', valores: { L: 1600, P: 900 } },
    { id: 'mesa200', nome: 'Mesa de jantar 2,00 m (2000 × 1000)', valores: { L: 2000, P: 1000 } },
  ],
  tipoPadrao: 'mesa160',
});

export const FAMILIA_MESA_JANTAR_REDONDA: Familia = gerarMesa({
  id: 'fam_mesa_jantar_redonda',
  nome: 'Mesa de jantar redonda',
  descricao: 'Mesa de jantar redonda (polígono de 64 lados, sem curva verdadeira) de 750 mm de altura. Com largura diferente da profundidade vira elipse. Tampo em madeira, vidro, mármore ou quartzo.',
  formas: ['redonda'],
  L: [1200, 800, 1800], A: [750, 700, 800], P: [1200, 800, 1800],
  bases: [...BASES_JANTAR],
  perna: 60, painel: 50,
  tipos: [
    { id: 'd100', nome: 'Redonda 1,00 m', valores: { L: 1000, P: 1000 } },
    { id: 'd120', nome: 'Redonda 1,20 m', valores: { L: 1200, P: 1200 } },
    { id: 'd140', nome: 'Redonda 1,40 m', valores: { L: 1400, P: 1400 } },
  ],
  tipoPadrao: 'd120',
});

export const FAMILIA_MESA_JANTAR_OVAL: Familia = gerarMesa({
  id: 'fam_mesa_jantar_oval',
  nome: 'Mesa de jantar oval',
  descricao: 'Mesa de jantar oval em pista (duas pontas semicirculares de 33 pontos, sem curva verdadeira) de 750 mm de altura. A largura deve ser maior que a profundidade.',
  formas: ['oval'],
  L: [1800, 1400, 2600], A: [750, 700, 800], P: [1000, 800, 1200],
  bases: [...BASES_JANTAR],
  perna: 60, painel: 50,
  tipos: [
    { id: 'oval160', nome: 'Oval 1,60 m (1600 × 900)', valores: { L: 1600, P: 900 } },
    { id: 'oval180', nome: 'Oval 1,80 m (1800 × 1000)', valores: { L: 1800, P: 1000 } },
    { id: 'oval220', nome: 'Oval 2,20 m (2200 × 1100)', valores: { L: 2200, P: 1100 } },
  ],
  tipoPadrao: 'oval180',
});

export const FAMILIA_MESA_JANTAR_EXTENSIVEL: Familia = gerarMesa({
  id: 'fam_mesa_jantar_extensivel',
  nome: 'Mesa de jantar extensível',
  descricao: 'Mesa de jantar retangular com duas abas que abrem o comprimento (parâmetro Extensão aberta; zero = fechada). A caixa externa é o comprimento fechado mais a extensão.',
  formas: ['ext'],
  L: [1400, 1000, 2000], A: [750, 700, 800], P: [900, 700, 1100],
  extensao: [0, 0, 800],
  bases: ['pes4', 'pedestal', 'cavalete', 'trapezio'],
  perna: 60, painel: 50,
  tipos: [
    { id: 'fechada', nome: 'Fechada (1400 × 900)', valores: { L: 1400, P: 900, extensao: 0 } },
    { id: 'aberta', nome: 'Aberta (1400 + 600)', valores: { L: 1400, P: 900, extensao: 600 } },
    { id: 'aberta_grande', nome: 'Aberta grande (1800 + 800)', valores: { L: 1800, P: 1000, extensao: 800 } },
  ],
  tipoPadrao: 'fechada',
});

export const MESAS_JANTAR: Familia[] = [FAMILIA_MESA_JANTAR, FAMILIA_MESA_JANTAR_REDONDA, FAMILIA_MESA_JANTAR_OVAL, FAMILIA_MESA_JANTAR_EXTENSIVEL];
