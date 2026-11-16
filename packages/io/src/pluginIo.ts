/**
 * Contrato puro de importar e exportar de suplementos (docs/plugins/08 §4 e §11, fase F; decisão 0057).
 * Sem React, sem DOM e sem código de suplemento: só valida o que o handler devolveu, mede tamanhos e renderiza o
 * modelo declarativo de exportação. O host (apps/web/src/plugins/ioBridge.ts) usa estas funções para NUNCA confiar
 * no que vem do suplemento.
 */

/** Teto de bytes de um arquivo importado ou exportado: 64 mebibytes (MiB) = 67.108.864 bytes. */
export const PLUGIN_IO_MAX_BYTES = 64 * 1024 * 1024;
/** Teto de comandos num lote de importação (igual ao do host de escrita do modelo). */
export const PLUGIN_IO_MAX_COMMANDS = 5000;
/** Teto, em caracteres, do nome de arquivo sugerido pelo suplemento. */
export const PLUGIN_IO_MAX_NAME = 100;

export type PluginIoCode = 'too_large' | 'bad_bytes' | 'bad_name' | 'bad_extension' | 'bad_result' | 'too_many_commands' | 'no_commands';

export class PluginIoError extends Error {
  constructor(readonly code: PluginIoCode, message: string) {
    super(message);
    this.name = 'PluginIoError';
  }
}

/**
 * Normaliza o que um exportador devolveu para bytes: texto (UTF-8), `Uint8Array` ou `ArrayBuffer`.
 * Qualquer outra coisa, ou acima de 64 MiB, é recusada.
 */
export function toExportBytes(value: unknown): Uint8Array {
  let bytes: Uint8Array;
  if (typeof value === 'string') {
    // Um caractere UTF-16 vira no máximo 3 bytes em UTF-8: recusa antes de codificar o que certamente passa do teto.
    if (value.length > PLUGIN_IO_MAX_BYTES) throw new PluginIoError('too_large', 'arquivo acima de 64 MiB');
    bytes = new TextEncoder().encode(value);
  } else if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else throw new PluginIoError('bad_bytes', 'o exportador deve devolver texto, Uint8Array ou ArrayBuffer');
  if (bytes.byteLength > PLUGIN_IO_MAX_BYTES) throw new PluginIoError('too_large', 'arquivo acima de 64 MiB');
  return bytes;
}

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]*$/;

/** Nome-base sem acento nem separador de pasta; vazio vira "projeto". Usado para o nome padrão do arquivo. */
export function baseNameOf(name: string): string {
  const b = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return (b || 'projeto').slice(0, 60);
}

/**
 * Valida o nome de arquivo sugerido pelo suplemento: sem caminho (`/`, `\`, `..`), sem caractere de controle, até 100
 * caracteres e com a extensão declarada no manifesto. O nome é dado não confiável.
 */
export function validateExportName(name: unknown, extension: string): string {
  if (typeof name !== 'string' || name.length === 0 || name.length > PLUGIN_IO_MAX_NAME) throw new PluginIoError('bad_name', 'nome de arquivo inválido');
  if (!NAME_RE.test(name) || name.includes('..')) throw new PluginIoError('bad_name', 'nome de arquivo inválido');
  if (!name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) throw new PluginIoError('bad_extension', `a extensão deve ser .${extension}`);
  return name;
}

/** O que um handler de exportador pode devolver: os bytes (ou texto), ou `{ data, name? }`. */
export function parseExportResult(value: unknown, extension: string, defaultBase: string): { name: string; bytes: Uint8Array } {
  const isBox = typeof value === 'object' && value !== null && !(value instanceof Uint8Array) && !(value instanceof ArrayBuffer) && 'data' in value;
  const data = isBox ? (value as { data: unknown }).data : value;
  const given = isBox ? (value as { name?: unknown }).name : undefined;
  const name = given !== undefined ? validateExportName(given, extension) : `${baseNameOf(defaultBase)}.${extension}`;
  return { name, bytes: toExportBytes(data) };
}

/** Valida o tamanho e a extensão de um arquivo escolhido pelo usuário para importar. */
export function checkImportFile(name: string, size: number, extensions: readonly string[]): void {
  if (size > PLUGIN_IO_MAX_BYTES) throw new PluginIoError('too_large', 'arquivo acima de 64 MiB');
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  if (!ext || !extensions.some((e) => e.toLowerCase() === ext)) throw new PluginIoError('bad_extension', `extensão não aceita: ${ext ?? '(nenhuma)'}`);
}

export interface ImportBatch {
  commands: unknown[];
  /** Texto curto opcional do suplemento (aviso ou relatório), limitado a 2000 caracteres. */
  report?: string;
}

/** Resultado do importador: um vetor de comandos, ou `{ commands, report? }`. A validação fina é do host de escrita (lista branca). */
export function parseImportResult(value: unknown): ImportBatch {
  const arr = Array.isArray(value) ? value : typeof value === 'object' && value !== null ? (value as { commands?: unknown }).commands : undefined;
  if (!Array.isArray(arr)) throw new PluginIoError('bad_result', 'o importador deve devolver um lote de comandos');
  if (arr.length === 0) throw new PluginIoError('no_commands', 'nada a importar');
  if (arr.length > PLUGIN_IO_MAX_COMMANDS) throw new PluginIoError('too_many_commands', `mais de ${PLUGIN_IO_MAX_COMMANDS} comandos`);
  const rep = Array.isArray(value) ? undefined : (value as { report?: unknown }).report;
  return { commands: arr, ...(typeof rep === 'string' && rep ? { report: rep.slice(0, 2000) } : {}) };
}

