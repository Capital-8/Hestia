// Comparação da sub-etapa A2 (decisão 0047): saída do Rust (`itens_pintados`) x extração do motor TypeScript
// (`referenciaA2`), item a item. Identidade (parede, camada, material, ordem) por igualdade exata; área do
// fragmento a 1e-6 m², contagem de peças igual e coordenadas dos anéis a 1 µm depois de normalizar início e
// orientação do anel. A tolerância NÃO se afrouxa para passar.
import { union, type MultiPolygon, type Ring } from '@hestia/geom';
import type { ItemA2 } from '../packages/engine/src/kernelA2.ts';

export const TOLERANCIA_COORDENADA_A2 = 1e-6;
export const TOLERANCIA_AREA_A2 = 1e-6;

const areaAnel = (r: Ring): number => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

/** Área líquida (externo menos furos), como `multiArea`. */
export function areaDaForma(m: MultiPolygon): number {
  let total = 0;
  for (const p of m) p.forEach((r, i) => (total += (i === 0 ? 1 : -1) * Math.abs(areaAnel(r))));
  return total;
}

/**
 * Os dois anéis são o mesmo contorno? Mesma orientação (inverte um se preciso), qualquer ponto de partida,
 * cada coordenada a `tol`. Devolve o maior desvio, ou `null` se não casam.
 */
export function desvioDoAnel(a: Ring, b: Ring, tol: number): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  const n = a.length;
  const bb = Math.sign(areaAnel(a)) === Math.sign(areaAnel(b)) ? b : [...b].reverse();
  let melhor: number | null = null;
  for (let r = 0; r < n; r++) {
    if (Math.abs(a[0]!.x - bb[r]!.x) > tol || Math.abs(a[0]!.y - bb[r]!.y) > tol) continue;
    let d = 0;
    for (let i = 0; i < n && d <= tol; i++) {
      const p = a[i]!;
      const q = bb[(i + r) % n]!;
      d = Math.max(d, Math.abs(p.x - q.x), Math.abs(p.y - q.y));
    }
    if (d <= tol && (melhor === null || d < melhor)) melhor = d;
  }
  return melhor;
}

/** Compara duas formas por topologia e coordenadas (peças em qualquer ordem). `null` = iguais. */
export function compararFormas(a: MultiPolygon, b: MultiPolygon, tol = TOLERANCIA_COORDENADA_A2, tolArea = TOLERANCIA_AREA_A2): { erro: string | null; desvio: number } {
  let desvio = 0;
  const da = Math.abs(areaDaForma(a) - areaDaForma(b));
  if (da > tolArea) return { erro: `área ${areaDaForma(b)} (Rust) x ${areaDaForma(a)} (TS), |d| = ${da}`, desvio };
  if (a.length !== b.length) return { erro: `${b.length} peças (Rust) x ${a.length} (TS)`, desvio };
  const usadas = new Set<number>();
  for (const [ia, pa] of a.entries()) {
    let achou = false;
    for (const [ib, pb] of b.entries()) {
      if (usadas.has(ib) || pa.length !== pb.length) continue;
      // anel externo contra externo; furos em qualquer ordem
      const dExt = desvioDoAnel(pa[0]!, pb[0]!, tol);
      if (dExt === null) continue;
      let dMax = dExt;
      const furosB = new Set<number>();
      let ok = true;
      for (let h = 1; h < pa.length && ok; h++) {
        let ach = false;
        for (let k = 1; k < pb.length; k++) {
          if (furosB.has(k)) continue;
          const d = desvioDoAnel(pa[h]!, pb[k]!, tol);
          if (d !== null) {
            furosB.add(k);
            dMax = Math.max(dMax, d);
            ach = true;
            break;
          }
        }
        ok = ach;
      }
      if (!ok) continue;
      usadas.add(ib);
      desvio = Math.max(desvio, dMax);
      achou = true;
      break;
    }
    if (!achou) return { erro: `peça ${ia} do TS (${pa.map((r) => r.length).join('+')} vértices, área ${areaDaForma([pa]).toFixed(9)}) sem par no Rust`, desvio };
  }
  return { erro: null, desvio };
}

