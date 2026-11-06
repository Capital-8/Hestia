import { dist, multiArea, type Vec2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { resolveFloors, type ResolvedFloor } from './floors.ts';
import { despachanteDeQuantidades } from './resolveDespacho.ts';
import type { QuantidadesRust } from './quantidadesTipos.ts';
import { coveredFaceArea, cutVolume, floorCutters, floorLayerPiece, slabCoversFloor, slabCutters, wallCutters, type CutterSolid } from './junctionNet.ts';

/** Uma camada de um piso. A área é a da face superior da camada, líquida: sem o que a laje ocupa (decisão 0023 §4). */
export interface FloorLayerQuantity {
  floorId: Id;
  layerIndex: number;
  materialId: Id;
  thickness: number;
  /** Área líquida da face superior da camada (metros quadrados), com o contorno da camada (P8). Sem corte, igual à da camada. Membrana também tem área. */
  area: number;
  /** Volume líquido da camada (metros cúbicos) = área bruta × espessura menos o que a laje ocupa; zero na membrana (decisão 0023 §5). */
  volume: number;
  /** Volume bruto da camada (metros cúbicos), antes do desconto da laje. */
  grossVolume: number;
  /** Membrana: aparece com área de face e volume zero. */
  membrane: boolean;
}

export interface FloorQuantity {
  floorId: Id;
  typeId: Id;
  levelId: Id;
  /** Área líquida em planta: contorno menos furos (metros quadrados). */
  area: number;
  /** Comprimento do contorno externo (m). */
  perimeter: number;
  /** Soma dos comprimentos dos furos (m). */
  holesPerimeter: number;
  /** Espessura total do piso (m). */
  thickness: number;
  /** Volume líquido total (metros cúbicos) = soma das camadas. */
  volume: number;
  /** Volume bruto (metros cúbicos), sem o desconto da laje. Igual a `volume` quando não há corte. */
  grossVolume: number;
  /** Área líquida da face superior (metros quadrados): a área da primeira camada, sem o que a laje ocupa. */
  netArea: number;
  layers: FloorLayerQuantity[];
}

export interface FloorQuantities {
  floors: FloorQuantity[];
  layers: FloorLayerQuantity[];
  /** Área líquida somada de todos os pisos do nível (metros quadrados). */
  totalArea: number;
  /** Volume líquido total do nível (metros cúbicos). */
  totalVolume: number;
  /** Volume (metros cúbicos) por material. */
  volumeByMaterial: Record<Id, number>;
  /** Área de face superior (metros quadrados) por material: soma das áreas das camadas daquele material. */
  faceAreaByMaterial: Record<Id, number>;
}

/** Comprimento de um anel fechado (o último ponto liga-se ao primeiro). */
const ringLength = (r: Vec2[]): number => r.reduce((s, p, i) => s + dist(p, r[(i + 1) % r.length]!), 0);

function quantifyFloor(rf: ResolvedFloor, cutters: CutterSolid[], slabs: readonly CutterSolid[], rust: QuantidadesRust | null): { floor: FloorQuantity; layers: FloorLayerQuantity[] } {
  const area = multiArea(rf.polygon);
  // Laje que cobre o piso inteiro no mesmo nível: o piso é a mesma construção (acabamento embutido na laje), não uma
  // junta. Descontá-la apagaria o piso; a duplicidade fica para os avisos de sobreposição.
  const skip = new Set(rust ? [] : slabs.filter((c) => slabCoversFloor(c, rf)));
  const layers = rf.layers.map<FloorLayerQuantity>((l) => {
    const thickness = l.z1 - l.z0;
    // Com o Rust, volume bruto, líquido e área de face são os dele (nada de geometria aqui).
    const q = rust?.camada(rf.floorId, l.layerIndex);
    if (q) return { floorId: rf.floorId, layerIndex: l.layerIndex, materialId: l.materialId, thickness, area: q.areaDeFace, volume: q.liquido, grossVolume: q.bruto, membrane: l.membrane };
    const piece = floorLayerPiece(rf, l);
    // Área da própria camada (P8): pode ir ao núcleo da parede ou recuar à face. Só o volume que a laje ocupa sai do piso
    // (padrão por tipo, §1.3). A membrana não tem volume a descontar.
    const layerArea = multiArea(l.polygon);
    const grossVolume = l.membrane ? 0 : layerArea * thickness;
    const volume = l.membrane ? 0 : Math.max(0, grossVolume - cutVolume(piece, 'floor', cutters, skip));
    const faceArea = l.membrane ? Math.max(0, layerArea - coveredFaceArea(piece, 'floor', cutters, skip)) : thickness > 0 ? volume / thickness : layerArea;
    return {
      floorId: rf.floorId,
      layerIndex: l.layerIndex,
      materialId: l.materialId,
      thickness,
      area: faceArea,
      volume,
      grossVolume,
      membrane: l.membrane,
    };
  });
  const volume = layers.reduce((s, l) => s + l.volume, 0);
  const floor: FloorQuantity = {
    floorId: rf.floorId,
    typeId: rf.typeId,
    levelId: rf.levelId,
    area,
    // Com furo de escada o piso pode virar mais de um polígono: soma o contorno de todos e de todos os furos.
    perimeter: rf.polygon.reduce((s, poly) => s + ringLength(poly[0]!), 0),
    holesPerimeter: rf.polygon.reduce((s, poly) => s + poly.slice(1).reduce((t, h) => t + ringLength(h), 0), 0),
    thickness: rf.topZ - rf.bottomZ,
    volume,
    grossVolume: layers.reduce((s, l) => s + l.grossVolume, 0),
    netArea: layers[0]?.area ?? area,
    layers,
  };
  return { floor, layers };
}

/**
 * Quantitativos dos pisos de um nível. A geometria vem de `resolveFloors`, então área e volume são os mesmos do
 * 3D e da planta. O volume e a área de face são líquidos: descontam a interseção com as lajes do nível (decisão 0023
 * §4), salvo quando a laje cobre o piso inteiro no mesmo nível (`slabCoversFloor`): aí o piso é a mesma construção da
 * laje e o desconto apagaria o piso; a duplicidade fica para os avisos de sobreposição. A área em planta (`area`)
 * continua sendo a do contorno. Pisos sem tipo válido ou com contorno de menos de 3 pontos não entram (a validação
 * aponta).
 */
export function quantifyFloors(p: Project, levelId: Id): FloorQuantities {
  return quantifyFloorsCom(p, levelId, despachanteDeQuantidades()?.(p, levelId, 'pisos') ?? null);
}

/** O motor TypeScript das quantidades de piso, sem despacho: só a referência (oráculo) dos testes do Rust. */
export const quantifyFloorsTs = (p: Project, levelId: Id): FloorQuantities => quantifyFloorsCom(p, levelId, null);

function quantifyFloorsCom(p: Project, levelId: Id, rust: QuantidadesRust | null): FloorQuantities {
  const floors: FloorQuantity[] = [];
  const layers: FloorLayerQuantity[] = [];
  const volumeByMaterial: Record<Id, number> = {};
  const faceAreaByMaterial: Record<Id, number> = {};
  const slabs = rust ? [] : slabCutters(p, levelId);
  const cutters = rust ? [] : [...slabs, ...floorCutters(p, levelId), ...wallCutters(p, levelId)];
  for (const rf of resolveFloors(p, levelId)) {
    const q = quantifyFloor(rf, cutters, slabs, rust);
    floors.push(q.floor);
    for (const l of q.layers) {
      layers.push(l);
      volumeByMaterial[l.materialId] = (volumeByMaterial[l.materialId] ?? 0) + l.volume;
      faceAreaByMaterial[l.materialId] = (faceAreaByMaterial[l.materialId] ?? 0) + l.area;
    }
  }
  return {
    floors,
    layers,
    totalArea: floors.reduce((s, f) => s + f.area, 0),
    totalVolume: floors.reduce((s, f) => s + f.volume, 0),
    volumeByMaterial,
    faceAreaByMaterial,
  };
}
