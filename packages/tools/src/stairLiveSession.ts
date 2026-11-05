/* eslint-disable max-lines -- a sessao da escada livre e irma da RampLiveSession; manter a maquina e o cache no mesmo lugar. */
import { add, dist, dot, len, mul, perp, sub, type Vec2 } from '@hestia/geom';
import type { StairType } from '@hestia/model';
import {
  FREE_COLLINEAR_ANGLE,
  FREE_MAX_TURN_ANGLE,
  compactRing,
  fitSegment,
  layoutStairSegment,
  liveStairRemaining,
  stairLiveParams,
  turnLandingRing,
  turnRecuo,
  type SegmentFit,
  type StairFixed,
  type StairLiveParams,
  type StairNorms,
  type StairRemaining,
  type StairSegmentLayout,
  type TurnRecuo,
} from '@hestia/engine';
import { estadoDoRestante, rotuloEscadaLivre } from './stairLiveMessages.ts';
import { fmtNumLang, t as translate, type Lang } from './i18n.ts';
import type { PreviewItem } from './types.ts';

/**
 * Sessão do desenho "livre" da escada: estado PURO (sem ambiente nem DOM) da máquina IDLE → ORIGIN → DRAWING → REACHED.
 * Cada trecho reto vira um lance e cada vértice com giro, um patamar de giro. A prévia de `move` só usa o layout em
 * espelhos (`layoutStairSegment`/`liveStairRemaining`) e o cache dos trechos confirmados: nada de `planStairFree`,
 * `resolveStairs`, lista de avisos nem operações booleanas (rodaria a cada pixel). O plano completo só roda ao concluir.
 */

/** Estado da máquina de cliques. */
export type StairLiveState = 'IDLE' | 'ORIGIN' | 'DRAWING' | 'REACHED';

/** Dados que a sessão precisa para calcular os espelhos; a ferramenta repassa a cada chamada (`configure`). */
export interface StairLiveConfig {
  /** Altura total H (m). */
  H: number;
  type: StairType;
  /** Largura do lance (m). */
  width: number;
  /** Profundidade do patamar de giro (m); padrão = largura, nunca menor que ela. */
  landingDepth?: number;
  /** N e T fixos (Ajustar); ausente = padrões do tipo. */
  fixed?: StairFixed;
  /** Normas; ausente = `DEFAULT_STAIR_NORMS` do motor. */
  norms?: StairNorms;
  /** Idioma das mensagens ao vivo (ausente = português). */
  lang?: Lang;
}

/** O que um clique, Enter ou comprimento digitado produziu. */
export type StairLiveEvent =
  | { kind: 'added'; state: StairLiveState; message?: string }
  | { kind: 'ignored'; message: string }
  | { kind: 'warn'; message: string }
  | { kind: 'done'; path: Vec2[]; /** Espelhos que faltam; 0 se fechou. */ falta: number };

/** Máximo de vértices do trajeto. */
export const STAIR_LIVE_MAX_VERTICES = 40;
/** Trecho menor que isso (m) é ignorado. */
const MIN_SEGMENT = 0.01;
/** Clique a menos que isso (m) do último vértice conclui (faz o papel do duplo clique). */
const REPEAT_CLICK = 0.05;

const emptyLayout = (): StairSegmentLayout => ({ pieces: [], risers: 0, length: 0, leftover1: false });

interface Seg {
  a: Vec2;
  b: Vec2;
  dir: Vec2;
  len: number;
  /** Distância bruta do clique que fechou o trecho (antes do truncamento no nível de topo). */
  clickLen: number;
  /** Curva no início do trecho (null no 1º). */
  turnIn: TurnRecuo | null;
  /** Recuo de saída do patamar do início do trecho (0 no 1º). */
  bIn: number;
  /** Espelhos colocados antes do trecho. */
  risersBefore: number;
  fit: SegmentFit;
  lay: StairSegmentLayout;
  risersAfter: number;
  /** Anel do patamar de giro no início do trecho (null se não há giro). */
  ring: Vec2[] | null;
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
      bIn: number;
      turnIn: TurnRecuo | null;
      ring: Vec2[] | null;
      prevFit: SegmentFit | null;
      prevLay: StairSegmentLayout | null;
      risersBefore: number;
      fit: SegmentFit;
      lay: StairSegmentLayout;
      end: Vec2;
      truncated: boolean;
      r: StairRemaining | null;
    };

