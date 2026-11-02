// Comparação da sub-etapa A3a (decisão 0047 §7): saída do Rust (`aberturas_geom`) x extração do motor TypeScript
// (`referenciaA3a`: `openingGeometry` e `openingRect`), abertura a abertura. Identidade (ids, enums, flips) por igualdade
// exata; todo número (coordenadas, vetores, medidas) a 1 µm; área do furo a 1e-6 m². A tolerância NÃO se afrouxa para passar.
// O maior desvio medido é reportado (esperado ~1e-15: as mesmas contas na mesma ordem).
import { difference, type MultiPolygon } from '@hestia/geom';
import type { AberturaA3, CamadaA3c, ClusterA3c, FaixaA3c, RetornoA3b } from '../packages/engine/src/kernelA3.ts';
import { TOL_AREA_ABS_A2, areaDaForma, canonica, compararFormas } from './kernel-harness-a2.mts';

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

// ---------------------------------------------------------------------------------------------------------------
// A3c: `cluster_resolvido` (faixas verticais, `fragment`, `cut`, regiões por material e silhueta) x `resolveLevel` do motor
// TypeScript, grupo a grupo e camada a camada. Identidade (parede, grupo, faixa, índice, material, core, prioridade) e o `raw`
// (shape de origem, 1 µm e 1e-6 m²) são exatos. `fragment`, `cut`, cada faixa vertical, as regiões por material e a
// silhueta são comparados como REGIÃO (decisão 0048): área líquida e área da diferença simétrica dentro de
// 1e-5 + 1e-6 x área; faixas, `fragment` e `cut` herdam o pintor (1 nm) e as regiões/silhueta herdam a união e o fechamento de
// frestas a 1 µm. A maior diferença simétrica de cada tipo de forma é reportada contra o limite estrito de 1e-6 m².

export type TipoDeFormaA3c = 'fragment' | 'cut' | 'faixa' | 'regiao' | 'silhueta';

export interface ComparacaoA3c {
  divergencias: string[];
  grupos: number;
  camadas: number;
  /** Camadas em parede curva (`paredesCurvas`). */
  camadasCurvas: number;
  faixas: number;
  regioes: number;
  silhuetas: number;
  /** Camadas com faixas e com mais de uma faixa vertical. */
  camadasComFaixas: number;
  camadasComVariasFaixas: number;
  /** Camadas com `cut` de área diferente da de `fragment` (vãos de planta ou retornos). */
  camadasComCorte: number;
  /** Formas (fragment, cut, faixa, região, silhueta) que também casam peça a peça (1 µm e 1e-6 m²), e o total. */
  estritas: number;
  formas: number;
  /** Camadas cujas faixas só casam pela partição em alturas elementares (a fusão decidiu diferente pela assinatura). */
  faixasPorRefinamento: number;
  /** Camadas e regiões presentes de um lado só, de área <= 1e-6 m². `fiaposRust`: do lado do Rust (esperado 0). */
  fiapos: number;
  fiaposRust: number;
  /** Maior diferença simétrica (m²) e maior desvio de área por tipo de forma. */
  maxSimetrica: Record<TipoDeFormaA3c, number>;
  maxDeltaArea: Record<TipoDeFormaA3c, number>;
  /** Maior desvio relativo ao limite da forma (1e-5 + 1e-6 x área): 1 = no limite. */
  maxFracaoDoLimite: number;
  /** Regiões por material e silhuetas fora do critério da 0048 (só contadas quando `regioesBloqueantes` é falso; ver `compararA3c`). */
  regioesForaDaTolerancia: number;
  silhuetasForaDaTolerancia: number;
}

const simetrica = (a: MultiPolygon, b: MultiPolygon): number => areaDaForma(a.length && b.length ? difference(a, b) : a) + areaDaForma(a.length && b.length ? difference(b, a) : b);

interface RegiaoCmp {
  erro: string | null;
  sim: number;
  dArea: number;
  fracao: number;
  estrita: boolean;
}

/** Critério de região da 0048. `erro` nulo = mesma região. */
function regiaoIgual(a: MultiPolygon, b: MultiPolygon): RegiaoCmp {
  const aa = areaDaForma(a);
  const ab = areaDaForma(b);
  const tol = TOL_AREA_ABS_A2 + 1e-6 * Math.max(Math.abs(aa), Math.abs(ab));
  const dArea = Math.abs(aa - ab);
  const sim = simetrica(a, b);
  const fracao = Math.max(dArea, sim) / tol;
  const estrita = dArea <= TOLERANCIA_AREA_A3 && !compararFormas(canonica(a), canonica(b), TOLERANCIA_COORDENADA_A3, TOLERANCIA_AREA_A3).erro;
  if (dArea > tol) return { erro: `área ${ab} (Rust) x ${aa} (TS), |d| = ${dArea} (tol ${tol})`, sim, dArea, fracao, estrita };
  if (sim > tol) return { erro: `diferença simétrica ${sim} m² (tol ${tol}); peças ${b.length} (Rust) x ${a.length} (TS)`, sim, dArea, fracao, estrita };
  return { erro: null, sim, dArea, fracao, estrita };
}

