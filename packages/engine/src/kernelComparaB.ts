// Comparação da sub-etapa B1 (decisão 0050 §3): `pisos_lajes_nivel` do Rust x `resolveFloors`/`resolveSlabs` do motor TypeScript.
//
// Identidade, ordem, ids e campos escalares (cotas, prioridade, inclinação) a 1e-6; polígonos por canonicalização (união exata) e diferença
// simétrica sob 1e-6 m², com a mesma topologia nos componentes significativos (0049). A tolerância NÃO se afrouxa para passar: a decisão 0049 // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
// (limite por perímetro) só entra quando `k0049` é dado, e então cada uso é contado e o maior K observado é devolvido.
//
// Camadas com `pedeParedes` (o término depende das paredes do nível; chegam na B2): o Rust devolve a região SEM paredes e o TS a região com
// paredes. Com `contencao` essas camadas são comparadas por contenção (a região do TS cabe na do Rust, ou o inverso quando o término soma as
// paredes); sem `contencao` (projeto sem paredes) são comparadas como as demais.
import { difference, intersection, type MultiPolygon } from '@hestia/geom';
import { areaDaForma, canonica, compararFormas } from './kernelComparaA2.ts';
import { LIMIAR_FIAPO, perimetroDaForma, resultadoRustValido, topologia0049 } from './kernelComparaA3c.ts';
import type { ElementoB1 } from './kernelB.ts';

export const TOLERANCIA_B1 = 1e-6;
/** Guarda de erro grosseiro da 0049 (m²) para o polígono de um elemento ou de uma camada. */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
export const ERRO_GROSSEIRO_B1 = 1e-2;

export interface OpcoesCompararB1 {
  /** Camadas com `pedeParedes` do Rust: comparar por contenção em vez de igualdade. */
  contencao?: boolean;
  /** `K` da 0049 (limite `1e-5 + K x perímetro x 1e-6`); sem valor, só vale a tolerância geral (1e-6 m²). */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  k0049?: number;
  maxDivergencias?: number;
}

export interface DetalheB1 {
  /** Índice do elemento na lista e da camada (ou `null` quando a divergência é do elemento). */
  elemento: number;
  camada: number | null;
  mensagem: string;
}

export interface ComparacaoB1 {
  divergencias: string[];
  /** As mesmas divergências, com o elemento e a camada em que ocorreram. */
  detalhes: DetalheB1[];
  pisos: number;
  lajes: number;
  lajesInclinadas: number;
  camadas: number;
  membranas: number;
  explicitas: number;
  /** Elementos com `problema` diferente de zero. */
  comProblema: number;
  poligonos: number;
  /** Polígonos iguais vértice a vértice (1e-6) depois da canonicalização. */
  estritos: number;
  /** Camadas com `pedeParedes` comparadas por contenção. */
  porContencao: number;
  /** Camadas com `pedeParedes` do Rust cujo polígono, mesmo assim, é igual ao do TS. */
  pedeParedesIguais: number;
  /** Polígonos que passaram só pela 0049 (a regra geral reprovaria). */
  pela0049: number;
  /** Maior diferença simétrica (m²) e maior razão `max(dArea, sim) / (perímetro x 1e-6)` entre os polígonos comparados por igualdade. */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  maxSimetrica: number;
  maxK: number;
  desvioMaximo: number;
  /** 0049, regra 2: componentes sem par (todos, acima do fiapo e acima de 1e-3 m²), resolvidos pela equivalência, e fiapos. */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  semPar: SemParB1;
}

const simetrica = (a: MultiPolygon, b: MultiPolygon): number => areaDaForma(a.length && b.length ? difference(a, b) : a) + areaDaForma(a.length && b.length ? difference(b, a) : b);

/** Área de `a` que não está em `b`. */
const foraDe = (a: MultiPolygon, b: MultiPolygon): number => areaDaForma(a.length && b.length ? difference(a, b) : a);

