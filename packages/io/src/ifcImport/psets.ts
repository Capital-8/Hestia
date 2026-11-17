import type { IfcProperty } from '@hestia/model';
import type { IfcFile } from './ifc.ts';
import { listOf, numOf, type StepEntity, type StepValue } from './step.ts';

/**
 * Leitura das propriedades (psets/quantities) e da cor de um produto IFC.
 *
 * - `IfcRelDefinesByProperties` liga um elemento (ou o seu tipo) a `IfcPropertySet`/`IfcElementQuantity`.
 * - `IfcStyledItem` liga um item de representação a `IfcSurfaceStyle` → `IfcSurfaceStyleRendering` → `IfcColourRgb`.
 *
 * Tudo é lido uma vez por arquivo (índices em cache) e devolvido de forma determinística: nomes únicos, ordenados,
 * valores só string/número/booleano (nada de `undefined`, `NaN` ou vazio) e com teto de 200 por elemento.
 */

type Scalar = string | number | boolean;

/** Cor e opacidade de um estilo de superfície (`opacity` = 1 - Transparency do IFC). */
export interface IfcStyle {
  color: string;
  opacity: number;
}

/** Teto de propriedades gravadas por elemento. */
const MAX_PROPERTIES = 200;

/** Profundidade máxima ao seguir itens mapeados/booleanos na representação. */
const MAX_DEPTH = 8;

/** Entidades que viram propriedade; o resto (propriedade complexa, tabela...) fica de fora. */
const READABLE = /^IFC(PROPERTYSINGLEVALUE|PROPERTYENUMERATEDVALUE|PROPERTYLISTVALUE|QUANTITY)/;

interface PsetIndex {
  /** Definições de propriedade por id de objeto (elemento ou tipo). */
  byObject: Map<number, StepEntity[]>;
  /** Estilo (cor + opacidade) por id de item de representação. */
  styleByItem: Map<number, IfcStyle>;
}

const cache = new WeakMap<IfcFile, PsetIndex>();

/** Índices do arquivo, montados na primeira consulta. */
function indexOf(f: IfcFile): PsetIndex {
  const hit = cache.get(f);
  if (hit) return hit;
  const index: PsetIndex = { byObject: new Map(), styleByItem: styleIndex(f) };
  for (const rel of f.byType('IFCRELDEFINESBYPROPERTIES')) {
    const def = f.ent(rel, 5);
    if (!def) continue;
    for (const obj of f.list(rel, 4)) {
      const list = index.byObject.get(obj.id);
      if (!list) index.byObject.set(obj.id, [def]);
      else if (!list.includes(def)) list.push(def);
    }
  }
  cache.set(f, index);
  return index;
}

/** Propriedades e quantitativos do elemento e do seu tipo, ordenados por nome. */
export function propertiesOf(f: IfcFile, product: StepEntity, type?: StepEntity): IfcProperty[] {
  const index = indexOf(f);
  const defs = [...(index.byObject.get(product.id) ?? [])];
  if (type) defs.push(...(index.byObject.get(type.id) ?? []));
  const byName = new Map<string, { value: Scalar; pset: string }>();
  for (const def of defs) readDefinition(f, def, byName);
  return [...byName.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, MAX_PROPERTIES)
    .map(([name, entry]) => ({ name, value: entry.value, pset: entry.pset }));
}

/**
 * Valor de uma propriedade de um conjunto ligado ao próprio tipo (`HasPropertySets` do `IfcTypeObject`, que não passa
 * por `IfcRelDefinesByProperties`). `undefined` quando o tipo não traz o conjunto ou a propriedade, ou ela é vazia.
 */
export function typePropertyOf(f: IfcFile, type: StepEntity, pset: string, name: string): Scalar | undefined {
  for (const def of f.list(type, 5)) {
    if (def.type !== 'IFCPROPERTYSET' || f.text(def, 2).trim() !== pset) continue;
    for (const prop of f.list(def, 4)) {
      if (READABLE.test(prop.type) && f.text(prop, 0).trim() === name) return scalar(prop.args[2]) ?? undefined;
    }
  }
  return undefined;
}

