import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Parametro } from '../tipos.ts';
import { chapaCorpo, comprimento, derivado, FITA, FUNDO_ESP } from './dormitorioApoio.ts';

/*
 * Criado-mudo: carcaça pequena sobre quatro pés, com uma gaveta aninhada embaixo, prateleira e nicho aberto em cima, e tampo.
 * Medidas em mm; o pé de 40 × 40 e as folgas são PROPOSTAS do Hestia (ADR 0049 R5).
 */

const ALTURA_GAVETA = 150;
const LADO_PE = 40;

const PARAMETROS: Parametro[] = [
  comprimento('L', 'Largura', 500, 450, 600, 10),
  comprimento('A', 'Altura', 500, 400, 600, 10),
  comprimento('P', 'Profundidade', 400, 350, 450, 10),
  comprimento('peAltura', 'Altura dos pés', 80, 60, 120, 10, 'tipo'),
  chapaCorpo('mdf18'),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('tampoEsp', 'Espessura do tampo', '25'),
  derivado('zBase', 'Topo dos pés', 'peAltura'),
  derivado('hCorpo', 'Altura do corpo', 'A - tampoEsp'),
  derivado('zInt', 'Topo da base', 'zBase + esp'),
  derivado('altGav', 'Altura da frente da gaveta', `${ALTURA_GAVETA}`),
  derivado('zGav', 'Cota da gaveta', `zInt + 4`),
  derivado('zPrat', 'Cota da prateleira', 'zGav + altGav + 4'),
  derivado('fundoEsp', 'Espessura do fundo', `${FUNDO_ESP}`),
];

const pe = (id: string, nome: string, x: string, y: string): Familia['pecas'][number] => ({
  id,
  nome,
  papel: 'bloco',
  eixo: 'z',
  origem: [x, y, '0'],
  tamanho: [`${LADO_PE}`, `${LADO_PE}`],
  espessura: 'peAltura',
  material: 'corpo',
  veio: 'a',
});

export const FAMILIA_CRIADO_MUDO: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_criado_mudo',
  nome: 'Criado-mudo',
  categoria: 'mobiliario',
  descricao: 'Criado-mudo pequeno sobre pés, com uma gaveta, prateleira, nicho aberto e tampo.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: PARAMETROS,
  planos: [
    { id: 'pEsq', nome: 'Esquerda', eixo: 'x', posicao: '0' },
    { id: 'pDir', nome: 'Direita', eixo: 'x', posicao: 'L' },
    { id: 'pFrente', nome: 'Frente', eixo: 'y', posicao: '0' },
  ],
  pecas: [
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'zBase'], tamanho: ['P', 'hCorpo - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['esp', '0', 'zBase'], tamanho: ['L - 2 * esp', 'P - fundoEsp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - fundoEsp', 'zInt'], tamanho: ['L - 2 * esp', 'hCorpo - zInt'], espessura: 'fundoEsp', material: 'mat_fundo', veio: 'livre' },
    { id: 'prateleira', nome: 'Prateleira do nicho', papel: 'prateleira', eixo: 'z', origem: ['esp', '0', 'zPrat'], tamanho: ['L - 2 * esp', 'P - fundoEsp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '-10', 'hCorpo'], tamanho: ['L', 'P + 10'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'a' },
    pe('pe1', 'Pé dianteiro esquerdo', '0', '0'),
    pe('pe2', 'Pé dianteiro direito', `L - ${LADO_PE}`, '0'),
    pe('pe3', 'Pé traseiro esquerdo', '0', `P - ${LADO_PE}`),
    pe('pe4', 'Pé traseiro direito', `L - ${LADO_PE}`, `P - ${LADO_PE}`),
  ],
  aninhados: [
    {
      id: 'gaveta',
      nome: 'Gaveta',
      familiaId: 'fam_gaveta',
      valores: {
        L: 'L - 2 * esp',
        A: 'altGav',
        P: 'P - 10',
      },
      origem: ['esp', '0', 'zGav'],
    },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '1' },
    { id: 'puxador', nome: 'Puxador', quantidade: '1' },
    { id: 'pe', nome: 'Pé regulável', quantidade: '4' },
  ],
  tipos: [
    { id: 'cm450', nome: 'Criado-mudo 45 cm', valores: { L: 450, A: 450, P: 380 } },
    { id: 'cm500', nome: 'Criado-mudo 50 cm', valores: { L: 500, A: 500, P: 400 } },
    { id: 'cm600', nome: 'Criado-mudo 60 cm', valores: { L: 600, A: 600, P: 450 } },
  ],
  tipoPadrao: 'cm500',
};
