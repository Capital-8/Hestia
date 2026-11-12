import { levelElevation, viewRangeOf, type Id, type Project } from '@hestia/model';
import type { PlanInput } from './build.ts';
import { guardaCorpoOps } from './guardaCorpo.ts';
import { paintOps, planStyleOf } from './style.ts';
import { areaPlanProfile, FLOOR_PLAN_PROFILE, type PlanOps, type PlanProfile } from './types.ts';

/**
 * Guarda-corpos ocultos na vista: o Hide in View do usuário (menos os revelados) e, com a categoria desligada, todos os do nível. Não vem da
 * vista do nível (`planViewOf`): o guarda-corpo não entra nela, e a vista é reaproveitada quando só um guarda-corpo muda.
 */
export function ocultosDoGuardaCorpo(p: Project, levelId: Id, hidden: ReadonlySet<Id> | undefined, revealed: ReadonlySet<Id> | undefined, categoriaVisivel: boolean): ReadonlySet<Id> | undefined {
  const out = new Set<Id>();
  if (hidden) for (const id of hidden) if (!revealed?.has(id)) out.add(id);
  if (!categoriaVisivel) for (const e of Object.values(p.elements)) if (e.kind === 'railing' && e.levelId === levelId) out.add(e.id);
  return out.size > 0 ? out : undefined;
}

/**
 * Camada própria dos guarda-corpos do nível (linhas do kernel, no estilo da categoria de escadas): lê só os guarda-corpos, as escadas e rampas
 * hospedeiras e as opções da vista, nunca a resolução das paredes. Mesmas linhas e mesmo estilo que saíam dentro de `buildPlanGeometry`.
 */
export function buildPlanGuardaCorpo(input: PlanInput): PlanOps {
  const { project: p, theme } = input;
  const vazio: PlanOps = { fills: [], strokes: [], labels: [] };
  const profile: PlanProfile = input.profile ?? (input.areaPlan ? areaPlanProfile(input.areaPlan) : FLOOR_PLAN_PROFILE);
  if (!profile.stairs || input.roofPlanMode === true) return vazio;
  const nivel = p.levels.find((l) => l.id === input.levelId);
  if (!nivel) return vazio;
  const style = planStyleOf(p, input.levelId, input.viewport.zoom, input.areaPlan?.scale);
  const fillBase = input.dark ? theme.bg : '#ffffff';
  const cutZ = levelElevation(p, input.levelId) + viewRangeOf(p, input.levelId).cut;
  const ocultos = ocultosDoGuardaCorpo(p, input.levelId, input.hidden, input.revealed, style.paint.railing.visible);
  const o = paintOps(guardaCorpoOps(p, input.levelId, ocultos, theme, input.dark, style.paint.stair, cutZ), style.paint.stair, fillBase);
  return { fills: o.fills, strokes: o.strokes, labels: o.labels };
}
