import type { Id } from '@hestia/model';
import { useUi } from './state.ts';

/**
 * Alerta modal: uma informação que o usuário precisa confirmar com OK (ex.: bloqueio de parede em cima de parede,
 * decisão 0044). Diferente do `say` da barra, o alerta não some sozinho — a recusa fica registrada para quem age.
 * Os `ids` (a parede em conflito) viram o realce amarelo da vista enquanto o alerta está aberto.
 */
let mensagem: string | null = null;

/** Abre o alerta com `message`; um alerta em aberto é substituído pelo mais recente. */
export function pedirAlerta(message: string, ids?: readonly Id[]): void {
  mensagem = message;
  useUi.setState({ dialog: 'alerta', avisoParede: ids?.[0] ?? null });
}

/** Mensagem do alerta em aberto, para o diálogo desenhar. */
export function alertaPendente(): string | null {
  return mensagem;
}

/** O usuário confirmou (OK, Esc ou clique fora): fecha o alerta e tira o realce amarelo. */
export function fecharAlerta(): void {
  mensagem = null;
  useUi.setState({ dialog: null, avisoParede: null });
}
