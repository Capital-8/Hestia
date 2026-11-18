/* eslint-disable max-lines -- seleção reúne alças, arrastes e as etiquetas de ambiente da vista (decisão 0039). */
import { add, boxOf, dist, dot, sub, type Vec2 } from '@hestia/geom';
import { ceilingOutline, frameOfWall } from '@hestia/engine';
import { angularDimensionGeometry, formatQuantity, isCeiling, isFloor, isOpening, isRamp, isRoof, isSlab, isStair, isWall, hiddenIdsInView, planViewOf, unitsOf, viewProfileOf, visibleInView, type VisibilitySession, type Id, type ProfileLayers, type Project, type ResolvedUnits } from '@hestia/model';
import { resolveAngularDimension } from '@hestia/engine';
import { ToolBase } from './base.ts';
import { ghostBands, ghostViews, moveWalls, selectedMovables, selectedOpenings, selectedViews, slideOpenings, transformViews } from './edit.ts';
import { genericAt, idsInBox, pickAt, cadAt, cadIdsInBox } from './pick.ts';
import { floorIdsInBox, pickFloorAt, ringRemoveVertex } from './floorPick.ts';
import { pickRoomAt, roomIdsInBox } from './roomPick.ts';
import { pickRoomSeparatorAt } from './roomSeparatorPick.ts';
import { pickCeilingAt } from './ceilingPick.ts';
import { pickSlabAt, slabIdsInBox } from './slabPick.ts';
import { pickRoofAt, roofIdsInBox } from './roofPick.ts';
import { roofRingPatch } from './roofEdges.ts';
import { commitRoofPatch } from './roofCheck.ts';
import { commitCeilingBoundary, commitOutlineBoundary } from './outlineEdit.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import { resizeWallCommands } from './lengthEdit.ts';
import { execWithHostedLoss } from './hostedGuard.ts';
import { refuseMoveOverlap } from './wallOverlapGuard.ts';
import { gripHoldAt, annotationGripHoldAt, ringHandlePreview, type GripFocus, type GripHold } from './selectGrips.ts';
import { pickStairAt, stairEndpoints, stairIdsInBox } from './stairPick.ts';
import { pickRampAt, rampEndpoints, rampIdsInBox } from './rampPick.ts';
import { annotationAt, annotationIdsInBox, detailItemAt, dimGripAt, dimTextGripAt, roomTagAt, roomTagIdsInBox, roomTagRing, signedOffset, textGripAt, anotacoesSelecionaveis } from './annotationPick.ts';
import { sectionMarkAt, sectionMarkIdsInBox } from './sectionMarkPick.ts';
import { DIM_MIN_LENGTH, dimensionGeometry, dimensionPoints, sectionPoints } from '@hestia/model';
import { gridGhosts, gridHandlePreview, gridIdsInBox, moveGrids, pickGridAt, selectedGrids } from './gridGeom.ts';
import { stairHandlePreview } from './stairGrips.ts';
import { stairFreeHandlePreview } from './stairFreeGrips.ts';
import { spiralHandlePreview } from './stairSpiralGrips.ts';
import { rampHandlePreview } from './rampGrips.ts';
import type { PointerInfo } from './types.ts';
import { viewIdOfEnv } from './vistaDoAmbiente.ts';

type Mode = 'idle' | 'pending' | 'window' | 'grip' | 'dragwait' | 'moving' | 'opening' | 'dimgrip' | 'dimtext' | 'textmove' | 'tagmove';

/** Elemento sob o cursor: parede, abertura ou piso. */
interface AnyHit {
  id: Id;
  kind: 'wall' | 'door' | 'window' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'stair' | 'ramp' | 'generic' | 'roomSeparator' | 'room' | 'annotation' | 'view' | 'grid';
}

const fmtLen = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/** Shift ou Ctrl (Cmd no Mac): o clique e a janela somam à seleção (Ctrl alterna quem já está selecionado). */
const soma = (p: PointerInfo): boolean => p.shift || p.ctrl;

/**
 * Categorias de modelo: na planta de área elas só se selecionam (clique e janela). Arrasto, alças e fantasmas de mover
 * são de edição, e a planta de área é vista de análise/anotação. Anotação, vista e separador de ambiente não são modelo.
 */
