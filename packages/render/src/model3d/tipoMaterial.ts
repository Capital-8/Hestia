/**
 * Tipo procedural do material no renderizador Rust (`HSTR` v2, ver `crates/render-core/src/cena.rs`):
 * 0 liso, 1 reboco, 2 madeira, 3 telha, 4 piso, 5 metal, 6 vidro, 7 tijolo.
 *
 * A classificação vem do ELEMENTO de origem da malha (a categoria em `userData.kind`), nunca da cor do material.
 * A escala é a metragem de uma repetição do padrão; por enquanto é 1.0 em todas as regras.
 */

export interface TipoProcedural {
  /** Inteiro 0..7 (ver a lista acima). */
  tipo: number;
  /** Metros por repetição do padrão, finito e > 0. */
  escala: number;
}

const LISO = 0;
const REBOCO = 1;
const MADEIRA = 2;
const TELHA = 3;
const PISO = 4;
const METAL = 5;
const VIDRO = 6;
const TIJOLO = 7;

/** Regras na ordem de precedência: a primeira que casa com o nome do elemento vence. */
const REGRAS: ReadonlyArray<readonly [readonly string[], number]> = [
  [['parede', 'wall'], REBOCO],
  [['telha', 'roof'], TELHA],
  [['piso', 'floor', 'laje', 'slab'], PISO],
  [['porta', 'door'], MADEIRA],
  [['janela', 'window', 'vidro', 'glass'], VIDRO],
  [['chaminé', 'chimney'], TIJOLO],
  [['metal', 'esquadria metálica'], METAL],
];

/** Minúsculas, sem espaço nas pontas e sem acento (`Chaminé` vira `chamine`). */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

const TABELA: ReadonlyMap<string, number> = new Map(
  REGRAS.flatMap(([nomes, tipo]) => nomes.map((nome) => [normalizar(nome), tipo] as const)),
);

/**
 * Tipo procedural do elemento de origem. `kind` é o nome do elemento ou a categoria da malha (`wall`, `roof`, `floor`,
 * `slab`, `door`, `window`, ...). Desconhecido, ausente ou vazio cai em liso (0), com escala 1.0.
 */
export function tipoProceduralDoElemento(kind: string | undefined): TipoProcedural {
  const tipo = kind === undefined ? undefined : TABELA.get(normalizar(kind));
  return { tipo: tipo ?? LISO, escala: 1.0 };
}
