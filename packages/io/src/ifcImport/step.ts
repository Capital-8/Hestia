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

import type { Lang } from '../i18n.ts';
import { Reader } from './stepReader.ts';

export interface StepEntity {
  id: number;
  type: string;
  args: StepValue[];
}

export interface StepFile {
  schema: string;
  entities: StepEntities;
  /** Entidades agrupadas por tipo (`IFCWALL`, `IFCFACE`...): evita varrer o arquivo inteiro a cada consulta. */
  types: StepTypes;
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

/** Converte ponto e vírgula do cabeçalho em schema legível (`IFC4`, `IFC2X3`...). */
export function schemaOf(text: string): string {
  const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(text);
  return m?.[1]?.toUpperCase() ?? '';
}

const ARGS_CACHE_MAX = 50_000;

/**
 * Entidade lida sob demanda: o índice só guarda id, tipo e as posições do texto; os parâmetros são interpretados na
 * primeira leitura de `args` (e ficam na própria entidade enquanto ela estiver viva).
 */
class LazyEntity implements StepEntity {
  private cache: StepValue[] | undefined;
  constructor(
    private readonly owner: StepIndex,
    private readonly idx: number,
    readonly id: number,
    readonly type: string,
  ) {}

  get args(): StepValue[] {
    return (this.cache ??= this.owner.argsAt(this.idx));
  }
}

/** Índice compacto das entidades do arquivo (Structure of Arrays): ~16 bytes por entidade em vez de um objeto com árvore. */
class StepIndex {
  count = 0;
  ids: Uint32Array<ArrayBuffer> = new Uint32Array(1024);
  typeIdx: Uint32Array<ArrayBuffer> = new Uint32Array(1024);
  start: Uint32Array<ArrayBuffer> = new Uint32Array(1024);
  names: string[] = [];
  nameIndex = new Map<string, number>();
  /** `byId[id]` = posição+1 da última entidade com esse id (0 = ausente); vira Map se os ids forem muito esparsos. */
  private dense: Int32Array | null = null;
  private sparse: Map<number, number> | null = null;
  private argsCache = new Map<number, StepValue[]>();
  private typeLists = new Map<string, StepEntity[]>();

  constructor(
    readonly text: string,
    private readonly lang: Lang,
  ) {}

  push(id: number, type: string, start: number): void {
    if (this.count === this.ids.length) {
      const n = this.count * 2;
      const grow = (a: Uint32Array<ArrayBuffer>): Uint32Array<ArrayBuffer> => {
        const b = new Uint32Array(n);
        b.set(a);
        return b;
      };
      this.ids = grow(this.ids);
      this.typeIdx = grow(this.typeIdx);
      this.start = grow(this.start);
    }
    let t = this.nameIndex.get(type);
    if (t === undefined) {
      t = this.names.length;
      this.names.push(type);
      this.nameIndex.set(type, t);
    }
    this.ids[this.count] = id;
    this.typeIdx[this.count] = t;
    this.start[this.count] = start;
    this.count++;
  }

  /** Monta a busca por id depois da leitura. */
  seal(): void {
    let max = 0;
    for (let i = 0; i < this.count; i++) if (this.ids[i]! > max) max = this.ids[i]!;
    if (max <= this.count * 8 + 4096) {
      const d = new Int32Array(max + 1);
      for (let i = 0; i < this.count; i++) d[this.ids[i]!] = i + 1;
      this.dense = d;
    } else {
      const m = new Map<number, number>();
      for (let i = 0; i < this.count; i++) m.set(this.ids[i]!, i + 1);
      this.sparse = m;
    }
  }

  indexOf(id: number): number {
    const v = this.dense ? (id >= 0 && id < this.dense.length ? this.dense[id]! : 0) : (this.sparse?.get(id) ?? 0);
    return v - 1;
  }

  /** Vale quando é a última entidade com aquele id (a que o `Map` original guardaria). */
  isLive(i: number): boolean {
    return this.indexOf(this.ids[i]!) === i;
  }

  entityAt(i: number): StepEntity {
    return new LazyEntity(this, i, this.ids[i]!, this.names[this.typeIdx[i]!]!);
  }

  argsAt(i: number): StepValue[] {
    const hit = this.argsCache.get(i);
    if (hit) return hit;
    let out: StepValue[];
    try {
      out = readArgs(new Reader(this.text, this.start[i]!, this.lang));
    } catch {
      out = [];
    }
    if (this.argsCache.size >= ARGS_CACHE_MAX) this.argsCache.clear();
    this.argsCache.set(i, out);
    return out;
  }

