import type { Familia } from '../tipos.ts';
import { disco, familiaKrona, itemKrona, ITEM_TUBO_PRIMARIO, ligacaoKrona, oco, diametroExtBolsa } from './kronaEsgotoApoio.ts';

/*
 * Esgoto da Krona (série normal, linha primária DN 50 a 200) montado DIRETO do catálogo: ver kronaEsgotoApoio.ts. Cada família
 * lê suas cotas por `busca(DN, ...)`. Pendentes (catálogo já transcrito, geometria ainda não): curvas (varredura), junções,
 * reduções, tê de redução e de inspeção, secundário (DN 40) e série reforçada.
 * Eixos: o corpo cresce em +Z; a origem de cada conexão é o centro (ou o cruzamento dos eixos); ligações apontam para fora.
 */

const EXT = 'Db + 2 * e';
const INT = 'De - 2 * e';
const S45 = 'sin(45)';
const C45 = 'cos(45)';

export const FAMILIA_KRONA_TUBO: Familia = familiaKrona({
  id: 'fam_krona_esgoto_tubo',
  nome: 'Tubo de esgoto PVC Krona (bolsa e ponta)',
  categoria: 'tubulacao',
  descricao: 'Tubo reto de PVC de esgoto com bolsa na ponta A e ponta lisa na ponta B; comprimento L livre (comercial 3 m ou 6 m).',
  item: itemKrona(ITEM_TUBO_PRIMARIO),
  colunas: ['B', 'D', 'd'],
  corpos: [oco('bolsa', 'Bolsa', 'tubo', EXT, 'Db', 'B', ['0', '0', '0']), oco('tubo', 'Tubo', 'tubo', 'De', INT, 'L - B', ['0', '0', 'B'])],
  ligacoes: [ligacaoKrona('a', 'Bolsa (A)', ['0', '0', '0'], ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona('b', 'Ponta (B)', ['0', '0', 'L'], ['0', '0', '1'], 'De')],
  ifc: { classe: 'IFCPIPESEGMENT' },
  caixa: (v, e) => ({ L: 1000, A: diametroExtBolsa(v, e), P: diametroExtBolsa(v, e) }),
});

export const FAMILIA_KRONA_JOELHO90: Familia = familiaKrona({
  id: 'fam_krona_esgoto_joelho90',
  nome: 'Joelho 90° de esgoto Krona',
  categoria: 'conexao_tubo',
  descricao: 'Joelho de 90° com bolsa nas duas pontas: braço vertical (sai para −Z) e braço horizontal (sai para +X).',
  item: itemKrona('joelho_90_esgoto_primario'),
  colunas: ['B', 'Z', 'C', 'D', 'd'],
  corpos: [
    oco('a_corpo', 'Braço A (corpo)', 'conexao', EXT, INT, 'Z', ['0', '0', '-Z']),
    oco('a_bolsa', 'Braço A (bolsa)', 'conexao', EXT, 'Db', 'B', ['0', '0', '-(Z + B)']),
    oco('b_corpo', 'Braço B (corpo)', 'conexao', EXT, INT, 'Z', ['0', '0', '0'], ['0', '90', '0']),
    oco('b_bolsa', 'Braço B (bolsa)', 'conexao', EXT, 'Db', 'B', ['Z', '0', '0'], ['0', '90', '0']),
  ],
  ligacoes: [ligacaoKrona('a', 'Bolsa A', ['0', '0', '-(Z + B)'], ['0', '0', '-1'], 'Db', 'B'), ligacaoKrona('b', 'Bolsa B', ['Z + B', '0', '0'], ['1', '0', '0'], 'Db', 'B')],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' },
  caixa: (v, e) => ({ L: (v.Z ?? 0) + (v.B ?? 0) + diametroExtBolsa(v, e) / 2, A: (v.Z ?? 0) + (v.B ?? 0) + diametroExtBolsa(v, e) / 2, P: diametroExtBolsa(v, e) }),
});

export const FAMILIA_KRONA_JOELHO45: Familia = familiaKrona({
  id: 'fam_krona_esgoto_joelho45',
  nome: 'Joelho 45° de esgoto Krona',
  categoria: 'conexao_tubo',
  descricao: 'Joelho de 45° com bolsa nas duas pontas: braço A sai para −Z e braço B desvia 45° para +X.',
  item: itemKrona('joelho_45_esgoto_primario'),
  colunas: ['B', 'Z', 'C', 'D', 'd'],
  corpos: [
    oco('a_corpo', 'Braço A (corpo)', 'conexao', EXT, INT, 'Z', ['0', '0', '-Z']),
    oco('a_bolsa', 'Braço A (bolsa)', 'conexao', EXT, 'Db', 'B', ['0', '0', '-(Z + B)']),
    oco('b_corpo', 'Braço B (corpo)', 'conexao', EXT, INT, 'Z', ['0', '0', '0'], ['0', '45', '0']),
    oco('b_bolsa', 'Braço B (bolsa)', 'conexao', EXT, 'Db', 'B', [`Z * ${S45}`, '0', `Z * ${C45}`], ['0', '45', '0']),
  ],
  ligacoes: [
    ligacaoKrona('a', 'Bolsa A', ['0', '0', '-(Z + B)'], ['0', '0', '-1'], 'Db', 'B'),
    ligacaoKrona('b', 'Bolsa B', [`(Z + B) * ${S45}`, '0', `(Z + B) * ${C45}`], [S45, '0', C45], 'Db', 'B'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'BEND' },
  caixa: (v, e) => ({ L: ((v.Z ?? 0) + (v.B ?? 0)) * Math.SQRT1_2 + diametroExtBolsa(v, e) / 2, A: (v.Z ?? 0) + (v.B ?? 0) * 2, P: diametroExtBolsa(v, e) }),
});

export const FAMILIA_KRONA_LUVA: Familia = familiaKrona({
  id: 'fam_krona_esgoto_luva',
  nome: 'Luva de esgoto Krona',
  categoria: 'conexao_tubo',
  descricao: 'Luva com duas bolsas (B1 e B2 diferentes) separadas por um batente central.',
  item: itemKrona('luva_esgoto_primaria'),
  colunas: ['B1', 'B2', 'C', 'Z', 'D'],
  corpos: [
    oco('bolsa1', 'Bolsa 1', 'conexao', 'Db + 2 * e', 'Db', 'B1', ['0', '0', '0']),
    oco('batente', 'Batente central', 'conexao', 'Db + 2 * e', 'Db - 2 * e', 'C - B1 - B2', ['0', '0', 'B1']),
    oco('bolsa2', 'Bolsa 2', 'conexao', 'Db + 2 * e', 'Db', 'B2', ['0', '0', 'C - B2']),
  ],
  ligacoes: [ligacaoKrona('a', 'Bolsa 1', ['0', '0', '0'], ['0', '0', '-1'], 'Db', 'B1'), ligacaoKrona('b', 'Bolsa 2', ['0', '0', 'C'], ['0', '0', '1'], 'Db', 'B2')],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'CONNECTOR' },
  caixa: (v, e) => ({ L: v.C ?? 0, A: (v.D ?? 0) + 2 * e, P: (v.D ?? 0) + 2 * e }),
});

export const FAMILIA_KRONA_TE: Familia = familiaKrona({
  id: 'fam_krona_esgoto_te',
  nome: 'Tê de esgoto Krona (90°)',
  categoria: 'conexao_tubo',
  descricao: 'Tê de 90°: corrida ao longo de Z (bolsa em cima, ponta lisa embaixo) e ramal com bolsa para +X. A origem é o cruzamento dos eixos.',
  item: itemKrona('te_esgoto_primario'),
  colunas: ['B', 'C', 'Z1', 'Z2', 'D', 'd'],
  corpos: [
    oco('corrida', 'Corrida', 'conexao', EXT, INT, 'C - B', ['0', '0', '-(C - B - Z1)']),
    oco('bolsa', 'Bolsa da corrida', 'conexao', EXT, 'Db', 'B', ['0', '0', 'Z1']),
    oco('ramal', 'Ramal (corpo)', 'conexao', EXT, INT, 'Z2', ['0', '0', '0'], ['0', '90', '0']),
    oco('ramal_bolsa', 'Ramal (bolsa)', 'conexao', EXT, 'Db', 'B', ['Z2', '0', '0'], ['0', '90', '0']),
  ],
  ligacoes: [
    ligacaoKrona('a', 'Bolsa da corrida', ['0', '0', 'Z1 + B'], ['0', '0', '1'], 'Db', 'B'),
    ligacaoKrona('b', 'Ponta da corrida', ['0', '0', '-(C - B - Z1)'], ['0', '0', '-1'], 'De'),
    ligacaoKrona('c', 'Bolsa do ramal', ['Z2 + B', '0', '0'], ['1', '0', '0'], 'Db', 'B'),
  ],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'JUNCTION' },
  caixa: (v, e) => ({ L: (v.Z2 ?? 0) + (v.B ?? 0) + diametroExtBolsa(v, e) / 2, A: v.C ?? 0, P: diametroExtBolsa(v, e) }),
});

