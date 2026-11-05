import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { sampleChain, stairLandingPolygon } from '@hestia/engine';
import type { StairCurve } from '@hestia/model';
import { copyCurve, lastRun, partsFromComponents, componentsFromParts, type RunDraft, type StairPart, type StairSubmode } from './stairSketchState.ts';
import { CONNECT_TOL, chainEnd, emptyStroke, strokeClick, strokeUndo, type Stroke, type StrokeEvent } from './stairStroke.ts';
import { reverseCurve } from './stairPickLines.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Estado do desenho: sub-modo, lado do limite, componentes do croqui, o traçado em curso e se "Pegar linhas" está ligado. */
export interface DrawState {
  submode: StairSubmode;
  phase: 'left' | 'right';
  parts: StairPart[];
  stroke: Stroke;
  /** Pegar linhas: o clique pega a linha sob o cursor em vez de desenhar (vale para limites, espelhos e caminhada). */
  pick: boolean;
}

/**
 * Uma pegada, para desfazer: as curvas que entraram, e onde (a cadeia em curso, ou os espelhos de um lance).
 * Desfazer tira exatamente estas curvas (por identidade); refazer as põe de volta no fim da mesma camada.
 */
export interface PickOp {
  layer: 'chain' | 'risers';
  items: StairCurve[];
  run?: RunDraft;
}

/** Um clique no sub-modo atual. Devolve a mensagem para a barra de status, se houver. */
export function drawPoint(st: DrawState, q: Vec2, mpp: number): string | undefined {
  switch (st.submode) {
    case 'limites': {
      const ev = step(st, q, true);
      return ev.kind === 'reject' ? ev.message : undefined;
    }
    case 'espelhos':
      return riserPoint(st, q);
    case 'caminhada': {
      if (!lastRun(st.parts)?.risers.length) return 'Desenhe os espelhos antes da caminhada.';
      const ev = step(st, q, true);
      return ev.kind === 'reject' ? ev.message : undefined;
    }
    case 'patamar':
      return landingPoint(st, q, mpp);
    default:
      return undefined;
  }
}

/** Enter: fecha o limite, a caminhada ou o patamar do sub-modo atual (Concluir fica com a ferramenta). */
export function closeCurrent(st: DrawState): string | undefined {
  switch (st.submode) {
    case 'limites':
      return closeBoundary(st);
    case 'espelhos':
      st.stroke = emptyStroke(st.stroke.prim);
      return undefined;
    case 'caminhada':
      return closePath(st);
    case 'patamar':
      return closeLanding(st);
    default:
      return undefined;
  }
}

/** Apaga a camada do sub-modo atual. Devolve false se não havia o que apagar. */
export function clearActive(st: DrawState): boolean {
  const run = lastRun(st.parts);
  st.stroke = emptyStroke(st.stroke.prim);
  if (st.submode === 'limites' && run) {
    if (st.phase === 'left') run.boundaryLeft = [];
    else run.boundaryRight = [];
    return true;
  }
  if (st.submode === 'espelhos' && run && run.risers.length) {
    run.risers = [];
    return true;
  }
  if (st.submode === 'caminhada' && run && run.path.length) {
    run.path = [];
    return true;
  }
  if (st.submode === 'patamar' && st.parts[st.parts.length - 1]?.kind === 'landing') {
    st.parts.pop();
    return true;
  }
  return false;
}

/** Desfaz o último passo do traçado em curso. Devolve false se não havia traçado. */
export function undoStroke(st: DrawState): boolean {
  if (!isBusy(st.stroke)) return false;
  st.stroke = strokeUndo(st.stroke);
  return true;
}

export const isBusy = (s: Stroke): boolean => s.last !== null || s.arcStage > 0 || s.chain.length > 0;

/** Cópia independente do croqui (Esc na edição volta ao croqui original). */
export function cloneParts(parts: StairPart[]): StairPart[] {
  return partsFromComponents(componentsFromParts(parts));
}

