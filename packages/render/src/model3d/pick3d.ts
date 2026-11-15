import * as THREE from 'three';
import type { GraphicsCategory, Id } from '@hestia/model';
import type { ElementRange } from './solids.ts';
import { buildBlocosBvh, raycastBlocosBvh, type BlocosBvh } from './triBvhBlocos.ts';

// Objetos reaproveitados entre chamadas: o picking roda a cada quadro de hover e a cada roda do zoom. A cena é de um
// thread só e as funções não se chamam de dentro uma da outra, então um só conjunto basta.
const rc = new THREE.Raycaster();
const inv = new THREE.Matrix4();
const local = new THREE.Ray();

/** Primeira superfície do modelo sobre o raio: ponto (m, no mundo) e distância da origem (m). */
interface SurfaceHit {
  point: THREE.Vector3;
  distance: number;
}

/**
 * Elemento sob o cursor: o id, o ponto (m) da face atingida e a categoria gráfica (parede, porta, janela, piso, ...).
 */
export interface ElementHit {
  id: Id;
  point: { x: number; y: number; z: number };
  kind: GraphicsCategory;
}

/** Nível atingido nas linhas de nível (nome/cota) da vista 3D: o id e o ponto (m) do traço. */
export interface LevelHit {
  kind: 'level';
  levelId: Id;
  point: { x: number; y: number; z: number };
}

/**
 * Cota atingida no 3D: o intervalo, a etiqueta (sprite) da cota e a posição (NDC) do **centro da etiqueta**, para o
 * editor abrir exatamente sobre ela. O clique pode ter acertado a linha ou os tiques; a etiqueta vem sempre do mesmo
 * intervalo (`levelId`/`neighborId`/`side`).
 */
export interface DimensionHit {
  levelId: Id;
  neighborId: Id;
  side: 'below' | 'above';
  value: number;
  /** Etiqueta 3D da cota: o editor a esconde enquanto o input ocupa o lugar dela. */
  label: THREE.Sprite;
  ndc: { x: number; y: number };
}

/** `userData.dimension` dos objetos da cota (linha, chamadas, tiques e etiqueta compartilham o mesmo info). */
interface DimensionInfo {
  levelId: Id;
  neighborId: Id;
  side: 'below' | 'above';
  value: number;
}

/** Tolerância (m) do raio às linhas de nível: o clique não precisa acertar o fio exato. */
const LIMIAR_LINHA_NIVEL = 0.15;

/**
 * Picking na GPU (ID buffer). `ler` devolve um resultado **já lido** para este pixel e câmera (cache do leitor); `pedir`
 * agenda a leitura assíncrona do pixel para o próximo quadro. Enquanto a leitura não chega, `pickElement` responde pelo
 * BVH: o resultado na tela nunca fica sem resposta e a primeira leitura do pixel paga o caminho da CPU uma vez só.
 *
 * Ver `pickIdBuffer3d.ts` (implementação WebGL2 com MRT e leitura assíncrona).
 */
export interface LeitorDeIdsGpu {
  ler(ndc: { x: number; y: number }, camera: THREE.Camera): ElementHit | null;
  pedir(ndc: { x: number; y: number }, camera: THREE.Camera): void;
}

/**
 * Picking na vista 3D: raio do cursor (coordenadas normalizadas, −1..1) contra as malhas da cena. Devolve só o ponto (x, y)
 * da primeira superfície atingida, em metros: a ferramenta acha o elemento pela planta (telhado sob o ponto, parede sob o
 * ponto), sem precisar de id por malha (as malhas são agrupadas por material). Ignora linhas (arestas, grade) e o chão,
 * que é um plano de 400 m (`PlaneGeometry`); as malhas do modelo são `BufferGeometry`.
 *
 * Com `gpu` (ID buffer), o resultado lido na GPU vale primeiro; sem ele, o BVH. Os dois devolvem o mesmo ponto (dentro da
 * tolerância de ¼ de pixel da leitura por GPU).
 */
