import {
  assetParts, furnitureDefArrays, furniturePartWorldTransform, furnitureTextureBytes, isFurniture, mat4Det3,
  type Furniture, type FurnitureAsset, type FurnitureMat4, type FurnitureMeshDef, type Project,
} from '@hestia/model';
import type { SceneEntity, SceneMesh } from '@hestia/plugin-api';
import { NORMALS_MAX_FLOATS, UVS_MAX_FLOATS } from '@hestia/plugin-api';

/**
 * Móveis importados (`kind: 'furniture'`) para o renderizador, direto do MODELO (não da cena 3D do Hestia).
 * Cada instância vira uma ou mais `SceneEntity` com malha própria em METROS, Z para cima (protocolo até 1.3 aceita malha
 * por entidade; a 1.4 vai trocar a repetição por `meshDefs/meshRef`). Sempre a malha COMPLETA: a versão leve é só da vista.
 * Docs: docs/plugins/09-extensao-render.md (seção "Móveis importados").
 */

// ---- limites ----
/** Teto de JSON por entidade (caracteres); com folga sob os 8 MiB do snapshot em partes. */
export const FURNITURE_ENTITY_JSON_BUDGET = 7 * 1024 * 1024;
/** Estimativa conservadora de caracteres de JSON por vértice (3 posições + 3 normais + 2 UVs, arredondados) e por índice. */
const CHARS_POR_VERTICE = 83;
const CHARS_POR_INDICE = 8;
/** Teto de vértices por entidade pelos limites de normais e UVs do protocolo. */
export const FURNITURE_MAX_VERTICES = Math.min(Math.floor(NORMALS_MAX_FLOATS / 3), Math.floor(UVS_MAX_FLOATS / 2));

/** Orçamento de triângulos enviados (cada instância repete a malha). */
export const TRIANGULOS_AVISO = 2_000_000;
export const TRIANGULOS_CRITICO = 7_000_000;

export interface FurnitureExportOptions {
  /** Teto de JSON por entidade, em caracteres (testes usam valores pequenos). */
  maxEntityChars?: number;
  /** Teto de vértices por entidade (testes). */
  maxVertices?: number;
}

const r6 = (x: number): number => Math.round(x * 1e6) / 1e6 + 0;
const r5 = (x: number): number => Math.round(x * 1e5) / 1e5 + 0;

/** Hash FNV-1a de 32 bits sobre posições, índices, normais, UVs e grupos (com o material de cada grupo). */
function hashMesh(m: Omit<SceneMesh, 'hash'>): string {
  let h = 0x811c9dc5;
  const mix = (n: number): void => { h = Math.imul(h ^ n, 0x01000193); };
  for (const n of m.positions) mix(Math.round(n * 1e6));
  for (const n of m.indices) mix(n);
  for (const n of m.normals ?? []) mix(Math.round(n * 1e4));
  for (const n of m.uvs ?? []) mix(Math.round(n * 1e4));
  for (const g of m.groups) {
    mix(g.start);
    mix(g.count);
    const s = g.materialId ?? '';
    for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
    if (g.doubleSided) mix(0x2d);
    mix(0x2c);
  }
  return (h >>> 0).toString(16) + ':' + m.positions.length;
}

/** Normais por vértice a partir dos triângulos (definição sem normais). */
function normaisDosTriangulos(pos: Float32Array, idx: Uint32Array): Float32Array {
  const out = new Float32Array(pos.length);
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i]! * 3, b = idx[i + 1]! * 3, c = idx[i + 2]! * 3;
    if (a + 2 >= pos.length || b + 2 >= pos.length || c + 2 >= pos.length) continue;
    const ux = pos[b]! - pos[a]!, uy = pos[b + 1]! - pos[a + 1]!, uz = pos[b + 2]! - pos[a + 2]!;
    const vx = pos[c]! - pos[a]!, vy = pos[c + 1]! - pos[a + 1]!, vz = pos[c + 2]! - pos[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { out[v] = out[v]! + nx; out[v + 1] = out[v + 1]! + ny; out[v + 2] = out[v + 2]! + nz; }
  }
  return out; // normalizadas depois, no mundo
}

