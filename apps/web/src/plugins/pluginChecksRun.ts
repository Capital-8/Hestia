/**
 * Execução das verificações de suplementos (ADR 0057, spec 08 §4, fase E), sem React nem store do editor (testável).
 *
 * Declarativas (`rule`): avaliadas de forma síncrona pelo avaliador JSONLogic restrito do modelo. De script
 * (`handler`): chamadas ao Worker do suplemento por um executor injetado (`setCheckHandlerRunner`), com tempo e memória
 * limitados pelo próprio Worker. Falha de um suplemento vira linha no log dele e nunca atrapalha o app nem as demais
 * verificações. Os itens saem no formato `ValidationIssue`, prontos para o painel de problemas.
 */
import type { ContributionRegistry, RegisteredCheck } from '@hestia/plugin-api';
import { issuesFromHandlerResult, runDeclarativeChecks, type PluginCheckSpec, type Project, type ValidationIssue } from '@hestia/model';
import type { Lang } from '../editor/i18n.ts';
import { txt } from '../ui/ribbon/model.ts';
import { pluginLog } from './pluginLog.ts';

/** Chama o handler de um script: ligado por `supApp.ts` ao `PluginLoader.call`. Sem ele, só as declarativas rodam. */
export type CheckHandlerRunner = (pluginId: string, handler: string) => Promise<unknown>;

let handlerRunner: CheckHandlerRunner | null = null;

export function setCheckHandlerRunner(fn: CheckHandlerRunner | null): CheckHandlerRunner | null {
  const antes = handlerRunner;
  handlerRunner = fn;
  return antes;
}

/** Verificação registrada -> especificação do modelo (texto no idioma ativo). */
function specOf(c: RegisteredCheck, lang: Lang): PluginCheckSpec {
  return {
    pluginId: c.pluginId, id: c.id, severity: c.severity, applyTo: c.applyTo, message: txt(c.message, lang),
    ...(c.rule !== undefined ? { rule: c.rule } : {}),
  };
}

/**
 * Roda as verificações dos suplementos ativos (filtradas por `pluginId`/`checkId` quando dados). Nunca lança.
 * Devolve os itens na ordem: declarativas, depois cada handler.
 */
export async function computePluginIssues(
  project: Project, registry: ContributionRegistry, lang: Lang, only?: { pluginId?: string; checkId?: string },
): Promise<ValidationIssue[]> {
  const all = registry.checks().filter((c) => (!only?.pluginId || c.pluginId === only.pluginId) && (!only?.checkId || c.id === only.checkId));
  if (all.length === 0) return [];
  const specs = all.map((c) => specOf(c, lang));
  const out: ValidationIssue[] = [];
  try {
    const r = runDeclarativeChecks(project, specs);
    out.push(...r.issues);
    for (const e of r.errors) pluginLog.append(e.pluginId, 'warn', `verificação "${e.checkId}" ignorada: ${e.code}`);
  } catch (e) {
    pluginLog.append('hestia', 'error', `verificações declarativas falharam: ${e instanceof Error ? e.message : String(e)}`);
  }
  const run = handlerRunner;
  if (!run) return out;
  for (const c of all) {
    if (c.handler === undefined) continue;
    try {
      out.push(...issuesFromHandlerResult(project, specOf(c, lang), await run(c.pluginId, c.handler)));
    } catch (e) {
      pluginLog.append(c.pluginId, 'error', `verificação "${c.id}" (handler) falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
