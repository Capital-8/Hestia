import { validateOpeningShape, type OpeningShape, type OpeningShapeIssue } from '@hestia/model';

/*
 * Forma da ESQUADRIA dentro do vão bruto (docs/estudo-esquadrias/28 §7). O vão bruto (`roughOversize`) fura a parede; a esquadria
 * é menor. Regra: a esquadria tem a MESMA forma (mesmo tipo e mesma flecha gravada) na largura e na altura dela, e todas as
 * peças recuam do contorno da esquadria (recuo concêntrico em `openingModelContorno.ts`). A flecha não encolhe: uma flecha que
 * coube no vão bruto pode deixar de caber na esquadria (arco abatido com `rise > w / 2`, arco pleno mais largo que alto). Nesse caso
 * não há forma: as peças ficam retangulares e `openingShapeIssues` avisa (`forma-esquadria-retangular`); o furo na parede segue a forma.
 */

/** A forma gravada dimensionada pela esquadria; `null` (peças retangulares) quando ela deixa de caber. */
export function formaDaEsquadria(forma: OpeningShape | undefined, width: number, height: number): OpeningShape | null {
  if (!forma || forma.kind === 'rect') return null;
  const s = { ...forma, width, height } as OpeningShape;
  return validateOpeningShape(s).length === 0 ? s : null;
}

/** Problemas da forma na esquadria (vazio = cabe ou o tipo não tem forma). */
export function problemasDaEsquadria(forma: OpeningShape | undefined, width: number, height: number): OpeningShapeIssue[] {
  if (!forma || forma.kind === 'rect') return [];
  return validateOpeningShape({ ...forma, width, height } as OpeningShape);
}
