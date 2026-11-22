import { add, arcFromSagitta, cross, dist, mul, norm, sagFromThreePoints, sub, v2, type Vec2 } from '@hestia/geom';
import { exteriorOffset } from '@hestia/engine';
import { formatQuantity, makeWall, wallThicknessOf, wallTiltIssue, unitsOf, type ResolvedUnits, type Wall } from '@hestia/model';
import { ToolBase, makeId, viewPlanId } from './base.ts';
import { draftAngleItemsForConnection } from './anglePreview.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import type { InferContext } from './infer.ts';
import { deslocamentoDoTerreno } from './gravidade.ts';
import { pontoPorComprimento } from './desenhoPolilinha.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import type { PointerInfo, PreviewItem } from './types.ts';
import { arcCenterEnds, arcTangent } from './sketchShapesArc.ts';
import { circleSegments, ellipseSegments, polygonSegments, splineSegments, type WallSegment } from './wallShapes.ts';
import { refuseWallOverlap } from './wallOverlapGuard.ts';
import type { DictKey } from './i18n.ts';

type PointShape = 'polygon' | 'circle' | 'ellipse' | 'spline' | 'arc-center' | 'arc-tangent';

const fmt = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/**
 * Parede reta (dois pontos), em arco (início, fim e um ponto do arco) ou retângulo (dois cantos opostos:
 * quatro paredes encadeadas, anti-horário, com o lado externo para fora).
 */
export class WallTool extends ToolBase {
  readonly id = 'wall';
  readonly label = 'Parede';
  override get hint(): string {
    return this.t('tl_hint_wall');
  }
  private startPt: Vec2 | null = null;
  /** Arco: ponto final da corda, já definido; falta o ponto sobre o arco. */
  private chordEnd: Vec2 | null = null;
  private first: Vec2 | null = null;
  /** Gravidade: `baseOffset` inicial (cota do terreno sob o primeiro clique menos a elevação do nível), ou null. Vale para a cadeia inteira. */
  private baseDoTerreno: number | null = null;
  private count = 0;
  private flip = false;
  private alignmentCycle = 0;
  private lastPointer: PointerInfo | null = null;
  private lastPoint: Vec2 | null = null;
  /** Cadeia inclinada: chave de sessão do desfazer (uma cadeia = um passo). Zera ao terminar a cadeia. */
  private tiltSession: object | null = null;

  /** Formas por pontos (polígono, círculo, elipse, spline): centro/pontos já clicados. */
  private pts: Vec2[] = [];

  protected reset(): void {
    this.pts = [];
    this.startPt = null;
    this.chordEnd = null;
    this.first = null;
    this.baseDoTerreno = null;
    this.count = 0;
    this.items = [];
    this.inf = null;
    this.alignmentCycle = 0;
    this.lastPointer = null;
    this.lastPoint = null;
    this.tiltSession = null;
  }

  protected busy(): boolean {
    return this.startPt !== null || this.pts.length > 0;
  }

  /** Modo de forma por pontos ativo, ou null (reta, arco e retângulo têm caminho próprio). */
  private pointShape(): PointShape | null {
    const s = this.env.options().wallShape;
    return s === 'polygon' || s === 'circle' || s === 'ellipse' || s === 'spline' || s === 'arc-center' || s === 'arc-tangent' ? s : null;
  }

  /** Segmentos da forma com o cursor em `c` (null: ainda faltam pontos). `closeSpline`: o cursor fecha a spline. */
  private shapeSegments(c: Vec2, _preview: boolean): WallSegment[] | null {
    const o = this.env.options();
    const tol = o.wallFitTol ?? 0.005;
    const k = this.pointShape();
    const p0 = this.pts[0];
    if (!k || !p0) return null;
    if (k === 'arc-center' || k === 'arc-tangent') {
      const p1 = this.pts[1];
      // Antes do segundo ponto não há arco; a prévia fica só com os pontos (raio / tangente).
      if (!p1) return null;
      const segs = k === 'arc-center'
        // Percurso para o lado do cursor em relação ao raio inicial (arco de até 180°).
        ? arcCenterEnds(p0, p1, c, cross(sub(p1, p0), sub(c, p0)) > 0)
        : arcTangent(p0, sub(p1, p0), c);
      return segs.map((s) => ({ a: s.a, b: s.b, sag: s.sag ?? 0 }));
    }
    if (k === 'polygon') return polygonSegments(p0, c, o.wallPolygonSides ?? 6, o.wallPolygonCircumscribed ?? false);
    if (k === 'circle') return circleSegments(p0, dist(p0, c), Math.atan2(c.y - p0.y, c.x - p0.x));
    if (k === 'ellipse') {
      const p1 = this.pts[1];
      // Segundo ponto: semieixo e rotação. Antes dele, a prévia é o círculo pelo cursor.
      if (!p1) return circleSegments(p0, dist(p0, c), Math.atan2(c.y - p0.y, c.x - p0.x));
      const rx = dist(p0, p1);
      const u = norm(sub(p1, p0));
      const ry = Math.abs((c.x - p0.x) * -u.y + (c.y - p0.y) * u.x);
      return ellipseSegments(p0, rx, ry, Math.atan2(u.y, u.x), tol);
    }
    const closed = this.pts.length >= 3 && this.splineCloses(c);
    const pts = closed || dist(this.pts[this.pts.length - 1]!, c) < 1e-6 ? this.pts : [...this.pts, c];
    return splineSegments(pts, closed, tol, undefined);
  }

