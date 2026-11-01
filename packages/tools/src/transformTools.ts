/* eslint-disable max-lines -- Mover/Copiar/Girar/Espelhar compartilham a mesma base de seleção, prévia e aresta; dividir perderia a coesão do estado */
import { angleOf, dist, len, mul, norm, sub, v2, type Vec2 } from '@hestia/geom';
import { frameOfWall } from '@hestia/engine';
import { annotationIdsIn, annotationMoveCommands, dimensionSettingsOf, formatQuantity, isOpening, isRamp, isStair, isWall, unitsOf, type Id, type ResolvedUnits } from '@hestia/model';
import { ToolBase } from './base.ts';
import { gridGhosts, moveGrids, selectedGrids } from './gridGeom.ts';
import { ghostDimensions } from './dimGhost.ts';
import { copyWalls, ghostBands, ghostOpenings, ghostViews, moveWalls, selectedMovables, selectedOpenings, selectedViews, slideOpenings, transformViews, transformWalls } from './edit.ts';
import { refuseCopyOverlap, refuseMoveOverlap } from './wallOverlapGuard.ts';
import { pickAt } from './pick.ts';
import { parseQuantityText } from './numeric.ts';
import { commitRingEdit, edgeAtCursor, ringOfRef } from './ringTarget.ts';
import { ringOps } from './ringOps.ts';
import { moveRoomSeparators, movableSeparatorIds, separatorGhostItems } from './roomSeparatorPick.ts';
import type { EdgePick } from './ringEdge.ts';
import { DEFAULT_DISJOIN, type PointerInfo, type ToolEnv } from './types.ts';
import { componentEdgeAt, componentEdgeCurve, type ComponentEdgePick } from './componentEdge.ts';
import { moveComponentEdge } from './componentOps.ts';
import { moveEdge as moveComponentEdgeCommand } from './componentEdit.ts';
import { COMPONENT_MOVE_MSG, componentUnderCursor } from './componentTarget.ts';
import { displacementDimProvider } from './dims/providers/displacement.ts';
import type { DimRef, TempDim } from './dims/types.ts';

export const fmtM = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/** Rótulo do gesto de mover/copiar: distância e ângulo (direção do deslocamento em relação ao eixo X). */
export const fmtDisplacement = (u: ResolvedUnits, d: Vec2): string =>
  `${fmtM(u, len(d))} · ${formatQuantity(u, 'angle', angleOf(d))}`;

/** Base das ferramentas que exigem seleção prévia. */
export abstract class SelectionTool extends ToolBase {
  /** Paredes e pisos selecionados: entram em mover, copiar, girar, espelhar e matriz. */
  protected movables(): Id[] {
    return selectedMovables(this.env.project(), this.env.selection());
  }
  protected openings(): Id[] {
    return selectedOpenings(this.env.project(), this.env.selection());
  }
  /** Vistas de corte/elevação selecionadas: marcas de anotação também movem, copiam, giram e espelham. */
  protected views(): Id[] {
    return selectedViews(this.env.project(), this.env.selection());
  }
  protected hasSelection(): boolean {
    return this.movables().length + this.openings().length + this.views().length + annotationIdsIn(this.env.project(), this.env.levelId(), this.env.selection()).length + selectedGrids(this.env.project(), this.env.selection()).length > 0;
  }
  override start(): void {
    this.reset();
    if (!this.hasSelection()) {
      // Sair para Selecionar põe a dica dela na barra: o aviso vem depois, para não ser apagado.
      this.env.done();
      this.env.say(`${this.label}: selecione elementos antes (Selecionar) e escolha a ferramenta de novo.`);
      return;
    }
    this.env.say(this.hint);
  }
}

