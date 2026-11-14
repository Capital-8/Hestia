/**
 * Avaliador de expressões dos suplementos (ADR 0057, spec 08 §4 `checks` e `schedules`): JSONLogic RESTRITO.
 *
 * Decisões do dono: a expressão é JSON, os operadores têm nome em inglês, não existe sintaxe própria nem palavras em
 * pt-BR, e a linguagem NÃO é Turing-completa. Por isso: (1) lista branca de operadores; (2) sem laços, sem
 * recursão e sem definição de funções; (3) profundidade e número de nós limitados; (4) `var` só enxerga os campos
 * do elemento que o chamador entrega (nunca o projeto, o `globalThis` nem protótipos).
 *
 * Unidades: comprimentos, áreas e volumes chegam como o modelo os guarda, em metro, metro quadrado e metro cúbico
 * (os suplementos nunca recebem valores nas unidades de exibição do projeto).
 *
 * Semântica (diferenças deliberadas do JSONLogic original):
 * - `==`/`!=` e `===`/`!==` são todos ESTRITOS (sem coerção de tipo);
 * - aritmética e comparação com `null` (campo ausente) dão `null` e `false`, respectivamente; nunca lançam;
 * - divisão por zero dá `null`;
 * - verdade como no JSONLogic: `null`, `false`, `0`, `""` e `[]` são falsos.
 */

/** Valor que uma expressão devolve. */
export type ExprValue = null | boolean | number | string | ExprValue[];

/** Campos de um elemento: o único mundo que a expressão enxerga. */
export type ExprVars = { readonly [k: string]: ExprValue | undefined };

/** Operadores aceitos. `sum` e `count` só valem em contexto de agregação (quantitativos). */
export const EXPR_OPERATORS = [
  'var', '+', '-', '*', '/', '==', '!=', '===', '!==', '<', '<=', '>', '>=', 'and', 'or', '!', '!!', 'if', 'in', 'round', 'min', 'max', 'sum', 'count',
] as const;
export type ExprOperator = (typeof EXPR_OPERATORS)[number];

const OPS: ReadonlySet<string> = new Set(EXPR_OPERATORS);

/** Limites padrão (spec 08 §4: profundidade 12; o tamanho de 500 caracteres é checado no manifesto). */
export const EXPR_LIMITS = { maxDepth: 12, maxNodes: 20_000, maxStaticNodes: 400, maxArray: 100 } as const;

export type ExprErrorCode = 'depth' | 'operator' | 'shape' | 'var_path' | 'too_big' | 'budget' | 'no_rows' | 'nested_aggregate' | 'type';

