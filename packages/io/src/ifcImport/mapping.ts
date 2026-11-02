import {
  createEmptyProject,
  makeCeiling,
  makeFloor,
  makeRoom,
  makeSlab,
  makeWall,
  type Id,
  type IfcProperty,
  type Opening,
  type Project,
} from '@hestia/model';
import { bodyPoints, cleanLoop, interiorPoint, prismFromMesh, rectangleAxis, segment, type Body, type Prism } from './geometry.ts';
import { minZOf } from './genericElement.ts';
import { addGenericObjects, bodyFor, countUnhandledProducts, isSpatialOrVoid, toGeneric } from './genericImport.ts';
import { applyHestiaElements, applyHestiaLevels, applyHestiaProject, readHestia, withoutHestiaProperties } from './hestia.ts';
import { materialIdOfStyle, openingType, operationOf, slabLikeType, styleOfWithMaterial, wallType } from './elementTypes.ts';
import { IfcFile, projectName, type Pt2 } from './ifc.ts';
import { readLevels, type LevelRef } from './levels.ts';
import { propertiesOf } from './psets.ts';
import { readRelations } from './relations.ts';
import type { StepEntity } from './step.ts';

/** O que a importação trouxe. Sempre preenchido, mesmo quando o arquivo é ruim. */
export interface ImportReport {
  schema: string;
  /** Entidades STEP que o tokenizador não conseguiu ler. */
  broken: number;
  levels: number;
  imported: Record<string, number>;
  /** Objetos de uma classe IFC que a v1 não representa (contagem por classe). */
  skipped: Record<string, number>;
  /** Formas aproximadas (hull de malha, por exemplo) por categoria. */
  approximate: Record<string, number>;
  /** Geometria que o leitor não representou (corte booleano, extrusão inclinada...), por motivo. */
  geometry: Record<string, number>;
  /** Objetos importados como elemento genérico, por classe IFC. */
  generic: Record<string, number>;
  warnings: string[];
}

export interface ImportResult {
  project: Project;
  report: ImportReport;
}

export interface Ctx {
  f: IfcFile;
  p: Project;
  report: ImportReport;
  levels: LevelRef[];
  typeOf: Map<number, StepEntity>;
  hostOf: Map<number, number>;
  fillerOf: Map<number, number>;
  /** Vão (`IfcOpeningElement`) por preenchimento (porta/janela): o inverso de `fillerOf`, pronto para consulta. */
  openingOf: Map<number, number>;
  walls: Map<number, Id>;
  types: Map<string, Id>;
  approximate: Record<string, number>;
  /** Assinaturas de piso/laje/forro já importados (evita duplicata sobreposta do mesmo arquivo). */
  slabs: Set<string>;
  /** Entidades IFC que já viraram elemento nativo (ou genérico): o resto com geometria vira genérico. */
  handled: Set<number>;
  /** Corpo já lido por produto (evita reprocessar a geometria na inferência de níveis e no mapeamento). */
  bodies: Map<number, Body>;
  order: number;
  warn(msg: string): void;
  skip(ifcClass: string): void;
  count(kind: string): void;
}

const emptyReport = (f: IfcFile): ImportReport => ({
  schema: f.schema,
  broken: f.broken,
  levels: 0,
  imported: {},
  skipped: {},
  approximate: {},
  geometry: {},
  generic: {},
  warnings: [],
});

const guid = (f: IfcFile, e: StepEntity | undefined): string => f.text(e, 0) || `#${e?.id ?? 0}`;

/** Campo opcional `ifcProperties`: só entra no elemento quando há propriedade lida (instância + tipo). */
function psetOf(ctx: Ctx, e: StepEntity): { ifcProperties?: IfcProperty[] } {
  const props = withoutHestiaProperties(propertiesOf(ctx.f, e, ctx.typeOf.get(e.id)));
  return props.length ? { ifcProperties: props } : {};
}

/** Produtos de uma família (`IFCWALL` inclui StandardCase/ElementedCase), sem os tipos/estilos. */
function products(f: IfcFile, prefix: string): StepEntity[] {
  return f
    .byPrefix(prefix)
    .filter((e) => !e.type.endsWith('TYPE') && !e.type.endsWith('STYLE'))
    .filter((e) => f.ent(e, 6)?.type === 'IFCPRODUCTDEFINITIONSHAPE');
}

/** Soma ao relatório os itens de geometria que o leitor não representou (corte, extrusão inclinada...). */
function noteGeometry(ctx: Ctx, body: Body | null): void {
  if (!body) return;
  for (const motivo of body.unsupported) ctx.report.geometry[motivo] = (ctx.report.geometry[motivo] ?? 0) + 1;
}