const MODELO = new Set<AnyHit['kind']>(['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof', 'stair', 'ramp', 'generic', 'room', 'grid']);
const ehModelo = (kind: AnyHit['kind']): boolean => MODELO.has(kind);

export class SelectTool extends ToolBase {
  readonly id = 'select';
  readonly label = 'Selecionar';
  override get hint(): string {
    return this.t('tl_hint_select');
  }
  private mode: Mode = 'idle';
  private downPt: Vec2 = { x: 0, y: 0 };
  /** Alça pressionada (parede, piso, laje ou telhado); as alças em si estão em selectGrips.ts. */
  private hold: GripHold | null = null;
  /** Vértice de piso, laje ou telhado em foco (clicado com a alça): o Delete o remove. */
  private focus: GripFocus | null = null;
  private delta: Vec2 = { x: 0, y: 0 };
  /** Base capturada do arrasto direto (a mesma regra da ferramenta Mover): o deslocamento parte dela, não do clique cru. */
  private moveBase: Vec2 | null = null;
  private hover: Id | null = null;
  private openingId: Id | null = null;
  /** Alça de deslocamento da cota selecionada (decisão 0019) e o deslocamento que ela assume ao soltar. */
  private dimGrip: Id | null = null;
  private dimOffset: number | null = null;
  private dimTextGrip: Id | null = null;
  private dimTextAt: Vec2 | null = null;
  /** Texto selecionado cuja âncora foi pressionada: arrastar move o texto inteiro. */
  private textGrip: Id | null = null;
  private textAt: Vec2 | null = null;
  /** Etiqueta de ambiente (RoomTag) da vista pressionada: arrastar move a etiqueta (grava em RoomTag.at, só desta vista). */
  private tagGrip: Id | null = null;
  private tagAt: Vec2 | null = null;
  /** Cache dos ids que a vista esconde e dos projetos "vistos pela vista" (por projeto, vista e conjunto de fora do alcance). */
  private viewCache: { pr: Project; viewId: Id; fora: ReadonlySet<Id> | undefined; revealing: boolean; hidden: ReadonlySet<Id>; visible: Project | null; wallPick: Project | null } | null = null;

  /** Camadas do perfil da planta de área aberta (null na planta de piso: tudo visível). Só para o que não é elemento (grade, marca de corte). */
  private layers(): ProfileLayers | null {
    const planId = this.planId();
    const plan = planId ? planViewOf(this.env.project(), planId) : undefined;
    return plan ? viewProfileOf(this.env.project(), plan.id).layers : null;
  }

  /** Sessão de visibilidade da seleção: o alcance e o temporário que o ambiente informa em `hiddenInView`. */
  private session(): VisibilitySession {
    return { outOfRange: this.env.hiddenInView?.(), revealing: this.env.revealingHidden?.() === true };
  }

  private cache(): NonNullable<SelectTool['viewCache']> {
    const pr = this.env.project();
    const viewId = this.viewId();
    const fora = this.env.hiddenInView?.();
    const revealing = this.env.revealingHidden?.() === true;
    const c = this.viewCache;
    if (c && c.pr === pr && c.viewId === viewId && c.fora === fora && c.revealing === revealing) return c;
    const hidden = hiddenIdsInView(pr, viewId, Object.keys(pr.elements), { outOfRange: fora, revealing });
    return (this.viewCache = { pr, viewId, fora, revealing, hidden, visible: null, wallPick: null });
  }

  /** Elementos que a vista não mostra (regra única `visibleInView`): não são alvo de seleção. */
  private hiddenIds(): ReadonlySet<Id> {
    return this.cache().hidden;
  }

  /**
   * Projeto "visto pela vista": sem os elementos que ela não mostra (perfil, categoria, Hide in View, alcance), para que o
   * hit-test e a janela não os selecionem (e não os deixem tapando o que está por baixo).
   */
  private visibleProject(): Project {
    const c = this.cache();
    if (c.hidden.size === 0) return c.pr;
    if (c.visible) return c.visible;
    const elements: Project['elements'] = {};
    for (const [id, e] of Object.entries(c.pr.elements)) if (!c.hidden.has(id)) elements[id] = e;
    return (c.visible = { ...c.pr, elements });
  }