interface Bloco {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  groups: Array<{ start: number; count: number; materialId: string | null; doubleSided?: boolean }>;
}

export interface MeshDoMovel { mesh: SceneMesh; materialIds: string[] }

const novoBloco = (): Bloco => ({ positions: [], normals: [], uvs: [], indices: [], groups: [] });

/**
 * Malhas (um ou mais blocos) de UMA instância, em coordenadas de mundo: posições e normais pela matriz de cada peça,
 * triângulos com a ordem invertida quando o determinante é negativo (espelhada), UVs em metros por material
 * (`uv_m = uv_repeticoes * sizeM`; sem `sizeM` ou sem UVs, projeção em caixa em metros de mundo) e vértices duplicados
 * entre materiais diferentes. Divide por material e depois por blocos de triângulos, sem passar dos tetos.
 */
export function furnitureMeshes(inst: Furniture, asset: FurnitureAsset, levelElevation = 0, opts: FurnitureExportOptions = {}): MeshDoMovel[] {
  const budget = opts.maxEntityChars ?? FURNITURE_ENTITY_JSON_BUDGET;
  const maxV = Math.min(opts.maxVertices ?? FURNITURE_MAX_VERTICES, FURNITURE_MAX_VERTICES);
  const defs = new Map<string, FurnitureMeshDef>(asset.defs.map((d) => [d.id, d]));
  interface Peca {
    def: FurnitureMeshDef; m: FurnitureMat4; cof: number[]; espelhada: boolean;
    pos: Float32Array; nor: Float32Array; uv: Float32Array; idx: Uint32Array;
  }
  const pecas: Peca[] = [];
  for (const part of assetParts(asset)) {
    const def = defs.get(part.defId);
    if (!def || def.vertexCount === 0) continue;
    const m = furniturePartWorldTransform(inst, part, asset, levelElevation);
    const det = mat4Det3(m);
    if (!Number.isFinite(det) || det === 0) continue;
    // Cofatores da parte 3x3 (= det * inversa transposta): a normal sai no mesmo lado da superfície mesmo espelhada.
    const [a, b, c, d, e, f, g, h, i] = [m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!];
    const s = det < 0 ? -1 : 1;
    const cof = [
      s * (e * i - f * h), s * (f * g - d * i), s * (d * h - e * g),
      s * (c * h - b * i), s * (a * i - c * g), s * (b * g - a * h),
      s * (b * f - c * e), s * (c * d - a * f), s * (a * e - b * d),
    ];
    const arr = furnitureDefArrays(def);
    const nor = arr.normals.length === arr.positions.length ? arr.normals : normaisDosTriangulos(arr.positions, arr.indices);
    pecas.push({ def, m, cof, espelhada: det < 0, pos: arr.positions, nor, uv: arr.uvs, idx: arr.indices });
  }

  // Grupos por (material, dois lados): índice do material no asset (-1 = desconhecido). Grupos de dois lados saem separados
  // (`doubleSided` no grupo da malha) para o renderizador desenhar as duas faces só onde o bloco precisa.
  const grupos: Array<Array<{ peca: number; start: number; count: number }>> = [];
  const slotsUsados = new Map<string, { mi: number; ds: boolean; slot: number }>();
  pecas.forEach((p, pi) => {
    const gs: Array<{ start: number; count: number; materialIndex: number; doubleSided?: boolean }> = p.def.groups.length ? p.def.groups : [{ start: 0, count: p.idx.length, materialIndex: -1 }];
    for (const g of gs) {
      const mi = g.materialIndex >= 0 && g.materialIndex < asset.materials.length ? g.materialIndex : -1;
      const ds = g.doubleSided === true;
      const chave = `${mi}|${ds ? 1 : 0}`;
      let s = slotsUsados.get(chave);
      if (!s) { s = { mi, ds, slot: grupos.length }; slotsUsados.set(chave, s); grupos.push([]); }
      grupos[s.slot]!.push({ peca: pi, start: g.start, count: g.count });
    }
  });
  const ordem = [...slotsUsados.values()].sort((a, b) => a.mi - b.mi || Number(a.ds) - Number(b.ds));

  const saida: MeshDoMovel[] = [];
  let cur = novoBloco();
  let curMats = new Set<string>();
  const fecha = (): void => {
    if (cur.indices.length === 0) { cur = novoBloco(); curMats = new Set(); return; }
    const base = { positions: cur.positions, normals: cur.normals, uvs: cur.uvs, indices: cur.indices, groups: cur.groups.filter((g) => g.count > 0) };
    saida.push({ mesh: { ...base, hash: hashMesh(base) }, materialIds: [...curMats] });
    cur = novoBloco();
    curMats = new Set();
  };
  const caracteres = (): number => (cur.positions.length / 3) * CHARS_POR_VERTICE + cur.indices.length * CHARS_POR_INDICE + cur.groups.length * 60;

  for (const { mi, ds, slot } of ordem) {
    const mat = mi >= 0 ? asset.materials[mi]! : null;
    const matId = mat?.id ?? null;
    const sizeM = mat?.sizeM && mat.sizeM[0] > 0 && mat.sizeM[1] > 0 ? mat.sizeM : null;
    let remap = new Map<number, Int32Array>();
    // O último grupo de `cur` é sempre o aberto: `count` é fechado ao trocar de bloco e ao fim do material.
    const abre = (): void => { cur.groups.push({ start: cur.indices.length, count: 0, materialId: matId, ...(ds ? { doubleSided: true } : {}) }); if (matId) curMats.add(matId); };
    const encerra = (): void => { const g = cur.groups[cur.groups.length - 1]; if (g) g.count = cur.indices.length - g.start; };
    abre();
    for (const gr of grupos[slot]!) {
      const p = pecas[gr.peca]!;
      const nVert = p.def.vertexCount;
      const usaUv = sizeM !== null && p.uv.length === nVert * 2;
      let mapa = remap.get(gr.peca);
      if (!mapa) { mapa = new Int32Array(nVert).fill(-1); remap.set(gr.peca, mapa); }
      const fim = Math.min(gr.start + gr.count, p.idx.length);
      for (let t = gr.start; t + 2 < fim; t += 3) {
        const tri = [p.idx[t]!, p.espelhada ? p.idx[t + 2]! : p.idx[t + 1]!, p.espelhada ? p.idx[t + 1]! : p.idx[t + 2]!];
        if (tri[0]! >= nVert || tri[1]! >= nVert || tri[2]! >= nVert) continue;
        if (cur.positions.length / 3 + 3 > maxV || caracteres() + 3 * CHARS_POR_VERTICE + 3 * CHARS_POR_INDICE + 60 > budget) {
          if (cur.indices.length > 0) {
            encerra();
            fecha();
            remap = new Map();
            mapa = new Int32Array(nVert).fill(-1);
            remap.set(gr.peca, mapa);
            abre();
          }
        }
        for (const v of tri) {
          let to = mapa[v]!;
          if (to < 0) {
            to = cur.positions.length / 3;
            mapa[v] = to;
            const x = p.pos[v * 3]!, y = p.pos[v * 3 + 1]!, z = p.pos[v * 3 + 2]!;
            const m = p.m;
            const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
            const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
            const wz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
            const lx = p.nor[v * 3]!, ly = p.nor[v * 3 + 1]!, lz = p.nor[v * 3 + 2]!;
            let nx = p.cof[0]! * lx + p.cof[1]! * ly + p.cof[2]! * lz;
            let ny = p.cof[3]! * lx + p.cof[4]! * ly + p.cof[5]! * lz;
            let nz = p.cof[6]! * lx + p.cof[7]! * ly + p.cof[8]! * lz;
            const l = Math.hypot(nx, ny, nz);
            if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 0; nz = 1; }
            cur.positions.push(r6(wx), r6(wy), r6(wz));
            cur.normals.push(r5(nx), r5(ny), r5(nz));
            if (usaUv) {
              cur.uvs.push(r5(p.uv[v * 2]! * sizeM![0]), r5(p.uv[v * 2 + 1]! * sizeM![1]));
            } else {
              const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
              if (ax >= ay && ax >= az) cur.uvs.push(r5(wy), r5(wz));
              else if (ay >= az) cur.uvs.push(r5(wx), r5(wz));
              else cur.uvs.push(r5(wx), r5(wy));
            }
          }
          cur.indices.push(to);
        }
      }
    }
    encerra();
    // remove grupo vazio deixado aberto
    cur.groups = cur.groups.filter((g) => g.count > 0);
  }
  fecha();
  return saida;
}

