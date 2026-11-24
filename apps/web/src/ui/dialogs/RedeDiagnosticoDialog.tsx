import type { ReactElement } from 'react';
import { useUi } from '../../editor/state.ts';
import { useT } from '../../editor/i18n.ts';
import { RedeDiagnostico } from '../RedeDiagnostico.tsx';
import { Dialog } from './Dialog.tsx';

/** Diálogo "Verificar rede" (ficha I1): lista os avisos de `diagnosticarRede`; "Ir para" seleciona e enquadra a instância. */
export function RedeDiagnosticoDialog(): ReactElement {
  const { t } = useT();
  const close = (): void => useUi.setState({ dialog: null });
  return (
    <Dialog
      title={t('rede_secao')}
      sub={t('rede_dica')}
      onClose={close}
      size="wide"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('dlc_btn_close')}</button>
        </>
      }
    >
      <RedeDiagnostico />
    </Dialog>
  );
}
