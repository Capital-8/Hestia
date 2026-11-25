import { type Component, type Familia, type Id, type Project } from '@hestia/model';
import { ligacaoNoMundo } from './ligacoesEncaixe.ts';
import { resolverComponente } from './instancia.ts';
import { resolverFamilia } from './resolver.ts';
import type { DeclividadeViabilidade, PrumadaViabilidade, TrechoViabilidade } from './viabilidadeNo.ts';
import type { Ctx, EstadoTubo, Tubo, V3 } from './trocaBitolaTipos.ts';

/* Geometria e leitura de tubos da troca de bitola (ficha B3): funções puras sobre o projeto, em metros. */

/** Horizontal menor que isto (m) = trecho vertical (prumada); a mesma regra da ferramenta Tubo. */
const HORIZONTAL_NULA = 0.001;

export const subtrai = (u: readonly number[], v: readonly number[]): V3 => [(u[0] ?? 0) - (v[0] ?? 0), (u[1] ?? 0) - (v[1] ?? 0), (u[2] ?? 0) - (v[2] ?? 0)];
export const soma = (u: readonly number[], v: readonly number[], k = 1): V3 => [(u[0] ?? 0) + k * (v[0] ?? 0), (u[1] ?? 0) + k * (v[1] ?? 0), (u[2] ?? 0) + k * (v[2] ?? 0)];
export const norma = (u: readonly number[]): number => Math.hypot(u[0] ?? 0, u[1] ?? 0, u[2] ?? 0);
export const nega = (u: readonly number[]): V3 => [-(u[0] ?? 0), -(u[1] ?? 0), -(u[2] ?? 0)];
export const dot = (u: readonly number[], v: readonly number[]): number => (u[0] ?? 0) * (v[0] ?? 0) + (u[1] ?? 0) * (v[1] ?? 0) + (u[2] ?? 0) * (v[2] ?? 0);

/** Vetor unitário; o vetor nulo vira `[0, 0, 0]`. */
export function unitario(u: readonly number[]): V3 {
  const n = norma(u);
  return n < 1e-12 ? [0, 0, 0] : [(u[0] ?? 0) / n, (u[1] ?? 0) / n, (u[2] ?? 0) / n];
}

/** Valor numérico de `DN` da instância (valor próprio, senão o resolvido); `null` se a família não tem DN numérico. */
export function dnDaInstancia(p: Project, c: Component): number | null {
  const proprio = c.values?.DN;
  if (typeof proprio === 'number') return proprio;
  const r = resolverComponente(p, c).env.DN;
  return typeof r === 'number' ? r : null;
}

/** Tubo da instância `c` no mundo; `null` se a categoria não é tubulação ou a família não tem duas ligações. */
export function lerTubo(p: Project, c: Component): Tubo | null {
  const familia = p.componentFamilies?.[c.familyId];
  if (!familia || familia.categoria !== 'tubulacao') return null;
  const ligs = [...(resolverComponente(p, c).ligacoes ?? [])].sort((x, y) => x.posicao[2] - y.posicao[2]);
  const i = ligs[0];
  const f = ligs[ligs.length - 1];
  if (ligs.length < 2 || !i || !f) return null;
  return { comp: c, familia, a: ligacaoNoMundo(i, c).posicaoMundo, b: ligacaoNoMundo(f, c).posicaoMundo, idA: i.id, idB: f.id, dn: dnDaInstancia(p, c) ?? 0 };
}

/** Qual ponta ('a' início, 'b' fim) do tubo é a ligação `ligacaoId`. */
export const pontaDe = (t: Tubo, ligacaoId: string): 'a' | 'b' => (ligacaoId === t.idA ? 'a' : 'b');

const chaveErro = (e: { onde: string; mensagem: string }): string => `${e.onde}|${e.mensagem}`;

/**
 * A família resolve o `tipoId` com estes `valores` sem erro NOVO em relação ao que a instância já tinha (valor fora das opções de
 * `DN`, `busca` sem a bitola, faixa). É o teste de "a família TEM tipo para este DN".
 */
export function semErrosNovos(familia: Familia, tipoId: string | null, antes: Record<string, number | string | boolean> | undefined, depois: Record<string, number | string | boolean>): boolean {
  const base = new Set(resolverFamilia(familia, { tipoId: tipoId ?? undefined, valores: { L: 1000, ...(antes ?? {}) } }).erros.map(chaveErro));
  return resolverFamilia(familia, { tipoId: tipoId ?? undefined, valores: { L: 1000, ...depois } }).erros.every((e) => base.has(chaveErro(e)));
}

