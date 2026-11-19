import { useUi } from './state.ts';

/**
 * Confirmação modal ao finalizar ou editar um telhado que cria degrau vertical entre águas: pergunta ao usuário se
 * deseja fechar o vão com o material da testeira (`closeStepGaps: true`) ou deixá-lo aberto (`closeStepGaps: false`).
 * Segue o modelo de `confirmacaoPrompt.ts` / `hostedLossPrompt.ts`.
 */
interface Pedido {
  message: string;
  resolver: (closeStepGaps: boolean) => void;
}

let atual: Pedido | null = null;

/** Abre o diálogo com a pergunta sobre o degrau do telhado e espera a escolha do usuário. */
export function pedirConfirmacaoDegrauTelhado(message: string): Promise<boolean> {
  if (atual) responderDegrauTelhado(false);
  return new Promise<boolean>((resolve) => {
    atual = { message, resolver: resolve };
    useUi.setState({ dialog: 'roofStep' });
  });
}

/** Mensagem da pergunta em aberto, para `RoofStepDialog` desenhar. */
export function pedidoDegrauTelhado(): string | null {
  return atual ? atual.message : null;
}

/** Responde a pergunta: `true` fecha com testeira (`closeStepGaps: true`), `false` (ou fechar) deixa aberto. */
export function responderDegrauTelhado(closeStepGaps: boolean): void {
  const pedido = atual;
  if (!pedido) return;
  atual = null;
  useUi.setState({ dialog: null });
  pedido.resolver(closeStepGaps);
}
