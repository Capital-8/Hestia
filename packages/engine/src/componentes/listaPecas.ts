import type { Catalogo } from '@hestia/model';
import type { FerragemResolvida, PecaResolvida } from './pecas.ts';

/*
 * Lista de peças de fábrica (ADR 0049 §3.3; método do Promob: lista por módulo com chapa, medidas, veio, fita e usinagem).
 * FICHA E6-lista: implementar as funções abaixo. Testes em `listaPecas.test.ts`. Puras e numéricas. Medidas da lista em MILÍMETROS
 * (como o marceneiro lê), arredondadas a 3 casas; áreas em m2. O texto da família é em mm e as peças resolvidas em metros: converta aqui.
 */

export type VeioNaLista = 'comprimento' | 'largura' | 'livre' | null;
export type LadoFita = 'c1' | 'c2' | 'l1' | 'l2';

export interface LinhaLista {
  /** Nome da primeira peça do grupo e todos os nomes distintos, na ordem em que aparecem. */
  nome: string;
  nomes: string[];
  papel: string;
  /** Quantas peças idênticas o grupo reúne. */
  quantidade: number;
  /** Maior e menor dimensão da chapa (mm); espessura (mm). */
  comprimento: number;
  largura: number;
  espessura: number;
  chapa: string | null;
  material: string | null;
  veio: VeioNaLista;
  /** Fita por lado: c1 e c2 são os lados de COMPRIMENTO, l1 e l2 os de LARGURA (id da fita ou `null`). */
  fita: Record<LadoFita, string | null>;
  /** Usinagens por peça. */
  furos: number;
  rasgos: number;
  recortes: number;
  /** Área de UMA peça (m2), com contorno quando há. */
  area: number;
  /** Ids das peças originais agrupadas (com repetição quando o id repete). */
  ids: string[];
}

/**
 * Agrupa as peças NÃO vazias em linhas. Orientação: seja `[a, b] = tamanho`. Se `a >= b`: comprimento = a (ao longo de u), largura = b; os lados de comprimento
 * são `s` (c1) e `n` (c2) e os de largura `o` (l1) e `l` (l2). Se `a < b`: comprimento = b (ao longo de v), largura = a; c1 = `o`, c2 = `l`, l1 = `s`, l2 = `n`.
 * `fita` vem de `PecaResolvida.fita` (chaves n, s, l, o) reposicionada nesses 4 lados. `veio`: `PecaResolvida.veio` 'a' (ao longo de u) ou 'b' (ao longo
 * de v) vira 'comprimento' ou 'largura' conforme a orientação; 'livre' → 'livre'; `null` → `null`.
 * Grupo = mesma chave de: chapa (ou material), espessura, comprimento, largura, veio, os 4 lados de fita, e a lista de usinagens (tipo, face, u, v, diametro, largura,
 * comprimento, profundidade, na ordem). Peças idênticas viram uma linha com `quantidade` somada. Ordem das linhas: por `chapa ?? material ?? ''`, depois
 * `espessura` decrescente, `comprimento` decrescente, `largura` decrescente e `nome`. Não altera a entrada.
 */
export function listaDePecas(pecas: readonly PecaResolvida[]): LinhaLista[] {
  void pecas;
  throw new Error('não implementado: ficha E6-lista');
}

export interface ResumoLista {
  totalPecas: number;
  /** m2 somados (quantidade × área). */
  areaM2: number;
  /** Por chapa (id ou `null`) e espessura (mm), ordenado por id (nulo por último) e espessura. */
  porChapa: Array<{ chapa: string | null; espessura: number; area: number; pecas: number }>;
  /** Metros de cada fita, ordenado por id: soma de quantidade × comprimento (ou largura) dos lados com fita. */
  fitaMetros: Array<{ fita: string; metros: number }>;
  usinagens: { furos: number; rasgos: number; recortes: number };
}

export function resumirLista(linhas: readonly LinhaLista[]): ResumoLista {
  void linhas;
  throw new Error('não implementado: ficha E6-lista');
}

export interface CustoEstimado {
  chapas: number;
  fitas: number;
  ferragens: number;
  total: number;
}

/**
 * Custo estimado em R$. Chapas: área por chapa × (1 + `perdaChapa`) × `custoM2` do catálogo (chapa sem custo ou fora do catálogo não custa). Fitas: metros × (1 + `perdaFita`) × `custoM`.
 * Ferragens: quantidade × (`custo` da própria ferragem, senão `custo` do catálogo com o mesmo id, senão 0). Padrões: perdaChapa 0.15, perdaFita 0.10.
 * Arredonde cada parcela a 2 casas e some as parcelas arredondadas em `total`.
 */
export function custoEstimado(resumo: ResumoLista, catalogo: Catalogo, ferragens: readonly FerragemResolvida[], perdas: { perdaChapa?: number; perdaFita?: number } = {}): CustoEstimado {
  void resumo;
  void catalogo;
  void ferragens;
  void perdas;
  throw new Error('não implementado: ficha E6-lista');
}

/**
 * CSV da lista para o otimizador de corte e a planilha: separador `;`, decimal com vírgula, quebra de linha `\n`, texto entre aspas duplas quando contém `;`, `"` ou
 * quebra (aspas duplicadas). Cabeçalho (nesta ordem): Qtd;Peça;Papel;Chapa;Material;Comprimento;Largura;Espessura;Veio;Fita C1;Fita C2;Fita L1;Fita L2;Furos;Rasgos;Recortes;Área.
 * Números: medidas em mm com até 3 casas sem zeros à toa ("764", "12,5"), área em m2 com 4 casas ("0,3920"). `null` vira vazio. Uma linha por `LinhaLista`.
 */
export function listaPecasCsv(linhas: readonly LinhaLista[]): string {
  void linhas;
  throw new Error('não implementado: ficha E6-lista');
}

/** Etiqueta de uma linha para impressão: texto de 3 linhas — `"<nome>"`, `"<comprimento> x <largura> x <espessura> mm  |  <chapa ou material>"` e `"Fita: C1 <x> C2 <x> L1 <x> L2 <x>  |  Veio: <x>"` (vazio = "-"); medidas sem zeros à toa. */
export function etiquetaDaLinha(l: LinhaLista): string[] {
  void l;
  throw new Error('não implementado: ficha E6-lista');
}