/** Componentes sem par de um polígono (0049, regra 2): todos, e os que a verificação de equivalência resolve (acima do fiapo). */
export interface SemParB1 {
  n: number;
  max: number;
  acima1e4: number;
  acima1e3: number;
  resolvidos: number;
  resolvidoMax: number;
  fiapos: number;
}
const semParZero = (): SemParB1 => ({ n: 0, max: 0, acima1e4: 0, acima1e3: 0, resolvidos: 0, resolvidoMax: 0, fiapos: 0 });

export interface PoligonoCmp {
  semPar: SemParB1;
  erro: string | null;
  estrito: boolean;
  sim: number;
  dArea: number;
  k: number;
  pela0049: boolean;
}

/** Igualdade de dois polígonos (regra geral de 1e-6 m² e, com `k0049`, a 0049). */ // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
export function poligonoIgualB1(ts: MultiPolygon, rust: MultiPolygon, k0049?: number): PoligonoCmp {
  const dArea = Math.abs(areaDaForma(ts) - areaDaForma(rust));
  const sim = simetrica(ts, rust);
  const perimetro = Math.max(perimetroDaForma(ts), perimetroDaForma(rust));
  const k = perimetro > 0 ? Math.max(dArea, sim) / (perimetro * 1e-6) : 0;
  const estrito = !compararFormas(canonica(ts), canonica(rust), TOLERANCIA_B1, TOLERANCIA_B1).erro;
  const topo = topologia0049(ts, rust);
  const semPar = semParZero();
  const base = { estrito, sim, dArea, k, semPar };
  if (k0049 !== undefined) {
    // 0049: limite por perímetro (regra 3), guarda grosseira (regra 4) e topologia só nos componentes acima do fiapo (regra 2).
    const limite = 1e-5 + k0049 * perimetro * 1e-6;
    if (Math.max(dArea, sim) > ERRO_GROSSEIRO_B1) return { ...base, erro: `erro grosseiro: |d| = ${dArea}, simétrica ${sim} (guarda ${ERRO_GROSSEIRO_B1})`, pela0049: false };
    if (dArea > limite || sim > limite) return { ...base, erro: `fora do limite da 0049 (${limite}): |d| = ${dArea}, simétrica ${sim}; K ${k}; perímetro ${perimetro}`, pela0049: false };
    semPar.fiapos = topo.fiapos;
    // Equivalência de um componente sem par: ele existe também na forma do outro lado, só com outra representação (peças que se tocam em ponto x uma só).
    const equivalente = (x: (typeof topo.semPar)[number]): boolean => {
      const outro = x.lado === 'TS' ? rust : ts;
      const dentro = outro.length ? areaDaForma(intersection(x.poly, outro)) : 0;
      return x.tipo === 'furo' ? dentro <= limite : x.area - dentro <= limite;
    };
    const grandes = [];
    for (const x of topo.semPar) {
      semPar.n++;
      semPar.max = Math.max(semPar.max, x.area);
      if (x.area > LIMIAR_FIAPO) semPar.acima1e4++;
      if (x.area > 1e-3) semPar.acima1e3++;
      if (x.area > LIMIAR_FIAPO) {
        if (equivalente(x)) {
          semPar.resolvidos++;
          semPar.resolvidoMax = Math.max(semPar.resolvidoMax, x.area);
        } else grandes.push(x);
      }
    }
    // 0049, "Topologia equivalente por região" (2026-11-05): topologia diferente é aceita pela REGIÃO (a área simétrica já está dentro de
    // `limite`, acima), e só se o resultado do Rust for válido. Sem topologia diferente, componente sem par acima do fiapo continua a falhar.
    const difTopo = topo.ts !== topo.rust;
    if (difTopo && !resultadoRustValido(rust)) return { ...base, erro: `topologia ${topo.rust} (Rust) x ${topo.ts} (TS): resultado do Rust inválido (anel que se cruza ou repete vértice, ou furo fora do contorno); sem comparação por região`, pela0049: false };
    if (grandes.length && !difTopo) return { ...base, erro: `topologia ${topo.rust} (Rust) x ${topo.ts} (TS); sem par acima de ${LIMIAR_FIAPO} e fora da equivalência: ${grandes.map((x) => `${x.tipo} ${x.area} [${x.lado}]`).join('; ')}`, pela0049: false };
    const geral = dArea <= TOLERANCIA_B1 && sim <= TOLERANCIA_B1 && topo.ts === topo.rust;
    return { ...base, erro: null, pela0049: !geral };
  }
  if (dArea <= TOLERANCIA_B1 && sim <= TOLERANCIA_B1) {
    // topologia nos componentes significativos
    if (topo.ts !== topo.rust) return { ...base, erro: `topologia ${topo.rust} (Rust) x ${topo.ts} (TS), peças/furos acima do fiapo`, pela0049: false };
    return { ...base, erro: null, pela0049: false };
  }
  if (k0049 === undefined) return { ...base, erro: `área ${areaDaForma(rust)} (Rust) x ${areaDaForma(ts)} (TS), |d| = ${dArea}; diferença simétrica ${sim} m² (tolerância ${TOLERANCIA_B1})`, pela0049: false }; // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
  const limite = 1e-5 + k0049 * perimetro * 1e-6;
  if (Math.max(dArea, sim) > ERRO_GROSSEIRO_B1) return { ...base, erro: `erro grosseiro: |d| = ${dArea}, simétrica ${sim} (guarda ${ERRO_GROSSEIRO_B1})`, pela0049: false };
  if (dArea > limite || sim > limite) return { ...base, erro: `fora do limite da 0049 (${limite}): |d| = ${dArea}, simétrica ${sim}`, pela0049: false };
  if (topo.ts !== topo.rust) return { ...base, erro: `0049: topologia ${topo.rust} (Rust) x ${topo.ts} (TS)`, pela0049: false };
  return { ...base, erro: null, pela0049: true };
}

