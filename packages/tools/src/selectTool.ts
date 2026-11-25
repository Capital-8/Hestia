/* eslint-disable max-lines -- seleção reúne alças, arrastes e as etiquetas de ambiente da vista (decisão 0039). */
import { add, boxOf, dist, dot, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { ceilingOutline, frameOfWall, pegadaDoComponente } from '@hestia/engine';
import {
  angularDimensionGeometry, areaPlanOf, beamPolygon, columnPolygon, findBeamType, findColumnType, findFootingType,
  footingPolygon, formatQuantity, isBeam, isCeiling, isColumn, isComponent, isFloor, isFooting, isGuardaCorpo, isOpening, isRamp,
  isRoof, isSlab, isStair, isWall, resolveViewProfile, unitsOf, type Id, type ProfileLayers, type Project,
  type ResolvedUnits, type SubelementoCortina,
} from '@hestia/model';
import { resolveAngularDimension } from '@hestia/engine';
import { cotaDeCorteCortina, proximoSubelemento, sNaParede, subelementoEmPonto, type ParedeSubelementos } from '@hestia/engine';
import { ToolBase, viewPlanId } from './base.ts';
import { ghostBands, ghostViews, moveWalls, selectedMovables, selectedOpenings, selectedViews, slideOpenings, transformViews } from './edit.ts';
import { componentAt, furnitureAt, componentIdsInBox, genericAt, idsInBox, pickAt, cadAt, cadIdsInBox, pickColumnAt, pickBeamAt, pickFootingAt, columnIdsInBox, beamIdsInBox, footingIdsInBox } from './pick.ts';
import { pickRailingAt, railingPolylines } from './railingPick.ts';
import { pickTerrenoAt, pickTerrenosInBox } from './terrainPick.ts';
import { registrarAlcasDaRegiao, removerVerticeDaRegiao } from './terrainRegionHandles.ts';
import { registrarAlcasDoLote, removerVerticeDoFocoDoLote } from './lotHandles.ts';
import { lotIdsInBox, pickLoteAt } from './lotPick.ts';
import { massIdsInBox, pickMassAt } from './massPick.ts';
import { massHandlePreview } from './massHandles.ts';
import { componentGhostItemsNasPoses } from './componentGhost.ts';
import { ArrastoComponentes, textoStatusArrastoComponentes, type ResultadoArrastoComponentes } from './componentDrag.ts';
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
import { gripHoldAt, annotationGripHoldAt, previasDeAlcas, ringHandlePreview, type GripFocus, type GripHold } from './selectGrips.ts';
import { pickStairAt, stairEndpoints, stairIdsInBox } from './stairPick.ts';
import { pickRampAt, rampEndpoints, rampIdsInBox } from './rampPick.ts';
import { annotationAt, annotationIdsInBox, detailItemAt, dimBodyAt, dimGripAt, dimTextGripAt, elementTagGripAt, overlayAnnotationAt, roomTagAt, roomTagIdsInBox, roomTagRing, signedOffset, spotGripAt, symbolGripAt, textAtAcompanhando, textGripAt, viewAnnotationsOf } from './annotationPick.ts';
import { itemDeTerrenoNoPonto, itensDeTerrenoNaJanela, geometriaDoItemDeTerreno } from './terrainItensPick.ts';
import { sectionMarkAt, sectionMarkIdsInBox } from './sectionMarkPick.ts';
import { DIM_MIN_LENGTH, dimensionGeometry, dimensionPoints, sectionPoints } from '@hestia/model';
import { gridGhosts, gridHandlePreview, gridIdsInBox, moveGrids, pickGridAt, selectedGrids } from './gridGeom.ts';
import { stairHandlePreview } from './stairGrips.ts';
import { stairFreeHandlePreview } from './stairFreeGrips.ts';
import { spiralHandlePreview } from './stairSpiralGrips.ts';
import { rampHandlePreview } from './rampGrips.ts';
import { bloqueadosNaVista, meioTomNaVista, ocultosNaVista, podeSelecionar, temNaoSelecionavel, type VisibilidadeEnv } from './visibilidade.ts';
import type { PointerInfo } from './types.ts';

// As alças de vértice da região de terreno entram na seleção (uma vez só; ver `terrainRegionHandles.ts`).
registrarAlcasDaRegiao();
// As alças de vértice do lote (mover, inserir e remover vértice) entram na seleção do mesmo jeito.
registrarAlcasDoLote();

type Mode = 'idle' | 'pending' | 'window' | 'grip' | 'dragwait' | 'moving' | 'opening' | 'dimgrip' | 'dimtext' | 'textmove' | 'tagmove' | 'eltagmove' | 'spotmove' | 'symbolmove';

/** Elemento sob o cursor: parede, abertura ou piso. */
interface AnyHit {
  id: Id;
  kind: 'wall' | 'door' | 'window' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'stair' | 'ramp' | 'railing' | 'mass' | 'terrain' | 'lot' | 'generic' | 'component' | 'roomSeparator' | 'room' | 'annotation' | 'view' | 'grid' | 'column' | 'beam' | 'footing';
}

const fmtLen = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/** Shift ou Ctrl (Cmd no Mac): o clique e a janela somam à seleção (Ctrl alterna quem já está selecionado). */
const soma = (p: PointerInfo): boolean => p.shift || p.ctrl;

/** Ids do conjunto do componente (o próprio id quando está solto). */
function membrosDoConjunto(p: Project, id: Id): Id[] {
  const e = p.elements[id];
  if (!isComponent(e) || e.groupId === undefined) return [id];
  return p.componentGroups?.[e.groupId]?.membros ?? [id];
}

/** Expande ids para os conjuntos inteiros tocados, sem repetir e mantendo a ordem de entrada. */
function expandirConjuntos(p: Project, ids: readonly Id[]): Id[] {
  const out: Id[] = [];
  const vistos = new Set<Id>();
  for (const id of ids) {
    for (const membro of membrosDoConjunto(p, id)) {
      if (vistos.has(membro)) continue;
      vistos.add(membro);
      out.push(membro);
    }
  }
  return out;
}

/**
 * Categorias de modelo: na planta de área elas só se selecionam (clique e janela). Arrasto, alças e fantasmas de mover
 * são de edição, e a planta de área é vista de análise/anotação. Anotação, vista e separador de ambiente não são modelo.
 */
const MODELO = new Set<AnyHit['kind']>(['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof', 'stair', 'ramp', 'railing', 'mass', 'terrain', 'lot', 'generic', 'component', 'room', 'grid', 'column', 'beam', 'footing']);
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
  /** Ids dos móveis do projeto, fora da captura durante o arrasto (mesmo gesto = mesmo conjunto). */
  private moveIgnore: { ignore: Set<Id> } | Record<string, never> = {};
  private hover: Id | null = null;
  private openingId: Id | null = null;
  /** Alça de deslocamento da cota selecionada (decisão 0019) e o deslocamento que ela assume ao soltar. */
  private dimGrip: Id | null = null;
  /** Arrasto pelo corpo da cota: só vale depois de passar da folga de 4 px (o clique simples não altera a cota). */
  private dimBody = false;
  private dimBodyMoved = false;
  private dimOffset: number | null = null;
  private dimTextGrip: Id | null = null;
  private dimTextAt: Vec2 | null = null;
  /** Texto selecionado cuja âncora foi pressionada: arrastar move o texto inteiro. */
  private textGrip: Id | null = null;
  private textAt: Vec2 | null = null;
  /** Etiqueta de ambiente (RoomTag) da vista pressionada: arrastar move a etiqueta (grava em RoomTag.at, só desta vista). */
  private tagGrip: Id | null = null;
  private tagAt: Vec2 | null = null;
  /** Cache do projeto sem os elementos que o perfil da vista oculta (planta de área). */
  private viewCache: { pr: Project; key: string; sets: readonly unknown[]; view: Project } | null = null;
  /** Arrasto de componentes da seleção, com o encaixe na parede/vizinho (criado no início do arrasto). */
  private compArrasto: ArrastoComponentes | null = null;
  /** Última prévia do arrasto de componentes: é ela que o `up` aplica. */
  private compPoses: ResultadoArrastoComponentes | null = null;
  /** Componente sob o cursor no `down`: o líder do movimento rígido. */
  private compLider: Id | null = null;

  /** Camadas do perfil da planta de área aberta (null na planta de piso, padrão ou de disciplina: tudo visível). */
  private layers(): ProfileLayers | null {
    const planId = this.areaPlanId();
    const plan = planId ? areaPlanOf(this.env.project(), planId) : undefined;
    return plan ? resolveViewProfile(plan).layers : null;
  }

  /**
   * Projeto "visto pela vista": sem as paredes, aberturas e pisos que o perfil oculta e sem o que não se seleciona
   * (oculto ou meio-tom), para que o hit-test e a janela não os selecionem (e não os deixem tapando o que está por
   * baixo). Planta de piso sem nada oculto/meio-tom: o próprio projeto.
   */
  private visibleProject(semBloqueio = false): Project {
    const pr = this.env.project();
    const ly = this.layers();
    const vista = this.vista(semBloqueio);
    const temFiltro = temNaoSelecionavel(vista);
    if (!temFiltro && (!ly || (ly.walls !== 'hidden' && ly.openings && ly.floors))) return pr;
    const key = `${ly?.walls ?? ''}|${ly?.openings ?? ''}|${ly?.floors ?? ''}`;
    // Ficha N3: com ocultos, meio-tom ou bloqueados (tubos e conexões de outra disciplina) a cópia filtrada também é guardada, enquanto o
    // projeto, as camadas e os TRÊS conjuntos da vista forem os mesmos objetos (a visibilidade é memoizada por projeto e vista).
    const conjuntos: readonly unknown[] = [ocultosNaVista(vista), meioTomNaVista(vista), bloqueadosNaVista(vista)];
    const c = this.viewCache;
    if (c && c.pr === pr && c.key === key && c.sets.length === conjuntos.length && c.sets.every((x, i) => x === conjuntos[i])) return c.view;
    const elements: Project['elements'] = {};
    for (const [id, e] of Object.entries(pr.elements)) {
      if (!podeSelecionar(vista, id, 'clique')) continue;
      if (ly?.walls === 'hidden' && isWall(e)) continue;
      if (ly && !ly.openings && isOpening(e)) continue;
      if (ly && !ly.floors && isFloor(e)) continue;
      elements[id] = e;
    }
    const view = { ...pr, elements };
    this.viewCache = { pr, key, sets: conjuntos, view };
    return view;
  }

  /**
   * Projeto para o hit-test de parede/abertura: as aberturas são indexadas pela parede hospedeira, então com as paredes
   * ocultas (ou em meio-tom) e as aberturas visíveis a parede continua no índice (o chamador descarta os acertos de
   * parede que não se selecionam).
   */
  private wallPickProject(semBloqueio = false): Project {
    const ly = this.layers();
    if (!ly || ly.walls !== 'hidden' || !ly.openings) return this.visibleProject(semBloqueio);
    const vista = this.vista(semBloqueio);
    const pr = this.env.project();
    const elements: Project['elements'] = {};
    for (const [id, e] of Object.entries(pr.elements)) {
      if (!podeSelecionar(vista, id, 'clique') && !isWall(e)) continue;
      if (!ly.floors && isFloor(e)) continue;
      elements[id] = e;
    }
    return { ...pr, elements };
  }

  /**
   * Planta dona das anotações da vista (planta de disciplina OU de área; ausente = planta de piso padrão): as anotações
   * e as alças dela são as da planta (decisão 0060 §5). Vem de `viewPlanId`, o único ponto que resolve isso.
   */
  private planId(): Id | undefined {
    return viewPlanId(this.env);
  }

  /** Planta de ÁREA aberta, quando é ela (planta de disciplina é de piso: edita o modelo como a padrão). */
  private areaPlanId(): Id | undefined {
    return this.env.areaPlanId?.() ?? undefined;
  }

  /**
   * Ambiente de visibilidade com os conjuntos lidos UMA vez: `podeSelecionar` é chamado por elemento e não pode
   * reconsultar a visibilidade da vista (que recalcula a ocultação a cada chamada).
   */
  private vista(semBloqueio = false): VisibilidadeEnv {
    const ocultos = ocultosNaVista(this.env);
    const meios = meioTomNaVista(this.env);
    if (semBloqueio) return { hiddenInView: () => ocultos, halftoneInView: () => meios };
    const bloqueados = bloqueadosNaVista(this.env);
    return { hiddenInView: () => ocultos, halftoneInView: () => meios, bloqueados: () => bloqueados };
  }

  /** Planta de área: elementos de modelo não se movem nem mostram alças (a vista é de análise/anotação). */
  private get somenteLeitura(): boolean {
    return this.areaPlanId() !== undefined;
  }

  /** Arrasto da alça da cota: o deslocamento é a distância do cursor à linha a–b, no lado do cursor. */
  private dragDimGrip(p: PointerInfo): void {
    const pr = this.env.project();
    const d = viewAnnotationsOf(pr, this.env.levelId(), this.planId()).dimensions.find((x) => x.id === this.dimGrip);
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
    this.dimBody = false;
    this.dimBodyMoved = false;
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
    this.compArrasto = null;
    this.compPoses = null;
    this.compLider = null;
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
  private hitAt(at: Vec2, semBloqueio = false): AnyHit | null {
    const pr = this.env.project();
    const lv = this.env.levelId();
    const mpp = this.env.metersPerPixel();
    const planId = this.planId();
    const ly = this.layers();
    const vista = this.vista(semBloqueio);
    const hidden = ocultosNaVista(vista);
    const sel = (id: Id): boolean => podeSelecionar(vista, id, 'clique');
    const vp = this.visibleProject(semBloqueio);
    const detail = detailItemAt(pr, lv, at, mpp, planId);
    if (detail && sel(detail)) return { id: detail, kind: 'annotation' };
    const overlay = overlayAnnotationAt(pr, lv, at, mpp, planId);
    if (overlay && sel(overlay)) return { id: overlay, kind: 'annotation' };
    // Cota de ponto e linha de rótulo de curva do terreno (planta de piso): anotações do terreno, por cima do modelo.
    const itemTn = this.areaPlanId() ? null : itemDeTerrenoNoPonto(pr, lv, at, mpp, hidden);
    if (itemTn && sel(itemTn)) return { id: itemTn, kind: 'annotation' };
    // Na planta de área as anotações são o alvo da vista e ficam por cima do modelo desenhado (paredes claras, piso,
    // ambiente): elas vêm antes do modelo para não ficarem inalcançáveis sob um ambiente. Na planta de piso a ordem
    // continua a de sempre (o elemento ganha da anotação).
    const areaId = this.areaPlanId();
    if (areaId) {
      const an = annotationAt(pr, lv, at, mpp, areaId);
      if (an && sel(an.id)) return { id: an.id, kind: 'annotation' };
      const rt = roomTagAt(pr, at, mpp, areaId);
      if (rt && sel(rt)) return { id: rt, kind: 'annotation' };
    }
    const hit = pickAt(this.wallPickProject(semBloqueio), lv, at, mpp, vista);
    if (hit && !(ly?.walls === 'hidden' && hit.kind === 'wall')) return hit;
    // Linha de separação de ambiente (guardada no nível, fora de project.elements): tem prioridade sobre piso, laje, forro,
    // telhado e escada que estejam embaixo dela, como no Revit. Parede e abertura continuam ganhando o clique.
    const rs = pickRoomSeparatorAt(pr, lv, at, mpp);
    if (rs && sel(rs.id)) return { id: rs.id, kind: 'roomSeparator' };
    // Grade (do projeto, fora de project.elements): acima de escada, piso e demais áreas; abaixo de parede e abertura.
    const gr = ly && !ly.grids ? null : pickGridAt(pr, at, mpp);
    if (gr && sel(gr)) return { id: gr, kind: 'grid' };
    // Desenho CAD importado: clicar na linha do DXF seleciona o desenho (Propriedades, ocultar, mover e excluir).
    const cd = cadAt(vp, lv, at, mpp, vista);
    if (cd) return { id: cd, kind: 'generic' };
    // Guarda-corpo (antes da escada e da rampa que o hospedam, que estão por baixo do desenho dele): a planta só o acha pelo caminho desenhado (manual) ou pelo gancho do hospedado; oculto não é alvo.
    const rl = pickRailingAt(vp, lv, at, mpp, hidden);
    if (rl && sel(rl)) return { id: rl, kind: 'railing' };
    const col = pickColumnAt(vp, lv, at, mpp);
    if (col) return { id: col, kind: 'column' };
    const bm = pickBeamAt(vp, lv, at, mpp);
    if (bm) return { id: bm, kind: 'beam' };
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
    const ft = pickFootingAt(vp, lv, at, mpp);
    if (ft) return { id: ft, kind: 'footing' };
    // Objeto importado (viga, pilar, mobiliário...): contorno em planta; abaixo de piso/laje/telhado e acima de ambiente.
    const gn = genericAt(vp, lv, at, mpp, vista);
    if (gn) return { id: gn, kind: 'generic' };
    // Terreno e região de terreno: pela borda, curva de nível ou contorno (o interior NÃO seleciona; A.8 item 7).
    const tn = pickTerrenoAt(pr, lv, at, 6 * mpp, hidden);
    if (tn && sel(tn)) return { id: tn, kind: 'terrain' };
    // Lote: pelo contorno (o interior NÃO seleciona; A.8 item 7).
    const lt = pickLoteAt(pr, lv, at, 6 * mpp, hidden);
    if (lt && sel(lt)) return { id: lt, kind: 'lot' };
    // Massa: o anel cortado do kernel (ou a base, sem kernel); o clique no piso, na laje, no telhado ou no objeto que estão sob ela continua ganhando (a massa é estudo volumétrico); vem antes do ambiente.
    const ms = pickMassAt(pr, lv, at, mpp, hidden);
    if (ms && sel(ms)) return { id: ms, kind: 'mass' };
    // Componente (móvel, louça, equipamento): pegada em planta, logo depois do genérico e antes do ambiente.
    const cp = componentAt(pr, lv, at, mpp, vista);
    if (cp) return { id: cp, kind: 'component' };
    const fu = furnitureAt(pr, lv, at, mpp, vista);
    if (fu) return { id: fu, kind: 'generic' };
    // Ambiente: por último entre os elementos de planta (o piso e a parede sob o cursor ganham o clique).
    const rm = pickRoomAt(vp, lv, at);
    if (rm) return { id: rm, kind: 'room' };
    // Cotas e textos de anotação (decisão 0019) e marcas de corte/elevação: por último, para não roubar o clique de um
    // elemento. A marca é uma anotação de primeira classe e também pode ser selecionada e transformada.
    const an = annotationAt(pr, lv, at, mpp, planId);
    if (an && sel(an.id)) return { id: an.id, kind: 'annotation' };
    const vm = ly && !ly.sectionMarks ? null : sectionMarkAt(pr, lv, at, mpp, planId);
    return vm && sel(vm) ? { id: vm, kind: 'view' } : null;
  }

  /**
   * Elemento bloqueado por disciplina sob o cursor, quando existe: o clique não seleciona e a barra avisa a quem ele
   * pertence. A detecção ignora o próprio bloqueio (senão o alvo sumiria do hit-test), mas mantém oculto e meio-tom.
   */
  private hitBloqueadoAt(at: Vec2): Id | null {
    const bloqueados = bloqueadosNaVista(this.env);
    if (bloqueados.size === 0) return null;
    const id = this.hitAt(at, true)?.id;
    return id && bloqueados.has(id) ? id : null;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    const pr = this.env.project();
    const hit = this.hitAt(p.raw);
    this.hover = hit?.id ?? null;
    this.items = this.hover ? [{ kind: 'highlight', ids: [this.hover] }] : [];
    const hg = hit?.kind === 'railing' ? pr.elements[hit.id] : undefined;
    if (hg && isGuardaCorpo(hg)) for (const pl of railingPolylines(pr, hg)) for (let i = 1; i < pl.length; i++) this.items.push({ kind: 'line', a: pl[i - 1]!, b: pl[i]!, dashed: true });
    // Na planta de área a alça de modelo nem aparece: sem prévia, o cursor não sinaliza uma edição que não existe.
    const semAlcaDeModelo = this.somenteLeitura && hit !== null && ehModelo(hit.kind);
    const grip = this.somenteLeitura
      ? (annotationGripHoldAt(this.env, p.raw) ?? (semAlcaDeModelo ? null : gripHoldAt(this.env, p.raw)))
      : gripHoldAt(this.env, p.raw);
    if (this.mode === 'idle') {
      // Etiqueta de ambiente da vista: o render não a conhece como elemento, então o realce vai como contorno.
      const rings = new Set([...(this.hover ? [this.hover] : []), ...this.env.selection()]);
      for (const id of rings) {
        const ring = roomTagRing(pr, id, this.areaPlanId());
        if (ring) this.items.push({ kind: 'polygon', ring, dashed: !this.env.selection().includes(id) });
        const gi = geometriaDoItemDeTerreno(pr, id);
        if (gi && 'ponto' in gi) {
          const r = 8 * this.env.metersPerPixel();
          const c = gi.ponto;
          this.items.push({ kind: 'polygon', ring: [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r }, { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }], dashed: !this.env.selection().includes(id) });
        } else if (gi) this.items.push({ kind: 'line', a: gi.a, b: gi.b, dashed: !this.env.selection().includes(id) });
      }
    }
    this.inf = grip ? { point: grip.at, kind: 'endpoint', guides: [] } : null;
    // Alças do piso, laje ou telhado selecionado: vértices, meio das arestas, foco e seta do caimento. Na planta de
    // área ficam só as alças do separador de ambiente (as de modelo não são desenhadas).
    if (this.mode === 'idle') {
      this.items.push(...ringHandlePreview(pr, this.env.selection(), this.focus, !this.somenteLeitura));
      for (const previa of previasDeAlcas) this.items.push(...previa(this.env));
      if (!this.somenteLeitura) this.items.push(...stairHandlePreview(pr, this.env.selection()), ...stairFreeHandlePreview(pr, this.env.selection()), ...spiralHandlePreview(pr, this.env.selection()), ...gridHandlePreview(pr, this.env.selection()), ...rampHandlePreview(pr, this.env.selection()), ...massHandlePreview(pr, this.env.selection()));
    }
    // Alça da cota selecionada: sob o cursor, a cota destaca-se (arrastar muda o deslocamento).
    const dgHover = this.mode === 'idle' ? dimGripAt(pr, this.env.levelId(), this.env.selection(), p.raw, this.env.metersPerPixel(), this.planId()) : null;
    if (dgHover) this.items.push({ kind: 'highlight', ids: [dgHover] });
  }

  /** A única seleção é uma parede (aberturas e pluralidades não entram na cota temporária). */
  private singleWall() {
    const sel = this.env.selection();
    if (sel.length !== 1) return null;
    const w = this.env.project().elements[sel[0]!];
    return isWall(w) ? w : null;
  }

  private singleBeam() {
    const sel = this.env.selection();
    if (sel.length !== 1) return null;
    const b = this.env.project().elements[sel[0]!];
    return isBeam(b) ? b : null;
  }

  override inputPrompt(): string | null {
    if (this.mode !== 'idle') return null;
    if (this.singleWall()) return this.t('tl_inp_wall_length');
    if (this.singleBeam()) return this.t('tl_inp_beam_length');
    return null;
  }

  /** Enter sem valor digitado: abre o campo de cota (a mensagem indica como digitar). */
  override confirm(): void {
    if (this.mode === 'idle' && (this.singleWall() || this.singleBeam())) {
      this.env.say(this.t('tl_msg_length_prompt', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) }));
      return;
    }
    super.confirm();
  }

  /** Digitar o comprimento: mantém a extremidade `a` e move `b` ao longo do eixo; para paredes, vizinhas em `b` acompanham. */
  override type(text: string): boolean {
    const w = this.singleWall();
    const beam = w ? null : this.singleBeam();
    if (!w && !beam) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null) {
      this.env.say(this.t('tl_msg_invalid_number', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) }));
      return false;
    }
    if (beam) {
      if (v < 0.05 || dist(beam.a, beam.b) < 1e-9) {
        this.env.say(this.t('tl_msg_beam_zero_length'));
        return false;
      }
      const nextB = add(beam.a, mul(norm(sub(beam.b, beam.a)), v));
      this.env.transaction('Alterar comprimento', () => {
        this.env.exec({ type: 'updateElements', ids: [beam.id], patch: { b: nextB } });
      });
      this.env.say(`Comprimento alterado para ${fmtLen(unitsOf(this.env.project()), v)}. Ctrl+Z desfaz.`);
      return true;
    }
    const r = resizeWallCommands(this.env.project(), this.env.levelId(), w!.id, v);
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
    // Vértice de região de terreno em foco: remove o vértice (a região mantém ao menos 3).
    if (this.focus) {
      const r = removerVerticeDaRegiao(this.env, this.focus);
      if (r !== null) {
        if (r) this.focus = r;
        return true;
      }
      // Vértice de lote em foco: remove o vértice e funde os dois lados (o lote mantém ao menos 3).
      const lt = removerVerticeDoFocoDoLote(this.env, this.focus);
      if (lt !== null) {
        if (lt) this.focus = lt;
        return true;
      }
    }
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

  /** Lista de subelementos da parede cortina que é a única seleção; `null` se a seleção não é uma cortina (ou não há kernel). */
  private subelementosDaCortinaSelecionada(): ParedeSubelementos | null {
    const sel = this.env.selection();
    if (sel.length !== 1 || !this.env.subelementos) return null;
    const pr = this.env.project();
    const w = pr.elements[sel[0]!];
    // A grade só existe para cortina: `subelementos` devolve null para qualquer outra parede.
    if (!isWall(w)) return null;
    return this.env.subelementos(w.id);
  }

  /**
   * Tab (ADR 0056, fase 2): com uma parede cortina selecionada, percorre parede → linha de grade → segmento → célula e volta à parede.
   * Shift+Tab volta a ordem. Sem cortina sozinha, não faz nada.
   */
  override tab(reverso?: boolean): void {
    if (this.mode !== 'idle' || !this.env.setSubelemento) return;
    const parede = this.subelementosDaCortinaSelecionada();
    if (!parede) return;
    this.env.setSubelemento(proximoSubelemento(parede, this.env.subelemento?.() ?? null, reverso === true));
  }

  /**
   * Clique sobre uma parede cortina que já é a única seleção: a linha ou a célula sob o cursor vira o subelemento (na planta, o corte da planta
   * define a altura; a tolerância é de seis pixels). Sem nada sob o cursor, `null` (a parede inteira).
   */
  private subelementoSobCursor(wallId: Id, at: Vec2): SubelementoCortina | null {
    const parede = this.env.subelementos?.(wallId) ?? null;
    if (!parede) return null;
    return subelementoEmPonto(parede, sNaParede(parede, at.x, at.y), cotaDeCorteCortina(this.env.project(), this.env.levelId()), 6 * this.env.metersPerPixel());
  }

  down(p: PointerInfo): void {
    const pr = this.env.project();
    const mpp = this.env.metersPerPixel();
    this.downPt = p.raw;
    this.moveBase = null;
    this.moveIgnore = {};
    // Elemento de outra disciplina (visível e normal): não seleciona nem arrasta; a barra diz a quem pertence.
    const bloqueado = this.hitBloqueadoAt(p.raw);
    if (bloqueado) {
      const msg = this.env.mensagemBloqueado?.(bloqueado);
      if (msg) this.env.say(msg);
      this.mode = 'idle';
      return;
    }
    const sel = this.env.selection();
    const planId = this.planId();
    const somenteLeitura = this.somenteLeitura;
    const hit = this.hitAt(p.raw);
    this.compLider = hit?.kind === 'component' ? hit.id : null;
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
    const dt = dimTextGripAt(pr, this.env.levelId(), sel, p.raw, mpp, planId);
    this.dimBody = false;
    this.dimBodyMoved = false;
    if (dt) { this.dimTextGrip = dt; this.dimTextAt = null; this.mode = 'dimtext'; return; }
    const dg = dimGripAt(pr, this.env.levelId(), sel, p.raw, mpp, planId);
    if (dg) { this.dimGrip = dg; this.dimOffset = null; this.mode = 'dimgrip'; return; }
    // Corpo da cota já selecionada: texto => como a alça do texto; linha/extensões => como a alça do afastamento.
    const body = dimBodyAt(pr, this.env.levelId(), sel, p.raw, mpp, planId);
    if (body) {
      this.dimBody = true;
      if (body.part === 'text') { this.dimTextGrip = body.id; this.dimTextAt = null; this.mode = 'dimtext'; } else { this.dimGrip = body.id; this.dimOffset = null; this.mode = 'dimgrip'; }
      return;
    }
    const tg = textGripAt(pr, this.env.levelId(), sel, p.raw, mpp, planId);
    if (tg) { this.textGrip = tg; this.textAt = null; this.mode = 'textmove'; return; }
    const etg = elementTagGripAt(pr, this.env.levelId(), sel, p.raw, mpp, planId);
    if (etg) { this.tagGrip = etg; this.tagAt = null; this.mode = 'eltagmove'; return; }
    const spg = spotGripAt(pr, this.env.levelId(), sel, p.raw, mpp, planId);
    if (spg) { this.tagGrip = spg; this.tagAt = null; this.mode = 'spotmove'; return; }
    const syg = symbolGripAt(pr, this.env.levelId(), sel, p.raw, mpp, planId);
    if (syg) { this.tagGrip = syg; this.tagAt = null; this.mode = 'symbolmove'; return; }
    const areaId = this.areaPlanId();
    const tagHit = areaId ? roomTagAt(pr, p.raw, mpp, areaId) : null;
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
    return !!detailItemAt(pr, this.env.levelId(), at, mpp, this.planId()) || !!annotationAt(pr, this.env.levelId(), at, mpp, this.planId());
  }

  drag(p: PointerInfo): void {
    const mpp = this.env.metersPerPixel();
    const moved = dist(p.raw, this.downPt) > 4 * mpp;
    const pr = this.env.project();
    if (this.mode === 'pending' && moved) this.mode = 'window';
    // Defesa extra: a planta de área nunca chega a `moving` (o `down` não entra em `dragwait` para modelo).
    if (this.mode === 'dragwait' && moved && !this.somenteLeitura) this.mode = 'moving';
    if (this.dimBody && (this.mode === 'dimgrip' || this.mode === 'dimtext')) {
      if (moved) this.dimBodyMoved = true;
      if (!this.dimBodyMoved) return;
    }
    this.items = [];
    if (this.mode === 'dimgrip') this.dragDimGrip(p);
    if (this.mode === 'dimtext') {
      this.dimTextAt = p.raw;
      const d = viewAnnotationsOf(pr, this.env.levelId(), this.planId()).dimensions.find((x) => x.id === this.dimTextGrip);
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
        const t = this.textGrip ? viewAnnotationsOf(pr, this.env.levelId(), this.planId()).texts.find((x) => x.id === this.textGrip) : undefined;
        if (!t) break;
        // A prévia mostra a âncora original e o ponto de destino; o modelo só muda ao soltar (um passo de desfazer).
        this.textAt = add(t.at, sub(p.raw, this.downPt));
        this.items.push({ kind: 'line', a: t.at, b: this.textAt, dashed: true }, { kind: 'point', at: this.textAt });
        break;
      }
      case 'eltagmove': {
        const t = this.tagGrip ? viewAnnotationsOf(pr, this.env.levelId(), this.planId()).tags.find((x) => x.id === this.tagGrip) : undefined;
        if (!t) break;
        this.tagAt = add(t.at, sub(p.raw, this.downPt));
        this.items.push({ kind: 'line', a: t.at, b: this.tagAt, dashed: true }, { kind: 'point', at: this.tagAt });
        break;
      }
      case 'spotmove': {
        const sp = this.tagGrip ? viewAnnotationsOf(pr, this.env.levelId(), this.planId()).spots.find((x) => x.id === this.tagGrip) : undefined;
        if (!sp) break;
        this.tagAt = add(sp.at, sub(p.raw, this.downPt));
        this.items.push({ kind: 'line', a: sp.target, b: this.tagAt, dashed: true }, { kind: 'point', at: this.tagAt });
        break;
      }
      case 'symbolmove': {
        const sy = this.tagGrip ? viewAnnotationsOf(pr, this.env.levelId(), this.planId()).symbols.find((x) => x.id === this.tagGrip) : undefined;
        if (!sy) break;
        this.tagAt = add(sy.at, sub(p.raw, this.downPt));
        this.items.push({ kind: 'line', a: sy.at, b: this.tagAt, dashed: true }, { kind: 'point', at: this.tagAt });
        break;
      }
      case 'tagmove': {
        const t = this.tagGrip ? areaPlanOf(pr, this.areaPlanId() ?? '')?.tags.find((x) => x.id === this.tagGrip) : undefined;
        if (!t) break;
        this.tagAt = add(t.at, sub(p.raw, this.downPt));
        const ring = roomTagRing(pr, t.id, this.areaPlanId(), this.tagAt);
        this.items.push({ kind: 'line', a: t.at, b: this.tagAt, dashed: true }, ...(ring ? [{ kind: 'polygon' as const, ring, dashed: true }] : []));
        break;
      }
      case 'grip': {
        if (this.hold) this.items.push(...this.hold.drag(p, (extra) => this.snap(p, extra).point));
        break;
      }
      case 'moving': {
        const sel = this.env.selection();
        const els = selectedMovables(pr, sel);
        const grids = selectedGrids(pr, sel);
        const comps = sel.filter((id) => isComponent(pr.elements[id]));
        // Sem `ignore`: arrastar uma escada/rampa também captura os vértices dela como base e destino.
        // Móveis fora da captura no arrasto: o deslocamento deles vem do encaixe de `ArrastoComponentes` (parede e vizinhos), e
        // os cantos dos móveis (inclusive os do próprio e os do conjunto) não podem puxar o cursor de quem se move.
        if (this.moveBase === null && comps.length > 0) this.moveIgnore = { ignore: new Set<Id>(Object.values(pr.elements).filter(isComponent).map((e) => e.id)) };
        const proprios = this.moveIgnore;
        this.moveBase ??= this.snap({ ...p, raw: this.downPt, shift: false }, proprios).point;
        const inf = this.snap(p, { from: this.moveBase, ...proprios });
        this.delta = sub(inf.point, this.moveBase);
        const t = { kind: 'translate' as const, d: this.delta };
        this.items.push(...ghostBands(pr, els, t), ...ghostViews(pr, sel, t), ...gridGhosts(pr, grids, this.delta));
        if (comps.length) {
          const resultado = this.calcularArrastoComponentes(pr, comps, p.alt);
          this.items.push(...componentGhostItemsNasPoses(pr, resultado.poses));
          this.env.say(textoStatusArrastoComponentes(pr, resultado));
        }
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
        const planId = this.planId();
        if (this.dimGrip && this.dimOffset !== null) {
          // O texto puxado pelo usuário (`textAt`) acompanha o afastamento, no MESMO comando (um só desfazer).
          const d = viewAnnotationsOf(pr, this.env.levelId(), planId).dimensions.find((x) => x.id === this.dimGrip);
          const pts = d && !d.angular ? dimensionPoints(pr, d) : null;
          const ta = pts && d ? textAtAcompanhando(pts.a, pts.b, d.offset, this.dimOffset, d.textAt) : undefined;
          this.env.exec({ type: 'updateDimension', levelId: this.env.levelId(), id: this.dimGrip, patch: ta ? { offset: this.dimOffset, textAt: ta } : { offset: this.dimOffset }, ...(planId ? { planId } : {}) });
        }
        break;
      }
      case 'dimtext': {
        const planId = this.planId();
        if (this.dimTextGrip && this.dimTextAt) this.env.exec({ type: 'updateDimension', levelId: this.env.levelId(), id: this.dimTextGrip, patch: { textAt: this.dimTextAt }, ...(planId ? { planId } : {}) });
        this.dimTextGrip = null;
        this.dimTextAt = null;
        break;
      }
      case 'textmove': {
        const planId = this.planId();
        if (this.textGrip && this.textAt) this.env.exec({ type: 'updateText', levelId: this.env.levelId(), id: this.textGrip, patch: { at: this.textAt }, ...(planId ? { planId } : {}) });
        this.textGrip = null;
        this.textAt = null;
        break;
      }
      case 'eltagmove': {
        const planId = this.planId();
        if (this.tagGrip && this.tagAt) this.env.exec({ type: 'updateTag', levelId: this.env.levelId(), id: this.tagGrip, patch: { at: this.tagAt }, ...(planId ? { planId } : {}) });
        this.tagGrip = null;
        this.tagAt = null;
        break;
      }
      case 'spotmove': {
        const planId = this.planId();
        if (this.tagGrip && this.tagAt) this.env.exec({ type: 'updateSpot', levelId: this.env.levelId(), id: this.tagGrip, patch: { at: this.tagAt }, ...(planId ? { planId } : {}) });
        this.tagGrip = null;
        this.tagAt = null;
        break;
      }
      case 'symbolmove': {
        const planId = this.planId();
        if (this.tagGrip && this.tagAt) this.env.exec({ type: 'updateSymbol', levelId: this.env.levelId(), id: this.tagGrip, patch: { at: this.tagAt }, ...(planId ? { planId } : {}) });
        this.tagGrip = null;
        this.tagAt = null;
        break;
      }
      case 'tagmove': {
        const planId = this.areaPlanId();
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
        const comps = sel.filter((id) => isComponent(pr.elements[id]));
        if ((els.length || views.length || grids.length || comps.length) && (this.delta.x || this.delta.y)) {
          // Decisão 0044: as setas também não deixam uma parede em cima de outra.
          if (els.length && refuseMoveOverlap(this.env, els, { kind: 'translate', d: this.delta })) break;
          if (els.length) moveWalls(this.env, els, this.delta, true, p.alt);
          if (views.length) transformViews(this.env, views, { kind: 'translate', d: this.delta });
          if (grids.length) this.env.transaction('Mover grade', () => moveGrids(this.env, grids, this.delta, false));
          if (comps.length && this.compPoses && this.compArrasto) this.compArrasto.aplicar(this.env, this.compPoses.poses);
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
        const vista = this.vista();
        const hidden = ocultosNaVista(vista);
        const ids = [
          ...idsInBox(this.wallPickProject(), this.env.levelId(), this.downPt, p.raw, vista).filter((id) => !(ly?.walls === 'hidden' && isWall(pr.elements[id]))),
          ...floorIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...slabIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...roofIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...massIdsInBox(pr, this.env.levelId(), this.downPt, p.raw, hidden),
          ...stairIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...rampIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...roomIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...pickTerrenosInBox(vp, this.env.levelId(), this.downPt, p.raw, hidden),
          ...lotIdsInBox(vp, this.env.levelId(), this.downPt, p.raw, hidden),
          ...cadIdsInBox(vp, this.env.levelId(), this.downPt, p.raw, vista),
          ...columnIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...beamIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...footingIdsInBox(vp, this.env.levelId(), this.downPt, p.raw),
          ...componentIdsInBox(pr, this.env.levelId(), this.downPt, p.raw, vista),
          ...(ly && !ly.grids ? [] : gridIdsInBox(pr, this.downPt, p.raw)),
          ...(ly && !ly.sectionMarks ? [] : sectionMarkIdsInBox(pr, this.env.levelId(), this.downPt, p.raw, this.planId())),
          ...roomTagIdsInBox(pr, this.downPt, p.raw, this.areaPlanId()),
          ...(this.areaPlanId() ? [] : itensDeTerrenoNaJanela(pr, this.env.levelId(), this.downPt, p.raw, hidden)),
          ...annotationIdsInBox(pr, this.env.levelId(), this.downPt, p.raw, this.env.metersPerPixel(), this.planId()),
        ].filter((id) => podeSelecionar(vista, id, 'caixa'));
        const cur = this.env.selection();
        const escolhidos = expandirConjuntos(pr, ids);
        this.env.setSelection(soma(p) ? [...new Set([...cur, ...escolhidos])] : escolhidos);
        break;
      }
      default:
        break;
    }
    if (mode === 'pending' || mode === 'dragwait' || (mode === 'opening' && !(this.delta.x || this.delta.y))) {
      const hit = this.hitAt(p.raw);
      const cur = this.env.selection();
      if (!hit) {
        if (!soma(p)) {
          this.env.setSelection([]);
          this.env.setSubelemento?.(null);
        }
      } else {
        // Componente de um conjunto seleciona o conjunto inteiro (os demais elementos: só o próprio id).
        const membros = membrosDoConjunto(pr, hit.id);
        if (soma(p)) {
          const todos = membros.every((id) => cur.includes(id));
          this.env.setSelection(todos ? cur.filter((x) => !membros.includes(x)) : [...cur, ...membros.filter((id) => !cur.includes(id))]);
          this.env.setSubelemento?.(null);
        } else {
          // Parede cortina já selecionada sozinha: o clique escolhe a linha ou a célula sob o cursor; sem nada, a parede inteira.
          const sub = membros.length === 1 && cur.length === 1 && cur[0] === hit.id && this.env.setSubelemento ? this.subelementoSobCursor(hit.id, p.raw) : null;
          this.env.setSelection(membros);
          this.env.setSubelemento?.(sub);
        }
      }
    }
    this.reset();
  }

  /**
   * Passo do arrasto de componentes: o líder é o componente sob o cursor (ou o primeiro da seleção) e os demais acompanham por
   * movimento rígido. O encaixe e o entorno são resolvidos uma única vez por gesto (`ArrastoComponentes`).
   */
  private calcularArrastoComponentes(pr: Project, comps: readonly Id[], alt: boolean): ResultadoArrastoComponentes {
    if (this.compArrasto === null) {
      const lider = this.compLider && comps.includes(this.compLider) ? this.compLider : comps[0]!;
      const ids = [lider, ...comps.filter((id) => id !== lider)];
      const c = pr.elements[lider];
      this.compArrasto = new ArrastoComponentes(pr, isComponent(c) ? c.levelId : this.env.levelId(), ids, lider);
    }
    const enc = this.env.opcoesEncaixe?.(alt) ?? { semEncaixe: alt, encaixeVizinho: true };
    const resultado = this.compArrasto.mover(this.delta, enc.semEncaixe, enc.encaixeVizinho);
    this.compPoses = resultado;
    return resultado;
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
      else if (isColumn(e)) pts.push(...columnPolygon(e, findColumnType(pr, e.typeId)));
      else if (isBeam(e)) pts.push(...beamPolygon(e, findBeamType(pr, e.typeId)));
      else if (isFooting(e)) pts.push(...footingPolygon(e, findFootingType(pr, e.typeId)));
      else if (isComponent(e)) {
        for (const poly of pegadaDoComponente(pr, e)) if (poly[0]) pts.push(...poly[0]);
      } else {
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
