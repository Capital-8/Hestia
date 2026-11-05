import {
  applyMat,
  composeMat,
  IDENTITY,
  len3,
  mul3,
  pt3,
  sub3,
  unit3,
  type IfcFile,
  type Mat,
  type Pt2,
  type Pt3,
} from './ifc.ts';
import { listOf, numOf, refId, type StepEntity } from './step.ts';
import { profileLoops } from './profiles.ts';

/** Prisma vertical: anéis em planta (contorno e furos) entre duas cotas. É a forma que vira parede/piso/laje/forro. */
export interface Prism {
  loops: Pt2[][];
  z0: number;
  z1: number;
  /** Contorno aproximado (caixa/hull de uma malha): entra no relatório. */
  approx: boolean;
}

/** Resultado do corpo de um produto: prismas, malhas soltas e o eixo (representação `Axis`). */
export interface Body {
  prisms: Prism[];
  /**
   * Triângulos em coordenadas de mundo, achatados (x, y, z por vértice, 9 números por triângulo). Números planos em
   * vez de objetos `Pt3`: um IFC grande gera milhões de vértices e os objetos custavam memória e tempo de sobra.
   */
  tris: number[];
  axis: [Pt2, Pt2] | null;
  /** Itens que o leitor não entendeu (contagem para o relatório). */
  unsupported: string[];
}

const zero = (): Body => ({ prisms: [], tris: [], axis: null, unsupported: [] });

/** Converte os triângulos achatados em pontos (para o hull em planta e o fallback de prisma). */
export function bodyPoints(body: Body): Pt3[] {
  const out: Pt3[] = [];
  const t = body.tris;
  for (let i = 0; i + 2 < t.length; i += 3) out.push(pt3(t[i]!, t[i + 1]!, t[i + 2]!));
  return out;
}