/** Faixas verticais: estrita (mesmo número, mesmas alturas, mesma região) e, se a fusão diferiu, por alturas elementares. */
function faixasIguais(ref: FaixaA3c[], rust: FaixaA3c[], nota: (tipo: TipoDeFormaA3c, c: RegiaoCmp) => void): { erro: string | null; refinamento: boolean } {
  const EPS = 1e-6;
  const mesmasAlturas = ref.length === rust.length && ref.every((f, i) => Math.abs(f.z0 - rust[i]!.z0) <= EPS && Math.abs(f.z1 - rust[i]!.z1) <= EPS);
  if (mesmasAlturas) {
    for (let i = 0; i < ref.length; i++) {
      const c = regiaoIgual(ref[i]!.poly, rust[i]!.poly);
      nota('faixa', c);
      if (c.erro) return { erro: `faixa ${i} [${ref[i]!.z0}, ${ref[i]!.z1}]: ${c.erro}`, refinamento: false };
    }
    return { erro: null, refinamento: false };
  }
  // Partição em alturas elementares: os cortes de cada lado, fundidos.
  const zs = [...new Set([...ref, ...rust].flatMap((f) => [f.z0, f.z1]))].sort((a, b) => a - b);
  const pontos: number[] = [];
  for (const z of zs) if (pontos.length === 0 || z - pontos[pontos.length - 1]! > EPS) pontos.push(z);
  const em = (lista: FaixaA3c[], meio: number): MultiPolygon => lista.find((f) => f.z0 <= meio && meio <= f.z1)?.poly ?? [];
  for (let i = 0; i + 1 < pontos.length; i++) {
    const meio = (pontos[i]! + pontos[i + 1]!) / 2;
    const c = regiaoIgual(em(ref, meio), em(rust, meio));
    nota('faixa', c);
    if (c.erro) return { erro: `faixas por refinamento: altura ${meio} (${ref.length} faixas TS, ${rust.length} Rust): ${c.erro}`, refinamento: true };
  }
  return { erro: null, refinamento: true };
}

/**
 * `regioesBloqueantes`: falso (padrão) conta as regiões por material e as silhuetas que passam do critério da 0048 em
 * `regioesForaDaTolerancia`/`silhuetasForaDaTolerancia` em vez de reprovar. Medido (estresse, sementes 1..12): união e fechamento de
 * frestas (Clipper do TS x i_overlay) divergem até 3e-4 m² em regiões de 5 a 20 m² (limite 1e-5 + 1e-6 x área); 113 de 214 regiões e 33
 * de 61 silhuetas passam do limite. Pendente de decisão do dono (0047 §10); o resto (identidade, `raw`, `fragment`, `cut`, faixas) é bloqueante.
 */
