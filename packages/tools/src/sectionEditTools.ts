/* eslint-disable max-lines -- o Alinhar do corte concentra pick, features, guias e patches; dividir depois. */
import { closestOnSegment, dist, dot, norm, pointInMulti, sub, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { frameOfWall, type SectionOpening, type SectionOrigin, type SectionResult } from '@hestia/engine';
import { formatQuantity, hospedeiroDoGuardaCorpo, isFloor, isGuardaCorpo, isOpening, isRamp, isSlab, isStair, isWall, levelElevation, openingHeight, openingSill, openingType, unitsOf, wallBaseElevation, wallLength, wallTopElevation, type Command, type Id, type Opening, type Project } from '@hestia/model';
import { alignFeatureItems } from './alignTool.ts';
import { ToolBase } from './base.ts';
import { avisaGuardaCorpoHospedado } from './guardaCorpoEdicao.ts';
import { comandosMoverNoCorte } from './sectionMoverElementos.ts';
import { corteGuardaCorpoDaSecao } from './sectionSnapComGuardaCorpo.ts';
import type { Guide, Inference, PointerInfo, PreviewItem, SectionToolContext, SnapKind, ToolEnv } from './types.ts';
import { t as translate, type DictKey, type Lang } from './i18n.ts';

/** Direção da linha do corte ativo em planta. */
export function sectionDirection(env: ToolEnv): Vec2 | null {
  const sec = env.section?.();
  const view = sec ? env.project().views.find((v) => v.id === sec.id) : null;
  if (!view) return null;
  const d = sub(view.b, view.a);
  return Math.hypot(d.x, d.y) < 1e-9 ? null : norm(d);
}

export function selectedOpenings(env: ToolEnv, walls: readonly string[]): Opening[] {
  const p = env.project();
  return env.selection().map((id) => p.elements[id]).filter((e): e is Opening => isOpening(e) && !walls.includes(e.hostId));
}

/** Move as anotações selecionadas da vista em `(dt, dz)` (translação no plano da vista): cota, texto, detalhe e etiqueta. */
export function moveSectionAnnotations(env: ToolEnv, selection: readonly string[], dt: number, dz: number): Command[] {
  const sec = env.section?.();
  if (!sec) return [];
  const a = sec.annotations();
  const want = new Set(selection);
  const d = { x: dt, y: dz };
  const move = (p: Vec2): Vec2 => ({ x: p.x + d.x, y: p.y + d.y });
  const out: Command[] = [];
  const levelId = env.levelId();
  const sectionId = sec.id;
  for (const dim of a.dimensions) {
    if (!want.has(dim.id)) continue;
    out.push({ type: 'updateDimension', levelId, sectionId, id: dim.id, patch: { a: move(dim.a), b: move(dim.b), ...(dim.textAt ? { textAt: move(dim.textAt) } : {}), refs: undefined } });
  }
  for (const t of a.texts) {
    if (!want.has(t.id)) continue;
    out.push({ type: 'updateText', levelId, sectionId, id: t.id, patch: { at: move(t.at), ...(t.leader ? { leader: t.leader.map(move) } : {}) } });
  }
  for (const line of a.detailLines) {
    if (!want.has(line.id)) continue;
    out.push({ type: 'updateDetailLine', levelId, sectionId, id: line.id, patch: { a: move(line.a), b: move(line.b) } });
  }
  for (const region of a.detailRegions) {
    if (!want.has(region.id)) continue;
    out.push({ type: 'updateDetailRegion', levelId, sectionId, id: region.id, patch: { boundary: region.boundary.map(move) } });
  }
  for (const tag of a.tags) {
    if (!want.has(tag.id)) continue;
    out.push({ type: 'updateTag', levelId, sectionId, id: tag.id, patch: { at: move(tag.at) } });
  }
  return out;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Nome curto da captura, para o status da referência. */
const SNAP_KIND_LABEL: Partial<Record<SnapKind, string>> = {
  endpoint: 'ponta',
  midpoint: 'ponto médio',
  intersection: 'interseção',
  face: 'face',
  core: 'núcleo',
  nearest: 'aresta',
  alignment: 'alinhamento',
  perpendicular: 'perpendicular',
  center: 'centro',
  tangent: 'tangente',
  grid: 'grade',
  ortho: 'ortogonal',
  polar: 'polar',
};

const SNAP_KIND_KEYS: Partial<Record<SnapKind, DictKey>> = {
  endpoint: 'tl_snap_endpoint',
  midpoint: 'tl_snap_midpoint',
  intersection: 'tl_snap_intersection',
  face: 'tl_snap_face',
  core: 'tl_snap_core',
  nearest: 'tl_snap_nearest',
  alignment: 'tl_snap_alignment',
  perpendicular: 'tl_snap_perpendicular',
  center: 'tl_snap_center',
  tangent: 'tl_snap_tangent',
  grid: 'tl_snap_grid',
  ortho: 'tl_snap_ortho',
  polar: 'tl_snap_polar',
};

/** Nome curto da captura no idioma pedido. */
const snapKindLabel = (kind: SnapKind | undefined, lang: Lang = 'pt'): string | undefined => {
  if (!kind) return undefined;
  const key = SNAP_KIND_KEYS[kind];
  return key ? translate(lang, key) : SNAP_KIND_LABEL[kind];
};

const FEATURE_KEYS: Record<string, DictKey> = {
  topo: 'tl_sec_top',
  peitoril: 'tl_sec_sill',
  'ombreira esquerda': 'tl_sec_left_jamb',
  'ombreira direita': 'tl_sec_right_jamb',
  centro: 'tl_sec_center',
};

/** Rótulo da feição da esquadria no idioma pedido (rótulo PT desconhecido volta como veio). */
const featureLabel = (label: string, lang: Lang = 'pt'): string => {
  const key = FEATURE_KEYS[label];
  return key ? translate(lang, key) : label;
};

/** Cota no idioma/unidades do projeto, com sinal explícito. */
function cotaText(env: ToolEnv, z: number): string {
  const text = formatQuantity(unitsOf(env.project()), 'length', z);
  return z >= 0 ? `+${text}` : text;
}

const NO_RESULT = 'Esta vista não tem resultado de corte/elevação; o Alinhar no corte está indisponível.';

/** `result()` faz parte de `SectionToolContext`; a leitura é defensiva para ambientes parciais/teste. */
type SectionWithResult = SectionToolContext & { result?: () => SectionResult };

/** Geometria da vista. Sem resultado a ferramenta avisa e não altera nada. */
export function sectionResult(env: ToolEnv): SectionResult | null {
  const sec = env.section?.() as SectionWithResult | null | undefined;
  if (!sec || typeof sec.result !== 'function') return null;
  try { return sec.result() ?? null; } catch { return null; }
}

type Axis = 'h' | 'v' | 'point';
type PieceKind = 'opening' | 'wall' | 'other';

/**
 * Linha semântica de um elemento na vista, em (t, z): a feição (topo, peitoril, ombreira, centro, face, base) e a
 * reta exata que o clique escolheu. `axis: null` é aresta inclinada: serve de referência pela própria reta.
 */
type FeatureLine = { feature: string; label: string; axis: 'h' | 'v' | null; value: number; a: Vec2; b: Vec2 };
/** Referência semântica do primeiro clique. Nunca altera o modelo. */
type AlignRef = { hostId?: Id; elementKind: PieceKind; feature: string; label: string; axis: Axis; z: number; t: number; value: number; point: Vec2; line: { a: Vec2; b: Vec2 } | null; guide: Guide | null; snap: SnapKind };
/** Alvo descoberto pelo segundo clique. */
type AlignTarget = { hostId: Id; kind: PieceKind; feature: string; label: string; axis: Axis; value: number; line: { a: Vec2; b: Vec2 }; point: Vec2 };
export type Piece = { hostId: Id; depth: number; polygons: MultiPolygon };
type Pick = { kind: PieceKind; hostId: Id; opening?: SectionOpening; lines: FeatureLine[]; line: FeatureLine };

const LINE_EPS = 1e-7;
const FEATURE_ORDER = ['top', 'sill', 'jambLeft', 'jambRight', 'base', 'faceLeft', 'faceRight', 'axis', 'edge', 'centerV', 'centerH'];

const openingLinesCache = new WeakMap<SectionOpening, FeatureLine[]>();
const polygonLinesCache = new WeakMap<object, FeatureLine[]>();
const piecesCache = new WeakMap<SectionResult, Piece[]>();

/** As seis linhas de uma janela/porta: topo, peitoril, duas ombreiras e os dois centros. */
function openingLines(o: SectionOpening): FeatureLine[] {
  let hit = openingLinesCache.get(o);
  if (!hit) { hit = buildOpeningLines(o); openingLinesCache.set(o, hit); }
  return hit;
}

function buildOpeningLines(o: SectionOpening): FeatureLine[] {
  const mt = (o.t0 + o.t1) / 2, mz = (o.z0 + o.z1) / 2;
  return [
    { feature: 'top', label: 'topo', axis: 'h', value: o.z1, a: { x: o.t0, y: o.z1 }, b: { x: o.t1, y: o.z1 } },
    { feature: 'sill', label: 'peitoril', axis: 'h', value: o.z0, a: { x: o.t0, y: o.z0 }, b: { x: o.t1, y: o.z0 } },
    { feature: 'jambLeft', label: 'ombreira esquerda', axis: 'v', value: o.t0, a: { x: o.t0, y: o.z0 }, b: { x: o.t0, y: o.z1 } },
    { feature: 'jambRight', label: 'ombreira direita', axis: 'v', value: o.t1, a: { x: o.t1, y: o.z0 }, b: { x: o.t1, y: o.z1 } },
    { feature: 'centerV', label: 'centro', axis: 'v', value: mt, a: { x: mt, y: o.z0 }, b: { x: mt, y: o.z1 } },
    { feature: 'centerH', label: 'centro', axis: 'h', value: mz, a: { x: o.t0, y: mz }, b: { x: o.t1, y: mz } },
    // Cada linha visível da esquadria (marco, folha, vidro, travessa) também é referência.
    ...linesOfPolygons(o.polygons ?? []),
  ];
}

/** Arestas dos polígonos da vista, classificadas pela posição dentro da caixa (topo/base/faces). */
function linesOfPolygons(polys: MultiPolygon): FeatureLine[] {
  let hit = polygonLinesCache.get(polys);
  if (!hit) { hit = buildLinesOfPolygons(polys); polygonLinesCache.set(polys, hit); }
  return hit;
}

function buildLinesOfPolygons(polys: MultiPolygon): FeatureLine[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polys.flatMap((poly) => poly.flat())) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const out: FeatureLine[] = [];
  for (const poly of polys) for (const ring of poly) for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (dist(a, b) < 1e-9) continue;
    const horizontal = Math.abs(b.y - a.y) < LINE_EPS;
    const vertical = Math.abs(b.x - a.x) < LINE_EPS;
    if (horizontal) {
      const y = (a.y + b.y) / 2;
      const top = Math.abs(y - maxY) < 1e-6;
      const base = Math.abs(y - minY) < 1e-6;
      out.push({ feature: top ? 'top' : base ? 'base' : 'edge', label: top ? 'topo' : base ? 'base' : 'aresta', axis: 'h', value: y, a: { ...a }, b: { ...b } });
    } else if (vertical) {
      const x = (a.x + b.x) / 2;
      const left = Math.abs(x - minX) < 1e-6;
      const right = Math.abs(x - maxX) < 1e-6;
      out.push({ feature: left ? 'faceLeft' : right ? 'faceRight' : 'edge', label: 'face', axis: 'v', value: x, a: { ...a }, b: { ...b } });
    } else {
      out.push({ feature: 'edge', label: 'aresta', axis: null, value: (a.x + b.x) / 2, a: { ...a }, b: { ...b } });
    }
  }
  return out;
}

