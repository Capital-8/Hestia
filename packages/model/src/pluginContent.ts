import { produce } from 'immer';
import { applyCommand, type Command } from './commands.ts';
import type { Id, Project } from './types.ts';
import { materialReferences } from './pluginContentCommands.ts';
import { validateProject } from './validate.ts';

/**
 * Conteúdo contribuído por suplementos (famílias e materiais; docs/plugins/08 §4, decisão 0057, fase G).
 * O suplemento só ADICIONA tipos e materiais, sob o prefixo `<pluginId>:`, e nunca troca os do projeto. Nada entra sozinho:
 * o usuário CARREGA (ação explícita) e a carga vira comandos comuns (`upsert*Type`, `upsertMaterial`), validados pelos
 * MESMOS validadores do app (cada comando é ensaiado com `applyCommand` numa cópia). Este módulo é puro: planeja e devolve
 * comandos; quem grava (um passo de desfazer) é a porta de escrita do host.
 */

export type ContentCategory = 'wall' | 'opening' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'stair' | 'ramp';
export type ContentKind = 'material' | ContentCategory;

/** Entrada de família do manifesto (tipos no formato do modelo, sem `id`; `key` opcional dá o sufixo do id). */
export interface ContentFamily { id: string; category: ContentCategory; types: ReadonlyArray<Record<string, unknown>> }
export interface ContentMaterial { id: string; name: string; color: string; gloss?: number; opacity?: number }
/** Tudo que um suplemento oferece. */
export interface ContentOffer { pluginId: string; pluginName: string; version: string; families: readonly ContentFamily[]; materials: readonly ContentMaterial[] }

/** Famílias e tipos que o modelo NÃO sabe carregar (documentado): guarda-corpo, montante e painel de cortina, grade. */
export const CONTENT_UNSUPPORTED = ['guardaCorpo', 'mullion', 'curtainPanel', 'grid'] as const;

type Coll = 'wallTypes' | 'floorTypes' | 'slabTypes' | 'ceilingTypes' | 'roofTypes' | 'stairTypes' | 'rampTypes' | 'openingTypes';
const CATEGORY: Record<ContentCategory, { coll: Coll; upsert: string; field: string; del: string }> = {
  wall: { coll: 'wallTypes', upsert: 'upsertWallType', field: 'wallType', del: 'deleteWallType' },
  floor: { coll: 'floorTypes', upsert: 'upsertFloorType', field: 'floorType', del: 'deleteFloorType' },
  slab: { coll: 'slabTypes', upsert: 'upsertSlabType', field: 'slabType', del: 'deleteSlabType' },
  ceiling: { coll: 'ceilingTypes', upsert: 'upsertCeilingType', field: 'ceilingType', del: 'deleteCeilingType' },
  roof: { coll: 'roofTypes', upsert: 'upsertRoofType', field: 'roofType', del: 'deleteRoofType' },
  stair: { coll: 'stairTypes', upsert: 'upsertStairType', field: 'stairType', del: 'deleteStairType' },
  ramp: { coll: 'rampTypes', upsert: 'upsertRampType', field: 'rampType', del: 'deleteRampType' },
  opening: { coll: 'openingTypes', upsert: 'upsertOpeningType', field: 'openingType', del: 'deleteOpeningType' },
};
const LAYERED: ReadonlySet<ContentCategory> = new Set(['wall', 'floor', 'slab', 'ceiling', 'roof']);
const LAYER_FUNCTIONS = ['structure', 'substrate', 'thermal', 'membrane', 'finish1', 'finish2'];
const WRAP = ['none', 'interior', 'exterior', 'both'];
const SHORT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export const CONTENT_KEY = 'content';
/** Registro (em `Project.plugins.data`) do que o suplemento já carregou: só informação (versão), a verdade é o projeto. */
export interface ContentRecord { version: string; materials: string[]; types: Array<{ id: string; category: ContentCategory }> }

export type ContentStatus = 'new' | 'unchanged' | 'update' | 'invalid';
export interface ContentItem {
  kind: ContentKind;
  /** Id qualificado `<pluginId>:...` que entra no projeto. */
  id: string;
  name: string;
  /** Id da família do manifesto (materiais: o próprio id curto). */
  source: string;
  status: ContentStatus;
  /** Motivo (texto do validador do app) quando `invalid`. */
  error?: string;
  /** Um `update` só é aplicado se o usuário escolheu atualizar. */
  applied: boolean;
}
export interface ContentPlan {
  items: ContentItem[];
  commands: Command[];
  counts: { new: number; update: number; unchanged: number; invalid: number; applied: number };
}
export interface ContentSelection { families?: ReadonlySet<string>; materials?: ReadonlySet<string> }
export interface ContentLoadOptions { updateExisting?: boolean; select?: ContentSelection }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const prefixOf = (pluginId: string): string => `${pluginId}:`;

