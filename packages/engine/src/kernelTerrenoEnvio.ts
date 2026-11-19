/** Envio das seções do terreno ao kernel, inteiras ou só as linhas que mudaram (A.8 item 4). */
import type { CenaV2 } from '@hestia/geom';
import type { CenaTN, ColunasTN, NomeSecaoTN } from './kernelTerreno.ts';
import { COLUNAS_TN, NOMES_SECOES_TN } from './kernelTerreno.ts';

/** Envia todas as seções à cena (substitui as linhas que o Rust tinha). */
export function enviarCenaTN(cena: CenaV2, c: CenaTN): void {
  for (const nome of NOMES_SECOES_TN) cena.definirSecao(nome, c.secoes[nome], c.nLinhas[nome]);
}

export interface DiferencaSecaoTN {
  secao: NomeSecaoTN;
  /** Linhas novas ou alteradas, em colunas. */
  upsert: ColunasTN;
  nUpsert: number;
  /** `id_num` das linhas que sumiram. */
  remover: number[];
}

/**
 * O que mudou de `antes` para `depois`, por seção: linhas novas ou diferentes (upsert) e linhas removidas. `antes` nulo = tudo é novo. As duas cenas
 * precisam ter sido montadas com a numeração encadeada (`anterior`), senão os números de terreno e de região não se correspondem.
 */
export function diferencaTN(antes: CenaTN | null, depois: CenaTN): DiferencaSecaoTN[] {
  const saida: DiferencaSecaoTN[] = [];
  for (const nome of NOMES_SECOES_TN) {
    const nomes = COLUNAS_TN[nome];
    const velhas = antes?.texto[nome];
    const novas = depois.texto[nome];
    const ids = depois.secoes[nome]['id_num']!;
    const upsert: ColunasTN = Object.fromEntries(nomes.map((c) => [c, [] as number[]]));
    let nUpsert = 0;
    for (let i = 0; i < depois.nLinhas[nome]; i++) {
      if (velhas && velhas.get(ids[i]!) === novas.get(ids[i]!)) continue;
      for (const c of nomes) upsert[c]!.push(depois.secoes[nome][c]![i]!);
      nUpsert++;
    }
    const remover = velhas ? [...velhas.keys()].filter((id) => !novas.has(id)) : [];
    if (nUpsert > 0 || remover.length > 0) saida.push({ secao: nome, upsert, nUpsert, remover });
  }
  return saida;
}

/** Aplica a diferença à cena: remove as linhas que sumiram e depois insere as novas ou alteradas. Só as seções que mudaram são tocadas. */
export function aplicarDiferencaTN(cena: CenaV2, d: readonly DiferencaSecaoTN[]): void {
  for (const s of d) if (s.remover.length > 0) cena.remover(s.secao, s.remover);
  for (const s of d) if (s.nUpsert > 0) cena.upsert(s.secao, s.upsert, s.nUpsert);
}

/** Atalho: envia `depois` inteiro (sem `antes`) ou só a diferença. Devolve o que foi tocado. */
export function sincronizarCenaTN(cena: CenaV2, antes: CenaTN | null, depois: CenaTN): DiferencaSecaoTN[] {
  if (!antes) {
    enviarCenaTN(cena, depois);
    return NOMES_SECOES_TN.map((secao) => ({ secao, upsert: depois.secoes[secao], nUpsert: depois.nLinhas[secao], remover: [] }));
  }
  const d = diferencaTN(antes, depois);
  aplicarDiferencaTN(cena, d);
  return d;
}
