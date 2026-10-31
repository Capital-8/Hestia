import type { Vec2 } from '@hestia/geom';
import { formatQuantity, isStair, unitsOf, type Id, type StairCurve } from '@hestia/model';
import { distributeRisers } from '@hestia/engine';
import { ToolBase } from './base.ts';
import type { InferContext } from './infer.ts';
import { parseQuantityText } from './numeric.ts';
import { pickStairAt } from './stairPick.ts';
import { chainItems, curveItems, treadItems, type TreadPreviewContext } from './stairPreview.ts';
import {
  analyzeDraft,
  componentsFromParts,
  copyCurve,
  lastRun,
  missingText,
  partsFromComponents,
  runSketch,
  type DraftReport,
  type StairPart,
  type StairPrimitive,
  type StairSubmode,
  type StairToolOptions,
} from './stairSketchState.ts';
import { chainEnd, emptyStroke, strokeBusy, typedPoint } from './stairStroke.ts';
import { createStairFromComponents, draftStair, stairLimits, stairTypeId, updateStairComponents, type StairCreateOptions } from './stairCommands.ts';
import { clearActive, closeCurrent, cloneParts, drawPoint, partPoints, pickInto, snapToBoundary, undoStroke, type DrawState, type PickOp } from './stairDraw.ts';
import { chainAt, leftSide, nearestPickLine, offsetChain, PICK_PX, pickLinesOf } from './stairPickLines.ts';
import { discardSpiralOnEdit } from './stairSpiralRun.ts';
import { activeTone, buildItems, hintText, warningText } from './stairView.ts';
import { connectedLineAt, draftAngleItemsForConnection, draftAngleItemsForPrevious } from './anglePreview.ts';
import { DEFAULT_SNAP, type PointerInfo, type PreviewItem, type Tool } from './types.ts';

const HINT = 'Escada: desenhe o limite esquerdo; Enter passa ao direito e outro Enter vai a Espelhos. Esc cancela a cadeia; outro Esc descarta o croqui.';

/**
 * Mensagem de Concluir (Enter nos espelhos faz o mesmo): com espelhos faltando, diz a conta e como completar. Concluir
 * não bloqueia (há croquis parciais de propósito), então o aviso tem de bater com o que foi criado.
 */
const concluirText = (rep: DraftReport, base: 'Escada criada' | 'Croqui atualizado'): string => {
  if (!missingText(rep)) return `${base}${base === 'Escada criada' ? `: ${rep.created} espelhos` : ''}. `;
  return `${base} com ${rep.created} de ${rep.desired} espelhos: faltam ${rep.remaining} para chegar ao nível de cima. Edite o croqui para completar. `;
};

/** Estado do croqui para a interface: a análise, o contador, o sub-modo e "Pegar linhas". */
export interface StairStatus extends DraftReport {
  submode: StairSubmode;
  primitive: StairPrimitive;
  /** Edita o croqui de uma escada existente (Concluir faz `updateElements`). */
  editing: boolean;
  typeId: Id | null;
  phase: 'left' | 'right';
  /** "Pegar linhas" ligado: o clique pega a linha sob o cursor em vez de desenhar. */
  picking: boolean;
}

/** O que está sob o cursor em "Pegar linhas": as curvas destacadas, o resultado já deslocado e o rótulo. */
interface PickHit {
  sources: StairCurve[];
  result: StairCurve[] | null;
  label: string;
}

/**
 * Escada por croqui (Revit: Stair > Run > Create Sketch; decisão 0011). Sub-modos: limites (esquerdo, direito), espelhos
 * (linhas soltas), caminhada (opcional), patamar (laço fechado) e concluir. A análise roda a cada mudança: o 1º erro vai
 * para a barra de status, e o contador "criados / restantes" vai ao cursor. Concluir grava UMA escada (ou atualiza a
 * existente) e só se não houver erro de croqui. Ativar a ferramenta com UMA escada selecionada, ou clicar numa, entra em
 * edição do croqui dela. O desenho (cliques, Enter, apagar) fica em `stairDraw.ts`; a prévia, em `stairView.ts`.
 *
 * "Pegar linhas" (Revit: Pick Lines, docs/paridade A8) é um método de desenho sobre o sub-modo atual: o clique pega a
 * linha sob o cursor (parede pelo eixo/faces/núcleo conforme a captura, linha de escada, aresta de laje ou piso), desloca
 * pelo campo "Deslocamento" e a põe na cadeia em curso (limites, caminhada) ou como espelho. "Corrente" pega a cadeia
 * conectada inteira. Pegar não valida: o erro vem de `analyzeDraft` como no desenho.
 */
