import type { Peca } from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, criarFamilia, derivado } from './salaAreasComum.ts';

/*
 * Armário alto de lavanderia: base sobre rodapé recuado, laterais, topo, fundo, duas portas e três prateleiras reguláveis.
 * Medidas em mm.
 */

const N_PRATELEIRAS = '3';

const PARAMETROS = [
  comprimento('L', 'Largura', 800, 600, 1000),
  comprimento('A', 'Altura', 1800, 1200, 2400),
  comprimento('P', 'Profundidade', 400, 300, 600),
  comprimento('rodape', 'Altura do rodapé', 100, 0, 150, 10, 'tipo'),
  chapaCorpo(),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('nPrat', 'Prateleiras', N_PRATELEIRAS),
  derivado('zBase', 'Cota do topo da base', 'rodape + esp'),
  derivado('vInt', 'Vão interno vertical', 'A - esp - zBase'),
  derivado('hPorta', 'Altura das portas', 'vInt - 4'),
];

const PECAS: Peca[] = [
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', 'rodape'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'vInt'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'vInt'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['0', '0', 'A - esp'], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - 6', 'zBase'], tamanho: ['L - 2 * esp', 'vInt'], espessura: '6', material: 'mat_fundo' },
  {
    id: 'rodape', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '50', '0'],
    tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' }, quando: 'rodape > 0',
  },
  {
    id: 'porta', nome: 'Porta', papel: 'porta', eixo: 'y', repetir: '2',
    origem: ['(i - 1) * (L / 2) + 2', '-18', 'zBase + 2'],
    tamanho: ['L / 2 - 4', 'hPorta'], espessura: '18', material: 'mat_porta',
    fita: { n: 'fita_pvc', s: 'fita_pvc', l: 'fita_pvc', o: 'fita_pvc' },
  },
  {
    id: 'prat', nome: 'Prateleira', papel: 'prateleira', eixo: 'z', repetir: 'nPrat',
    origem: ['esp', '0', 'zBase + i * (vInt - esp * nPrat) / (nPrat + 1) + (i - 1) * esp'],
    tamanho: ['L - 2 * esp', 'P - 6'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' },
  },
];

export const FAMILIA_ARMARIO_LAVANDERIA = criarFamilia({
  id: 'fam_armario_lavanderia',
  nome: 'Armário de lavanderia',
  descricao: 'Armário alto de lavanderia com duas portas, três prateleiras reguláveis e rodapé recuado.',
  parametros: PARAMETROS,
  planos: [],
  pecas: PECAS,
  aninhados: [],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '(hPorta <= 900 ? 2 : hPorta <= 1600 ? 3 : hPorta <= 2200 ? 4 : 5) * 2' },
    { id: 'puxador', nome: 'Puxador', quantidade: '2' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4 * nPrat' },
  ],
  conectores: conectoresDe('base'),
  tipos: [
    { id: 'lav60', nome: 'Lavanderia 60', valores: { L: 600 } },
    { id: 'lav80', nome: 'Lavanderia 80', valores: { L: 800 } },
  ],
  tipoPadrao: 'lav80',
});
