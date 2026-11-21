import type { Familia } from '../tipos.ts';
import { bloco, chapaZ, comprimento, contornoElipse, derivado, material, nova, placaX, placaY } from './novosApoio.ts';

/*
 * Famílias de exemplo por disciplina (decisão 0060, adendo 1): blocos simples e honestos para testar as plantas de
 * Hidrossanitário, Elétrico e HVAC sem MEP. O editor só faz peças prismáticas: nada aqui tem curva de verdade — a
 * grelha do ralo é um polígono de 64 lados, e tudo o mais é caixa. Medidas em mm; a FRENTE fica em y = 0.
 * As famílias de parede e de teto levam a altura de instalação no parâmetro `hInst` (escopo instância): as peças
 * nascem em z = hInst, então a instância colocada em z = 0 já fica na altura de instalação, e o `z` da instância
 * sobe tudo por cima. Louça branca é `mat_ceramica`; plástico preto, `mat_preto`; branco de eletrodoméstico,
 * `mat_eletro`; metal, `mat_metal` (os acabamentos do 3D vêm de `acabamentos.ts`).
 */

const CE = 'mat_ceramica';
const EL = 'mat_eletro';
const ME = 'mat_metal';
const PR = 'mat_preto';

// ───────────────────────── hidrossanitário ─────────────────────────

export const FAMILIA_VASO_SANITARIO: Familia = nova({
  id: 'fam_vaso_sanitario',
  nome: 'Vaso sanitário',
  categoria: 'loucas',
  disciplina: 'hidrossanitario',
  descricao: 'Vaso sanitário de caixa acoplada em blocos: bacia com assento na frente e caixa de descarga maciça atrás. Sem curvas nem sifão (virão por bloco importado). Nominal 0,36 × 0,70 × 0,40 m.',
  etiqueta: 'louca',
  parametros: [
    comprimento('L', 'Largura', 360, 320, 420, 5),
    comprimento('P', 'Profundidade', 700, 600, 800, 5),
    comprimento('A', 'Altura total (com a caixa acoplada)', 400, 350, 450, 5),
    comprimento('hB', 'Altura da bacia', 200, 160, 240, 5),
  ],
  pecas: [
    bloco('bacia', 'Bacia', '0', '0', '0', 'L', 'P * 0.65', 'hB', CE),
    bloco('assento', 'Assento', '0', '0', 'hB', 'L', 'P * 0.65', '15', EL),
    bloco('caixa', 'Caixa acoplada', '0', 'P * 0.65', '0', 'L', 'P * 0.35', 'A', CE),
  ],
  tipos: [
    { id: 'vaso360', nome: 'Vaso 360 × 700 × 400', valores: { L: 360, P: 700, A: 400, hB: 200 } },
    { id: 'compacto', nome: 'Vaso compacto 340 × 650 × 380', valores: { L: 340, P: 650, A: 380, hB: 190 } },
    { id: 'conforto', nome: 'Vaso conforto 400 × 750 × 420', valores: { L: 400, P: 750, A: 420, hB: 210 } },
  ],
  tipoPadrao: 'vaso360',
});

