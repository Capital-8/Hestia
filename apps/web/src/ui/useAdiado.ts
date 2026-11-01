import { useEffect, useState } from 'react';

/** Resultados já calculados, por objeto-base (o projeto, imutável) e chave: sobrevivem a desmontar e montar o painel. */
const guardados = new WeakMap<object, Map<string, unknown>>();

/**
 * Cálculo caro de um painel, fora do caminho do clique. O painel aparece na hora (sem o valor); o cálculo roda depois da
 * pintura e o resultado fica em cache por `base` + `chave`, então voltar ao painel com o mesmo projeto é instantâneo.
 * `base` deve ser imutável (o `Project`): ao editar, vem outro objeto e o cache antigo sai com o anterior.
 * `atrasoMs` espera esse tempo antes de calcular: quem clica de elemento em elemento não paga por cada passagem.
 * Devolve `undefined` enquanto o valor não está pronto.
 */
export function useAdiado<T>(base: object, chave: string, calcular: () => T, atrasoMs = 0): T | undefined {
  const [, redesenhar] = useState(0);
  const pronto = guardados.get(base)?.has(chave) === true;
  useEffect(() => {
    if (guardados.get(base)?.has(chave)) return undefined;
    let cancelado = false;
    let tempo: ReturnType<typeof setTimeout> | undefined;
    // Primeiro quadro pintado, depois o cálculo: o painel responde ao clique antes do trabalho pesado.
    const quadro = requestAnimationFrame(() => {
      tempo = setTimeout(() => {
        if (cancelado) return;
        let mapa = guardados.get(base);
        if (!mapa) guardados.set(base, (mapa = new Map()));
        if (!mapa.has(chave)) mapa.set(chave, calcular());
        redesenhar((n) => n + 1);
      }, atrasoMs);
    });
    return () => {
      cancelado = true;
      cancelAnimationFrame(quadro);
      if (tempo !== undefined) clearTimeout(tempo);
    };
    // `calcular` é recriado a cada render; a identidade do cálculo é `base` + `chave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, chave]);
  return pronto ? (guardados.get(base)!.get(chave) as T) : undefined;
}
