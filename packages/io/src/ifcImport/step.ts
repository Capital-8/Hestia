/**
 * Leitor de texto STEP (ISO 10303-21), o formato dos arquivos IFC. Sem dependências: um tokenizador que percorre a string
 * uma vez e guarda cada entidade como uma lista de parâmetros tipados. Tolerante de propósito — o que não interessa fica
 * opaco, e o importador decide depois o que sabe ler.
 *
 * Cuidados que o formato exige e que já custaram caro em outros leitores:
 * - espaço em volta do `=` (`#1 = IFCPROJECT(...)`) é comum;
 * - comentários `/* ... *\/` no meio do arquivo;
 * - textos com apóstrofo dobrado (`''`), `\\` e os escapes `\X2\hhhh...\X0\`, `\X4\`, `\X\hh` e `\S\c`;
 * - parâmetro derivado (`*`), omitido (`$`) e valores tipados (`IFCLENGTHMEASURE(1.0)`).
 */

export type StepValue =
  | { k: 'ref'; id: number }
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'enum'; v: string }
  | { k: 'null' }
  | { k: 'derived' }
  | { k: 'list'; items: StepValue[] }
  | { k: 'type'; name: string; arg: StepValue };

import { t, type Lang } from '../i18n.ts';

export interface StepEntity {
  id: number;
  type: string;
  args: StepValue[];
}

export interface StepFile {
  schema: string;
  entities: Map<number, StepEntity>;
  /** Entidades agrupadas por tipo (`IFCWALL`, `IFCFACE`...): evita varrer o arquivo inteiro a cada consulta. */
  types: Map<string, StepEntity[]>;
  /** Entidades que o tokenizador não conseguiu ler (não impedem o resto do arquivo). */
  broken: number;
}

const PREFIX: Record<string, number> = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 1e1,
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
  PICO: 1e-12,
  FEMTO: 1e-15,
  ATTO: 1e-18,
};

export const siPrefix = (name: string): number => PREFIX[name] ?? 1;

/**
 * Posição do `\X0\`/`\x0\` que fecha um escape largo, a partir de `from`. Procura só nas barras invertidas (poucas
 * por texto) em vez de copiar a string toda: no arquivo inteiro, a versão com `toUpperCase()` era quadrática.
 */
function findEscapeEnd(s: string, from: number): number {
  for (let p = s.indexOf('\\', from); p >= 0; p = s.indexOf('\\', p + 1)) {
    const c1 = s.charCodeAt(p + 1) | 32;
    if (c1 === 120 && s.charCodeAt(p + 2) === 48 && s.charCodeAt(p + 3) === 92) return p;
  }
  return -1;
}

/** Converte ponto e vírgula do cabeçalho em schema legível (`IFC4`, `IFC2X3`...). */
export function schemaOf(text: string): string {
  const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(text);
  return m?.[1]?.toUpperCase() ?? '';
}

class Reader {
  private i: number;
  constructor(private readonly s: string, start = 0, private readonly lang: Lang = 'pt') {
    this.i = start;
  }

  get pos(): number {
    return this.i;
  }

  seek(at: number): void {
    this.i = at;
  }

  private code(at = this.i): number {
    return this.s.charCodeAt(at);
  }

  /** Pula espaços e comentários `/* ... *\/`. */
  skip(): void {
    for (;;) {
      while (this.i < this.s.length && this.code() <= 32) this.i++;
      if (this.s.startsWith('/*', this.i)) {
        const end = this.s.indexOf('*/', this.i + 2);
        this.i = end < 0 ? this.s.length : end + 2;
        continue;
      }
      return;
    }
  }

  /** Lê um identificador simples (`IFCWALL`, `DATA`...). */
  ident(): string {
    this.skip();
    const start = this.i;
    while (this.i < this.s.length) {
      const c = this.code();
      const isLetter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
      const isDigit = c >= 48 && c <= 57;
      if (!isLetter && !isDigit) break;
      this.i++;
    }
    return this.s.slice(start, this.i).toUpperCase();
  }

  /** Avança um caractere se for exatamente `ch`. */
  take(ch: string): boolean {
    this.skip();
    if (this.code() === ch.charCodeAt(0)) {
      this.i++;
      return true;
    }
    return false;
  }

