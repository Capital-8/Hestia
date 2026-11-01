/**
 * Casos e comparação canônica do harness diferencial do kernel geométrico. Fonte única do teste
 * (`equivalencia.test.ts`) e do relatório (`scripts/wasm-equivalencia.mjs`). Nada aqui importa de
 * outro pacote do monorepo: o `geom` não pode depender de `model`/`engine`.
 *
 * Referência: o caminho Clipper de `boolean.ts` (1 µm, non-zero, anel externo primeiro). Como
 * `union`/`intersection`/`difference` tentam `polygon-clipping` (1e-7) antes, diferenças de ~1 µm
 * nesses três são esperadas; `unionClipper`/`differenceClipper`/`offsetMulti` devem ser quase exatos.
 *
 * Canônico: descartar |área| < 1e-12, ordenar anéis por |área| e polígonos por (área, centróide);
 * comparar contagens, área total (1e-5 m² + 1e-6 rel.), topologia por 200 pontos LCG (ignorando a
 * faixa de 1 µm junto às arestas, onde o teste de ponto é ambíguo) e perímetro (1e-4 m). Ordem de
 * grandeza: 1e-5 m² ≈ 0,5 µm de quantização ao longo de 10 m; 1e-4 m ≈ 200 vértices × 0,5 µm.
 */
import { difference, differenceClipper, intersection, offsetMulti, union, unionClipper } from '../boolean.ts';
import { ErroNaoImplementado, type ImplKernel } from './contrato.ts';
import {
  boxOf,
  multiArea,
  multiPoints,
  pointInMulti,
  polygonArea,
  ringArea,
  type Box,
  type MultiPolygon,
  type Polygon,
  type Ring,
} from '../polygon.ts';
import type { Vec2 } from '../vec.ts';

export type TipoOperacao = 'union' | 'intersection' | 'difference' | 'unionClipper' | 'differenceClipper' | 'offsetMulti';

/** Uma operação com os argumentos já resolvidos; `delta` só vale para `offsetMulti`. */
export interface OperacaoFixture {
  readonly tipo: TipoOperacao;
  readonly args: readonly MultiPolygon[];
  readonly delta?: number;
}

export interface CasoFixture {
  readonly id: string;
  readonly descricao: string;
  readonly operandos: readonly MultiPolygon[];
  readonly operacoes: readonly OperacaoFixture[];
}

export interface Divergencia {
  readonly caso: string;
  readonly operacao: string;
  readonly motivo: string;
  readonly delta: string;
}

/** Anéis menores que isso são ruído numérico da operação, não geometria. */
export const AREA_MINIMA = 1e-12;
export const TOL_AREA_ABS = 1e-5;
export const TOL_AREA_REL = 1e-6;
export const TOL_PERIMETRO = 1e-4;
export const AMOSTRAS = 200;
export const SEMENTE_AMOSTRAGEM = 0x5eed_1234;
/** Faixa de borda ignorada na topologia: 1 µm, a tolerância de coordenada do experimento. */
export const TOL_BORDA = 1e-6;
const SEMENTE_CASOS = 0x4845_5354;

const pt = (x: number, y: number): Vec2 => ({ x, y });

/** Retângulo alinhado aos eixos, anti-horário, sem repetir o primeiro ponto. */
const ret = (x: number, y: number, w: number, h: number): Ring => [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)];

const parede = (x: number, y: number, w: number, h: number): MultiPolygon => [[ret(x, y, w, h)]];

/** Retângulo com `n` vértices colineares extras no meio da aresta de baixo (stress de simplificação). */
function retComVertices(x: number, y: number, w: number, h: number, n: number): Ring {
  const ring: Ring = [pt(x, y)];
  for (let i = 1; i <= n; i++) ring.push(pt(x + (w * i) / (n + 1), y));
  ring.push(pt(x + w, y), pt(x + w, y + h), pt(x, y + h));
  return ring;
}

