import type { Familia, Parametro, Peca } from '../tipos.ts';
import { bloco, comprimento, derivado, inteiro, nova, placaX } from './novosApoio.ts';

/*
 * Sofás, poltrona e camas da Biblioteca. Blocos retos (base, braços, almofadas de assento e de encosto): NÃO há estofado curvo,
 * o editor só faz chapas planas. Sofá de 2/3/4 lugares, modular em L com chaise, poltrona, cama (solteiro a king) e beliche.
 * Medidas em mm; assento a 450 mm.
 */

const M = 'madeira_macica';
const E = 'mat_estofado';

/** Pés, base, braços, encosto e almofadas de um sofá reto de `lugares` lugares (também a poltrona, com 1). */
function pecasSofa(): Peca[] {
  return [
    bloco('pe1', 'Pé frontal esquerdo', '40', '40', '0', '60', '60', 'hp', M),
    bloco('pe2', 'Pé frontal direito', 'L - 100', '40', '0', '60', '60', 'hp', M),
    bloco('pe3', 'Pé traseiro esquerdo', '40', 'P - 100', '0', '60', '60', 'hp', M),
    bloco('pe4', 'Pé traseiro direito', 'L - 100', 'P - 100', '0', '60', '60', 'hp', M),
    bloco('estrutura', 'Estrutura da base', '0', '0', 'hp', 'L', 'P', '120', M),
    bloco('bracoE', 'Braço esquerdo', '0', '0', 'hp + 120', 'bracoL', 'P', 'A - hp - 120 - 150', E),
    bloco('bracoD', 'Braço direito', 'L - bracoL', '0', 'hp + 120', 'bracoL', 'P', 'A - hp - 120 - 150', E),
    bloco('costas', 'Costas', 'bracoL', 'P - encostoP', 'hp + 120', 'L - 2 * bracoL', 'encostoP', 'A - hp - 120', E),
    bloco('assento', 'Almofada de assento', 'bracoL + (i - 1) * wLugar + 3', '0', 'hp + 120', 'wLugar - 6', 'P - encostoP', 'hAssento - hp - 120', E, { repetir: 'lugares' }),
  ];
}

function parametrosSofa(L: [number, number, number], P: [number, number, number], lugares: [number, number, number] | null): Parametro[] {
  return [
    comprimento('L', 'Largura', ...L),
    comprimento('A', 'Altura total', 850, 750, 1000),
    comprimento('P', 'Profundidade', ...P),
    comprimento('bracoL', 'Largura do braço', lugares ? 160 : 140, 100, 250),
    comprimento('encostoP', 'Espessura do encosto', 200, 150, 300),
    comprimento('hp', 'Altura dos pés', 100, 60, 150),
    comprimento('hAssento', 'Altura do assento', 450, 400, 500),
    lugares ? inteiro('lugares', 'Lugares', ...lugares) : derivado('lugares', 'Lugares', '1'),
    derivado('wLugar', 'Largura de cada lugar', '(L - 2 * bracoL) / lugares'),
  ];
}

