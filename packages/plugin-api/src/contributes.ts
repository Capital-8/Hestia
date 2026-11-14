import {
  CONTRIBUTES_LIMITS as L, POINT_CAPABILITY,
  type CheckContribution, type CommandContribution, type Contributes, type DialogContribution, type DialogField, type DialogFieldType,
  type ExporterContribution, type FamilyContribution, type ImporterContribution, type JsonValue, type MaterialContribution, type PanelContribution,
  type PluginAction, type PluginActionType, type PluginText, type RibbonContribution, type ScheduleContribution, type ToolContribution,
} from './contributesTypes.ts';

/** Problema achado em `contributes` (ou no manifesto 2.0). `path` aponta o campo, ex.: `contributes.commands[0].id`. */
export type ContributesIssue =
  | { code: 'bad_field'; path: string }
  | { code: 'too_many'; path: string }
  | { code: 'duplicate_id'; path: string }
  | { code: 'unknown_ref'; path: string }
  | { code: 'missing_capability'; path: string; capability: string }
  | { code: 'runtime_conflict'; path: string };

/** Tabela de textos do manifesto: `{ pt: { chave: texto }, en: { ... } }`. */
export type I18nTable = Record<string, Record<string, string>>;

const CONTRIB_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/;
const ICON_RE = /^[a-z][A-Za-z0-9-]{0,39}$/;
const EXT_RE = /^[a-z0-9]{1,10}$/;
const MIME_RE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ACTION_TYPES: readonly PluginActionType[] = ['dialog', 'tool', 'exporter', 'importer', 'handler', 'schedule', 'check'];
const FIELD_TYPES: readonly DialogFieldType[] = ['number', 'text', 'choice', 'bool', 'length', 'angle'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON puro até `depth` níveis (sem `undefined`, função, `NaN`, ciclo implícito pelo limite de profundidade). */
export function isPureJson(v: unknown, depth: number = L.jsonDepth): v is JsonValue {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (depth <= 0) return false;
  if (Array.isArray(v)) return v.every((x) => isPureJson(x, depth - 1));
  if (isObj(v)) return Object.values(v).every((x) => isPureJson(x, depth - 1));
  return false;
}

/** Profundidade de aninhamento de um JSON (valor simples = 0). */
const jsonDepth = (v: JsonValue): number => (Array.isArray(v) ? 1 + Math.max(0, ...v.map(jsonDepth)) : v !== null && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(jsonDepth)) : 0);

/** Contexto de validação: acumula problemas e resolve textos. */
class Cx {
  issues: ContributesIssue[] = [];
  constructor(readonly i18n: I18nTable) {}
  bad(path: string): undefined { this.issues.push({ code: 'bad_field', path }); return undefined; }
  str(v: unknown, path: string, max: number): string | undefined {
    return typeof v === 'string' && v.trim() !== '' && v.length <= max ? v : this.bad(path);
  }
  opt<T>(v: unknown, fn: (x: unknown) => T | undefined): T | undefined { return v === undefined ? undefined : fn(v); }
  id(v: unknown, path: string): string | undefined { return typeof v === 'string' && CONTRIB_ID.test(v) ? v : this.bad(path); }
  text(v: unknown, path: string, max: number = L.titleChars): PluginText | undefined {
    if (typeof v === 'string') {
      if (v.startsWith('%')) {
        const key = v.slice(1);
        const pt = this.i18n.pt?.[key];
        const en = this.i18n.en?.[key];
        if (pt === undefined || en === undefined || pt.length > max || en.length > max) return this.bad(path);
        return { pt, en };
      }
      return this.str(v, path, max);
    }
    if (isObj(v) && typeof v.pt === 'string' && typeof v.en === 'string' && v.pt.trim() !== '' && v.en.trim() !== '' && v.pt.length <= max && v.en.length <= max) return { pt: v.pt, en: v.en };
    return this.bad(path);
  }
  json(v: unknown, path: string, depth: number = L.jsonDepth, chars?: number): JsonValue | undefined {
    if (!isPureJson(v, depth) || jsonDepth(v as JsonValue) > depth) return this.bad(path);
    if (chars !== undefined && JSON.stringify(v).length > chars) return this.bad(path);
    return v as JsonValue;
  }
  /** Lista de objetos com limite; cada item passa por `fn`. Itens inválidos são relatados e descartados. */
  items<T>(v: unknown, path: string, max: number, fn: (o: Record<string, unknown>, p: string) => T | undefined): T[] | undefined {
    if (!Array.isArray(v)) return this.bad(path);
    if (v.length > max) { this.issues.push({ code: 'too_many', path }); return undefined; }
    const out: T[] = [];
    v.forEach((o, i) => {
      const p = `${path}[${i}]`;
      if (!isObj(o)) { this.bad(p); return; }
      const r = fn(o, p);
      if (r !== undefined) out.push(r);
    });
    return out;
  }
  strings(v: unknown, path: string, max: number, each: number, re?: RegExp): string[] | undefined {
    if (!Array.isArray(v) || v.length > max || !v.every((s) => typeof s === 'string' && s !== '' && s.length <= each && (!re || re.test(s)))) return this.bad(path);
    return v as string[];
  }
}