/** Mover e Copiar (modo `copy` repete até Esc). */
export class MoveTool extends SelectionTool {
  readonly id: 'move' | 'copy';
  readonly label: string;
  readonly hint: string;
  /** Dica quando não há seleção: a ferramenta espera um clique numa aresta de anel. */
  readonly edgeHint: string;
  private base: Vec2 | null = null;
  /** Última posição capturada do cursor (cota do deslocamento). */
  private cursor: Vec2 | null = null;
  /** Aresta escolhida no primeiro clique (só sem seleção). */
  private edgePick: EdgePick | null = null;
  /** Aresta do croqui de escada/rampa escolhida no primeiro clique (só sem seleção). */
  private compPick: ComponentEdgePick | null = null;
  /** Ponto de apoio da aresta do croqui (o ponto clicado, projetado nela). */
  private compBase: Vec2 | null = null;
  /** Chave da sessão: todas as cópias de um mesmo Copiar entram num só passo de desfazer. */
  private session: object = {};
  /** Quantas cópias a sessão já fez (Esc, com cópias feitas, encerra a sessão). */
  private copies = 0;
  /** Alt segurado: alterna o "Desconectar" na hora de confirmar o Mover (como no Archicad). */
  private alt = false;

  constructor(env: ToolEnv, private copy: boolean) {
    super(env);
    this.id = copy ? 'copy' : 'move';
    this.label = copy ? 'Copiar' : 'Mover';
    this.hint = `${this.label}: clique no ponto base e depois no destino, ou digite a distância.`;
    this.edgeHint = copy
      ? 'Copiar: selecione elementos (Selecionar) para copiar. Uma aresta sozinha ainda não pode ser copiada (nem de piso/laje, nem do croqui de escada/rampa).'
      : 'Mover: selecione elementos (Selecionar) ou clique numa aresta de piso, laje, telhado, forro ou do croqui de escada/rampa.';
  }

  protected override hasSelection(): boolean {
    return super.hasSelection() || movableSeparatorIds(this.env, this.copy).length > 0;
  }

  /** Sem seleção a ferramenta continua ativa, à espera de um clique em aresta. */
  override start(): void {
    this.reset();
    this.session = {};
    this.copies = 0;
    this.env.say(this.hasSelection() ? this.hint : this.edgeHint);
  }

  /**
   * Esc: em Copiar com cópias feitas, encerra a sessão de uma vez (o passo de desfazer já está gravado).
   * Sem cópias, Esc cancela o ponto-base; o próximo Esc sai para Modificar, como nas demais ferramentas.
   */
  override cancel(): void {
    if (this.copy && this.copies > 0) {
      this.reset();
      this.env.done();
      return;
    }
    super.cancel();
  }

  protected reset(): void {
    this.base = null;
    this.cursor = null;
    this.edgePick = null;
    this.compPick = null;
    this.compBase = null;
    this.items = [];
    this.inf = null;
  }
  protected busy(): boolean {
    return this.base !== null || this.compBase !== null;
  }
  override inputPrompt(): string | null {
    return this.base || this.compBase ? 'Distância' : null;
  }

  /** Sem seleção: mostra a aresta sob o cursor ou, depois do clique base, a aresta na posição de destino. */
  private edgeMove(p: PointerInfo): void {
    // Aresta do croqui de escada/rampa já escolhida: prévia do movimento da aresta.
    if (this.compPick && this.compBase) {
      const e = this.env.project().elements[this.compPick.ref.elementId];
      if (!isStair(e) && !isRamp(e)) return;
      const inf = this.snap(p, { from: this.compBase });
      this.cursor = inf.point;
      const d = sub(inf.point, this.compBase);
      const next = moveComponentEdge(e, this.compPick.ref, d);
      const curve = componentEdgeCurve(next, this.compPick.ref);
      if (!curve) return;
      this.items.push({ kind: 'line', a: this.compBase, b: inf.point, dashed: true });
      this.items.push({ kind: 'line', a: curve.a, b: curve.b, dashed: true });
      this.items.push({ kind: 'label', at: inf.point, text: fmtDisplacement(unitsOf(this.env.project()), d) });
      return;
    }
    if (!this.edgePick || !this.base) {
      const compEdge = componentEdgeAt(this.env, p.raw);
      if (compEdge) {
        this.items.push({ kind: 'highlight', ids: [compEdge.ref.elementId] }, { kind: 'line', a: compEdge.a, b: compEdge.b }, { kind: 'point', at: compEdge.at });
        return;
      }
      const comp = componentUnderCursor(this.env, p.raw);
      if (comp) {
        // Não cai na aresta de piso/laje embaixo: a escada/rampa tem aresta própria.
        this.items.push({ kind: 'highlight', ids: [comp.id] });
        return;
      }
      const pick = edgeAtCursor(this.env, p.raw);
      if (!pick) return;
      this.items.push({ kind: 'highlight', ids: [pick.ref.elementId] }, { kind: 'line', a: pick.a, b: pick.b }, { kind: 'point', at: pick.at });
      return;
    }
    const inf = this.snap(p, { from: this.base });
    this.cursor = inf.point;
    const d = sub(inf.point, this.base);
    const ring = ringOfRef(this.env.project(), this.edgePick.ref);
    if (!ring) return;
    const moved = ringOps.moveEdge(ring, this.edgePick.ref.index, d);
    const i = this.edgePick.ref.index;
    this.items.push({ kind: 'line', a: this.base, b: inf.point, dashed: true });
    this.items.push({ kind: 'line', a: moved[i]!, b: moved[(i + 1) % ring.length]!, dashed: true });
    this.items.push({ kind: 'label', at: inf.point, text: fmtDisplacement(unitsOf(this.env.project()), d) });
  }

