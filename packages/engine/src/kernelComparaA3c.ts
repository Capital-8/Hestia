// Comparação da sub-etapa A3c (decisão 0047 §7, §10, §11): ver o cabeçalho de `kernelComparaA3.ts` (A3a e A3b) e as decisões 0048 e 0049.
import { difference, intersection, union, type MultiPolygon } from '@hestia/geom';
import type { CamadaA3c, ClusterA3c, FaixaA3c } from './kernelA3.ts';
import { TOL_AREA_ABS_A2, areaDaForma, canonica, compararFormas } from './kernelComparaA2.ts';
import { TOLERANCIA_AREA_A3, TOLERANCIA_COORDENADA_A3, areaAnel } from './kernelComparaA3.ts';

// ---------------------------------------------------------------------------------------------------------------
// A3c: `cluster_resolvido` (faixas verticais, `fragment`, `cut`, regiões por material e silhueta) x `resolveLevel` do motor
// TypeScript, grupo a grupo e camada a camada. Identidade (parede, grupo, faixa, índice, material, core, prioridade) e o `raw`
// (shape de origem, 1 µm e 1e-6 m²) são exatos. `fragment`, `cut`, cada faixa vertical, as regiões por material e a // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
// silhueta são comparados como REGIÃO (decisão 0048): área líquida e área da diferença simétrica dentro de
// 1e-5 + 1e-6 x área; faixas, `fragment` e `cut` herdam o pintor (1 nm) e as regiões/silhueta herdam a união e o fechamento de
// frestas a 1 µm. A maior diferença simétrica de cada tipo de forma é reportada contra o limite estrito de 1e-6 m². // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface

/**
 * Guarda contra erro GROSSEIRO em região e silhueta (peça faltando ou sobrando), que vale mesmo com `regioesBloqueantes` falso. NÃO é critério de
 * equivalência: é só um piso de sanidade acima do maior desvio medido (3,7e-3 m², o entalhe que o `unionClipper` do TS preenche, ver 0047 §10). // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
 */
export const ERRO_GROSSEIRO_REGIAO = 1e-2;

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
  /** Formas (fragment, cut, faixa, região, silhueta) que também casam peça a peça (1 µm e 1e-6 m²), e o total. */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  estritas: number;
  formas: number;
  /** Camadas cujas faixas só casam pela partição em alturas elementares (a fusão decidiu diferente pela assinatura). */
  faixasPorRefinamento: number;
  /** Camadas e regiões presentes de um lado só, de área <= 1e-6 m². `fiaposRust`: do lado do Rust (esperado 0). */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  fiapos: number;
  fiaposRust: number;
  /** Maior diferença simétrica (m²) e maior desvio de área por tipo de forma. */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  maxSimetrica: Record<TipoDeFormaA3c, number>;
  maxDeltaArea: Record<TipoDeFormaA3c, number>;
  /** Maior desvio relativo ao limite da forma (1e-5 + 1e-6 x área): 1 = no limite. */
  maxFracaoDoLimite: number;
  /** Regiões por material e silhuetas fora do critério da 0048 (só contadas quando `regioesBloqueantes` é falso; ver `compararA3c`). */
  regioesForaDaTolerancia: number;
  silhuetasForaDaTolerancia: number;
  /** Regiões/silhuetas aceitas por exceção nomeada (0049). */
  excecoesUsadas: number;
  /** Estatística da 0049 (medida, não bloqueia por si). */
  estat0049: Estat0049;
}

/** Estatística das regiões e silhuetas fora das exceções nomeadas (0049). */
export interface Estat0049 {
  /** Regiões/silhuetas cuja contagem de peças/furos SIGNIFICATIVOS difere. */
  topologiaDiferente: number;
  /** Componentes (peças e furos) abaixo do limiar de fiapo, nos dois lados. */
  fiaposDeRegiao: number;
  /** Maior razão `max(dArea, simétrica) / perímetro / 1e-6` (o `K` da regra 3). */
  maxK: number;
  /** Componentes sem par (qualquer tamanho, nas regiões de topologia diferente ou não): contagem, maior área, > 1e-4, > 1e-3, em peças e em furos. */
  semPar: { n: number; max: number; acima1e4: number; acima1e3: number; pecas: number; furos: number };
  /** Componentes sem par acima do fiapo resolvidos pela verificação de equivalência (a interseção com a forma do outro lado cabe no limite da regra 3): quantos e o maior. */
  resolvidos: { n: number; max: number };
}

