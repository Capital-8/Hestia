import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { pedidoConfirmacao, responderConfirmacao } from '../../editor/confirmacaoPrompt.ts';
import { Dialog } from './Dialog.tsx';

/** Pergunta de sim ou não de uma ferramenta: confirmar segue a operação; cancelar não muda nada. */
export function ConfirmacaoDialog(): ReactElement | null {
  const { t } = useT();
  const mensagem = pedidoConfirmacao();
  if (mensagem === null) return null;
  return (
    <Dialog
      title={t('dlm_confirm_title')}
      size="narrow"
      onClose={() => responderConfirmacao(false)}
      footer={
        <>
          <button className="btn" onClick={() => responderConfirmacao(false)}>{t('dlm_btn_cancel')}</button>
          <button className="btn primary" autoFocus onClick={() => responderConfirmacao(true)}>{t('dlm_confirm_ok')}</button>
        </>
      }
    >
      <p role="alert">{mensagem}</p>
    </Dialog>
  );
}
