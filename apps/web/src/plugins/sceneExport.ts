import * as THREE from 'three';
import { view3dOf, type Generic, type Project } from '@hestia/model';
import type { SceneContent, SceneEntity, SceneLight, SceneMaterial, SceneMesh, SceneSite } from '@hestia/plugin-api';
import { IDENTITY_MATRIX } from '@hestia/plugin-api';

/**
 * Hash FNV-1a de 32 bits sobre posições, índices, normais e grupos (com o material de cada grupo): qualquer mudança que
 * o renderizador enxerga muda o hash, então o plugin não reaproveita uma malha com material ou normal antigos.
 */
function hashMesh(pos: number[], idx: number[], nor: number[], grupos: SceneMesh['groups']): string {
  let h = 0x811c9dc5;
  const mix = (n: number): void => { h = Math.imul(h ^ n, 0x01000193); };
  for (const n of pos) mix(Math.round(n * 1e6));
  for (const n of idx) mix(n);
  for (const n of nor) mix(Math.round(n * 1e4));
  for (const g of grupos) {
    mix(g.start);
    mix(g.count);
    const m = g.materialId ?? '';
    for (let i = 0; i < m.length; i++) mix(m.charCodeAt(i));
    mix(0x2c);
  }
  return (h >>> 0).toString(16) + ':' + pos.length;
}

interface Range { id: string; start: number; count: number }

interface Acumulo {
  pos: number[];
  nor: number[];
  /** Algum pedaço da entidade veio de malha sem normais: a entidade sai sem normais (tudo ou nada). */
  semNormais: boolean;
  remap: Map<string, number>;
  /** Triângulos (índices de vértice) por material do lote de onde saíram; `null` = material desconhecido. */
  grupos: Map<string | null, number[]>;
}

/**
 * Malhas por elemento, em coordenadas de mundo, lidas da cena 3D viva (as mesmas que a GPU desenha). Cada malha do
 * modelo traz `userData.ranges` (faixas de índice por elemento); só elas entram. Malhas instanciadas, datum, chão,
 * grade e realces não têm faixas e ficam de fora.
 *
 * Protocolo 1.3: o lote da GPU é um material só (`userData.materialId`), então cada faixa vai para o grupo do seu
 * material. Uma parede de várias camadas sai com um grupo por camada (reboco, bloco, tinta...). Sem material conhecido,
 * o grupo leva `materialId: null`. As normais vêm do próprio lote, já no mundo.
 */
export function extractElementMeshes(root: THREE.Object3D): Map<string, SceneMesh> {
  root.updateMatrixWorld(true);
  const acc = new Map<string, Acumulo>();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const ranges = mesh.userData?.ranges as Range[] | undefined;
    if (!mesh.isMesh || !ranges || o.userData.ghost) return;
    const pos = mesh.geometry.getAttribute('position');
    const nor = mesh.geometry.getAttribute('normal');
    const index = mesh.geometry.index;
    if (!pos) return;
    const material: string | null = (mesh.userData.materialId as string | undefined) ?? null;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (const r of ranges) {
      let a = acc.get(r.id);
      if (!a) { a = { pos: [], nor: [], semNormais: false, remap: new Map(), grupos: new Map() }; acc.set(r.id, a); }
      if (!nor) a.semNormais = true;
      let grupo = a.grupos.get(material);
      if (!grupo) { grupo = []; a.grupos.set(material, grupo); }
      for (let i = r.start; i < r.start + r.count; i++) {
        const vi = index ? index.getX(i) : i;
        const key = `${o.id}:${vi}`;
        let to = a.remap.get(key);
        if (to === undefined) {
          v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
          to = a.pos.length / 3;
          a.pos.push(v.x, v.y, v.z);
          if (nor) {
            n.fromBufferAttribute(nor, vi).applyMatrix3(normalMatrix).normalize();
            a.nor.push(n.x, n.y, n.z);
          }
          a.remap.set(key, to);
        }
        grupo.push(to);
      }
    }
  });
  const out = new Map<string, SceneMesh>();
  for (const [id, a] of acc) {
    const indices: number[] = [];
    const groups: SceneMesh['groups'] = [];
    for (const [materialId, tris] of a.grupos) {
      if (tris.length === 0) continue;
      groups.push({ start: indices.length, count: tris.length, materialId });
      for (const x of tris) indices.push(x);
    }
    const normals = !a.semNormais && a.nor.length === a.pos.length ? a.nor : undefined;
    const uvs = normals ? uvsCaixa(a.pos, normals) : undefined;
    out.set(id, {
      positions: a.pos,
      ...(normals ? { normals } : {}),
      ...(uvs ? { uvs } : {}),
      indices,
      groups,
      hash: hashMesh(a.pos, indices, normals ?? [], groups),
    });
  }
  return out;
}

