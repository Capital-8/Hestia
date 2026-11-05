/**
 * Reconhecimento da extensão Hestia no import (`Pset_Hestia_Element` / `Pset_Hestia_Project`).
 *
 * Quando o arquivo traz os psets privados, o elemento volta do `HestiaJSON` já com id, tipo, nível, offsets, flags e
 * juntas — o importador não passa pela heurística de geometria (a geometria do IFC continua no arquivo para os outros
 * programas). O esqueleto do projeto (níveis, tipos, materiais, padrões, ajustes) volta do `Pset_Hestia_Project`.
 *
 * Sem os psets, nada aqui muda o resultado: `readHestia` devolve vazio e a importação segue o caminho atual.
 */

import type { Element, Generic, Id, IfcProperty, Level, Project } from '@hestia/model';
import { t as tr, type Lang } from '../i18n.ts';
import { HESTIA_ELEMENT_PSET, HESTIA_PROJECT_PSET, HESTIA_VERSION, isHestiaPset, type HestiaElementRecord } from '../ifc/ifcHestia.ts';
import { bodyOf } from './geometry.ts';
import { makeGeneric } from './genericElement.ts';
import type { IfcFile } from './ifc.ts';
import type { LevelRef } from './levels.ts';
import type { StepEntity, StepValue } from './step.ts';

/** Mapas de tipo que viajam no `TypesJSON`. */
type ProjectTypes = Partial<
  Pick<Project, 'wallTypes' | 'floorTypes' | 'slabTypes' | 'ceilingTypes' | 'roofTypes' | 'stairTypes' | 'openingTypes' | 'gridTypes'>
>;

/** Esqueleto do projeto que o `Pset_Hestia_Project` carrega. */
export interface HestiaProjectData {
  schemaVersion?: number;
  nextOrder?: number;
  settings?: Project['settings'];
  types?: ProjectTypes;
  materials?: Project['materials'];
  levels?: Level[];
  defaults?: Project['defaults'];
  /** Vistas, pranchas e gráficos do projeto: não têm entidade IFC, voltam do pset. */
  views?: Project['views'];
  sheets?: Project['sheets'];
  grids?: Project['grids'];
  graphics?: Project['graphics'];
  view3d?: Project['view3d'];
  sectionGraphics?: Project['sectionGraphics'];
}

/** Elemento com pset privado: id STEP do produto e registro nativo. */
export interface HestiaElementItem {
  entity: number;
  record: HestiaElementRecord;
}

/** O que o arquivo trouxe da extensão Hestia (vazio quando não há psets). */
export interface HestiaFileData {
  project: HestiaProjectData | null;
  elements: HestiaElementItem[];
}

/** O mínimo do contexto da importação que a reconstrução precisa. */
export interface HestiaTarget {
  f: IfcFile;
  p: Project;
  typeOf: Map<number, StepEntity>;
  walls: Map<number, Id>;
  handled: Set<number>;
  warn(msg: string): void;
  count(kind: string): void;
  /** Idioma das mensagens do resumo; ausente = `'pt'`. */
  lang?: Lang;
}

/** Rótulo do relatório de importação por `kind` (o mesmo do caminho heurístico). */
const IMPORTED_LABEL: Record<string, string> = {
  wall: 'paredes',
  door: 'portas',
  window: 'janelas',
  floor: 'pisos',
  slab: 'lajes',
  ceiling: 'forros',
  roof: 'telhados',
  stair: 'escadas',
  room: 'ambientes',
  generic: 'objetos',
};

const KINDS = new Set(['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof', 'stair', 'room', 'generic']);

/** Valor de uma `IfcPropertySingleValue` como texto (JSON incluso), sem decodificação extra: o leitor já desfez escapes. */
function plainText(v: StepValue | undefined): string | null {
  if (!v) return null;
  switch (v.k) {
    case 'str':
      return v.v;
    case 'num':
      return String(v.v);
    case 'enum':
      return v.v;
    case 'type':
      return plainText(v.arg);
    default:
      return null;
  }
}