/** JSON com chaves ordenadas: compara tipos sem depender da ordem das propriedades. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
}

/** Valida e completa um material do manifesto. Devolve o material do modelo ou o motivo da recusa. */
export function materialFromContent(pluginId: string, m: ContentMaterial): { ok: true; material: Project['materials'][string] } | { ok: false; error: string } {
  if (typeof m.id !== 'string' || !SHORT_ID.test(m.id)) return { ok: false, error: 'id inválido' };
  if (typeof m.name !== 'string' || m.name.trim() === '' || m.name.length > 80) return { ok: false, error: 'nome inválido (1 a 80 caracteres)' };
  if (typeof m.color !== 'string' || !COLOR.test(m.color)) return { ok: false, error: 'cor inválida (use #rrggbb)' };
  if (m.gloss !== undefined && !(num(m.gloss) && m.gloss >= 0 && m.gloss <= 1)) return { ok: false, error: 'brilho fora de 0 a 1' };
  if (m.opacity !== undefined && !(num(m.opacity) && m.opacity >= 0 && m.opacity <= 1)) return { ok: false, error: 'opacidade fora de 0 a 1' };
  return { ok: true, material: { id: `${prefixOf(pluginId)}${m.id}`, name: m.name.trim(), color: m.color.toLowerCase(), hatch: 'none', gloss: m.gloss ?? 0, opacity: m.opacity ?? 1, cost: 0, unit: 'm2' } };
}

/** Id do tipo no projeto: `<pluginId>:<família>` (um tipo só) ou `<pluginId>:<família>-<key ou posição>`. */
export function contentTypeId(pluginId: string, fam: ContentFamily, index: number): string {
  const key = fam.types[index]?.key;
  const suffix = typeof key === 'string' && SHORT_ID.test(key) ? key : fam.types.length > 1 ? String(index + 1) : '';
  return `${prefixOf(pluginId)}${fam.id}${suffix ? `-${suffix}` : ''}`;
}

type Resolve = (ref: unknown) => string;

/** Completa o tipo com os padrões do modelo (os mesmos dos tipos criados pelo app) e resolve as referências a materiais. */
function completeType(cat: ContentCategory, raw: Record<string, unknown>, id: string, mat: Resolve): Record<string, unknown> {
  const { key: _key, ...t } = raw;
  const base: Record<string, unknown> = { ...t, id, name: typeof t.name === 'string' ? t.name : '' };
  if (LAYERED.has(cat)) {
    base.code ??= '';
    base.description ??= '';
    base.cost ??= 0;
    // Acesso por colchetes: a guarda da parede cortina (contratoCortina.test.ts) só admite leitura de camadas em pontos listados.
    const camadas = t['layers'];
    base['layers'] = Array.isArray(camadas) ? camadas.map((l) => (isObj(l) ? { wraps: false, ...l, materialId: mat(l.materialId) } : l)) : camadas;
  }
  if (cat === 'wall') {
    Object.assign(base, { wrapInserts: t.wrapInserts ?? 'both', wrapEnds: t.wrapEnds ?? 'none', strips: t.strips ?? [], thermalU: t.thermalU ?? null, acousticRw: t.acousticRw ?? null, fireRating: t.fireRating ?? null, manufacturer: t.manufacturer ?? '' });
  }
  if (cat === 'opening') {
    const door = t.kind === 'door';
    Object.assign(base, { closure: t.closure ?? 'inherit', frameMaterialId: mat(t.frameMaterialId ?? (door ? 'mat_madeira' : 'mat_aluminio')), glassMaterialId: mat(t.glassMaterialId ?? 'mat_vidro') });
    if (t.leafMaterialId !== undefined) base.leafMaterialId = mat(t.leafMaterialId);
  }
  return base;
}

