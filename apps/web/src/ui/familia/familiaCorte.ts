import { orientacoesPermitidas, type ChapaParaCorte, type PecaParaCorte } from '@hestia/engine';
import { textoMm } from './familiaLista.ts';

/*
 * Explicação das peças que ficaram fora do plano de corte: nome, medida, motivo e dica. Puro e sem estado, para o aviso
 * do topo do plano dizer o que fazer sem repetir a lógica do motor (`planoDeCorte` devolve só os índices).
 */

export interface PecaForaDoPlano {
  /** Id da peça no plano (`<nome> #<k>`). */
  nome: string;
  /** Comprimento × largura em mm, já formatados. */
  medida: string;
  /** Por que não coube, em português. */
  motivo: string;
  /** O que o marceneiro pode mudar para a peça caber. */
  dica: string;
  /** `true` quando a peça caberia girada, mas o veio da chapa (ou da peça) travou a rotação. */
  veioTravou: boolean;
}

const TOL = 1e-9;

function cabeEm(peca: PecaParaCorte, largura: number, altura: number, girada: boolean): boolean {
  const w = girada ? peca.largura : peca.comprimento;
  const h = girada ? peca.comprimento : peca.largura;
  return w <= largura + TOL && h <= altura + TOL;
}

/** Motivo e dica de uma peça que não coube na chapa informada. */
export function explicarNaoCoube(peca: PecaParaCorte, chapa: ChapaParaCorte): PecaForaDoPlano {
  const larguraUtil = chapa.largura - 2 * chapa.refilo;
  const alturaUtil = chapa.altura - 2 * chapa.refilo;
  const permitidas = orientacoesPermitidas(peca, chapa);
  const cabePermitida = permitidas.some((girada) => cabeEm(peca, larguraUtil, alturaUtil, girada));
  const cabeGirada = cabeEm(peca, larguraUtil, alturaUtil, false) || cabeEm(peca, larguraUtil, alturaUtil, true);
  const veioTravou = !cabePermitida && cabeGirada;
  const medida = `${textoMm(peca.comprimento)} × ${textoMm(peca.largura)} mm`;
  const util = `${textoMm(larguraUtil)} × ${textoMm(alturaUtil)} mm`;

  if (veioTravou) {
    return {
      nome: peca.id,
      medida,
      motivo: `o veio trava a rotação: a peça só caberia girada, mas a área útil é ${util}`,
      dica: 'Permita girar a peça (veio livre), troque por uma chapa sem veio ou reduza o refilo.',
      veioTravou,
    };
  }
  return {
    nome: peca.id,
    medida,
    motivo: `a peça é maior que a área útil da chapa (${util})`,
    dica: 'Troque a chapa por uma maior ou reduza o refilo.',
    veioTravou,
  };
}

/** Detalha, na ordem dos índices, as peças que `planoDeCorte` pôs em `naoCouberam`. */
export function pecasForaDoPlano(
  pecas: readonly PecaParaCorte[],
  indices: readonly number[],
  chapa: ChapaParaCorte,
): PecaForaDoPlano[] {
  const resultado: PecaForaDoPlano[] = [];
  for (const indice of indices) {
    const peca = pecas[indice];
    if (peca === undefined) continue;
    resultado.push(explicarNaoCoube(peca, chapa));
  }
  return resultado;
}
