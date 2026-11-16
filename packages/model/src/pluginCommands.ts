import { produce } from 'immer';
import { applyCommand, type Command } from './commands.ts';
import type { ProjectStore } from './history.ts';
import { newId } from './ids.ts';
import { assertPlainJson } from './pluginData.ts';
import type { Id, Project } from './types.ts';
import { validateProject } from './validate.ts';

/**
 * Escrita de plugins no modelo (docs/plugins/08 §6, decisão 0057). O plugin envia `unknown[]`; o host:
 *  1. confere o formato (JSON puro), o tamanho e a LISTA BRANCA de tipos de `Command` (abaixo);
 *  2. confere os argumentos (ids novos emitidos pelo host, ids existentes, tipos só sob `<pluginId>:`);
 *  3. aplica tudo numa cópia (ensaio) e recusa o lote se algum comando falhar ou surgir erro novo de `validateProject`;
 *  4. só então grava, como UM passo de desfazer. Falha em qualquer ponto = nada muda e nada entra no histórico.
 * O plugin nunca recebe o `Project` mutável nem o `ProjectStore`.
 */
export const PLUGIN_BATCH_LIMITS = {
  /** Comandos por lote. */
  maxCommands: 5000,
  /** 8 mebibytes (8.388.608 bytes) de JSON por lote. */
  maxBytes: 8 * 1024 * 1024,
  /** Profundidade máxima de um comando. */
  maxDepth: 64,
  /** Ids emitidos por plugin que ainda não foram usados. */
  maxIssuedIds: 100_000,
} as const;

export type PluginBatchResult = { ok: true; applied: number } | { ok: false; index: number; error: string };

/** Comandos que criam elemento: tipo -> campo do comando que carrega o elemento (o id do elemento deve ser emitido pelo host). */
const ADD_ELEMENT: Record<string, string> = {
  addWall: 'wall', addCadDrawing: 'cad', addGeneric: 'generic', addOpening: 'opening', addFloor: 'floor', addSlab: 'slab',
  addRoof: 'roof', addCeiling: 'ceiling', addRoom: 'room', addStair: 'stair', addRamp: 'ramp', addGuardaCorpo: 'guardaCorpo',
};
/** Comandos `{ id, patch }` sobre um elemento existente. */
const UPDATE_ONE = new Set(['updateCadDrawing', 'updateGeneric', 'updateCeiling', 'updateRoom', 'updateGuardaCorpo']);
/** Comandos `{ id }` sobre um elemento existente. */
const ID_ONLY = new Set(['detachOutline', 'relinkOutline', 'setWallEnds']);
/** Tipos e materiais: tipo de comando -> campo que carrega o objeto (cujo `id` deve começar por `<pluginId>:`). */
const UPSERT_TYPE: Record<string, string> = {
  upsertWallType: 'wallType', upsertCeilingType: 'ceilingType', upsertRoofType: 'roofType', upsertStairType: 'stairType',
  upsertRampType: 'rampType', upsertSlabType: 'slabType', upsertFloorType: 'floorType', upsertOpeningType: 'openingType',
  upsertTipoGuardaCorpo: 'tipo', upsertMullionType: 'mullionType', upsertCurtainPanelType: 'panelType', upsertMaterial: 'material',
};
const DELETE_TYPE = new Set([
  'deleteWallType', 'deleteCeilingType', 'deleteRoofType', 'deleteStairType', 'deleteRampType', 'deleteSlabType',
  'deleteFloorType', 'deleteTipoGuardaCorpo', 'deleteMullionType', 'deleteCurtainPanelType',
  'deleteOpeningType', 'deleteMaterial', // SUPLEMENTOS:
]);
const PROTECTED_KEYS = ['id', 'kind', 'order'] as const;

/** Tipos de `Command` permitidos a plugin com `model.write` (o resto é recusado: apagar nível, importar em massa, `plugins` alheio...). */
export const PLUGIN_ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  ...Object.keys(ADD_ELEMENT), 'addCeilings', ...UPDATE_ONE, ...ID_ONLY, ...Object.keys(UPSERT_TYPE), ...DELETE_TYPE,
  'updateElements', 'deleteElements', 'transform', 'splitWall', 'setJoin', 'setOpeningHost',
  'setPluginData', 'deletePluginData',
]);

