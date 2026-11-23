import type { Id } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/**
 * Regra única de captura e seleção por tom da vista (decisão 0060 §4.1) e por disciplina (plano de UX de 2026-11-23).
 * É o ÚNICO ponto que lê `hiddenInView`/`halftoneInView`/`bloqueados` (além de `base.ts`, que monta o contexto da
 * captura):
 *
 * | Estado     | Captura (snap) | Seleciona (clique) | Seleciona (caixa) | Referência de cota |
 * |------------|----------------|--------------------|-------------------|--------------------|
 * | normal     | sim            | sim                | sim               | sim                |
 * | bloqueado  | sim            | não                | não               | sim                |
 * | meio-tom   | sim            | não                | não               | sim                |
 * | oculto     | não            | não                | não               | não                |
 *
 * O meio-tom existe para coordenar (snap e cota) e não para editar outra disciplina. O bloqueado é o normal de outra
 * disciplina: continua desenhado e serve de captura/cota, mas não se edita sem liberar. Oculta não se vê: não captura
 * nem se seleciona. `modo` não muda o resultado hoje (a tabela é a mesma para clique e caixa); existe para que a decisão
 * fique registrada no chamador e para que uma futura exceção por gesto seja feita num ponto só.
 */

/** Contexto mínimo de visibilidade: o `ToolEnv` inteiro também serve. */
export type VisibilidadeEnv = Pick<ToolEnv, 'hiddenInView' | 'halftoneInView' | 'bloqueados'>;

const VAZIO: ReadonlySet<Id> = new Set<Id>();

/** O elemento está oculto na vista? (`hiddenInView` ausente = conjunto vazio.) */
const oculto = (env: VisibilidadeEnv, id: Id): boolean => (env.hiddenInView?.() ?? VAZIO).has(id);

/** O elemento está em meio-tom na vista? (`halftoneInView` ausente = conjunto vazio.) */
const meioTom = (env: VisibilidadeEnv, id: Id): boolean => (env.halftoneInView?.() ?? VAZIO).has(id);

/** O elemento está bloqueado por disciplina na vista? (`bloqueados` ausente = conjunto vazio.) */
const bloqueado = (env: VisibilidadeEnv, id: Id): boolean => (env.bloqueados?.() ?? VAZIO).has(id);

/** O elemento pode ser capturado (snap) e servir de referência de cota: normal, bloqueado e meio-tom sim; oculto não. */
export function podeCapturar(env: VisibilidadeEnv, id: Id): boolean {
  return !oculto(env, id);
}

/** O elemento pode ser selecionado no gesto (`clique` ou `caixa`): só o normal sem bloqueio; meio-tom, bloqueado e oculto não. */
export function podeSelecionar(env: VisibilidadeEnv, id: Id, _modo: 'clique' | 'caixa'): boolean {
  return podeCapturar(env, id) && !meioTom(env, id) && !bloqueado(env, id);
}

/**
 * A vista tem algum elemento que não se seleciona (oculto, bloqueado ou meio-tom)? Serve aos consumidores que precisam
 * decidir se montam a cópia filtrada do projeto, sem ler os conjuntos por conta própria.
 */
export function temNaoSelecionavel(env: VisibilidadeEnv): boolean {
  return (env.hiddenInView?.()?.size ?? 0) > 0 || (env.halftoneInView?.()?.size ?? 0) > 0 || (env.bloqueados?.()?.size ?? 0) > 0;
}

/** Conjunto de ocultos da vista para as APIs que ainda recebem o conjunto (nunca undefined). */
export function ocultosNaVista(env: VisibilidadeEnv): ReadonlySet<Id> {
  return env.hiddenInView?.() ?? VAZIO;
}

/** Conjunto de meio-tom da vista para as APIs que precisam dos dois conjuntos de uma vez (nunca undefined). */
export function meioTomNaVista(env: VisibilidadeEnv): ReadonlySet<Id> {
  return env.halftoneInView?.() ?? VAZIO;
}

/** Conjunto de bloqueados da vista para as APIs que precisam dele (nunca undefined). */
export function bloqueadosNaVista(env: VisibilidadeEnv): ReadonlySet<Id> {
  return env.bloqueados?.() ?? VAZIO;
}
