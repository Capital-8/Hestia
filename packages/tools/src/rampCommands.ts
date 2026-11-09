import { dist, type Vec2 } from '@hestia/geom';
import {
  defaultRampTypeId,
  isRamp,
  levelAbove,
  makeRamp,
  newId,
  rampBaseZ,
  rampTopZ,
  type Id,
  type Project,
  type Ramp,
  type RampInputMode,
  type RampShape,
  type StairLanding,
  type StairRun,
} from '@hestia/model';
import type { RampPlan } from '@hestia/engine';
import type { ToolEnv } from './types.ts';
import { componentsFromParts } from './stairSketchState.ts';
import type { RampToolOptions } from './rampOptions.ts';
import { langOf, t as translate } from './i18n.ts';
import { criarGuardaCorpo, ladosAmbosGC, temGuardaCorpoDeHospedeiro, type RailingCreateResult, type RailingEnv } from './guardaCorpoTool.ts';

/** Tipo de rampa válido: o pedido se existir no projeto, senão o padrão, senão o primeiro. */
export function rampTypeId(p: Project, want?: Id): Id | null {
  if (want && p.rampTypes[want]) return want;
  if (p.rampTypes[defaultRampTypeId]) return defaultRampTypeId;
  return Object.keys(p.rampTypes)[0] ?? null;
}

/** Rampa de referência para a criação: a mesma regra de cota que o modelo usa depois. Null sem tipo. */
export function draftRamp(p: Project, opts: RampToolOptions, levelId: Id): Ramp | null {
  const typeId = rampTypeId(p, opts.typeId);
  if (!typeId) return null;
  return {
    ...makeRamp({
      id: 'draft',
      typeId,
      levelId,
      topLevelId: opts.topLevelId ?? levelAbove(p, levelId)?.id ?? null,
      baseOffset: opts.baseOffset ?? 0,
      topOffset: opts.topOffset ?? 0,
      height: opts.height ?? 0.8,
      shape: opts.shape,
      turn: opts.turn,
      inputMode: opts.mode,
    }),
    order: 0,
  };
}

/** Desnível total da rampa (topo − base), em m. */
export function rampRise(p: Project, ramp: Ramp): number {
  return rampTopZ(p, ramp) - rampBaseZ(p, ramp);
}

/** Opções da criação de uma rampa a partir de um plano. */
export interface RampCreateInput {
  typeId: Id;
  levelId: Id;
  shape: RampShape;
  turn: 'left' | 'right';
  inputMode: RampInputMode;
  /** Inclinação alvo (fração) no modo 'slope'; null no modo 'length'. */
  slopeTarget: number | null;
  topLevelId?: Id | null;
  baseOffset?: number;
  topOffset?: number;
  height?: number;
  mark?: string;
  comments?: string;
  /** Forma 'free': vértices do trajeto clicado (a regeneração e os grips partem dele). */
  freePath?: Vec2[];
  /** Forma 'free': índices dos vértices marcados como patamar manual. */
  manualLandings?: number[];
}

export type RampCommandResult = { id: Id } | { error: string };

/**
 * Cria uma rampa com os componentes do plano em UM comando `addRamp` e a seleciona. A transação fica por conta de quem
 * chama (a ferramenta usa uma só, "Criar rampa").
 */
export function createRampFromPlan(env: ToolEnv, plan: RampPlan, input: RampCreateInput): RampCommandResult {
  const p = env.project();
  if (!p.rampTypes[input.typeId]) return { error: 'Tipo de rampa inexistente' };
  const id = newId('rp');
  const ramp = makeRamp({
    id,
    typeId: input.typeId,
    levelId: input.levelId,
    topLevelId: input.topLevelId ?? levelAbove(p, input.levelId)?.id ?? null,
    baseOffset: input.baseOffset ?? 0,
    topOffset: input.topOffset ?? 0,
    height: input.height ?? 0.8,
    components: componentsFromParts(plan.parts),
    shape: input.shape,
    turn: input.turn,
    landingDepth: plan.landingDepth,
    inputMode: input.inputMode,
    slopeTarget: input.slopeTarget,
    mark: input.mark ?? '',
    comments: input.comments ?? '',
    ...(input.freePath ? { freePath: input.freePath.map((v) => ({ x: v.x, y: v.y })) } : {}),
    ...(input.manualLandings && input.manualLandings.length > 0 ? { manualLandings: input.manualLandings.slice() } : {}),
  });
  env.exec({ type: 'addRamp', ramp });
  env.setSelection([id]);
  return { id };
}

/**
 * Grava o croqui novo de uma rampa existente em UM comando `updateElements` (um passo de desfazer). Validação mínima:
 * pelo menos um componente e todas as curvas com comprimento. A rampa livre (forma 'free' ou com `freePath`) é
 * recusada: editar o croqui à mão descartaria o trajeto.
 */
export function updateRampComponents(
  env: ToolEnv,
  rampId: Id,
  components: Array<StairRun | StairLanding>,
  label = 'Editar croqui da rampa',
): { ok: true } | { error: string } {
  const ramp = env.project().elements[rampId];
  if (!isRamp(ramp)) return { error: 'Rampa não encontrada.' };
  if (ramp.shape === 'free' || ramp.freePath) return { error: translate(langOf(env), 'tl_msg_ramp_free_no_edit') };
  if (components.length === 0) return { error: 'O croqui da rampa precisa de pelo menos um componente.' };
  for (const c of components) {
    const curves = c.kind === 'landing' ? c.boundary : [...c.boundaryLeft, ...c.boundaryRight, ...c.risers, ...c.path];
    for (const x of curves) {
      if (dist(x.a, x.b) <= 1e-9) return { error: 'O croqui da rampa tem uma curva sem comprimento.' };
    }
  }
  env.transaction(label, () => env.exec({ type: 'updateElements', ids: [rampId], patch: { components } }));
  return { ok: true };
}

/** Guarda-corpo ligado em uma rampa, nos dois lados, com a base no degrau. Recusa a segunda na mesma rampa. */
export function criarGuardaCorpoDeRampa(env: RailingEnv, rampId: Id, msgs: { noHost: string; exists: string; noType: string }): RailingCreateResult {
  const r = env.project().elements[rampId];
  if (!isRamp(r)) return { error: msgs.noHost };
  if (temGuardaCorpoDeHospedeiro(env.project(), rampId)) return { error: msgs.exists };
  return criarGuardaCorpo(env, r.levelId, { tipo: 'rampa', rampaId: rampId, lados: ladosAmbosGC(), posicaoBase: 'degrau' }, { noMessage: msgs.noType });
}