  expect(ch: string): void {
    if (!this.take(ch)) throw new Error(t(this.lang, 'io_err_step_expected', { ch, i: this.i }));
  }

  /** Inteiro sem sinal (id de entidade, índice). */
  int(): number {
    this.skip();
    let v = 0;
    let any = false;
    for (;;) {
      const c = this.code();
      if (c < 48 || c > 57) break;
      v = v * 10 + (c - 48);
      any = true;
      this.i++;
    }
    if (!any) throw new Error(t(this.lang, 'io_err_step_number', { i: this.i }));
    return v;
  }

  /** Real (aceita sinal, decimal, expoente). */
  real(): number {
    this.skip();
    const start = this.i;
    if (this.code() === 45 || this.code() === 43) this.i++;
    while (this.i < this.s.length) {
      const c = this.code();
      if ((c >= 48 && c <= 57) || c === 46) {
        this.i++;
        continue;
      }
      if (c === 69 || c === 101) {
        this.i++;
        if (this.code() === 45 || this.code() === 43) this.i++;
        continue;
      }
      break;
    }
    const v = Number(this.s.slice(start, this.i));
    if (!Number.isFinite(v)) throw new Error(t(this.lang, 'io_err_step_bad_number', { start }));
    return v;
  }

  /** Texto STEP com escapes decodificados. */
  str(): string {
    this.expect("'");
    let out = '';
    for (;;) {
      if (this.i >= this.s.length) throw new Error(t(this.lang, 'io_err_step_unterminated'));
      const c = this.s[this.i] ?? '';
      this.i++;
      if (c === "'") {
        if (this.code() === 39) {
          out += "'";
          this.i++;
          continue;
        }
        return out;
      }
      if (c !== '\\') {
        out += c;
        continue;
      }
      out += this.escape();
    }
  }

  /** Decodifica um escape de barra (o `\` já foi consumido). */
  private escape(): string {
    const rest = this.s.slice(this.i, this.i + 3);
    const upper = rest.toUpperCase();
    if (upper.startsWith('X2\\') || upper.startsWith('X4\\')) {
      const wide = upper.startsWith('X4\\');
      this.i += 3;
      // `indexOf` sem diferenciar maiúsculas: antes era `this.s.toUpperCase()`, que copiava e convertia o arquivo
      // inteiro a cada texto acentuado (O(n) por escape; num IFC de 53 MB isso levava minutos).
      const end = findEscapeEnd(this.s, this.i);
      const hex = this.s.slice(this.i, end < 0 ? this.s.length : end);
      this.i = end < 0 ? this.s.length : end + 4;
      const step = wide ? 8 : 4;
      let text = '';
      for (let p = 0; p + step <= hex.length; p += step) {
        const code = Number.parseInt(hex.slice(p, p + step), 16);
        if (Number.isFinite(code)) text += String.fromCodePoint(code);
      }
      return text;
    }
    if (upper.startsWith('S\\')) {
      const c = this.code(this.i + 2);
      this.i += 3;
      return String.fromCharCode(c + 128);
    }
    if (upper.startsWith('X\\')) {
      const hex = this.s.slice(this.i + 2, this.i + 4);
      this.i += 4;
      return String.fromCharCode(Number.parseInt(hex, 16) || 0);
    }
    // `\P?\` troca a página de código; `\\` é a própria barra.
    if (this.code() === 80 && this.code(this.i + 2) === 92) {
      this.i += 3;
      return '';
    }
    if (this.code() === 92) {
      this.i++;
      return '\\';
    }
    return '\\';
  }

