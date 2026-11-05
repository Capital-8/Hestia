/* eslint-disable max-lines -- o Alinhar do corte concentra pick, features, guias e patches; dividir depois. */
import { closestOnSegment, dist, dot, norm, pointInMulti, sub, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { frameOfWall, type SectionOpening, type SectionOrigin, type SectionResult } from '@hestia/engine';
import { formatQuantity, isOpening, isWall, levelElevation, openingHeight, openingSill, openingType, unitsOf, wallBaseElevation, wallLength, wallTopElevation, type Command, type Id, type Opening, type Project } from '@hestia/model';
import { ToolBase } from './base.ts';
import type { Guide, Inference, PointerInfo, PreviewItem, SectionToolContext, SnapKind, ToolEnv } from './types.ts';
import { t as translate, type DictKey, type Lang } from './i18n.ts';

/** Direção da linha do corte ativo em planta. */
function sectionDirection(env: ToolEnv): Vec2 | null {
  const sec = env.section?.();
  const view = sec ? env.project().views.find((v) => v.id === sec.id) : null;
  if (!view) return null;
  const d = sub(view.b, view.a);
  return Math.hypot(d.x, d.y) < 1e-9 ? null : norm(d);
}

function selectedOpenings(env: ToolEnv, walls: readonly string[]): Opening[] {
  const p = env.project();
  return env.selection().map((id) => p.elements[id]).filter((e): e is Opening => isOpening(e) && !walls.includes(e.hostId));
}

/** Move as anotações selecionadas da vista em `(dt, dz)` (translação no plano da vista): cota, texto, detalhe e etiqueta. */
function moveSectionAnnotations(env: ToolEnv, selection: readonly string[], dt: number, dz: number): Command[] {
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

/**
 * Mover no corte: horizontal anda ao longo da linha do corte (parede inteira) ou ao longo da parede (abertura);
 * vertical move o peitoril da abertura. Anotações selecionadas (cota, texto, detalhe e etiqueta) andam no plano da vista.
 * É um gesto único com um só undo.
 */
export class SectionMoveTool extends ToolBase {
  readonly id = 'move';
  readonly label = 'Mover';
  override get hint(): string {
    return this.t('tl_hint_move_section');
  }
  private startPoint: Vec2 | null = null;

  protected reset(): void { this.startPoint = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.startPoint !== null; }

  down(p: PointerInfo): void {
    this.startPoint = { ...p.raw };
    this.items = [];
    this.env.say('Arraste para mover; Esc cancela.');
  }

  drag(p: PointerInfo): void {
    if (!this.startPoint) return;
    this.items = [
      { kind: 'line', a: this.startPoint, b: p.raw, dashed: true },
      { kind: 'label', at: p.raw, text: `${formatQuantity(unitsOf(this.env.project()), 'length', p.raw.x - this.startPoint.x)} · ${formatQuantity(unitsOf(this.env.project()), 'length', p.raw.y - this.startPoint.y)}` },
    ];
  }

  up(p: PointerInfo): void {
    const start = this.startPoint;
    this.startPoint = null;
    this.items = [];
    if (!start) return;
    const dt = p.raw.x - start.x;
    const dz = p.raw.y - start.y;
    if (Math.abs(dt) < 1e-6 && Math.abs(dz) < 1e-6) return;
    const u = sectionDirection(this.env);
    if (!u) { this.env.say('Não foi possível ler a direção do corte.'); return; }
    const p0 = this.env.project();
    const selection = this.env.selection();
    const wallIds = selection.filter((id) => isWall(p0.elements[id]));
    const openings = selectedOpenings(this.env, wallIds);
    const commands: Command[] = [];
    const notes = moveSectionAnnotations(this.env, selection, dt, dz);
    if (wallIds.length && Math.abs(dt) > 1e-6) {
      commands.push({ type: 'transform', ids: wallIds, transform: { kind: 'translate', d: { x: u.x * dt, y: u.y * dt } } });
    }
    for (const o of openings) {
      const f = frameOfWall(p0, o.hostId);
      if (!f) continue;
      const patch: Partial<Opening> = {};
      if (Math.abs(dt) > 1e-6) patch.offset = o.offset + dot({ x: u.x * dt, y: u.y * dt }, f.u);
      if (Math.abs(dz) > 1e-6) patch.sillOverride = Math.max(0, openingSill(openingType(p0, o), o) + dz);
      if (Object.keys(patch).length) commands.push({ type: 'updateElements', ids: [o.id], patch });
    }
    commands.push(...notes);
    if (!commands.length) {
      this.env.say(wallIds.length ? this.t('tl_msg_section_move_vertical') : 'Selecione uma parede, abertura ou anotação para mover.');
      return;
    }
    this.env.transaction('Mover no corte', () => { for (const c of commands) this.env.exec(c); });
    this.env.say(notes.length > 0 && commands.length === notes.length ? 'Anotações movidas no corte. Ctrl+Z desfaz.' : 'Movido no corte. Ctrl+Z desfaz.');
  }

  override click(): void { /* o gesto é arrastado; clique sem arrasto não move */ }
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
function sectionResult(env: ToolEnv): SectionResult | null {
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
type Piece = { hostId: Id; depth: number; polygons: MultiPolygon };
type Pick = { kind: PieceKind; hostId: Id; opening?: SectionOpening; lines: FeatureLine[]; line: FeatureLine };

const TIE = 0.01;
const LINE_EPS = 1e-7;
const FEATURE_ORDER = ['top', 'sill', 'jambLeft', 'jambRight', 'base', 'faceLeft', 'faceRight', 'axis', 'edge', 'centerV', 'centerH'];

/** As seis linhas de uma janela/porta: topo, peitoril, duas ombreiras e os dois centros. */
function openingLines(o: SectionOpening): FeatureLine[] {
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
function nearestLine(lines: FeatureLine[], at: Vec2, prefer: 'h' | 'v' | null = null): FeatureLine | null {
  if (!lines.length) return null;
  const scored = lines.map((line) => ({ line, d: dist(at, closestOnSegment(at, line.a, line.b)) }));
  const min = Math.min(...scored.map((s) => s.d));
  const ties = scored.filter((s) => s.d <= min + TIE);
  const compatible = prefer ? ties.filter((s) => s.line.axis === prefer) : [];
  const pool = compatible.length ? compatible : ties;
  const rank = (f: FeatureLine): number => { const i = FEATURE_ORDER.indexOf(f.feature); return i < 0 ? FEATURE_ORDER.length : i; };
  pool.sort((x, y) => rank(x.line) - rank(y.line));
  return pool[0]?.line ?? null;
}

const inBox = (o: SectionOpening, at: Vec2, tol: number): boolean =>
  at.x >= o.t0 - tol && at.x <= o.t1 + tol && at.y >= o.z0 - tol && at.y <= o.z1 + tol;

/** Abertura visível sob o clique. Vãos sobrepostos: o mais perto do plano de corte (menor `depth`) vence. */
function hitOpening(result: SectionResult, at: Vec2, tol: number, prefer: 'h' | 'v' | null): { opening: SectionOpening; lines: FeatureLine[]; line: FeatureLine } | null {
  let best: { opening: SectionOpening; lines: FeatureLine[]; line: FeatureLine } | null = null;
  let score = Infinity;
  for (const o of result.openings ?? []) {
    const polys = o.polygons ?? [];
    const inside = inBox(o, at, tol) || pointInMulti(at, polys);
    const lines = openingLines(o);
    const line = nearestLine(lines, at, prefer);
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
function resultPieces(result: SectionResult): Piece[] {
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

function hitPiece(pieces: Piece[], at: Vec2, tol: number, prefer: 'h' | 'v' | null): { piece: Piece; lines: FeatureLine[]; line: FeatureLine } | null {
  let best: { piece: Piece; lines: FeatureLine[]; line: FeatureLine } | null = null;
  let score = Infinity;
  for (const piece of pieces) {
    const inside = pointInMulti(at, piece.polygons);
    const lines = linesOfPolygons(piece.polygons);
    const line = nearestLine(lines, at, prefer);
    if (!line) continue;
    const d = dist(at, closestOnSegment(at, line.a, line.b));
    if (!inside && d > tol) continue;
    const s = (inside ? 0 : 1) + piece.depth * 1e-6 + Math.min(d, tol) * 1e-3;
    if (s < score) { score = s; best = { piece, lines, line }; }
  }
  return best;
}

/** Elemento sob o clique: abertura primeiro, depois parede, depois qualquer outro dono visível. */
function pickAt(result: SectionResult, project: Project, at: Vec2, tol: number, prefer: 'h' | 'v' | null): Pick | null {
  const op = hitOpening(result, at, tol, prefer);
  if (op) return { kind: 'opening', hostId: op.opening.openingId, opening: op.opening, lines: op.lines, line: op.line };
  const all = resultPieces(result);
  const wall = hitPiece(all.filter((p) => isWall(project.elements[p.hostId])), at, tol, prefer);
  if (wall) return { kind: 'wall', hostId: wall.piece.hostId, lines: wall.lines, line: wall.line };
  const other = hitPiece(all.filter((p) => !isWall(project.elements[p.hostId])), at, tol, prefer);
  if (other) return { kind: 'other', hostId: other.piece.hostId, lines: other.lines, line: other.line };
  return null;
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
    const target = this.ref ? this.findTarget(inf.point) : null;
    if (!target) { this.items = [{ kind: 'point', at: inf.point }]; return; }
    const items: PreviewItem[] = [{ kind: 'point', at: inf.point }, { kind: 'highlight', ids: [target.hostId] }];
    const ghost = this.ghost(target);
    if (ghost) items.push({ kind: 'line', a: ghost.a, b: ghost.b, dashed: true });
    this.items = items;
  }

  override click(p: PointerInfo): void {
    if (!sectionResult(this.env)) { this.env.say(NO_RESULT); return; }
    const inf = this.snap(p);
    if (!this.ref) { this.setReference(inf); return; }
    const target = this.findTarget(inf.point);
    if (!target) { this.env.say('Nenhuma janela, porta ou parede sob o clique; nada foi alterado.'); return; }
    this.apply(target);
  }

  private tolerance(): number { return Math.max(0.02, this.env.metersPerPixel() * 10); }

  private findTarget(at: Vec2): AlignTarget | null {
    const result = sectionResult(this.env);
    if (!result) return null;
    const prefer = this.ref?.axis === 'h' || this.ref?.axis === 'v' ? this.ref.axis : null;
    const pick = pickAt(result, this.env.project(), at, this.tolerance(), prefer);
    if (!pick) return null;
    const line = pick.line;
    return { hostId: pick.hostId, kind: pick.kind, feature: line.feature, label: line.label, axis: line.axis ?? 'point', value: line.value, line: { a: line.a, b: line.b }, point: closestOnSegment(at, line.a, line.b) };
  }

  private setReference(inf: Inference): void {
    const result = sectionResult(this.env);
    if (!result) { this.env.say(NO_RESULT); return; }
    const p0 = this.env.project();
    const pick = pickAt(result, p0, inf.point, this.tolerance(), null);
    if (!pick) {
      this.ref = { elementKind: 'other', feature: 'point', label: 'ponto', axis: 'point', z: inf.point.y, t: inf.point.x, value: inf.point.y, point: { ...inf.point }, line: null, guide: null, snap: inf.kind };
      this.items = [];
      this.env.say(`Sem referência de linha: ponto livre ${cotaText(this.env, inf.point.y)}. Clique no alvo para alinhar.`);
      return;
    }
    const line = pick.line;
    const axis: Axis = line.axis ?? 'point';
    const at = closestOnSegment(inf.point, line.a, line.b);
    this.ref = { hostId: pick.hostId, elementKind: pick.kind, feature: line.feature, label: line.label, axis, z: axis === 'h' ? line.value : at.y, t: axis === 'v' ? line.value : at.x, value: line.value, point: at, line: { a: line.a, b: line.b }, guide: guideOf(result, axis, line), snap: inf.kind !== 'none' ? inf.kind : 'nearest' };
    this.items = [];
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
    else this.env.say(this.t('tl_msg_align_target_invalid'));
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
  private commit(cmd: Command, message: string): void {
    this.env.transaction('Alinhar no corte', () => this.env.exec(cmd));
    this.env.say(`${message}. Ctrl+Z desfaz; Esc sai.`);
    this.reset();
  }
}
