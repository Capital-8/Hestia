/* eslint-disable max-lines -- o motor reúne paredes, faces, grades, capturas extras e CAD numa passada só; dividir perderia o ranking único */
import {
  arcFromSagitta,
  arcLocal,
  arcPointAt,
  closestOnSegment,
  dist,
  dot,
  intersectCircleLine,
  intersectCircles,
  intersectSegments,
  len,
  norm,
  sub,
  v2,
  type Arc,
  type Vec2,
} from '@hestia/geom';
import { frameOfWall, wallFacesCached as facesOf, type WallFaces } from '@hestia/engine';
import { openingTypeById, openingsOfWall, totalThickness, wallsOnLevel, type Id, type Project, type Wall } from '@hestia/model';
import { closestOnWall, wallMid } from './wallGeom.ts';
import { addGridSnaps } from './gridSnapPoints.ts';
import { addCadSnaps, type CadSnapIndex } from './snapCad.ts';
import { addExtraPoints, addExtraSegments, addExtraTracks } from './snapExtras.ts';
import { arestasPerto, pontosNasFaixas } from './snapAccel.ts';
import { orthoPoint, polarPoint } from './angleSnap.ts';
import { DEFAULT_SNAP, type Guide, type Inference, type SnapKind, type SnapOptions } from './types.ts';

/** Ponto extra de captura. `hostId` é o elemento dono: some da captura quando ele está em `ignore` (ex.: o piso sendo movido). */
export type SnapPoint = Vec2 & { hostId?: Id; kind?: SnapKind };

/**
 * Trilha de alinhamento pronta para o rastreamento: uma aresta (horizontal, vertical ou inclinada, `axis`) cuja reta
 * pode ser estendida além das pontas. Na planta são as faces das ombreiras; na seção, todas as arestas da vista.
 */
export interface ExtraTrack {
  a: Vec2;
  b: Vec2;
  hostId?: Id;
  axis?: 'h' | 'v' | 'd';
  /** Marcador da origem da trilha (`face` nas faces e nas arestas da seção). */
  kind?: SnapKind;
}

export interface InferContext {
  project: Project;
  levelId: Id;
  /** Metros por pixel: define a tolerância visual (~10 px). */
  mpp: number;
  gridStep: number;
  /** Ponto anterior (para ortogonal, perpendicular e comprimento). */
  from?: Vec2;
  orthoLock?: boolean;
  /** Rastreamento polar (F10): trava a direção nos múltiplos de `polarIncrementDeg`. Ortogonal tem prioridade. */
  polar?: boolean;
  polarIncrementDeg?: number;
  /** Ignorar estes elementos (por exemplo, os que estão sendo movidos). */
  ignore?: Set<Id>;
  /** Desliga a atração para a grade (ex.: inserir aberturas). */
  noGrid?: boolean;
  /** Candidato exclusivo: só pontos sobre paredes. */
  onWallsOnly?: boolean;
  /** Pontos extras de captura (vértices de pisos, contorno em construção). */
  extraPoints?: SnapPoint[];
  /** Capturas ligadas (padrão: DEFAULT_SNAP). */
  snap?: SnapOptions;
  /** Arestas de captura (contornos de pisos e lajes, ombreiras de aberturas): o pé da perpendicular sobre a aresta vira captura. */
  extraSegments?: Array<{ a: Vec2; b: Vec2; hostId?: Id; kind?: SnapKind }>;
  /**
   * Trilhas de alinhamento (arestas da seção e ombreiras): a reta é estendida além das pontas e o cursor projeta
   * sobre ela com guia de alinhamento, inclusive nas inclinadas. `infer` só considera as que passam perto do cursor.
   */
  extraTracks?: ExtraTrack[];
  /** Tab: índice do candidato escolhido entre todos os que estão ao alcance (ordenados por custo). */
  cycle?: number;
  /** Captura escolhida na posição anterior do cursor: mantém-na enquanto continuar valendo (histerese). */
  previous?: Inference | null;
  /** Pavimento de referência visível na planta: paredes e faces dele também são alvo (o que se vê, se captura). */
  underlayLevelId?: Id | null;
  /** Filtro de visibilidade: paredes ocultas ou fora do recorte da vista não são alvo. Ausente = todas. */
  isVisible?: (w: Wall) => boolean;
  /** Desenhos CAD importados indexados: vértices, meios, pontos e cruzamentos das linhas servem de referência. */
  cad?: readonly CadSnapIndex[];
  /**
   * Vista de corte/elevação em coordenadas (t, z): as paredes, faces, grades e CAD da planta não entram — só os pontos
   * e arestas entregues pela vista em `extraPoints`/`extraSegments`. Os cruzamentos entre essas arestas viram captura.
   */
  section?: boolean;
}

const TOL_PX = 10;
/** Bônus (em tolerâncias) para manter a captura anterior. Evita que o alvo pisque entre dois candidatos quase iguais. */
const HYSTERESIS = 0.15;