const action = (cx: Cx, v: unknown, path: string): PluginAction | undefined => {
  if (!isObj(v) || !ACTION_TYPES.includes(v.type as PluginActionType)) return cx.bad(path);
  const ref = v.type === 'handler' ? cx.str(v.ref, `${path}.ref`, 100) : cx.id(v.ref, `${path}.ref`);
  return ref === undefined ? undefined : { type: v.type as PluginActionType, ref };
};

const unique = <T extends { id: string }>(cx: Cx, list: T[] | undefined, path: string): T[] | undefined => {
  if (!list) return undefined;
  const seen = new Set<string>();
  list.forEach((e, i) => { if (seen.has(e.id)) cx.issues.push({ code: 'duplicate_id', path: `${path}[${i}].id` }); seen.add(e.id); });
  return list;
};

const commandOf = (cx: Cx) => (o: Record<string, unknown>, p: string): CommandContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`), run = action(cx, o.run, `${p}.run`);
  const keywords = cx.opt(o.keywords, (k) => cx.strings(k, `${p}.keywords`, 20, 40));
  return id && title && run ? { id, title, run, ...(keywords ? { keywords } : {}) } : undefined;
};

const fieldOf = (cx: Cx) => (o: Record<string, unknown>, p: string): DialogField | undefined => {
  const key = typeof o.key === 'string' && KEY_RE.test(o.key) ? o.key : cx.bad(`${p}.key`);
  const label = cx.text(o.label, `${p}.label`);
  const type = FIELD_TYPES.includes(o.type as DialogFieldType) ? (o.type as DialogFieldType) : cx.bad(`${p}.type`);
  const num = (x: unknown, f: string): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : cx.bad(`${p}.${f}`));
  const def = o.default === undefined ? undefined : (typeof o.default === 'string' && o.default.length <= 200) || typeof o.default === 'boolean' || (typeof o.default === 'number' && Number.isFinite(o.default)) ? o.default : cx.bad(`${p}.default`);
  const min = cx.opt(o.min, (x) => num(x, 'min')), max = cx.opt(o.max, (x) => num(x, 'max'));
  const options = cx.opt(o.options, (x) => cx.strings(x, `${p}.options`, 50, 80));
  if (type === 'choice' && !options) cx.bad(`${p}.options`);
  return key && label && type ? { key, label, type, ...(def !== undefined ? { default: def } : {}), ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(options ? { options } : {}) } : undefined;
};

const dialogOf = (cx: Cx) => (o: Record<string, unknown>, p: string): DialogContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`);
  const fields = cx.items(o.fields, `${p}.fields`, 40, fieldOf(cx));
  const actions = cx.items(o.actions, `${p}.actions`, 10, (a, ap) => {
    const aid = cx.id(a.id, `${ap}.id`), label = cx.text(a.label, `${ap}.label`), run = action(cx, a.run, `${ap}.run`);
    return aid && label && run ? { id: aid, label, run } : undefined;
  });
  return id && title && fields && actions ? { id, title, fields, actions } : undefined;
};

