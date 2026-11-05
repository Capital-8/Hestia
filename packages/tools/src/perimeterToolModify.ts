import type { Vec2 } from '@hestia/geom';
import { unitsOf } from '@hestia/model';
import { parseNumber, parseQuantityText } from './numeric.ts';
import { perimeterModifyLabel, type PerimeterModifyKind } from './perimeterModifyKind.ts';
import { deleteSegs } from './perimeterModify.ts';
import { selectSegsMode } from './perimeterSession.ts';
import { chainIds } from './perimeterToolModifyChain.ts';
import { edgeClick, edgeHint, edgePreview } from './perimeterToolModifyEdge.ts';
import { selectionModeOf } from './perimeterToolSelect.ts';
import { parseDelta } from './perimeterToolInput.ts';
import {
  transformClick,
  transformConfirm,
  transformDelta,
  transformHint,
  transformPreview,
  transformPrompt,
  transformPromptKind,
  transformTab,
  transformType,
} from './perimeterToolModifyMove.ts';
import { EDGE, SOURCED, clearData, freshStep, halo, hasData, lineAt, type ModHost, type Step } from './perimeterToolModifyStep.ts';
import type { PointerInfo, PreviewItem } from './types.ts';
import { t as translate, type DictKey } from './i18n.ts';

/** O clique captura ponto (snap) em todos os estágios de ponto, como o esboço; só o teste de linha usa o cursor cru. */
function snapsAt(kind: PerimeterModifyKind, st: Step): boolean {
  if (kind === 'trim' || kind === 'split' || kind === 'offset') return true;
  if (kind === 'rotate') return st.stage >= 1;
  if (kind === 'move' || kind === 'copy' || kind === 'mirror' || kind === 'array') return st.stage === 1 || st.stage === 2;
  return false;
}

/** Verbo da etapa de escolher o alvo, por comando (a barra de status diz o próximo passo). */
const TARGET_VERB: Partial<Record<PerimeterModifyKind, DictKey>> = {
  offset: 'tl_verb_offset',
  move: 'tl_verb_move',
  copy: 'tl_verb_copy',
  rotate: 'tl_verb_rotate',
  mirror: 'tl_verb_mirror',
  array: 'tl_verb_array',
};

/**
 * Comando de Modificar ativo sobre as linhas do rascunho. Guarda o comando e o passo; cada clique ou valor digitado
 * avança o passo, e a operação aplicada vai para `h.commit` (um passo de desfazer). Esc cancela o passo e, sem passo,
 * desliga o comando; Enter confirma a seleção e a quantidade da matriz; Tab alterna a variante do comando.
 *
 * Sem seleção prévia, os comandos sobre a seleção começam na etapa de escolher o alvo: o clique numa linha a escolhe e
 * já avança para a operação (como no Revit). Tab alterna entre só a linha e todo o laço conectado pelas pontas.
 */
export class ModifyFlow {
  private cmd: PerimeterModifyKind | null = null;
  private st: Step = freshStep(false);
  private raw: Vec2 = { x: 0, y: 0 };
  private at: Vec2 = { x: 0, y: 0 };
  private over: string | null = null;
  /** Na etapa de escolher o alvo: Tab está em "todo o laço conectado" (false = só a linha). */
  private pickChain = false;

  constructor(private readonly h: ModHost) {}

  private lang() {
    return this.h.lang?.() ?? 'pt';
  }

  private say(key: DictKey, args?: Record<string, string | number>): void {
    this.h.say(translate(this.lang(), key, args));
  }

  kind(): PerimeterModifyKind | null {
    return this.cmd;
  }

  active(): boolean {
    return this.cmd !== null;
  }

  /** Linha sob o cursor, para o realce. */
  hoverId(): string | null {
    return this.over;
  }

  /** Verdadeiro na etapa de escolher o alvo (inclusive Excluir): a janela de seleção vale nessa etapa. */
  picking(): boolean {
    return this.cmd !== null && (this.needsSource() || this.cmd === 'delete');
  }

  /** Depois de uma janela de seleção: avança o comando (ou exclui, no comando Excluir). */
  afterWindowPick(): void {
    const kind = this.cmd;
    if (!kind) return;
    const d = this.h.draft();
    if (d.selected.length === 0) return;
    if (kind === 'delete') {
      const next = deleteSegs(d, d.selected);
      if (next) this.h.commit(next);
      this.h.replace(selectSegsMode(this.h.draft(), [], 'replace'));
      this.say('tl_msg_lines_deleted', { n: d.selected.length });
      return;
    }
    if (!SOURCED.has(kind) || this.st.stage !== 0) return;
    this.st.stage = 1;
    this.h.say(`${perimeterModifyLabel(kind, this.lang())}. ${transformHint(kind, this.st, unitsOf(this.h.project?.()), this.lang())}`);
  }

