import { dist } from '@hestia/geom';
import type { Vec2 } from '@hestia/geom';
import { newId, stairBaseZ, stairTopZ, type Project, type Stair, type StairLanding, type StairRun } from '@hestia/model';
import { t, type Lang } from './i18nMessages.ts';
import { planStairFree, type StairFreePlan } from './stairFree.ts';
import type { StairFixed } from './stairLive.ts';
import type { StairComponentSketch } from './stairGenerators.ts';

export interface StairFreePatch {
  /** Novo trajeto (mover vértice). */
  freePath?: Vec2[];
  /** Nova largura do lance. */
  width?: number;
  /** Profundidade do patamar de giro; padrão = largura. */
  landingDepth?: number;
  manualLandings?: number[];
  /** 'auto' = ignora o par medido e usa os padrões do tipo. */
  fixed?: StairFixed | 'auto';
}

export interface StairFreeResult {
  components: Array<StairRun | StairLanding>;
  /** Trajeto normalizado pelo plano. */
  freePath: Vec2[];
  manualLandings?: number[];
  plan: StairFreePlan;
}

const center = (c: { a: Vec2; b: Vec2 }): Vec2 => ({ x: (c.a.x + c.b.x) / 2, y: (c.a.y + c.b.y) / 2 });

/**
 * Par (largura, N, T) medido da escada livre: largura e piso do 1º lance, N = soma dos espelhos de todos os lances
 * (lances separados por patamar não compartilham espelho). Sem lance ou sem espelhos suficientes devolve null.
 */
export function measureFreeStair(stair: Stair): { width: number; fixed: StairFixed } | null {
  const first = stair.components.find((c): c is StairRun => c.kind === 'run');
  if (!first || first.risers.length < 2) return null;
  const r0 = first.risers[0]!;
  const r1 = first.risers[1]!;
  const width = dist(r0.a, r0.b);
  const tread = dist(center(r0), center(r1));
  if (!(width > 0) || !(tread > 0)) return null;
  let risers = 0;
  for (const c of stair.components) if (c.kind === 'run') risers += c.risers.length;
  if (risers < 2) return null;
  return { width, fixed: { risers, tread } };
}

/** Componente do plano → componente persistido, com o id antigo quando o tipo coincide na mesma posição. */
function toComponent(sketch: StairComponentSketch, prev: StairRun | StairLanding | undefined): StairRun | StairLanding {
  if (sketch.kind === 'run') {
    const id = prev?.kind === 'run' ? prev.id : newId('r');
    return { id, kind: 'run', ...sketch.run, generatedBy: 'free' };
  }
  const id = prev?.kind === 'landing' ? prev.id : newId('p');
  return { id, kind: 'landing', ...sketch.landing };
}

/**
 * Regenera uma escada livre a partir do `freePath` (novo em `patch.freePath`, senão o da escada). A edição preserva o
 * par (N, T) medido enquanto a altura do espelho couber no máximo do tipo (D6); `fixed: 'auto'` volta aos padrões.
 * Quem grava faz `updateElements` com componentes, trajeto e patamares manuais em UMA transação.
 */
export function regenStairFree(stair: Stair, p: Project, patch: StairFreePatch, lang: Lang = 'pt'): StairFreeResult | { error: string } {
  const path = patch.freePath ?? stair.freePath;
  if (!path || path.length < 2) return { error: t(lang, 'egb_err_stair_no_path') };
  const type = p.stairTypes[stair.typeId];
  if (!type) return { error: t(lang, 'egb_err_stair_type') };
  const H = stairTopZ(p, stair) - stairBaseZ(p, stair);
  if (!(H > 0)) return { error: t(lang, 'egb_err_stair_top_level') };

  const measured = measureFreeStair(stair);
  const width = patch.width ?? measured?.width;
  if (!width) return { error: t(lang, 'egb_err_stair_no_flight') };

  let fixed: StairFixed | undefined;
  if (patch.fixed === 'auto') fixed = undefined;
  else if (patch.fixed) fixed = patch.fixed;
  else if (measured && measured.fixed.risers >= 2 && H / measured.fixed.risers <= type.maxRiser + 1e-9) fixed = measured.fixed;

  const plan = planStairFree(path, H, type, {
    width,
    landingDepth: patch.landingDepth ?? width,
    manualLandings: patch.manualLandings ?? stair.manualLandings,
    fixed,
    lang,
  });
  if ('error' in plan) return { error: plan.error };

  const components = plan.parts.map((part, i) => toComponent(part, stair.components[i]));
  return { components, freePath: plan.path, manualLandings: patch.manualLandings ?? stair.manualLandings, plan };
}
