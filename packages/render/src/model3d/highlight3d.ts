import * as THREE from 'three';
import type { Id } from '@hestia/model';
import type { ElementRange } from './solids.ts';
import { faixasDosIds, intervalosDeDesenho } from './indiceDeElementos3d.ts';

/** Ângulo (graus) das arestas do realce: as arestas duras do elemento, inclusive o contorno contra os vizinhos. */
const HIGHLIGHT_EDGE_ANGLE = 28;

/** Teto (bytes) das arestas guardadas em cache: passando disso, novos intervalos são calculados sem entrar no cache. */
const TETO_ARESTAS_BYTES = 32 * 1024 * 1024;

/** Cor e opacidades de um realce: `fill` no preenchimento, `edges` nas arestas. */
export interface HighlightStyle {
  color: THREE.ColorRepresentation;
  fill: number;
  edges: number;
}

/**
 * Sobreposição dos elementos `ids`: os triângulos das faixas (`userData.ranges`) das malhas de `model`, desenhados com
 * preenchimento translúcido e arestas. Não altera a malha do modelo: a sobreposição é um objeto à parte.
 *
 * **Sem cópia de triângulos.** A sobreposição reusa o `position` e o `index` da geometria de origem (mesma instância de
 * `BufferAttribute`, portanto o mesmo buffer na GPU) e recorta por `drawRange` (preenchimento) e por uma *view* do índice
 * (arestas). O que se paga por hover/seleção é só a montagem dos objetos; as arestas de cada elemento ficam em cache por
 * versão da geometria (`geometry.userData.versao`, o mesmo contador do R1).
 *
 * Sem triângulos para os ids (elemento oculto ou fora do modelo), devolve um objeto vazio. Com `preenchimento: false` só as
 * arestas são montadas (o preenchimento da cena é feito por GPU, ver `realceGpu3d.ts`).
 */
export function highlightOf(model: THREE.Object3D, ids: readonly Id[], style: HighlightStyle, opcoes: { preenchimento?: boolean } = {}): THREE.Object3D {
  const out = new THREE.Object3D();
  if (!ids.length) return out;
  const comPreenchimento = opcoes.preenchimento !== false;
  const queridos = new Set(ids);
  model.updateMatrixWorld(true);
  const preenchimento = materialDePreenchimento(style);
  const arestas = materialDeArestas(style);

  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const faixas = mesh.userData.ranges as ElementRange[] | undefined;
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    const index = geo?.index;
    if (!mesh.isMesh || !faixas || !index || !geo) return;
    const encontradas = faixasDosIds(faixas, queridos);
    if (!encontradas.length) return;
    const matriz = mesh.matrixWorld;
    for (const s of intervalosDeDesenho(encontradas)) {
      const recorte = recorteDoIntervalo(geo, index, s.start, s.count);
      if (comPreenchimento) {
        const fill = new THREE.Mesh(recorte.fill, preenchimento);
        fill.renderOrder = 5;
        fill.matrixAutoUpdate = false;
        fill.matrix.copy(matriz);
        // O recorte cobre o elemento no mundo: sem esfera própria para o teste de frustum (a da geometria é a do lote inteiro).
        fill.frustumCulled = false;
        out.add(fill);
      }
      if (recorte.edges) {
        const edges = new THREE.LineSegments(recorte.edges, arestas);
        edges.renderOrder = 6;
        edges.matrixAutoUpdate = false;
        edges.matrix.copy(matriz);
        edges.frustumCulled = false;
        out.add(edges);
      }
    }
  });
  return out;
}

/** Libera os recursos de uma sobreposição (o chamador a tira da cena antes). Geometrias e materiais compartilhados do
 * modelo ou do cache do realce não são liberados: eles pertencem a outro dono e continuam válidos. */
export function disposeHighlight(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const x = o as THREE.Mesh;
    const geo = x.geometry as THREE.BufferGeometry | undefined;
    if (geo && geo.userData.compartilhada !== true) geo.dispose();
    if (!x.material) return;
    for (const m of Array.isArray(x.material) ? x.material : [x.material]) {
      if (m.userData.compartilhadaDoRealce !== true) m.dispose();
    }
  });
}

/** Esvazia o cache de materiais do realce (troca de tema/teste; o app não precisa chamar). As arestas seguem a versão da
 * geometria de origem e saem sozinhas quando ela é liberada. */
export function limparCacheDoRealce(): void {
  for (const m of materiais.values()) {
    m.fill.dispose();
    m.edges.dispose();
  }
  materiais.clear();
}

/** Bytes de arestas guardados no cache do realce (diagnóstico e teste). */
export function bytesDoCacheDoRealce(): number {
  return bytesEmCache;
}

// ---- preenchimento e arestas: um par de geometrias por intervalo, em cache por versão da geometria ----

function geometriaDoIntervalo(origem: THREE.BufferGeometry, index: THREE.BufferAttribute, start: number, count: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // Mesma instância de BufferAttribute: o three reaproveita o buffer da GPU (nada é enviado de novo).
  g.setAttribute('position', origem.getAttribute('position'));
  g.setIndex(index);
  g.setDrawRange(start, count);
  // O dono dos buffers é a geometria do modelo: liberar esta aqui apagaria o buffer dele.
  g.userData = { compartilhada: true };
  return g;
}

