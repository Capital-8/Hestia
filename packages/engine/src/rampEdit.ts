import { add, dist, mid, mul, norm, sub, type Vec2 } from '@hestia/geom';
import {
  newId,
  rampBaseZ,
  rampTopZ,
  type Project,
  type Ramp,
  type RampInputMode,
  type StairLanding,
  type StairRun,
} from '@hestia/model';
import { t, type Lang } from './i18nMessages.ts';
import { planRamp, rampBasis, type RampPlan } from './rampPlan.ts';
import { planRampFree } from './rampFree.ts';
import { resolveRamps } from './ramps.ts';

export interface RampRegenPatch {
  width?: number;
  mode?: RampInputMode;
  slope?: number;
  length?: number;
  landingDepth?: number;
  /** Forma livre: novos vértices do trajeto (mover um vértice). */
  freePath?: Vec2[];
}

export interface RampRegenResult {
  components: Array<StairRun | StairLanding>;
  inputMode: RampInputMode;
  slopeTarget: number | null;
  landingDepth: number;
  /** Forma livre: trajeto resultante (o último vértice acompanha o encurtamento/extensão do plano). */
  freePath?: Vec2[];
}

/** Componente de rascunho → componente persistido, reaproveitando o id antigo da mesma posição. */
function toComponent(sketch: RampPlan['parts'][number], id: string): StairRun | StairLanding {
  return sketch.kind === 'run' ? { id, kind: 'run', ...sketch.run } : { id, kind: 'landing', ...sketch.landing };
}

/**
 * Regenera os componentes de uma rampa a partir da base do 1º lance, do tipo e do desnível do projeto. Mantém forma e
 * giro. Quem grava faz `updateElements` em uma transação só.
 */
export function regenRamp(ramp: Ramp, p: Project, patch: RampRegenPatch, lang: Lang = 'pt'): RampRegenResult | { error: string } {
  if (ramp.shape === 'free' && ramp.freePath) return regenFree(ramp, p, patch, lang);
  const basis = rampBasis(ramp);
  if (!basis) return { error: t(lang, 'egb_err_ramp_no_flight') };
  const type = p.rampTypes[ramp.typeId];
  if (!type) return { error: t(lang, 'egb_err_ramp_type') };

  const mode = patch.mode ?? ramp.inputMode;
  const width = patch.width ?? basis.width;
  const landingDepth = patch.landingDepth ?? ramp.landingDepth;
  const H = rampTopZ(p, ramp) - rampBaseZ(p, ramp);
  const currentLength = resolveRamps(p, lang).find((r) => r.id === ramp.id)?.pathLength;

  const common = {
    start: basis.start,
    dir: basis.dir,
    H,
    type,
    shape: ramp.shape,
    turn: ramp.turn,
    width,
    landingDepth,
    mode,
  } as const;

  const plan =
    mode === 'slope'
      ? planRamp({ ...common, slope: patch.slope ?? ramp.slopeTarget ?? type.defaultSlope, lang })
      : planRamp({ ...common, length: patch.length ?? currentLength, lang });
  if ('error' in plan) return { error: plan.error };

  const components = plan.parts.map((part, i) => toComponent(part, ramp.components[i]?.id ?? newId('rc')));
  return {
    components,
    inputMode: mode,
    slopeTarget: mode === 'slope' ? (patch.slope ?? ramp.slopeTarget ?? type.defaultSlope) : null,
    landingDepth: plan.landingDepth,
  };
}

/** Comprimento do trajeto (soma dos trechos entre vértices). */
function pathTotal(path: Vec2[]): number {
  let t = 0;
  for (let i = 0; i + 1 < path.length; i++) t += dist(path[i]!, path[i + 1]!);
  return t;
}

/**
 * Ramo da rampa livre: refaz os componentes com `planRampFree` a partir do `freePath` (novo em `patch.freePath`, senão o
 * da rampa). Largura mantém os vértices; no modo 'slope' o plano trunca/estende o último trecho (o último vértice
 * acompanha); no modo 'length', `patch.length` ajusta o último trecho para o trajeto ter esse comprimento e a
 * inclinação sai do resultado.
 */
function regenFree(ramp: Ramp, p: Project, patch: RampRegenPatch, lang: Lang): RampRegenResult | { error: string } {
  const type = p.rampTypes[ramp.typeId];
  if (!type) return { error: t(lang, 'egb_err_ramp_type') };
  let path = (patch.freePath ?? ramp.freePath ?? []).map((v) => ({ ...v }));
  if (path.length < 2) return { error: t(lang, 'egb_err_ramp_no_path') };
  const width = patch.width ?? rampBasis(ramp)?.width;
  if (!width) return { error: t(lang, 'egb_err_ramp_no_flight') };
  const mode = patch.mode ?? ramp.inputMode;
  const landingDepth = patch.landingDepth ?? ramp.landingDepth;
  const H = rampTopZ(p, ramp) - rampBaseZ(p, ramp);
  const slope = patch.slope ?? ramp.slopeTarget ?? type.defaultSlope;

  if (mode === 'length' && patch.length !== undefined) {
    const n = path.length;
    const a = path[n - 2]!;
    const b = path[n - 1]!;
    const newLast = dist(a, b) + (patch.length - pathTotal(path));
    if (!(newLast > 0.01)) return { error: t(lang, 'egb_err_ramp_length_low') };
    path = [...path.slice(0, n - 1), add(a, mul(norm(sub(b, a)), newLast))];
  }

  const plan = planRampFree(path, H, type, { width, mode, slope: mode === 'slope' ? slope : undefined, landingDepth, manualLandings: ramp.manualLandings, lang });
  if ('error' in plan) return { error: plan.error };

  // No modo 'slope' o plano pode encurtar/estender o último trecho: o último vértice vai para o fim do último lance.
  const lastPart = plan.parts[plan.parts.length - 1];
  if (mode === 'slope' && lastPart?.kind === 'run' && lastPart.run.risers.length === 2) {
    const r = lastPart.run.risers[1]!;
    path[path.length - 1] = mid(r.a, r.b);
  }

  const components = plan.parts.map((part, i) => toComponent(part, ramp.components[i]?.id ?? newId('rc')));
  return { components, inputMode: mode, slopeTarget: mode === 'slope' ? slope : null, landingDepth: plan.landingDepth, freePath: path };
}