/** Linha mais próxima do clique. No empate (canto), a feição compatível com o eixo da referência vence. */
function nearestLine(lines: FeatureLine[], at: Vec2, prefer: 'h' | 'v' | null = null, tie = 0.01): FeatureLine | null {
  if (!lines.length) return null;
  // Os eixos de centro cruzam as bordas no meio: clicar no meio do topo dava 0 de distância ao eixo vertical e ele
  // vencia a borda. O centro leva uma desvantagem de alguns pixels, então a borda sob o cursor vence (qualquer zoom).
  const centerPenalty = tie * 4;
  // Arestas internas do marco (nem topo, nem base, nem face) ficam a poucos px do topo: clicar na moldura não pode roubar a feição de borda.
  const edgePenalty = tie * 2;
  const scored = lines.map((line) => ({ line, d: dist(at, closestOnSegment(at, line.a, line.b)) + (line.feature === 'centerV' || line.feature === 'centerH' ? centerPenalty : line.feature === 'edge' ? edgePenalty : 0) }));
  const min = Math.min(...scored.map((s) => s.d));
  const ties = scored.filter((s) => s.d <= min + tie);
  const compatible = prefer ? ties.filter((s) => s.line.axis === prefer) : [];
  const pool = compatible.length ? compatible : ties;
  const rank = (f: FeatureLine): number => { const i = FEATURE_ORDER.indexOf(f.feature); return i < 0 ? FEATURE_ORDER.length : i; };
  pool.sort((x, y) => rank(x.line) - rank(y.line));
  return pool[0]?.line ?? null;
}

