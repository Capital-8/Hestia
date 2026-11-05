import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { pedidoAreaMerge, responderAreaMerge } from '../../editor/areaMergePrompt.ts';
import { Dialog } from './Dialog.tsx';

/** Confirmação da regra de áreas: a maior fica, as menores são apagadas e a parede/separador é removido. */
export function AreaMergeDialog(): ReactElement | null {
  const { t } = useT();
  const pedido = pedidoAreaMerge();
  if (!pedido) return null;
  return (
    <Dialog
      title={t('dlm_area_merge')}
      size="narrow"
      onClose={() => responderAreaMerge(false)}
      footer={
        <>
          <button className="btn" onClick={() => responderAreaMerge(false)}>{t('dlm_btn_cancel')}</button>
          <button className="btn primary" autoFocus onClick={() => responderAreaMerge(true)}>{t('dlm_area_merge_ok')}</button>
        </>
      }
    >
      <p role="alert" style={{ whiteSpace: 'pre-line' }}>{pedido.message}</p>
    </Dialog>
  );
}
