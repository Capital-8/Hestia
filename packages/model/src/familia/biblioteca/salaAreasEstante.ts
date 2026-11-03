import type { Peca } from '../tipos.ts';
import { chapaCorpo, comprimento, criarFamilia, derivado, inteiro } from './salaAreasComum.ts';

/*
 * Estante aberta: laterais, base, topo, fundo encaixado e prateleiras distribuídas igualmente. O fundo fica entre as
 * laterais, e as prateleiras param nele. Medidas em mm.
 */

const PARAMETROS = [
  comprimento('L', 'Largura', 800, 400, 1600),
  comprimento('A', 'Altura', 1800, 600, 2400),
  comprimento('P', 'Profundidade', 300, 200, 500),
  chapaCorpo(),
  inteiro('nPrat', 'Prateleiras', 3, 1, 8),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('vInt', 'Vão interno vertical', 'A - 2 * esp'),
];

const PECAS: Peca[] = [
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'esp'], tamanho: ['P', 'vInt'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'esp'], tamanho: ['P', 'vInt'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['0', '0', 'A - esp'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'esp'], tamanho: ['L - 2 * esp', 'vInt'], espessura: '6', material: 'mat_fundo' },
  {
    id: 'prat', nome: 'Prateleira', papel: 'prateleira', eixo: 'z', repetir: 'nPrat',
    origem: ['esp', '0', 'esp + i * (vInt - esp * nPrat) / (nPrat + 1) + (i - 1) * esp'],
    tamanho: ['L - 2 * esp', 'P - 6'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' },
  },
];

export const FAMILIA_ESTANTE = criarFamilia({
  id: 'fam_estante',
  nome: 'Estante',
  descricao: 'Estante aberta com laterais, base, topo, fundo e prateleiras reguláveis distribuídas igualmente.',
  parametros: PARAMETROS,
  planos: [],
  pecas: PECAS,
  aninhados: [],
  ferragens: [
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4 * nPrat' },
    { id: 'cavilha', nome: 'Cavilha', quantidade: '8' },
  ],
  tipos: [
    { id: 'estante_600', nome: 'Estante 600', valores: { L: 600, A: 1200 } },
    { id: 'estante_800', nome: 'Estante 800', valores: { L: 800, A: 1800 } },
    { id: 'estante_1000', nome: 'Estante 1000', valores: { L: 1000, A: 2000 } },
  ],
  tipoPadrao: 'estante_800',
});