const inBox = (o: SectionOpening, at: Vec2, tol: number): boolean =>
  at.x >= o.t0 - tol && at.x <= o.t1 + tol && at.y >= o.z0 - tol && at.y <= o.z1 + tol;

/** Abertura visível sob o clique. Vãos sobrepostos: o mais perto do plano de corte (menor `depth`) vence. */
function hitOpening(result: SectionResult, at: Vec2, tol: number, prefer: 'h' | 'v' | null, tie: number): { opening: SectionOpening; lines: FeatureLine[]; line: FeatureLine } | null {
  let best: { opening: SectionOpening; lines: FeatureLine[]; line: FeatureLine } | null = null;
  let score = Infinity;
  for (const o of result.openings ?? []) {
    const polys = o.polygons ?? [];
    const inside = inBox(o, at, tol) || pointInMulti(at, polys);
    const lines = openingLines(o);
    const line = nearestLine(lines, at, prefer, tie);
    if (!line) continue;
    const d = dist(at, closestOnSegment(at, line.a, line.b));
    if (!inside && d > tol) continue;
    const depth = Number.isFinite(o.depth) ? o.depth : 0;
    const s = (inside ? 0 : 1) + depth * 1e-6 + Math.min(d, tol) * 1e-3;
    if (s < score) { score = s; best = { opening: o, lines, line }; }
  }
  return best;
}

/** Peças da vista com dono: cortes por origem (profundidade 0) e o que está além do plano. */
export function resultPieces(result: SectionResult): Piece[] {
  let hit = piecesCache.get(result);
  if (!hit) { hit = buildResultPieces(result); piecesCache.set(result, hit); }
  return hit;
}

