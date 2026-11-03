import { dist } from '@hestia/geom';
import { optimizeRamp, rebuildPathFromSegments, regenRamp, resolveRamps, type RampRegenPatch, type RampRegenResult } from '@hestia/engine';
import { rampBaseZ, rampTopZ, type Id, type ProjectStore, type Ramp, type StairRun } from '@hestia/model';
import { t, useI18n } from './i18n.ts';

interface Pt {
  x: number;
  y: number;
}

export interface RampBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Pontos de referência da rampa: extremos de todas as curvas (limites, espelhos, caminhada e contorno dos patamares). */
export function rampPoints(r: Ramp): Pt[] {
  return r.components.flatMap((c) => {
    if (c.kind === 'landing') return c.boundary.flatMap((k) => [k.a, k.b]);
    const run: StairRun = c;
    return [...run.boundaryLeft, ...run.boundaryRight, ...run.risers, ...run.path].flatMap((k) => [k.a, k.b]);
  });
}

/** Caixa que envolve a rampa em planta (para enquadrar em "Ir para"); null sem geometria. */
export function rampBox(r: Ramp): RampBox | null {
  const pts = rampPoints(r);
  if (pts.length === 0) return null;
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Campos que mudam o desnível/inclinação e, no modo 'slope', pedem o comprimento recalculado. */
const RAMP_FIT_KEYS: ReadonlySet<keyof Ramp> = new Set(['topLevelId', 'topOffset', 'baseOffset', 'height', 'levelId', 'typeId', 'inputMode', 'slopeTarget']);

/**
 * Altera campos de uma ou mais rampas num único passo de desfazer (um `updateElements` dentro de uma transação).
 * No modo 'slope', a mudança de altura regenera o comprimento na mesma transação (decisão 0041); no modo 'length',
 * o comprimento desenhado manda e o aviso `ramp-slope-differs` aponta a inclinação resultante.
 */
export function patchRamps(store: ProjectStore, ids: Id[], patch: Partial<Ramp>, label = 'edc_undo_edit_ramp'): void {
  if (ids.length === 0) return;
  const lang = useI18n.getState().lang;
  const refit = Object.keys(patch).some((k) => RAMP_FIT_KEYS.has(k as keyof Ramp));
  store.transaction(label, () => {
    store.exec({ type: 'updateElements', ids, patch });
    if (!refit) return;
    for (const id of ids) {
      const r = store.project.elements[id];
      if (!r || r.kind !== 'ramp' || r.inputMode !== 'slope' || r.slopeTarget === null) continue;
      const regen = regenRamp(r, store.project, {}, lang);
      if ('error' in regen) continue;
      store.exec({
        type: 'updateElements',
        ids: [id],
        patch: {
          components: regen.components,
          inputMode: regen.inputMode,
          slopeTarget: regen.slopeTarget,
          landingDepth: regen.landingDepth,
          ...(regen.freePath ? { freePath: regen.freePath } : {}),
        },
      });
    }
  });
}

/** Grava o resultado de `regenRamp` na rampa: componentes, modo, alvo, patamar e (rampa livre) o trajeto, em UMA transação. */
export function applyRegen(store: ProjectStore, id: Id, r: RampRegenResult, label = 'edc_undo_edit_ramp'): void {
  store.transaction(label, () => {
    store.exec({
      type: 'updateElements',
      ids: [id],
      patch: {
        components: r.components,
        inputMode: r.inputMode,
        slopeTarget: r.slopeTarget,
        landingDepth: r.landingDepth,
        ...(r.freePath ? { freePath: r.freePath } : {}),
      },
    });
  });
}

/**
 * "Ajustar" da rampa selecionada (livre, reta, L ou U): `optimizeRamp` escolhe a inclinação e o comprimento dentro da
 * norma do tipo (ou a menor violação) e a rampa é regenerada em UMA transação "Ajustar rampa". Devolve a mensagem
 * "Ajustado: ..." ou o erro.
 */
export function adjustRamp(store: ProjectStore, id: Id): { message: string } | { error: string } {
  const lang = useI18n.getState().lang;
  const p = store.project;
  const ramp = p.elements[id] as Ramp | undefined;
  if (!ramp || ramp.kind !== 'ramp') return { error: t(lang, 'edc_ramp_missing') };
  const type = p.rampTypes[ramp.typeId];
  if (!type) return { error: t(lang, 'edc_ramp_type_missing') };
  const H = rampTopZ(p, ramp) - rampBaseZ(p, ramp);
  if (!(H > 0)) return { error: t(lang, 'edc_ramp_top_not_above') };
  const free = ramp.shape === 'free' && ramp.freePath && ramp.freePath.length >= 2 ? ramp.freePath : null;
  const resolved = resolveRamps(p, lang).find((r) => r.id === id);
  const segments = free ? free.slice(1).map((v, i) => dist(free[i]!, v)) : resolved ? [resolved.pathLength] : [];
  if (segments.length === 0) return { error: t(lang, 'edc_ramp_no_geometry') };
  const res = optimizeRamp({
    H,
    type,
    segments,
    mode: 'auto',
    ...(ramp.slopeTarget !== null ? { slope: ramp.slopeTarget } : {}),
    turnLanding: ramp.landingDepth,
  });
  const patch: RampRegenPatch = { mode: 'slope', slope: res.slope, ...(free ? { freePath: rebuildPathFromSegments(free, res.segments) } : {}) };
  const r = regenRamp(ramp, p, patch, lang);
  if ('error' in r) return { error: r.error };
  applyRegen(store, id, r, 'edc_undo_adjust_ramp');
  return { message: res.note };
}