  /**
   * Projeto para o hit-test de parede/abertura: as aberturas são indexadas pela parede hospedeira, então uma parede oculta
   * que hospeda abertura visível continua no índice (o chamador descarta os acertos dessa parede via `hiddenIds`).
   */
  private wallPickProject(): Project {
    const c = this.cache();
    if (c.hidden.size === 0) return c.pr;
    if (c.wallPick) return c.wallPick;
    const hospedeiras = new Set<Id>();
    for (const e of Object.values(c.pr.elements)) if (isOpening(e) && !c.hidden.has(e.id)) hospedeiras.add(e.hostId);
    const elements: Project['elements'] = {};
    for (const [id, e] of Object.entries(c.pr.elements)) if (!c.hidden.has(id) || (isWall(e) && hospedeiras.has(id))) elements[id] = e;
    return (c.wallPick = { ...c.pr, elements });
  }

  /** Id da vista quando ela é uma planta de área (undefined em piso e cobertura): as etiquetas de ambiente e a leitura só-anotação são dela. */
  private planId(): Id | undefined {
    const id = this.viewId();
    return planViewOf(this.env.project(), id)?.kind === 'area' ? id : undefined;
  }

  /** Vista de planta exata (piso, cobertura ou área): é de onde saem as anotações selecionáveis e as alças. */
  private viewId(): Id {
    return viewIdOfEnv(this.env);
  }

  /** Destino dos comandos de edição de anotação: a vista exata. */
  private destino(): { viewId: Id } {
    return { viewId: this.viewId() };
  }

  /** Planta de área: elementos de modelo não se movem nem mostram alças (a vista é de análise/anotação). */
  private get somenteLeitura(): boolean {
    return this.planId() !== undefined;
  }

  /** Arrasto da alça da cota: o deslocamento é a distância do cursor à linha a–b, no lado do cursor. */
  private dragDimGrip(p: PointerInfo): void {
    const pr = this.env.project();
    const d = anotacoesSelecionaveis(pr, this.env.levelId(), this.viewId()).dimensions.find((x) => x.id === this.dimGrip);
    if (!d) return;
    const pts = dimensionPoints(pr, d);
    const off = signedOffset(pts.a, pts.b, p.raw);
    if (Math.abs(off) < DIM_MIN_LENGTH) return;
    this.dimOffset = off;
    const g = dimensionGeometry(pts.a, pts.b, off, this.env.metersPerPixel() * 4);
    this.items = [{ kind: 'line', a: g.line[0], b: g.line[1] }];
  }

  protected reset(): void {
    this.mode = 'idle';
    this.items = [];
    this.hold = null;
    this.delta = { x: 0, y: 0 };
    this.openingId = null;
    this.dimTextGrip = null;
    this.dimTextAt = null;
    this.textGrip = null;
    this.textAt = null;
    this.tagGrip = null;
    this.tagAt = null;
  }

  protected busy(): boolean {
    return this.mode !== 'idle';
  }

  override cancel(): void {
    this.focus = null;
    if (this.mode !== 'idle') this.reset();
    else if (this.env.selection().length) this.env.setSelection([]);
  }

