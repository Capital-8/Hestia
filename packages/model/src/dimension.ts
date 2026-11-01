import { add, len, mul, sub, type Vec2 } from '@hestia/geom';
import type { AngularDimension, AngularDimensionSide, Dimension, Project } from './types.ts';
import type { DimensionStyle } from './dimensionContract.ts';
import { resolveDimEnd } from './dimensionRefs.ts';
import { defaultUnits, type ResolvedUnits } from './units.ts';
import { formatQuantity } from './unitsFormat.ts';

/** Espaçamentos da cota em mm de papel (multiplicados pela escala da vista no render e no DXF). */
export const DIM_GAP_MM = 1.5;
export const DIM_OVERSHOOT_MM = 2;
export const DIM_TICK_HALF_MM = 1.4;
/** Altura padrão do texto do valor, em mm de papel. */
export const DIM_TEXT_MM = 2.5;

/** Comprimento mínimo de uma cota (m): abaixo disso os dois pontos são o mesmo. */
export const DIM_MIN_LENGTH = 0.001;

/** Arredonda a 1 mm, como o valor exibido pela cota. */
export const roundMm = (m: number): number => Math.round(m * 1000) / 1000;

/**
 * Pontos medidos da cota. Uma extremidade com referência a parede existente segue essa extremidade da parede
 * (decisão 0019); sem a parede, vale o ponto guardado (a cota vira livre). Com `ref.axis`, só a coordenada do
 * eixo acompanha a parede e a outra fica na linha guardada — é o que mantém reta uma cadeia de um lado da planta.
 */
export function dimensionPoints(p: Pick<Project, 'elements'>, d: Dimension): { a: Vec2; b: Vec2 } {
  if (d.angular) return { a: d.angular.center, b: add(d.angular.center, mul(d.angular.to, d.angular.radius)) };
  const a = resolveDimEnd(p as Project, d.refs?.a, d.a);
  const b = resolveDimEnd(p as Project, d.refs?.b, d.b);
  if (d.mode === 'horizontal') return { a, b: { x: b.x, y: a.y } };
  if (d.mode === 'vertical') return { a, b: { x: a.x, y: b.y } };
  return { a, b };
}

/**
 * Estilo efetivo de uma cota: o estilo global com os campos da própria cota (tickStyle, textHeight, precision,
 * prefix, suffix, unit) sobrepondo quando presentes.
 */
export function effectiveDimStyle(style: DimensionStyle, d: Pick<Dimension, 'tickStyle' | 'textHeight' | 'precision' | 'prefix' | 'suffix' | 'unit'>): DimensionStyle {
  return {
    ...style,
    ...(d.tickStyle !== undefined ? { tick: d.tickStyle } : {}),
    ...(d.textHeight !== undefined ? { textHeight: d.textHeight } : {}),
    ...(d.precision !== undefined ? { precision: d.precision } : {}),
    ...(d.prefix !== undefined ? { prefix: d.prefix } : {}),
    ...(d.suffix !== undefined ? { suffix: d.suffix } : {}),
    ...(d.unit !== undefined ? { unit: d.unit } : {}),
  };
}

/** Valor da cota em metros, arredondado a 1 mm; em cota angular, o ângulo em radianos. */
export function dimensionValue(p: Pick<Project, 'elements'>, d: Dimension): number {
  if (d.angular) return d.angular.value;
  const { a, b } = dimensionPoints(p, d);
  return roundMm(len(sub(b, a)));
}

/** Texto do valor na unidade de comprimento do projeto (padrão: metros com duas casas). */
export const formatDimensionValue = (m: number, units = defaultUnits()): string => formatQuantity(units, 'length', m);

/**
 * Formatação de valor para cotas. Sem unidade (ou com a unidade project), usa a unidade e as casas do projeto; a
 * unidade explícita de arquivos antigos (m, cm ou mm) continua valendo. precision sobrepõe as casas.
 */
export function formatDimension(d: Dimension, meters: number, units = defaultUnits(), style?: Partial<Pick<DimensionStyle, 'unit' | 'precision' | 'prefix' | 'suffix'>>): string {
  // Os campos da própria cota sobrepõem o estilo global (quando dado).
  const prefix = d.prefix ?? style?.prefix ?? '';
  const suffix = d.suffix ?? style?.suffix ?? '';
  if (d.angular) {
    const text = formatQuantity(units, 'angle', d.angular.value, { decimals: d.precision ?? style?.precision ?? d.angular.precision, withUnit: !suffix });
    return `${prefix}${text}${suffix}`;
  }
  const dUnit = d.unit ?? style?.unit;
  const unit = dUnit && dUnit !== 'project' ? dUnit : undefined;
  const text = formatQuantity(units, 'length', meters, { unit, decimals: d.precision ?? style?.precision, withUnit: !suffix });
  return `${prefix}${text}${suffix}`;
}