/** Emite ids novos (via `newId` do host) e lembra quais foram pedidos por plugin: ids inventados pelo plugin são recusados. */
export class PluginIdIssuer {
  private issued = new Map<string, Set<Id>>();

  issue(pluginId: string, prefix: string): Id {
    if (!/^[a-z][a-z0-9]{0,15}$/.test(prefix)) throw new Error('Prefixo de id inválido (letras minúsculas e dígitos, até 16).');
    const set = this.issued.get(pluginId) ?? new Set<Id>();
    if (set.size >= PLUGIN_BATCH_LIMITS.maxIssuedIds) throw new Error('Ids demais pedidos sem uso.');
    const id = newId(prefix);
    set.add(id);
    this.issued.set(pluginId, set);
    return id;
  }

  has(pluginId: string, id: Id): boolean {
    return this.issued.get(pluginId)?.has(id) ?? false;
  }
}

export interface PluginBatchOptions {
  pluginId: string;
  /** Rótulo do passo de desfazer, já com o nome do plugin (ex.: "Grade de pilares: gerar"). */
  label: string;
  commands: unknown;
  isIssuedId: (id: Id) => boolean;
  /** `dataSchema` do manifesto instalado (padrão 1) e versão do plugin: o host os impõe aos comandos de dados. */
  dataSchema?: number;
  version?: string;
  /** Teto menor que o do host (ex.: `limits.maxCommandsPerAction` do manifesto); nunca amplia. */
  maxCommands?: number;
}

class BatchError extends Error {
  constructor(readonly index: number, message: string) { super(message); }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > 200) throw new Error(`${what} inválido.`);
  return v;
};

interface Scope { pluginId: string; known: Set<Id>; isIssuedId: (id: Id) => boolean; dataSchema: number; version?: string }

function newElementId(sc: Scope, id: unknown): Id {
  const s = str(id, 'Id do elemento');
  if (!sc.isIssuedId(s)) throw new Error(`Id "${s}" não foi emitido pelo host (use model.newId).`);
  if (sc.known.has(s)) throw new Error(`Id "${s}" já existe no projeto.`);
  sc.known.add(s);
  return s;
}

function existing(sc: Scope, id: unknown): Id {
  const s = str(id, 'Id');
  if (!sc.known.has(s)) throw new Error(`Elemento inexistente: ${s}.`);
  return s;
}

function checkPatch(patch: unknown): void {
  if (!isObj(patch)) throw new Error('Alteração (patch) inválida.');
  for (const k of PROTECTED_KEYS) if (k in patch) throw new Error(`O patch não pode alterar "${k}".`);
}

function ownTypeId(sc: Scope, id: unknown): void {
  const s = str(id, 'Id do tipo');
  if (!s.startsWith(`${sc.pluginId}:`) || s.length === sc.pluginId.length + 1) throw new Error(`Id de tipo "${s}" deve começar por "${sc.pluginId}:".`);
}

function checkIds(sc: Scope, ids: unknown): void {
  if (!Array.isArray(ids) || ids.length === 0) throw new Error('Lista de ids ausente.');
  for (const id of ids) existing(sc, id);
}

function checkIdMap(sc: Scope, map: unknown): void {
  if (!isObj(map)) throw new Error('idMap inválido.');
  for (const [from, to] of Object.entries(map)) { existing(sc, from); newElementId(sc, to); }
}

