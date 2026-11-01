import { add, dist, dot, mul, type Vec2 } from '@hestia/geom';
import {
  DIM_MIN_LENGTH,
  defaultDimensionFamilyIdOf,
  dimRefsNear,
  openingsOfWall,
  perpendicularBetweenLines,
  resolveDimRef,
  wallBodyAt,
  wallDimFrame,
  wallLinesNear,
  wallsOnLevel,
  type WallLineHit,
  dimensionFormatStyle,
  dimensionGeometry,
  dimensionStyleFor,
  dimensionValue,
  formatDimension,
  newId,
  roundMm,
  unitsOf,
  type Dimension,
  type DimensionElementRef,
  type DimensionRef,
  type Wall,
} from '@hestia/model';
import { addSectionDimension, ToolBase, viewPlanId } from './base.ts';
import { signedOffset, viewAnnotationsOf } from './annotationPick.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import type { PointerInfo, PreviewItem, ToolOptions } from './types.ts';

type AnyRef = DimensionRef | DimensionElementRef;
/** Tolerância (m) entre o ponto capturado e a feição do elemento. */
const REF_TOL = 0.005;
/** Afastamento (mm de papel) em que a cota nova "encosta" numa linha de cota existente: cadeias alinhadas como no Revit. */
const SNAP_OFFSET_MM = 3;

type DimMode = 'aligned' | 'horizontal' | 'vertical';

/** Candidatos de referência de uma ponta: pontos de feição, linhas de parede e (modo parede inteira) uma ref forçada. */
export interface RefCands {
  forced?: AnyRef;
  points: Array<{ ref: DimensionElementRef; point: Vec2 }>;
  lines: WallLineHit[];
}

const NO_CANDS: RefCands = { points: [], lines: [] };
/** Raio (px) em que o cursor "pega" a face/eixo de uma parede sem precisar de um snap de ponto. */
const HOVER_PX = 8;
/** Snaps de ponto que valem mais que a linha sob o cursor. */
const STRONG_SNAPS = new Set(['endpoint', 'face', 'core', 'midpoint', 'intersection', 'center']);
const LINE_RANK: Record<string, number> = { 'face-hi': 0, 'face-lo': 0, axis: 1, 'core-hi': 2, 'core-lo': 2 };
/** Uma linha só vale como referência de uma cota horizontal/vertical se for perpendicular à direção de medida. */
const PERP = 0.9999;

const isOpeningRef = (r: DimensionElementRef): boolean => r.feature.startsWith('opening');

/**
 * Escolhe a referência de cada ponta (o que o Revit faz ao clicar numa face ou num eixo): esquadria vence; depois a
 * LINHA de parede perpendicular à medida (a cota segue a parede ao movê-la); por fim o ponto de feição. Em cota
 * alinhada, duas linhas paralelas viram medida perpendicular entre elas.
 */
export function chooseRefs(a: RefCands | undefined, b: RefCands | undefined, mode: DimMode): { ra?: AnyRef; rb?: AnyRef } {
  const A = a ?? NO_CANDS;
  const B = b ?? NO_CANDS;
  const pointOf = (c: RefCands): AnyRef | undefined => c.forced ?? c.points[0]?.ref;
  const opening = (c: RefCands): AnyRef | undefined => c.forced ?? c.points.find((x) => isOpeningRef(x.ref))?.ref;
  if (mode === 'aligned') {
    if (!A.forced && !B.forced && !opening(A) && !opening(B)) {
      let best: { x: WallLineHit; y: WallLineHit; d: number } | null = null;
      for (const x of A.lines) for (const y of B.lines) {
        if (Math.abs(x.normal.x * y.normal.y - x.normal.y * y.normal.x) > 1e-6) continue;
        if (x.ref.elementId === y.ref.elementId && x.ref.line === y.ref.line) continue;
        const d = x.distance + y.distance;
        if (!best || d < best.d - 1e-9) best = { x, y, d };
      }
      if (best) return { ra: best.x.ref, rb: best.y.ref };
    }
    return { ...(pointOf(A) ? { ra: pointOf(A) } : {}), ...(pointOf(B) ? { rb: pointOf(B) } : {}) };
  }
  const dir: Vec2 = mode === 'horizontal' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const pick = (c: RefCands): AnyRef | undefined => {
    const o = opening(c);
    if (o) return o;
    const line = c.lines.find((l) => Math.abs(l.normal.x * dir.x + l.normal.y * dir.y) >= PERP);
    return line ? line.ref : pointOf(c);
  };
  const ra = pick(A);
  const rb = pick(B);
  return { ...(ra ? { ra } : {}), ...(rb ? { rb } : {}) };
}

