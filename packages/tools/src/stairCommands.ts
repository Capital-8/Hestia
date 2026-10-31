import type { Vec2 } from '@hestia/geom';
import { isStair, defaultStairTypeId, levelAbove, makeStair, newId, stairBaseZ, stairTopZ, unitsOf, type Id, type Project, type Stair, type StairGenerator, type StairLanding, type StairRun } from '@hestia/model';
import type { ToolEnv } from './types.ts';
import { analyzeDraft, partsFromComponents, type DraftReport, type StairLimits } from './stairSketchState.ts';

/** Opções da criação (vêm da barra de opções da ferramenta ou de um gerador). */
export interface StairCreateOptions {
  typeId?: Id;
  levelId?: Id;
  topLevelId?: Id | null;
  baseOffset?: number;
  topOffset?: number;
  height?: number;
  mark?: string;
  comments?: string;
  /** Escada livre: trajeto de cliques gravado no modelo. */
  freePath?: Vec2[];
  /** Escada livre: índices do trajeto com patamar forçado. */
  manualLandings?: number[];
}

export type StairCommandResult = { id: Id; report: DraftReport } | { error: string };

/** Tipo válido: o pedido se existir no projeto, senão o padrão, senão o primeiro. */
export function stairTypeId(p: Project, want?: Id): Id | null {
  if (want && p.stairTypes[want]) return want;
  if (p.stairTypes[defaultStairTypeId]) return defaultStairTypeId;
  return Object.keys(p.stairTypes)[0] ?? null;
}

/** Limites de cálculo de uma escada (ou de uma escada em criação): H = topo − base, espelho máximo e largura mínima. */
export function stairLimits(p: Project, s: Stair): StairLimits | null {
  const t = p.stairTypes[s.typeId];
  if (!t) return null;
  return { H: stairTopZ(p, s) - stairBaseZ(p, s), maxRiser: t.maxRiser, minRunWidth: t.minRunWidth };
}

/** Escada de referência para a criação: a mesma regra de cota que o modelo usa depois. */
export function draftStair(p: Project, opts: StairCreateOptions, levelId: Id): Stair | null {
  const typeId = stairTypeId(p, opts.typeId);
  if (!typeId) return null;
  return {
    ...makeStair({
      id: 'draft',
      typeId,
      levelId,
      topLevelId: opts.topLevelId ?? levelAbove(p, levelId)?.id ?? null,
      baseOffset: opts.baseOffset ?? 0,
      topOffset: opts.topOffset ?? 0,
      height: opts.height ?? 2.8,
    }),
    order: 0,
  } as Stair;
}

/**
 * Cria uma escada com os componentes dados (lances e patamares, em ordem) em UM comando `addStair` (um passo de
 * desfazer). Recusa o croqui com erro de geometria ou de completude; avisos de norma e tipo passam, e voltam no relatório.
 */
export function createStairFromComponents(env: ToolEnv, components: Array<StairRun | StairLanding>, opts: StairCreateOptions = {}): StairCommandResult {
  const p = env.project();
  const levelId = opts.levelId ?? env.levelId();
  const ref = draftStair(p, opts, levelId);
  if (!ref) return { error: 'O projeto não tem tipo de escada.' };
  const report = analyzeDraft(partsFromComponents(components), stairLimits(p, ref), unitsOf(p));
  if (report.errors > 0) return { error: report.firstError ?? 'Croqui inválido.' };
  const id = newId('st');
  const stair = makeStair({
    id,
    typeId: ref.typeId,
    levelId,
    topLevelId: ref.topLevelId,
    baseOffset: ref.baseOffset,
    topOffset: ref.topOffset,
    height: ref.height,
    components,
      mark: opts.mark ?? '',
      comments: opts.comments ?? '',
    ...(opts.freePath ? { freePath: opts.freePath } : {}),
    ...(opts.manualLandings?.length ? { manualLandings: opts.manualLandings } : {}),
  });
  env.exec({ type: 'addStair', stair });
  env.setSelection([id]);
  return { id, report };
}

/**
 * Cria a escada a partir do resultado de um gerador (reto, L, U, leque): os componentes saem prontos, com a origem
 * (`generatedBy`) gravada nos lances que não a trazem. Mesmo gate do croqui.
 */
export function stairFromGenerator(env: ToolEnv, generated: Array<StairRun | StairLanding>, opts: StairCreateOptions & { generatedBy?: StairGenerator } = {}): StairCommandResult {
  const { generatedBy, ...rest } = opts;
  const components = generated.map((c): StairRun | StairLanding => (c.kind === 'run' && generatedBy && !c.generatedBy ? { ...c, generatedBy } : c));
  return createStairFromComponents(env, components, rest);
}

/**
 * Grava o croqui novo de uma escada existente em UM comando `updateElements` (um passo de desfazer). Mesmo gate da
 * criação: erro de geometria ou de completude impede a gravação.
 */
export function updateStairComponents(env: ToolEnv, stairId: Id, components: Array<StairRun | StairLanding>): { report: DraftReport } | { error: string } {
  const p = env.project();
  const s = p.elements[stairId];
  if (!isStair(s)) return { error: 'Escada não encontrada.' };
  const report = analyzeDraft(partsFromComponents(components), stairLimits(p, s), unitsOf(p));
  if (report.errors > 0) return { error: report.firstError ?? 'Croqui inválido.' };
  // Editar o croqui à mão descarta o trajeto livre (como o caracol descarta `spiral`).
  env.transaction('Editar croqui da escada', () => env.exec({ type: 'updateElements', ids: [stairId], patch: { components, freePath: undefined, manualLandings: undefined } }));
  return { report };
}
