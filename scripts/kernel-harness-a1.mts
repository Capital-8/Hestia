// Comparação da sub-etapa A1 (decisão 0047): saída do Rust (`quadros_e_juncoes`) x extração do motor TypeScript.
// Tolerância de 1 µm (1e-6 m) em toda coordenada/medida; topologia (tipos de corte, hospedeiras, parceiros,
// grupos, contagens) por igualdade exata. A tolerância NÃO se afrouxa para passar.
import type { SaidaA1 } from '../packages/engine/src/kernelA1.ts';

export const TOLERANCIA_COORDENADA = 1e-6;

/** Saídas inteiras (topologia): igualdade exata. */
const EXATAS = ['ids', 'estado_pontas', 'parceiros', 'pontas_cab', 'cordas_cab', 'grupos'] as const;
/** Saídas em ponto flutuante: 1 µm; NaN só casa com NaN. */
const FLUTUANTES = ['quadro', 'arco', 'pontas_dados', 'cordas'] as const;

export interface ComparacaoA1 {
  divergencias: string[];
  /** Maior diferença absoluta observada nas saídas em ponto flutuante. */
  desvioMaximo: number;
}

export function compararA1(ref: SaidaA1, rust: Record<string, ArrayLike<number>>): ComparacaoA1 {
  const divergencias: string[] = [];
  let desvioMaximo = 0;
  const idsParede = ref.ids;
  for (const nome of EXATAS) {
    const a = ref[nome];
    const b = rust[nome];
    if (!b) {
      divergencias.push(`${nome}: ausente na saída do Rust`);
      continue;
    }
    if (a.length !== b.length) {
      divergencias.push(`${nome}: ${b.length} valores no Rust x ${a.length} no TS`);
      continue;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        divergencias.push(`${nome}[${i}]${contexto(nome, i, idsParede)}: Rust ${b[i]} x TS ${a[i]}`);
        break;
      }
    }
  }
  for (const nome of FLUTUANTES) {
    const a = ref[nome];
    const b = rust[nome];
    if (!b) {
      divergencias.push(`${nome}: ausente na saída do Rust`);
      continue;
    }
    if (a.length !== b.length) {
      divergencias.push(`${nome}: ${b.length} valores no Rust x ${a.length} no TS`);
      continue;
    }
    for (let i = 0; i < a.length; i++) {
      const x = a[i]!;
      const y = b[i]!;
      if (Number.isNaN(x) && Number.isNaN(y)) continue;
      const d = Math.abs(x - y);
      if (!(d <= TOLERANCIA_COORDENADA)) {
        divergencias.push(`${nome}[${i}]${contexto(nome, i, idsParede)}: Rust ${y} x TS ${x} (|d| = ${d})`);
        break;
      }
      if (d > desvioMaximo) desvioMaximo = d;
    }
  }
  return { divergencias, desvioMaximo };
}

/** Qual parede/extremidade é o índice `i` da saída (ajuda a achar a divergência). */
function contexto(nome: string, i: number, ids: readonly number[]): string {
  const por: Record<string, number> = { quadro: 17, arco: 8, estado_pontas: 4, pontas_cab: 3, cordas_cab: 2, ids: 1, grupos: 1 };
  const passo = por[nome];
  if (!passo) return '';
  const k = Math.floor(i / passo);
  const parede = nome === 'estado_pontas' || nome === 'pontas_cab' ? ids[Math.floor(k / 2)] : ids[k];
  const ponta = nome === 'estado_pontas' || nome === 'pontas_cab' ? (k % 2 === 0 ? ' ponta a' : ' ponta b') : '';
  return parede === undefined ? '' : ` (parede id_num ${parede}${ponta})`;
}
