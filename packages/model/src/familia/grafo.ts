import type { Familia } from './tipos.ts';

/*
 * Ordem de avaliação dos parâmetros e dos planos de referência (ADR 0049 §3.2: sem solver, ordem topológica).
 * FICHA E1-grafo: implementar os três corpos abaixo. Os testes de aceite estão em `grafo.test.ts`.
 */

export interface Dependencia {
  id: string;
  /** Ids dos quais este item depende (ids desconhecidos são ignorados por `ordenar`). */
  deps: readonly string[];
}

export type ResultadoOrdem = { ok: true; ordem: string[] } | { ok: false; ciclo: string[] };

/**
 * Ordenação topológica determinística (algoritmo de Kahn):
 * - cada id aparece uma vez em `ordem`, depois de todas as suas dependências conhecidas;
 * - entre itens prontos, vence o que aparece primeiro em `itens` (estável);
 * - dependência de id que não está em `itens` é ignorada; auto-dependência é ciclo de um só id;
 * - com ciclo devolve `{ ok: false, ciclo }`: `ciclo` é UM ciclo, na ordem do caminho (cada id depende do seguinte e o último
 *   do primeiro), começando pelo item de menor posição em `itens` que participe de algum ciclo; ao andar, entre as
 *   dependências que ainda estão no resíduo cíclico escolhe-se a de menor posição em `itens`.
 */
export function ordenar(itens: readonly Dependencia[]): ResultadoOrdem {
  void itens;
  throw new Error('não implementado: ficha E1-grafo');
}

/**
 * Itens do grafo de uma família: primeiro cada parâmetro (na ordem da família), depois cada plano de referência.
 * `deps` de um item com fórmula = nomes que a fórmula referencia, com `x.esp` contando como `x`, mantendo só os que são
 * id de parâmetro ou de plano da família, sem repetição e na ordem alfabética de `referencias`. Item sem fórmula (ou com
 * fórmula que não compila) tem `deps` vazio: o erro de sintaxe é assunto de `validarFamilia`, não deste módulo.
 */
export function dependenciasDaFamilia(f: Familia): Dependencia[] {
  void f;
  throw new Error('não implementado: ficha E1-grafo');
}

export function ordemDeAvaliacao(f: Familia): ResultadoOrdem {
  void f;
  throw new Error('não implementado: ficha E1-grafo');
}
