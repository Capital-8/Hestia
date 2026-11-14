import { CORTE_PADRAO_PLANTA_MASSA, ESTILO_PLANTA_MASSA, servicoMassa, type LinhaPlantaMassaProjeto } from '@hestia/engine';
import { isMass, levelElevation, viewRangeOf, type Id, type Mass, type PerfilMassa, type Project } from '@hestia/model';
import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { mix } from './color.ts';
import { STAIR_DASH } from './stairs.ts';
import { espessuraDeCorte, espessuraDeProjecao, type PlanPaint } from './style.ts';
import type { FloorOps } from './floors.ts';
import type { PlanTheme, StrokeOp } from './types.ts';

/** Cota de corte padrão da planta (m acima do nível) quando a vista não traz uma. É a mesma da captura (`apoioDeSnap`). */
export const MASSA_CORTE_PADRAO = CORTE_PADRAO_PLANTA_MASSA;

/** Pontos amostrados de um círculo ou de uma elipse no contorno de reserva (sem kernel) e na extensão. */
const AMOSTRAS = 48;

const amostra = (n: number, f: (t: number) => Vec2): Vec2[] => Array.from({ length: n }, (_, i) => f((2 * Math.PI * i) / n));

/** Pontos de um perfil em coordenadas locais (origem no centro), sem o ponto de fechamento repetido. Polígono regular com vértice em +x. */
export function pontosDoPerfil(perfil: PerfilMassa): Vec2[] {
  switch (perfil.forma) {
    case 'circulo':
      return amostra(AMOSTRAS, (t) => ({ x: perfil.raio * Math.cos(t), y: perfil.raio * Math.sin(t) }));
    case 'elipse':
      return amostra(AMOSTRAS, (t) => ({ x: perfil.rx * Math.cos(t), y: perfil.ry * Math.sin(t) }));
    case 'poligono':
      return amostra(perfil.lados, (t) => ({ x: perfil.raio * Math.cos(t), y: perfil.raio * Math.sin(t) }));
    case 'livre':
      return perfil.pontos.map((q) => ({ x: q.x, y: q.y }));
  }
}

/** Anel de uma seção no mundo, sem arranjo: escala, rotação e deslocamento do perfil, depois a origem da massa (A.4 regra 3). */
function anelDaSecao(m: Mass, i: number): Vec2[] {
  const s = m.secoes[i]!;
  const c = Math.cos(s.rotacao);
  const sn = Math.sin(s.rotacao);
  return pontosDoPerfil(s.perfil).map((q) => {
    const x = q.x * s.escala;
    const y = q.y * s.escala;
    return { x: m.origem.x + s.dx + x * c - y * sn, y: m.origem.y + s.dy + x * sn + y * c };
  });
}

/** Gira os pontos em torno de (cx, cy) pelo ângulo `a` (rad). */
export function girarEm(pts: readonly Vec2[], cx: number, cy: number, a: number): Vec2[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map((q) => {
    const x = q.x - cx;
    const y = q.y - cy;
    return { x: cx + x * c - y * s, y: cy + x * s + y * c };
  });
}

/** Cópias de um anel: uma por cópia do arranjo, cada uma girada `i · anguloTotal / n` em torno do centro (A.4 regra 7). */
function copiasDo(m: Mass, anel: Vec2[]): Vec2[][] {
  if (!m.arranjo) return [anel];
  const { n, cx, cy, anguloTotal } = m.arranjo;
  return Array.from({ length: n }, (_, i) => girarEm(anel, cx, cy, (i * anguloTotal) / n));
}

/** Contorno da base de cada cópia (perfil da primeira seção): o que a planta mostra sem kernel (A.5, "Kernel desligado"). */
export function contornoDaBase(m: Mass): Vec2[][] {
  return m.secoes.length === 0 ? [] : copiasDo(m, anelDaSecao(m, 0));
}

/** Todos os pontos da massa em planta (todas as seções e todas as cópias): a caixa da extensão do modelo. */
export function pontosDaMassaEmPlanta(m: Mass): Vec2[] {
  return m.secoes.flatMap((_, i) => copiasDo(m, anelDaSecao(m, i)).flat());
}

/** Faixa de vista do nível em cotas absolutas (base e topo), a mesma que o kernel recebe. */
function faixaDoNivel(p: Project, levelId: Id): { zMin: number; zMax: number } {
  const cota = levelElevation(p, levelId);
  const faixa = viewRangeOf(p, levelId);
  return { zMin: cota + faixa.bottom, zMax: cota + faixa.top };
}

