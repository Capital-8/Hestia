/** Envio das seções da parede cortina ao kernel, inteiras ou só as linhas que mudaram (decisão 0056, fase 1). Mesmo molde de `kernelGuardaCorpoEnvio.ts`. */
import type { CenaV2 } from '@hestia/geom';
import type { CenaCortina } from './kernelCortina.ts';
import { COLUNAS_CORTINA, NOMES_SECOES_CORTINA, type ColunasCortina, type NomeSecaoCortina } from './kernelCortinaTabelas.ts';

/** Envia todas as seções à cena (substitui as linhas que o Rust tinha). */
export function enviarCenaCortina(cena: CenaV2, c: CenaCortina): void {
  for (const nome of NOMES_SECOES_CORTINA) cena.definirSecao(nome, c.secoes[nome], c.nLinhas[nome]);
}

export interface DiferencaSecaoCortina {
  secao: NomeSecaoCortina;
  /** Linhas novas ou alteradas, em colunas. */
  upsert: ColunasCortina;
  nUpsert: number;
  /** `id_num` das linhas que sumiram. */
  remover: number[];
}

const linhaDe = (cols: ColunasCortina, nomes: readonly string[], i: number): string =>
  nomes
    .map((c) => {
      const v = cols[c]![i]!;
      return Number.isNaN(v) ? 'nan' : String(v);
    })
    .join('|');

/**
 * O que mudou de `antes` para `depois`, por seção: linhas novas ou diferentes (upsert) e linhas removidas. `antes` nulo = tudo é novo. As duas cenas
 * precisam ter sido montadas com a numeração encadeada (`anterior`), senão os `id_num` não se correspondem.
 */
export function diferencaCortina(antes: CenaCortina | null, depois: CenaCortina): DiferencaSecaoCortina[] {
  const saida: DiferencaSecaoCortina[] = [];
  for (const nome of NOMES_SECOES_CORTINA) {
    const nomes = COLUNAS_CORTINA[nome];
    const velhas = new Map<number, string>();
    if (antes) for (let i = 0; i < antes.nLinhas[nome]; i++) velhas.set(antes.secoes[nome]['id_num']![i]!, linhaDe(antes.secoes[nome], nomes, i));
    const upsert: ColunasCortina = Object.fromEntries(nomes.map((c) => [c, [] as number[]]));
    let nUpsert = 0;
    const vistas = new Set<number>();
    for (let i = 0; i < depois.nLinhas[nome]; i++) {
      const id = depois.secoes[nome]['id_num']![i]!;
      vistas.add(id);
      if (velhas.get(id) === linhaDe(depois.secoes[nome], nomes, i)) continue;
      for (const c of nomes) upsert[c]!.push(depois.secoes[nome][c]![i]!);
      nUpsert++;
    }
    const remover = [...velhas.keys()].filter((id) => !vistas.has(id));
    if (nUpsert > 0 || remover.length > 0) saida.push({ secao: nome, upsert, nUpsert, remover });
  }
  return saida;
}

/** Aplica a diferença à cena: remove as linhas que sumiram e depois insere as novas ou alteradas. Só as seções que mudaram são tocadas. */
export function aplicarDiferencaCortina(cena: CenaV2, d: readonly DiferencaSecaoCortina[]): void {
  for (const s of d) if (s.remover.length > 0) cena.remover(s.secao, s.remover);
  for (const s of d) if (s.nUpsert > 0) cena.upsert(s.secao, s.upsert, s.nUpsert);
}

/** Atalho: envia `depois` inteiro (sem `antes`) ou só a diferença. Devolve o que foi tocado. */
export function sincronizarCenaCortina(cena: CenaV2, antes: CenaCortina | null, depois: CenaCortina): DiferencaSecaoCortina[] {
  if (!antes) {
    enviarCenaCortina(cena, depois);
    return NOMES_SECOES_CORTINA.map((secao) => ({ secao, upsert: depois.secoes[secao], nUpsert: depois.nLinhas[secao], remover: [] }));
  }
  const d = diferencaCortina(antes, depois);
  aplicarDiferencaCortina(cena, d);
  return d;
}
