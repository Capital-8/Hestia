import { isComponent, newId, type Component, type Id, type Project } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/**
 * Ações de conjunto na interface: agrupar a seleção de componentes e desagrupar os conjuntos dos componentes
 * selecionados. Agrupar recusa a seleção inválida antes de alterar o projeto; desagrupar remove os conjuntos num só
 * passo de desfazer.
 */

/** Componentes da seleção, na ordem em que foram selecionados. */
function componentesDaSelecao(p: Project, ids: readonly Id[]): Component[] {
  return ids
    .map((id) => p.elements[id])
    .filter((e): e is Component => isComponent(e));
}

/** Menor número positivo ainda não usado em "Conjunto N". */
function proximoNumeroLivre(p: Project): number {
  const usados = new Set<number>();
  for (const grupo of Object.values(p.componentGroups ?? {})) {
    const encontrado = /^Conjunto (\d+)$/.exec(grupo.nome.trim());
    if (encontrado) usados.add(Number(encontrado[1]));
  }
  let numero = 1;
  while (usados.has(numero)) numero += 1;
  return numero;
}

/** Recusa a seleção inválida com a mensagem na barra de status; null quando pode agrupar. */
function impedeAgrupar(componentes: readonly Component[], levelId: Id): string | null {
  if (componentes.length < 2) return 'Selecione ao menos dois componentes para agrupar.';
  if (componentes.some((c) => c.levelId !== levelId)) return 'Componentes em níveis diferentes.';
  const emConjunto = componentes.find((c) => c.groupId !== undefined);
  if (emConjunto) return 'Componente já está em outro conjunto: ' + emConjunto.id;
  return null;
}

/**
 * Cria um conjunto com os componentes selecionados (membros na ordem da seleção). Recusa com a mensagem na barra de
 * status, sem alterar o projeto, quando há menos de dois componentes, níveis diferentes ou algum já em outro conjunto.
 * Devolve a mensagem de recusa; null quando agrupou.
 */
export function agruparSelecao(env: ToolEnv): string | null {
  const p = env.project();
  const componentes = componentesDaSelecao(p, env.selection());
  const recusa = impedeAgrupar(componentes, env.levelId());
  if (recusa !== null) {
    env.say(recusa);
    return recusa;
  }
  const numero = proximoNumeroLivre(p);
  const nome = `Conjunto ${numero}`;
  const grupo = {
    id: newId('g'),
    nome,
    levelId: env.levelId(),
    membros: componentes.map((c) => c.id),
  };
  env.exec({ type: 'upsertComponentGroup', group: grupo });
  env.setSelection(grupo.membros);
  env.say(`Conjunto "${nome}" criado com ${grupo.membros.length} componente${grupo.membros.length > 1 ? 's' : ''}. Ctrl+Z desfaz.`);
  return null;
}

/**
 * Remove os conjuntos de todos os componentes selecionados que estão em conjunto, num único passo de desfazer.
 * Devolve a mensagem informativa (nada a desagrupar); null quando desagrupou.
 */
export function desagruparSelecao(env: ToolEnv): string | null {
  const p = env.project();
  const componentes = componentesDaSelecao(p, env.selection());
  const grupos = new Set<Id>();
  for (const c of componentes) {
    if (c.groupId !== undefined && p.componentGroups?.[c.groupId]) grupos.add(c.groupId);
  }
  if (grupos.size === 0) {
    const aviso = 'Nenhum componente selecionado está em um conjunto.';
    env.say(aviso);
    return aviso;
  }
  env.transaction('Desagrupar componentes', () => {
    for (const id of grupos) env.exec({ type: 'deleteComponentGroup', id });
  });
  const total = grupos.size;
  env.say(`${total} conjunto${total > 1 ? 's' : ''} desfeito${total > 1 ? 's' : ''}. Ctrl+Z desfaz.`);
  return null;
}
