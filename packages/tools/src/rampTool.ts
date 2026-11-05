import { dist, len, sub, type Vec2 } from '@hestia/geom';
import { formatRampPercent, formatRampSlope, rampMaxSlope, rampTopLevel, unitsOf, type RampInputMode, type RampType } from '@hestia/model';
import { liveRemaining, optimizeRamp, planRamp, planRampFree, rampIssuesOf, rebuildPathFromSegments, type RampPlan } from '@hestia/engine';
import { ToolBase } from './base.ts';
import { parseNumber } from './numeric.ts';
import { createRampFromPlan, draftRamp, rampRise, rampTypeId, type RampCommandResult } from './rampCommands.ts';
import { connectedLineAt, draftAngleItems } from './anglePreview.ts';
import { rotuloInclinacao, textoResultaInclinacao } from './rampLiveMessages.ts';
import { DEFAULT_RAMP_OPTIONS, type RampToolOptions } from './rampOptions.ts';
import { RampLiveSession, type LiveEvent, type RampLiveConfig } from './rampLiveSession.ts';
import { rampPartsPreview } from './rampPreview.ts';
import type { PointerInfo, PreviewItem } from './types.ts';
import { fmtNumLang, type Lang } from './i18n.ts';

/** Distância mínima (m) entre o ponto inicial e o cursor para definir a direção. */
const MIN_DIRECTION = 0.01;
/** Tolerância (m) para a nota do modo 'slope' comparar o clique com o comprimento necessário. */
const CLICK_EPS = 0.005;

/** Metros com duas casas no separador do idioma (9,6 → "9,60"). */
const mText = (m: number, lang: Lang): string => fmtNumLang(m, 2, lang);

/** "1 lance" / "4 lances". */
const flightsText = (n: number, lang: Lang): string => (lang === 'en' ? `${n} ${n === 1 ? 'flight' : 'flights'}` : `${n} ${n === 1 ? 'lance' : 'lances'}`);

/**
 * Rampa reta, em L ou em U, criada pronta por cliques. O 1º clique é o centro da borda de início; o movimento mostra a
 * prévia (croqui, piso dos lances e rótulo). O 2º clique define a direção e, no modo 'length', o comprimento total; no
 * modo 'slope', a inclinação manda e a rampa pode terminar antes ou passar do clique (com nota). Digitar um número é o
 * ângulo de subida em graus: sem comprimento clicado, vale a inclinação da barra (ou a padrão do tipo). Cada criação é
 * UMA transação ("Criar rampa"); depois dela a ferramenta continua pronta e Esc sai.
 */
export class RampTool extends ToolBase {
  readonly id = 'ramp';
  readonly label = 'Rampa';
  override get hint(): string {
    return this.t('tl_hint_ramp');
  }
  private origin: Vec2 | null = null;
  /** Sessão do desenho livre (forma 'free'); criada na primeira necessidade. */
  private session: RampLiveSession | null = null;
  /** Dados da última chamada de `build` para o rótulo ao vivo (falta/sobra); evita recalcular o desnível. */
  private live: { H: number; type: RampType; mode: RampInputMode; slope: number | undefined } | null = null;

  private get opts(): RampToolOptions {
    return this.env.options().ramp ?? DEFAULT_RAMP_OPTIONS;
  }

  private get free(): boolean {
    return this.opts.shape === 'free';
  }

  protected reset(): void {
    this.origin = null;
    this.session?.cancel();
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.origin !== null || (this.session?.state ?? 'IDLE') !== 'IDLE';
  }

  override start(): void {
    this.reset();
    this.env.say(this.free ? this.t('tl_hint_ramp_free') : this.t('tl_hint_ramp'));
  }

  override inputPrompt(): string | null {
    if (this.free) return this.session?.state === 'ORIGIN' || this.session?.state === 'DRAWING' ? this.t('tl_inp_length_m') : null;
    return this.origin !== null ? this.t('tl_inp_angle') : null;
  }

  /** Enter: no desenho livre conclui (com aviso se falta desnível); nos demais, o padrão da base. */
  override confirm(): void {
    if (this.free && this.session && this.session.state !== 'IDLE') {
      this.handleLive(this.session.finish());
      return;
    }
    super.confirm();
  }

  /** Esc: descarta o rascunho; um 2º Esc sai da ferramenta (como nas demais). */
  override cancel(): void {
    if (this.free && this.busy()) {
      this.reset();
      this.items = [];
      this.env.say(this.t('tl_hint_ramp_free'));
      return;
    }
    super.cancel();
  }

  /** Backspace no desenho livre volta um ponto; sem rascunho devolve false (o Delete segue para a seleção). */
  deleteKey(): boolean {
    if (!this.free || !this.session) return false;
    const ok = this.session.back();
    if (ok) {
      this.items = this.session.preview();
      this.env.say(this.session.hint());
    }
    return ok;
  }

