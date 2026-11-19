import type { ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { pedidoDegrauTelhado, responderDegrauTelhado } from '../../editor/roofStepPrompt.ts';
import { Dialog } from './Dialog.tsx';

/**
 * Confirmação ao finalizar/editar um telhado com degrau vertical entre águas: o usuário escolhe entre gerar o
 * fechamento com o material da testeira (`closeStepGaps: true`) ou deixar o vão aberto (`closeStepGaps: false`).
 */
export function RoofStepDialog(): ReactElement | null {
  const { t } = useT();
  const mensagem = pedidoDegrauTelhado();
  if (mensagem === null) return null;
  return (
    <Dialog
      title={t('dlm_roof_step_title')}
      size="narrow"
      onClose={() => responderDegrauTelhado(false)}
      footer={
        <>
          <button className="btn" onClick={() => responderDegrauTelhado(false)}>{t('dlm_roof_step_open')}</button>
          <button className="btn primary" autoFocus onClick={() => responderDegrauTelhado(true)}>{t('dlm_roof_step_close')}</button>
        </>
      }
    >
      <p role="alert">{mensagem}</p>
    </Dialog>
  );
}
