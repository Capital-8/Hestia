import * as THREE from 'three';
import { buildOpeningModel, frameOfWall, openingGeometry, type OpeningGeometry, type OpeningModel } from '@hestia/engine';
import { openingTypeById, type GraphicsCategory, type Id, type Material, type Opening, type Project, type View3DSettings } from '@hestia/model';
import { pecasDoModelo } from './openingParts.ts';
import { referencialDaEsquadria } from './referencialInclinado3d.ts';
import { deslocamentoDaPeca, geometriaDaPeca, geometriaRelativaAoPivo } from './geometriaPeca3d.ts';
import { arestasDaUniaoDeCaixas, type CaixaAlinhada } from './silhuetaCaixas3d.ts';
import { loteDeGeometria } from './lotesMalha3d.ts';
import type { ElementRange, SolidBatch } from './solids.ts';

/** Desenha uma peça articulada (folha aberta) num pai: a geometria, o material, a categoria, as arestas e as faixas. */
export type DesenhoPeca = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: Material | undefined, cat: GraphicsCategory, edges: boolean, ranges: ElementRange[]) => void;

/**
 * Uma esquadria montada: o grupo do vão (com a transformação do vão, e as folhas abertas nas dobradiças) e os lotes das
 * peças fixas, em coordenadas do vão. Quem monta desenha os lotes dentro do grupo (ver `scene3d.ts`, `desenharLotes`).
 */
export interface AberturaMontada {
  grupo: THREE.Group;
  lotes: SolidBatch[];
  /** Silhueta dos grupos físicos (alizar): arestas já sem as juntas internas, em coordenadas do vão. */
  arestasGrupos: number[];
}

/**
 * Esquadria no vão (decisão 0015 §2.4). As peças fixas viram lotes em coordenadas do vão (a transformação fica no grupo),
 * juntados por material dentro da esquadria, para caber numa malha por material e não por peça (ver `lotesMalha3d.ts`).
 * A folha aberta, que gira na dobradiça, fica num pivô próprio (`desenhar`). Categoria oculta ou vão livre de porta: null.
 */
export function montarAbertura(
  p: Project,
  o: Opening,
  f: NonNullable<ReturnType<typeof frameOfWall>>,
  baseZ: number,
  H: number,
  view: View3DSettings,
  linhas: boolean,
  desenhar: DesenhoPeca,
): AberturaMontada | null {
  const cat: GraphicsCategory = o.kind;
  if (!view.overrides[cat].visible) return null;
  const g = openingGeometry(p, o, f);
  // Vão livre de porta: só o recorte da parede; sem folha nem caixilho.
  if (g.kind === 'door' && g.leaves === 0) return null;
  const geom = g.height > H - g.sill ? { ...g, height: H - g.sill } : g;
  const model = buildOpeningModel(p, o, geom, f);
  return montarAberturaDoModelo(p, o, g, baseZ, model, view, linhas, desenhar);
}

/**
 * Monta o vão a partir do modelo já calculado (o mesmo `buildOpeningModel`). `montarAbertura` é o atalho do projeto;
 * esta forma é o que permite validar o batente em L por fixture enquanto o motor de FR1 não está integrado.
 */
