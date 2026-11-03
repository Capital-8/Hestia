import type { AreaMergePreview } from './areaMerge.ts';
import { useUi } from './state.ts';

interface Pedido {
  preview: AreaMergePreview;
  resolver: (ok: boolean) => void;
}

let atual: Pedido | null = null;

/** Abre o aviso de fusão de áreas e espera a confirmação do usuário. */
export function pedirConfirmacaoAreaMerge(preview: AreaMergePreview): Promise<boolean> {
  if (atual) responderAreaMerge(false);
  return new Promise<boolean>((resolve) => {
    atual = { preview, resolver: resolve };
    useUi.setState({ dialog: 'areaMerge' });
  });
}

export function pedidoAreaMerge(): AreaMergePreview | null {
  return atual?.preview ?? null;
}

/** Confirmar aplica a remoção; cancelar não altera parede, separador nem ambientes. */
export function responderAreaMerge(ok: boolean): void {
  const pedido = atual;
  if (!pedido) return;
  atual = null;
  useUi.setState({ dialog: null, status: { key: ok ? 'edc_areas_merged' : 'edc_operation_cancelled' } });
  pedido.resolver(ok);
}