export function pickModelPoint(
  root: THREE.Object3D,
  camera: THREE.Camera,
  ndc: { x: number; y: number },
  gpu?: LeitorDeIdsGpu | null,
): { x: number; y: number } | null {
  const naGpu = gpu?.ler(ndc, camera);
  if (naGpu) return { x: naGpu.point.x, y: naGpu.point.y };
  gpu?.pedir(ndc, camera);
  rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const hit = firstSurface(root, rc);
  return hit ? { x: hit.point.x, y: hit.point.y } : null;
}

/**
 * Distância (m) de `origin` à primeira superfície do modelo na direção `dir` (unitária), ou null. Mesmas regras de
 * `pickModelPoint`: ignora linhas e o chão. Usada pelo zoom para não atravessar paredes.
 */
export function firstSurfaceDistance(root: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3): number | null {
  rc.ray.set(origin, dir);
  const hit = firstSurface(root, rc);
  return hit ? hit.distance : null;
}

/**
 * Superfície mais próxima do raio de `rc` (já montado, em coordenadas do mundo) entre as malhas de `root`. Cada malha
 * com BVH de triângulos é testada no próprio BVH, no espaço local; a que não tem BVH (geometria sem índice ou
 * entrelaçada, ou material por grupo) passa pelo `Raycaster`, como antes. Malhas `PlaneGeometry` (o chão) não contam.
 */
function firstSurface(root: THREE.Object3D, ray: THREE.Raycaster): SurfaceHit | null {
  root.updateMatrixWorld(true);
  let best: SurfaceHit | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // Malhas instanciadas (`userData.semPick`) não entram: a geometria delas é a caixa unitária, e o mundo está nas malhas de picking dos níveis.
    if (!m.isMesh || m.geometry.type === 'PlaneGeometry' || m.userData.semPick === true || !o.layers.test(ray.layers)) return;
    const bvh = Array.isArray(m.material) || !m.material ? null : bvhOf(m);
    if (!bvh) {
      for (const h of ray.intersectObject(m, false)) {
        if (!best || h.distance < best.distance) best = { point: h.point.clone(), distance: h.distance };
      }
      return;
    }
    inv.copy(m.matrixWorld).invert();
    local.copy(ray.ray).applyMatrix4(inv);
    const hit = raycastBlocosBvh(bvh, local, Infinity, (m.material as THREE.Material).side);
    if (!hit) return;
    const point = hit.point.applyMatrix4(m.matrixWorld);
    const distance = ray.ray.origin.distanceTo(point);
    if (!best || distance < best.distance) best = { point, distance };
  });
  return best;
}

/**
 * Elemento da face atingida pelo raio do cursor (decisão 0016). Só as malhas do modelo entram: as que têm
 * `userData.ranges` (chão, grade, arestas e realce não têm). O triângulo atingido (`faceIndex`) cai numa faixa, e a faixa
 * dá o id; as esquadrias têm uma faixa com o id da abertura. Sem nada atingido, null.
 *
 * Com `gpu` (ID buffer), o resultado lido na GPU vale primeiro e o BVH é o fallback (leitura ainda não pronta, GPU sem
 * MRT, elemento sem código). Sem `gpu`, o caminho é o de sempre.
 */
export function pickElement(
  root: THREE.Object3D,
  camera: THREE.Camera,
  ndc: { x: number; y: number },
  gpu?: LeitorDeIdsGpu | null,
): ElementHit | null {
  if (gpu) {
    const naGpu = gpu.ler(ndc, camera);
    if (naGpu) return naGpu;
    gpu.pedir(ndc, camera);
  }
  return pickElementNoBvh(root, camera, ndc);
}

/**
 * Nível atingido pelo raio do cursor no datum da vista 3D (linha tracejada, bolha, texto e o plano do nível selecionado).
 * Só os objetos com `userData.levelId` do grupo `userData.levels` (ou o plano com `userData.levelsPlane`) entram: as
 * linhas do CAD e as malhas do modelo não têm esse campo (o `pickElement` continua devolvendo só elementos). A tolerância
 * de linha é a de um clique confortável.
 */
