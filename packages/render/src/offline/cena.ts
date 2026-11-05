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
  /** Texturas de imagem do material (índices em `RenderSceneSnapshot.texturas`). Ausente = sem textura. */
  mapas?: RenderMaterialMapas;
}

/** Índice, em `RenderSceneSnapshot.texturas`, de cada mapa do material. Ausente = sem textura naquele canal. */
export interface RenderMaterialMapas {
  albedo?: number;
  normal?: number;
  roughness?: number;
  metallic?: number;
}

/**
 * Textura de imagem RGBA8 sRGB sem compressão. `mips[0]` é o nível 0 (largura × altura); cada nível seguinte tem metade
 * da largura e da altura, com mínimo 1 (ver `gerarMips` em `apps/web/src/editor/render/texturaRender.ts`).
 *
 * No snapshot exportado (`exportarCenaDeRender`), cada textura entra como PENDENTE: `caminho` é o arquivo da biblioteca
 * (`texturas-render/`), com `largura` e `altura` 0 e `mips` vazio. O carregamento dos pixels é uma etapa separada
 * (`carregarTexturasDoSnapshot`, no navegador); `codificarCena` recusa textura pendente.
 */
export interface RenderTextura {
  /** Caminho relativo à biblioteca de texturas (chave única na lista do snapshot). Ausente em texturas montadas à mão. */
  caminho?: string;
  largura: number;
  altura: number;
  mips: Uint8Array[];
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
  /** Texturas de imagem da cena. Vazio ou ausente = cena v2 (sem seção de texturas); com texturas, a cena vai como v3. */
  texturas?: RenderTextura[];
}
