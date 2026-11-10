/**
 * Contrato de cena (API 1.x). Tudo é dado serializável em JSON, sem referência a stores, componentes ou estruturas
 * mutáveis do editor. A cena é descrita, não renderizada: não existe imagem neste contrato.
 *
 * Convenções (fixas na versão 1, também enviadas no snapshot em `units` e `axes`):
 *  - unidade: metro; ângulos em radiano;
 *  - eixos: destro, X leste, Y norte, Z para cima (a mesma convenção do modelo do Hestia);
 *  - matriz 4×4 em ordem de colunas (16 números), como no three.js / glTF; a geometria fica no espaço local do objeto.
 */

export type EntityId = string;
export type MaterialId = string;
export type TextureId = string;

export interface SceneUnits { length: 'm'; angle: 'rad' }
export interface SceneAxes { up: 'z'; handedness: 'right'; east: 'x'; north: 'y' }
export const SCENE_UNITS: SceneUnits = { length: 'm', angle: 'rad' };
export const SCENE_AXES: SceneAxes = { up: 'z', handedness: 'right', east: 'x', north: 'y' };

/** Malha triangulada. `groups` divide o índice por material (um grupo = uma chamada de desenho). */
export interface SceneMesh {
  positions: number[];
  /** Normais por vértice (opcional; o plugin pode recalcular). */
  normals?: number[];
  /** Coordenadas de textura por vértice (opcional). */
  uvs?: number[];
  indices: number[];
  groups: Array<{ start: number; count: number; materialId: MaterialId | null }>;
  /** Hash de conteúdo: igual = geometria igual, o plugin pode reaproveitar o que já tem. */
  hash: string;
}

/** `kind` é o nome da família do Hestia em texto livre (`wall`, `floor`, `slab`, `roof`, `opening`...). */
export interface SceneEntity {
  id: EntityId;
  kind: string;
  name?: string;
  levelId?: string;
  /** Materiais de origem que a entidade usa (camadas do tipo). `mesh.groups` mapeia por triângulo quando o host sabe; senão `materialId: null`. */
  materialIds?: MaterialId[];
  /** Matriz local→mundo, 16 números. */
  transform: number[];
  /** null = entidade sem geometria própria (agrupador). */
  mesh: SceneMesh | null;
  visible: boolean;
}

export interface SceneMaterial {
  id: MaterialId;
  name: string;
  /** #rrggbb */
  color: string;
  /** 0 fosco … 1 espelhado (campo `gloss` do Hestia). */
  gloss: number;
  opacity: number;
  /** Texturas referenciadas por id (os bytes não viajam neste contrato; ver docs/plugins). */
  textures?: Array<{ slot: 'color' | 'normal' | 'roughness'; textureId: TextureId }>;
  /**
   * Protocolo 1.3 (opcional). Categoria do material: texto minúsculo de até 32 caracteres (`wood`, `metal`, `glass`,
   * `ceramic`, `concrete`, `plaster`, `paint`, `brick`, `stone`, `roof_tile`, `fabric`, `leather`, `grass`, `soil`,
   * `asphalt`, `plastic`, `other`). Valor desconhecido é válido no contrato e ignorado pelo renderizador.
   */
  category?: string;
  /** Protocolo 1.3 (opcional). Metalicidade 0..1. Ausente = o renderizador usa a conversão padrão. */
  metallic?: number;
  /** Protocolo 1.3 (opcional). Emissão: cor `#rrggbb` e intensidade (>= 0, relativa). */
  emissive?: { color: string; intensity: number };
  /** Protocolo 1.3 (opcional). Índice de refração, 1..3. */
  ior?: number;
  /** Protocolo 1.3 (opcional). Transmissão 0..1 (vidro sem transparência por alfa). */
  transmission?: number;
}

/** Tipo de luz do protocolo 1.3: pontual, spot (cone) ou área. */
export type LightKind = 'point' | 'spot' | 'area';

/**
 * Luz da cena (protocolo 1.3). `intensity` em candela (cd). Ângulos em radiano. `direction` é obrigatório no spot e
 * indica para onde a luz aponta. `innerAngle` (≤ `outerAngle`) é o cone de intensidade máxima; `outerAngle` (≤ π) é o
 * cone de queda até zero.
 */
