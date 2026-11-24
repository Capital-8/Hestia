import type { DetalheResolvido } from '@hestia/engine';
import type { Eixo, ReferenciaCota, VistaSimbolo } from '@hestia/model';
import type { ChaveI18n } from './familiaCorpo.ts';

/*
 * Apoio da aba "Detalhes" (ficha D4): constantes, ids novos, referência de cota ↔ texto do seletor e o enquadramento da
 * miniatura SVG. Tudo puro; a edição passa pelo modelo (`edicaoDetalhes.ts`) dentro de `useFamilia.executar`.
 */

export const VISTAS_DETALHE: readonly VistaSimbolo[] = ['planta', 'corte', 'elevacao'];

export const ROTULO_VISTA_DETALHE: Readonly<Record<VistaSimbolo, ChaveI18n>> = {
  planta: 'fam_det_vista_planta',
  corte: 'fam_det_vista_corte',
  elevacao: 'fam_det_vista_elevacao',
};

export const EIXOS_DETALHE: readonly Eixo[] = ['x', 'y', 'z'];

/** Próximo id `<prefixo>N` livre. */
export function proximoId(prefixo: string, ids: readonly string[]): string {
  let n = 1;
  while (ids.includes(`${prefixo}${n}`)) n++;
  return `${prefixo}${n}`;
}

/** Texto do seletor para a referência (`plano:<id>` ou `ligacao:<id>`); ponto livre não tem opção no seletor. */
export function refParaTexto(r: ReferenciaCota): string {
  return r.tipo === 'ponto' ? 'ponto' : `${r.tipo}:${r.id}`;
}

/** Inverso de `refParaTexto` para as opções do seletor; `null` para texto que não é plano nem ligação. */
export function textoParaRef(texto: string): ReferenciaCota | null {
  const i = texto.indexOf(':');
  if (i < 0) return null;
  const tipo = texto.slice(0, i);
  const id = texto.slice(i + 1);
  if (id === '' || (tipo !== 'plano' && tipo !== 'ligacao')) return null;
  return { tipo, id };
}

export interface Enquadramento {
  /** `viewBox` do SVG, com o eixo v invertido (o desenho cresce para cima). */
  viewBox: string;
  /** Espessura do traço em unidades do desenho (m), fixa em relação ao tamanho. */
  traco: number;
}

/** Caixa que envolve laços, cotas e símbolos (m), com folga; `null` quando não há nada a desenhar. */
export function enquadrar(d: DetalheResolvido): Enquadramento | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const pares = (v: readonly number[]): void => {
    for (let i = 0; i + 1 < v.length; i += 2) {
      xs.push(v[i] ?? 0);
      ys.push(v[i + 1] ?? 0);
    }
  };
  for (const c of [...d.cortados, ...d.contornos]) pares(c);
  for (const c of d.cotas) pares([...c.de, ...c.ate, ...c.linha.de, ...c.linha.ate]);
  if (xs.length === 0) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const lado = Math.max(maxX - minX, maxY - minY, 0.01);
  const folga = lado * 0.12;
  return {
    viewBox: `${minX - folga} ${-(maxY + folga)} ${maxX - minX + 2 * folga} ${maxY - minY + 2 * folga}`,
    traco: lado / 300,
  };
}

/** Lista plana (u, v, u, v…) em `d` de caminho SVG, com o eixo v invertido (desenho para cima). */
export function caminhoSvg(par: readonly number[], fechado: boolean): string {
  const partes: string[] = [];
  for (let i = 0; i + 1 < par.length; i += 2) partes.push(`${i === 0 ? 'M' : 'L'}${par[i] ?? 0} ${-(par[i + 1] ?? 0)}`);
  return partes.length === 0 ? '' : `${partes.join(' ')}${fechado ? ' Z' : ''}`;
}