/** Nível mais próximo abaixo de uma cota `z` (1 cm de folga). */
function levelAt(ctx: Ctx, z: number): LevelRef {
  let best = ctx.levels[0]!;
  for (const l of ctx.levels) if (l.elevation <= z + 0.01) best = l;
  return best;
}

function addWall(ctx: Ctx, e: StepEntity, body: Body): void {
  if (ctx.handled.has(e.id)) return;
  noteGeometry(ctx, body);
  const prism = body.prisms[0] ?? null;
  if (prism) {
    const rect = rectangleAxis(prism.loops[0] ?? []);
    // Forma livre ou mais de um sólido (o nativo guardaria só o primeiro): preserva tudo no genérico.
    if (rect && body.prisms.length === 1) {
      placeWall(ctx, e, prism, rect);
      return;
    }
    if (toGeneric(ctx, e, body)) return;
  }
  // Malha sem extrusão: mantém o caminho aproximado (hull) para não perder a parede nativa.
  if (!prism && body.tris.length) {
    const approx = prismFromMesh(bodyPoints(body));
    const rect = approx ? rectangleAxis(approx.loops[0] ?? []) : null;
    if (approx && rect) {
      ctx.approximate.paredes = (ctx.approximate.paredes ?? 0) + 1;
      placeWall(ctx, e, approx, rect);
      return;
    }
  }
  if (toGeneric(ctx, e, body)) return;
  ctx.skip('parede-forma-livre');
}

function placeWall(ctx: Ctx, e: StepEntity, prism: Prism, rect: { a: Pt2; b: Pt2; thickness: number }): void {
  const f = ctx.f;
  const level = levelAt(ctx, prism.z0);
  const name = f.text(ctx.typeOf.get(e.id), 2).trim() || f.text(e, 2).trim();
  const typeId = wallType(ctx, name, rect.thickness, materialIdOfStyle(ctx, styleOfWithMaterial(ctx, f, e)));
  const height = Math.max(0.05, prism.z1 - prism.z0);
  const id = `w_${guid(f, e)}`;
  ctx.p.elements[id] = {
    ...makeWall({ id, typeId, levelId: level.id, a: rect.a, b: rect.b }),
    baseOffset: prism.z0 - level.elevation,
    height,
    order: ctx.order++,
    ...psetOf(ctx, e),
  };
  ctx.walls.set(e.id, id);
  ctx.handled.add(e.id);
  ctx.count('paredes');
}

/** Porta/janela que não coube no modelo nativo: vira objeto genérico; só fica de fora se não tiver corpo. */
function fallbackOpening(ctx: Ctx, filler: StepEntity, reason: string): void {
  if (toGeneric(ctx, filler, bodyFor(ctx, filler))) return;
  ctx.warn(reason);
  ctx.skip(filler.type);
}

function addOpening(ctx: Ctx, filler: StepEntity, kind: 'door' | 'window'): void {
  if (ctx.handled.has(filler.id)) return;
  const f = ctx.f;
  const openingId = ctx.openingOf.get(filler.id);
  if (openingId == null) return fallbackOpening(ctx, filler, 'Porta/janela sem IfcRelFillsElement e sem corpo: ficou de fora.');
  const hostIfc = ctx.hostOf.get(openingId);
  const hostId = hostIfc == null ? undefined : ctx.walls.get(hostIfc);
  if (!hostId) return fallbackOpening(ctx, filler, 'Abertura sem parede hospedeira importada e sem corpo: ficou de fora.');
  const wall = ctx.p.elements[hostId];
  if (!wall || wall.kind !== 'wall') return fallbackOpening(ctx, filler, 'Abertura sem parede hospedeira importada e sem corpo: ficou de fora.');
  const opening = f.entity(openingId);
  const body = opening ? bodyFor(ctx, opening) : null;
  noteGeometry(ctx, body);
  if (!body) return fallbackOpening(ctx, filler, 'Abertura sem geometria de vão e sem corpo: ficou de fora.');
  const prism = body.prisms[0];
  const loop = prism?.loops[0] ?? [];
  const cloud = prism ? loop.map((p) => ({ x: p.x, y: p.y, z: prism.z0 })) : bodyPoints(body);
  if (cloud.length < 3) return fallbackOpening(ctx, filler, 'Abertura sem pontos suficientes e sem corpo: ficou de fora.');
  const { dir, len } = segment([wall.a, wall.b]);
  let min = Infinity;
  let max = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of cloud) {
    const t = (p.x - wall.a.x) * dir.x + (p.y - wall.a.y) * dir.y;
    min = Math.min(min, t);
    max = Math.max(max, t);
    z0 = Math.min(z0, prism ? prism.z0 : p.z);
    z1 = Math.max(z1, prism ? prism.z1 : p.z);
  }
  const width = Math.max(0.3, max - min);
  const center = (min + max) / 2;
  const height = Math.max(0.3, z1 - z0);
  const baseZ = ctx.p.levels.find((l) => l.id === wall.levelId)?.elevation ?? 0;
  const sill = z0 - (baseZ + wall.baseOffset);
  const typeId = openingType(ctx, filler, kind, width, height, sill);
  const offset = Math.max(0, Math.min(len - width / 2, center));
  const id = `o_${guid(f, filler)}`;
  const op: Opening = {
    id,
    kind,
    typeId,
    hostId,
    offset,
    flipHand: /RIGHT/.test(operationOf(ctx.typeOf.get(filler.id))),
    flipFacing: false,
    sillOverride: null,
    mark: f.text(filler, 7),
    ...psetOf(ctx, filler),
  };
  ctx.p.elements[id] = op;
  ctx.handled.add(filler.id);
  ctx.count(kind === 'door' ? 'portas' : 'janelas');
}

