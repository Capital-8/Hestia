import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, MAX_POLYGON_POINTS, OPENING_SHAPE_KINDS, OPENING_SHAPE_PARAMS, openingShapeProblems, validateOpeningShape, type OpeningShapeIssue, type OpeningType } from '@hestia/model';
import { I18N } from '../../../editor/i18n.ts';
import {
  addPolygonPoint,
  movePolygonPoint,
  polygonPointsOf,
  removePolygonPoint,
  reversePolygon,
  shapeIssueKey,
  shapeIssues,
  shapeKindKey,
  shapeKindOf,
  storedShape,
  withPolygonPoints,
  withPolygonSymmetric,
  withShapeKind,
  withShapeNumber,
} from './openingTypeShape.ts';

const base = (): OpeningType => ({ ...DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_j120')! });
const TODOS: OpeningShapeIssue[] = [
  'width-invalid', 'height-invalid', 'rise-invalid', 'rise-exceeds-height', 'pointed-rise-below-half', 'round-height-below-half',
  'trapezoid-width-invalid', 'trapezoid-width-mismatch', 'horseshoe-neck-invalid', 'horseshoe-height-too-low', 'polygon-points-invalid',
  'polygon-out-of-box', 'polygon-degenerate', 'polygon-self-intersecting', 'polygon-clockwise', 'polygon-box-not-filled', 'polygon-not-symmetric',
];

describe('forma do vão: edição do rascunho', () => {
  it('toda forma da lista começa válida a partir de um tipo comum, e Retangular tira o campo', () => {
    for (const kind of OPENING_SHAPE_KINDS) {
      const d = withShapeKind(base(), kind);
      expect(shapeKindOf(d), kind).toBe(kind);
      expect(shapeIssues(d), kind).toEqual([]);
      expect('shape' in d, kind).toBe(kind !== 'rect');
      const volta = withShapeKind(d, 'rect');
      expect('shape' in volta, kind).toBe(false);
      expect(volta).toEqual(base());
    }
  });

  it('os parâmetros gravados são os de OPENING_SHAPE_PARAMS', () => {
    for (const kind of OPENING_SHAPE_KINDS) {
      const s = storedShape(withShapeKind(base(), kind));
      // `baseWidth` e `symmetric` são opcionais: ausentes no padrão.
      for (const campo of OPENING_SHAPE_PARAMS[kind].filter((c) => c !== 'baseWidth' && c !== 'symmetric')) expect(s, `${kind}.${campo}`).toHaveProperty(campo);
    }
  });

  it('flecha, pescoço e larguras: gravam, e o valor fora da regra vira problema ao vivo', () => {
    let d = withShapeKind(base(), 'segmental');
    d = withShapeNumber(d, 'rise', 0.5);
    expect(shapeIssues(d)).toEqual([]);
    d = withShapeNumber(d, 'rise', 0.9); // > w/2 (0,6)
    expect(shapeIssues(d)).toContain('rise-invalid');
    d = withShapeKind(base(), 'pointed');
    expect(shapeIssues(withShapeNumber(d, 'rise', 0.1))).toContain('pointed-rise-below-half');
    d = withShapeKind(base(), 'horseshoe');
    expect(shapeIssues(withShapeNumber(d, 'neck', 5))).toContain('horseshoe-neck-invalid');
    d = withShapeKind(base(), 'trapezoid');
    expect(shapeIssues(withShapeNumber(d, 'topWidth', 0.1))).toEqual([]);
    const sem = withShapeNumber(withShapeNumber(d, 'baseWidth', 0.5), 'baseWidth', undefined);
    expect(storedShape(sem)).not.toHaveProperty('baseWidth');
    expect(shapeIssues(withShapeNumber(withShapeNumber(d, 'topWidth', 0.3), 'baseWidth', 0.2))).toContain('trapezoid-width-mismatch');
  });

  it('parâmetro de outra forma é ignorado (sem mudar o tipo)', () => {
    const d = withShapeKind(base(), 'circle');
    expect(withShapeNumber(d, 'rise', 0.3)).toBe(d);
    expect(withShapeNumber(base(), 'rise', 0.3)).toEqual(base());
    expect(withShapeNumber(withShapeKind(base(), 'gable'), 'baseWidth', 0.3)).toEqual(withShapeKind(base(), 'gable'));
  });

  it('a forma acompanha a largura e a altura do tipo', () => {
    const d = { ...withShapeKind(base(), 'trapezoid'), width: 2.4 };
    expect(storedShape(d)).toMatchObject({ width: 2.4, topWidth: 1.2 * 1.2 });
  });

  it('o problema dá round com altura menor que meia largura', () => {
    expect(shapeIssues({ ...withShapeKind(base(), 'round'), width: 3 })).toEqual(['round-height-below-half']);
  });

  it('todo código de problema tem mensagem em pt e en; o rótulo de toda forma também', () => {
    for (const c of TODOS) {
      expect(I18N.pt[shapeIssueKey(c)], c).toBeTruthy();
      expect(I18N.en[shapeIssueKey(c)], c).toBeTruthy();
    }
    for (const k of OPENING_SHAPE_KINDS) expect(I18N.pt[shapeKindKey(k)], k).toBeTruthy();
  });
});

describe('polígono: pontos', () => {
  const poly = (): OpeningType => withShapeKind(base(), 'polygon');

  it('começa com os 5 pontos da casinha, válidos', () => {
    expect(polygonPointsOf(poly())).toHaveLength(5);
    expect(shapeIssues(poly())).toEqual([]);
  });

  it('adicionar insere no meio da aresta mais longa e mantém o polígono válido', () => {
    const pts = polygonPointsOf(poly());
    const mais = addPolygonPoint(pts);
    expect(mais).toHaveLength(6);
    expect(shapeIssues(withPolygonPoints(poly(), mais))).toEqual([]);
  });

  it('remover não passa de 3 pontos; limite de pontos no adicionar', () => {
    let pts = polygonPointsOf(poly());
    pts = removePolygonPoint(removePolygonPoint(pts, 4), 3);
    expect(pts).toHaveLength(3);
    expect(removePolygonPoint(pts, 0)).toHaveLength(3);
    const muitos = Array.from({ length: MAX_POLYGON_POINTS }, (_, i) => ({ u: i, v: 0 }));
    expect(addPolygonPoint(muitos)).toHaveLength(MAX_POLYGON_POINTS);
  });

  it('mover limita à caixa e valida a cada mudança (ponto que cruza o contorno)', () => {
    const d = poly();
    const pts = polygonPointsOf(d);
    expect(movePolygonPoint(pts, 0, -5, 99, d.width, d.height)[0]).toEqual({ u: 0, v: d.height });
    const cruzado = withPolygonPoints(d, movePolygonPoint(pts, 2, 0, 0, d.width, d.height));
    expect(shapeIssues(cruzado).length).toBeGreaterThan(0);
  });

  it('inverter o sentido dá polygon-clockwise e inverter de novo desfaz', () => {
    const d = poly();
    const horario = withPolygonPoints(d, reversePolygon(polygonPointsOf(d)));
    expect(shapeIssues(horario)).toContain('polygon-clockwise');
    expect(shapeIssues(withPolygonPoints(horario, reversePolygon(polygonPointsOf(horario))))).toEqual([]);
  });

  it('simétrico marca e desmarca; assimétrico marcado vira problema', () => {
    const d = poly();
    expect(storedShape(withPolygonSymmetric(d, true))).toMatchObject({ symmetric: true });
    expect(storedShape(withPolygonSymmetric(withPolygonSymmetric(d, true), false))).not.toHaveProperty('symmetric');
    const assim = withPolygonSymmetric(withPolygonPoints(d, movePolygonPoint(polygonPointsOf(d), 3, 0.2, d.height, d.width, d.height)), true);
    expect(shapeIssues(assim)).toContain('polygon-not-symmetric');
  });

  it('shapeIssues é a mesma checagem de validateOpeningShape', () => {
    const d = withShapeKind(base(), 'pointed');
    const fraca = withShapeNumber(d, 'rise', 0.1);
    expect(shapeIssues(fraca)).toEqual(openingShapeProblems(fraca));
    expect(validateOpeningShape(storedShape(fraca)!)).toEqual(shapeIssues(fraca));
  });
});
