import type { Escolha, Familia, Peca } from '../tipos.ts';

/*
 * Escolhas internas das famílias da biblioteca (ficha ESC-biblioteca). A regra é mecânica: todo parâmetro `enum`,
 * `booleano` ou `inteiro` sem fórmula que aparece no `quando`/`repetir` de alguma peça vira uma escolha na zona dessa
 * peça. O `grupo` da peça segue o papel (porta → portas, fundo → fundo, prateleira → prateleiras, gaveta → gavetas,
 * tampo → tampo, rodapé → rodape); os demais papéis usam o próprio nome. O resultado não altera a geometria: só dados
 * lidos pela interface.
 */

const ZONAS_POR_PAPEL: Record<string, string> = {
  porta: 'portas',
  fundo: 'fundo',
  prateleira: 'prateleiras',
  gaveta: 'gavetas',
  tampo: 'tampo',
  rodape: 'rodape',
};

const TIPOS_COM_ESCOLHA = new Set(['enum', 'booleano', 'inteiro']);

/** Id de parâmetro como palavra inteira (letras, dígitos e `_`). */
function usaParametro(formula: string | undefined, id: string): boolean {
  if (formula === undefined) return false;
  return formula.split(/[^A-Za-z0-9_]+/).includes(id);
}

/** Zona da peça: o `grupo` dela (se já houver) ou o grupo derivado do papel. */
function zonaDaPeca(peca: Peca): string {
  return peca.grupo !== undefined && peca.grupo !== '' ? peca.grupo : (ZONAS_POR_PAPEL[peca.papel] ?? peca.papel);
}

/**
 * Devolve a família com os `grupo` das peças e as `escolhas` calculados pela regra. Função pura: não altera a
 * entrada e devolve a própria família quando não há nenhuma escolha.
 */
export function comEscolhas(familia: Familia): Familia {
  const pecas = familia.pecas.map((peca) => ({ ...peca }));
  const escolhas: Escolha[] = [];

  for (const parametro of familia.parametros) {
    if (parametro.formula !== undefined || !TIPOS_COM_ESCOLHA.has(parametro.tipo)) continue;

    let zona: string | undefined;
    for (let i = 0; i < pecas.length; i++) {
      const peca = pecas[i]!;
      if (!usaParametro(peca.quando, parametro.id) && !usaParametro(peca.repetir, parametro.id)) continue;
      const alvo = zonaDaPeca(peca);
      if (peca.grupo === undefined || peca.grupo === '') pecas[i] = { ...peca, grupo: alvo };
      zona ??= alvo;
    }

    if (zona !== undefined) escolhas.push({ id: `esc_${parametro.id}`, nome: parametro.nome, parametro: parametro.id, zona });
  }

  if (escolhas.length === 0) return familia;
  return { ...familia, pecas, escolhas };
}