  /** Move só a aresta pelo vetor d (Mover aresta). Copiar aresta não existe nesta versão. */
  private applyEdge(pick: EdgePick, d: Vec2): void {
    if (len(d) < 1e-6) return;
    const ring = ringOfRef(this.env.project(), pick.ref);
    if (!ring) return;
    this.env.transaction('Mover aresta', () => {
      commitRingEdit(this.env, pick.ref, ringOps.moveEdge(ring, pick.ref.index, d));
    });
  }

  /** Sem seleção: o primeiro clique numa aresta define a base; o segundo, o destino. Outro clique sai com a mensagem de seleção. */
  private edgeClick(p: PointerInfo): void {
    // Segundo clique de uma aresta de escada/rampa já escolhida: move a aresta e encerra.
    if (this.compPick && this.compBase) {
      const inf = this.snap(p, { from: this.compBase });
      const d = sub(inf.point, this.compBase);
      if (len(d) >= 1e-6) {
        const r = moveComponentEdgeCommand(this.env, this.compPick.ref, d);
        if (!r.ok) this.env.say(r.error);
      }
      this.reset();
      this.env.done();
      return;
    }
    const pick = this.edgePick;
    if (!pick || !this.base) {
      const compEdge = componentEdgeAt(this.env, p.raw);
      if (compEdge) {
        if (this.copy) {
          this.env.say('Copiar aresta: não permitido. A cópia sobreporia a linha ou deixaria o croqui aberto (como no Revit).');
          return;
        }
        this.compPick = compEdge;
        this.compBase = compEdge.at;
        return;
      }
      if (componentUnderCursor(this.env, p.raw)) {
        this.env.say(COMPONENT_MOVE_MSG);
        return;
      }
      const found = edgeAtCursor(this.env, p.raw);
      if (!found) {
        this.env.done();
        this.env.say(`${this.label}: selecione elementos antes (Selecionar) e escolha a ferramenta de novo.`);
        return;
      }
      if (this.copy) {
        this.env.say('Copiar aresta: não permitido. A cópia sobreporia a linha ou deixaria o croqui aberto (como no Revit).');
        return;
      }
      this.edgePick = found;
      this.base = found.at;
      return;
    }
    const inf = this.snap(p, { from: this.base });
    this.applyEdge(pick, sub(inf.point, this.base));
    this.reset();
    this.env.done();
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.alt = p.alt;
    if (!this.hasSelection()) {
      this.edgeMove(p);
      return;
    }
    const els = this.movables();
    // Sem `ignore`: os vértices do próprio elemento (escada/rampa inclusive) servem de ponto-base e de destino.
    const inf = this.snap(p, { from: this.base ?? undefined });
    this.cursor = inf.point;
    if (!this.base) {
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    const d = sub(inf.point, this.base);
    this.items.push({ kind: 'line', a: this.base, b: inf.point, dashed: true });
    const t = { kind: 'translate' as const, d };
    this.items.push(...ghostBands(this.env.project(), els, t), ...(this.copy ? [] : ghostDimensions(this.env.project(), this.env.levelId(), els, t, ((this.env.viewScale?.() ?? 100) / 1000))), ...ghostOpenings(this.env.project(), els, t), ...ghostViews(this.env.project(), this.env.selection(), t), ...gridGhosts(this.env.project(), selectedGrids(this.env.project(), this.env.selection()), d));
    if (!this.copy) this.items.push(...separatorGhostItems(this.env.project(), this.env.levelId(), movableSeparatorIds(this.env, this.copy), d));
    this.items.push({ kind: 'label', at: inf.point, text: fmtDisplacement(unitsOf(this.env.project()), d) });
  }

  /** Cota do deslocamento (ponto-base → cursor), pelo provedor do sistema único. */
  tempDims(overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    if (!this.base || !this.cursor) return [];
    const project = this.env.project();
    return displacementDimProvider.compute(
      { project, levelId: this.env.levelId(), settings: dimensionSettingsOf(project), overrides },
      { from: this.base, to: this.cursor },
    );
  }

  private apply(d: Vec2): void {
    if (len(d) < 1e-6) return;
    const els = this.movables();
    const views = this.views();
    const t = { kind: 'translate', d } as const;
    // Decisão 0044: mover/copiar não deixa parede em cima de parede; recusa com mensagem e o gesto pode ser refeito.
    if (this.copy ? refuseCopyOverlap(this.env, els, t) : refuseMoveOverlap(this.env, els, t)) {
      this.base = null; // recusa não deixa o ponto-base preso: o próximo clique recomeça
      return;
    }
    const seps = movableSeparatorIds(this.env, this.copy);
    // Cotas, textos (decisão 0019) e marcas de corte/elevação seguem a seleção e entram no mesmo passo de desfazer.
    const notes = annotationMoveCommands(this.env.project(), this.env.levelId(), this.env.selection(), d, this.copy);
    // Desconectar (opção ou Alt na confirmação): a parede se solta das vizinhas em vez de esticá-las.
    const disjoin = (this.env.options().moveDisjoin ?? DEFAULT_DISJOIN.move) !== this.alt;
    // Copiar: a sessão junta as cópias num só passo de desfazer; Mover segue num passo próprio.
    this.env.transaction(this.copy ? 'Copiar' : 'Mover', () => {
      if (this.copy) {
        if (els.length) copyWalls(this.env, els, t);
        if (views.length) transformViews(this.env, views, t, true);
      } else {
        if (els.length) moveWalls(this.env, els, d, !disjoin);
        else if (this.openings().length) slideOpenings(this.env, this.openings(), d);
        if (views.length) transformViews(this.env, views, t);
        if (seps.length) moveRoomSeparators(this.env, seps, d);
      }
      for (const c of notes) this.env.exec(c);
      // Grades são do projeto: movem ou copiam (nome automático novo) junto.
      moveGrids(this.env, selectedGrids(this.env.project(), this.env.selection()), d, this.copy);
    }, this.copy ? this.session : undefined);
    if (this.copy && (els.length || views.length)) this.copies += 1;
  }

  override click(p: PointerInfo): void {
    this.alt = p.alt;
    if (!this.hasSelection()) {
      this.edgeClick(p);
      return;
    }
    const inf = this.snap(p, { from: this.base ?? undefined });
    if (!this.base) {
      this.base = inf.point;
      return;
    }
    this.apply(sub(inf.point, this.base));
    if (this.copy) return; // várias cópias a partir da mesma base
    this.reset();
    this.env.done();
  }

  override type(text: string): boolean {
    const from = this.compBase ?? this.base;
    if (!from) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null) return false;
    const dir = norm(sub(this.inf?.point ?? this.raw, from));
    if (!this.hasSelection()) {
      const step = mul(len(dir) < 1e-9 ? v2(1, 0) : dir, v);
      if (this.compPick) {
        const r = moveComponentEdgeCommand(this.env, this.compPick.ref, step);
        if (!r.ok) this.env.say(r.error);
        this.reset();
        this.env.done();
        return true;
      }
      if (!this.edgePick) return false;
      this.applyEdge(this.edgePick, step);
      this.reset();
      this.env.done();
      return true;
    }
    this.apply(mul(len(dir) < 1e-9 ? v2(1, 0) : dir, v));
    if (!this.copy) {
      this.reset();
      this.env.done();
    }
    return true;
  }
}