/** Anexa um triângulo (já em coordenadas de mundo) à lista achatada. */
function pushTri(out: Body, a: Pt3, b: Pt3, c: Pt3): void {
  out.tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

/** Corpo de um `IfcProduct` (atributo 6), com a colocação do produto já aplicada. */
export function bodyOf(f: IfcFile, product: StepEntity): Body {
  const mat = f.productPlacement(product);
  const out = zero();
  const shape = f.ent(product, 6);
  if (!shape) return out;
  const reps = f.list(shape, 2);
  const body = reps.find((r) => f.text(r, 1).toUpperCase() === 'BODY');
  const axis = reps.find((r) => f.text(r, 1).toUpperCase() === 'AXIS');
  if (axis) readAxis(f, axis, mat, out);
  for (const rep of reps) {
    if (body && rep.id !== body.id) continue;
    if (!body && f.text(rep, 1).toUpperCase() !== 'BODY') continue;
    for (const item of f.list(rep, 3)) readItem(f, item, mat, out, 0);
  }
  return out;
}

function readAxis(f: IfcFile, rep: StepEntity, mat: Mat, out: Body): void {
  for (const item of f.list(rep, 3)) {
    if (item.type !== 'IFCPOLYLINE') continue;
    const pts = f.list(item, 0).map((p) => f.point(p ? { k: 'ref', id: p.id } : undefined));
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (!a || !b || a === b) continue;
    const wa = applyMat(mat, a);
    const wb = applyMat(mat, b);
    out.axis = [
      { x: wa.x, y: wa.y },
      { x: wb.x, y: wb.y },
    ];
    return;
  }
}

/** Percorre um item de representação: extrusão, booleano, item mapeado, B-rep, malha. */
function readItem(f: IfcFile, item: StepEntity, mat: Mat, out: Body, depth: number): void {
  if (depth > 8) return;
  switch (item.type) {
    case 'IFCEXTRUDEDAREASOLID':
      readExtrusion(f, item, mat, out);
      return;
    case 'IFCBOOLEANRESULT':
    case 'IFCBOOLEANCLIPPINGRESULT': {
      // v1: fica com o primeiro operando (o corte por plano é perdido e entra no relatório).
      out.unsupported.push('corte-booleano-ignorado');
      const first = f.ent(item, 1);
      if (first) readItem(f, first, mat, out, depth + 1);
      return;
    }
    case 'IFCMAPPEDITEM':
      readMapped(f, item, mat, out, depth);
      return;
    case 'IFCFACETEDBREP':
    case 'IFCSHELLBASEDSURFACEMODEL':
    case 'IFCFACEBASEDSURFACEMODEL': {
      readFaces(f, item, mat, out);
      return;
    }
    case 'IFCTRIANGULATEDFACESET':
    case 'IFCPOLYGONALFACESET': {
      const tris = tessellationOf(f, item);
      for (const tri of tris) pushTri(out, applyMat(mat, tri[0]!), applyMat(mat, tri[1]!), applyMat(mat, tri[2]!));
      return;
    }
    case 'IFCSWEPTDISKSOLID':
      // Tubos e vergalhões: sem papel no modelo arquitetônico da v1.
      out.unsupported.push(item.type);
      return;
    default:
      out.unsupported.push(item.type);
  }
}

/** `IfcExtrudedAreaSolid`: perfil + profundidade. Vertical vira prisma; o resto fica para o relatório. */
function readExtrusion(f: IfcFile, item: StepEntity, mat: Mat, out: Body): void {
  const swept = f.ent(item, 0);
  const prof = profileLoops(f, swept);
  if (!prof) {
    out.unsupported.push('profile');
    return;
  }
  const local = composeMat(mat, f.axisPlacement(item.args[1]));
  const dir = f.direction(item.args[2], pt3(0, 0, 1));
  const depth = (f.num(item, 3) ?? 0) * f.units.length;
  if (depth <= 0) return;
  const lift = applyMat({ o: pt3(0, 0, 0), x: local.x, y: local.y, z: local.z }, mul3(dir, depth));
  const base3 = prof.loops.map((loop) => loop.map((p) => applyMat(local, pt3(p.x, p.y, 0))));
  const top3 = base3.map((loop) => loop.map((p) => pt3(p.x + lift.x, p.y + lift.y, p.z + lift.z)));
  addPrismTriangles(out, base3, top3);
  const loops = base3.map((loop) => loop.map((p) => ({ x: p.x, y: p.y })));
  if (Math.abs(lift.x) > 1e-6 || Math.abs(lift.y) > 1e-6) {
    // Extrusão não vertical (abertura atravessando a parede, por exemplo): os vértices já estão nos triângulos.
    out.unsupported.push('extrusao-inclinada');
    return;
  }
  const zBase = local.o.z;
  const z0 = zBase + Math.min(0, lift.z);
  const z1 = zBase + Math.max(0, lift.z);
  out.prisms.push({ loops, z0, z1, approx: false });
}

/** Fecha um prisma (laterais e tampas) em triângulos; furos não são recortados nas tampas (v1). */
function addPrismTriangles(out: Body, base: Pt3[][], top: Pt3[][]): void {
  for (let k = 0; k < base.length; k++) {
    const b = base[k]!;
    const t = top[k]!;
    if (b.length < 3) continue;
    for (let i = 0; i < b.length; i++) {
      const j = (i + 1) % b.length;
      pushTri(out, b[i]!, b[j]!, t[j]!);
      pushTri(out, b[i]!, t[j]!, t[i]!);
    }
    if (k > 0) continue;
    for (let i = 1; i < b.length - 1; i++) {
      pushTri(out, b[0]!, b[i + 1]!, b[i]!);
      pushTri(out, t[0]!, t[i]!, t[i + 1]!);
    }
  }
}

/** `IfcMappedItem`: representação compartilhada (portas, janelas, mobiliário) com transformação. */
function readMapped(f: IfcFile, item: StepEntity, mat: Mat, out: Body, depth: number): void {
  const source = f.ent(item, 0);
  if (!source) return;
  const origin = f.axisPlacement(source.args[0]);
  const rep = f.ent(source, 1);
  const target = transformation(f, f.ent(item, 1));
  const m = composeMat(composeMat(mat, origin), target);
  if (!rep) return;
  for (const sub of f.list(rep, 3)) readItem(f, sub, m, out, depth + 1);
}

/** `IfcCartesianTransformationOperator(3D)`: origem, eixos e escala. */
function transformation(f: IfcFile, e: StepEntity | undefined): Mat {
  if (!e) return IDENTITY;
  const o = f.point(e.args[2]) ?? pt3(0, 0, 0);
  const scale = f.num(e, 3) ?? 1;
  const a1 = f.direction(e.args[0], pt3(1, 0, 0));
  const a2 = f.direction(e.args[1], pt3(0, 1, 0));
  const a3 = e.type === 'IFCCARTESIANTRANSFORMATIONOPERATOR3D' ? f.direction(e.args[4], pt3(0, 0, 1)) : pt3(0, 0, 1);
  return { o, x: mul3(unit3(a1), scale), y: mul3(unit3(a2), scale), z: mul3(unit3(a3), scale) };
}

/** Faces de um B-rep/shell em triângulos (leque por face; buracos de face não são recortados). Já em mundo. */
function readFaces(f: IfcFile, e: StepEntity, mat: Mat, out: Body): void {
  const shell = f.ent(e, 0);
  if (!shell) return;
  for (const face of f.list(shell, 0)) {
    for (const bound of f.list(face, 0)) {
      const loop = f.ent(bound, 0);
      if (!loop) continue;
      const pts: Pt3[] = [];
      for (const p of f.list(loop, 0)) {
        const ponto = f.point(p ? { k: 'ref', id: p.id } : undefined);
        if (ponto) pts.push(applyMat(mat, ponto));
      }
      for (let i = 1; i + 1 < pts.length; i++) pushTri(out, pts[0]!, pts[i]!, pts[i + 1]!);
    }
  }
}

/** `IfcTriangulatedFaceSet`/`IfcPolygonalFaceSet`: triângulos pelos índices de `CoordIndex`. */
function tessellationOf(f: IfcFile, e: StepEntity): Pt3[][] {
  const coords = f.ent(e, 0);
  if (!coords) return [];
  const verts: Pt3[] = [];
  for (const item of listOf(coords.args[0])) {
    const n = listOf(item).map((x) => numOf(x) ?? 0);
    if (n.length >= 3) verts.push(pt3((n[0] ?? 0) * f.units.length, (n[1] ?? 0) * f.units.length, (n[2] ?? 0) * f.units.length));
  }
  const tris: Pt3[][] = [];
  for (const face of listOf(e.args[3])) {
    const idx = listOf(face).map((x) => Math.round(numOf(x) ?? 0) - 1);
    for (let i = 1; i + 1 < idx.length; i++) {
      const a = verts[idx[0] ?? -1];
      const b = verts[idx[i] ?? -1];
      const c = verts[idx[i + 1] ?? -1];
      if (a && b && c) tris.push([a, b, c]);
    }
  }
  if (!tris.length) for (let i = 1; i + 1 < verts.length; i++) tris.push([verts[0]!, verts[i]!, verts[i + 1]!]);
  return tris;
}

/** Remove pontos repetidos (inclusive o de fechamento): o validador do Hestia trata aresta de comprimento zero como cruzamento. */
export function cleanLoop(loop: Pt2[]): Pt2[] {
  const out: Pt2[] = [];
  for (const p of loop) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1e-6) continue;
    out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 2 && first && last && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) out.pop();
  return out;
}

