import type { Id } from '../types.ts';

/**
 * Moveis e blocos importados (arquivo, nao familia). Ver docs/furniture-model.md.
 *
 * Os dados pesados ficam no projeto como TEXTO base64 (little-endian), nunca como Float32Array: assim `JSON.stringify`,
 * `structuredClone`, immer (desfazer) e os comandos serializaveis funcionam sem gancho de salvamento. A leitura
 * tipada e `furnitureDefArrays` (cache por definicao). Metros, Z para cima, espaco local da definicao.
 */
export type Base64 = string;

export type FurnitureSourceFormat = 'skp' | 'gltf' | 'glb' | 'obj' | 'dae' | 'fbx' | 'zip';

/** Compativel com `ImportCategory` do importador (packages/io), redefinida aqui pela regra de fronteira. */
export type FurnitureCategory =
  | 'wood' | 'metal' | 'glass' | 'ceramic' | 'concrete' | 'plaster' | 'paint' | 'brick' | 'stone'
  | 'roof_tile' | 'fabric' | 'leather' | 'grass' | 'soil' | 'asphalt' | 'plastic' | 'other';

export interface FurnitureMeshGroup {
  /** Primeiro indice (multiplo de 3) e quantidade de indices. */
  start: number;
  count: number;
  /** Indice em `FurnitureAsset.materials`. */
  materialIndex: number;
  /** Desenhar as duas faces do grupo (sem descarte de faces traseiras). Ausente = um lado so. */
  doubleSided?: boolean;
}

export interface FurnitureMeshDef {
  id: Id;
  name: string;
  /** Float32 little-endian, XYZ por vertice, metros. */
  positions: Base64;
  /** Float32 little-endian, normais unitarias por vertice. */
  normals: Base64;
  /** Float32 little-endian, UV por vertice em repeticoes da textura (vazio se nao ha). */
  uvs: Base64;
  /** Uint32 little-endian, triangulos. */
  indices: Base64;
  vertexCount: number;
  indexCount: number;
  groups: FurnitureMeshGroup[];
}

export interface FurnitureMaterial {
  /** Id do `Material` do projeto criado junto com o asset. */
  id: Id;
  name: string;
  /** #rrggbb. */
  color: string;
  /** 1 = opaco. */
  opacity: number;
  category: FurnitureCategory;
  metallic?: number;
  roughness?: number;
  transmission?: number;
  /** Indice em `FurnitureAsset.textures`. */
  textureIndex?: number;
  /** Tamanho fisico de uma repeticao da textura, metros. */
  sizeM?: [number, number];
  /** Padrao true. Falso: a textura nao e enviada e a categoria/cor valem. */
  useEmbeddedTexture: boolean;
}

export interface FurnitureTexture {
  /** So o nome do arquivo. */
  fileName: string;
  mime: 'image/png' | 'image/jpeg';
  /** Bytes do arquivo (PNG/JPEG) em base64. */
  bytes: Base64;
  /** SHA-256 hexadecimal minusculo do arquivo (64 caracteres). */
  sha256: string;
  width?: number;
  height?: number;
  /** Tamanho do arquivo em bytes. */
  byteLength: number;
}

export interface FurnitureBBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface FurnitureStats {
  vertices: number;
  triangles: number;
  definitions: number;
  textures: number;
  /** Bytes do arquivo de origem. */
  sourceBytes: number;
  /** Bytes que o asset ocupa no projeto (arrays + texturas, antes do base64). */
  assetBytes: number;
}

/** Peca do bloco: uma definicao de malha posicionada no espaco local do asset (como as instancias de dentro de um .skp). */
export interface FurniturePart {
  defId: Id;
  name?: string;
  /** 16 numeros, ordem de colunas, local da definicao -> local do asset, metros, Z para cima. Pode ter determinante negativo (espelhada). */
  transform: number[];
}

export interface FurnitureAsset {
  id: Id;
  name: string;
  /** Somente o nome do arquivo, sem caminho. */
  sourceFileName: string;
  sourceFormat: FurnitureSourceFormat;
  /** SHA-256 hex do conteudo do asset (geometria + texturas); detecta reimportacao do mesmo arquivo. */
  contentHash: string;
  defs: FurnitureMeshDef[];
  /** Composicao do bloco. Ausente (assets antigos) = cada definicao na origem. Use `assetParts`. */
  parts?: FurniturePart[];
  materials: FurnitureMaterial[];
  textures: FurnitureTexture[];
  /** Caixa do asset no espaco local, metros (todas as definicoes). */
  bbox: FurnitureBBox;
  stats: FurnitureStats;
}

export interface FurnitureProjectData {
  assets: Record<Id, FurnitureAsset>;
}

/** Qualidade so da vista: 'leve' (navegar) ou 'completo' (o render final usa sempre completo). */
export type FurnitureQuality = 'leve' | 'completo';

/** Instancia de um asset no projeto (elemento). Nao copia malha. */
export interface Furniture {
  id: Id;
  kind: 'furniture';
  assetId: Id;
  levelId: Id;
  /** Metros; z = deslocamento sobre a elevacao do nivel. */
  x: number;
  y: number;
  z: number;
  /** Radiano, eixo Z, anti-horario visto de cima. */
  rotation: number;
  /** Escala uniforme (> 0). */
  scale: number;
  /** Espelha a malha em X local, antes de girar. */
  mirrored: boolean;
  name: string;
  /** Ausente = 'leve'. */
  quality?: FurnitureQuality;
  order: number;
}
