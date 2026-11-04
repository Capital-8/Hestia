import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type Parametro } from '../tipos.ts';
import { conectoresDe } from './conectores.ts';
import { booleano, chapaCorpo, comprimento, derivado, FITA, FUNDO_ESP, inteiro } from './dormitorioApoio.ts';

/*
 * Guarda-roupa: módulo alto de porta de abrir e conjunto que repete esse módulo lado a lado. O módulo tem laterais, base, topo,
 * fundo, duas prateleiras, divisória central opcional, barra de cabides e portas. Medidas em mm.
 */

const PARAMETROS_MODULO: Parametro[] = [
  comprimento('L', 'Largura', 900, 450, 1200, 10),
  comprimento('A', 'Altura', 2400, 1800, 2600, 10),
  comprimento('P', 'Profundidade', 600, 500, 700, 10),
  chapaCorpo('mdf18'),
  booleano('divisoria', 'Divisória central', false),
  inteiro('nPortas', 'Portas', 2, 1, 2),
  derivado('esp', 'Espessura do corpo', 'corpo.esp'),
  derivado('zBase', 'Topo da base', 'esp'),
  derivado('zTopo', 'Base do topo', 'A - esp'),
  derivado('vao', 'Vão interno', 'zTopo - zBase'),
  derivado('folga', 'Folga entre prateleiras', '(vao - 2 * esp) / 3'),
  derivado('zPrat1', 'Prateleira inferior', 'zBase + folga'),
  derivado('zPrat2', 'Prateleira superior', 'zPrat1 + esp + folga'),
  derivado('xDiv', 'Eixo da divisória', 'L / 2 - esp / 2'),
  derivado('zBarra', 'Cota da barra de cabides', 'zTopo - 80'),
  derivado('portaEsp', 'Espessura da porta', '18'),
  derivado('fundoEsp', 'Espessura do fundo', `${FUNDO_ESP}`),
];