const DELTAS = [0.01, -0.01, 0.1, -0.1] as const;

/** Todas as operações aplicáveis a um caso com pelo menos dois operandos. */
function operacoesDe(operandos: readonly MultiPolygon[]): OperacaoFixture[] {
  const a = operandos[0]!;
  const b = operandos[1]!;
  const todos = [...operandos];
  return [
    { tipo: 'union', args: [...todos] },
    { tipo: 'unionClipper', args: [...todos] },
    { tipo: 'difference', args: [...todos] },
    { tipo: 'differenceClipper', args: [...todos] },
    { tipo: 'intersection', args: [a, b] },
    ...DELTAS.map((delta): OperacaoFixture => ({ tipo: 'offsetMulti', args: [a], delta })),
  ];
}

function caso(id: string, descricao: string, operandos: readonly MultiPolygon[]): CasoFixture {
  return { id, descricao, operandos, operacoes: operacoesDe(operandos) };
}

/** Gerador determinístico (LCG de Numerical Recipes). Nunca use `Math.random` aqui. */
export function criarLcg(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (Math.imul(1664525, estado) + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

/** Polígono estrelado simples (ângulos crescentes): nunca se autointersecta. */
function poligonoAleatorio(rnd: () => number, cx: number, cy: number, raio: number): Ring {
  const n = 3 + Math.floor(rnd() * 10);
  const passo = (Math.PI * 2) / n;
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const angulo = i * passo + passo * (0.15 + 0.7 * rnd());
    const r = raio * (0.45 + 0.55 * rnd());
    ring.push(pt(cx + Math.cos(angulo) * r, cy + Math.sin(angulo) * r));
  }
  return ring;
}

function casoGerado(indice: number, rnd: () => number): CasoFixture {
  const cx = 3 + rnd() * 14;
  const cy = 3 + rnd() * 14;
  const raio = 0.5 + rnd() * 2.3;
  const largura = 0.3 + rnd() * 3.7;
  const altura = 0.15 + rnd() * 2;
  const a = indice % 3 === 0 ? ret(cx - largura / 2, cy - altura / 2, largura, altura) : poligonoAleatorio(rnd, cx, cy, raio);
  const deslocamento = 0.2 + rnd() * raio * 1.2;
  const angulo = rnd() * Math.PI * 2;
  const cx2 = Math.min(17, Math.max(3, cx + Math.cos(angulo) * deslocamento));
  const cy2 = Math.min(17, Math.max(3, cy + Math.sin(angulo) * deslocamento));
  const b =
    indice % 4 === 0
      ? ret(cx2 - 1, cy2 - 0.1, 2 + rnd() * 1.5, 0.15 + rnd() * 0.25)
      : poligonoAleatorio(rnd, cx2, cy2, 0.5 + rnd() * 2.3);
  return caso(`gerado-${String(indice).padStart(2, '0')}`, `Sorteio determinístico ${indice} (3–12 vértices, 0–20 m)`, [
    [[a]],
    [[b]],
  ]);
}

const CASOS_ARTESANAIS: readonly CasoFixture[] = [
  caso('disjuntos', 'Duas paredes disjuntas, vão de 0,5 m', [parede(0, 0, 4, 0.15), parede(4.5, 0, 4, 0.15)]),
  caso('sobrepostos', 'Duas paredes sobrepostas em 2 m', [parede(0, 0, 4, 0.15), parede(2, 0, 4, 0.15)]),
  caso('furo', 'Abertura de 1×1 m dentro de painel de 6×4 m (furo)', [parede(0, 0, 6, 4), parede(2.5, 1.5, 1, 1)]),
  caso('juncao-L', 'Junção em L: parede longa + parede curta no canto', [parede(0, 0, 3, 0.15), parede(0, 0, 0.15, 2.4)]),
  caso('juncao-T', 'Junção em T: parede transversal encostada no meio da longa', [
    parede(0, 0, 3, 0.15),
    parede(1.4, -1.2, 0.15, 1.35),
  ]),
  caso('cruzamento', 'Cruzamento de paredes em +', [parede(0, 1.9, 4, 0.2), parede(1.9, 0, 0.2, 4)]),
  caso('micro-2um', 'Dois painéis quase coincidentes, deslocados 2 µm × 1 µm', [
    parede(0, 0, 2, 2),
    parede(0.000002, 0.000001, 2, 2),
  ]),
  caso('micro-5um', 'Dois painéis quase coincidentes, deslocados 5 µm × 3 µm', [
    parede(0, 0, 2, 2),
    parede(0.000005, -0.000003, 2, 2),
  ]),
  caso('acabamento-fino', 'Parede de 20 m com camada de acabamento de 1 cm sobreposta', [
    parede(0, 0, 20, 0.2),
    parede(2, 0, 3, 0.01),
  ]),
  caso('parede-longa', 'Parede longa de 20 m com camada fina encostada na face', [parede(0, 0, 20, 0.15), parede(0.05, 0.15, 20, 0.01)]),
  caso('muitos-vertices', 'Retângulo com 200 vértices colineares no meio de uma aresta', [
    [[retComVertices(0, 0, 6, 0.2, 200)]],
    parede(1, -0.05, 2, 0.3),
  ]),
];

const rndCasos = criarLcg(SEMENTE_CASOS);
const CASOS_GERADOS = Array.from({ length: 10 }, (_, i) => casoGerado(i + 1, rndCasos));

/** Todos os casos, na ordem estável em que são executados e reportados. */
export const CASOS: readonly CasoFixture[] = [...CASOS_ARTESANAIS, ...CASOS_GERADOS];

/** Executa a operação pelo caminho TypeScript de referência (`boolean.ts` direto, sem o seam). */
export function executarTs(op: OperacaoFixture): MultiPolygon {
  switch (op.tipo) {
    case 'union':
      return union(...op.args);
    case 'unionClipper':
      return unionClipper(...op.args);
    case 'difference':
      return difference(op.args[0]!, ...op.args.slice(1));
    case 'differenceClipper':
      return differenceClipper(op.args[0]!, ...op.args.slice(1));
    case 'intersection':
      return intersection(op.args[0]!, op.args[1]!);
    case 'offsetMulti':
      return offsetMulti(op.args[0]!, op.delta ?? 0);
  }
}

/** Executa a operação pelo kernel, com o mesmo mapeamento de `operacoesKernel.ts`. */
export function executarKernel(impl: ImplKernel, op: OperacaoFixture): MultiPolygon {
  switch (op.tipo) {
    case 'union':
    case 'unionClipper':
      return impl.uniao([...op.args]);
    case 'difference':
    case 'differenceClipper':
      return impl.diferenca([...op.args]);
    case 'intersection':
      return impl.interseccao(op.args[0]!, op.args[1]!);
    case 'offsetMulti':
      return impl.offset(op.args[0]!, op.delta ?? 0);
  }
}

export function rotuloOperacao(op: OperacaoFixture): string {
  if (op.tipo === 'offsetMulti') {
    const delta = op.delta ?? 0;
    return `offsetMulti(${delta >= 0 ? '+' : ''}${delta})`;
  }
  return op.args.length > 2 ? `${op.tipo}×${op.args.length}` : op.tipo;
}

/** "Não implementada" é cobertura declarada; o `name` cobre instância nativa duplicada. */
export function ehNaoImplementada(e: unknown): boolean {
  return e instanceof ErroNaoImplementado || (e instanceof Error && e.name === 'ErroNaoImplementado');
}

function semPontoFinal(r: Ring): Ring {
  const n = r.length;
  if (n < 2) return [...r];
  const primeiro = r[0]!;
  const ultimo = r[n - 1]!;
  return primeiro.x === ultimo.x && primeiro.y === ultimo.y ? r.slice(0, n - 1) : [...r];
}

/** Centróide de um anel pela fórmula de área assinada (independe da orientação). */
function centroideDoAnel(r: Ring): Vec2 {
  let soma = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    const cruz = p.x * q.y - q.x * p.y;
    soma += cruz;
    cx += (p.x + q.x) * cruz;
    cy += (p.y + q.y) * cruz;
  }
  if (Math.abs(soma) < 1e-15) {
    let sx = 0;
    let sy = 0;
    for (const p of r) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / r.length, y: sy / r.length };
  }
  return { x: cx / (3 * soma), y: cy / (3 * soma) };
}

