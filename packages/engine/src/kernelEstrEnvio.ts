/** Envio das seções da estrutura ao kernel, inteiras ou só as linhas que mudaram (A.5: "envio por diferença"; molde de `kernelGuardaCorpoEnvio.ts`). */
import type { CenaV2 } from '@hestia/geom';
import type { CenaEstr, LinhaEstr } from './kernelEstr.ts';
import { COLUNAS_ESTR, NOMES_SECOES_ESTR, type ColunasEstr, type NomeSecaoEstr } from './kernelEstrTabelas.ts';

/** Linhas de uma seção em colunas (o formato de `definirSecao` e `upsert`), na ordem do `id_num`. */
export function colunasDe(secao: NomeSecaoEstr, linhas: ReadonlyMap<number, LinhaEstr>, quais?: Iterable<number>): { colunas: ColunasEstr; n: number } {
  const nomes = COLUNAS_ESTR[secao];
  const colunas: ColunasEstr = Object.fromEntries(nomes.map((c) => [c, [] as number[]]));
  const ids = quais ? [...quais] : [...linhas.keys()];
  ids.sort((a, b) => a - b);
  let n = 0;
  for (const id of ids) {
    const l = linhas.get(id);
    if (!l) continue;
    nomes.forEach((c, i) => colunas[c]!.push(l[i]!));
    n++;
  }
  return { colunas, n };
}

/** Envia todas as seções à cena (substitui as linhas que o Rust tinha). */
export function enviarCenaEstr(cena: CenaV2, c: CenaEstr): void {
  for (const nome of NOMES_SECOES_ESTR) {
    const { colunas, n } = colunasDe(nome, c.secoes[nome]);
    cena.definirSecao(nome, colunas, n);
  }
}

export interface DiferencaSecaoEstr {
  secao: NomeSecaoEstr;
  /** Linhas novas ou alteradas, em colunas. */
  upsert: ColunasEstr;
  nUpsert: number;
  /** `id_num` das linhas que sumiram. */
  remover: number[];
}

const chaveDaLinha = (l: LinhaEstr): string => l.join('|');

/**
 * O que mudou de `antes` para `depois`, por seção: linhas novas ou diferentes (upsert) e linhas removidas. `antes` nulo = tudo é novo. As duas
 * cenas precisam ter sido montadas com a numeração encadeada (`anterior`). A linha reaproveitada (mesmo objeto) nem é comparada.
 */
export function diferencaEstr(antes: CenaEstr | null, depois: CenaEstr): DiferencaSecaoEstr[] {
  const saida: DiferencaSecaoEstr[] = [];
  for (const nome of NOMES_SECOES_ESTR) {
    const velhas = antes?.secoes[nome] ?? new Map<number, LinhaEstr>();
    const novas = depois.secoes[nome];
    const mudou: number[] = [];
    for (const [id, linha] of novas) {
      const v = velhas.get(id);
      if (v === linha) continue;
      if (v === undefined || chaveDaLinha(v) !== chaveDaLinha(linha)) mudou.push(id);
    }
    const remover = [...velhas.keys()].filter((id) => !novas.has(id));
    if (mudou.length === 0 && remover.length === 0) continue;
    const { colunas, n } = colunasDe(nome, novas, mudou);
    saida.push({ secao: nome, upsert: colunas, nUpsert: n, remover });
  }
  return saida;
}

/** Aplica a diferença: remove as linhas que sumiram (elementos antes dos tipos) e depois insere as novas ou alteradas (tipos antes dos elementos). */
export function aplicarDiferencaEstr(cena: CenaV2, d: readonly DiferencaSecaoEstr[]): void {
  for (const s of [...d].reverse()) if (s.remover.length > 0) cena.remover(s.secao, s.remover);
  for (const s of d) if (s.nUpsert > 0) cena.upsert(s.secao, s.upsert, s.nUpsert);
}

/** Atalho: envia `depois` inteiro (sem `antes`) ou só a diferença. Devolve o que foi tocado. */
export function sincronizarCenaEstr(cena: CenaV2, antes: CenaEstr | null, depois: CenaEstr): DiferencaSecaoEstr[] {
  if (!antes) {
    enviarCenaEstr(cena, depois);
    return NOMES_SECOES_ESTR.map((secao) => {
      const { colunas, n } = colunasDe(secao, depois.secoes[secao]);
      return { secao, upsert: colunas, nUpsert: n, remover: [] };
    });
  }
  const d = diferencaEstr(antes, depois);
  aplicarDiferencaEstr(cena, d);
  return d;
}
