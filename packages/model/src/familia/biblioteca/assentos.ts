import type { Familia, Peca, Parametro } from '../tipos.ts';
import { bloco, booleano, comprimento, contornoElipse, derivado, enumerado, nova } from './novosApoio.ts';

/*
 * Assentos da Biblioteca: cadeira de jantar, cadeira com braços, banqueta de bancada, banco corrido e puff quadrado. Estrutura
 * reta em chapas e prismas; o assento redondo da banqueta é um polígono de 64 lados. Não há estofado curvo. Medidas em mm,
 * assento da cadeira a 450 mm.
 */

const M = 'madeira_macica';
const E = 'mat_estofado';
const ASSENTOS: ReadonlyArray<readonly [string, string]> = [['madeira', 'Madeira'], ['estofado', 'Estofado']];

function cadeira(bracos: boolean): Familia {
  const pecas: Peca[] = [
    bloco('perna1', 'Perna frontal esquerda', '0', '0', '0', '40', '40', 'hP', M),
    bloco('perna2', 'Perna frontal direita', 'L - 40', '0', '0', '40', '40', 'hP', M),
    bloco('perna3', 'Perna traseira esquerda', '0', 'P - 40', '0', '40', '40', 'hP', M),
    bloco('perna4', 'Perna traseira direita', 'L - 40', 'P - 40', '0', '40', '40', 'hP', M),
    bloco('assento', 'Assento de madeira', '0', '0', 'hA - 30', 'L', 'P', '30', M, { papel: 'bloco', quando: 'assento == "madeira"' }),
    bloco('baseEstofada', 'Base do assento estofado', '0', '0', 'hA - 48', 'L', 'P', '18', M, { quando: 'assento == "estofado"' }),
    bloco('almofada', 'Almofada do assento', '0', '0', 'hA - 30', 'L', 'P', '30', E, { quando: 'assento == "estofado"' }),
    bloco('montante1', 'Montante traseiro esquerdo', '0', 'P - 40', 'hA', '40', '40', 'A - hA', M),
    bloco('montante2', 'Montante traseiro direito', 'L - 40', 'P - 40', 'hA', '40', '40', 'A - hA', M),
    bloco('encosto', 'Encosto', '40', 'P - 30', 'hA + 100', 'L - 80', '20', 'A - hA - 160', M),
    bloco('travessaTopo', 'Travessa do encosto', '40', 'P - 40', 'A - 60', 'L - 80', '40', '60', M),
  ];
  if (bracos) {
    pecas.push(
      bloco('apoioE', 'Apoio do braço esquerdo', '0', '0', 'hA', '40', '40', '200', M),
      bloco('apoioD', 'Apoio do braço direito', 'L - 40', '0', 'hA', '40', '40', '200', M),
      bloco('bracoE', 'Braço esquerdo', '0', '0', 'hA + 200', '50', 'P - 40', '30', M),
      bloco('bracoD', 'Braço direito', 'L - 50', '0', 'hA + 200', '50', 'P - 40', '30', M),
    );
  }
  const parametros: Parametro[] = [
    comprimento('L', 'Largura', bracos ? 580 : 450, bracos ? 520 : 380, bracos ? 700 : 560),
    comprimento('A', 'Altura total', 900, 800, 1100),
    comprimento('P', 'Profundidade', bracos ? 540 : 460, 400, 620),
    comprimento('hA', 'Altura do assento', 450, 400, 500),
    enumerado('assento', 'Assento', 'madeira', ASSENTOS),
    derivado('hP', 'Altura das pernas', 'assento == "madeira" ? hA - 30 : hA - 48'),
  ];
  return nova({
    id: bracos ? 'fam_cadeira_bracos' : 'fam_cadeira',
    nome: bracos ? 'Cadeira com braços' : 'Cadeira de jantar',
    categoria: 'mobiliario',
    descricao: bracos
      ? 'Cadeira com braços de estrutura reta em madeira (assento a 450 mm), assento de madeira ou estofado. Sem estofado curvo: as formas são retas.'
      : 'Cadeira de jantar de estrutura reta em madeira, assento a 450 mm, de madeira ou estofado, com encosto de ripa e travessa.',
    parametros,
    pecas,
    ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '16' }, { id: 'pe', nome: 'Pé regulável', quantidade: '4' }],
    tipos: bracos
      ? [
        { id: 'bracos', nome: 'Com braços (580 × 540)', valores: { L: 580, P: 540, A: 900 } },
        { id: 'bracos_estofada', nome: 'Com braços estofada', valores: { L: 600, P: 560, A: 920, assento: 'estofado' } },
      ]
      : [
        { id: 'jantar', nome: 'Cadeira de jantar (450 × 460)', valores: { L: 450, P: 460, A: 900 } },
        { id: 'estofada', nome: 'Cadeira estofada', valores: { L: 460, P: 470, A: 920, assento: 'estofado' } },
        { id: 'compacta', nome: 'Cadeira compacta', valores: { L: 400, P: 420, A: 850 } },
      ],
    tipoPadrao: bracos ? 'bracos' : 'jantar',
  });
}

