import * as THREE from 'three';
import {
  assetParts,
  furnitureWorldTransform,
  furniturePartWorldTransform,
  isFurniture,
  mat4Det3,
  type Furniture,
  type FurnitureAsset,
  type FurnitureMeshDef,
  type FurnitureQuality,
  type Id,
  type Project,
} from '@hestia/model';
import { filaDeVersoesLeves, gerarMalhaLeve, malhaCompleta, malhaLevePronta, metasLeves, META_TRIANGULOS_LEVE, type MalhaDeDefinicao } from './furnitureLod.ts';
import type { ElementRange, SolidBatch } from './solids.ts';

/**
 * Móveis importados na vista 3D. Instâncias do mesmo asset COMPARTILHAM a geometria: há uma `THREE.InstancedMesh` por
 * (definição, grupo de material, qualidade, espelhada) e cada instância do móvel, vezes cada peça do bloco, é uma matriz.
 * Os arrays de vértices vêm do cache (`furnitureLod.ts`, e o decodificador do modelo) e são os mesmos para todas as
 * instâncias e níveis; o número de `BufferGeometry` não depende do número de instâncias.
 *
 * O picking, o realce e a seleção usam uma malha de caixas (12 triângulos por instância, no mundo) com as faixas de
 * elemento no padrão do repositório; as `InstancedMesh` levam `userData.semPick` e `userData.furnitureIds` (instanceId → id).
 */

/** O que desenhar de uma definição: a versão leve, a completa ou (enquanto a leve é gerada) a caixa dela. */
export type QualidadeDesenhada = 'leve' | 'completo' | 'caixa';

export interface OpcoesMoveis {
  /** Qualidade das instâncias sem `quality` (padrão do projeto). Padrão 'leve'. */
  qualidadePadrao?: FurnitureQuality;
  /** Meta de triângulos desenhados por bloco na versão leve. */
  metaLeve?: number;
  /** Gera a versão leve já, na hora (sem fila): render offscreen e testes. Padrão falso (fila em fatias + caixa). */
  sincrono?: boolean;
  /** Elementos ocultos na vista. */
  ocultos?: ReadonlySet<Id>;
}

/** Instâncias de uma definição com a mesma qualidade e orientação: viram uma `InstancedMesh` (por grupo de material). */
export interface GrupoDeInstancias {
  chave: string;
  asset: FurnitureAsset;
  def: FurnitureMeshDef;
  qualidade: QualidadeDesenhada;
  /** Meta de triângulos da versão leve desta definição. */
  alvo: number;
  espelhada: boolean;
  /** 16 números por instância (mundo, colunas). */
  matrizes: number[];
  /** Id do móvel de cada instância (na ordem das matrizes). */
  ids: Id[];
}

/** Caixa de picking de uma instância: 8 cantos no mundo (24 números) e se a transformação espelha. */
export interface CaixaDeInstancia {
  id: Id;
  cantos: number[];
  espelhada: boolean;
}

export interface PlanoDeMoveis {
  grupos: GrupoDeInstancias[];
  caixas: CaixaDeInstancia[];
  /** Assets com versão leve ainda por gerar (estão na fila). */
  pendentes: FurnitureAsset[];
}

const qualidadeDe = (m: Furniture, opt: OpcoesMoveis): FurnitureQuality => m.quality ?? opt.qualidadePadrao ?? 'leve';

/** Cota do nível. */
const cotaDoNivel = (p: Project, levelId: Id): number => p.levels.find((l) => l.id === levelId)?.elevation ?? 0;

/** Cantos da caixa local do asset no mundo (ordem: bit0 = x, bit1 = y, bit2 = z). */
function cantosDaCaixa(m: Furniture, asset: FurnitureAsset, cota: number): number[] {
  const w = furnitureWorldTransform(m, asset, cota);
  const { min, max } = asset.bbox;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? max[0] : min[0];
    const y = i & 2 ? max[1] : min[1];
    const z = i & 4 ? max[2] : min[2];
    out.push(w[0]! * x + w[4]! * y + w[8]! * z + w[12]!, w[1]! * x + w[5]! * y + w[9]! * z + w[13]!, w[2]! * x + w[6]! * y + w[10]! * z + w[14]!);
  }
  return out;
}

