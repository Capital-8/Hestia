import { dist, type MultiPolygon } from '@hestia/geom';
import type { ResolvedRoof } from '@hestia/engine';
import { isRoof, type Project } from '@hestia/model';
import { boundaryKindsOf } from '@hestia/engine/src/roofShapes.ts';
import type { FloorOps } from './floors.ts';
import { corDaAresta, tomDaAgua } from './roofsAgua.ts';
import { arcoDoTelhado } from './roofsArco.ts';
import { gableSymbolOps } from './roofsEmpena.ts';
import type { EspessurasDoTelhado } from './roofsTracos.ts';
import type { PlanTheme, StrokeOp } from './types.ts';

/**
 * Opacidade do preenchimento leve da projeção. Baixa de propósito: a água fora do intervalo de vista só mostra a forma e
 * o tom por água, e o que está por baixo (paredes, grade) continua legível.
 */
export const PREENCHIMENTO_PROJECAO = 0.3;
/** Opacidade das linhas internas tracejadas: um pouco mais leves que o beiral, que é o contorno principal. */
export const ALPHA_LINHA_PROJECAO = 0.75;
/** Tracejado do beiral, da cumeeira, do espigão e do desnível (traço e vão, em px de tela). */
export const TRACO_PROJECAO: [number, number] = [6, 3];
/** Tracejado do rincão: pontilhado curto, para não confundir com a cumeeira. */
export const TRACO_RINCAO: [number, number] = [2, 2];

/**
 * Projeção de um telhado inteiro fora do intervalo de vista, com a opção "Projeção da cobertura" ligada: beiral tracejado
 * (como antes), linhas internas tracejadas finas, empena e desnível, e o preenchimento leve de cada água na cor do
 * material e no tom do telhado cortado. Sem seta de caimento, sem rótulo de área e sem hachura. `rica` = false (planta
 * de cobertura) deixa só o contorno. `coarse`: sem linhas internas (o grosseiro não tem símbolos).
 */
export function projecaoDoTelhado(
  r: ResolvedRoof,
  p: Project,
  foot: MultiPolygon,
  base: string,
  theme: PlanTheme,
  esp: EspessurasDoTelhado,
  sunAzimuth: number,
  scale: number,
  opts: { rica: boolean; coarse: boolean; prancha?: boolean },
): FloorOps {
  const out: FloorOps = { fills: [], strokes: [], labels: [] };
  // Beiral: o contorno tracejado de sempre, na tinta do tema (o teste de contorno continua valendo).
  out.strokes.push(...foot.flat().map((ring): StrokeOp => ({ pts: ring, closed: true, ...esp.projecao, color: theme.ink, alpha: 0.9, dash: TRACO_PROJECAO })));
  if (!opts.rica) return out;
  // Uma face por água, com o tom do telhado cortado (mesma luz do sol do 3D); sem hachura.
  for (const pl of r.planes) out.fills.push({ polygons: pl.polygon, color: opts.prancha ? base : tomDaAgua(base, pl.up, pl.percent, sunAzimuth), alpha: PREENCHIMENTO_PROJECAO });
  if (opts.coarse) return out;
  // Linhas internas na cor da aresta do próprio telhado, como no cortado. Arestas de um arco amostrado saem (não são divisa).
  const aresta = opts.prancha ? theme.ink : corDaAresta(base);
  const arco = arcoDoTelhado(p, r);
  for (const ln of r.lines) {
    if (ln.kind === 'eave' || arco.deArco(ln)) continue;
    if (ln.kind === 'gable') {
      // Empena: traço cheio na tinta, como no telhado cortado.
      out.strokes.push({ pts: [ln.a, ln.b], closed: false, ...esp.empena, color: theme.ink, alpha: 1 });
      continue;
    }
    // Cumeeira, espigão e desnível tracejados; o rincão com pontilhado para se distinguir.
    const dash = ln.kind === 'valley' ? TRACO_RINCAO : TRACO_PROJECAO;
    out.strokes.push({ pts: [ln.a, ln.b], closed: false, ...esp.projecao, color: aresta, alpha: ALPHA_LINHA_PROJECAO, dash });
  }
  // Símbolo de perfil de cada empena do contorno, como no cortado (um por aresta, não por trecho partido).
  const model = p.elements[r.roofId];
  if (isRoof(model)) {
    const kinds = boundaryKindsOf(model);
    model.boundary.forEach((a, i) => {
      const c = model.boundary[(i + 1) % model.boundary.length]!;
      if (kinds[i] !== 'gable' || dist(a, c) < 1e-6) return;
      out.strokes.push(...gableSymbolOps(a, c, foot, theme, esp.empena, scale));
    });
  }
  return out;
}