/** Entidades com mais vértices que isto saem sem UVs (o quadro tem teto; o renderizador projeta sozinho). */
export const UVS_MAX_VERTICES = 600_000;

/**
 * UVs por projeção em caixa, em METROS de mundo: o eixo é o da maior componente da normal do vértice (X dominante
 * → (y, z); Y → (x, z); Z → (x, y)), como o renderizador faz. Precisa de normais; `undefined` para malha grande demais.
 */
export function uvsCaixa(pos: number[], nor: number[]): number[] | undefined {
  const n = pos.length / 3;
  if (n === 0 || n > UVS_MAX_VERTICES || nor.length !== pos.length) return undefined;
  const uv = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) {
    const ax = Math.abs(nor[i * 3]!), ay = Math.abs(nor[i * 3 + 1]!), az = Math.abs(nor[i * 3 + 2]!);
    const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
    if (ax >= ay && ax >= az) { uv[i * 2] = y; uv[i * 2 + 1] = z; }
    else if (ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  return uv;
}

/**
 * Categoria dos materiais do catálogo do Hestia, por id (protocolo 1.3). Os blocos são cerâmicos (cor de terracota,
 * "bloco cerâmico" nas camadas de alvenaria). Material criado pelo usuário usa `Material.category`, que tem prioridade.
 * Valor desconhecido para o renderizador é ignorado por ele.
 */
export const CATEGORIA_CATALOGO: Readonly<Record<string, string>> = {
  mat_aco: 'metal', mat_aluminio: 'metal', mat_perfil: 'metal', mat_telha_metalica: 'metal',
  mat_argamassa: 'plaster', mat_gesso: 'plaster', mat_reboco: 'plaster',
  mat_bloco9: 'brick', mat_bloco14: 'brick', mat_bloco19: 'brick',
  mat_ceramica: 'ceramic', mat_concreto: 'concrete', mat_madeira: 'wood', mat_pvc: 'plastic',
  mat_telha_ceramica: 'roof_tile', mat_tinta: 'paint', mat_vidro: 'glass',
  mat_fibrocimento: 'other', mat_la: 'other',
};

/** Categoria exportada: a do usuário (válida) ou a do catálogo; `undefined` = sem categoria. */
export function categoriaDoMaterial(m: { id: string; category?: string }): string | undefined {
  if (typeof m.category === 'string' && /^[a-z0-9_-]{1,32}$/.test(m.category)) return m.category;
  return CATEGORIA_CATALOGO[m.id];
}

/** PBR derivado da categoria: metal → metallic 1; glass → transmission 0.9 e ior 1.5; demais nada. */
export function pbrDaCategoria(c: string | undefined): Pick<SceneMaterial, 'metallic' | 'transmission' | 'ior'> {
  if (c === 'metal') return { metallic: 1 };
  if (c === 'glass') return { transmission: 0.9, ior: 1.5 };
  return {};
}

type Typed = { typeId?: string; levelId?: string; kind: string; id: string; name?: string };

/** Materiais das camadas do tipo do elemento (em ordem, sem repetir). */
function materialIdsOf(p: Project, e: Typed): string[] {
  const tipos = [p.wallTypes, p.floorTypes, p.slabTypes, p.ceilingTypes, p.roofTypes, p.stairTypes, p.rampTypes] as unknown as Array<Record<string, { layers?: Array<{ materialId: string }> } | undefined>>;
  const t = e.typeId ? tipos.map((m) => m[e.typeId!]).find(Boolean) : undefined;
  return [...new Set((t?.layers ?? []).map((l) => l.materialId))];
}

/**
 * Classes IFC de luminária que viram luz pontual. A importação IFC traz o objeto como genérico com malha; o modelo
 * nativo do Hestia não tem família de luminária, então é só daqui que saem luzes.
 */
const CLASSES_LUZ: ReadonlySet<string> = new Set(['IFCLIGHTFIXTURE']);

/** Intensidade, em candela, quando o IFC não traz `LuminousIntensity` no conjunto de propriedades. */
export const CANDELA_PADRAO = 800;

/** Centro da caixa envolvente de uma nuvem de vértices (x, y, z...). */
function centroDaCaixa(p: number[]): { x: number; y: number; z: number } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const c = p[i + k]!;
      if (c < lo[k]!) lo[k] = c;
      if (c > hi[k]!) hi[k] = c;
    }
  }
  return { x: (lo[0]! + hi[0]!) / 2, y: (lo[1]! + hi[1]!) / 2, z: (lo[2]! + hi[2]!) / 2 };
}