export const FAMILIA_LAVATORIO: Familia = nova({
  id: 'fam_lavatorio',
  nome: 'Lavatório de parede',
  categoria: 'loucas',
  disciplina: 'hidrossanitario',
  descricao: 'Lavatório de louça pendurado em parede, de chapas planas (fundo e quatro paredes, no molde da cuba de inox). A altura de instalação vai em `hInst` (piso → fundo da cuba); o sifão não é modelado.',
  hospedagem: 'parede',
  etiqueta: 'louca',
  parametros: [
    comprimento('L', 'Largura', 500, 400, 600, 5),
    comprimento('P', 'Profundidade', 400, 300, 500, 5),
    comprimento('A', 'Altura da cuba', 150, 120, 200, 5),
    comprimento('hInst', 'Altura de instalação (piso → fundo da cuba)', 850, 0, 1200, 10),
    comprimento('e', 'Espessura da parede', 8, 5, 15, 1),
    material('material', 'Material', CE),
  ],
  pecas: [
    chapaZ('fundo', 'Fundo da cuba', 'base', 'e', 'e', 'hInst', 'L - 2 * e', 'P - 2 * e', 'e', 'material'),
    placaY('frente', 'Parede frontal', 'painel', '0', '0', 'hInst', 'L', 'A', 'e', 'material'),
    placaY('traseira', 'Parede traseira', 'painel', '0', 'P - e', 'hInst', 'L', 'A', 'e', 'material'),
    placaX('esquerda', 'Parede esquerda', 'lateral', '0', 'e', 'hInst', 'P - 2 * e', 'A', 'e', 'material'),
    placaX('direita', 'Parede direita', 'lateral', 'L - e', 'e', 'hInst', 'P - 2 * e', 'A', 'e', 'material'),
  ],
  tipos: [
    { id: 'lav50', nome: 'Lavatório 500 × 400 × 150 (0,85 m)', valores: { L: 500, P: 400, A: 150, hInst: 850, e: 8 } },
    { id: 'lav60', nome: 'Lavatório 600 × 450 × 160 (0,85 m)', valores: { L: 600, P: 450, A: 160, hInst: 850, e: 8 } },
    { id: 'lav45', nome: 'Lavatório 450 × 350 × 140 (0,80 m)', valores: { L: 450, P: 350, A: 140, hInst: 800, e: 8 } },
  ],
  tipoPadrao: 'lav50',
});

export const FAMILIA_RALO: Familia = nova({
  id: 'fam_ralo',
  nome: 'Ralo de piso',
  categoria: 'loucas',
  disciplina: 'hidrossanitario',
  descricao: 'Ralo de piso no molde dos quadrados: flange quadrada de inox embutida no piso e grelha redonda (polígono de 64 lados) por cima. Altura total de 15 a 30 mm.',
  etiqueta: 'louca',
  parametros: [
    comprimento('L', 'Largura', 100, 80, 150, 5),
    comprimento('P', 'Profundidade', 100, 80, 150, 5),
    comprimento('A', 'Altura total', 20, 15, 30, 1),
    derivado('gD', 'Diâmetro da grelha', 'min(L, P) - 30'),
  ],
  pecas: [
    bloco('corpo', 'Flange', '0', '0', '0', 'L', 'P', '8', ME),
    bloco('grelha', 'Grelha', '(L - gD) / 2', '(P - gD) / 2', '8', 'gD', 'gD', 'A - 8', ME, { contorno: contornoElipse('gD', 'gD') }),
  ],
  tipos: [
    { id: 'ralo100', nome: 'Ralo 100 × 100 × 20', valores: { L: 100, P: 100, A: 20 } },
    { id: 'ralo150', nome: 'Ralo 150 × 150 × 20', valores: { L: 150, P: 150, A: 20 } },
    { id: 'ralo100baixo', nome: 'Ralo baixo 100 × 100 × 15', valores: { L: 100, P: 100, A: 15 } },
  ],
  tipoPadrao: 'ralo100',
});

// ───────────────────────── elétrico ─────────────────────────

export const FAMILIA_TOMADA: Familia = nova({
  id: 'fam_tomada',
  nome: 'Tomada de parede',
  categoria: 'equipamento',
  disciplina: 'eletrico',
  descricao: 'Tomada em blocos: placa branca na frente (y = 0) e corpo preto atrás. A altura de instalação (piso → fundo da tomada) vai em `hInst`, parâmetro de instância: 0,30 m na baixa e 1,20 m na média.',
  hospedagem: 'parede',
  etiqueta: 'equipamento',
  parametros: [
    comprimento('L', 'Largura', 80, 70, 120, 5),
    comprimento('P', 'Profundidade', 50, 30, 70, 5),
    comprimento('A', 'Altura', 80, 60, 120, 5),
    comprimento('hInst', 'Altura de instalação (piso → fundo)', 300, 0, 2000, 10),
  ],
  pecas: [
    placaY('placa', 'Placa', 'painel', '0', '0', 'hInst', 'L', 'A', '5', EL),
    bloco('corpo', 'Corpo', '10', '5', 'hInst + 10', 'L - 20', 'P - 5', 'A - 20', PR),
  ],
  tipos: [
    { id: 'baixa300', nome: 'Tomada baixa 80 × 50 × 80 (0,30 m)', valores: { L: 80, P: 50, A: 80, hInst: 300 } },
    { id: 'media1200', nome: 'Tomada média 80 × 50 × 80 (1,20 m)', valores: { L: 80, P: 50, A: 80, hInst: 1200 } },
    { id: 'dupla', nome: 'Tomada dupla 115 × 50 × 115 (1,20 m)', valores: { L: 115, P: 50, A: 115, hInst: 1200 } },
  ],
  tipoPadrao: 'baixa300',
});

