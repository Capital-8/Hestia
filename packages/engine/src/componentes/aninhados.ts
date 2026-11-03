import { LIMITES, tentar, type Aninhado, type Env, type Familia, type Valor } from '@hestia/model';
import { girarPeca } from './aninhadosGeometria.ts';
import { LIMITE_ANINHAMENTO, type EntradaResolucao, type ErroResolucao, type PecaResolvida, type ResolucaoFamilia } from './pecas.ts';

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
  const pecas: PecaResolvida[] = [];
  const erros: ErroResolucao[] = [];
  const profundidade = ctx.entrada.profundidade ?? 0;
  for (const a of ctx.familia.aninhados) {
    try {
      resolverUm(ctx, a, profundidade, pecas, erros);
    } catch (e) {
      erros.push({ onde: `aninhado:${a.id}`, mensagem: `aninhado malformado: ${(e as Error).message}` });
    }
  }
  return { pecas, erros };
}

/** mm arredondado a 1 µm (3 casas), como em `resolver.ts`. */
const mm3 = (v: number): number => Math.round(v * 1000) / 1000;
/** mm → m arredondado a 1 µm (6 casas). */
const metros = (v: number): number => Math.round(v * 1000) / 1e6;
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

type Erros = ErroResolucao[];

/** Número (mm, 3 casas) ou `null` com erro anotado. */
function numero(src: string, env: Env, onde: string, erros: Erros): number | null {
  const r = tentar(src, env);
  if (!r.ok) { erros.push({ onde, mensagem: r.erro.message }); return null; }
  if (typeof r.valor !== 'number' || !Number.isFinite(r.valor)) { erros.push({ onde, mensagem: 'a fórmula não resulta em número' }); return null; }
  return mm3(r.valor);
}

/** `a.valores` avaliados no env do pai (mm); `null` se alguma fórmula falhar. */
function avaliarValores(a: Aninhado, env: Env, erros: Erros, prefixo: string): Record<string, Valor> | null {
  const valores: Record<string, Valor> = {};
  for (const [chave, formula] of Object.entries(a.valores)) {
    const r = tentar(formula, env);
    if (!r.ok) { erros.push({ onde: `aninhado:${prefixo}.valores.${chave}`, mensagem: r.erro.message }); return null; }
    valores[chave] = typeof r.valor === 'number' ? mm3(r.valor) : r.valor;
  }
  return valores;
}

/** `a.origem` em mm; `null` se alguma coordenada falhar. */
function avaliarOrigem(a: Aninhado, env: Env, erros: Erros, prefixo: string): [number, number, number] | null {
  const o = a.origem.map((s, k) => numero(s, env, `aninhado:${prefixo}.origem[${k}]`, erros));
  if (o.includes(null)) return null;
  return o as [number, number, number];
}

/** `a.rotacao` normalizada em 0, 90, 180 ou 270; `null` se não for número ou não for múltiplo de 90°. */
function avaliarRotacao(a: Aninhado, env: Env, erros: Erros, prefixo: string): number | null {
  if (a.rotacao === undefined) return 0;
  const r = tentar(a.rotacao, env);
  if (!r.ok) { erros.push({ onde: `aninhado:${prefixo}.rotacao`, mensagem: r.erro.message }); return null; }
  if (typeof r.valor !== 'number' || !Number.isFinite(r.valor)) { erros.push({ onde: `aninhado:${prefixo}.rotacao`, mensagem: 'a fórmula não resulta em número' }); return null; }
  const bruto = ((r.valor % 360) + 360) % 360;
  const quartos = bruto / 90;
  if (Math.abs(quartos - Math.round(quartos)) > 1e-9) {
    erros.push({ onde: `aninhado:${prefixo}.rotacao`, mensagem: 'rotação precisa ser múltiplo de 90°' });
    return null;
  }
  return (((Math.round(quartos) * 90) % 360) + 360) % 360;
}

function resolverUm(ctx: ContextoAninhados, a: Aninhado, profundidade: number, pecas: PecaResolvida[], erros: Erros): void {
  const onde = `aninhado:${a.id}`;
  if (a.quando !== undefined) {
    const q = tentar(a.quando, ctx.env);
    if (!q.ok) { erros.push({ onde: `${onde}.quando`, mensagem: q.erro.message }); return; }
    if (!(typeof q.valor === 'string' ? q.valor !== '' : Boolean(q.valor))) return;
  }
  let n = 1;
  if (a.repetir !== undefined) {
    const r = numero(a.repetir, ctx.env, `${onde}.repetir`, erros);
    if (r === null) return;
    n = Math.max(0, Math.min(LIMITES.repeticao, Math.floor(r)));
  }
  if (profundidade >= LIMITE_ANINHAMENTO) {
    erros.push({ onde, mensagem: `aninhamento além do limite (${LIMITE_ANINHAMENTO})` });
    return;
  }
  const filha = ctx.entrada.biblioteca?.(a.familiaId);
  if (filha === undefined) { erros.push({ onde, mensagem: `família "${a.familiaId}" não encontrada` }); return; }
  if (filha.id === ctx.familia.id) { erros.push({ onde, mensagem: 'família aninha a si mesma' }); return; }
  for (let i = 1; i <= n; i++) {
    const prefixo = a.repetir !== undefined ? `${a.id}[${i}]` : a.id;
    const env: Env = a.repetir !== undefined ? { ...ctx.env, i, n } : ctx.env;
    const valores = avaliarValores(a, env, erros, prefixo);
    if (valores === null) continue;
    const origem = avaliarOrigem(a, env, erros, prefixo);
    if (origem === null) continue;
    const graus = avaliarRotacao(a, env, erros, prefixo);
    if (graus === null) continue;
    const resolucao = ctx.resolver(filha, {
      valores,
      ...(a.tipoId !== undefined ? { tipoId: a.tipoId } : {}),
      biblioteca: ctx.entrada.biblioteca,
      profundidade: profundidade + 1,
    });
    for (const erro of resolucao.erros) erros.push({ onde: `aninhado:${prefixo}/${erro.onde}`, mensagem: erro.mensagem });
    const dx = metros(origem[0]);
    const dy = metros(origem[1]);
    const dz = metros(origem[2]);
    for (const peca of resolucao.pecas) {
      const girada = girarPeca(peca, graus, dx, dy);
      pecas.push({
        ...girada,
        id: `${prefixo}/${peca.id}`,
        nome: a.repetir !== undefined ? `${a.nome} ${i}: ${peca.nome}` : `${a.nome}: ${peca.nome}`,
        origem: [girada.origem[0], girada.origem[1], round6(girada.origem[2] + dz)],
        deAninhado: a.id,
      });
    }
  }
}
