import { useMemo, type ReactElement } from 'react';
import { useT } from '../editor/i18n.ts';
import { editor } from '../editor/controller.ts';
import { applyLevelMove, planLevelMove, type LevelMoveDecision } from '../editor/levelActions.ts';
import { useUi } from '../editor/state.ts';
import { Dialog } from './dialogs/Dialog.tsx';
import { useFormat } from './useUnits.ts';

/**
 * Pergunta o que fazer quando editar a cota de um nível deixa uma escada/rampa sem caber no nível novo, ou quando o
 * reajuste muda o nº de degraus / insere patamar (decisão 0041). Nada foi aplicado ainda: a cota só muda depois da escolha.
 * - Aplicar: recalcula N/T e reajusta a escada (acrescenta ou remove degraus; pode manter o aviso de invasão).
 * - Cancelar a mudança: não grava nada (Esc também).
 * - Excluir a escada: aplica a cota e remove os elementos em conflito, num único Ctrl+Z.
 */
export function LevelMoveConflictDialog({ onClose }: { onClose: () => void }): ReactElement {
  const { t } = useT();
  const fmt = useFormat();
  const arg = useUi((s) => s.dialogArg);
  const target = useMemo(() => {
    try {
      const v = JSON.parse(arg ?? '') as { levelId?: unknown; elevation?: unknown };
      const levelId = typeof v.levelId === 'string' ? v.levelId : '';
      const elevation = typeof v.elevation === 'number' ? v.elevation : NaN;
      return levelId && Number.isFinite(elevation) ? { levelId, elevation } : null;
    } catch {
      return null;
    }
  }, [arg]);
  const plan = useMemo(() => (target ? planLevelMove(editor.store, target.levelId, target.elevation) : null), [target]);
  const conflicts = plan && !('error' in plan) ? plan.stairs.filter((s) => s.status === 'conflict').length + plan.ramps.filter((r) => r.status === 'conflict').length : 0;
  const conflictItems = plan && !('error' in plan) ? [...plan.stairs.filter((s) => s.status === 'conflict'), ...plan.ramps.filter((r) => r.status === 'conflict')] : [];
  // Sem conflito (só reajuste a confirmar), aplicar é sempre possível; com conflito, só se todos têm geometria para continuar.
  const canAdd = conflictItems.every((x) => !!x.components);

  const decide = (decision: LevelMoveDecision): void => {
    if (!plan || 'error' in plan) {
      onClose();
      return;
    }
    const r = applyLevelMove(editor.store, plan, decision);
    useUi.setState({ status: r.message, dialog: null, dialogArg: null });
  };

  if (!plan || 'error' in plan) {
    return (
      <Dialog title={t('col_level')} onClose={onClose} size="narrow" footer={<button className="btn primary" onClick={onClose}>{t('dlm_btn_close')}</button>}>
        <p className="error" role="alert">{plan && 'error' in plan ? plan.error : t('dlm_err_plan_level')}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={conflicts > 0 ? t('dlm_lmc_conflict_title') : t('dlm_lmc_adjust_title')}
      sub={`${plan.levelName} → ${fmt('length', plan.elevation)}`}
      onClose={() => decide('cancel')}
      size="wide"
      footer={
        <>
          <button className="btn" onClick={() => decide('cancel')}>{t('dlm_lmc_cancel')}</button>
          <span style={{ flex: 1 }} />
          {conflicts > 0 && (
            <button
              className="btn danger"
              onClick={() => {
                const quais = plan.stairs.filter((s) => s.status === 'conflict').map((s) => s.label).join(', ');
                if (quais && window.confirm(t('dlm_lmc_delete_confirm', { names: quais }))) decide('delete');
              }}
            >
              {t('dlm_lmc_delete')}
            </button>
          )}
          <button className="btn primary" disabled={!canAdd} onClick={() => decide('add')} title={canAdd ? t('dlm_lmc_apply_tip') : t('dlm_lmc_apply_tip_disabled')}>
            {t('dlm_btn_apply')}
          </button>
        </>
      }
    >
      <p>
        {conflicts > 0
          ? `${conflicts === 1 ? t('dlm_lmc_conflict_one') : t('dlm_lmc_conflict_many', { n: conflicts })}${t('dlm_lmc_conflict_tail')}`
          : t('dlm_lmc_adjust_lead')}
        {t('dlm_lmc_level_before')} <strong>{t('dlm_lmc_not_changed')}</strong>{t('dlm_lmc_period')}
      </p>
      {plan.stairs.length > 0 && (
        <table className="layers">
          <thead><tr><th>{t('dlm_col_stair')}</th><th>{t('dlm_col_summary')}</th><th>{t('dlm_col_status')}</th></tr></thead>
          <tbody>
            {plan.stairs.map((s) => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{s.summary}</td>
                <td style={s.status === 'conflict' ? { color: 'var(--danger, #b42318)' } : undefined}>
                  {s.status === 'conflict' ? s.reason ?? t('dlm_status_no_fit') : s.warning ?? (s.needsConfirm ? t('dlm_status_confirm') : t('dlm_status_ok'))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plan.ramps.length > 0 && (
        <table className="layers" style={{ marginTop: 8 }}>
          <thead><tr><th>{t('dlm_col_ramp')}</th><th>{t('dlm_col_status')}</th></tr></thead>
          <tbody>
            {plan.ramps.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td style={r.status === 'conflict' ? { color: 'var(--danger, #b42318)' } : undefined}>{r.status === 'conflict' ? r.reason ?? t('dlm_status_no_fit') : t('dlm_status_ok')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">
        {t('dlm_lmc_hint')}
      </p>
    </Dialog>
  );
}
