import { applyTransform, closestOnSegment, cross, dist, dot, intersectLines, norm, sub, type Transform, type Vec2 } from '@hestia/geom';
import { hospedeiroDoGuardaCorpo, isGuardaCorpo, isRamp, isStair, newId, PREFIXO_ID_GUARDA_CORPO, type GuardaCorpo, type HospedeiroManual, type Id, type PontoCaminhoGC, type Project } from '@hestia/model';
import { railingPolylines } from './railingPick.ts';
import { langOf, t as translate } from './i18n.ts';
import type { PreviewItem, ToolEnv } from './types.ts';

// Guarda-corpo nas ferramentas de modificar (decisão 0055 §25). Regra única para todas:
// - manual: o caminho é do próprio elemento e se transforma como o eixo de uma parede;
// - hospedado em escada ou rampa: o caminho vem do hospedeiro. Segue quando o hospedeiro se move, gira, espelha ou é
//   copiado junto; sozinho, a ferramenta recusa com `tl_msg_railing_hosted_locked` e nada muda.

/** Guarda-corpos da seleção que o comando `transform` leva: manuais, e hospedados cujo hospedeiro também está na seleção. */
export function selectedGuardaCorpos(p: Project, ids: readonly Id[]): Id[] {
  return ids.filter((id) => {
    const e = p.elements[id];
    if (!isGuardaCorpo(e)) return false;
    const host = hospedeiroDoGuardaCorpo(e);
    return host === null || ids.includes(host);
  });
}

/** Guarda-corpos hospedados na seleção sem o hospedeiro: não se movem sozinhos. */
export function guardaCorposBloqueados(p: Project, ids: readonly Id[]): Id[] {
  return ids.filter((id) => {
    const e = p.elements[id];
    if (!isGuardaCorpo(e)) return false;
    const host = hospedeiroDoGuardaCorpo(e);
    return host !== null && !ids.includes(host);
  });
}

/** Diz na barra de status que o guarda-corpo hospedado só acompanha o hospedeiro. */
export function avisaGuardaCorpoHospedado(env: ToolEnv): void {
  env.say(translate(langOf(env), 'tl_msg_railing_hosted_locked'));
}

/** Fantasmas dos guarda-corpos que seguem a transformação: manuais da lista e hospedados das escadas e rampas dela. */
export function ghostGuardaCorpos(p: Project, ids: readonly Id[], t: Transform): PreviewItem[] {
  const set = new Set(ids);
  let temHospedeiro = false;
  for (const id of ids) {
    const e = p.elements[id];
    if (isStair(e) || isRamp(e) || isGuardaCorpo(e)) {
      temHospedeiro = true;
      break;
    }
  }
  if (!temHospedeiro) return [];
  const out: PreviewItem[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isGuardaCorpo(e)) continue;
    const host = hospedeiroDoGuardaCorpo(e);
    if (host === null ? !set.has(e.id) : !set.has(host)) continue;
    for (const pl of railingPolylines(p, e)) {
      for (let i = 1; i < pl.length; i++) out.push({ kind: 'line', a: applyTransform(t, pl[i - 1]!), b: applyTransform(t, pl[i]!), dashed: true });
    }
  }
  return out;
}

// ---- Deslocar, dividir e aparar/estender o caminho de um guarda-corpo MANUAL ------------------------------------------

type Pt = PontoCaminhoGC;
const EPS = 1e-6;

/** Guarda-corpo manual ou null (hospedado e inexistente não se editam pelo caminho). */
export function manualDe(p: Project, id: Id): (GuardaCorpo & { hospedeiro: HospedeiroManual }) | null {
  const g = p.elements[id];
  return isGuardaCorpo(g) && g.hospedeiro.tipo === 'manual' ? (g as GuardaCorpo & { hospedeiro: HospedeiroManual }) : null;
}

