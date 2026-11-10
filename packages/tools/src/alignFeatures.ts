import {
  arcFromSagitta,
  arcLocal,
  arcPointAt,
  arcTangentAt,
  closestOnSegment,
  dist,
  norm,
  sub,
  type SketchDraft,
  type Vec2,
} from '@hestia/geom';
import { ceilingOutline, frameOfWall, normalAt, pointAt, tangentAt, toLocal, type WallFrame } from '@hestia/engine';
import { t as translate, type Lang } from './i18n.ts';
import {
  coreSpan,
  floorViewId,
  isCeiling,
  isFloor,
  isRoof,
  isSlab,
  levelRoomSeparators,
  openingsOfWall,
  openingType,
  planViewOf,
  projectGrids,
  viewAnnotationsOf,
  viewOwnAnnotationsOf,
  wallsOnLevel,
  type Id,
  type Project,
  type StairCurve,
} from '@hestia/model';
import type { EdgeRef } from './ringEdge.ts';
import { componentCurvesOf, type ComponentPartKey } from './componentEdge.ts';
import { planComponentsInLevel, type PlanComponent } from './componentLevels.ts';
import { distToCurve } from './stairPickLines.ts';
import { gridPath } from './gridGeom.ts';
import type { AlignPrefer } from './types.ts';

/** Feições que o Alinhar reconhece sob o cursor. */
export type AlignKind =
  | 'faceParede'
  | 'eixoParede'
  | 'nucleoParede'
  | 'extremidadeParede'
  | 'ombreiraAbertura'
  | 'centroAbertura'
  | 'arestaAnel'
  | 'linhaEsboco'
  | 'arestaEscada'
  | 'arestaRampa'
  | 'linhaGrade'
  | 'linhaDetalhe'
  | 'separador';

/** Reta de referência: um ponto e uma direção (unitária). */
export interface AlignLine {
  p: Vec2;
  d: Vec2;
}

/**
 * O que a feição admite no segundo passo. `transladar` move o elemento inteiro na perpendicular; `ponta` estica ou
 * encurta a parede até a referência; `abertura` desliza a abertura na hospedeira; `anel` projeta a aresta (os vértices
 * vizinhos acompanham); `esboco` move a linha do esboço; `nenhum` serve só como referência.
 */
export type AlignMove =
  | { policy: 'transladar'; target: 'parede' | 'escada' | 'rampa' | 'grade'; id: Id }
  | { policy: 'ponta'; wallId: Id; end: 'a' | 'b' }
  | { policy: 'abertura'; openingId: Id; hostId: Id; anchor: 'inicio' | 'fim' | 'centro'; width: number }
  | { policy: 'anel'; ref: EdgeRef }
  | { policy: 'esboco'; segId: string }
  | { policy: 'nenhum' };

/** Candidata do Alinhar: a reta, o rótulo, o dono e a política de movimento. */
export interface AlignFeature {
  /** Chave estável entre passadas do mouse (não muda com o ponto do cursor). */
  key: string;
  line: AlignLine;
  kind: AlignKind;
  label: string;
  ownerId: Id;
  move: AlignMove;
  /** Pontas do segmento original, quando a feição é uma aresta/linha (anel, esboço, escada, rampa). */
  seg?: { a: Vec2; b: Vec2 };
  /** Curva lógica completa quando a aresta é um arco (escada/rampa); a prévia desenha o arco inteiro. */
  curve?: StairCurve;
  /** Distância do cursor à feição (m); serve só para ordenar. */
  distance: number;
}

/** Consulta do hover: projeto, nível, cursor, tolerância e a opção "Preferir". */
export interface AlignQuery {
  project: Project;
  levelId: Id;
  at: Vec2;
  metersPerPixel: number;
  prefer?: AlignPrefer;
  hidden?: ReadonlySet<Id>;
  /** Só linhas que servem como referência de cota (grade, detalhe, separador), sem política de movimento. */
  referenceOnly?: boolean;
  /** Planta de área da vista, para enxergar linhas de detalhe/separadores da vista. */
  planId?: Id;
  /** Esboço do perímetro em edição (opcional): as linhas entram como feições alinháveis. */
  draft?: SketchDraft;
  /** Idioma dos rótulos das feições (ausente = português). */
  lang?: Lang;
}

