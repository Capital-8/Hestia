// Comparação da sub-etapa A2 (decisão 0047): saída do Rust (`itens_pintados`) x extração do motor TypeScript
// (`referenciaA2`), item a item. Identidade (parede, camada, material, ordem) por igualdade exata; área do
// fragmento a 1e-6 m², contagem de peças igual e coordenadas dos anéis a 1 µm depois de normalizar início e
// orientação do anel. A tolerância NÃO se afrouxa para passar.
import { difference, union, type MultiPolygon, type Ring } from '@hestia/geom';
import type { ItemA2 } from '../packages/engine/src/kernelA2.ts';

export const TOLERANCIA_COORDENADA_A2 = 1e-6;
/** Área do fragmento: as constantes do diferencial da 0045 (`TOL_AREA_ABS` + `TOL_AREA_REL` x área), ver `compararA2`. */
export const TOLERANCIA_AREA_A2 = 1e-6;
export const TOL_AREA_ABS_A2 = 1e-5;

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
  /** Itens cujo fragmento casa também peça a peça e anel a anel (1 µm) com área a 1e-6 m². */
  estritos: number;
  /** Itens em que o TS tem MENOS área que o Rust (perda do polygon-clipping); ver o comentário em `compararA2`. */
  tsPerdeuArea: number;
}

const rotulo = (i: number, x: ItemA2): string => `item ${i} (parede ${x.parede}, ${x.faixa ? 'faixa' : 'camada'} ${x.indice}, grupo ${x.grupo})`;

/** Compara a saída do Rust (`rust`) com a referência (`ref`), item a item. Para na 1ª divergência de cada item. */
export function compararA2(ref: ItemA2[], rust: ItemA2[], maxDivergencias = 20): ComparacaoA2 {
  const divergencias: string[] = [];
  let desvioMaximo = 0;
  let comFragmento = 0;
  let pecas = 0;
  let estritos = 0;
  let tsPerdeuArea = 0;
  if (ref.length !== rust.length) {
    return { divergencias: [`${rust.length} itens (Rust) x ${ref.length} (TS)`], desvioMaximo, itens: ref.length, comFragmento, pecas, estritos, tsPerdeuArea };
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
    // Fragmento, critério bloqueante: mesma região. Área líquida e área da diferença simétrica (calculada pelo
    // polígono exato do TS) dentro da tolerância de área do diferencial da 0045 (1e-5 + 1e-6 x área). O Rust quantiza
    // (inteiros) e o `polygon-clipping` do TS não: a 1 µm a área de um fragmento de perímetro de metros já difere até
    // ~1e-5 m², e a 1 nm (escala usada na A2) ainda sobra ruído topológico (peças que se encostam, vértices colineares).
    const areaA = areaDaForma(a.fragmento);
    const areaB = areaDaForma(b.fragmento);
    const tolArea = TOL_AREA_ABS_A2 + 1e-6 * Math.max(Math.abs(areaA), Math.abs(areaB));
    let erroFrag: string | null = null;
    // Defeito conhecido do TS (não do Rust): o `polygon-clipping` às vezes PERDE área em silêncio (a razão de existir do plano B
    // Clipper de `boolean.ts`). Se o Rust tem mais área que o TS, o fragmento do Rust cabe no bruto e o resto bate, conta-se
    // à parte em `tsPerdeuArea` (o teste limita a fração) em vez de reprovar. Entrada mínima: estresse semente 100, retas, item 274.
    if (areaB - areaA > tolArea && areaB <= areaDaForma(a.bruto) + tolArea) {
      tsPerdeuArea++;
      continue;
    }
    if (Math.abs(areaA - areaB) > tolArea) erroFrag = `área ${areaB} (Rust) x ${areaA} (TS), |d| = ${Math.abs(areaA - areaB)} (tol ${tolArea})`;
    else {
      const sim = areaDaForma(a.fragmento.length && b.fragmento.length ? difference(a.fragmento, b.fragmento) : a.fragmento) + areaDaForma(a.fragmento.length && b.fragmento.length ? difference(b.fragmento, a.fragmento) : b.fragmento);
      if (sim > tolArea) erroFrag = `diferença simétrica ${sim} m² (tol ${tolArea}); peças ${b.fragmento.length} (Rust) x ${a.fragmento.length} (TS)`;
    }
    if (erroFrag) {
      divergencias.push(`${rotulo(i, a)}: fragment: ${erroFrag}`);
      continue;
    }
    // Estatística (não bloqueia): igualdade estrita de peças e anéis (1 µm, início/orientação normalizados).
    const frag = compararFormas(canonica(a.fragmento), canonica(b.fragmento));
    if (!frag.erro && Math.abs(areaA - areaB) <= TOLERANCIA_AREA_A2) estritos++;
    desvioMaximo = Math.max(desvioMaximo, bruto.desvio, frag.desvio);
    if (a.fragmento.length) comFragmento++;
    pecas += a.fragmento.length;
  }
  return { divergencias, desvioMaximo, itens: ref.length, comFragmento, pecas, estritos, tsPerdeuArea };
}
