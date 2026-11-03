/**
 * Extensão Hestia no IFC: o registro nativo viaja em property sets privados e o importador o reconstrói sem heurística.
 *
 * Formato (contrato com `ifcImport/hestia.ts`):
 *
 * - `Pset_Hestia_Element`, um por produto, ligado por `IfcRelDefinesByProperties`: `HestiaId` (IfcLabel), `HestiaKind`
 *   (IfcLabel), `HestiaType` (IfcLabel, quando o elemento tem tipo) e `HestiaJSON` (IfcText com o elemento nativo
 *   inteiro, menos a geometria derivada — o `mesh`/`outline` do genérico, que já está no arquivo).
 * - `Pset_Hestia_Project`, ligado ao `IfcProject`: `HestiaVersion` (1), `SchemaVersion`, `NextOrder`, `SettingsJSON`,
 *   `TypesJSON` (mapas de tipo do projeto), `MaterialsJSON`, `LevelsJSON`, `DefaultsJSON` e os dados que não têm
 *   entidade IFC (`ViewsJSON`, `SheetsJSON`, `GridsJSON`, `GraphicsJSON`, `View3DJSON`, `SectionGraphicsJSON`).
 *
 * O GlobalId do pset e o da relação são derivados do id do elemento (`hestia:<id>` / `hestiarel:<id>`), então o
 * arquivo continua determinístico.
 */

import type { Element, Id, Project } from '@hestia/model';
import { gid, type IfcCtx } from './ifcCtx.ts';
import { ifcGuid } from './ifcGuid.ts';
import { int, list, OMIT, ref, stepString } from './ifcStep.ts';

/** Property set de cada elemento nativo: `HestiaId`, `HestiaKind`, `HestiaType`, `HestiaJSON`. */
export const HESTIA_ELEMENT_PSET = 'Pset_Hestia_Element';
/** Property set do projeto: `HestiaVersion`, `SchemaVersion`, `SettingsJSON`… */
export const HESTIA_PROJECT_PSET = 'Pset_Hestia_Project';
/** Versão do formato dos psets privados (formato desconhecido volta para a importação heurística). */
export const HESTIA_VERSION = 1;

/** Campos que o `HestiaJSON` de um elemento precisa carregar para reconstruí-lo sem heurística. */
export interface HestiaElementRecord {
  id: string;
  kind: string;
  /** Nível do elemento; ausente no vão (porta/janela), que herda o nível da parede hospedeira por `hostId`. */
  levelId: string;
  typeId?: string;
  hostId?: string;
  /** Demais campos do elemento nativo (offset, baseOffset, height, flipped, joins, layers são do tipo, etc.). */
  [campo: string]: unknown;
}

/** Pset privado do Hestia (`Pset_Hestia`, `Pset_Hestia_Element`, `Pset_Hestia_Project`): não volta como `ifcProperties`. */
export const isHestiaPset = (pset: string | undefined): boolean => !!pset && pset.startsWith('Pset_Hestia');

/** Registro do elemento para o `HestiaJSON`: o elemento inteiro, sem a geometria que o IFC já carrega. */
export function hestiaRecordOf(el: Element): HestiaElementRecord {
  const record: Record<string, unknown> = { ...el };
  if (record.kind === 'generic') {
    delete record.mesh;
    delete record.outline;
  }
  return record as unknown as HestiaElementRecord;
}

/** Prefixos de GlobalId do produto de cada tipo de elemento (`gid('<prefixo>:<id>')` no exportador). */
const PRODUCT_PREFIXES: Record<Element['kind'], readonly string[]> = {
  wall: ['wall'],
  door: ['door'],
  window: ['window'],
  floor: ['floor'],
  slab: ['slab'],
  ceiling: ['ceiling', 'ceil'],
  roof: ['roof'],
  stair: ['stair'],
  ramp: ['ramp'],
  room: ['space', 'room', 'ifcspace'],
  generic: ['generic'],
  // O componente de marcenaria sai como `IfcFurniture` (ficha de exportação IFC dos componentes); o prefixo reserva o GlobalId.
  component: ['component'],
  // O CAD importado não vira produto IFC (é desenho de referência, como no Revit).
  cad: [],
};