export class StairTool extends ToolBase {
  readonly id = 'stair';
  readonly label = 'Escada por croqui';
  readonly hint = HINT;
  private st: DrawState = { submode: 'limites', phase: 'left', parts: [], stroke: emptyStroke('line'), pick: false };
  /** Croqui ao entrar na edição (Esc descarta o que foi feito desde então). */
  private original: StairPart[] = [];
  private stairId: Id | null = null;
  private report: DraftReport = analyzeDraft([], null);
  private treads: PreviewItem[] = [];
  private cursor: Vec2 = { x: 0, y: 0 };
  /** Último ponto do cursor (cru): a pegada e a prévia são por linha, não por snap. */
  private pickRaw: Vec2 = { x: 0, y: 0 };
  private pickItems: PreviewItem[] = [];
  /** Pegadas feitas desde a última ação de desenho (Delete e Ctrl+Z desfazem a última; Ctrl+Y refaz). */
  private picks: PickOp[] = [];
  private picksRedo: PickOp[] = [];

  private get opts(): StairToolOptions {
    return this.env.options().stair ?? {};
  }

  override start(): void {
    this.st = { submode: 'limites', phase: 'left', parts: [], stroke: emptyStroke(this.opts.primitive ?? 'line'), pick: false };
    if (this.opts.submode && this.opts.submode !== 'concluir') this.st.submode = this.opts.submode;
    this.clearPicks();
    const sel = this.env.selection();
    const p = this.env.project();
    const stairs = sel.filter((id) => isStair(p.elements[id]));
    if (sel.length === 1 && stairs.length === 1) this.load(stairs[0]!);
    else this.loadNew();
    this.refresh();
    this.note(this.stairId ? 'Editando o croqui da escada. Concluir grava; Esc descarta as mudanças.' : undefined);
  }

  protected reset(): void {
    this.st.stroke = emptyStroke(this.st.stroke.prim);
    this.items = [];
  }

  protected busy(): boolean {
    return strokeBusy(this.st.stroke);
  }

  /** Estado para a interface (contador, erros, sub-modo, edição, "Pegar linhas"). */
  status(): StairStatus {
    const p = this.env.project();
    const stair = this.stairId ? p.elements[this.stairId] : undefined;
    const typeId = isStair(stair) ? stair.typeId : stairTypeId(p, this.opts.typeId);
    return {
      ...this.report,
      submode: this.st.submode,
      primitive: this.st.stroke.prim,
      editing: this.stairId !== null,
      typeId,
      phase: this.st.phase,
      picking: this.st.pick,
    };
  }

  /** Troca o sub-modo. Muda de sub-modo descarta o traçado em curso (não o croqui). Patamar não pega linhas. */
  setSubmode(m: StairSubmode): void {
    if (m === 'concluir') {
      this.finish();
      return;
    }
    this.st.submode = m;
    if (m === 'limites') this.st.phase = 'left';
    if (m === 'patamar') this.st.pick = false;
    this.st.stroke = emptyStroke(this.st.stroke.prim);
    this.clearPicks();
    this.refresh();
    this.note();
  }

  /**
   * Troca a primitiva (linha ou arco) e sai de "Pegar linhas": é a escolha de método de desenho. A cadeia já fechada
   * fica; o traçado em curso se perde.
   */
  setPrimitive(prim: StairPrimitive): void {
    this.st.pick = false;
    this.st.stroke = { ...emptyStroke(prim), chain: this.st.stroke.chain, last: chainEnd(this.st.stroke) };
    this.refresh();
    this.note(`Primitiva: ${prim === 'line' ? 'linha' : 'arco (início, fim, flecha)'}.`);
  }

