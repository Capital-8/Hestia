import * as THREE from 'three';
import type { Project } from '@hestia/model';
import type { SceneContent, SceneEntity, SceneMaterial, SceneMesh } from '@hestia/plugin-api';
import { IDENTITY_MATRIX } from '@hestia/plugin-api';

/** Hash FNV-1a de 32 bits sobre posições e índices: igual = geometria igual (o plugin reaproveita o que já tem). */
function hashMesh(pos: number[], idx: number[]): string {
  let h = 0x811c9dc5;
  for (const n of pos) { h = Math.imul(h ^ Math.round(n * 1e6), 0x01000193); }
  for (const n of idx) { h = Math.imul(h ^ n, 0x01000193); }
  return (h >>> 0).toString(16) + ':' + pos.length;
}

/** Posições em metros com resolução de 1 µm: o float32 da GPU vira "0.10000000149011612" em JSON; arredondado fica "0.1". */
const q = (n: number): number => Math.round(n * 1e6) / 1e6;

interface Range { id: string; start: number; count: number }

/**
 * Malhas por elemento, em coordenadas de mundo, lidas da cena 3D viva (as mesmas que a GPU desenha). Cada malha do
 * modelo traz `userData.ranges` (faixas de índice por elemento); só elas entram. Malhas instanciadas, datum, chão,
 * grade e realces não têm faixas e ficam de fora.
 */
export function extractElementMeshes(root: THREE.Object3D, quantize = true): Map<string, SceneMesh> {
  root.updateMatrixWorld(true);
  const acc = new Map<string, { pos: number[]; idx: number[]; remap: Map<string, number> }>();
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const ranges = mesh.userData?.ranges as Range[] | undefined;
    if (!mesh.isMesh || !ranges || o.userData.ghost) return;
    const pos = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    if (!pos) return;
    for (const r of ranges) {
      let a = acc.get(r.id);
      if (!a) { a = { pos: [], idx: [], remap: new Map() }; acc.set(r.id, a); }
      for (let i = r.start; i < r.start + r.count; i++) {
        const vi = index ? index.getX(i) : i;
        const key = `${o.id}:${vi}`;
        let to = a.remap.get(key);
        if (to === undefined) {
          v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
          to = a.pos.length / 3;
          if (quantize) a.pos.push(q(v.x), q(v.y), q(v.z));
          else a.pos.push(v.x, v.y, v.z);
          a.remap.set(key, to);
        }
        a.idx.push(to);
      }
    }
  });
  const out = new Map<string, SceneMesh>();
  for (const [id, a] of acc) {
    out.set(id, { positions: a.pos, indices: a.idx, groups: [{ start: 0, count: a.idx.length, materialId: null }], hash: hashMesh(a.pos, a.idx) });
  }
  return out;
}

type Typed = { typeId?: string; levelId?: string; kind: string; id: string; name?: string };

/** Materiais das camadas do tipo do elemento (em ordem, sem repetir). */
function materialIdsOf(p: Project, e: Typed): string[] {
  const tipos = [p.wallTypes, p.floorTypes, p.slabTypes, p.ceilingTypes, p.roofTypes, p.stairTypes, p.rampTypes] as unknown as Array<Record<string, { layers?: Array<{ materialId: string }> } | undefined>>;
  const t = e.typeId ? tipos.map((m) => m[e.typeId!]).find(Boolean) : undefined;
  return [...new Set((t?.layers ?? []).map((l) => l.materialId))];
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
  const materials: SceneMaterial[] = Object.values(project.materials).map((m) => ({ id: m.id, name: m.name, color: m.color, gloss: m.gloss, opacity: m.opacity }));
  materials.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { projectName: project.name, entities, materials, textures: [] };
}