/**
 * Massas que aparecem na planta do nível: as do próprio nível e as de OUTRO nível que atravessam a cota de corte (a massa ocupa vários
 * pavimentos; o kernel decide o corte, o TS só escolhe quais massas consultar).
 */
export function massasNaPlanta(p: Project, levelId: Id, cutZ: number): Mass[] {
  const out: Mass[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isMass(e)) continue;
    if (e.levelId === levelId) {
      out.push(e);
      continue;
    }
    const base = levelElevation(p, e.levelId) + e.baseOffset;
    const topo = base + (e.secoes[e.secoes.length - 1]?.z ?? 0);
    if (base <= cutZ && cutZ <= topo) out.push(e);
  }
  return out;
}

/** Tem alguma massa no projeto? Memorizado por projeto, para a chave da camada não custar uma varredura por quadro. */
const comMassa = new WeakMap<Project, boolean>();
export function temMassaNoProjeto(p: Project): boolean {
  let r = comMassa.get(p);
  if (r === undefined) {
    r = Object.values(p.elements).some((e) => e.kind === 'mass');
    comMassa.set(p, r);
  }
  return r;
}

/**
 * Linhas de planta das massas do nível (consulta 141 do kernel, em todos os níveis e filtrada pelas massas da planta): anel cortado
 * (estilo 0), seções abaixo do corte dentro da faixa (1) e seções acima do corte (2). `null` sem kernel pronto ou com erro dele.
 */
export function linhasMassaPlanta(p: Project, levelId: Id, cutZ: number): LinhaPlantaMassaProjeto[] | null {
  const s = servicoMassa();
  if (!temMassaNoProjeto(p) || !s.pronto()) return null;
  const ids = new Set(massasNaPlanta(p, levelId, cutZ).map((m) => m.id));
  if (ids.size === 0) return [];
  const faixa = faixaDoNivel(p, levelId);
  const todas = s.planta(p, null, cutZ, faixa.zMin, faixa.zMax);
  return todas ? todas.filter((l) => ids.has(l.massaId)) : null;
}

/** Anéis cortados de cada massa da planta (ou o contorno da base de cada uma, sem kernel): o que o clique e a caixa usam. */
export function aneisDaMassaNoNivel(p: Project, levelId: Id, cutZ?: number): Map<Id, Vec2[][]> {
  const z = cutZ ?? levelElevation(p, levelId) + MASSA_CORTE_PADRAO;
  const out = new Map<Id, Vec2[][]>();
  const linhas = linhasMassaPlanta(p, levelId, z);
  if (linhas) {
    for (const l of linhas) {
      if (l.estilo !== ESTILO_PLANTA_MASSA.cortado || l.pontos.length < 3) continue;
      const lista = out.get(l.massaId) ?? [];
      lista.push(semRepetido(l.pontos));
      out.set(l.massaId, lista);
    }
    return out;
  }
  for (const m of massasNaPlanta(p, levelId, z)) out.set(m.id, contornoDaBase(m));
  return out;
}

/** Sem o ponto de fechamento repetido (o kernel repete o primeiro ponto no fim do anel). */
function semRepetido(pts: ReadonlyArray<Vec2>): Vec2[] {
  const out = pts.map((q) => ({ x: q.x, y: q.y }));
  if (out.length > 2 && dist(out[0]!, out[out.length - 1]!) < 1e-9) out.pop();
  return out;
}

/** Ponto dentro do anel (regra par-ímpar). */
function dentroDoAnel(anel: readonly Vec2[], at: Vec2): boolean {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const a = anel[i]!;
    const b = anel[j]!;
    if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Distância do ponto ao contorno do anel. */
function distanciaAoAnel(anel: readonly Vec2[], at: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < anel.length; i++) best = Math.min(best, dist(at, closestOnSegment(at, anel[i]!, anel[(i + 1) % anel.length]!)));
  return best;
}

/**
 * Massa sob o ponto da planta, no nível: a região clicável é o contorno do anel cortado (dentro dele ou a até 4 px do traço). Entre duas
 * na tolerância vence a mais próxima. Oculta na vista não é alvo. Sem kernel, o alvo é o contorno da base.
 */
