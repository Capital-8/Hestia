import { type Vec2 } from './vec.ts';
import { polygonArea, ringArea } from './polygon.ts';
import { SkeletonFail } from './skeletonCore.ts';
import { setup } from './skeletonSetup.ts';
import { runSim } from './skeletonRun.ts';
import { buildOutput } from './skeletonFaces.ts';
import { findSteps, type SkeletonStep } from './skeletonContinuity.ts';
export type { SkeletonStep } from './skeletonContinuity.ts';

export interface SkeletonInput {
  outer: Vec2[];            // anel externo, sentido qualquer, sem repetir o 1º ponto
  holes: Vec2[][];          // anéis internos (claraboias/shafts), sentido qualquer
  /** Peso (razão de subida = inclinação/100) de cada aresta: weights[0] = arestas de outer (aresta i vai de outer[i] a outer[i+1]); weights[k+1] = arestas de holes[k]. Peso 0 = aresta que NÃO define inclinação (empena vertical). */
  weights: number[][];
}
export interface SkeletonFace {
  ring: number;             // 0 = externo, k+1 = furo k
  edge: number;             // índice da aresta no anel
  polygon: Vec2[];          // região em planta dessa água (anel simples, anti-horário)
  z: number[];              // altura (tempo) em cada vértice de polygon, na mesma ordem; z = peso × distância à reta da aresta
  holes?: Vec2[][];         // eventuais furos internos nesta face (sentido horário)
  holeZ?: number[][];       // alturas correspondentes aos vértices de `holes`
}
export interface SkeletonArc {
  a: Vec2; b: Vec2; za: number; zb: number;   // segmento do esqueleto (cumeeira/espigão/rincão) com as alturas nas pontas
  faces: [number, number];  // índices (em `faces`) das duas águas que ele separa
}
/**
 * `steps`: vértices onde as águas se encontram em cotas diferentes (degrau); geometria devolvida não muda.
 * `points`: onde a frente de onda não fecha, quando a falha tem lugar definido (ok falso).
 */
export interface SkeletonResult { faces: SkeletonFace[]; arcs: SkeletonArc[]; ok: boolean; reason?: string; steps?: SkeletonStep[]; points?: Vec2[] }

/** Metros com duas casas e vírgula decimal, como no resto da interface. */
// units-ok: o geom não conhece as unidades do projeto; é diagnóstico interno (planta em metros)
const fmtM = (v: number): string => v.toFixed(2).replace('.', ',');

/** Pontos em planta (m) em texto pt-BR, como "(5,50; 4,50)". Usado nos motivos de recusa do telhado. */
export const pointsText = (ps: Vec2[]): string => ps.map((p) => `(${fmtM(p.x)}; ${fmtM(p.y)})`).join(', ');

/**
 * Esqueleto reto com pesos de um polígono simples com furos.
 * Nunca lança exceção: entrada inválida ou falha de topologia vira { ok: false, reason }.
 */
export function weightedSkeleton(input: SkeletonInput): SkeletonResult {
  try {
    const { sim, leaders } = setup(input);
    runSim(sim);
    const out = buildOutput(sim, leaders);
    if (out.faces.length === 0) throw new SkeletonFail('nenhuma água gerada');
    // Pesos 0 são paredes verticais (sem área). Logo a soma das águas tem de ser a área líquida;
    // se não for, a topologia saiu errada e o resultado não pode ser entregue como válido.
    const net = Math.abs(ringArea(input.outer)) - input.holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
    const sum = out.faces.reduce((s, f) => s + polygonArea([f.polygon, ...(f.holes ?? [])]), 0);
    if (Math.abs(sum - net) > 1e-6 * Math.max(net, 1)) {
      throw new SkeletonFail('caso não suportado: a soma das águas não confere com a área do polígono');
    }
    // Soma certa não garante superfície contínua. Caso típico: vértice reentrante (ângulo > 180°) entre uma aresta
    // com inclinação (cota 0 nesse vértice, pois é beiral) e uma empena (sem água). Só a água do beiral chega ao vértice
    // com cota 0, e meio plano não cobre um ângulo > 180°; as outras águas dão cota > 0 ali. Não há superfície contínua
    // com águas planas nesse caso: a geometria é devolvida como está e os vértices com degrau vão em `steps`. O engine
    // avisa em telhado já existente e a criação ou alteração por esboço recusa, listando os pontos (roofCheck).
    // Medido em 400 contornos: todo contorno com esse vértice tem degrau; a
    // falha também ocorre em poucos casos com dois nulos no mesmo vértice reentrante (não analisados).
    const steps = findSteps([input.outer, ...input.holes], input.weights, out.faces);
    return { faces: out.faces, arcs: out.arcs, ok: true, steps };
  } catch (e) {
    const reason =
      e instanceof SkeletonFail ? e.message : `falha interna do esqueleto: ${e instanceof Error ? e.message : String(e)}`;
    const points = e instanceof SkeletonFail && e.at.length > 0 ? e.at : undefined;
    return { faces: [], arcs: [], ok: false, reason, ...(points ? { points } : {}) };
  }
}