/** Quais instâncias de móvel e quais malhas: o plano é puro (sem three), a montagem vem depois. */
export function planFurniture(p: Project, levelId: Id, opt: OpcoesMoveis = {}): PlanoDeMoveis {
  const assets = p.furniture?.assets;
  const plano: PlanoDeMoveis = { grupos: [], caixas: [], pendentes: [] };
  if (!assets) return plano;
  const cota = cotaDoNivel(p, levelId);
  const meta = opt.metaLeve ?? META_TRIANGULOS_LEVE;
  const grupos = new Map<string, GrupoDeInstancias>();
  const metasPorAsset = new Map<string, Map<string, number>>();
  const pendentes = new Set<FurnitureAsset>();
  for (const e of Object.values(p.elements)) {
    if (!isFurniture(e) || e.levelId !== levelId || opt.ocultos?.has(e.id)) continue;
    const asset = assets[e.assetId];
    if (!asset) continue;
    const q = qualidadeDe(e, opt);
    let metas = metasPorAsset.get(asset.id);
    if (!metas) {
      metas = metasLeves(asset, meta);
      metasPorAsset.set(asset.id, metas);
    }
    const porId = new Map(asset.defs.map((d) => [d.id, d]));
    for (const part of assetParts(asset)) {
      const def = porId.get(part.defId);
      if (!def) continue;
      const m = furniturePartWorldTransform(e, part, asset, cota);
      const espelhada = mat4Det3(m) < 0;
      let qd: QualidadeDesenhada = 'completo';
      if (q === 'leve') {
        const alvo = metas.get(def.id) ?? 0;
        if (opt.sincrono) {
          gerarMalhaLeve(def, alvo);
          qd = 'leve';
        } else if (malhaLevePronta(def, alvo)) qd = 'leve';
        else {
          qd = 'caixa';
          pendentes.add(asset);
        }
      }
      const chave = `${asset.id}|${def.id}|${qd}|${espelhada ? 1 : 0}`;
      let g = grupos.get(chave);
      if (!g) {
        g = { chave, asset, def, qualidade: qd, alvo: metas.get(def.id) ?? 0, espelhada, matrizes: [], ids: [] };
        grupos.set(chave, g);
      }
      for (let i = 0; i < 16; i++) g.matrizes.push(m[i]!);
      g.ids.push(e.id);
    }
    plano.caixas.push({ id: e.id, cantos: cantosDaCaixa(e, asset, cota), espelhada: mat4Det3(furnitureWorldTransform(e, asset, cota)) < 0 });
  }
  plano.grupos = [...grupos.values()];
  plano.pendentes = [...pendentes];
  for (const a of plano.pendentes) filaDeVersoesLeves.pedir(a, meta);
  return plano;
}

/**
 * Assinatura de qualidade pronta dos móveis de um nível, para a chave do cache de malhas: muda quando uma versão leve
 * fica pronta (o nível é remontado com a malha leve no lugar da caixa). Vazia se o nível não tem móveis.
 */
export function assinaturaDeMoveis(p: Project, levelId: Id, opt: OpcoesMoveis = {}): string {
  const assets = p.furniture?.assets;
  if (!assets) return '';
  const meta = opt.metaLeve ?? META_TRIANGULOS_LEVE;
  const partes = new Set<string>();
  for (const e of Object.values(p.elements)) {
    if (!isFurniture(e) || e.levelId !== levelId || opt.ocultos?.has(e.id)) continue;
    const asset = assets[e.assetId];
    if (!asset) continue;
    const q = qualidadeDe(e, opt);
    let pronto = true;
    if (q === 'leve' && !opt.sincrono) {
      const metas = metasLeves(asset, meta);
      for (const d of asset.defs) if (!malhaLevePronta(d, metas.get(d.id) ?? 0)) pronto = false;
    }
    partes.add(`${asset.id}:${asset.contentHash.slice(0, 8)}:${q}:${pronto ? 'p' : 'c'}`);
  }
  return [...partes].sort().join(',') + (opt.sincrono ? ',s' : '');
}

