// Comparação da sub-etapa A3a (decisão 0047 §7): saída do Rust (`aberturas_geom`) x extração do motor TypeScript
// (`referenciaA3a`: `openingGeometry` e `openingRect`), abertura a abertura. Identidade (ids, enums, flips) por igualdade
// exata; todo número (coordenadas, vetores, medidas) a 1 µm; área do furo a 1e-6 m². A tolerância NÃO se afrouxa para passar.
// O maior desvio medido é reportado (esperado ~1e-15: as mesmas contas na mesma ordem).
import type { MultiPolygon } from '@hestia/geom';
import type { AberturaA3 } from '../packages/engine/src/kernelA3.ts';

export const TOLERANCIA_COORDENADA_A3 = 1e-6;
export const TOLERANCIA_AREA_A3 = 1e-6;

const areaAnel = (r: Array<{ x: number; y: number }>): number => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};
const areaDoFuro = (m: MultiPolygon): number => m.reduce((t, p) => t + Math.abs(areaAnel(p[0] ?? [])), 0);

export interface ComparacaoA3 {
  divergencias: string[];
  desvioMaximo: number;
  /** Aberturas comparadas e quantas estão em parede curva (`cutHalf` definido). */
  aberturas: number;
  arcos: number;
}

const EXATOS = ['id', 'parede', 'tipo', 'janela', 'folhas', 'plano', 'flipMao', 'flipFrente'] as const;
const NUMEROS = ['largura', 'altura', 'vaoLargura', 'vaoAltura', 'peitoril', 'espessura', 'sHi', 'sLo', 'deslocamento'] as const;
const PONTOS = ['centro', 'u', 'n'] as const;

/** Compara a saída do Rust (`rust`) com a referência (`ref`), abertura a abertura (ordem incluída). */
export function compararA3(ref: AberturaA3[], rust: AberturaA3[], maxDivergencias = 20): ComparacaoA3 {
  const divergencias: string[] = [];
  let desvioMaximo = 0;
  let arcos = 0;
  if (ref.length !== rust.length) {
    return { divergencias: [`${rust.length} aberturas (Rust) x ${ref.length} (TS)`], desvioMaximo, aberturas: ref.length, arcos };
  }
  const nota = (d: number): void => {
    desvioMaximo = Math.max(desvioMaximo, d);
  };
  for (let i = 0; i < ref.length && divergencias.length < maxDivergencias; i++) {
    const a = ref[i]!;
    const b = rust[i]!;
    const rotulo = `abertura ${i} (id ${a.id}, parede ${a.parede})`;
    const exato = EXATOS.find((c) => a[c] !== b[c]);
    if (exato) {
      divergencias.push(`${rotulo}: ${exato} ${String(b[exato])} (Rust) x ${String(a[exato])} (TS)`);
      continue;
    }
    let erro: string | null = null;
    for (const c of NUMEROS) {
      const d = Math.abs(a[c] - b[c]);
      if (!(d <= TOLERANCIA_COORDENADA_A3)) erro ??= `${c} ${b[c]} (Rust) x ${a[c]} (TS)`;
      else nota(d);
    }
    for (const c of PONTOS) {
      for (const k of ['x', 'y'] as const) {
        const d = Math.abs(a[c][k] - b[c][k]);
        if (!(d <= TOLERANCIA_COORDENADA_A3)) erro ??= `${c}.${k} ${b[c][k]} (Rust) x ${a[c][k]} (TS)`;
        else nota(d);
      }
    }
    // `cutHalf`: ausente nos dois (parede reta) ou presente nos dois.
    if ((a.cutHalf === undefined) !== (b.cutHalf === undefined)) erro ??= `cutHalf ${String(b.cutHalf)} (Rust) x ${String(a.cutHalf)} (TS)`;
    else if (a.cutHalf !== undefined && b.cutHalf !== undefined) {
      arcos++;
      const d = Math.abs(a.cutHalf - b.cutHalf);
      if (!(d <= TOLERANCIA_COORDENADA_A3)) erro ??= `cutHalf ${b.cutHalf} (Rust) x ${a.cutHalf} (TS)`;
      else nota(d);
    }
    // `openingRect`: um polígono de um anel de 4 vértices, na mesma ordem.
    const ra = a.retangulo[0]?.[0];
    const rb = b.retangulo[0]?.[0];
    if (a.retangulo.length !== 1 || b.retangulo.length !== 1 || a.retangulo[0]!.length !== 1 || b.retangulo[0]!.length !== 1 || !ra || !rb || ra.length !== rb.length) {
      erro ??= 'retângulo com topologia diferente';
    } else {
      ra.forEach((q, k) => {
        const d = Math.max(Math.abs(q.x - rb[k]!.x), Math.abs(q.y - rb[k]!.y));
        if (!(d <= TOLERANCIA_COORDENADA_A3)) erro ??= `vértice ${k} do retângulo (${rb[k]!.x}, ${rb[k]!.y}) (Rust) x (${q.x}, ${q.y}) (TS)`;
        else nota(d);
      });
      const da = Math.abs(areaDoFuro(a.retangulo) - areaDoFuro(b.retangulo));
      if (!(da <= TOLERANCIA_AREA_A3)) erro ??= `área do furo |d| = ${da}`;
    }
    if (erro) divergencias.push(`${rotulo}: ${erro}`);
  }
  return { divergencias, desvioMaximo, aberturas: ref.length, arcos };
}
