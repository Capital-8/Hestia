import { refitStairToHeight } from '@hestia/engine';
import { ProjectStore, elementLevelId, hasLevel, isRamp, isStair, type Id, type LevelKeep, type Project } from '@hestia/model';
import {
  affectedByLevel,
  invalidRamp,
  invalidStair,
  planLevelMove,
  pinAutoTops,
  type LevelMoveDecision,
  type LevelMovePlan,
} from './levelMovePlan.ts';
import { t, useI18n } from './i18n.ts';

// Tipos e funções do plano/resumo movidos para levelMovePlan.ts; reexportados aqui para os chamadores atuais.
export {
  effectiveMinRiser,
  pinAutoTops,
  planLevelMove,
  riserBandNote,
  type LevelMoveDecision,
  type LevelMovePlan,
  type LevelMoveRampPlan,
  type LevelMoveStairPlan,
} from './levelMovePlan.ts';

/** Preferência da tela (não do projeto): como manter a cota ao trocar de nível. Padrão: manter a cota. */
export const LEVEL_KEEP_KEY = 'hestia.levelKeep';

export const LEVEL_KEEP_LABEL: Record<LevelKeep, string> = {
  get elevation() { return t(useI18n.getState().lang, 'eds_level_keep_elevation'); },
  get offset() { return t(useI18n.getState().lang, 'eds_level_keep_offset'); },
};

export function readLevelKeep(): LevelKeep {
  try {
    const v = localStorage.getItem(LEVEL_KEEP_KEY);
    if (v === 'elevation' || v === 'offset') return v;
  } catch {
    /* armazenamento indisponível: vale o padrão */
  }
  return 'elevation';
}

export function writeLevelKeep(keep: LevelKeep): void {
  try {
    localStorage.setItem(LEVEL_KEEP_KEY, keep);
  } catch {
    /* sem armazenamento: a escolha vale só nesta sessão */
  }
}

export interface LevelMove {
  ok: boolean;
  /** Elementos que mudaram de nível. */
  moved: number;
  /** Mensagem para a barra de status. */
  message: string;
}

/** Ids que têm nível próprio. Aberturas ficam de fora: acompanham a parede anfitriã. */
export function levelBearingIds(p: Project, ids: Id[]): Id[] {
  return ids.filter((id) => hasLevel(p.elements[id]));
}

/**
 * Move os elementos para o nível dado, em um único passo de desfazer ("Mudar de nível").
 * A seleção e a vista não mudam; se o nível novo não for o da vista, a mensagem avisa.
 */
export function moveToLevel(store: ProjectStore, ids: Id[], levelId: Id, keep: LevelKeep, activeLevelId: Id): LevelMove {
  const p = store.project;
  const lang = useI18n.getState().lang;
  const target = p.levels.find((l) => l.id === levelId);
  if (!target) return { ok: false, moved: 0, message: t(lang, 'eds_msg_level_missing') };
  const unique = [...new Set(ids)];
  const targets = levelBearingIds(p, unique);
  const skippedOpenings = unique.length > targets.length;
  if (targets.length === 0) return { ok: false, moved: 0, message: t(lang, 'eds_msg_nothing_to_move') };
  const moved = targets.filter((id) => elementLevelId(p.elements[id]) !== levelId).length;
  if (moved === 0) {
    return {
      ok: true,
      moved: 0,
      message: t(lang, targets.length === 1 ? 'eds_msg_already_on_level_one' : 'eds_msg_already_on_level_many', { level: target.name }),
    };
  }
  try {
    store.transaction('eds_undo_change_level', () => {
      store.exec({ type: 'setElementLevel', ids: targets, levelId, keep });
      // A troca de nível muda a altura entre níveis: recalcula os degraus das escadas afetadas (decisão 0041).
      for (const id of targets) {
        const e = store.project.elements[id];
        if (!isStair(e)) continue;
        const fit = refitStairToHeight(store.project, e, lang);
        if (fit.components) {
          store.exec({
            type: 'updateElements',
            ids: [e.id],
            patch: {
              components: fit.components,
              ...(fit.freePath ? { freePath: fit.freePath } : {}),
              ...(fit.manualLandings ? { manualLandings: fit.manualLandings } : {}),
            },
          });
        }
      }
    });
  } catch (e) {
    return { ok: false, moved: 0, message: e instanceof Error ? e.message : t(lang, 'eds_msg_move_failed') };
  }
  const key = moved === 1
    ? (skippedOpenings ? (levelId !== activeLevelId ? 'eds_msg_moved_out_open_one' : 'eds_msg_moved_open_one') : (levelId !== activeLevelId ? 'eds_msg_moved_out_one' : 'eds_msg_moved_one'))
    : (skippedOpenings ? (levelId !== activeLevelId ? 'eds_msg_moved_out_open_many' : 'eds_msg_moved_open_many') : (levelId !== activeLevelId ? 'eds_msg_moved_out_many' : 'eds_msg_moved_many'));
  return { ok: true, moved, message: t(lang, key, { n: moved, level: target.name }) };
}

