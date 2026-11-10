/* eslint-disable max-lines -- a ferramenta acumula as tres formas (reta/L/U/leque/caracol) e o trajeto livre; extrair depois. */
import { add, len, mul, sub, type Vec2 } from '@hestia/geom';
import { formatQuantity, stairTopLevel, unitsOf, type ResolvedUnits } from '@hestia/model';
import { SPIRAL_MAX_SWEEP, optimizeStair, stairIssuesOf, treadRuleOf, type StairFixed, type TreadRule } from '@hestia/engine';
import { draftStair, stairFromGenerator, stairLimits, type StairCommandResult, type StairCreateOptions } from './stairCommands.ts';
import { ToolBase } from './base.ts';
import { contextoDeTraco, lerComprimentoDigitado } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { parseNumber } from './numeric.ts';
import { partsPreview, treadItems, type TreadPreviewContext } from './stairPreview.ts';
import { componentsFromParts, type StairPart } from './stairSketchState.ts';
import { DEFAULT_STAIR_RUN_OPTIONS, planStairRun, planStairRunFree, type StairRunPlan, type StairRunToolOptions } from './stairRunPlan.ts';
import { planSpiralRun, SPIRAL_DEFAULT_INNER, SPIRAL_MIN_SWEEP, wrapAngle, type SpiralPlan } from './stairSpiralRun.ts';
import { stairTypeForShape } from './stairRunTypes.ts';
import { StairLiveSession, type StairLiveConfig, type StairLiveEvent } from './stairLiveSession.ts';
import type { PointerInfo, PreviewItem } from './types.ts';
import { fmtNumLang, t as translate, type Lang } from './i18n.ts';

/** Dica do 3º passo; o limite superior sai na unidade de ângulo do projeto. */
const spiralSweepHint = (u: ResolvedUnits, lang: Lang): string =>
  lang === 'en'
    ? `Spiral: sweep the mouse around the center for the sweep (more than one turn is allowed, up to ${formatQuantity(u, 'angle', SPIRAL_MAX_SWEEP, { trim: true })}). Click or Enter confirms; Backspace goes back.`
    : `Caracol: gire o mouse em torno do centro para a varredura (dá mais de uma volta, até ${formatQuantity(u, 'angle', SPIRAL_MAX_SWEEP, { trim: true })}). Clique ou Enter confirma; Backspace volta.`;
/** Distância mínima (m) entre o 1º espelho e o cursor para definir a direção. */
const MIN_DIRECTION = 0.01;
/** Vértices do círculo de prévia do caracol. */
const CIRCLE_SEGMENTS = 96;
const DEG = Math.PI / 180;

/** Centímetros com o separador do idioma (0,175 m → "17,5"). */
const cm = (m: number, lang: Lang): string => fmtNumLang(m * 100, 1, lang);
/** Metros com duas casas no separador do idioma (1 → "1,00"). */
const mText = (m: number, lang: Lang): string => fmtNumLang(m, 2, lang);
/** Ângulo em módulo, na unidade do projeto (540° → "540°"; 275,25° → "275,3°"). */
const angleText = (u: ResolvedUnits, rad: number): string => formatQuantity(u, 'angle', Math.abs(rad), { trim: true });

const circleRing = (c: Vec2, r: number): Vec2[] =>
  Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => {
    const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });

/**
 * Estado do caracol em criação (3 cliques, decisão 0014 §1 item 12). 1º clique = centro (`origin`); 2º = raio externo e
 * ângulo inicial (fixados em `outer` e `start`); 3º = ângulo final: a varredura `sweep` acumula o giro do cursor em torno
 * do centro (passa de 360°, até 720°) e o sentido vem do primeiro movimento.
 */
interface SpiralDraw {
  outer: number | null;
  start: number | null;
  sweep: number;
  /** Ângulo do cursor no último ponto contado (para acumular a varredura). */
  last: number | null;
  /** Último ponto do cursor (cru). */
  cursor: Vec2;
}

const emptySpiral = (cursor: Vec2 = { x: 0, y: 0 }): SpiralDraw => ({ outer: null, start: null, sweep: 0, last: null, cursor });