// --- Geometria compartilhada ---------------------------------------------------------------------------------------

interface ParteGpu {
  materialIndex: number;
  index: THREE.BufferAttribute;
  /** Índices com a ordem invertida, para instâncias espelhadas (criados sob demanda). */
  invertido?: THREE.BufferAttribute;
}

interface ConjuntoGpu {
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  uv: THREE.BufferAttribute | null;
  partes: ParteGpu[];
  caixa: THREE.Box3;
  triangulos: number;
}

const conjuntosDeMalha = new WeakMap<MalhaDeDefinicao, ConjuntoGpu>();
const conjuntosDeCaixa = new WeakMap<FurnitureMeshDef, ConjuntoGpu>();

function caixaDosVertices(pos: Float32Array): THREE.Box3 {
  const b = new THREE.Box3();
  let ok = false;
  const v = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.length; i += 3) {
    b.expandByPoint(v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!));
    ok = true;
  }
  return ok ? b : new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
}

function conjuntoDe(m: MalhaDeDefinicao): ConjuntoGpu {
  let c = conjuntosDeMalha.get(m);
  if (c) return c;
  const n = m.positions.length / 3;
  c = {
    position: new THREE.BufferAttribute(m.positions, 3),
    normal: new THREE.BufferAttribute(m.normals, 3),
    uv: m.uvs.length === n * 2 && n > 0 ? new THREE.BufferAttribute(m.uvs, 2) : null,
    partes: m.groups
      .filter((g) => g.count > 0)
      .map((g) => ({ materialIndex: g.materialIndex, index: new THREE.BufferAttribute(m.indices.subarray(g.start, g.start + g.count), 1) })),
    caixa: caixaDosVertices(m.positions),
    triangulos: m.indices.length / 3,
  };
  conjuntosDeMalha.set(m, c);
  return c;
}

/** A caixa da definição (12 triângulos), desenhada enquanto a versão leve não fica pronta. */
function conjuntoDeCaixa(d: FurnitureMeshDef, malha: MalhaDeDefinicao): ConjuntoGpu {
  let c = conjuntosDeCaixa.get(d);
  if (c) return c;
  const box = caixaDosVertices(malha.positions);
  const { positions, normals, indices } = caixaComoMalha(box.min.toArray(), box.max.toArray());
  c = {
    position: new THREE.BufferAttribute(positions, 3),
    normal: new THREE.BufferAttribute(normals, 3),
    uv: null,
    partes: [{ materialIndex: malha.groups[0]?.materialIndex ?? 0, index: new THREE.BufferAttribute(indices, 1) }],
    caixa: box,
    triangulos: 12,
  };
  conjuntosDeCaixa.set(d, c);
  return c;
}

