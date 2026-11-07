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
 * Em produção o kernel é exigido (`exigirKernel`, decisão do dono de 2026-11-06): o TypeScript nunca produz resultado; falha do Rust
 * é `ErroKernelV1` e wasm ainda carregando é `KernelV1Pendente`. Fora disso (testes, desenvolvimento) vale o disjuntor: se uma chamada
 * do kernel lançar, ele é desativado para o resto da sessão e a operação é refeita em TypeScript.
 */
import * as ts from './boolean.ts';
import {
  desativarKernel,
  ErroKernelV1,
  ErroNaoImplementado,
  estadoKernel,
  implKernel,
  KernelV1Pendente,
  kernelExigido,
  registrarFalhaKernel,
  type ImplKernel,
} from './kernel/contrato.ts';
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
 * Executa no kernel. Kernel exigido (produção): nunca devolve resultado do TypeScript. Sem o wasm: `KernelV1Pendente` enquanto carrega
 * e `ErroKernelV1` se o carregamento falhou ou o kernel foi desativado. Falha do Rust (ou entrada recusada): `ErroKernelV1`.
 * Kernel não exigido (testes e desenvolvimento): o comportamento de sempre, com disjuntor e refazendo em TypeScript (`aoFalhar`).
 */
function noKernel<T>(nome: NomeOperacao, op: (k: ImplKernel) => T, aoFalhar: () => T): T {
  const k = implKernel();
  const exigido = kernelExigido();
  if (k === null) {
    if (!exigido) return medir(nome, 'ts', aoFalhar);
    const motivo = estadoKernel().motivo;
    if (motivo === null) throw new KernelV1Pendente(nome);
    throw new ErroKernelV1(nome, `kernel indisponível: ${motivo}`);
  }
  return medir(nome, 'rust', () => {
    try {
      return op(k);
    } catch (e) {
      const texto = e instanceof Error ? e.message : String(e);
      if (exigido) {
        // Entrada recusada pelo Rust vale só para esta operação; falha real desativa o kernel (as seguintes recebem o motivo).
        if (!(e instanceof ErroNaoImplementado)) {
          registrarFalhaKernel();
          desativarKernel(`falha em ${nome}: ${texto}`);
        }
        throw new ErroKernelV1(nome, texto);
      }
      if (e instanceof ErroNaoImplementado) return aoFalhar();
      registrarFalhaKernel();
      desativarKernel(`falha em ${nome}: ${texto}`);
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
  return noKernel('difference', (k) => k.diferenca([a, ...subs], true), () => ts.difference(a, ...subs));
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
