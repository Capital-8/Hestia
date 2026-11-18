import type { Valor } from './tipos.ts';
import { LIMITES } from './tipos.ts';

/*
 * Linguagem de fórmulas das famílias (ADR 0049 §3.2). Gramática FECHADA, sem eval, sem laços, sem funções do usuário:
 *
 *   expr     := cond
 *   cond     := ou ( "?" cond ":" cond )?
 *   ou       := e ( "||" e )*            e   := igual ( "&&" igual )*
 *   igual    := rel ( ("==" | "!=") rel )*
 *   rel      := soma ( ("<" | ">" | "<=" | ">=") soma )*
 *   soma     := prod ( ("+" | "-") prod )*     prod := unario ( ("*" | "/") unario )*
 *   unario   := ("-" | "!") unario | primario
 *   primario := número | "texto" | nome | nome "(" args ")" | "(" expr ")"
 *
 * `nome` aceita ponto (`corpo.esp`). Funções: min max abs floor ceil round(x[, passo]) clamp(x, a, b) sqrt.
 * Medidas em milímetros (unidade da família). Nunca lança por entrada do usuário no caminho `tentar`: devolve o erro.
 */

export type No =
  | { k: 'num'; v: number }
  | { k: 'txt'; v: string }
  | { k: 'ref'; nome: string }
  | { k: 'un'; op: '-' | '!'; a: No }
  | { k: 'bin'; op: OpBin; a: No; b: No }
  | { k: 'cond'; c: No; a: No; b: No }
  | { k: 'chamada'; f: string; args: No[] };

export type OpBin = '+' | '-' | '*' | '/' | '<' | '>' | '<=' | '>=' | '==' | '!=' | '&&' | '||';
export type Env = Readonly<Record<string, Valor>>;

export class ErroExpressao extends Error {
  /** Posição (índice no texto) onde o problema foi visto; -1 quando não se aplica (avaliação). */
  readonly pos: number;
  constructor(mensagem: string, pos = -1) {
    super(mensagem);
    this.name = 'ErroExpressao';
    this.pos = pos;
  }
}

// ───────────────────────── análise léxica ─────────────────────────

interface Tok { t: 'n' | 's' | 'id' | 'op' | 'fim'; v: string; pos: number }

const OPS2 = ['==', '!=', '<=', '>=', '&&', '||'];
const OPS1 = '+-*/()<>!?:,';