  /**
   * Tecla A no desenho livre: ajusta os trechos desenhados e a inclinação à norma do tipo (`optimizeRamp`), troca o
   * rascunho pelo resultado e diz o que mudou. Não usa `resolveRamps` nem booleanas.
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
    const segments = pts.slice(1).map((p, i) => dist(pts[i]!, p));
    const D = Math.max(cfg.landingDepth ?? Math.max(cfg.width, cfg.type.landingMinLength), cfg.width);
    const res = optimizeRamp({ H: cfg.H, type: cfg.type, segments, mode: 'auto', ...(cfg.slope !== undefined ? { slope: cfg.slope } : {}), turnLanding: D });
    const slopeAntes = this.opts.slope;
    if (cfg.mode === 'slope') this.setOptions({ slope: res.slope });
    const novo = this.liveSession();
    if (!novo || !novo.load(rebuildPathFromSegments(pts, res.segments))) {
      if (cfg.mode === 'slope') this.setOptions({ slope: slopeAntes });
      this.liveSession()?.load(pts);
      this.items = novo?.move(pts[pts.length - 1]!, 0) ?? [];
      this.env.say(this.t('tl_msg_adjust_fail'));
      return true;
    }
    this.items = novo.move(novo.points[novo.points.length - 1]!, 0);
    this.env.say(res.note);
    return true;
  }

  private setOptions(patch: Partial<RampToolOptions>): void {
    const next = { ...this.opts, ...patch };
    if (this.env.setOptions) this.env.setOptions({ ramp: next });
    else this.env.options().ramp = next;
  }

  override move(p: PointerInfo): void {
    if (this.free) {
      this.liveMove(p);
      return;
    }
    const inf = this.snap(p, { from: this.origin ?? undefined });
    if (this.origin === null) {
      this.items = [{ kind: 'point', at: inf.point }];
      return;
    }
    const dir = sub(inf.point, this.origin);
    if (len(dir) < MIN_DIRECTION) {
      this.items = [{ kind: 'point', at: this.origin }];
      return;
    }
    const plan = this.build(dir, len(dir));
    if ('error' in plan) {
      this.env.say(plan.error);
      this.items = [{ kind: 'point', at: this.origin }];
      return;
    }
    this.env.say(this.t('tl_hint_ramp_dir'));
    const label: PreviewItem = {
      kind: 'label',
      at: inf.point,
      text: this.labelText(plan, len(dir)),
    };
    this.items = [...rampPartsPreview(plan), label];
    const previous = connectedLineAt(this.env.project(), this.env.levelId(), this.origin, this.env.metersPerPixel(), this.env.areaPlanId?.());
    this.items.push(...draftAngleItems({ previous, joint: this.origin, current: inf.point, mpp: this.env.metersPerPixel(), units: unitsOf(this.env.project()), avoid: [inf.point] }));
  }

  /**
   * Rótulo da prévia. Modo 'slope': inclinação de trabalho e falta/sobra de desnível até o cursor (faltam / alcançado /
   * passou). Modo 'length': a inclinação que resulta do comprimento e se fica dentro da norma.
   */
  private labelText(plan: RampPlan, clickLength: number): string {
    const base = `${flightsText(plan.flights, this.uiLang())} · ${mText(plan.pathLength, this.uiLang())} m`;
    const lv = this.live;
    if (!lv) return `${formatRampSlope(plan.slope)} · ${base}`;
    if (lv.mode === 'slope') {
      const r = liveRemaining({ H: lv.H, mode: 'slope', type: lv.type, ...(lv.slope !== undefined ? { slope: lv.slope } : {}), pathLength: clickLength });
      if (r.mode !== 'slope') return base;
      const falta = r.status === 'falta' ? r.falta : r.status === 'passou' ? -r.excess : 0;
      return `${rotuloInclinacao(r.slope, falta, this.uiLang())} · ${base}`;
    }
    const landings = plan.pathLength - plan.flightLengths.reduce((a, b) => a + b, 0);
    const r = liveRemaining({ H: lv.H, mode: 'length', type: lv.type, ...(lv.slope !== undefined ? { slope: lv.slope } : {}), pathLength: plan.pathLength, landingsLength: landings });
    if (r.mode !== 'length') return base;
    const max = lv.slope ?? rampMaxSlope(lv.type) ?? null;
    return `${formatRampSlope(plan.slope)} · ${base} · ${textoResultaInclinacao(r.slope, max, r.faltaLength, this.uiLang())}`;
  }