export const estat0049Zero = (): Estat0049 => ({ topologiaDiferente: 0, fiaposDeRegiao: 0, maxK: 0, semPar: { n: 0, max: 0, acima1e4: 0, acima1e3: 0, pecas: 0, furos: 0 }, resolvidos: { n: 0, max: 0 } });

export function somaEstat0049(a: Estat0049, b: Estat0049): void {
  a.topologiaDiferente += b.topologiaDiferente;
  a.fiaposDeRegiao += b.fiaposDeRegiao;
  a.maxK = Math.max(a.maxK, b.maxK);
  a.semPar.n += b.semPar.n;
  a.semPar.max = Math.max(a.semPar.max, b.semPar.max);
  for (const k of ['acima1e4', 'acima1e3', 'pecas', 'furos'] as const) a.semPar[k] += b.semPar[k];
  a.resolvidos.n += b.resolvidos.n;
  a.resolvidos.max = Math.max(a.resolvidos.max, b.resolvidos.max);
}

const simetrica = (a: MultiPolygon, b: MultiPolygon): number => areaDaForma(a.length && b.length ? difference(a, b) : a) + areaDaForma(a.length && b.length ? difference(b, a) : b);

export interface RegiaoCmp {
  erro: string | null;
  sim: number;
  dArea: number;
  fracao: number;
  estrita: boolean;
}

/** Critério de região da 0048. `erro` nulo = mesma região. */
export function regiaoIgual(a: MultiPolygon, b: MultiPolygon): RegiaoCmp {
  const aa = areaDaForma(a);
  const ab = areaDaForma(b);
  const tol = TOL_AREA_ABS_A2 + 1e-6 * Math.max(Math.abs(aa), Math.abs(ab));
  const dArea = Math.abs(aa - ab);
  const sim = simetrica(a, b);
  const fracao = Math.max(dArea, sim) / tol;
  const estrita = dArea <= TOLERANCIA_AREA_A3 && !compararFormas(canonica(a), canonica(b), TOLERANCIA_COORDENADA_A3, TOLERANCIA_AREA_A3).erro;
  if (dArea > tol) return { erro: `área ${ab} (Rust) x ${aa} (TS), |d| = ${dArea} (tol ${tol})`, sim, dArea, fracao, estrita };
  if (sim > tol) return { erro: `diferença simétrica ${sim} m² (tol ${tol}); peças ${b.length} (Rust) x ${a.length} (TS)`, sim, dArea, fracao, estrita }; // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  return { erro: null, sim, dArea, fracao, estrita };
}

/** Faixas verticais: estrita (mesmo número, mesmas alturas, mesma região) e, se a fusão diferiu, por alturas elementares. */
export function faixasIguais(ref: FaixaA3c[], rust: FaixaA3c[], nota: (tipo: TipoDeFormaA3c, c: RegiaoCmp) => void): { erro: string | null; refinamento: boolean } {
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
  // Faixas sobrepostas em altura (polígonos disjuntos da mesma camada) somam: a região na altura é a UNIÃO de todas que a contêm.
  const em = (lista: FaixaA3c[], meio: number): MultiPolygon => {
    const partes = lista.filter((f) => f.z0 <= meio && meio <= f.z1 && f.poly.length).map((f) => f.poly);
    return partes.length ? union(...partes) : [];
  };
  for (let i = 0; i + 1 < pontos.length; i++) {
    const meio = (pontos[i]! + pontos[i + 1]!) / 2;
    const c = regiaoIgual(em(ref, meio), em(rust, meio));
    nota('faixa', c);
    if (c.erro) return { erro: `faixas por refinamento: altura ${meio} (${ref.length} faixas TS, ${rust.length} Rust): ${c.erro}`, refinamento: true };
  }
  return { erro: null, refinamento: true };
}

// ---- Decisão 0049 (refinada): regiões por material e silhuetas -------------------------------------------------------------
//
// 1. Topologia igual nos componentes SIGNIFICATIVOS (área > `LIMIAR_FIAPO`): mesmo número de peças e de furos. Componentes menores são
//    fiapos de arredondamento: contam em `fiaposDeRegiao` e a área deles já está no limite.
// 2. Limite `1e-5 + K x perímetro x 1e-6` (diferença de área e diferença simétrica); `K_REGIAO_0049` vem da medição (0047 §11).
// 3. Guarda de erro grosseiro de 1e-2 m². // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
// 4. Exceções nomeadas (defeito do TS): só a guarda de erro grosseiro, e só se o Rust concordar com a união exata (`verificaExcecao`).