function lexer(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'n', v: num[0], pos: i });
      i += num[0].length;
      if (src[i] === '.' || /[A-Za-z_]/.test(src[i] ?? '')) throw new ErroExpressao('número malformado', i);
      continue;
    }
    if (c === '"') {
      const j = src.indexOf('"', i + 1);
      if (j < 0) throw new ErroExpressao('texto sem fechar aspas', i);
      out.push({ t: 's', v: src.slice(i + 1, j), pos: i });
      i = j + 1;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(src.slice(i));
    if (id) { out.push({ t: 'id', v: id[0], pos: i }); i += id[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { out.push({ t: 'op', v: two, pos: i }); i += 2; continue; }
    if (OPS1.includes(c)) { out.push({ t: 'op', v: c, pos: i }); i++; continue; }
    throw new ErroExpressao(`caractere inesperado “${c}”`, i);
  }
  out.push({ t: 'fim', v: '', pos: src.length });
  return out;
}

// ───────────────────────── análise sintática ─────────────────────────

export const FUNCOES: Readonly<Record<string, { min: number; max: number; f: (...a: number[]) => number }>> = {
  min: { min: 1, max: 8, f: Math.min },
  max: { min: 1, max: 8, f: Math.max },
  abs: { min: 1, max: 1, f: Math.abs },
  floor: { min: 1, max: 1, f: Math.floor },
  ceil: { min: 1, max: 1, f: Math.ceil },
  sqrt: { min: 1, max: 1, f: Math.sqrt },
  round: { min: 1, max: 2, f: (x = 0, passo = 0) => (passo ? Math.round(x / passo) * passo : Math.round(x)) },
  clamp: { min: 3, max: 3, f: (x = 0, a = 0, b = 0) => Math.min(b, Math.max(a, x)) },
};

const NIVEL: Array<readonly OpBin[]> = [['||'], ['&&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/']];

export function parse(src: string): No {
  if (src.length > LIMITES.formula) throw new ErroExpressao(`fórmula passa de ${LIMITES.formula} caracteres`, LIMITES.formula);
  if (src.trim() === '') throw new ErroExpressao('fórmula vazia', 0);
  const tk = lexer(src);
  let p = 0;
  let parenteses = 0;
  let fundo = 0;
  const peek = (): Tok => tk[p]!;
  const ehOp = (v: string): boolean => peek().t === 'op' && peek().v === v;
  const come = (v?: string): Tok => {
    const t = peek();
    if (t.t === 'fim') throw new ErroExpressao(v ? `esperava “${v}”` : 'fim inesperado da fórmula', t.pos);
    if (v !== undefined && !(t.t === 'op' && t.v === v)) throw new ErroExpressao(`esperava “${v}”`, t.pos);
    p++;
    return t;
  };
  const guarda = <T>(f: () => T): T => {
    if (++fundo > 200) throw new ErroExpressao('fórmula aninhada demais', peek().pos);
    try { return f(); } finally { fundo--; }
  };

  function cond(): No {
    const c = nivel(0);
    if (!ehOp('?')) return c;
    come('?');
    const a = guarda(cond);
    come(':');
    const b = guarda(cond);
    return { k: 'cond', c, a, b };
  }
  function nivel(i: number): No {
    if (i >= NIVEL.length) return unario();
    let a = nivel(i + 1);
    while (peek().t === 'op' && (NIVEL[i] as readonly string[]).includes(peek().v)) {
      const op = come().v as OpBin;
      a = { k: 'bin', op, a, b: nivel(i + 1) };
    }
    return a;
  }
  function unario(): No {
    if (ehOp('-') || ehOp('!')) {
      const op = come().v as '-' | '!';
      return { k: 'un', op, a: guarda(unario) };
    }
    return primario();
  }
  function primario(): No {
    const t = come();
    if (t.t === 'n') return { k: 'num', v: parseFloat(t.v) };
    if (t.t === 's') return { k: 'txt', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      if (++parenteses > LIMITES.parenteses) throw new ErroExpressao('parênteses demais', t.pos);
      const x = guarda(cond);
      come(')');
      parenteses--;
      return x;
    }
    if (t.t === 'id') {
      if (!ehOp('(')) return { k: 'ref', nome: t.v };
      come('(');
      const def = FUNCOES[t.v];
      if (!def) throw new ErroExpressao(`função desconhecida “${t.v}”`, t.pos);
      const args: No[] = [];
      if (!ehOp(')')) {
        args.push(guarda(cond));
        while (ehOp(',')) { come(','); args.push(guarda(cond)); }
      }
      come(')');
      if (args.length < def.min || args.length > def.max) throw new ErroExpressao(`“${t.v}” espera ${def.min === def.max ? def.min : `${def.min} a ${def.max}`} argumento(s)`, t.pos);
      return { k: 'chamada', f: t.v, args };
    }
    throw new ErroExpressao(`símbolo inesperado “${t.v}”`, t.pos);
  }

  const raiz = cond();
  if (peek().t !== 'fim') throw new ErroExpressao(`sobrou “${peek().v}”`, peek().pos);
  return raiz;
}

// ───────────────────────── avaliação ─────────────────────────

const num = (v: Valor, o: string): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new ErroExpressao(`“${o}” precisa de número, recebeu texto`);
};
const verdade = (v: Valor): boolean => (typeof v === 'string' ? v !== '' : Boolean(v));
const finito = (x: number): number => {
  if (!Number.isFinite(x)) throw new ErroExpressao('resultado não é um número finito');
  return x;
};

export function avaliar(no: No, env: Env): Valor {
  switch (no.k) {
    case 'num': return no.v;
    case 'txt': return no.v;
    case 'ref': {
      const v = env[no.nome];
      if (v === undefined) throw new ErroExpressao(`“${no.nome}” não existe`);
      return v;
    }
    case 'un': {
      const a = avaliar(no.a, env);
      return no.op === '-' ? -num(a, '-') : !verdade(a);
    }
    case 'cond': return verdade(avaliar(no.c, env)) ? avaliar(no.a, env) : avaliar(no.b, env);
    case 'chamada': {
      const def = FUNCOES[no.f]!;
      return finito(def.f(...no.args.map((a) => num(avaliar(a, env), no.f))));
    }
    case 'bin': {
      if (no.op === '&&') return verdade(avaliar(no.a, env)) && verdade(avaliar(no.b, env));
      if (no.op === '||') return verdade(avaliar(no.a, env)) || verdade(avaliar(no.b, env));
      const a = avaliar(no.a, env);
      const b = avaliar(no.b, env);
      switch (no.op) {
        case '==': return a === b;
        case '!=': return a !== b;
        case '<': return num(a, '<') < num(b, '<');
        case '>': return num(a, '>') > num(b, '>');
        case '<=': return num(a, '<=') <= num(b, '<=');
        case '>=': return num(a, '>=') >= num(b, '>=');
        case '+': return finito(num(a, '+') + num(b, '+'));
        case '-': return finito(num(a, '-') - num(b, '-'));
        case '*': return finito(num(a, '*') * num(b, '*'));
        default: {
          const d = num(b, '/');
          if (d === 0) throw new ErroExpressao('divisão por zero');
          return finito(num(a, '/') / d);
        }
      }
    }
  }
}

