import type { Command } from '@hestia/model';
import { hostedLossMessage, hostedLossOfCommands, type HostedLoss } from './hostedLoss.ts';
import type { ToolEnv } from './types.ts';

/** Resultado de uma operação que pode perder aberturas: aplicada, recusada ou aguardando o diálogo. */
export type HostedApplyStatus = 'applied' | 'cancelled' | 'pending';

export interface HostedApplyResult {
  status: HostedApplyStatus;
  losses: HostedLoss[];
}

function apply(env: ToolEnv, label: string, commands: readonly Command[], losses: readonly HostedLoss[], session?: object): void {
  env.transaction(label, () => {
    for (const c of commands) env.exec(c);
    // As aberturas confirmadas saem no MESMO passo: Ctrl+Z devolve parede e aberturas juntas.
    if (losses.length) env.exec({ type: 'deleteElements', ids: losses.map((l) => l.id) });
  }, session);
}

/**
 * Aplica comandos que mexem em pontas de parede com a regra única das aberturas hospedadas: se alguma sairia da
 * parede, pede confirmação pelo `env.confirmHostedLoss` (síncrono nos testes, diálogo na interface). Confirmar aplica
 * a mudança e exclui as aberturas no mesmo passo de desfazer; cancelar não muda nada.
 * Sem aberturas afetadas, ou sem o gancho de confirmação, o comportamento é o antigo (aplica direto).
 */
export function execWithHostedLoss(
  env: ToolEnv,
  label: string,
  commands: readonly Command[],
  session?: object,
): HostedApplyResult {
  const losses = hostedLossOfCommands(env.project(), commands);
  if (!losses.length || !env.confirmHostedLoss) {
    apply(env, label, commands, losses, session);
    return { status: 'applied', losses };
  }
  const answer = env.confirmHostedLoss(losses, hostedLossMessage(losses, env.lang?.() ?? 'pt'));
  if (typeof answer === 'boolean') {
    if (answer) apply(env, label, commands, losses, session);
    return { status: answer ? 'applied' : 'cancelled', losses };
  }
  void answer
    .then((ok) => {
      if (ok) apply(env, label, commands, losses, session);
    })
    .catch(() => undefined);
  return { status: 'pending', losses };
}
