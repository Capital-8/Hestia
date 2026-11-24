import type { Familia, Tipo } from '../tipos.ts';
import type { Verificacao } from '../tiposRepresentacao.ts';
import { comprimento } from './novosApoio.ts';
import { corpoHvac, familiaHvac, ligacaoAr, ligacaoArRedonda, parametroEspessura } from './hvacApoio.ts';

/*
 * Dutos de ar (ficha F8, ADR 0061). Os dutos correm pelo eixo +Y (P é o comprimento do trecho); a seção fica em X (L) e Z (A).
 * Duto retangular: chapa oca 'retanguloOco' de L × A com espessura e. Duto redondo: anel de diâmetro L (A repete L).
 * Curvas de 90°: revolução em torno do eixo Z com raio do eixo P (afastamento P − L/2); a curva de 90° sai da ponta A
 * (x = P, y = 0) e chega à ponta B (x = 0, y = P). Redução redonda: transição SÓLIDA (v1, sem furos, por exigência do motor).
 */

const CLASSE_DUTO = 'IFCDUCTFITTING' as const;

// ───────────────────────── duto retangular ─────────────────────────

const TIPOS_RETANGULAR: Tipo[] = [
  { id: 'r300x200', nome: 'Duto retangular 300 × 200 (1 m)', valores: { L: 300, A: 200, P: 1000, e: 1 } },
  { id: 'r400x250', nome: 'Duto retangular 400 × 250 (1 m)', valores: { L: 400, A: 250, P: 1000, e: 1 } },
  { id: 'r600x300', nome: 'Duto retangular 600 × 300 (1 m)', valores: { L: 600, A: 300, P: 1000, e: 1 } },
];

