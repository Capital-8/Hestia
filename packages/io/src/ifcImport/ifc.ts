import type { Project } from '@hestia/model';
import type { Lang } from '../i18n.ts';
import {
  enumOf,
  listOf,
  numOf,
  parseStep,
  refId,
  siPrefix,
  textOf,
  type StepEntity,
  type StepFile,
  type StepValue,
} from './step.ts';

/** Ponto 3D simples: o pacote `io` não pode importar `geom`, então a matemática do importador mora aqui. */
export interface Pt3 {
  x: number;
  y: number;
  z: number;
}

export interface Pt2 {
  x: number;
  y: number;
}

export const pt3 = (x: number, y: number, z: number): Pt3 => ({ x, y, z });
export const sub3 = (a: Pt3, b: Pt3): Pt3 => pt3(a.x - b.x, a.y - b.y, a.z - b.z);
export const add3 = (a: Pt3, b: Pt3): Pt3 => pt3(a.x + b.x, a.y + b.y, a.z + b.z);
export const mul3 = (a: Pt3, k: number): Pt3 => pt3(a.x * k, a.y * k, a.z * k);
export const dot3 = (a: Pt3, b: Pt3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: Pt3, b: Pt3): Pt3 => pt3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len3 = (a: Pt3): number => Math.hypot(a.x, a.y, a.z);
export function unit3(a: Pt3, fallback: Pt3 = pt3(1, 0, 0)): Pt3 {
  const l = len3(a);
  return l < 1e-12 ? fallback : mul3(a, 1 / l);
}

/** Transformação rígida: origem e três eixos unitários. */
export interface Mat {
  o: Pt3;
  x: Pt3;
  y: Pt3;
  z: Pt3;
}

export const IDENTITY: Mat = { o: pt3(0, 0, 0), x: pt3(1, 0, 0), y: pt3(0, 1, 0), z: pt3(0, 0, 1) };

export function applyMat(m: Mat, p: Pt3): Pt3 {
  return pt3(
    m.o.x + m.x.x * p.x + m.y.x * p.y + m.z.x * p.z,
    m.o.y + m.x.y * p.x + m.y.y * p.y + m.z.y * p.z,
    m.o.z + m.x.z * p.x + m.y.z * p.y + m.z.z * p.z,
  );
}

/** `a` depois de `b` (o resultado aplica primeiro `b`, depois `a`). */
export function composeMat(a: Mat, b: Mat): Mat {
  const rot = (v: Pt3): Pt3 =>
    pt3(
      a.x.x * v.x + a.y.x * v.y + a.z.x * v.z,
      a.x.y * v.x + a.y.y * v.y + a.z.y * v.z,
      a.x.z * v.x + a.y.z * v.y + a.z.z * v.z,
    );
  return { o: applyMat(a, b.o), x: rot(b.x), y: rot(b.y), z: rot(b.z) };
}

/** Unidades do arquivo, já convertidas para metro/grau (o modelo do Hestia). */
export interface Units {
  length: number;
  area: number;
  volume: number;
  /** Radianos por unidade de ângulo do arquivo. */
  angle: number;
}

const SI = 1;

/** Fachada do arquivo: resolve referências e dá tipagem curta aos parâmetros. */
export class IfcFile {
  readonly step: StepFile;
  readonly units: Units;

  constructor(
    readonly source: string,
    onParseProgress?: (done: number, total: number) => void,
    lang: Lang = 'pt',
  ) {
    this.step = parseStep(source, onParseProgress, lang);
    this.units = readUnits(this);
  }

  get schema(): string {
    return this.step.schema;
  }

  get broken(): number {
    return this.step.broken;
  }

  entity(id: number | null | undefined): StepEntity | undefined {
    return id == null ? undefined : this.step.entities.get(id);
  }

  deref(v: StepValue | undefined): StepEntity | undefined {
    return this.entity(refId(v));
  }

  arg(e: StepEntity | undefined, i: number): StepValue | undefined {
    return e?.args[i];
  }

  ref(e: StepEntity | undefined, i: number): number | null {
    return refId(e?.args[i]);
  }

  ent(e: StepEntity | undefined, i: number): StepEntity | undefined {
    return this.deref(e?.args[i]);
  }

  text(e: StepEntity | undefined, i: number): string {
    return textOf(e?.args[i]);
  }

  enum(e: StepEntity | undefined, i: number): string {
    return enumOf(e?.args[i]);
  }

  num(e: StepEntity | undefined, i: number): number | null {
    return numOf(e?.args[i]);
  }

  list(e: StepEntity | undefined, i: number): StepEntity[] {
    return listOf(e?.args[i])
      .map((v) => this.deref(v))
      .filter((x): x is StepEntity => !!x);
  }

  byType(name: string): StepEntity[] {
    return this.step.types.get(name) ?? [];
  }