/** Caixa com vértices próprios por face (normais planas), triângulos anti-horários vistos de fora. */
function caixaComoMalha(min: number[], max: number[]): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const face = (n: [number, number, number], c: number[][]): void => {
    const base = positions.length / 3;
    for (const q of c) {
      positions.push(q[0]!, q[1]!, q[2]!);
      normals.push(...n);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const [x0, y0, z0] = min as [number, number, number];
  const [x1, y1, z1] = max as [number, number, number];
  face([0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
  face([0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  face([0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  face([0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
  face([-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  face([1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), indices: Uint32Array.from(indices) };
}

function conjuntoDoGrupo(g: GrupoDeInstancias): ConjuntoGpu {
  const completa = malhaCompleta(g.def);
  if (g.qualidade === 'caixa') return conjuntoDeCaixa(g.def, completa);
  if (g.qualidade === 'completo') return conjuntoDe(completa);
  const leve = malhaLevePronta(g.def, g.alvo) ?? completa;
  return conjuntoDe(leve);
}

function indiceInvertido(p: ParteGpu): THREE.BufferAttribute {
  if (!p.invertido) {
    const a = p.index.array as Uint32Array;
    const b = new Uint32Array(a.length);
    for (let i = 0; i + 2 < a.length; i += 3) {
      b[i] = a[i]!;
      b[i + 1] = a[i + 2]!;
      b[i + 2] = a[i + 1]!;
    }
    p.invertido = new THREE.BufferAttribute(b, 1);
  }
  return p.invertido;
}

// --- Montagem ------------------------------------------------------------------------------------------------------

export interface ContextoMoveis {
  /** Material do grupo de material `materialIndex` do asset, na qualidade desenhada. */
  material(asset: FurnitureAsset, materialIndex: number, qualidade: QualidadeDesenhada): THREE.Material;
  /** Material invisível das caixas de picking. */
  pick: THREE.Material;
  /** Material das linhas (wireframe). */
  linha?: THREE.Material;
  /** Wireframe: não desenha as malhas, só as caixas em linhas (e o picking). */
  wireframe?: boolean;
  sombras?: boolean;
}

export interface EstatisticaDeMoveis {
  instancias: number;
  /** Triângulos desenhados (instâncias × peças × triângulos da malha escolhida). */
  triangulos: number;
  /** Chamadas de desenho (uma por `InstancedMesh`). */
  chamadas: number;
  /** `BufferGeometry` criadas (independe do número de instâncias). */
  geometrias: number;
  caixas: number;
}

export interface MoveisDoNivel {
  grupo: THREE.Group;
  stats: EstatisticaDeMoveis;
  plano: PlanoDeMoveis;
}

const INDICES_CAIXA = [0, 2, 3, 0, 3, 1, 4, 5, 7, 4, 7, 6, 0, 1, 5, 0, 5, 4, 2, 6, 7, 2, 7, 3, 0, 4, 6, 0, 6, 2, 1, 3, 7, 1, 7, 5];

/** Malha invisível de picking: uma caixa (12 triângulos) por instância, no mundo, com a faixa de elemento. */
function malhaDePicking(caixas: CaixaDeInstancia[], material: THREE.Material): THREE.Mesh {
  const pos = new Float32Array(caixas.length * 24);
  const idx = new Uint32Array(caixas.length * 36);
  const ranges: ElementRange[] = [];
  caixas.forEach((c, k) => {
    pos.set(c.cantos, k * 24);
    for (let t = 0; t < 36; t += 3) {
      // Espelho inverte o sentido dos triângulos: troca dois vértices para a normal continuar para fora.
      idx[k * 36 + t] = k * 8 + INDICES_CAIXA[t]!;
      idx[k * 36 + t + 1] = k * 8 + INDICES_CAIXA[c.espelhada ? t + 2 : t + 1]!;
      idx[k * 36 + t + 2] = k * 8 + INDICES_CAIXA[c.espelhada ? t + 1 : t + 2]!;
    }
    ranges.push({ id: c.id, start: k * 36, count: 36 });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(geo, material);
  // Visível para a seleção por caixa e o picking, mas sem cor nem profundidade (o material é o de picking).
  mesh.userData = { kind: 'generic', ranges, moveisPick: true };
  mesh.frustumCulled = false;
  return mesh;
}

/** Arestas (12 por instância) das caixas, para o wireframe. */
function linhasDasCaixas(caixas: CaixaDeInstancia[], material: THREE.Material): THREE.LineSegments {
  const arestas = [0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  const pos = new Float32Array(caixas.length * 24 * 3);
  caixas.forEach((c, k) => {
    arestas.forEach((v, i) => {
      pos[k * 72 + i * 3] = c.cantos[v * 3]!;
      pos[k * 72 + i * 3 + 1] = c.cantos[v * 3 + 1]!;
      pos[k * 72 + i * 3 + 2] = c.cantos[v * 3 + 2]!;
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.LineSegments(geo, material);
}

/** Id do móvel dono de uma instância de uma `InstancedMesh` de móveis (o `instanceId` do raycast). */
export function moveisIdDaInstancia(mesh: THREE.Object3D, instanceId: number): Id | undefined {
  return (mesh.userData.furnitureIds as Id[] | undefined)?.[instanceId];
}

/** Monta o grupo three dos móveis do nível. Devolve null se o nível não tem móveis desenháveis. */
export function buildFurnitureLevel(p: Project, levelId: Id, ctx: ContextoMoveis, opt: OpcoesMoveis = {}): MoveisDoNivel | null {
  const plano = planFurniture(p, levelId, opt);
  if (!plano.caixas.length) return null;
  const grupo = new THREE.Group();
  grupo.name = 'moveis';
  const stats: EstatisticaDeMoveis = { instancias: plano.caixas.length, triangulos: 0, chamadas: 0, geometrias: 0, caixas: plano.caixas.length };
  if (!ctx.wireframe) {
    for (const g of plano.grupos) {
      const c = conjuntoDoGrupo(g);
      const n = g.ids.length;
      for (const parte of c.partes) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', c.position);
        geo.setAttribute('normal', c.normal);
        if (c.uv) geo.setAttribute('uv', c.uv);
        geo.setIndex(g.espelhada ? indiceInvertido(parte) : parte.index);
        geo.boundingBox = c.caixa.clone();
        geo.boundingSphere = c.caixa.getBoundingSphere(new THREE.Sphere());
        stats.geometrias++;
        const mesh = new THREE.InstancedMesh(geo, ctx.material(g.asset, parte.materialIndex, g.qualidade), n);
        (mesh.instanceMatrix.array as Float32Array).set(g.matrizes);
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        mesh.castShadow = ctx.sombras === true;
        mesh.receiveShadow = ctx.sombras === true;
        mesh.userData = {
          kind: 'generic',
          semPick: true,
          moveis: true,
          furnitureIds: g.ids,
          furnitureAssetId: g.asset.id,
          furnitureDefId: g.def.id,
          qualidade: g.qualidade,
          espelhada: g.espelhada,
        };
        grupo.add(mesh);
        stats.chamadas++;
        stats.triangulos += n * (parte.index.count / 3);
      }
    }
  } else if (ctx.linha) grupo.add(linhasDasCaixas(plano.caixas, ctx.linha));
  grupo.add(malhaDePicking(plano.caixas, ctx.pick));
  return { grupo, stats, plano };
}

/**
 * Lotes (caixas com a faixa do móvel) para o fantasma do móvel sendo inserido ou movido: barato (12 triângulos por
 * instância), no mesmo formato dos genéricos.
 */
export function buildFurnitureGhostBatches(p: Project, levelId: Id): SolidBatch[] {
  const assets = p.furniture?.assets;
  if (!assets) return [];
  const cota = cotaDoNivel(p, levelId);
  const batch: SolidBatch = { materialId: 'mat_concreto', category: 'generic', positions: [], normals: [], indices: [], ids: [] };
  for (const e of Object.values(p.elements)) {
    if (!isFurniture(e) || e.levelId !== levelId) continue;
    const asset = assets[e.assetId];
    if (!asset) continue;
    const c = cantosDaCaixa(e, asset, cota);
    const espelhada = mat4Det3(furnitureWorldTransform(e, asset, cota)) < 0;
    const start = batch.indices.length;
    for (let t = 0; t < 36; t += 3) {
      const a = INDICES_CAIXA[t]!;
      const b = INDICES_CAIXA[espelhada ? t + 2 : t + 1]!;
      const d = INDICES_CAIXA[espelhada ? t + 1 : t + 2]!;
      const base = batch.positions.length / 3;
      batch.positions.push(c[a * 3]!, c[a * 3 + 1]!, c[a * 3 + 2]!, c[b * 3]!, c[b * 3 + 1]!, c[b * 3 + 2]!, c[d * 3]!, c[d * 3 + 1]!, c[d * 3 + 2]!);
      const ux = c[b * 3]! - c[a * 3]!;
      const uy = c[b * 3 + 1]! - c[a * 3 + 1]!;
      const uz = c[b * 3 + 2]! - c[a * 3 + 2]!;
      const vx = c[d * 3]! - c[a * 3]!;
      const vy = c[d * 3 + 1]! - c[a * 3 + 1]!;
      const vz = c[d * 3 + 2]! - c[a * 3 + 2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (let k = 0; k < 3; k++) batch.normals.push(nx / l, ny / l, nz / l);
      batch.indices.push(base, base + 1, base + 2);
    }
    batch.ids.push({ id: e.id, start, count: 36 });
  }
  return batch.indices.length ? [batch] : [];
}
