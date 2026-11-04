import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Parametro } from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { chapaCorpo, comprimento, derivado, FITA } from './dormitorioApoio.ts';

/*
 * Painel de TV: painel traseiro com base, topo, laterais, duas divisórias e prateleiras formando três nichos. A largura acompanha
 * o painel da TV e os tipos mudam a largura total. Medidas em mm; divisão em três partes iguais PROPOSTA pelo Hestia (ADR 0049 R5).
 */

const PARAMETROS: Parametro[] = [
  comprimento('L', 'Largura do painel', 1800, 1200, 2400, 10),
  comprimento('A', 'Altura', 1200, 900, 1400, 10),
  comprimento('P', 'Profundidade', 300, 250, 400, 10),
  chapaCorpo('mdf18'),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('zInt', 'Topo da base', 'esp'),
  derivado('zTop', 'Base do topo', 'A - esp'),
  derivado('colW', 'Largura de cada nicho', '(L - 4 * esp) / 3'),
  derivado('zPrat1', 'Prateleira baixa', 'zInt + (zTop - zInt) / 3'),
  derivado('zPrat2', 'Prateleira alta', 'zInt + 2 * (zTop - zInt) / 3'),
];

const prateleira = (id: string, nome: string, z: string): Familia['pecas'][number] => ({
  id,
  nome,
  papel: 'prateleira',
  eixo: 'z',
  origem: ['esp + (i - 1) * (colW + esp) + 1', '0', z],
  tamanho: ['colW - 2', 'P - esp'],
  espessura: 'esp',
  material: 'corpo',
  fita: { n: FITA },
  veio: 'a',
  repetir: '3',
});

export const FAMILIA_PAINEL_TV: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_painel_tv',
  nome: 'Painel de TV',
  categoria: 'mobiliario',
  descricao: 'Painel de TV com fundo, base, topo, laterais, divisórias e prateleiras, formando três nichos.',
  unidade: 'mm',
  hospedagem: 'parede',
  origem: 'canto',
  parametros: PARAMETROS,
  planos: [
    { id: 'pEsq', nome: 'Esquerda', eixo: 'x', posicao: '0' },
    { id: 'pDir', nome: 'Direita', eixo: 'x', posicao: 'L' },
    { id: 'pFrente', nome: 'Frente', eixo: 'y', posicao: '0' },
  ],
  pecas: [
    { id: 'painelTras', nome: 'Painel traseiro', papel: 'painel', eixo: 'y', origem: ['0', 'P - esp', '0'], tamanho: ['L', 'A'], espessura: 'esp', material: 'corpo', veio: 'a' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P - esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['0', '0', 'A - esp'], tamanho: ['L', 'P - esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', 'esp'], tamanho: ['P - esp', 'A - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', 'esp'], tamanho: ['P - esp', 'A - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'div1', nome: 'Divisória 1', papel: 'divisoria', eixo: 'x', origem: ['esp + colW', '0', 'esp'], tamanho: ['P - esp', 'A - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'div2', nome: 'Divisória 2', papel: 'divisoria', eixo: 'x', origem: ['esp + 2 * colW + esp', '0', 'esp'], tamanho: ['P - esp', 'A - 2 * esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    prateleira('pratBaixa', 'Prateleira baixa', 'zPrat1'),
    prateleira('pratAlta', 'Prateleira alta', 'zPrat2'),
  ],
  aninhados: [],
  ferragens: [
    { id: 'minifix', nome: 'Parafuso minifix', quantidade: '12' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '12' },
  ],
  conectores: conectoresDe('painel'),
  tipos: [
    { id: 'tv1800', nome: 'Painel 1,80 m', valores: { L: 1800 } },
    { id: 'tv2000', nome: 'Painel 2,00 m', valores: { L: 2000 } },
    { id: 'tv2400', nome: 'Painel 2,40 m', valores: { L: 2400 } },
  ],
  tipoPadrao: 'tv1800',
};
