import { add, arcFromSagitta, cross, dist, mul, norm, sagFromThreePoints, sub, v2, type Vec2 } from '@hestia/geom';
import { exteriorOffset } from '@hestia/engine';
import { formatQuantity, makeWall, wallThicknessOf, unitsOf, type ResolvedUnits, type Wall } from '@hestia/model';
import { ToolBase, makeId } from './base.ts';
import { draftAngleItemsForConnection } from './anglePreview.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import type { InferContext } from './infer.ts';
import { pontoPorComprimento } from './desenhoPolilinha.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import type { PointerInfo } from './types.ts';
import { refuseWallOverlap } from './wallOverlapGuard.ts';

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
  private count = 0;
  private flip = false;
  private alignmentCycle = 0;
  private lastPointer: PointerInfo | null = null;
  private lastPoint: Vec2 | null = null;

  protected reset(): void {
    this.startPt = null;
    this.chordEnd = null;
    this.first = null;
    this.count = 0;
    this.items = [];
    this.inf = null;
    this.alignmentCycle = 0;
    this.lastPointer = null;
    this.lastPoint = null;
  }

  protected busy(): boolean {
    return this.startPt !== null;
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
    if (!this.startPt || this.isRect()) return null;
    return this.chordEnd ? 'Flecha do arco' : this.isArc() ? 'Comprimento da corda' : this.t('tl_inp_length');
  }

  override tab(): void {
    this.alignmentCycle += 1;
    if (this.lastPointer) this.move(this.lastPointer);
  }

  override space(): void {
    this.flip = !this.flip;
    if (this.lastPointer) this.move(this.lastPointer);
    this.env.say(this.sideFlip() ? this.t('tl_msg_wall_side_right') : 'Lado externo à esquerda do sentido de desenho.');
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
    for (let i = 0; i < 4; i++) this.items.push({ kind: 'wallBand', a: pts[i]!, b: pts[(i + 1) % 4]!, thickness, sMid });
    this.items.push({ kind: 'label', at: c, text: `${fmt(unitsOf(this.env.project()), Math.abs(c.x - a.x))} × ${fmt(unitsOf(this.env.project()), Math.abs(c.y - a.y))}` });
    this.env.say('Clique no canto oposto do retângulo.');
  }

  private clickRect(p: PointerInfo): void {
    const inf = this.snapWall(p);
    if (!this.startPt) {
      this.startPt = inf.point;
      this.first = inf.point;
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
    this.env.transaction('Parede retangular', () => {
      for (const wall of lados) this.env.exec({ type: 'addWall', wall });
    });
    this.reset();
    this.env.say(this.t('tl_msg_rect_created'));
  }

  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    if (!this.startPt || !this.lastPoint || this.isRect()) return [];
    return [segmentLengthDim(this.startPt, this.lastPoint)];
  }

  override move(p: PointerInfo): void {
    this.lastPointer = p;
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
      this.items.push({ kind: 'wallBand', a, b: this.chordEnd, thickness, sMid, sag });
      const arc = arcFromSagitta(a, this.chordEnd, sag);
      this.items.push({ kind: 'label', at: inf.point, text: arc ? `R ${fmt(unitsOf(this.env.project()), arc.radius)}  arco ${fmt(unitsOf(this.env.project()), arc.length)}` : 'reta' });
      this.env.say('Clique no ponto do arco, ou digite a flecha e Enter.');
      return;
    }
    const b = inf.point;
    const l = dist(a, b);
    if (l < 1e-6) return;
    this.items.push({ kind: 'wallBand', a, b, thickness, sMid });
    const axis = norm(sub(b, a));
    const axisOffset = mul(v2(-axis.y, axis.x), sMid);
    this.items.push(...draftAngleItemsForConnection(this.env.project(), this.env.levelId(), this.env.areaPlanId?.(), a, b, this.env.metersPerPixel(), unitsOf(this.env.project()), {
      a: add(a, axisOffset), b: add(b, axisOffset), thickness,
    }));
    // Trecho reto: a cota dinâmica (`tempDims`) é a única leitura, só comprimento — sem rótulo duplicado nem ângulo.
    this.env.say(this.isArc() ? 'Clique no ponto final da corda.' : 'Clique para terminar a parede, ou digite o comprimento e Enter.');
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
      baseOffset: o.wallBaseOffset ?? 0,
      topLevelId: o.wallTopLevelId ?? null,
      topOffset: o.wallTopLevelId ? (o.wallTopOffset ?? 0) : 0,
      height: o.wallHeight,
      mark: o.placementMark ?? '',
      comments: o.placementComments ?? '',
      locationLine: o.locationLine,
      flipped: (o.wallFlipped ?? false) !== this.sideFlip(),
      sag,
    });
  }

  private commit(a: Vec2, b: Vec2, sag = 0): void {
    if (dist(a, b) < 0.01) return;
    const wall = this.wallAt(a, b, sag);
    // Decisão 0044: não cria parede em cima de outra (mesmo critério do aviso C14).
    if (refuseWallOverlap(this.env, wall)) return;
    this.env.transaction('Criar parede', () => {
      this.env.exec({ type: 'addWall', wall });
    });
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
    if (this.isRect()) {
      this.clickRect(p);
      return;
    }
    const inf = this.snapWall(p, { from: this.chordEnd ?? this.startPt ?? undefined });
    if (!this.startPt) {
      this.startPt = inf.point;
      this.first = inf.point;
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
    if (this.isRect() || !this.startPt) return false;
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
