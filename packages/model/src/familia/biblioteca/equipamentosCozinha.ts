import type { Familia } from '../tipos.ts';
import { bloco, comprimento, contornoOctogono, derivado, enumerado, inteiro, nova, placaY } from './novosApoio.ts';

/*
 * Equipamentos de cozinha e lavanderia da Biblioteca: geladeira (1 e 2 portas), fogão de 4 bocas, cooktop, forno embutido,
 * micro-ondas, lava-louças e máquina de lavar. Caixas com portas, puxadores, grelhas e botões, em dimensões nominais de mercado;
 * a frente fica em y = 0. Material: `mat_eletro` (branco, tingível), `mat_metal` (inox), `mat_preto` e `mat_vidro` (vidro fumê).
 * Medidas em mm.
 */

const EL = 'mat_eletro';
const IN = 'mat_metal';
const PR = 'mat_preto';
const VI = 'mat_vidro';
const CAVILHA = { id: 'pe', nome: 'Pé regulável', quantidade: '4' };

export const FAMILIA_GELADEIRA: Familia = nova({
  id: 'fam_geladeira',
  nome: 'Geladeira',
  categoria: 'equipamento',
  descricao: 'Geladeira de 1 porta ou duplex de 2 portas (freezer em cima), com grelha inferior e puxadores. Nominal 0,70 × 0,70 × 1,80 m.',
  parametros: [
    comprimento('L', 'Largura', 700, 550, 950),
    comprimento('A', 'Altura', 1800, 1500, 2000),
    comprimento('P', 'Profundidade', 700, 600, 800),
    enumerado('portas', 'Portas', 'duas', [['uma', '1 porta'], ['duas', '2 portas (duplex)']]),
    derivado('fz', 'Altura da porta do freezer', 'A * 0.3'),
  ],
  pecas: [
    bloco('corpo', 'Corpo', '0', '40', '0', 'L', 'P - 40', 'A', EL),
    bloco('grelha', 'Grelha inferior', '2', '0', '0', 'L - 4', '40', '100', PR),
    placaY('porta', 'Porta', 'porta', '2', '20', '102', 'L - 4', 'A - 104', '20', EL, { quando: 'portas == "uma"' }),
    placaY('portaInferior', 'Porta do refrigerador', 'porta', '2', '20', '102', 'L - 4', 'A - fz - 104', '20', EL, { quando: 'portas == "duas"' }),
    placaY('portaFreezer', 'Porta do freezer', 'porta', '2', '20', 'A - fz + 2', 'L - 4', 'fz - 4', '20', EL, { quando: 'portas == "duas"' }),
    bloco('puxador', 'Puxador', 'L - 70', '0', 'A * 0.45', '20', '20', '400', IN, { quando: 'portas == "uma"' }),
    bloco('puxadorInferior', 'Puxador do refrigerador', 'L - 70', '0', 'A - fz - 440', '20', '20', '400', IN, { quando: 'portas == "duas"' }),
    bloco('puxadorFreezer', 'Puxador do freezer', 'L - 70', '0', 'A - fz + 40', '20', '20', '200', IN, { quando: 'portas == "duas"' }),
  ],
  ferragens: [{ id: 'dobradica', nome: 'Dobradiça 35 mm', quantidade: 'portas == "uma" ? ((A - 104) <= 900 ? 2 : ((A - 104) <= 1600 ? 3 : 4)) : (((A - fz - 104) <= 900 ? 2 : ((A - fz - 104) <= 1600 ? 3 : 4)) + ((fz - 4) <= 900 ? 2 : 3))' }, CAVILHA],
  tipos: [
    { id: 'uma_porta', nome: 'Geladeira 1 porta (0,60 × 0,65 × 1,50 m)', valores: { L: 600, P: 650, A: 1500, portas: 'uma' } },
    { id: 'duplex', nome: 'Geladeira duplex 2 portas (0,70 × 0,70 × 1,80 m)', valores: { L: 700, P: 700, A: 1800, portas: 'duas' } },
    { id: 'duplex_grande', nome: 'Geladeira duplex grande (0,80 × 0,75 × 1,85 m)', valores: { L: 800, P: 750, A: 1850, portas: 'duas' } },
  ],
  tipoPadrao: 'duplex',
});