function checkCommand(sc: Scope, c: Record<string, unknown>): void {
  const type = c.type as string;
  if (ADD_ELEMENT[type]) {
    const el = c[ADD_ELEMENT[type]!];
    if (!isObj(el)) throw new Error('Elemento ausente no comando.');
    newElementId(sc, el.id);
  } else if (type === 'addCeilings') {
    if (!Array.isArray(c.ceilings)) throw new Error('Lista de forros ausente.');
    for (const el of c.ceilings) newElementId(sc, isObj(el) ? el.id : undefined);
  } else if (UPDATE_ONE.has(type)) {
    existing(sc, c.id);
    checkPatch(c.patch);
  } else if (ID_ONLY.has(type)) {
    existing(sc, c.id);
  } else if (UPSERT_TYPE[type]) {
    const o = c[UPSERT_TYPE[type]!];
    if (!isObj(o)) throw new Error('Objeto do tipo ausente.');
    ownTypeId(sc, o.id);
  } else if (DELETE_TYPE.has(type)) {
    ownTypeId(sc, c.id);
  } else if (type === 'updateElements') {
    checkIds(sc, c.ids);
    checkPatch(c.patch);
  } else if (type === 'deleteElements') {
    checkIds(sc, c.ids);
  } else if (type === 'transform') {
    checkIds(sc, c.ids);
    if (c.copy !== undefined) checkIdMap(sc, isObj(c.copy) ? c.copy.idMap : undefined);
  } else if (type === 'splitWall') {
    existing(sc, c.id);
    newElementId(sc, c.newId);
    if (c.idMap !== undefined) checkIdMap(sc, c.idMap);
  } else if (type === 'setJoin') {
    if (!Array.isArray(c.ends)) throw new Error('Pontas ausentes.');
    for (const e of c.ends) existing(sc, isObj(e) ? e.wallId : undefined);
  } else if (type === 'setOpeningHost') {
    existing(sc, c.id);
    existing(sc, c.hostId);
  }
}

/** Valida UM comando e devolve a cópia segura (o plugin não mantém referência ao que o host aplica). */
function sanitizeOne(sc: Scope, raw: unknown): Command {
  if (!isObj(raw) || typeof raw.type !== 'string') throw new Error('Comando precisa ser um objeto com "type".');
  assertPlainJson(raw, PLUGIN_BATCH_LIMITS.maxDepth, 'Comando');
  if (!PLUGIN_ALLOWED_COMMANDS.has(raw.type)) throw new Error(`Comando "${raw.type}" não é permitido a plugins.`);
  const c = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  if (c.type === 'setPluginData' || c.type === 'deletePluginData') {
    // O espaço é sempre o do próprio plugin: o host força o id, o schema e a versão.
    c.pluginId = sc.pluginId;
    c.schema = sc.dataSchema;
    if (c.type === 'setPluginData') c.version = sc.version ?? '';
    return c as unknown as Command;
  }
  checkCommand(sc, c);
  return c as unknown as Command;
}

const errorKey = (i: { code: string; elementId?: string; message: string }): string => `${i.code}|${i.elementId ?? ''}|${i.message}`;

/** Mensagens dos erros de `validateProject` que não existiam antes do lote. */
function newErrors(before: Project, after: Project): string[] {
  const old = new Set(validateProject(before).filter((i) => i.severity === 'error').map(errorKey));
  return validateProject(after).filter((i) => i.severity === 'error' && !old.has(errorKey(i))).map((i) => i.message);
}

/** Formato, quantidade e tamanho do lote (compartilhado entre o ensaio e a aplicação). Devolve o problema ou null. */
function checkBatchLimits(o: PluginBatchOptions): string | null {
  if (!Array.isArray(o.commands)) return 'O lote precisa ser uma lista de comandos.';
  const max = Math.min(o.maxCommands ?? PLUGIN_BATCH_LIMITS.maxCommands, PLUGIN_BATCH_LIMITS.maxCommands);
  if (o.commands.length > max) return `Lote com ${o.commands.length} comandos; o máximo é ${max}.`;
  const bytes = new TextEncoder().encode(JSON.stringify(o.commands)).length;
  return bytes > PLUGIN_BATCH_LIMITS.maxBytes ? `Lote com ${bytes} bytes; o máximo é ${PLUGIN_BATCH_LIMITS.maxBytes} (8 MiB).` : null;
}

/** Resultado do ENSAIO de um lote (prévia): nada foi gravado nem entrou no histórico. */
export interface BatchRehearsal {
  /** O lote seria aceito por `applyPluginBatch` agora (sem erros). */
  ok: boolean;
  commands: number;
  /** Elementos que passariam a existir. */
  created: number;
  /** Elementos existentes que mudariam. */
  changed: number;
  /** Elementos existentes que seriam apagados. */
  deleted: number;
  /** Problemas (no máximo 20): índice do comando (-1 = lote inteiro) e mensagem. */
  errors: Array<{ index: number; message: string }>;
}

const MAX_REHEARSAL_ERRORS = 20;

/**
 * Ensaia o lote numa cópia do projeto, com as MESMAS validações de `applyPluginBatch` (lista branca, ids emitidos pelo
 * host, `validateProject`), e conta o que mudaria. Não grava, não emite evento e não toca no histórico. Nunca lança.
 */
