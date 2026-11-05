/**
 * Snapshot neutro da cena 3D para o renderizador offline (Rust/WASM). Sem DOM e sem three:
 * arrays tipados em metros, Z para cima, no mesmo sistema do 3D do editor.
 */

export interface RenderMaterial {
  /** Cor linear, 0..1. */
  baseColor: [number, number, number];
  roughness: number;
  metallic: number;
  opacity: number;
  transmission: number;
  ior: number;
  emissive: [number, number, number];
  /** Tipo procedural 0..7 (0 liso, 1 reboco, 2 madeira, 3 telha, 4 piso, 5 metal, 6 vidro, 7 tijolo). Ausente = 0. */
  tipo?: number;
  /** Metros por repetição do padrão procedural, finito > 0. Ausente = 1.0. */
  escala?: number;
}

export interface RenderBatch {
  indexStart: number;
  indexCount: number;
  material: number;
}

export interface RenderCamera {
  /** Matriz 4x4 view, coluna maior. */
  view: Float32Array;
  /** Matriz 4x4 projection, coluna maior. */
  projection: Float32Array;
  position: [number, number, number];
  near: number;
  far: number;
}

export interface RenderSceneSnapshot {
  version: 1;
  positions: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  materials: RenderMaterial[];
  batches: RenderBatch[];
  sun: { azimuth: number; elevation: number; intensity: number };
  background: [number, number, number] | null;
  camera: RenderCamera;
}
