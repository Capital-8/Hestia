import type { Familia, Tipo } from '../tipos.ts';
import { chapaCorpo, comprimento, derivado, familia, FITA } from './cozinhaComum.ts';

/*
 * Canto em L (ficha E7-cozinha): duas alas de `fam_armario_baixo` sem tampo, uma girada 90°, cobertas por um tampo em L.
 * A ala 2 fica atrás da ala 1, encostada na face de fundo; o tampo é uma peça única com contorno poligonal. Medidas em mm.
 */

const VALORES_ALA = (largura: string): Record<string, string> => ({
  L: largura,
  A: 'A',
  P: 'P',
  tampo: '"sem"',
  corpo: 'corpo',
  nPrat: '0',
  nPortas: '2',
});

const TIPOS_CANTO: Tipo[] = [
  { id: 'L60', nome: 'Canto em L 600', valores: { L: 1200, ala1: 600, ala2: 600 } },
  { id: 'L90', nome: 'Canto em L 900', valores: { L: 1800, ala1: 900, ala2: 900 } },
  { id: 'L120', nome: 'Canto em L 1200', valores: { L: 2400, ala1: 1200, ala2: 1200 } },
];

/** Canto de cozinha em L com duas alas e tampo único poligonal. */
export const FAMILIA_CANTO_L: Familia = familia({
  id: 'fam_canto_l',
  nome: 'Canto em L',
  descricao: 'Canto de cozinha em L com duas alas de armário baixo sem tampo e tampo único em L.',
  parametros: [
    comprimento('L', 'Largura total', 1800, 1200, 2400, 10),
    comprimento('A', 'Altura', 720, 650, 900, 10),
    comprimento('P', 'Profundidade das alas', 560, 500, 600, 10),
    comprimento('ala1', 'Comprimento da ala frontal', 900, 600, 1200, 10),
    comprimento('ala2', 'Comprimento da ala lateral', 900, 600, 1200, 10),
    chapaCorpo(),
    derivado('c1', 'Comprimento efetivo da ala frontal', 'min(ala1, L)'),
    derivado('xRet', 'Largura da ala lateral no tampo', 'P + 18 + (c1 > P + 18 ? 0 : 1)'),
    derivado('yBack', 'Fundo total do canto', 'P + ala2'),
  ],
  pecas: [
    {
      id: 'tampo',
      nome: 'Tampo em L',
      papel: 'tampo',
      eixo: 'z',
      origem: ['0', '-20', 'A'],
      tamanho: ['max(c1, xRet)', 'yBack + 20'],
      espessura: '25',
      material: 'mat_tampo',
      fita: { n: FITA },
      veio: 'a',
      contorno: {
        tipo: 'poligono',
        pontos: [
          ['0', '0'],
          ['c1', '0'],
          ['c1', 'P + 20'],
          ['xRet', 'P + 20'],
          ['xRet', 'yBack + 20'],
          ['0', 'yBack + 20'],
        ],
      },
    },
  ],
  aninhados: [
    {
      id: 'ala1',
      nome: 'Ala frontal',
      familiaId: 'fam_armario_baixo',
      valores: VALORES_ALA('c1'),
      origem: ['0', '0', '0'],
    },
    {
      id: 'ala2',
      nome: 'Ala lateral',
      familiaId: 'fam_armario_baixo',
      valores: VALORES_ALA('ala2'),
      origem: ['P', 'P', '0'],
      rotacao: '90',
    },
  ],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '8' },
    { id: 'puxador', nome: 'Puxador', quantidade: '4' },
  ],
  tipos: TIPOS_CANTO,
  tipoPadrao: 'L90',
});