export interface MoveLevelResult {
  ok: boolean;
  /** Escadas/rampas com geometria nova. */
  adjusted: number;
  /** Escadas/rampas que continuam sem altura válida depois da edição. */
  invalid: number;
  /** Degraus acrescentados no último lance (soma). */
  added: number;
  /** Degraus removidos do fim dos lances (soma; espelho abaixo do mínimo). */
  removed?: number;
  /** Elementos excluídos na decisão "Excluir". */
  deleted: number;
  message: string;
  /** Há conflitos: nada foi aplicado; a tela deve perguntar o que fazer. */
  needsDecision?: boolean;
  plan?: LevelMovePlan;
  cancelled?: boolean;
}

/**
 * Aplica o plano em uma única transação. `cancel` não grava nada. `delete` aplica a cota e exclui os elementos em
 * conflito (os demais são reajustados). `add` aplica a cota e força a extensão dos que têm componentes — inclusive os
 * que colidem, que continuam com o aviso de invasão.
 */
export function applyLevelMove(store: ProjectStore, plan: LevelMovePlan, decision: LevelMoveDecision): MoveLevelResult {
  const lang = useI18n.getState().lang;
  if (decision === 'cancel') {
    return { ok: true, adjusted: 0, invalid: plan.invalid, added: 0, deleted: 0, cancelled: true, message: t(lang, 'eds_msg_level_move_cancelled') };
  }
  const p0 = store.project;
  const level = p0.levels.find((l) => l.id === plan.levelId);
  if (!level) return { ok: false, adjusted: 0, invalid: 0, added: 0, deleted: 0, message: t(lang, 'eds_msg_level_missing') };
  let adjusted = 0;
  let deleted = 0;
  let added = 0;
  let removed = 0;
  store.transaction(decision === 'delete' ? 'eds_undo_move_level_delete' : 'eds_undo_move_level', () => {
    pinAutoTops(store);
    store.exec({ type: 'upsertLevel', level: { ...level, elevation: plan.elevation } });
    for (const s of plan.stairs) {
      if (s.status === 'conflict' && decision === 'delete') {
        store.exec({ type: 'deleteElements', ids: [s.id] });
        deleted++;
        continue;
      }
      if (!s.components) continue;
      store.exec({
        type: 'updateElements',
        ids: [s.id],
        patch: {
          components: s.components,
          ...(s.freePath ? { freePath: s.freePath } : {}),
          ...(s.manualLandings ? { manualLandings: s.manualLandings } : {}),
        },
      });
      adjusted++;
      added += s.added;
      removed += s.removed;
    }
    for (const r of plan.ramps) {
      if (r.status === 'conflict' && decision === 'delete') {
        store.exec({ type: 'deleteElements', ids: [r.id] });
        deleted++;
        continue;
      }
      if (!r.components) continue;
      store.exec({
        type: 'updateElements',
        ids: [r.id],
        patch: {
          components: r.components,
          ...(r.inputMode ? { inputMode: r.inputMode } : {}),
          ...(r.slopeTarget !== undefined ? { slopeTarget: r.slopeTarget } : {}),
          ...(r.landingDepth !== undefined ? { landingDepth: r.landingDepth } : {}),
          ...(r.freePath ? { freePath: r.freePath } : {}),
        },
      });
      adjusted++;
    }
  });

  const p1 = store.project;
  const invalid = [...plan.stairs.map((s) => s.id), ...plan.ramps.map((r) => r.id)].filter((id) => {
    const e = p1.elements[id];
    return isStair(e) ? invalidStair(p1, e) : isRamp(e) ? invalidRamp(p1, e) : false;
  }).length;
  const parts: string[] = [];
  if (removed > 0) parts.push(t(lang, removed === 1 ? 'eds_msg_parts_removed_one' : 'eds_msg_parts_removed_many', { n: removed }));
  if (added > 0) parts.push(t(lang, added === 1 ? 'eds_msg_parts_added_one' : 'eds_msg_parts_added_many', { n: added }));
  if (adjusted > 0) parts.push(t(lang, adjusted === 1 ? 'eds_msg_parts_adjusted_one' : 'eds_msg_parts_adjusted_many', { n: adjusted }));
  if (deleted > 0) parts.push(t(lang, deleted === 1 ? 'eds_msg_parts_deleted_one' : 'eds_msg_parts_deleted_many', { n: deleted }));
  if (invalid > 0) parts.push(t(lang, invalid === 1 ? 'eds_msg_parts_invalid_one' : 'eds_msg_parts_invalid_many', { n: invalid }));
  // Escadas em que N não mudou (ou de espelho fixo): explica o porquê, com o espelho e a faixa do tipo.
  const notes = plan.stairs
    .filter((s) => !(s.status === 'conflict' && decision === 'delete') && (s.fixed || s.to === s.from))
    .map((s) => `${s.label}: ${s.summary}${s.summary.endsWith('.') ? '' : '.'}`);
  const tail = notes.length > 0 ? ` ${notes.join(' ')}` : '';
  return {
    ok: true,
    adjusted,
    invalid,
    added,
    removed,
    deleted,
    message: parts.length > 0
      ? t(lang, 'eds_msg_level_moved_parts', { level: plan.levelName, parts: parts.join('; '), tail })
      : t(lang, 'eds_msg_level_moved', { level: plan.levelName, tail }),
  };
}

