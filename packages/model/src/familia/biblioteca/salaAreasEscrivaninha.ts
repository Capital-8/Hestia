import type { Peca } from '../tipos.ts';
import { chapaCorpo, comprimento, criarFamilia, derivado } from './salaAreasComum.ts';

/*
 * Escrivaninha: tampo de 25 mm sobre dois painéis laterais, com uma prateleira de apoio entre eles. Medidas em mm.
 */

const ESP_TAMPO = '25';
const Z_PRATELEIRA = '200';

const PARAMETROS = [
  comprimento('L', 'Largura', 1200, 900, 1800),
  comprimento('A', 'Altura', 740, 700, 800),
  comprimento('P', 'Profundidade', 600, 450, 750),
  chapaCorpo(),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('hTampo', 'Altura dos painéis (até o tampo)', `A - ${ESP_TAMPO}`),
];

const PECAS: Peca[] = [
  { id: 'latE', nome: 'Painel esquerdo', papel: 'lateral', eixo: 'x', origem: ['0', '0', '0'], tamanho: ['P', 'hTampo'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latD', nome: 'Painel direito', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', '0'], tamanho: ['P', 'hTampo'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'prat', nome: 'Prateleira de apoio', papel: 'prateleira', eixo: 'z', origem: ['esp', '0', Z_PRATELEIRA], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '0', 'hTampo'], tamanho: ['L', 'P'], espessura: ESP_TAMPO, material: 'mat_tampo', fita: { n: 'fita_pvc' } },
];

export const FAMILIA_ESCRIVANINHA = criarFamilia({
  id: 'fam_escrivaninha',
  nome: 'Escrivaninha',
  descricao: 'Escrivaninha com tampo de 25 mm sobre dois painéis laterais e uma prateleira de apoio.',
  parametros: PARAMETROS,
  planos: [],
  pecas: PECAS,
  aninhados: [],
  ferragens: [
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' },
    { id: 'cavilha', nome: 'Cavilha', quantidade: '8' },
  ],
  tipos: [
    { id: 'esc1000', nome: 'Escrivaninha 1000', valores: { L: 1000 } },
    { id: 'esc1200', nome: 'Escrivaninha 1200', valores: { L: 1200 } },
    { id: 'esc1500', nome: 'Escrivaninha 1500', valores: { L: 1500 } },
  ],
  tipoPadrao: 'esc1200',
});