/** Propriedades de um `IfcPropertySet` por nome (o último valor de nome repetido vence). */
function valuesOf(f: IfcFile, pset: StepEntity): Map<string, string> {
  const out = new Map<string, string>();
  for (const prop of f.list(pset, 4)) {
    if (prop.type !== 'IFCPROPERTYSINGLEVALUE') continue;
    const name = f.text(prop, 0).trim();
    const value = plainText(prop.args[2]);
    if (name && value != null) out.set(name, value);
  }
  return out;
}

/** JSON do pset: objeto esperado; texto ilegível devolve `null` (cai no caminho heurístico). */
function parseJson<T>(text: string | undefined): T | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' ? (value as T) : null;
  } catch {
    return null;
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Inteiro de propriedade (`IFCINTEGER`, `IFCREAL` ou texto numérico). */
function intValue(text: string | undefined): number | null {
  if (text == null) return null;
  const value = Number(text.trim());
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

const isRecord = (r: HestiaElementRecord | null): r is HestiaElementRecord =>
  !!r &&
  typeof r.id === 'string' &&
  r.id.length > 0 &&
  typeof r.kind === 'string' &&
  KINDS.has(r.kind) &&
  // O vão não tem nível próprio (o nível vem da parede hospedeira), então `levelId` pode faltar.
  (r.levelId === undefined || typeof r.levelId === 'string');

/** `Pset_Hestia_Project` do arquivo, com o formato lido (versão futura é ignorada de propósito). */
function projectDataOf(f: IfcFile, pset: StepEntity): HestiaProjectData {
  const values = valuesOf(f, pset);
  const version = intValue(values.get('HestiaVersion')) ?? HESTIA_VERSION;
  if (version > HESTIA_VERSION) return {};
  const data: HestiaProjectData = {};
  const schemaVersion = intValue(values.get('SchemaVersion'));
  if (schemaVersion != null && schemaVersion > 0) data.schemaVersion = schemaVersion;
  const nextOrder = intValue(values.get('NextOrder'));
  if (nextOrder != null && nextOrder > 0) data.nextOrder = nextOrder;
  const settings = parseJson<Project['settings']>(values.get('SettingsJSON'));
  if (settings) data.settings = settings;
  const types = parseJson<ProjectTypes>(values.get('TypesJSON'));
  if (types) data.types = types;
  const materials = parseJson<Project['materials']>(values.get('MaterialsJSON'));
  if (materials) data.materials = materials;
  const levels = parseJson<Level[]>(values.get('LevelsJSON'));
  if (Array.isArray(levels) && levels.length > 0 && levels.every((l) => typeof l?.id === 'string' && finite(l.elevation))) {
    data.levels = levels;
  }
  const defaults = parseJson<Project['defaults']>(values.get('DefaultsJSON'));
  if (defaults) data.defaults = defaults;
  const views = parseJson<Project['views']>(values.get('ViewsJSON'));
  if (Array.isArray(views)) data.views = views;
  const sheets = parseJson<Project['sheets']>(values.get('SheetsJSON'));
  if (Array.isArray(sheets)) data.sheets = sheets;
  const grids = parseJson<Project['grids']>(values.get('GridsJSON'));
  if (Array.isArray(grids)) data.grids = grids;
  const graphics = parseJson<Project['graphics']>(values.get('GraphicsJSON'));
  if (graphics) data.graphics = graphics;
  const view3d = parseJson<Project['view3d']>(values.get('View3DJSON'));
  if (view3d) data.view3d = view3d;
  const sectionGraphics = parseJson<Project['sectionGraphics']>(values.get('SectionGraphicsJSON'));
  if (sectionGraphics) data.sectionGraphics = sectionGraphics;
  return data;
}

/** Lê os psets privados do arquivo uma vez (nenhum custo quando o arquivo não é do Hestia). */
export function readHestia(f: IfcFile): HestiaFileData {
  const out: HestiaFileData = { project: null, elements: [] };
  for (const rel of f.byType('IFCRELDEFINESBYPROPERTIES')) {
    const def = f.ent(rel, 5);
    if (!def || def.type !== 'IFCPROPERTYSET') continue;
    const name = f.text(def, 2).trim();
    if (name === HESTIA_PROJECT_PSET) {
      out.project ??= projectDataOf(f, def);
      continue;
    }
    if (name !== HESTIA_ELEMENT_PSET) continue;
    const record = parseJson<HestiaElementRecord>(valuesOf(f, def).get('HestiaJSON'));
    if (!isRecord(record)) continue;
    for (const obj of f.list(rel, 4)) out.elements.push({ entity: obj.id, record });
  }
  return out;
}

/** Aplica o esqueleto do projeto (tipos, materiais, padrões, ajustes) antes de reconstruir os elementos. */
export function applyHestiaProject(p: Project, data: HestiaProjectData | null): void {
  if (!data) return;
  if (data.schemaVersion != null) p.schemaVersion = data.schemaVersion;
  if (data.settings) p.settings = data.settings;
  if (data.materials) p.materials = data.materials;
  if (data.defaults) p.defaults = data.defaults;
  if (data.types) {
    const target = p as unknown as Record<string, unknown>;
    for (const [key, map] of Object.entries(data.types)) if (map && typeof map === 'object') target[key] = map;
  }
  if (data.views) p.views = data.views;
  if (data.sheets) p.sheets = data.sheets;
  if (data.grids) p.grids = data.grids;
  if (data.graphics) p.graphics = data.graphics;
  if (data.view3d) p.view3d = data.view3d;
  if (data.sectionGraphics) p.sectionGraphics = data.sectionGraphics;
}

/**
 * Níveis do `LevelsJSON` no lugar dos níveis deduzidos do IFC, mantendo o vínculo pavimento → nível pela cota mais
 * próxima (o caminho heurístico continua usando `LevelRef` para os elementos que não têm pset).
 */
export function applyHestiaLevels(p: Project, levels: Level[] | undefined, refs: LevelRef[]): LevelRef[] {
  if (!levels || levels.length === 0) return refs;
  p.levels = levels;
  return refs.map((ref) => {
    let best = p.levels[0]!;
    for (const level of p.levels) if (Math.abs(level.elevation - ref.elevation) < Math.abs(best.elevation - ref.elevation)) best = level;
    return { id: best.id, elevation: ref.elevation, storey: ref.storey };
  });
}

/** `ifcProperties` sem os conjuntos privados do Hestia (eles voltam pelo registro, não como propriedade do usuário). */
export const withoutHestiaProperties = (props: readonly IfcProperty[]): IfcProperty[] =>
  props.filter((prop) => !isHestiaPset(prop.pset));

const vec2 = (v: unknown): boolean => {
  const point = v as { x?: unknown; y?: unknown } | null;
  return !!point && finite(point.x) && finite(point.y);
};

/** Checagem mínima do registro (JSON de terceiros não deve derrubar a importação nem criar elemento inválido). */
function plausible(record: HestiaElementRecord): boolean {
  const hasType = typeof record.typeId === 'string';
  switch (record.kind) {
    case 'wall':
      return hasType && vec2(record.a) && vec2(record.b);
    case 'door':
    case 'window':
      return hasType && typeof record.hostId === 'string' && finite(record.offset);
    case 'floor':
    case 'slab':
    case 'ceiling':
    case 'roof':
      return hasType && Array.isArray(record.boundary) && record.boundary.length >= 3;
    case 'stair':
      return hasType && Array.isArray(record.components);
    case 'room':
      return typeof record.name === 'string' && vec2(record.point);
    default:
      return true;
  }
}

/** Filhos de um produto por `IfcRelAggregates` (águas do telhado, lances da escada): já vêm no registro do pai. */
const aggregateCache = new WeakMap<IfcFile, Map<number, number[]>>();

function aggregateIndex(f: IfcFile): Map<number, number[]> {
  const hit = aggregateCache.get(f);
  if (hit) return hit;
  const index = new Map<number, number[]>();
  for (const rel of f.byType('IFCRELAGGREGATES')) {
    const parent = f.ref(rel, 4);
    if (parent == null) continue;
    const children = index.get(parent) ?? [];
    for (const child of f.list(rel, 5)) children.push(child.id);
    index.set(parent, children);
  }
  aggregateCache.set(f, index);
  return index;
}

/** Genérico: o registro manda (id, nome, nível, ordem); a malha e o contorno vêm da geometria do IFC. */
function genericOf(t: HestiaTarget, entity: number, record: HestiaElementRecord): Generic {
  const e = t.f.entity(entity);
  const levelId = typeof record.levelId === 'string' ? record.levelId : (t.p.levels[0]?.id ?? 'lv_0');
  const base = e ? makeGeneric({ f: t.f, p: t.p, typeOf: t.typeOf }, e, bodyOf(t.f, e), levelId) : null;
  if (base?.ifcProperties) base.ifcProperties = withoutHestiaProperties(base.ifcProperties);
  const el: Generic = {
    ...(base ?? { id: record.id, levelId, name: record.id, sourceClass: 'IFCBUILDINGELEMENTPROXY' }),
    ...(record as Partial<Generic>),
    kind: 'generic',
    levelId,
    mesh: base?.mesh ?? { positions: [], indices: [] },
    order: finite(record.order) ? record.order : 0,
  };
  if (base?.outline) el.outline = base.outline;
  return el;
}

/** Elemento nativo do registro; `null` quando o JSON não tem a forma esperada (a heurística assume). */
function elementOf(t: HestiaTarget, entity: number, record: HestiaElementRecord): Element | null {
  if (record.kind === 'generic') return genericOf(t, entity, record);
  if (!plausible(record)) {
    t.warn(tr(t.lang ?? 'pt', 'io_ifc_warn_record_incomplete', { id: record.id, kind: record.kind }));
    return null;
  }
  return record as unknown as Element;
}

/** `order` de um registro: o vão (`Opening`) não tem ordem de criação. */
const orderOf = (el: Element): number | null => {
  const order = (el as { order?: unknown }).order;
  return typeof order === 'number' && Number.isFinite(order) ? order : null;
};

/**
 * Reconstrói os elementos com pset privado no projeto, marca as entidades como tratadas (o resto do arquivo não as
 * reprocessa) e devolve a maior `order` restaurada, para os objetos heurísticos entrarem depois.
 */
export function applyHestiaElements(t: HestiaTarget, items: readonly HestiaElementItem[]): number {
  const aggregates = aggregateIndex(t.f);
  let maxOrder = 0;
  let seq = 0;
  for (const item of items) {
    const el = elementOf(t, item.entity, item.record);
    if (!el) continue;
    // Pset repetido para o mesmo elemento (ou produto duplicado): vale o primeiro e a entidade não volta pela heurística.
    if (t.p.elements[el.id] !== undefined) {
      t.handled.add(item.entity);
      continue;
    }
    const order = orderOf(el);
    if (order === null) {
      if (el.kind !== 'door' && el.kind !== 'window') (el as { order: number }).order = 1_000_000 + seq++;
    } else {
      maxOrder = Math.max(maxOrder, order);
    }
    t.p.elements[el.id] = el;
    t.handled.add(item.entity);
    for (const child of aggregates.get(item.entity) ?? []) t.handled.add(child);
    if (el.kind === 'wall') t.walls.set(item.entity, el.id);
    t.count(IMPORTED_LABEL[el.kind] ?? 'objetos');
  }
  return maxOrder;
}