export function montarAberturaDoModelo(
  p: Project,
  o: Opening,
  g: OpeningGeometry,
  baseZ: number,
  model: OpeningModel,
  view: View3DSettings,
  linhas: boolean,
  desenhar: DesenhoPeca,
): AberturaMontada | null {
  const cat: GraphicsCategory = o.kind;
  if (!view.overrides[cat].visible || (model.kind === 'door' && model.void)) return null;
  const t = openingTypeById(p, o.typeId);
  if (!t) return null;
  const pecas = pecasDoModelo(p, t, model, view.openOpenings === true);
  const grupo = new THREE.Group();
  grupo.rotation.z = Math.atan2(g.u.y, g.u.x);
  grupo.position.set(g.center.x, g.center.y, baseZ + g.sill);
  // Parede inclinada (C3): o vão inteiro segue o referencial do plano da abertura; parede vertical fica como sempre.
  const ref = referencialDaEsquadria(p, g, pecas);
  if (ref) {
    grupo.updateMatrix();
    grupo.matrix.multiply(ref);
    grupo.matrixAutoUpdate = false;
  }
  const lotes: SolidBatch[] = [];
  const grupos = new Map<string, CaixaAlinhada[]>();
  // Cada peça da esquadria é um elemento inteiro: a faixa cobre a geometria toda (decisão 0016).
  const range = (count: number): ElementRange[] => [{ id: o.id, start: 0, count }];
  for (const piece of pecas) {
    const d = deslocamentoDaPeca(piece);
    // Folha aberta: a peça é desenhada num grupo na dobradiça, que gira a peça inteira.
    if (piece.hinge) {
      const pivot = new THREE.Group();
      const atS = piece.hinge.atS ?? 0;
      if (piece.hinge.axis === 'z') {
        // Eixo vertical em (t, s) = (at, atS).
        pivot.position.x = piece.hinge.at;
        pivot.position.y = atS;
        pivot.rotation.z = piece.hinge.angle;
      } else {
        // Eixo horizontal paralelo a `t` (maxim-ar/basculante): passa por (s, z) = (atS, at).
        pivot.position.y = atS;
        pivot.position.z = piece.hinge.at;
        pivot.rotation.x = piece.hinge.angle;
      }
      const geo = geometriaRelativaAoPivo(piece).translate(d.dx, d.dy, d.dz);
      const count = geo.index?.count ?? geo.getAttribute('position').count;
      desenhar(pivot, geo, p.materials[piece.materialId], cat, linhas, range(count));
      grupo.add(pivot);
    } else {
      // Peça fixa (ou folha de correr): a geometria em coordenadas do vão (o grupo leva a transformação), como lote da
      // esquadria. O deslocamento do estado aberto entra na posição da peça.
      const geo = (piece.profile ? geometriaDaPeca(piece) : new THREE.BoxGeometry(piece.w, piece.d, piece.h).translate(piece.x, piece.y, piece.z)).translate(d.dx, d.dy, d.dz);
      const lote: SolidBatch = loteDeGeometria(geo, piece.materialId, cat, o.id);
      if (piece.group) {
        lotes.push({ ...lote, group: piece.group });
        // A silhueta unida é feita das caixas do grupo; uma peça com seção já é um sólido único.
        if (!piece.profile) {
          const cs = grupos.get(piece.group) ?? [];
          cs.push({ x0: piece.x + d.dx - piece.w / 2, x1: piece.x + d.dx + piece.w / 2, y0: piece.y + d.dy - piece.d / 2, y1: piece.y + d.dy + piece.d / 2, z0: piece.z + d.dz - piece.h / 2, z1: piece.z + d.dz + piece.h / 2 });
          grupos.set(piece.group, cs);
        }
      } else lotes.push(lote);
    }
  }
  const arestasGrupos: number[] = [];
  for (const cs of grupos.values()) arestasGrupos.push(...arestasDaUniaoDeCaixas(cs));
  grupo.userData.elementId = o.id;
  return { grupo, lotes, arestasGrupos };
}

/** Uma peça de esquadria como caixa: o material e a matriz que leva a caixa unitária ao mundo. */
export interface CaixaDeAbertura {
  materialId: Id;
  matriz: number[];
  /** Peças do mesmo grupo formam uma peça física (alizar): as arestas internas do grupo não entram. */
  group?: string;
}

/** Peça com seção (batente em L) no caminho instanciado: não é caixa, então vai como prisma à parte. */
export interface PrismaDeAbertura {
  materialId: Id;
  /** Geometria já no mundo, no referencial do vão e com a dobradiça/deslocamento aplicados. */
  geometry: THREE.BufferGeometry;
}

/** Saída do caminho instanciado: caixas unitárias e os prismas que não cabem em instância. */
export interface AberturaEmCaixas {
  caixas: CaixaDeAbertura[];
  prismas: PrismaDeAbertura[];
}

