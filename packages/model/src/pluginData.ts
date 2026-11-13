import type { Id, Project } from './types.ts';

/**
 * Dados de plugins gravados no arquivo do projeto (docs/plugins). Dois usos, ambos opcionais (ausente = nenhum):
 *  - `projectUid`: ID estável do projeto para os plugins (não muda ao renomear nem ao salvar noutro arquivo);
 *  - `viewOverrides`: substituições de material SÓ de visualização, por plugin e por id do material de ORIGEM.
 *    O material do projeto (`Project.materials`) nunca é alterado por elas.
 */
export interface ViewMaterialOverrideData {
  color?: string;
  opacity?: number;
  gloss?: number;
  params?: Record<string, number | string | boolean>;
}

/** JSON puro: o único formato aceito no espaço de dados e nos lotes de comandos de plugin. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

/** Espaço de dados de UM plugin no projeto (docs/plugins/08 §5). Opcional; não muda SCHEMA_VERSION. */
export interface PluginDataSpace {
  /** Versão do formato dos dados (= `dataSchema` do manifesto do plugin que gravou). */
  schema: number;
  /** Versão do plugin que gravou por último. */
  version: string;
  /** Chave livre (até 64 caracteres) para JSON. */
  values: Record<string, JsonValue>;
}

export interface PluginProjectData {
  projectUid?: string;
  viewOverrides?: Record<string, Record<Id, ViewMaterialOverrideData>>;
  /** Dados próprios de cada plugin, por id do plugin. */
  data?: Record<string, PluginDataSpace>;
  /** Permissões concedidas ao salvar, por id do plugin (auditoria; sem comando nesta fase). */
  grants?: Record<string, string[]>;
}

/** Limites do espaço de dados, em bytes (UTF-8 do JSON) ou unidades indicadas. */
export const PLUGIN_DATA_LIMITS = {
  /** 1 mebibyte (1.048.576 bytes) por plugin. */
  bytesPerPlugin: 1024 * 1024,
  /** 4 mebibytes (4.194.304 bytes) somando todos os plugins do projeto. */
  bytesPerProject: 4 * 1024 * 1024,
  /** Profundidade máxima de aninhamento de um valor. */
  maxDepth: 16,
  /** Caracteres máximos da chave. */
  maxKeyLength: 64,
} as const;

/** Tamanho em bytes (UTF-8) do JSON do valor. */
export function jsonBytes(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v) ?? '').length;
}

/**
 * Exige JSON puro: objetos simples, listas, texto, número finito, booleano e null.
 * Recusa undefined, funções, símbolos, NaN, Infinity, instâncias de classe, ciclos e chaves de protótipo.
 */
export function assertPlainJson(v: unknown, maxDepth: number, what = 'Valor'): void {
  const seen = new Set<object>();
  const walk = (x: unknown, depth: number): void => {
    if (depth > maxDepth) throw new Error(`${what}: profundidade acima de ${maxDepth}.`);
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return;
    if (typeof x === 'number') { if (!Number.isFinite(x)) throw new Error(`${what}: número não finito.`); return; }
    if (typeof x !== 'object') throw new Error(`${what}: tipo ${typeof x} não é JSON.`);
    if (seen.has(x)) throw new Error(`${what}: referência circular.`);
    seen.add(x);
    if (Array.isArray(x)) { for (const i of x) walk(i, depth + 1); seen.delete(x); return; }
    const proto = Object.getPrototypeOf(x);
    if (proto !== Object.prototype && proto !== null) throw new Error(`${what}: só objetos simples são aceitos.`);
    for (const k of Object.keys(x)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new Error(`${what}: chave proibida "${k}".`);
      walk((x as Record<string, unknown>)[k], depth + 1);
    }
    seen.delete(x);
  };
  walk(v, 0);
}

export type PluginDataCommand =
  | { type: 'ensurePluginProjectUid'; uid: string }
  | { type: 'setPluginViewOverride'; pluginId: string; materialId: Id; override: ViewMaterialOverrideData }
  | { type: 'clearPluginViewOverride'; pluginId: string; materialId: Id }
  /** `schema`/`version` vêm do manifesto instalado (o host preenche; o plugin não escolhe). */
  | { type: 'setPluginData'; pluginId: string; key: string; value: JsonValue; schema?: number; version?: string }
  | { type: 'deletePluginData'; pluginId: string; key: string; schema?: number };

export const pluginDataSpace = (p: Pick<Project, 'plugins'>, pluginId: string): PluginDataSpace | undefined => p.plugins?.data?.[pluginId];

/**
 * Espaço somente leitura: o projeto veio de uma versão MAIS NOVA do plugin (schema salvo maior que o instalado).
 * `installedSchema` ausente = 1 (padrão do manifesto).
 */
export function pluginDataReadOnly(p: Pick<Project, 'plugins'>, pluginId: string, installedSchema = 1): boolean {
  const sp = pluginDataSpace(p, pluginId);
  return !!sp && sp.schema > installedSchema;
}

export const pluginProjectUid = (p: Pick<Project, 'plugins'>): string | undefined => p.plugins?.projectUid;

