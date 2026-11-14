/**
 * Verificações (`checks`) dos suplementos no formato do painel de problemas (ADR 0057, spec 08 §4).
 *
 * Convenção da regra declarativa: `rule` descreve o que DEVE valer (como a norma). Regra verdadeira = elemento
 * conforme; falsa = vira um `ValidationIssue`. Erro de avaliação (expressão inválida) nunca derruba o app: a
 * verificação é abandonada e o erro é contado em `errors`. O texto da mensagem aceita `{campo}` com os campos de
 * `pluginFields.ts`. Comprimentos nas unidades do modelo (metro).
 */
import { ExprError, evalExpr, fillTemplate, validateExpr } from './pluginExpr.ts';
import { matchesSource, pluginFieldsOf } from './pluginFields.ts';
import type { ValidationIssue, ValidationSeverity } from './validate.ts';
import type { Project } from './types.ts';

/** Verificação já resolvida pelo host (texto no idioma da interface, regra como JSON). */
export interface PluginCheckSpec {
  pluginId: string;
  id: string;
  severity: ValidationSeverity;
  /** Origem dos elementos (`wall`, `opening`, `door`, ...). */
  applyTo: string;
  /** Regra JSONLogic restrita; ausente quando a verificação é de script (`handler`). */
  rule?: unknown;
  /** Texto com `{campos}`. */
  message: string;
}

/** Tetos: um suplemento com defeito não inunda o painel nem o processador. */
export const CHECK_LIMITS = { issuesPerCheck: 200, messageChars: 300 } as const;

export interface CheckRunResult {
  issues: ValidationIssue[];
  /** Verificações que falharam ao avaliar (para o log do suplemento). */
  errors: Array<{ pluginId: string; checkId: string; code: string }>;
}

/** Código estável do item no painel: `plugin:<pluginId>:<checkId>`. */
export const checkIssueCode = (c: Pick<PluginCheckSpec, 'pluginId' | 'id'>): string => `plugin:${c.pluginId}:${c.id}`;

/** Roda as verificações DECLARATIVAS (com `rule`) sobre o projeto. Puro e determinístico (ordem por id do elemento). */
export function runDeclarativeChecks(p: Project, checks: readonly PluginCheckSpec[]): CheckRunResult {
  const issues: ValidationIssue[] = [];
  const errors: CheckRunResult['errors'] = [];
  const elements = Object.values(p.elements).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of checks) {
    if (c.rule === undefined) continue;
    const bad = validateExpr(c.rule);
    if (bad) { errors.push({ pluginId: c.pluginId, checkId: c.id, code: bad.code }); continue; }
    let found = 0;
    let failed: string | null = null;
    for (const e of elements) {
      if (!matchesSource(e, c.applyTo)) continue;
      const fields = pluginFieldsOf(p, e);
      try {
        const ok = evalExpr(c.rule, fields);
        if (Array.isArray(ok) ? ok.length > 0 : ok) continue; // conforme
      } catch (err) {
        failed = err instanceof ExprError ? err.code : 'error';
        break;
      }
      if (++found > CHECK_LIMITS.issuesPerCheck) break;
      issues.push({
        severity: c.severity, code: checkIssueCode(c), elementId: e.id,
        message: fillTemplate(c.message, fields).slice(0, CHECK_LIMITS.messageChars),
      });
    }
    if (failed) errors.push({ pluginId: c.pluginId, checkId: c.id, code: failed });
  }
  return { issues, errors };
}

/**
 * Converte o que um handler de script devolveu em itens do painel. Formato aceito: lista de
 * `{ elementId?: string, message?: string }`; sem `message`, usa a da verificação preenchida com os campos do elemento.
 * Tudo é dado não confiável: elemento inexistente perde o vínculo, texto é cortado e o total é limitado.
 */
export function issuesFromHandlerResult(p: Project, c: PluginCheckSpec, value: unknown): ValidationIssue[] {
  if (!Array.isArray(value)) return [];
  const out: ValidationIssue[] = [];
  for (const it of value.slice(0, CHECK_LIMITS.issuesPerCheck)) {
    if (typeof it !== 'object' || it === null) continue;
    const r = it as { elementId?: unknown; message?: unknown };
    const el = typeof r.elementId === 'string' ? p.elements[r.elementId] : undefined;
    const msg = typeof r.message === 'string' && r.message ? r.message : fillTemplate(c.message, el ? pluginFieldsOf(p, el) : {});
    out.push({ severity: c.severity, code: checkIssueCode(c), message: msg.slice(0, CHECK_LIMITS.messageChars), ...(el ? { elementId: el.id } : {}) });
  }
  return out;
}
