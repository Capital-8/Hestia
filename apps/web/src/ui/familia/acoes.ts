import type { Familia, Parametro, Valor } from '@hestia/model';

/*
 * Helpers puros do editor de famílias (sem React). FICHA E3-ed1: implementar as funções abaixo. Testes em `acoes.test.ts`.
 * Servem a Flexionar, à tabela de parâmetros e às propriedades da peça: a interface é GERADA dos parâmetros da família.
 */

export type TipoControle = 'slider' | 'numero' | 'select' | 'check' | 'texto';

export interface Controle {
  param: Parametro;
  controle: TipoControle;
}

/**
 * Controles do "Flexionar": um por parâmetro SEM fórmula, na ordem da família. Escolha do controle:
 *  - comprimento, numero e inteiro: 'slider' quando `min` e `max` existem e `max > min`; senão 'numero';
 *  - enum e chapa: 'select' (se não tiver `opcoes`, 'texto');
 *  - booleano: 'check';
 *  - texto e material: 'texto'.
 */
export function controlesDeFlex(f: Familia): Controle[] {
  void f;
  throw new Error('não implementado: ficha E3-ed1');
}

/** Valor em uso de um parâmetro: `valores[id]` (flex) → `tipo.valores[id]` → `padrao`. `tipoId` nulo ou inexistente ignora o tipo. */
export function valorEfetivo(f: Familia, tipoId: string | null, valores: Readonly<Record<string, Valor>>, p: Parametro): Valor {
  void f;
  void tipoId;
  void valores;
  void p;
  throw new Error('não implementado: ficha E3-ed1');
}

/** Agrupa por `p.grupo` (sem grupo → 'Geral'), na ordem da primeira aparição de cada grupo e mantendo a ordem dos parâmetros dentro dele. */
export function agruparParametros(params: readonly Parametro[]): Array<{ grupo: string; params: Parametro[] }> {
  void params;
  throw new Error('não implementado: ficha E3-ed1');
}

/** Rótulo de um valor de enum/chapa: o `rotulo` da opção, senão o próprio valor como texto. */
export function rotuloDoValor(p: Parametro, valor: Valor): string {
  void p;
  void valor;
  throw new Error('não implementado: ficha E3-ed1');
}

/** Converte o texto digitado em valor do tipo do parâmetro; `null` se não serve (número inválido, fora de [min, max], inteiro com fração, opção inexistente). */
export function lerEntrada(p: Parametro, texto: string): Valor | null {
  void p;
  void texto;
  throw new Error('não implementado: ficha E3-ed1');
}
