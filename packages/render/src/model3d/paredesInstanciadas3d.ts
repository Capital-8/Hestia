import { fuseBands, wallLayerBandsAfterJunction, type JunctionLevel, type LayerBand, type ResolvedLevel } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { arestasDasCaixas, folgaEntreCaixas, matrizDaCaixa, retanguloDoAnel, TOLERANCIA_CAIXA, type CaixaPlanta, type MatrizCaixa } from './caixas3d.ts';
import { arestasDaUniao } from './arestasDaUniao3d.ts';
import { appendSolid, batchOf, wallLayerSolid, type SolidBatch } from './solids.ts';

/**
 * Paredes retas como caixas parametrizadas (desempenho 3D). A camada de parede que, depois da junção, é só prismas
 * retangulares planos (início, fim, espessura, altura e cota) vira uma caixa por prisma: a CPU entrega os parâmetros e a GPU
 * expande a caixa unitária (ver `caixas3d.ts`). Os cortes da junção e os vãos de esquadria já vêm nas faixas da camada
 * (`wallLayerBandsAfterJunction`), então cada pedaço que sobra é uma caixa. O que não é assim (topo inclinado, canto em
 * esquadria que não é retângulo, furo, peças que se sobrepõem) segue como geometria, pelo mesmo caminho de antes.
 */

/** Uma caixa de parede: de qual parede, de qual material e a matriz que a leva ao mundo. */
export interface CaixaDeParede {
  wallId: Id;
  materialId: Id;
  matriz: MatrizCaixa;
}

/** Resultado das paredes de um nível: os lotes de geometria (o que não virou caixa), as caixas e as arestas delas. */
export interface ParedesDoNivel {
  batches: SolidBatch[];
  caixas: CaixaDeParede[];
  arestas: number[];
  /** As mesmas arestas, por parede (para trocar só as de uma parede). */
  arestasPorParede: Map<Id, number[]>;
}

/** Uma camada em caixas: as matrizes e, quando as arestas são pedidas, as arestas da camada (pares de pontos). */
export interface CamadaEmCaixas {
  matrizes: MatrizCaixa[];
  arestas: number[];
}

/**
 * As caixas de uma camada a partir das suas faixas (já fundidas), ou null se a camada tem de ficar como geometria: faixa
 * inclinada, polígono que não é retângulo, furo, peça fina demais, peças que se sobrepõem. Com `comArestas`, as arestas saem
 * da união das caixas (`arestasDaUniao`: sem as juntas entre peças, como na geometria fundida); se as caixas não são uma
 * extrusão comum, a camada também fica como geometria.
 */
export function caixasDaCamada(bands: readonly LayerBand[], baseZ: number, comArestas: boolean): CamadaEmCaixas | null {
  const caixas: CaixaPlanta[] = [];
  for (const b of bands) {
    if (b.slope) return null;
    const h = b.z1 - b.z0;
    // A extrusão ignora faixa sem altura; faixa entre 1e-9 e 0,1 mm é fina demais para valer como caixa.
    if (h < 1e-9) continue;
    if (h < 1e-4) return null;
    for (const pl of b.poly) {
      if (!pl[0]) continue;
      if (pl.length !== 1) return null;
      const r = retanguloDoAnel(pl[0]);
      if (!r) return null;
      caixas.push({ ...r, z0: baseZ + b.z0, h });
    }
  }
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const folga = folgaEntreCaixas(caixas[i]!, caixas[j]!);
      if (folga < -TOLERANCIA_CAIXA) return null;
    }
  }
  const matrizes = caixas.map((c) => matrizDaCaixa(c.cx, c.cy, c.z0 + c.h / 2, c.ang, c.w, c.d, c.h));
  if (!comArestas) return { matrizes, arestas: [] };
  const arestas: number[] = [];
  if (caixas.length === 1) for (const m of matrizes) arestasDasCaixas(m, arestas);
  else {
    const uniao = arestasDaUniao(caixas);
    if (!uniao) return null;
    arestas.push(...uniao);
  }
  return { matrizes, arestas };
}

/**
 * Sólidos das paredes do nível com caixas: como `buildLevelSolids`, mas a camada que `caixasDaCamada` aceita vira caixas e só
 * as outras são extrudadas (e entram no cache de camadas).
 */
export function buildLevelSolidsComCaixas(r: ResolvedLevel, jl: JunctionLevel | undefined, comArestas: boolean): ParedesDoNivel {
  const byMat = new Map<Id, SolidBatch>();
  const caixas: CaixaDeParede[] = [];
  const arestas: number[] = [];
  const arestasPorParede = new Map<Id, number[]>();
  for (const rw of Object.values(r.walls)) {
    for (const l of rw.layers) {
      const camada = caixasDaCamada(fuseBands(wallLayerBandsAfterJunction(jl, rw, l)), rw.baseZ, comArestas);
      if (camada) {
        for (const matriz of camada.matrizes) caixas.push({ wallId: rw.wallId, materialId: l.materialId, matriz });
        for (const x of camada.arestas) arestas.push(x);
        if (camada.arestas.length) {
          const lista = arestasPorParede.get(rw.wallId) ?? [];
          for (const x of camada.arestas) lista.push(x);
          arestasPorParede.set(rw.wallId, lista);
        }
      } else appendSolid(batchOf(byMat, l.materialId, 'wall'), wallLayerSolid(rw, l, jl));
    }
  }
  return { batches: [...byMat.values()], caixas, arestas, arestasPorParede };
}