/**
 * Custo por tipo, somado à distância do cursor normalizada pela tolerância (menor vence). A ordem dos pesos é a
 * da intenção: vértice, depois cruzamento de restrições, depois aresta, e alinhamento simples por último. Um vértice
 * dentro da abertura vence a aresta; alinhamento simples não puxa o ponto para fora de uma face.
 */
const WEIGHT: Record<SnapKind, number> = {
  endpoint: 0,
  face: 0.1,
  intersection: 0.1,
  midpoint: 0.25,
  perpendicular: 0.3,
  core: 0.4,
  nearest: 0.7,
  alignment: 0.9,
  ortho: 1,
  polar: 1,
  grid: 1.5,
  center: 0.2,
  tangent: 0.3,
  none: 9,
};
/** Cruzamento de duas restrições (x × y, x × face, face × face): o ponto que o usuário mira. */
const WEIGHT_ALIGN_CROSS = 0.3;
/**
 * Candidato da trilha de aresta dentro do segmento: peso baixo para a aresta real vencer o alinhamento simples de um
 * ponto de referência (ex.: midpoint) sem competir com endpoint (0) nem com a captura de aresta (0.7).
 */
const WEIGHT_TRACK = 0.2;
/** Alinhamento simples só por ponto de referência na seção: acima de `1 + WEIGHT_TRACK`, então a aresta vence. */
const WEIGHT_ALIGN_SECTION = 1.25;
/** Reta travada de Orto/Polar: é só o reserva; qualquer captura real sobre a reta ao alcance (extremidade, cruzamento, extensão) vence. */
const LOCK_WEIGHT = 3;

const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

interface Cand {
  point: Vec2;
  kind: SnapKind;
  weight: number;
  guides: Guide[];
  hostId?: Id;
}

/** Pontos cuja caixa envolvente está a até `tol` do cursor (descarte rápido antes das contas de aresta). */
function boxNear(cursor: Vec2, pts: Vec2[], tol: number): boolean {
  if (pts.length === 0) return false;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const q of pts) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
  }
  return cursor.x >= minX - tol && cursor.x <= maxX + tol && cursor.y >= minY - tol && cursor.y <= maxY + tol;
}

/** Arco do eixo da parede, ou null se for reta. */
const curveOf = (w: Wall): Arc | null => arcFromSagitta(w.a, w.b, w.sag);

/** Ponto está dentro do trecho do arco (não só no círculo). */
function onArc(arc: Arc, p: Vec2): boolean {
  const { t } = arcLocal(arc, p);
  return t >= -1e-9 && t <= arc.length + 1e-9;
}

/** Ponto está dentro do segmento a→b. */
function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  const d = sub(b, a);
  const ll = dot(d, d);
  if (ll < 1e-12) return false;
  const t = dot(sub(p, a), d) / ll;
  return t >= -1e-9 && t <= 1 + 1e-9;
}

/** Interseções entre os eixos de duas paredes (reta ou arco), só nos trechos que existem. */
export function wallCrossings(w1: Wall, w2: Wall): Vec2[] {
  const c1 = curveOf(w1);
  const c2 = curveOf(w2);
  if (!c1 && !c2) {
    const p = intersectSegments(w1.a, w1.b, w2.a, w2.b);
    return p ? [p] : [];
  }
  if (c1 && c2) {
    return intersectCircles(c1.center, c1.radius, c2.center, c2.radius).filter((p) => onArc(c1, p) && onArc(c2, p));
  }
  const [arc, seg] = c1 ? [c1, w2] : [c2!, w1];
  return intersectCircleLine(arc.center, arc.radius, seg.a, sub(seg.b, seg.a)).filter((p) => onArc(arc, p) && onSegment(seg.a, seg.b, p));
}

/** Pés da perpendicular a partir de `from` sobre a parede (reta ou arco), só nos trechos reais. */
function perpendicularFeet(w: Wall, from: Vec2): Vec2[] {
  const arc = curveOf(w);
  if (arc) {
    const d = sub(from, arc.center);
    const l = len(d);
    if (l < 1e-9) return [];
    const u = { x: d.x / l, y: d.y / l };
    // Perpendicular a um círculo: o pé fica sobre a reta que liga o centro ao ponto de origem.
    return [v2(arc.center.x + u.x * arc.radius, arc.center.y + u.y * arc.radius), v2(arc.center.x - u.x * arc.radius, arc.center.y - u.y * arc.radius)].filter((p) => onArc(arc, p));
  }
  const ab = sub(w.b, w.a);
  const abLen = len(ab);
  const t = abLen > 1e-9 ? dot(sub(from, w.a), norm(ab)) : -1;
  if (!(t > 0 && t < abLen)) return [];
  return [closestOnSegment(from, w.a, w.b)];
}

/** Linha de referência de alinhamento: vertical (x = valor) ou horizontal (y = valor). */
interface AxisLine {
  value: number;
  from: Vec2;
}