export const FAMILIA_FOGAO: Familia = nova({
  id: 'fam_fogao',
  nome: 'Fogão 4 bocas',
  categoria: 'equipamento',
  descricao: 'Fogão de piso de 4 bocas com mesa em inox, porta de forno em vidro, puxador, painel com 5 botões e pés. Nominal 0,50 × 0,60 × 0,88 m.',
  parametros: [
    comprimento('L', 'Largura', 500, 480, 900),
    comprimento('A', 'Altura', 880, 850, 950),
    comprimento('P', 'Profundidade', 600, 550, 700),
  ],
  pecas: [
    bloco('pe1', 'Pé frontal esquerdo', '20', '30', '0', '40', '40', '50', IN),
    bloco('pe2', 'Pé frontal direito', 'L - 60', '30', '0', '40', '40', '50', IN),
    bloco('pe3', 'Pé traseiro esquerdo', '20', 'P - 70', '0', '40', '40', '50', IN),
    bloco('pe4', 'Pé traseiro direito', 'L - 60', 'P - 70', '0', '40', '40', '50', IN),
    bloco('corpo', 'Corpo', '0', '20', '50', 'L', 'P - 20', 'A - 80', EL),
    placaY('porta', 'Porta do forno', 'porta', '30', '10', '120', 'L - 60', 'A - 300', '10', VI),
    bloco('puxador', 'Puxador do forno', '60', '0', 'A - 205', 'L - 120', '10', '20', IN),
    placaY('painel', 'Painel de comandos', 'painel', '0', '10', 'A - 170', 'L', '140', '10', PR),
    bloco('botao', 'Botão', 'L * i / 6 - 15', '0', 'A - 120', '30', '10', '30', IN, { repetir: '5' }),
    bloco('mesa', 'Mesa de inox', '0', '0', 'A - 30', 'L', 'P', '15', IN, { papel: 'tampo' }),
    bloco('queimador', 'Queimador', 'L * (0.27 + (i - 2 * floor((i - 1) / 2) - 1) * 0.46) - 50', 'P * (0.28 + floor((i - 1) / 2) * 0.44) - 50', 'A - 15', '100', '100', '15', PR, { repetir: '4' }),
  ],
  ferragens: [CAVILHA, { id: 'puxador', nome: 'Puxador 128 mm', quantidade: '1' }],
  tipos: [
    { id: 'fogao50', nome: 'Fogão 0,50 m (500 × 600 × 880)', valores: { L: 500, P: 600, A: 880 } },
    { id: 'fogao60', nome: 'Fogão 0,60 m (600 × 650 × 900)', valores: { L: 600, P: 650, A: 900 } },
    { id: 'fogao76', nome: 'Fogão 0,76 m (760 × 650 × 900)', valores: { L: 760, P: 650, A: 900 } },
  ],
  tipoPadrao: 'fogao50',
});