/** Limiar de fiapo (m²) dos componentes de uma região (0049, regra 2). */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
export const LIMIAR_FIAPO = 1e-4;

/**
 * `K` da regra 3 da 0049: 1,5 x a maior razão `simétrica / perímetro / 1e-6` medida no estresse (12 sementes x 2 pavimentos x 7 opções de planta,
 * A3c e A3d) fora das exceções nomeadas. Ver 0047 §11 (valor medido e amostra).
 */
export const K_REGIAO_0049 = 6;

/** Exceção NOMEADA da 0049 (defeito do TS, não do Rust): região do `material` (e do `grupo`, se dado) e, com `silhueta`, a silhueta do mesmo grupo. */
export interface ExcecaoNomeada {
  material: number;
  grupo?: number;
  /** A exceção cobre também a silhueta do mesmo grupo (derivada da mesma união). */
  silhueta?: boolean;
  motivo: string;
}

const areaAnelAbs = (r: Array<{ x: number; y: number }>): number => Math.abs(areaAnel(r));
/** Perímetro total (todos os anéis) de uma forma. */
export const perimetroDaForma = (m: MultiPolygon): number => m.reduce((t, p) => t + p.reduce((s, r) => s + r.reduce((u, q, i) => u + Math.hypot(q.x - r[(i + 1) % r.length]!.x, q.y - r[(i + 1) % r.length]!.y), 0), 0), 0);

interface Componente {
  lado?: 'TS' | 'Rust';
  area: number;
  tipo: 'peça' | 'furo';
  poly: MultiPolygon;
}

/** Peças (área líquida) e furos (anel interno) de uma forma. */
function componentesDaForma(m: MultiPolygon): Componente[] {
  const out: Componente[] = [];
  for (const p of m) {
    const outer = p[0] ?? [];
    const furos = p.slice(1);
    out.push({ area: areaAnelAbs(outer) - furos.reduce((t, h) => t + areaAnelAbs(h), 0), tipo: 'peça', poly: [p] });
    for (const h of furos) out.push({ area: areaAnelAbs(h), tipo: 'furo', poly: [[h]] });
  }
  return out;
}

/** Componentes de `a` sem par em `b` (nenhum componente de mesmo tipo de `b` cobre ao menos metade do menor dos dois). */
function semPar(a: Componente[], b: Componente[]): Componente[] {
  return a.filter((x) => !b.some((y) => {
    if (x.tipo !== y.tipo) return false;
    const inter = areaDaForma(intersection(x.poly, y.poly));
    return inter > 0.5 * Math.min(x.area, y.area);
  }));
}

export interface Topologia0049 {
  /** Nº de peças e de furos significativos de cada lado. */
  ts: string;
  rust: string;
  /** Componentes sem par (qualquer tamanho) de cada lado. */
  semPar: Componente[];
  /** Fiapos (abaixo do limiar) em cada lado. */
  fiapos: number;
}

/** Topologia da 0049: contagem dos componentes significativos. */
export function topologia0049(a: MultiPolygon, b: MultiPolygon): Topologia0049 {
  // Canonicaliza os dois lados (união exata: funde peças que se tocam por aresta ou tangência e tira vértices colineares).
  const ca = componentesDaForma(canonica(a));
  const cb = componentesDaForma(canonica(b));
  const sig = (c: Componente[]): string => `${c.filter((x) => x.tipo === 'peça' && x.area > LIMIAR_FIAPO).length}/${c.filter((x) => x.tipo === 'furo' && x.area > LIMIAR_FIAPO).length}`;
  return {
    ts: sig(ca),
    rust: sig(cb),
    semPar: [...semPar(ca, cb).map((x) => ({ ...x, lado: 'TS' as const })), ...semPar(cb, ca).map((x) => ({ ...x, lado: 'Rust' as const }))],
    fiapos: [...ca, ...cb].filter((x) => x.area <= LIMIAR_FIAPO).length,
  };
}

