import { isGeneric, type Generic, type IfcProperty } from '@hestia/model';
import { gid, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { localPlacement } from './ifcSolids.ts';
import { en, int, list, num, OMIT, ref, StepWriter, stepString } from './ifcStep.ts';

/** Nome do property set dos objetos importados: o modelo guarda nome e valor da propriedade, sem o conjunto de origem. */
const PSET_NAME = 'Pset_Hestia';

/** Valor IFC de uma propriedade (`IfcValue`): booleano, inteiro, real ou texto (número não finito vira texto). */
function ifcValue(v: IfcProperty['value']): string {
  if (typeof v === 'boolean') return `IFCBOOLEAN(${v ? '.T.' : '.F.'})`;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return `IFCLABEL(${stepString(String(v))})`;
    return Number.isInteger(v) ? `IFCINTEGER(${int(v)})` : `IFCREAL(${num(v)})`;
  }
  return `IFCLABEL(${stepString(v)})`;
}

/** Triplas 1-based da malha; tripla com índice fora da faixa dos vértices sai. */
function coordIndexTriples(indices: readonly number[], vertices: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const tri = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
    if (!tri.every((n) => Number.isInteger(n) && n >= 0 && n < vertices)) continue;
    out.push(list(tri.map((n) => int(n + 1))));
  }
  return out;
}

/** Coordenadas de um vértice em cota local do nível: `z` absoluto menos a elevação do pavimento. */
const localPoint = (positions: readonly number[], i: number, elev: number): string =>
  list([num(positions[i]!), num(positions[i + 1]!), num(positions[i + 2]! - elev)]);

/**
 * `IFCTRIANGULATEDFACESET` (IFC4) da malha do genérico, com a lista de pontos em metros e cota local do nível. A malha
 * é a do modelo (mundo); `CoordIndex` são triplas 1-based. Malha vazia ou inválida devolve `null` (produto sem forma).
 */
export function faceSetOf(w: StepWriter, mesh: { positions: readonly number[]; indices: readonly number[] }, elev: number): number | null {
  const { positions, indices } = mesh;
  if (positions.length < 9 || positions.length % 3 !== 0 || !positions.every(Number.isFinite)) return null;
  const vertices = positions.length / 3;
  const triples = coordIndexTriples(indices, vertices);
  if (triples.length === 0) return null;
  const points: string[] = [];
  for (let i = 0; i < positions.length; i += 3) points.push(localPoint(positions, i, elev));
  const coords = w.add('IFCCARTESIANPOINTLIST3D', [list(points)]);
  // Os cinco atributos do IFC4 (Coordinates, Normals, Closed, CoordIndex, PnIndex) saem explícitos: o ISO 10303-21 não aceita omitir o final.
  return w.add('IFCTRIANGULATEDFACESET', [ref(coords), OMIT, OMIT, list(triples), OMIT]);
}

/** Representação do corpo em malha: `IFCSHAPEREPRESENTATION` `Tessellation` dentro de `IFCPRODUCTDEFINITIONSHAPE`. */
export function tessellatedShape(w: StepWriter, ctx: number, faceSet: number): number {
  const rep = w.add('IFCSHAPEREPRESENTATION', [ref(ctx), "'Body'", "'Tessellation'", list([ref(faceSet)])]);
  return w.add('IFCPRODUCTDEFINITIONSHAPE', [OMIT, OMIT, list([ref(rep)])]);
}

/** `IFCPROPERTYSET` das propriedades do objeto, ligado a ele por `IFCRELDEFINESBYPROPERTIES`. */
function addPropertySets(c: IfcCtx, g: Generic, object: number): void {
  const props = g.ifcProperties ?? [];
  if (props.length === 0) return;
  const groups = new Map<string, IfcProperty[]>();
  for (const p of props) {
    const name = p.pset?.trim() || PSET_NAME;
    const list = groups.get(name);
    if (list) list.push(p);
    else groups.set(name, [p]);
  }
  for (const name of [...groups.keys()].sort()) {
    const singles = (groups.get(name) ?? []).map((p) =>
      ref(c.w.add('IFCPROPERTYSINGLEVALUE', [stepString(p.name), OMIT, ifcValue(p.value), OMIT])),
    );
    const pset = c.w.add('IFCPROPERTYSET', [gid(`pset:${g.id}:${name}`), OMIT, stepString(name), OMIT, list(singles)]);
    c.w.add('IFCRELDEFINESBYPROPERTIES', [gid(`psetrel:${g.id}:${name}`), OMIT, OMIT, OMIT, list([ref(object)]), ref(pset)]);
  }
}

/**
 * Objeto importado: `IFCBUILDINGELEMENTPROXY` no pavimento do nível, com `ObjectType` = classe IFC de origem (o
 * `IFCBEAM`, `IFCCOLUMN`... que o importador guardou em `sourceClass`) e o corpo em malha triangular. O `PredefinedType`
 * fica `.ELEMENT.`: o enum do proxy é próprio (`IfcBuildingElementProxyTypeEnum`), não o da classe de origem.
 */
function addGeneric(c: IfcCtx, g: Generic): void {
  const st = storeyOf(c, g.levelId);
  if (!st) return;
  const place = localPlacement(c.w, st.place, [0, 0, 0]);
  const faceSet = faceSetOf(c.w, g.mesh, st.elev);
  const shape = faceSet === null ? OMIT : ref(tessellatedShape(c.w, c.ctx, faceSet));
  const proxy = c.w.add('IFCBUILDINGELEMENTPROXY', [
    gid(`generic:${g.id}`),
    OMIT,
    stepString(g.name || g.sourceClass),
    OMIT,
    stepString(g.sourceClass),
    ref(place),
    shape,
    OMIT,
    en('ELEMENT'),
  ]);
  st.contained.push(proxy);
  addPropertySets(c, g, proxy);
}

/** Ordem estável dos genéricos: a ordem de criação e, no empate, o id. */
const byOrderAndId = (a: Generic, b: Generic): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Objetos genéricos do projeto, depois dos elementos nativos, contidos no pavimento pelo exportador. */
export function addGenerics(c: IfcCtx): void {
  for (const g of Object.values(c.p.elements).filter(isGeneric).sort(byOrderAndId)) addGeneric(c, g);
}