/** Texto mostrado na cota: o texto fixo, se houver algum (sem espaços nas pontas); senão, o valor medido com a formatação da cota. */
export function dimensionText(p: Pick<Project, 'elements'>, d: Dimension, units: ResolvedUnits): string {
  const fixed = d.text?.trim();
  return fixed ? fixed : formatDimension(d, dimensionValue(p, d), units);
}

export interface DimensionGeometry {
  /** Linha de cota, de uma extremidade à outra. */
  line: [Vec2, Vec2];
  /** Linhas de chamada: do ponto medido até além da linha de cota. */
  extensions: [[Vec2, Vec2], [Vec2, Vec2]];
  /** Marcas a 45° nas extremidades da linha de cota. */
  ticks: [[Vec2, Vec2], [Vec2, Vec2]];
  /** Centro do texto do valor: no meio da cota, acima da linha. */
  textAt: Vec2;
  /** Ângulo do texto em graus, sempre legível pela esquerda ou por baixo (−90 < θ ≤ 90). */
  textRotation: number;
  /** Comprimento medido, em metros. */
  length: number;
}

/** Geometria de uma cota angular: arco, chamadas, marcas e posição do texto. */
export interface AngularDimensionGeometry {
  center: Vec2;
  start: Vec2;
  end: Vec2;
  arc: Vec2[];
  extensions: Array<[Vec2, Vec2]>;
  ticks: [[Vec2, Vec2], [Vec2, Vec2]];
  textAt: Vec2;
  textRotation: number;
  value: number;
}

/** Geometria da cota angular a partir do centro, das direções unitárias e do raio. */
export function angularDimensionGeometry(d: Dimension, segments = 24): AngularDimensionGeometry | null {
  const a = d.angular;
  if (!a || !(a.radius > 0)) return null;
  const angleA = Math.atan2(a.from.y, a.from.x);
  const angleB = Math.atan2(a.to.y, a.to.x);
  let delta = angleB - angleA;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  // A volta percorre o arco longo (> π), no sentido contrário ao arco curto: o desenho dos modos menor/maior não muda.
  if (a.side === 'reflex') delta = delta > 0 ? delta - Math.PI * 2 : delta + Math.PI * 2;
  const pointAt = (angle: number, radius: number): Vec2 => ({ x: a.center.x + Math.cos(angle) * radius, y: a.center.y + Math.sin(angle) * radius });
  const arc: Vec2[] = [];
  // Mais segmentos no arco longo para a curvatura não ficar angulosa.
  const steps = Math.max(segments, Math.ceil(segments * Math.abs(delta) / Math.PI));
  for (let i = 0; i <= steps; i++) arc.push(pointAt(angleA + (delta * i) / steps, a.radius));
  const start = arc[0]!;
  const end = arc[arc.length - 1]!;
  const tick = Math.max(0.04, a.radius * 0.05);
  // Marca "/" a 45° da linha de referência (radial), centrada na ponta: é a mesma marca arquitetônica das cotas lineares.
  const tickAt = (angle: number, point: Vec2): [Vec2, Vec2] => {
    const radial = { x: Math.cos(angle), y: Math.sin(angle) };
    const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
    const sum = { x: radial.x + tangent.x, y: radial.y + tangent.y };
    const k = Math.hypot(sum.x, sum.y);
    const u = { x: sum.x / k, y: sum.y / k };
    return [{ x: point.x - u.x * tick, y: point.y - u.y * tick }, { x: point.x + u.x * tick, y: point.y + u.y * tick }];
  };
  const mid = angleA + delta / 2;
  const textAt = d.textAt ?? pointAt(mid, a.radius + Math.max(0.12, a.radius * 0.12));
  const rotationRaw = (mid * 180) / Math.PI;
  let textRotation = rotationRaw;
  while (textRotation > 90) textRotation -= 180;
  while (textRotation <= -90) textRotation += 180;
  return {
    center: a.center,
    start,
    end,
    arc,
    // A cota angular não desenha chamadas radiais: elas formavam um V entre as
    // paredes e sugeriam um retorno para fora das referências escolhidas.
    extensions: a.links ?? [],
    ticks: [tickAt(angleA, start), tickAt(angleB, end)],
    textAt,
    textRotation,
    value: Math.abs(delta),
  };
}