/** Prévia de um caracol: o croqui do gerador, os degraus e o rótulo "Varredura: X° · N espelhos" no cursor. */
function caracolItems(plan: SpiralPlan, cur: Vec2, units: ResolvedUnits, ctx: TreadPreviewContext, lang: Lang): PreviewItem[] {
  const parts: StairPart[] = [{ kind: 'run', run: plan.run }];
  return [
    ...partsPreview(parts),
    ...treadItems(parts, ctx),
    { kind: 'label', at: cur, text: translate(lang, 'tl_lbl_spiral_sweep', { angle: angleText(units, plan.run.spiral.sweep), n: plan.risers }) },
  ];
}

/**
 * Escada reta, em L, em U, com leque ou caracol, criada pronta por cliques (decisão 0011 §5; caracol, decisão 0014 §1 item
 * 12). Reta/L/U/leque: o 1º clique é o centro do 1º espelho, a prévia segue o cursor (degraus e patamar) e o 2º clique fixa a
 * direção de subida; entrada numérica: o ângulo de subida em graus. Caracol: 1º clique = centro; 2º = raio externo e
 * ângulo inicial; 3º = ângulo final (ou Enter), com a varredura acumulada. Cada criação é UMA transação ("Criar escada").
 * A altura vem do nível ativo e do nível acima (ou da altura da barra de escada, sem nível acima). Depois de criar, a
 * ferramenta continua pronta para outra escada; Esc sai como nas demais.
 */
export class StairRunTool extends ToolBase {
  readonly id = 'stairrun';
  readonly label = 'Escada (reta/L/U/caracol)';
  override get hint(): string {
    return this.t('tl_hint_stair_run');
  }
  private origin: Vec2 | null = null;
  /** Estado do caracol em criação (só usado na forma `spiral`). */
  private sp: SpiralDraw = emptySpiral();
  /** Sessão do desenho livre (forma 'free'); criada na primeira necessidade. */
  private session: StairLiveSession | null = null;
  /** N e T fixados pelo "Ajustar" (tecla A); limpos ao reiniciar a ferramenta. */
  private fixed: StairFixed | undefined;

  private get opts(): StairRunToolOptions {
    return this.env.options().stairRun ?? DEFAULT_STAIR_RUN_OPTIONS;
  }

  private get free(): boolean {
    return this.opts.shape === 'free';
  }

  private get spiralOn(): boolean {
    return this.opts.shape === 'spiral';
  }

  /** Raio interno (m) da ferramenta: o digitado na barra, ou 0,10 m. */
  private get innerR(): number {
    return this.opts.spiralInner ?? SPIRAL_DEFAULT_INNER;
  }

  protected reset(): void {
    this.origin = null;
    this.session?.cancel();
    this.fixed = undefined;
    this.items = [];
    this.inf = null;
    this.sp = emptySpiral();
  }

  protected busy(): boolean {
    return this.origin !== null || (this.session?.state ?? 'IDLE') !== 'IDLE';
  }

  override start(): void {
    this.reset();
    this.env.say(this.free ? this.t('tl_hint_stair_free') : this.spiralOn ? this.t('tl_hint_spiral_start') : this.t('tl_hint_stair_run'));
  }