  override click(p: PointerInfo): void {
    if (this.free) {
      this.liveClick(p);
      return;
    }
    const inf = this.snap(p, { from: this.origin ?? undefined });
    if (this.origin === null) {
      this.origin = inf.point;
      this.env.say(this.t('tl_hint_ramp_dir'));
      return;
    }
    const dir = sub(inf.point, this.origin);
    if (len(dir) < MIN_DIRECTION) {
      this.env.say(this.t('tl_msg_move_cursor_direction'));
      return;
    }
    this.create(dir, len(dir));
  }

  override type(text: string): boolean {
    if (this.free) return this.liveType(text);
    if (this.origin === null) return false;
    const v = parseNumber(text);
    if (v === null) {
      this.env.say(this.t('tl_msg_invalid_angle'));
      return false;
    }
    const a = (v * Math.PI) / 180;
    return this.create({ x: Math.cos(a), y: Math.sin(a) });
  }

  /**
   * Plano da rampa para a direção dada. `clickLength` ausente (ângulo digitado) força o modo 'slope' com a inclinação da
   * barra (ou a padrão do tipo) e a nota "Sem clique de comprimento". No modo 'slope' clicado, a nota diz se a rampa
   * termina antes ou passa do clique.
   */
  private build(dir: Vec2, clickLength?: number): RampPlan | { error: string } {
    const p = this.env.project();
    const o = this.opts;
    const typeId = rampTypeId(p, o.typeId);
    const type = typeId ? p.rampTypes[typeId] : undefined;
    if (!typeId || !type) return { error: this.t('tl_msg_no_ramp_type') };
    const draft = draftRamp(p, o, this.env.levelId());
    if (!draft) return { error: this.t('tl_msg_no_ramp_type') };
    const H = rampRise(p, draft);
    if (!(H > 0)) {
      return {
        error: rampTopLevel(p, draft)
          ? this.t('tl_msg_top_not_above')
          : this.t('tl_msg_no_top_level'),
      };
    }
    const width = o.width ?? type.defaultWidth;
    const noClick = clickLength === undefined;
    const mode: RampInputMode = noClick ? 'slope' : o.mode;
    const slope = o.slope ?? type.defaultSlope;
    this.live = { H, type, mode, slope: mode === 'slope' ? slope : o.slope };
    const plan = planRamp({
      start: this.origin!,
      dir,
      H,
      type,
      shape: o.shape,
      turn: o.turn,
      width,
      ...(o.landingDepth !== undefined ? { landingDepth: o.landingDepth } : {}),
      mode,
      ...(mode === 'length' ? { length: clickLength } : { slope }),
    });
    if ('error' in plan) return plan;
    let note: string | undefined;
    if (noClick) {
      note = this.t('tl_msg_no_length_click', { slope: formatRampSlope(plan.slope) });
    } else if (mode === 'slope') {
      const pct = formatRampPercent(plan.slope);
      if (clickLength > plan.pathLength + CLICK_EPS) {
        note = this.t('tl_msg_slope_ends_before', { pct, d: mText(plan.pathLength, this.uiLang()), c: mText(clickLength, this.uiLang()) });
      } else if (clickLength < plan.pathLength - CLICK_EPS) {
        note = this.t('tl_msg_slope_passes', { pct, d: mText(plan.pathLength, this.uiLang()), c: mText(clickLength, this.uiLang()) });
      }
    }
    return note ? { ...plan, note } : plan;
  }

  /** Cria a rampa com a direção dada (e o comprimento, no 2º clique), em um passo de desfazer. Mantém a ferramenta pronta. */
  private create(dir: Vec2, length?: number): boolean {
    const plan = this.build(dir, length);
    if ('error' in plan) {
      this.env.say(plan.error);
      return false;
    }
    return this.commit(plan, length === undefined ? 'slope' : this.opts.mode);
  }

  /** Grava o plano em UMA transação "Criar rampa" e avisa. `freePath` só na forma livre. */
  private commit(plan: RampPlan, inputMode: RampInputMode, freePath?: Vec2[]): boolean {
    const p = this.env.project();
    const o = this.opts;
    const typeId = rampTypeId(p, o.typeId);
    const type = typeId ? p.rampTypes[typeId] : undefined;
    if (!typeId || !type) {
      this.env.say(this.t('tl_msg_no_ramp_type'));
      return false;
    }
    const slopeTarget = inputMode === 'slope' ? (o.slope ?? type.defaultSlope) : null;
    const out: { r?: RampCommandResult } = {};
    this.env.transaction(this.t('tl_undo_create_ramp'), () => {
      out.r = createRampFromPlan(this.env, plan, {
        typeId,
        levelId: this.env.levelId(),
        shape: o.shape,
        turn: o.turn,
        inputMode,
        slopeTarget,
        topLevelId: o.topLevelId,
        baseOffset: o.baseOffset,
        topOffset: o.topOffset,
        height: o.height,
        mark: this.env.options().placementMark ?? '',
        comments: this.env.options().placementComments ?? '',
        ...(freePath ? { freePath } : {}),
      });
    });
    const r = out.r;
    if (!r || 'error' in r) {
      this.env.say(this.t('tl_msg_ramp_fail', { error: r?.error ?? this.t('tl_msg_save_failed') }));
      return false;
    }
    const aviso = rampIssuesOf(this.env.project(), r.id).find((i) => i.severity === 'warning');
    const nota = plan.note ? ` ${plan.note}` : '';
    const avisoText = aviso ? ` Aviso: ${aviso.message}` : '';
    const lang = this.uiLang();
    this.env.say(this.t('tl_msg_ramp_created', {
      flights: flightsText(plan.flights, lang),
      slope: formatRampSlope(plan.slope),
      length: mText(plan.pathLength, lang),
      note: nota,
      warning: avisoText,
    }));
    this.reset();
    this.items = [];
    return true;
  }

