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

// SUPLEMENTOS (ADR 0057, spec 08 §3): permissões do manifesto 2.0. Tabela SEPARADA de `CAPABILITIES`: o manifesto 1.x e o
// protocolo 1.0 continuam enxergando só as 5 permissões acima (nenhum plugin 1.x consegue pedir `model.write`).
export const CAPABILITIES_V2_EXTRA = {
  /** Ler o projeto como dados imutáveis (cópia): níveis, elementos, tipos, materiais, quantitativos. */
  'model.read': 'Ler o modelo do projeto',
  /** Aplicar lotes de comandos validados, atômicos, como um único passo de desfazer. Única permissão de escrita. */
  'model.write': 'Alterar o modelo do projeto',
  /** Ler e gravar o PRÓPRIO espaço de dados do suplemento no projeto. */
  'plugindata.rw': 'Guardar dados do suplemento no projeto',
  'ui.commands': 'Registrar comandos na busca de comandos',
  /** Botões e painéis na aba Suplementos da faixa (o suplemento não escolhe a aba). */
  'ui.ribbon': 'Acrescentar botões na aba Suplementos',
  'ui.panels': 'Painéis laterais declarativos',
  'ui.dialogs': 'Caixas de diálogo declarativas',
  'ui.tools': 'Ferramentas de desenho interativas',
  'io.import': 'Importar arquivos',
  'io.export': 'Exportar arquivos',
  'checks.run': 'Registrar verificações e publicar avisos',
  'content.families': 'Contribuir famílias e tipos',
  'content.materials': 'Contribuir materiais',
  'content.schedules': 'Contribuir quantitativos e tabelas',
  /** Reservada: rede a partir de script não existe nesta fase; o manifesto que a pedir é recusado. */
  'net.fetch': 'Acesso à rede (reservado)',
} as const;

export type CapabilityV2 = Capability | keyof typeof CAPABILITIES_V2_EXTRA;

export const ALL_CAPABILITIES_V2: readonly CapabilityV2[] = [...ALL_CAPABILITIES, ...(Object.keys(CAPABILITIES_V2_EXTRA) as CapabilityV2[])];

export const isCapabilityV2 = (x: unknown): x is CapabilityV2 => isCapability(x) || (typeof x === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITIES_V2_EXTRA, x));

/** Dependências do manifesto 2.0 (inclui as 1.x): pedir a chave sem as exigidas é recusado. */
export const CAPABILITY_REQUIRES_V2: Readonly<Partial<Record<CapabilityV2, readonly CapabilityV2[]>>> = {
  ...CAPABILITY_REQUIRES,
  'model.write': ['model.read'],
  'ui.ribbon': ['ui.commands'],
  'ui.tools': ['model.write'],
  'io.import': ['model.write'],
  'io.export': ['model.read'],
  'checks.run': ['model.read'],
  'content.schedules': ['model.read'],
};