/** Caminho paralelo à distância `d` (positivo à esquerda do sentido do caminho), com cantos em esquadria. */
export function deslocarCaminho(caminho: readonly Pt[], d: number, fechado: boolean): Pt[] {
  const n = caminho.length;
  const seg = (i: number): Vec2 => norm(sub(caminho[(i + 1) % n]!, caminho[i]!));
  const normal = (u: Vec2): Vec2 => ({ x: -u.y, y: u.x });
  return caminho.map((v, i) => {
    const antes = fechado || i > 0 ? normal(seg((i - 1 + n) % n)) : null;
    const depois = fechado || i < n - 1 ? normal(seg(i)) : null;
    const n0 = antes ?? depois!;
    const n1 = depois ?? antes!;
    const soma = { x: n0.x + n1.x, y: n0.y + n1.y };
    const dd = soma.x * n0.x + soma.y * n0.y;
    // Esquadria: o canto anda pela bissetriz; canto muito agudo é limitado.
    const k = Math.abs(dd) < 0.2 ? 1 / 0.2 : 1 / dd;
    return { x: v.x + soma.x * k * d, y: v.y + soma.y * k * d, dz: v.dz };
  });
}

/** Lado do cursor em relação ao segmento do caminho mais próximo: +1 à esquerda do sentido, -1 à direita. */
export function ladoDoCursor(caminho: readonly Pt[], fechado: boolean, at: Vec2): 1 | -1 {
  const n = caminho.length;
  let best: { d: number; s: 1 | -1 } = { d: Infinity, s: 1 };
  const total = fechado ? n : n - 1;
  for (let i = 0; i < total; i++) {
    const a = caminho[i]!;
    const b = caminho[(i + 1) % n]!;
    const d = dist(at, closestOnSegment(at, a, b));
    if (d < best.d) best = { d, s: cross(sub(b, a), sub(at, a)) >= 0 ? 1 : -1 };
  }
  return best.s;
}

/** Divide o caminho no ponto mais próximo de `at`. Laço fechado vira um caminho aberto (só um resultado). */
export function dividirCaminho(h: HospedeiroManual, at: Vec2): { primeiro: Pt[]; segundo: Pt[] | null } | null {
  const pts = h.caminho;
  const n = pts.length;
  const total = h.fechado ? n : n - 1;
  let best: { i: number; q: Vec2; d: number } | null = null;
  for (let i = 0; i < total; i++) {
    const q = closestOnSegment(at, pts[i]!, pts[(i + 1) % n]!);
    const d = dist(at, q);
    if (!best || d < best.d) best = { i, q, d };
  }
  if (!best) return null;
  const a = pts[best.i]!;
  const b = pts[(best.i + 1) % n]!;
  const comp = dist(a, b);
  const t = comp < EPS ? 0 : dist(a, best.q) / comp;
  const ponto: Pt = { x: best.q.x, y: best.q.y, dz: a.dz + (b.dz - a.dz) * t };
  const naPonta = (v: Pt): boolean => dist(v, ponto) < EPS;
  if (h.fechado) {
    // Abre o laço no ponto: ele vira início e fim do novo caminho.
    const depois = [...pts.slice(best.i + 1), ...pts.slice(0, best.i + 1)];
    return { primeiro: [ponto, ...depois.filter((v) => !naPonta(v)), ponto], segundo: null };
  }
  const antes = pts.slice(0, best.i + 1).filter((v) => !naPonta(v));
  const adiante = pts.slice(best.i + 1).filter((v) => !naPonta(v));
  if (antes.length === 0 || adiante.length === 0) return null; // clique numa ponta: nada a dividir
  return { primeiro: [...antes, ponto], segundo: [ponto, ...adiante] };
}

/** Reta de referência (ponto e direção) do aparar/estender. */
export interface RetaRef {
  p: Vec2;
  d: Vec2;
}

/**
 * Leva a ponta do caminho mais distante do clique até a reta de referência, no prolongamento do último trecho
 * (aparar ou estender). `erro` diz por que não há canto.
 */