const TOL_PX = 8;

const line = (p: Vec2, d: Vec2): AlignLine => ({ p, d: norm(d) });
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const segmentDistance = (at: Vec2, a: Vec2, b: Vec2): number => dist(at, closestOnSegment(at, a, b));
const degenerate = (a: Vec2, b: Vec2): boolean => dist(a, b) < 1e-9;

/** Tolerância lateral das feições de parede: pega o cursor em qualquer ponto da espessura. */
const wallTol = (mpp: number, f: WallFrame): number => Math.max(TOL_PX * mpp, f.thickness / 2 + 2 * mpp);

function feature(
  key: string,
  kind: AlignKind,
  label: string,
  ownerId: Id,
  l: AlignLine,
  move: AlignMove,
  distance: number,
  seg?: { a: Vec2; b: Vec2 },
  curve?: StairCurve,
): AlignFeature {
  return {
    key,
    kind,
    label,
    ownerId,
    line: l,
    move,
    distance,
    ...(seg ? { seg } : {}),
    ...(curve ? { curve } : {}),
  };
}

/** Feições retas de uma parede: face, eixo, face do núcleo e as duas extremidades. */
function wallFeatures(f: WallFrame, at: Vec2, mpp: number, prefer: AlignPrefer): AlignFeature[] {
  const tol = wallTol(mpp, f);
  const local = toLocal(f, at);
  if (local.t < -tol || local.t > f.length + tol) return [];
  const t = clamp(local.t, 0, f.length);
  const candidates: Array<{ key: string; kind: AlignKind; s: number; label: string }> = [];
  const addLine = (key: string, kind: AlignKind, s: number, label: string): void => {
    candidates.push({ key, kind, s, label });
  };
  addLine(`${f.wall.id}:face:hi`, 'faceParede', f.sHi, 'face da parede');
  addLine(`${f.wall.id}:face:lo`, 'faceParede', f.sLo, 'face da parede');
  addLine(`${f.wall.id}:eixo`, 'eixoParede', 0, 'eixo da parede');
  const core = coreSpan(f.type);
  const sCoreA = f.sign * (f.extOffset - core.from);
  const sCoreB = f.sign * (f.extOffset - core.to);
  addLine(`${f.wall.id}:nucleo:a`, 'nucleoParede', sCoreA, 'face do núcleo');
  addLine(`${f.wall.id}:nucleo:b`, 'nucleoParede', sCoreB, 'face do núcleo');

  const measured = candidates.map((c) => {
    const p = pointAt(f, t, c.s);
    const d = tangentAt(f, t);
    const distance = f.arc ? dist(at, p) : Math.abs(local.s - c.s);
    return { ...c, p, d, distance, l: line(p, d) };
  });
  const near = measured.filter((c) => c.distance <= tol);
  const prefKind: AlignKind = prefer === 'eixos' ? 'eixoParede' : prefer === 'nucleo' ? 'nucleoParede' : 'faceParede';
  const pref = near.filter((c) => c.kind === prefKind);
  const kept = pref.length ? pref : near;
  const out = kept.map((c) =>
    feature(c.key, c.kind, c.label, f.wall.id, c.l, { policy: 'transladar', target: 'parede', id: f.wall.id }, c.distance),
  );

  for (const end of ['a', 'b'] as const) {
    const endT = end === 'a' ? 0 : f.length;
    const segA = pointAt(f, endT, f.sLo);
    const segB = pointAt(f, endT, f.sHi);
    const dEnd = segmentDistance(at, segA, segB);
    if (dEnd > tol) continue;
    out.push(
      feature(
        `${f.wall.id}:ponta:${end}`,
        'extremidadeParede',
        'extremidade da parede',
        f.wall.id,
        line(pointAt(f, endT, 0), normalAt(f, endT)),
        { policy: 'ponta', wallId: f.wall.id, end },
        dEnd,
      ),
    );
  }
  return out;
}