export class RotateTool extends SelectionTool {
  readonly id = 'rotate';
  readonly label = 'Rotacionar';
  readonly hint = 'Rotacionar: clique no centro, depois na direção de referência e na direção final — ou digite o ângulo em graus.';
  private center: Vec2 | null = null;
  private ref: Vec2 | null = null;

  protected reset(): void {
    this.center = null;
    this.ref = null;
    this.items = [];
  }
  protected busy(): boolean {
    return this.center !== null;
  }
  override inputPrompt(): string | null {
    return this.center ? 'Ângulo (graus)' : null;
  }

  private angleTo(p: Vec2): number {
    if (!this.center) return 0;
    const a = angleOf(sub(p, this.center));
    const r = this.ref ? angleOf(sub(this.ref, this.center)) : 0;
    let d = a - r;
    // Passos de 15° quando próximo: o cursor "adivinha" ângulos úteis.
    const step = (15 * Math.PI) / 180;
    const snapped = Math.round(d / step) * step;
    if (Math.abs(d - snapped) < 0.05) d = snapped;
    return d;
  }

  override move(p: PointerInfo): void {
    this.items = [];
    const inf = this.snap(p, { from: this.center ?? undefined });
    if (!this.center) {
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    this.items.push({ kind: 'line', a: this.center, b: inf.point, dashed: true });
    if (this.ref) {
      const ang = this.angleTo(p.raw);
      const t = { kind: 'rotate', about: this.center, angle: ang } as const;
      this.items.push(...ghostBands(this.env.project(), this.movables(), t), ...ghostDimensions(this.env.project(), this.env.levelId(), this.movables(), t, ((this.env.viewScale?.() ?? 100) / 1000)), ...ghostOpenings(this.env.project(), this.movables(), t), ...ghostViews(this.env.project(), this.env.selection(), t));
      this.items.push({ kind: 'label', at: p.raw, text: formatQuantity(unitsOf(this.env.project()), 'angle', ang) });
    }
  }

  private commit(angle: number): void {
    if (!this.center || Math.abs(angle) < 1e-6) return;
    const els = this.movables();
    const views = this.views();
    const t = { kind: 'rotate', about: this.center, angle } as const;
    const copy = this.env.options().rotateCopy;
    const disjoin = this.env.options().rotateDisjoin ?? DEFAULT_DISJOIN.rotate;
    // Decisão 0044: girar (ou girar com cópia) não deixa parede em cima de parede.
    if (els.length && (copy ? refuseCopyOverlap(this.env, els, t) : refuseMoveOverlap(this.env, els, t))) {
      this.reset(); // recusa não deixa centro/referência presos
      return;
    }
    this.env.transaction(copy ? 'Rotacionar e copiar' : 'Rotacionar', () => {
      if (els.length) {
        if (copy) copyWalls(this.env, els, t);
        else transformWalls(this.env, els, t, 'Rotacionar', !disjoin);
      }
      if (views.length) transformViews(this.env, views, t, copy);
    });
    this.reset();
    this.env.done();
  }

  override click(p: PointerInfo): void {
    const inf = this.snap(p, { from: this.center ?? undefined });
    if (!this.center) {
      this.center = inf.point;
    } else if (!this.ref) {
      this.ref = inf.point;
    } else {
      this.commit(this.angleTo(inf.point));
    }
  }

  override type(text: string): boolean {
    if (!this.center) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'angle');
    if (v === null) return false;
    this.commit(v);
    return true;
  }
}