  /** Parede, abertura ou piso sob o cursor (aberturas têm prioridade sobre a parede; a parede, sobre o piso). */
  private hitAt(at: Vec2): AnyHit | null {
    const pr = this.env.project();
    const lv = this.env.levelId();
    const mpp = this.env.metersPerPixel();
    const planId = this.planId();
    const ly = this.layers();
    const vp = this.visibleProject();
    const detail = detailItemAt(pr, lv, at, mpp, this.viewId(), this.session());
    if (detail) return { id: detail, kind: 'annotation' };
    // Na planta de área as anotações são o alvo da vista e ficam por cima do modelo desenhado (paredes claras, piso,
    // ambiente): elas vêm antes do modelo para não ficarem inalcançáveis sob um ambiente. Na planta de piso a ordem
    // continua a de sempre (o elemento ganha da anotação).
    if (planId) {
      const an = annotationAt(pr, lv, at, mpp, this.viewId(), this.session());
      if (an) return { id: an.id, kind: 'annotation' };
      const rt = roomTagAt(pr, at, mpp, planId);
      if (rt) return { id: rt, kind: 'annotation' };
    }
    const hit = pickAt(this.wallPickProject(), lv, at, mpp);
    if (hit && !(hit.kind === 'wall' && this.hiddenIds().has(hit.id))) return hit;
    // Linha de separação de ambiente (guardada no nível, fora de project.elements): tem prioridade sobre piso, laje, forro,
    // telhado e escada que estejam embaixo dela, como no Revit. Parede e abertura continuam ganhando o clique.
    const rs = pickRoomSeparatorAt(pr, lv, at, mpp);
    if (rs && visibleInView(pr, this.viewId(), rs.id, this.session())) return { id: rs.id, kind: 'roomSeparator' };
    // Grade (do projeto, fora de project.elements): acima de escada, piso e demais áreas; abaixo de parede e abertura.
    const gr = ly && !ly.grids ? null : pickGridAt(pr, at, mpp);
    if (gr) return { id: gr, kind: 'grid' };
    // Desenho CAD importado: clicar na linha do DXF seleciona o desenho (Propriedades, ocultar, mover e excluir).
    const cd = cadAt(vp, lv, at, mpp);
    if (cd) return { id: cd, kind: 'generic' };
    const st = pickStairAt(vp, lv, at, mpp);
    if (st) return { id: st, kind: 'stair' };
    const rp = pickRampAt(vp, lv, at, mpp);
    if (rp) return { id: rp, kind: 'ramp' };
    const f = pickFloorAt(vp, lv, at, mpp);
    if (f) return { id: f, kind: 'floor' };
    const sl = pickSlabAt(vp, lv, at, mpp);
    if (sl) return { id: sl, kind: 'slab' };
    const cl = pickCeilingAt(vp, lv, at, mpp);
    if (cl) return { id: cl, kind: 'ceiling' };
    const rf = pickRoofAt(vp, lv, at, mpp);
    if (rf) return { id: rf, kind: 'roof' };
    // Objeto importado (viga, pilar, mobiliário...): contorno em planta; abaixo de piso/laje/telhado e acima de ambiente.
    const gn = genericAt(vp, lv, at, mpp);
    if (gn) return { id: gn, kind: 'generic' };
    // Ambiente: por último entre os elementos de planta (o piso e a parede sob o cursor ganham o clique).
    const rm = pickRoomAt(vp, lv, at);
    if (rm) return { id: rm, kind: 'room' };
    // Cotas e textos de anotação (decisão 0019) e marcas de corte/elevação: por último, para não roubar o clique de um
    // elemento. A marca é uma anotação de primeira classe e também pode ser selecionada e transformada.
    const an = annotationAt(pr, lv, at, mpp, this.viewId(), this.session());
    if (an) return { id: an.id, kind: 'annotation' };
    const vm = ly && !ly.sectionMarks ? null : sectionMarkAt(pr, lv, at, mpp);
    return vm ? { id: vm, kind: 'view' } : null;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    const pr = this.env.project();
    const hit = this.hitAt(p.raw);
    this.hover = hit?.id ?? null;
    this.items = this.hover ? [{ kind: 'highlight', ids: [this.hover] }] : [];
    // Na planta de área a alça de modelo nem aparece: sem prévia, o cursor não sinaliza uma edição que não existe.
    const semAlcaDeModelo = this.somenteLeitura && hit !== null && ehModelo(hit.kind);
    const grip = this.somenteLeitura
      ? (annotationGripHoldAt(this.env, p.raw) ?? (semAlcaDeModelo ? null : gripHoldAt(this.env, p.raw)))
      : gripHoldAt(this.env, p.raw);
    if (this.mode === 'idle') {
      // Etiqueta de ambiente da vista: o render não a conhece como elemento, então o realce vai como contorno.
      const rings = new Set([...(this.hover ? [this.hover] : []), ...this.env.selection()]);
      for (const id of rings) {
        const ring = roomTagRing(pr, id, this.planId());
        if (ring) this.items.push({ kind: 'polygon', ring, dashed: !this.env.selection().includes(id) });
      }
    }
    this.inf = grip ? { point: grip.at, kind: 'endpoint', guides: [] } : null;
    // Alças do piso, laje ou telhado selecionado: vértices, meio das arestas, foco e seta do caimento. Na planta de
    // área ficam só as alças do separador de ambiente (as de modelo não são desenhadas).
    if (this.mode === 'idle') {
      this.items.push(...ringHandlePreview(pr, this.env.selection(), this.focus, !this.somenteLeitura));
      if (!this.somenteLeitura) this.items.push(...stairHandlePreview(pr, this.env.selection()), ...stairFreeHandlePreview(pr, this.env.selection()), ...spiralHandlePreview(pr, this.env.selection()), ...gridHandlePreview(pr, this.env.selection()), ...rampHandlePreview(pr, this.env.selection()));
    }
    // Alça da cota selecionada: sob o cursor, a cota destaca-se (arrastar muda o deslocamento).
    const dgHover = this.mode === 'idle' ? dimGripAt(pr, this.env.levelId(), this.env.selection(), p.raw, this.env.metersPerPixel(), this.viewId()) : null;
    if (dgHover) this.items.push({ kind: 'highlight', ids: [dgHover] });
  }