/** Estatística da 0049 de uma região/silhueta (não bloqueia; a decisão de bloqueio é de `regiao0049`). */
function estatistica0049(r: ComparacaoA3c, a: MultiPolygon, b: MultiPolygon, c: RegiaoCmp, nomeada: boolean): void {
  if (nomeada) return;
  const perim = Math.max(perimetroDaForma(a), perimetroDaForma(b));
  const k = perim > 0 ? Math.max(c.dArea, c.sim) / (perim * 1e-6) : 0;
  r.estat0049.maxK = Math.max(r.estat0049.maxK, k);
  const t = topologia0049(a, b);
  r.estat0049.fiaposDeRegiao += t.fiapos;
  if (t.ts !== t.rust) r.estat0049.topologiaDiferente++;
  for (const x of t.semPar) {
    const s = r.estat0049.semPar;
    s.n++;
    s.max = Math.max(s.max, x.area);
    if (x.area > 1e-4) s.acima1e4++;
    if (x.area > 1e-3) s.acima1e3++;
    if (x.tipo === 'peça') s.pecas++;
    else s.furos++;
  }
}

/** Comparador de faixas de uma camada; recebe a camada de referência (para exceções nomeadas por camada). */
export type ComparadorDeFaixas = (ref: FaixaA3c[], rust: FaixaA3c[], nota: (tipo: TipoDeFormaA3c, c: RegiaoCmp) => void, camada?: CamadaA3c) => { erro: string | null; refinamento: boolean };

/** Tolerância de concordância do Rust com a geometria exata nas exceções nomeadas (0049, "Exceções nomeadas"). */
export const TOL_CONCORDA_EXATO = 1e-6;

/** União EXATA (`polygon-clipping`) dos cortes das camadas do grupo (e do material, se dado): o que a região (ou a silhueta) deveria ser. */
function exataDosCortes(r: ClusterA3c, grupo: number, material: number | null): MultiPolygon {
  const partes = r.camadas.filter((c) => c.grupo === grupo && (material === null || c.material === material) && c.cut.length).map((c) => c.cut);
  return partes.length ? union(...partes) : [];
}

function concordaComExato(rust: MultiPolygon, exato: MultiPolygon): string | null {
  const d = Math.abs(areaDaForma(rust) - areaDaForma(exato));
  const limite = TOL_AREA_ABS_A2 + K_REGIAO_0049 * Math.max(perimetroDaForma(rust), perimetroDaForma(exato)) * 1e-6;
  return d <= limite ? null : `área do Rust ${areaDaForma(rust)} x união exata ${areaDaForma(exato)} (|d| = ${d}, limite da regra 3 ${limite})`;
}

/**
 * Regiões por material e silhuetas seguem a decisão 0049 refinada (e BLOQUEIAM). `excecoes`: lista de exceções nomeadas (defeito do TS), só com a
 * guarda de erro grosseiro; `verificaExcecao` (opcional) confere que o Rust concorda com a geometria exata. `regioesForaDaTolerancia`/
 * `silhuetasForaDaTolerancia` seguem como estatística (passam do critério antigo da 0048 e ficam dentro da 0049).
 */