/**
 * Definições de propriedade ligadas ao elemento (`IfcRelDefinesByProperties`) e ao tipo (relações e `HasPropertySets`),
 * sem repetição e na ordem em que aparecem: o elemento vem antes do tipo.
 */
export function propertyDefsOf(f: IfcFile, product: StepEntity, type?: StepEntity): StepEntity[] {
  const index = indexOf(f);
  const defs = [...(index.byObject.get(product.id) ?? [])];
  if (type) {
    defs.push(...(index.byObject.get(type.id) ?? []));
    defs.push(...f.list(type, 5));
  }
  return [...new Set(defs)];
}

/**
 * Valor de uma propriedade de um conjunto escolhido pelo nome (`Pset_WindowCommon`...), no elemento ou no tipo. Ao
 * contrário de `propertiesOf`, não se perde quando outro conjunto traz o mesmo nome. `undefined` se ausente ou vazia.
 */
export function psetValueOf(f: IfcFile, product: StepEntity, type: StepEntity | undefined, pset: string, name: string): Scalar | undefined {
  for (const def of propertyDefsOf(f, product, type)) {
    if (def.type !== 'IFCPROPERTYSET' || f.text(def, 2).trim() !== pset) continue;
    for (const prop of f.list(def, 4)) {
      if (!READABLE.test(prop.type) || f.text(prop, 0).trim() !== name) continue;
      const value = scalar(prop.args[2]);
      if (value != null) return value;
    }
  }
  return undefined;
}

function readDefinition(f: IfcFile, def: StepEntity, out: Map<string, { value: Scalar; pset: string }>): void {
  const pset = f.text(def, 2).trim() || 'Pset';
  if (def.type === 'IFCPROPERTYSET') {
    for (const prop of f.list(def, 4)) addValue(f, prop, 2, out, pset);
    return;
  }
  if (def.type === 'IFCELEMENTQUANTITY') {
    for (const quantity of f.list(def, 5)) addValue(f, quantity, 3, out, pset);
  }
}

/** Nome + valor de uma propriedade/quantidade; vazio, repetido ou ilegível fica de fora. */
function addValue(f: IfcFile, e: StepEntity, valueIndex: number, out: Map<string, { value: Scalar; pset: string }>, pset: string): void {
  if (!READABLE.test(e.type)) return;
  const name = f.text(e, 0).trim();
  if (!name || out.has(name)) return;
  const value = scalar(e.args[valueIndex]);
  if (value != null) out.set(name, { value, pset });
}

/** Converte um `StepValue` para o valor gravado no modelo (ou `null` quando vazio/ilegível). */
function scalar(v: StepValue | undefined): Scalar | null {
  if (!v) return null;
  switch (v.k) {
    case 'num':
      return Number.isFinite(v.v) ? v.v : null;
    case 'str': {
      const text = v.v.trim();
      return text ? text : null;
    }
    case 'enum': {
      const bool = boolOf(v.v);
      return bool ?? (v.v.trim() || null);
    }
    case 'type':
      return typed(v.name, v.arg);
    case 'list':
      return joined(v.items);
    default:
      return null;
  }
}

const boolOf = (name: string): boolean | null => {
  const upper = name.toUpperCase();
  if (upper === 'T' || upper === 'TRUE') return true;
  if (upper === 'F' || upper === 'FALSE') return false;
  return null;
};

/** Valor tipado (`IFCBOOLEAN(.T.)`, `IFCLENGTHMEASURE(2.7)`, `IFCLABEL('x')`...). */
function typed(name: string, arg: StepValue): Scalar | null {
  if (name === 'IFCBOOLEAN' || name === 'IFCLOGICAL') {
    const bool = arg.k === 'enum' ? boolOf(arg.v) : null;
    return bool ?? scalar(arg);
  }
  if (/^IFC(INTEGER|REAL|NUMBER)$/.test(name) || /(MEASURE|RATIO)$/.test(name)) {
    const value = numOf(arg);
    return value != null && Number.isFinite(value) ? value : null;
  }
  return scalar(arg);
}

