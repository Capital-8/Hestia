import { openingRough } from './openingExtras.ts';
import type { OpeningShape, OpeningShapeIssue } from './openingShape.ts';
import { validateOpeningShape } from './openingShape.ts';
import type { OpeningType } from './openingTypes.ts';

/**
 * Forma de contorno livre do vão (docs/estudo-esquadrias/24, §2). `null` = vão retangular: o tipo não tem `shape`, ou ela é
 * `rect`. Com forma, devolve-a dimensionada pelo VÃO BRUTO (largura e altura do tipo, ou `height` da instância, mais
 * `roughOversize`), porque é o que fura a parede; a flecha (`rise`) e o tipo da forma ficam como gravados. Não valida: use
 * `validateOpeningShape` no resultado (a mesma checagem que o aviso `forma-vao-invalida` faz).
 */
export function openingShapeOf(t: Pick<OpeningType, 'width' | 'height' | 'roughOversize' | 'shape'>, height?: number): OpeningShape | null {
  const s = t.shape;
  if (!s || s.kind === 'rect') return null;
  const rough = openingRough({ width: t.width, height: height ?? t.height, roughOversize: t.roughOversize });
  return { ...s, width: rough.width, height: rough.height };
}

/** Problemas da forma efetiva do vão (vazio = retangular ou forma válida). */
export function openingShapeProblems(t: Pick<OpeningType, 'width' | 'height' | 'roughOversize' | 'shape'>, height?: number): OpeningShapeIssue[] {
  const s = openingShapeOf(t, height);
  return s ? validateOpeningShape(s) : [];
}
