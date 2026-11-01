import { dist, dot, norm, sub, type Vec2 } from '@hestia/geom';
import { dimRefsNear, dimensionPoints, lineRefNormal, newId, wallLinesNear, type Command, type Dimension, type DimensionElementRef, type DimensionRef, type Id, type Project } from '@hestia/model';
import { chooseRefs } from '../dimensionTool.ts';
import { vistaDaCota, type CotaVista } from './providers/dimension.ts';

/** Cotas da vista (nível ou planta de área) em ordem de criação. */
function dimsOf(p: Project, vista: CotaVista): Dimension[] {
  const level = p.levels.find((l) => l.id === vista.levelId);
  if (!vista.planId) return level?.dimensions ?? [];
  const plan = p.areaPlans?.find((x) => x.id === vista.planId);
  return plan?.annotations?.dimensions ?? [];
}

const at = (vista: CotaVista): { levelId: Id; planId?: Id } => ({ levelId: vista.levelId, ...(vista.planId ? { planId: vista.planId } : {}) });

/**
 * "Adicionar referência" (Revit: Edit Witness Lines): divide a cota na feição clicada, entre as duas pontas. As duas
 * metades formam uma cadeia (`chainId`) e herdam afastamento, direção e estilo. Pura: devolve comandos ou o motivo.
 */
export function addRefCommands(project: Project, levelId: Id, dimId: Id, click: Vec2, tol: number): { commands: Command[] } | { error: string } {
  const vista = vistaDaCota(project, levelId, dimId);
  const d = vista ? dimsOf(project, vista).find((x) => x.id === dimId) : undefined;
  if (!vista || !d || d.angular) return { error: 'Cota não encontrada (ou angular).' };
  const pts = dimensionPoints(project, d);
  const len = dist(pts.a, pts.b);
  if (len < 0.02) return { error: 'A cota é curta demais para receber outra referência.' };
  const dir = norm(sub(pts.b, pts.a));
  const mode = d.mode ?? 'aligned';
  const points = dimRefsNear(project, levelId, click, tol);
  const lines = wallLinesNear(project, levelId, click, tol);
  if (!points.length && !lines.length) return { error: 'Nenhuma parede, porta, janela ou feição perto do clique.' };
  const cands = { points, lines };
  // Cota entre linhas paralelas: a nova referência também é uma linha paralela às existentes.
  const n = lineRefNormal(project, d.refs?.a) ?? lineRefNormal(project, d.refs?.b);
  const parallel = n ? lines.find((l) => Math.abs(l.normal.x * n.y - l.normal.y * n.x) < 1e-6) : undefined;
  const chosen = (parallel ? parallel.ref : chooseRefs(cands, undefined, mode === 'aligned' ? 'aligned' : mode).ra) as DimensionElementRef | DimensionRef | undefined;
  if (!chosen) return { error: 'Não há referência utilizável nesse ponto.' };
  const refPoint: Vec2 = (lines.find((l) => l.ref === chosen)?.point) ?? points.find((q) => q.ref === chosen)?.point ?? click;
  const t = dot(sub(refPoint, pts.a), dir) / len;
  if (t < 0.01 || t > 0.99) return { error: 'A nova referência precisa ficar entre as duas pontas da cota.' };
  const chainId = d.chainId ?? newId('chain');
  const first: Partial<Dimension> = { b: refPoint, refs: { ...(d.refs?.a ? { a: d.refs.a } : {}), b: chosen }, chainId };
  const second: Dimension = { ...d, id: newId('dim'), a: refPoint, refs: { a: chosen, ...(d.refs?.b ? { b: d.refs.b } : {}) }, chainId, textAt: undefined, text: undefined, locked: undefined, lockedValue: undefined };
  const base = at(vista);
  return {
    commands: [
      { type: 'updateDimension', ...base, id: d.id, patch: { ...first, locked: undefined, lockedValue: undefined } },
      { type: 'addDimension', ...base, dimension: second },
    ],
  };
}

/**
 * "Remover referência" (Revit: Delete Witness Line): junta a cota com a vizinha da cadeia no lado `side`, apagando a
 * referência do meio. Devolve os comandos ou o motivo.
 */
export function mergeRefCommands(project: Project, levelId: Id, dimId: Id, side: 'a' | 'b'): { commands: Command[] } | { error: string } {
  const vista = vistaDaCota(project, levelId, dimId);
  const list = vista ? dimsOf(project, vista) : [];
  const d = list.find((x) => x.id === dimId);
  if (!vista || !d) return { error: 'Cota não encontrada.' };
  if (!d.chainId) return { error: 'A cota não faz parte de uma cadeia.' };
  const members = list.filter((x) => x.chainId === d.chainId);
  const i = members.findIndex((x) => x.id === d.id);
  const other = members[side === 'b' ? i + 1 : i - 1];
  if (!other) return { error: 'Não há trecho vizinho desse lado da cadeia.' };
  const [first, second] = side === 'b' ? [d, other] : [other, d];
  const base = at(vista);
  return {
    commands: [
      { type: 'updateDimension', ...base, id: first.id, patch: { b: second.b, refs: { ...(first.refs?.a ? { a: first.refs.a } : {}), ...(second.refs?.b ? { b: second.refs.b } : {}) }, locked: undefined, lockedValue: undefined } },
      { type: 'removeDimension', ...base, id: second.id },
    ],
  };
}
