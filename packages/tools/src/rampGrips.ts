import { dist, type Vec2 } from '@hestia/geom';
import { regenRamp } from '@hestia/engine';
import { isRamp, type Id, type Project } from '@hestia/model';
import type { GripHold } from './selectGrips.ts';
import { componentsPreview } from './stairPreview.ts';
import type { PreviewItem, ToolEnv } from './types.ts';
import { langOf, t as translate } from './i18n.ts';

/** Alça de uma rampa livre selecionada: um vértice do `freePath`. */
export interface RampGrip {
  rampId: Id;
  /** Índice do vértice em `Ramp.freePath`. */
  index: number;
  at: Vec2;
}

/** Alça de vértice sob o cursor entre as rampas livres selecionadas (só a forma 'free' tem `freePath`). */
export function rampGripAt(p: Project, ids: Id[], at: Vec2, mpp: number): RampGrip | null {
  const tol = 9 * mpp;
  for (const id of ids) {
    const r = p.elements[id];
    if (!isRamp(r) || r.shape !== 'free' || !r.freePath) continue;
    for (let index = 0; index < r.freePath.length; index++) {
      const q = r.freePath[index]!;
      if (dist(q, at) <= tol) return { rampId: r.id, index, at: q };
    }
  }
  return null;
}

/**
 * Alça de vértice como `GripHold`: arrastar mostra a rampa regenerada (e a antiga tracejada); soltar grava os componentes
 * e o `freePath` novos em UMA transação ("Mover vértice da rampa"). Trajeto que o motor recusa (trecho curto demais,
 * retorno agudo) não grava e mostra o motivo na barra de status.
 */
export function rampHold(env: ToolEnv, g: RampGrip): GripHold {
  let point: Vec2 = g.at;
  return {
    at: g.at,
    keepsFocus: false,
    drag(_p, snap): PreviewItem[] {
      const r = env.project().elements[g.rampId];
      if (!isRamp(r) || !r.freePath) return [];
      point = snap({ extraPoints: r.freePath.filter((_, i) => i !== g.index) });
      const res = regenRamp(r, env.project(), { freePath: r.freePath.map((v, i) => (i === g.index ? point : v)) });
      return [...componentsPreview(r.components, true), ...('error' in res ? [] : componentsPreview(res.components))];
    },
    release(): void {
      const p = env.project();
      const r = p.elements[g.rampId];
      if (!isRamp(r) || !r.freePath || dist(point, g.at) < 1e-9) return;
      const res = regenRamp(r, p, { freePath: r.freePath.map((v, i) => (i === g.index ? point : v)) });
      if ('error' in res) {
        env.say(translate(langOf(env), 'tl_msg_move_vertex_fail', { error: res.error }));
        return;
      }
      env.transaction(translate(langOf(env), 'tl_undo_move_ramp_vertex'), () =>
        env.exec({
          type: 'updateElements',
          ids: [g.rampId],
          patch: { components: res.components, freePath: res.freePath, inputMode: res.inputMode, slopeTarget: res.slopeTarget, landingDepth: res.landingDepth },
        }),
      );
      env.say(translate(langOf(env), 'tl_msg_vertex_moved'));
    },
  };
}

/** Pontos de alça (vértices do trajeto) das rampas livres selecionadas, para o indicador no hover. */
export function rampHandlePreview(p: Project, ids: Id[]): PreviewItem[] {
  const out: PreviewItem[] = [];
  for (const id of ids) {
    const r = p.elements[id];
    if (isRamp(r) && r.shape === 'free' && r.freePath) for (const q of r.freePath) out.push({ kind: 'point', at: q });
  }
  return out;
}
