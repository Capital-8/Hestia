import { dist } from '@hestia/geom';
import { isWall, type Id } from '@hestia/model';
import { vizinhaCurta } from './alignNeighbors.ts';
import type { AlignSolution } from './alignSolve.ts';
import { transformWalls } from './edit.ts';
import { commitRingEdit } from './ringTarget.ts';
import { execWithHostedLoss } from './hostedGuard.ts';
import type { ToolEnv } from './types.ts';
import { langOf, t as translate } from './i18n.ts';

/** Ganchos para quem tem um esboço aberto (perímetro): aplica a linha alinhada no rascunho. */
export interface AlignApplyHooks {
  esboco?(sol: Extract<AlignSolution, { kind: 'esboco' }>): boolean;
  /** Parede de referência: não se move. Se a parede alinhada a arrastar pela junta, as pontas dela voltam ao lugar. */
  referencia?: Id;
}

export interface AlignApplied {
  applied: number;
  messages: string[];
}

/**
 * Aplica um resultado do Alinhar num único passo de desfazer (quem chama abre a transação). A parede usa o mesmo
 * `follow` do Alinhar antigo (a vizinha acompanha, menos a referência) e recusa quando uma vizinha ficaria com comprimento zero.
 */
export function applyAlign(env: ToolEnv, sol: AlignSolution, hooks: AlignApplyHooks = {}): boolean {
  if (sol.kind === 'nada' || sol.kind === 'erro') return false;

  if (sol.kind === 'transladar') {
    if (sol.target === 'parede') {
      const curta = vizinhaCurta(env.project(), env.levelId(), sol.id, sol.d);
      if (curta) {
        env.say(`Alinhar deixaria a parede ${curta.mark || curta.id} com comprimento zero: nada foi alterado.`);
        return false;
      }
      // O `follow` das vizinhas pode alcançar a própria referência (parede ligada pela ponta): ela volta às pontas originais.
      const refId = hooks.referencia === sol.id ? undefined : hooks.referencia;
      const ref = refId === undefined ? undefined : env.project().elements[refId];
      const antes = isWall(ref) ? { a: ref.a, b: ref.b } : null;
      transformWalls(env, [sol.id], { kind: 'translate', d: sol.d }, 'Alinhar', true);
      const depois = refId === undefined ? undefined : env.project().elements[refId];
      if (antes && isWall(depois) && (dist(depois.a, antes.a) > 1e-9 || dist(depois.b, antes.b) > 1e-9)) {
        env.exec({ type: 'setWallEnds', id: refId!, a: antes.a, b: antes.b });
      }
      return true;
    }
    env.exec({ type: 'transform', ids: [sol.id], transform: { kind: 'translate', d: sol.d } });
    return true;
  }

  if (sol.kind === 'ponta') {
    const result = execWithHostedLoss(env, 'Alinhar ponta', [{ type: 'setWallEnds', id: sol.wallId, ...(sol.end === 'a' ? { a: sol.to } : { b: sol.to }) }]);
    return result.status !== 'cancelled';
  }

  if (sol.kind === 'abertura') {
    env.exec({ type: 'updateElements', ids: [sol.openingId], patch: { offset: sol.offset } });
    return true;
  }

  if (sol.kind === 'anel') {
    // Travada: commitRingEdit já diz o motivo na barra de status (Desvincular antes).
    return commitRingEdit(env, sol.ref, sol.ring);
  }

  if (sol.kind === 'esboco') {
    if (hooks.esboco) return hooks.esboco(sol);
    env.say(translate(langOf(env), 'tl_msg_sketch_line_perimeter_tool'));
    return false;
  }

  return false;
}

/**
 * Aplica vários resultados no mesmo passo de desfazer. Erros e "já alinhado" não entram na transação; as recusas
 * individuais (vizinha curta, anel travado) devolvem a mensagem em `messages`.
 */
export function applyAlignMany(env: ToolEnv, solutions: AlignSolution[], label = 'Alinhar', hooks: AlignApplyHooks = {}): AlignApplied {
  const valid = solutions.filter((s) => s.kind !== 'nada' && s.kind !== 'erro');
  if (!valid.length) return { applied: 0, messages: [] };
  let applied = 0;
  env.transaction(label, () => {
    for (const sol of valid) if (applyAlign(env, sol, hooks)) applied += 1;
  });
  return { applied, messages: [] };
}
