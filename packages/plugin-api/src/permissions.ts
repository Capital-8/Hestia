/**
 * Capacidades (permissões) de plugins. Menor privilégio: o plugin PEDE no manifesto, o usuário CONCEDE na tela de
 * Ferramentas externas, e o host confere a concessão a cada mensagem. Não existe capacidade de escrita geral no documento.
 */
export const CAPABILITIES = {
  /** Ler a cena (snapshot e atualizações incrementais): entidades, geometria, materiais, texturas referenciadas. */
  'scene.read': 'Ler a cena do modelo',
  /** Ler a câmera 3D e receber os eventos dela. */
  'camera.read': 'Ler a câmera 3D',
  /** Receber eventos tipados de alteração do modelo e do estado da conexão. */
  'events.subscribe': 'Receber eventos de alteração',
  /** Dirigir a câmera 3D do Hestia (só vale com o modo "o plugin dirige"). */
  'camera.write': 'Sincronizar a câmera (controlar a vista 3D)',
  /** Gravar substituições de material SÓ de visualização, no espaço do próprio plugin; nunca altera o material do projeto. */
  'overrides.write': 'Salvar substituições de material de visualização',
} as const;

export type Capability = keyof typeof CAPABILITIES;

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES) as Capability[];

export const isCapability = (x: unknown): x is Capability => typeof x === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITIES, x);

/** Capacidades que o plugin do renderizador precisa de início (nenhuma de escrita geral). */
export const RENDERER_CAPABILITIES: readonly Capability[] = ['scene.read', 'camera.read', 'events.subscribe', 'camera.write', 'overrides.write'];

/** Dependências entre capacidades: conceder a chave sem as exigidas não faz sentido. */
export const CAPABILITY_REQUIRES: Readonly<Partial<Record<Capability, readonly Capability[]>>> = {
  'camera.write': ['camera.read'],
  'overrides.write': ['scene.read'],
};
