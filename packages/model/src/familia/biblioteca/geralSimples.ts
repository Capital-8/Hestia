import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia } from '../tipos.ts';
import { chapa, comprimento, derivado, FITA_PVC, material } from './geralApoio.ts';

export const FAMILIA_MODULO_BRANCO: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_modulo_branco',
  nome: 'Módulo em branco',
  categoria: 'marcenaria',
  descricao: 'Caixa de chapa com laterais, base, topo e fundo, ponto de partida para montar um módulo do zero.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: [
    comprimento('L', 'Largura', 600, 300, 1200),
    comprimento('A', 'Altura', 600, 300, 1800),
    comprimento('P', 'Profundidade', 400, 200, 800),
    chapa('corpo', 'Chapa do corpo', 'mdf18', ['mdf15', 'mdf18', 'mdf25']),
    derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  ],
  planos: [],
  pecas: [
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', '0'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA_PVC }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', '0'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA_PVC }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['esp', '0', '0'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA_PVC }, veio: 'a' },
    { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['esp', '0', 'A - esp'], tamanho: ['L - 2 * esp', 'P'], espessura: 'esp', material: 'corpo', fita: { n: FITA_PVC }, veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - esp', 'esp'], tamanho: ['L - 2 * esp', 'A - 2 * esp'], espessura: 'esp', material: 'corpo', veio: 'livre' },
  ],
  aninhados: [],
  ferragens: [
    { id: 'cavilha', nome: 'Cavilha', quantidade: '8' },
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '4' },
  ],
  tipos: [
    { id: 'M600', nome: 'Módulo 600', valores: { L: 600, A: 600, P: 400 } },
    { id: 'M800', nome: 'Módulo 800', valores: { L: 800, A: 720, P: 400 } },
    { id: 'M1200', nome: 'Módulo 1200', valores: { L: 1200, A: 720, P: 560 } },
  ],
  tipoPadrao: 'M600',
};

export const FAMILIA_BLOCO_LIVRE: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_bloco_livre',
  nome: 'Bloco livre',
  categoria: 'mobiliario',
  descricao: 'Bloco maciço simples de largura, altura e profundidade livres, para móveis e volumes de apoio.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: [
    comprimento('L', 'Largura', 500, 200, 1500),
    comprimento('A', 'Altura', 450, 100, 1200),
    comprimento('P', 'Profundidade', 500, 200, 1000),
    material('material', 'Material', 'madeira_macica'),
  ],
  planos: [],
  pecas: [
    { id: 'bloco', nome: 'Bloco', papel: 'bloco', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'A', material: 'material', veio: 'livre' },
  ],
  aninhados: [],
  ferragens: [],
  tipos: [
    { id: 'bloco500', nome: 'Bloco 500', valores: { L: 500, A: 450, P: 500 } },
    { id: 'bloco800', nome: 'Bloco 800', valores: { L: 800, A: 750, P: 600 } },
    { id: 'banquinho', nome: 'Bloco baixo', valores: { L: 400, A: 350, P: 400 } },
  ],
  tipoPadrao: 'bloco500',
};