/** Retângulo do pedaço `[u0, u1]` do trecho que sai de `a` na direção `dir`, com a largura `w`. */
function rect(a: Vec2, dir: Vec2, u0: number, u1: number, w: number): Vec2[] {
  const n = mul(perp(dir), w / 2);
  const p0 = add(a, mul(dir, u0));
  const p1 = add(a, mul(dir, u1));
  return [add(p0, n), add(p1, n), sub(p1, n), sub(p0, n)];
}

export class StairLiveSession {
  private cfg: StairLiveConfig;
  private par: StairLiveParams | null = null;
  private err: string | null = null;
  /** Profundidade do patamar de giro (m). */
  private D = 0;
  private pts: Vec2[] = [];
  private segs: Seg[] = [];
  private reached = false;
  private warned = false;
  private cursor: Vec2 | null = null;
  private dirty = true;
  private items: PreviewItem[] = [];
  /** Itens dos trechos 0..n-2 (o último é refeito a cada `move`, pois o giro no fim depende do cursor). */
  private frozen: PreviewItem[] = [];
  /** Um vértice quase colinear foi dissolvido no último `evaluate` (o cache precisa ser refeito). */
  private dissolved = false;

  constructor(cfg: StairLiveConfig) {
    this.cfg = cfg;
    this.applyConfig();
  }

  /** Idioma das mensagens ao vivo (ausente = português). */
  private lang(): Lang {
    return this.cfg.lang ?? 'pt';
  }

  // ---- configuração ------------------------------------------------------------------------------------------

  /** Atualiza os dados de cálculo; se mudaram, refaz o cache dos trechos confirmados. */
  configure(cfg: StairLiveConfig): void {
    const c = this.cfg;
    const same =
      c.H === cfg.H &&
      c.type === cfg.type &&
      c.width === cfg.width &&
      c.landingDepth === cfg.landingDepth &&
      c.fixed?.risers === cfg.fixed?.risers &&
      c.fixed?.tread === cfg.fixed?.tread;
    this.cfg = cfg;
    if (same) return;
    this.applyConfig();
    this.rebuildAll();
    this.dirty = true;
  }

  private applyConfig(): void {
    const c = this.cfg;
    const r = stairLiveParams(c.H, c.type, {
      width: c.width,
      ...(c.fixed ? { fixed: c.fixed } : {}),
      ...(c.norms ? { norms: c.norms } : {}),
    });
    if ('error' in r) {
      this.par = null;
      this.err = r.error;
    } else {
      this.par = r;
      this.err = null;
    }
    this.D = Math.max(c.landingDepth ?? c.width, c.width);
  }

  // ---- leitura -----------------------------------------------------------------------------------------------

  get state(): StairLiveState {
    if (this.pts.length === 0) return 'IDLE';
    if (this.pts.length === 1) return 'ORIGIN';
    return this.reached ? 'REACHED' : 'DRAWING';
  }

  /** Vértices confirmados (cópia). */
  get points(): Vec2[] {
    return this.pts.slice();
  }

  /**
   * Vértices para o "Ajustar": o último ponto volta ao clique bruto quando o rascunho truncou no nível de topo, para o
   * ajuste considerar o trajeto realmente desenhado (senão um reto de 5 m viraria 4,2 m e perderia a intenção).
   */
  rawPoints(): Vec2[] {
    const out = this.pts.slice();
    const last = this.segs[this.segs.length - 1];
    if (last && out.length > 1 && last.clickLen > last.len + 1e-9) out[out.length - 1] = add(last.a, mul(last.dir, last.clickLen));
    return out;
  }

  preview(): PreviewItem[] {
    return this.items;
  }

  /** Espelhos que ainda faltam nos trechos confirmados. */
  get faltaConfirmada(): number {
    const last = this.segs[this.segs.length - 1];
    if (!last || !this.par) return 0;
    return Math.max(0, this.par.risers - last.risersAfter);
  }

