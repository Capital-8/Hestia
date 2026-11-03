import type { Peca } from '../tipos.ts';
import { chapaCorpo, comprimento, criarFamilia, derivado } from './salaAreasComum.ts';

/*
 * Rack baixo: base sobre quatro pés, laterais, dois divisórios formando três nichos abertos, portas nos nichos laterais e
 * tampo. Profundidade inteira (sem fundo). Medidas em mm.
 */

const ALTURA_PE = '60';
const SECAO_PE = '50';
const ESP_TAMPO = '25';

const PARAMETROS = [
  comprimento('L', 'Largura', 1800, 1000, 2400),
  comprimento('A', 'Altura', 500, 350, 800),
  comprimento('P', 'Profundidade', 400, 300, 550),
  chapaCorpo(),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('zBase', 'Cota do topo da base', `${ALTURA_PE} + esp`),
  derivado('hCorpo', 'Altura do corpo (sem tampo)', `A - ${ESP_TAMPO}`),
  derivado('hNicho', 'Altura dos nichos', 'hCorpo - zBase'),
  derivado('vInt', 'Vão interno entre laterais', 'L - 2 * esp'),
  derivado('vNicho', 'Largura de cada nicho', '(vInt - 2 * esp) / 3'),
];

const PECAS: Peca[] = [
  {
    id: 'pe', nome: 'Pé', papel: 'bloco', eixo: 'z', repetir: '4',
    origem: [`i <= 2 ? 0 : L - ${SECAO_PE}`, `(i == 1 || i == 3) ? 0 : P - ${SECAO_PE}`, '0'],
    tamanho: [SECAO_PE, SECAO_PE], espessura: ALTURA_PE, material: 'corpo',
  },
  { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', ALTURA_PE], tamanho: ['L', 'P'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'hNicho'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'hNicho'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'div1', nome: 'Divisória 1', papel: 'divisoria', eixo: 'x', origem: ['esp + vNicho', '0', 'zBase'], tamanho: ['P', 'hNicho'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'div2', nome: 'Divisória 2', papel: 'divisoria', eixo: 'x', origem: ['2 * esp + 2 * vNicho', '0', 'zBase'], tamanho: ['P', 'hNicho'], espessura: 'esp', material: 'corpo', fita: { n: 'fita_pvc' } },
  { id: 'portaE', nome: 'Porta esquerda', papel: 'porta', eixo: 'y', origem: ['esp', '-18', 'zBase'], tamanho: ['vNicho', 'hNicho'], espessura: '18', material: 'mat_porta', fita: { n: 'fita_pvc', s: 'fita_pvc', l: 'fita_pvc', o: 'fita_pvc' } },
  { id: 'portaD', nome: 'Porta direita', papel: 'porta', eixo: 'y', origem: ['L - esp - vNicho', '-18', 'zBase'], tamanho: ['vNicho', 'hNicho'], espessura: '18', material: 'mat_porta', fita: { n: 'fita_pvc', s: 'fita_pvc', l: 'fita_pvc', o: 'fita_pvc' } },
  { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '0', 'hCorpo'], tamanho: ['L', 'P'], espessura: ESP_TAMPO, material: 'mat_tampo', fita: { n: 'fita_pvc' } },
];

export const FAMILIA_RACK = criarFamilia({
  id: 'fam_rack',
  nome: 'Rack',
  descricao: 'Rack baixo com três nichos abertos, portas nos nichos laterais, tampo e pés em bloco.',
  parametros: PARAMETROS,
  planos: [],
  pecas: PECAS,
  aninhados: [],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '4' },
    { id: 'puxador', nome: 'Puxador', quantidade: '2' },
    { id: 'pe', nome: 'Pé regulável', quantidade: '4' },
  ],
  tipos: [
    { id: 'rack140', nome: 'Rack 1400', valores: { L: 1400 } },
    { id: 'rack180', nome: 'Rack 1800', valores: { L: 1800 } },
    { id: 'rack200', nome: 'Rack 2000', valores: { L: 2000 } },
  ],
  tipoPadrao: 'rack180',
});