/** Centróide líquido do polígono: externo positivo, furos negativos. */
function centroide(p: Polygon): Vec2 {
  let area = 0;
  let sx = 0;
  let sy = 0;
  p.forEach((r, i) => {
    const sinal = i === 0 ? 1 : -1;
    const a = Math.abs(ringArea(r));
    const c = centroideDoAnel(r);
    area += sinal * a;
    sx += sinal * a * c.x;
    sy += sinal * a * c.y;
  });
  if (Math.abs(area) < AREA_MINIMA) {
    const externo = p[0]!;
    return centroideDoAnel(externo);
  }
  return { x: sx / area, y: sy / area };
}

/** Normalização canônica: sem anéis degenerados, anéis e polígonos em ordem determinística. */
export function normalizar(m: MultiPolygon): MultiPolygon {
  const poligonos: Array<{ p: Polygon; area: number; c: Vec2 }> = [];
  for (const p of m) {
    const aneis = p
      .map(semPontoFinal)
      .filter((r) => r.length >= 3 && Math.abs(ringArea(r)) >= AREA_MINIMA)
      .sort((x, y) => Math.abs(ringArea(y)) - Math.abs(ringArea(x)));
    if (aneis.length === 0) continue;
    const poligono: Polygon = aneis;
    poligonos.push({ p: poligono, area: polygonArea(poligono), c: centroide(poligono) });
  }
  poligonos.sort((x, y) => y.area - x.area || x.c.x - y.c.x || x.c.y - y.c.y);
  return poligonos.map((d) => d.p);
}

