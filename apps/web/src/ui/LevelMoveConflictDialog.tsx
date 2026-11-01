import { useMemo, type ReactElement } from 'react';
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
      <Dialog title="Nível" onClose={onClose} size="narrow" footer={<button className="btn primary" onClick={onClose}>Fechar</button>}>
        <p className="error" role="alert">{plan && 'error' in plan ? plan.error : 'Não foi possível planejar a mudança de nível.'}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title={conflicts > 0 ? 'Escada/rampa não cabe no nível novo' : 'Confirmar o reajuste da escada'}
      sub={`${plan.levelName} → ${fmt('length', plan.elevation)}`}
      onClose={() => decide('cancel')}
      size="wide"
      footer={
        <>
          <button className="btn" onClick={() => decide('cancel')}>Cancelar a mudança</button>
          <span style={{ flex: 1 }} />
          {conflicts > 0 && (
            <button
              className="btn danger"
              onClick={() => {
                const quais = plan.stairs.filter((s) => s.status === 'conflict').map((s) => s.label).join(', ');
                if (quais && window.confirm(`Excluir ${quais}? A cota do nível será aplicada e a exclusão entra no mesmo Ctrl+Z.`)) decide('delete');
              }}
            >
              Excluir o elemento
            </button>
          )}
          <button className="btn primary" disabled={!canAdd} onClick={() => decide('add')} title={canAdd ? 'Aplica a cota e o reajuste mostrado no resumo (degraus acrescentados no último lance ou removidos do fim)' : 'Esta escada não pode ser reajustada automaticamente'}>
            Aplicar
          </button>
        </>
      }
    >
      <p>
        {conflicts > 0
          ? `${conflicts === 1 ? 'Um elemento não cabe' : `${conflicts} elementos não cabem`} na altura nova sem sair da faixa de espelho do tipo ou sem invadir o que está em volta. `
          : 'O reajuste muda o nº de degraus ou o patamar de uma escada. '}
        A cota do nível <strong>ainda não foi alterada</strong>.
      </p>
      {plan.stairs.length > 0 && (
        <table className="layers">
          <thead><tr><th>Escada</th><th>Resumo</th><th>Situação</th></tr></thead>
          <tbody>
            {plan.stairs.map((s) => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td>{s.summary}</td>
                <td style={s.status === 'conflict' ? { color: 'var(--danger, #b42318)' } : undefined}>
                  {s.status === 'conflict' ? s.reason ?? 'Não cabe' : s.warning ?? (s.needsConfirm ? 'Confirmar' : 'Ok')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {plan.ramps.length > 0 && (
        <table className="layers" style={{ marginTop: 8 }}>
          <thead><tr><th>Rampa</th><th>Situação</th></tr></thead>
          <tbody>
            {plan.ramps.map((r) => (
              <tr key={r.id}>
                <td>{r.label}</td>
                <td style={r.status === 'conflict' ? { color: 'var(--danger, #b42318)' } : undefined}>{r.status === 'conflict' ? r.reason ?? 'Não cabe' : 'Ok'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">
        “Aplicar” recalcula o nº de degraus e o piso pela fórmula do tipo (acrescenta degraus no último lance ou remove do fim; insere
        patamar quando o lance passa de 3,20 m); se a extensão invadir uma parede, o aviso de invasão continua. “Cancelar” mantém tudo
        como está. “Excluir” remove só os elementos em conflito.
      </p>
    </Dialog>
  );
}