export interface SceneLight {
  id: EntityId;
  kind: LightKind;
  position: Vec3;
  direction?: Vec3;
  /** #rrggbb */
  color: string;
  intensity: number;
  /** Alcance em metros (opcional). */
  range?: number;
  innerAngle?: number;
  outerAngle?: number;
}

/**
 * Localização e sol do projeto (protocolo 1.3). Todos os campos são opcionais: o Hestia só envia o que o projeto tem.
 * `northAngle` (rad) é a rotação do norte verdadeiro a partir do eixo +Y, positiva no sentido anti-horário visto de
 * cima. `sun.azimuth` (rad) é medido a partir de +X (leste) no sentido anti-horário; `sun.elevation` (rad) acima do
 * horizonte. A direção do sol é `(cos e · cos a, cos e · sin a, sin e)`.
 */
export interface SceneSite {
  latitude?: number;
  longitude?: number;
  northAngle?: number;
  /** Fuso em nome IANA, por exemplo `America/Sao_Paulo`. */
  timezone?: string;
  sun?: { azimuth: number; elevation: number };
}

export interface SceneTexture {
  id: TextureId;
  mime: string;
  /** Hash do conteúdo. */
  hash: string;
  /** Origem endereçável (arquivo do projeto); nunca `data:` com imagem embutida. */
  uri: string;
}

export type CameraMode = 'follow-hestia' | 'plugin-drives';

export interface Vec3 { x: number; y: number; z: number }

export interface SceneCamera {
  projection: 'perspective' | 'orthographic';
  /** Ponto para onde a câmera olha (m). */
  target: Vec3;
  /** Posição da câmera (m). */
  position: Vec3;
  /** Vetor "para cima" da câmera. */
  up: Vec3;
  /** Campo de visão vertical, em radianos (perspectiva). */
  fovY: number;
  /** Altura visível em metros no plano do alvo (ortográfica). */
  orthoHeight: number;
  near: number;
  far: number;
}

/** Substituição de visualização de um material de origem. Não altera o material do projeto. */
export interface ViewMaterialOverride {
  color?: string;
  opacity?: number;
  gloss?: number;
  /** Parâmetros do renderizador que o Hestia só guarda (chaves e valores escalares). */
  params?: Record<string, number | string | boolean>;
}

export interface SceneSnapshot {
  /** ID estável do projeto (persistido no arquivo). */
  projectId: string;
  projectName: string;
  /** Contador que cresce a cada alteração da cena que o host publica. */
  revision: number;
  units: SceneUnits;
  axes: SceneAxes;
  entities: SceneEntity[];
  materials: SceneMaterial[];
  textures: SceneTexture[];
  camera: SceneCamera;
  /** Substituições de visualização deste plugin, por id do material de origem. */
  overrides: Record<MaterialId, ViewMaterialOverride>;
  /** Protocolo 1.3: luzes da cena. Presente (pode ser lista vazia) só em sessões 1.3. */
  lights?: SceneLight[];
  /** Protocolo 1.3: localização e sol. Ausente quando o projeto não tem nada disso. */
  site?: SceneSite;
}

export type SceneOp =
  | { op: 'entity.add'; entity: SceneEntity }
  | { op: 'entity.update'; entity: SceneEntity }
  | { op: 'entity.remove'; id: EntityId }
  | { op: 'material.add'; material: SceneMaterial }
  | { op: 'material.update'; material: SceneMaterial }
  | { op: 'material.remove'; id: MaterialId }
  | { op: 'texture.add'; texture: SceneTexture }
  | { op: 'texture.remove'; id: TextureId }
  /** Protocolo 1.3: luzes. Só saem em sessões negociadas em 1.3. */
  | { op: 'light.add'; light: SceneLight }
  | { op: 'light.update'; light: SceneLight }
  | { op: 'light.remove'; id: EntityId };

/** Atualização incremental: só vale sobre `baseRevision`. Fora de ordem → o plugin pede `scene.resync`. */
export interface SceneDelta {
  baseRevision: number;
  revision: number;
  ops: SceneOp[];
}

export const IDENTITY_MATRIX: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