/** Trecho de face usado como restrição de alinhamento (reta infinita que passa por a e b). */
interface TrackLine {
  a: Vec2;
  b: Vec2;
  hostId?: Id;
  axis?: 'h' | 'v' | 'd';
  kind?: SnapKind;
}

/** Interseção de duas retas infinitas (p1 + k·d1 e p2 + m·d2), ou null se paralelas. */
function intersectLines(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-12) return null;
  const k = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
  return v2(p1.x + d1.x * k, p1.y + d1.y * k);
}

/** Interseção de uma reta infinita com a linha x = v (ou y = v). */
function crossAxis(p: Vec2, d: Vec2, axis: 'x' | 'y', v: number): Vec2 | null {
  const dd = axis === 'x' ? d.x : d.y;
  if (Math.abs(dd) < 1e-12) return null;
  const k = (v - (axis === 'x' ? p.x : p.y)) / dd;
  return v2(p.x + d.x * k, p.y + d.y * k);
}

/**
 * Cruzamentos entre as arestas da seção (contornos de corte/além, aberturas, membranas e linhas de nível). Só entram os
 * trechos ao alcance do cursor, então o par a par fica pequeno mesmo numa vista cheia de arestas.
 */
function addSectionCrossings(ctx: InferContext, sn: SnapOptions, cursor: Vec2, tol: number, add: (point: Vec2, kind: SnapKind, guides?: Guide[], hostId?: Id, weight?: number) => void): void {
  if (!sn.intersections) return;
  const reach = tol * Math.SQRT2;
  const reach2 = reach * reach;
  const near: Array<{ a: Vec2; b: Vec2; hostId?: Id }> = [];
  // Vista com milhares de arestas: só as da vizinhança do cursor chegam ao teste de caixa (ver `snapAccel`).
  for (const e of arestasPerto(ctx.extraSegments, cursor, reach)) {
    if (e.hostId !== undefined && ctx.ignore?.has(e.hostId)) continue;
    if (dist2(e.a, e.b) < 1e-18) continue;
    // Caixa expandida: aresta longe do cursor não entra no par a par (a vista pode ter milhares delas).
    const minX = Math.min(e.a.x, e.b.x) - reach;
    const maxX = Math.max(e.a.x, e.b.x) + reach;
    const minY = Math.min(e.a.y, e.b.y) - reach;
    const maxY = Math.max(e.a.y, e.b.y) + reach;
    if (cursor.x < minX || cursor.x > maxX || cursor.y < minY || cursor.y > maxY) continue;
    if (dist2(cursor, closestOnSegment(cursor, e.a, e.b)) <= reach2) near.push(e);
  }
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const p = intersectSegments(near[i]!.a, near[i]!.b, near[j]!.a, near[j]!.b);
      if (p && dist2(cursor, p) <= reach2) add(p, 'intersection');
    }
  }
}

/**
 * Motor de inferência único (docs/01 §8): função pura que devolve o melhor ponto e as guias.
 * Todas as ferramentas o consomem; o cursor "adivinha" o que o usuário quer.
 *
 * Cada captura é um candidato com custo = distância normalizada pela tolerância + peso do tipo. Alinhamentos
 * são restrições (x = ref, y = ref, trecho de face); as interseções entre restrições viram candidatos próprios,
 * então face + alinhamento e dois alinhamentos cruzados produzem o mesmo ponto que o usuário vê.
 */
