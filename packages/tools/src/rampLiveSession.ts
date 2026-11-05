import { add, dist, dot, len, mul, perp, sub, type Vec2 } from '@hestia/geom';
import { rampMaxSlope, type RampType } from '@hestia/model';
import {
  FREE_COLLINEAR_ANGLE,
  FREE_MAX_TURN_ANGLE,
  LIVE_RISE_TOL,
  layoutSegment,
  layoutUntilRise,
  liveRemaining,
  maxRiseFor,
  type LiveRemaining,
  type SegmentLayout,
} from '@hestia/engine';
import { rotuloInclinacao, textoResultaInclinacao } from './rampLiveMessages.ts';
import { fmtNumLang, t as translate, type Lang } from './i18n.ts';
import type { PreviewItem } from './types.ts';

/**
 * Sessão do desenho "livre" da rampa: estado PURO (sem ambiente nem DOM) da máquina IDLE → ORIGIN → DRAWING → REACHED.
 * A prévia de `move` só usa `layoutSegment`/`liveRemaining` e o cache dos trechos confirmados: nada de `resolveRamps`,
 * lista de avisos, aberturas de laje nem operações booleanas (rodaria a cada pixel).
 */

/** Estado da máquina de cliques. */
export type LiveState = 'IDLE' | 'ORIGIN' | 'DRAWING' | 'REACHED';

/** Dados que a sessão precisa para calcular o desnível; a ferramenta repassa a cada chamada (`configure`). */
export interface RampLiveConfig {
  /** Desnível total (m). */
  H: number;
  type: RampType;
  mode: 'slope' | 'length';
  /** Modo 'slope': inclinação de trabalho; modo 'length': meta. Ausente = padrão do tipo (ou máximo da norma). */
  slope?: number;
  /** Largura do lance (m). */
  width: number;
  /** Profundidade do patamar de giro (m); padrão max(largura, patamar mínimo do tipo). */
  landingDepth?: number;
  /** Idioma das mensagens ao vivo (ausente = português). */
  lang?: Lang;
}

/** O que um clique, Enter ou comprimento digitado produziu. */
export type LiveEvent =
  | { kind: 'added'; state: LiveState; message?: string }
  | { kind: 'ignored'; message: string }
  | { kind: 'warn'; message: string }
  | { kind: 'done'; path: Vec2[]; /** Desnível que falta (m, modo 'slope'); 0 se fechou. */ falta: number };

/** Máximo de vértices do trajeto. */
export const LIVE_MAX_VERTICES = 40;
/** Trecho menor que isso (m) é ignorado. */
const MIN_SEGMENT = 0.01;
/** Clique a menos que isso (m) do último vértice conclui (faz o papel do duplo clique). */
const REPEAT_CLICK = 0.05;
/** Lance mínimo (m) entre dois patamares de giro. */
const MIN_FLIGHT = 0.05;



interface Seg {
  a: Vec2;
  b: Vec2;
  dir: Vec2;
  len: number;
  tStart: number;
  tEnd: number;
  /** Polígono do patamar de giro no início do trecho (null se não há giro). */
  ring: Vec2[] | null;
  lay: SegmentLayout;
  riseBefore: number;
  carryBefore: number;
  effBefore: number;
  landBefore: number;
  riseAfter: number;
  carryAfter: number;
  items: PreviewItem[];
}

type Eval =
  | { ok: false; message: string }
  | {
      ok: true;
      short: boolean;
      v: Vec2;
      dir: Vec2;
      L: number;
      tStart: number;
      ring: Vec2[] | null;
      prevLay: SegmentLayout | null;
      riseBefore: number;
      carryBefore: number;
      effBefore: number;
      landBefore: number;
      lay: SegmentLayout;
      end: Vec2;
      truncated: boolean;
      r: LiveRemaining | null;
    };

const landSum = (l: SegmentLayout): number => l.pieces.reduce((a, p) => (p.kind === 'landing' ? a + p.length : a), 0);

/** Retângulo do pedaço `[u0, u1]` do trecho que sai de `a` na direção `dir`, com a largura `w`. */
function rect(a: Vec2, dir: Vec2, u0: number, u1: number, w: number): Vec2[] {
  const n = mul(perp(dir), w / 2);
  const p0 = add(a, mul(dir, u0));
  const p1 = add(a, mul(dir, u1));
  return [add(p0, n), add(p1, n), sub(p1, n), sub(p0, n)];
}