/**
 * Forma canônica para comparar fragmentos: funde as peças que se tocam e tira vértices colineares (união exata). O `polygon-clipping` do TS (exato) devolve como peças separadas polígonos que se encostam por uma
 * aresta com ruído de 1e-16, e o Rust (inteiros) as funde: a contagem de peças só faz sentido depois de fundi-las.
 */
export const canonica = (m: MultiPolygon): MultiPolygon => (m.length === 0 ? m : union(...m.map((p) => [p])));

export interface ComparacaoA2 {
  divergencias: string[];
  desvioMaximo: number;
  /** Itens comparados, com fragmento não vazio e total de peças do fragmento (cobertura). */
  itens: number;
  comFragmento: number;
  pecas: number;
}

const rotulo = (i: number, x: ItemA2): string => `item ${i} (parede ${x.parede}, ${x.faixa ? 'faixa' : 'camada'} ${x.indice}, grupo ${x.grupo})`;

/** Compara a saída do Rust (`rust`) com a referência (`ref`), item a item. Para na 1ª divergência de cada item. */
export function compararA2(ref: ItemA2[], rust: ItemA2[], maxDivergencias = 20): ComparacaoA2 {
  const divergencias: string[] = [];
  let desvioMaximo = 0;
  let comFragmento = 0;
  let pecas = 0;
  if (ref.length !== rust.length) {
    return { divergencias: [`${rust.length} itens (Rust) x ${ref.length} (TS)`], desvioMaximo, itens: ref.length, comFragmento, pecas };
  }
  const EXATOS = ['parede', 'grupo', 'faixa', 'indice', 'material', 'core', 'emPlanta', 'contorno', 'atravessa'] as const;
  const NUMEROS = ['prioridade', 'ordem', 'nucleoT', 'z0', 'z1', 'espessura'] as const;
  for (let i = 0; i < ref.length && divergencias.length < maxDivergencias; i++) {
    const a = ref[i]!;
    const b = rust[i]!;
    const campo = EXATOS.find((c) => a[c] !== b[c]);
    if (campo) {
      divergencias.push(`${rotulo(i, a)}: ${campo} ${String(b[campo])} (Rust) x ${String(a[campo])} (TS)`);
      continue;
    }
    const num = NUMEROS.find((c) => !(Math.abs(a[c] - b[c]) <= TOLERANCIA_COORDENADA_A2));
    if (num) {
      divergencias.push(`${rotulo(i, a)}: ${num} ${b[num]} (Rust) x ${a[num]} (TS)`);
      continue;
    }
    const bruto = compararFormas(a.bruto, b.bruto);
    if (bruto.erro) {
      divergencias.push(`${rotulo(i, a)}: shape bruto: ${bruto.erro}`);
      continue;
    }
    const frag = compararFormas(canonica(a.fragmento), canonica(b.fragmento));
    const areaFrag = Math.abs(areaDaForma(a.fragmento) - areaDaForma(b.fragmento));
    if (!frag.erro && areaFrag > TOLERANCIA_AREA_A2) frag.erro = `área ${areaDaForma(b.fragmento)} (Rust) x ${areaDaForma(a.fragmento)} (TS), |d| = ${areaFrag}`;
    if (frag.erro) {
      divergencias.push(`${rotulo(i, a)}: fragment: ${frag.erro}`);
      continue;
    }
    desvioMaximo = Math.max(desvioMaximo, bruto.desvio, frag.desvio);
    if (a.fragmento.length) comFragmento++;
    pecas += a.fragmento.length;
  }
  return { divergencias, desvioMaximo, itens: ref.length, comFragmento, pecas };
}