export function pickLevel(scene: THREE.Object3D, camera: THREE.Camera, ndc: { x: number; y: number }): LevelHit | null {
  scene.updateMatrixWorld(true);
  const alvos = new Set<THREE.Object3D>();
  scene.traverse((o) => {
    if (o.userData.levels === true) {
      o.traverse((c) => {
        // O plano azul é só realce de seleção: não entra no picking, senão bloqueia paredes/telhados atrás dele.
        if (c.userData.levelId && c.userData.levelsPlane !== true) alvos.add(c);
      });
    } else if (o.userData.levelId && o.userData.levelsPlane !== true && ((o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || (o as THREE.Mesh).isMesh)) {
      // Datum fora do grupo: a linha/bolha/texto também é alvo (o plano não).
      alvos.add(o);
    }
  });
  if (!alvos.size) return null;

  rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const limiarAnt = rc.params.Line.threshold;
  rc.params.Line.threshold = LIMIAR_LINHA_NIVEL;
  try {
    for (const h of rc.intersectObjects([...alvos], false)) {
      const levelId = h.object.userData.levelId as Id | undefined;
      if (!levelId) continue;
      return { kind: 'level', levelId, point: { x: h.point.x, y: h.point.y, z: h.point.z } };
    }
  } finally {
    rc.params.Line.threshold = limiarAnt;
  }
  return null;
}

/**
 * Cota sob o cursor: procura as linhas/etiquetas com `userData.dimension` e devolve o intervalo, a etiqueta e o centro
 * dela em NDC. A etiqueta é um sprite e as linhas de cota têm tolerância; o clique não precisa acertar o pixel exato.
 * Como o editor HTML substitui a etiqueta no lugar dela, a posição devolvida é sempre a do sprite (mesmo quando o raio
 * acerta a linha ou os tiques), nunca a do ponto clicado.
 */
export function pickDimension(scene: THREE.Object3D, camera: THREE.Camera, ndc: { x: number; y: number }): DimensionHit | null {
  scene.updateMatrixWorld(true);
  const alvos: THREE.Object3D[] = [];
  const etiquetas: THREE.Sprite[] = [];
  scene.traverse((o) => {
    if (!o.userData.dimension) return;
    alvos.push(o);
    if ((o as THREE.Sprite).isSprite) etiquetas.push(o as THREE.Sprite);
  });
  if (!alvos.length || !etiquetas.length) return null;
  rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const limiarAnt = rc.params.Line.threshold;
  rc.params.Line.threshold = LIMIAR_LINHA_NIVEL;
  try {
    for (const h of rc.intersectObjects(alvos, false)) {
      const d = h.object.userData.dimension as DimensionInfo | undefined;
      if (!d) continue;
      // A etiqueta é o sprite do mesmo intervalo: o editor abre sobre ela, não sobre o ponto atingido.
      const label = etiquetas.find((s) => mesmaCota(s.userData.dimension as DimensionInfo, d));
      if (!label) continue;
      const p = label.getWorldPosition(new THREE.Vector3()).project(camera);
      return { levelId: d.levelId, neighborId: d.neighborId, side: d.side, value: d.value, label, ndc: { x: p.x, y: p.y } };
    }
  } finally {
    rc.params.Line.threshold = limiarAnt;
  }
  return null;
}

/** Os dois objetos são da mesma cota (mesmo intervalo e mesmo lado)? */
function mesmaCota(a: DimensionInfo | undefined, b: DimensionInfo): boolean {
  return !!a && a.levelId === b.levelId && a.neighborId === b.neighborId && a.side === b.side;
}

/** O caminho de sempre: BVH por malha, faixa do triângulo atingido → id. */
function pickElementNoBvh(root: THREE.Object3D, camera: THREE.Camera, ndc: { x: number; y: number }): ElementHit | null {
  root.updateMatrixWorld(true);
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).userData.ranges) targets.push(o as THREE.Mesh);
  });
  if (!targets.length) return null;

  rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  let best: { id: Id; point: { x: number; y: number; z: number }; kind: GraphicsCategory; distance: number } | null = null;

  for (const m of targets) {
    const bvh = bvhOf(m);
    if (!bvh) continue;
    const ranges = sortedRanges(m.userData.ranges as ElementRange[]);
    inv.copy(m.matrixWorld).invert();
    local.copy(rc.ray).applyMatrix4(inv);
    const side = Array.isArray(m.material) ? THREE.DoubleSide : (m.material?.side ?? THREE.FrontSide);
    const hit = raycastBlocosBvh(bvh, local, Infinity, side, (face) => rangeAt(ranges, face) !== undefined);
    if (!hit) continue;
    const r = rangeAt(ranges, hit.faceIndex);
    if (!r) continue;
    const point = hit.point.applyMatrix4(m.matrixWorld);
    const distance = rc.ray.origin.distanceTo(point);
    if (!best || distance < best.distance) {
      best = { id: r.id, point: { x: point.x, y: point.y, z: point.z }, kind: m.userData.kind as GraphicsCategory, distance };
    }
  }
  return best ? { id: best.id, point: best.point, kind: best.kind } : null;
}