function buildResultPieces(result: SectionResult): Piece[] {
  const out: Piece[] = [];
  const push = (origin: SectionOrigin, polygons: MultiPolygon, depth: number): void => {
    const hostId = origin.wallId ?? origin.floorId ?? origin.slabId ?? origin.ceilingId ?? origin.roofId ?? origin.stairId ?? origin.rampId ?? origin.openingId;
    if (hostId !== undefined) out.push({ hostId, depth, polygons });
  };
  for (const r of result.cut ?? []) {
    if (r.parts && r.parts.length) for (const part of r.parts) push(part.origin, part.polygons, 0);
    else for (const s of r.sources) push(s, r.polygons, 0);
  }
  for (const b of result.beyond ?? []) push(b, b.polygons, b.depth);
  return out;
}

const boxCache = new WeakMap<object, { minX: number; minY: number; maxX: number; maxY: number }>();
/** Caixa envolvente dos polígonos (cacheada): descarta sem custo as peças longe do clique. */
function boxOf(polys: MultiPolygon): { minX: number; minY: number; maxX: number; maxY: number } {
  let b = boxCache.get(polys);
  if (!b) {
    b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of polys.flatMap((poly) => poly.flat())) {
      b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
      b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
    }
    boxCache.set(polys, b);
  }
  return b;
}

function hitPiece(pieces: Piece[], at: Vec2, tol: number, prefer: 'h' | 'v' | null, tie: number): { piece: Piece; lines: FeatureLine[]; line: FeatureLine } | null {
  let best: { piece: Piece; lines: FeatureLine[]; line: FeatureLine } | null = null;
  let score = Infinity;
  for (const piece of pieces) {
    const box = boxOf(piece.polygons);
    if (at.x < box.minX - tol || at.x > box.maxX + tol || at.y < box.minY - tol || at.y > box.maxY + tol) continue;
    const inside = pointInMulti(at, piece.polygons);
    const lines = linesOfPolygons(piece.polygons);
    const line = nearestLine(lines, at, prefer, tie);
    if (!line) continue;
    const d = dist(at, closestOnSegment(at, line.a, line.b));
    if (!inside && d > tol) continue;
    const s = (inside ? 0 : 1) + piece.depth * 1e-6 + Math.min(d, tol) * 1e-3;
    if (s < score) { score = s; best = { piece, lines, line }; }
  }
  return best;
}

const guardaCorpoPiecesCache = new WeakMap<object, Piece[]>();

/** Ocultos da vista, quando o ambiente informa (o desenho já os tira; o alvo do clique também não pode ser um deles). */
const ocultosDaVista = (env: ToolEnv): ReadonlySet<Id> | undefined => (env.section?.() as { hidden?: () => ReadonlySet<Id> } | null | undefined)?.hidden?.();

/**
 * Peças do guarda-corpo na vista, com dono. Ele fica fora do `SectionResult` (o motor de seção roda no worker; o guarda-corpo é
 * desenhado pelo kernel): as linhas são as MESMAS que a vista desenha (`guarda_corte`). Cada guarda-corpo vira uma peça só, com
 * todos os contornos dele (poste, trilho, corrimão, painel), para topo, base e faces serem os do guarda-corpo inteiro.
 */
export function guardaCorpoPieces(env: ToolEnv, result: SectionResult): Piece[] {
  const corte = corteGuardaCorpoDaSecao(env.project(), result);
  if (!corte) return [];
  let hit = guardaCorpoPiecesCache.get(corte);
  if (!hit) {
    const porId = new Map<Id, MultiPolygon>();
    for (const l of corte.linhas) {
      if (l.papel === 255 || l.pontos.length < 3) continue;
      let polys = porId.get(l.guardaId);
      if (!polys) { polys = []; porId.set(l.guardaId, polys); }
      polys.push([l.pontos.map((q) => ({ x: q.x, y: q.y }))]);
    }
    hit = [...porId].map(([hostId, polygons]) => ({ hostId, depth: 0, polygons }));
    guardaCorpoPiecesCache.set(corte, hit);
  }
  const hidden = ocultosDaVista(env);
  return hidden && hidden.size > 0 ? hit.filter((q) => !hidden.has(q.hostId)) : hit;
}

/** Elemento sob o clique: abertura primeiro, depois parede, depois qualquer outro dono visível (guarda-corpo incluído). */
function pickAt(result: SectionResult, project: Project, at: Vec2, tol: number, prefer: 'h' | 'v' | null, tie = tol / 10, extra: Piece[] = [], hidden?: ReadonlySet<Id>): Pick | null {
  const op = hitOpening(result, at, tol, prefer, tie);
  if (op && !hidden?.has(op.opening.openingId)) return { kind: 'opening', hostId: op.opening.openingId, opening: op.opening, lines: op.lines, line: op.line };
  const all = hidden && hidden.size > 0 ? resultPieces(result).filter((q) => !hidden.has(q.hostId)) : resultPieces(result);
  const wall = hitPiece(all.filter((p) => isWall(project.elements[p.hostId])), at, tol, prefer, tie);
  if (wall) return { kind: 'wall', hostId: wall.piece.hostId, lines: wall.lines, line: wall.line };
  // O guarda-corpo vai primeiro: é desenhado por cima de tudo, e num empate o que se vê por cima vence.
  const other = hitPiece([...extra, ...all.filter((p) => !isWall(project.elements[p.hostId]))], at, tol, prefer, tie);
  if (other) return { kind: 'other', hostId: other.piece.hostId, lines: other.lines, line: other.line };
  return null;
}