  /** Um parâmetro: ref, número, texto, enum, `$`, `*`, lista ou valor tipado. */
  value(): StepValue {
    this.skip();
    const c = this.code();
    if (c === 35) {
      this.i++;
      return { k: 'ref', id: this.int() };
    }
    if (c === 40) {
      this.i++;
      const items: StepValue[] = [];
      this.skip();
      if (this.code() !== 41) {
        for (;;) {
          items.push(this.value());
          this.skip();
          if (this.code() === 44) {
            this.i++;
            continue;
          }
          break;
        }
      }
      this.expect(')');
      return { k: 'list', items };
    }
    if (c === 39) return { k: 'str', v: this.str() };
    if (c === 46) {
      this.i++;
      const start = this.i;
      while (this.i < this.s.length && this.code() !== 46) this.i++;
      const name = this.s.slice(start, this.i).toUpperCase();
      this.i++;
      return { k: 'enum', v: name };
    }
    if (c === 36) {
      this.i++;
      return { k: 'null' };
    }
    if (c === 42) {
      this.i++;
      return { k: 'derived' };
    }
    const isNum = (c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46;
    if (isNum) return { k: 'num', v: this.real() };
    const name = this.ident();
    if (!name) throw new Error(t(this.lang, 'io_err_step_param', { i: this.i }));
    this.skip();
    if (this.code() === 40) {
      this.i++;
      const arg = this.value();
      this.expect(')');
      return { k: 'type', name, arg };
    }
    return { k: 'enum', v: name };
  }
}

/** Lê o arquivo inteiro. Erro em uma entidade não derruba as outras: ela é contada em `broken`. */
export function parseStep(text: string, onProgress?: (done: number, total: number) => void, lang: Lang = 'pt'): StepFile {
  const schema = schemaOf(text);
  const entities = new Map<number, StepEntity>();
  const types = new Map<string, StepEntity[]>();
  // Um IFC grande repete o mesmo tipo centenas de milhares de vezes (`IFCCARTESIANPOINT`...): guarda uma só string.
  const nomes = new Map<string, string>();
  const data = /\bDATA\s*;/.exec(text);
  if (!data) return { schema, entities, types, broken: 0 };
  const fim = data.index + data[0].length;
  const r = new Reader(text, fim, lang);
  const total = text.length - fim;
  let broken = 0;
  // Avisa a cada ~1 MB lido: a barra anda sem custar uma chamada por entidade.
  const passo = 1 << 20;
  let proximoAviso = passo;
  for (;;) {
    r.skip();
    if (text.slice(r.pos, r.pos + 6).toUpperCase() === 'ENDSEC') break;
    if (r.pos >= text.length) break;
    if (r.pos >= proximoAviso) {
      proximoAviso = r.pos + passo;
      onProgress?.(r.pos - fim, total);
    }
    if (!r.take('#')) {
      // Conteúdo inesperado: salta até o próximo `;` para não travar o arquivo.
      const next = text.indexOf(';', r.pos);
      if (next < 0) break;
      r.seek(next + 1);
      broken++;
      continue;
    }
    let id: number;
    try {
      id = r.int();
      r.expect('=');
      let type = r.ident();
      r.expect('(');
      const args: StepValue[] = [];
      r.skip();
      if (!r.take(')')) {
        for (;;) {
          args.push(r.value());
          r.skip();
          if (r.take(',')) continue;
          r.expect(')');
          break;
        }
      }
      r.take(';');
      if (type) {
        const conhecido = nomes.get(type);
        if (conhecido === undefined) nomes.set(type, type);
        else type = conhecido;
        const entidade: StepEntity = { id, type, args };
        entities.set(id, entidade);
        const lista = types.get(type);
        if (lista) lista.push(entidade);
        else types.set(type, [entidade]);
      }
    } catch {
      broken++;
      const next = text.indexOf(';', r.pos);
      if (next < 0) break;
      r.seek(next + 1);
    }
  }
  onProgress?.(total, total);
  return { schema, entities, types, broken };
}

export const isRef = (v: StepValue | undefined): v is { k: 'ref'; id: number } => v?.k === 'ref';
export const refId = (v: StepValue | undefined): number | null => (isRef(v) ? v.id : null);
export const textOf = (v: StepValue | undefined): string => (v?.k === 'str' ? v.v : '');
export const enumOf = (v: StepValue | undefined): string => (v?.k === 'enum' ? v.v : '');
export const numOf = (v: StepValue | undefined): number | null => {
  if (v?.k === 'num') return v.v;
  if (v?.k === 'type' && v.arg.k === 'num') return v.arg.v;
  return null;
};
export const listOf = (v: StepValue | undefined): StepValue[] => (v?.k === 'list' ? v.items : []);