/** Destino de entidades: o `StepWriter` na exportação normal e o injetor de texto do `withHestiaPsets`. */
interface HestiaSink {
  add(type: string, args: readonly string[]): number;
}

/** Ids de entidade STEP por GlobalId (o primeiro atributo de texto de cada linha). */
function globalIds(lines: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  const line = /^#(\d+)=[A-Z0-9_]+\('([^']*)'/;
  for (const text of lines) {
    const m = line.exec(text);
    if (m && !out.has(m[2]!)) out.set(m[2]!, Number(m[1]));
  }
  return out;
}

/**
 * Id STEP do produto de cada elemento pelo GlobalId determinístico do exportador (`wall:<id>`, `door:<id>`…). O id STEP
 * do produto só existe depois de a entidade ser escrita, por isso a busca é feita no buffer do `StepWriter`.
 */
function productsFrom(p: Project, index: Map<string, number>): Map<Id, number> {
  const out = new Map<Id, number>();
  for (const el of Object.values(p.elements)) {
    for (const prefix of PRODUCT_PREFIXES[el.kind] ?? []) {
      const hit = index.get(ifcGuid(`${prefix}:${el.id}`));
      if (hit !== undefined) {
        out.set(el.id, hit);
        break;
      }
    }
  }
  return out;
}

/** Produto de cada elemento: mapa do `IfcCtx` (ou das paredes) quando o integrador preenche, senão o GlobalId. */
function productsOfCtx(c: IfcCtx, index: Map<string, number>): Map<Id, number> {
  const out = productsFrom(c.p, index);
  for (const el of Object.values(c.p.elements)) {
    const known = c.products?.get(el.id) ?? (el.kind === 'wall' ? c.walls.get(el.id) : undefined);
    if (known !== undefined) out.set(el.id, known);
  }
  return out;
}

const label = (v: string): string => `IFCLABEL(${stepString(v)})`;
const longText = (v: string): string => `IFCTEXT(${stepString(v)})`;

/** `IfcPropertySingleValue` com valor já tipado (`IFCLABEL(...)`, `IFCTEXT(...)`, `IFCINTEGER(...)`). */
function property(sink: HestiaSink, name: string, value: string): string {
  return ref(sink.add('IFCPROPERTYSINGLEVALUE', [stepString(name), OMIT, value, OMIT]));
}

/** `Pset_Hestia_Element` do produto, ligado a ele por `IfcRelDefinesByProperties` (GlobalId `hestia:<id>`). */
function elementPset(sink: HestiaSink, el: Element, product: number): void {
  const props = [property(sink, 'HestiaId', label(el.id)), property(sink, 'HestiaKind', label(el.kind))];
  const typeId = (el as { typeId?: Id }).typeId;
  if (typeId) props.push(property(sink, 'HestiaType', label(typeId)));
  props.push(property(sink, 'HestiaJSON', longText(JSON.stringify(hestiaRecordOf(el)))));
  const pset = sink.add('IFCPROPERTYSET', [gid(`hestia:${el.id}`), OMIT, stepString(HESTIA_ELEMENT_PSET), OMIT, list(props)]);
  sink.add('IFCRELDEFINESBYPROPERTIES', [gid(`hestiarel:${el.id}`), OMIT, OMIT, OMIT, list([ref(product)]), ref(pset)]);
}

/** Mapas de tipo do projeto que voltam no `TypesJSON` (os que o projeto tiver). */
const TYPE_KEYS = ['wallTypes', 'floorTypes', 'slabTypes', 'ceilingTypes', 'roofTypes', 'stairTypes', 'openingTypes', 'gridTypes'] as const;

