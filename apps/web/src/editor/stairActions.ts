import { missingText, type StairStatus } from '@hestia/tools';
import { refitStairToHeight } from '@hestia/engine';
import type { Id, Project, ProjectStore, Stair, StairRun } from '@hestia/model';

interface Pt {
  x: number;
  y: number;
}

export interface StairBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Pontos de referência da escada: extremos de todas as curvas (limites, espelhos, caminhada e contorno dos patamares). */
export function stairPoints(s: Stair): Pt[] {
  return s.components.flatMap((c) => {
    if (c.kind === 'landing') return c.boundary.flatMap((k) => [k.a, k.b]);
    const run: StairRun = c;
    return [...run.boundaryLeft, ...run.boundaryRight, ...run.risers, ...run.path].flatMap((k) => [k.a, k.b]);
  });
}

/** Caixa que envolve a escada em planta (para enquadrar em "Ir para"); null sem geometria. */
export function stairBox(s: Stair): StairBox | null {
  const pts = stairPoints(s);
  if (pts.length === 0) return null;
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Campos que mudam a altura entre níveis e, portanto, podem exigir o reajuste dos espelhos. */
const FIT_KEYS: ReadonlySet<keyof Stair> = new Set(['topLevelId', 'topOffset', 'baseOffset', 'height', 'levelId', 'typeId', 'riserMode']);

/**
 * Altera campos de uma ou mais escadas num único passo de desfazer (um `updateElements` dentro de uma transação).
 * Quando a mudança mexe na altura (nível de topo, deslocamentos, tipo ou modo dos espelhos), a escada é reajustada
 * na mesma transação pela fórmula do tipo (`refitStairToHeight`, decisão 0041): os lances esticam/encolhem para o piso
 * calculado e o nº de espelhos é mantido.
 */
export function patchStairs(store: ProjectStore, ids: Id[], patch: Partial<Stair>, label = 'Editar escada'): void {
  if (ids.length === 0) return;
  const refit = Object.keys(patch).some((k) => FIT_KEYS.has(k as keyof Stair));
  store.transaction(label, () => {
    store.exec({ type: 'updateElements', ids, patch });
    if (!refit) return;
    for (const id of ids) {
      const s = store.project.elements[id];
      if (!s || s.kind !== 'stair') continue;
      const fit = refitStairToHeight(store.project, s);
      if (!fit.components) continue;
      store.exec({
        type: 'updateElements',
        ids: [id],
        patch: {
          components: fit.components,
          ...(fit.freePath ? { freePath: fit.freePath } : {}),
          ...(fit.manualLandings ? { manualLandings: fit.manualLandings } : {}),
        },
      });
    }
  });
}

/** Nota da barra do croqui: o 1º erro (cor de erro); sem erro, o 1º aviso; sem nada, null. */
export function stairNote(st: Pick<StairStatus, 'firstError' | 'issues'> & Partial<Pick<StairStatus, 'created' | 'remaining' | 'desired'>>): { tone: 'error' | 'warning'; text: string } | null {
  if (st.firstError) return { tone: 'error', text: st.firstError };
  // Espelhos faltando: a conta vai à barra antes do aviso de norma (Concluir não grava enquanto faltarem).
  const missing = st.created !== undefined && st.remaining !== undefined && st.desired !== undefined ? missingText({ created: st.created, remaining: st.remaining, desired: st.desired }) : null;
  if (missing) return { tone: 'warning', text: missing };
  const w = st.issues.find((i) => i.severity === 'warning');
  return w ? { tone: 'warning', text: w.message } : null;
}

/** Tipo de escada que a interface mostra: o escolhido se existir no projeto, senão o primeiro (nunca vazio). */
export function keptStairType(p: Project, current: Id | null | undefined): Id {
  if (current && p.stairTypes[current]) return current;
  return Object.keys(p.stairTypes)[0] ?? current ?? '';
}

/** Valores comuns a todas as escadas selecionadas, ou `mixed` quando divergem. */
export function commonOf<T, K>(items: T[], get: (t: T) => K): { value: K; mixed: boolean } {
  const first = get(items[0]!);
  return { value: first, mixed: items.some((x) => get(x) !== first) };
}
