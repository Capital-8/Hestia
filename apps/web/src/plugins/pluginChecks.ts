/**
 * Verificações de suplementos no painel de problemas (ADR 0057, fase E): o gancho do `IssuesButton` e a ação `check`.
 * A execução em si está em `pluginChecksRun.ts`.
 */
import { useEffect, useState } from 'react';
import type { ValidationIssue } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useI18n } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { computePluginIssues } from './pluginChecksRun.ts';
import { pluginRegistry, usePluginRegistryVersion } from './registry.ts';

/** Tempo de silêncio antes de reavaliar depois de uma edição (as verificações do núcleo usam o mesmo critério). */
const SETTLE_MS = 400;

/** Itens das verificações de suplementos para o projeto atual; reavalia ao editar e ao ligar/desligar suplementos. */
export function usePluginIssues(): ValidationIssue[] {
  const project = useProject();
  const version = usePluginRegistryVersion();
  const lang = useI18n((s) => s.lang);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  useEffect(() => {
    if (pluginRegistry.checks().length === 0) {
      setIssues((a) => (a.length ? [] : a));
      return;
    }
    let cancelled = false;
    const h = setTimeout(() => void computePluginIssues(project, pluginRegistry, lang).then((r) => { if (!cancelled) setIssues(r); }), SETTLE_MS);
    return () => { cancelled = true; clearTimeout(h); };
  }, [project, version, lang]);
  return issues;
}

/** Ação `check` do manifesto: reavalia a verificação e avisa na barra de estado quantos itens ela gerou. */
export function runPluginCheckAction(pluginId: string, checkId: string): void {
  const lang = useI18n.getState().lang;
  const c = pluginRegistry.checks().find((x) => x.pluginId === pluginId && x.id === checkId);
  if (!c) return;
  void computePluginIssues(editor.project, pluginRegistry, lang, { pluginId, checkId }).then((r) =>
    useUi.setState({ status: { key: 'sup_e_status_check', args: { name: c.pluginName, n: r.length } } }));
}