  /** Cota dinâmica do trecho em traçado (mesmo provedor da parede): origem ou último vértice até o cursor. */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const from = this.spiralOn ? null : this.free ? this.liveFrom() : this.origin;
    const to = this.inf?.point;
    return from && to && len(sub(to, from)) > 1e-6 ? [segmentLengthDim(from, to)] : [];
  }

  override inputPrompt(): string | null {
    if (this.free) return this.session?.state === 'ORIGIN' || this.session?.state === 'DRAWING' ? this.t('tl_inp_length_m') : null;
    if (this.spiralOn) {
      if (this.origin === null) return null;
      return this.sp.start === null ? this.t('tl_inp_outer_radius') : this.t('tl_inp_sweep');
    }
    return this.origin !== null ? this.t('tl_inp_angle') : null;
  }

  /** Enter: no desenho livre conclui (com aviso se faltam espelhos); nos demais, o padrão da base. */
  override confirm(): void {
    if (this.free && this.session && this.session.state !== 'IDLE') {
      this.handleLive(this.session.finish());
      return;
    }
    if (!this.spiralOn) {
      super.confirm();
      return;
    }
    if (this.origin === null) return;
    if (this.sp.start === null) {
      this.env.say(this.t('tl_hint_spiral_radius'));
      return;
    }
    this.spiralTrack(this.sp.cursor);
    this.spiralConfirm();
  }

  /** Esc: descarta o rascunho da escada livre; um 2º Esc sai da ferramenta (como nas demais). */
  override cancel(): void {
    if (this.free && this.busy()) {
      this.reset();
      this.items = [];
      this.env.say(this.t('tl_hint_stair_free'));
      return;
    }
    super.cancel();
  }

  /** Backspace: no desenho livre volta um ponto; no caracol volta um passo; fora deles, nada. */
  deleteKey(): boolean {
    if (this.free) {
      if (!this.session) return false;
      const ok = this.session.back();
      if (ok) {
        this.items = this.session.preview();
        this.env.say(this.session.hint());
      }
      return ok;
    }
    if (!this.spiralOn || this.origin === null) return false;
    if (this.sp.start !== null) {
      this.sp = emptySpiral(this.sp.cursor);
      this.env.say(this.t('tl_hint_spiral_radius'));
      this.items = this.spiralItems();
      return true;
    }
    this.reset();
    this.env.say(this.t('tl_hint_spiral_start'));
    return true;
  }

  /**
   * Tecla A no desenho livre: ajusta N, h e piso à regra de Blondel do tipo (`optimizeStair`), troca o rascunho pelo
   * trajeto ajustado e diz o que mudou. Não usa `resolveStairs` nem booleanas.
   */
  adjust(): boolean {
    const s = this.session;
    if (!this.free || !s || s.points.length < 2) return false;
    const cfg = this.liveConfig();
    if ('error' in cfg) {
      this.env.say(cfg.error);
      return true;
    }
    const pts = s.points;
    const desenho = s.rawPoints();
    const res = optimizeStair({
      path: desenho,
      H: cfg.H,
      type: cfg.type,
      width: cfg.width,
      ...(cfg.landingDepth !== undefined ? { landingDepth: cfg.landingDepth } : {}),
    });
    if ('error' in res) {
      this.env.say(res.error);
      return true;
    }
    const antes = this.fixed;
    this.fixed = res.fixed;
    const novo = this.liveSession();
    if (!novo || !novo.load(res.path)) {
      this.fixed = antes;
      const volta = this.liveSession();
      volta?.load(pts);
      this.items = volta ? volta.move(pts[pts.length - 1]!, 0) : [];
      this.env.say(this.t('tl_msg_adjust_fail'));
      return true;
    }
    this.items = novo.move(novo.points[novo.points.length - 1]!, 0);
    this.env.say(res.note);
    return true;
  }

  override move(p: PointerInfo): void {
    if (this.free) {
      this.liveMove(p);
      return;
    }
    if (this.spiralOn) {
      if (this.origin === null) {
        this.items = [{ kind: 'point', at: this.snap(p).point }];
        return;
      }
      this.inf = null;
      this.sp.cursor = p.raw;
      if (this.sp.start !== null) this.spiralTrack(p.raw);
      this.items = this.spiralItems();
      return;
    }
    const inf = this.snap(p, contextoDeTraco(this.origin));
    this.items = this.drawItems(inf.point);
  }

  override click(p: PointerInfo): void {
    if (this.free) {
      this.liveClick(p);
      return;
    }
    if (this.spiralOn) {
      this.spiralClick(p);
      return;
    }
    const inf = this.snap(p, contextoDeTraco(this.origin));
    if (this.origin === null) {
      this.origin = inf.point;
      this.env.say(this.t('tl_hint_stair_dir'));
      return;
    }
    const dir = sub(inf.point, this.origin);
    if (len(dir) < MIN_DIRECTION) {
      this.env.say(this.t('tl_msg_move_cursor_direction'));
      return;
    }
    // Reta: o 2º clique define também o comprimento do lance (o nº de espelhos sai dele).
    this.create(dir, len(dir));
  }

  /**
   * Ângulo digitado (graus, a partir do eixo X) fixa a direção e cria a escada. No caracol: raio externo (m) no 2º passo,
   * depois a varredura (graus), com o sentido do primeiro movimento ou o da opção. Na escada livre: o comprimento.
   */
  override type(text: string): boolean {
    if (this.free) return this.liveType(text);
    if (this.spiralOn) return this.spiralType(text);
    if (this.origin === null) return false;
    const v = parseNumber(text);
    if (v === null) {
      this.env.say(this.t('tl_msg_invalid_angle'));
      return false;
    }
    const a = (v * Math.PI) / 180;
    return this.create({ x: Math.cos(a), y: Math.sin(a) });
  }

  /** Prévia do que seria criado com a direção do cursor; o erro de cálculo aparece na barra de status. */
  private drawItems(cursor: Vec2): PreviewItem[] {
    if (this.origin === null) return [{ kind: 'point', at: cursor }];
    const dir = sub(cursor, this.origin);
    if (len(dir) < MIN_DIRECTION) return [{ kind: 'point', at: this.origin }];
    const b = this.build(dir, len(dir));
    if ('error' in b) {
      this.env.say(b.error);
      return [{ kind: 'point', at: this.origin }];
    }
    this.env.say(this.t('tl_hint_stair_dir'));
    const plan = b;
    return [
      ...partsPreview(plan.parts),
      ...treadItems(plan.parts, this.treadContext(plan.risers, plan.riserHeight)),
      { kind: 'label', at: cursor, text: this.t('tl_lbl_stair_preview', { n: plan.risers, h: cm(plan.riserHeight, this.uiLang()), t: cm(plan.tread, this.uiLang()) }) },
    ];
  }

  /**
   * Contexto da prévia dos degraus: o tipo compatível com a forma (o mesmo da criação) e o nível de topo das opções da
   * barra. `topLevelId` ausente vale como "sem cobertura", como no modelo: a escada criada também fica com
   * `topLevelId: null` e a chegada fecha no nível (`stairArrivalTop`).
   */
  private treadContext(risers: number, riserHeight: number | null): TreadPreviewContext {
    const p = this.env.project();
    const typeId = stairTypeForShape(p, this.opts.shape, this.opts.typeId);
    const type = typeId ? p.stairTypes[typeId] ?? null : null;
    return { project: p, type, topLevelId: this.env.options().stair?.topLevelId ?? null, risers, riserHeight };
  }

  /** Opções da criação: tipo (compatível com a forma), e cotas da barra de escada (base, topo e altura sem nível acima). */
  private creation(): StairCreateOptions {
    const so = this.env.options().stair ?? {};
    return {
      typeId: stairTypeForShape(this.env.project(), this.opts.shape, this.opts.typeId) ?? undefined,
      levelId: this.env.levelId(),
      topLevelId: so.topLevelId,
      baseOffset: so.baseOffset,
      topOffset: so.topOffset,
      height: so.height,
      mark: this.env.options().placementMark ?? '',
      comments: this.env.options().placementComments ?? '',
    };
  }

  /** H (nível ativo e nível acima), espelho máximo, piso mínimo e regra de cálculo do tipo da criação. */
  private limitsNow(): { H: number; maxRiser: number; minTread: number; rule: TreadRule } | { error: string } {
    const p = this.env.project();
    const ref = draftStair(p, this.creation(), this.env.levelId());
    const limits = ref ? stairLimits(p, ref) : null;
    const type = ref ? p.stairTypes[ref.typeId] : undefined;
    if (!ref || !limits || !type) return { error: this.t('tl_msg_no_stair_type') };
    if (!(limits.H > 0)) {
      return {
        error: stairTopLevel(p, ref)
          ? this.t('tl_msg_top_not_above')
          : this.t('tl_msg_no_top_level_stair'),
      };
    }
    return { H: limits.H, maxRiser: limits.maxRiser, minTread: type.minTread, rule: treadRuleOf(type) };
  }

  /**
   * Plano da escada reta/L/U/leque para a direção dada; erro com a mensagem de status em pt-BR. `length` (reta, pelo 2º
   * clique) fixa o comprimento do lance; sem ele (ângulo digitado), vale o nº de espelhos pela altura.
   */
  private build(dir: Vec2, length?: number): StairRunPlan | { error: string } {
    const lim = this.limitsNow();
    if ('error' in lim) return lim;
    const options = length !== undefined ? { ...this.opts, length } : this.opts;
    return planStairRun({ start: this.origin!, dir, H: lim.H, maxRiser: lim.maxRiser, minTread: lim.minTread, rule: lim.rule, options });
  }

  /** Cria a escada com a direção dada (e o comprimento, na reta), em um passo de desfazer. Mantém a ferramenta pronta. */
  private create(dir: Vec2, length?: number): boolean {
    const b = this.build(dir, length);
    if ('error' in b) {
      this.env.say(b.error);
      return false;
    }
    const comps = componentsFromParts(b.parts);
    const out: { r?: StairCommandResult } = {};
    this.env.transaction(this.t('tl_undo_create_stair'), () => {
      out.r = stairFromGenerator(this.env, comps, { ...this.creation(), generatedBy: this.opts.shape });
    });
    const r = out.r;
    if (!r || 'error' in r) {
      this.env.say(this.t('tl_msg_stair_fail', { error: r?.error ?? this.t('tl_msg_save_failed') }));
      return false;
    }
    // Com comprimento que dá outro nº (`note`), a explicação substitui o aviso "difere do nº desejado", que contradiria o criado.
    const aviso = stairIssuesOf(this.env.project(), r.id).find((i) => i.stairId === r.id && i.severity === 'warning' && !(b.note && i.code === 'stair-risers-count'));
    const extra = b.note ? ` ${b.note}` : '';
    const avisoText = aviso ? this.t('tl_msg_warning_note', { msg: aviso.message }) : '';
    this.env.say(this.t('tl_msg_stair_created', { n: b.risers, h: cm(b.riserHeight, this.uiLang()), t: cm(b.tread, this.uiLang()), note: extra, warning: avisoText }));
    this.reset();
    return true;
  }

  // ---------- escada livre (trajeto de cliques) ----------

  /** Dados do cálculo ao vivo a partir das opções e do nível; `error` pelos mesmos motivos do `build`. */
  private liveConfig(): StairLiveConfig | { error: string } {
    const p = this.env.project();
    const typeId = stairTypeForShape(p, this.opts.shape, this.opts.typeId);
    const type = typeId ? p.stairTypes[typeId] : undefined;
    if (!type) return { error: this.t('tl_msg_no_stair_type') };
    const lim = this.limitsNow();
    if ('error' in lim) return lim;
    return {
      H: lim.H,
      type,
      width: this.opts.width,
      ...(this.opts.landingDepth !== undefined ? { landingDepth: this.opts.landingDepth } : {}),
      ...(this.fixed ? { fixed: this.fixed } : {}),
      lang: this.uiLang(),
    };
  }

  /** Sessão configurada com as opções atuais, ou null (com a mensagem dita) se faltam dados. */
  private liveSession(): StairLiveSession | null {
    const cfg = this.liveConfig();
    if ('error' in cfg) {
      this.env.say(cfg.error);
      return null;
    }
    if (!this.session) this.session = new StairLiveSession(cfg);
    else this.session.configure(cfg);
    return this.session;
  }

  private liveFrom(): Vec2 | undefined {
    const pts = this.session?.points ?? [];
    return pts[pts.length - 1];
  }

  private liveMove(p: PointerInfo): void {
    const inf = this.snap(p, contextoDeTraco(this.liveFrom()));
    const s = this.liveSession();
    if (!s) {
      this.items = [{ kind: 'point', at: inf.point }];
      return;
    }
    this.items = s.move(inf.point, this.env.metersPerPixel());
  }

  private liveClick(p: PointerInfo): void {
    const inf = this.snap(p, contextoDeTraco(this.liveFrom()));
    const s = this.liveSession();
    if (!s) return;
    this.handleLive(s.click(inf.point), inf.point);
  }

  private liveType(text: string): boolean {
    const s = this.liveSession();
    if (!s) return false;
    const v = lerComprimentoDigitado(this.env, text);
    if (v === null) return false;
    const ev = s.typeLength(v);
    this.handleLive(ev);
    return ev.kind === 'added' || ev.kind === 'done';
  }

  /** Reage ao resultado de um clique, Enter ou comprimento digitado. */
  private handleLive(ev: StairLiveEvent, at?: Vec2): void {
    const s = this.session;
    if (!s) return;
    if (ev.kind === 'ignored' || ev.kind === 'warn') {
      this.env.say(ev.message);
      return;
    }
    if (ev.kind === 'added') {
      this.items = s.move(at ?? s.points[s.points.length - 1]!, 0);
      this.env.say(ev.message ? `${ev.message}${this.t('tl_msg_enter_or_click')}` : s.hint());
      return;
    }
    this.createFree(ev.path);
  }

  /** Cria a escada livre do trajeto em UMA transação "Criar escada" (Ctrl+Z desfaz); recusa mantém o rascunho. */
  private createFree(path: Vec2[]): void {
    const cfg = this.liveConfig();
    if ('error' in cfg) {
      this.env.say(cfg.error);
      return;
    }
    const plan = planStairRunFree({ path, H: cfg.H, type: cfg.type, options: this.opts, ...(this.fixed ? { fixed: this.fixed } : {}) });
    if ('error' in plan) {
      // Mantém o rascunho (volta a DRAWING com os pontos) para o usuário corrigir com Backspace ou mexendo o último ponto.
      const s = this.session;
      s?.load(path);
      this.items = s ? s.move(path[path.length - 1]!, 0) : [];
      this.env.say(this.t('tl_msg_stair_create_fail_back', { error: plan.error }));
      return;
    }
    const comps = componentsFromParts(plan.parts);
    const out: { r?: StairCommandResult } = {};
    this.env.transaction(this.t('tl_undo_create_stair'), () => {
      out.r = stairFromGenerator(this.env, comps, { ...this.creation(), generatedBy: 'free', ...(plan.path ? { freePath: plan.path } : {}) });
    });
    const r = out.r;
    if (!r || 'error' in r) {
      this.env.say(this.t('tl_msg_stair_fail', { error: r?.error ?? this.t('tl_msg_save_failed') }));
      return;
    }
    const aviso = stairIssuesOf(this.env.project(), r.id).find((i) => i.stairId === r.id && i.severity === 'warning' && !(plan.note && i.code === 'stair-risers-count'));
    const runs = plan.runs ?? 0;
    const landings = plan.landings ?? 0;
    const extra = plan.note ? ` ${plan.note}` : '';
    const avisoText = aviso ? this.t('tl_msg_warning_note', { msg: aviso.message }) : '';
    const lang = this.uiLang();
    const runsText = lang === 'en' ? `${runs} ${runs === 1 ? 'flight' : 'flights'}` : `${runs} ${runs === 1 ? 'lance' : 'lances'}`;
    const landingsText = lang === 'en' ? `${landings} ${landings === 1 ? 'landing' : 'landings'}` : `${landings} ${landings === 1 ? 'patamar' : 'patamares'}`;
    this.env.say(this.t('tl_msg_stair_created_free', {
      n: plan.risers,
      h: cm(plan.riserHeight, lang),
      t: cm(plan.tread, lang),
      runs: runsText,
      landings: landingsText,
      note: extra,
      warning: avisoText,
    }));
    this.reset();
    this.items = [];
  }

  // ---------- caracol (3 cliques) ----------

  private spiralClick(p: PointerInfo): void {
    if (this.origin === null) {
      this.origin = this.snap(p).point;
      this.sp = emptySpiral(p.raw);
      this.env.say(this.t('tl_hint_spiral_radius'));
      return;
    }
    if (this.sp.start === null) {
      this.spiralFixRadius(p.raw);
      return;
    }
    this.spiralTrack(p.raw);
    this.spiralConfirm();
  }

  /**
   * 2º passo: fixa o raio externo (o digitado, ou a distância do cursor ao centro) e o ângulo inicial (o do cursor). Com a
   * varredura digitada na barra, o passo já cria o caracol; senão, passa ao 3º (varredura pelo giro).
   */
  private spiralFixRadius(raw: Vec2): void {
    const c = this.origin!;
    const d = sub(raw, c);
    const r = this.opts.spiralOuter ?? len(d);
    if (!(r > 0)) {
      this.env.say(this.t('tl_msg_spiral_radius'));
      return;
    }
    if (!(r > this.innerR)) {
      this.env.say(this.t('tl_msg_spiral_radius_gt_inner', { outer: mText(r, this.uiLang()), inner: mText(this.innerR, this.uiLang()) }));
      return;
    }
    this.sp = { outer: r, start: Math.atan2(d.y, d.x), sweep: 0, last: null, cursor: raw };
    this.sp.last = this.sp.start;
    const typed = this.typedSweep();
    if (typed !== null) {
      this.sp.sweep = typed;
      if (!this.spiralConfirm()) this.sp.sweep = 0;
      return;
    }
    this.env.say(spiralSweepHint(unitsOf(this.env.project()), this.uiLang()));
    this.items = this.spiralItems();
  }

  /** Acumula o giro do cursor em torno do centro na varredura (passa de 360°, até 720°). O 1º movimento dá o sentido. */
  private spiralTrack(raw: Vec2): void {
    const d = sub(raw, this.origin!);
    if (len(d) < 1e-9) return;
    const th = Math.atan2(d.y, d.x);
    if (this.sp.last !== null) {
      const delta = wrapAngle(th - this.sp.last);
      if (Math.abs(delta) > 1e-6) this.sp.sweep = Math.max(-SPIRAL_MAX_SWEEP, Math.min(SPIRAL_MAX_SWEEP, this.sp.sweep + delta));
    }
    this.sp.last = th;
  }

  /** Varredura digitada na barra (rad, com o sentido da opção), ou null se não foi digitada. */
  private typedSweep(): number | null {
    const v = this.opts.spiralSweep;
    if (v === undefined) return null;
    return (this.opts.spiralSense === 'cw' ? -1 : 1) * v * DEG;
  }

  /** Plano do caracol com os passos fixados até agora; erro em pt-BR. */
  private spiralPlanNow(): SpiralPlan | { error: string } {
    const lim = this.limitsNow();
    if ('error' in lim) return lim;
    if (this.origin === null || this.sp.outer === null || this.sp.start === null) return { error: this.t('tl_msg_spiral_missing') };
    return planSpiralRun({
      center: this.origin,
      rInner: this.innerR,
      rOuter: this.sp.outer,
      startAngle: this.sp.start,
      sweep: this.sp.sweep,
      H: lim.H,
      maxRiser: lim.maxRiser,
      units: unitsOf(this.env.project()),
    });
  }

  /** Cria o caracol se a varredura vale (30° a 720°); senão, a mensagem diz o que falta. */
  private spiralConfirm(): boolean {
    const plan = this.spiralPlanNow();
    if ('error' in plan) {
      this.env.say(plan.error);
      return false;
    }
    return this.spiralCreate(plan);
  }

  /** Cria o caracol com `stairFromGenerator` (uma transação, um passo de desfazer). Origem `spiral`, com os parâmetros. */
  private spiralCreate(plan: SpiralPlan): boolean {
    const comps = componentsFromParts([{ kind: 'run', run: plan.run }]);
    const out: { r?: StairCommandResult } = {};
    this.env.transaction(this.t('tl_undo_create_stair'), () => {
      out.r = stairFromGenerator(this.env, comps, { ...this.creation(), generatedBy: 'spiral' });
    });
    const r = out.r;
    if (!r || 'error' in r) {
      this.env.say(this.t('tl_msg_stair_fail', { error: r?.error ?? this.t('tl_msg_save_failed') }));
      return false;
    }
    // O aviso fixo de saída de emergência vem em todo caracol: a mensagem traz só o aviso que muda o projeto.
    const aviso = stairIssuesOf(this.env.project(), r.id).find((i) => i.stairId === r.id && i.severity === 'warning' && i.code !== 'stair-spiral-exit');
    const extra = aviso ? this.t('tl_msg_warning_note', { msg: aviso.message }) : '';
    this.env.say(this.t('tl_msg_spiral_created', {
      n: plan.risers,
      angle: angleText(unitsOf(this.env.project()), plan.run.spiral.sweep),
      note: extra,
    }));
    this.reset();
    return true;
  }

  /** Digitação no caracol: raio externo (m) no 2º passo, depois a varredura (graus). */
  private spiralType(text: string): boolean {
    if (this.origin === null) return false;
    const v = parseNumber(text);
    if (v === null || !(v > 0)) {
      this.env.say(this.sp.start === null ? this.t('tl_msg_invalid_radius_m') : this.t('tl_msg_invalid_sweep'));
      return false;
    }
    if (this.sp.start === null) {
      if (!(v > this.innerR)) {
        this.env.say(this.t('tl_msg_spiral_radius_gt_inner', { outer: mText(v, this.uiLang()), inner: mText(this.innerR, this.uiLang()) }));
        return false;
      }
      const d = sub(this.sp.cursor, this.origin);
      this.sp = { outer: v, start: Math.atan2(d.y, d.x), sweep: 0, last: null, cursor: this.sp.cursor };
      this.sp.last = this.sp.start;
      this.env.say(spiralSweepHint(unitsOf(this.env.project()), this.uiLang()));
      this.items = this.spiralItems();
      return true;
    }
    // Varredura digitada: no sentido já dado pelo giro, ou no da opção se o cursor ainda não girou.
    const sign = this.sp.sweep !== 0 ? Math.sign(this.sp.sweep) : this.opts.spiralSense === 'cw' ? -1 : 1;
    this.sp.sweep = sign * v * DEG;
    return this.spiralConfirm();
  }

  /** Prévia do caracol no estado atual: o círculo e o raio no 2º passo; o caracol completo no 3º (ou com varredura digitada). */
  private spiralItems(): PreviewItem[] {
    const c = this.origin;
    if (!c) return [];
    const cur = this.sp.cursor;
    const d = sub(cur, c);
    if (this.sp.start === null) return this.radiusItems(c, cur, d);
    return this.sweepItems(c, cur);
  }

  /** 2º passo: círculo do raio externo e do interno, raio na direção do cursor, com o valor na dica. */
  private radiusItems(c: Vec2, cur: Vec2, d: Vec2): PreviewItem[] {
    const r = this.opts.spiralOuter ?? len(d);
    const th = len(d) > 1e-9 ? Math.atan2(d.y, d.x) : 0;
    const u = { x: Math.cos(th), y: Math.sin(th) };
    const items: PreviewItem[] = [];
    if (r > this.innerR) {
      items.push({ kind: 'polygon', ring: circleRing(c, r), dashed: true }, { kind: 'polygon', ring: circleRing(c, this.innerR), dashed: true });
    }
    items.push({ kind: 'line', a: c, b: add(c, mul(u, r)), dashed: true });
    const sw = this.typedSweep();
    if (sw !== null && r > this.innerR) {
      const lim = this.limitsNow();
      if (!('error' in lim)) {
        const units = unitsOf(this.env.project());
        const plan = planSpiralRun({ center: c, rInner: this.innerR, rOuter: r, startAngle: th, sweep: sw, H: lim.H, maxRiser: lim.maxRiser, units });
        if (!('error' in plan)) items.push(...caracolItems(plan, cur, units, this.treadContext(plan.risers, plan.riserHeight), this.uiLang()));
      }
    }
    items.push({ kind: 'label', at: cur, text: this.t('tl_lbl_outer_radius', { r: mText(r, this.uiLang()) }) });
    if (sw === null) this.env.say(this.t('tl_msg_outer_radius_pick', { r: mText(r, this.uiLang()) }));
    return items;
  }

  /** 3º passo: o caracol com a varredura atual; abaixo de 30° só o croqui de referência, com o aviso. */
  private sweepItems(c: Vec2, cur: Vec2): PreviewItem[] {
    const lim = this.limitsNow();
    const sw = this.sp.sweep;
    const units = unitsOf(this.env.project());
    const label: PreviewItem = { kind: 'label', at: cur, text: this.t('tl_lbl_sweep', { angle: angleText(units, sw) }) };
    if ('error' in lim || this.sp.outer === null || this.sp.start === null) {
      this.env.say('error' in lim ? lim.error : this.t('tl_msg_spiral_missing_radius'));
      return [label];
    }
    const outer = this.sp.outer;
    const start = this.sp.start;
    const plan = planSpiralRun({ center: c, rInner: this.innerR, rOuter: outer, startAngle: start, sweep: sw, H: lim.H, maxRiser: lim.maxRiser, units });
    if ('error' in plan) {
      // Abaixo de 30° (ou fora dos limites) não há caracol: mostra o raio e o ângulo inicial, com o motivo na barra.
      const short = Math.abs(sw) < SPIRAL_MIN_SWEEP;
      const minSweep = formatQuantity(units, 'angle', SPIRAL_MIN_SWEEP, { trim: true });
      this.env.say(short ? this.t('tl_msg_sweep_min', { angle: angleText(units, sw), min: minSweep }) : plan.error);
      const u = { x: Math.cos(start), y: Math.sin(start) };
      return [
        { kind: 'polygon', ring: circleRing(c, outer), dashed: true },
        { kind: 'line', a: c, b: add(c, mul(u, outer)), dashed: true },
        label,
      ];
    }
    this.env.say(this.t('tl_msg_sweep_confirm', { angle: angleText(units, sw) }));
    return caracolItems(plan, cur, units, this.treadContext(plan.risers, plan.riserHeight), this.uiLang());
  }
}
