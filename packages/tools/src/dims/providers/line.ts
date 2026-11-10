import { add, arcFromSagitta, dist, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { floorViewId, viewAnnotationsOf, type Id, type Project } from '@hestia/model';
import { NON_POSITIVE_MSG, gapTranslation, segFrame, segPoint, segmentGaps, type ParallelGap, type SegFrame } from '../parallel.ts';
import type { DimContext, DimEditResult, DimEnd, DimProvider, TempDim } from '../types.ts';

/** Linha de detalhe a cotar (mora na planta de piso do nível, que é o que o nível guarda). */
export interface DetailLineDimSubject {
  lineId: Id;
}

/** Um trecho do rascunho do Perímetro, montado pela ferramenta (não tem id no projeto). */
export interface PerimeterDraftSeg {
  id: string;
  a: Vec2;
  b: Vec2;
  sag?: number;
}

/** Trechos do Perímetro a cotar: o lado em desenho ou as linhas selecionadas no rascunho. */
export interface PerimeterLineDimSubject {
  segs: ReadonlyArray<PerimeterDraftSeg>;
}

const DETAIL_ID = 'line';
const PERIMETER_ID = 'perimeter';
const DIM_OFFSET = 0.2;
const MIN_LENGTH = 1e-6;

const end = (at: Vec2, slot: string): DimEnd => ({ at, slot, kind: 'wall', current: 'axis', options: ['axis'] });

/** Comprimento do trecho: a corda ou o arco, quando o trecho tem flecha. */
export function segLength(a: Vec2, b: Vec2, sag?: number): number {
  if (sag) {
    const arc = arcFromSagitta(a, b, sag);
    if (arc) return arc.length;
  }
  return dist(a, b);
}

/** Comprimento da linha de detalhe em desenho (prévia da ferramenta). */
export function detailLinePreviewDim(a: Vec2, b: Vec2): TempDim {
  return {
    key: `${DETAIL_ID}:draft:length`,
    a,
    b,
    offset: DIM_OFFSET,
    value: dist(a, b),
    ends: [end(a, 'draftA'), end(b, 'draftB')],
  };
}

function findLine(project: Project, levelId: Id, id: Id) {
  return viewAnnotationsOf(project, floorViewId(levelId)).detailLines.find((x) => x.id === id) ?? null;
}

/** Cota lateral até a linha de detalhe paralela vizinha: editar translada a linha inteira na normal. */
function lateralDim(ctx: DimContext, lineId: Id, f: SegFrame, a: Vec2, b: Vec2, gap: ParallelGap): TempDim {
  const p = segPoint(f, gap.t, 0);
  const q = segPoint(f, gap.t, gap.s);
  const slot = gap.side > 0 ? 'right' : 'left';
  const edit = (value: number): DimEditResult => {
    if (!(value > 0)) return { error: NON_POSITIVE_MSG };
    const d = gapTranslation(f.n, gap, value);
    return { commands: [{ type: 'updateDetailLine', levelId: ctx.levelId, id: lineId, patch: { a: add(a, d), b: add(b, d) } }] };
  };
  return {
    key: `${DETAIL_ID}:${lineId}:${slot}`,
    a: p,
    b: q,
    offset: DIM_OFFSET * gap.side,
    value: gap.distance,
    ends: [end(p, `${slot}A`), end(q, `${slot}B`)],
    edit,
  };
}

/**
 * Linha de detalhe selecionada: distância perpendicular até a linha de detalhe paralela mais próxima de cada lado
 * (editar translada a linha). Sem nenhuma paralela vizinha, cai no comprimento da própria linha (editar move o fim).
 */
export const detailLineDimProvider: DimProvider<DetailLineDimSubject> = {
  id: DETAIL_ID,
  compute(ctx, { lineId }) {
    const line = findLine(ctx.project, ctx.levelId, lineId);
    if (!line) return [];
    const length = dist(line.a, line.b);
    if (length < MIN_LENGTH) return [];
    const f = segFrame(line.a, line.b);
    const others = viewAnnotationsOf(ctx.project, floorViewId(ctx.levelId)).detailLines.filter((x) => x.id !== lineId);
    const gaps = f ? segmentGaps(f, others) : [];
    if (f && gaps.length > 0) return gaps.map((g) => lateralDim(ctx, lineId, f, line.a, line.b, g));
    const edit = (value: number): DimEditResult => {
      if (!(value > 0)) return { error: 'Digite um comprimento maior que zero.' };
      const u = norm(sub(line.b, line.a));
      return { commands: [{ type: 'updateDetailLine', levelId: ctx.levelId, id: lineId, patch: { b: add(line.a, mul(u, value)) } }] };
    };
    return [{
      key: `${DETAIL_ID}:${lineId}:length`,
      a: line.a,
      b: line.b,
      offset: DIM_OFFSET,
      value: length,
      ends: [end(line.a, 'lengthA'), end(line.b, 'lengthB')],
      edit,
    }];
  },
  selectionSubject(project, id, levelId) {
    return levelId && findLine(project, levelId, id) ? { lineId: id } : null;
  },
};

/**
 * Cotas de leitura dos trechos do Perímetro: o lado em desenho ou as linhas selecionadas. A digitação do comprimento
 * continua no fluxo da própria sessão (`perimeterToolInput.ts`/`PerimeterTool.type`), então aqui não há `edit`.
 */
export const perimeterLineDimProvider: DimProvider<PerimeterLineDimSubject> = {
  id: PERIMETER_ID,
  compute(_ctx, { segs }) {
    return segs.flatMap((s): TempDim[] => {
      const value = segLength(s.a, s.b, s.sag);
      if (value < MIN_LENGTH) return [];
      return [{
        key: `${PERIMETER_ID}:${s.id}`,
        a: s.a,
        b: s.b,
        offset: DIM_OFFSET,
        value,
        ends: [end(s.a, `${s.id}A`), end(s.b, `${s.id}B`)],
      }];
    });
  },
};