  private splineCloses(c: Vec2): boolean {
    return this.pts.length >= 3 && dist(c, this.pts[0]!) < Math.max(0.02, this.env.metersPerPixel() * 8);
  }

  private movePointShape(p: PointerInfo): void {
    const inf = this.snapWall(p, { from: this.pts[this.pts.length - 1] });
    this.lastPoint = inf.point;
    this.items = [];
    if (this.pts.length === 0) {
      this.items.push({ kind: 'point', at: inf.point });
      this.env.say(this.pointShape() === 'arc-center' ? this.t('tl_msg_arc_center_c') : this.hint);
      return;
    }
    const segs = this.shapeSegments(inf.point, true);
    const { thickness, sMid } = this.band();
    const arcK = this.pointShape();
    if ((arcK === 'arc-center' || arcK === 'arc-tangent') && this.pts.length === 1) {
      // Segundo ponto ainda por clicar: mostra o raio (centro→cursor) ou a direção da tangente (início→cursor).
      this.items.push({ kind: 'point', at: this.pts[0]! }, { kind: 'wallBand', a: this.pts[0]!, b: inf.point, thickness, sMid });
      this.env.say(arcK === 'arc-center' ? this.t('tl_msg_arc_center_s') : this.t('tl_msg_arc_tan_t'));
      return;
    }
    for (const s of segs ?? []) this.items.push({ kind: 'wallBand', a: s.a, b: s.b, thickness, sMid, sag: s.sag });
    const k = this.pointShape();
    this.env.say(
      k === 'arc-center' ? this.t('tl_msg_arc_center_e')
        : k === 'arc-tangent' ? this.t('tl_msg_arc_tan_e')
        : k === 'spline' ? this.t('tl_msg_shape_spline')
        : k === 'ellipse' ? (this.pts.length === 1 ? this.t('tl_msg_shape_axis_tip') : this.t('tl_msg_shape_axis_second'))
        : this.t('tl_msg_shape_radius'),
    );
  }

  private clickPointShape(p: PointerInfo): void {
    const inf = this.snapWall(p, { from: this.pts[this.pts.length - 1] });
    const c = inf.point;
    const k = this.pointShape()!;
    const last = this.pts[this.pts.length - 1];
    if (!last) {
      this.pts = [c];
      return;
    }
    if (k === 'spline') {
      if (this.splineCloses(c)) return this.commitShape(c);
      if (dist(last, c) < 0.02) return;
      this.pts = [...this.pts, c];
      return;
    }
    if ((k === 'arc-center' || k === 'arc-tangent' || k === 'ellipse') && this.pts.length === 1) {
      if (dist(last, c) < 0.02) return;
      this.pts = [last, c];
      return;
    }
    this.commitShape(c);
  }

  /** Cria todas as paredes da forma em UMA transação (um desfazer). Qualquer lado sobreposto ou curto recusa a forma inteira. */
  private commitShape(c: Vec2): void {
    const segs = this.shapeSegments(c, false);
    if (!segs || segs.length === 0 || segs.some((s) => dist(s.a, s.b) < 0.01)) {
      this.env.say(this.t('tl_msg_shape_invalid'));
      return;
    }
    const walls = segs.map((s) => this.wallAt(s.a, s.b, s.sag));
    if (walls.some((w) => refuseWallOverlap(this.env, w))) return;
    if (this.tiltRefused(walls)) return;
    const k = this.pointShape();
    const desfazer: Record<PointShape, DictKey> = { 'arc-center': 'tl_undo_wall_arc_center', 'arc-tangent': 'tl_undo_wall_arc_tangent', polygon: 'tl_undo_wall_polygon', circle: 'tl_undo_wall_circle', ellipse: 'tl_undo_wall_ellipse', spline: 'tl_undo_wall_spline' };
    this.env.transaction(this.t(desfazer[k!]), () => {
      for (const wall of walls) this.env.exec({ type: 'addWall', wall });
    });
    this.reset();
    this.env.say(this.hint);
  }