/** Elemento sob o ponto do corte (clique de Mover ou Copiar sem seleção). Anotações não entram; oculto na vista também não. */
export function pickSectionElement(env: ToolEnv, at: Vec2): Id | null {
  const result = sectionResult(env);
  if (!result) return null;
  const tol = Math.max(1e-6, env.metersPerPixel() * 4);
  return pickAt(result, env.project(), at, tol, null, tol / 10, guardaCorpoPieces(env, result), ocultosDaVista(env))?.hostId ?? null;
}

/** Guia persistente: h/v atravessam a vista inteira; a inclinada usa a própria reta. */
function guideOf(result: SectionResult, axis: Axis, line: FeatureLine): Guide | null {
  if (axis === 'h') return { from: { x: 0, y: line.value }, to: { x: result.length, y: line.value }, kind: 'alignment' };
  if (axis === 'v') return { from: { x: line.value, y: result.zMin }, to: { x: line.value, y: result.zMax }, kind: 'alignment' };
  return line.axis === null ? { from: { ...line.a }, to: { ...line.b }, kind: 'alignment' } : null;
}
/** Mesma reta (para a guia fixa não duplicar a guia dinâmica do rastreamento). */
function sameLine(a: Guide, b: Guide): boolean {
  const da = sub(a.to, a.from);
  const db = sub(b.to, b.from);
  const la = Math.hypot(da.x, da.y);
  const lb = Math.hypot(db.x, db.y);
  if (la < 1e-9 || lb < 1e-9) return false;
  if (Math.abs(da.x * db.y - da.y * db.x) / (la * lb) > 1e-6) return false;
  return Math.abs(da.x * (b.from.y - a.from.y) - da.y * (b.from.x - a.from.x)) / la < 1e-6;
}

/**
 * Alinhar no corte/elevação como no Revit, sem seleção:
 * 1º clique escolhe a referência (a linha/feição sob o cursor) e só mostra a guia persistente;
 * 2º clique descobre o alvo pelo próprio clique (janela, porta ou parede) e alinha a feição clicada.
 * Um único passo de desfazer. A referência nunca altera o modelo.
 */
export class SectionAlignTool extends ToolBase {
  readonly id = 'align';
  readonly label = 'Alinhar';
  override get hint(): string {
    return this.t('tl_hint_align_section');
  }
  private ref: AlignRef | null = null;

  protected reset(): void { this.ref = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.ref !== null; }

  override start(): void {
    this.reset();
    if (!sectionResult(this.env)) this.env.say(NO_RESULT);
    else this.env.say(this.hint);
  }

  /** A guia fixa entra na inferência que o editor já desenha (`guideStrokes`), sem linha própria em `items`. */
  override inference(): Inference | null {
    const inf = super.inference();
    const guide = this.ref?.guide;
    if (!guide) return inf;
    if (!inf) return { point: this.ref!.point, kind: this.ref!.snap === 'none' ? 'nearest' : this.ref!.snap, guides: [guide] };
    return { ...inf, guides: [guide, ...inf.guides.filter((g) => !sameLine(g, guide))] };
  }

  override move(p: PointerInfo): void {
    if (!sectionResult(this.env)) { this.items = []; return; }
    const inf = this.snap(p);
    // O alvo sai do que está sob o cursor (px), não do ponto capturado: uma trilha de alinhamento não pode deslocar a escolha.
    const target = this.findTarget(p.raw);
    const items: PreviewItem[] = [];
    // Mesma prévia da planta: a referência em traço cheio com rótulo e a candidata sob o cursor em tracejado.
    if (this.ref?.line) items.push(...alignFeatureItems(this.refFeature(this.ref), this.t('tl_label_reference')));
    if (!target) { this.items = [...items, { kind: 'point', at: inf.point }]; return; }
    items.push({ kind: 'point', at: inf.point }, { kind: 'highlight', ids: [target.hostId] });
    // Sem referência, a feição sob o cursor já aparece tracejada (como na planta): é a que o clique vai escolher.
    items.push(...alignFeatureItems(this.targetFeature(target), this.ref ? this.t('tl_label_move') : this.t('tl_label_reference'), true));
    const ghost = this.ghost(target);
    if (ghost) items.push({ kind: 'line', a: ghost.a, b: ghost.b, dashed: true });
    this.items = items;
  }