/**
 * Campos de estilo que a cota nova grava: só os que o usuário escolheu na barra de opções. Com família escolhida, nada é
 * gravado (a aparência vem da família); os demais ficam de fora para a cota seguir o estilo global do projeto
 * (`ProjectSettings.dimensionStyle`).
 */
function styleOverrides(o: ToolOptions): Partial<Dimension> {
  return {
    ...(o.dimensionUnit !== undefined ? { unit: o.dimensionUnit } : {}),
    ...(o.dimensionPrecision !== undefined ? { precision: o.dimensionPrecision } : {}),
    ...(o.dimensionTextHeight !== undefined ? { textHeight: o.dimensionTextHeight } : {}),
    ...(o.dimensionTickStyle !== undefined ? { tickStyle: o.dimensionTickStyle } : {}),
  };
}

/**
 * Cota alinhada (Revit: Aligned Dimension). Clique no ponto A, no ponto B e depois no lado da linha de cota (ou digite o
 * deslocamento e Enter). Pontos sobre a extremidade de uma parede ficam referenciados a ela.
 *
 * No modo `auto` (padrão) a direção é inferida: dois pontos na mesma horizontal viram cota horizontal, na mesma vertical
 * viram vertical e o resto fica alinhada — não é preciso escolher o modo antes de começar. A linha de cota encosta nas
 * linhas de cota que já existem (mesmo afastamento) e a prévia usa a escala real da vista (o que se vê é o que sai).
 */
export class DimensionTool extends ToolBase {
  readonly id = 'dimension';
  readonly label = 'Cota';
  readonly hint = 'Cota: clique no primeiro ponto medido, depois no segundo. Mova o cursor para o lado da linha de cota e clique (ou digite o deslocamento).';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  private refA: AnyRef | undefined;
  private refB: AnyRef | undefined;
  private candA: RefCands = NO_CANDS;
  private candB: RefCands = NO_CANDS;
  private chain: Vec2[] = [];
  private chainCands: RefCands[] = [];
  /** Cadeia gerada pelo modo "parede inteira": sempre contínua. */
  private wallChain = false;
  private offsetStage = false;
  private chainOffset = 0;

  /** Escala de impressão (1:N) da vista ativa: prévia e cota saem com as mesmas medidas de papel. */
  private scale(): number {
    const s = this.env.viewScale?.();
    return s !== undefined && Number.isFinite(s) && s > 0 ? s : 100;
  }

  /** Metros de modelo por milímetro de papel na escala da vista (a medida de todas as cotas). */
  private mPerMm(): number { return this.scale() / 1000; }

  /** Ponteiro mais recente (o Tab refaz a prévia com ele). */
  private last: PointerInfo | null = null;
  private tabIdx = 0;
  private hoverKey = '';
  private hoverHits: WallLineHit[] = [];

  /** Preferência de linha (faces, eixo ou núcleo) da barra de opções. */
  private lineRank(line: string | undefined): number {
    const want = this.env.options().dimensionRef ?? 'face';
    const own = line === 'axis' ? 'axis' : line?.startsWith('core') ? 'core' : 'face';
    return own === want ? -1 : (LINE_RANK[line ?? 'axis'] ?? 3);
  }

