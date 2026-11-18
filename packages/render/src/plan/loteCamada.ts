import type { Id, Project } from '@hestia/model';
import type { PlanInput } from './build.ts';
import type { FloorOps } from './floors.ts';
import { loteOps } from './lote.ts';
import type { PlanPaint } from './style.ts';

/**
 * Lotes ocultos na vista: o Hide in View do usuário (menos os revelados) e, com a categoria `lot` desligada, todos os do nível.
 * Mesma regra de `ocultosDoGuardaCorpo`.
 */
export function ocultosDoLote(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, revealed: ReadonlySet<Id> | undefined, categoriaVisivel: boolean): ReadonlySet<Id> | undefined {
  const out = new Set<Id>();
  if (hidden) for (const id of hidden) if (!revealed?.has(id)) out.add(id);
  if (!categoriaVisivel) for (const e of Object.values(p.elements)) if (e.kind === 'lot' && e.levelId === levelId) out.add(e.id);
  return out.size > 0 ? out : undefined;
}

/**
 * Camada dos lotes do nível na planta: contorno, área edificável e texto dos lados, no estilo da categoria `lot`. Lote de outro nível não
 * entra; a planta de área não desenha lote (ela usa o perfil claro das áreas). Quem chama aplica `paintOps` (transparência e meio-tom).
 */
export function loteOpsDaPlanta(input: PlanInput, paint: PlanPaint, scale: number): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  if (input.areaPlan) return out;
  const { project: p, levelId } = input;
  const ocultos = ocultosDoLote(p, levelId, input.hidden, input.revealed, paint.visible);
  for (const e of Object.values(p.elements)) {
    if (e.kind !== 'lot' || e.levelId !== levelId || ocultos?.has(e.id)) continue;
    const o = loteOps(p, e, input.theme, input.dark, paint, scale, input.lang);
    out.fills.push(...o.fills);
    out.strokes.push(...o.strokes);
    out.labels.push(...o.labels);
  }
  return out;
}