function slabKind(f: IfcFile, e: StepEntity): 'floor' | 'slab' | 'ceiling' | null {
  const pre = f.enum(e, 8);
  if (e.type.startsWith('IFCCOVERING')) return pre === 'CEILING' ? 'ceiling' : null;
  if (pre === 'FLOOR') return 'floor';
  if (pre === 'CEILING') return 'ceiling';
  if (pre === 'ROOF' || pre === 'LANDING' || pre === 'BASESLAB' || pre === 'PAVEMENT') return 'slab';
  return 'floor';
}

function addSlab(ctx: Ctx, e: StepEntity): void {
  if (ctx.handled.has(e.id)) return;
  const f = ctx.f;
  const kind = slabKind(f, e);
  const body = bodyFor(ctx, e);
  noteGeometry(ctx, body);
  if (!kind) {
    if (toGeneric(ctx, e, body)) return;
    return ctx.skip(e.type);
  }
  const prism = body.prisms[0] ?? (body.tris.length ? prismFromMesh(bodyPoints(body)) : null);
  if (!prism) {
    if (toGeneric(ctx, e, body)) return;
    return ctx.skip(e.type);
  }
  if (prism.approx) ctx.approximate[kind === 'floor' ? 'pisos' : kind === 'slab' ? 'lajes' : 'forros'] = (ctx.approximate[kind === 'floor' ? 'pisos' : kind === 'slab' ? 'lajes' : 'forros'] ?? 0) + 1;
  const boundary = cleanLoop(prism.loops[0] ?? []);
  if (boundary.length < 3) {
    if (toGeneric(ctx, e, body)) return;
    return ctx.skip(e.type);
  }
  const holes = prism.loops.slice(1).map(cleanLoop).filter((l) => l.length >= 3);
  const thickness = Math.max(0.05, prism.z1 - prism.z0);
  const xs = boundary.map((p) => p.x);
  const ys = boundary.map((p) => p.y);
  const key = [
    kind,
    Math.round(prism.z1 * 100),
    Math.round(Math.min(...xs) * 100),
    Math.round(Math.min(...ys) * 100),
    Math.round(Math.max(...xs) * 100),
    Math.round(Math.max(...ys) * 100),
  ].join('|');
  if (ctx.slabs.has(key)) {
    ctx.handled.add(e.id);
    ctx.skip('duplicado');
    return;
  }
  ctx.slabs.add(key);
  const level = levelAt(ctx, prism.z1);
  const name = f.text(ctx.typeOf.get(e.id), 2).trim() || f.text(e, 2).trim();
  const typeId = slabLikeType(ctx, kind, name, thickness, materialIdOfStyle(ctx, styleOfWithMaterial(ctx, f, e)));
  const id = `${kind === 'floor' ? 'f' : kind === 'slab' ? 's' : 'c'}_${guid(f, e)}`;
  const base = { id, typeId, levelId: level.id, boundary, holes, heightOffset: prism.z1 - level.elevation, mark: f.text(e, 7), comments: '', ...psetOf(ctx, e) };
  if (kind === 'floor') ctx.p.elements[id] = { ...makeFloor(base), order: ctx.order++ };
  else if (kind === 'slab') ctx.p.elements[id] = { ...makeSlab(base), order: ctx.order++ };
  else ctx.p.elements[id] = { ...makeCeiling(base), order: ctx.order++ };
  ctx.handled.add(e.id);
  ctx.count(kind === 'floor' ? 'pisos' : kind === 'slab' ? 'lajes' : 'forros');
}