export function infer(rawCursor: Vec2, ctx: InferContext): Inference {
  const sn = { ...DEFAULT_SNAP, ...ctx.snap };
  const tol = TOL_PX * ctx.mpp;
  const g = ctx.noGrid || !sn.grid ? 0 : ctx.gridStep;
  const gridFree = (v: number): number => (g > 0 ? Math.round(v / g) * g : v);

  // Ortogonal (F8) e polar (F10) são restrições de direção, não atalhos que encerram a busca: o cursor é levado à
  // semirreta travada e todos os rastreios (extensão, interseção com arestas, alinhamento) continuam valendo, mas só
  // os candidatos que caem SOBRE a reta. Ortogonal tem prioridade sobre polar.
  let lock: { point: Vec2; kind: 'ortho' | 'polar'; dir: Vec2 } | null = null;
  if (ctx.from && (ctx.orthoLock || ctx.polar)) {
    const kind = ctx.orthoLock ? 'ortho' : 'polar';
    const snapped = ctx.orthoLock ? orthoPoint(rawCursor, ctx.from, gridFree) : polarPoint(rawCursor, ctx.from, ctx.polarIncrementDeg);
    if (!snapped) return { point: rawCursor, kind: 'none', guides: [] };
    const along = sub(snapped, ctx.from);
    const alongLen = len(along);
    if (alongLen <= 1e-9 || sn.enabled === false) {
      return { point: snapped, kind, guides: [{ from: ctx.from, to: snapped, kind }] };
    }
    lock = { point: snapped, kind, dir: v2(along.x / alongLen, along.y / alongLen) };
  }
  if (sn.enabled === false) return { point: rawCursor, kind: 'none', guides: [] };
  const cursor = lock ? lock.point : rawCursor;
  const free = lock ? (v: number): number => v : gridFree;
  // Pavimento atual e, se visível como referência, o de baixo: o que se vê na planta é o que se captura.
  const levels: Id[] = ctx.underlayLevelId ? [ctx.levelId, ctx.underlayLevelId] : [ctx.levelId];
  // Na seção, a geometria da planta não é alvo: o que vale são os pontos e arestas da vista.
  const facesIn = (): WallFaces[] => (ctx.section ? [] : levels.flatMap((l) => facesOf(ctx.project, l)));
  const walls = ctx.section ? [] : levels.flatMap((l) => wallsOnLevel(ctx.project, l)).filter((w) => !ctx.ignore?.has(w.id) && (ctx.isVisible?.(w) ?? true));
  const cands: Cand[] = [];
  /** Escolha final. Com Orto/Polar travado só valem os candidatos sobre a reta; a própria reta é o candidato de reserva. */
  const decide = (grid: number | undefined): Inference => {
    if (!lock || !ctx.from) return bestOf(cands, cursor, tol, ctx.previous, ctx.cycle, [], grid);
    const origin = ctx.from;
    const onRay = cands.filter((c) => Math.abs((c.point.x - origin.x) * lock.dir.y - (c.point.y - origin.y) * lock.dir.x) <= 1e-6);
    onRay.push({ point: lock.point, kind: lock.kind, weight: LOCK_WEIGHT, guides: [{ from: origin, to: lock.point, kind: lock.kind }] });
    return bestOf(onRay, cursor, tol, ctx.previous, ctx.cycle, [], undefined);
  };
  const add = (point: Vec2, kind: SnapKind, guides: Guide[] = [], hostId?: Id, weight: number = WEIGHT[kind]): void => {
    cands.push({ point, kind, weight, guides, hostId });
  };

  const ends: Vec2[] = [];
  /** Paredes cujo eixo passa pela tolerância: só elas podem formar uma interseção ao alcance do cursor. */
  const nearWalls: Wall[] = [];
  for (const w of walls) {
    ends.push(w.a, w.b);
    const near = closestOnWall(w, cursor);
    if (near.dist <= tol) nearWalls.push(w);
    // Cada captura tem a sua chave: extremidade e ponto médio não dependem do eixo, que controla a captura "nearest".
    if (sn.endpoint !== false) {
      // Pontas, pontos médios e interseções guardam a parede de origem: o tooltip mostra o nome dela.
      for (const p of [w.a, w.b]) {
        if (dist(cursor, p) <= tol) add(p, 'endpoint', [], w.id);
      }
    }
    if (sn.midpoint !== false) {
      const m = wallMid(w);
      if (dist(cursor, m) <= tol) add(m, 'midpoint', [], w.id);
    }
    // Sobre o eixo: também é o ponto de hospedagem de portas e janelas, por isso fica ligado com a captura de eixo.
    if (sn.axis && near.dist <= tol) add(near.point, 'nearest', [], w.id);

    if (sn.perpendicular && ctx.from) {
      for (const foot of perpendicularFeet(w, ctx.from)) {
        if (dist(cursor, foot) <= tol && dist(foot, ctx.from) > 1e-6) add(foot, 'perpendicular', [{ from: ctx.from, to: foot, kind: 'perpendicular' }]);
      }
    }
  }
  // Pontos extras (vértices de pisos, contorno em construção, aberturas) não entram na captura exclusiva de paredes.
  addExtraPoints(ctx, sn, cursor, tol, add);
  // Arestas de pisos e lajes e ombreiras de aberturas: o pé sobre a aresta é captura de aresta, com o dono para o ignore.
  if (!ctx.onWallsOnly) addExtraSegments(ctx, sn, cursor, tol, add);
  // Seção: os cruzamentos entre as arestas da vista (contornos, aberturas, membranas e níveis) são captura própria.
  if (!ctx.onWallsOnly && ctx.section) addSectionCrossings(ctx, sn, cursor, tol, add);
  // Orto/Polar: onde a reta travada cruza uma aresta (contorno de peça, esquadria, nível, eixo ou face de parede) é uma
  // interseção; o usuário mira ali para continuar a linha sem sair da direção.
  if (lock && ctx.from && sn.intersections && !ctx.onWallsOnly) {
    const lockFrom = ctx.from;
    const probe: [Vec2, Vec2] = [v2(cursor.x - lock.dir.x * tol * 1.5, cursor.y - lock.dir.y * tol * 1.5), v2(cursor.x + lock.dir.x * tol * 1.5, cursor.y + lock.dir.y * tol * 1.5)];
    const cross = (e0: Vec2, e1: Vec2, hostId?: Id): void => {
      const p = intersectSegments(probe[0], probe[1], e0, e1);
      if (p && dist(cursor, p) <= tol && dist(p, lockFrom) > 1e-6) add(p, 'intersection', [], hostId);
    };
    for (const e of arestasPerto(ctx.extraSegments, cursor, tol * 2)) {
      if (e.hostId !== undefined && ctx.ignore?.has(e.hostId)) continue;
      cross(e.a, e.b, e.hostId);
    }
    for (const w of walls) if (!curveOf(w)) cross(w.a, w.b, w.id);
    if (sn.faces) {
      for (const wf of facesIn()) {
        if (ctx.ignore?.has(wf.wallId) || !boxNear(cursor, wf.outline, tol)) continue;
        for (const seg of wf.outline.length >= 3 ? wf.outline.map((p, i) => [p, wf.outline[(i + 1) % wf.outline.length]!] as [Vec2, Vec2]) : wf.faces) cross(seg[0], seg[1], wf.wallId);
      }
    }
  }
  // Grades de eixos (do projeto): pontas, cruzamentos com grades e paredes e o ponto sobre a linha.
  if (!ctx.onWallsOnly && !ctx.section) addGridSnaps(ctx.project, sn, cursor, tol, walls, ctx.ignore, add);
  // Linhas e vértices dos desenhos CAD importados (DXF) servem de referência, como as paredes.
  if (!ctx.onWallsOnly && !ctx.section) addCadSnaps(ctx.cad, sn, cursor, tol, ctx.from, add, ctx.ignore);
  // Faces: cantos, pontos médios, arestas e pé da perpendicular nas faces de acabamento e (opcional) do núcleo.
  const addSegs = (segs: Array<[Vec2, Vec2]>, kind: 'face' | 'core', hostId?: Id, perpOnly = false): void => {
    for (const [a, b] of segs) {
      if (dist(a, b) < 1e-9) continue;
      if (!perpOnly && sn.endpoint !== false) {
        for (const q of [a, b]) {
          if (dist(cursor, q) <= tol) add(q, kind, [], hostId);
        }
      }
      if (!perpOnly && sn.midpoint !== false) {
        const mid = v2((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (dist(cursor, mid) <= tol) add(mid, 'midpoint', [], hostId);
      }
      const foot = closestOnSegment(cursor, a, b);
      if (!perpOnly && dist(cursor, foot) <= tol) add(foot, 'nearest', [], hostId);
      if (sn.perpendicular && ctx.from) {
        const pf = closestOnSegment(ctx.from, a, b);
        if (dist(cursor, pf) <= tol && dist(pf, ctx.from) > 1e-6) add(pf, 'perpendicular', [{ from: ctx.from, to: pf, kind: 'perpendicular' }], hostId);
      }
    }
  };
  // Faces seguem o contorno real da parede (`outline`, com as esquadrias das junções), não a corda das tampas.
  const outlineSegs = (ring: Vec2[]): Array<[Vec2, Vec2]> => ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as [Vec2, Vec2]);
  if (sn.faces || sn.core || (sn.perpendicular && ctx.from)) {
    for (const wf of facesIn()) {
      if (ctx.ignore?.has(wf.wallId)) continue;
      // Índice barato: contorno longe do cursor (além da tolerância) não tem captura. Evita varrer todas as arestas.
      if (!boxNear(cursor, wf.outline, tol)) continue;
      // Só a perpendicular ligada: o pé sobre a face continua valendo, sem as demais capturas de face.
      if (sn.faces || sn.perpendicular) addSegs(wf.outline.length >= 3 ? outlineSegs(wf.outline) : wf.faces, 'face', wf.wallId, !sn.faces);
      if (sn.core) addSegs(wf.coreOutline.length >= 3 ? outlineSegs(wf.coreOutline) : wf.core, 'core', wf.wallId);
    }
  }
  // Faces de parede curva: as laterais são arcos concêntricos (raio R ± meia espessura), não a corda. A captura é
  // analítica: pontas do arco, ponto médio e pé radial sobre o arco da face (S-09).
  for (const w of walls) {
    const arc = curveOf(w);
    if (!arc) continue;
    const fr = frameOfWall(ctx.project, w.id);
    if (!fr) continue;
    const local = arcLocal(arc, cursor);
    const t = Math.max(0, Math.min(arc.length, local.t));
    for (const side of sn.faces ? [fr.sHi, fr.sLo] : []) {
      for (const q of [arcPointAt(arc, 0, side), arcPointAt(arc, arc.length, side)]) {
        if (dist(cursor, q) <= tol) add(q, 'face');
      }
      const mid = arcPointAt(arc, arc.length / 2, side);
      if (sn.midpoint !== false && dist(cursor, mid) <= tol) add(mid, 'midpoint');
      const foot = arcPointAt(arc, t, side);
      if (dist(cursor, foot) <= tol) add(foot, 'nearest');
    }
    // Centro do arco, e ponto de tangência a partir do ponto anterior: o círculo do arco corta o círculo de
    // diâmetro (ponto anterior, centro), e a tangente é o corte que cai sobre o arco.
    if (sn.midpoint !== false && dist(cursor, arc.center) <= tol) add(arc.center, 'center', [], w.id);
    if (sn.perpendicular && ctx.from) {
      const dc = dist(ctx.from, arc.center);
      if (dc > arc.radius) {
        const half = v2((ctx.from.x + arc.center.x) / 2, (ctx.from.y + arc.center.y) / 2);
        for (const q of intersectCircles(arc.center, arc.radius, half, dc / 2)) {
          if (onArc(arc, q) && dist(cursor, q) <= tol) add(q, 'tangent', [{ from: ctx.from, to: q, kind: 'perpendicular' }], w.id);
        }
      }
    }
  }
  // Interseções de eixos (reta ou arco).
  for (let i = 0; sn.intersections && i < nearWalls.length; i++) {
    for (let j = i + 1; j < nearWalls.length; j++) {
      for (const p of wallCrossings(nearWalls[i]!, nearWalls[j]!)) {
        if (dist(cursor, p) <= tol) add(p, 'intersection');
      }
    }
  }
  if (ctx.onWallsOnly) return decide(undefined);

  // Restrições de alinhamento: referências (pontos) e trechos de face. Cada uma dá uma linha; as linhas que
  // passam ao alcance do cursor viram candidatos, e os cruzamentos entre elas viram candidatos de peso menor.
  const refs: Vec2[] = [];
  if (ctx.from && !lock) refs.push(ctx.from);
  refs.push(...ends);
  if (sn.midpoint !== false) {
    for (const w of walls) refs.push(wallMid(w));
  }
  const faceTracks: TrackLine[] = [];
  if (sn.alignment && sn.faces) {
    for (const wf of facesIn()) {
      if (ctx.ignore?.has(wf.wallId)) continue;
      // wallFaces ordena primeiro as duas laterais longitudinais e depois as tampas. Só as laterais viram trecho.
      for (const seg of wf.faces.slice(0, 2)) {
        if (dist(seg[0], seg[1]) < 1e-9) continue;
        faceTracks.push({ a: seg[0], b: seg[1] });
        refs.push(seg[0], seg[1]);
      }
    }
    // Ombreiras das aberturas e todas as arestas da seção (h/v e inclinadas) também são trechos de alinhamento (a
    // linha atravessa a espessura e se estende além das pontas). As trilhas distantes do cursor ficam de fora para não
    // varrer a vista inteira.
    addExtraTracks(ctx, faceTracks, refs, cursor, tol);
  }
  if (!ctx.onWallsOnly && ctx.extraPoints) {
    // Só entram como referência de alinhamento os pontos com x ou y a até `tol` do cursor: o laço de baixo descarta o resto.
    for (const q of pontosNasFaixas(ctx.extraPoints, cursor, tol)) {
      if (q.hostId !== undefined && ctx.ignore?.has(q.hostId)) continue;
      // Na seção o midpoint é captura de ponto, mas não vira eixo de alinhamento: o x/y dele cruzaria com outra
      // linha e criaria um ponto flutuante (ex.: z=2,30) no lugar da aresta real sob o cursor.
      if (ctx.section && q.kind === 'midpoint') continue;
      refs.push(v2(q.x, q.y));
    }
  }

  if (sn.alignment) {
    const near = (p: Vec2): boolean => dist2(cursor, p) <= tol * tol * 2;
    const xLines: AxisLine[] = [];
    const yLines: AxisLine[] = [];
    const seenX = new Set<number>();
    const seenY = new Set<number>();
    for (const r of refs) {
      if (Math.abs(cursor.x - r.x) <= tol && !seenX.has(r.x)) {
        seenX.add(r.x);
        xLines.push({ value: r.x, from: r });
      }
      if (Math.abs(cursor.y - r.y) <= tol && !seenY.has(r.y)) {
        seenY.add(r.y);
        yLines.push({ value: r.y, from: r });
      }
    }

    // Alinhamento simples: uma linha só, com o outro eixo livre (grade, se ligada). Na seção ele perde da trilha de
    // aresta (peso `WEIGHT_TRACK`), para uma aresta real sob o cursor não ser trocada por um ponto de referência.
    const alignWeight = ctx.section ? WEIGHT_ALIGN_SECTION : WEIGHT.alignment;
    for (const l of xLines) {
      const p = v2(l.value, free(cursor.y));
      add(p, 'alignment', [{ from: l.from, to: p, kind: 'alignment' }], undefined, alignWeight);
    }
    for (const l of yLines) {
      const p = v2(free(cursor.x), l.value);
      add(p, 'alignment', [{ from: l.from, to: p, kind: 'alignment' }], undefined, alignWeight);
    }

    // Reta travada oblíqua (polar): o alinhamento simples sairia da reta, então o que vale é o cruzamento dela com a
    // linha x = ref ou y = ref.
    if (lock && ctx.from) {
      for (const l of xLines) {
        const p = crossAxis(ctx.from, lock.dir, 'x', l.value);
        if (p && near(p)) add(p, 'alignment', [{ from: l.from, to: p, kind: 'alignment' }], undefined, WEIGHT_ALIGN_CROSS);
      }
      for (const l of yLines) {
        const p = crossAxis(ctx.from, lock.dir, 'y', l.value);
        if (p && near(p)) add(p, 'alignment', [{ from: l.from, to: p, kind: 'alignment' }], undefined, WEIGHT_ALIGN_CROSS);
      }
    }

    // Trechos de face: a projeção do cursor sobre a face vira alinhamento. Fora do segmento, a linha é estendida;
    // dentro, a aresta real também vira candidato (peso baixo), para vencer o alinhamento simples de um midpoint.
    const reach2 = tol * tol * 2;
    const rayTrack: TrackLine | null = lock && ctx.from ? { a: ctx.from, b: v2(ctx.from.x + lock.dir.x * 1e4, ctx.from.y + lock.dir.y * 1e4) } : null;
    const tracks = faceTracks.filter((tr) => {
      const d = sub(tr.b, tr.a);
      const dd = dot(d, d);
      if (dd < 1e-12) return false;
      // Índice barato: um trecho cuja reta não passa perto do cursor não gera projeção, cruzamento com
      // eixos nem par de faces perto dele. Sem isso, 200 paredes davam ~400 trechos e ~80 mil pares por
      // chamada de `infer` (o snap ficava ~10× mais lento a cada movimento do mouse).
      const t = dot(sub(cursor, tr.a), d) / dd;
      const projected = v2(tr.a.x + d.x * t, tr.a.y + d.y * t);
      return dist2(cursor, projected) <= reach2;
    });
    for (const tr of tracks) {
      if (tr === rayTrack) continue;
      const d = sub(tr.b, tr.a);
      const t = dot(sub(cursor, tr.a), d) / dot(d, d);
      const projected = v2(tr.a.x + d.x * t, tr.a.y + d.y * t);
      const offset = dist(cursor, projected);
      if (offset > tol) continue;
      // Perto de uma ponta, a extremidade (peso 0) e a captura "nearest" já resolvem.
      const da = dist2(projected, tr.a);
      const db = dist2(projected, tr.b);
      if (da <= tol * tol || db <= tol * tol) continue;
      if (t < 0 || t > 1) {
        const anchor = closestOnSegment(projected, tr.a, tr.b);
        // Fora das pontas a extensão não compete com pontos: os refs de alinhamento (peso maior) continuam valendo.
        add(projected, 'alignment', [{ from: anchor, to: projected, kind: 'alignment' }], tr.hostId, WEIGHT.alignment);
      } else if (tr.axis !== undefined) {
        // Dentro do segmento, toda trilha da seção (h/v ou inclinada) tem prioridade de aresta; as faces da planta
        // (sem eixo) seguem como antes. Bem em cima da aresta, a captura "nearest" (e o midpoint) continua mandando;
        // a trilha entra quando o cursor está deslocado o bastante para o alinhamento de um ponto de referência puxá-lo
        // para fora da cota.
        if (offset <= tol * 0.5) continue;
        const anchor = da <= db ? tr.a : tr.b;
        add(projected, 'alignment', [{ from: anchor, to: projected, kind: 'alignment' }], tr.hostId, WEIGHT_TRACK);
      }
    }

    // Cruzamentos entre restrições: x × y, x × face, y × face e face × face. São o ponto que o usuário quer.
    for (const xl of xLines) {
      for (const yl of yLines) {
        const p = v2(xl.value, yl.value);
        if (near(p)) add(p, 'alignment', [{ from: xl.from, to: p, kind: 'alignment' }, { from: yl.from, to: p, kind: 'alignment' }], undefined, WEIGHT_ALIGN_CROSS);
      }
    }
    for (const tr of tracks) {
      if (tr === rayTrack) continue;
      const d = sub(tr.b, tr.a);
      const anchorOf = (p: Vec2): Vec2 => closestOnSegment(p, tr.a, tr.b);
      for (const xl of xLines) {
        const p = crossAxis(tr.a, d, 'x', xl.value);
        if (p && near(p)) add(p, 'alignment', [{ from: xl.from, to: p, kind: 'alignment' }, { from: anchorOf(p), to: p, kind: 'alignment' }], tr.hostId, WEIGHT_ALIGN_CROSS);
      }
      for (const yl of yLines) {
        const p = crossAxis(tr.a, d, 'y', yl.value);
        if (p && near(p)) add(p, 'alignment', [{ from: yl.from, to: p, kind: 'alignment' }, { from: anchorOf(p), to: p, kind: 'alignment' }], tr.hostId, WEIGHT_ALIGN_CROSS);
      }
    }
    // A reta travada entra como trilha só nos cruzamentos: rastreio de extensão (aresta × reta) e alinhamentos sobre ela.
    if (rayTrack) tracks.push(rayTrack);
    for (let i = 0; i < tracks.length; i++) {
      for (let j = i + 1; j < tracks.length; j++) {
        const t1 = tracks[i]!;
        const t2 = tracks[j]!;
        const p = intersectLines(t1.a, sub(t1.b, t1.a), t2.a, sub(t2.b, t2.a));
        if (p && near(p)) {
          add(p, 'alignment', [{ from: closestOnSegment(p, t1.a, t1.b), to: p, kind: 'alignment' }, { from: closestOnSegment(p, t2.a, t2.b), to: p, kind: 'alignment' }], t1.hostId ?? t2.hostId, WEIGHT_ALIGN_CROSS);
        }
      }
    }
  }

  // Ortogonal a partir do ponto anterior: sempre ativo quando próximo, travado com Shift/opção.
  if (!lock && (sn.alignment || ctx.orthoLock) && ctx.from) {
    const d = sub(cursor, ctx.from);
    if (len(d) > 1e-6) {
      const horiz = Math.abs(d.y) <= Math.abs(d.x);
      const snapped = horiz ? v2(free(cursor.x), ctx.from.y) : v2(ctx.from.x, free(cursor.y));
      const off = horiz ? Math.abs(d.y) : Math.abs(d.x);
      if (ctx.orthoLock || off <= tol * 0.7) {
        add(snapped, 'ortho', [{ from: ctx.from, to: snapped, kind: 'ortho' }], undefined, ctx.orthoLock ? 0.4 : WEIGHT.ortho);
      }
    }
  }

  return decide(g > 0 ? g : undefined);
}

/**
 * Escolhe o candidato: menor custo (distância normalizada + peso do tipo), com histerese para a captura anterior.
 * `cycle` percorre a lista ordenada (Tab). Sem candidato, cai na grade, se houver grade.
 */
function bestOf(
  cands: Cand[],
  cursor: Vec2,
  tol: number,
  previous: Inference | null | undefined,
  cycle: number | undefined,
  guides: Guide[],
  grid: number | undefined,
): Inference {
  const ranked = cands
    .map((c) => {
      const keep = previous && previous.kind === c.kind && dist(previous.point, c.point) <= 1e-9;
      return { c, rank: dist(cursor, c.point) / tol + c.weight - (keep ? HYSTERESIS : 0) };
    })
    .sort((a, b) => a.rank - b.rank);
  // Mesmo ponto com o mesmo tipo aparece uma vez só, para o Tab não repetir a mesma captura.
  const list: Cand[] = [];
  for (const { c } of ranked) {
    if (!list.some((o) => o.kind === c.kind && dist(o.point, c.point) <= 1e-9)) list.push(c);
  }
  if (list.length) {
    const n = list.length;
    const best = list[((cycle ?? 0) % n + n) % n]!;
    return { point: best.point, kind: best.kind, guides: best.guides.length ? best.guides : guides, hostId: best.hostId };
  }
  if (grid && grid > 0) {
    return { point: v2(Math.round(cursor.x / grid) * grid, Math.round(cursor.y / grid) * grid), kind: 'grid', guides };
  }
  return { point: cursor, kind: 'none', guides };
}

/**
 * Parede sobre a qual o cursor está (para portas e janelas). A faixa é a espessura da parede; com a captura
 * ligada, soma a tolerância visual (~10 px). Com F3 (captura desligada) vale só a espessura desenhada.
 */
export function hostUnder(cursor: Vec2, p: Project, levelId: Id, mpp: number, snapOn = true, tolPx = TOL_PX): { wallId: Id; offset: number; point: Vec2 } | null {
  let best: { wallId: Id; offset: number; point: Vec2; d: number } | null = null;
  for (const w of wallsOnLevel(p, levelId)) {
    const near = closestOnWall(w, cursor);
    const type = p.wallTypes[w.typeId];
    const half = (type ? totalThickness(type) : 0.2) / 2 + (snapOn ? tolPx * mpp : 0);
    if (near.dist > half) continue;
    if (!best || near.dist < best.d) best = { wallId: w.id, offset: near.t, point: near.point, d: near.dist };
  }
  return best ? { wallId: best.wallId, offset: best.offset, point: best.point } : null;
}

/**
 * Aberturas já existentes numa parede, para evitar sobreposição ao inserir. Com `vertical` (peitoril e altura
 * da abertura nova), só conta as que se sobrepõem na altura: janela acima de porta não é conflito.
 */
export function occupiedRanges(p: Project, wallId: Id, ignoreId?: Id, vertical?: [number, number]): Array<[number, number]> {
  return openingsOfWall(p, wallId)
    .filter((o) => o.id !== ignoreId)
    .filter((o) => {
      if (!vertical) return true;
      const t = openingTypeById(p, o.typeId);
      const sill = o.sillOverride ?? t?.sill ?? 0;
      const top = sill + (t?.height ?? 2.1);
      return sill < vertical[1] - 1e-6 && top > vertical[0] + 1e-6;
    })
    .map((o) => {
      const t = openingTypeById(p, o.typeId);
      const h = (t?.width ?? 0.8) / 2;
      return [o.offset - h, o.offset + h] as [number, number];
    });
}