interface RecorteDoIntervalo {
  fill: THREE.BufferGeometry;
  edges: THREE.BufferGeometry | null;
  bytes: number;
}

interface CacheDaGeometria {
  versao: number;
  intervalos: Map<string, RecorteDoIntervalo>;
  bytes: number;
  aoLiberar?: () => void;
}

const cacheDasGeometrias = new WeakMap<THREE.BufferGeometry, CacheDaGeometria>();
let bytesEmCache = 0;

/**
 * Recorte de um intervalo do índice: o preenchimento (a mesma geometria do modelo, com `drawRange`) e as arestas duras
 * (ângulo > `HIGHLIGHT_EDGE_ANGLE`) no espaço local. `EdgesGeometry` não olha o `drawRange`, então o intervalo entra como
 * uma view do índice — as posições continuam sendo as da geometria, nada de triângulo é copiado.
 */
function recorteDoIntervalo(origem: THREE.BufferGeometry, index: THREE.BufferAttribute, start: number, count: number): RecorteDoIntervalo {
  const versao = Number(origem.userData.versao ?? 0);
  let cache = cacheDasGeometrias.get(origem);
  if (cache && cache.versao !== versao) {
    liberarCache(cache);
    cache = undefined;
  }
  if (!cache) {
    const novo: CacheDaGeometria = { versao, intervalos: new Map(), bytes: 0 };
    // A geometria do modelo pode sair do cache de níveis: as arestas dela saem junto.
    novo.aoLiberar = () => {
      liberarCache(novo);
      cacheDasGeometrias.delete(origem);
    };
    origem.addEventListener('dispose', novo.aoLiberar);
    cacheDasGeometrias.set(origem, novo);
    cache = novo;
  }
  const chave = `${start}:${count}`;
  const guardado = cache.intervalos.get(chave);
  if (guardado) return guardado;

  const fill = geometriaDoIntervalo(origem, index, start, count);
  const view = new THREE.BufferGeometry();
  view.setAttribute('position', origem.getAttribute('position'));
  const array = index.array as Uint16Array | Uint32Array;
  view.setIndex(new THREE.BufferAttribute(array.subarray(start, start + count), 1));
  // Nunca `view.dispose()`: o listener removeria o buffer compartilhado do modelo. A view não vai à GPU.
  view.userData = { compartilhada: true };
  const eg = new THREE.EdgesGeometry(view, HIGHLIGHT_EDGE_ANGLE);
  const edges = eg.getAttribute('position').count ? eg : null;
  if (!edges) eg.dispose();
  else edges.userData = { compartilhada: true };
  const recorte: RecorteDoIntervalo = { fill, edges, bytes: edges ? (edges.getAttribute('position').array as Float32Array).byteLength + 256 : 256 };

  if (bytesEmCache + recorte.bytes > TETO_ARESTAS_BYTES) {
    // Acima do teto: o recorte vale para este desenho, mas não entra no cache. O preenchimento continua apontando para os
    // buffers do modelo (nunca é liberado); as arestas, que são alocação própria, saem com a sobreposição.
    if (edges) edges.userData = {};
    return recorte;
  }
  cache.intervalos.set(chave, recorte);
  cache.bytes += recorte.bytes;
  bytesEmCache += recorte.bytes;
  return recorte;
}

function liberarCache(cache: CacheDaGeometria): void {
  for (const r of cache.intervalos.values()) r.edges?.dispose();
  bytesEmCache = Math.max(0, bytesEmCache - cache.bytes);
  cache.intervalos.clear();
  cache.bytes = 0;
}

// ---- materiais por estilo (não recriados a cada hover) ----

const materiais = new Map<string, { fill: THREE.MeshBasicMaterial; edges: THREE.LineBasicMaterial }>();

function materiaisDoEstilo(style: HighlightStyle): { fill: THREE.MeshBasicMaterial; edges: THREE.LineBasicMaterial } {
  const key = `${style.color}|${style.fill}|${style.edges}`;
  let m = materiais.get(key);
  if (m) return m;
  // Sem polygonOffset: a sobreposição tem a mesma geometria da face que cobre, então passa no teste de profundidade sem
  // empurrar a sobreposição para a frente. Com o offset, camadas de baixo (cm abaixo do topo) vazavam pelo topo.
  const fill = new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: style.fill, depthTest: true, depthWrite: false });
  const edges = new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.edges, depthTest: true, depthWrite: false });
  fill.userData = { compartilhadaDoRealce: true };
  edges.userData = { compartilhadaDoRealce: true };
  m = { fill, edges };
  materiais.set(key, m);
  return m;
}

function materialDePreenchimento(style: HighlightStyle): THREE.Material {
  return materiaisDoEstilo(style).fill;
}

function materialDeArestas(style: HighlightStyle): THREE.Material {
  return materiaisDoEstilo(style).edges;
}
