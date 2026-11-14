import { useState, type ReactElement } from 'react';
import { isWall, WALL_TILT_MAX } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { grauDeRad, inclinarParedes, TILT_MAX_RAD } from '../../editor/wallTiltActions.ts';
import { useUi } from '../../editor/state.ts';
import { useT } from '../../editor/i18n.ts';
import { NumField, Row } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Diálogo "Inclinar paredes" (ação da aba Modificar | Paredes): pede o ângulo e grava `setWallTilt` nas paredes
 * selecionadas num só desfazer. A recusa do modelo (limite, arco que se fecha, perfil de topo) aparece no próprio
 * diálogo, e o diálogo continua aberto para corrigir o valor.
 */
export function WallTiltDialog(): ReactElement {
  const { t } = useT();
  // As paredes são as da seleção no momento em que o diálogo abre (ele é modal: a seleção não muda enquanto estiver aberto).
  const [ids] = useState(() => useUi.getState().selection.filter((id) => isWall(editor.project.elements[id])));
  const [rad, setRad] = useState(0);
  const [err, setErr] = useState('');
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const apply = (): void => {
    const erro = inclinarParedes(editor.store, ids, grauDeRad(rad));
    if (erro) return setErr(erro);
    close();
  };
  return (
    <Dialog
      title={t('prc_tilt_dialog_title')}
      sub={t('prc_tilt_dialog_hint')}
      onClose={close}
      onSubmit={apply}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={close}>{t('dlm_btn_cancel')}</button>
          <button className="btn primary" onClick={apply} disabled={ids.length === 0}>{t('dlm_btn_apply')}</button>
        </>
      }
    >
      <Row label={t('prc_fld_tilt')} htmlFor="wt-angle">
        <NumField
          id="wt-angle"
          value={rad}
          quantity="angle"
          min={-TILT_MAX_RAD}
          max={TILT_MAX_RAD}
          strictRange
          onInvalid={() => setErr(t('prc_msg_tilt_limit', { max: WALL_TILT_MAX }))}
          onValid={() => setErr('')}
          onCommit={setRad}
        />
      </Row>
      {err ? <p className="error" role="alert">{err}</p> : null}
    </Dialog>
  );
}
