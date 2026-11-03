/*
 * Utilidades defensivas do catálogo de marcenaria (ficha E5-catalogo). A entrada pode vir de um arquivo estranho: nada
 * aqui lança por campo ausente ou de tipo errado, só devolve valores neutros para as regras transformarem em problema.
 */

export const ID_CATALOGO_VALIDO = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const COR_CATALOGO_VALIDA = /^#[0-9a-fA-F]{6}$/;

/** Chaves que jamais podem vir de um arquivo: mexer nelas é poluir o protótipo. */
const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/** Profundidade máxima percorrida ao procurar chave proibida (defesa contra estrutura hostil ou cíclica). */
const PROFUNDIDADE_MAX = 64;

export function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Texto seguro para compor `onde` mesmo quando o id está ausente ou não é string. */
export function texto(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return '?';
  return String(v);
}

export function idValido(v: unknown): v is string {
  return typeof v === 'string' && ID_CATALOGO_VALIDO.test(v);
}

export function textoNaoVazio(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

export function numeroFinito(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Custo opcional: ausente passa; presente tem de ser número finito e não negativo. */
export function custoValido(v: unknown): boolean {
  return v === undefined || (numeroFinito(v) && v >= 0);
}

export function corValida(v: unknown): boolean {
  return typeof v === 'string' && COR_CATALOGO_VALIDA.test(v);
}

/**
 * Procura chave proibida em qualquer nível (objetos e listas). Devolve `'proibida'`, `'fundo'` (passou do limite de
 * profundidade) ou `null`. Recursivo com limite para não estourar a pilha em estrutura muito aninhada ou cíclica.
 */
export function varreduraProibida(v: unknown, profundidade = 0): 'proibida' | 'fundo' | null {
  if (profundidade > PROFUNDIDADE_MAX) return 'fundo';
  if (Array.isArray(v)) {
    for (const item of v) {
      const achado = varreduraProibida(item, profundidade + 1);
      if (achado) return achado;
    }
    return null;
  }
  if (!ehObjetoSimples(v)) return null;
  for (const chave of Object.keys(v)) {
    if (CHAVES_PROIBIDAS.has(chave)) return 'proibida';
    const achado = varreduraProibida(v[chave], profundidade + 1);
    if (achado) return achado;
  }
  return null;
}
