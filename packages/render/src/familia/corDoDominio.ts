import type { DominioLigacao } from '@hestia/model';

/*
 * Cor de cada DOMÍNIO de ligação (ficha C2): mapa ÚNICO usado pelo 3D do editor (marcadores) e pelo painel (swatch).
 * Quinze domínios, um valor por domínio: o `Record` obriga a cobrir todos, e o compilador acusa domínio novo sem cor.
 * Formato 0xRRGGBB (three.js); `corCssDoDominio` devolve o mesmo valor como "#rrggbb" para o CSS.
 */

export const COR_DOMINIO: Readonly<Record<DominioLigacao, number>> = {
  agua_fria: 0x1e88e5,
  agua_quente: 0xe53935,
  esgoto: 0x6d4c41,
  ventilacao: 0x90a4ae,
  pluvial: 0x00897b,
  gas: 0xfdd835,
  incendio: 0xd81b60,
  eletrica_forca: 0xff6f00,
  eletrica_dados: 0x8e24aa,
  eletroduto: 0x546e7a,
  eletrocalha: 0x37474f,
  ar_insuflamento: 0x7cb342,
  ar_retorno: 0x33691e,
  refrigerante: 0x00acc1,
  estrutural: 0x9e9e9e,
};

/** Cor do domínio como 0xRRGGBB (para three.js). */
export function corDoDominio(dominio: DominioLigacao): number {
  return COR_DOMINIO[dominio];
}

/** Mesma cor do domínio como "#rrggbb" (para o CSS do painel). */
export function corCssDoDominio(dominio: DominioLigacao): string {
  return `#${corDoDominio(dominio).toString(16).padStart(6, '0')}`;
}