export const FAMILIA_SOFA: Familia = nova({
  id: 'fam_sofa',
  nome: 'Sofá',
  categoria: 'mobiliario',
  descricao: 'Sofá reto de 2, 3 ou 4 lugares em blocos retos: estrutura, braços, costas e almofadas de assento. Não há estofado curvo; as formas são prismas.',
  parametros: parametrosSofa([2000, 1200, 3000], [900, 800, 1100], [3, 2, 4]),
  pecas: pecasSofa(),
  ferragens: [{ id: 'pe', nome: 'Pé regulável', quantidade: '4' }, { id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' }],
  tipos: [
    { id: 'dois', nome: 'Sofá de 2 lugares (1600 × 900)', valores: { L: 1600, lugares: 2 } },
    { id: 'tres', nome: 'Sofá de 3 lugares (2000 × 900)', valores: { L: 2000, lugares: 3 } },
    { id: 'quatro', nome: 'Sofá de 4 lugares (2600 × 950)', valores: { L: 2600, P: 950, lugares: 4 } },
  ],
  tipoPadrao: 'tres',
});

export const FAMILIA_POLTRONA: Familia = nova({
  id: 'fam_poltrona',
  nome: 'Poltrona',
  categoria: 'mobiliario',
  descricao: 'Poltrona de um lugar em blocos retos (estrutura, braços, costas e almofada). Não há estofado curvo; as formas são prismas.',
  parametros: parametrosSofa([800, 650, 1000], [850, 700, 1000], null),
  pecas: pecasSofa(),
  ferragens: [{ id: 'pe', nome: 'Pé regulável', quantidade: '4' }, { id: 'minifix', nome: 'Parafuso minifix', quantidade: '4' }],
  tipos: [
    { id: 'poltrona80', nome: 'Poltrona 800 × 850', valores: { L: 800, P: 850 } },
    { id: 'poltrona70', nome: 'Poltrona compacta 700 × 800', valores: { L: 700, P: 800 } },
    { id: 'poltrona95', nome: 'Poltrona larga 950 × 900', valores: { L: 950, P: 900 } },
  ],
  tipoPadrao: 'poltrona80',
});

export const FAMILIA_SOFA_L: Familia = nova({
  id: 'fam_sofa_l',
  nome: 'Sofá modular em L',
  categoria: 'mobiliario',
  descricao: 'Sofá modular em L com ala principal nos fundos e chaise à direita, em blocos retos. Não há estofado curvo. Use M para espelhar a chaise para a esquerda.',
  parametros: [
    comprimento('L', 'Largura total', 2400, 2000, 3200),
    comprimento('A', 'Altura total', 850, 750, 1000),
    comprimento('P', 'Profundidade total', 1600, 1300, 1900),
    comprimento('pM', 'Profundidade da ala principal', 900, 800, 1000),
    comprimento('wC', 'Largura da chaise', 900, 700, 1200),
    comprimento('bracoL', 'Largura do braço', 160, 100, 250),
    comprimento('encostoP', 'Espessura do encosto', 200, 150, 300),
    comprimento('hp', 'Altura dos pés', 100, 60, 150),
    comprimento('hAssento', 'Altura do assento', 450, 400, 500),
    inteiro('lugares', 'Lugares da ala principal', 2, 1, 3),
    derivado('wP', 'Largura da ala principal', 'L - wC'),
    derivado('wLugar', 'Largura de cada lugar', '(wP - bracoL) / lugares'),
    derivado('y0', 'Início da ala principal', 'P - pM'),
  ],
  pecas: [
    bloco('pe1', 'Pé esquerdo traseiro', '40', 'P - 100', '0', '60', '60', 'hp', M),
    bloco('pe2', 'Pé esquerdo frontal', '40', 'y0 + 40', '0', '60', '60', 'hp', M),
    bloco('pe3', 'Pé da junção traseiro', 'wP - 100', 'P - 100', '0', '60', '60', 'hp', M),
    bloco('pe4', 'Pé da chaise frontal esquerdo', 'wP + 40', '40', '0', '60', '60', 'hp', M),
    bloco('pe5', 'Pé da chaise frontal direito', 'L - 100', '40', '0', '60', '60', 'hp', M),
    bloco('pe6', 'Pé da chaise traseiro direito', 'L - 100', 'P - 100', '0', '60', '60', 'hp', M),
    bloco('baseP', 'Base da ala principal', '0', 'y0', 'hp', 'wP', 'pM', '120', M),
    bloco('baseC', 'Base da chaise', 'wP', '0', 'hp', 'wC', 'P', '120', M),
    bloco('bracoE', 'Braço esquerdo', '0', 'y0', 'hp + 120', 'bracoL', 'pM', 'A - hp - 120 - 150', E),
    bloco('bracoD', 'Braço da chaise', 'L - bracoL', '0', 'hp + 120', 'bracoL', 'P', 'A - hp - 120 - 150', E),
    bloco('costasP', 'Costas da ala principal', 'bracoL', 'P - encostoP', 'hp + 120', 'wP - bracoL', 'encostoP', 'A - hp - 120', E),
    bloco('costasC', 'Costas da chaise', 'wP', 'P - encostoP', 'hp + 120', 'wC - bracoL', 'encostoP', 'A - hp - 120', E),
    bloco('assentoP', 'Almofada da ala principal', 'bracoL + (i - 1) * wLugar + 3', 'y0', 'hp + 120', 'wLugar - 6', 'pM - encostoP', 'hAssento - hp - 120', E, { repetir: 'lugares' }),
    bloco('assentoC', 'Almofada da chaise', 'wP + 3', '0', 'hp + 120', 'wC - bracoL - 6', 'P - encostoP', 'hAssento - hp - 120', E),
  ],
  ferragens: [{ id: 'pe', nome: 'Pé regulável', quantidade: '6' }, { id: 'minifix', nome: 'Parafuso minifix', quantidade: '12' }],
  tipos: [
    { id: 'l240', nome: 'Em L 2,40 × 1,60 m', valores: { L: 2400, P: 1600, wC: 900, lugares: 2 } },
    { id: 'l280', nome: 'Em L 2,80 × 1,70 m', valores: { L: 2800, P: 1700, wC: 1000, lugares: 3 } },
    { id: 'l220', nome: 'Em L compacto 2,20 × 1,50 m', valores: { L: 2200, P: 1500, wC: 800, lugares: 2 } },
  ],
  tipoPadrao: 'l240',
});

const CAMA_MESMO = 'madeira_macica';

export const FAMILIA_CAMA: Familia = nova({
  id: 'fam_cama',
  nome: 'Cama',
  categoria: 'mobiliario',
  descricao: 'Cama de solteiro, casal, queen ou king: cabeceira em painel, base de madeira sobre pés e colchão (bloco reto). A profundidade inclui 60 mm de cabeceira.',
  parametros: [
    comprimento('L', 'Largura', 1380, 880, 2000),
    comprimento('A', 'Altura da cabeceira', 1000, 700, 1300),
    comprimento('P', 'Comprimento', 1940, 1900, 2150),
    comprimento('hp', 'Altura dos pés', 120, 60, 200),
    comprimento('hBase', 'Altura da base', 180, 100, 300),
    comprimento('hColchao', 'Altura do colchão', 250, 150, 350),
  ],
  pecas: [
    bloco('pe1', 'Pé frontal esquerdo', '0', '0', '0', '60', '60', 'hp', CAMA_MESMO),
    bloco('pe2', 'Pé frontal direito', 'L - 60', '0', '0', '60', '60', 'hp', CAMA_MESMO),
    bloco('base', 'Base de madeira', '0', '0', 'hp', 'L', 'P - 60', 'hBase', CAMA_MESMO),
    bloco('colchao', 'Colchão', '0', '0', 'hp + hBase', 'L', 'P - 60', 'hColchao', E),
    { id: 'cabeceira', nome: 'Cabeceira', papel: 'painel', eixo: 'y', origem: ['0', 'P - 60', '0'], tamanho: ['L', 'A'], espessura: '60', material: 'mat_porta', veio: 'livre' },
  ],
  ferragens: [{ id: 'minifix', nome: 'Parafuso minifix', quantidade: '8' }, { id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '12' }],
  tipos: [
    { id: 'solteiro', nome: 'Solteiro (880 × 1940)', valores: { L: 880, P: 1940 } },
    { id: 'casal', nome: 'Casal (1380 × 1940)', valores: { L: 1380, P: 1940 } },
    { id: 'queen', nome: 'Queen (1580 × 2040)', valores: { L: 1580, P: 2040 } },
    { id: 'king', nome: 'King (1930 × 2090)', valores: { L: 1930, P: 2090 } },
  ],
  tipoPadrao: 'casal',
});

export const FAMILIA_BELICHE: Familia = nova({
  id: 'fam_beliche',
  nome: 'Beliche',
  categoria: 'mobiliario',
  descricao: 'Beliche de dois colchões com 4 montantes, estrados e grade de proteção na cama de cima. Não inclui escada (use um bloco importado ou a escada da Biblioteca de estruturas).',
  parametros: [
    comprimento('L', 'Largura', 1000, 800, 1100),
    comprimento('A', 'Altura total', 1650, 1500, 1900),
    comprimento('P', 'Comprimento', 2000, 1900, 2150),
    derivado('zCima', 'Altura do estrado de cima', 'A - 500'),
  ],
  pecas: [
    bloco('m1', 'Montante frontal esquerdo', '0', '0', '0', '60', '60', 'A', CAMA_MESMO),
    bloco('m2', 'Montante frontal direito', 'L - 60', '0', '0', '60', '60', 'A', CAMA_MESMO),
    bloco('m3', 'Montante traseiro esquerdo', '0', 'P - 60', '0', '60', '60', 'A', CAMA_MESMO),
    bloco('m4', 'Montante traseiro direito', 'L - 60', 'P - 60', '0', '60', '60', 'A', CAMA_MESMO),
    bloco('estradoBaixo', 'Estrado de baixo', '60', '0', '250', 'L - 120', 'P', '30', CAMA_MESMO),
    bloco('colchaoBaixo', 'Colchão de baixo', '60', '0', '280', 'L - 120', 'P', '200', E),
    bloco('estradoCima', 'Estrado de cima', '60', '0', 'zCima', 'L - 120', 'P', '30', CAMA_MESMO),
    bloco('colchaoCima', 'Colchão de cima', '60', '0', 'zCima + 30', 'L - 120', 'P', '200', E),
    placaX('grade', 'Grade de proteção', 'lateral', 'L - 60', '60', 'zCima + 30', 'P - 120', '240', '18', CAMA_MESMO),
  ],
  ferragens: [{ id: 'minifix', nome: 'Parafuso minifix', quantidade: '16' }, { id: 'cavilha', nome: 'Cavilha 8 × 30', quantidade: '24' }],
  tipos: [
    { id: 'beliche_solteiro', nome: 'Beliche solteiro (1000 × 2000)', valores: { L: 1000, P: 2000, A: 1650 } },
    { id: 'beliche_alto', nome: 'Beliche alto (1000 × 2000 × 1800)', valores: { L: 1000, P: 2000, A: 1800 } },
  ],
  tipoPadrao: 'beliche_solteiro',
});

export const SOFAS_CAMAS: Familia[] = [FAMILIA_SOFA, FAMILIA_SOFA_L, FAMILIA_POLTRONA, FAMILIA_CAMA, FAMILIA_BELICHE];
