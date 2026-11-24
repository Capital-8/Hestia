import type { Familia, Peca, Usinagem } from '../tipos.ts';
import type { Corpo, Perfil } from '../tiposCorpo.ts';

import { dimensaoPerfil, corpoEstrutural, familiaEstrutural, ligacaoRedonda, medidaDeTipo, tiposDaSerie, type SerieEstrutural } from './perfisMetalicosApoio.ts';

/*
 * Chapa de base e parafuso (ficha F7). A chapa é uma `Peca` (eixo z, tamanho L × A, espessura P) com quatro furos por
 * `usinagens`, e quatro ligações estruturais redondas nos furos, no topo. O parafuso é um corpo cilíndrico (haste) mais uma
 * cabeça sextavada por extrusão de `poligono`. Medidas genéricas (CONFERIR): não são de norma nem de fabricante.
 */

// CONFERIR: distância do furo à borda da chapa, em mm (valor genérico).
const BORDA_FURO = '40';

function furo(id: string, posicao: [string, string]): Usinagem {
  return { id, tipo: 'furo', face: 'a', posicao, diametro: 'df', profundidade: 'passante' };
}

const pecaChapa: Peca = {
  id: 'chapa',
  nome: 'Chapa de base',
  papel: 'bloco',
  eixo: 'z',
  origem: ['0', '0', '0'],
  tamanho: ['L', 'A'],
  espessura: 'P',
  veio: 'livre',
  usinagens: [
    furo('furo_1', [BORDA_FURO, BORDA_FURO]),
    furo('furo_2', [`L - ${BORDA_FURO}`, BORDA_FURO]),
    furo('furo_3', [BORDA_FURO, `A - ${BORDA_FURO}`]),
    furo('furo_4', [`L - ${BORDA_FURO}`, `A - ${BORDA_FURO}`]),
  ],
};

// CONFERIR: séries genéricas de chapa de base (espessura e furo por série).
const SERIES_CHAPA: readonly SerieEstrutural[] = [
  { id: 'ch10', nome: 'Chapa 10 mm', valores: { P: 10, df: 14 } },
  { id: 'ch16', nome: 'Chapa 16 mm', valores: { P: 16, df: 18 } },
  { id: 'ch20', nome: 'Chapa 20 mm', valores: { P: 20, df: 22 } },
];

const FURACOES: ReadonlyArray<readonly [string, string, string]> = [
  ['a', BORDA_FURO, BORDA_FURO],
  ['b', `L - ${BORDA_FURO}`, BORDA_FURO],
  ['c', BORDA_FURO, `A - ${BORDA_FURO}`],
  ['d', `L - ${BORDA_FURO}`, `A - ${BORDA_FURO}`],
];

export const FAMILIA_CHAPA_BASE: Familia = familiaEstrutural({
  id: 'fam_chapa_base',
  nome: 'Chapa de base com furos',
  categoria: 'chapa_estrutural',
  descricao: 'Chapa de base retangular (L × A × P) com quatro furos passantes. Ligação estrutural em cada furo, no topo da chapa.',
  parametros: [dimensaoPerfil('L', 'Comprimento'), dimensaoPerfil('A', 'Largura'), dimensaoPerfil('P', 'Espessura'), medidaDeTipo('df', 'Diâmetro do furo', 18, 'Furação')],
  pecas: [pecaChapa],
  ligacoes: FURACOES.map(([id, x, y]) => ligacaoRedonda(`furo_${id}`, `Furo ${id.toUpperCase()}`, [x, y, 'P'], ['0', '0', '1'], 'df')),
  tipos: tiposDaSerie(SERIES_CHAPA, { L: 300, A: 200 }),
  tipoPadrao: 'ch10',
});

/** Cabeça sextavada de chave `P` (entre faces), por extrusão de polígono de 6 lados (vértices a R = P/√3). */
const cabecaHexagonal: Perfil = {
  tipo: 'poligono',
  pontos: [
    ['0.57735 * P', '0'],
    ['0.288675 * P', '0.5 * P'],
    ['-0.288675 * P', '0.5 * P'],
    ['-0.57735 * P', '0'],
    ['-0.288675 * P', '-0.5 * P'],
    ['0.288675 * P', '-0.5 * P'],
  ],
};

// CONFERIR: diâmetro, chave e altura da cabeça por bitola (genéricos, não de norma).
const SERIES_PARAFUSO: readonly SerieEstrutural[] = [
  { id: 'm12', nome: 'Parafuso 12 mm', valores: { A: 12, P: 19, K: 8 } },
  { id: 'm16', nome: 'Parafuso 16 mm', valores: { A: 16, P: 24, K: 10 } },
  { id: 'm20', nome: 'Parafuso 20 mm', valores: { A: 20, P: 30, K: 13 } },
];

const corposParafuso: Corpo[] = [
  corpoEstrutural('cabeca', 'Cabeça sextavada', 'corpo', { tipo: 'extrusao', perfil: cabecaHexagonal, comprimento: 'K' }),
  corpoEstrutural('haste', 'Haste', 'corpo', { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'A' }, comprimento: 'L' }, ['0', '0', 'K']),
];

export const FAMILIA_PARAFUSO_SEXTAVADO: Familia = familiaEstrutural({
  id: 'fam_parafuso_sextavado',
  nome: 'Parafuso sextavado',
  categoria: 'perfil_estrutural',
  ifc: { classe: 'IFCBUILDINGELEMENTPROXY' },
  descricao: 'Parafuso de cabeça sextavada: haste cilíndrica de comprimento L e cabeça hexagonal de altura K. Ligação estrutural em cada ponta.',
  parametros: [dimensaoPerfil('L', 'Comprimento da haste'), dimensaoPerfil('A', 'Diâmetro nominal'), dimensaoPerfil('P', 'Chave (entre faces)'), medidaDeTipo('K', 'Altura da cabeça', 8, 'Cabeça')],
  corpos: corposParafuso,
  ligacoes: [
    ligacaoRedonda('a', 'Sob a cabeça', ['0', '0', '0'], ['0', '0', '-1'], 'A'),
    ligacaoRedonda('b', 'Ponta da haste', ['0', '0', 'K + L'], ['0', '0', '1'], 'A'),
  ],
  tipos: tiposDaSerie(SERIES_PARAFUSO, { L: 60 }),
  tipoPadrao: 'm12',
});

/** Chapa de base e parafuso da biblioteca estrutural (ficha F7). */
export const FAMILIAS_CHAPA_PARAFUSO: Familia[] = [FAMILIA_CHAPA_BASE, FAMILIA_PARAFUSO_SEXTAVADO];