export const FAMILIA_GUARDA_ROUPA_MODULO: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_guarda_roupa_modulo',
  nome: 'Guarda-roupa (módulo)',
  categoria: 'marcenaria',
  descricao: 'Módulo alto de guarda-roupa com laterais, base, topo, fundo, prateleiras, barra de cabides e portas.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: PARAMETROS_MODULO,
  planos: [
    { id: 'pEsq', nome: 'Esquerda', eixo: 'x', posicao: '0' },
    { id: 'pDir', nome: 'Direita', eixo: 'x', posicao: 'L' },
    { id: 'pFrente', nome: 'Frente', eixo: 'y', posicao: '0' },
  ],
  pecas: [
    { id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: ['0', '0', '0'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'latD', nome: 'Lateral direita', papel: 'lateral', eixo: 'x', origem: ['L - esp', '0', '0'], tamanho: ['P', 'A'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b' },
    { id: 'base', nome: 'Base', papel: 'base', eixo: 'z', origem: ['esp', '0', '0'], tamanho: ['L - 2 * esp', 'P - fundoEsp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'topo', nome: 'Topo', papel: 'topo', eixo: 'z', origem: ['esp', '0', 'A - esp'], tamanho: ['L - 2 * esp', 'P - fundoEsp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'fundo', nome: 'Fundo', papel: 'fundo', eixo: 'y', origem: ['esp', `P - ${FUNDO_ESP}`, 'esp'], tamanho: ['L - 2 * esp', 'A - 2 * esp'], espessura: `${FUNDO_ESP}`, material: 'mat_fundo', veio: 'livre' },
    { id: 'pratBaixa', nome: 'Prateleira inferior', papel: 'prateleira', eixo: 'z', origem: ['esp', '0', 'zPrat1'], tamanho: ['L - 2 * esp', 'P - fundoEsp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'pratAlta', nome: 'Prateleira superior', papel: 'prateleira', eixo: 'z', origem: ['esp', '0', 'zPrat2'], tamanho: ['L - 2 * esp', 'P - fundoEsp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'a' },
    { id: 'divBaixa', nome: 'Divisória inferior', papel: 'divisoria', eixo: 'x', origem: ['xDiv', '0', 'zBase'], tamanho: ['P - fundoEsp', 'zPrat1 - zBase'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b', quando: 'divisoria' },
    { id: 'divAlta', nome: 'Divisória superior', papel: 'divisoria', eixo: 'x', origem: ['xDiv', '0', 'zPrat1 + esp'], tamanho: ['P - fundoEsp', 'zPrat2 - zPrat1 - esp'], espessura: 'esp', material: 'corpo', fita: { n: FITA }, veio: 'b', quando: 'divisoria' },
    { id: 'barra', nome: 'Barra de cabides', papel: 'bloco', eixo: 'z', origem: ['esp', '100', 'zBarra'], tamanho: ['L - 2 * esp', '40'], espessura: '30', material: 'corpo', veio: 'a' },
    { id: 'porta', nome: 'Porta', papel: 'porta', eixo: 'y', origem: ['(i - 1) * (L / nPortas) + 2', '-portaEsp', '0'], tamanho: ['L / nPortas - 4', 'A'], espessura: 'portaEsp', material: 'mat_porta', fita: { n: FITA, s: FITA, l: FITA, o: FITA }, veio: 'b', repetir: 'nPortas' },
  ],
  aninhados: [],
  ferragens: [
    { id: 'dobradica', nome: 'Dobradiça', quantidade: '(A <= 900 ? 2 : A <= 1600 ? 3 : A <= 2200 ? 4 : 5) * nPortas' },
    { id: 'puxador', nome: 'Puxador', quantidade: 'nPortas' },
    { id: 'pino', nome: 'Pino de prateleira', quantidade: '4' },
  ],
  conectores: conectoresDe('torre'),
  tipos: [
    { id: 'gr450', nome: 'Módulo 45 (1 porta)', valores: { L: 450, nPortas: 1 } },
    { id: 'gr600', nome: 'Módulo 60 (1 porta)', valores: { L: 600, nPortas: 1 } },
    { id: 'gr900', nome: 'Módulo 90 (2 portas)', valores: { L: 900, nPortas: 2 } },
    { id: 'gr1200', nome: 'Módulo 120 (2 portas, com divisória)', valores: { L: 1200, nPortas: 2, divisoria: true } },
  ],
  tipoPadrao: 'gr900',
};

const PARAMETROS_CONJUNTO: Parametro[] = [
  comprimento('L', 'Largura total', 1800, 450, 7200, 10),
  comprimento('A', 'Altura', 2400, 1800, 2600, 10),
  comprimento('P', 'Profundidade', 600, 500, 700, 10),
  comprimento('larguraModulo', 'Largura do módulo', 900, 450, 1200, 10),
  inteiro('nModulos', 'Módulos', 2, 1, 6),
  chapaCorpo('mdf18'),
  booleano('divisoria', 'Divisória central dos módulos', false),
  derivado('larguraTotal', 'Largura dos módulos somados', 'nModulos * larguraModulo'),
];

export const FAMILIA_GUARDA_ROUPA_CONJUNTO: Familia = {
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_guarda_roupa_conjunto',
  nome: 'Guarda-roupa (conjunto)',
  categoria: 'marcenaria',
  descricao: 'Conjunto de guarda-roupa que repete o módulo alto lado a lado, com largura e número de módulos configuráveis.',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: PARAMETROS_CONJUNTO,
  planos: [
    { id: 'pEsq', nome: 'Esquerda', eixo: 'x', posicao: '0' },
    { id: 'pDir', nome: 'Direita', eixo: 'x', posicao: 'larguraTotal' },
    { id: 'pFrente', nome: 'Frente', eixo: 'y', posicao: '0' },
  ],
  pecas: [],
  aninhados: [
    {
      id: 'modulos',
      nome: 'Módulo',
      familiaId: 'fam_guarda_roupa_modulo',
      valores: {
        L: 'larguraModulo',
        A: 'A',
        P: 'P',
        nPortas: 'larguraModulo >= 850 ? 2 : 1',
        divisoria: 'divisoria',
        corpo: 'corpo',
      },
      origem: ['(i - 1) * larguraModulo', '0', '0'],
      repetir: 'nModulos',
    },
  ],
  ferragens: [],
  conectores: conectoresDe('torre'),
  tipos: [
    { id: 'gc2', nome: 'Conjunto de 2 módulos', valores: { nModulos: 2, larguraModulo: 900, L: 1800 } },
    { id: 'gc3', nome: 'Conjunto de 3 módulos estreitos', valores: { nModulos: 3, larguraModulo: 600, L: 1800 } },
    { id: 'gc4', nome: 'Conjunto de 4 módulos', valores: { nModulos: 4, larguraModulo: 900, L: 3600 } },
  ],
  tipoPadrao: 'gc2',
};