const toolOf = (cx: Cx) => (o: Record<string, unknown>, p: string): ToolContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`);
  const icon = cx.opt(o.icon, (x) => (typeof x === 'string' && ICON_RE.test(x) ? x : cx.bad(`${p}.icon`)));
  const prompts = cx.items(o.prompts, `${p}.prompts`, 10, (q, qp) => {
    const key = typeof q.key === 'string' && KEY_RE.test(q.key) ? q.key : cx.bad(`${qp}.key`);
    const kind = ['point', 'line', 'polyline', 'pick-element'].includes(q.kind as string) ? (q.kind as 'point') : cx.bad(`${qp}.kind`);
    const label = cx.text(q.label, `${qp}.label`);
    return key && kind && label ? { key, kind, label } : undefined;
  });
  const onCommit = cx.str(o.onCommit, `${p}.onCommit`, 100);
  return id && title && prompts && onCommit ? { id, title, prompts, onCommit, ...(icon ? { icon } : {}) } : undefined;
};

const panelOf = (cx: Cx) => (o: Record<string, unknown>, p: string): PanelContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`);
  const dock = o.dock === 'properties' || o.dock === 'browser' ? o.dock : cx.bad(`${p}.dock`);
  const view = cx.json(o.view, `${p}.view`);
  let when: PanelContribution['when'];
  if (o.when !== undefined) {
    const w = o.when;
    const kind = isObj(w) ? cx.str(w.kind, `${p}.when.kind`, 40) : cx.bad(`${p}.when`);
    const min = isObj(w) && w.minSelected !== undefined ? (Number.isInteger(w.minSelected) && (w.minSelected as number) >= 0 && (w.minSelected as number) <= 1000 ? (w.minSelected as number) : cx.bad(`${p}.when.minSelected`)) : undefined;
    if (kind) when = { kind, ...(min !== undefined ? { minSelected: min } : {}) };
  }
  return id && title && dock && view !== undefined ? { id, title, dock, view, ...(when ? { when } : {}) } : undefined;
};

const importerOf = (cx: Cx) => (o: Record<string, unknown>, p: string): ImporterContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`), handler = cx.str(o.handler, `${p}.handler`, 100);
  const extensions = cx.strings(o.extensions, `${p}.extensions`, 20, 10, EXT_RE);
  return id && title && handler && extensions ? { id, title, extensions, handler } : undefined;
};

const exporterOf = (cx: Cx) => (o: Record<string, unknown>, p: string): ExporterContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`);
  const extension = typeof o.extension === 'string' && EXT_RE.test(o.extension) ? o.extension : cx.bad(`${p}.extension`);
  const mime = typeof o.mime === 'string' && o.mime.length <= 100 && MIME_RE.test(o.mime) ? o.mime : cx.bad(`${p}.mime`);
  const handler = cx.opt(o.handler, (x) => cx.str(x, `${p}.handler`, 100));
  const template = cx.opt(o.template, (x) => cx.json(x, `${p}.template`));
  if ((handler === undefined) === (template === undefined)) cx.bad(p); // exatamente um dos dois
  return id && title && extension && mime && (handler !== undefined) !== (template !== undefined) ? { id, title, extension, mime, ...(handler !== undefined ? { handler } : {}), ...(template !== undefined ? { template } : {}) } : undefined;
};

