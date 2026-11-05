import type { HostedLoss } from '@hestia/tools';
import { useUi } from './state.ts';

interface Pedido {
  losses: readonly HostedLoss[];
  message: string;
  resolver: (ok: boolean) => void;
}

let atual: Pedido | null = null;

/** Abre o diálogo de confirmação das aberturas que sairiam da parede e espera a escolha. */
export function pedirConfirmacaoHostedLoss(losses: readonly HostedLoss[], message: string): Promise<boolean> {
  if (atual) responderHostedLoss(false);
  return new Promise<boolean>((resolve) => {
    atual = { losses, message, resolver: resolve };
    useUi.setState({ dialog: 'hostedLoss' });
  });
}

/** Pedido em aberto, para o diálogo desenhar. */
export function pedidoHostedLoss(): { losses: readonly HostedLoss[]; message: string } | null {
  return atual ? { losses: atual.losses, message: atual.message } : null;
}

/** Responde o pedido: confirmar aplica a operação, cancelar não muda nada. */
export function responderHostedLoss(ok: boolean): void {
  const pedido = atual;
  if (!pedido) return;
  atual = null;
  useUi.setState({ dialog: null });
  if (ok) useUi.setState({ status: { key: 'edc_hosted_loss_applied' } });
  else useUi.setState({ status: { key: 'edc_operation_cancelled' } });
  pedido.resolver(ok);
}
