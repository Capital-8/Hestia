import { pointsText, type SkeletonStep } from '@hestia/geom';
import { resolveRoofs, roofProfileError } from '@hestia/engine';
import { formatQuantity, isRoof, mansardProblems, unitsOf, type Id, type Project, type ResolvedUnits, type Roof } from '@hestia/model';
import { hasRoofArcs, roofEaveArcsProblem } from './perimeterRoofArcs.ts';
import { eaveProblem } from './roofGeom.ts';
import { t, type Lang } from './i18n.ts';
import type { ToolEnv } from './types.ts';

/** Chaves que mudam a geometria das águas. Só uma alteração delas é conferida pelo motor. */
const GEOMETRY_KEYS: Array<keyof Roof> = ['boundary', 'holes', 'shape', 'edgeSlopes', 'edgeOverhangs', 'edgeSag', 'mansard', 'slopePercent', 'dir', 'planes', 'profile', 'levelId', 'heightOffset'];

/** Motivo para um telhado com forma que não produz água, em português. */
function noWaterReason(r: Roof): string {
  if (r.shape === 'free') return 'nenhuma água fica sobre o beiral';
  if (r.shape === 'edges') return 'as arestas que definem inclinação não formam águas';
  if (r.shape === 'extrusion') return roofProfileError(r.profile) ?? 'o perfil não cobre o contorno';
  return 'o contorno não gera águas com esta forma';
}

/** Lista em português: "1", "1 e 2", "1, 2 e 3". */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Índice do vértice do contorno onde está o degrau, ou null quando o degrau é interno (cruzamento de águas). */
function cornerAt(step: SkeletonStep, roof: Roof): number | null {
  for (let i = 0; i < roof.boundary.length; i++) {
    const v = roof.boundary[i]!;
    if (Math.hypot(v.x - step.x, v.y - step.y) <= 1e-6) return i;
  }
  return null;
}

/**
 * Arestas (numeradas a partir de 1, como na barra) sem inclinação que chegam ao canto onde as águas dão o degrau.
 * Vazio quando o degrau não está num vértice do contorno: aí a dica não cita aresta.
 */
function gableEdgesAt(step: SkeletonStep, roof: Roof): number[] {
  const i = cornerAt(step, roof);
  if (i === null) return [];
  const n = roof.boundary.length;
  const out: number[] = [];
  for (const e of [(i - 1 + n) % n, i]) {
    const s = roof.edgeSlopes[e];
    if (s !== null && s !== undefined && s > 0) continue;
    if (!out.includes(e + 1)) out.push(e + 1);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Motivo de o telhado não fechar: vértices onde as águas se encontram em cotas diferentes (degrau), com a diferença,
 * a causa e a saída. Cita as arestas sem inclinação que chegam ali, quando o motor as identifica. Recusa a criação ou a
 * alteração em vez de deixar um aviso: o usuário vê onde corrigir e o que fazer.
 */
function stepsReason(steps: SkeletonStep[], roof: Roof, u: ResolvedUnits): string {
  const points = pointsText(steps);
  const corners = steps.every((s) => cornerAt(s, roof) !== null);
  const where =
    corners && steps.length === 1
      ? `no canto reentrante em ${points} m`
      : corners
        ? `nos cantos reentrantes em ${points} m`
        : `em ${points} m`;
  const degraus = steps.map((s) => formatQuantity(u, 'length', s.dz, { withUnit: false }));
  const cause =
    steps.length === 1
      ? `as águas que chegam ali ficam com um degrau de ${degraus[0]} m`
      : `as águas que chegam ali ficam com degraus de ${joinAnd(degraus)} m`;
  const edges = [...new Set(steps.flatMap((s) => gableEdgesAt(s, roof)))].sort((a, b) => a - b);
  const alvo = edges.length === 1 ? `a aresta ${edges[0]}` : `as arestas ${joinAnd(edges.map(String))}`;
  const fix =
    edges.length > 0
      ? `Marque também ${alvo} como "define inclinação" (triângulo) ou ajuste o contorno.`
      : 'Marque as arestas que chegam ali como "define inclinação" (triângulo) ou ajuste o contorno.';
  return `não fecha ${where}: ${cause}. ${fix}`;
}

/**
 * Motivo pelo qual o motor não gera águas para `roofs` no estado dado, ou null quando todos têm águas. Usa o projeto com
 * estes telhados no lugar dos guardados; os demais telhados do nível não são conferidos. A ferramenta usa antes de criar
 * ou alterar, para que o telhado nunca desapareça em silêncio. Também recusa o esqueleto que não fecha (degrau entre
 * águas, com os pontos) e o beiral que se corta ou não cabe na pegada.
 */
export function roofProblem(p: Project, roofs: Roof[]): string | null {
  if (roofs.length === 0) return null;
  const elements = { ...p.elements };
  for (const r of roofs) elements[r.id] = r;
  const q: Project = { ...p, elements };
  for (const r of roofs) {
    if (!p.levels.some((l) => l.id === r.levelId)) return 'o nível do telhado não existe';
    if (!p.roofTypes[r.typeId]) return 'o tipo de telhado não existe no projeto';
    if (r.boundary.length < 3) return 'o contorno tem menos de 3 pontos';
    // Antes do motor: um beiral que se corta faz o esqueleto falhar com uma mensagem genérica.
    if (r.footprint && r.shape !== 'free' && r.shape !== 'extrusion') {
      const eave = hasRoofArcs(r) ? roofEaveArcsProblem(r) : eaveProblem(r.footprint, r.boundary, r.edgeOverhangs);
      if (eave) return eave;
    }
    const res = resolveRoofs(q, r.levelId).find((x) => x.roofId === r.id);
    if (!res) return 'o telhado não pôde ser resolvido';
    if (res.problem) return res.problem;
    if (res.planes.length === 0) return noWaterReason(r);
    if (res.steps?.length) return stepsReason(res.steps, r, unitsOf(p));
  }
  return null;
}

/**
 * Motivo para aplicar `patch` aos telhados `ids`, ou null. Alterações que não mexem na geometria (marca, comentários,
 * tipo, beiral) não são conferidas: um telhado já sem águas continua editável nelas.
 */
export function roofPatchProblem(p: Project, ids: Id[], patch: Partial<Roof>): string | null {
  if (!Object.keys(patch).some((k) => GEOMETRY_KEYS.includes(k as keyof Roof))) return null;
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