/**
 * Espelhar (Revit: Mirror - Pick Axis). Dois cliques definem o eixo; Tab alterna "Pegar parede":
 * o primeiro clique numa parede existente usa a linha a→b dela como eixo e espelha na hora.
 */
export class MirrorTool extends SelectionTool {
  readonly id = 'mirror';
  readonly label = 'Espelhar';
  readonly hint = 'Espelhar: clique em dois pontos para definir o eixo de simetria. Tab: pegar uma parede como eixo.';
  private p1: Vec2 | null = null;
  private pickAxis = false;

  protected reset(): void {
    this.p1 = null;
    this.items = [];
  }
  protected busy(): boolean {
    return this.p1 !== null;
  }

  override tab(): void {
    this.pickAxis = !this.pickAxis;
    this.reset();
    this.env.say(this.pickAxis ? 'Pegar parede: clique numa parede existente para usá-la como eixo.' : this.hint);
  }

  /** Parede sob o cursor (uma abertura conta como a parede que a hospeda). */
  private wallUnder(p: Vec2): Id | null {
    const pr = this.env.project();
    const hit = pickAt(pr, this.env.levelId(), p, this.env.metersPerPixel());
    if (!hit) return null;
    const e = pr.elements[hit.id];
    if (isWall(e)) return e.id;
    return isOpening(e) ? e.hostId : null;
  }