  /** Candidatos de referência no ponto (planta). No corte/elevação não há refs: o par gravado é `(t,z)`. */
  private candsAt(point: Vec2): RefCands {
    if (this.env.section?.()) return NO_CANDS;
    const project = this.env.project();
    const levelId = this.env.levelId();
    return { points: dimRefsNear(project, levelId, point, REF_TOL), lines: wallLinesNear(project, levelId, point, REF_TOL) };
  }

  /**
   * Ponto e candidatos do cursor. Sem um snap de ponto forte, o cursor "pega" a face/eixo/núcleo de parede mais próximo
   * (Tab alterna entre eles) e o ponto cai na projeção do cursor nessa linha.
   */
  private pick(p: PointerInfo): { point: Vec2; cands: RefCands } {
    const inf = this.snap(p);
    this.hoverHits = [];
    if (this.env.section?.() || STRONG_SNAPS.has(inf.kind)) return { point: inf.point, cands: this.candsAt(inf.point) };
    const tol = this.env.metersPerPixel() * HOVER_PX;
    const hits = wallLinesNear(this.env.project(), this.env.levelId(), p.raw, tol)
      .sort((x, y) => Math.round(x.distance * 1000) - Math.round(y.distance * 1000) || this.lineRank(x.ref.line) - this.lineRank(y.ref.line));
    if (!hits.length) return { point: inf.point, cands: this.candsAt(inf.point) };
    const key = hits.map((h) => `${h.ref.elementId}:${h.ref.line}`).join('|');
    if (key !== this.hoverKey) { this.hoverKey = key; this.tabIdx = 0; }
    const hit = hits[this.tabIdx % hits.length]!;
    this.hoverHits = [hit];
    const cands = this.candsAt(hit.point);
    // O ponto fica na linha escolhida: ela vai primeiro, as demais continuam como alternativas.
    return { point: hit.point, cands: { ...cands, lines: [hit, ...cands.lines.filter((l) => !(l.ref.elementId === hit.ref.elementId && l.ref.line === hit.ref.line))] } };
  }

  /** Realce da linha sob o cursor (a referência que o clique vai gravar). */
  private hoverItems(): PreviewItem[] {
    const project = this.env.project();
    return this.hoverHits.flatMap((h): PreviewItem[] => {
      const a = resolveDimRef(project, { ...h.ref, along: 0 });
      const b = resolveDimRef(project, { ...h.ref, along: Number.MAX_SAFE_INTEGER });
      return a && b ? [{ kind: 'line', a, b, halo: true }, { kind: 'point', at: h.point }] : [];
    });
  }

  override tab(): void {
    if (this.pickWalls() || !this.hoverHits.length) return;
    this.tabIdx++;
    if (this.last) this.move(this.last);
    this.env.say('Tab: próxima referência (face, eixo ou núcleo).');
  }

  private pickWalls(): boolean { return (this.env.options().dimensionPick ?? 'points') === 'wall'; }