  /**
   * Liga ou desliga "Pegar linhas" sobre o sub-modo atual. Vale para limites, espelhos e caminhada; no patamar não há o
   * que pegar. Desligar mantém o traçado em curso.
   */
  setPick(on: boolean): void {
    if (on && this.st.submode === 'patamar') {
      this.env.say('Pegar linhas vale para limites, espelhos e caminhada.');
      return;
    }
    this.st.pick = on;
    this.inf = null;
    this.refresh();
    this.note();
  }

  /** "Distribuir N espelhos": espelhos igualmente espaçados entre os limites do lance atual (N da barra de opções). */
  distribute(): void {
    const run = lastRun(this.st.parts);
    if (!run || run.boundaryLeft.length === 0 || run.boundaryRight.length === 0) {
      this.env.say('Desenhe os limites do lance antes de distribuir os espelhos.');
      return;
    }
    const n = Math.floor(this.opts.distributeCount ?? this.report.desired);
    if (!(n >= 1)) {
      this.env.say('Informe o nº de espelhos (N) na barra de opções.');
      return;
    }
    run.risers = distributeRisers(runSketch(run), n).map(copyCurve);
    this.clearPicks();
    this.refresh();
    this.note(`${n} espelhos distribuídos entre os limites. Revise e conclua.`);
  }

  /** Apaga a camada do sub-modo atual (limite do lado em desenho, espelhos, caminhada ou o último patamar). */
  clearLayer(): boolean {
    const ok = clearActive(this.st);
    this.clearPicks();
    this.refresh();
    if (ok) this.note('Camada apagada. Redesenhe-a.');
    return ok;
  }

  override move(p: PointerInfo): void {
    this.pickRaw = p.raw;
    if (this.st.pick) {
      this.inf = null;
      this.cursor = p.raw;
      this.pickItems = this.pickPreview();
    } else {
      const inf = this.snap(p, this.snapExtra());
      // Espelho: a prévia já mostra o ponto no limite (o mesmo que o clique vai gravar).
      this.cursor = this.st.submode === 'espelhos' ? snapToBoundary(lastRun(this.st.parts), inf.point) : inf.point;
      this.pickItems = [];
    }
    this.items = buildItems(this.st, this.cursor, this.treads, this.report, this.pickItems);
    const last = this.st.stroke.chain[this.st.stroke.chain.length - 1];
    const joint = this.st.stroke.last;
    if (!this.st.pick && this.st.stroke.prim === 'line' && joint) {
      const prev = last ? { a: last.a, b: last.b } : connectedLineAt(this.env.project(), this.env.levelId(), joint, this.env.metersPerPixel(), null);
      this.items.push(...(last
        ? draftAngleItemsForPrevious(prev, joint, this.cursor, this.env.metersPerPixel(), unitsOf(this.env.project()))
        : draftAngleItemsForConnection(this.env.project(), this.env.levelId(), null, joint, this.cursor, this.env.metersPerPixel(), unitsOf(this.env.project()))));
    }
  }

  override click(p: PointerInfo): void {
    if (this.st.pick) {
      this.pickAtCursor(p.raw);
      return;
    }
    const inf = this.snap(p, this.snapExtra());
    this.cursor = inf.point;
    if (this.st.submode === 'concluir') return;
    // Clicar numa escada, sem croqui em andamento, entra na edição dela.
    if (this.st.parts.length === 0 && !strokeBusy(this.st.stroke) && this.st.submode === 'limites') {
      const hit = pickStairAt(this.env.project(), this.env.levelId(), p.raw, this.env.metersPerPixel());
      if (hit) {
        this.load(hit);
        this.refresh();
        this.note('Editando o croqui da escada. Concluir grava; Esc descarta as mudanças.');
        return;
      }
    }
    this.drawAt(inf.point);
  }