export const FAMILIA_KRONA_CAP: Familia = familiaKrona({
  id: 'fam_krona_esgoto_tampao',
  nome: 'Cap (tampão) de esgoto Krona',
  categoria: 'conexao_tubo',
  descricao: 'Tampão com bolsa e fundo fechado.',
  item: itemKrona('cap_esgoto_primario'),
  colunas: ['B', 'C', 'D'],
  corpos: [oco('bolsa', 'Bolsa', 'conexao', EXT, 'Db', 'B', ['0', '0', '0']), disco('fundo', 'Fundo', 'Db + 2 * e', 'C - B', ['0', '0', 'B'])],
  ligacoes: [ligacaoKrona('a', 'Bolsa', ['0', '0', '0'], ['0', '0', '-1'], 'Db', 'B')],
  ifc: { classe: 'IFCPIPEFITTING', tipoPredefinido: 'CONNECTOR' },
  caixa: (v, e) => ({ L: v.C ?? 0, A: (v.D ?? 0) + 2 * e, P: (v.D ?? 0) + 2 * e }),
});

/** Famílias de esgoto da Krona montadas do catálogo (série normal, primário): 6 famílias. */
export const KRONA_ESGOTO_FAMILIAS: Familia[] = [FAMILIA_KRONA_TUBO, FAMILIA_KRONA_JOELHO90, FAMILIA_KRONA_JOELHO45, FAMILIA_KRONA_LUVA, FAMILIA_KRONA_TE, FAMILIA_KRONA_CAP];