export function aparaCaminho(h: HospedeiroManual, at: Vec2, ref: RetaRef): { caminho: Pt[] } | { erro: 'paralelo' | 'alcance' | 'fechado' } {
  if (h.fechado) return { erro: 'fechado' };
  const pts = h.caminho;
  const n = pts.length;
  const inicio = dist(at, pts[0]!) >= dist(at, pts[n - 1]!);
  const ponta = inicio ? pts[0]! : pts[n - 1]!;
  const vizinho = inicio ? pts[1]! : pts[n - 2]!;
  const u = sub(ponta, vizinho);
  const comp = Math.hypot(u.x, u.y);
  if (comp < EPS) return { erro: 'alcance' };
  const hit = intersectLines(vizinho, u, ref.p, ref.d);
  if (!hit) return { erro: 'paralelo' };
  const t = dot(sub(hit.point, vizinho), u) / (comp * comp);
  if (t < 1e-3) return { erro: 'alcance' };
  const novo: Pt = { x: hit.point.x, y: hit.point.y, dz: ponta.dz };
  return { caminho: pts.map((v, i) => (inicio ? (i === 0 ? novo : v) : i === n - 1 ? novo : v)) };
}

/** Segmento do guarda-corpo mais próximo de `at`, como reta de referência. */
export function retaDoGuardaCorpo(p: Project, g: GuardaCorpo, at: Vec2): RetaRef | null {
  let best: { a: Vec2; b: Vec2; d: number } | null = null;
  for (const pl of railingPolylines(p, g)) {
    for (let i = 1; i < pl.length; i++) {
      const d = dist(at, closestOnSegment(at, pl[i - 1]!, pl[i]!));
      if (d < (best?.d ?? Infinity) && dist(pl[i - 1]!, pl[i]!) > EPS) best = { a: pl[i - 1]!, b: pl[i]!, d };
    }
  }
  return best ? { p: best.a, d: norm(sub(best.b, best.a)) } : null;
}

/** Desloca um guarda-corpo manual (cópia ou movimento). Devolve o id resultante. */
export function deslocarGuardaCorpo(env: ToolEnv, id: Id, d: number, copia: boolean): Id | null {
  const g = manualDe(env.project(), id);
  if (!g) return null;
  const hospedeiro = { ...g.hospedeiro, caminho: deslocarCaminho(g.hospedeiro.caminho, d, g.hospedeiro.fechado) };
  if (!copia) {
    env.transaction('Deslocar', () => env.exec({ type: 'updateGuardaCorpo', id, patch: { hospedeiro } }));
    return id;
  }
  const { order: _order, ...rest } = g;
  const nid = newId(PREFIXO_ID_GUARDA_CORPO);
  env.transaction('Deslocar e copiar', () => env.exec({ type: 'addGuardaCorpo', guardaCorpo: { ...rest, id: nid, hospedeiro } }));
  return nid;
}

/** Divide um guarda-corpo manual em dois (o segundo é um elemento novo com as mesmas propriedades). */
export function dividirGuardaCorpo(env: ToolEnv, id: Id, at: Vec2): boolean {
  const g = manualDe(env.project(), id);
  if (!g) return false;
  const r = dividirCaminho(g.hospedeiro, at);
  if (!r) return false;
  env.transaction('Dividir guarda-corpo', () => {
    env.exec({ type: 'updateGuardaCorpo', id, patch: { hospedeiro: { ...g.hospedeiro, caminho: r.primeiro, fechado: false } } });
    if (r.segundo) {
      const { order: _order, ...rest } = g;
      env.exec({ type: 'addGuardaCorpo', guardaCorpo: { ...rest, id: newId(PREFIXO_ID_GUARDA_CORPO), mark: '', hospedeiro: { ...g.hospedeiro, caminho: r.segundo, fechado: false } } });
    }
  });
  return true;
}

/** Apara ou estende um guarda-corpo manual até a reta de referência. Diz o motivo na barra quando recusa. */
export function aparaGuardaCorpo(env: ToolEnv, id: Id, at: Vec2, ref: RetaRef): boolean {
  const g = manualDe(env.project(), id);
  if (!g) return false;
  const r = aparaCaminho(g.hospedeiro, at, ref);
  if ('erro' in r) {
    env.say(r.erro === 'paralelo' ? 'O guarda-corpo é paralelo à referência: não há canto.' : r.erro === 'fechado' ? 'Guarda-corpo em laço fechado não se apara: divida-o antes.' : 'A referência fica fora do alcance do último trecho do guarda-corpo.');
    return false;
  }
  env.transaction('Aparar/Estender guarda-corpo', () => env.exec({ type: 'updateGuardaCorpo', id, patch: { hospedeiro: { ...g.hospedeiro, caminho: r.caminho } } }));
  return true;
}
