/**
 * Medição das fases de abrir um corte/elevação (D5). Só existe com `?debug=1`; sem ele `vperf` é `undefined` e cada
 * `vperf?.mark` custa uma comparação. Os instantes são em ms de época (`timeOrigin + now`), comparáveis com os do worker.
 */
export interface VPerf {
  marks: Array<[string, number]>;
  mark(nome: string, t?: number): void;
  reset(): void;
}

const ativo = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export const vperf: VPerf | undefined = ativo
  ? {
      marks: [],
      mark(nome, t) {
        this.marks.push([nome, t ?? performance.timeOrigin + performance.now()]);
      },
      reset() {
        this.marks.length = 0;
      },
    }
  : undefined;

if (vperf) (globalThis as { __vperf?: VPerf }).__vperf = vperf;
