/**
 * Quantitativos (`schedules`) dos suplementos: colunas, filtro, agrupamento, totais e CSV (ADR 0057, spec 08 §4).
 * Usa o mesmo avaliador JSONLogic restrito dos checks. Valores em unidades do modelo (metro, metro quadrado, metro cúbico);
 * a tela formata para exibição. Puro: não escreve no projeto.
 */
import { evalExpr, validateExpr, type ExprValue, type ExprVars } from './pluginExpr.ts';
import { matchesSource, pluginFieldsOf } from './pluginFields.ts';
import type { Project } from './types.ts';

export type ScheduleCell = string | number | boolean | null;

export interface PluginScheduleSpec {
  pluginId: string;
  id: string;
  title: string;
  source: string;
  columns: Array<{ key: string; title: string; expr: unknown; unit?: string; total?: 'sum' | 'count' }>;
  filter?: unknown;
  groupBy?: string[];
}

export interface ScheduleTable {
  columns: Array<{ key: string; title: string; unit?: string }>;
  /** `count` = elementos que formam a linha (1 sem agrupamento). */
  rows: Array<{ cells: ScheduleCell[]; count: number; elementIds: string[] }>;
  /** Linha de totais (só as colunas com `total`); `null` quando nenhuma coluna pede total. */
  totals: ScheduleCell[] | null;
  /** Células que falharam ao avaliar (viram `null`); serve de aviso. */
  errors: number;
  /** Limite de linhas atingido. */
  truncated: boolean;
}

export const SCHEDULE_LIMITS = { maxRows: 5000 } as const;

const r6 = (n: number): number => Math.round(n * 1e6) / 1e6;

const toCell = (v: ExprValue): ScheduleCell => (Array.isArray(v) ? v.join(', ') : v);

const truthy = (v: ExprValue): boolean => (Array.isArray(v) ? v.length > 0 : !!v);

/** A expressão usa `sum`/`count` (agregação)? */
function usesAggregate(e: unknown): boolean {
  if (Array.isArray(e)) return e.some(usesAggregate);
  if (typeof e !== 'object' || e === null) return false;
  return Object.entries(e).some(([k, v]) => k === 'sum' || k === 'count' || usesAggregate(v));
}

const cmp = (a: ScheduleCell, b: ScheduleCell): number =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });

interface Line { id: string; vars: ExprVars; cells: ScheduleCell[] }

/** Monta a tabela. Expressão inválida zera a coluna (células `null`) e conta em `errors`; nunca lança. */
export function buildSchedule(p: Project, spec: PluginScheduleSpec): ScheduleTable {
  const cols = spec.columns;
  let errors = 0;
  const safe = (expr: unknown, vars: ExprVars, rows?: readonly ExprVars[]): ExprValue => {
    try {
      return evalExpr(expr, vars, rows ? { rows } : {});
    } catch {
      errors++;
      return null;
    }
  };
  const elements = Object.values(p.elements).filter((e) => matchesSource(e, spec.source)).sort((a, b) => (a.id < b.id ? -1 : 1));
  let kept = elements.map((e) => ({ id: e.id, vars: pluginFieldsOf(p, e) }));
  if (spec.filter !== undefined) {
    if (validateExpr(spec.filter)) { errors++; kept = []; }
    else kept = kept.filter((r) => truthy(safe(spec.filter, r.vars)));
  }
  const allVars = kept.map((r) => r.vars);
  const lines: Line[] = kept.map((r) => ({ ...r, cells: cols.map((c) => toCell(safe(c.expr, r.vars, allVars))) }));
  const keyIdx = (spec.groupBy ?? []).map((k) => cols.findIndex((c) => c.key === k)).filter((i) => i >= 0);

  let rows: ScheduleTable['rows'];
  if (keyIdx.length === 0) {
    rows = lines.map((r) => ({ cells: r.cells, count: 1, elementIds: [r.id] }));
  } else {
    const groups = new Map<string, Line[]>();
    for (const r of lines) {
      const k = JSON.stringify(keyIdx.map((i) => r.cells[i]));
      const g = groups.get(k);
      if (g) g.push(r); else groups.set(k, [r]);
    }
    rows = [...groups.values()].map((g) => {
      const gv = g.map((r) => r.vars);
      const first = g[0] as Line;
      const cells = cols.map((c, i): ScheduleCell => {
        if (keyIdx.includes(i)) return first.cells[i] ?? null;
        if (c.total === 'count') return g.length;
        if (c.total === 'sum') return r6(g.reduce((s, r) => s + (typeof r.cells[i] === 'number' ? (r.cells[i] as number) : 0), 0));
        if (usesAggregate(c.expr)) return toCell(safe(c.expr, first.vars, gv));
        const v = first.cells[i] ?? null;
        return g.every((r) => r.cells[i] === v) ? v : null; // célula que varia dentro do grupo fica em branco
      });
      return { cells, count: g.length, elementIds: g.map((r) => r.id) };
    });
    rows.sort((a, b) => { for (const i of keyIdx) { const d = cmp(a.cells[i] ?? null, b.cells[i] ?? null); if (d) return d; } return 0; });
  }
  const truncated = rows.length > SCHEDULE_LIMITS.maxRows;
  if (truncated) rows = rows.slice(0, SCHEDULE_LIMITS.maxRows);

  const totals = cols.some((c) => c.total)
    ? cols.map((c, i): ScheduleCell => {
        if (c.total === 'count') return rows.reduce((s, r) => s + r.count, 0);
        if (c.total === 'sum') return r6(rows.reduce((s, r) => s + (typeof r.cells[i] === 'number' ? (r.cells[i] as number) : 0), 0));
        return null;
      })
    : null;
  return { columns: cols.map((c) => ({ key: c.key, title: c.title, ...(c.unit ? { unit: c.unit } : {}) })), rows, totals, errors, truncated };
}

export interface CsvOptions {
  /** Separador de campos. Padrão `,`; use `;` com vírgula decimal (Excel em pt-BR). */
  separator?: ',' | ';';
  decimalComma?: boolean;
  totalsLabel?: string;
}

/**
 * CSV (RFC 4180: aspas dobradas, quebra CRLF). Texto que começa com `=`, `+`, `-`, `@` ou tab recebe apóstrofo
 * para o Excel não o tratar como fórmula (o conteúdo vem de suplemento e do projeto, dado não confiável).
 */
export function scheduleToCsv(t: ScheduleTable, o: CsvOptions = {}): string {
  const sep = o.separator ?? ',';
  const esc = (c: ScheduleCell): string => {
    let s = c === null ? '' : typeof c === 'number' && o.decimalComma ? String(c).replace('.', ',') : String(c);
    if (typeof c === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /["\r\n]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.columns.map((c) => esc(c.unit ? `${c.title} (${c.unit})` : c.title)).join(sep)];
  for (const r of t.rows) lines.push(r.cells.map(esc).join(sep));
  if (t.totals) lines.push(t.totals.map((c, i) => esc(i === 0 && c === null ? (o.totalsLabel ?? 'Total') : c)).join(sep));
  return lines.join('\r\n') + '\r\n';
}