// ---- cache por asset (immer: o objeto do asset só muda quando o asset muda) ----
const cachePorAsset = new WeakMap<FurnitureAsset, Map<string, MeshDoMovel[]>>();

function chavePose(inst: Furniture, elev: number, o: FurnitureExportOptions): string {
  return [inst.x, inst.y, inst.z, elev, inst.rotation, inst.scale, inst.mirrored ? 1 : 0, o.maxEntityChars ?? '', o.maxVertices ?? ''].join('|');
}

export interface FurnitureExport {
  entities: SceneEntity[];
  /** Triângulos enviados (soma das malhas de todas as instâncias). */
  triangles: number;
  instances: number;
}

const porId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : 1);

/** Todas as instâncias de móveis do projeto como entidades do contrato (`kind: 'furniture'`). Ordenadas por id. */
export function furnitureEntities(project: Project, opts: FurnitureExportOptions = {}): FurnitureExport {
  const entities: SceneEntity[] = [];
  let triangles = 0;
  let instances = 0;
  const novos = new Map<FurnitureAsset, Map<string, MeshDoMovel[]>>();
  const elevacao = new Map(project.levels.map((l) => [l.id, l.elevation]));
  for (const el of Object.values(project.elements)) {
    if (!isFurniture(el)) continue;
    const asset = project.furniture?.assets[el.assetId];
    if (!asset) continue;
    instances += 1;
    const elev = elevacao.get(el.levelId) ?? 0;
    const chave = chavePose(el, elev, opts);
    let usados = novos.get(asset);
    if (!usados) { usados = new Map(); novos.set(asset, usados); }
    const anterior = cachePorAsset.get(asset);
    let blocos = usados.get(chave) ?? anterior?.get(chave);
    if (!blocos) blocos = furnitureMeshes(el, asset, elev, opts);
    usados.set(chave, blocos);
    blocos.forEach((b, i) => {
      triangles += b.mesh.indices.length / 3;
      entities.push({
        id: blocos.length > 1 ? `${el.id}#${i + 1}` : el.id,
        kind: 'furniture',
        name: el.name,
        levelId: el.levelId,
        ...(b.materialIds.length ? { materialIds: b.materialIds } : {}),
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        mesh: b.mesh,
        visible: true,
      });
    });
  }
  for (const [asset, usados] of novos) cachePorAsset.set(asset, usados);
  entities.sort(porId);
  return { entities, triangles, instances };
}