/** Conferências de forma que os validadores de comando não fazem (nome, camadas, materiais existentes). */
function shapeIssue(cat: ContentCategory, t: Record<string, unknown>, hasMaterial: (id: string) => boolean): string | null {
  if (typeof t.name !== 'string' || t.name.trim() === '' || t.name.length > 80) return 'nome do tipo inválido (1 a 80 caracteres)';
  if (LAYERED.has(cat)) {
    const camadas = t['layers'];
    if (!Array.isArray(camadas) || camadas.length === 0 || camadas.length > 40) return 'o tipo precisa de 1 a 40 camadas';
    for (const l of camadas) {
      if (!isObj(l) || !LAYER_FUNCTIONS.includes(String(l.function))) return 'camada com função inválida';
      if (!num(l.thickness) || l.thickness < 0 || l.thickness > 5) return 'espessura de camada inválida (metros, de 0 a 5)';
      if (typeof l.materialId !== 'string' || !hasMaterial(l.materialId)) return `material inexistente: ${String(l.materialId)}`;
    }
    if (!num(t.cost) || t.cost < 0) return 'custo inválido';
  }
  if (cat === 'wall') {
    if (!WRAP.includes(String(t.wrapInserts)) || !WRAP.includes(String(t.wrapEnds))) return 'retorno de acabamento inválido';
  }
  if (cat === 'opening') {
    for (const f of ['frameMaterialId', 'glassMaterialId', 'leafMaterialId'] as const) {
      if (t[f] !== undefined && !hasMaterial(String(t[f]))) return `material inexistente: ${String(t[f])}`;
    }
    if (!num(t.width) || !num(t.height) || t.width <= 0 || t.height <= 0 || !num(t.sill)) return 'medidas inválidas (metros)';
  }
  return null;
}

const apply = (p: Project, c: Command): Project => produce(p, (d) => { applyCommand(d as Project, c); });
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Erros de `validateProject` que o projeto não tinha antes. */
function newProjectError(before: Project, after: Project): string | null {
  const key = (i: { code: string; elementId?: string; message: string }): string => `${i.code}|${i.elementId ?? ''}|${i.message}`;
  const old = new Set(validateProject(before).filter((i) => i.severity === 'error').map(key));
  return validateProject(after).find((i) => i.severity === 'error' && !old.has(key(i)))?.message ?? null;
}

/**
 * Planeja a carga: prévia (o que é novo, igual, atualização ou inválido) e os comandos que a executam. Itens inválidos ficam
 * de fora e não impedem os demais. Atualizar um tipo já carregado (conteúdo diferente) só entra com `updateExisting`.
 */
export function planContentLoad(project: Project, offer: ContentOffer, opts: ContentLoadOptions = {}): ContentPlan {
  const items: ContentItem[] = [];
  const commands: Command[] = [];
  const pre = prefixOf(offer.pluginId);
  const matIds = new Set(offer.materials.map((m) => m.id));
  const wantM = (id: string): boolean => !opts.select?.materials || opts.select.materials.has(id);
  const wantF = (id: string): boolean => !opts.select?.families || opts.select.families.has(id);
  // Referência curta a material do próprio suplemento (da oferta ou já carregado) vira o id qualificado; o resto vale como está.
  const resolve: Resolve = (ref) => (typeof ref === 'string' && !project.materials[ref] && (matIds.has(ref) || project.materials[`${pre}${ref}`]) ? `${pre}${ref}` : (ref as string));
  let cur = project;
  const push = (it: Omit<ContentItem, 'applied'>, cmd: Command | null): void => {
    const applied = it.status === 'invalid' ? false : it.status === 'update' ? !!opts.updateExisting : it.status === 'new';
    items.push({ ...it, applied });
    if (applied && cmd) commands.push(cmd);
  };

  for (const m of offer.materials) {
    if (!wantM(m.id)) continue;
    const r = materialFromContent(offer.pluginId, m);
    if (!r.ok) { push({ kind: 'material', id: `${pre}${String(m.id)}`, name: String(m.name ?? ''), source: String(m.id), status: 'invalid', error: r.error }, null); continue; }
    const cmd: Command = { type: 'upsertMaterial', material: r.material };
    const old = cur.materials[r.material.id];
    const status: ContentStatus = !old ? 'new' : stable(old) === stable(r.material) ? 'unchanged' : 'update';
    push({ kind: 'material', id: r.material.id, name: r.material.name, source: m.id, status }, cmd);
    if (status === 'new' || (status === 'update' && opts.updateExisting)) cur = apply(cur, cmd);
  }

  for (const fam of offer.families) {
    if (!wantF(fam.id)) continue;
    const meta = CATEGORY[fam.category];
    fam.types.forEach((raw, i) => {
      const id = contentTypeId(offer.pluginId, fam, i);
      const name = typeof raw.name === 'string' ? raw.name : id;
      const bad = (error: string): void => push({ kind: fam.category, id, name, source: fam.id, status: 'invalid', error }, null);
      if (!meta || !SHORT_ID.test(fam.id)) return bad('família inválida');
      if (!isObj(raw)) return bad('tipo inválido');
      const type = completeType(fam.category, raw, id, resolve);
      const issue = shapeIssue(fam.category, type, (mid) => !!cur.materials[mid]);
      if (issue) return bad(issue);
      const cmd = { type: meta.upsert, [meta.field]: type } as unknown as Command;
      let after: Project;
      try {
        after = apply(cur, cmd);
      } catch (e) {
        return bad(errText(e));
      }
      const err = newProjectError(cur, after);
      if (err) return bad(err);
      const old = (cur[meta.coll] as Record<string, unknown>)[id];
      const result = (after[meta.coll] as Record<string, unknown>)[id];
      const status: ContentStatus = !old ? 'new' : stable(old) === stable(result) ? 'unchanged' : 'update';
      push({ kind: fam.category, id, name, source: fam.id, status }, cmd);
      if (status === 'new' || (status === 'update' && opts.updateExisting)) cur = after;
    });
  }

  const counts = { new: 0, update: 0, unchanged: 0, invalid: 0, applied: 0 };
  for (const it of items) { counts[it.status]++; if (it.applied) counts.applied++; }
  if (commands.length > 0) {
    const prev = (project.plugins?.data?.[offer.pluginId]?.values[CONTENT_KEY] ?? null) as Partial<ContentRecord> | null;
    const mats = new Set(prev?.materials ?? []);
    const types = new Map((prev?.types ?? []).map((t) => [t.id, t]));
    for (const it of items) {
      if (!it.applied) continue;
      if (it.kind === 'material') mats.add(it.id); else types.set(it.id, { id: it.id, category: it.kind });
    }
    const value: ContentRecord = { version: offer.version, materials: [...mats], types: [...types.values()] };
    commands.push({ type: 'setPluginData', pluginId: offer.pluginId, key: CONTENT_KEY, value: value as never, schema: 1, version: offer.version });
  }
  return { items, commands, counts };
}