/** Patamar de giro com mitra, recuado `t` em cada lado do vértice (mesma geometria do `planRampFree`). */
function turnRing(v: Vec2, dA: Vec2, dB: Vec2, w: number, t: number): Vec2[] {
  const cr = dA.x * dB.y - dA.y * dB.x;
  const sgn = cr >= 0 ? 1 : -1;
  const nA = perp(dA);
  const nB = perp(dB);
  const h = (sgn * w) / 2;
  const miter = mul(add(nA, nB), h / (1 + dot(nA, nB)));
  const aIn = add(sub(v, mul(dA, t)), mul(nA, h));
  const aOut = sub(sub(v, mul(dA, t)), mul(nA, h));
  const bIn = add(add(v, mul(dB, t)), mul(nB, h));
  const bOut = sub(add(v, mul(dB, t)), mul(nB, h));
  return [aIn, add(v, miter), bIn, bOut, sub(v, miter), aOut];
}

export class RampLiveSession {
  private cfg: RampLiveConfig;
  private pts: Vec2[] = [];
  private segs: Seg[] = [];
  private reached = false;
  private warned = false;
  private cursor: Vec2 | null = null;
  private dirty = true;
  private items: PreviewItem[] = [];
  /** Itens dos trechos 0..n-2 (o último é refeito a cada `move`, pois o giro no fim depende do cursor). */
  private frozen: PreviewItem[] = [];

  constructor(cfg: RampLiveConfig) {
    this.cfg = cfg;
  }

  /** Idioma das mensagens ao vivo (ausente = português). */
  private lang(): Lang {
    return this.cfg.lang ?? 'pt';
  }

  // ---- configuração ------------------------------------------------------------------------------------------

  /** Atualiza os dados de cálculo; se mudaram, refaz o cache dos trechos confirmados. */
  configure(cfg: RampLiveConfig): void {
    const c = this.cfg;
    const same =
      c.H === cfg.H && c.mode === cfg.mode && c.slope === cfg.slope && c.width === cfg.width && c.landingDepth === cfg.landingDepth && c.type === cfg.type;
    this.cfg = cfg;
    if (same) return;
    this.rebuildAll();
    this.dirty = true;
  }

  // ---- leitura -----------------------------------------------------------------------------------------------

  get state(): LiveState {
    if (this.pts.length === 0) return 'IDLE';
    if (this.pts.length === 1) return 'ORIGIN';
    return this.reached ? 'REACHED' : 'DRAWING';
  }

  /** Vértices confirmados (cópia). */
  get points(): Vec2[] {
    return this.pts.slice();
  }

  preview(): PreviewItem[] {
    return this.items;
  }

  /** Desnível que ainda falta nos trechos confirmados (m, modo 'slope'; 0 no modo 'length'). */
  get faltaConfirmada(): number {
    const last = this.segs[this.segs.length - 1];
    if (!last || this.cfg.mode !== 'slope') return 0;
    return Math.max(0, this.cfg.H - last.riseAfter);
  }

  /** Dica da barra de status para o estado atual. */
  hint(): string {
    switch (this.state) {
      case 'IDLE':
        return translate(this.lang(), 'tl_hint_ramp_live_idle');
      case 'ORIGIN':
        return translate(this.lang(), 'tl_hint_ramp_live_origin');
      case 'DRAWING':
        return translate(this.lang(), 'tl_hint_ramp_live_drawing');
      case 'REACHED':
        return translate(this.lang(), 'tl_hint_ramp_live_reached');
    }
  }

  // ---- ações -------------------------------------------------------------------------------------------------

  /** Clique no ponto `c`: define a origem, confirma um trecho ou (no último vértice / em REACHED) conclui. */
  click(c: Vec2): LiveEvent {
    const avisado = this.warned;
    this.warned = false;
    this.dirty = true;
    if (this.pts.length === 0) {
      this.pts = [c];
      this.segs = [];
      this.reached = false;
      this.frozen = [];
      return { kind: 'added', state: 'ORIGIN' };
    }
    if (this.reached) return this.finish();
    const last = this.pts[this.pts.length - 1]!;
    const d = dist(c, last);
    if (this.pts.length >= 2 && d < REPEAT_CLICK) {
      this.warned = avisado;
      return this.finish();
    }
    if (d < MIN_SEGMENT) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_move_cursor_last') };
    if (this.pts.length >= LIVE_MAX_VERTICES) {
      return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_max_points', { n: LIVE_MAX_VERTICES }) };
    }
    const ev = this.evaluate(c);
    if (!ev) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_click_start') };
    if (!ev.ok) return { kind: 'ignored', message: ev.message };
    if (ev.short) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_segment_short_after_landing') };
    this.append(ev);
    const state = this.state;
    return state === 'REACHED'
      ? { kind: 'added', state, message: translate(this.lang(), ev.truncated ? 'tl_msg_top_reached_truncated_ramp' : 'tl_msg_top_reached_cap') }
      : { kind: 'added', state };
  }

