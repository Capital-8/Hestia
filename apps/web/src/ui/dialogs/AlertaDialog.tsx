import type { ReactElement } from 'react';
import { alertaPendente, fecharAlerta } from '../../editor/alertaPrompt.ts';
import { Dialog } from './Dialog.tsx';

/**
 * Alerta de recusa que o usuário precisa confirmar. A operação já foi recusada quando o alerta abre (nada mudou);
 * o OK só confirma que a pessoa leu o motivo — por isso um botão só.
 */
export function AlertaDialog(): ReactElement | null {
  const mensagem = alertaPendente();
  if (!mensagem) return null;
  return (
    <Dialog
      title="Aviso"
      size="narrow"
      onClose={fecharAlerta}
      footer={
        <button className="btn primary" autoFocus onClick={fecharAlerta}>
          OK
        </button>
      }
    >
      <p role="alert">{mensagem}</p>
    </Dialog>
  );
}