/**
 * Esquadria em caixas (desempenho 3D): cada peça, fixa ou articulada, é uma caixa unitária levada ao mundo por
 * `vão · dobradiça · caixa`, a mesma cadeia de transformações de `montarAbertura` (grupo do vão, pivô da dobradiça, caixa
 * deslocada), só que numa matriz. Mesmas saídas nulas: categoria oculta ou vão livre de porta.
 */
export function caixasDaAbertura(
  p: Project,
  o: Opening,
  f: NonNullable<ReturnType<typeof frameOfWall>>,
  baseZ: number,
  H: number,
  view: View3DSettings,
): CaixaDeAbertura[] | null {
  return caixasEPrismasDaAbertura(p, o, f, baseZ, H, view)?.caixas ?? null;
}

/**
 * Caminho instanciado completo: as peças em caixa viram matrizes de caixa unitária e as peças com `profile` viram
 * prismas com a geometria já no mundo. As duas saídas desenham juntas; a cena agrupa as caixas por material e desenha os
 * prismas nos lotes de geometria. Mesmas saídas nulas de `montarAbertura`.
 */
export function caixasEPrismasDaAbertura(
  p: Project,
  o: Opening,
  f: NonNullable<ReturnType<typeof frameOfWall>>,
  baseZ: number,
  H: number,
  view: View3DSettings,
): AberturaEmCaixas | null {
  if (!view.overrides[o.kind].visible) return null;
  const g = openingGeometry(p, o, f);
  if (g.kind === 'door' && g.leaves === 0) return null;
  const geom = g.height > H - g.sill ? { ...g, height: H - g.sill } : g;
  const model = buildOpeningModel(p, o, geom, f);
  return caixasEPrismasDoModelo(p, o, g, baseZ, model, view);
}

/** Caminho instanciado a partir do modelo já calculado (ver `montarAberturaDoModelo`). */
export function caixasEPrismasDoModelo(
  p: Project,
  o: Opening,
  g: OpeningGeometry,
  baseZ: number,
  model: OpeningModel,
  view: View3DSettings,
): AberturaEmCaixas | null {
  if (!view.overrides[o.kind].visible || (model.kind === 'door' && model.void)) return null;
  const t = openingTypeById(p, o.typeId);
  if (!t) return null;
  const vao = new THREE.Matrix4().makeRotationZ(Math.atan2(g.u.y, g.u.x)).setPosition(g.center.x, g.center.y, baseZ + g.sill);
  const pecas = pecasDoModelo(p, t, model, view.openOpenings === true);
  const ref = referencialDaEsquadria(p, g, pecas);
  if (ref) vao.multiply(ref);
  const out: AberturaEmCaixas = { caixas: [], prismas: [] };
  for (const piece of pecas) {
    const d = deslocamentoDaPeca(piece);
    const m = vao.clone();
    let dx = 0;
    let dy = 0;
    let dz = 0;
    if (piece.hinge) {
      const pivo = new THREE.Matrix4();
      const atS = piece.hinge.atS ?? 0;
      if (piece.hinge.axis === 'z') {
        pivo.makeRotationZ(piece.hinge.angle).setPosition(piece.hinge.at, atS, 0);
        dx = piece.hinge.at;
        dy = atS;
      } else {
        pivo.makeRotationX(piece.hinge.angle).setPosition(0, atS, piece.hinge.at);
        dy = atS;
        dz = piece.hinge.at;
      }
      m.multiply(pivo);
    }
    if (piece.profile) {
      const geo = (piece.hinge ? geometriaRelativaAoPivo(piece) : geometriaDaPeca(piece)).translate(d.dx, d.dy, d.dz);
      geo.applyMatrix4(m);
      out.prismas.push({ materialId: piece.materialId, geometry: geo });
      continue;
    }
    m.multiply(new THREE.Matrix4().makeTranslation(piece.x - dx + d.dx, piece.y - dy + d.dy, piece.z - dz + d.dz)).multiply(new THREE.Matrix4().makeScale(piece.w, piece.d, piece.h));
    out.caixas.push({ materialId: piece.materialId, matriz: m.toArray(), ...(piece.group ? { group: piece.group } : {}) });
  }
  return out;
}
