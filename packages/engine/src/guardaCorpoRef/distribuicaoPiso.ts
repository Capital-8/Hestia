/** Piso do degrau na referência TS da distribuição do guarda-corpo (mesmas contas do Rust): separado para manter os arquivos pequenos. */
import type { DegrauRef, PadraoRef } from './distribuicao.ts';

export const EPS = 1e-9;

/**
 * Referência do degrau: `[s da frente do bocel acabado, pisada útil]` (espelha `piso_do_degrau` do Rust). A frente do bocel recua `bocel` da face do
 * espelho, contra o sentido da pisada; o fundo útil é a face do espelho seguinte menos o bocel dele. Sem acabamento: `[s0, prof]`.
 */
export function pisoDoDegrau(dg: DegrauRef): [number, number] {
  const sg = dg.prof < 0 ? -1 : 1;
  const bocel = dg.bocel ?? 0;
  return [dg.s0 - sg * bocel, dg.prof + sg * (bocel - (dg.bocelSeguinte ?? 0))];
}

/** Empurra para dentro do piso um montante que cairia a menos de meia seção da quina ou do espelho (espelha `empurrar_para_o_piso` do Rust). */
export function empurrarParaOPiso(degraus: DegrauRef[], s: number, meia: number): number {
  for (const dg of degraus) {
    const [bocel, pisada] = pisoDoDegrau(dg);
    const sg = pisada < 0 ? -1 : 1;
    const p = Math.abs(pisada);
    const off = (s - bocel) * sg;
    if (off < -EPS || off >= p - EPS) continue;
    const novo = p < 2 * meia ? p / 2 : Math.min(Math.max(off, meia), p - meia);
    return bocel + sg * novo;
  }
  return s;
}

/** Distâncias do bocel, para a frente, dos centros dos montantes de um degrau de pisada `p` (espelha `deslocamentos_no_piso`). */
export function deslocamentosNoPiso(pd: PadraoRef['porDegrau'], p: number): number[] {
  const q = Math.max(pd.quantidade, 1);
  if (pd.centro) return Array.from({ length: q }, (_, j) => ((j + 0.5) * p) / q);
  const d = Math.max(pd.distQuina, 0);
  if (q === 1) return [d];
  const passo = (p - 2 * d) / (q - 1);
  return Array.from({ length: q }, (_, j) => d + j * passo);
}
