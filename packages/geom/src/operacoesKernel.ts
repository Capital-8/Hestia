/**
 * Seam do kernel experimental: as operações quentes do `geom` passam por aqui.
 *
 * Regra de ouro deste arquivo: **com o kernel desligado, o resultado é o de sempre**. Os atalhos
 * (vazio, nada a subtrair) são copiados do `boolean.ts` — inclusive o de `difference`, que devolve o
 * próprio minuendo — e a chamada final é literalmente a função TypeScript intocada.
 *
 * Com o kernel ligado, a referência de semântica é o caminho Clipper (ver o cabeçalho de
 * `crates/geom-wasm/src/ops.rs`): quantização a 1 µm e preenchimento non-zero. Isso é o
 * comportamento documentado como o "plano B confiável" de `boolean.ts`.
 *
 * Disjuntor: se uma chamada do kernel lançar, o kernel é desativado para o resto da sessão e a
 * mesma operação é refeita em TypeScript. Um recurso experimental nunca pode derrubar a sessão.
 */
import * as ts from './boolean.ts';
import { desativarKernel, ErroNaoImplementado, implKernel, registrarFalhaKernel, type ImplKernel } from './kernel/contrato.ts';
import type { MultiPolygon } from './polygon.ts';

/** Nome de cada operação, para a medição e para o diagnóstico. */
export type NomeOperacao = 'union' | 'difference' | 'intersection' | 'unionClipper' | 'differenceClipper' | 'offsetMulti';

interface Contador {
  chamadas: number;
  ms: number;
}

/**
 * Medição do seam, independente de `booleanStats` (que só enxerga o caminho TypeScript).
 * Cronometra o custo total de cada operação — incluindo, com kernel ligado, a travessia para o
 * wasm. É o número que a comparação A/B usa.
 */
export interface MedicaoOperacoes {
  chamadas: number;
  ms: number;
  porOp: Record<NomeOperacao, Contador>;
  /** Quem atendeu as chamadas: o kernel ou o TypeScript. */
  origem: 'ts' | 'rust';
}

const vazio = (): MedicaoOperacoes => ({
  chamadas: 0,
  ms: 0,
  porOp: {
    union: { chamadas: 0, ms: 0 },
    difference: { chamadas: 0, ms: 0 },
    intersection: { chamadas: 0, ms: 0 },
    unionClipper: { chamadas: 0, ms: 0 },
    differenceClipper: { chamadas: 0, ms: 0 },
    offsetMulti: { chamadas: 0, ms: 0 },
  },
  origem: 'ts',
});

let medicao = vazio();

/** Cópia da medição acumulada desde o último `resetarMedicaoOperacoes`. */
export function medicaoOperacoes(): MedicaoOperacoes {
  return {
    ...medicao,
    porOp: {
      union: { ...medicao.porOp.union },
      difference: { ...medicao.porOp.difference },
      intersection: { ...medicao.porOp.intersection },
      unionClipper: { ...medicao.porOp.unionClipper },
      differenceClipper: { ...medicao.porOp.differenceClipper },
      offsetMulti: { ...medicao.porOp.offsetMulti },
    },
  };
}

export function resetarMedicaoOperacoes(): void {
  medicao = vazio();
}

/** Cronometra uma operação; o custo de dois `performance.now()` é desprezível perto da operação. */
function medir<T>(nome: NomeOperacao, origem: 'ts' | 'rust', fn: () => T): T {
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    const dt = performance.now() - t0;
    medicao.chamadas++;
    medicao.ms += dt;
    medicao.origem = origem === 'rust' ? 'rust' : medicao.origem;
    const c = medicao.porOp[nome];
    c.chamadas++;
    c.ms += dt;
  }
}

/**
 * Executa no kernel, com disjuntor. Se o kernel lançar, desativa e refaz em TypeScript.
 * `aoFalhar` refaz a operação pelo caminho de sempre.
 */
function noKernel<T>(nome: NomeOperacao, op: (k: ImplKernel) => T, aoFalhar: () => T): T {
  const k = implKernel();
  if (k === null) return medir(nome, 'ts', aoFalhar);
  return medir(nome, 'rust', () => {
    try {
      return op(k);
    } catch (e) {
      // Operação que o kernel ainda não implementa (hoje: offset): refaz em TypeScript e MANTÉM o
      // kernel ativo — não é falha, é cobertura parcial declarada.
      if (e instanceof ErroNaoImplementado) return aoFalhar();
      registrarFalhaKernel();
      desativarKernel(`falha em ${nome}: ${e instanceof Error ? e.message : String(e)}`);
      return aoFalhar();
    }
  });
}

export function union(...ms: MultiPolygon[]): MultiPolygon {
  const parts = ms.filter((m) => m.length > 0);
  if (parts.length === 0) return [];
  return noKernel('union', (k) => k.uniao(parts), () => ts.union(...parts));
}

export function difference(a: MultiPolygon, ...bs: MultiPolygon[]): MultiPolygon {
  if (a.length === 0) return [];
  const subs = bs.filter((m) => m.length > 0);
  // Mesma referência devolvida hoje por `boolean.ts` quando não há subtraendo.
  if (subs.length === 0) return a;
  return noKernel('difference', (k) => k.diferenca([a, ...subs]), () => ts.difference(a, ...subs));
}

export function intersection(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  return noKernel('intersection', (k) => k.interseccao(a, b), () => ts.intersection(a, b));
}

export function unionClipper(...ms: MultiPolygon[]): MultiPolygon {
  const parts = ms.filter((m) => m.length > 0);
  if (parts.length === 0) return [];
  return noKernel('unionClipper', (k) => k.uniao(parts), () => ts.unionClipper(...parts));
}

export function differenceClipper(a: MultiPolygon, ...bs: MultiPolygon[]): MultiPolygon {
  if (a.length === 0) return [];
  const subs = bs.filter((m) => m.length > 0);
  if (subs.length === 0) return a;
  return noKernel('differenceClipper', (k) => k.diferenca([a, ...subs]), () => ts.differenceClipper(a, ...subs));
}

export function offsetMulti(m: MultiPolygon, delta: number): MultiPolygon {
  if (m.length === 0) return [];
  return noKernel('offsetMulti', (k) => k.offset(m, delta), () => ts.offsetMulti(m, delta));
}