  /** Direção efetiva da cota entre dois pontos: `auto` infere horizontal/vertical quando os pontos compartilham um eixo. */
  private modeFor(a: Vec2, b: Vec2): DimMode {
    const o = this.env.options().dimensionMode ?? 'auto';
    if (o !== 'auto') return o;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy <= 1e-6 && dx > 1e-6) return 'horizontal';
    if (dx <= 1e-6 && dy > 1e-6) return 'vertical';
    return 'aligned';
  }

  private measuredPoints(): { a: Vec2; b: Vec2 } {
    const a = this.a!;
    const b = this.b!;
    const mode = this.modeFor(a, b);
    if (mode === 'horizontal') return { a, b: { x: b.x, y: a.y } };
    if (mode === 'vertical') return { a, b: { x: a.x, y: b.y } };
    return { a, b: perpendicularBetweenLines(this.env.project(), { a: this.refA, b: this.refB }, a, b) };
  }

  /** Afastamentos das cotas que já existem na vista ativa (a cota nova encosta nelas) mais o último afastamento usado. */
  private existingOffsets(): number[] {
    const sec = this.env.section?.();
    const dims = sec
      ? sec.annotations().dimensions
      : viewAnnotationsOf(this.env.project(), this.env.levelId(), viewPlanId(this.env)).dimensions;
    const out = dims.map((d) => d.offset).filter((o) => Number.isFinite(o) && Math.abs(o) > 1e-6);
    const last = this.env.options().dimensionOffset;
    if (last !== undefined && Number.isFinite(last) && Math.abs(last) > 1e-6) out.push(last);
    return out;
  }

  /**
   * Afastamento com encaixe: se o cursor fica a poucos mm de papel de uma linha de cota existente, a cota nova nasce
   * alinhada com ela (é o que faz a "família de cotas" parecer desenho de arquiteto, em vez de linhas soltas).
   */
  private snapOffset(offset: number): number {
    const tol = Math.max(0.005, (SNAP_OFFSET_MM * this.scale()) / 1000);
    let best = offset;
    let bestDistance = tol;
    for (const candidate of this.existingOffsets()) {
      const d = Math.abs(candidate - offset);
      if (d < bestDistance) { bestDistance = d; best = candidate; }
    }
    return best === offset ? offset : roundMm(best);
  }

  /** Família da cota nova: a escolhida na barra ou a padrão do projeto (só quando o projeto tem famílias explícitas). */
  private familyId(): string | undefined {
    const o = this.env.options();
    if (o.dimensionFamilyId !== undefined) return o.dimensionFamilyId ?? undefined;
    const settings = this.env.project().settings;
    if ((settings.dimensionFamilies?.length ?? 0) === 0) return undefined;
    return defaultDimensionFamilyIdOf(settings);
  }

  protected reset(): void {
    this.a = null;
    this.b = null;
    this.refA = undefined;
    this.refB = undefined;
    this.candA = NO_CANDS;
    this.candB = NO_CANDS;
    this.chain = [];
    this.chainCands = [];
    this.wallChain = false;
    this.hoverHits = [];
    this.offsetStage = false;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.a !== null || this.chain.length > 0;
  }

  override inputPrompt(): string | null {
    return (this.a && this.b) || this.offsetStage ? 'Deslocamento' : null;
  }

  override confirm(): void {
    if ((this.env.options().dimensionString ?? 'single') !== 'single' && this.chain.length >= 2 && !this.offsetStage) {
      this.offsetStage = true;
      this.chainOffset = this.rememberedOffset();
      this.env.say('Sequência definida. Clique no lado da linha ou digite o afastamento e Enter.');
      return;
    }
    if (this.chain.length && this.chain.length < 2) { this.reset(); this.env.say(this.hint); return; }
    super.confirm();
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.last = p;
    if (this.pickWalls()) {
      if (this.offsetStage) { this.items = this.chainPreview(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw)))); return; }
      const w = wallBodyAt(this.env.project(), this.env.levelId(), p.raw, this.env.metersPerPixel() * HOVER_PX);
      this.items = w ? [{ kind: 'highlight', ids: [w.id] }] : [];
      return;
    }
    const { point } = this.pick(p);
    if (this.chain.length && !this.a) {
      this.items = this.offsetStage ? this.chainPreview(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw)))) : [{ kind: 'point', at: this.chain[0]! }, { kind: 'line', a: this.chain[this.chain.length - 1]!, b: point, dashed: true }, ...this.hoverItems()];
      return;
    }
    if (this.a && !this.b) this.items = [{ kind: 'point', at: this.a }, { kind: 'line', a: this.a, b: point, dashed: true }, ...this.hoverItems()];
    else if (this.a && this.b) this.items = this.previewOf(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw))));
    else this.items = this.hoverItems();
  }

  override click(p: PointerInfo): void {
    if (this.pickWalls()) {
      if (this.offsetStage) this.commitChain(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw))));
      else this.clickWall(p);
      return;
    }
    const { point, cands } = this.pick(p);
    if ((this.env.options().dimensionString ?? 'single') !== 'single') {
      if (this.offsetStage) { this.commitChain(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw)))); return; }
      if (!this.chain.length) {
        this.chain = [point];
        this.chainCands = [cands];
      } else {
        const last = this.chain[this.chain.length - 1]!;
        if (dist(last, point) < DIM_MIN_LENGTH) return;
        this.chain.push(point);
        this.chainCands.push(cands);
      }
      this.env.say(`${this.chain.length} referências selecionadas. Continue os cliques e pressione Enter para concluir a sequência.`);
      return;
    }
    if (!this.a) {
      this.a = point;
      this.candA = cands;
      this.env.say('Clique no segundo ponto da cota.');
      return;
    }
    if (!this.b) {
      this.b = point;
      const measured = this.measuredPoints();
      this.b = null;
      if (dist(measured.a, measured.b) < DIM_MIN_LENGTH) {
        this.env.say('Os dois pontos da cota são o mesmo: escolha outro ponto.');
        return;
      }
      this.b = point;
      this.candB = cands;
      const r = chooseRefs(this.candA, this.candB, this.modeFor(this.a, point));
      this.refA = r.ra;
      this.refB = r.rb;
      this.env.say('Clique do lado da linha de cota, ou digite o deslocamento e Enter.');
      return;
    }
    this.commit(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw))));
  }

  /**
   * Modo "parede inteira" (Revit: Pick > Entire Walls): um clique na parede monta a sequência ao longo dela, com as
   * pontas, as bordas (ou centros) das esquadrias e as paredes que a cruzam; o clique seguinte define o lado.
   */
  private clickWall(p: PointerInfo): void {
    const project = this.env.project();
    const levelId = this.env.levelId();
    if (this.env.section?.()) { this.env.say('Parede inteira só funciona na planta.'); return; }
    const w = wallBodyAt(project, levelId, p.raw, this.env.metersPerPixel() * HOVER_PX);
    if (!w) { this.env.say('Clique sobre uma parede (reta) para cotá-la inteira.'); return; }
    const pts = this.wallChainPoints(w);
    if (pts.length < 2) { this.env.say('A parede não tem pontos suficientes para cotar.'); return; }
    this.chain = pts.map((x) => x.point);
    this.chainCands = pts.map((x) => ({ forced: x.ref, points: [], lines: [] }));
    this.wallChain = true;
    this.offsetStage = true;
    this.chainOffset = this.rememberedOffset();
    this.env.say(`${pts.length - 1} trechos. Clique no lado da linha de cota ou digite o afastamento e Enter.`);
  }

  /** Pontos de referência ao longo da parede, em ordem, sem repetição (esquadrias e paredes cruzadas ganham da ponta). */
  private wallChainPoints(w: Wall): Array<{ t: number; point: Vec2; ref: AnyRef }> {
    const project = this.env.project();
    const fr = wallDimFrame(project, w);
    if (!fr) return [];
    const o = this.env.options();
    const want = o.dimensionRef ?? 'face';
    const lines = want === 'axis' ? (['axis'] as const) : want === 'core' ? (['core-hi', 'core-lo'] as const) : (['face-hi', 'face-lo'] as const);
    const out: Array<{ t: number; point: Vec2; ref: AnyRef; pr: number }> = [];
    const onAxis = (t: number): Vec2 => add(fr.a, mul(fr.u, t));
    const ends: DimensionElementRef[] = want === 'axis'
      ? [{ elementId: w.id, feature: 'wall-axis-a' }, { elementId: w.id, feature: 'wall-axis-b' }]
      : [{ elementId: w.id, feature: 'wall-face-hi', index: 0 }, { elementId: w.id, feature: 'wall-face-hi', index: 1 }];
    out.push({ t: 0, point: onAxis(0), ref: ends[0]!, pr: 2 }, { t: fr.length, point: onAxis(fr.length), ref: ends[1]!, pr: 2 });
    for (const op of openingsOfWall(project, w.id)) {
      const feats = (o.dimensionOpenings ?? 'widths') === 'centers' ? (['opening-center'] as const) : (['opening-edge-a', 'opening-edge-b'] as const);
      for (const feature of feats) {
        const ref: DimensionElementRef = { elementId: op.id, feature };
        const pt = resolveDimRef(project, ref);
        if (pt) { const t = dot({ x: pt.x - fr.a.x, y: pt.y - fr.a.y }, fr.u); out.push({ t, point: onAxis(t), ref, pr: 0 }); }
      }
    }
    const half = (fr.sHi - fr.sLo) / 2 + 0.02;
    for (const c of wallsOnLevel(project, w.levelId)) {
      if (c.id === w.id || c.sag !== 0) continue;
      const fc = wallDimFrame(project, c);
      if (!fc) continue;
      const den = fr.u.x * fc.u.y - fr.u.y * fc.u.x;
      if (Math.abs(den) < 0.2) continue;
      const sAxis = ((fc.a.x - fr.a.x) * fr.u.y - (fc.a.y - fr.a.y) * fr.u.x) / den;
      if (sAxis < -half || sAxis > fc.length + half) continue;
      for (const line of lines) {
        const sc = line === 'axis' ? 0 : line === 'face-hi' || line === 'core-hi' ? fc.sHi : fc.sLo;
        const base = { x: fc.a.x + fc.n.x * sc - fr.a.x, y: fc.a.y + fc.n.y * sc - fr.a.y };
        const t = (base.x * fc.u.y - base.y * fc.u.x) / den;
        if (t < -0.001 || t > fr.length + 0.001) continue;
        const pt = onAxis(t);
        const along = Math.min(fc.length, Math.max(0, dot({ x: pt.x - fc.a.x, y: pt.y - fc.a.y }, fc.u)));
        out.push({ t, point: pt, ref: { elementId: c.id, feature: 'wall-line', line, along }, pr: 1 });
      }
    }
    out.sort((x, y) => x.t - y.t || x.pr - y.pr);
    const merged: typeof out = [];
    for (const q of out) {
      const prev = merged[merged.length - 1];
      if (prev && Math.abs(q.t - prev.t) < 0.002) { if (q.pr < prev.pr) merged[merged.length - 1] = q; } else merged.push(q);
    }
    return merged;
  }

  override type(text: string): boolean {
    if (this.offsetStage) {
      const value = parseQuantityText(text, unitsOf(this.env.project()), 'length');
      if (value === null || value <= 0) { this.env.say(`Digite o afastamento em ${lengthUnitName(unitsOf(this.env.project()))}, maior que zero.`); return false; }
      this.commitChain(this.side(this.raw) * value);
      return true;
    }
    if (!this.a || !this.b) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null || v === 0) {
      this.env.say(`Digite o deslocamento em ${lengthUnitName(unitsOf(this.env.project()))}, diferente de zero. Com sinal negativo, a cota vai para o lado direito de a→b.`);
      return false;
    }
    // O sinal digitado escolhe o lado (negativo = direito de a→b); sem sinal, vale o lado do cursor.
    const side = v < 0 ? -1 : this.side(this.raw);
    this.commit(side * roundMm(Math.abs(v)));
    return true;
  }

  /** Lado da linha de cota pelo cursor: +1 à esquerda de a→b, −1 à direita. */
  private side(q: Vec2): number {
    const { a, b } = this.referenceLine();
    return signedOffset(a, b, q) >= 0 ? 1 : -1;
  }

  private distanceToLine(q: Vec2): number {
    const { a, b } = this.referenceLine();
    return Math.abs(signedOffset(a, b, q));
  }

  private referenceLine(): { a: Vec2; b: Vec2 } {
    if (this.chain.length >= 2 && !this.a) {
      const a = this.chain[0]!; const last = this.chain[this.chain.length - 1]!;
      const mode = this.modeFor(a, last);
      return mode === 'horizontal' ? { a, b: { x: last.x, y: a.y } } : mode === 'vertical' ? { a, b: { x: a.x, y: last.y } } : { a, b: last };
    }
    return this.measuredPoints();
  }

  /** Afastamento inicial da sequência: o último usado (ou o do encaixe com as cotas existentes). */
  private rememberedOffset(): number {
    const last = this.env.options().dimensionOffset;
    return last !== undefined && Number.isFinite(last) && Math.abs(last) > 1e-6 ? last : this.chainOffset;
  }

  private previewOf(offset: number): PreviewItem[] {
    // Prévia com a escala REAL da vista e o estilo da família: o texto e as marcas têm o mesmo tamanho da cota confirmada.
    const mPerMm = this.mPerMm();
    const { a, b } = this.measuredPoints();
    const opts = this.env.options();
    const mode = this.modeFor(a, b);
    const project = this.env.project();
    const familyId = this.familyId();
    const style = dimensionStyleFor(project.settings, { familyId });
    const g = dimensionGeometry(a, b, offset, mPerMm, opts.dimensionTextHeight ?? style.textHeight, undefined, {
      extensionGapMm: style.extensionGap,
      extensionOvershootMm: style.extensionOvershoot,
      tickHalfMm: style.tickSize / 2,
      textGapMm: style.textGap,
      centered: style.textPlacement === 'centered',
      readConvention: style.readConvention,
    });
    const out: PreviewItem[] = [
      { kind: 'line', a: g.line[0], b: g.line[1] },
      ...g.extensions.map(([p, q]): PreviewItem => ({ kind: 'line', a: p, b: q, dashed: true })),
    ];
    const dim: Dimension = { id: 'preview', a, b, offset, mode, unit: opts.dimensionUnit ?? 'project', precision: opts.dimensionPrecision, prefix: opts.dimensionPrefix, suffix: opts.dimensionSuffix };
    // `dimensionStyle`: a prévia é desenhada como cota (fonte de cota, sem a caixa do rótulo de interface) na planta e no corte.
    out.push({ kind: 'label', at: g.textAt, text: formatDimension(dim, dimensionValue(project, dim), unitsOf(project), dimensionFormatStyle(style)), dimensionStyle: true, rotation: g.textRotation });
    return out;
  }

  private chainPairs(): Array<{ a: Vec2; b: Vec2; ra?: AnyRef; rb?: AnyRef; offset: number; mode: DimMode }> {
    const mode = this.wallChain ? 'continuous' : this.env.options().dimensionString ?? 'continuous';
    const out: Array<{ a: Vec2; b: Vec2; ra?: AnyRef; rb?: AnyRef; offset: number; mode: DimMode }> = [];
    const project = (a: Vec2, b: Vec2): { a: Vec2; b: Vec2; mode: DimMode } => {
      const dir = this.modeFor(a, b);
      return dir === 'horizontal' ? { a, b: { x: b.x, y: a.y }, mode: dir } : dir === 'vertical' ? { a, b: { x: a.x, y: b.y }, mode: dir } : { a, b, mode: dir };
    };
    if (mode === 'continuous') {
      for (let i = 1; i < this.chain.length; i++) {
        const a = this.chain[i - 1]!; const b = this.chain[i]!; const pts = project(a, b);
        if (dist(pts.a, pts.b) >= DIM_MIN_LENGTH) out.push({ ...pts, ...chooseRefs(this.chainCands[i - 1], this.chainCands[i], pts.mode), offset: this.chainOffset });
      }
    } else {
      const a = this.chain[0]!;
      const step = this.env.options().dimensionTextHeight ?? 2.5;
      const mPerMm = this.mPerMm();
      for (let i = 1; i < this.chain.length; i++) {
        const b = this.chain[i]!; const pts = project(a, b);
        if (dist(pts.a, pts.b) >= DIM_MIN_LENGTH) out.push({ ...pts, ...chooseRefs(this.chainCands[0], this.chainCands[i], pts.mode), offset: this.chainOffset + (this.chainOffset >= 0 ? 1 : -1) * (i - 1) * step * mPerMm * 2.5 });
      }
    }
    return out;
  }

  private chainPreview(offset: number): PreviewItem[] {
    this.chainOffset = offset;
    const mPerMm = this.mPerMm();
    return this.chainPairs().flatMap((d) => {
      const g = dimensionGeometry(d.a, d.b, d.offset, mPerMm);
      return [{ kind: 'line' as const, a: g.line[0], b: g.line[1] }, ...g.extensions.map(([a, b]) => ({ kind: 'line' as const, a, b, dashed: true }))];
    });
  }

  private commitChain(offset: number): void {
    if (!Number.isFinite(offset) || Math.abs(offset) < 1e-6) { this.env.say('O afastamento da cota não pode ser zero.'); return; }
    this.chainOffset = offset;
    const opts = this.env.options();
    const pairs = this.chainPairs();
    if (!pairs.length) { this.env.say('A sequência não contém segmentos mensuráveis.'); return; }
    const chainId = pairs.length > 1 ? newId('chain') : undefined;
    this.env.transaction('Criar sequência de cotas', () => {
      for (const d of pairs) {
        const refs = { ...(d.ra ? { a: d.ra } : {}), ...(d.rb ? { b: d.rb } : {}) };
        const dimension: Dimension = { id: newId('dim'), a: d.a, b: d.b, offset: d.offset, mode: d.mode, ...styleOverrides(opts), ...(opts.dimensionPrefix ? { prefix: opts.dimensionPrefix } : {}), ...(opts.dimensionSuffix ? { suffix: opts.dimensionSuffix } : {}), ...(Object.keys(refs).length ? { refs } : {}), ...(chainId ? { chainId } : {}), ...this.familyPatch() };
        if (!addSectionDimension(this.env, dimension)) this.env.exec({ type: 'addDimension', levelId: this.env.levelId(), planId: viewPlanId(this.env), dimension });
      }
    });
    this.env.setOptions?.({ dimensionOffset: offset });
    this.reset();
    this.env.say(`${pairs.length} cotas criadas na sequência.`);
  }

  /** `familyId` da cota nova, quando há família (a aparência vai da família; sem ela, vale o estilo global). */
  private familyPatch(): Partial<Dimension> {
    const id = this.familyId();
    return id ? { familyId: id } : {};
  }

  private commit(offset: number): void {
    const a = this.a!;
    const b = this.b!;
    if (!Number.isFinite(offset) || Math.abs(offset) < 1e-6) {
      this.env.say('O deslocamento da cota não pode ser zero.');
      return;
    }
    const refs = { ...(this.refA ? { a: this.refA } : {}), ...(this.refB ? { b: this.refB } : {}) };
    const o = this.env.options();
    const dimension: Dimension = { id: newId('dim'), a, b, offset, mode: this.modeFor(a, b), ...styleOverrides(o), ...(o.dimensionPrefix ? { prefix: o.dimensionPrefix } : {}), ...(o.dimensionSuffix ? { suffix: o.dimensionSuffix } : {}), ...(Object.keys(refs).length ? { refs } : {}), ...this.familyPatch() };
    if (!addSectionDimension(this.env, dimension)) this.env.exec({ type: 'addDimension', levelId: this.env.levelId(), planId: viewPlanId(this.env), dimension });
    this.env.setOptions?.({ dimensionOffset: offset });
    this.reset();
    this.env.say(this.hint);
  }
}