export interface MoveLevelOptions {
  /** Compensa os offsets para manter a cota absoluta de base/topo (não recalcula degraus). */
  keepHeights?: boolean;
  /** Só é usada quando há conflito: 'add' força a extensão, 'delete' exclui, 'cancel' cancela. */
  decision?: LevelMoveDecision;
}

/**
 * Edita a cota de um nível como operação de projeto. Primeiro **planeja** (sem gravar); se não há conflito, aplica
 * automaticamente em uma transação. Se há conflito e não veio uma decisão, devolve `needsDecision` **sem aplicar nada**
 * — a tela pergunta: acrescentar no último lance, cancelar ou excluir. O `keepHeights` mantém o comportamento antigo de
 * compensar offsets sem recalcular a escada.
 */
export function moveLevel(store: ProjectStore, levelId: Id, elevation: number, keepOrOptions: boolean | MoveLevelOptions = false): MoveLevelResult {
  const options: MoveLevelOptions = typeof keepOrOptions === 'boolean' ? { keepHeights: keepOrOptions } : keepOrOptions;
  const p0 = store.project;
  const lang = useI18n.getState().lang;
  const level = p0.levels.find((l) => l.id === levelId);
  if (!level) return { ok: false, adjusted: 0, invalid: 0, added: 0, deleted: 0, message: t(lang, 'eds_msg_level_missing') };
  if (!Number.isFinite(elevation)) return { ok: false, adjusted: 0, invalid: 0, added: 0, deleted: 0, message: t(lang, 'eds_msg_invalid_elevation') };
  if (elevation === level.elevation) {
    return { ok: true, adjusted: 0, invalid: 0, added: 0, deleted: 0, message: t(lang, 'eds_msg_level_already_at_elevation', { level: level.name }) };
  }

  if (options.keepHeights) {
    const delta = elevation - level.elevation;
    const affected = affectedByLevel(p0, levelId);
    store.transaction('eds_undo_move_level', () => {
      pinAutoTops(store);
      for (const e of affected) {
        const cur = store.project.elements[e.id];
        if (!cur || (!isStair(cur) && !isRamp(cur))) continue;
        const patch: { baseOffset?: number; topOffset?: number } = {};
        if (cur.levelId === levelId) patch.baseOffset = cur.baseOffset - delta;
        if (cur.topLevelId === levelId) patch.topOffset = cur.topOffset - delta;
        if (Object.keys(patch).length > 0) store.exec({ type: 'updateElements', ids: [cur.id], patch });
      }
      store.exec({ type: 'upsertLevel', level: { ...level, elevation } });
    });
    return { ok: true, adjusted: 0, invalid: 0, added: 0, deleted: 0, message: t(lang, 'eds_msg_level_moved_keep_heights', { level: level.name }) };
  }

  const plan = planLevelMove(store, levelId, elevation);
  if ('error' in plan) return { ok: false, adjusted: 0, invalid: 0, added: 0, deleted: 0, message: plan.error };
  if (options.decision === 'cancel') return applyLevelMove(store, plan, 'cancel');
  // Conflito (parede, forma, sem altura) OU reajuste que muda N, insere patamar ou deixa patamar faltando: resumo + confirmação.
  if ((plan.conflicts > 0 || plan.confirmations > 0) && !options.decision) {
    const quais = plan.conflicts === 1 ? t(lang, 'eds_msg_conflict_fit_one') : t(lang, 'eds_msg_conflict_fit_many', { n: plan.conflicts });
    const mudam = plan.confirmations === 1 ? t(lang, 'eds_msg_conflict_change_one') : t(lang, 'eds_msg_conflict_change_many', { n: plan.confirmations });
    return {
      ok: true,
      adjusted: 0,
      invalid: plan.invalid,
      added: 0,
      deleted: 0,
      needsDecision: true,
      plan,
      message:
        plan.conflicts > 0
          ? t(lang, 'eds_msg_level_move_decision', { level: plan.levelName, conflict: quais })
          : t(lang, 'eds_msg_level_move_confirm', { level: plan.levelName, conflict: mudam }),
    };
  }
  return applyLevelMove(store, plan, options.decision ?? 'add');
}