/**
 * Cota angular pronta para virar anotação. `side` menor/maior mantém o comportamento de sempre. `reflex` é a volta:
 * complementa o lado `base` (menor ou maior, padrão menor) — 2π − valor do lado complementado — e guarda a direção
 * desse lado em `to`, para a geometria saber qual arco longo desenhar.
 */
export function angularDimensionData(center: Vec2, from: Vec2, to: Vec2, radius: number, side: AngularDimensionSide, refA: string, refB: string, base: 'minor' | 'major' = 'minor'): AngularDimension {
  const minor = Math.acos(Math.max(-1, Math.min(1, from.x * to.x + from.y * to.y)));
  if (side === 'minor') return { refA, refB, center, from, to, radius, side, value: minor };
  if (side === 'major') return { refA, refB, center, from, to: { x: -to.x, y: -to.y }, radius, side, value: Math.PI - minor };
  const complemented = base === 'major' ? { x: -to.x, y: -to.y } : to;
  return { refA, refB, center, from, to: complemented, radius, side, base, value: Math.PI * 2 - (base === 'major' ? Math.PI - minor : minor) };
}

/** Parâmetros de estilo da geometria (mm de papel). Ausentes mantêm os padrões históricos. */
export interface DimensionGeometryOptions {
  extensionGapMm?: number;
  extensionOvershootMm?: number;
  /** Meio comprimento da marca de 45°. */
  tickHalfMm?: number;
  /** Folga entre a linha e o texto 'above'. */
  textGapMm?: number;
  /** Texto centrado sobre a linha (interrompendo-a) em vez de acima. */
  centered?: boolean;
}

/**
 * Geometria da cota alinhada a–b, em metros. `mPerMm` é quantos metros de mundo cabem em 1 mm de papel
 * (escala da vista / 1000); assim as distâncias de papel (folga, marcas, texto) ficam legíveis em qualquer escala.
 * `offset` leva a linha de cota para o lado esquerdo de a→b (negativo, para o direito).
 */
export function dimensionGeometry(a: Vec2, b: Vec2, offset: number, mPerMm: number, textMm = DIM_TEXT_MM, textAt?: Vec2, opts: DimensionGeometryOptions = {}): DimensionGeometry {
  const d = sub(b, a);
  const length = len(d);
  const u: Vec2 = length > 0 ? { x: d.x / length, y: d.y / length } : { x: 1, y: 0 };
  const n: Vec2 = { x: -u.y, y: u.x };
  const s = offset >= 0 ? 1 : -1;
  const gap = (opts.extensionGapMm ?? DIM_GAP_MM) * mPerMm;
  const over = (opts.extensionOvershootMm ?? DIM_OVERSHOOT_MM) * mPerMm;
  const tick = (opts.tickHalfMm ?? DIM_TICK_HALF_MM) * mPerMm;
  const textGap = (opts.textGapMm ?? DIM_GAP_MM) * mPerMm;
  const ta = add(a, mul(n, offset));
  const tb = add(b, mul(n, offset));
  // Marca a 45° da linha de cota: direção u girada 45° (u + n)/√2.
  const t: Vec2 = mul({ x: u.x + n.x, y: u.y + n.y }, tick / Math.SQRT2);
  const readable = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  let textRotation = readable;
  if (textRotation > 90) textRotation -= 180;
  if (textRotation <= -90) textRotation += 180;
  // Vetor "para cima" do texto: normal esquerda da direção legível.
  const rad = (textRotation * Math.PI) / 180;
  const up: Vec2 = { x: -Math.sin(rad), y: Math.cos(rad) };
  const mid = mul(add(ta, tb), 0.5);
  return {
    line: [ta, tb],
    extensions: [
      [add(a, mul(n, s * gap)), add(a, mul(n, offset + s * over))],
      [add(b, mul(n, s * gap)), add(b, mul(n, offset + s * over))],
    ],
    ticks: [
      [sub(ta, t), add(ta, t)],
      [sub(tb, t), add(tb, t)],
    ],
    textAt: textAt ?? (opts.centered ? mid : add(mid, mul(up, textGap + (textMm * mPerMm) / 2))),
    textRotation,
    length,
  };
}
