import { add, closestOnSegment, dist, mul, norm, sub, type Vec2 } from '@hestia/geom';
import {
  beamPolygon,
  columnPolygon,
  findBeamType,
  findColumnType,
  findFootingType,
  footingPolygon,
  type Beam,
  type Column,
  type Footing,
  type Id,
  type Project,
} from '@hestia/model';
import type { AlignFeature, AlignKind, AlignLine, AlignMove } from './alignFeatures.ts';
import { t as translate, type Lang } from './i18n.ts';

const TOL_PX = 8;

const line = (p: Vec2, d: Vec2): AlignLine => ({ p, d: norm(d) });
const segmentDistance = (at: Vec2, a: Vec2, b: Vec2): number => dist(at, closestOnSegment(at, a, b));
const degenerate = (a: Vec2, b: Vec2): boolean => dist(a, b) < 1e-9;

function makeFeature(
  key: string,
  kind: AlignKind,
  label: string,
  ownerId: Id,
  l: AlignLine,
  move: AlignMove,
  distance: number,
  seg?: { a: Vec2; b: Vec2 },
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
  };
}

/** Feições alinháveis de um pilar: eixos central e secundário e as faces externas. */
export function buildColumnFeatures(
  p: Project,
  c: Column,
  at: Vec2,
  mpp: number,
  hidden?: ReadonlySet<Id>,
  lang: Lang = 'pt',
): AlignFeature[] {
  if (hidden?.has(c.id)) return [];
  const tol = TOL_PX * mpp;
  const out: AlignFeature[] = [];
  const type = findColumnType(p, c.typeId);

  // Eixos centrais ortogonais (segmento finito no domínio do pilar, evita capturar cliques distantes).
  const dir1 = { x: Math.cos(c.rotation), y: Math.sin(c.rotation) };
  const span1 = type.width / 2 + tol;
  const dLine1 = segmentDistance(at, add(c.at, mul(dir1, -span1)), add(c.at, mul(dir1, span1)));
  if (dLine1 <= tol) {
    out.push(
      makeFeature(
        `${c.id}:eixo:1`,
        'eixoPilar',
        translate(lang, 'tl_af_column_axis') || 'eixo do pilar',
        c.id,
        line(c.at, dir1),
        { policy: 'transladar', target: 'pilar', id: c.id },
        dLine1,
      ),
    );
  }

  const dir2 = { x: -Math.sin(c.rotation), y: Math.cos(c.rotation) };
  const span2 = type.depth / 2 + tol;
  const dLine2 = segmentDistance(at, add(c.at, mul(dir2, -span2)), add(c.at, mul(dir2, span2)));
  if (dLine2 <= tol) {
    out.push(
      makeFeature(
        `${c.id}:eixo:2`,
        'eixoPilar',
        translate(lang, 'tl_af_column_axis_sec') || 'eixo secundário do pilar',
        c.id,
        line(c.at, dir2),
        { policy: 'transladar', target: 'pilar', id: c.id },
        dLine2,
      ),
    );
  }

  // Faces do pilar
  const poly = columnPolygon(c, type);
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const v0 = poly[i]!;
    const v1 = poly[(i + 1) % n]!;
    if (degenerate(v0, v1)) continue;
    const dSeg = segmentDistance(at, v0, v1);
    if (dSeg <= tol) {
      out.push(
        makeFeature(
          `${c.id}:face:${i}`,
          'facePilar',
          translate(lang, 'tl_af_column_face') || 'face do pilar',
          c.id,
          line(v0, sub(v1, v0)),
          { policy: 'transladar', target: 'pilar', id: c.id },
          dSeg,
          { a: v0, b: v1 },
        ),
      );
    }
  }

  return out;
}

