import { OMIT, en, list, num, ref, StepWriter } from './ifcStep.ts';
import type { IfcPlane, IfcPoint, IfcPolygon, IfcPrism, IfcRing } from './ifcTypes.ts';
import { t, type Lang } from '../i18n.ts';

const EPS = 1e-9;

/** Retângulo `width` × `thickness` centrado na origem do sistema local (x ao longo do eixo do vão, y na espessura). */
export function rectOf(width: number, thickness: number): IfcPolygon {
  const hw = width / 2;
  const ht = thickness / 2;
  return [[
    { x: -hw, y: -ht },
    { x: hw, y: -ht },
    { x: hw, y: ht },
    { x: -hw, y: ht },
  ]];
}

/** Área com sinal (positiva no sentido anti-horário, em planta). */
function signedArea(ring: IfcRing): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Anel sem vértices repetidos (consecutivos) nem o de fechamento. Menos de 3 vértices: devolve vazio. */
export function cleanRing(ring: IfcRing): IfcRing {
  const out: IfcRing = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < EPS && Math.abs(last.y - p.y) < EPS) continue;
    out.push(p);
  }
  const first = out[0];
  const end = out[out.length - 1];
  if (out.length > 1 && first && end && Math.abs(first.x - end.x) < EPS && Math.abs(first.y - end.y) < EPS) out.pop();
  return out.length >= 3 ? out : [];
}

/** Área absoluta do anel (m²). */
export const ringArea = (ring: IfcRing): number => Math.abs(signedArea(ring));

/** Centro do anel (média dos vértices), em planta. */
export function ringCentroid(ring: IfcRing): IfcPoint {
  const n = Math.max(1, ring.length);
  return {
    x: ring.reduce((s, p) => s + p.x, 0) / n,
    y: ring.reduce((s, p) => s + p.y, 0) / n,
  };
}

/** Direção unitária do centro do primeiro ao do último anel da cadeia; null quando os centros coincidem. */
export function ringChainDirection(rings: readonly IfcRing[]): IfcPoint | null {
  if (rings.length < 2) return null;
  const a = ringCentroid(rings[0]!);
  const b = ringCentroid(rings[rings.length - 1]!);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len > EPS ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : null;
}

/** Passo mediano entre os centros de anéis consecutivos (m); null quando não há dois passos. */
export function ringChainStep(rings: readonly IfcRing[]): number | null {
  if (rings.length < 2) return null;
  const steps: number[] = [];
  for (let i = 1; i < rings.length; i++) {
    const a = ringCentroid(rings[i - 1]!);
    const b = ringCentroid(rings[i]!);
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d > EPS) steps.push(d);
  }
  if (steps.length === 0) return null;
  steps.sort((x, y) => x - y);
  return steps[Math.floor(steps.length / 2)]!;
}

/** Anel orientado: `ccw` = sentido anti-horário (contorno externo); senão horário (furo). */
function oriented(ring: IfcRing, ccw: boolean): IfcRing {
  const positive = signedArea(ring) > 0;
  return positive === ccw ? ring : [...ring].reverse();
}

/** Polígono limpo: contorno externo anti-horário, furos horários. Anéis sem área saem. */
export function normalizePolygon(polygon: IfcPolygon): IfcPolygon {
  const [outer, ...holes] = polygon;
  const o = outer ? cleanRing(outer) : [];
  if (o.length === 0) return [];
  return [oriented(o, true), ...holes.map(cleanRing).filter((h) => h.length >= 3).map((h) => oriented(h, false))];
}

/** Coordenada de um plano no ponto (x, y). */
export const planeZ = (pl: IfcPlane, p: IfcPoint): number => pl.a * p.x + pl.b * p.y + pl.c;

/** Plano em cota local (relativa ao nível de `elev`). */
export const localPlane = (pl: IfcPlane, elev: number): IfcPlane => ({ a: pl.a, b: pl.b, c: pl.c - elev });

/** Entidade IFCDIRECTION. */
export function direction(w: StepWriter, x: number, y: number, z: number): number {
  return w.add('IFCDIRECTION', [list([num(x), num(y), num(z)])]);
}

/** Entidade IFCAXIS2PLACEMENT3D: origem e, opcional, a direção de X. */
export function axis3(w: StepWriter, loc: readonly [number, number, number], refDir?: IfcPoint): number {
  const p = w.add('IFCCARTESIANPOINT', [list([num(loc[0]), num(loc[1]), num(loc[2])])]);
  const r = refDir ? direction(w, refDir.x, refDir.y, 0) : null;
  return w.add('IFCAXIS2PLACEMENT3D', [ref(p), OMIT, r === null ? OMIT : ref(r)]);
}

/** IFCLOCALPLACEMENT relativo a `relTo` (null = raiz do arquivo). */
export function localPlacement(w: StepWriter, relTo: number | null, loc: readonly [number, number, number], refDir?: IfcPoint): number {
  const ax = axis3(w, loc, refDir);
  return w.add('IFCLOCALPLACEMENT', [relTo === null ? OMIT : ref(relTo), ref(ax)]);
}

/** Perfil de área do polígono (contorno e furos). Espera o polígono já normalizado. */
function profileOf(w: StepWriter, polygon: IfcPolygon): number {
  const curve = (ring: IfcRing): number => {
    const pts = [...ring, ring[0]!].map((p) => ref(w.add('IFCCARTESIANPOINT', [list([num(p.x), num(p.y)])])));
    return w.add('IFCPOLYLINE', [list(pts)]);
  };
  const [outer, ...holes] = polygon;
  const outerCurve = curve(outer ?? []);
  if (holes.length === 0) return w.add('IFCARBITRARYCLOSEDPROFILEDEF', [en('AREA'), OMIT, ref(outerCurve)]);
  const inner = holes.map((h) => ref(curve(h)));
  return w.add('IFCARBITRARYPROFILEDEFWITHVOIDS', [en('AREA'), OMIT, ref(outerCurve), list(inner)]);
}

