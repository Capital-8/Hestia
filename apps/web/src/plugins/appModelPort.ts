import { PluginIdIssuer, applyPluginBatch, rehearsePluginBatch, pluginDataReadOnly, pluginDataSpace, type ProjectStore } from '@hestia/model';
import type { ApplyResult, ModelPort, PluginDataPort, ProjectSnapshot } from '@hestia/plugin-api';
import { editor } from '../editor/controller.ts';

/** O que o host sabe do plugin instalado e que o plugin não pode escolher (nome do passo de desfazer, schema e versão dos dados). */
export interface PluginInfo {
  name: string;
  /** `dataSchema` do manifesto (padrão 1). */
  dataSchema: number;
  version: string;
}

type InfoResolver = (pluginId: string) => PluginInfo;

let resolveInfo: InfoResolver = (pluginId) => ({ name: pluginId, dataSchema: 1, version: '' });

/** O registro de suplementos (fase B/D) informa nome, `dataSchema` e versão do manifesto instalado. */
export function setPluginInfoResolver(fn: InfoResolver): void {
  resolveInfo = fn;
}

/**
 * Porta de modelo sobre um `ProjectStore`. Recebe o store por parâmetro para testar sem o editor; o app usa `appModelPort`.
 * O plugin só recebe cópias (`structuredClone`) e nunca o `Project` mutável nem o store.
 */
export function createModelPort(getStore: () => ProjectStore, issuer = new PluginIdIssuer()): { model: ModelPort; data: PluginDataPort } {
  const model: ModelPort = {
    read: (): ProjectSnapshot => structuredClone(getStore().project) as unknown as ProjectSnapshot,
    newId: (pluginId, prefix) => issuer.issue(pluginId, prefix),
    apply(pluginId, label, commands, opts): ApplyResult {
      const info = resolveInfo(pluginId);
      return applyPluginBatch(getStore(), {
        pluginId,
        label: `${info.name}: ${label}`,
        commands,
        isIssuedId: (id) => issuer.has(pluginId, id),
        dataSchema: info.dataSchema,
        version: info.version,
        maxCommands: opts?.maxCommands,
      });
    },
    rehearse(pluginId, commands, opts) {
      const info = resolveInfo(pluginId);
      return rehearsePluginBatch(getStore(), {
        pluginId, label: info.name, commands, isIssuedId: (id) => issuer.has(pluginId, id), dataSchema: info.dataSchema, version: info.version, maxCommands: opts?.maxCommands,
      });
    },
  };
  const data: PluginDataPort = {
    get: (pluginId, key) => {
      const v = pluginDataSpace(getStore().project, pluginId)?.values[key];
      return v === undefined ? undefined : structuredClone(v);
    },
    keys: (pluginId) => Object.keys(pluginDataSpace(getStore().project, pluginId)?.values ?? {}),
    set(pluginId, key, value) {
      const info = resolveInfo(pluginId);
      // Um passo de desfazer por gravação; o host força pluginId, schema e versão.
      getStore().exec({ type: 'setPluginData', pluginId, key, value: value as never, schema: info.dataSchema, version: info.version }, `${info.name}: gravar dados`);
    },
    delete(pluginId, key) {
      const info = resolveInfo(pluginId);
      getStore().exec({ type: 'deletePluginData', pluginId, key, schema: info.dataSchema }, `${info.name}: remover dados`);
    },
    readOnly: (pluginId) => pluginDataReadOnly(getStore().project, pluginId, resolveInfo(pluginId).dataSchema),
  };
  return { model, data };
}

const app = createModelPort(() => editor.store);

/** Portas de modelo do app, para entrar em `HostPorts` (`model` e `data`). */
export const appModelPort: ModelPort = app.model;
export const appDataPort: PluginDataPort = app.data;
