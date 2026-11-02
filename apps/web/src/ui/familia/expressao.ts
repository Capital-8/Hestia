/*
 * Avaliador de fórmulas das famílias (ADR 0049 §3.2). PROTÓTIPO DE INTERFACE: quando a fase F1 entrar, este arquivo vira
 * `packages/model/src/expressao.ts` com o mesmo contrato. Gramática fechada: números, "texto", nomes (com ponto), + - * /,
 * comparações, && || !, ?:, e as funções min max abs round floor ceil clamp. Sem eval, sem laços, sem funções do usuário.
 */

export type Valor = number | string | boolean;
export type Env = Record<string, Valor>;
export type Fn = (e: Env) => Valor;

type Tok = { t: 'n' | 's' | 'id' | 'op'; v: string | number };

/** Limites duros (defesa e determinismo). */
export const LIMITE_FORMULA = 512;
const LIMITE_PARENTESES = 32;

const OPS2 = ['==', '!=', '<=', '>=', '&&', '||'];
const OPS1 = '+-*/()<>!?:,';

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++;
      out.push({ t: 'n', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === '"') {
      const j = src.indexOf('"', i + 1);
      if (j < 0) throw new Error('texto sem fechar aspas');
      out.push({ t: 's', v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j]!)) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if (OPS1.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`caractere inesperado “${c}”`);
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: (x = 0, s = 0) => (s ? Math.round(x / s) * s : Math.round(x)),
  clamp: (x = 0, a = 0, b = 0) => Math.min(b, Math.max(a, x)),
};

const BIN: Record<string, (a: Valor, b: Valor) => Valor> = {
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => Number(a) < Number(b),
  '>': (a, b) => Number(a) > Number(b),
  '<=': (a, b) => Number(a) <= Number(b),
  '>=': (a, b) => Number(a) >= Number(b),
  '+': (a, b) => Number(a) + Number(b),
  '-': (a, b) => Number(a) - Number(b),
  '*': (a, b) => Number(a) * Number(b),
  '/': (a, b) => Number(a) / Number(b),
};

/** Compila a fórmula; lança `Error` em português com o motivo (o chamador mostra em vermelho e não derruba a família). */
export function compile(src: string): Fn {
  if (src.length > LIMITE_FORMULA) throw new Error(`fórmula passa de ${LIMITE_FORMULA} caracteres`);
  const tk = tokenize(src);
  let p = 0;
  let depth = 0;
  const peek = (): Tok | undefined => tk[p];
  const isOp = (v: string): boolean => peek()?.t === 'op' && peek()?.v === v;
  const eat = (v?: string): Tok => {
    const t = tk[p];
    if (!t || (v !== undefined && t.v !== v)) throw new Error(v ? `esperava “${v}”` : 'fim inesperado');
    p++;
    return t;
  };
  const level = (next: () => Fn, ops: string[]): (() => Fn) => () => {
    let l = next();
    while (peek()?.t === 'op' && ops.includes(String(peek()!.v))) {
      const o = String(eat().v);
      const r = next();
      const L = l;
      if (o === '&&') l = (e) => Boolean(L(e)) && Boolean(r(e));
      else if (o === '||') l = (e) => Boolean(L(e)) || Boolean(r(e));
      else { const f = BIN[o]!; l = (e) => f(L(e), r(e)); }
    }
    return l;
  };
  function unary(): Fn {
    if (isOp('-')) { eat(); const u = unary(); return (e) => -Number(u(e)); }
    if (isOp('!')) { eat(); const u = unary(); return (e) => !u(e); }
    return primary();
  }
  const mul = level(unary, ['*', '/']);
  const add = level(mul, ['+', '-']);
  const cmp = level(add, ['<', '>', '<=', '>=']);
  const eq = level(cmp, ['==', '!=']);
  const and = level(eq, ['&&']);
  const or = level(and, ['||']);
  function ternary(): Fn {
    const c = or();
    if (!isOp('?')) return c;
    eat('?');
    const a = ternary();
    eat(':');
    const b = ternary();
    return (e) => (c(e) ? a(e) : b(e));
  }
  function primary(): Fn {
    const t = eat();
    if (t.t === 'n' || t.t === 's') return () => t.v;
    if (t.t === 'op' && t.v === '(') {
      if (++depth > LIMITE_PARENTESES) throw new Error('parênteses demais');
      const x = ternary();
      eat(')');
      depth--;
      return x;
    }
    if (t.t === 'id') {
      const nome = String(t.v);
      if (isOp('(')) {
        eat('(');
        const f = FUNCS[nome];
        if (!f) throw new Error(`função desconhecida “${nome}”`);
        const args: Fn[] = [];
        if (!isOp(')')) {
          args.push(ternary());
          while (isOp(',')) { eat(','); args.push(ternary()); }
        }
        eat(')');
        return (e) => f(...args.map((a) => Number(a(e))));
      }
      return (e) => {
        const v = e[nome];
        if (v === undefined) throw new Error(`“${nome}” não existe`);
        return v;
      };
    }
    throw new Error(`símbolo inesperado “${String(t.v)}”`);
  }
  const f = ternary();
  if (p < tk.length) throw new Error(`sobrou “${String(tk[p]!.v)}”`);
  return f;
}

/** Cache de compilação por texto: reavaliar a mesma fórmula não recompila. */
const CACHE = new Map<string, { f?: Fn; err?: string }>();
export function compilar(src: string): { f?: Fn; err?: string } {
  let c = CACHE.get(src);
  if (!c) {
    try { c = { f: compile(src) }; } catch (e) { c = { err: (e as Error).message }; }
    if (CACHE.size > 2000) CACHE.clear();
    CACHE.set(src, c);
  }
  return c;
}