/** Ombreiras e centro das aberturas da parede. Clicar em qualquer ponto do vão já oferece as três. */
function openingFeatures(p: Project, f: WallFrame, at: Vec2, mpp: number): AlignFeature[] {
  const tol = wallTol(mpp, f);
  const local = toLocal(f, at);
  const out: AlignFeature[] = [];
  for (const o of openingsOfWall(p, f.wall.id)) {
    const tipo = openingType(p, o);
    const half = tipo.width / 2;
    const inOpening =
      local.t >= o.offset - half - tol &&
      local.t <= o.offset + half + tol &&
      local.s >= f.sLo - tol &&
      local.s <= f.sHi + tol;
    for (const anchor of ['inicio', 'fim', 'centro'] as const) {
      const t = o.offset + (anchor === 'inicio' ? -half : anchor === 'fim' ? half : 0);
      if (t < -tol || t > f.length + tol) continue;
      const segA = pointAt(f, t, f.sLo);
      const segB = pointAt(f, t, f.sHi);
      const d = segmentDistance(at, segA, segB);
      if (!inOpening && d > tol) continue;
      const nome = o.kind === 'door' ? 'porta' : 'janela';
      const label =
        anchor === 'centro' ? `centro da ${nome}` : anchor === 'inicio' ? `ombreira inicial da ${nome}` : `ombreira final da ${nome}`;
      out.push(
        feature(
          `${o.id}:${anchor}`,
          anchor === 'centro' ? 'centroAbertura' : 'ombreiraAbertura',
          label,
          o.id,
          line(pointAt(f, t, 0), normalAt(f, t)),
          { policy: 'abertura', openingId: o.id, hostId: f.wall.id, anchor, width: tipo.width },
          inOpening ? Math.min(d, 0.001) : d,
        ),
      );
    }
  }
  return out;
}

const RING_LABEL_KEY = {
  floor: 'tl_af_floor',
  slab: 'tl_af_slab',
  roof: 'tl_af_roof',
  ceiling: 'tl_af_ceiling',
} as const;

const ringLabel = (kind: string, lang: Lang = 'pt'): string =>
  translate(lang, RING_LABEL_KEY[kind as keyof typeof RING_LABEL_KEY] ?? 'tl_af_floor');

/** Arestas dos anéis de piso, laje, telhado e forro sob o cursor (contorno e furos). */
function ringFeatures(p: Project, levelId: Id, at: Vec2, mpp: number, hidden?: ReadonlySet<Id>, lang: Lang = 'pt'): AlignFeature[] {
  const tol = TOL_PX * mpp;
  const out: AlignFeature[] = [];
  for (const e of Object.values(p.elements)) {
    if (!(isFloor(e) || isSlab(e) || isRoof(e) || isCeiling(e))) continue;
    if (e.levelId !== levelId || hidden?.has(e.id)) continue;
    const shape = isCeiling(e) ? ceilingOutline(p, e) : e;
    const rings: Array<{ ring: Vec2[]; hole: number | null }> = [
      { ring: shape.boundary, hole: null },
      ...shape.holes.map((h, i) => ({ ring: h, hole: i })),
    ];
    for (const { ring, hole } of rings) {
      const n = ring.length;
      for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        if (degenerate(a, b)) continue;
        const d = segmentDistance(at, a, b);
        if (d > tol) continue;
        const nome = ringLabel(e.kind, lang);
        const label = hole === null ? translate(lang, 'tl_msg_af_edge', { type: nome }) : translate(lang, 'tl_msg_af_hole_edge', { type: nome });
        const ref: EdgeRef = { elementId: e.id, hole, index: i };
        out.push(
          feature(
            `${e.id}:${hole}:${i}`,
            'arestaAnel',
            label,
            e.id,
            line(a, sub(b, a)),
            { policy: 'anel', ref },
            d,
            { a, b },
          ),
        );
      }
    }
  }
  return out;
}