export const FAMILIA_CADEIRA: Familia = cadeira(false);
export const FAMILIA_CADEIRA_BRACOS: Familia = cadeira(true);

export const FAMILIA_BANQUETA: Familia = nova({
  id: 'fam_banqueta',
  nome: 'Banqueta de bancada',
  categoria: 'mobiliario',
  descricao: 'Banqueta alta de estrutura reta com assento quadrado ou redondo (polígono de 64 lados), 4 pernas e travessas de apoio para os pés.',
  parametros: [
    comprimento('L', 'Largura', 380, 300, 480),
    comprimento('A', 'Altura do assento', 650, 550, 800),
    comprimento('P', 'Profundidade', 380, 300, 480),
    enumerado('assento', 'Assento', 'quadrado', [['quadrado', 'Quadrado'], ['redondo', 'Redondo']]),
    derivado('ix', 'Recuo X das pernas', 'L * 0.12'),
    derivado('iy', 'Recuo Y das pernas', 'P * 0.12'),
    derivado('zT', 'Altura da travessa', 'A * 0.35'),
  ],
  pecas: [
    bloco('assentoQ', 'Assento quadrado', '0', '0', 'A - 40', 'L', 'P', '40', M, { quando: 'assento == "quadrado"' }),
    bloco('assentoR', 'Assento redondo', '0', '0', 'A - 40', 'L', 'P', '40', M, { quando: 'assento == "redondo"', contorno: contornoElipse('L', 'P') }),
    bloco('perna1', 'Perna frontal esquerda', 'ix', 'iy', '0', '36', '36', 'A - 40', M),
    bloco('perna2', 'Perna frontal direita', 'L - ix - 36', 'iy', '0', '36', '36', 'A - 40', M),
    bloco('perna3', 'Perna traseira esquerda', 'ix', 'P - iy - 36', '0', '36', '36', 'A - 40', M),
    bloco('perna4', 'Perna traseira direita', 'L - ix - 36', 'P - iy - 36', '0', '36', '36', 'A - 40', M),
    bloco('travF', 'Travessa frontal', 'ix + 36', 'iy', 'zT', 'L - 2 * ix - 72', '18', '18', M),
    bloco('travT', 'Travessa traseira', 'ix + 36', 'P - iy - 18', 'zT', 'L - 2 * ix - 72', '18', '18', M),
    bloco('travE', 'Travessa esquerda', 'ix', 'iy + 36', 'zT', '18', 'P - 2 * iy - 72', '18', M),
    bloco('travD', 'Travessa direita', 'L - ix - 18', 'iy + 36', 'zT', '18', 'P - 2 * iy - 72', '18', M),
  ],
  ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '16' }, { id: 'pe', nome: 'Pé regulável', quantidade: '4' }],
  tipos: [
    { id: 'balcao', nome: 'Banqueta de balcão (650)', valores: { A: 650 } },
    { id: 'bancada_alta', nome: 'Banqueta de bancada alta (750)', valores: { A: 750 } },
    { id: 'redonda', nome: 'Banqueta redonda (650)', valores: { A: 650, assento: 'redondo' } },
  ],
  tipoPadrao: 'balcao',
});