  override confirm(): void {
    // Enter na spline: termina aberta, se já há pontos suficientes.
    if (this.pointShape() === 'spline' && this.pts.length >= 2) {
      this.commitShape(this.pts[this.pts.length - 1]!);
      return;
    }
    super.confirm();
  }

  private isArc(): boolean {
    return this.env.options().wallShape === 'arc';
  }

  private isRect(): boolean {
    return this.env.options().wallShape === 'rect';
  }

  /**
   * Lado externo à direita de a→b (`flipped`). Paredes de retângulo saem anti-horárias, então o externo
   * padrão é o da direita (para fora); Espaço inverte nos dois casos.
   */
  private sideFlip(): boolean {
    return this.isRect() ? !this.flip : this.flip;
  }

  override inputPrompt(): string | null {
    if (!this.startPt || this.pointShape() || this.isRect()) return null;
    return this.chordEnd ? 'Flecha do arco' : this.isArc() ? 'Comprimento da corda' : this.t('tl_inp_length');
  }

  override tab(): void {
    this.alignmentCycle += 1;
    if (this.lastPointer) this.move(this.lastPointer);
  }

  override space(): void {
    this.flip = !this.flip;
    if (this.lastPointer) this.move(this.lastPointer);
    this.env.say(this.sideFlip() ? this.t('tl_msg_wall_side_right') : this.t('tl_msg_wall_side_left'));
  }

  private snapWall(p: PointerInfo, extra: Partial<InferContext> = {}) {
    return this.snap(p, { ...extra, cycle: this.alignmentCycle });
  }

  private band() {
    const o = this.env.options();
    const p = this.env.project();
    const t = p.wallTypes[o.wallTypeId] ?? p.wallTypes[p.defaults.wallTypeId];
    if (!t) return { thickness: 0.15, sMid: 0 };
    const th = wallThicknessOf(t);
    const ext = exteriorOffset(t, o.locationLine);
    const sign = this.sideFlip() ? -1 : 1;
    return { thickness: th, sMid: sign * (ext - th / 2) };
  }

  /** Quatro cantos do retângulo com o primeiro canto em `startPt` e o oposto em `c`, no sentido anti-horário. */
  private rectCorners(c: Vec2): Vec2[] {
    const a = this.startPt!;
    const pts = [a, { x: c.x, y: a.y }, c, { x: a.x, y: c.y }];
    let area = 0;
    for (let i = 0; i < 4; i++) area += cross(pts[i]!, pts[(i + 1) % 4]!);
    // Área com sinal positiva = anti-horário. Diagonal "de sinal misto" sai horária: inverte a ordem.
    return area >= 0 ? pts : [pts[0]!, pts[3]!, pts[2]!, pts[1]!];
  }

  private moveRect(p: PointerInfo): void {
    const inf = this.snapWall(p);
    this.items = [];
    const a = this.startPt;
    if (!a) {
      this.items.push({ kind: 'point', at: inf.point });
      this.env.say(this.hint);
      return;
    }
    const c = inf.point;
    const pts = this.rectCorners(c);
    const { thickness, sMid } = this.band();
    for (let i = 0; i < 4; i++) this.items.push({ kind: 'wallBand', a: pts[i]!, b: pts[(i + 1) % 4]!, thickness, sMid }, ...this.tiltTopItems(pts[i]!, pts[(i + 1) % 4]!));
    this.items.push({ kind: 'label', at: c, text: `${fmt(unitsOf(this.env.project()), Math.abs(c.x - a.x))} × ${fmt(unitsOf(this.env.project()), Math.abs(c.y - a.y))}` });
    this.env.say('Clique no canto oposto do retângulo.');
  }