function addRoom(ctx: Ctx, e: StepEntity): void {
  if (ctx.handled.has(e.id)) return;
  const f = ctx.f;
  const body = bodyFor(ctx, e);
  noteGeometry(ctx, body);
  const prism = body.prisms[0] ?? (body.tris.length ? prismFromMesh(bodyPoints(body)) : null);
  if (!prism) {
    if (toGeneric(ctx, e, body)) return;
    return ctx.skip(e.type);
  }
  if (prism.approx) ctx.approximate.ambientes = (ctx.approximate.ambientes ?? 0) + 1;
  const loop = cleanLoop(prism.loops[0] ?? []);
  if (loop.length < 3) {
    if (toGeneric(ctx, e, body)) return;
    return ctx.skip(e.type);
  }
  const point = interiorPoint(loop);
  const level = levelAt(ctx, prism.z0);
  const id = `r_${guid(f, e)}`;
  const room = makeRoom({
    id,
    levelId: level.id,
    name: f.text(e, 2).trim() || 'Ambiente',
    number: f.text(e, 7).trim(),
    point,
    ...psetOf(ctx, e),
  });
  ctx.p.elements[id] = { ...room, order: ctx.order++ };
  ctx.handled.add(e.id);
  ctx.count('ambientes');
}

function addGrids(ctx: Ctx): void {
  const f = ctx.f;
  const grids = f.byType('IFCGRID');
  if (!grids.length) return;
  ctx.p.grids = ctx.p.grids ?? [];
  let n = 0;
  for (const grid of grids) {
    for (const list of [0, 1, 2]) {
      for (const axis of f.list(grid, list)) {
        const curve = f.ent(axis, 1);
        if (!curve) continue;
        const pts = f.list(curve, 0).map((p) => f.point(p ? { k: 'ref', id: p.id } : undefined));
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (!a || !b || (a.x === b.x && a.y === b.y)) continue;
        ctx.p.grids.push({
          id: `g_${guid(f, axis)}`,
          name: f.text(axis, 0) || `${n + 1}`,
          typeId: 'gt_6mm',
          points: [
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
          ],
          sag: 0,
          bubbleStart: true,
          bubbleEnd: true,
          order: ctx.order++,
        });
        n++;
      }
    }
  }
  if (n) ctx.count('grades');
}

/** Classes que dão a cota de piso quando o arquivo não traz `IfcBuildingStorey`. */
const LEVEL_CLASSES = /^IFC(WALL|SLAB|COVERING|ROOF|STAIR)/;

