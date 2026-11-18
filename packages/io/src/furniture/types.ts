// Contrato interno do importador de blocos (mobiliario). Todos os leitores (skp, gltf, obj, dae, fbx, zip) devolvem
// um `ImportedModel`. Regras: metros, Z para cima, mesh por definicao (uma vez) e uma matriz por instancia.

export type Mat4 = number[]; // 16 numeros, ordem de colunas, local -> mundo (metros, Z para cima)

export type ImportCategory =
  | 'wood' | 'metal' | 'glass' | 'ceramic' | 'concrete' | 'plaster' | 'paint' | 'brick' | 'stone'
  | 'roof_tile' | 'fabric' | 'leather' | 'grass' | 'soil' | 'asphalt' | 'plastic' | 'other';

export interface ImportedMeshGroup {
  /** Primeiro indice (multiplo de 3) e quantidade de indices deste grupo. */
  start: number;
  count: number;
  /** Indice em `ImportedModel.materials`. */
  materialIndex: number;
  /**
   * Os dois lados das faces do grupo devem aparecer (sem descarte de faces traseiras). Vem do arquivo quando ele diz
   * (skp: frente e verso do mesmo material; glTF: `doubleSided`) ou da analise da malha (obj, dae, fbx: so as malhas
   * fechadas e voltadas para fora ficam de um lado). Ausente = um lado.
   */
  doubleSided?: boolean;
}

export interface ImportedMeshDef {
  id: string;
  name: string;
  /** XYZ em metros, espaco local da definicao, Z para cima. */
  positions: Float32Array;
  /** Normais unitarias por vertice (recalculadas quando o arquivo nao traz). */
  normals: Float32Array;
  /** UV por vertice, em REPETICOES da textura do material (1.0 = uma imagem inteira). Vazio se nao houver. */
  uvs: Float32Array;
  indices: Uint32Array;
  groups: ImportedMeshGroup[];
}

export interface ImportedInstance {
  defId: string;
  name?: string;
  transform: Mat4;
}

export interface ImportedMaterial {
  name: string;
  /** RGB 0..1 (cor media da textura difusa quando ha imagem). */
  color: [number, number, number];
  /** 1 = opaco. alpha 0 vindo do .skp com textura NAO e transparencia real: use 1. */
  opacity: number;
  textureIndex?: number;
  /** Tamanho fisico de uma repeticao da textura, em metros (skp: polegadas x 0,0254; glb/obj: nominal). */
  sizeM?: [number, number];
  /** Categoria sugerida pelo nome/dados; o usuario pode mudar. */
  category?: ImportCategory;
  metallic?: number;
  roughness?: number;
  transmission?: number;
}

export interface ImportedTexture {
  /** So o nome do arquivo, nunca caminho do computador do usuario. */
  fileName: string;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

export interface ImportStats {
  vertices: number;
  triangles: number;
  definitions: number;
  instances: number;
  textures: number;
  sourceBytes: number;
  ms: number;
}

export interface ImportedModel {
  name: string;
  /** Somente o nome do arquivo de origem. */
  sourceFileName: string;
  sourceFormat: 'skp' | 'gltf' | 'glb' | 'obj' | 'dae' | 'fbx' | 'zip';
  defs: ImportedMeshDef[];
  instances: ImportedInstance[];
  materials: ImportedMaterial[];
  textures: ImportedTexture[];
  /** Avisos para mostrar ao usuario (ex.: formato de textura ignorado, escala presumida). */
  warnings: string[];
  stats: ImportStats;
}

/** Limites do importador (aceitos pelo renderizador; ver docs do contrato 1.4). */
export const IMPORT_LIMITS = {
  warnVerticesPerBlock: 300_000,
  refuseVerticesPerBlock: 600_000,
  refuseFileBytes: 50 * 1024 * 1024,
  maxEntityJsonBytes: 8 * 1024 * 1024,
} as const;

export interface ImportOptions {
  /** Progresso 0..1 e texto curto. */
  onProgress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
  /** Escala extra do usuario (padrao 1). */
  scale?: number;
}

export type ImportFn = (file: { name: string; bytes: Uint8Array }, opts?: ImportOptions) => Promise<ImportedModel>;
