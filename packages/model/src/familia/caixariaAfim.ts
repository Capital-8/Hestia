import type { OpcaoParametro } from './tipos.ts';
import type { Caixaria, DivisaoItem } from './tiposCaixaria.ts';

/*
 * Compilação da árvore de caixaria paramétrica para `Peca[]` e `Ferragem[]` (ADR 0049 / Caixaria).
 * Todas as posições e medidas são representadas como combinações afins `(kD * D + kE * esp + kC)` ao longo
 * de cada eixo (`L`, `P`, `A`), mantendo fórmulas curtas (<= 512 chars) em qualquer profundidade de vãos.
 */

export const FITA_CAIXARIA = 'fita_pvc';

export const CHAPAS_CAIXARIA: OpcaoParametro[] = [
  { valor: 'mdf15', rotulo: 'MDF 15 mm', esp: 15 },
  { valor: 'mdf18', rotulo: 'MDF 18 mm', esp: 18 },
  { valor: 'mdf25', rotulo: 'MDF 25 mm', esp: 25 },
];

/** Expressão afim ao longo de um único eixo: `kD * D + kE * esp + kC`. */
export interface Afim {
  kD: number;
  kE: number;
  kC: number;
}

export interface CaixaAfim {
  x0: Afim;
  x1: Afim;
  y0: Afim;
  y1: Afim;
  z0: Afim;
  z1: Afim;
}

export interface BordasExternas {
  esq: boolean;
  dir: boolean;
  base: boolean;
  topo: boolean;
  topoAberto: boolean;
}

const ZERO_EPS = 1e-9;

export const afim = (kD: number, kE: number, kC: number): Afim => ({ kD, kE, kC });

export const addAfim = (a: Afim, b: Afim): Afim => ({
  kD: a.kD + b.kD,
  kE: a.kE + b.kE,
  kC: a.kC + b.kC,
});

export const subAfim = (a: Afim, b: Afim): Afim => ({
  kD: a.kD - b.kD,
  kE: a.kE - b.kE,
  kC: a.kC - b.kC,
});

export const scaleAfim = (a: Afim, s: number): Afim => ({
  kD: a.kD * s,
  kE: a.kE * s,
  kC: a.kC * s,
});

export const avaliarAfim = (a: Afim, dim: number, esp: number): number =>
  a.kD * dim + a.kE * esp + a.kC;

function roundCoef(v: number): number {
  if (Math.abs(v) < ZERO_EPS) return 0;
  return Math.round(v * 1e6) / 1e6;
}

function formatarNumero(v: number): string {
  const n = roundCoef(v);
  return Object.is(n, -0) ? '0' : String(n);
}

/** Formata uma combinação afim em expressão compacta para a linguagem de fórmulas. */
export function formatarAfim(a: Afim, dimVar: 'L' | 'A' | 'P'): string {
  const kD = roundCoef(a.kD);
  const kE = roundCoef(a.kE);
  const kC = roundCoef(a.kC);
  const partes: string[] = [];

  const adicionarTermo = (coef: number, nome?: string): void => {
    if (coef === 0) return;
    const neg = coef < 0;
    const mag = Math.abs(coef);
    const corpo = nome ? (mag === 1 ? nome : `${formatarNumero(mag)} * ${nome}`) : formatarNumero(mag);
    if (partes.length === 0) {
      partes.push(neg ? `-${corpo}` : corpo);
    } else {
      partes.push(neg ? `- ${corpo}` : `+ ${corpo}`);
    }
  };

  adicionarTermo(kD, dimVar);
  adicionarTermo(kE, 'esp');
  adicionarTermo(kC);

  return partes.length === 0 ? '0' : partes.join(' ');
}

export function criarCaixariaPadrao(estrutura: Caixaria['estrutura'] = 'base_topo'): Caixaria {
  return {
    versao: 1,
    estrutura,
    rodape: { tipo: 'nenhum', altura: 0, recuo: 50 },
    fundo: { tipo: 'encaixado', espessura: 6, recuo: 15 },
    raiz: { id: 'raiz' },
  };
}