/** Feições alinháveis de uma viga: eixo longitudinal e faces laterais e de extremidade. */
export function buildBeamFeatures(
  p: Project,
  b: Beam,
  at: Vec2,
  mpp: number,
  hidden?: ReadonlySet<Id>,
  lang: Lang = 'pt',
): AlignFeature[] {
  if (hidden?.has(b.id) || (b.sag && Math.abs(b.sag) > 1e-6)) return [];
  const tol = TOL_PX * mpp;
  const out: AlignFeature[] = [];

  // Eixo da viga
  if (!degenerate(b.a, b.b)) {
    const dAxis = segmentDistance(at, b.a, b.b);
    if (dAxis <= tol) {
      out.push(
        makeFeature(
          `${b.id}:eixo`,
          'eixoViga',
          translate(lang, 'tl_af_beam_axis') || 'eixo da viga',
          b.id,
          line(b.a, sub(b.b, b.a)),
          { policy: 'transladar', target: 'viga', id: b.id },
          dAxis,
          { a: b.a, b: b.b },
        ),
      );
    }
  }

  // Faces da viga (i=0,2 são faces longitudinais; i=1 ponta b, i=3 ponta a -> política pontaViga estica só a extremidade)
  const type = findBeamType(p, b.typeId);
  const poly = beamPolygon(b, type);
  for (let i = 0; i < 4; i++) {
    const v0 = poly[i]!;
    const v1 = poly[(i + 1) % 4]!;
    if (degenerate(v0, v1)) continue;
    const dSeg = segmentDistance(at, v0, v1);
    if (dSeg <= tol) {
      const isEnd = i === 1 || i === 3;
      const move: AlignMove = isEnd
        ? { policy: 'pontaViga', beamId: b.id, end: i === 1 ? 'b' : 'a' }
        : { policy: 'transladar', target: 'viga', id: b.id };
      out.push(
        makeFeature(
          isEnd ? `${b.id}:ponta:${i === 1 ? 'b' : 'a'}` : `${b.id}:face:${i}`,
          isEnd ? 'extremidadeViga' : 'faceViga',
          isEnd ? translate(lang, 'tl_af_beam_end') : translate(lang, 'tl_af_beam_face'),
          b.id,
          line(v0, sub(v1, v0)),
          move,
          dSeg,
          { a: v0, b: v1 },
        ),
      );
    }
  }

  return out;
}

/** Feições alinháveis de uma sapata: eixos ortogonais e 4 faces externas. */
export function buildFootingFeatures(
  p: Project,
  f: Footing,
  at: Vec2,
  mpp: number,
  hidden?: ReadonlySet<Id>,
  lang: Lang = 'pt',
): AlignFeature[] {
  if (hidden?.has(f.id)) return [];
  const tol = TOL_PX * mpp;
  const out: AlignFeature[] = [];

  const type = findFootingType(p, f.typeId);
  const ex = f.eccentricityX ?? 0;
  const ey = f.eccentricityY ?? 0;
  const cos = Math.cos(f.rotation);
  const sin = Math.sin(f.rotation);
  const center = { x: f.at.x + ex * cos - ey * sin, y: f.at.y + ex * sin + ey * cos };

  // Eixos ortogonais da sapata (segmento finito no domínio da sapata)
  const dir1 = { x: cos, y: sin };
  const span1 = type.width / 2 + tol;
  const dLine1 = segmentDistance(at, add(center, mul(dir1, -span1)), add(center, mul(dir1, span1)));
  if (dLine1 <= tol) {
    out.push(
      makeFeature(
        `${f.id}:eixo:1`,
        'eixoSapata',
        translate(lang, 'tl_af_footing_axis') || 'eixo da sapata',
        f.id,
        line(center, dir1),
        { policy: 'transladar', target: 'sapata', id: f.id },
        dLine1,
      ),
    );
  }

  const dir2 = { x: -sin, y: cos };
  const span2 = type.length / 2 + tol;
  const dLine2 = segmentDistance(at, add(center, mul(dir2, -span2)), add(center, mul(dir2, span2)));
  if (dLine2 <= tol) {
    out.push(
      makeFeature(
        `${f.id}:eixo:2`,
        'eixoSapata',
        translate(lang, 'tl_af_footing_axis_sec') || 'eixo secundário da sapata',
        f.id,
        line(center, dir2),
        { policy: 'transladar', target: 'sapata', id: f.id },
        dLine2,
      ),
    );
  }

  // Faces da sapata
  const poly = footingPolygon(f, type);
  for (let i = 0; i < 4; i++) {
    const v0 = poly[i]!;
    const v1 = poly[(i + 1) % 4]!;
    if (degenerate(v0, v1)) continue;
    const dSeg = segmentDistance(at, v0, v1);
    if (dSeg <= tol) {
      out.push(
        makeFeature(
          `${f.id}:face:${i}`,
          'faceSapata',
          translate(lang, 'tl_af_footing_face') || 'face da sapata',
          f.id,
          line(v0, sub(v1, v0)),
          { policy: 'transladar', target: 'sapata', id: f.id },
          dSeg,
          { a: v0, b: v1 },
        ),
      );
    }
  }

  return out;
}