  override move(p: PointerInfo): void {
    this.items = [];
    if (this.pickAxis) {
      const id = this.wallUnder(p.raw);
      const f = id ? frameOfWall(this.env.project(), id) : null;
      if (!id || !f) return;
      this.items.push({ kind: 'highlight', ids: [id] });
      this.items.push({ kind: 'line', a: f.a, b: f.b, dashed: true });
      const t = { kind: 'mirror', a: f.a, b: f.b } as const;
      this.items.push(...ghostBands(this.env.project(), this.movables(), t), ...ghostDimensions(this.env.project(), this.env.levelId(), this.movables(), t, ((this.env.viewScale?.() ?? 100) / 1000)), ...ghostOpenings(this.env.project(), this.movables(), t), ...ghostViews(this.env.project(), this.env.selection(), t));
      return;
    }
    // O eixo enxerga a própria seleção: espelhar uma parede em torno da face dela (ou da linha de centro) é o uso
    // corrente. Os dois cliques são referência, não destino; nada se move até o segundo.
    const inf = this.snap(p, { from: this.p1 ?? undefined });
    if (!this.p1) {
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    this.items.push({ kind: 'line', a: this.p1, b: inf.point, dashed: true });
    if (dist(this.p1, inf.point) > 1e-6) {
      const t = { kind: 'mirror', a: this.p1, b: inf.point } as const;
      this.items.push(...ghostBands(this.env.project(), this.movables(), t), ...ghostDimensions(this.env.project(), this.env.levelId(), this.movables(), t, ((this.env.viewScale?.() ?? 100) / 1000)), ...ghostOpenings(this.env.project(), this.movables(), t), ...ghostViews(this.env.project(), this.env.selection(), t));
    }
  }

  /** Aplica o espelho pelo eixo a→b às paredes, com cópia se a opção estiver marcada. */
  private apply(a: Vec2, b: Vec2): void {
    const els = this.movables();
    const views = this.views();
    const t = { kind: 'mirror', a, b } as const;
    const copy = this.env.options().mirrorCopy;
    const disjoin = this.env.options().mirrorDisjoin ?? DEFAULT_DISJOIN.mirror;
    // Decisão 0044: espelhar (in-place ou com cópia) não deixa parede em cima de parede.
    if (copy ? refuseCopyOverlap(this.env, els, t) : refuseMoveOverlap(this.env, els, t)) {
      this.reset(); // recusa não deixa o primeiro ponto do eixo pela metade: o próximo gesto recomeça
      return;
    }
    this.env.transaction(copy ? 'Espelhar e copiar' : 'Espelhar', () => {
      if (els.length) {
        if (copy) copyWalls(this.env, els, t);
        else transformWalls(this.env, els, t, 'Espelhar', !disjoin);
      }
      if (views.length) transformViews(this.env, views, t, copy);
    });
    this.reset();
    this.env.done();
  }

  override click(p: PointerInfo): void {
    if (this.pickAxis) {
      const id = this.wallUnder(p.raw);
      const f = id ? frameOfWall(this.env.project(), id) : null;
      if (!f) {
        this.env.say('Clique numa parede para usá-la como eixo.');
        return;
      }
      if (dist(f.a, f.b) < 1e-4) return;
      this.apply(f.a, f.b);
      return;
    }
    const inf = this.snap(p, { from: this.p1 ?? undefined });
    if (!this.p1) {
      this.p1 = inf.point;
      return;
    }
    if (dist(this.p1, inf.point) < 1e-4) return;
    this.apply(this.p1, inf.point);
  }
}