/** Ponto interior de um anel (centroide; para anéis côncavos o hull garante um ponto plausível). */
export function interiorPoint(loop: Pt2[]): Pt2 {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area) > 1e-9) return { x: cx / (3 * area), y: cy / (3 * area) };
  const hull = hull2(loop);
  const n = hull.length || 1;
  return { x: hull.reduce((s, p) => s + p.x, 0) / n, y: hull.reduce((s, p) => s + p.y, 0) / n };
}

/** Hull convexo em planta (monotone chain), usado quando só há malha. */
export function hull2(points: Pt2[]): Pt2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Pt2, a: Pt2, b: Pt2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Prisma aproximado a partir de uma malha (hull da projeção em planta). */
export function prismFromMesh(points: Pt3[]): Prism | null {
  if (points.length < 3) return null;
  const zs = points.map((p) => p.z);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  if (z1 - z0 < 1e-6) return null;
  const loops = [hull2(points.map((p) => ({ x: p.x, y: p.y })))];
  return loops[0]!.length >= 3 ? { loops, z0, z1, approx: true } : null;
}

/**
 * Parede a partir de um prisma: o menor retângulo que envolve o contorno (hull), aceito quando cobre pelo menos 80% da área
 * do polígono. Assim um chanfro ou um corte pequeno na ponta não perde a parede, mas um L ou uma forma livre é recusado —
 * esses ficam para o relatório em vez de virarem uma parede errada.
 */