  /** Entidades cujo tipo começa pelo prefixo (ex.: `IFCWALL` pega as três variantes), na ordem do arquivo. */
  byPrefix(prefix: string): StepEntity[] {
    const out: StepEntity[] = [];
    for (const [type, list] of this.step.types) if (type.startsWith(prefix)) out.push(...list);
    return out.length > 1 ? out.sort((a, b) => a.id - b.id) : out;
  }

  point(v: StepValue | undefined): Pt3 | null {
    const e = this.deref(v);
    if (!e) return null;
    if (e.type === 'IFCCARTESIANPOINT') {
      const nums = listOf(e.args[0]).map((x) => numOf(x) ?? 0);
      return pt3((nums[0] ?? 0) * this.units.length, (nums[1] ?? 0) * this.units.length, (nums[2] ?? 0) * this.units.length);
    }
    return null;
  }

  direction(v: StepValue | undefined, fallback: Pt3): Pt3 {
    const e = this.deref(v);
    if (!e || e.type !== 'IFCDIRECTION') return fallback;
    const nums = listOf(e.args[0]).map((x) => numOf(x) ?? 0);
    return unit3(pt3(nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0), fallback);
  }

  /** Matriz de um `IfcAxis2Placement3D`/`2D` (já em metros). */
  axisPlacement(v: StepValue | undefined): Mat {
    const e = this.deref(v);
    if (!e) return IDENTITY;
    if (e.type === 'IFCAXIS2PLACEMENT2D') {
      const o = this.point(e.args[0]) ?? pt3(0, 0, 0);
      const dx = this.direction(e.args[1], pt3(1, 0, 0));
      const x = unit3(pt3(dx.x, dx.y, 0));
      return { o, x, y: pt3(-x.y, x.x, 0), z: pt3(0, 0, 1) };
    }
    const o = this.point(e.args[0]) ?? pt3(0, 0, 0);
    const z = this.direction(e.args[1], pt3(0, 0, 1));
    let x = this.direction(e.args[2], pt3(1, 0, 0));
    if (Math.abs(dot3(x, z)) > 0.999) x = pt3(0, 1, 0);
    const y = unit3(cross3(z, x));
    return { o, x: unit3(cross3(y, z)), y, z };
  }

  /** Matriz de mundo de um `IfcObjectPlacement` (LocalPlacement encadeado). */
  placement(v: StepValue | undefined): Mat {
    const e = this.deref(v);
    if (!e) return IDENTITY;
    if (e.type === 'IFCLOCALPLACEMENT') {
      const parent = this.placement(e.args[0]);
      const rel = this.axisPlacement(e.args[1]);
      return composeMat(parent, rel);
    }
    // IfcGridPlacement e outros: sem suporte na v1; a origem do produto basta.
    return IDENTITY;
  }

  /** Placement de um produto (atributo 5). */
  productPlacement(product: StepEntity): Mat {
    return this.placement(product.args[5]);
  }
}

/** Fator de uma unidade SI ou de conversão, na unidade base (metro, radiano...). */
function unitFactor(f: IfcFile, e: StepEntity | undefined): number {
  if (!e) return 1;
  if (e.type === 'IFCSIUNIT') {
    const prefix = f.enum(e, 2);
    return prefix ? siPrefix(prefix) : SI;
  }
  if (e.type === 'IFCCONVERSIONBASEDUNIT') {
    const measure = f.ent(e, 3);
    if (!measure) return 1;
    const value = f.num(measure, 0) ?? 1;
    return value * unitFactor(f, f.ent(measure, 1));
  }
  return 1;
}

function readUnits(f: IfcFile): Units {
  const units: Units = { length: 1, area: 1, volume: 1, angle: Math.PI / 180 };
  const project = f.byType('IFCPROJECT')[0];
  const assignment = f.ent(project, 8);
  let length = 0;
  let area = 0;
  let volume = 0;
  let angle = 0;
  for (const unit of f.list(assignment, 0)) {
    const kind = unit.type === 'IFCSIUNIT' ? f.enum(unit, 1) : f.enum(unit, 1);
    if (kind === 'LENGTHUNIT') length = unitFactor(f, unit);
    else if (kind === 'AREAUNIT') area = unitFactor(f, unit);
    else if (kind === 'VOLUMEUNIT') volume = unitFactor(f, unit);
    else if (kind === 'PLANEANGLEUNIT') angle = unitFactor(f, unit);
  }
  units.length = length || 1;
  units.area = area || units.length * units.length;
  units.volume = volume || units.length ** 3;
  units.angle = angle || Math.PI / 180;
  return units;
}

/** Nome do projeto, com o fallback do arquivo. */
export function projectName(f: IfcFile, base: Project): string {
  const project = f.byType('IFCPROJECT')[0];
  const name = f.text(project, 2).trim();
  return name || base.name;
}