  /** Dica da barra de status para o estado atual. */
  hint(): string {
    switch (this.state) {
      case 'IDLE':
        return translate(this.cfg.lang ?? 'pt', 'tl_hint_stair_live_idle');
      case 'ORIGIN':
        return translate(this.cfg.lang ?? 'pt', 'tl_hint_stair_live_origin');
      case 'DRAWING':
        return translate(this.cfg.lang ?? 'pt', 'tl_hint_stair_live_drawing');
      case 'REACHED':
        return translate(this.cfg.lang ?? 'pt', 'tl_hint_stair_live_reached');
    }
  }

  // ---- ações -------------------------------------------------------------------------------------------------

  /** Clique no ponto `c`: define a origem, confirma um trecho ou (no último vértice / em REACHED) conclui. */
  click(c: Vec2): StairLiveEvent {
    const avisado = this.warned;
    this.warned = false;
    this.dirty = true;
    if (this.err) return { kind: 'ignored', message: this.err };
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
    if (this.pts.length >= STAIR_LIVE_MAX_VERTICES) {
      return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_max_points', { n: STAIR_LIVE_MAX_VERTICES }) };
    }
    const ev = this.evaluate(c);
    if (!ev) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_click_start') };
    if (!ev.ok) return { kind: 'ignored', message: ev.message };
    if (ev.short) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_segment_short_after_landing') };
    this.append(ev);
    const state = this.state;
    return state === 'REACHED'
      ? { kind: 'added', state, message: translate(this.lang(), ev.truncated ? 'tl_msg_top_reached_truncated' : 'tl_msg_top_reached_cap') }
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
    if (this.err) {
      this.items = [{ kind: 'label', at: p, text: this.err }];
      return this.items;
    }
    const reachedSeg = this.segs[this.segs.length - 1];
    if (this.reached && reachedSeg) {
      const v = this.pts[this.pts.length - 1]!;
      this.items = [...this.frozen, ...reachedSeg.items, { kind: 'point', at: v }, { kind: 'label', at: v, text: translate(this.lang(), 'tl_msg_top_reached_cap') }];
      return this.items;
    }
    const ev = this.evaluate(p);
    if (this.dissolved) {
      // Um vértice saiu do rascunho: o cache congelado precisa acompanhar.
      this.dissolved = false;
      this.syncFrozen();
    }
    if (!ev) return this.items;
    const lastSeg = this.segs[this.segs.length - 1];
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
    const prev = lastSeg && ev.prevLay && ev.prevFit && ev.bIn > 0 ? this.fitItems(lastSeg.a, lastSeg.dir, ev.prevFit, ev.prevLay, lastSeg.ring) : lastSeg?.items ?? [];
    const out: PreviewItem[] = [...this.frozen, ...prev];
    out.push(...this.pieceItems(ev.v, ev.dir, ev.bIn, ev.lay, ev.ring));
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
   * Enter / clique repetido: conclui. Com espelhos faltando, o 1º pedido só avisa e o 2º conclui assim.
   * Devolve o trajeto e volta a IDLE.
   */
  finish(): StairLiveEvent {
    if (this.pts.length < 2) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_click_second_stair') };
    const falta = this.faltaConfirmada;
    if (falta > 0 && !this.warned) {
      this.warned = true;
      const m = this.par ? falta * this.par.tread : 0;
      const texto = translate(this.lang(), falta === 1 ? 'tl_msg_missing_one_cap' : 'tl_msg_missing_many_cap', { n: falta });
      return { kind: 'warn', message: translate(this.lang(), 'tl_msg_missing_warn_stair', { state: texto, d: fmtNumLang(m, 2, this.lang()) }) };
    }
    const path = this.pts.slice();
    this.cancel();
    return { kind: 'done', path, falta };
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
    return true;
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
    this.dissolved = false;
  }

  /** Comprimento digitado (m) do próximo trecho, na direção do cursor. */
  typeLength(m: number): StairLiveEvent {
    if (this.pts.length === 0) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_click_start_first') };
    if (!(m >= MIN_SEGMENT)) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_invalid_length') };
    const v = this.pts[this.pts.length - 1]!;
    const d = this.cursor ? sub(this.cursor, v) : null;
    const l = d ? len(d) : 0;
    if (!d || l < MIN_SEGMENT) return { kind: 'ignored', message: translate(this.lang(), 'tl_msg_move_cursor_then_length') };
    return this.click(add(v, mul(d, m / l)));
  }

  // ---- cálculo -----------------------------------------------------------------------------------------------

  /**
   * Calcula o trecho vivo do último vértice até `c`; null sem vértice. Um vértice quase colinear é dissolvido (o
   * clique substitui o último ponto) e a avaliação recomeça do ponto anterior. Nada de plano completo nem booleanas.
   */
  private evaluate(c: Vec2): Eval | null {
    if (this.err || !this.par) return { ok: false, message: this.err ?? translate(this.lang(), 'tl_msg_invalid_stair_type') };
    const p = this.par;
    const T = p.tread;
    for (;;) {
      const v = this.pts[this.pts.length - 1];
      if (!v) return null;
      const d = sub(c, v);
      const L = len(d);
      const dir: Vec2 = L > 0 ? mul(d, 1 / L) : { x: 1, y: 0 };
      const prev = this.segs[this.segs.length - 1];
      let bIn = 0;
      let risersBefore = 0;
      let turnIn: TurnRecuo | null = null;
      let ring: Vec2[] | null = null;
      let prevFit: SegmentFit | null = null;
      let prevLay: StairSegmentLayout | null = null;
      if (prev && L >= MIN_SEGMENT) {
        const th = Math.acos(Math.max(-1, Math.min(1, dot(prev.dir, dir))));
        if (th > FREE_MAX_TURN_ANGLE) return { ok: false, message: translate(this.lang(), 'tl_msg_sharp_turn') };
        if (th < FREE_COLLINEAR_ANGLE) {
          // Vértice quase colinear: dissolve e reavalia a partir do ponto anterior (o clique o substitui).
          this.pts.pop();
          this.segs.pop();
          this.dissolved = true;
          continue;
        }
        const tin = turnRecuo(th, this.cfg.width, this.D);
        const pf = fitSegment(prev.len, T, prev.turnIn, tin);
        if (pf.kind === 'short') return { ok: false, message: translate(this.lang(), 'tl_msg_prev_segment_short') };
        const need = p.risers - prev.risersBefore;
        const pl = pf.kind === 'run' ? layoutStairSegment(pf.span, p, need, true) : emptyLayout();
        if (prev.risersBefore === 0 && pl.risers === 0 && this.segs.length === 1) {
          return { ok: false, message: translate(this.lang(), 'tl_msg_first_segment_short') };
        }
        bIn = tin.tPref;
        risersBefore = prev.risersBefore + pl.risers;
        turnIn = tin;
        ring = compactRing(turnLandingRing(v, prev.dir, dir, this.cfg.width, tin.tPref, bIn));
        prevFit = pf;
        prevLay = pl;
      } else if (prev) {
        risersBefore = prev.risersAfter;
      }
      const span = L - bIn;
      const fit: SegmentFit = { kind: 'run', bIn, aOut: 0, span: Math.max(0, span) };
      if (span < MIN_SEGMENT) {
        return { ok: true, short: true, v, dir, L, bIn, turnIn, ring, prevFit, prevLay, risersBefore, fit, lay: emptyLayout(), end: c, truncated: false, r: null };
      }
      const r = liveStairRemaining({ params: p, span, risersBefore });
      const lay = layoutStairSegment(span, p, p.risers - risersBefore, false);
      const truncated = r.status === 'passou';
      const end = truncated ? add(v, mul(dir, bIn + lay.length)) : c;
      return { ok: true, short: false, v, dir, L, bIn, turnIn, ring, prevFit, prevLay, risersBefore, fit, lay, end, truncated, r };
    }
  }

  private labelFor(r: StairRemaining | null): string {
    if (!r || !this.par) return '';
    return rotuloEscadaLivre(this.par.risers, this.par.riserHeight, this.par.tread, estadoDoRestante(r, this.cfg.lang), this.cfg.lang);
  }

  // ---- cache -------------------------------------------------------------------------------------------------

  /** Itens de um trecho: peças do layout, patamar de giro e eixo; trecho de passagem vira um patamar retangular. */
  private fitItems(a: Vec2, dir: Vec2, fit: SegmentFit, lay: StairSegmentLayout, ring: Vec2[] | null): PreviewItem[] {
    if (fit.kind === 'pass') {
      const out: PreviewItem[] = [];
      if (ring) out.push({ kind: 'polygon', ring, tone: 'landing' });
      if (fit.span >= 1e-6) out.push({ kind: 'polygon', ring: rect(a, dir, fit.bIn, fit.bIn + fit.span, this.cfg.width), tone: 'landing' });
      out.push({ kind: 'line', a: add(a, mul(dir, fit.bIn)), b: add(a, mul(dir, fit.bIn + fit.span)), tone: 'path' });
      return out;
    }
    return this.pieceItems(a, dir, fit.bIn, lay, ring);
  }

  /** Peças de um vão: retângulos de piso, linhas de espelho, patamar em linha, anel do giro e eixo. */
  private pieceItems(a: Vec2, dir: Vec2, u0: number, lay: StairSegmentLayout, ring: Vec2[] | null): PreviewItem[] {
    const w = this.cfg.width;
    const T = this.par?.tread ?? 0;
    const n = mul(perp(dir), w / 2);
    const out: PreviewItem[] = [];
    if (ring) out.push({ kind: 'polygon', ring, tone: 'landing' });
    for (const pc of lay.pieces) {
      const u = u0 + pc.at;
      if (pc.kind === 'flight') {
        out.push({ kind: 'polygon', ring: rect(a, dir, u, u + pc.length, w), tone: 'tread' });
        for (let i = 0; i < pc.risers; i++) {
          const at = add(a, mul(dir, u + i * T));
          out.push({ kind: 'line', a: add(at, n), b: sub(at, n), tone: 'riser' });
        }
      } else {
        out.push({ kind: 'polygon', ring: rect(a, dir, u, u + pc.length, w), tone: 'landing' });
      }
    }
    out.push({ kind: 'line', a: add(a, mul(dir, u0)), b: add(a, mul(dir, u0 + lay.length)), tone: 'path' });
    return out;
  }

  private syncFrozen(): void {
    this.frozen = this.segs.slice(0, -1).flatMap((s) => s.items);
  }

  /** Confirma o trecho avaliado: fixa o fim do trecho anterior (giro) e empilha o novo. */
  private append(ev: Extract<Eval, { ok: true }>): void {
    const prev = this.segs[this.segs.length - 1];
    if (prev && ev.prevFit && ev.prevLay && ev.bIn > 0) {
      prev.fit = ev.prevFit;
      prev.lay = ev.prevLay;
      prev.risersAfter = prev.risersBefore + ev.prevLay.risers;
      prev.items = this.fitItems(prev.a, prev.dir, ev.prevFit, ev.prevLay, prev.ring);
    }
    const lenSeg = dist(ev.v, ev.end);
    const seg: Seg = {
      a: ev.v,
      b: ev.end,
      dir: ev.dir,
      len: lenSeg,
      clickLen: ev.L,
      turnIn: ev.turnIn,
      bIn: ev.bIn,
      risersBefore: ev.risersBefore,
      fit: ev.fit,
      lay: ev.lay,
      risersAfter: ev.risersBefore + ev.lay.risers,
      ring: ev.ring,
      items: [],
    };
    seg.items = this.pieceItems(seg.a, seg.dir, seg.bIn, seg.lay, seg.ring);
    this.segs.push(seg);
    this.pts.push(ev.end);
    this.syncFrozen();
    this.reached = !!this.par && seg.risersAfter >= this.par.risers;
  }

  /** Refaz todo o cache a partir dos vértices (voltar um passo ou mudar a configuração). */
  private rebuildAll(): void {
    const pts = this.pts.slice();
    this.pts = pts.length > 0 ? [pts[0]!] : [];
    this.segs = [];
    this.frozen = [];
    this.reached = false;
    this.dissolved = false;
    for (let i = 1; i < pts.length; i++) {
      const ev = this.evaluate(pts[i]!);
      if (!ev || !ev.ok || ev.short) break;
      this.append(ev);
      if (this.reached) break;
    }
    this.dissolved = false;
  }
}