export const FAMILIA_COOKTOP: Familia = nova({
  id: 'fam_cooktop',
  nome: 'Cooktop',
  categoria: 'equipamento',
  descricao: 'Cooktop de embutir de vidro preto com 2 a 4 bocas e caixa inferior em inox. Nominal 0,58 × 0,51 × 0,06 m.',
  parametros: [
    comprimento('L', 'Largura', 580, 300, 900),
    comprimento('A', 'Altura', 60, 40, 100, 5),
    comprimento('P', 'Profundidade', 510, 400, 600),
    inteiro('bocas', 'Bocas', 4, 2, 4),
    derivado('rs', 'Lado do queimador', 'min(140, L * 0.3, P * 0.3)'),
  ],
  pecas: [
    bloco('caixa', 'Caixa inferior', '20', '20', '0', 'L - 40', 'P - 40', 'A - 12', IN),
    bloco('vidro', 'Vidro do cooktop', '0', '0', 'A - 12', 'L', 'P', '8', PR, { papel: 'tampo' }),
    bloco('queimador', 'Queimador', 'L * (0.27 + (i - 2 * floor((i - 1) / 2) - 1) * 0.46) - rs / 2', 'P * (floor((i - 1) / 2) + 1) / 3 - rs / 2', 'A - 4', 'rs', 'rs', '4', IN, { repetir: 'bocas' }),
  ],
  ferragens: [],
  tipos: [
    { id: 'cooktop4', nome: 'Cooktop 4 bocas (580 × 510)', valores: { L: 580, P: 510, bocas: 4 } },
    { id: 'cooktop5', nome: 'Cooktop 4 bocas largo (750 × 510)', valores: { L: 750, P: 510, bocas: 4 } },
    { id: 'cooktop2', nome: 'Cooktop 2 bocas (360 × 510)', valores: { L: 360, P: 510, bocas: 2 } },
  ],
  tipoPadrao: 'cooktop4',
});

export const FAMILIA_FORNO_EMBUTIDO: Familia = nova({
  id: 'fam_forno_embutido',
  nome: 'Forno embutido',
  categoria: 'equipamento',
  descricao: 'Forno elétrico de embutir em inox com painel de comandos, porta de vidro preto, puxador e 2 botões. Nominal 0,595 × 0,55 × 0,595 m.',
  parametros: [
    comprimento('L', 'Largura', 595, 560, 600, 5),
    comprimento('A', 'Altura', 595, 450, 600, 5),
    comprimento('P', 'Profundidade', 550, 500, 600),
  ],
  pecas: [
    bloco('corpo', 'Corpo', '0', '20', '0', 'L', 'P - 20', 'A', IN),
    placaY('painel', 'Painel de comandos', 'painel', '0', '10', 'A - 100', 'L', '100', '10', PR),
    placaY('porta', 'Porta de vidro', 'porta', '0', '10', '0', 'L', 'A - 100', '10', VI),
    bloco('puxador', 'Puxador', '40', '0', 'A - 160', 'L - 80', '10', '20', IN),
    bloco('botao', 'Botão', 'L * (i * 2 - 1) / 4 - 15', '0', 'A - 65', '30', '10', '30', IN, { repetir: '2' }),
  ],
  ferragens: [],
  tipos: [
    { id: 'forno60', nome: 'Forno 60 cm (595 × 550 × 595)', valores: { L: 595, P: 550, A: 595 } },
    { id: 'forno45', nome: 'Forno compacto 45 cm (595 × 550 × 455)', valores: { L: 595, P: 550, A: 455 } },
  ],
  tipoPadrao: 'forno60',
});

export const FAMILIA_MICROONDAS: Familia = nova({
  id: 'fam_microondas',
  nome: 'Micro-ondas',
  categoria: 'equipamento',
  descricao: 'Micro-ondas de bancada ou de embutir em inox, com porta preta, puxador e painel lateral com botão. Nominal 0,52 × 0,40 × 0,30 m.',
  parametros: [
    comprimento('L', 'Largura', 520, 400, 600),
    comprimento('A', 'Altura', 300, 250, 400),
    comprimento('P', 'Profundidade', 400, 300, 500),
  ],
  pecas: [
    bloco('corpo', 'Corpo', '0', '30', '0', 'L', 'P - 30', 'A', IN),
    placaY('porta', 'Porta', 'porta', '0', '20', '0', 'L * 0.75', 'A', '10', PR),
    placaY('painel', 'Painel de comandos', 'painel', 'L * 0.75', '20', '0', 'L * 0.25', 'A', '10', IN),
    bloco('puxador', 'Puxador', 'L * 0.75 - 40', '0', 'A * 0.2', '20', '20', 'A * 0.6', IN),
    bloco('botao', 'Botão', 'L * 0.875 - 20', '0', 'A * 0.5 - 20', '40', '20', '40', PR),
  ],
  ferragens: [],
  tipos: [
    { id: 'micro30', nome: 'Micro-ondas 30 L (520 × 400 × 300)', valores: { L: 520, P: 400, A: 300 } },
    { id: 'micro20', nome: 'Micro-ondas 20 L (450 × 350 × 260)', valores: { L: 450, P: 350, A: 260 } },
    { id: 'micro_embutir', nome: 'Micro-ondas de embutir (595 × 450 × 390)', valores: { L: 595, P: 450, A: 390 } },
  ],
  tipoPadrao: 'micro30',
});