export interface ImportPreview {
  /** Total de comandos do lote. */
  commands: number;
  /** Elementos que serão criados (comandos `add*`; `addCeilings` conta cada forro). */
  created: number;
  /** Contagem por tipo de comando. */
  byType: Record<string, number>;
}

/** Prévia do lote (só leitura): quantos comandos e quantos elementos novos. */
export function previewCommands(commands: readonly unknown[]): ImportPreview {
  const byType: Record<string, number> = {};
  let created = 0;
  for (const c of commands) {
    const type = typeof c === 'object' && c !== null && typeof (c as { type?: unknown }).type === 'string' ? (c as { type: string }).type : '?';
    byType[type] = (byType[type] ?? 0) + 1;
    if (type === 'addCeilings') {
      const l = (c as { ceilings?: unknown }).ceilings;
      created += Array.isArray(l) ? l.length : 0;
    } else if (/^add[A-Z]/.test(type)) created += 1;
  }
  return { commands: commands.length, created, byType };
}

/** Congela um valor JSON em profundidade (cópia imutável entregue ao handler). */
export function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

// ---- exportador declarativo por template ----

export type TemplateEscape = 'none' | 'csv' | 'xml' | 'json';

/**
 * Modelo declarativo (spec 08 §4): um texto, ou `{ header?, each?: { kind, line }, footer?, escape? }`.
 * `{{campo.caminho}}` é substituído por um valor do modelo (texto, número ou booleano); o resto vira vazio. Não há
 * laço além de `each`, nem condição, nem expressão, nem código. Escopo de `header`/`footer`: `project.name`,
 * `count.<tipo>` e `count.total`; escopo de `line`: os campos do elemento (`id`, `a.x`, `typeId`...) e `index` (a partir de 1).
 */
export interface ExportTemplate {
  header?: string;
  each?: { kind: string; line: string };
  footer?: string;
  escape: TemplateEscape;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.]{1,80})\s*\}\}/g;
const SAFE_KEY = (k: string): boolean => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';

function lookup(scope: unknown, path: string): string {
  let cur: unknown = scope;
  for (const k of path.split('.')) {
    if (!SAFE_KEY(k) || typeof cur !== 'object' || cur === null || !Object.prototype.hasOwnProperty.call(cur, k)) return '';
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'string' || typeof cur === 'number' || typeof cur === 'boolean' ? String(cur) : '';
}

function escapeWith(mode: TemplateEscape, v: string): string {
  if (mode === 'csv') return /[",;\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  if (mode === 'xml') return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  if (mode === 'json') return JSON.stringify(v).slice(1, -1);
  return v;
}

function fill(text: string, scope: unknown, mode: TemplateEscape): string {
  return text.replace(PLACEHOLDER, (_m, path: string) => escapeWith(mode, lookup(scope, path)));
}

/** Lê o `template` do manifesto (JSON não confiável) e devolve o modelo normalizado; lança se o formato for inválido. */
export function parseTemplate(raw: unknown): ExportTemplate {
  if (typeof raw === 'string') return { header: raw.slice(0, 20000), escape: 'none' };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new PluginIoError('bad_result', 'template inválido');
  const o = raw as Record<string, unknown>;
  const text = (v: unknown): string | undefined => (typeof v === 'string' ? v.slice(0, 20000) : undefined);
  const each = o.each as { kind?: unknown; line?: unknown } | undefined;
  const escape: TemplateEscape = o.escape === 'csv' || o.escape === 'xml' || o.escape === 'json' ? o.escape : 'none';
  const header = text(o.header);
  const footer = text(o.footer);
  const line = each ? text(each.line) : undefined;
  return {
    ...(header !== undefined ? { header } : {}),
    ...(each && typeof each.kind === 'string' && line !== undefined ? { each: { kind: each.kind, line } } : {}),
    ...(footer !== undefined ? { footer } : {}),
    escape,
  };
}

/** Renderiza o modelo declarativo sobre a cópia do projeto. Puro e determinístico (elementos na ordem do projeto). */
export function renderTemplate(rawTemplate: unknown, project: { readonly [k: string]: unknown }): string {
  const t = parseTemplate(rawTemplate);
  const elements = Object.values((project.elements ?? {}) as Record<string, { kind?: string }>);
  const count: Record<string, number> = { total: elements.length };
  for (const e of elements) if (typeof e.kind === 'string' && SAFE_KEY(e.kind)) count[e.kind] = (count[e.kind] ?? 0) + 1;
  const top = { project: { name: typeof project.name === 'string' ? project.name : '' }, count };
  let out = t.header !== undefined ? fill(t.header, top, t.escape) : '';
  if (t.each) {
    let i = 0;
    for (const e of elements) {
      if (e.kind !== t.each.kind) continue;
      i += 1;
      out += fill(t.each.line, { ...e, index: i }, t.escape);
      if (out.length > PLUGIN_IO_MAX_BYTES) throw new PluginIoError('too_large', 'arquivo acima de 64 MiB');
    }
  }
  if (t.footer !== undefined) out += fill(t.footer, top, t.escape);
  return out;
}
