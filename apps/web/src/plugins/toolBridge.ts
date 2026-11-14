/**
 * Ponte entre uma ferramenta interativa de suplemento (`PluginTool`, em `@hestia/tools`) e o handler dele no Worker
 * (spec 08 §4 `tools`, fase H). Sem React e sem acesso global: tudo entra por `ToolBridgeDeps`, por isso roda igual no app
 * e nos testes. Garantias: a resposta do handler é validada e limitada (`sanitizeToolReply`); o lote só é aplicado pela
 * porta de escrita (lista branca, atômico, um passo de desfazer) e só com `model.write` concedida; falha do handler
 * vira estado `failed` da ferramenta, nunca derruba o app.
 */
import { sanitizeToolReply, type ContributionRegistry, type ModelPort, type PluginText } from '@hestia/plugin-api';
import type { PluginToolBridge, PluginToolSpec } from '@hestia/tools';
import type { PluginLog } from './pluginLog.ts';

export interface ToolBridgeDeps {
  registry: ContributionRegistry;
  /** Chama uma função exportada pelo script (`ctx` entra na frente, no Worker). Rejeita se o suplemento não está ativo ou o handler falha. */
  call: (pluginId: string, handler: string, args: unknown[]) => Promise<unknown>;
  model: ModelPort;
  pluginName: (pluginId: string) => string;
  log: PluginLog;
  /** Texto visível no idioma da interface. */
  text: (t: PluginText) => string;
  /** Mensagem traduzida do dicionário da interface (`supui_*`). */
  message: (key: 'supui_tool_failed' | 'supui_tool_nothing_to_pick' | 'supui_tool_no_write' | 'supui_tool_rejected' | 'supui_tool_applied', args?: Record<string, string | number>) => string;
  /** Entrega a ferramenta ao editor (ativa). `redraw` é fornecido pelo editor. */
  start: (spec: Omit<PluginToolSpec, 'redraw'>, bridge: PluginToolBridge) => void;
  /** Avisa a barra de estado/contador de falhas (ex.: `notify({ kind: 'handler-error' })`). */
  onFailure: (pluginId: string) => void;
}

export type OpenToolResult = { ok: true } | { ok: false; code: 'unknown_tool' };

/** Abre a ferramenta `toolId` do suplemento (ids qualificados `<pluginId>:<toolId>`); `values` vêm do diálogo que a chamou; `maxCommands` é o `maxCommandsPerAction` do manifesto. */
export function openPluginTool(d: ToolBridgeDeps, pluginId: string, toolId: string, values?: Record<string, unknown>, maxCommands?: number): OpenToolResult {
  const tool = d.registry.tool(`${pluginId}:${toolId}`);
  if (!tool) return { ok: false, code: 'unknown_tool' };
  const name = d.pluginName(pluginId);
  const bridge: PluginToolBridge = {
    async send(event) {
      try {
        return sanitizeToolReply(await d.call(pluginId, tool.onCommit, [event]));
      } catch (e) {
        d.log.append(pluginId, 'error', `ferramenta "${toolId}" falhou: ${e instanceof Error ? e.message : String(e)}`);
        d.onFailure(pluginId);
        throw e;
      }
    },
    apply(label, commands) {
      if (!d.registry.hasGrant(pluginId, 'model.write')) return { ok: false, error: d.message('supui_tool_no_write', { name }) };
      const r = d.model.apply(pluginId, label, commands, maxCommands !== undefined ? { maxCommands } : undefined);
      if (r.ok) return { ok: true, applied: r.applied };
      d.log.append(pluginId, 'warn', `lote recusado (${label}): ${r.error}`);
      return { ok: false, error: d.message('supui_tool_rejected', { error: r.error }) };
    },
  };
  d.start(
    {
      id: tool.qid,
      title: d.text(tool.title),
      prompts: tool.prompts.map((p) => ({ key: p.key, kind: p.kind, label: d.text(p.label) })),
      ...(values ? { values } : {}),
      messages: { failed: d.message('supui_tool_failed', { name }), nothingToPick: d.message('supui_tool_nothing_to_pick') },
    },
    bridge,
  );
  return { ok: true };
}