/** Resultado de `applyLevelElevation`: o que a tela deve fazer depois de editar a cota. */
export interface LevelElevationOutcome {
  ok: boolean;
  /** Texto da barra de status (sucesso ou erro). */
  message: string;
  /** Há conflito de escada/rampa: abrir o diálogo `levelMoveConflict` com este argumento. */
  conflictArg?: string;
}

/**
 * Ponto único de edição da cota de um nível (painel Propriedades, tabela de níveis e cota 3D): chama `moveLevel`,
 * captura qualquer exceção e devolve sempre uma mensagem. Quem chama só aplica o resultado na interface.
 */
export function applyLevelElevation(store: ProjectStore, levelId: Id, elevation: number): LevelElevationOutcome {
  try {
    const r = moveLevel(store, levelId, elevation);
    if (r.needsDecision) return { ok: true, message: r.message, conflictArg: JSON.stringify({ levelId, elevation }) };
    return { ok: r.ok, message: r.ok ? r.message : t(useI18n.getState().lang, 'eds_msg_level_move_failed', { error: r.message }) };
  } catch (err) {
    const lang = useI18n.getState().lang;
    return { ok: false, message: `${t(lang, 'eds_msg_level_move_failed', { error: err instanceof Error ? err.message : t(lang, 'eds_msg_unexpected_error') })}.` };
  }
}