export class ExprError extends Error {
  constructor(readonly code: ExprErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ExprError';
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
const SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$|^\d{1,3}$/;

/** Caminho de `var` válido: segmentos `a.b.0`, sem nomes de protótipo. */
function validPath(p: unknown): p is string {
  return typeof p === 'string' && p.length > 0 && p.length <= 60 && p.split('.').every((s) => SEGMENT.test(s) && !FORBIDDEN.has(s));
}

const argsOf = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : [raw]);

/**
 * Checagem ESTÁTICA (sem dados): forma, operadores da lista branca, profundidade e tamanho. Devolve o problema ou `null`.
 * `aggregate` diz se `sum`/`count` são permitidos (colunas de quantitativo); em regras de verificação não são.
 */
export function validateExpr(expr: unknown, opts: { aggregate?: boolean } = {}): ExprError | null {
  let nodes = 0;
  const walk = (e: unknown, depth: number, inAgg: boolean): ExprError | null => {
    if (++nodes > EXPR_LIMITS.maxStaticNodes) return new ExprError('too_big');
    if (depth > EXPR_LIMITS.maxDepth) return new ExprError('depth');
    if (e === null || typeof e === 'boolean' || typeof e === 'string') return null;
    if (typeof e === 'number') return Number.isFinite(e) ? null : new ExprError('shape', 'número não finito');
    if (Array.isArray(e)) {
      if (e.length > EXPR_LIMITS.maxArray) return new ExprError('too_big');
      for (const x of e) { const r = walk(x, depth + 1, inAgg); if (r) return r; }
      return null;
    }
    if (!isObj(e)) return new ExprError('shape');
    const keys = Object.keys(e);
    if (keys.length !== 1) return new ExprError('shape', 'objeto precisa ter exatamente um operador');
    const op = keys[0] as string;
    if (!OPS.has(op) || FORBIDDEN.has(op)) return new ExprError('operator', op);
    const args = argsOf(e[op]);
    if (args.length > EXPR_LIMITS.maxArray) return new ExprError('too_big');
    if (op === 'var') {
      if (!validPath(args[0]) || args.length > 2) return new ExprError('var_path');
      return args.length === 2 ? walk(args[1], depth + 1, inAgg) : null;
    }
    if (op === 'sum' || op === 'count') {
      if (!opts.aggregate) return new ExprError('operator', `${op} só vale em quantitativos`);
      if (inAgg) return new ExprError('nested_aggregate');
      if ((op === 'sum' && args.length !== 1) || (op === 'count' && args.length > 1)) return new ExprError('shape', op);
      for (const x of args) { const r = walk(x, depth + 1, true); if (r) return r; }
      return null;
    }
    for (const x of args) { const r = walk(x, depth + 1, inAgg); if (r) return r; }
    return null;
  };
  return walk(expr, 1, false);
}

const truthy = (v: ExprValue): boolean => (Array.isArray(v) ? v.length > 0 : !!v);
const isNum = (v: ExprValue): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lê um campo do elemento por caminho pontilhado, só em propriedades PRÓPRIAS (nunca protótipo). */
function readVar(vars: ExprVars, path: string): ExprValue | undefined {
  let cur: unknown = vars;
  for (const seg of path.split('.')) {
    if (Array.isArray(cur)) {
      const i = /^\d+$/.test(seg) ? Number(seg) : -1;
      cur = i >= 0 && i < cur.length ? cur[i] : undefined;
    } else if (isObj(cur) && Object.hasOwn(cur, seg)) cur = cur[seg];
    else return undefined;
  }
  return cur as ExprValue | undefined;
}

export interface EvalOptions {
  /** Linhas do grupo, para `sum` e `count` (só quantitativos). */
  rows?: readonly ExprVars[];
}

/**
 * Avalia a expressão sobre os campos de UM elemento. Lança `ExprError` em expressão inválida ou acima do custo;
 * valores ausentes nunca lançam (viram `null`). O custo é limitado por `EXPR_LIMITS.maxNodes` nós visitados.
 */
export function evalExpr(expr: unknown, vars: ExprVars, opts: EvalOptions = {}): ExprValue {
  const bad = validateExpr(expr, { aggregate: opts.rows !== undefined });
  if (bad) throw bad;
  let budget = EXPR_LIMITS.maxNodes;

  const run = (e: unknown, v: ExprVars): ExprValue => {
    if (--budget < 0) throw new ExprError('budget');
    if (e === null || typeof e === 'boolean' || typeof e === 'string' || typeof e === 'number') return e;
    if (Array.isArray(e)) return e.map((x) => run(x, v));
    const rec = e as Record<string, unknown>;
    const op = Object.keys(rec)[0] as ExprOperator;
    const raw = argsOf(rec[op]);
    return apply(op, raw, v);
  };

  const apply = (op: ExprOperator, raw: unknown[], v: ExprVars): ExprValue => {
    switch (op) {
      case 'var': {
        const found = readVar(v, raw[0] as string);
        if (found !== undefined && found !== null) return found;
        return raw.length === 2 ? run(raw[1], v) : null;
      }
      case 'if': {
        for (let i = 0; i + 1 < raw.length; i += 2) if (truthy(run(raw[i], v))) return run(raw[i + 1], v);
        return raw.length % 2 === 1 ? run(raw[raw.length - 1], v) : null;
      }
      case 'and': {
        let last: ExprValue = true;
        for (const x of raw) { last = run(x, v); if (!truthy(last)) return last; }
        return last;
      }
      case 'or': {
        let last: ExprValue = false;
        for (const x of raw) { last = run(x, v); if (truthy(last)) return last; }
        return last;
      }
      case 'sum':
      case 'count':
        return aggregate(op, raw);
      default:
        return pure(op, raw.map((x) => run(x, v)));
    }
  };

  const aggregate = (op: 'sum' | 'count', raw: unknown[]): ExprValue => {
    const rows = opts.rows;
    if (!rows) throw new ExprError('no_rows');
    if (op === 'count') return raw.length === 0 ? rows.length : rows.filter((r) => truthy(run(raw[0], r))).length;
    let total = 0;
    for (const r of rows) { const x = run(raw[0], r); if (isNum(x)) total += x; }
    return total;
  };

  const pure = (op: ExprOperator, a: ExprValue[]): ExprValue => {
    switch (op) {
      case '!': return !truthy(a[0] ?? null);
      case '!!': return truthy(a[0] ?? null);
      case '==': case '===': return strictEq(a[0] ?? null, a[1] ?? null);
      case '!=': case '!==': return !strictEq(a[0] ?? null, a[1] ?? null);
      case '<': case '<=': case '>': case '>=': return compare(op, a);
      case '+': return arith(a, (x, y) => x + y, 0);
      case '*': return arith(a, (x, y) => x * y, 1);
      case '-': return a.length === 1 ? (isNum(a[0] as ExprValue) ? -(a[0] as number) : null) : binary(a, (x, y) => x - y);
      case '/': return binary(a, (x, y) => (y === 0 ? null : x / y));
      case 'in': return inOp(a[0] ?? null, a[1] ?? null);
      case 'round': return roundOp(a);
      case 'min': case 'max': return minMax(op, a);
      default: throw new ExprError('operator', op);
    }
  };

  return run(expr, vars);
}

const strictEq = (x: ExprValue, y: ExprValue): boolean =>
  Array.isArray(x) || Array.isArray(y) ? JSON.stringify(x) === JSON.stringify(y) : x === y;

function compare(op: '<' | '<=' | '>' | '>=', a: ExprValue[]): boolean {
  const ok = (x: ExprValue, y: ExprValue): boolean => {
    if (!((isNum(x) && isNum(y)) || (typeof x === 'string' && typeof y === 'string'))) return false;
    return op === '<' ? x < y : op === '<=' ? x <= y : op === '>' ? x > y : x >= y;
  };
  if (a.length === 3 && (op === '<' || op === '<=')) return ok(a[0] ?? null, a[1] ?? null) && ok(a[1] ?? null, a[2] ?? null); // "entre"
  return ok(a[0] ?? null, a[1] ?? null);
}

function arith(a: ExprValue[], f: (x: number, y: number) => number, unit: number): ExprValue {
  if (a.length === 0 || !a.every(isNum)) return null;
  const r = (a as number[]).reduce(f, unit);
  return Number.isFinite(r) ? r : null;
}

function binary(a: ExprValue[], f: (x: number, y: number) => number | null): ExprValue {
  const [x, y] = [a[0] ?? null, a[1] ?? null];
  if (!isNum(x) || !isNum(y)) return null;
  const r = f(x, y);
  return r !== null && Number.isFinite(r) ? r : null;
}

function inOp(needle: ExprValue, hay: ExprValue): boolean {
  if (typeof hay === 'string') return typeof needle === 'string' && hay.includes(needle);
  if (Array.isArray(hay)) return hay.some((h) => strictEq(h, needle));
  return false;
}

function roundOp(a: ExprValue[]): ExprValue {
  const x = a[0] ?? null;
  if (!isNum(x)) return null;
  const d = a[1] ?? 0;
  if (!isNum(d) || !Number.isInteger(d) || d < 0 || d > 6) throw new ExprError('type', 'round: casas decimais de 0 a 6');
  const f = 10 ** d;
  return Math.round((x + Number.EPSILON * Math.sign(x)) * f) / f;
}

function minMax(op: 'min' | 'max', a: ExprValue[]): ExprValue {
  if (a.length === 0 || !a.every(isNum)) return null;
  return op === 'min' ? Math.min(...(a as number[])) : Math.max(...(a as number[]));
}

/** Preenche `{campo}` num texto com valores do elemento. Campo ausente vira `?`; números saem com até 3 casas. */
export function fillTemplate(text: string, vars: ExprVars): string {
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_.]*)\}/g, (_m, path: string) => {
    const v = FORBIDDEN.has(path) ? undefined : readVar(vars, path);
    if (v === undefined || v === null) return '?';
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    return Array.isArray(v) ? v.join(', ') : String(v);
  });
}