/** Lista/enumerado: um valor só mantém o tipo; vários viram texto separado por vírgula. */
function joined(items: StepValue[]): Scalar | null {
  const values = items.map(scalar).filter((x): x is Scalar => x != null);
  if (!values.length) return null;
  if (values.length === 1) return values[0]!;
  return values.map(String).join(', ');
}

/** Cor do elemento; sem estilo próprio, tenta a do tipo (a do item vence). */
/** Estilo do elemento; sem estilo próprio, tenta a do tipo (a do item vence). */
export function styleOf(f: IfcFile, product: StepEntity, type?: StepEntity): IfcStyle | undefined {
  const own = styleOfProduct(f, product);
  if (own) return own;
  return type ? styleOfProduct(f, type) : undefined;
}

/** Cor do elemento (sem opacidade), para compatibilidade com quem só precisa do `#rrggbb`. */
export function colorOf(f: IfcFile, product: StepEntity, type?: StepEntity): string | undefined {
  return styleOf(f, product, type)?.color;
}

function styleOfProduct(f: IfcFile, product: StepEntity): IfcStyle | undefined {
  const index = indexOf(f);
  for (const id of shapeItems(f, product)) {
    const style = index.styleByItem.get(id);
    if (style) return style;
  }
  return undefined;
}

/** Ids dos itens de representação do produto, seguindo itens mapeados e o primeiro operando booleano. */
function shapeItems(f: IfcFile, product: StepEntity): number[] {
  const ids: number[] = [];
  const visit = (item: StepEntity, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    ids.push(item.id);
    if (item.type === 'IFCMAPPEDITEM') {
      const rep = f.ent(f.ent(item, 0), 1);
      for (const sub of f.list(rep, 3)) visit(sub, depth + 1);
    } else if (item.type === 'IFCBOOLEANRESULT' || item.type === 'IFCBOOLEANCLIPPINGRESULT') {
      const first = f.ent(item, 1);
      if (first) visit(first, depth + 1);
    }
  };
  for (const rep of f.list(f.ent(product, 6), 2)) {
    for (const item of f.list(rep, 3)) visit(item, 0);
  }
  return ids;
}

/** `IfcStyledItem` → estilo do item, aceitando `IfcPresentationStyleAssignment` (IFC2X3) e `IfcSurfaceStyle` direto. */
function styleIndex(f: IfcFile): Map<number, IfcStyle> {
  const out = new Map<number, IfcStyle>();
  for (const styled of f.byType('IFCSTYLEDITEM')) {
    const item = f.ref(styled, 0);
    if (item == null || out.has(item)) continue;
    const style = styleOfStyles(f, listOf(styled.args[1]));
    if (style) out.set(item, style);
  }
  return out;
}

function styleOfStyles(f: IfcFile, styles: StepValue[]): IfcStyle | undefined {
  for (const value of styles) {
    const style = f.deref(value);
    if (!style) continue;
    if (style.type === 'IFCPRESENTATIONSTYLEASSIGNMENT') {
      const nested = styleOfStyles(f, listOf(style.args[0]));
      if (nested) return nested;
      continue;
    }
    if (style.type !== 'IFCSURFACESTYLE') continue;
    for (const surface of f.list(style, 2)) {
      const result = styleOfSurface(f, surface);
      if (result) return result;
    }
  }
  return undefined;
}

function styleOfSurface(f: IfcFile, style: StepEntity): IfcStyle | undefined {
  if (style.type !== 'IFCSURFACESTYLERENDERING' && style.type !== 'IFCSURFACESTYLESHADING') return undefined;
  const rgb = f.ent(style, 0);
  if (!rgb || rgb.type !== 'IFCCOLOURRGB') return undefined;
  const channel = (v: number | null): string =>
    Math.max(0, Math.min(255, Math.round((v ?? 0) * 255)))
      .toString(16)
      .padStart(2, '0');
  const transparency = style.type === 'IFCSURFACESTYLERENDERING' ? (f.num(style, 1) ?? 0) : 0;
  return {
    color: `#${channel(f.num(rgb, 1))}${channel(f.num(rgb, 2))}${channel(f.num(rgb, 3))}`,
    opacity: Math.max(0, Math.min(1, 1 - transparency)),
  };
}