/** Campos de curva de cada tipo de componente, na ordem em que entram no pick. */
const partKeysOf = (isLanding: boolean): ComponentPartKey[] =>
  isLanding ? ['boundary'] : ['boundaryLeft', 'boundaryRight', 'risers', 'path'];

/** Rótulo da feição conforme o campo da curva: limites, espelhos, caminhada ou contorno de patamar. */
function componentLabel(c: PlanComponent, key: ComponentPartKey, lang: Lang = 'pt'): string {
  const nome = c.kind === 'stair' ? translate(lang, 'tl_kind_stair') : translate(lang, 'tl_kind_ramp');
  switch (key) {
    case 'boundary':
      return translate(lang, 'tl_msg_af_component_landing');
    case 'boundaryLeft':
    case 'boundaryRight':
      return translate(lang, 'tl_msg_af_component_boundary', { type: nome });
    case 'risers':
      return translate(lang, 'tl_msg_af_component_riser', { type: nome });
    case 'path':
      return translate(lang, 'tl_stt_sub_walk');
  }
}

/**
 * Feições de escada/rampa visíveis no nível, uma por CURVA LÓGICA (limite, espelho, caminhada ou contorno de
 * patamar). Inclui a que nasce no nível, a que chega nele e a que o atravessa, via `planComponentsInLevel`.
 * Arcos entram com a curva inteira em `curve` e a tangente no ponto mais próximo do cursor em `line`.
 */
function componentFeatures(c: PlanComponent, at: Vec2, tol: number, lang: Lang = 'pt'): AlignFeature[] {
  const out: AlignFeature[] = [];
  const kind: AlignKind = c.kind === 'stair' ? 'arestaEscada' : 'arestaRampa';
  const move: AlignMove = { policy: 'transladar', target: c.kind === 'stair' ? 'escada' : 'rampa', id: c.id };
  c.components.forEach((part, partIndex) => {
    for (const key of partKeysOf(part.kind === 'landing')) {
      const curves = componentCurvesOf(part, key);
      if (!curves) continue;
      curves.forEach((curve, index) => {
        if (degenerate(curve.a, curve.b)) return;
        const distance = distToCurve(curve, at);
        if (distance > tol) return;
        const isArc = Math.abs(curve.sag) >= 1e-9;
        let l: AlignLine;
        if (isArc) {
          const arc = arcFromSagitta(curve.a, curve.b, curve.sag);
          if (arc) {
            // Ponto mais próximo no arco: projeta no sistema do arco, limita ao trecho e lê a tangente ali.
            const t = clamp(arcLocal(arc, at).t, 0, arc.length);
            l = line(arcPointAt(arc, t), arcTangentAt(arc, t));
          } else {
            l = line(curve.a, sub(curve.b, curve.a));
          }
        } else {
          l = line(curve.a, sub(curve.b, curve.a));
        }
        const seg = { a: { ...curve.a }, b: { ...curve.b } };
        const whole: StairCurve | undefined = isArc ? { a: seg.a, b: seg.b, sag: curve.sag } : undefined;
        out.push(
          feature(
            `${c.id}:${partIndex}:${key}:${index}`,
            kind,
            componentLabel(c, key, lang),
            c.id,
            l,
            move,
            distance,
            seg,
            whole,
          ),
        );
      });
    }
  });
  return out;
}

/** Arestas de escadas e rampas visíveis no nível (limites, espelhos, caminhada e patamares). */
function stairRampFeatures(p: Project, levelId: Id, at: Vec2, mpp: number, hidden?: ReadonlySet<Id>, lang: Lang = 'pt'): AlignFeature[] {
  const tol = TOL_PX * mpp;
  const out: AlignFeature[] = [];
  for (const c of planComponentsInLevel(p, levelId)) {
    if (hidden?.has(c.id)) continue;
    out.push(...componentFeatures(c, at, tol, lang));
  }
  return out;
}

