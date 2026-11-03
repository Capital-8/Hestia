import type { Familia, Valor } from '@hestia/model';
import type { EntradaResolucao, ErroResolucao, PecaResolvida, ResolucaoFamilia } from './pecas.ts';

/*
 * Módulos aninhados: família dentro de família (guarda-roupa de módulos, cozinha). FICHA E2-aninhados: implementar
 * `resolverAninhados`. Testes em `aninhados.test.ts`. É geometria que o Rust vai espelhar: rotação só em múltiplos de 90°,
 * conta exata em caixas e polígonos. Chamada por `resolverFamilia` (em `resolver.ts`) quando `familia.aninhados` não é vazio.
 */

export interface ContextoAninhados {
  /** Família que contém os aninhados. */
  familia: Familia;
  /** Env já resolvido da família (mm): é nele que as fórmulas dos aninhados são avaliadas. */
  env: Readonly<Record<string, Valor>>;
  /** Entrada da resolução da família de fora (traz `biblioteca` e `profundidade`). */
  entrada: EntradaResolucao;
  /** Resolve uma família (é `resolverFamilia`; vem por parâmetro para não haver import circular). */
  resolver: (f: Familia, e: EntradaResolucao) => ResolucaoFamilia;
}

/**
 * Peças de todos os aninhados da família, já no sistema da família de fora (m). Para cada `Aninhado` `a`, na ordem:
 *
 *  1. `quando` (se houver) avaliada em `env`; falsa → pula; erro de fórmula → erro e pula. `repetir` (se houver) dá `n`
 *     (arredondado para baixo, limitado a 0..LIMITES.repeticao); com `repetir`, as fórmulas de `a` enxergam `i` e `n`.
 *  2. Profundidade: `p = entrada.profundidade ?? 0`; se `p >= LIMITE_ANINHAMENTO` → erro "aninhamento além do limite (4)" e pula.
 *  3. A família filha vem de `entrada.biblioteca?.(a.familiaId)`; ausente → erro `família "X" não encontrada`; se for a própria
 *     família (mesmo id) → erro "família aninha a si mesma".
 *  4. `a.valores`: cada fórmula é avaliada em `env` (números arredondados a 3 casas, em mm) e vira o `valores` da resolução da filha;
 *     `a.tipoId` vira o `tipoId` dela. A filha é resolvida com `profundidade: p + 1` e a mesma `biblioteca`.
 *  5. `a.origem` (3 fórmulas, mm) e `a.rotacao` (graus, padrão 0; é reduzida a 0..359; se não for múltiplo de 90 → erro
 *     "rotação precisa ser múltiplo de 90°" e pula).
 *  6. Cada peça da filha é girada θ (anti-horário, em torno de Z passando pela origem LOCAL da filha) e depois transladada
 *     pela origem do aninhado (mm → m, arredondando a 1 µm = 6 casas): ponto (x, y) → (x cosθ − y senθ, x senθ + y cosθ).
 *     - caixa: `origem` passa a ser o canto mínimo da caixa girada e `extensao` troca X↔Y quando θ é 90 ou 270; z não muda;
 *     - `eixo`: x↔y quando θ é 90 ou 270 (z fica); em 0 e 180 não muda;
 *     - `tamanho`: com `eixo` z e θ = 90 ou 270 vira `[b, a]`; nos demais casos não muda; `espessura` nunca muda;
 *     - `contorno`: refeito de modo que os vértices, vistos no plano da peça no MUNDO, sejam os mesmos que os da peça original
 *       girada e transladada, com `origem` no canto mínimo e o plano na convenção de `pecas.ts` (eixo x: (u,v) ↔ (y,z); eixo y:
 *       (u,v) ↔ (x,z); eixo z: (u,v) ↔ (x,y)); depois reorientado anti-horário (`orientarAntiHorario`).
 *  7. Campos copiados da filha: papel, vazio, material, fita, veio, grupo, indice. Identidade: `id = "<a.id>/<peca.id>"` (com
 *     `repetir`: `"<a.id>[<i>]/<peca.id>"`), `nome = "<a.nome>: <peca.nome>"` (com `repetir`: `"<a.nome> <i>: <peca.nome>"`),
 *     `deAninhado = a.id`.
 *  8. Erros da filha entram em `erros` com `onde` prefixado por `aninhado:<a.id>/` (com `repetir`: `aninhado:<a.id>[<i>]/`).
 *
 * Nunca lança. Não altera `ctx`.
 */
export function resolverAninhados(ctx: ContextoAninhados): { pecas: PecaResolvida[]; erros: ErroResolucao[] } {
  void ctx;
  throw new Error('não implementado: ficha E2-aninhados');
}