const CATEGORIES = ['wall', 'opening', 'floor', 'slab', 'ceiling', 'roof', 'stair', 'ramp'] as const;
const familyOf = (cx: Cx) => (o: Record<string, unknown>, p: string): FamilyContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`);
  const category = (CATEGORIES as readonly unknown[]).includes(o.category) ? (o.category as FamilyContribution['category']) : cx.bad(`${p}.category`);
  const types = cx.items(o.types, `${p}.types`, L.familyTypes, (ty, tp) => cx.json(ty, tp) as { [k: string]: JsonValue } | undefined);
  return id && category && types ? { id, category, types } : undefined;
};

const materialOf = (cx: Cx) => (o: Record<string, unknown>, p: string): MaterialContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), name = cx.str(o.name, `${p}.name`, L.titleChars);
  const color = typeof o.color === 'string' && COLOR_RE.test(o.color) ? o.color.toLowerCase() : cx.bad(`${p}.color`);
  const unit = (x: unknown, f: string): number | undefined => (typeof x === 'number' && x >= 0 && x <= 1 ? x : cx.bad(`${p}.${f}`));
  const gloss = cx.opt(o.gloss, (x) => unit(x, 'gloss')), opacity = cx.opt(o.opacity, (x) => unit(x, 'opacity'));
  return id && name && color ? { id, name, color, ...(gloss !== undefined ? { gloss } : {}), ...(opacity !== undefined ? { opacity } : {}) } : undefined;
};

const scheduleOf = (cx: Cx) => (o: Record<string, unknown>, p: string): ScheduleContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`), source = cx.str(o.source, `${p}.source`, 40);
  const columns = cx.items(o.columns, `${p}.columns`, 30, (c, cp) => {
    const key = typeof c.key === 'string' && KEY_RE.test(c.key) ? c.key : cx.bad(`${cp}.key`);
    const ct = cx.text(c.title, `${cp}.title`);
    const expr = cx.json(c.expr, `${cp}.expr`, L.exprDepth, L.exprChars);
    const unit = cx.opt(c.unit, (x) => cx.str(x, `${cp}.unit`, 20));
    const total = c.total === undefined ? undefined : c.total === 'sum' ? 'sum' as const : c.total === 'count' ? 'count' as const : cx.bad(`${cp}.total`);
    return key && ct && expr !== undefined ? { key, title: ct, expr, ...(unit ? { unit } : {}), ...(total ? { total } : {}) } : undefined;
  });
  const filter = cx.opt(o.filter, (x) => cx.json(x, `${p}.filter`, L.exprDepth, L.exprChars));
  const groupBy = cx.opt(o.groupBy, (x) => cx.strings(x, `${p}.groupBy`, 10, 40, KEY_RE));
  return id && title && source && columns ? { id, title, source, columns, ...(filter !== undefined ? { filter } : {}), ...(groupBy ? { groupBy } : {}) } : undefined;
};

const checkOf = (cx: Cx) => (o: Record<string, unknown>, p: string): CheckContribution | undefined => {
  const id = cx.id(o.id, `${p}.id`), title = cx.text(o.title, `${p}.title`), applyTo = cx.str(o.applyTo, `${p}.applyTo`, 40);
  const severity = ['info', 'warning', 'error'].includes(o.severity as string) ? (o.severity as 'info') : cx.bad(`${p}.severity`);
  const message = cx.text(o.message, `${p}.message`, L.messageChars);
  const rule = cx.opt(o.rule, (x) => cx.json(x, `${p}.rule`, L.exprDepth, L.exprChars));
  const handler = cx.opt(o.handler, (x) => cx.str(x, `${p}.handler`, 100));
  if ((rule === undefined) === (handler === undefined)) cx.bad(p); // exatamente um dos dois
  return id && title && applyTo && severity && message && (rule === undefined) !== (handler === undefined)
    ? { id, title, applyTo, severity, message, ...(rule !== undefined ? { rule } : {}), ...(handler !== undefined ? { handler } : {}) } : undefined;
};

const ribbonOf = (cx: Cx, v: unknown, path: string): RibbonContribution | undefined => {
  if (!isObj(v)) return cx.bad(path);
  const panels = cx.items(v.panels, `${path}.panels`, 20, (q, qp) => {
    const id = cx.id(q.id, `${qp}.id`), title = cx.text(q.title, `${qp}.title`);
    const items = cx.items(q.items, `${qp}.items`, 30, (it, ip) => {
      const command = cx.id(it.command, `${ip}.command`);
      const size = it.size === undefined ? undefined : it.size === 'large' ? 'large' as const : it.size === 'small' ? 'small' as const : cx.bad(`${ip}.size`);
      const icon = cx.opt(it.icon, (x) => (typeof x === 'string' && ICON_RE.test(x) ? x : cx.bad(`${ip}.icon`)));
      return command ? { command, ...(size ? { size } : {}), ...(icon ? { icon } : {}) } : undefined;
    });
    return id && title && items ? { id, title, items } : undefined;
  });
  unique(cx, panels, `${path}.panels`);
  return panels ? { panels } : undefined;
};

const countEntries = (c: Contributes): number =>
  (Object.keys(POINT_CAPABILITY) as Array<keyof Contributes>).reduce((n, k) => n + (k === 'ribbon' ? (c.ribbon?.panels.length ?? 0) : ((c[k] as unknown[] | undefined)?.length ?? 0)), 0);