/** Linhas do esboço do perímetro em edição (retas; arcos ficam de fora do Alinhar). */
function draftFeatures(draft: SketchDraft | undefined, at: Vec2, mpp: number): AlignFeature[] {
  if (!draft) return [];
  const tol = TOL_PX * mpp;
  const out: AlignFeature[] = [];
  for (const s of draft.segs) {
    if (s.sag || degenerate(s.a, s.b)) continue;
    const d = segmentDistance(at, s.a, s.b);
    if (d > tol) continue;
    out.push(
      feature(
        `esboco:${s.id}`,
        'linhaEsboco',
        'linha do esboço',
        s.id,
        line(s.a, sub(s.b, s.a)),
        { policy: 'esboco', segId: s.id },
        d,
        { a: s.a, b: s.b },
      ),
    );
  }
  return out;
}

/**
 * Todas as feições alinháveis perto do cursor, ordenadas para o primeiro Tab. As paredes oferecem face, eixo e núcleo;
 * a opção "Preferir" decide qual dessas é a inicial (as demais continuam no Tab). Aberturas, extremidades, arestas de
 * anel, linhas do esboço e escadas entram junto, permitindo misturar tipos no mesmo alinhamento.
 */
/** Linhas de referência para cotas: grades, detalhes e separadores. */
function referenceLineFeatures(p: Project, levelId: Id, at: Vec2, mpp: number, planId?: Id): AlignFeature[] {
  const tol = TOL_PX * mpp;
  const out: AlignFeature[] = [];
  for (const g of projectGrids(p)) {
    const path = gridPath(g);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      if (degenerate(a, b)) continue;
      const d = segmentDistance(at, a, b);
      if (d > tol) continue;
      out.push(feature(`${g.id}:grade:${i - 1}`, 'linhaGrade', `grade ${g.name}`, g.id, line(closestOnSegment(at, a, b), sub(b, a)), { policy: 'nenhum' }, d, { a, b }));
    }
  }
  const plan = planId ? planViewOf(p, planId) : undefined;
  const details = plan ? viewOwnAnnotationsOf(p, plan.id).detailLines : viewAnnotationsOf(p, floorViewId(levelId)).detailLines;
  for (const l of details) {
    const d = segmentDistance(at, l.a, l.b);
    if (d > tol) continue;
    out.push(feature(`${l.id}:detalhe`, 'linhaDetalhe', 'linha de detalhe', l.id, line(closestOnSegment(at, l.a, l.b), sub(l.b, l.a)), { policy: 'nenhum' }, d, { a: l.a, b: l.b }));
  }
  for (const r of levelRoomSeparators(p, levelId)) {
    const d = segmentDistance(at, r.a, r.b);
    if (d > tol) continue;
    out.push(feature(`${r.id}:separador`, 'separador', 'separador de ambiente', r.id, line(closestOnSegment(at, r.a, r.b), sub(r.b, r.a)), { policy: 'nenhum' }, d, { a: r.a, b: r.b }));
  }
  return out;
}

export function alignFeaturesAt(q: AlignQuery): AlignFeature[] {
  const prefer = q.prefer ?? 'faces';
  const out: AlignFeature[] = [];
  for (const w of wallsOnLevel(q.project, q.levelId)) {
    if (q.hidden?.has(w.id)) continue;
    const frame = frameOfWall(q.project, w.id);
    if (!frame) continue;
    out.push(...wallFeatures(frame, q.at, q.metersPerPixel, prefer));
    out.push(...openingFeatures(q.project, frame, q.at, q.metersPerPixel));
  }
  out.push(...ringFeatures(q.project, q.levelId, q.at, q.metersPerPixel, q.hidden, q.lang));
  out.push(...stairRampFeatures(q.project, q.levelId, q.at, q.metersPerPixel, q.hidden, q.lang));
  if (q.referenceOnly) out.push(...referenceLineFeatures(q.project, q.levelId, q.at, q.metersPerPixel, q.planId));
  out.push(...draftFeatures(q.draft, q.at, q.metersPerPixel));
  return out.sort((a, b) => a.distance - b.distance);
}
