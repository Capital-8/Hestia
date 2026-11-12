/** Envio das seções do guarda-corpo ao kernel, inteiras ou só as linhas que mudaram (decisão 0055, Fase 2). */
import type { CenaV2 } from '@hestia/geom';
import type { CenaGC } from './kernelGuardaCorpo.ts';
import { COLUNAS, NOMES_SECOES_GC, type ColunasGC, type NomeSecaoGC } from './kernelGuardaCorpoTabelas.ts';

/** Envia todas as seções à cena (substitui as linhas que o Rust tinha). */
export function enviarCenaGC(cena: CenaV2, c: CenaGC): void {
  for (const nome of NOMES_SECOES_GC) cena.definirSecao(nome, c.secoes[nome], c.nLinhas[nome]);
}

export interface DiferencaSecaoGC {
  secao: NomeSecaoGC;
  /** Linhas novas ou alteradas, em colunas. */
  upsert: ColunasGC;
  nUpsert: number;
  /** `id_num` das linhas que sumiram. */
  remover: number[];
}

const linhaDe = (cols: ColunasGC, nomes: readonly string[], i: number): string => nomes.map((c) => {
  const v = cols[c]![i]!;
  return Number.isNaN(v) ? 'nan' : String(v);
}).join('|');

/**
 * O que mudou de `antes` para `depois`, por seção: linhas novas ou diferentes (upsert) e linhas removidas. `antes` nulo = tudo é novo. As duas cenas
 * precisam ter sido montadas com a numeração encadeada (`anterior`), senão os `id_num` não se correspondem.
 */
export function diferencaGC(antes: CenaGC | null, depois: CenaGC): DiferencaSecaoGC[] {
  const saida: DiferencaSecaoGC[] = [];
  for (const nome of NOMES_SECOES_GC) {
    const nomes = COLUNAS[nome];
    const velhas = new Map<number, string>();
    if (antes) for (let i = 0; i < antes.nLinhas[nome]; i++) velhas.set(antes.secoes[nome]['id_num']![i]!, linhaDe(antes.secoes[nome], nomes, i));
    const upsert: ColunasGC = Object.fromEntries(nomes.map((c) => [c, [] as number[]]));
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
export function aplicarDiferencaGC(cena: CenaV2, d: readonly DiferencaSecaoGC[]): void {
  for (const s of d) if (s.remover.length > 0) cena.remover(s.secao, s.remover);
  for (const s of d) if (s.nUpsert > 0) cena.upsert(s.secao, s.upsert, s.nUpsert);
}

/** Atalho: envia `depois` inteiro (sem `antes`) ou só a diferença. Devolve o que foi tocado. */
export function sincronizarCenaGC(cena: CenaV2, antes: CenaGC | null, depois: CenaGC): DiferencaSecaoGC[] {
  if (!antes) {
    enviarCenaGC(cena, depois);
    return NOMES_SECOES_GC.map((secao) => ({ secao, upsert: depois.secoes[secao], nUpsert: depois.nLinhas[secao], remover: [] }));
  }
  const d = diferencaGC(antes, depois);
  aplicarDiferencaGC(cena, d);
  return d;
}