/** Compara a saída do Rust (`rust`) com a referência (`ref`), elemento a elemento e camada a camada. */
export function compararB1(ref: ElementoB1[], rust: ElementoB1[], opcoes: OpcoesCompararB1 = {}): ComparacaoB1 {
  const max = opcoes.maxDivergencias ?? 20;
  const r: ComparacaoB1 = { divergencias: [], detalhes: [], pisos: 0, lajes: 0, lajesInclinadas: 0, camadas: 0, membranas: 0, explicitas: 0, comProblema: 0, poligonos: 0, estritos: 0, porContencao: 0, pedeParedesIguais: 0, pela0049: 0, maxSimetrica: 0, maxK: 0, desvioMaximo: 0, semPar: semParZero() };
  let atual: { elemento: number; camada: number | null } = { elemento: -1, camada: null };
  const falha = (m: string): void => {
    if (r.divergencias.length >= max) return;
    r.divergencias.push(m);
    r.detalhes.push({ ...atual, mensagem: m });
  };
  const chave = (e: ElementoB1): string => `${e.laje ? 'laje' : 'piso'} ${e.id}`;
  if (ref.length !== rust.length) {
    falha(`${rust.length} elementos (Rust: ${rust.map(chave).join(', ')}) x ${ref.length} (TS: ${ref.map(chave).join(', ')})`);
    return r;
  }
  const num = (rotulo: string, a: number, b: number): void => {
    const d = Math.abs(a - b);
    r.desvioMaximo = Math.max(r.desvioMaximo, Number.isNaN(d) ? Infinity : d);
    if (!(d <= TOLERANCIA_B1)) falha(`${rotulo}: ${b} (Rust) x ${a} (TS)`);
  };
  const poligono = (rotulo: string, a: MultiPolygon, b: MultiPolygon): void => {
    const c = poligonoIgualB1(a, b, opcoes.k0049);
    r.poligonos++;
    if (c.estrito) r.estritos++;
    if (c.pela0049) r.pela0049++;
    r.maxSimetrica = Math.max(r.maxSimetrica, c.sim);
    r.maxK = Math.max(r.maxK, c.k);
    for (const campo of ['n', 'acima1e4', 'acima1e3', 'resolvidos', 'fiapos'] as const) r.semPar[campo] += c.semPar[campo];
    r.semPar.max = Math.max(r.semPar.max, c.semPar.max);
    r.semPar.resolvidoMax = Math.max(r.semPar.resolvidoMax, c.semPar.resolvidoMax);
    if (c.erro) falha(`${rotulo}: ${c.erro}`);
  };
  ref.forEach((a, i) => {
    const b = rust[i]!;
    const nome = `elemento ${i} (${chave(a)})`;
    atual = { elemento: i, camada: null };
    if (a.laje !== b.laje || a.id !== b.id) {
      falha(`${nome}: identidade ${chave(b)} (Rust)`);
      return;
    }
    if (a.laje) {
      r.lajes++;
      if (a.inclinacao) r.lajesInclinadas++;
    } else r.pisos++;
    if (a.problema !== 0) r.comProblema++;
    if (a.tipo !== b.tipo) falha(`${nome}: tipo ${b.tipo} (Rust) x ${a.tipo} (TS)`);
    if (a.problema !== b.problema) falha(`${nome}: problema ${b.problema} (Rust) x ${a.problema} (TS)`);
    num(`${nome}: topo`, a.topoZ, b.topoZ);
    num(`${nome}: base`, a.baseZ, b.baseZ);
    if ((a.inclinacao === null) !== (b.inclinacao === null)) falha(`${nome}: inclinação ${JSON.stringify(b.inclinacao)} (Rust) x ${JSON.stringify(a.inclinacao)} (TS)`);
    else if (a.inclinacao && b.inclinacao) {
      num(`${nome}: inclinação ox`, a.inclinacao.origem.x, b.inclinacao.origem.x);
      num(`${nome}: inclinação oy`, a.inclinacao.origem.y, b.inclinacao.origem.y);
      num(`${nome}: inclinação dx`, a.inclinacao.direcao.x, b.inclinacao.direcao.x);
      num(`${nome}: inclinação dy`, a.inclinacao.direcao.y, b.inclinacao.direcao.y);
      num(`${nome}: inclinação %`, a.inclinacao.percentual, b.inclinacao.percentual);
    }
    poligono(`${nome}: polígono`, a.poligono, b.poligono);
    if (a.camadas.length !== b.camadas.length) {
      falha(`${nome}: ${b.camadas.length} camadas (Rust) x ${a.camadas.length} (TS)`);
      return;
    }
    a.camadas.forEach((ca, k) => {
      const cb = b.camadas[k]!;
      const cn = `${nome}, camada ${k}`;
      atual = { elemento: i, camada: k };
      r.camadas++;
      if (ca.membrana) r.membranas++;
      if (ca.explicita) r.explicitas++;
      for (const campo of ['indice', 'material', 'nucleo', 'membrana', 'explicita'] as const) if (ca[campo] !== cb[campo]) falha(`${cn}: ${campo} ${cb[campo]} (Rust) x ${ca[campo]} (TS)`);
      num(`${cn}: z0`, ca.z0, cb.z0);
      num(`${cn}: z1`, ca.z1, cb.z1);
      num(`${cn}: prioridade`, ca.prioridade, cb.prioridade);
      if (cb.pedeParedes && opcoes.contencao) {
        r.porContencao++;
        const noRust = foraDe(ca.poligono, cb.poligono);
        const noTs = foraDe(cb.poligono, ca.poligono);
        if (noRust <= TOLERANCIA_B1 && noTs <= TOLERANCIA_B1) r.pedeParedesIguais++;
        // o término de paredes só tira região (face, núcleo, ate) ou só soma (passa em vinculado): um lado cabe no outro
        else if (noRust > TOLERANCIA_B1 && noTs > TOLERANCIA_B1) falha(`${cn}: término de paredes, nenhum polígono contém o outro (TS fora do Rust ${noRust} m², Rust fora do TS ${noTs} m²)`); // units-ok: diagnóstico do kernel (tolerância em metros quadrados), não é texto de interface
      } else {
        if (cb.pedeParedes) r.pedeParedesIguais++;
        poligono(`${cn}: polígono`, ca.poligono, cb.poligono);
      }
    });
  });
  return r;
}