  private clickRect(p: PointerInfo): void {
    const inf = this.snapWall(p);
    if (!this.startPt) {
      this.startPt = inf.point;
      this.first = inf.point;
      this.baseDoTerreno = deslocamentoDoTerreno(this.env, this.env.project(), this.env.levelId(), inf.point.x, inf.point.y);
      this.count = 0;
      return;
    }
    const a = this.startPt;
    const c = inf.point;
    if (Math.abs(c.x - a.x) < 0.01 || Math.abs(c.y - a.y) < 0.01) {
      this.env.say(this.t('tl_msg_rect_narrow'));
      return;
    }
    const pts = this.rectCorners(c);
    // Decisão 0044: se qualquer um dos quatro lados cair em cima de uma parede existente, o retângulo inteiro é
    // recusado — nada é criado —, e o primeiro canto continua valendo para escolher outro canto oposto.
    const lados = [0, 1, 2, 3].map((i) => this.wallAt(pts[i]!, pts[(i + 1) % 4]!));
    if (lados.some((wall) => refuseWallOverlap(this.env, wall))) return;
    if (this.tiltRefused(lados)) return;
    this.env.transaction('Parede retangular', () => {
      for (const wall of lados) this.env.exec({ type: 'addWall', wall });
    });
    this.reset();
    this.env.say(this.t('tl_msg_rect_created'));
  }

  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    if (!this.startPt || !this.lastPoint || this.pointShape() || this.isRect()) return [];
    return [segmentLengthDim(this.startPt, this.lastPoint)];
  }

  override move(p: PointerInfo): void {
    this.lastPointer = p;
    if (this.pointShape()) {
      this.movePointShape(p);
      return;
    }
    if (this.isRect()) {
      this.moveRect(p);
      return;
    }
    const inf = this.snapWall(p, { from: this.chordEnd ?? this.startPt ?? undefined });
    this.lastPoint = inf.point;
    this.items = [];
    if (!this.startPt) {
      this.items.push({ kind: 'point', at: inf.point });
      this.env.say(this.hint);
      return;
    }
    const a = this.startPt;
    const { thickness, sMid } = this.band();
    if (this.chordEnd) {
      // Terceiro ponto: o arco passa pelo cursor.
      const sag = sagFromThreePoints(a, inf.point, this.chordEnd);
      this.items.push({ kind: 'wallBand', a, b: this.chordEnd, thickness, sMid, sag }, ...this.tiltTopItems(a, this.chordEnd));
      const arc = arcFromSagitta(a, this.chordEnd, sag);
      this.items.push({ kind: 'label', at: inf.point, text: arc ? `R ${fmt(unitsOf(this.env.project()), arc.radius)}  arco ${fmt(unitsOf(this.env.project()), arc.length)}` : 'reta' });
      this.env.say('Clique no ponto do arco, ou digite a flecha e Enter.');
      return;
    }
    const b = inf.point;
    const l = dist(a, b);
    if (l < 1e-6) return;
    this.items.push({ kind: 'wallBand', a, b, thickness, sMid }, ...this.tiltTopItems(a, b));
    const axis = norm(sub(b, a));
    const axisOffset = mul(v2(-axis.y, axis.x), sMid);
    this.items.push(...draftAngleItemsForConnection(this.env.project(), this.env.levelId(), viewPlanId(this.env), a, b, this.env.metersPerPixel(), unitsOf(this.env.project()), {
      a: add(a, axisOffset), b: add(b, axisOffset), thickness,
    }));
    // Trecho reto: a cota dinâmica (`tempDims`) é a única leitura, só comprimento — sem rótulo duplicado nem ângulo.
    this.env.say(this.isArc() ? 'Clique no ponto final da corda.' : 'Clique para terminar a parede, ou digite o comprimento e Enter.');
  }

  /**
   * Prévia da inclinação (F-D): a linha projetada do topo na planta (tracejada) e as ligações da base ao topo. Vazia sem
   * inclinação ou quando o topo vem de um pavimento (altura só conhecida depois).
   */
  private tiltTopItems(a: Vec2, b: Vec2): PreviewItem[] {
    const o = this.env.options();
    const tilt = o.wallTilt ?? 0;
    const len = dist(a, b);
    if (!tilt || o.wallTopLevelId || len < 1e-9) return [];
    const d = o.wallHeight * Math.tan((tilt * Math.PI) / 180); // = tiltOffset do motor: + = esquerda de a→b
    const off = mul(v2(-(b.y - a.y) / len, (b.x - a.x) / len), d);
    const ta = add(a, off);
    const tb = add(b, off);
    return [
      { kind: 'line', a: ta, b: tb, dashed: true },
      { kind: 'line', a, b: ta, dashed: true },
      { kind: 'line', a: b, b: tb, dashed: true },
    ];
  }

  /** Parede montada a partir do gesto (ainda fora do projeto), com as opções atuais da barra. */
  private wallAt(a: Vec2, b: Vec2, sag = 0): Omit<Wall, 'order'> {
    const o = this.env.options();
    return makeWall({
      id: makeId('w'),
      typeId: o.wallTypeId,
      levelId: this.env.levelId(),
      a,
      b,
      // Gravidade: só quando a barra não traz um deslocamento próprio (0 ou ausente).
      baseOffset: o.wallBaseOffset ? o.wallBaseOffset : (this.baseDoTerreno ?? 0),
      topLevelId: o.wallTopLevelId ?? null,
      topOffset: o.wallTopLevelId ? (o.wallTopOffset ?? 0) : 0,
      height: o.wallHeight,
      mark: o.placementMark ?? '',
      comments: o.placementComments ?? '',
      locationLine: o.locationLine,
      flipped: (o.wallFlipped ?? false) !== this.sideFlip(),
      sag,
      ...(o.wallTilt ? { tilt: o.wallTilt } : {}),
    });
  }

  /**
   * Motivo (traduzido, na barra de status) pelo qual alguma das paredes não aceita a inclinação da opção; a forma
   * ou a cadeia inteira é recusada, como na sobreposição. Sem inclinação, nunca recusa.
   */
  private tiltRefused(walls: Omit<Wall, 'order'>[]): boolean {
    const tilt = this.env.options().wallTilt ?? 0;
    if (tilt === 0) return false;
    for (const w of walls) {
      const motivo = wallTiltIssue(this.env.project(), w, tilt, this.uiLang());
      if (motivo) {
        this.env.say(motivo);
        return true;
      }
    }
    return false;
  }

  private commit(a: Vec2, b: Vec2, sag = 0): void {
    if (dist(a, b) < 0.01) return;
    const wall = this.wallAt(a, b, sag);
    // Decisão 0044: não cria parede em cima de outra (mesmo critério do aviso C14).
    if (refuseWallOverlap(this.env, wall)) return;
    if (this.tiltRefused([wall])) return;
    // A cadeia inteira (reta, arco ou inclinada) vira um só desfazer: a sessão junta os passos seguidos até reset().
    const session = (this.tiltSession ??= {});
    this.env.transaction('Criar parede', () => {
      this.env.exec({ type: 'addWall', wall });
    }, session);
    this.count += 1;
  }

  private finishSegment(end: Vec2): void {
    const closed = this.first && this.count >= 2 && dist(end, this.first) < 0.02;
    if (this.env.options().chain && !closed) {
      this.startPt = end;
      this.chordEnd = null;
    } else {
      this.reset();
      this.env.say(closed ? 'Circuito fechado.' : this.hint);
    }
    this.items = [];
  }

  override click(p: PointerInfo): void {
    if (this.pointShape()) {
      this.clickPointShape(p);
      return;
    }
    if (this.isRect()) {
      this.clickRect(p);
      return;
    }
    const inf = this.snapWall(p, { from: this.chordEnd ?? this.startPt ?? undefined });
    if (!this.startPt) {
      this.startPt = inf.point;
      this.first = inf.point;
      this.baseDoTerreno = deslocamentoDoTerreno(this.env, this.env.project(), this.env.levelId(), inf.point.x, inf.point.y);
      this.count = 0;
      return;
    }
    if (this.chordEnd) {
      const end = this.chordEnd;
      this.commit(this.startPt, end, sagFromThreePoints(this.startPt, inf.point, end));
      this.finishSegment(end);
      return;
    }
    const b = inf.point;
    if (this.isArc()) {
      if (dist(this.startPt, b) < 0.02) return;
      this.chordEnd = b;
      return;
    }
    this.commit(this.startPt, b);
    this.finishSegment(b);
  }

  override type(text: string): boolean {
    if (this.pointShape() || this.isRect() || !this.startPt) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null) {
      this.env.say(`Valor inválido. Digite um número em ${lengthUnitName(unitsOf(this.env.project()))}.`);
      return false;
    }
    if (this.chordEnd) {
      // Flecha digitada: o lado vem da posição do cursor em relação à corda.
      const a = this.startPt;
      const b = this.chordEnd;
      const ref = this.inf?.point ?? this.raw;
      const side = Math.sign((b.x - a.x) * (ref.y - a.y) - (b.y - a.y) * (ref.x - a.x)) || 1;
      this.commit(a, b, side * Math.abs(v));
      this.finishSegment(b);
      return true;
    }
    if (v <= 0) {
      this.env.say(`Valor inválido. Digite o comprimento em ${lengthUnitName(unitsOf(this.env.project()))}.`);
      return false;
    }
    const b = pontoPorComprimento(this.startPt, this.inf?.point ?? this.raw, v);
    if (this.isArc()) {
      this.chordEnd = b;
      return true;
    }
    this.commit(this.startPt, b);
    this.finishSegment(b);
    return true;
  }
}
