export * from './version.ts';
export * from './permissions.ts';
export * from './manifest.ts';
export * from './scene.ts';
export * from './protocol.ts';
export * from './transport.ts';
export * from './hostPorts.ts';
export * from './sceneSync.ts';
export * from './hostSession.ts';
export * from './pluginHost.ts';
export * from './testkit.ts';
// SUPLEMENTOS (fase B): manifesto 2.0, pontos de contribuição e registro.
export * from './contributesTypes.ts';
export * from './contributes.ts';
export * from './manifestV2.ts';
export * from './registry.ts';
export * from './modelPort.ts'; // SUPLEMENTOS:
// SUPLEMENTOS (Fase D): limites, host do script e runtime do Worker. `scriptWorker.ts` NÃO é exportado (só roda dentro do Worker).
export * from './limits.ts';
export * from './scriptHost.ts';
export * from './workerRuntime.ts';
// SUPLEMENTOS (Fase H): campos validados de diálogo, visão declarativa de painel e protocolo de ferramentas.
export * from './dialogValues.ts';
export * from './panelView.ts';
export * from './toolReply.ts';
