import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { pedidoHostedLoss, responderHostedLoss } from '../../editor/hostedLossPrompt.ts';
import { Dialog } from './Dialog.tsx';

/**
 * Confirmação única das operações que deixariam aberturas fora da parede (Aparar, alças, cotas, Mover/Copiar).
 * Confirmar aplica a mudança e exclui as aberturas num só passo de desfazer; Cancelar não muda nada.
 */
export function HostedLossDialog(): ReactElement | null {
  const { t } = useT();
  const pedido = pedidoHostedLoss();
  if (!pedido) return null;
  return (
    <Dialog
      title={t('dlm_hosted_loss')}
      size="narrow"
      onClose={() => responderHostedLoss(false)}
      footer={
        <>
          <button className="btn" onClick={() => responderHostedLoss(false)}>{t('dlm_btn_cancel')}</button>
          <button className="btn primary" autoFocus onClick={() => responderHostedLoss(true)}>{t('dlm_hosted_loss_ok')}</button>
        </>
      }
    >
      <p role="alert">{pedido.message}</p>
    </Dialog>
  );
}