  override click(p: PointerInfo): void {
    if (!sectionResult(this.env)) { this.env.say(NO_RESULT); return; }
    const inf = this.snap(p);
    if (!this.ref) { this.setReference(inf, p.raw); return; }
    const target = this.findTarget(p.raw);
    if (!target) { this.env.say('Nenhuma janela, porta ou parede sob o clique; nada foi alterado.'); return; }
    this.apply(target);
    this.items = [];
  }

  private refFeature(r: AlignRef): { line: { p: Vec2; d: Vec2 }; seg?: { a: Vec2; b: Vec2 }; label: string } {
    return this.featureOf(r.line, r.axis, r.value, r.label);
  }
  private targetFeature(t: AlignTarget): { line: { p: Vec2; d: Vec2 }; seg?: { a: Vec2; b: Vec2 }; label: string } {
    return this.featureOf(t.line, t.axis, t.value, t.label);
  }
  private featureOf(seg: { a: Vec2; b: Vec2 } | null, axis: Axis, value: number, label: string): { line: { p: Vec2; d: Vec2 }; seg?: { a: Vec2; b: Vec2 }; label: string } {
    const a = seg?.a ?? { x: 0, y: value };
    const b = seg?.b ?? a;
    const len = dist(a, b);
    const d = len < 1e-9 ? (axis === 'v' ? { x: 0, y: 1 } : { x: 1, y: 0 }) : norm(sub(b, a));
    return { line: { p: a, d }, ...(seg ? { seg: { a, b } } : {}), label: featureLabel(label, this.uiLang()) };
  }

  /** Raio de captura: 10 px da tela em metros. Só depende do zoom por esta conta (sem piso em unidades de mundo). */
  private tolerance(): number { return Math.max(1e-6, this.env.metersPerPixel() * 10); }
  /** Empate entre linhas vizinhas: 1,5 px da tela. */
  private tie(): number { return Math.max(1e-7, this.env.metersPerPixel() * 1.5); }

  private pickAt(result: SectionResult, at: Vec2, prefer: 'h' | 'v' | null): Pick | null {
    return pickAt(result, this.env.project(), at, this.tolerance(), prefer, this.tie(), guardaCorpoPieces(this.env, result), ocultosDaVista(this.env));
  }

  private findTarget(at: Vec2): AlignTarget | null {
    const result = sectionResult(this.env);
    if (!result) return null;
    const prefer = this.ref?.axis === 'h' || this.ref?.axis === 'v' ? this.ref.axis : null;
    const pick = this.pickAt(result, at, prefer);
    if (!pick) return null;
    const line = pick.line;
    return { hostId: pick.hostId, kind: pick.kind, feature: line.feature, label: line.label, axis: line.axis ?? 'point', value: line.value, line: { a: line.a, b: line.b }, point: closestOnSegment(at, line.a, line.b) };
  }

  private setReference(inf: Inference, raw: Vec2): void {
    const result = sectionResult(this.env);
    if (!result) { this.env.say(NO_RESULT); return; }
    const p0 = this.env.project();
    const pick = this.pickAt(result, raw, null);
    if (!pick) {
      this.ref = { elementKind: 'other', feature: 'point', label: 'ponto', axis: 'point', z: inf.point.y, t: inf.point.x, value: inf.point.y, point: { ...inf.point }, line: null, guide: null, snap: inf.kind };
      this.items = [];
      this.env.say(`Sem referência de linha: ponto livre ${cotaText(this.env, inf.point.y)}. Clique no alvo para alinhar.`);
      return;
    }
    const line = pick.line;
    const axis: Axis = line.axis ?? 'point';
    const at = closestOnSegment(raw, line.a, line.b);
    this.ref = { hostId: pick.hostId, elementKind: pick.kind, feature: line.feature, label: line.label, axis, z: axis === 'h' ? line.value : at.y, t: axis === 'v' ? line.value : at.x, value: line.value, point: at, line: { a: line.a, b: line.b }, guide: guideOf(result, axis, line), snap: inf.kind !== 'none' ? inf.kind : 'nearest' };
    this.items = alignFeatureItems(this.refFeature(this.ref), this.t('tl_label_reference'));
    const el = p0.elements[pick.hostId];
    const alvo = pick.kind === 'opening' ? (isOpening(el) && el.kind === 'door' ? this.t('tl_sec_of_door') : this.t('tl_sec_of_window')) : pick.kind === 'wall' ? this.t('tl_sec_of_wall') : this.t('tl_sec_of_element');
    const valor = axis === 'v' ? formatQuantity(unitsOf(p0), 'length', this.ref.t) : cotaText(this.env, this.ref.z);
    const captura = snapKindLabel(this.ref.snap, this.uiLang());
    this.env.say(this.t('tl_sec_ref_status', {
      label: featureLabel(line.label, this.uiLang()),
      target: alvo,
      value: valor,
      snap: captura ? this.t('tl_sec_snap', { snap: captura }) : '',
    }));
  }

  private ghost(target: AlignTarget): { a: Vec2; b: Vec2 } | null {
    const ref = this.ref;
    if (!ref) return null;
    const a: Vec2 = ref.axis === 'h' ? { x: target.point.x, y: ref.z } : ref.axis === 'v' ? { x: ref.t, y: target.point.y } : { ...ref.point };
    return dist(a, target.point) < 1e-6 ? null : { a, b: { ...target.point } };
  }

