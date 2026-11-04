import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Parametro } from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, derivado, FITA, FUNDO_ESP } from './dormitorioApoio.ts';

/*
 * Cômoda baixa: carcaça com laterais, base, fundo, rodapé, tampo e quatro gavetas aninhadas (fam_gaveta). As gavetas dividem
 * o vão interno em partes iguais, com folga entre as frentes. Medidas em mm; folgas PROPOSTAS pelo Hestia (ADR 0049 R5).
 */

const PARAMETROS: Parametro[] = [
  comprimento('L', 'Largura', 1000, 800, 1400, 10),
  comprimento('A', 'Altura', 900, 700, 1000, 10),
  comprimento('P', 'Profundidade', 480, 400, 560, 10),
  comprimento('rodape', 'Altura do rodapé', 80, 0, 120, 10, 'tipo'),
  chapaCorpo('mdf18'),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('tampoEsp', 'Espessura do tampo', '25'),
  derivado('zBase', 'Topo da base', 'rodape + esp'),
  derivado('hCorpo', 'Altura do corpo', 'A - tampoEsp'),
  derivado('vao', 'Vão interno das gavetas', 'hCorpo - zBase'),
  derivado('folgaGav', 'Folga entre gavetas', '4'),
  derivado('altGav', 'Altura da frente da gaveta', '(vao - 5 * folgaGav) / 4'),
  derivado('largGav', 'Largura da gaveta', 'L - 2 * esp'),
  derivado('profGav', 'Profundidade da gaveta', 'P - 10'),
  derivado('fundoEsp', 'Espessura do fundo', `${FUNDO_ESP}`),
];

export const FAMILIA_COMODA: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_comoda',
  nome: 'Cômoda',
  categoria: 'mobiliario',
  descricao: 'Cômoda baixa com carcaça, tampo, rodapé e quatro gavetas aninhadas, para dormitório.',
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
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'rodape'], tamanho: ['P', 'hCorpo - rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'rodape'], tamanho: ['P', 'hCorpo - rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['esp', '0', 'rodape'], tamanho: ['L - 2 * esp', 'P - fundoEsp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', 'P - fundoEsp', 'zBase'], tamanho: ['L - 2 * esp', 'hCorpo - zBase'], espessura: 'fundoEsp', material: 'mat_fundo', veio: 'livre' },
    { id: 'rodape', nome: 'Rodapé', papel: 'rodape', eixo: 'y', origem: ['esp', '20', '0'], tamanho: ['L - 2 * esp', 'rodape'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a', quando: 'rodape > 0' },
    { id: 'tampo', nome: 'Tampo', papel: 'tampo', eixo: 'z', origem: ['0', '-10', 'hCorpo'], tamanho: ['L', 'P + 10'], espessura: 'tampoEsp', material: 'mat_tampo', fita: { n: FITA }, veio: 'a' },
  ],
  aninhados: [
    {
      id: 'gavetas',
      nome: 'Gaveta',
      familiaId: 'fam_gaveta',
      valores: {
        L: 'largGav',
        A: 'altGav',
        P: 'profGav',
      },
      origem: ['esp', '0', 'zBase + folgaGav + (i - 1) * (altGav + folgaGav)'],
      repetir: '4',
    },
  ],
  ferragens: [
    { id: 'corredica', nome: 'Corrediça telescópica', quantidade: '4' },
    { id: 'puxador', nome: 'Puxador', quantidade: '4' },
    { id: 'pe', nome: 'Pé regulável', quantidade: '4' },
  ],
  conectores: conectoresDe('movel'),
  tipos: [
    { id: 'c900', nome: 'Cômoda 0,90 m', valores: { L: 900 } },
    { id: 'c1000', nome: 'Cômoda 1,00 m', valores: { L: 1000 } },
    { id: 'c1200', nome: 'Cômoda 1,20 m', valores: { L: 1200 } },
  ],
  tipoPadrao: 'c1000',
};
