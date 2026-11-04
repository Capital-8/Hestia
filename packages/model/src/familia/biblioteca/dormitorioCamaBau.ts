import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Parametro } from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, derivado, FITA } from './dormitorioApoio.ts';

/*
 * Cama com baú: painéis laterais, cabeceira e pé formam a caixa, com base interna e tampa do baú. Os tipos mudam a largura e o
 * comprimento (solteiro, casal e queen) e a altura é comum. Medidas em mm; montagem PROPOSTA pelo Hestia (ADR 0049 R5).
 */

const PARAMETROS: Parametro[] = [
  comprimento('L', 'Largura', 1380, 800, 1600, 10),
  comprimento('A', 'Altura', 400, 300, 500, 10),
  comprimento('P', 'Comprimento', 1880, 1800, 2000, 10),
  chapaCorpo('mdf18'),
  derivado('esp', 'Espessura dos painéis', 'corpo.esp'),
  derivado('tampaEsp', 'Espessura da tampa', '25'),
  derivado('hBau', 'Altura da caixa do baú', 'A - tampaEsp'),
];

export const FAMILIA_CAMA_BAU: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_cama_bau',
  nome: 'Cama com baú',
  categoria: 'mobiliario',
  descricao: 'Cama com baú construída em painéis: cabeceira, pé, laterais, base interna e tampa do baú.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: PARAMETROS,
  planos: [
    { id: 'pEsq', nome: 'Esquerda', eixo: 'x', posicao: '0' },
    { id: 'pDir', nome: 'Direita', eixo: 'x', posicao: 'L' },
    { id: 'pPes', nome: 'Pé da cama', eixo: 'y', posicao: '0' },
    { id: 'pCab', nome: 'Cabeceira', eixo: 'y', posicao: 'P' },
  ],
  pecas: [
    { id: 'pe', nome: 'Pé (painel frontal)', papel: 'painel', eixo: 'y', origem: ['0', '0', '0'], tamanho: ['L', 'hBau'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'cabeceira', nome: 'Cabeceira', papel: 'painel', eixo: 'y', origem: ['0', 'P - esp', '0'], tamanho: ['L', 'hBau'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', 'esp', '0'], tamanho: ['P - 2 * esp', 'hBau'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', 'esp', '0'], tamanho: ['P - 2 * esp', 'hBau'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base interna do baú', papel: 'base', eixo: 'z', origem: ['esp', 'esp', '0'], tamanho: ['L - 2 * esp', 'P - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'tampa', nome: 'Tampa do baú', papel: 'painel', eixo: 'z', origem: ['0', '0', 'hBau'], tamanho: ['L', 'P'], espessura: 'tampaEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'a' },
  ],
  aninhados: [],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '2' },
    { id: 'puxador', nome: 'Puxador', quantidade: '1' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' },
    { id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '8' },
  ],
  conectores: conectoresDe('movel'),
  tipos: [
    { id: 'solteiro', nome: 'Solteiro (880 × 1880)', valores: { L: 880, P: 1880 } },
    { id: 'casal', nome: 'Casal (1380 × 1880)', valores: { L: 1380, P: 1880 } },
    { id: 'queen', nome: 'Queen (1580 × 1980)', valores: { L: 1580, P: 1980 } },
  ],
  tipoPadrao: 'casal',
};
