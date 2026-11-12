import * as THREE from 'three';
import type { Id, Material, Project, View3DSettings } from '@hestia/model';
import type { MalhaCortinaProjeto } from '@hestia/engine';
import type { Materiais3D } from './materiais3d.ts';
import type { PickSource } from './cacheMalhas3d.ts';
import { arestasDaCortina, avulsosDaCortina, caixasDasCortinas, lotesDaCortina, malhaDePickCortina, type LoteAvulsoCortina3d, type LoteCortina3d } from './cortina3d.ts';

/** Ordem de desenho do vidro: depois dos opacos (ADR 0056 §9). */
export const ORDEM_VIDRO = 4;

/** O que a cena guarda de um nível com cortina. */
export interface GrupoCortina {
  grupo: THREE.Group;
  picks: PickSource[];
  /** Caixa (mundo) de cada cortina, para o "Ir para" e o enquadramento da seleção. */
  caixas: Map<Id, THREE.Box3>;
  mats: string[];
  /** Quantos desenhos o nível tem: um InstancedMesh por (protótipo, material, transparência) e uma malha por peça avulsa. */
  desenhos: number;
  /** Quantas instâncias no total. */
  instancias: number;
}

export interface OpcoesGrupoCortina {
  view: View3DSettings;
  edges: boolean;
  shadows: boolean;
  anguloAresta: number;
  mats: Materiais3D;
  material: (id: Id) => Material | undefined;
  visivel: (wallId: Id) => boolean;
  revelado: (wallId: Id) => boolean;
  materialReveal: () => THREE.Material;
}

/** Material do vidro: o da face com a escrita de profundidade desligada (o vidro é desenhado depois e não esconde o que está atrás). */
function materialDoVidro(mats: Materiais3D, base: THREE.Material): THREE.Material {
  return mats.cached(`cortina-vidro|${base.uuid}`, () => {
    const m = base.clone();
    m.transparent = true;
    m.depthWrite = false;
    return m;
  });
}

function geometriaDoLote(l: LoteCortina3d | LoteAvulsoCortina3d): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(l.vertices, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(l.normais, 3));
  g.setIndex(new THREE.BufferAttribute(l.indices, 1));
  return g;
}

/**
 * Monta o grupo 3D das cortinas de UM nível a partir da malha do kernel: um `InstancedMesh` por (protótipo, material, transparência), de modo que uma
 * cortina de 60 células custa ~4 desenhos e não 250. Montantes e painéis sólidos são opacos; o vidro vai em lote próprio (`renderOrder` maior, sem
 * escrita de profundidade, sem sombra). A peça de picking é a caixa de cada cortina (o InstancedMesh não entra no raio: `semPick`).
 */
export function montarGrupoCortina(p: Project, malha: MalhaCortinaProjeto, donos: ReadonlySet<Id>, o: OpcoesGrupoCortina): GrupoCortina | null {
  const lotes = lotesDaCortina(malha, (id) => donos.has(id) && o.visivel(id));
  const avulsos = avulsosDaCortina(malha, (id) => donos.has(id) && o.visivel(id));
  const reveladas = [...donos].filter((id) => o.visivel(id) && o.revelado(id));
  if (!lotes.length && !avulsos.length) return null;
  const grupo = new THREE.Group();
  const geometrias = new Map<number, THREE.BufferGeometry>();
  let instancias = 0;
  for (const l of lotes) {
    let geo = geometrias.get(l.proto);
    if (!geo) geometrias.set(l.proto, (geo = geometriaDoLote(l)));
    const mat = l.materialId ? o.material(l.materialId) : undefined;
    const base = o.mats.face(mat, 'wall');
    const material = l.transparente ? materialDoVidro(o.mats, base) : base;
    const mesh = new THREE.InstancedMesh(geo, material, l.n);
    mesh.instanceMatrix.array.set(l.matrizes);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.castShadow = o.shadows && !l.transparente;
    mesh.receiveShadow = o.shadows && !l.transparente;
    mesh.renderOrder = l.transparente ? ORDEM_VIDRO : 0;
    mesh.userData = { kind: 'wall', semPick: true, cortina: true, transparente: l.transparente };
    // Wireframe não desenha a face (só as linhas e a peça de picking).
    mesh.visible = o.view.style !== 'wireframe';
    instancias += l.n;
    grupo.add(mesh);
  }
  // Peças avulsas (esquadria, montante de canto): malha própria, com o mesmo material e a mesma regra de vidro dos lotes.
  for (const a of avulsos) {
    const mat = a.materialId ? o.material(a.materialId) : undefined;
    const base = o.mats.face(mat, 'wall');
    const mesh = new THREE.Mesh(geometriaDoLote(a), a.transparente ? materialDoVidro(o.mats, base) : base);
    mesh.castShadow = o.shadows && !a.transparente;
    mesh.receiveShadow = o.shadows && !a.transparente;
    mesh.renderOrder = a.transparente ? ORDEM_VIDRO : 0;
    mesh.userData = { kind: 'wall', semPick: true, cortina: true, avulsa: true, transparente: a.transparente };
    mesh.visible = o.view.style !== 'wireframe';
    grupo.add(mesh);
  }
  if (o.edges || o.view.style === 'wireframe') {
    const a = arestasDaCortina(lotes, (o.anguloAresta * Math.PI) / 180, avulsos);
    if (a.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      const linhas = new THREE.LineSegments(g, o.mats.edge());
      linhas.frustumCulled = false;
      grupo.add(linhas);
    }
  }
  if (reveladas.length) {
    const sel = (id: Id) => reveladas.includes(id);
    const rev = arestasDaCortina(lotesDaCortina(malha, sel), (o.anguloAresta * Math.PI) / 180, avulsosDaCortina(malha, sel));
    if (rev.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(rev, 3));
      const linhas = new THREE.LineSegments(g, o.materialReveal());
      linhas.frustumCulled = false;
      linhas.renderOrder = 8;
      linhas.userData = { reveal: true };
      grupo.add(linhas);
    }
  }
  const caixas = new Map<Id, THREE.Box3>();
  for (const [id, c] of caixasDasCortinas(lotes, avulsos)) caixas.set(id, new THREE.Box3(new THREE.Vector3(...c.min), new THREE.Vector3(...c.max)));
  const pk = malhaDePickCortina(new Map([...caixas].map(([id, b]) => [id, { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] }])));
  const pickGeo = new THREE.BufferGeometry();
  pickGeo.setAttribute('position', new THREE.Float32BufferAttribute(pk.positions, 3));
  pickGeo.setIndex(pk.indices);
  const picks: PickSource[] = [{ geo: pickGeo, owner: grupo, kind: 'wall', ranges: pk.ranges }];
  void p;
  return { grupo, picks, caixas, mats: [], desenhos: lotes.length + avulsos.length, instancias };
}

/** O que a cena desenha de uma cortina sem kernel: só o eixo (linha na altura média da parede). */
export function grupoSoEixos(eixos: ReadonlyArray<{ a: { x: number; y: number }; b: { x: number; y: number }; z: number }>, mats: Materiais3D): THREE.Group | null {
  if (!eixos.length) return null;
  const pts: number[] = [];
  for (const e of eixos) pts.push(e.a.x, e.a.y, e.z, e.b.x, e.b.y, e.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grupo = new THREE.Group();
  const linhas = new THREE.LineSegments(g, mats.edge());
  linhas.frustumCulled = false;
  grupo.add(linhas);
  return grupo;
}