  override type(text: string): boolean {
    if (this.st.pick) return false;
    const from = this.st.stroke.last;
    if (this.st.stroke.prim !== 'line' || from === null || this.st.submode === 'concluir') return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null || v <= 0) {
      this.env.say('Valor inválido. Digite o comprimento em metros.');
      return false;
    }
    this.drawAt(typedPoint(from, this.cursor, v));
    return true;
  }

  override inputPrompt(): string | null {
    if (this.st.pick) return null;
    return this.st.submode !== 'concluir' && this.st.stroke.prim === 'line' && this.st.stroke.last !== null ? 'Comprimento' : null;
  }

  /** Enter: fecha o limite, a caminhada ou o patamar; em Concluir, grava. Nos espelhos (sem traçado), Enter é Concluir. */
  override confirm(): void {
    if (this.st.submode === 'concluir' || (this.st.submode === 'espelhos' && !strokeBusy(this.st.stroke))) {
      this.finish();
      return;
    }
    this.clearPicks();
    const msg = closeCurrent(this.st);
    this.refresh();
    this.note(msg);
  }

  /** Tab alterna linha e arco (e sai de "Pegar linhas", como a escolha de primitiva). */
  override tab(): void {
    this.setPrimitive(this.st.stroke.prim === 'line' ? 'arc' : 'line');
  }

  /**
   * Esc em dois passos: 1º cancela a cadeia ou o traçado em curso; 2º descarta o croqui e sai da ferramenta. O descarte
   * avisa quantos espelhos perdeu (a mensagem vai depois do `done`, que volta ao seletor e sobrescreve a dica).
   */
  override cancel(): void {
    this.clearPicks();
    if (strokeBusy(this.st.stroke)) {
      this.st.stroke = emptyStroke(this.st.stroke.prim);
      this.refresh();
      this.note('Cadeia cancelada. Esc de novo descarta o croqui.');
      return;
    }
    const perdidos = this.report.created;
    this.st.parts = cloneParts(this.original);
    this.env.done();
    if (perdidos > 0) this.env.say(`Croqui descartado (${perdidos} espelhos). Ctrl+Z não recupera: use Concluir para guardar.`);
  }

  /**
   * Delete: desfaz a última pegada, se foi a última ação; senão, desfaz o último passo em curso. Sem traçado, apaga o
   * último espelho ou a camada ativa.
   */
  deleteKey(): boolean {
    if (this.undoPick()) return true;
    this.clearPicks();
    if (undoStroke(this.st)) {
      this.refresh();
      this.note();
      return true;
    }
    const run = lastRun(this.st.parts);
    if (this.st.submode === 'espelhos' && run && run.risers.length) {
      run.risers.pop();
      this.refresh();
      this.note();
      return true;
    }
    return this.st.parts.length > 0 && this.clearLayer();
  }

  /** Desfaz a última pegada (Ctrl+Z no croqui). Falso se a última ação não foi uma pegada: vale o histórico do modelo. */
  undoPick(): boolean {
    const op = this.picks.pop();
    if (!op) return false;
    if (op.layer === 'chain') {
      const keep = this.st.stroke.chain.filter((c) => !op.items.includes(c));
      this.st.stroke = { ...emptyStroke(this.st.stroke.prim), chain: keep, last: keep.length ? keep[keep.length - 1]!.b : null };
    } else if (op.run) {
      op.run.risers = op.run.risers.filter((r) => !op.items.includes(r));
    }
    this.picksRedo.push(op);
    this.refresh();
    this.note();
    return true;
  }

  /** Refaz a última pegada desfeita (Ctrl+Y no croqui). Falso se não há o que refazer. */
  redoPick(): boolean {
    const op = this.picksRedo.pop();
    if (!op) return false;
    if (op.layer === 'chain') {
      const chain = [...this.st.stroke.chain, ...op.items];
      this.st.stroke = { ...emptyStroke(this.st.stroke.prim), chain, last: chain[chain.length - 1]!.b };
    } else if (op.run) {
      op.run.risers.push(...op.items);
    }
    this.picks.push(op);
    this.refresh();
    this.note();
    return true;
  }

  /** Um clique no sub-modo atual; a mensagem (se houver) vai para a barra. */
  private drawAt(q: Vec2): void {
    this.clearPicks();
    const msg = drawPoint(this.st, q, this.env.metersPerPixel());
    this.refresh();
    this.note(msg);
  }

  /** Um clique em "Pegar linhas": pega a linha sob o cursor. Mensagem só se não der; o erro de croqui tem prioridade. */
  private pickAtCursor(raw: Vec2): void {
    this.pickRaw = raw;
    this.cursor = raw;
    const hit = this.pickAt(raw);
    if (!hit) {
      this.env.say('Nenhuma linha sob o cursor: passe sobre uma parede, linha de escada ou aresta de laje ou piso.');
      return;
    }
    if (!hit.result) {
      this.env.say('O deslocamento é maior que o raio do arco: diminua o deslocamento.');
      return;
    }
    const r = pickInto(this.st, hit.result);
    if ('error' in r) {
      this.env.say(r.error);
      return;
    }
    this.picks.push(r.op);
    this.picksRedo = [];
    this.refresh();
    this.note(this.report.firstError ?? r.msg);
  }

  /** A linha pegável sob `raw` (e a corrente, se "Corrente" está ligada), com o deslocamento aplicado do lado do cursor. */
  private pickAt(raw: Vec2): PickHit | null {
    const sn = { ...DEFAULT_SNAP, ...this.env.options().snap };
    const lines = pickLinesOf(this.env.project(), this.env.levelId(), sn, this.stairId ?? undefined);
    const idx = nearestPickLine(lines, raw, PICK_PX * this.env.metersPerPixel());
    if (idx < 0) return null;
    const off = Math.abs(this.opts.pickOffset ?? 0);
    const picked = this.opts.pickChain ? chainAt(lines, idx) : { curves: [lines[idx]!.curve], closed: false };
    const result = offsetChain(picked.curves, leftSide(lines[idx]!.curve, raw) * off, picked.closed);
    const what = picked.curves.length > 1 ? `${picked.curves.length} segmentos (corrente)` : '1 segmento';
    const shift = off > 0 ? ` · ${formatQuantity(unitsOf(this.env.project()), 'length', off)}` : '';
    return { sources: picked.curves, result, label: result ? `${what}${shift}` : 'deslocamento impossível' };
  }

  /** Prévia de "Pegar linhas": a linha que seria pega em destaque, e o que entraria no croqui (tracejado, no tom do sub-modo). */
  private pickPreview(): PreviewItem[] {
    if (!this.st.pick) return [];
    const hit = this.pickAt(this.pickRaw);
    if (!hit) return [];
    const out: PreviewItem[] = [];
    for (const c of hit.sources) out.push(...curveItems(c, undefined));
    if (hit.result) out.push(...chainItems(hit.result, activeTone(this.st.submode), true));
    out.push({ kind: 'label', at: this.pickRaw, text: hit.label });
    return out;
  }

  /** Esvazia o histórico de pegadas (qualquer ação de desenho passa a ser a última, e Delete não desfaz pegadas antigas). */
  private clearPicks(): void {
    this.picks = [];
    this.picksRedo = [];
  }

  private load(id: Id): void {
    const s = this.env.project().elements[id];
    if (!isStair(s)) return;
    this.stairId = id;
    this.st.parts = partsFromComponents(s.components);
    this.original = partsFromComponents(s.components);
    this.st.submode = 'limites';
    this.st.phase = 'left';
    this.st.pick = false;
    this.st.stroke = emptyStroke(this.st.stroke.prim);
    this.clearPicks();
    this.env.setSelection([id]);
  }

  private loadNew(): void {
    this.stairId = null;
    this.st.parts = [];
    this.original = [];
    this.clearPicks();
  }

  /**
   * Pontos de captura do croqui: limites, espelhos e a cadeia em curso. As escadas do nível já entram pela captura
   * global (base.ts), então só o que está sendo desenhado precisa ser somado aqui. No modo de espelhos, os espelhos já
   * desenhados e a grade ficam de fora: o clique do espelho seguinte seria puxado para a ponta do anterior, ou para a
   * mesma coluna da grade (0,1 m), e dois espelhos cairiam no mesmo ponto do limite. O snap útil continua nos limites e
   * na perpendicular.
   */
  private snapExtra(): Partial<InferContext> {
    const espelhos = this.st.submode === 'espelhos';
    const draft = this.st.parts.flatMap((part) => (espelhos && part.kind !== 'landing' ? [...part.run.boundaryLeft, ...part.run.boundaryRight].flatMap((c) => [c.a, c.b]) : partPoints(part)));
    const pending = this.st.stroke.chain.flatMap((c) => [c.a, c.b]);
    return {
      from: this.st.stroke.last ?? undefined,
      extraPoints: [...draft, ...pending],
      ...(espelhos ? { noGrid: true, snap: { ...DEFAULT_SNAP, ...this.env.options().snap, grid: false } } : {}),
    };
  }

  /** Limites de cálculo: da escada em edição, ou da escada que a criação faria com as opções. */
  private limits() {
    const p = this.env.project();
    const s = this.stairId ? p.elements[this.stairId] : undefined;
    if (isStair(s)) return stairLimits(p, s);
    const draft = draftStair(p, this.creationOptions(), this.env.levelId());
    return draft ? stairLimits(p, draft) : null;
  }

  private creationOptions(): StairCreateOptions {
    const o = this.opts;
    return {
      typeId: o.typeId,
      levelId: this.env.levelId(),
      topLevelId: o.topLevelId,
      baseOffset: o.baseOffset,
      topOffset: o.topOffset,
      height: o.height,
      mark: this.env.options().placementMark ?? '',
      comments: this.env.options().placementComments ?? '',
    };
  }

  /**
   * Recalcula a análise (altura, nº desejado, contador, issues), os degraus, a prévia e a pegada sob o cursor. Não zera o
   * traçado em curso nem a fase do croqui: é o que a barra chama quando muda tipo, nível de topo, deslocamentos, altura
   * ou o deslocamento de "Pegar linhas".
   */
  refresh(): void {
    this.report = analyzeDraft(this.st.parts, this.limits(), unitsOf(this.env.project()));
    this.treads = treadItems(this.st.parts, this.treadContext());
    this.pickItems = this.pickPreview();
    this.items = buildItems(this.st, this.cursor, this.treads, this.report, this.pickItems);
  }

  /**
   * Contexto da prévia dos degraus: o tipo e o nível de topo da escada em edição ou, no croqui novo, os da escada que a
   * criação faria. Sem `topLevelId` explícito, vale "sem cobertura" — é assim que a escada é criada (`draftStair`), e a
   * chegada fecha no nível (`stairArrivalTop`).
   */
  private treadContext(): TreadPreviewContext {
    const p = this.env.project();
    const s = this.stairId ? p.elements[this.stairId] : undefined;
    const typeId = isStair(s) ? s.typeId : stairTypeId(p, this.opts.typeId);
    const type = typeId ? p.stairTypes[typeId] ?? null : null;
    const topLevelId = isStair(s) ? s.topLevelId : (draftStair(p, this.creationOptions(), this.env.levelId())?.topLevelId ?? null);
    return { project: p, type, topLevelId, risers: this.report.created, riserHeight: this.report.riserHeight };
  }

  /** Mensagem de status: a mensagem pedida, senão o 1º erro do croqui, senão a dica do sub-modo. */
  private note(msg?: string): void {
    this.env.say(msg ?? this.report.firstError ?? hintText(this.st, this.report));
  }

  /** Concluir: grava a escada nova ou o croqui editado, em um passo de desfazer. Só com croqui sem erro. */
  private finish(): void {
    const components = componentsFromParts(this.st.parts);
    if (this.stairId) {
      // Editar limites ou espelhos à mão descarta o caracol (`spiral`); o generatedBy fica como origem (decisão 0011 §1, 14).
      const cur = this.env.project().elements[this.stairId];
      const kept = discardSpiralOnEdit(isStair(cur) ? cur.components : [], components);
      const r = updateStairComponents(this.env, this.stairId, kept);
      if ('error' in r) return this.env.say(`Não é possível concluir: ${r.error}`);
      this.env.done(); // done() volta ao seletor, cuja dica sobrescreve a mensagem: dizer depois
      this.env.say(`${concluirText(r.report, 'Croqui atualizado')}${warningText(r.report)}Ctrl+Z desfaz.`);
      return;
    }
    const r = createStairFromComponents(this.env, components, this.creationOptions());
    if ('error' in r) return this.env.say(`Não é possível concluir: ${r.error}`);
    this.env.done();
    this.env.say(`${concluirText(r.report, 'Escada criada')}${warningText(r.report)}Ctrl+Z desfaz.`);
  }
}

/** A ferramenta é uma Escada? (a interface usa para ler o estado e chamar as ações). */
export const isStairTool = (t: Tool): t is StairTool => t instanceof StairTool;