export interface ContributesCheck { runtime: 'declarative' | 'script' | 'external'; capabilities: readonly string[]; i18n: I18nTable }

/**
 * Valida `contributes` (dado não confiável): campos desconhecidos são descartados, não repassados. Confere também as
 * regras cruzadas (permissão pedida, runtime, referências internas). Não executa nada.
 */
export function validateContributes(raw: unknown, chk: ContributesCheck): { value: Contributes; issues: ContributesIssue[] } {
  const cx = new Cx(chk.i18n);
  const out: Contributes = {};
  if (raw === undefined) return { value: out, issues: [] };
  if (!isObj(raw)) { cx.bad('contributes'); return { value: out, issues: cx.issues }; }
  const run = (k: keyof Contributes, fn: () => unknown): void => {
    if (raw[k] === undefined) return;
    const v = fn();
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  };
  const list = <T extends { id: string }>(k: keyof Contributes, f: (o: Record<string, unknown>, p: string) => T | undefined): void =>
    run(k, () => unique(cx, cx.items(raw[k], `contributes.${k}`, L.maxEntries, f), `contributes.${k}`));
  list('commands', commandOf(cx));
  run('ribbon', () => ribbonOf(cx, raw.ribbon, 'contributes.ribbon'));
  list('panels', panelOf(cx));
  list('dialogs', dialogOf(cx));
  list('tools', toolOf(cx));
  list('importers', importerOf(cx));
  list('exporters', exporterOf(cx));
  list('families', familyOf(cx));
  list('materials', materialOf(cx));
  list('schedules', scheduleOf(cx));
  list('checks', checkOf(cx));
  if (countEntries(out) > L.maxEntries) cx.issues.push({ code: 'too_many', path: 'contributes' });
  crossRules(cx, out, chk);
  return { value: out, issues: cx.issues };
}

/** Regras cruzadas: permissão pedida, restrições do runtime declarativo e referências que precisam existir. */
function crossRules(cx: Cx, c: Contributes, chk: ContributesCheck): void {
  for (const k of Object.keys(c) as Array<keyof Contributes>) {
    const cap = POINT_CAPABILITY[k];
    if (!chk.capabilities.includes(cap)) cx.issues.push({ code: 'missing_capability', path: `contributes.${k}`, capability: cap });
  }
  const declarative = chk.runtime === 'declarative';
  if (declarative) {
    if (c.tools) cx.issues.push({ code: 'runtime_conflict', path: 'contributes.tools' });
    if (c.importers) cx.issues.push({ code: 'runtime_conflict', path: 'contributes.importers' });
    c.exporters?.forEach((e, i) => { if (e.handler !== undefined) cx.issues.push({ code: 'runtime_conflict', path: `contributes.exporters[${i}].handler` }); });
    c.checks?.forEach((e, i) => { if (e.handler !== undefined) cx.issues.push({ code: 'runtime_conflict', path: `contributes.checks[${i}].handler` }); });
  }
  const has = (list: Array<{ id: string }> | undefined, id: string): boolean => !!list?.some((e) => e.id === id);
  const refOk = (a: PluginAction): boolean => {
    switch (a.type) {
      case 'dialog': return has(c.dialogs, a.ref);
      case 'tool': return has(c.tools, a.ref);
      case 'exporter': return has(c.exporters, a.ref);
      case 'importer': return has(c.importers, a.ref);
      case 'schedule': return has(c.schedules, a.ref);
      case 'check': return has(c.checks, a.ref);
      case 'handler': return !declarative;
    }
  };
  const chkAction = (a: PluginAction, path: string): void => {
    if (!refOk(a)) cx.issues.push({ code: a.type === 'handler' ? 'runtime_conflict' : 'unknown_ref', path });
  };
  c.commands?.forEach((cm, i) => chkAction(cm.run, `contributes.commands[${i}].run`));
  c.dialogs?.forEach((d, i) => d.actions.forEach((a, j) => chkAction(a.run, `contributes.dialogs[${i}].actions[${j}].run`)));
  c.ribbon?.panels.forEach((p, i) => p.items.forEach((it, j) => {
    if (!has(c.commands, it.command)) cx.issues.push({ code: 'unknown_ref', path: `contributes.ribbon.panels[${i}].items[${j}].command` });
  }));
}

export { isObj as isPlainObject };