  /** Movimento do cursor: atualiza a prévia (ignora movimentos menores que 1 px, `mpp` = metros por pixel). */
  move(p: Vec2, mpp = 0): PreviewItem[] {
    if (!this.dirty && this.cursor && mpp > 0 && dist(p, this.cursor) < mpp) return this.items;
    this.cursor = p;
    this.dirty = false;
    if (this.pts.length === 0) {
      this.items = [{ kind: 'point', at: p }];
      return this.items;
    }
    const lastSeg = this.segs[this.segs.length - 1];
    if (this.reached && lastSeg) {
      const v = this.pts[this.pts.length - 1]!;
      this.items = [...this.frozen, ...lastSeg.items, { kind: 'point', at: v }, { kind: 'label', at: v, text: translate(this.lang(), 'tl_msg_top_reached_cap') }];
      return this.items;
    }
    const ev = this.evaluate(p);
    if (!ev) return this.items;
    const base = lastSeg ? [...this.frozen, ...lastSeg.items] : [];
    if (!ev.ok) {
      const v = this.pts[this.pts.length - 1]!;
      this.items = [...base, { kind: 'line', a: v, b: p, dashed: true, tone: 'invalid' }, { kind: 'label', at: p, text: ev.message }];
      return this.items;
    }
    if (ev.short) {
      this.items = [...base, { kind: 'line', a: ev.v, b: p, dashed: true, tone: 'path' }];
      return this.items;
    }
    const w = this.cfg.width;
    const prev = lastSeg && ev.prevLay && ev.tStart > 0 ? this.segItems(lastSeg.a, lastSeg.dir, lastSeg.tStart, ev.prevLay, lastSeg.ring) : lastSeg?.items ?? [];
    const out: PreviewItem[] = [...this.frozen, ...prev];
    out.push(...this.pieceItems(ev.v, ev.dir, ev.tStart, ev.lay, ev.ring, w));
    if (ev.truncated) {
      out.push({ kind: 'line', a: ev.end, b: p, dashed: true, tone: 'path' });
      out.push({ kind: 'point', at: ev.end });
    }
    out.push({ kind: 'label', at: p, text: this.labelFor(ev.r) });
    this.items = out;
    return out;
  }

  /** Backspace: remove o último vértice (REACHED → DRAWING → ORIGIN → IDLE). Devolve false se não há o que voltar. */
  back(): boolean {
    if (this.pts.length === 0) return false;
    this.pts.pop();
    this.warned = false;
    this.dirty = true;
    this.rebuildAll();
    this.items = [];
    if (this.cursor) this.move(this.cursor);
    return true;
  }

  /**
   * Enter / clique repetido: conclui. Com desnível faltando (modo 'slope'), o 1º pedido só avisa e o 2º conclui assim.
   * Devolve o trajeto e volta a IDLE.
   */
  finish(): LiveEvent {
    if (this.pts.length < 2) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_click_second_ramp') };
    const falta = this.faltaConfirmada;
    if (falta > LIVE_RISE_TOL && !this.warned) {
      this.warned = true;
      return { kind: 'warn', message: translate(this.lang(), 'tl_msg_missing_rise_warn', { d: fmtNumLang(falta, 2, this.lang()) }) };
    }
    const path = this.pts.slice();
    this.cancel();
    return { kind: 'done', path, falta: falta > LIVE_RISE_TOL ? falta : 0 };
  }

  /**
   * Substitui o rascunho pelos vértices `path` (refaz cada trecho pelos mesmos cliques). Devolve false, mantendo o
   * rascunho anterior, se algum vértice não é aceito (trecho curto demais, retorno agudo).
   */
  load(path: Vec2[]): boolean {
    const antes = this.pts.slice();
    this.cancel();
    for (const p of path) {
      const ev = this.click(p);
      if (ev.kind !== 'added') {
        this.restoreTo(antes);
        return false;
      }
    }
    this.warned = false;
    return this.pts.length === path.length;
  }

  private restoreTo(pts: Vec2[]): void {
    this.cancel();
    for (const p of pts) this.click(p);
    this.warned = false;
  }

