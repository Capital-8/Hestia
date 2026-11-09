import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { guardaCorpoNoPonto, servicoGuardaCorpo, ServicoGuardaCorpo } from '@hestia/engine';
import { isGuardaCorpo, type GuardaCorpo, type Id, type Project } from '@hestia/model';

/**
 * Polilinhas em planta de um guarda-corpo hospedado (escada ou rampa). Gancho para as fases 3 e 4: até a geometria do
 * kernel existir, o hospedado não tem polilinha e não se seleciona pela planta. A fase que trouxer a geometria chama
 * `setRailingPlanShapes` na inicialização do app (a seleção, a visibilidade e o isolar já leem daqui).
 */
export type RailingPlanShapes = (p: Project, g: GuardaCorpo) => Vec2[][];
/** Por padrao, o eixo dos trechos que o kernel devolve (`guarda_caminhos`); sem kernel pronto, nada. */
let hostedPlanShapes: RailingPlanShapes = (p, g) => {
  const eixo = ServicoGuardaCorpo.temGuardaCorpo(p) ? servicoGuardaCorpo().eixos(p)?.find((e) => e.guardaId === g.id) : undefined;
  return eixo ? eixo.trechos.map((t) => t.map((n) => ({ x: n.x, y: n.y }))) : [];
};

/** Registra a fonte de polilinhas dos guarda-corpos hospedados (fases 3 e 4). */
export function setRailingPlanShapes(fn: RailingPlanShapes): void {
  hostedPlanShapes = fn;
}

/** Polilinhas de planta do guarda-corpo: o caminho manual (fechado ou não) ou, para hospedado, o gancho. */
export function railingPolylines(p: Project, g: GuardaCorpo): Vec2[][] {
  if (g.hospedeiro.tipo === 'manual') {
    const pts = g.hospedeiro.caminho.map((v) => ({ x: v.x, y: v.y }));
    if (pts.length < 2) return [];
    return [g.hospedeiro.fechado ? [...pts, pts[0]!] : pts];
  }
  return hostedPlanShapes(p, g);
}

function distToPolyline(at: Vec2, pl: Vec2[]): number {
  if (pl.length === 1) return dist(at, pl[0]!);
  let best = Infinity;
  for (let i = 1; i < pl.length; i++) best = Math.min(best, dist(at, closestOnSegment(at, pl[i - 1]!, pl[i]!)));
  return best;
}

/**
 * Guarda-corpo sob o ponto, no nível. Oculto na vista (`hidden`) não é alvo: o que não se vê não se seleciona. Entre
 * dois guarda-corpos na mesma tolerância vence o mais próximo.
 */
export function pickRailingAt(p: Project, levelId: Id, at: Vec2, mpp: number, hidden?: ReadonlySet<Id>): Id | null {
  const tol = 4 * mpp;
  // Com o kernel pronto, o alvo sao as mesmas linhas desenhadas na planta (eixo e pecas); sem ele, o eixo hospedado.
  const linhas = ServicoGuardaCorpo.temGuardaCorpo(p) ? servicoGuardaCorpo().planta(p, levelId, (p.levels.find((l) => l.id === levelId)?.elevation ?? 0) + 1.2, 1) : null;
  if (linhas) {
    const noKernel = guardaCorpoNoPonto(linhas.filter((l) => p.elements[l.guardaId]?.kind === 'railing' && (p.elements[l.guardaId] as { levelId?: string }).levelId === levelId), hidden ?? new Set<Id>(), at, tol);
    if (noKernel) return noKernel;
  }
  let best: { id: Id; d: number } | null = null;
  for (const e of Object.values(p.elements)) {
    if (!isGuardaCorpo(e) || e.levelId !== levelId || hidden?.has(e.id)) continue;
    for (const pl of railingPolylines(p, e)) {
      const d = distToPolyline(at, pl);
      if (d <= tol && (!best || d < best.d)) best = { id: e.id, d };
    }
  }
  return best?.id ?? null;
}