/** Calcula os limites afins (mm) do vão raiz e das faces da carcaça. */
export function calcularCaixaRaizAfim(cx: Caixaria): {
  zRodape: number;
  tampoEsp: number;
  yFundo: Afim;
  profLat: Afim;
  raiz: CaixaAfim;
  bordas: BordasExternas;
} {
  const zRodape = cx.rodape.tipo === 'nenhum' ? 0 : Math.max(0, cx.rodape.altura);
  const tampoEsp = cx.tampo ? Math.max(0, cx.tampo.espessura) : 0;

  let fundoDeduct = 0;
  let latDeduct = 0;
  if (cx.fundo.tipo === 'pregado') {
    fundoDeduct = Math.max(0, cx.fundo.espessura);
    latDeduct = fundoDeduct;
  } else if (cx.fundo.tipo === 'encaixado') {
    fundoDeduct = Math.max(0, cx.fundo.espessura) + Math.max(0, cx.fundo.recuo);
  } else if (cx.fundo.tipo === 'espesso') {
    fundoDeduct = Math.max(0, cx.fundo.espessura);
  }

  const yFundo = afim(1, 0, -fundoDeduct);
  const profLat = afim(1, 0, -latDeduct);
  const z0 = afim(0, 1, zRodape);
  const z1 = cx.estrutura === 'aberta'
    ? afim(1, 0, -tampoEsp)
    : afim(1, -1, -tampoEsp);

  return {
    zRodape,
    tampoEsp,
    yFundo,
    profLat,
    raiz: {
      x0: afim(0, 1, 0),
      x1: afim(1, -1, 0),
      y0: afim(0, 0, 0),
      y1: yFundo,
      z0,
      z1,
    },
    bordas: {
      esq: true,
      dir: true,
      base: true,
      topo: cx.estrutura !== 'aberta',
      topoAberto: cx.estrutura === 'aberta',
    },
  };
}

/** Calcula as posições afins das divisórias/prateleiras e os sub-intervalos dos filhos. */
export function dividirIntervaloAfim(
  a: Afim,
  b: Afim,
  itens: readonly DivisaoItem[],
): { posicoes: Afim[]; intervalos: Array<[Afim, Afim]> } {
  const m = itens.length;
  const span = subAfim(b, a);
  const luzUtil = subAfim(span, afim(0, m, 0));

  const posicoes: Afim[] = itens.map((item, k) => {
    switch (item.modo) {
      case 'fixo_inicio':
        return addAfim(a, afim(0, 0, item.valor));
      case 'fixo_fim':
        return subAfim(b, afim(0, 1, item.valor));
      case 'proporcional':
      default:
        return addAfim(a, addAfim(scaleAfim(luzUtil, item.valor), afim(0, k, 0)));
    }
  });

  const intervalos: Array<[Afim, Afim]> = [];
  for (let c = 0; c <= m; c++) {
    const start = c === 0 ? a : addAfim(posicoes[c - 1]!, afim(0, 1, 0));
    const end = c === m ? b : posicoes[c]!;
    intervalos.push([start, end]);
  }
  return { posicoes, intervalos };
}

export function limparId(id: string): string {
  const limpo = id.replace(/[^A-Za-z0-9_]/g, '_');
  return limpo === '' ? 'x' : limpo;
}

export function idUnico(base: string, usados: Set<string>): string {
  if (!usados.has(base)) {
    usados.add(base);
    return base;
  }
  let k = 2;
  while (usados.has(`${base}_${k}`)) k++;
  const res = `${base}_${k}`;
  usados.add(res);
  return res;
}

export function formulaDobradicasPorAltura(alturaExpr: string): string {
  const h = alturaExpr.includes(' ') ? `(${alturaExpr})` : alturaExpr;
  return `${h} <= 900 ? 2 : (${h} <= 1600 ? 3 : (${h} <= 2200 ? 4 : 5))`;
}