  /** Esc: descarta o rascunho inteiro. */
  cancel(): void {
    this.pts = [];
    this.segs = [];
    this.frozen = [];
    this.items = [];
    this.reached = false;
    this.warned = false;
    this.cursor = null;
    this.dirty = true;
  }

  /** Comprimento digitado (m) do próximo trecho, na direção do cursor. */
  typeLength(m: number): LiveEvent {
    if (this.pts.length === 0) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_click_start_first') };
    if (!(m >= MIN_SEGMENT)) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_invalid_length') };
    const v = this.pts[this.pts.length - 1]!;
    const d = this.cursor ? sub(this.cursor, v) : null;
    const l = d ? len(d) : 0;
    if (!d || l < MIN_SEGMENT) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_move_cursor_then_length') };
    return this.click(add(v, mul(d, m / l)));
  }

  // ---- cálculo -----------------------------------------------------------------------------------------------

  private get slopeWork(): number {
    const { type, slope } = this.cfg;
    return this.cfg.mode === 'slope' ? (slope ?? type.defaultSlope) : (slope ?? rampMaxSlope(type) ?? type.defaultSlope);
  }

  private layout(d: number, carry: number): SegmentLayout {
    const s = this.slopeWork;
    return layoutSegment(d, carry, s, maxRiseFor(this.cfg.type, s) ?? 0, this.cfg.type.landingMinLength);
  }

  /** Recuo do patamar de giro (m) para o ângulo de giro `theta`: área >= D x D e sem autointerseção. */
  private recuo(theta: number): number {
    const w = this.cfg.width;
    const D = Math.max(this.cfg.landingDepth ?? Math.max(w, this.cfg.type.landingMinLength), w);
    return Math.max((D * D) / (2 * w), (w / 2) * Math.tan(theta / 2));
  }

  /** Calcula o trecho vivo do último vértice até `c`; null sem vértice. Nada de resolveRamps nem booleanas. */
  private evaluate(c: Vec2): Eval | null {
    const v = this.pts[this.pts.length - 1];
    if (!v) return null;
    const { H, type, mode } = this.cfg;
    const w = this.cfg.width;
    const d = sub(c, v);
    const L = len(d);
    const dir: Vec2 = L > 0 ? mul(d, 1 / L) : { x: 1, y: 0 };
    let tStart = 0;
    let ring: Vec2[] | null = null;
    let prevLay: SegmentLayout | null = null;
    let riseBefore = 0;
    let carryBefore = 0;
    let effBefore = 0;
    let landBefore = 0;
    const prev = this.segs[this.segs.length - 1];
    if (prev && L >= MIN_SEGMENT) {
      const th = Math.acos(Math.max(-1, Math.min(1, dot(prev.dir, dir))));
      if (th > FREE_MAX_TURN_ANGLE) return { ok: false, message: translate(this.lang(), 'tl_msg_sharp_turn') };
      const on = th >= FREE_COLLINEAR_ANGLE;
      tStart = on ? this.recuo(th) : 0;
      if (prev.tStart + tStart + MIN_FLIGHT > prev.len + 1e-9) {
        return { ok: false, message: translate(this.lang(), 'tl_msg_prev_segment_short') };
      }
      const prevEff = prev.len - prev.tStart - tStart;
      prevLay = on ? this.layout(prevEff, prev.carryBefore) : prev.lay;
      riseBefore = prev.riseBefore + prevLay.rise;
      carryBefore = on ? 0 : prevLay.carry;
      effBefore = prev.effBefore + prevEff;
      landBefore = prev.landBefore + landSum(prevLay);
      if (on) ring = turnRing(v, prev.dir, dir, w, tStart);
    } else if (prev) {
      riseBefore = prev.riseAfter;
      carryBefore = prev.carryAfter;
      effBefore = prev.effBefore + prev.len - prev.tStart;
      landBefore = prev.landBefore + landSum(prev.lay);
    }
    const eff = L - tStart;
    const empty: SegmentLayout = { pieces: [], carry: carryBefore, rise: 0, length: 0 };
    if (eff < MIN_SEGMENT) {
      return { ok: true, short: true, v, dir, L, tStart, ring, prevLay, riseBefore, carryBefore, effBefore, landBefore, lay: empty, end: c, truncated: false, r: null };
    }
    let lay = this.layout(eff, carryBefore);
    let truncated = false;
    let r: LiveRemaining;
    if (mode === 'slope') {
      const s = this.slopeWork;
      r = liveRemaining({ H, mode: 'slope', type, slope: s, pathLength: eff, riseDone: riseBefore, carry: carryBefore });
      if (r.mode === 'slope' && r.status === 'passou') {
        lay = layoutUntilRise(H - riseBefore, carryBefore, s, maxRiseFor(type, s) ?? 0, type.landingMinLength);
        truncated = true;
      }
    } else {
      r = liveRemaining({
        H,
        mode: 'length',
        type,
        ...(this.cfg.slope !== undefined ? { slope: this.cfg.slope } : {}),
        pathLength: effBefore + eff,
        landingsLength: landBefore + landSum(lay),
      });
    }
    const end = truncated ? add(v, mul(dir, tStart + lay.length)) : c;
    return { ok: true, short: false, v, dir, L, tStart, ring, prevLay, riseBefore, carryBefore, effBefore, landBefore, lay, end, truncated, r };
  }

