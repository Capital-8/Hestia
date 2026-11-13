/**
 * Perfil (`PerfilForma`) -> colunas do contrato (forma, p0 a p5 e linhas da seção 206). Só traduz números: o contorno, a validação fina e a
 * triangulação são do kernel (A.0 item 2). Parâmetros não usados pela forma viajam como NaN (cena-v11.json, seção 203).
 */
import type { PerfilForma } from '@hestia/model';
import { FORMA_PERFIL_CODIGO } from './kernelEstrTabelas.ts';

const NAN = Number.NaN;

/** `p0` a `p5` da forma (A.2): L (b, h, tf); T, I e U (b, h, tf, tw); tubo retangular (b, h, t); tubo circular (d, t). */
export function parametrosDoPerfil(pf: PerfilForma): [number, number, number, number, number, number] {
  switch (pf.forma) {
    case 'retangular':
      return [pf.b, pf.h, NAN, NAN, NAN, NAN];
    case 'circular':
      return [pf.d, NAN, NAN, NAN, NAN, NAN];
    case 'L':
      return [pf.b, pf.h, pf.tf, NAN, NAN, NAN];
    case 'T':
    case 'I':
    case 'U':
      return [pf.b, pf.h, pf.tf, pf.tw, NAN, NAN];
    case 'tuboRetangular':
      return [pf.b, pf.h, pf.t, NAN, NAN, NAN];
    case 'tuboCircular':
      return [pf.d, pf.t, NAN, NAN, NAN, NAN];
    case 'personalizado':
      return [NAN, NAN, NAN, NAN, NAN, NAN];
  }
}

export const codigoDaForma = (pf: PerfilForma): number => FORMA_PERFIL_CODIGO[pf.forma];

/** Chave textual do perfil por conteúdo: perfis iguais compartilham o `perfil_num` (e as linhas da seção 206). */
export const chaveDoPerfil = (pf: PerfilForma): string => JSON.stringify(pf);

/** Anéis do perfil personalizado: o 0 é o contorno; o k >= 1 é o furo k (`furos[k-1]`). Outras formas: nenhum. */
export function aneisDoPerfil(pf: PerfilForma): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  return pf.forma === 'personalizado' ? [pf.anel, ...(pf.furos ?? [])] : [];
}

/**
 * Argumentos da consulta 205 `estr_perfil` (`nivel_num` ignorado): forma, p0 a p5, `n_aneis` e, na forma personalizada, cada anel como
 * `[n, x0, y0, ...]` (o primeiro é o contorno, os demais, os furos).
 */
export function argumentosDoPerfil(pf: PerfilForma, nivelNum: number): number[] {
  const aneis = aneisDoPerfil(pf);
  const args = [nivelNum, codigoDaForma(pf), ...parametrosDoPerfil(pf), aneis.length];
  for (const a of aneis) {
    args.push(a.length);
    for (const [x, y] of a) args.push(x, y);
  }
  return args;
}
