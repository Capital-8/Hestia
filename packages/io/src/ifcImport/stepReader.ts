import { t, type Lang } from '../i18n.ts';
import type { StepValue } from './step.ts';

/** Tokenizador do texto STEP: lê valores tipados a partir de uma posição (usado pelo `parseStep` e pela leitura sob demanda). */
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

export class Reader {
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

  /** Percorre um parâmetro com a mesma gramática de `value()` (mesmos erros), sem criar o valor. */
  skipValue(): void {
    this.skip();
    const c = this.code();
    if (c === 35) {
      this.i++;
      this.int();
      return;
    }
    if (c === 40) {
      this.i++;
      this.skip();
      if (this.code() !== 41) {
        for (;;) {
          this.skipValue();
          this.skip();
          if (this.code() === 44) {
            this.i++;
            continue;
          }
          break;
        }
      }
      this.expect(')');
      return;
    }
    if (c === 39) {
      this.skipStr();
      return;
    }
    if (c === 46) {
      this.i++;
      while (this.i < this.s.length && this.code() !== 46) this.i++;
      this.i++;
      return;
    }
    if (c === 36 || c === 42) {
      this.i++;
      return;
    }
    if ((c >= 48 && c <= 57) || c === 45 || c === 43) {
      this.real();
      return;
    }
    const name = this.ident();
    if (!name) throw new Error(t(this.lang, 'io_err_step_param', { i: this.i }));
    this.skip();
    if (this.code() === 40) {
      this.i++;
      this.skipValue();
      this.expect(')');
    }
  }

  /** Salta um texto entre apóstrofos (respeitando `''` e escapes) sem montá-lo. */
  private skipStr(): void {
    this.expect("'");
    for (;;) {
      if (this.i >= this.s.length) throw new Error(t(this.lang, 'io_err_step_unterminated'));
      const c = this.code();
      this.i++;
      if (c === 39) {
        if (this.code() === 39) {
          this.i++;
          continue;
        }
        return;
      }
      if (c === 92) this.escape();
    }
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
