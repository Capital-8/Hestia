import { useUi } from './state.ts';

/**
 * Pergunta de sim ou não de uma ferramenta (ex.: fundir células vizinhas para caber uma porta na cortina). Mesmo modelo de
 * `hostedLossPrompt.ts`: o pedido fica em aberto até o diálogo responder, e a Promise resolve com a escolha.
 */
interface Pedido {
  message: string;
  resolver: (ok: boolean) => void;
}

let atual: Pedido | null = null;

/** Abre o diálogo com a pergunta e espera a resposta. Um pedido em aberto é recusado ao chegar outro. */
export function pedirConfirmacao(message: string): Promise<boolean> {
  if (atual) responderConfirmacao(false);
  return new Promise<boolean>((resolve) => {
    atual = { message, resolver: resolve };
    useUi.setState({ dialog: 'confirmacao' });
  });
}

/** Pergunta em aberto, para o diálogo desenhar. */
export function pedidoConfirmacao(): string | null {
  return atual ? atual.message : null;
}

/** Responde a pergunta: sim segue a operação; não (ou fechar) não muda nada. */
export function responderConfirmacao(ok: boolean): void {
  const pedido = atual;
  if (!pedido) return;
  atual = null;
  useUi.setState({ dialog: null });
  pedido.resolver(ok);
}
