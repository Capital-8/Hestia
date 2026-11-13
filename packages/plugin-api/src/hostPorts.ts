import type { ModelPort, PluginDataPort } from './modelPort.ts';
import type { MaterialId, SceneCamera, SceneEntity, SceneMaterial, SceneTexture, ViewMaterialOverride } from './scene.ts';

/**
 * Portas que o host do Hestia oferece à sessão de um plugin. São a ÚNICA superfície por onde a sessão toca o editor:
 * a sessão nunca importa store, componente React nem estrutura mutável (aqui só entram dados copiados).
 * O aplicativo implementa as portas sobre o editor real; os testes implementam sobre memória.
 */
export interface SceneContent {
  projectName: string;
  entities: SceneEntity[];
  materials: SceneMaterial[];
  textures: SceneTexture[];
}

export interface ScenePort {
  /** ID estável do projeto (persistido no arquivo). */
  projectId(): string;
  /** Retrato imutável (cópia) do conteúdo atual. */
  read(): SceneContent;
  /** Avisa que o modelo mudou (já agrupado por quadro/lote); devolve o cancelamento. */
  subscribe(cb: () => void): () => void;
}

export interface CameraPort {
  /** null = não há vista 3D aberta. */
  read(): SceneCamera | null;
  /** Aplica a câmera na vista 3D do Hestia. false se não houver vista para aplicar. */
  write(c: SceneCamera): boolean;
  /** Avisa mudança de câmera (inclusive as causadas por `write`: a sessão filtra o eco). */
  subscribe(cb: () => void): () => void;
}

export interface OverridesPort {
  read(pluginId: string): Record<MaterialId, ViewMaterialOverride>;
  /** Grava no espaço do plugin; nunca toca no material de origem. Lança se o material de origem não existir. */
  set(pluginId: string, materialId: MaterialId, o: ViewMaterialOverride): void;
  clear(pluginId: string, materialId: MaterialId): void;
  subscribe(cb: () => void): () => void;
}

export interface HostPorts {
  scene: ScenePort;
  camera: CameraPort;
  overrides: OverridesPort;
  /** SUPLEMENTOS: leitura/escrita do modelo e espaço de dados (opcionais: o renderizador não os usa). */
  model?: ModelPort;
  data?: PluginDataPort;
}