/**
 * Sólido por extrusão vertical do polígono: começa em `zBase` (cota local) e sobe `depth`. `origin` é a origem do
 * posicionamento do sólido (padrão, zero); o polígono fica nas coordenadas do posicionamento.
 */
export function extrudeSolid(w: StepWriter, polygon: IfcPolygon, zBase: number, depth: number): number {
  const poly = normalizePolygon(polygon);
  const profile = profileOf(w, poly);
  const pos = axis3(w, [0, 0, zBase]);
  return w.add('IFCEXTRUDEDAREASOLID', [ref(profile), ref(pos), ref(direction(w, 0, 0, 1)), num(depth)]);
}

/** Ponto 3D, com a cota já calculada no plano. */
interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Face IFC: IFCFACE com o contorno (IFCFACEOUTERBOUND, primeiro laço) e os furos (IFCFACEBOUND), na ordem dada. */
function faceOf(w: StepWriter, loops: P3[][]): number {
  const bounds = loops.map((loop, i) => {
    const pts = loop.map((p) => ref(w.add('IFCCARTESIANPOINT', [list([num(p.x), num(p.y), num(p.z)])])));
    const poly = w.add('IFCPOLYLOOP', [list(pts)]);
    return w.add(i === 0 ? 'IFCFACEOUTERBOUND' : 'IFCFACEBOUND', [ref(poly), '.T.']);
  });
  return w.add('IFCFACE', [list(bounds.map(ref))]);
}

/** Anel levantado sobre o plano `pl`. */
const lift = (ring: IfcRing, pl: IfcPlane): P3[] => ring.map((p) => ({ x: p.x, y: p.y, z: planeZ(pl, p) }));

/**
 * Sólido de faces planas (IFCFACETEDBREP) entre o plano de topo e o de fundo, em cota local. Contorno externo
 * anti-horário e furos horários, pela regra da mão direita: as normais saem do sólido. Topo e fundo são as faces
 * com furos; cada aresta de anel vira um quadrilátero vertical (ou inclinado, se o topo é inclinado).
 */
export function brepSolid(w: StepWriter, polygon: IfcPolygon, top: IfcPlane, bottom: IfcPlane, lang: Lang = 'pt'): number {
  const poly = normalizePolygon(polygon);
  if (poly.length === 0) throw new Error(t(lang, 'io_err_ifc_solid_area'));
  const rings = poly;
  const faces: number[] = [];
  // Topo: normal para cima (contorno anti-horário). Fundo: laços invertidos, normal para baixo.
  faces.push(faceOf(w, rings.map((r) => lift(r, top))));
  faces.push(faceOf(w, rings.map((r) => lift([...r].reverse(), bottom))));
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const quad: P3[] = [
        { x: a.x, y: a.y, z: planeZ(top, a) },
        { x: a.x, y: a.y, z: planeZ(bottom, a) },
        { x: b.x, y: b.y, z: planeZ(bottom, b) },
        { x: b.x, y: b.y, z: planeZ(top, b) },
      ];
      faces.push(faceOf(w, [quad]));
    }
  }
  const shell = w.add('IFCCLOSEDSHELL', [list(faces.map(ref))]);
  return w.add('IFCFACETEDBREP', [ref(shell)]);
}

/** Prisma de topo e fundo de cota constante (sem inclinação): vira extrusão. */
const isFlatPrism = (pr: IfcPrism): boolean => [pr.top, pr.bottom].every((pl) => pl.a === 0 && pl.b === 0);

/**
 * Representação do corpo do produto a partir de prismas (IFCSHAPEREPRESENTATION no contexto `ctx`, dentro de
 * IFCPRODUCTDEFINITIONSHAPE). Todos de cota constante: extrusões (`SweptSolid`); senão, malhas de faces planas
 * (`Brep`) para todos. Prismas sem área ou sem espessura saem. `elev` é a cota do nível do dono (geometria em cota local).
 */
export function prismsShape(w: StepWriter, ctx: number, prisms: readonly IfcPrism[], elev: number, lang: Lang = 'pt'): number {
  // Sem área, ou extrusão de altura não positiva, o prisma não entra.
  const valid = prisms.filter((pr) => normalizePolygon(pr.polygon).length > 0 && (!isFlatPrism(pr) || pr.top.c > pr.bottom.c));
  const flat = valid.every(isFlatPrism);
  const items = valid.map((pr) => {
    const top = localPlane(pr.top, elev);
    const bottom = localPlane(pr.bottom, elev);
    return flat ? extrudeSolid(w, pr.polygon, bottom.c, top.c - bottom.c) : brepSolid(w, pr.polygon, top, bottom, lang);
  });
  return bodyShape(w, ctx, flat ? 'SweptSolid' : 'Brep', items);
}

/**
 * Representação do corpo de um produto: IFCSHAPEREPRESENTATION no contexto `ctx` (tipo `SweptSolid` ou `Brep`) dentro de
 * IFCPRODUCTDEFINITIONSHAPE. Devolve o id da definição de forma.
 */
export function bodyShape(w: StepWriter, ctx: number, type: 'SweptSolid' | 'Brep', items: readonly number[]): number {
  const rep = w.add('IFCSHAPEREPRESENTATION', [ref(ctx), "'Body'", `'${type}'`, list(items.map(ref))]);
  return w.add('IFCPRODUCTDEFINITIONSHAPE', [OMIT, OMIT, list([ref(rep)])]);
}