  // ---- desenho livre -----------------------------------------------------------------------------------------

  /** Dados do cálculo ao vivo a partir das opções e do nível; `error` pelos mesmos motivos do `build`. */
  private liveConfig(): RampLiveConfig | { error: string } {
    const p = this.env.project();
    const o = this.opts;
    const typeId = rampTypeId(p, o.typeId);
    const type = typeId ? p.rampTypes[typeId] : undefined;
    const draft = draftRamp(p, o, this.env.levelId());
    if (!typeId || !type || !draft) return { error: this.t('tl_msg_no_ramp_type') };
    const H = rampRise(p, draft);
    if (!(H > 0)) {
      return {
        error: rampTopLevel(p, draft)
          ? this.t('tl_msg_top_not_above')
          : this.t('tl_msg_no_top_level'),
      };
    }
    return {
      H,
      type,
      mode: o.mode,
      ...(o.mode === 'slope' ? { slope: o.slope ?? type.defaultSlope } : o.slope !== undefined ? { slope: o.slope } : {}),
      width: o.width ?? type.defaultWidth,
      ...(o.landingDepth !== undefined ? { landingDepth: o.landingDepth } : {}),
      lang: this.uiLang(),
    };
  }

  /** Sessão configurada com as opções atuais, ou null (com a mensagem dita) se faltam dados. */
  private liveSession(): RampLiveSession | null {
    const cfg = this.liveConfig();
    if ('error' in cfg) {
      this.env.say(cfg.error);
      return null;
    }
    if (!this.session) this.session = new RampLiveSession(cfg);
    else this.session.configure(cfg);
    return this.session;
  }

  private liveFrom(): Vec2 | undefined {
    const pts = this.session?.points ?? [];
    return pts[pts.length - 1];
  }

  private liveMove(p: PointerInfo): void {
    const inf = this.snap(p, { from: this.liveFrom() });
    const s = this.liveSession();
    if (!s) {
      this.items = [{ kind: 'point', at: inf.point }];
      return;
    }
    this.items = s.move(inf.point, this.env.metersPerPixel());
  }

  private liveClick(p: PointerInfo): void {
    const inf = this.snap(p, { from: this.liveFrom() });
    const s = this.liveSession();
    if (!s) return;
    this.handleLive(s.click(inf.point), inf.point);
  }

  private liveType(text: string): boolean {
    const s = this.liveSession();
    if (!s) return false;
    const v = parseNumber(text);
    if (v === null) {
      this.env.say(this.t('tl_msg_invalid_length_m'));
      return false;
    }
    const ev = s.typeLength(v);
    this.handleLive(ev);
    return ev.kind === 'added' || ev.kind === 'done';
  }

  /** Reage ao resultado de um clique, Enter ou comprimento digitado. */
  private handleLive(ev: LiveEvent, at?: Vec2): void {
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

  /** Cria a rampa do trajeto livre em UMA transação "Criar rampa" (Ctrl+Z desfaz). */
  private createFree(path: Vec2[]): void {
    const cfg = this.liveConfig();
    if ('error' in cfg) {
      this.env.say(cfg.error);
      return;
    }
    const plan = planRampFree(path, cfg.H, cfg.type, {
      width: cfg.width,
      mode: cfg.mode,
      ...(cfg.slope !== undefined ? { slope: cfg.slope } : {}),
      ...(cfg.landingDepth !== undefined ? { landingDepth: cfg.landingDepth } : {}),
    });
    if ('error' in plan) {
      // Mantém o rascunho (volta a DRAWING com os pontos) para o usuário corrigir com Backspace ou mexendo o último ponto.
      const s = this.session;
      s?.load(path);
      this.items = s ? s.move(path[path.length - 1]!, 0) : [];
      this.env.say(this.t('tl_msg_ramp_create_fail_back', { error: plan.error }));
      return;
    }
    this.items = [];
    this.items = [];
    this.commit(plan, cfg.mode, path);
  }
}