/** Cotas dos corpos de parede/laje (ou de todos os produtos, se não houver nenhum) para inferir os níveis. */
function levelCandidates(ctx: Ctx): number[] {
  const zs: number[] = [];
  for (const e of ctx.f.step.entities.values()) {
    if (!LEVEL_CLASSES.test(e.type)) continue;
    if (!ctx.f.ref(e, 5) || ctx.f.ent(e, 6)?.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    const z = minZOf(bodyFor(ctx, e));
    if (Number.isFinite(z) && z > -1000) zs.push(z);
  }
  if (zs.length) return zs;
  for (const e of ctx.f.step.entities.values()) {
    if (!ctx.f.ref(e, 5) || ctx.f.ent(e, 6)?.type !== 'IFCPRODUCTDEFINITIONSHAPE') continue;
    if (isSpatialOrVoid(e.type)) continue;
    const z = minZOf(bodyFor(ctx, e));
    if (Number.isFinite(z) && z > -1000) zs.push(z);
  }
  return zs;
}

/** Fase da importação, para a barra de progresso da interface. */
export type IfcImportStage = 'parse' | 'relations' | 'levels' | 'walls' | 'openings' | 'slabs' | 'generic' | 'finish';

/** Progresso da importação: `done` de `total` itens da fase (bytes no parsing, elementos nas demais). */
export interface IfcImportProgress {
  stage: IfcImportStage;
  done: number;
  total: number;
}

export type IfcProgressFn = (progresso: IfcImportProgress) => void;

/** Aviso interno com a fase separada (o `IfcProgressFn` recebe um objeto só). */
export type Aviso = (stage: IfcImportStage, done: number, total: number) => void;

/** Aplica uma fase a cada item, avisando o progresso item a item (a barra acompanha). */
function emLotes<T>(itens: readonly T[], stage: IfcImportStage, inicio: number, total: number, aviso: Aviso, fn: (item: T) => void): void {
  for (let i = 0; i < itens.length; i++) {
    fn(itens[i]!);
    aviso(stage, inicio + i + 1, total);
  }
}

/** Importa o texto IFC em um projeto novo (os tipos padrão do Hestia ficam como base). */
export function importIfc(text: string, base?: Project, onProgress?: IfcProgressFn): ImportResult {
  const aviso: Aviso = (stage, done, total) => onProgress?.({ stage, done, total });
  const file = new IfcFile(text, (done, total) => aviso('parse', done, total));
  const p = base ? structuredClone(base) : createEmptyProject();
  p.elements = {};
  p.views = [];
  p.sheets = [];
  p.grids = [];
  p.nextOrder = 1;
  p.levels = [];
  const report = emptyReport(file);
  const hestia = readHestia(file);
  applyHestiaProject(p, hestia.project);
  const ctx: Ctx = {
    f: file,
    p,
    report,
    levels: [],
    typeOf: new Map(),
    hostOf: new Map(),
    fillerOf: new Map(),
    openingOf: new Map(),
    walls: new Map(),
    types: new Map(),
    approximate: {},
    slabs: new Set(),
    handled: new Set(),
    bodies: new Map(),
    order: 1,
    warn: (msg) => {
      if (report.warnings.length < 200 && !report.warnings.includes(msg)) report.warnings.push(msg);
    },
    skip: (ifcClass) => {
      report.skipped[ifcClass] = (report.skipped[ifcClass] ?? 0) + 1;
    },
    count: (kind) => {
      report.imported[kind] = (report.imported[kind] ?? 0) + 1;
    },
  };
  if (file.broken) ctx.warn(`${file.broken} entidade(s) STEP ilegíveis foram ignoradas.`);
  aviso('relations', 0, 1);
  const rel = readRelations(file);
  ctx.typeOf = rel.typeOf;
  ctx.hostOf = rel.hostOf;
  ctx.fillerOf = rel.fillerOf;
  // `fillerOf` é vão → preenchimento; a abertura precisa do caminho contrário ao processar cada porta/janela.
  for (const [opening, filler] of rel.fillerOf) ctx.openingOf.set(filler, opening);
  aviso('relations', 1, 1);
  const zs = file.byType('IFCBUILDINGSTOREY').length ? [] : levelCandidates(ctx);
  ctx.levels = applyHestiaLevels(p, hestia.project?.levels, readLevels(file, p, report, zs));
  aviso('levels', 1, 1);
  // Extensão Hestia: os elementos do registro entram antes do resto do arquivo e não passam pela heurística.
  ctx.order = Math.max(ctx.order, applyHestiaElements(ctx, hestia.elements) + 1);
  const paredes = products(file, 'IFCWALL');
  emLotes(paredes, 'walls', 0, paredes.length, aviso, (e) => addWall(ctx, e, bodyFor(ctx, e)));
  const portas = products(file, 'IFCDOOR');
  const janelas = products(file, 'IFCWINDOW');
  emLotes(portas, 'openings', 0, portas.length + janelas.length, aviso, (e) => addOpening(ctx, e, 'door'));
  emLotes(janelas, 'openings', portas.length, portas.length + janelas.length, aviso, (e) => addOpening(ctx, e, 'window'));
  const lajes = [...products(file, 'IFCSLAB'), ...products(file, 'IFCCOVERING')];
  const ambientes = file.byType('IFCSPACE');
  emLotes(lajes, 'slabs', 0, lajes.length + ambientes.length, aviso, (e) => addSlab(ctx, e));
  emLotes(ambientes, 'slabs', lajes.length, lajes.length + ambientes.length, aviso, (e) => addRoom(ctx, e));
  // Com `GridsJSON`, os eixos voltam do registro do projeto; sem ele, valem os `IFCGRID` do arquivo.
  if (hestia.project?.grids === undefined) addGrids(ctx);
  addGenericObjects(file, ctx, aviso);
  countUnhandledProducts(file, report, ctx.handled);
  p.name = projectName(file, p);
  p.nextOrder = hestia.project?.nextOrder ?? ctx.order;
  aviso('finish', 1, 1);
  return { project: p, report };
}