export const FAMILIA_DUTO_RETANGULAR: Familia = familiaHvac({
  id: 'fam_duto_retangular',
  nome: 'Duto retangular',
  categoria: 'duto',
  descricao: 'Trecho de duto de ar retangular de chapa galvanizada: seção L × A (mm) e comprimento P, com espessura de chapa e. Pontas A e B nas extremidades, fluxo nos dois sentidos. CONFERIR: espessura por bitola.',
  parametros: [comprimento('L', 'Largura', 300, 100, 2000, 10), comprimento('A', 'Altura', 200, 50, 1500, 10), comprimento('P', 'Comprimento do trecho', 1000, 10, 6000, 10), parametroEspessura(1)],
  corpos: [corpoHvac('duto', 'Duto', 'tubo', { tipo: 'extrusao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'A', espessura: 'e' }, comprimento: 'P' }, { origem: ['L / 2', '0', 'A / 2'], rotacao: ['-90', '0', '0'] })],
  ligacoes: [
    ligacaoAr('a', 'Ponta A', 'ar_insuflamento', 'ambos', ['L / 2', '0', 'A / 2'], ['0', '-1', '0'], 'L', 'A'),
    ligacaoAr('b', 'Ponta B', 'ar_insuflamento', 'ambos', ['L / 2', 'P', 'A / 2'], ['0', '1', '0'], 'L', 'A'),
  ],
  tipos: TIPOS_RETANGULAR,
  tipoPadrao: 'r300x200',
  ifc: 'IFCDUCTSEGMENT',
});

// ───────────────────────── duto redondo ─────────────────────────

const VERIFICA_REDONDO: Verificacao[] = [{ id: 'diametroIgual', severidade: 'erro', condicao: 'A != L', mensagem: 'Duto redondo: A deve ser igual a L (diâmetro externo).' }];

const TIPOS_REDONDO: Tipo[] = [100, 150, 200, 250, 300].map((d) => ({ id: `d${d}`, nome: `Duto redondo Ø${d} (1 m)`, valores: { L: d, A: d, P: 1000, e: 0.8 } }));

export const FAMILIA_DUTO_REDONDO: Familia = familiaHvac({
  id: 'fam_duto_redondo',
  nome: 'Duto redondo',
  categoria: 'duto',
  descricao: 'Trecho de duto de ar redondo (espiral): diâmetro externo L, comprimento P e espessura e. A repete L (a validação exige A; uma verificação de erro impede valores diferentes). CONFERIR: espessura por bitola.',
  parametros: [comprimento('L', 'Diâmetro externo', 200, 80, 1000, 10), comprimento('A', 'Altura (= diâmetro externo)', 200, 80, 1000, 10), comprimento('P', 'Comprimento do trecho', 1000, 10, 6000, 10), parametroEspessura(0.8)],
  corpos: [corpoHvac('duto', 'Duto', 'tubo', { tipo: 'extrusao', perfil: { tipo: 'anel', diametroExterno: 'L', diametroInterno: 'L - 2 * e' }, comprimento: 'P' }, { origem: ['L / 2', '0', 'L / 2'], rotacao: ['-90', '0', '0'] })],
  ligacoes: [
    ligacaoArRedonda('a', 'Ponta A', 'ar_insuflamento', 'ambos', ['L / 2', '0', 'L / 2'], ['0', '-1', '0'], 'L - 2 * e'),
    ligacaoArRedonda('b', 'Ponta B', 'ar_insuflamento', 'ambos', ['L / 2', 'P', 'L / 2'], ['0', '1', '0'], 'L - 2 * e'),
  ],
  verificacoes: VERIFICA_REDONDO,
  tipos: TIPOS_REDONDO,
  tipoPadrao: 'd200',
  ifc: 'IFCDUCTSEGMENT',
});

// ───────────────────────── curvas de 90° ─────────────────────────

/** Verificação comum às curvas: o raio do eixo P precisa ser maior que a meia largura (senão a revolução cruza o eixo). */
const VERIFICA_CURVA: Verificacao[] = [{ id: 'raioMinimo', severidade: 'erro', condicao: 'P < L / 2', mensagem: 'Raio do eixo (P) menor que a meia largura (L / 2): a curva cruzaria o eixo.' }];

const TIPOS_CURVA_RETANGULAR: Tipo[] = [
  { id: 'r300x200', nome: 'Curva retangular 300 × 200 (raio 300)', valores: { L: 300, A: 200, P: 300, e: 1 } },
  { id: 'r400x250', nome: 'Curva retangular 400 × 250 (raio 400)', valores: { L: 400, A: 250, P: 400, e: 1 } },
  { id: 'r600x300', nome: 'Curva retangular 600 × 300 (raio 600)', valores: { L: 600, A: 300, P: 600, e: 1 } },
];

export const FAMILIA_DUTO_CURVA_RETANGULAR: Familia = familiaHvac({
  id: 'fam_duto_curva_retangular',
  nome: 'Curva de duto retangular 90°',
  categoria: 'duto',
  descricao: 'Curva de 90° de duto retangular, no plano horizontal: seção L × A, raio do eixo P (mm). Ponta A em (P, 0) saindo para −Y; ponta B em (0, P) saindo para −X. CONFERIR: raio mínimo e espessura por fabricante.',
  parametros: [comprimento('L', 'Largura', 300, 100, 2000, 10), comprimento('A', 'Altura', 200, 50, 1500, 10), comprimento('P', 'Raio do eixo', 300, 50, 3000, 10), parametroEspessura(1)],
  corpos: [corpoHvac('curva', 'Curva', 'conexao', { tipo: 'revolucao', perfil: { tipo: 'retanguloOco', largura: 'L', altura: 'A', espessura: 'e' }, angulo: '90', segmentos: '24', afastamento: 'P - L / 2' }, { origem: ['0', '0', 'A / 2'] })],
  ligacoes: [
    ligacaoAr('a', 'Ponta A', 'ar_insuflamento', 'ambos', ['P', '0', 'A / 2'], ['0', '-1', '0'], 'L', 'A'),
    ligacaoAr('b', 'Ponta B', 'ar_insuflamento', 'ambos', ['0', 'P', 'A / 2'], ['-1', '0', '0'], 'L', 'A'),
  ],
  verificacoes: VERIFICA_CURVA,
  tipos: TIPOS_CURVA_RETANGULAR,
  tipoPadrao: 'r300x200',
  ifc: CLASSE_DUTO,
});

const TIPOS_CURVA_REDONDA: Tipo[] = [150, 200, 250].map((d) => ({ id: `d${d}`, nome: `Curva redonda Ø${d} (raio ${d})`, valores: { L: d, A: d, P: d, e: 0.8 } }));

export const FAMILIA_DUTO_CURVA_REDONDA: Familia = familiaHvac({
  id: 'fam_duto_curva_redonda',
  nome: 'Curva de duto redondo 90°',
  categoria: 'duto',
  descricao: 'Curva de 90° de duto redondo, no plano horizontal: diâmetro externo L, raio do eixo P (mm). A repete L (verificação de erro). CONFERIR: raio e espessura por fabricante.',
  parametros: [comprimento('L', 'Diâmetro externo', 200, 80, 1000, 10), comprimento('A', 'Altura (= diâmetro externo)', 200, 80, 1000, 10), comprimento('P', 'Raio do eixo', 200, 50, 3000, 10), parametroEspessura(0.8)],
  corpos: [corpoHvac('curva', 'Curva', 'conexao', { tipo: 'revolucao', perfil: { tipo: 'anel', diametroExterno: 'L', diametroInterno: 'L - 2 * e' }, angulo: '90', segmentos: '24', afastamento: 'P - L / 2' }, { origem: ['0', '0', 'L / 2'] })],
  ligacoes: [
    ligacaoArRedonda('a', 'Ponta A', 'ar_insuflamento', 'ambos', ['P', '0', 'L / 2'], ['0', '-1', '0'], 'L - 2 * e'),
    ligacaoArRedonda('b', 'Ponta B', 'ar_insuflamento', 'ambos', ['0', 'P', 'L / 2'], ['-1', '0', '0'], 'L - 2 * e'),
  ],
  verificacoes: [...VERIFICA_CURVA, { id: 'diametroIgual', severidade: 'erro', condicao: 'A != L', mensagem: 'Curva redonda: A deve ser igual a L (diâmetro externo).' }],
  tipos: TIPOS_CURVA_REDONDA,
  tipoPadrao: 'd200',
  ifc: CLASSE_DUTO,
});

// ───────────────────────── redução redonda ─────────────────────────

export const FAMILIA_DUTO_REDUCAO: Familia = familiaHvac({
  id: 'fam_duto_reducao',
  nome: 'Redução de duto redondo',
  categoria: 'duto',
  descricao: 'Redução (transição) concêntrica de duto redondo: diâmetro da entrada L, diâmetro da saída A e comprimento P, ao longo de Y. Na v1 é um cone sólido (sem furo), como manda o motor de corpos. A saída precisa ser menor que a entrada.',
  parametros: [comprimento('L', 'Diâmetro da entrada', 200, 80, 1000, 10), comprimento('A', 'Diâmetro da saída', 150, 80, 1000, 10), comprimento('P', 'Comprimento', 300, 50, 2000, 10)],
  corpos: [
    corpoHvac('reducao', 'Redução', 'conexao', { tipo: 'transicao', perfilA: { tipo: 'circulo', diametro: 'L' }, perfilB: { tipo: 'circulo', diametro: 'A' }, comprimento: 'P' }, { origem: ['L / 2', '0', 'L / 2'], rotacao: ['-90', '0', '0'] }),
  ],
  ligacoes: [
    ligacaoArRedonda('a', 'Entrada', 'ar_insuflamento', 'ambos', ['L / 2', '0', 'L / 2'], ['0', '-1', '0'], 'L'),
    ligacaoArRedonda('b', 'Saída', 'ar_insuflamento', 'ambos', ['L / 2', 'P', 'L / 2'], ['0', '1', '0'], 'A'),
  ],
  verificacoes: [{ id: 'saidaMenor', severidade: 'erro', condicao: 'A >= L', mensagem: 'Redução: o diâmetro da saída (A) deve ser menor que o da entrada (L).' }],
  tipos: [
    { id: 'd200_150', nome: 'Redução Ø200 → Ø150 (300)', valores: { L: 200, A: 150, P: 300 } },
    { id: 'd250_200', nome: 'Redução Ø250 → Ø200 (300)', valores: { L: 250, A: 200, P: 300 } },
    { id: 'd300_250', nome: 'Redução Ø300 → Ø250 (400)', valores: { L: 300, A: 250, P: 400 } },
  ],
  tipoPadrao: 'd200_150',
  ifc: CLASSE_DUTO,
});

/** Dutos de ar da ficha F8: retangular, redondo, duas curvas de 90° e redução. */
export const HVAC_DUTOS: Familia[] = [FAMILIA_DUTO_RETANGULAR, FAMILIA_DUTO_REDONDO, FAMILIA_DUTO_CURVA_RETANGULAR, FAMILIA_DUTO_CURVA_REDONDA, FAMILIA_DUTO_REDUCAO];