export function pickMassaAt(p: Project, levelId: Id, at: Vec2, mpp: number, hidden?: ReadonlySet<Id>, cutZ?: number): Id | null {
  const tol = 4 * mpp;
  let melhor: { id: Id; d: number } | null = null;
  for (const [id, aneis] of aneisDaMassaNoNivel(p, levelId, cutZ)) {
    if (hidden?.has(id)) continue;
    for (const anel of aneis) {
      const d = dentroDoAnel(anel, at) ? 0 : distanciaAoAnel(anel, at);
      if (d <= tol && (!melhor || d < melhor.d)) melhor = { id, d };
    }
  }
  return melhor?.id ?? null;
}

/** Massas cujo anel cortado cabe inteiro na caixa (seleção por janela). Oculta na vista não entra. */
export function massasNaCaixa(p: Project, levelId: Id, caixa: { minX: number; minY: number; maxX: number; maxY: number }, hidden?: ReadonlySet<Id>, cutZ?: number): Id[] {
  const out: Id[] = [];
  for (const [id, aneis] of aneisDaMassaNoNivel(p, levelId, cutZ)) {
    if (hidden?.has(id)) continue;
    const cabe = aneis.length > 0 && aneis.every((anel) => anel.every((q) => q.x >= caixa.minX && q.x <= caixa.maxX && q.y >= caixa.minY && q.y <= caixa.maxY));
    if (cabe) out.push(id);
  }
  return out;
}

/** Realce de seleção: o anel cortado (ou o contorno da base) das massas selecionadas, na cor de seleção. */
export function massaSelectionOps(p: Project, levelId: Id, selection: readonly Id[], theme: PlanTheme, cutZ?: number): StrokeOp[] {
  if (selection.length === 0) return [];
  const sel = new Set(selection);
  const out: StrokeOp[] = [];
  for (const [id, aneis] of aneisDaMassaNoNivel(p, levelId, cutZ)) {
    if (!sel.has(id)) continue;
    for (const anel of aneis) out.push({ pts: anel, closed: true, widthPx: 3, color: theme.select, alpha: 1 });
  }
  return out;
}

/**
 * Massas da planta: linhas do kernel (cortado forte; projetado fino; acima do corte tracejado, na cor suave). Sem kernel pronto, só o
 * contorno tracejado da base de cada massa do nível, sem lançar. Massa oculta (`hidden`) não sai.
 */
export function massaOps(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, theme: PlanTheme, dark: boolean, paint: PlanPaint, cutZ: number | undefined): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (!paint.visible) return out;
  const corte = espessuraDeCorte(paint);
  const projecao = espessuraDeProjecao(paint);
  const base = dark ? theme.bg : '#ffffff';
  const cor = paint.color ?? theme.ink;
  const suave = mix(theme.ink, base, 0.55);
  const z = cutZ ?? levelElevation(p, levelId) + MASSA_CORTE_PADRAO;
  const linhas = linhasMassaPlanta(p, levelId, z);
  if (!linhas) {
    for (const m of massasNaPlanta(p, levelId, z)) {
      if (hidden?.has(m.id)) continue;
      for (const anel of contornoDaBase(m)) out.strokes.push({ pts: anel, closed: true, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
    }
    return out;
  }
  for (const l of linhas) {
    if (hidden?.has(l.massaId)) continue;
    const pts = semRepetido(l.pontos);
    if (pts.length < 2) continue;
    if (l.estilo === ESTILO_PLANTA_MASSA.cortado) out.strokes.push({ pts, closed: true, ...corte, color: cor, alpha: 1 });
    else if (l.estilo === ESTILO_PLANTA_MASSA.projetado) out.strokes.push({ pts, closed: true, ...projecao, color: cor, alpha: 1 });
    else out.strokes.push({ pts, closed: true, ...projecao, color: suave, alpha: 1, dash: STAIR_DASH });
  }
  return out;
}

/**
 * Massas ocultas na vista: o Hide in View do usuário (menos as reveladas) e, com a categoria desligada, todas as massas do projeto (uma massa
 * de outro nível pode aparecer no nível atual). Não vem da vista do nível: a massa não entra nela.
 */
export function ocultosDaMassa(p: Project, hidden: ReadonlySet<Id> | undefined, revealed: ReadonlySet<Id> | undefined, categoriaVisivel: boolean): ReadonlySet<Id> | undefined {
  const out = new Set<Id>();
  if (hidden) for (const id of hidden) if (!revealed?.has(id)) out.add(id);
  if (!categoriaVisivel) for (const e of Object.values(p.elements)) if (isMass(e)) out.add(e.id);
  return out.size > 0 ? out : undefined;
}
