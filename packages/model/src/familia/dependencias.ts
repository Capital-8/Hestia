import { current, isDraft } from 'immer';
import type { Familia } from './tipos.ts';

/*
 * Utilidades de família sem estado: clonagem segura de rascunho do immer e fecho das dependências (módulos aninhados).
 */

/** Cópia profunda de um valor que pode ser rascunho do immer (um Proxy que o `structuredClone` não aceita). */
export function clonarSeguro<T>(valor: T): T {
  return structuredClone(isDraft(valor) ? current(valor) : valor);
}

/**
 * Famílias de que `familia` depende, direta ou indiretamente, pelos módulos aninhados (`aninhados[].familiaId`), na ordem em
 * que aparecem (dependências antes de quem as usa), sem repetir e sem a própria família. `buscar` devolve a família pelo id;
 * ids que ela não conhece são ignorados (a resolução acusa o erro). Ciclos não travam.
 */
export function dependenciasDaFamilia(familia: Familia, buscar: (id: string) => Familia | undefined): Familia[] {
  const vistos = new Set<string>([familia.id]);
  const saida: Familia[] = [];
  const visitar = (f: Familia): void => {
    for (const a of f.aninhados ?? []) {
      if (vistos.has(a.familiaId)) continue;
      vistos.add(a.familiaId);
      const dep = buscar(a.familiaId);
      if (!dep) continue;
      visitar(dep);
      saida.push(dep);
    }
  };
  visitar(familia);
  return saida;
}
