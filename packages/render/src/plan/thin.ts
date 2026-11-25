import type { FillOp, StrokeOp } from './types.ts';

/**
 * Linhas finas (decisão 0015, só na tela): cada traço da lista sai com 1 px no máximo (o traço de papel leva o teto de
 * 1 px, que a GPU aplica com o zoom corrente). Troca os objetos no lugar (não muda os traços que o chamador já tem). Feito antes dos realces de seleção e
 * de cursor, que mantêm a largura própria; a plotagem nunca chama esta função.
 */
export function thinStrokes(strokes: StrokeOp[]): void {
  strokes.forEach((s, i) => {
    if (s.papel) {
      // Traço de papel: a largura do zoom corrente fica limitada a 1 px (`teto`), e o shader aplica o limite em qualquer zoom.
      strokes[i] = { ...s, widthPx: Math.min(1, s.widthPx), papel: { ...s.papel, teto: 1 } };
    } else if (s.widthPx > 1) strokes[i] = { ...s, widthPx: 1 };
  });
}

/**
 * Linhas finas também nas hachuras: a espessura de papel da hachura (estilo de prancha) fica limitada a um fio. Troca os
 * preenchimentos no lugar (os objetos de hachura podem ser compartilhados com outros desenhos, então são copiados).
 */
export function thinHatches(fills: FillOp[]): void {
  fills.forEach((f, i) => {
    if (f.hatch?.papel) fills[i] = { ...f, hatch: { ...f.hatch, fina: true } };
  });
}