/** Luzes do modelo (protocolo 1.3): luminárias IFC com malha, no centro da caixa. Sem nenhuma, lista vazia. */
export function extractLights(p: Project): SceneLight[] {
  const out: SceneLight[] = [];
  for (const el of Object.values(p.elements)) {
    if (el.kind !== 'generic') continue;
    const g = el as Generic;
    if (!CLASSES_LUZ.has(g.sourceClass.toUpperCase()) || g.mesh.positions.length < 3) continue;
    const prop = g.ifcProperties?.find((x) => /luminous.?intensity/i.test(x.name) && typeof x.value === 'number' && Number.isFinite(x.value) && x.value >= 0);
    out.push({
      id: `light:${g.id}`,
      kind: 'point',
      position: centroDaCaixa(g.mesh.positions),
      color: '#ffffff',
      intensity: prop ? (prop.value as number) : CANDELA_PADRAO,
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Sol do projeto (protocolo 1.3). O modelo guarda azimute e elevação do sol na vista 3D (graus, azimute 0 = leste,
 * anti-horário); convertidos para radiano, a unidade do contrato. Latitude, longitude, norte e fuso não existem no
 * modelo, então não saem.
 */
export function extractSite(p: Project): SceneSite | undefined {
  const v = view3dOf(p);
  if (!Number.isFinite(v.sunAzimuth) || !Number.isFinite(v.sunElevation)) return undefined;
  const rad = (d: number): number => (d * Math.PI) / 180;
  return { sun: { azimuth: rad(v.sunAzimuth), elevation: rad(v.sunElevation) } };
}

/** Projeto + malhas da cena → conteúdo do contrato. Sem cena 3D montada, as entidades vão sem geometria (`mesh: null`). */
export function buildSceneContent(project: Project, root: THREE.Object3D | null): SceneContent {
  const meshes = root ? extractElementMeshes(root) : new Map<string, SceneMesh>();
  const entities: SceneEntity[] = [];
  for (const el of Object.values(project.elements)) {
    const e = el as unknown as Typed;
    const mesh = meshes.get(e.id) ?? null;
    if (!mesh && e.kind === 'room') continue; // ambientes são anotação, não sólido
    const mats = materialIdsOf(project, e);
    entities.push({
      id: e.id,
      kind: e.kind,
      ...(e.name ? { name: e.name } : {}),
      ...(e.levelId ? { levelId: e.levelId } : {}),
      ...(mats.length ? { materialIds: mats } : {}),
      transform: [...IDENTITY_MATRIX],
      mesh,
      visible: true,
    });
  }
  entities.sort((a, b) => (a.id < b.id ? -1 : 1));
  const materials: SceneMaterial[] = Object.values(project.materials).map((m) => {
    const category = categoriaDoMaterial(m);
    return { id: m.id, name: m.name, color: m.color, gloss: m.gloss, opacity: m.opacity, ...(category ? { category } : {}), ...pbrDaCategoria(category) };
  });
  materials.sort((a, b) => (a.id < b.id ? -1 : 1));
  const site = extractSite(project);
  return { projectName: project.name, entities, materials, textures: [], lights: extractLights(project), ...(site ? { site } : {}) };
}
