import { multiArea } from '@hestia/geom';
import { bandVolume } from './profile.ts';
import { bandPiece, cutVolume, floorCutters, slabCutters } from './junctionNet.ts';
import { profileHeightAt, profileMean, openingHeight, openingSill, openingType, openingsOfWall, wallLength, type Id, type Project } from '@hestia/model';
import type { ResolvedLevel } from './types.ts';

export interface LayerQuantity {
  wallId: Id;
  layerIndex: number;
  materialId: Id;
  /** Área da camada em planta (metros quadrados). */
  planArea: number;
  /** Volume líquido (metros cúbicos): planta × altura, mais as peças acima/abaixo dos vãos, menos o que piso e laje ocupam. */
  volume: number;
  /** Volume bruto (metros cúbicos), antes do desconto de piso e laje. */
  grossVolume: number;
}

export interface WallQuantity {
  wallId: Id;
  length: number;
  height: number;
  grossFaceArea: number;
  openingsArea: number;
  netFaceArea: number;
  /** Volume líquido (metros cúbicos): sem o que piso e laje do mesmo nível ocupam (decisão 0023 §4). */
  volume: number;
  /** Volume bruto (metros cúbicos), antes do desconto de piso e laje. Igual a `volume` quando não há corte. */
  grossVolume: number;
}

export interface Quantities {
  layers: LayerQuantity[];
  walls: WallQuantity[];
  /** Volume total por material. */
  volumeByMaterial: Record<Id, number>;
  /** Área de face por material (volume ÷ espessura somado das camadas). */
  faceAreaByMaterial: Record<Id, number>;
}

/**
 * Quantitativos por camada: o acabamento vem da própria parede (docs/02 §1). O volume é líquido: a parede perde a parte
 * que está dentro de piso ou laje (do mesmo nível ou do pavimento de cima que alcança a parede; padrão por tipo, decisão 0023 §1.3 e §4). A regra é par a par
 * (decisão 0023 §1, B): quem tem prioridade maior fica com a zona comum, inclusive laje ou piso de outro nível que alcance a parede.
 */
export function quantifyLevel(p: Project, r: ResolvedLevel): Quantities {
  const layers: LayerQuantity[] = [];
  const walls: WallQuantity[] = [];
  const volumeByMaterial: Record<Id, number> = {};
  const faceAreaByMaterial: Record<Id, number> = {};
  const cutters = [...floorCutters(p, r.levelId), ...slabCutters(p, r.levelId)];
  for (const rw of Object.values(r.walls)) {
    const w = p.elements[rw.wallId];
    if (!w || w.kind !== 'wall') continue;
    const profiled = w.topProfile && w.sag === 0 ? w.topProfile : null;
    // Altura resolvida (com a base e o topo anexados a piso); sem anexos é a altura do modelo. Com base por trecho
    // (decisão 0023 §6, P9), a altura média é o topo médio menos a base média.
    const comprimento = wallLength(w);
    const H0 = profiled ? profileMean(profiled, comprimento) : rw.height;
    const H = rw.profileBottom ? (rw.profileTop ? profileMean(rw.profileTop, comprimento) : H0) - profileMean(rw.profileBottom, comprimento) : H0;
    let total = 0;
    let grossTotal = 0;
    for (const l of rw.layers) {
      const grossVol = l.bands.reduce((s, b) => s + bandVolume(b), 0);
      const vol = l.bands.reduce((s, b) => s + Math.max(0, bandVolume(b) - cutVolume(bandPiece(rw, b, { priority: l.priority, core: l.core }), 'wall', cutters)), 0);
      total += vol;
      grossTotal += grossVol;
      layers.push({ wallId: rw.wallId, layerIndex: l.layerIndex, materialId: l.materialId, planArea: multiArea(l.cut), volume: vol, grossVolume: grossVol });
      volumeByMaterial[l.materialId] = (volumeByMaterial[l.materialId] ?? 0) + vol;
      const wt = p.wallTypes[w.typeId];
      const thick = (l.layerIndex >= 0 ? wt?.layers[l.layerIndex]?.thickness : wt?.strips[-l.layerIndex - 1]?.thickness) ?? 0;
      if (thick > 0) faceAreaByMaterial[l.materialId] = (faceAreaByMaterial[l.materialId] ?? 0) + vol / thick;
    }
    for (const m of rw.membranes) {
      const len = Math.hypot(m.pts[1]!.x - m.pts[0]!.x, m.pts[1]!.y - m.pts[0]!.y);
      faceAreaByMaterial[m.materialId] = (faceAreaByMaterial[m.materialId] ?? 0) + len * H;
    }
    const gross = wallLength(w) * H;
    const openings = openingsOfWall(p, w.id).reduce((s, o) => {
      const t = openingType(p, o);
      const top = profiled ? profileHeightAt(profiled, o.offset) : H;
      const clipped = Math.max(0, Math.min(openingHeight(t, o), top - openingSill(t, o)));
      return s + t.width * clipped;
    }, 0);
    walls.push({
      wallId: w.id,
      length: wallLength(w),
      height: H,
      grossFaceArea: gross,
      openingsArea: openings,
      netFaceArea: gross - openings,
      volume: total,
      grossVolume: grossTotal,
    });
  }
  return { layers, walls, volumeByMaterial, faceAreaByMaterial };
}