function frontal(id: string, nome: string, descricao: string, lavar: boolean): Familia {
  return nova({
    id,
    nome,
    categoria: 'equipamento',
    descricao,
    parametros: [
      comprimento('L', 'Largura', 600, 450, 700),
      comprimento('A', 'Altura', 850, 800, 900),
      comprimento('P', 'Profundidade', 600, 500, 700),
    ],
    pecas: [
      bloco('corpo', 'Corpo', '0', '40', '0', 'L', 'P - 40', 'A', EL),
      placaY('porta', lavar ? 'Porta da máquina' : 'Porta', 'porta', '0', '20', '0', 'L', 'A - 100', '20', EL),
      placaY('painel', 'Painel de comandos', 'painel', '0', '20', 'A - 100', 'L', '100', '20', PR),
      ...(lavar
        ? [placaY('visor', 'Visor de vidro', 'porta', '(L - 300) / 2', '10', '(A - 100 - 300) / 2', '300', '300', '10', VI, { contorno: contornoOctogono(300) })]
        : [bloco('puxador', 'Puxador', 'L * 0.15', '0', 'A - 150', 'L * 0.7', '20', '20', IN)]),
      bloco('botao', 'Botão', 'L * 0.8 - 25', '0', 'A - 75', '50', '20', '50', IN),
    ],
    ferragens: [CAVILHA],
    tipos: lavar
      ? [
        { id: 'lavar8', nome: 'Máquina de lavar 8 kg (600 × 550 × 850)', valores: { L: 600, P: 550, A: 850 } },
        { id: 'lavar11', nome: 'Máquina de lavar 11 kg (600 × 650 × 850)', valores: { L: 600, P: 650, A: 850 } },
      ]
      : [
        { id: 'lava60', nome: 'Lava-louças 60 cm (600 × 600 × 850)', valores: { L: 600, P: 600, A: 850 } },
        { id: 'lava45', nome: 'Lava-louças 45 cm (450 × 600 × 850)', valores: { L: 450, P: 600, A: 850 } },
      ],
    tipoPadrao: lavar ? 'lavar8' : 'lava60',
  });
}

export const FAMILIA_LAVA_LOUCAS: Familia = frontal('fam_lava_loucas', 'Lava-louças', 'Lava-louças de embutir ou de piso com porta frontal, puxador, painel de comandos e botão. Nominal 0,60 × 0,60 × 0,85 m.', false);
export const FAMILIA_MAQUINA_LAVAR: Familia = frontal('fam_maquina_lavar', 'Máquina de lavar roupa', 'Máquina de lavar de carga frontal com porta, visor de vidro octogonal (sem curva verdadeira), painel e botão. Nominal 0,60 × 0,60 × 0,85 m.', true);

export const EQUIPAMENTOS_COZINHA: Familia[] = [
  FAMILIA_GELADEIRA, FAMILIA_FOGAO, FAMILIA_COOKTOP, FAMILIA_FORNO_EMBUTIDO, FAMILIA_MICROONDAS, FAMILIA_LAVA_LOUCAS, FAMILIA_MAQUINA_LAVAR,
];