/** Pontos de captura de um componente do rascunho. */
export function partPoints(p: StairPart): Vec2[] {
  if (p.kind === 'landing') return p.landing.boundary.flatMap((c) => [c.a, c.b]);
  const r = p.run;
  return [...r.boundaryLeft, ...r.boundaryRight, ...r.risers, ...r.path].flatMap((c) => [c.a, c.b]);
}

function step(st: DrawState, q: Vec2, chained: boolean): StrokeEvent {
  const r = strokeClick(st.stroke, q, chained);
  st.stroke = r.next;
  return r.event;
}

/**
 * Raio (m) do "imã" do limite no espelho: um clique a até este valor de um limite cai sobre ele. O clique à mão
 * erra por décimos de metro; sem o imã, o espelho não liga os dois limites e o croqui não fecha.
 */
export const RISER_SNAP_M = 0.4;

/** Ponto do limite mais próximo de `q` (até `RISER_SNAP_M`), ou `q` se nenhum limite está ao alcance. */
export function snapToBoundary(run: RunDraft | null, q: Vec2): Vec2 {
  if (!run) return q;
  let best: Vec2 | null = null;
  let bestD = RISER_SNAP_M;
  for (const cs of [run.boundaryLeft, run.boundaryRight]) {
    const pts = sampleChain(cs);
    for (let i = 0; i + 1 < pts.length; i++) {
      const c = closestOnSegment(q, pts[i]!, pts[i + 1]!);
      const d = dist(q, c);
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best ?? q;
}

/** Espelho: dois cliques (ou três, com arco) por espelho; cada um sai direto, sem cadeia. */
function riserPoint(st: DrawState, q: Vec2, lang: Lang = 'pt'): string | undefined {
  const run = lastRun(st.parts);
  if (!run || run.boundaryLeft.length === 0 || run.boundaryRight.length === 0) {
    st.stroke = emptyStroke(st.stroke.prim);
    return translate(lang, 'tl_msg_draw_limits_first');
  }
  const ev = step(st, snapToBoundary(run, q), false);
  if (ev.kind === 'reject') return ev.message;
  if (ev.kind === 'segment') run.risers.push(copyCurve(ev.curve));
  return undefined;
}

/**
 * Patamar: cliques encadeados. Clicar no ponto inicial (ou a 10 px dele) fecha o laço: se for válido, vira componente
 * (ordem de criação); se não fechar uma área, o segmento de fechamento é desfeito e a mensagem diz por quê.
 */
function landingPoint(st: DrawState, q: Vec2, mpp: number): string | undefined {
  const first = st.stroke.chain[0]?.a;
  const snapped = first && dist(first, q) <= 10 * mpp ? first : q;
  const ev = step(st, snapped, true);
  if (ev.kind === 'reject') return ev.message;
  if (ev.kind !== 'segment') return undefined;
  const chain = st.stroke.chain;
  const start = chain[0];
  const closes = chain.length >= 2 && start !== undefined && dist(ev.curve.b, start.a) <= CONNECT_TOL;
  if (!closes) return undefined;
  const check = stairLandingPolygon({ boundary: chain });
  if (check.issues.length) {
    st.stroke = strokeUndo(st.stroke);
    return check.issues[0]?.message;
  }
  st.parts.push({ kind: 'landing', landing: { boundary: chain.map(copyCurve) } });
  st.stroke = emptyStroke(st.stroke.prim);
  return 'Patamar criado. Desenhe o próximo lance em Limites.';
}

/** Enter nos limites: fecha a cadeia do lado em desenho (ou mantém o lado já desenhado, se a cadeia está vazia). */
function closeBoundary(st: DrawState): string | undefined {
  const chain = st.stroke.chain;
  const side: 'boundaryLeft' | 'boundaryRight' = st.phase === 'left' ? 'boundaryLeft' : 'boundaryRight';
  const run = lastRun(st.parts);
  if (chain.length) writeRun(st)[side] = chain.map(copyCurve);
  else if (!run || run[side].length === 0) return st.phase === 'left' ? 'Desenhe o limite esquerdo antes de Enter.' : 'Desenhe o limite direito antes de Enter.';
  st.stroke = emptyStroke(st.stroke.prim);
  if (st.phase === 'left') {
    st.phase = 'right';
    return 'Limite esquerdo fechado. Desenhe o direito; Enter fecha e passa a Espelhos.';
  }
  st.phase = 'left';
  st.submode = 'espelhos';
  return 'Limites fechados. Desenhe os espelhos (início e fim de cada um).';
}

function closePath(st: DrawState): string | undefined {
  if (!lastRun(st.parts)?.risers.length) return 'Desenhe os espelhos antes da caminhada.';
  if (!st.stroke.chain.length) return 'Desenhe a caminhada ou Esc.';
  writeRun(st).path = st.stroke.chain.map(copyCurve);
  st.stroke = emptyStroke(st.stroke.prim);
  return undefined;
}

function closeLanding(st: DrawState): string | undefined {
  if (st.stroke.chain.length) return 'O contorno do patamar deve ser um laço fechado.';
  st.stroke = emptyStroke(st.stroke.prim);
  return 'Desenhe o contorno do patamar (um laço fechado).';
}

/** O lance em desenho; cria um vazio se o último componente não for lance. */
export function writeRun(st: DrawState): RunDraft {
  const run = lastRun(st.parts);
  if (run) return run;
  const fresh: RunDraft = { boundaryLeft: [], boundaryRight: [], risers: [], path: [] };
  st.parts.push({ kind: 'run', run: fresh });
  return fresh;
}

/**
 * Pegar linhas: as curvas já deslocadas entram no croqui como se fossem desenhadas. Limites e caminhada vão para a cadeia
 * em curso (Enter fecha, como sempre); espelhos saem direto, um por curva. Não valida o croqui: quem aponta erro é
 * `analyzeDraft` (validateRunSketch). Só recusa o que não tem onde entrar (sub-modo errado, espelho sem limites).
 */
export function pickInto(st: DrawState, curves: StairCurve[], lang: Lang = 'pt'): { op: PickOp; msg: string } | { error: string } {
  const n = curves.length;
  if (st.submode === 'espelhos') {
    const run = lastRun(st.parts);
    if (!run || run.boundaryLeft.length === 0 || run.boundaryRight.length === 0) {
      st.stroke = emptyStroke(st.stroke.prim);
      return { error: translate(lang, 'tl_msg_draw_limits_first') };
    }
    run.risers.push(...curves);
    st.stroke = emptyStroke(st.stroke.prim);
    return { op: { layer: 'risers', items: curves, run }, msg: `${n} espelho${n > 1 ? 's' : ''} pego${n > 1 ? 's' : ''}.` };
  }
  if (st.submode !== 'limites' && st.submode !== 'caminhada') return { error: 'Pegar linhas vale para limites, espelhos e caminhada.' };
  if (st.submode === 'caminhada' && !lastRun(st.parts)?.risers.length) return { error: 'Desenhe os espelhos antes da caminhada.' };
  const base = st.stroke.chain;
  const items = orientAfter(curves, base.length ? chainEnd(st.stroke) : null);
  st.stroke = { ...emptyStroke(st.stroke.prim), chain: [...base, ...items], last: items[items.length - 1]!.b };
  return { op: { layer: 'chain', items }, msg: `${n} linha${n > 1 ? 's' : ''} pega${n > 1 ? 's' : ''}. Enter fecha o ${st.submode === 'limites' ? 'limite' : 'caminho'}.` };
}

/**
 * Com uma cadeia em curso, a pegada começa onde ela termina: inverte a curva ou a ordem inteira quando a pegada chega
 * pelo outro lado. Sem cadeia, mantém o sentido que a seleção deu.
 */
function orientAfter(curves: StairCurve[], end: Vec2 | null): StairCurve[] {
  if (!end) return curves;
  const first = curves[0]!;
  const last = curves[curves.length - 1]!;
  if (dist(first.a, end) <= dist(last.b, end)) return curves;
  return curves.slice().reverse().map(reverseCurve);
}