  /**
   * Liga o comando. Com linhas selecionadas (comandos sobre a seleção), começa direto no passo de operação. Excluir com
   * seleção apaga a seleção já, num passo de desfazer, e segue ligado para os cliques.
   */
  start(kind: PerimeterModifyKind): void {
    const o = this.h.options();
    this.cmd = kind;
    this.pickChain = false;
    const d = this.h.draft();
    if (kind === 'delete' && d.selected.length > 0) {
      const next = deleteSegs(d, d.selected);
      if (next) this.h.commit(next);
      this.say('tl_msg_lines_deleted', { n: d.selected.length });
      return;
    }
    const copy = kind === 'offset' ? o.offsetCopy : kind === 'rotate' ? o.rotateCopy : kind === 'mirror' ? o.mirrorCopy : false;
    this.st = freshStep(copy);
    if (SOURCED.has(kind) && this.h.draft().selected.length > 0) this.st.stage = 1;
    this.h.say(this.hint());
  }

  stop(): void {
    this.cmd = null;
    this.st = freshStep(false);
    this.over = null;
    this.pickChain = false;
  }

  /** Limpa o passo em andamento (desfazer, troca de rascunho). O comando segue ligado. */
  clearStep(): void {
    if (!this.cmd) return;
    this.st.ids = [];
    this.st.pts = [];
    this.st.num = null;
    this.st.stage = SOURCED.has(this.cmd) && this.h.draft().selected.length > 0 ? 1 : 0;
    this.over = null;
  }

  move(p: PointerInfo): void {
    if (!this.cmd) return;
    this.raw = p.raw;
    this.over = lineAt(this.h.draft(), p.raw, this.h.mpp());
    this.at = this.pointAt(p);
  }

  click(p: PointerInfo): void {
    const kind = this.cmd;
    if (!kind) return;
    this.raw = p.raw;
    if (this.needsSource()) return this.pickTarget(p);
    if (kind === 'offset' && this.st.stage === 1 && p.shift) return this.addOffsetSource(p);
    const at = this.pointAt(p);
    this.at = at;
    if (EDGE.has(kind)) edgeClick(this.h, kind, this.st, p, at);
    else transformClick(this.h, kind, this.st, p, at);
  }

  /** Valor digitado: distância, ângulo, quantidade. Sem entrada numérica no estágio, devolve false. */
  type(text: string): boolean {
    const kind = this.cmd;
    if (!kind || this.needsSource() || transformPrompt(kind, this.st, this.lang()) === null) return false;
    // Mover/Copiar no destino: aceita também o deslocamento digitado "dx,dy" (ou "dx;dy"), em metros.
    if ((kind === 'move' || kind === 'copy') && this.st.stage === 2) {
      const delta = parseDelta(text, unitsOf(this.h.project?.()));
      if (delta) return transformDelta(this.h, kind, this.st, delta);
    }
    const promptKind = transformPromptKind(kind, this.st);
    const q = promptKind === 'angle' ? 'angle' : promptKind === 'length' || promptKind === 'offset' ? 'length' : null;
    const lido = q ? parseQuantityText(text, unitsOf(this.h.project?.()), q) : parseNumber(text);
    if (lido === null) return this.refuse(translate(this.lang(), 'tl_msg_invalid_number_plain'));
    const v = q === 'angle' ? (lido * 180) / Math.PI : lido;
    return transformType(this.h, kind, this.st, v, this.raw);
  }

  /** Tab: alterna a variante (aparar/estender, dividir) ou copiar/mover. Limpa o passo quando o modo muda. */
  tab(): void {
    const kind = this.cmd;
    if (!kind) return;
    if (this.needsSource()) {
      this.pickChain = !this.pickChain;
      this.h.say(this.targetHint(kind));
      return;
    }
    if (kind === 'trim' || kind === 'split') {
      this.st.mode = kind === 'trim' ? (this.st.mode + 1) % 3 : (this.st.mode + 1) % 2;
      clearData(kind, this.st);
      return this.h.say(this.hint());
    }
    if (!transformTab(this.h, kind, this.st)) this.say('tl_msg_tab_no_step');
  }

  /** Esc: cancela o passo (true = não há passo, o comando deve sair). */
  cancel(): boolean {
    const kind = this.cmd;
    if (!kind) return true;
    const d = this.h.draft();
    if (hasData(this.st)) {
      clearData(kind, this.st);
      this.h.say(this.hint());
      return false;
    }
    if (kind === 'offset' && this.st.stage > 0) {
      this.st.stage = 0;
      this.st.ids = [];
      this.st.pts = [];
      this.st.num = null;
      this.h.replace(selectSegsMode(d, [], 'replace'));
      this.h.say(this.targetHint(kind));
      return false;
    }
    if (SOURCED.has(kind) && this.st.stage === 0 && d.selected.length > 0) {
      this.h.replace(selectSegsMode(d, [], 'replace'));
      this.say('tl_msg_selection_cleared');
      return false;
    }
    return true;
  }

