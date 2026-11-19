import { pointsText, type SkeletonStep } from '@hestia/geom';
import { resolveRoofs, roofProfileError } from '@hestia/engine';
import { formatQuantity, isRoof, mansardProblems, unitsOf, type Id, type Project, type Roof } from '@hestia/model';
import { hasRoofArcs, roofEaveArcsProblem } from './perimeterRoofArcs.ts';
import { eaveProblem } from './roofGeom.ts';
import { t, type Lang } from './i18n.ts';
import type { ToolEnv } from './types.ts';

/** Chaves que mudam a geometria das águas. Só uma alteração delas é conferida pelo motor. */
const GEOMETRY_KEYS: Array<keyof Roof> = ['boundary', 'holes', 'holeSlopes', 'shape', 'edgeSlopes', 'edgeOverhangs', 'edgeSag', 'mansard', 'slopePercent', 'dir', 'planes', 'profile', 'levelId', 'heightOffset'];

/** Verdadeiro quando `patch` altera alguma propriedade geométrica das águas do telhado. */
export function isRoofGeometryPatch(patch: Partial<Roof>): boolean {
  return Object.keys(patch).some((k) => GEOMETRY_KEYS.includes(k as keyof Roof));
}

/** Motivo para um telhado com forma que não produz água, em português. */
function noWaterReason(r: Roof): string {
  if (r.shape === 'free') return 'nenhuma água fica sobre o beiral';
  if (r.shape === 'edges') return 'as arestas que definem inclinação não formam águas';
  if (r.shape === 'extrusion') return roofProfileError(r.profile) ?? 'o perfil não cobre o contorno';
  return 'o contorno não gera águas com esta forma';
}

/** Índice do vértice do contorno onde está o degrau, ou null quando o degrau é interno (cruzamento de águas). */
function cornerAt(step: SkeletonStep, roof: Roof): number | null {
  for (let i = 0; i < roof.boundary.length; i++) {
    const v = roof.boundary[i]!;
    if (Math.hypot(v.x - step.x, v.y - step.y) <= 1e-6) return i;
  }
  return null;
}

/** Resultado da verificação de telhado: erro impeditivo (se houver) e degraus detectados na superfície. */
export interface RoofCheckResult {
  problem: string | null;
  steps: SkeletonStep[];
}

/**
 * Pergunta exibida ao usuário quando o formato do telhado cria degraus verticais entre águas (ex.: canto reentrante
 * entre beiral e empena) para decidir entre fechar os vãos com testeira (`closeStepGaps: true`) ou deixar aberto.
 */
export function roofStepMessage(p: Project, roof: Roof, steps: readonly SkeletonStep[], lang: Lang = 'pt'): string {
  const maxDz = steps.reduce((m, s) => Math.max(m, s.dz), 0);
  const dz = formatQuantity(unitsOf(p, lang), 'length', maxDz);
  const at = pointsText([...steps]);
  const key = steps.some((s) => cornerAt(s, roof) !== null) ? 'tl_msg_roof_step_corner' : 'tl_msg_roof_step_planes';
  return t(lang, key, { dz, at });
}

/**
 * Confere `roofs` no projeto: devolve o motivo de bloqueio (ou null quando válido) e os eventuais degraus (`steps`)
 * para que a UI peça a confirmação de fechamento ao usuário. Degraus entre águas não bloqueiam a criação/edição.
 */
export function roofCheck(p: Project, roofs: Roof[]): RoofCheckResult {
  if (roofs.length === 0) return { problem: null, steps: [] };
  const elements = { ...p.elements };
  for (const r of roofs) elements[r.id] = r;
  const q: Project = { ...p, elements };
  const steps: SkeletonStep[] = [];
  for (const r of roofs) {
    if (!p.levels.some((l) => l.id === r.levelId)) return { problem: 'o nível do telhado não existe', steps: [] };
    if (!p.roofTypes[r.typeId]) return { problem: 'o tipo de telhado não existe no projeto', steps: [] };
    if (r.boundary.length < 3) return { problem: 'o contorno tem menos de 3 pontos', steps: [] };
    // Antes do motor: um beiral que se corta faz o esqueleto falhar com uma mensagem genérica.
    if (r.footprint && r.shape !== 'free' && r.shape !== 'extrusion') {
      const eave = hasRoofArcs(r) ? roofEaveArcsProblem(r) : eaveProblem(r.footprint, r.boundary, r.edgeOverhangs);
      if (eave) return { problem: eave, steps: [] };
    }
    const res = resolveRoofs(q, r.levelId).find((x) => x.roofId === r.id);
    if (!res) return { problem: 'o telhado não pôde ser resolvido', steps: [] };
    if (res.problem) return { problem: res.problem, steps: [] };
    if (res.planes.length === 0) return { problem: noWaterReason(r), steps: [] };
    if (res.steps?.length) steps.push(...res.steps);
  }
  return { problem: null, steps };
}

/**
 * Motivo pelo qual o motor não gera águas para `roofs` no estado dado, ou null quando todos têm águas. Usa o projeto com
 * estes telhados no lugar dos guardados; os demais telhados do nível não são conferidos. A ferramenta usa antes de criar
 * ou alterar, para que o telhado nunca desapareça em silêncio. Também recusa o beiral que se corta ou não cabe na pegada;
 * degraus entre águas são permitidos e retornados via `roofCheck`.
 */
export function roofProblem(p: Project, roofs: Roof[]): string | null {
  return roofCheck(p, roofs).problem;
}

/**
 * Motivo para aplicar `patch` aos telhados `ids`, ou null. Alterações que não mexem na geometria (marca, comentários,
 * tipo, beiral) não são conferidas: um telhado já sem águas continua editável nelas.
 */
export function roofPatchProblem(p: Project, ids: Id[], patch: Partial<Roof>): string | null {
  if (!isRoofGeometryPatch(patch)) return null;
  const roofs = ids.map((id) => p.elements[id]).filter(isRoof).map((r) => ({ ...r, ...patch }));
  // Mansarda com número inválido ou larga demais: recusa com a mensagem da validação do modelo.
  const mansard = roofs.flatMap((r) => mansardProblems(r, `"${r.mark || r.id}"`, unitsOf(p)))[0];
  return mansard ? mansard.message : roofProblem(p, roofs);
}

/** Aplica a alteração de telhados pelo ambiente da ferramenta, se o motor ainda gerar águas; senão não aplica e avisa. */
export function commitRoofPatch(env: Pick<ToolEnv, 'project' | 'exec' | 'say'>, ids: Id[], patch: Partial<Roof>, lang: Lang = 'pt'): boolean {
  const problem = roofPatchProblem(env.project(), ids, patch);
  if (problem) {
    env.say(t(lang, 'tl_msg_roof_change_failed', { problem }));
    return false;
  }
  env.exec({ type: 'updateElements', ids, patch });
  return true;
}