export const FAMILIA_INTERRUPTOR: Familia = nova({
  id: 'fam_interruptor',
  nome: 'Interruptor de parede',
  categoria: 'equipamento',
  disciplina: 'eletrico',
  descricao: 'Interruptor em blocos: tecla saliente na frente (y = 0), placa branca e corpo preto atrás. A altura de instalação (piso → fundo) vai em `hInst`, parâmetro de instância; 1,30 m é o padrão.',
  hospedagem: 'parede',
  etiqueta: 'equipamento',
  parametros: [
    comprimento('L', 'Largura', 80, 70, 100, 5),
    comprimento('P', 'Profundidade', 50, 30, 70, 5),
    comprimento('A', 'Altura', 80, 60, 120, 5),
    comprimento('hInst', 'Altura de instalação (piso → fundo)', 1300, 0, 2000, 10),
    derivado('tW', 'Largura da tecla', 'L - 30'),
    derivado('tH', 'Altura da tecla', 'min(50, A - 20)'),
  ],
  pecas: [
    bloco('tecla', 'Tecla', '(L - tW) / 2', '0', 'hInst + (A - tH) / 2', 'tW', '8', 'tH', EL),
    placaY('placa', 'Placa', 'painel', '0', '8', 'hInst', 'L', 'A', '5', EL),
    bloco('corpo', 'Corpo', '10', '13', 'hInst + 10', 'L - 20', 'P - 13', 'A - 20', PR),
  ],
  tipos: [
    { id: 'padrao', nome: 'Interruptor 1 tecla 80 × 50 × 80 (1,30 m)', valores: { L: 80, P: 50, A: 80, hInst: 1300 } },
    { id: 'duplo', nome: 'Interruptor 2 teclas 100 × 50 × 80 (1,30 m)', valores: { L: 100, P: 50, A: 80, hInst: 1300 } },
    { id: 'rebaixado', nome: 'Interruptor rebaixado 80 × 50 × 80 (0,90 m)', valores: { L: 80, P: 50, A: 80, hInst: 900 } },
  ],
  tipoPadrao: 'padrao',
});

export const FAMILIA_LUMINARIA_TETO: Familia = nova({
  id: 'fam_luminaria_teto',
  nome: 'Luminária de teto',
  categoria: 'equipamento',
  disciplina: 'eletrico',
  descricao: 'Plafon de teto em blocos: base metálica e difusor branco abaixo de dentro. A altura de instalação (piso → fundo do plafon) vai em `hInst`; 2,70 m é o padrão de pé-direito.',
  hospedagem: 'parede',
  etiqueta: 'equipamento',
  parametros: [
    comprimento('L', 'Largura', 300, 100, 1200, 10),
    comprimento('P', 'Profundidade', 300, 100, 600, 10),
    comprimento('A', 'Altura total', 60, 40, 120, 5),
    comprimento('hInst', 'Altura de instalação (piso → fundo do plafon)', 2700, 0, 4000, 10),
  ],
  pecas: [
    chapaZ('base', 'Base', 'base', '0', '0', 'hInst', 'L', 'P', '10', ME),
    bloco('difusor', 'Difusor', '15', '15', 'hInst + 10', 'L - 30', 'P - 30', 'A - 10', EL),
  ],
  tipos: [
    { id: 'plafon30', nome: 'Plafon 300 × 300 × 60 (2,70 m)', valores: { L: 300, P: 300, A: 60, hInst: 2700 } },
    { id: 'plafon60', nome: 'Plafon 600 × 600 × 70 (2,70 m)', valores: { L: 600, P: 600, A: 70, hInst: 2700 } },
    { id: 'linear120', nome: 'Linear 1200 × 150 × 60 (2,70 m)', valores: { L: 1200, P: 150, A: 60, hInst: 2700 } },
  ],
  tipoPadrao: 'plafon30',
});