export function compararA3c(
  ref: ClusterA3c,
  rust: ClusterA3c,
  paredesCurvas: ReadonlySet<number> = new Set(),
  maxDivergencias = 20,
  excecoes: readonly ExcecaoNomeada[] = [],
  comparadorDeFaixas: ComparadorDeFaixas = faixasIguais,
  k = K_REGIAO_0049,
): ComparacaoA3c {
  /** Critério da 0049 de uma região/silhueta; `erro` nulo = aceita. */
  const regiao0049 = (a: MultiPolygon, b: MultiPolygon, nomeada: boolean): { c: RegiaoCmp; erro: string | null } => {
    const c = regiaoIgual(a, b);
    const perim = Math.max(perimetroDaForma(a), perimetroDaForma(b));
    const tol = TOL_AREA_ABS_A2 + k * perim * 1e-6;
    if (c.sim > ERRO_GROSSEIRO_REGIAO || c.dArea > ERRO_GROSSEIRO_REGIAO) return { c, erro: `erro grosseiro: diferença simétrica ${c.sim}, de área ${c.dArea} (guarda ${ERRO_GROSSEIRO_REGIAO})` };
    if (nomeada) return { c, erro: null };
    if (c.dArea > tol || c.sim > tol) return { c, erro: `diferença de área ${c.dArea}, simétrica ${c.sim} (limite 0049 ${tol}; K medido ${(Math.max(c.dArea, c.sim) / (perim * 1e-6)).toFixed(2)}; perímetro ${perim.toFixed(2)}; área ${areaDaForma(a)})` }; // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
    const t = topologia0049(a, b);
    // Regra 2: cada componente acima do limiar precisa ter par (peça dividida em duas que se tocam ainda tem par pela sobreposição).
    // Equivalência de um componente sem par: ele existe também na forma do outro lado, só com outra representação (furo x fenda auto-tangente, peças que se tocam).
    // Furo: a interseção do furo com a forma SÓLIDA do outro lado é ~0 (o outro lado também tem o vazio). Peça: a peça está dentro da forma do outro lado.
    const equivalente = (x: Componente): boolean => {
      const outro = x.lado === 'TS' ? b : a;
      const dentro = outro.length ? areaDaForma(intersection(x.poly, outro)) : 0;
      return x.tipo === 'furo' ? dentro <= tol : x.area - dentro <= tol;
    };
    const grandes = t.semPar.filter((x) => x.area > LIMIAR_FIAPO && !equivalente(x));
    for (const x of t.semPar) {
      if (x.area > LIMIAR_FIAPO && !grandes.includes(x)) {
        r.estat0049.resolvidos.n++;
        r.estat0049.resolvidos.max = Math.max(r.estat0049.resolvidos.max, x.area);
      }
    }
    if (grandes.length) {
      return { c, erro: `topologia dos componentes significativos (peças/furos) ${t.rust} (Rust) x ${t.ts} (TS), após canonicalizar; sem par acima de ${LIMIAR_FIAPO}: ${grandes.map((x) => `${x.tipo} ${x.area} [${x.lado}] ${JSON.stringify(x.poly[0]![0]!.slice(0, 12).map((q) => [+q.x.toFixed(4), +q.y.toFixed(4)]))}`).join('; ') || 'nenhum'}` }; // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
    }
    return { c, erro: null };
  };
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
    excecoesUsadas: 0,
    estat0049: estat0049Zero(),
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
  // Fiapos: camada presente de um lado só, de área <= 1e-6 m² (o pintor deixa lascas de ~0 m² num lado e não no outro). // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
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
    const f = comparadorDeFaixas(a.faixas, b.faixas, nota, a);
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
    const nomeada = excecoes.find((e) => e.material === a.material && (e.grupo === undefined || e.grupo === a.grupo));
    const exato = nomeada ? exataDosCortes(rust, a.grupo, a.material) : null;
    const falhaExcecao = exato ? concordaComExato(b.poligonos, exato) : null;
    const { c, erro } = regiao0049(a.poligonos, b.poligonos, nomeada !== undefined);
    estatistica0049(r, a.poligonos, b.poligonos, c, nomeada !== undefined);
    if (falhaExcecao) divergencias.push(`região ${i} (grupo ${a.grupo}, material ${a.material}), exceção nomeada (${nomeada!.motivo}): o Rust não concorda com a união exata: ${falhaExcecao}`);
    else if (erro) divergencias.push(`região ${i} (grupo ${a.grupo}, material ${a.material}): ${erro}`);
    else {
      if (nomeada) r.excecoesUsadas++;
      else if (c.erro) r.regioesForaDaTolerancia++;
      nota('regiao', c);
      r.regioes++;
    }
  }
  for (let g = 0; g < ref.silhuetas.length && divergencias.length < maxDivergencias; g++) {
    const nomeada = excecoes.find((e) => e.silhueta && (e.grupo === undefined || e.grupo === g) && rust.regioes.some((x) => x.grupo === g && x.material === e.material));
    const exato = nomeada ? exataDosCortes(rust, g, null) : null;
    const falhaExcecao = exato ? concordaComExato(rust.silhuetas[g]!, exato) : null;
    const { c, erro } = regiao0049(ref.silhuetas[g]!, rust.silhuetas[g]!, nomeada !== undefined);
    estatistica0049(r, ref.silhuetas[g]!, rust.silhuetas[g]!, c, nomeada !== undefined);
    if (falhaExcecao) divergencias.push(`silhueta do grupo ${g}, exceção nomeada (${nomeada!.motivo}): o Rust não concorda com a união exata: ${falhaExcecao}`);
    else if (erro) divergencias.push(`silhueta do grupo ${g}: ${erro}`);
    else {
      if (nomeada) r.excecoesUsadas++;
      else if (c.erro) r.silhuetasForaDaTolerancia++;
      nota('silhueta', c);
      r.silhuetas++;
    }
  }
  return r;
}