  /** Enter: confirma a seleção das linhas, ou a quantidade padrão da matriz. */
  confirm(): void {
    const kind = this.cmd;
    if (!kind) return;
    if (SOURCED.has(kind) && this.needsSource()) {
      if (this.h.draft().selected.length === 0) return this.say('tl_msg_select_line_first');
      this.st.stage = 1;
      return this.h.say(this.hint());
    }
    transformConfirm(this.h, kind, this.st);
  }

  /** Rótulo do campo numérico do estágio, ou null. */
  prompt(): string | null {
    if (!this.cmd || this.needsSource()) return null;
    return transformPrompt(this.cmd, this.st, this.lang());
  }

  preview(): PreviewItem[] {
    const kind = this.cmd;
    if (!kind) return [];
    if (EDGE.has(kind)) return edgePreview(this.h, kind, this.st, this.at, this.raw);
    if (this.needsSource()) return this.pickPreview();
    return transformPreview(this.h, kind, this.st, this.at);
  }

  /** Comando sobre a seleção que ainda precisa de linhas: estágio de escolha, ou seleção vazia. */
  private needsSource(): boolean {
    const kind = this.cmd;
    if (!kind || !SOURCED.has(kind)) return false;
    return this.st.stage === 0 || this.h.draft().selected.length === 0;
  }

  /** Ponto do passo: capturado quando o estágio pede ponto, cursor cru nos demais. */
  private pointAt(p: PointerInfo): Vec2 {
    return snapsAt(this.cmd!, this.st) ? this.h.snap(p) : p.raw;
  }

  /** Prévia da etapa de escolher o alvo: a linha ou o laço conectado sob o cursor, realçados. */
  private pickPreview(): PreviewItem[] {
    const d = this.h.draft();
    if (!this.over) return [];
    const ids = this.pickChain ? chainIds(d.segs, this.over) : [this.over];
    return ids.flatMap((id) => halo(d, id));
  }

  /**
   * Clique na etapa de escolher o alvo: escolhe a linha (ou o laço com o Tab) e, sem modificador, já avança para a
   * operação. Shift soma e Ctrl subtrai sem avançar, para escolher mais linhas antes da operação.
   */
  private pickTarget(p: PointerInfo): void {
    const kind = this.cmd!;
    const d = this.h.draft();
    const id = lineAt(d, p.raw, this.h.mpp());
    if (!id) return this.h.say(this.targetHint(kind));
    const ids = this.pickChain ? chainIds(d.segs, id) : [id];
    const mode = selectionModeOf(p);
    const next = selectSegsMode(d, ids, mode);
    this.h.replace(next);
    if (next.selected.length === 0) return this.say('tl_msg_no_line_chosen');
    if (mode !== 'replace') {
      this.say('tl_msg_lines_chosen', { n: next.selected.length });
      return;
    }
    this.st.stage = 1;
    this.h.say(`${perimeterModifyLabel(kind, this.lang())}. ${transformHint(kind, this.st, unitsOf(this.h.project?.()), this.lang())}`);
  }

  /**
   * Deslocar já na operação: Shift sobre outra linha soma à origem (o laço de várias linhas continua escolhível sem
   * sair do comando). Clique sem Shift segue sendo o lado do deslocamento.
   */
  private addOffsetSource(p: PointerInfo): void {
    const d = this.h.draft();
    const id = lineAt(d, p.raw, this.h.mpp());
    if (!id) return;
    const next = selectSegsMode(d, [id], 'add');
    this.h.replace(next);
    this.say('tl_msg_lines_source', { n: next.selected.length, hint: transformHint('offset', this.st, unitsOf(this.h.project?.()), this.lang()) });
  }

  /** Dica da etapa de escolher o alvo, com o estado do Tab (só a linha ou o laço conectado). */
  private targetHint(kind: PerimeterModifyKind): string {
    const lang = this.lang();
    const label = perimeterModifyLabel(kind, lang);
    if (this.pickChain) return translate(lang, 'tl_msg_target_chain', { label });
    const verbKey = TARGET_VERB[kind] ?? 'tl_verb_modify';
    return translate(lang, 'tl_msg_target_line', { label, verb: translate(lang, verbKey) });
  }

  private hint(): string {
    const kind = this.cmd!;
    if (this.needsSource()) return this.targetHint(kind);
    if (EDGE.has(kind)) return edgeHint(kind, this.st, this.lang());
    return transformHint(kind, this.st, unitsOf(this.h.project?.()), this.lang());
  }

  private refuse(msg: string): false {
    this.h.say(msg);
    return false;
  }
}