  private apply(target: AlignTarget): void {
    const ref = this.ref;
    if (!ref) return;
    if (ref.hostId !== undefined && ref.hostId === target.hostId) {
      this.env.say(ref.elementKind === 'opening'
        ? 'A referência é a própria abertura alvo; escolha outra referência. Nada foi alterado.'
        : 'A referência é o próprio elemento alvo; escolha outra referência. Nada foi alterado.');
      return;
    }
    if (target.kind === 'opening') this.applyOpening(ref, target);
    else if (target.kind === 'wall') this.applyWall(ref, target);
    else this.applyElemento(ref, target);
  }

  /**
   * Escada, rampa, laje, telhado e guarda-corpo: o mesmo mecanismo do Mover no corte (`comandosMoverNoCorte`). Linha horizontal
   * leva o elemento na vertical até a referência; linha vertical leva ao longo do corte. Aresta inclinada não alinha. O
   * guarda-corpo hospedado só segue o hospedeiro: a barra de status explica.
   */
  private applyElemento(ref: AlignRef, target: AlignTarget): void {
    const p0 = this.env.project();
    const el = p0.elements[target.hostId];
    if (isGuardaCorpo(el) && hospedeiroDoGuardaCorpo(el) !== null) { avisaGuardaCorpoHospedado(this.env); return; }
    if (!el || !(isStair(el) || isRamp(el) || isFloor(el) || isSlab(el) || isGuardaCorpo(el))) { this.env.say(this.t('tl_msg_align_target_invalid')); return; }
    let dt = 0;
    let dz = 0;
    if (target.axis === 'h') {
      if (ref.axis === 'v') { this.env.say('Alinhamento incompatível: referência vertical não alinha uma linha horizontal. Nada foi alterado.'); return; }
      dz = ref.z - target.value;
    } else if (target.axis === 'v') {
      if (ref.axis === 'h') { this.env.say('Alinhamento incompatível: referência horizontal não alinha uma linha vertical. Nada foi alterado.'); return; }
      dt = ref.t - target.value;
    } else { this.env.say(this.t('tl_msg_edge_sloped_element')); return; }
    if (Math.abs(dt) < 1e-6 && Math.abs(dz) < 1e-6) { this.env.say('O elemento já está alinhado; nada foi alterado.'); return; }
    const u = sectionDirection(this.env);
    if (!u) { this.env.say('Não foi possível ler a direção do corte; nada foi alterado.'); return; }
    const mover = comandosMoverNoCorte(p0, [el.id], u, dt, dz);
    if (!mover.commands.length) { this.env.say(this.t('tl_msg_align_target_invalid')); return; }
    this.commit(mover.commands, dz !== 0 ? `Elemento alinhado em ${cotaText(this.env, ref.z)}` : `Elemento alinhado em ${formatQuantity(unitsOf(p0), 'length', ref.t)}`);
  }

  private applyOpening(ref: AlignRef, target: AlignTarget): void {
    const p0 = this.env.project();
    const o = p0.elements[target.hostId];
    if (!isOpening(o)) { this.env.say('A abertura alvo não existe mais; nada foi alterado.'); return; }
    const wall = p0.elements[o.hostId];
    if (!isWall(wall)) { this.env.say('A abertura não tem parede hospedeira; nada foi alterado.'); return; }
    const base = wallBaseElevation(p0, wall);
    const type = openingType(p0, o);

    if (target.feature === 'top' || target.feature === 'sill' || target.feature === 'centerH') {
      if (ref.axis === 'v') { this.env.say('Alinhamento incompatível: referência vertical não alinha topo/peitoril. Nada foi alterado.'); return; }
      const z = ref.z;
      const sill = openingSill(type, o);
      if (target.feature === 'top') {
        // Janela ou porta: alinhar o topo reposiciona o vão pelo peitoril, preservando a altura da família/instância.
        const height = openingHeight(type, o);
        const next = round3(z - base - height);
        if (next < 0) { this.env.say('A referência fica abaixo da base da parede; peitoril não alterado.'); return; }
        this.commit({ type: 'updateElements', ids: [o.id], patch: { sillOverride: next } }, `Topo alinhado em ${cotaText(this.env, z)}`);
        return;
      }
      if (target.feature === 'sill') {
        // Portas também podem ser elevadas: o peitoril é a cota de apoio do vão, não a altura da família.
        const next = round3(z - base);
        if (next < 0) { this.env.say('A referência fica abaixo da base da parede; peitoril não alterado.'); return; }
        this.commit({ type: 'updateElements', ids: [o.id], patch: { sillOverride: next } }, `Peitoril alinhado em ${cotaText(this.env, z)}`);
        return;
      }
      // Centro horizontal: todos os vãos se reposicionam pelo peitoril, sem mudar a altura da família.
      const height = openingHeight(type, o);
      const dz = z - (base + sill + height / 2);
      const next = round3(sill + dz);
      if (next < 0) { this.env.say('A referência fica abaixo da base da parede; centro não alterado.'); return; }
      this.commit({ type: 'updateElements', ids: [o.id], patch: { sillOverride: next } }, `Centro alinhado em ${cotaText(this.env, z)}`);
      return;
    }

    if (target.feature === 'jambLeft' || target.feature === 'jambRight' || target.feature === 'centerV') {
      if (ref.axis === 'h') { this.env.say('Alinhamento incompatível: referência horizontal não alinha ombreira/centro vertical. Nada foi alterado.'); return; }
      const u = sectionDirection(this.env);
      if (!u) { this.env.say('Não foi possível ler a direção do corte; nada foi alterado.'); return; }
      const f = frameOfWall(p0, o.hostId);
      if (!f) { this.env.say('Não foi possível ler o eixo da parede; nada foi alterado.'); return; }
      const cos = dot(f.u, u);
      if (Math.abs(cos) < 0.2) { this.env.say('A parede é quase perpendicular ao corte; mover o vão não o alinha na vista. Nada foi alterado.'); return; }
      const dt = ref.t - target.value;
      if (Math.abs(dt) < 1e-6) { this.env.say('A ombreira já está alinhada; nada foi alterado.'); return; }
      const next = round3(o.offset + dt / cos);
      const half = type.width / 2;
      const length = wallLength(wall);
      if (next - half < -1e-6 || next + half > length + 1e-6) { this.env.say('A abertura sairia da parede; nada foi alterado.'); return; }
      this.commit({ type: 'updateElements', ids: [o.id], patch: { offset: next } }, `Ombreira alinhada em ${formatQuantity(unitsOf(p0), 'length', ref.t)}`);
      return;
    }

    this.env.say('A linha do alvo não é topo, peitoril, ombreira ou centro; nada foi alterado.');
  }

