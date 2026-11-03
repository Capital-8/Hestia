import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia } from '../tipos.ts';
import { chapa, comprimento, derivado, FITA_PVC } from './geralApoio.ts';

export const FAMILIA_PRATELEIRA: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_prateleira',
  nome: 'Prateleira suspensa',
  categoria: 'marcenaria',
  descricao: 'Prateleira de chapa fixada na parede a uma cota escolhida, disponível em três larguras.',
  unidade: 'mm',
  hospedagem: 'parede',
  origem: 'canto',
  parametros: [
    comprimento('L', 'Largura', 800, 300, 1200),
    comprimento('A', 'Altura máxima de fixação', 2400, 300, 3000),
    comprimento('P', 'Profundidade', 250, 150, 500),
    comprimento('zFixacao', 'Cota da fixação', 1200, 300, 2400),
    chapa('prateleiraChapa', 'Chapa da prateleira', 'mdf25', ['mdf25']),
    derivado('esp', 'Espessura da prateleira', 'prateleiraChapa.esp'),
    derivado('zPrat', 'Cota da prateleira', 'clamp(zFixacao, 0, A)'),
  ],
  planos: [],
  pecas: [
    { id: 'prateleira', nome: 'Prateleira', papel: 'prateleira', eixo: 'z', origem: ['0', '0', 'zPrat'], tamanho: ['L', 'P'], espessura: 'esp', material: 'prateleiraChapa', fita: { n: FITA_PVC }, veio: 'a' },
  ],
  aninhados: [],
  ferragens: [],
  tipos: [
    { id: 'prat600', nome: 'Prateleira 600', valores: { L: 600 } },
    { id: 'prat800', nome: 'Prateleira 800', valores: { L: 800 } },
    { id: 'prat1000', nome: 'Prateleira 1000', valores: { L: 1000 } },
  ],
  tipoPadrao: 'prat800',
};
