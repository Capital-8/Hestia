import { dist, type Vec2 } from '@hestia/geom';
import { isGuardaCorpo, type GuardaCorpo, type Id, type Project } from '@hestia/model';
import type { GripHold } from './selectGrips.ts';
import type { PreviewItem, ToolEnv } from './types.ts';
import { langOf, t as translate } from './i18n.ts';

/** Alça de vértice de um caminho manual de guarda-corpo (decisão 0055 §6a). */
export interface GripVerticeGC {
  indice: number;
  x: number;
  y: number;
}

/** Vértices do caminho manual; guarda-corpo hospedado em escada ou rampa não tem alça de vértice (vem do hospedeiro). */
export function gripsDoGuardaCorpo(g: GuardaCorpo): GripVerticeGC[] {
  if (g.hospedeiro.tipo !== 'manual') return [];
  return g.hospedeiro.caminho.map((v, indice) => ({ indice, x: v.x, y: v.y }));
}

/**
 * Patch do `updateGuardaCorpo` que move um vértice do caminho para `ponto`, preservando o desnível `dz` e os demais
 * vértices. Null quando o guarda-corpo não é manual ou o índice não existe.
 */
export function patchMoverVerticeGC(g: GuardaCorpo, indice: number, ponto: Vec2): Partial<Omit<GuardaCorpo, 'id' | 'kind' | 'order'>> | null {
  const h = g.hospedeiro;
  if (h.tipo !== 'manual' || indice < 0 || indice >= h.caminho.length) return null;
  const caminho = h.caminho.map((v, i) => (i === indice ? { ...v, x: ponto.x, y: ponto.y } : { ...v }));
  return { hospedeiro: { ...h, caminho } };
}

/** Alça de vértice sob o cursor entre os guarda-corpos manuais selecionados. */
export interface RailingGrip {
  guardaId: Id;
  index: number;
  at: Vec2;
}

/** Alça de vértice sob `at` entre os guarda-corpos manuais selecionados (a mais próxima vence). */
export function railingGripAt(p: Project, ids: Id[], at: Vec2, mpp: number): RailingGrip | null {
  const tol = 9 * mpp;
  let best: (RailingGrip & { d: number }) | null = null;
  for (const id of ids) {
    const g = p.elements[id];
    if (!isGuardaCorpo(g)) continue;
    for (const v of gripsDoGuardaCorpo(g)) {
      const q = { x: v.x, y: v.y };
      const d = dist(q, at);
      if (d <= tol && (!best || d < best.d)) best = { guardaId: g.id, index: v.indice, at: q, d };
    }
  }
  return best ? { guardaId: best.guardaId, index: best.index, at: best.at } : null;
}

/** Polilinha do caminho com o vértice `index` levado a `ponto` (para a prévia do arrasto). */
function caminhoComVertice(g: GuardaCorpo, index: number, ponto: Vec2): Vec2[] {
  return gripsDoGuardaCorpo(g).map((v) => (v.indice === index ? ponto : { x: v.x, y: v.y }));
}

/**
 * Alça de vértice como `GripHold`: arrastar mostra o caminho com o vértice na nova posição; soltar grava o caminho novo
 * num único passo de desfazer ("Mover vértice do guarda-corpo"). Sem movimento, não grava.
 */
export function railingHold(env: ToolEnv, g: RailingGrip): GripHold {
  let point: Vec2 = g.at;
  return {
    at: g.at,
    keepsFocus: false,
    drag(_p, snap): PreviewItem[] {
      const r = env.project().elements[g.guardaId];
      if (!isGuardaCorpo(r)) return [];
      point = snap({ extraPoints: gripsDoGuardaCorpo(r).filter((v) => v.indice !== g.index).map((v) => ({ x: v.x, y: v.y })) });
      const pts = caminhoComVertice(r, g.index, point);
      const items: PreviewItem[] = [];
      for (let i = 1; i < pts.length; i++) items.push({ kind: 'line', a: pts[i - 1]!, b: pts[i]!, dashed: true });
      return items;
    },
    release(): void {
      const r = env.project().elements[g.guardaId];
      if (!isGuardaCorpo(r) || dist(point, g.at) < 1e-9) return;
      const patch = patchMoverVerticeGC(r, g.index, point);
      if (!patch) return;
      env.transaction(translate(langOf(env), 'tl_undo_move_railing_vertex'), () => env.exec({ type: 'updateGuardaCorpo', id: g.guardaId, patch }));
    },
  };
}

/** Alças de vértice dos guarda-corpos manuais selecionados, desenhadas como pontos (com a grade de alças do canvas). */
export function railingHandlePreview(p: Project, sel: Id[], grips: boolean): PreviewItem[] {
  if (!grips) return [];
  const items: PreviewItem[] = [];
  for (const id of sel) {
    const g = p.elements[id];
    if (!isGuardaCorpo(g)) continue;
    for (const v of gripsDoGuardaCorpo(g)) items.push({ kind: 'point', at: { x: v.x, y: v.y } });
  }
  return items;
}
