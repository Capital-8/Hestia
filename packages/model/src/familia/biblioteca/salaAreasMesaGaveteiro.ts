import type { Peca } from '../tipos.ts';
import { chapaCorpo, comprimento, criarFamilia, derivado } from './salaAreasComum.ts';

/*
 * Mesa com gaveteiro: tampo de 25 mm sobre um painel lateral (lado direito) e um gaveteiro de três gavetas aninhadas
 * (`fam_gaveta`) no lado esquerdo. As frentes das gavetas ficam à frente do corpo, alinhadas com a frente da mesa.
 * Medidas em mm.
 */

const ESP_TAMPO = '25';

const PARAMETROS = [
  comprimento('L', 'Largura', 1400, 1000, 2000),
  comprimento('A', 'Altura', 740, 680, 900),
  comprimento('P', 'Profundidade', 650, 500, 800),
  chapaCorpo(),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('hGav', 'Altura até a face inferior do tampo', `A - ${ESP_TAMPO}`),
  derivado('gavL', 'Largura do gaveteiro', '450'),
  derivado('gavP', 'Profundidade do gaveteiro', 'P - 20'),
  derivado('gavIntL', 'Largura interna do gaveteiro', 'gavL - 2 * esp'),
  derivado('gavHInt', 'Altura interna do gaveteiro', 'hGav - 2 * esp'),
  derivado('gavGap', 'Folga entre frentes de gaveta', '2'),
  derivado('gavA', 'Altura da frente de gaveta', '(gavHInt - 2 * gavGap) / 3'),
  derivado('gavProf', 'Profundidade da caixa de gaveta', 'clamp(P - 40, 250, 600)'),
];

const PECAS: Peca[] = [
  { id: 'painelD', nome: 'Painel lateral direito', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', '0'], tamanho: ['P', 'hGav'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '0', 'hGav'], tamanho: ['L', 'P'], espessura: ESP_TAMPO, material: 'mat_tampo', fita: { n: 'fita_pvc' } },
  { id: 'baseGav', nome: 'Base do gaveteiro', papel: 'base', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['gavL', 'gavP'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'topoGav', nome: 'Topo do gaveteiro', papel: 'topo', eixo: 'z', origem: ['0', '0', 'hGav - esp'], tamanho: ['gavL', 'gavP'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latEGav', nome: 'Lateral esquerda do gaveteiro', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'esp'], tamanho: ['gavP', 'gavHInt'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latDGav', nome: 'Lateral direita do gaveteiro', papel: 'lateral', eixo: 'x', origem: ['gavL - esp', '0', 'esp'], tamanho: ['gavP', 'gavHInt'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'fundoGav', nome: 'Fundo do gaveteiro', papel: 'fundo', eixo: 'y', origem: ['esp', 'gavP - 6', 'esp'], tamanho: ['gavIntL', 'gavHInt'], espessura: '6', material: 'mat_fundo' },
];

export const FAMILIA_MESA_GAVETEIRO = criarFamilia({
  id: 'fam_mesa_gaveteiro',
  nome: 'Mesa com gaveteiro',
  descricao: 'Mesa de trabalho com tampo de 25 mm, painel lateral de apoio e gaveteiro de três gavetas aninhadas.',
  parametros: PARAMETROS,
  planos: [],
  pecas: PECAS,
  aninhados: [
    {
      id: 'gavetas',
      nome: 'Gaveta',
      familiaId: 'fam_gaveta',
      repetir: '3',
      valores: { L: 'gavIntL', A: 'gavA', P: 'gavProf' },
      origem: ['esp', '0', 'esp + (i - 1) * (gavA + gavGap)'],
      rotacao: '0',
    },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '3' },
    { id: 'puxador', nome: 'Puxador', quantidade: '3' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' },
  ],
  tipos: [
    { id: 'mesa1200', nome: 'Mesa 1200', valores: { L: 1200 } },
    { id: 'mesa1400', nome: 'Mesa 1400', valores: { L: 1400 } },
    { id: 'mesa1600', nome: 'Mesa 1600', valores: { L: 1600 } },
  ],
  tipoPadrao: 'mesa1400',
});
