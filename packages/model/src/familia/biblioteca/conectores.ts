import type { Conector } from '../tipos.ts';

/*
 * Conectores padrão das famílias da biblioteca base (ficha CONECT-biblioteca). Cada família ganha os pontos de encaixe nas
 * laterais (esquerda e direita) e, quando a peça se apoia na parede pelo fundo, também o conector de fundo. Só dados: quem
 * calcula o encaixe é o motor. As etiquetas seguem o papel do móvel (`base`, `aereo`, `torre`, `movel`, `painel`, `modulo`,
 * `peca`); `aceita` diz com que etiqueta o outro lado pode se unir.
 */

/** Conectores laterais e de fundo de uma família com a etiqueta do seu papel na montagem. */
export function conectoresDe(etiqueta: string, comFundo = true): Conector[] {
  const conectores: Conector[] = [
    { id: 'cesq', nome: 'Lateral esquerda', lado: 'esquerda', etiqueta, aceita: [etiqueta, 'painel'] },
    { id: 'cdir', nome: 'Lateral direita', lado: 'direita', etiqueta, aceita: [etiqueta, 'painel'] },
  ];
  if (comFundo) conectores.push({ id: 'cfundo', nome: 'Fundo', lado: 'fundo', etiqueta, aceita: ['parede'] });
  return conectores;
}