// ───────────────────────── utilitários ─────────────────────────

/** Nomes referenciados pela fórmula, sem repetição, em ordem alfabética (`corpo.esp` conta como `corpo.esp`). */
export function referencias(no: No): string[] {
  const out = new Set<string>();
  const anda = (n: No): void => {
    switch (n.k) {
      case 'ref': out.add(n.nome); break;
      case 'un': anda(n.a); break;
      case 'bin': anda(n.a); anda(n.b); break;
      case 'cond': anda(n.c); anda(n.a); anda(n.b); break;
      case 'chamada': n.args.forEach(anda); break;
      default: break;
    }
  };
  anda(no);
  return [...out].sort();
}

/** Forma canônica: todo filho que não é folha vai entre parênteses, então `parse(imprimir(n))` devolve o mesmo nó. */
export function imprimir(no: No): string {
  const f = (n: No): string => (n.k === 'bin' || n.k === 'cond' || n.k === 'un' ? `(${imprimir(n)})` : imprimir(n));
  switch (no.k) {
    case 'num': return String(no.v);
    case 'txt': return `"${no.v}"`;
    case 'ref': return no.nome;
    case 'un': return `${no.op}${f(no.a)}`;
    case 'bin': return `${f(no.a)} ${no.op} ${f(no.b)}`;
    case 'cond': return `${f(no.c)} ? ${f(no.a)} : ${f(no.b)}`;
    case 'chamada': return `${no.f}(${no.args.map(imprimir).join(', ')})`;
  }
}

/**
 * Cópia do nó com o nome `de` trocado por `para` em todas as referências: `de` e também o membro `de.algo` (vira `para.algo`).
 * Não mexe em outros nomes que apenas comecem igual (`esp2` não é `esp`).
 */
export function renomearReferencias(no: No, de: string, para: string): No {
  const f = (n: No): No => renomearReferencias(n, de, para);
  switch (no.k) {
    case 'ref':
      if (no.nome === de) return { k: 'ref', nome: para };
      if (no.nome.startsWith(`${de}.`)) return { k: 'ref', nome: `${para}${no.nome.slice(de.length)}` };
      return no;
    case 'un': return { k: 'un', op: no.op, a: f(no.a) };
    case 'bin': return { k: 'bin', op: no.op, a: f(no.a), b: f(no.b) };
    case 'cond': return { k: 'cond', c: f(no.c), a: f(no.a), b: f(no.b) };
    case 'chamada': return { k: 'chamada', f: no.f, args: no.args.map(f) };
    default: return no;
  }
}

/** Texto da fórmula com `de` trocado por `para` (forma canônica de `imprimir`); se a fórmula não compila devolve o texto como veio. */
export function renomearNoTexto(src: string, de: string, para: string): string {
  const c = compilar(src);
  if ('erro' in c) return src;
  if (!referencias(c.no).some((n) => n === de || n.startsWith(`${de}.`))) return src;
  return imprimir(renomearReferencias(c.no, de, para));
}

export type ResultadoFormula = { ok: true; valor: Valor } | { ok: false; erro: ErroExpressao };

const CACHE = new Map<string, { no: No } | { erro: ErroExpressao }>();

/** Compila com cache por texto (a mesma fórmula reavaliada não recompila). */
export function compilar(src: string): { no: No } | { erro: ErroExpressao } {
  let c = CACHE.get(src);
  if (!c) {
    try { c = { no: parse(src) }; } catch (e) { c = { erro: e instanceof ErroExpressao ? e : new ErroExpressao(String(e)) }; }
    if (CACHE.size > 4000) CACHE.clear();
    CACHE.set(src, c);
  }
  return c;
}

/** Caminho que nunca lança: compila (com cache) e avalia. */
export function tentar(src: string, env: Env): ResultadoFormula {
  const c = compilar(src);
  if ('erro' in c) return { ok: false, erro: c.erro };
  try { return { ok: true, valor: avaliar(c.no, env) }; } catch (e) { return { ok: false, erro: e instanceof ErroExpressao ? e : new ErroExpressao(String(e)) }; }
}