export const FAMILIA_BANCO_CORRIDO: Familia = nova({
  id: 'fam_banco_corrido',
  nome: 'Banco corrido',
  categoria: 'mobiliario',
  descricao: 'Banco corrido comprido (mesa de jantar, hall ou sapateira) com assento de 450 mm sobre dois painéis laterais e travessa; encosto opcional quando a altura passa de 550 mm.',
  parametros: [
    comprimento('L', 'Comprimento', 1500, 800, 2600),
    comprimento('A', 'Altura total', 450, 450, 950),
    comprimento('P', 'Profundidade', 350, 300, 500),
    booleano('encosto', 'Encosto', false),
    derivado('hA', 'Altura do assento', '450'),
    derivado('pAss', 'Profundidade do assento', 'encosto && A > hA + 100 ? P - 40 : P'),
  ],
  pecas: [
    bloco('assento', 'Assento', '0', '0', 'hA - 40', 'L', 'pAss', '40', M),
    bloco('encostoP', 'Encosto', '0', 'P - 40', 'hA - 40', 'L', '40', 'A - hA + 40', M, { quando: 'encosto && A > hA + 100' }),
    { id: 'lateralE', nome: 'Painel lateral esquerdo', papel: 'lateral', eixo: 'x', origem: ['60', '40', '0'], tamanho: ['P - 80', 'hA - 40'], espessura: '40', material: M, veio: 'livre' },
    { id: 'lateralD', nome: 'Painel lateral direito', papel: 'lateral', eixo: 'x', origem: ['L - 100', '40', '0'], tamanho: ['P - 80', 'hA - 40'], espessura: '40', material: M, veio: 'livre' },
    bloco('travessa', 'Travessa', '100', 'P - 90', 'hA - 120', 'L - 200', '30', '80', M),
  ],
  ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '12' }, { id: 'minifix', nome: 'Parafuso minifix', quantidade: '4' }],
  tipos: [
    { id: 'banco150', nome: 'Banco 1,50 m (1500 × 350)', valores: { L: 1500, P: 350, A: 450 } },
    { id: 'banco_encosto', nome: 'Banco com encosto (1800 × 450)', valores: { L: 1800, P: 450, A: 850, encosto: true } },
    { id: 'banco100', nome: 'Banco curto 1,00 m', valores: { L: 1000, P: 350, A: 450 } },
  ],
  tipoPadrao: 'banco150',
});

export const FAMILIA_PUFF: Familia = nova({
  id: 'fam_puff',
  nome: 'Puff quadrado',
  categoria: 'mobiliario',
  descricao: 'Puff quadrado estofado com cantos chanfrados sobre uma base de madeira recuada. Formas retas, sem estofado curvo.',
  parametros: [
    comprimento('L', 'Largura', 450, 350, 700),
    comprimento('A', 'Altura', 420, 300, 500),
    comprimento('P', 'Profundidade', 450, 350, 700),
    derivado('c', 'Chanfro dos cantos', 'min(L, P) * 0.08'),
  ],
  pecas: [
    bloco('base', 'Base de madeira', '25', '25', '0', 'L - 50', 'P - 50', '40', M),
    bloco('corpo', 'Corpo estofado', '0', '0', '40', 'L', 'P', 'A - 40', E, {
      contorno: { tipo: 'poligono', pontos: [['c', '0'], ['L - c', '0'], ['L', 'c'], ['L', 'P - c'], ['L - c', 'P'], ['c', 'P'], ['0', 'P - c'], ['0', 'c']] },
    }),
  ],
  ferragens: [{ id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '4' }],
  tipos: [
    { id: 'puff45', nome: 'Puff 450 × 450', valores: { L: 450, P: 450, A: 420 } },
    { id: 'puff60', nome: 'Puff 600 × 600', valores: { L: 600, P: 600, A: 400 } },
    { id: 'puff_retangular', nome: 'Puff retangular 700 × 400', valores: { L: 700, P: 400, A: 380 } },
  ],
  tipoPadrao: 'puff45',
});

export const ASSENTOS_NOVOS: Familia[] = [FAMILIA_CADEIRA, FAMILIA_CADEIRA_BRACOS, FAMILIA_BANQUETA, FAMILIA_BANCO_CORRIDO, FAMILIA_PUFF];
