import {
  MAX_POLYGON_POINTS,
  defaultOpeningShape,
  openingShapeProblems,
  resizeOpeningShape,
  type OpeningShape,
  type OpeningShapeIssue,
  type OpeningShapeKind,
  type OpeningType,
} from '@hestia/model';
import type { Dict } from '../../../editor/i18n.ts';
import { arredondaMetros } from './openingTypeControls.ts';

/*
 * Edição da forma do vão no diálogo do tipo (docs/estudo-esquadrias/34). Funções puras sobre o rascunho `OpeningType`.
 * Regra de ouro: tipo sem forma e tipo com forma `rect` são o MESMO tipo; escolher "Retangular" tira o campo `shape`.
 * A forma gravada tem sempre a largura e a altura do tipo (o vão bruto, com folga, é calculado na leitura por `openingShapeOf`).
 */

export type PolygonPoint = { u: number; v: number };

/** Forma escolhida (retangular quando o tipo não tem forma). */
export const shapeKindOf = (d: Pick<OpeningType, 'shape'>): OpeningShapeKind => d.shape?.kind ?? 'rect';

/** Forma gravada na largura e altura do tipo; `null` quando o tipo é retangular. */
export function storedShape(d: Pick<OpeningType, 'shape' | 'width' | 'height'>): OpeningShape | null {
  return d.shape && d.shape.kind !== 'rect' ? resizeOpeningShape(d.shape, d.width, d.height) : null;
}

/** Troca o tipo da forma: "Retangular" tira o campo; as outras começam pela forma padrão válida. Mesma forma: não muda nada. */
export function withShapeKind(d: OpeningType, kind: OpeningShapeKind): OpeningType {
  if (shapeKindOf(d) === kind) return d;
  const next: OpeningType = { ...d };
  if (kind === 'rect') delete next.shape;
  else next.shape = defaultOpeningShape(kind, d.width, d.height);
  return next;
}

/** Campos numéricos editáveis das formas (os de `OPENING_SHAPE_PARAMS` que são números). */
export type ShapeNumberField = 'rise' | 'neck' | 'topWidth' | 'baseWidth';

/** Grava um parâmetro numérico; `undefined` tira o campo opcional (só `baseWidth`). Ignora a forma que não o tem. */
export function withShapeNumber(d: OpeningType, field: ShapeNumberField, value: number | undefined): OpeningType {
  const base = storedShape(d);
  if (!base || !(field === 'baseWidth' ? base.kind === 'trapezoid' : field in base)) return d;
  const next: Record<string, unknown> = { ...base };
  if (value === undefined) delete next[field];
  else next[field] = arredondaMetros(value);
  return { ...d, shape: next as unknown as OpeningShape };
}

/** Polígono: troca a lista de pontos. */
export function withPolygonPoints(d: OpeningType, points: PolygonPoint[]): OpeningType {
  const base = storedShape(d);
  return base?.kind === 'polygon' ? { ...d, shape: { ...base, points } } : d;
}

/** Polígono: marca ou desmarca "simétrico" (desmarcado tira o campo). */
export function withPolygonSymmetric(d: OpeningType, symmetric: boolean): OpeningType {
  const base = storedShape(d);
  if (base?.kind !== 'polygon') return d;
  const { symmetric: _antigo, ...resto } = base;
  void _antigo;
  return { ...d, shape: symmetric ? { ...resto, symmetric: true } : resto };
}

/** Pontos do polígono gravado (vazio fora do polígono). */
export function polygonPointsOf(d: OpeningType): PolygonPoint[] {
  const s = storedShape(d);
  return s?.kind === 'polygon' ? s.points : [];
}

/** Novo ponto no meio da aresta mais longa (inserido depois do primeiro vértice dela). Passa de MAX_POLYGON_POINTS: sem mudança. */
export function addPolygonPoint(points: readonly PolygonPoint[]): PolygonPoint[] {
  if (points.length >= MAX_POLYGON_POINTS || points.length < 2) return [...points];
  let best = 0;
  let bestLen = -1;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    const len = Math.hypot(q.u - p.u, q.v - p.v);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  });
  const a = points[best]!;
  const b = points[(best + 1) % points.length]!;
  const out = [...points];
  out.splice(best + 1, 0, { u: arredondaMetros((a.u + b.u) / 2), v: arredondaMetros((a.v + b.v) / 2) });
  return out;
}

/** Tira o ponto `i`; um polígono não fica com menos de 3 pontos (sem mudança). */
export function removePolygonPoint(points: readonly PolygonPoint[], i: number): PolygonPoint[] {
  return points.length <= 3 || i < 0 || i >= points.length ? [...points] : points.filter((_, k) => k !== i);
}

/** Move o ponto `i` para (u, v), limitado à caixa 0..largura, 0..altura e arredondado a 0,1 mm. */
export function movePolygonPoint(points: readonly PolygonPoint[], i: number, u: number, v: number, width: number, height: number): PolygonPoint[] {
  const clamp = (x: number, max: number): number => arredondaMetros(Math.min(Math.max(x, 0), max));
  return points.map((p, k) => (k === i ? { u: clamp(u, width), v: clamp(v, height) } : p));
}

/** Inverte a ordem dos pontos (horário <-> anti-horário). */
export const reversePolygon = (points: readonly PolygonPoint[]): PolygonPoint[] => [...points].reverse();

/** Problemas da forma efetiva do vão (a mesma checagem do aviso `forma-vao-invalida`); vazio = válida ou retangular. */
export const shapeIssues = (d: OpeningType): OpeningShapeIssue[] => openingShapeProblems(d);

/** Chave i18n da mensagem de um código de problema da forma. */
export const shapeIssueKey = (code: OpeningShapeIssue): keyof Dict => `dsh_issue_${code}` as keyof Dict;

/** Chave i18n do rótulo de cada forma. */
export const shapeKindKey = (kind: OpeningShapeKind): keyof Dict => `dsh_kind_${kind}` as keyof Dict;