export const pluginViewOverrides = (p: Pick<Project, 'plugins'>, pluginId: string): Record<Id, ViewMaterialOverrideData> => p.plugins?.viewOverrides?.[pluginId] ?? {};

const HEX = /^#[0-9a-fA-F]{6}$/;
const unit = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

/** Normaliza e valida; lança Error se algo for inválido (o editor mostra a mensagem). */
function cleanOverride(o: ViewMaterialOverrideData): ViewMaterialOverrideData {
  const out: ViewMaterialOverrideData = {};
  if (o.color !== undefined) { if (!HEX.test(o.color)) throw new Error('Cor inválida (use #rrggbb).'); out.color = o.color.toLowerCase(); }
  if (o.opacity !== undefined) { if (!unit(o.opacity)) throw new Error('Opacidade deve estar entre 0 e 1.'); out.opacity = o.opacity; }
  if (o.gloss !== undefined) { if (!unit(o.gloss)) throw new Error('Brilho deve estar entre 0 e 1.'); out.gloss = o.gloss; }
  if (o.params !== undefined) {
    const entries = Object.entries(o.params);
    if (entries.length > 32) throw new Error('Parâmetros demais (máximo 32).');
    const params: Record<string, number | string | boolean> = {};
    for (const [k, v] of entries) {
      if (k.length > 40 || (typeof v === 'string' && v.length > 200) || !['number', 'string', 'boolean'].includes(typeof v) || (typeof v === 'number' && !Number.isFinite(v))) throw new Error(`Parâmetro "${k}" inválido.`);
      params[k] = v;
    }
    out.params = params;
  }
  return out;
}

function checkKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > PLUGIN_DATA_LIMITS.maxKeyLength) throw new Error(`Chave de dados inválida (1 a ${PLUGIN_DATA_LIMITS.maxKeyLength} caracteres).`);
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Chave de dados proibida.');
}

function writableSpace(p: Project, pluginId: string, installed: number): PluginDataSpace | undefined {
  const sp = p.plugins?.data?.[pluginId];
  if (sp && sp.schema > installed) throw new Error(`Dados do plugin ${pluginId} são de uma versão mais nova (schema ${sp.schema} > ${installed}); somente leitura.`);
  return sp;
}

function setData(p: Project, c: Extract<PluginDataCommand, { type: 'setPluginData' }>): void {
  checkKey(c.key);
  const installed = c.schema ?? 1;
  if (!Number.isInteger(installed) || installed < 1 || installed > 9999) throw new Error('Schema de dados inválido.');
  const prev = writableSpace(p, c.pluginId, installed);
  assertPlainJson(c.value, PLUGIN_DATA_LIMITS.maxDepth, 'Dado do plugin');
  const values = { ...prev?.values, [c.key]: c.value };
  const mine = jsonBytes(values);
  if (mine > PLUGIN_DATA_LIMITS.bytesPerPlugin) throw new Error(`Dados do plugin acima de ${PLUGIN_DATA_LIMITS.bytesPerPlugin} bytes (1 MiB).`);
  let others = 0;
  for (const [id, sp] of Object.entries(p.plugins?.data ?? {})) if (id !== c.pluginId) others += jsonBytes(sp.values);
  if (others + mine > PLUGIN_DATA_LIMITS.bytesPerProject) throw new Error(`Dados de plugins no projeto acima de ${PLUGIN_DATA_LIMITS.bytesPerProject} bytes (4 MiB).`);
  const space: PluginDataSpace = { schema: installed, version: (c.version ?? prev?.version ?? '').slice(0, 40), values };
  p.plugins = { ...p.plugins, data: { ...p.plugins?.data, [c.pluginId]: space } };
}

export function applyPluginDataCommand(p: Project, c: PluginDataCommand): void {
  switch (c.type) {
    case 'ensurePluginProjectUid':
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(c.uid)) throw new Error('ID de projeto inválido.');
      if (!p.plugins?.projectUid) p.plugins = { ...p.plugins, projectUid: c.uid };
      break;
    case 'setPluginViewOverride': {
      if (!p.materials[c.materialId]) throw new Error(`Material de origem inexistente: ${c.materialId}`);
      const o = cleanOverride(c.override);
      const all = { ...p.plugins?.viewOverrides };
      all[c.pluginId] = { ...all[c.pluginId], [c.materialId]: o };
      p.plugins = { ...p.plugins, viewOverrides: all };
      break;
    }
    case 'setPluginData':
      setData(p, c);
      break;
    case 'deletePluginData': {
      const prev = writableSpace(p, c.pluginId, c.schema ?? 1);
      if (!prev || !(c.key in prev.values)) break;
      const { [c.key]: _drop, ...rest } = prev.values;
      void _drop;
      p.plugins = { ...p.plugins, data: { ...p.plugins?.data, [c.pluginId]: { ...prev, values: rest } } };
      break;
    }
    case 'clearPluginViewOverride': {
      const mine = p.plugins?.viewOverrides?.[c.pluginId];
      if (!mine || !(c.materialId in mine)) break;
      const { [c.materialId]: _drop, ...rest } = mine;
      void _drop;
      const all = { ...p.plugins!.viewOverrides, [c.pluginId]: rest };
      p.plugins = { ...p.plugins, viewOverrides: all };
      break;
    }
  }
}