/** Tipo da família cujo `DN` é `dn`, ou `null`. */
export function tipoComDn(familia: Familia, dn: number): string | null {
  return familia.tipos.find((t) => t.valores.DN === dn)?.id ?? null;
}

/** Estado de trabalho do tubo (criado na primeira consulta, com os centros nas pontas atuais e recuo 0). */
export function estadoDe(ctx: Ctx, tubo: Tubo): EstadoTubo {
  let e = ctx.geo.get(tubo.comp.id);
  if (!e) {
    e = { tubo, cen: { a: tubo.a, b: tubo.b }, rec: { a: 0, b: 0 }, tocado: false };
    ctx.geo.set(tubo.comp.id, e);
  }
  return e;
}

/** A ponta `ponta` do tubo passa a terminar `recuo` (m) antes do centro `centro` do nó, sobre o eixo do tubo. */
export function posicionarPonta(ctx: Ctx, tubo: Tubo, ponta: 'a' | 'b', centro: V3, recuo: number): void {
  const e = estadoDe(ctx, tubo);
  e.cen[ponta] = centro;
  e.rec[ponta] = Math.max(0, recuo);
  e.tocado = true;
}

/** Pontas finais do tubo (m): cada centro recuado ao longo do eixo; `comprimento` é o do trecho entre os centros. */
export function extremosFinais(e: EstadoTubo): { a: V3; b: V3; entreCentros: number; entreFinais: number } {
  const v = subtrai(e.cen.b, e.cen.a);
  const entreCentros = norma(v);
  const u = unitario(v);
  const a = soma(e.cen.a, u, e.rec.a);
  const b = soma(e.cen.b, u, -e.rec.b);
  return { a, b, entreCentros, entreFinais: dot(subtrai(b, a), u) };
}

/** Diâmetro externo (mm) da peça do tubo: parâmetro `De` da família ou, sem ele, o DN. */
function diametroExterno(familia: Familia, dn: number): number {
  const de = resolverFamilia(familia, { valores: { DN: dn, L: 1000 } }).env.De;
  return typeof de === 'number' && de > 0 ? de : dn;
}

/**
 * Entradas de `listarProblemasDeViabilidade` dos tubos tocados (mm): trecho vertical com recuo vira prumada, os demais trecho; o
 * `indice` de cada entrada é a posição em `ids` (o chamador volta daí ao tubo). A declividade é conferida só no tubo trocado.
 */
export function entradasDeViabilidade(ctx: Ctx): { trechos: TrechoViabilidade[]; prumadas: PrumadaViabilidade[]; declividades: DeclividadeViabilidade[]; ids: Id[] } {
  const trechos: TrechoViabilidade[] = [];
  const prumadas: PrumadaViabilidade[] = [];
  const declividades: DeclividadeViabilidade[] = [];
  const ids: Id[] = [];
  for (const e of ctx.geo.values()) {
    if (!e.tocado) continue;
    const indice = ids.push(e.tubo.comp.id) - 1;
    const v = subtrai(e.cen.b, e.cen.a);
    const horizontal = Math.hypot(v[0], v[1]);
    const dn = e.tubo.comp.id === ctx.tubo.comp.id ? ctx.novoDn : e.tubo.dn;
    if (e.rec.a + e.rec.b > 1e-9 && horizontal < HORIZONTAL_NULA && Math.abs(v[2]) > 1e-9) {
      const baixoEhA = e.cen.a[2] <= e.cen.b[2];
      prumadas.push({ indice, desvioVertical: Math.abs(v[2]) * 1000, diametroExterno: diametroExterno(e.tubo.familia, dn), recuoBaixo: (baixoEhA ? e.rec.a : e.rec.b) * 1000, recuoCima: (baixoEhA ? e.rec.b : e.rec.a) * 1000 });
    } else {
      trechos.push({ indice, comprimento: norma(v) * 1000, recuoInicio: e.rec.a * 1000, recuoFim: e.rec.b * 1000 });
    }
    if (e.tubo.comp.id === ctx.tubo.comp.id && horizontal >= HORIZONTAL_NULA && Math.abs(v[2]) > 1e-9) {
      const lig = resolverComponente(ctx.p, e.tubo.comp).ligacoes?.[0];
      declividades.push({ indice, percentual: (Math.abs(v[2]) / horizontal) * 100, dominio: (lig?.dominio ?? 'esgoto') as DeclividadeViabilidade['dominio'], dn });
    }
  }
  return { trechos, prumadas, declividades, ids };
}