  private applyWall(ref: AlignRef, target: AlignTarget): void {
    const p0 = this.env.project();
    const wall = p0.elements[target.hostId];
    if (!isWall(wall)) { this.env.say('A parede alvo não existe mais; nada foi alterado.'); return; }

    if (target.axis === 'h') {
      if (ref.axis === 'v') { this.env.say('Alinhamento incompatível: referência vertical não alinha topo/base da parede. Nada foi alterado.'); return; }
      const top = wallTopElevation(p0, wall);
      if (target.feature === 'top') {
        if (wall.topLevelId || wall.topProfile || wall.attachTopToFloor || wall.attachTopToRoof) { this.env.say('O topo da parede está preso a nível/perfil/telhado; não é seguro alinhar. Nada foi alterado.'); return; }
        const height = round3(ref.z - wallBaseElevation(p0, wall));
        if (height < 0.01) { this.env.say(this.t('tl_msg_ref_below_top')); return; }
        this.commit({ type: 'updateElements', ids: [wall.id], patch: { height } }, `Topo da parede alinhado em ${cotaText(this.env, ref.z)}`);
        return;
      }
      if (target.feature === 'base') {
        if (wall.attachBottomToFloor || wall.attachTopToFloor || wall.attachTopToRoof || wall.topProfile) { this.env.say('A base/topo da parede está preso a piso/telhado/perfil; não é seguro alinhar. Nada foi alterado.'); return; }
        const height = round3(top - ref.z);
        if (height < 0.01) { this.env.say('A referência fica alta demais para a base da parede; nada foi alterado.'); return; }
        const baseOffset = round3(ref.z - levelElevation(p0, wall.levelId));
        this.commit({ type: 'updateElements', ids: [wall.id], patch: { baseOffset, height } }, `Base da parede alinhada em ${cotaText(this.env, ref.z)}`);
        return;
      }
      this.env.say('A linha horizontal da parede não é topo nem base; nada foi alterado.');
      return;
    }

    if (target.axis === 'v') {
      if (ref.axis === 'h') { this.env.say('Alinhamento incompatível: referência horizontal não alinha a face da parede. Nada foi alterado.'); return; }
      const u = sectionDirection(this.env);
      if (!u) { this.env.say('Não foi possível ler a direção do corte; nada foi alterado.'); return; }
      const dt = ref.t - target.value;
      if (Math.abs(dt) < 1e-6) { this.env.say('A parede já está alinhada; nada foi alterado.'); return; }
      const d = { x: u.x * dt, y: u.y * dt };
      this.commit({ type: 'transform', ids: [wall.id], transform: { kind: 'translate', d } }, `Parede movida em ${formatQuantity(unitsOf(p0), 'length', Math.abs(dt))}`);
      return;
    }

    this.env.say(this.t('tl_msg_edge_sloped'));
  }

  /** Um comando, uma transação: o alinhamento inteiro é um único passo de desfazer. */
  private commit(cmd: Command | Command[], message: string): void {
    this.env.transaction('Alinhar no corte', () => { for (const c of Array.isArray(cmd) ? cmd : [cmd]) this.env.exec(c); });
    this.env.say(`${message}. Ctrl+Z desfaz; Esc sai.`);
    this.reset();
  }
}