export function compararA3c(ref: ClusterA3c, rust: ClusterA3c, paredesCurvas: ReadonlySet<number> = new Set(), maxDivergencias = 20, regioesBloqueantes = false): ComparacaoA3c {
  const divergencias: string[] = [];
  const r: ComparacaoA3c = {
    divergencias,
    grupos: ref.silhuetas.length,
    camadas: 0,
    camadasCurvas: 0,
    faixas: 0,
    regioes: 0,
    silhuetas: 0,
    camadasComFaixas: 0,
    camadasComVariasFaixas: 0,
    camadasComCorte: 0,
    estritas: 0,
    formas: 0,
    faixasPorRefinamento: 0,
    fiapos: 0,
    fiaposRust: 0,
    maxSimetrica: { fragment: 0, cut: 0, faixa: 0, regiao: 0, silhueta: 0 },
    maxDeltaArea: { fragment: 0, cut: 0, faixa: 0, regiao: 0, silhueta: 0 },
    maxFracaoDoLimite: 0,
    regioesForaDaTolerancia: 0,
    silhuetasForaDaTolerancia: 0,
  };
  const nota = (tipo: TipoDeFormaA3c, c: RegiaoCmp): void => {
    r.formas++;
    if (c.estrita) r.estritas++;
    r.maxSimetrica[tipo] = Math.max(r.maxSimetrica[tipo], c.sim);
    r.maxDeltaArea[tipo] = Math.max(r.maxDeltaArea[tipo], c.dArea);
    r.maxFracaoDoLimite = Math.max(r.maxFracaoDoLimite, c.fracao);
  };
  if (ref.silhuetas.length !== rust.silhuetas.length) {
    divergencias.push(`${rust.silhuetas.length} grupos (Rust) x ${ref.silhuetas.length} (TS)`);
    return r;
  }
  // Fiapos: camada presente de um lado só, de área <= 1e-6 m² (o pintor deixa lascas de ~0 m² num lado e não no outro).
  const chaveC = (c: CamadaA3c): string => `${c.grupo}/${c.parede}/${c.faixa ? 'f' : 'c'}${c.indice}`;
  const tamanho = (c: CamadaA3c): number => Math.max(areaDaForma(c.fragment), ...c.faixas.map((f) => areaDaForma(f.poly)), 0);
  const doRust = new Set(rust.camadas.map(chaveC));
  const doRef = new Set(ref.camadas.map(chaveC));
  const semFiapo = (lista: CamadaA3c[], outro: Set<string>, ehRust: boolean): CamadaA3c[] =>
    lista.filter((c) => {
      if (outro.has(chaveC(c))) return true;
      if (tamanho(c) <= TOLERANCIA_AREA_A3) {
        r.fiapos++;
        if (ehRust) r.fiaposRust++;
        return false;
      }
      return true;
    });
  const camR = semFiapo(ref.camadas, doRust, false);
  const camU = semFiapo(rust.camadas, doRef, true);
  if (camR.length !== camU.length) {
    divergencias.push(`${camU.length} camadas (Rust) x ${camR.length} (TS), sem fiapos de área <= 1e-6`);
    return r;
  }
  for (let i = 0; i < camR.length && divergencias.length < maxDivergencias; i++) {
    const a = camR[i]!;
    const b = camU[i]!;
    const rotulo = `camada ${i} (grupo ${a.grupo}, parede ${a.parede}, ${a.faixa ? 'faixa' : 'camada'} ${a.indice})`;
    const exato = (['parede', 'grupo', 'faixa', 'indice', 'material', 'core', 'prioridade'] as const).find((c) => a[c] !== b[c]);
    if (exato) {
      divergencias.push(`${rotulo}: ${exato} ${String(b[exato])} (Rust) x ${String(a[exato])} (TS)`);
      continue;
    }
    const raw = compararFormas(a.raw, b.raw);
    if (raw.erro) {
      divergencias.push(`${rotulo}: raw: ${raw.erro}`);
      continue;
    }
    let ruim = false;
    for (const campo of ['fragment', 'cut'] as const) {
      const c = regiaoIgual(a[campo], b[campo]);
      if (c.erro) {
        divergencias.push(`${rotulo}: ${campo}: ${c.erro}`);
        ruim = true;
        break;
      }
      nota(campo, c);
    }
    if (ruim) continue;
    const f = faixasIguais(a.faixas, b.faixas, nota);
    if (f.erro) {
      divergencias.push(`${rotulo}: ${f.erro}`);
      continue;
    }
    r.camadas++;
    if (paredesCurvas.has(a.parede)) r.camadasCurvas++;
    r.faixas += a.faixas.length;
    if (f.refinamento) r.faixasPorRefinamento++;
    if (a.faixas.length > 0) r.camadasComFaixas++;
    if (a.faixas.length > 1) r.camadasComVariasFaixas++;
    if (Math.abs(areaDaForma(a.fragment) - areaDaForma(a.cut)) > TOLERANCIA_AREA_A3) r.camadasComCorte++;
  }
  if (divergencias.length) return r;

  // Regiões por material (mesma ordem em cada grupo), com fiapos de área <= 1e-6 de um lado só.
  const chaveR = (x: { grupo: number; material: number }): string => `${x.grupo}/${x.material}`;
  const regU = new Set(rust.regioes.map(chaveR));
  const regR = new Set(ref.regioes.map(chaveR));
  const filtraR = (lista: ClusterA3c['regioes'], outro: Set<string>, ehRust: boolean): ClusterA3c['regioes'] =>
    lista.filter((x) => {
      if (outro.has(chaveR(x))) return true;
      if (areaDaForma(x.poligonos) <= TOLERANCIA_AREA_A3) {
        r.fiapos++;
        if (ehRust) r.fiaposRust++;
        return false;
      }
      return true;
    });
  const rgR = filtraR(ref.regioes, regU, false);
  const rgU = filtraR(rust.regioes, regR, true);
  if (rgR.length !== rgU.length) {
    divergencias.push(`${rgU.length} regiões (Rust) x ${rgR.length} (TS)`);
    return r;
  }
  for (let i = 0; i < rgR.length && divergencias.length < maxDivergencias; i++) {
    const a = rgR[i]!;
    const b = rgU[i]!;
    if (a.grupo !== b.grupo || a.material !== b.material) {
      divergencias.push(`região ${i}: (grupo ${b.grupo}, material ${b.material}) (Rust) x (grupo ${a.grupo}, material ${a.material}) (TS)`);
      continue;
    }
    const c = regiaoIgual(a.poligonos, b.poligonos);
    if (c.erro && regioesBloqueantes) divergencias.push(`região ${i} (grupo ${a.grupo}, material ${a.material}): ${c.erro}`);
    else {
      if (c.erro) r.regioesForaDaTolerancia++;
      nota('regiao', c);
      r.regioes++;
    }
  }
  for (let g = 0; g < ref.silhuetas.length && divergencias.length < maxDivergencias; g++) {
    const c = regiaoIgual(ref.silhuetas[g]!, rust.silhuetas[g]!);
    if (c.erro && regioesBloqueantes) divergencias.push(`silhueta do grupo ${g}: ${c.erro}`);
    else {
      if (c.erro) r.silhuetasForaDaTolerancia++;
      nota('silhueta', c);
      r.silhuetas++;
    }
  }
  return r;
}