export const FAMILIA_QUADRO_DISTRIBUICAO: Familia = nova({
  id: 'fam_quadro_distribuicao',
  nome: 'Quadro de distribuição',
  categoria: 'equipamento',
  disciplina: 'eletrico',
  descricao: 'Quadro de distribuição em blocos: caixa de chapa com porta fechada na frente (y = 0); barramento e disjuntores por dentro não são modelados. Nominal 0,40 × 0,12 × 0,50 m (12 disjuntores).',
  hospedagem: 'parede',
  etiqueta: 'equipamento',
  parametros: [
    comprimento('L', 'Largura', 400, 300, 600, 10),
    comprimento('P', 'Profundidade', 120, 80, 200, 10),
    comprimento('A', 'Altura', 500, 300, 800, 10),
  ],
  pecas: [
    placaY('porta', 'Porta', 'painel', '0', '0', '0', 'L', 'A', '3', EL),
    bloco('corpo', 'Corpo', '0', '3', '0', 'L', 'P - 3', 'A', EL),
  ],
  tipos: [
    { id: 'quadro12', nome: 'Quadro 12 disjuntores 400 × 120 × 500', valores: { L: 400, P: 120, A: 500 } },
    { id: 'quadro8', nome: 'Quadro 8 disjuntores 300 × 100 × 400', valores: { L: 300, P: 100, A: 400 } },
    { id: 'quadro24', nome: 'Quadro 24 disjuntores 500 × 150 × 700', valores: { L: 500, P: 150, A: 700 } },
  ],
  tipoPadrao: 'quadro12',
});

// ───────────────────────── HVAC ─────────────────────────

export const FAMILIA_DIFUSOR_TETO: Familia = nova({
  id: 'fam_difusor_teto',
  nome: 'Difusor de teto',
  categoria: 'equipamento',
  disciplina: 'hvac',
  descricao: 'Difusor de ar em blocos: aro quadrado de face e plenum de chapa acima de dentro. A altura de instalação (piso → face do difusor) vai em `hInst`; 2,70 m é o padrão. Dutos não são modelados.',
  hospedagem: 'parede',
  etiqueta: 'equipamento',
  parametros: [
    comprimento('L', 'Largura', 600, 250, 900, 10),
    comprimento('P', 'Profundidade', 600, 250, 900, 10),
    comprimento('A', 'Altura total', 150, 100, 250, 5),
    comprimento('hInst', 'Altura de instalação (piso → face do difusor)', 2700, 0, 4000, 10),
  ],
  pecas: [
    chapaZ('aro', 'Aro', 'base', '0', '0', 'hInst', 'L', 'P', '10', ME),
    bloco('plenum', 'Plenum', '100', '100', 'hInst + 10', 'L - 200', 'P - 200', 'A - 10', ME),
  ],
  tipos: [
    { id: 'difusor600', nome: 'Difusor 600 × 600 × 150 (2,70 m)', valores: { L: 600, P: 600, A: 150, hInst: 2700 } },
    { id: 'difusor450', nome: 'Difusor 450 × 450 × 150 (2,70 m)', valores: { L: 450, P: 450, A: 150, hInst: 2700 } },
    { id: 'difusor300', nome: 'Difusor 300 × 300 × 120 (2,70 m)', valores: { L: 300, P: 300, A: 120, hInst: 2700 } },
  ],
  tipoPadrao: 'difusor600',
});

/** Famílias de exemplo por disciplina (ficha 3.4b): 3 de hidrossanitário, 4 de elétrico e 1 de HVAC. */
export const DISCIPLINAS_EXEMPLO: Familia[] = [
  FAMILIA_VASO_SANITARIO, FAMILIA_LAVATORIO, FAMILIA_RALO, FAMILIA_TOMADA, FAMILIA_INTERRUPTOR, FAMILIA_LUMINARIA_TETO, FAMILIA_QUADRO_DISTRIBUICAO, FAMILIA_DIFUSOR_TETO,
];
