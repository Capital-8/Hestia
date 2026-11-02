import type { CodigoProblema, Problema } from './validar.ts';

/*
 * Utilidades defensivas das regras de `validarFamilia`. A entrada pode ser um arquivo estranho: nada aqui lança por
 * campo ausente ou de tipo errado, só devolve valores neutros para as regras transformarem em `Problema`.
 */

export function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function comoArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Texto seguro para compor `onde` mesmo quando o id está ausente ou não é string. */
export function texto(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return '?';
  return String(v);
}

export function criarProblema(codigo: CodigoProblema, mensagem: string, onde: string): Problema {
  return { nivel: 'erro', codigo, mensagem, onde };
}