  private labelFor(r: LiveRemaining | null): string {
    if (!r) return '';
    if (r.mode === 'slope') {
      const falta = r.status === 'falta' ? r.falta : r.status === 'passou' ? -r.excess : 0;
      return rotuloInclinacao(r.slope, falta, this.cfg.lang);
    }
    const max = this.cfg.slope ?? rampMaxSlope(this.cfg.type) ?? null;
    return textoResultaInclinacao(r.slope, max, r.faltaLength, this.cfg.lang);
  }

  // ---- cache -------------------------------------------------------------------------------------------------

  private pieceItems(a: Vec2, dir: Vec2, u0: number, lay: SegmentLayout, ring: Vec2[] | null, w: number): PreviewItem[] {
    const out: PreviewItem[] = [];
    if (ring) out.push({ kind: 'polygon', ring, tone: 'landing' });
    for (const p of lay.pieces) {
      out.push({ kind: 'polygon', ring: rect(a, dir, u0 + p.at, u0 + p.at + p.length, w), tone: p.kind === 'flight' ? 'tread' : 'landing' });
    }
    out.push({ kind: 'line', a: add(a, mul(dir, u0)), b: add(a, mul(dir, u0 + lay.length)), tone: 'path' });
    return out;
  }

  private segItems(a: Vec2, dir: Vec2, u0: number, lay: SegmentLayout, ring: Vec2[] | null): PreviewItem[] {
    return this.pieceItems(a, dir, u0, lay, ring, this.cfg.width);
  }

  /** Confirma o trecho avaliado: fixa o fim do trecho anterior (giro) e empilha o novo. */
  private append(ev: Extract<Eval, { ok: true }>): void {
    const prev = this.segs[this.segs.length - 1];
    if (prev && ev.prevLay && ev.tStart > 0) {
      prev.tEnd = ev.tStart;
      prev.lay = ev.prevLay;
      prev.riseAfter = prev.riseBefore + ev.prevLay.rise;
      prev.carryAfter = 0;
      prev.items = this.segItems(prev.a, prev.dir, prev.tStart, prev.lay, prev.ring);
    }
    const lenSeg = dist(ev.v, ev.end);
    const seg: Seg = {
      a: ev.v,
      b: ev.end,
      dir: ev.dir,
      len: lenSeg,
      tStart: ev.tStart,
      tEnd: 0,
      ring: ev.ring,
      lay: ev.lay,
      riseBefore: ev.riseBefore,
      carryBefore: ev.carryBefore,
      effBefore: ev.effBefore,
      landBefore: ev.landBefore,
      riseAfter: ev.riseBefore + ev.lay.rise,
      carryAfter: ev.lay.carry,
      items: [],
    };
    seg.items = this.segItems(seg.a, seg.dir, seg.tStart, seg.lay, seg.ring);
    this.segs.push(seg);
    this.pts.push(ev.end);
    this.frozen = this.segs.slice(0, -1).flatMap((s) => s.items);
    this.reached = this.cfg.mode === 'slope' && seg.riseAfter >= this.cfg.H - LIVE_RISE_TOL;
  }

  /** Refaz todo o cache a partir dos vértices (voltar um passo ou mudar a configuração). */
  private rebuildAll(): void {
    const pts = this.pts.slice();
    this.pts = pts.length > 0 ? [pts[0]!] : [];
    this.segs = [];
    this.frozen = [];
    this.reached = false;
    for (let i = 1; i < pts.length; i++) {
      const ev = this.evaluate(pts[i]!);
      if (!ev || !ev.ok || ev.short) break;
      this.append(ev);
      if (this.reached) break;
    }
  }
}