  ofType(name: string): StepEntity[] {
    const hit = this.typeLists.get(name);
    if (hit) return hit;
    const t = this.nameIndex.get(name);
    const out: StepEntity[] = [];
    if (t !== undefined) for (let i = 0; i < this.count; i++) if (this.typeIdx[i] === t && this.isLive(i)) out.push(this.entityAt(i));
    this.typeLists.set(name, out);
    return out;
  }
}

/** Parâmetros da entidade, com o leitor logo depois do `(` do tipo. */
function readArgs(r: Reader): StepValue[] {
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
  return args;
}

/** Entidades por id, na interface de um `Map` somente leitura (iteração na ordem do arquivo). */
export class StepEntities {
  constructor(private readonly ix: StepIndex) {}

  get size(): number {
    let n = 0;
    for (let i = 0; i < this.ix.count; i++) if (this.ix.isLive(i)) n++;
    return n;
  }

  get(id: number): StepEntity | undefined {
    const i = this.ix.indexOf(id);
    return i < 0 ? undefined : this.ix.entityAt(i);
  }

  has(id: number): boolean {
    return this.ix.indexOf(id) >= 0;
  }

  *values(): IterableIterator<StepEntity> {
    for (let i = 0; i < this.ix.count; i++) if (this.ix.isLive(i)) yield this.ix.entityAt(i);
  }

  *keys(): IterableIterator<number> {
    for (let i = 0; i < this.ix.count; i++) if (this.ix.isLive(i)) yield this.ix.ids[i]!;
  }

  *entries(): IterableIterator<[number, StepEntity]> {
    for (let i = 0; i < this.ix.count; i++) if (this.ix.isLive(i)) yield [this.ix.ids[i]!, this.ix.entityAt(i)];
  }

  [Symbol.iterator](): IterableIterator<[number, StepEntity]> {
    return this.entries();
  }

  forEach(fn: (e: StepEntity, id: number) => void): void {
    for (const [id, e] of this.entries()) fn(e, id);
  }
}

/** Entidades por tipo: a lista de um tipo só é montada quando alguém pede (e fica guardada para as próximas consultas). */
export class StepTypes {
  constructor(private readonly ix: StepIndex) {}

  get(name: string): StepEntity[] | undefined {
    return this.ix.nameIndex.has(name) ? this.ix.ofType(name) : undefined;
  }

  has(name: string): boolean {
    return this.ix.nameIndex.has(name);
  }

  /** Nomes dos tipos presentes, na ordem da primeira aparição; não materializa nenhuma lista. */
  keys(): IterableIterator<string> {
    return this.ix.names.values();
  }

  get size(): number {
    return this.ix.names.length;
  }

  *[Symbol.iterator](): IterableIterator<[string, StepEntity[]]> {
    for (const name of this.ix.names) yield [name, this.ix.ofType(name)];
  }
}

/**
 * Lê o arquivo. Percorre o texto uma vez validando a sintaxe de cada entidade (sem criar os valores) e guarda só id,
 * tipo e posição; os parâmetros são interpretados quando `args` é lido. Erro em uma entidade não derruba as outras:
 * ela é contada em `broken`. O texto precisa continuar vivo enquanto o `StepFile` for usado.
 */
export function parseStep(text: string, onProgress?: (done: number, total: number) => void, lang: Lang = 'pt'): StepFile {
  const schema = schemaOf(text);
  const ix = new StepIndex(text, lang);
  const result = (broken: number): StepFile => {
    ix.seal();
    return { schema, entities: new StepEntities(ix), types: new StepTypes(ix), broken };
  };
  const data = /\bDATA\s*;/.exec(text);
  if (!data) return result(0);
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
    try {
      const id = r.int();
      r.expect('=');
      const type = r.ident();
      r.expect('(');
      const inicio = r.pos;
      r.skip();
      if (!r.take(')')) {
        for (;;) {
          r.skipValue();
          r.skip();
          if (r.take(',')) continue;
          r.expect(')');
          break;
        }
      }
      r.take(';');
      if (type) ix.push(id, type, inicio);
    } catch {
      broken++;
      const next = text.indexOf(';', r.pos);
      if (next < 0) break;
      r.seek(next + 1);
    }
  }
  onProgress?.(total, total);
  return result(broken);
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