// ---- orçamento de triângulos ----
export type NivelOrcamento = 'ok' | 'aviso' | 'critico';

export interface FurnitureBudget {
  instances: number;
  triangles: number;
  level: NivelOrcamento;
  /** Diagnóstico para mostrar ao usuário (vazio quando está tudo bem). */
  messages: string[];
}

/** Triângulos de uma instância (soma das peças do asset), sem montar malha. */
export function furnitureInstanceTriangles(asset: FurnitureAsset): number {
  const defs = new Map(asset.defs.map((d) => [d.id, d]));
  let n = 0;
  for (const p of assetParts(asset)) n += Math.floor((defs.get(p.defId)?.indexCount ?? 0) / 3);
  return n;
}

// units-ok: contagem de triangulos em milhoes, nao e medida do projeto
const milhoes = (n: number): string => (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Função pura: triângulos totais enviados ao renderizador e o aviso (2 milhões = aviso; 7 milhões = recomenda modo leve). */
export function furnitureBudget(project: Project): FurnitureBudget {
  let instances = 0;
  let triangles = 0;
  const porAsset = new Map<string, number>();
  for (const el of Object.values(project.elements)) {
    if (!isFurniture(el)) continue;
    const asset = project.furniture?.assets[el.assetId];
    if (!asset) continue;
    let t = porAsset.get(asset.id);
    if (t === undefined) { t = furnitureInstanceTriangles(asset); porAsset.set(asset.id, t); }
    instances += 1;
    triangles += t;
  }
  const messages: string[] = [];
  let level: NivelOrcamento = 'ok';
  if (triangles > TRIANGULOS_CRITICO) {
    level = 'critico';
    messages.push(`Os móveis somam ${milhoes(triangles)} milhões de triângulos enviados ao renderizador (${instances} cópias; cada cópia repete a malha). Passa de ${milhoes(TRIANGULOS_CRITICO)} milhões: use o modo leve ou menos cópias.`);
  } else if (triangles > TRIANGULOS_AVISO) {
    level = 'aviso';
    messages.push(`Os móveis somam ${milhoes(triangles)} milhões de triângulos enviados ao renderizador (${instances} cópias; cada cópia repete a malha). Acima de ${milhoes(TRIANGULOS_AVISO)} milhões a cena pode ficar lenta.`);
  }
  return { instances, triangles, level, messages };
}

// ---- texturas embutidas (Fase 2, protocolo 1.4): estrutura pronta, DESLIGADA ----
/** Texturas embutidas não são enviadas no protocolo atual. A Fase 2 (1.4) liga isto. */
export const FURNITURE_TEXTURES_ENABLED = false;

export interface FurnitureTextureOut {
  /** SHA-256 hexadecimal minúsculo do arquivo. */
  hash: string;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  width?: number;
  height?: number;
  /** Tamanho físico de uma repetição da imagem, metros. */
  size_m: [number, number];
  /** Materiais do projeto que usam esta textura. */
  materialIds: string[];
}

/**
 * Texturas embutidas dos móveis do projeto, sem repetir (por hash e tamanho). Só materiais de assets em uso, com
 * `useEmbeddedTexture` ligado, `textureIndex` válido e `sizeM`. Hoje NÃO entra na cena (`textures: []`).
 */
export function furnitureTexturesFor(project: Project): FurnitureTextureOut[] {
  const emUso = new Set<string>();
  for (const el of Object.values(project.elements)) if (isFurniture(el)) emUso.add(el.assetId);
  const out = new Map<string, FurnitureTextureOut>();
  for (const id of [...emUso].sort()) {
    const asset = project.furniture?.assets[id];
    if (!asset) continue;
    for (const m of asset.materials) {
      if (!m.useEmbeddedTexture || m.textureIndex === undefined) continue;
      const tex = asset.textures[m.textureIndex];
      if (!tex || !m.sizeM) continue;
      const key = `${tex.sha256}|${m.sizeM[0]}|${m.sizeM[1]}`;
      const ja = out.get(key);
      if (ja) { if (!ja.materialIds.includes(m.id)) ja.materialIds.push(m.id); continue; }
      out.set(key, {
        hash: tex.sha256,
        mime: tex.mime,
        bytes: furnitureTextureBytes(tex),
        ...(tex.width !== undefined ? { width: tex.width } : {}),
        ...(tex.height !== undefined ? { height: tex.height } : {}),
        size_m: [m.sizeM[0], m.sizeM[1]],
        materialIds: [m.id],
      });
    }
  }
  return [...out.values()];
}

// ---- diagnóstico para a interface ----
let ultimoOrcamento: FurnitureBudget = { instances: 0, triangles: 0, level: 'ok', messages: [] };
const ouvintes = new Set<() => void>();

/** Último orçamento calculado na exportação da cena (a interface pode mostrar `messages`). */
export function ultimoOrcamentoMoveis(): FurnitureBudget { return ultimoOrcamento; }
export function aoMudarOrcamentoMoveis(cb: () => void): () => void { ouvintes.add(cb); return () => { ouvintes.delete(cb); }; }
export function registrarOrcamentoMoveis(b: FurnitureBudget): void {
  if (b.level === ultimoOrcamento.level && b.triangles === ultimoOrcamento.triangles && b.instances === ultimoOrcamento.instances) return;
  ultimoOrcamento = b;
  for (const cb of ouvintes) cb();
}
