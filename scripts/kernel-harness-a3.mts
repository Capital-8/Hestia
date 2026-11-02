// Comparação da sub-etapa A3a (decisão 0047 §7): saída do Rust (`aberturas_geom`) x extração do motor TypeScript
// (`referenciaA3a`: `openingGeometry` e `openingRect`), abertura a abertura. Identidade (ids, enums, flips) por igualdade
// exata; todo número (coordenadas, vetores, medidas) a 1 µm; área do furo a 1e-6 m². A tolerância NÃO se afrouxa para passar.
// O maior desvio medido é reportado (esperado ~1e-15: as mesmas contas na mesma ordem).
import { difference, type MultiPolygon } from '@hestia/geom';
import type { AberturaA3, RetornoA3b } from '../packages/engine/src/kernelA3.ts';
import { areaDaForma, compararFormas } from './kernel-harness-a2.mts';

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

// ---------------------------------------------------------------------------------------------------------------
// A3b: retornos de acabamento (`retornos_geom`) x `insertReturns` + `makeReturnClipper` do motor TypeScript. Identidade
// (parede, abertura, camada, grupo, modo) por igualdade exata. Cada forma (o retorno e o seu recorte) é comparada à
// tolerância de 1 µm de coordenada e 1e-6 m² SEM folga: primeiro estrita (peças e anéis a 1 µm), e, quando as booleanas
// divergem por ruído topológico (o `polygon-clipping` do TS é exato, o Rust quantiza a 1 µm), pela região: área líquida e
// área da diferença simétrica, cada uma a 1e-6 m². A decisão 0048 (folga do pintor) NÃO vale aqui.
export interface ComparacaoA3b {
  divergencias: string[];
  desvioMaximo: number;
  retornos: number;
  /** Retornos por `insertMode` efetivo (índice = modo 1..3). */
  porModo: [number, number, number, number];
  /** Retornos cujo recorte perdeu área (havia parede vizinha por cima). */
  recortados: number;
  /** Formas (retorno e recorte) que casam também peça a peça e anel a anel; o resto casa pela região. */
  estritas: number;
  formas: number;
  /** Retornos do TS de área <= 1e-6 m² que o Rust não devolve (ver `compararA3b`). */
  fiapos: number;
  /** Dos fiapos, os que só o Rust devolve (o Rust nunca inventa retorno: esperado 0). */
  fiaposRust: number;
}

function formaIgual(a: MultiPolygon, b: MultiPolygon): { erro: string | null; estrita: boolean; desvio: number } {
  const e = compararFormas(a, b, TOLERANCIA_COORDENADA_A3, TOLERANCIA_AREA_A3);
  if (!e.erro) return { erro: null, estrita: true, desvio: e.desvio };
  const aa = areaDaForma(a);
  const ab = areaDaForma(b);
  if (Math.abs(aa - ab) > TOLERANCIA_AREA_A3) return { erro: `área ${ab} (Rust) x ${aa} (TS), |d| = ${Math.abs(aa - ab)}`, estrita: false, desvio: 0 };
  const sim = areaDaForma(a.length && b.length ? difference(a, b) : a) + areaDaForma(a.length && b.length ? difference(b, a) : b);
  if (sim > TOLERANCIA_AREA_A3) return { erro: `diferença simétrica ${sim} m² (${e.erro})`, estrita: false, desvio: 0 };
  return { erro: null, estrita: false, desvio: 0 };
}

export function compararA3b(refTodos: RetornoA3b[], rustTodos: RetornoA3b[], maxDivergencias = 20): ComparacaoA3b {
  const divergencias: string[] = [];
  const chave = (x: RetornoA3b): string => `${x.parede}/${x.abertura}/${x.camada}`;
  // Fiapos: um retorno presente só de um lado com área <= 1e-6 m² (a tolerância de área). O `polygon-clipping` (exato) deixa
  // triângulos de ~0 m² quando o batente cobre o retorno; o Rust (inteiros) devolve vazio. Maior que isso de um lado só é divergência.
  const chavesRust = new Set(rustTodos.map(chave));
  const chavesRef = new Set(refTodos.map(chave));
  let fiapos = 0;
  let fiaposRust = 0;
  const semFiapo = (lista: RetornoA3b[], outro: Set<string>, doRust: boolean): RetornoA3b[] =>
    lista.filter((x) => {
      if (outro.has(chave(x))) return true;
      if (areaDaForma(x.bruto) <= TOLERANCIA_AREA_A3) {
        fiapos++;
        if (doRust) fiaposRust++;
        return false;
      }
      return true;
    });
  const ref = semFiapo(refTodos, chavesRust, false);
  const rust = semFiapo(rustTodos, chavesRef, true);
  const r: ComparacaoA3b = { divergencias, desvioMaximo: 0, retornos: ref.length, porModo: [0, 0, 0, 0], recortados: 0, estritas: 0, formas: 0, fiapos, fiaposRust };
  if (ref.length !== rust.length) {
    divergencias.push(`${rust.length} retornos (Rust) x ${ref.length} (TS), sem ${fiapos} fiapos de área <= 1e-6`);
    return r;
  }
  for (let i = 0; i < ref.length && divergencias.length < maxDivergencias; i++) {
    const a = ref[i]!;
    const b = rust[i]!;
    const rotulo = `retorno ${i} (parede ${a.parede}, abertura ${a.abertura}, camada ${a.camada})`;
    const exato = (['parede', 'abertura', 'camada', 'grupo', 'modo'] as const).find((c) => a[c] !== b[c]);
    if (exato) {
      divergencias.push(`${rotulo}: ${exato} ${b[exato]} (Rust) x ${a[exato]} (TS)`);
      continue;
    }
    let ruim = false;
    for (const campo of ['bruto', 'recorte'] as const) {
      const c = formaIgual(a[campo], b[campo]);
      if (c.erro) {
        divergencias.push(`${rotulo}: ${campo}: ${c.erro}`);
        ruim = true;
        break;
      }
      r.formas++;
      if (c.estrita) r.estritas++;
      r.desvioMaximo = Math.max(r.desvioMaximo, c.desvio);
    }
    if (ruim) continue;
    r.porModo[a.modo as 0 | 1 | 2 | 3]++;
    if (areaDaForma(a.bruto) - areaDaForma(a.recorte) > TOLERANCIA_AREA_A3) r.recortados++;
  }
  return r;
}