const bvhs = new WeakMap<THREE.BufferGeometry, { bvh: BlocosBvh | null; versao: number }>();

/**
 * BVH da geometria da malha, montado uma vez por versão da geometria. Os lotes globais da cena 3D são atualizados no
 * mesmo `BufferGeometry` (envio parcial); `geometry.userData.versao` diz quando o BVH ficou velho. O BVH cobre só o que
 * o `drawRange` desenha, não a capacidade inteira do buffer.
 */
function bvhOf(m: THREE.Mesh): BlocosBvh | null {
  const g = m.geometry;
  const versao = Number(g.userData.versao ?? 0);
  const emCache = bvhs.get(g);
  if (emCache && emCache.versao === versao) return emCache.bvh;
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  const limite = Number.isFinite(g.drawRange.count) ? Math.min(g.drawRange.count, idx?.count ?? 0) : idx?.count ?? 0;
  let bvh: BlocosBvh | null = null;
  if (pos && idx && !(pos instanceof THREE.InterleavedBufferAttribute) && limite > 0) {
    const todos = idx.array as Uint16Array | Uint32Array;
    const indices = limite === todos.length ? todos : todos.subarray(0, limite);
    bvh = buildBlocosBvh(pos.array, indices);
  }
  bvhs.set(g, { bvh, versao });
  return bvh;
}

const sortedRangesOf = new WeakMap<ElementRange[], ElementRange[]>();

/** Faixas da malha ordenadas por início (uma vez por lista de faixas: a lista pertence à malha, então sai com ela). */
function sortedRanges(ranges: ElementRange[]): ElementRange[] {
  let s = sortedRangesOf.get(ranges);
  if (!s) {
    s = [...ranges].sort((a, b) => a.start - b.start);
    sortedRangesOf.set(ranges, s);
  }
  return s;
}

/** Faixa que contém o triângulo `face` (busca binária nas faixas ordenadas), ou undefined. */
function rangeAt(ranges: ElementRange[], face: number): ElementRange | undefined {
  const at = face * 3;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const x = ranges[mid]!;
    if (at < x.start) hi = mid - 1;
    else if (at >= x.start + x.count) lo = mid + 1;
    else return x;
  }
  return undefined;
}

/**
 * Prepara o picking em segundo plano: monta as caixas de bloco (a única parte do BVH que custa por malha inteira) das
 * malhas que ainda não as têm, parando quando `orcamentoMs` se esgota (uma malha por vez, no mínimo uma). Devolve
 * `{ feitas, total }` das malhas que entram no picking nesta passada: `feitas === total` quando não sobra nada. O
 * resultado do picking é o mesmo com ou sem este preparo; ele só tira o custo do primeiro raio.
 */
export function prepararPicking(root: THREE.Object3D, orcamentoMs: number, agora: () => number = () => performance.now()): { feitas: number; total: number } {
  const alvos: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry.type !== 'PlaneGeometry' && m.userData.semPick !== true && m.material && !Array.isArray(m.material)) alvos.push(m);
  });
  const inicio = agora();
  let feitas = 0;
  let construidas = 0;
  for (const m of alvos) {
    const g = m.geometry;
    const emCache = bvhs.get(g);
    if (!emCache || emCache.versao !== Number(g.userData.versao ?? 0)) {
      if (construidas > 0 && agora() - inicio >= orcamentoMs) break;
      bvhOf(m);
      construidas++;
    }
    feitas++;
  }
  // `feitas` conta os já prontos mais os feitos agora; o laço parou no primeiro que estourou o orçamento.
  return { feitas, total: alvos.length };
}