  /** A única seleção é uma parede (aberturas e pluralidades não entram na cota temporária). */
  private singleWall() {
    const sel = this.env.selection();
    if (sel.length !== 1) return null;
    const w = this.env.project().elements[sel[0]!];
    return isWall(w) ? w : null;
  }

  override inputPrompt(): string | null {
    if (this.mode !== 'idle') return null;
    if (!this.singleWall()) return null;
    return this.t('tl_inp_wall_length');
  }

  /** Enter sem valor digitado: abre o campo de cota (a mensagem indica como digitar). */
  override confirm(): void {
    if (this.mode === 'idle' && this.singleWall()) {
      this.env.say(this.t('tl_msg_length_prompt', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) }));
      return;
    }
    super.confirm();
  }

  /** Digitar o comprimento: mantém a extremidade `a` e move `b` ao longo do eixo; vizinhas em `b` acompanham. */
  override type(text: string): boolean {
    const w = this.singleWall();
    if (!w) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null) {
      this.env.say(this.t('tl_msg_invalid_number', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) }));
      return false;
    }
    const r = resizeWallCommands(this.env.project(), this.env.levelId(), w.id, v);
    if ('error' in r) {
      this.env.say(r.error);
      return false;
    }
    const result = execWithHostedLoss(this.env, 'Alterar comprimento', r.commands);
    if (result.status === 'cancelled') return true;
    if (result.status === 'pending') {
      this.env.say('Confirme o diálogo para aplicar o novo comprimento.');
      return true;
    }
    this.env.say(`Comprimento alterado para ${fmtLen(unitsOf(this.env.project()), v)}. Ctrl+Z desfaz.`);
    return true;
  }

  /** Delete com vértice de piso em foco: remove o vértice (mantendo ao menos 3). Senão, o Delete exclui a seleção. */
  deleteKey(): boolean {
    const pr = this.env.project();
    const f = this.focus ? pr.elements[this.focus.id] : undefined;
    const ring0 = f && (isFloor(f) || isSlab(f) || isRoof(f) || isCeiling(f)) ? (isCeiling(f) ? ceilingOutline(pr, f).boundary : f.boundary) : null;
    if (!this.focus || !f || ring0 === null || !this.env.selection().includes(f.id) || this.focus.index >= ring0.length) {
      this.focus = null;
      return false;
    }
    const ring = ringRemoveVertex(ring0, this.focus.index);
    if (!ring) {
      this.env.say(this.t(isSlab(f) ? 'tl_msg_min_vertices_slab' : isRoof(f) ? 'tl_msg_min_vertices_roof' : isCeiling(f) ? 'tl_msg_min_vertices_ceiling' : 'tl_msg_min_vertices_floor'));
      return true;
    }
    if (isRoof(f)) commitRoofPatch(this.env, [f.id], roofRingPatch(f, ring, { kind: 'remove', vertex: this.focus.index }), this.env.lang?.() ?? 'pt');
    else if (isCeiling(f)) commitCeilingBoundary(this.env, f.id, ring);
    else commitOutlineBoundary(this.env, f.id, ring);
    this.focus = { id: f.id, index: Math.min(this.focus.index, ring.length - 1) };
    this.env.say('Vértice removido. Ctrl+Z desfaz.');
    return true;
  }

  down(p: PointerInfo): void {
    const pr = this.env.project();
    const mpp = this.env.metersPerPixel();
    this.downPt = p.raw;
    this.moveBase = null;
    const sel = this.env.selection();
    const planId = this.planId();
    const somenteLeitura = this.somenteLeitura;
    const hit = this.hitAt(p.raw);
    // Na planta de área a alça de modelo não pega o clique (não existe alça desenhada); a do separador de ambiente,
    // que é anotação, continua. As alças de cota/texto são testadas logo abaixo, depois deste bloco.
    const hold = somenteLeitura
      ? (annotationGripHoldAt(this.env, p.raw) ?? (hit !== null && ehModelo(hit.kind) ? null : gripHoldAt(this.env, p.raw)))
      : gripHoldAt(this.env, p.raw);
    if (hold) {
      this.hold = hold;
      this.mode = 'grip';
      return;
    }
    const dt = dimTextGripAt(pr, this.env.levelId(), sel, p.raw, mpp, this.viewId());
    if (dt) { this.dimTextGrip = dt; this.dimTextAt = null; this.mode = 'dimtext'; return; }
    const dg = dimGripAt(pr, this.env.levelId(), sel, p.raw, mpp, this.viewId());
    if (dg) { this.dimGrip = dg; this.dimOffset = null; this.mode = 'dimgrip'; return; }
    const tg = textGripAt(pr, this.env.levelId(), sel, p.raw, mpp, this.viewId());
    if (tg) { this.textGrip = tg; this.textAt = null; this.mode = 'textmove'; return; }
    const tagHit = planId ? roomTagAt(pr, p.raw, mpp, planId) : null;
    if (tagHit && sel.includes(tagHit) && !this.annotationUnder(p.raw)) { this.tagGrip = tagHit; this.tagAt = null; this.mode = 'tagmove'; return; }
    // Linha de separação selecionada não se arrasta (não é movível pelo arrasto): o clique só (des)seleciona no soltar.
    if (hit && sel.includes(hit.id) && hit.kind !== 'roomSeparator') {
      // Na planta de área o modelo já selecionado fica em `pending`: o clique seleciona e o arrasto vira janela.
      if (somenteLeitura && ehModelo(hit.kind)) {
        this.mode = 'pending';
        return;
      }
      if (hit.kind === 'door' || hit.kind === 'window') {
        this.mode = 'opening';
        this.openingId = hit.id;
      } else this.mode = 'dragwait';
      return;
    }
    this.mode = 'pending';
  }

  /** Há cota/texto/detalhe da vista sob o ponto (têm prioridade sobre a etiqueta de ambiente). */
  private annotationUnder(at: Vec2): boolean {
    const pr = this.env.project();
    const mpp = this.env.metersPerPixel();
    return !!detailItemAt(pr, this.env.levelId(), at, mpp, this.viewId()) || !!annotationAt(pr, this.env.levelId(), at, mpp, this.viewId());
  }

  drag(p: PointerInfo): void {
    const mpp = this.env.metersPerPixel();
    const moved = dist(p.raw, this.downPt) > 4 * mpp;
    const pr = this.env.project();
    if (this.mode === 'pending' && moved) this.mode = 'window';
    // Defesa extra: a planta de área nunca chega a `moving` (o `down` não entra em `dragwait` para modelo).
    if (this.mode === 'dragwait' && moved && !this.somenteLeitura) this.mode = 'moving';
    this.items = [];
    if (this.mode === 'dimgrip') this.dragDimGrip(p);
    if (this.mode === 'dimtext') {
      this.dimTextAt = p.raw;
      const d = anotacoesSelecionaveis(pr, this.env.levelId(), this.viewId()).dimensions.find((x) => x.id === this.dimTextGrip);
      if (d) {
        if (d.angular) {
          const g = angularDimensionGeometry(resolveAngularDimension(pr, this.env.levelId(), d));
          if (g) this.items = [{ kind: 'line', a: g.textAt, b: p.raw, dashed: true }];
        } else {
          const pts = dimensionPoints(pr, d); const g = dimensionGeometry(pts.a, pts.b, d.offset, mpp * 4); this.items = [{ kind: 'line', a: { x: (g.line[0].x + g.line[1].x) / 2, y: (g.line[0].y + g.line[1].y) / 2 }, b: p.raw, dashed: true }];
        }
      }
    }
    switch (this.mode) {
      case 'window': {
        const a = this.downPt;
        const b = p.raw;
        this.items.push({ kind: 'polygon', dashed: b.x < a.x, ring: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] });
        break;
      }
      case 'textmove': {
        const t = this.textGrip ? anotacoesSelecionaveis(pr, this.env.levelId(), this.viewId()).texts.find((x) => x.id === this.textGrip) : undefined;
        if (!t) break;
        // A prévia mostra a âncora original e o ponto de destino; o modelo só muda ao soltar (um passo de desfazer).
        this.textAt = add(t.at, sub(p.raw, this.downPt));
        this.items.push({ kind: 'line', a: t.at, b: this.textAt, dashed: true }, { kind: 'point', at: this.textAt });
        break;
      }
      case 'tagmove': {
        const t = this.tagGrip ? planViewOf(pr, this.planId() ?? '')?.area?.tags.find((x) => x.id === this.tagGrip) : undefined;
        if (!t) break;
        this.tagAt = add(t.at, sub(p.raw, this.downPt));
        const ring = roomTagRing(pr, t.id, this.planId(), this.tagAt);
        this.items.push({ kind: 'line', a: t.at, b: this.tagAt, dashed: true }, ...(ring ? [{ kind: 'polygon' as const, ring, dashed: true }] : []));
        break;
      }
      case 'grip': {
        if (this.hold) this.items.push(...this.hold.drag(p, (extra) => this.snap(p, extra).point));
        break;
      }
      case 'moving': {
        const els = selectedMovables(pr, this.env.selection());
        const grids = selectedGrids(pr, this.env.selection());
        // Sem `ignore`: arrastar uma escada/rampa também captura os vértices dela como base e destino.
        this.moveBase ??= this.snap({ ...p, raw: this.downPt, shift: false }).point;
        const inf = this.snap(p, { from: this.moveBase });
        this.delta = sub(inf.point, this.moveBase);
        const t = { kind: 'translate' as const, d: this.delta };
        this.items.push(...ghostBands(pr, els, t), ...ghostViews(pr, this.env.selection(), t), ...gridGhosts(pr, grids, this.delta));
        break;
      }
      case 'opening': {
        const id = this.openingId;
        const o = id ? pr.elements[id] : undefined;
        if (!isOpening(o)) break;
        const f = frameOfWall(pr, o.hostId);
        if (!f) break;
        this.delta = { x: f.u.x * dot(sub(p.raw, this.downPt), f.u), y: f.u.y * dot(sub(p.raw, this.downPt), f.u) };
        this.items.push({ kind: 'highlight', ids: [o.id] });
        break;
      }
      default:
        break;
    }
  }

  up(p: PointerInfo): void {
    const pr = this.env.project();
    const mode = this.mode;
    const hold = this.hold;
    if (mode !== 'grip' || !hold?.keepsFocus) this.focus = null;
    switch (mode) {
      case 'grip': {
        hold?.release(p, (f) => {
          this.focus = f;
        });
        break;
      }
      case 'dimgrip': {
        if (this.dimGrip && this.dimOffset !== null) this.env.exec({ type: 'updateDimension', levelId: this.env.levelId(), id: this.dimGrip, patch: { offset: this.dimOffset }, ...this.destino() });
        break;
      }
      case 'dimtext': {
        if (this.dimTextGrip && this.dimTextAt) this.env.exec({ type: 'updateDimension', levelId: this.env.levelId(), id: this.dimTextGrip, patch: { textAt: this.dimTextAt }, ...this.destino() });
        this.dimTextGrip = null;
        this.dimTextAt = null;
        break;
      }
      case 'textmove': {
        if (this.textGrip && this.textAt) this.env.exec({ type: 'updateText', levelId: this.env.levelId(), id: this.textGrip, patch: { at: this.textAt }, ...this.destino() });
        this.textGrip = null;
        this.textAt = null;
        break;
      }
      case 'tagmove': {
        const planId = this.planId();
        if (this.tagGrip && this.tagAt && planId) this.env.exec({ type: 'updateRoomTag', planId, id: this.tagGrip, patch: { at: this.tagAt } });
        this.tagGrip = null;
        this.tagAt = null;
        break;
      }
      case 'moving': {
        const sel = this.env.selection();
        const els = selectedMovables(pr, sel);
        const views = selectedViews(pr, sel);
        const grids = selectedGrids(pr, sel);
        if ((els.length || views.length || grids.length) && (this.delta.x || this.delta.y)) {
          // Decisão 0044: as setas também não deixam uma parede em cima de outra.
          if (els.length && refuseMoveOverlap(this.env, els, { kind: 'translate', d: this.delta })) break;
          if (els.length) moveWalls(this.env, els, this.delta, true, p.alt);
          if (views.length) transformViews(this.env, views, { kind: 'translate', d: this.delta });
          if (grids.length) this.env.transaction('Mover grade', () => moveGrids(this.env, grids, this.delta, false));
        }
        break;
      }
      case 'opening': {
        if (this.openingId && (this.delta.x || this.delta.y)) slideOpenings(this.env, selectedOpenings(pr, [this.openingId]), this.delta);
        break;
      }
      case 'window': {
        const vp = this.visibleProject();
        const ly = this.layers();
        const ids = [
          ...idsInBox(this.wallPickProject(), this.env.levelId(), this.downPt, p.raw).filter((id) => !(isWall(pr.elements[id]) && this.hiddenIds().has(id))),
          ...floorIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...slabIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...roofIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...stairIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...rampIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...roomIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...cadIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...(ly && !ly.grids ? [] : gridIdsInBox(pr, this.downPt, p.raw)),
          ...(ly && !ly.sectionMarks ? [] : sectionMarkIdsInBox(pr, this.env.levelId(), this.downPt, p.raw)),
          ...roomTagIdsInBox(pr, this.downPt, p.raw, this.planId()),
          ...annotationIdsInBox(pr, this.env.levelId(), this.downPt, p.raw, this.env.metersPerPixel(), this.viewId(), this.session()),
        ];
        const cur = this.env.selection();
        this.env.setSelection(soma(p) ? [...new Set([...cur, ...ids])] : ids);
        break;
      }
      default:
        break;
    }
    if (mode === 'pending' || mode === 'dragwait' || (mode === 'opening' && !(this.delta.x || this.delta.y))) {
      const hit = this.hitAt(p.raw);
      const cur = this.env.selection();
      if (!hit) {
        if (!soma(p)) this.env.setSelection([]);
      } else if (soma(p)) {
        this.env.setSelection(cur.includes(hit.id) ? cur.filter((x) => x !== hit.id) : [...cur, hit.id]);
      } else {
        this.env.setSelection([hit.id]);
      }
    }
    this.reset();
  }

  /** Caixa envolvente da seleção, para zoom e dimensões. */
  selectionBox(): ReturnType<typeof boxOf> | null {
    const pr = this.env.project();
    const pts: Vec2[] = [];
    for (const id of this.env.selection()) {
      const e = pr.elements[id];
      if (isWall(e)) pts.push(e.a, e.b);
      else if (isStair(e)) pts.push(...stairEndpoints(e));
      else if (isRamp(e)) pts.push(...rampEndpoints(e));
      else if (isFloor(e) || isSlab(e) || isRoof(e)) pts.push(...e.boundary);
      else {
        const v = pr.views.find((x) => x.id === id);
        if (v) {
          const p = sectionPoints(pr, v);
          pts.push(p.a, p.b);
        }
      }
    }
    return pts.length ? boxOf(pts) : null;
  }
}
