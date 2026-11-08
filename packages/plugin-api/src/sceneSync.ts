import type { SnapshotBeginMsg, SnapshotEndMsg, SnapshotPartMsg } from './protocol.ts';
import type { SceneDelta, SceneEntity, SceneMaterial, SceneOp, SceneSnapshot, SceneTexture } from './scene.ts';

/** Conteúdo comparável da cena (sem câmera, revisão nem substituições). */
export interface SyncContent {
  entities: SceneEntity[];
  materials: SceneMaterial[];
  textures: SceneTexture[];
}

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Entidade igual? Compara a malha pelo hash (barato) e o resto pelo valor. */
function sameEntity(a: SceneEntity, b: SceneEntity): boolean {
  if ((a.mesh?.hash ?? null) !== (b.mesh?.hash ?? null)) return false;
  return same({ ...a, mesh: null }, { ...b, mesh: null });
}

/** Operações que levam `prev` a `next`: criar, alterar e remover entidades, materiais e texturas. Vazio = nada mudou. */
export function diffScene(prev: SyncContent, next: SyncContent): SceneOp[] {
  const ops: SceneOp[] = [];
  const e0 = new Map(prev.entities.map((e) => [e.id, e]));
  const e1 = new Map(next.entities.map((e) => [e.id, e]));
  for (const [id, e] of e1) {
    const old = e0.get(id);
    if (!old) ops.push({ op: 'entity.add', entity: e });
    else if (!sameEntity(old, e)) ops.push({ op: 'entity.update', entity: e });
  }
  for (const id of e0.keys()) if (!e1.has(id)) ops.push({ op: 'entity.remove', id });
  const m0 = new Map(prev.materials.map((m) => [m.id, m]));
  const m1 = new Map(next.materials.map((m) => [m.id, m]));
  for (const [id, m] of m1) {
    const old = m0.get(id);
    if (!old) ops.push({ op: 'material.add', material: m });
    else if (!same(old, m)) ops.push({ op: 'material.update', material: m });
  }
  for (const id of m0.keys()) if (!m1.has(id)) ops.push({ op: 'material.remove', id });
  const t0 = new Map(prev.textures.map((t) => [t.id, t]));
  const t1 = new Map(next.textures.map((t) => [t.id, t]));
  for (const [id, t] of t1) if (!t0.has(id)) ops.push({ op: 'texture.add', texture: t });
  for (const id of t0.keys()) if (!t1.has(id)) ops.push({ op: 'texture.remove', id });
  return ops;
}

/**
 * Aplica um delta a um snapshot local (lado do plugin). Devolve o novo snapshot, ou `'resync'` quando o delta não parte
 * da revisão que o plugin tem (perdeu mensagem): o plugin deve pedir `scene.resync`.
 */
export function applyDelta(snap: SceneSnapshot, d: SceneDelta): SceneSnapshot | 'resync' {
  if (d.baseRevision !== snap.revision) return 'resync';
  const entities = new Map(snap.entities.map((e) => [e.id, e]));
  const materials = new Map(snap.materials.map((m) => [m.id, m]));
  const textures = new Map(snap.textures.map((t) => [t.id, t]));
  for (const o of d.ops) {
    switch (o.op) {
      case 'entity.add': case 'entity.update': entities.set(o.entity.id, o.entity); break;
      case 'entity.remove': entities.delete(o.id); break;
      case 'material.add': case 'material.update': materials.set(o.material.id, o.material); break;
      case 'material.remove': materials.delete(o.id); break;
      case 'texture.add': textures.set(o.texture.id, o.texture); break;
      case 'texture.remove': textures.delete(o.id); break;
    }
  }
  return { ...snap, revision: d.revision, entities: [...entities.values()], materials: [...materials.values()], textures: [...textures.values()] };
}

/**
 * Monta o snapshot em partes (protocolo 1.2) do lado do plugin. `begin` zera, `part` acumula (índices em ordem) e `end`
 * confere as contagens e devolve o snapshot completo. Lança Error se a sequência for inconsistente: o plugin deve pedir
 * `scene.resync`.
 */
export class SnapshotAssembler {
  private head: SnapshotBeginMsg | null = null;
  private next = 0;
  private entities: SceneEntity[] = [];
  private materials: SceneMaterial[] = [];
  private textures: SceneTexture[] = [];
  /** Há um snapshot em montagem (deltas não devem chegar até o `end`). */
  get assembling(): boolean { return this.head !== null; }

  begin(m: SnapshotBeginMsg): void {
    this.head = m;
    this.next = 0;
    this.entities = [];
    this.materials = [];
    this.textures = [];
  }

  part(m: SnapshotPartMsg): void {
    if (!this.head) throw new Error('parte sem begin');
    if (m.index !== this.next) throw new Error(`parte ${m.index} fora de ordem (esperava ${this.next})`);
    this.next += 1;
    if (m.entities) this.entities.push(...m.entities);
    if (m.materials) this.materials.push(...m.materials);
    if (m.textures) this.textures.push(...m.textures);
  }

  end(m: SnapshotEndMsg): SceneSnapshot {
    const h = this.head;
    if (!h) throw new Error('end sem begin');
    this.head = null;
    if (this.next !== h.parts) throw new Error(`faltam partes (${this.next} de ${h.parts})`);
    if (m.revision !== h.snapshot.revision) throw new Error('revisão do end difere do begin');
    const c = h.counts;
    if (this.entities.length !== c.entities || this.materials.length !== c.materials || this.textures.length !== c.textures) throw new Error('contagens do snapshot não conferem');
    return { ...h.snapshot, entities: this.entities, materials: this.materials, textures: this.textures };
  }
}