export function areaLiquida(m: MultiPolygon): number {
  return multiArea(normalizar(m));
}

/** Perímetro total (soma de todos os anéis, furos inclusive), em metros. */
export function perimetro(m: MultiPolygon): number {
  let total = 0;
  for (const p of m) {
    for (const r of p) {
      for (let i = 0; i < r.length; i++) {
        const a = r[i]!;
        const b = r[(i + 1) % r.length]!;
        total += Math.hypot(b.x - a.x, b.y - a.y);
      }
    }
  }
  return total;
}

/** Caixa comum aos dois resultados: os mesmos 200 pontos são testados nos dois lados. */
function caixaComum(a: MultiPolygon, b: MultiPolygon): Box | null {
  const pontos = [...multiPoints(a), ...multiPoints(b)];
  return pontos.length === 0 ? null : boxOf(pontos);
}

/** Distância de um ponto a um segmento. */
function distanciaAoSegmento(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  const t = comprimento2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Menor distância do ponto a qualquer aresta do multipolígono (∞ se vazio). */function distanciaAteMalha(p: Vec2, m: MultiPolygon): number {
  let menor = Infinity;
  for (const poli of m) {
    for (const anel of poli) {
      for (let i = 0; i < anel.length; i++) {
        menor = Math.min(menor, distanciaAoSegmento(p, anel[i]!, anel[(i + 1) % anel.length]!));
      }
    }
  }
  return menor;
}

function num(n: number): string {
  return Math.abs(n) >= 1e-4 ? n.toFixed(6) : n.toExponential(3);
}

/** Compara de forma canônica: devolve todas as divergências, uma por métrica. Nunca lança. */
export function compararResultados(caso: string, operacao: string, referencia: MultiPolygon, kernel: MultiPolygon): Divergencia[] {
  const divergencias: Divergencia[] = [];
  const a = normalizar(referencia);
  const b = normalizar(kernel);

  if (a.length !== b.length) {
    divergencias.push({ caso, operacao, motivo: 'nº de polígonos', delta: `${a.length} != ${b.length}` });
  } else {
    const aneisA = a.map((p) => p.length);
    const aneisB = b.map((p) => p.length);
    const i = aneisA.findIndex((n, k) => n !== aneisB[k]);
    if (i >= 0) {
      divergencias.push({ caso, operacao, motivo: `nº de anéis (polígono ${i})`, delta: `${aneisA[i]} != ${aneisB[i]}` });
    }
  }

  const areaA = multiArea(a);
  const areaB = multiArea(b);
  const tolArea = TOL_AREA_ABS + TOL_AREA_REL * Math.max(Math.abs(areaA), Math.abs(areaB));
  if (Math.abs(areaA - areaB) > tolArea) {
    divergencias.push({ caso, operacao, motivo: 'área líquida', delta: `${num(areaB - areaA)} (tol ${num(tolArea)})` });
  }

  const caixa = caixaComum(a, b);
  if (caixa !== null) {
    const rnd = criarLcg(SEMENTE_AMOSTRAGEM);
    const largura = caixa.maxX - caixa.minX;
    const altura = caixa.maxY - caixa.minY;
    let desacordos = 0;
    let naFaixaDeBorda = 0;
    for (let k = 0; k < AMOSTRAS; k++) {
      const alvo: Vec2 = { x: caixa.minX + rnd() * largura, y: caixa.minY + rnd() * altura };
      if (pointInMulti(alvo, a) === pointInMulti(alvo, b)) continue;
      // Discordância a menos de 1 µm de uma aresta é ambígua: a coordenada está na tolerância do
      // experimento, não é mudança de topologia.
      if (Math.min(distanciaAteMalha(alvo, a), distanciaAteMalha(alvo, b)) <= TOL_BORDA) {
        naFaixaDeBorda++;
        continue;
      }
      desacordos++;
    }
    if (desacordos > 0) {
      const extra = naFaixaDeBorda > 0 ? `, ${naFaixaDeBorda} na faixa de borda` : '';
      divergencias.push({ caso, operacao, motivo: 'topologia (amostragem)', delta: `${desacordos}/${AMOSTRAS} pontos${extra}` });
    }
  }

  const perA = perimetro(a);
  const perB = perimetro(b);
  if (Math.abs(perA - perB) > TOL_PERIMETRO) {
    divergencias.push({ caso, operacao, motivo: 'perímetro', delta: `${num(perB - perA)} (tol ${num(TOL_PERIMETRO)})` });
  }

  return divergencias;
}

/** Tabela legível para a mensagem de falha; limita a 60 linhas para não afogar o terminal. */
export function formatarDivergencias(divergencias: readonly Divergencia[]): string {
  if (divergencias.length === 0) return 'Nenhuma divergência.';
  const limite = 60;
  const visiveis = divergencias.slice(0, limite);
  const colunas = ['caso', 'operação', 'motivo', 'delta'] as const;
  const celulas = visiveis.map((d): string[] => [d.caso, d.operacao, d.motivo, d.delta]);
  const larguras = colunas.map((c, i) => Math.max(c.length, ...celulas.map((l) => l[i]!.length)));
  const linha = (l: readonly string[]): string => `| ${l.map((c, i) => c.padEnd(larguras[i]!)).join(' | ')} |`;
  const separador = `| ${larguras.map((w) => '-'.repeat(w)).join(' | ')} |`;
  const resto = divergencias.length > limite ? `\n… e mais ${divergencias.length - limite} divergência(s).` : '';
  return [`${divergencias.length} divergência(s):`, '', linha(colunas), separador, ...visiveis.map((d) => linha([d.caso, d.operacao, d.motivo, d.delta]))].join(
    '\n',
  ) + resto;
}
