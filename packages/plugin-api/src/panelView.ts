/**
 * Visão declarativa de painel (spec 08 §4, fase H): árvore de blocos `text`, `value`, `row`, `table`, `button` e
 * `input`. Só dados: sem HTML, sem script, sem URL. O manifesto traz JSON não confiável; `parseView` recusa o que não
 * conhece e impõe limites. Quem desenha é a interface do app (`PluginPanel.tsx`).
 */
import type { DialogField, DialogFieldType, JsonValue, PluginAction, PluginActionType, PluginText } from './contributesTypes.ts';

/** Grandeza exibida nas unidades do projeto: `length` chega em metro e `angle` em radiano. */
export type ViewQuantity = 'length' | 'angle';

export type ViewNode =
  | { type: 'text'; text: PluginText }
  | { type: 'value'; field: string; label?: PluginText; unit?: ViewQuantity }
  | { type: 'row'; children: ViewNode[] }
  | { type: 'table'; columns: Array<{ title: PluginText; field: string; unit?: ViewQuantity }> }
  | { type: 'button'; label: PluginText; run: PluginAction }
  | { type: 'input'; field: DialogField };

export const VIEW_LIMITS = { depth: 6, nodes: 200, textChars: 400, columns: 12, fieldPathChars: 80 } as const;

const PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/;
const FIELD_TYPES: readonly DialogFieldType[] = ['number', 'text', 'choice', 'bool', 'length', 'angle'];
const ACTIONS: readonly PluginActionType[] = ['dialog', 'tool', 'exporter', 'importer', 'handler'];
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function txt(v: unknown): PluginText | null {
  if (typeof v === 'string') return v.trim() !== '' && v.length <= VIEW_LIMITS.textChars ? v : null;
  if (isObj(v) && typeof v.pt === 'string' && typeof v.en === 'string' && v.pt.length <= VIEW_LIMITS.textChars && v.en.length <= VIEW_LIMITS.textChars) return { pt: v.pt, en: v.en };
  return null;
}
const path = (v: unknown): string | null =>
  typeof v === 'string' && v.length <= VIEW_LIMITS.fieldPathChars && PATH_RE.test(v) && !v.split('.').some((k) => FORBIDDEN.has(k)) ? v : null;
const quantity = (v: unknown): ViewQuantity | undefined | null => (v === undefined ? undefined : v === 'length' || v === 'angle' ? v : null);
const num = (x: unknown): number | undefined | null => (x === undefined ? undefined : typeof x === 'number' && Number.isFinite(x) ? x : null);

export type ViewResult = { ok: true; view: ViewNode[] } | { ok: false; path: string };

function inputOf(v: Record<string, unknown>): ViewNode | null {
  const key = typeof v.key === 'string' && KEY_RE.test(v.key) ? v.key : null;
  const label = txt(v.label);
  const type = FIELD_TYPES.includes(v.input as DialogFieldType) ? (v.input as DialogFieldType) : null;
  const min = num(v.min), max = num(v.max);
  const def = v.default === undefined ? undefined : (typeof v.default === 'string' && v.default.length <= 200) || typeof v.default === 'boolean' || (typeof v.default === 'number' && Number.isFinite(v.default)) ? v.default : null;
  const options = v.options === undefined ? undefined : Array.isArray(v.options) && v.options.length <= 50 && v.options.every((o) => typeof o === 'string' && o !== '' && o.length <= 80) ? (v.options as string[]) : null;
  if (!key || !label || !type || min === null || max === null || def === null || options === null || (type === 'choice' && !options)) return null;
  return { type: 'input', field: { key, label, type, ...(def !== undefined ? { default: def } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(options ? { options } : {}) } };
}

/** Valida e normaliza a visão (nó único ou lista de nós). Campos desconhecidos são descartados. */
export function parseView(raw: JsonValue | unknown): ViewResult {
  let count = 0;
  let bad = '';
  const fail = (p: string): null => { bad ||= p; return null; };
  const node = (v: unknown, depth: number, p: string): ViewNode | null => {
    if (++count > VIEW_LIMITS.nodes) return fail(p);
    if (!isObj(v) || depth > VIEW_LIMITS.depth) return fail(p);
    switch (v.type) {
      case 'text': { const t = txt(v.text); return t ? { type: 'text', text: t } : fail(`${p}.text`); }
      case 'value': {
        const field = path(v.field), unit = quantity(v.unit);
        const label = v.label === undefined ? undefined : txt(v.label);
        if (!field || unit === null || label === null) return fail(p);
        return { type: 'value', field, ...(label ? { label } : {}), ...(unit ? { unit } : {}) };
      }
      case 'row': {
        if (!Array.isArray(v.children)) return fail(`${p}.children`);
        const children: ViewNode[] = [];
        for (let i = 0; i < v.children.length; i++) {
          const c = node(v.children[i], depth + 1, `${p}.children[${i}]`);
          if (!c) return null;
          children.push(c);
        }
        return { type: 'row', children };
      }
      case 'table': {
        if (!Array.isArray(v.columns) || v.columns.length === 0 || v.columns.length > VIEW_LIMITS.columns) return fail(`${p}.columns`);
        const columns: Array<{ title: PluginText; field: string; unit?: ViewQuantity }> = [];
        for (let i = 0; i < v.columns.length; i++) {
          const c = v.columns[i] as unknown;
          const title = isObj(c) ? txt(c.title) : null, field = isObj(c) ? path(c.field) : null, unit = isObj(c) ? quantity(c.unit) : null;
          if (!title || !field || unit === null) return fail(`${p}.columns[${i}]`);
          columns.push({ title, field, ...(unit ? { unit } : {}) });
        }
        return { type: 'table', columns };
      }
      case 'button': {
        const label = txt(v.label), run = v.run;
        if (!label || !isObj(run) || !ACTIONS.includes(run.type as PluginActionType) || typeof run.ref !== 'string' || run.ref === '' || run.ref.length > 100) return fail(p);
        const action: PluginAction = { type: run.type as PluginActionType, ref: run.ref };
        return { type: 'button', label, run: action };
      }
      case 'input': return inputOf(v) ?? fail(p);
      default: return fail(`${p}.type`);
    }
  };
  const list = Array.isArray(raw) ? raw : [raw];
  const view: ViewNode[] = [];
  for (let i = 0; i < list.length; i++) {
    const n = node(list[i], 1, Array.isArray(raw) ? `[${i}]` : '');
    if (!n) return { ok: false, path: bad };
    view.push(n);
  }
  return { ok: true, view };
}

/** Campos `input` da visão (todos os níveis), na ordem em que aparecem. */
export function viewInputs(view: readonly ViewNode[]): DialogField[] {
  const out: DialogField[] = [];
  const visit = (n: ViewNode): void => {
    if (n.type === 'input') out.push(n.field);
    else if (n.type === 'row') n.children.forEach(visit);
  };
  view.forEach(visit);
  return out;
}

/** Lê `a.b.c` de um objeto (só propriedades próprias; `__proto__` e afins são recusados). Só devolve primitivos. */
export function readFieldPath(obj: unknown, fieldPath: string): string | number | boolean | undefined {
  let cur: unknown = obj;
  for (const k of fieldPath.split('.')) {
    if (FORBIDDEN.has(k) || cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean' ? cur : undefined;
}
