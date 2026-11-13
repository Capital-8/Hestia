/**
 * Ligações do carregador (fase D) com o registro de contribuições (fase B) e com as portas de escrita (fase C).
 * Tudo aqui é dado e função pura: nenhum código de suplemento roda neste arquivo.
 */
import {
  ContributionRegistry,
  isCapabilityV2,
  pluginDataApi,
  pluginModelApi,
  validateManifestAny,
  type CapabilityV2,
  type ModelPort,
  type PluginDataPort,
  type ScriptPorts,
} from '@hestia/plugin-api';
import type { ManifestValidator } from './installer.ts';
import type { ContributionSink, PortsFactory } from './loader.ts';
import type { PluginInfo } from './appModelPort.ts';

/** Resumo curto (códigos técnicos, sem dados do usuário) dos problemas de um manifesto recusado. */
function resumoDosProblemas(issues: ReadonlyArray<{ code: string; field?: string; path?: string }>): string {
  return issues.slice(0, 5).map((i) => [i.code, i.field ?? i.path].filter(Boolean).join(':')).join('; ').slice(0, 300);
}

/** Validador do instalador: o manifesto é dado não confiável; recusa 2.0 inválido e API que o host não aceita. */
export const validateManifestForInstall: ManifestValidator = (raw) => {
  const r = validateManifestAny(raw);
  return r.ok ? null : resumoDosProblemas(r.issues as ReadonlyArray<{ code: string }>);
};

/**
 * Ponte `ContributionSink` -> `ContributionRegistry`. Revalida o manifesto na ativação (o pacote pode ter sido gravado
 * por uma versão antiga). Lançar aqui faz o carregador marcar o suplemento como `failed`, sem afetar o app.
 * `onInfo` informa nome, `dataSchema` e versão para o passo de desfazer e para o espaço de dados (fase C).
 */
export function registrySink(registry: ContributionRegistry, onInfo: (pluginId: string, info: PluginInfo | null) => void): ContributionSink {
  return {
    register(pluginId, raw, grants) {
      const r = validateManifestAny(raw);
      if (!r.ok) throw new Error(`manifesto inválido: ${resumoDosProblemas(r.issues as ReadonlyArray<{ code: string }>)}`);
      const m = r.manifest;
      registry.register(m, grants.filter((g): g is CapabilityV2 => isCapabilityV2(g)));
      onInfo(pluginId, { name: m.name, dataSchema: m.dataSchema, version: m.version });
      return () => {
        registry.unregister(pluginId);
        onInfo(pluginId, null);
      };
    },
  };
}

/**
 * Portas do script: cada chamada passa pelo portão de permissões de `plugindata`/`model` (`pluginModelApi` e
 * `pluginDataApi`, constantes da tabela V2) ALÉM da conferência que o `ScriptHost` já faz. O `pluginId` é fixado aqui:
 * o script nunca escolhe de quem é o espaço de dados nem quem emite os ids.
 */
export function scriptPortsFactory(model: ModelPort, data: PluginDataPort): PortsFactory {
  return (pluginId, grants): ScriptPorts => {
    const granted = (): readonly string[] => grants;
    const m = pluginModelApi(model, pluginId, granted);
    const d = pluginDataApi(data, pluginId, granted);
    return {
      modelRead: () => m.read(),
      modelApply: (label, commands) => m.apply(label, commands),
      newId: (prefix) => m.newId(prefix),
      dataGet: (key) => d.get(key),
      dataSet: (key, value) => d.set(key, value),
      dataDelete: (key) => d.delete(key),
    };
  };
}
