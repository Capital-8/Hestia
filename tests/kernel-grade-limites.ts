/**
 * Efeito de grade das quantidades (critério por camada aprovado em 2026-11-06, ADR 0049): compartilhado entre o teste B6
 * (`kernel-b6-quantidades.wasm.test.ts`) e a medição dos projetos reais. Só usa a geometria do TypeScript (a referência).
 */
import { dist, intersection, type MultiPolygon } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { resolveFloors } from '../packages/engine/src/floors.ts';
import { bandPiece, cutVolume, floorCutters, floorLayerPiece, slabCoversFloor, slabCutters, slabLayerPiece, wallCutters, type CutterSolid, type JunctionKind, type SolidPiece } from '../packages/engine/src/junctionNet.ts';
import { resolveSlabs } from '../packages/engine/src/slabs.ts';
import { resolveLevelTs } from '../packages/engine/src/resolve.ts';

/**
 * Efeito de grade de uma camada (m³ por metro de grade): o que as aproximações das duas pontas podem mover o volume, derivado da geometria dela.
 *
 * Cada vértice de uma região pode sair do lugar exato por até meia célula da grade em cada eixo. O Rust (decisão do dono: a grade vale para as
 * quantidades) arredonda a 1 µm; o TypeScript arredonda cada entrada de `polygon-clipping` a 1e-7 m, em cada passo da cadeia (0,1 µm, de modo que
 * uns poucos passos cabem em uma célula de 1 µm). O deslocamento de uma aresta é então menor que uma célula, `GRADE` = 1 µm (a mesma regra da ADR
 * 0049: `perímetro × 1e-6`), e a área de uma região muda no máximo `perímetro × GRADE`. Um volume é uma soma de regiões vezes a cota delas; por
 * isso o limite de uma camada é a soma, sobre as regiões que entram na conta, de `perímetro × cota máxima × GRADE`:
 *  - o volume bruto (a camada, faixa a faixa): perímetro de cada região × altura dela;
 *  - o volume cortado: para cada peça cortadora que de fato se sobrepõe, o perímetro da interseção × a maior sobreposição de cota nos vértices.
 * O líquido é `max(0, bruto - cortado)`, 1-Lipschitz, então herda a soma dos dois. Áreas de face derivadas de volume dividem pela espessura.
 */
export const GRADE = 1e-6;
export const BASE = 1e-6;

export const perimetroDe = (m: MultiPolygon): number => m.reduce((s, poly) => s + poly.reduce((t, r) => t + r.reduce((u, q, i) => u + dist(q, r[(i + 1) % r.length]!), 0), 0), 0);

/** Soma, sobre as peças cortadoras que se sobrepõem à peça, de `perímetro da interseção × maior sobreposição de cota`. */
export function efeitoDoCorte(piece: SolidPiece, kind: JunctionKind, cutters: readonly CutterSolid[], skip?: ReadonlySet<CutterSolid>): number {
  let e = 0;
  for (const c of cutters) {
    if (skip?.has(c)) continue;
    for (const cp of c.pieces) {
      if (cutVolume(piece, kind, [{ kind: c.kind, pieces: [cp] }]) === 0) continue;
      const comum = intersection(piece.poly, cp.poly);
      let h = 0;
      for (const poly of comum) for (const r of poly) for (const q of r) {
        const [a0, a1] = piece.span(q);
        const [b0, b1] = cp.span(q);
        h = Math.max(h, Math.min(a1, b1) - Math.max(a0, b0));
      }
      e += perimetroDe(comum) * h;
    }
  }
  return e;
}


export type Nivel = { p: Project; levelId: Id };
export const SLAB_FATOR = (percentual: number): number => 1 / Math.cos(Math.atan(Math.abs(percentual) / 100));

/** Efeito de grade de uma camada de parede (bruto, ou bruto + corte), com a geometria do TypeScript. */
export function efeitoParede({ p, levelId }: Nivel, wallId: Id, layerIndex: number, comCorte: boolean): number {
  const rw = resolveLevelTs(p, levelId).walls[wallId]!;
  const l = rw.layers.find((x) => x.layerIndex === layerIndex)!;
  const cutters = comCorte ? [...floorCutters(p, levelId), ...slabCutters(p, levelId)] : [];
  let e = 0;
  for (const b of l.bands) {
    e += perimetroDe(b.poly) * (b.z1 - b.z0);
    if (comCorte) e += efeitoDoCorte(bandPiece(rw, b, { priority: l.priority, core: l.core }), 'wall', cutters);
  }
  return e;
}

export function efeitoPiso({ p, levelId }: Nivel, floorId: Id, layerIndex: number, comCorte: boolean): number {
  const rf = resolveFloors(p, levelId).find((f) => f.floorId === floorId)!;
  const l = rf.layers.find((x) => x.layerIndex === layerIndex)!;
  let e = perimetroDe(l.polygon) * (l.z1 - l.z0);
  if (comCorte) {
    const lajes = slabCutters(p, levelId);
    const cortadores = [...lajes, ...floorCutters(p, levelId), ...wallCutters(p, levelId)];
    e += efeitoDoCorte(floorLayerPiece(rf, l), 'floor', cortadores, new Set(lajes.filter((c) => slabCoversFloor(c, rf))));
  }
  return e;
}

export function efeitoLaje({ p, levelId }: Nivel, slabId: Id, layerIndex: number, comCorte: boolean): number {
  const rs = resolveSlabs(p, levelId).find((x) => x.slabId === slabId)!;
  const l = rs.layers.find((x) => x.layerIndex === layerIndex)!;
  let e = perimetroDe(l.polygon) * (l.z1 - l.z0);
  if (comCorte) e += efeitoDoCorte(slabLayerPiece(rs, l), 'slab', [...floorCutters(p, levelId), ...slabCutters(p, levelId), ...wallCutters(p, levelId)]);
  return e;
}
