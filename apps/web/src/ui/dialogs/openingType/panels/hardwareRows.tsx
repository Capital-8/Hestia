import type { ReactElement } from 'react';
import { HARDWARE_LIMITS, openingHandleHeight, openingHandleInset, openingHardwareIssue, openingHardwareWarning, openingHinges, openingLeafUndercut } from '@hestia/model';
import { NumField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { setHandleHeight, setHandleInset, setHinges, setLeafUndercut } from '../openingTypeControls.ts';
import type { PanelProps } from './panelKit.tsx';

/**
 * Folga inferior da folha e, com maçaneta, a altura e o recuo dela. Faixas e padrões vêm de `HARDWARE_LIMITS` e
 * `HARDWARE_DEFAULTS` (packages/model/src/openingHardware.ts). O modelo confere ao salvar; aqui o erro e o aviso
 * (NBR 9050) aparecem logo abaixo, como os demais campos.
 */
export function LeafHardwareRows({ d, onChange, support }: PanelProps): ReactElement | null {
  const { t } = useT();
  if (!support.leafUndercut && !support.handle) return null;
  const erro = openingHardwareIssue({ leafUndercut: d.leafUndercut, handleHeight: d.handleHeight, handleInset: d.handleInset, hinges: d.hinges }, support);
  const aviso = openingHardwareWarning(d, support);
  return (
    <>
      {support.leafUndercut ? (
        <div className="field-row">
          <label htmlFor="op-undercut" title={t('dlo_f_leaf_undercut_tip')}>{t('dlo_f_leaf_undercut')}</label>
          <NumField id="op-undercut" value={openingLeafUndercut(d)} quantity="smallLength" min={HARDWARE_LIMITS.leafUndercut.min} max={HARDWARE_LIMITS.leafUndercut.max} onCommit={(v) => onChange(setLeafUndercut(d, v))} />
        </div>
      ) : null}
      {support.handle ? (
        <>
          <div className="field-row">
            <label htmlFor="op-handle-h" title={t('dlo_f_handle_height_tip')}>{t('dlo_f_handle_height')}</label>
            <NumField id="op-handle-h" value={openingHandleHeight(d)} quantity="smallLength" min={HARDWARE_LIMITS.handleHeight.min} max={HARDWARE_LIMITS.handleHeight.max} onCommit={(v) => onChange(setHandleHeight(d, v))} />
          </div>
          <div className="field-row">
            <label htmlFor="op-handle-i" title={t('dlo_f_handle_inset_tip')}>{t('dlo_f_handle_inset')}</label>
            <NumField id="op-handle-i" value={openingHandleInset(d)} quantity="smallLength" min={HARDWARE_LIMITS.handleInset.min} max={HARDWARE_LIMITS.handleInset.max} onCommit={(v) => onChange(setHandleInset(d, v))} />
          </div>
        </>
      ) : null}
      {erro ? <p className="error" role="alert">{erro}</p> : null}
      {aviso ? <p className="hint" style={{ padding: '0 0 8px' }}>{aviso}</p> : null}
    </>
  );
}

/** Dobradiças (quantidade, inteiro de 0 a 6; padrão 3). Só onde a tabela de suporte marca `hinges`. */
export function HingesRow({ d, onChange, support }: PanelProps): ReactElement | null {
  const { t } = useT();
  if (!support.hinges) return null;
  return (
    <div className="field-row">
      <label htmlFor="op-hinges" title={t('dlo_f_hinges_tip')}>{t('dlo_f_hinges')}</label>
      <NumField id="op-hinges" value={openingHinges(d)} decimals={0} min={HARDWARE_LIMITS.hinges.min} max={HARDWARE_LIMITS.hinges.max} onCommit={(v) => onChange(setHinges(d, v))} />
    </div>
  );
}
