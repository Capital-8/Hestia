import type { Familia, Parametro, Valor } from '@hestia/model';

/*
 * Helpers puros do editor de famílias (sem React). Servem a Flexionar, à tabela de parâmetros e às propriedades da peça:
 * a interface é GERADA dos parâmetros da família.
 */

export type TipoControle = 'slider' | 'numero' | 'select' | 'check' | 'texto';

export interface Controle {
  param: Parametro;
  controle: TipoControle;
}

/** Um parâmetro calculado (com fórmula) não é flexionável: o valor vem da fórmula. */
function controleDe(p: Parametro): TipoControle {
  switch (p.tipo) {
    case 'comprimento':
    case 'numero':
    case 'inteiro':
      return p.min !== undefined && p.max !== undefined && p.max > p.min ? 'slider' : 'numero';
    case 'enum':
    case 'chapa':
      return p.opcoes !== undefined && p.opcoes.length > 0 ? 'select' : 'texto';
    case 'booleano':
      return 'check';
    case 'texto':
    case 'material':
      return 'texto';
  }
}

/**
 * Controles do "Flexionar": um por parâmetro SEM fórmula, na ordem da família. Escolha do controle:
 *  - comprimento, numero e inteiro: 'slider' quando `min` e `max` existem e `max > min`; senão 'numero';
 *  - enum e chapa: 'select' (se não tiver `opcoes`, 'texto');
 *  - booleano: 'check';
 *  - texto e material: 'texto'.
 */
export function controlesDeFlex(f: Familia): Controle[] {
  return f.parametros.filter((p) => p.formula === undefined).map((p) => ({ param: p, controle: controleDe(p) }));
}

/** Valor em uso de um parâmetro: `valores[id]` (flex) → `tipo.valores[id]` → `padrao`. `tipoId` nulo ou inexistente ignora o tipo. */
export function valorEfetivo(f: Familia, tipoId: string | null, valores: Readonly<Record<string, Valor>>, p: Parametro): Valor {
  const doFlex = valores[p.id];
  if (doFlex !== undefined) return doFlex;
  const tipo = tipoId === null ? undefined : f.tipos.find((t) => t.id === tipoId);
  const doTipo = tipo?.valores[p.id];
  if (doTipo !== undefined) return doTipo;
  return p.padrao;
}

/** Agrupa por `p.grupo` (sem grupo → 'Geral'), na ordem da primeira aparição de cada grupo e mantendo a ordem dos parâmetros dentro dele. */
export function agruparParametros(params: readonly Parametro[]): Array<{ grupo: string; params: Parametro[] }> {
  const grupos: Array<{ grupo: string; params: Parametro[] }> = [];
  for (const p of params) {
    const grupo = p.grupo ?? 'Geral';
    const atual = grupos.find((g) => g.grupo === grupo);
    if (atual) atual.params.push(p);
    else grupos.push({ grupo, params: [p] });
  }
  return grupos;
}

/** Rótulo de um valor de enum/chapa: o `rotulo` da opção, senão o próprio valor como texto. */
export function rotuloDoValor(p: Parametro, valor: Valor): string {
  const opcao = p.opcoes?.find((o) => o.valor === valor);
  return opcao?.rotulo ?? String(valor);
}

/** Converte texto numérico aceitando vírgula decimal; `null` se não for número. */
function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Converte o texto digitado em valor do tipo do parâmetro; `null` se não serve (número inválido, fora de [min, max], inteiro com fração, opção inexistente). */
export function lerEntrada(p: Parametro, texto: string): Valor | null {
  switch (p.tipo) {
    case 'comprimento':
    case 'numero': {
      const n = lerNumero(texto);
      if (n === null) return null;
      if (p.min !== undefined && n < p.min) return null;
      if (p.max !== undefined && n > p.max) return null;
      return n;
    }
    case 'inteiro': {
      const n = lerNumero(texto);
      if (n === null || !Number.isInteger(n)) return null;
      if (p.min !== undefined && n < p.min) return null;
      if (p.max !== undefined && n > p.max) return null;
      return n;
    }
    case 'enum':
    case 'chapa': {
      const limpo = texto.trim();
      if (limpo === '') return null;
      for (const o of p.opcoes ?? []) {
        if (typeof o.valor === 'number' ? String(o.valor) === limpo : o.valor === limpo) return o.valor;
      }
      return null;
    }
    case 'booleano': {
      const limpo = texto.trim().toLowerCase();
      if (limpo === 'true') return true;
      if (limpo === 'false') return false;
      return null;
    }
    case 'texto':
    case 'material':
      return texto.trim();
  }
}