export type RemovalStatus = 'removable' | 'in-use';
export interface RemovalItem { kind: ContentKind; id: string; name: string; status: RemovalStatus; /** Elementos (tipos) ou referências (materiais) que o usam. */ uses: number }
export interface RemovalPlan { items: RemovalItem[]; commands: Command[]; blocked: number }

/** Quantos elementos usam o tipo (por `typeId`). */
function typeUses(p: Project, id: Id): number {
  return Object.values(p.elements).filter((e) => (e as { typeId?: Id }).typeId === id).length;
}

/**
 * Planeja a remoção segura do conteúdo de um suplemento (tipos e materiais sob `<pluginId>:`). Tipo ou material em uso NUNCA
 * é removido: vira `in-use` e o app avisa. Os tipos saem antes dos materiais, para liberar os materiais que só eles usavam.
 */
export function planContentRemoval(project: Project, pluginId: string): RemovalPlan {
  const pre = prefixOf(pluginId);
  const items: RemovalItem[] = [];
  const commands: Command[] = [];
  let cur = project;
  const tryRemove = (item: Omit<RemovalItem, 'status'>, cmd: Command): void => {
    try {
      cur = apply(cur, cmd);
      items.push({ ...item, status: 'removable' });
      commands.push(cmd);
    } catch {
      items.push({ ...item, status: 'in-use' });
    }
  };
  for (const [cat, meta] of Object.entries(CATEGORY) as Array<[ContentCategory, (typeof CATEGORY)[ContentCategory]]>) {
    for (const [id, t] of Object.entries(project[meta.coll] as Record<string, { name: string }>)) {
      if (id.startsWith(pre)) tryRemove({ kind: cat, id, name: t.name, uses: typeUses(project, id) }, { type: meta.del, id } as unknown as Command);
    }
  }
  for (const [id, m] of Object.entries(project.materials)) {
    if (id.startsWith(pre)) tryRemove({ kind: 'material', id, name: m.name, uses: materialReferences(project, id) }, { type: 'deleteMaterial', id });
  }
  const blocked = items.filter((i) => i.status === 'in-use').length;
  if (items.length > 0 && blocked === 0 && project.plugins?.data?.[pluginId]?.values[CONTENT_KEY] !== undefined) {
    commands.push({ type: 'deletePluginData', pluginId, key: CONTENT_KEY, schema: 1 });
  }
  return { items, commands, blocked };
}

/** Ids sob o prefixo do suplemento que existem hoje no projeto (para o gerenciador mostrar "carregado"). */
export function loadedContentIds(project: Project, pluginId: string): string[] {
  const pre = prefixOf(pluginId);
  const ids = Object.values(CATEGORY).flatMap((m) => Object.keys(project[m.coll] as Record<string, unknown>));
  return [...ids, ...Object.keys(project.materials)].filter((id) => id.startsWith(pre));
}