export function rectangleAxis(loop: Pt2[]): { a: Pt2; b: Pt2; thickness: number; length: number } | null {
  if (loop.length < 4) return null;
  const hull = hull2(loop);
  if (hull.length < 3) return null;
  const polyArea = Math.abs(
    loop.reduce((s, p, i) => {
      const q = loop[(i + 1) % loop.length]!;
      return s + (p.x * q.y - q.x * p.y);
    }, 0) / 2,
  );
  let best: { dir: Pt2; perp: Pt2; umin: number; umax: number; vmin: number; vmax: number; area: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i]!;
    const q = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 1e-6) continue;
    const dir = { x: (q.x - p.x) / len, y: (q.y - p.y) / len };
    const perp = { x: -dir.y, y: dir.x };
    let umin = Infinity;
    let umax = -Infinity;
    let vmin = Infinity;
    let vmax = -Infinity;
    for (const r of hull) {
      const u = r.x * dir.x + r.y * dir.y;
      const v = r.x * perp.x + r.y * perp.y;
      umin = Math.min(umin, u);
      umax = Math.max(umax, u);
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
    }
    const area = (umax - umin) * (vmax - vmin);
    if (!best || area < best.area) best = { dir, perp, umin, umax, vmin, vmax, area };
  }
  if (!best || best.area <= 1e-9) return null;
  // O menor retângulo tem duas orientações de área igual: o comprimento é sempre o lado maior. Sem esta troca, uma
  // fachada de 16,8 m × 0,10 m podia sair como "parede" de 0,10 m de comprimento e 16,8 m de espessura.
  let { dir, perp, umin, umax, vmin, vmax } = best;
  if (vmax - vmin > umax - umin) {
    [dir, perp] = [perp, dir];
    [umin, umax, vmin, vmax] = [vmin, vmax, umin, umax];
  }
  const thickness = vmax - vmin;
  const length = umax - umin;
  if (thickness < 0.005 || length < 0.01) return null;
  if (polyArea / best.area < 0.8) return null;
  const vMid = (vmin + vmax) / 2;
  const at = (u: number): Pt2 => ({ x: dir.x * u + perp.x * vMid, y: dir.y * u + perp.y * vMid });
  return { a: at(umin), b: at(umax), thickness, length };
}

/** Direção e comprimento de um segmento em planta. */
export function segment(p: [Pt2, Pt2]): { dir: Pt2; len: number } {
  const d = { x: p[1].x - p[0].x, y: p[1].y - p[0].y };
  const len = Math.hypot(d.x, d.y) || 1;
  return { dir: { x: d.x / len, y: d.y / len }, len };
}

/** Normal (à esquerda) de um segmento. */
export const normalOf = (s: { dir: Pt2 }): Pt2 => ({ x: -s.dir.y, y: s.dir.x });

export const distance3 = (a: Pt3, b: Pt3): number => len3(sub3(a, b));

export const refOf = (v: unknown): number | null => refId(v as never);