/** `Pset_Hestia_Project`: versão do formato, esquema e o esqueleto do projeto (sem elementos) em JSON. */
function projectPset(sink: HestiaSink, p: Project, project: number): void {
  const types: Record<string, unknown> = {};
  for (const key of TYPE_KEYS) {
    const map = p[key];
    if (map) types[key] = map;
  }
  const props = [
    property(sink, 'HestiaVersion', `IFCINTEGER(${int(HESTIA_VERSION)})`),
    property(sink, 'SchemaVersion', `IFCINTEGER(${int(p.schemaVersion)})`),
    property(sink, 'NextOrder', `IFCINTEGER(${int(p.nextOrder)})`),
    property(sink, 'SettingsJSON', longText(JSON.stringify(p.settings))),
    property(sink, 'TypesJSON', longText(JSON.stringify(types))),
    property(sink, 'MaterialsJSON', longText(JSON.stringify(p.materials))),
    property(sink, 'LevelsJSON', longText(JSON.stringify(p.levels))),
    property(sink, 'DefaultsJSON', longText(JSON.stringify(p.defaults))),
    // Dados de projeto que não têm entidade IFC: voltam pelo pset, não pela geometria.
    property(sink, 'ViewsJSON', longText(JSON.stringify(p.views))),
    property(sink, 'SheetsJSON', longText(JSON.stringify(p.sheets ?? []))),
    property(sink, 'GridsJSON', longText(JSON.stringify(p.grids ?? []))),
    property(sink, 'GraphicsJSON', longText(JSON.stringify(p.graphics ?? null))),
    property(sink, 'View3DJSON', longText(JSON.stringify(p.view3d ?? null))),
    property(sink, 'SectionGraphicsJSON', longText(JSON.stringify(p.sectionGraphics ?? null))),
  ];
  const pset = sink.add('IFCPROPERTYSET', [gid('hestia:project'), OMIT, stepString(HESTIA_PROJECT_PSET), OMIT, list(props)]);
  sink.add('IFCRELDEFINESBYPROPERTIES', [gid('hestiarel:project'), OMIT, OMIT, OMIT, list([ref(project)]), ref(pset)]);
}

/** `order` do elemento: o vão (`Opening`) não tem ordem de criação, e a falta é tratada como 0. */
const orderOf = (el: Element): number => {
  const order = (el as { order?: unknown }).order;
  return typeof order === 'number' && Number.isFinite(order) ? order : 0;
};

/** Elementos em ordem estável (ordem de criação e, no empate, id): o arquivo não depende da ordem das chaves. */
const byOrderAndId = (a: Element, b: Element): number => orderOf(a) - orderOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Escreve os psets de todos os elementos com produto e o do projeto (quando há produto do projeto). */
function writeHestia(sink: HestiaSink, p: Project, products: ReadonlyMap<Id, number>, project?: number): void {
  for (const el of Object.values(p.elements).sort(byOrderAndId)) {
    const product = products.get(el.id);
    if (product !== undefined) elementPset(sink, el, product);
  }
  if (project !== undefined) projectPset(sink, p, project);
}

/**
 * Emite `Pset_Hestia_Element` de cada elemento e `Pset_Hestia_Project` no projeto. O integrador chama no fim de
 * `exportIfc`, antes de `w.text(...)`; o `IfcCtx.products` (e `project`) são opcionais porque o GlobalId determinístico
 * dos produtos basta para achá-los.
 */
export function addHestiaPsets(c: IfcCtx, project?: number): void {
  const index = globalIds(c.w.written);
  const target = project ?? c.project ?? index.get(ifcGuid('project'));
  writeHestia(c.w, c.p, productsOfCtx(c, index), target);
}

/**
 * Anexa os psets a um IFC4 já exportado, sem tocar no escritor: é o caminho de quem exporta sem o gancho no
 * `exportIfc` (scripts e o teste de round-trip). Idempotente: arquivo que já tem `Pset_Hestia_Element` volta igual.
 */
export function withHestiaPsets(p: Project, text: string): string {
  if (text.includes(HESTIA_ELEMENT_PSET)) return text;
  const index = globalIds(text.split('\n'));
  const products = productsFrom(p, index);
  const project = index.get(ifcGuid('project'));
  if (products.size === 0 && project === undefined) return text;
  let next = 1;
  for (const id of index.values()) next = Math.max(next, id + 1);
  const lines: string[] = [];
  const sink: HestiaSink = {
    add: (type, args) => {
      const id = next++;
      lines.push(`#${id}=${type}(${args.join(',')});`);
      return id;
    },
  };
  writeHestia(sink, p, products, project);
  const end = text.lastIndexOf('ENDSEC;');
  if (lines.length === 0 || end < 0) return text;
  return `${text.slice(0, end)}${lines.join('\n')}\n${text.slice(end)}`;
}
