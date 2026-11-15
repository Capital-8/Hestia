import { useSyncExternalStore } from 'react';

/** Parte da barra que cabe à montagem dos pavimentos; o resto é o preparo da seleção (estruturas de picking, fora do lote). */
export const PESO_MONTAGEM = 0.85;

/** Preparo da seleção em segundo plano: malhas com as estruturas de picking prontas e total. */
export interface PreparoSelecao {
  feitas: number;
  total: number;
}

/**
 * Progresso da vista 3D: pavimentos já na cena e total (a barra ainda pondera cada pavimento pelo trabalho dele) e,
 * depois do último pavimento, o preparo da seleção. `null` quando não há nada em curso.
 */
export interface Progresso3d {
  montados: number;
  total: number;
  /** Fração 0..1 da barra, com os pesos reais (ver `fracaoProgresso3d`). */
  fracao: number;
  /** Fase atual: montando pavimentos ou preparando a seleção (a cena já aparece, mas ainda não responde sem travar). */
  fase: 'montagem' | 'selecao';
}

/**
 * Fração 0..1 da barra. `pesos`/`feitos`: trabalho de cada pavimento (por exemplo, nº de elementos) e quais já entraram;
 * sem pesos todos valem igual. A montagem ocupa até `PESO_MONTAGEM`; o preparo da seleção, o restante. A barra só chega a
 * 1 quando o preparo termina (`preparo.feitas >= preparo.total`); com a montagem completa e o preparo ainda não
 * iniciado (`preparo` nulo), fica em `PESO_MONTAGEM`.
 */
export function fracaoProgresso3d(pesos: readonly number[], feitos: ReadonlySet<number> | readonly boolean[], preparo: PreparoSelecao | null): number {
  const feito = (i: number): boolean => (Array.isArray(feitos) ? Boolean((feitos as readonly boolean[])[i]) : (feitos as ReadonlySet<number>).has(i));
  let total = 0;
  let ok = 0;
  pesos.forEach((w, i) => {
    const peso = Math.max(0, Number.isFinite(w) ? w : 0) + 1e-9;
    total += peso;
    if (feito(i)) ok += peso;
  });
  const montagem = total > 0 ? ok / total : 1;
  if (montagem < 1) return montagem * PESO_MONTAGEM;
  if (!preparo) return PESO_MONTAGEM;
  const p = preparo.total > 0 ? Math.min(1, preparo.feitas / preparo.total) : 1;
  return PESO_MONTAGEM + (1 - PESO_MONTAGEM) * p;
}

let atual: Progresso3d | null = null;
const ouvintes = new Set<() => void>();

/**
 * Publica o progresso (a montagem e o preparo chamam a cada fatia). Com `fracao >= 1` a barra some. Sem `fracao`, usa
 * `montados / total` como antes (a fração da montagem sozinha, sem fase de preparo).
 */
export function publicarProgresso3d(montados: number, total: number, extra?: { fracao: number; fase: 'montagem' | 'selecao' }): void {
  const fracao = extra ? extra.fracao : total > 0 ? montados / total : 1;
  const fase = extra?.fase ?? 'montagem';
  const proximo: Progresso3d | null = total > 0 && fracao < 1 ? { montados, total, fracao, fase } : null;
  if (atual === proximo) return;
  if (atual && proximo && atual.montados === proximo.montados && atual.total === proximo.total && atual.fracao === proximo.fracao && atual.fase === proximo.fase) return;
  atual = proximo;
  for (const o of ouvintes) o();
}

/** Progresso corrente (para teste e depuração). */
export const progresso3dAtual = (): Progresso3d | null => atual;

/** Assina o progresso da montagem 3D. */
export function useProgresso3d(): Progresso3d | null {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    () => atual,
  );
}