export function rehearsePluginBatch(store: ProjectStore, o: PluginBatchOptions): BatchRehearsal {
  const empty = (errors: BatchRehearsal['errors']): BatchRehearsal => ({ ok: false, commands: Array.isArray(o.commands) ? o.commands.length : 0, created: 0, changed: 0, deleted: 0, errors });
  const lim = checkBatchLimits(o);
  if (lim) return empty([{ index: -1, message: lim }]);
  const raws = o.commands as unknown[];
  if (raws.length === 0) return { ok: true, commands: 0, created: 0, changed: 0, deleted: 0, errors: [] };
  const before = store.project;
  const sc: Scope = { pluginId: o.pluginId, known: new Set(Object.keys(before.elements)), isIssuedId: o.isIssuedId, dataSchema: o.dataSchema ?? 1, version: o.version };
  const cmds: Command[] = [];
  const errors: BatchRehearsal['errors'] = [];
  raws.forEach((raw, i) => {
    try { cmds.push(sanitizeOne(sc, raw)); } catch (e) { if (errors.length < MAX_REHEARSAL_ERRORS) errors.push({ index: i, message: (e as Error).message }); }
  });
  if (errors.length > 0) return empty(errors);
  let i = 0;
  let after: Project;
  try {
    after = produce(before, (draft) => { for (; i < cmds.length; i++) applyCommand(draft as Project, cmds[i]!); });
  } catch (e) {
    return empty([{ index: i, message: (e as Error).message }]);
  }
  const bad = newErrors(before, after);
  const b = before.elements;
  const a = after.elements;
  let created = 0;
  let changed = 0;
  let deleted = 0;
  for (const id of Object.keys(a)) { if (!(id in b)) created += 1; else if (a[id] !== b[id]) changed += 1; }
  for (const id of Object.keys(b)) if (!(id in a)) deleted += 1;
  return { ok: bad.length === 0, commands: cmds.length, created, changed, deleted, errors: bad.slice(0, MAX_REHEARSAL_ERRORS).map((message) => ({ index: -1, message: `O lote deixaria o projeto inválido: ${message}` })) };
}

/** Valida e aplica o lote. Atômico (tudo ou nada) e UM passo de desfazer. Nunca lança: devolve o resultado. */
export function applyPluginBatch(store: ProjectStore, o: PluginBatchOptions): PluginBatchResult {
  const fail = (index: number, error: string): PluginBatchResult => ({ ok: false, index, error });
  try {
    const lim = checkBatchLimits(o);
    if (lim) return fail(-1, lim);
    const list = o.commands as unknown[];
    if (list.length === 0) return { ok: true, applied: 0 };

    const before = store.project;
    const sc: Scope = { pluginId: o.pluginId, known: new Set(Object.keys(before.elements)), isIssuedId: o.isIssuedId, dataSchema: o.dataSchema ?? 1, version: o.version };
    const cmds: Command[] = [];
    list.forEach((raw, i) => {
      try { cmds.push(sanitizeOne(sc, raw)); } catch (e) { throw new BatchError(i, (e as Error).message); }
    });

    // Ensaio numa cópia: qualquer falha aqui deixa o projeto e o histórico intactos.
    let i = 0;
    let preview: Project;
    try {
      preview = produce(before, (draft) => { for (; i < cmds.length; i++) applyCommand(draft as Project, cmds[i]!); });
    } catch (e) {
      throw new BatchError(i, (e as Error).message);
    }
    const bad = newErrors(before, preview);
    if (bad.length > 0) return fail(cmds.length - 1, `O lote deixaria o projeto inválido: ${bad[0]}`);

    const v0 = store.version;
    try {
      store.transaction(o.label.slice(0, 120), () => { for (const c of cmds) store.exec(c); });
    } catch (e) {
      // Não deveria ocorrer após o ensaio; se ocorrer, desfaz o que a transação já gravou.
      if (store.version !== v0) store.undo();
      return fail(-1, (e as Error).message);
    }
    return { ok: true, applied: cmds.length };
  } catch (e) {
    if (e instanceof BatchError) return fail(e.index, e.message);
    return fail(-1, (e as Error).message);
  }
}
