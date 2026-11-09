import * as THREE from 'three';
import type { GraphicsCategory } from '@hestia/model';
import type { ElementRange, SolidBatch } from '../model3d/solids.ts';
import type { OrcamentoVram } from './orcamento.ts';

/**
 * Lote de geometria na GPU por categoria e material (Fase 2.1/2.2). O lote guarda um segmento por nível num buffer
 * contíguo; quando um nível muda sem mudar a contagem de vértices/índices, só a faixa dele é reenviada
 * (`BufferAttribute.addUpdateRange` → `bufferSubData`). Incluir um nível apenas acrescenta no fim; trocar o tamanho de
 * um nível ou removê-lo compacta o lote. Nada é alocado por quadro: a geometria e o mesh são reaproveitados.
 *
 * As faixas de elemento (`ElementRange`) são globais no lote (deslocadas pelo índice do segmento), então o picking, o
 * realce e a caixa da seleção continuam funcionando sem saber que os níveis foram juntados.
 */

/** Caixa alinhada aos eixos: [xmin, ymin, zmin, xmax, ymax, zmax]. */
export type Caixa = readonly [number, number, number, number, number, number];

/** Dados de um nível para o lote (porções já no mundo, como o `SolidBatch`). */
export interface DadosLote {
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
  ids: readonly ElementRange[];
}

interface Segmento {
  inicioV: number;
  nV: number;
  inicioI: number;
  nI: number;
  dados: DadosLote;
  caixa: Caixa | null;
}

/** Caixa de uma lista de posições (x, y, z intercalados). */
export function caixaDePosicoes(pos: ArrayLike<number>): Caixa | null {
  if (pos.length < 3) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const x = pos[i]!;
    const y = pos[i + 1]!;
    const z = pos[i + 2]!;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (z < z0) z0 = z;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
    if (z > z1) z1 = z;
  }
  return Number.isFinite(x0) ? [x0, y0, z0, x1, y1, z1] : null;
}

/** Une duas caixas. */
export function unirCaixas(a: Caixa | null, b: Caixa | null): Caixa | null {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])];
}

/** Junta lotes de mesma categoria e material num só (índices e faixas deslocados). Não altera as entradas. */
export function mesclarLotes(lotes: readonly SolidBatch[]): DadosLote {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const ids: ElementRange[] = [];
  for (const b of lotes) {
    const vBase = positions.length / 3;
    const iBase = indices.length;
    for (const x of b.positions) positions.push(x);
    for (const n of b.normals) normals.push(n);
    for (const i of b.indices) indices.push(i + vBase);
    for (const r of b.ids) ids.push({ id: r.id, start: r.start + iBase, count: r.count });
  }
  return { positions, normals, indices, ids };
}

/** Geometria de um lote global (categoria e material), com segmentos por nível e atualização parcial. */
export class LoteGeometriaGpu {
  readonly malha: THREE.Mesh;
  private segmentos = new Map<string, Segmento>();
  private posicoes = new Float32Array(0);
  private normais = new Float32Array(0);
  private indices = new Uint32Array(0);
  private capV = 0;
  private capI = 0;
  private nV = 0;
  private nI = 0;
  private geometria: THREE.BufferGeometry;
  private sujo = false;
  /** O lote foi remontado (compactado/crescido): o próximo envio é o array inteiro, sem faixas. */
  private completo = false;
  private versao = 0;
  private chaveOrcamento: string;

  constructor(
    readonly chave: string,
    readonly categoria: GraphicsCategory,
    readonly materialId: string,
    material: THREE.Material,
    private readonly orcamento: OrcamentoVram,
  ) {
    this.chaveOrcamento = `lote:${chave}`;
    this.geometria = this.criarGeometria();
    this.malha = new THREE.Mesh(this.geometria, material);
    this.malha.matrixAutoUpdate = false;
    this.malha.userData = { kind: categoria, materialId: this.materialId };
  }

  /** Nível já aplicado neste lote. */
  get(levelId: string): boolean {
    return this.segmentos.has(levelId);
  }

  get vazio(): boolean {
    return this.segmentos.size === 0;
  }

  /** Índices desenhados (também é o `drawRange`). */
  get totalIndices(): number {
    return this.nI;
  }

  /** Bytes das arrays de capacidade (o que conta no orçamento de GPU). */
  get bytes(): number {
    return this.posicoes.byteLength + this.normais.byteLength + this.indices.byteLength;
  }

  /**
   * Aplica os dados de um nível. Mesma contagem de vértices e índices: escreve só na faixa do nível. Tamanho diferente:
   * compacta o lote (o nível sai e entra no fim) para não deixar buraco no `drawRange`.
   */
  definir(levelId: string, dados: DadosLote): void {
    const nV = Math.floor(dados.positions.length / 3);
    const nI = dados.indices.length;
    const velho = this.segmentos.get(levelId);
    if (velho && velho.nV === nV && velho.nI === nI) {
      this.escrever(velho.inicioV, velho.inicioI, dados);
      velho.dados = dados;
      velho.caixa = caixaDePosicoes(dados.positions);
      // Envio parcial: só a faixa deste nível.
      this.faixasParciais(velho.inicioV, nV, velho.inicioI, nI);
      this.sujo = true;
      return;
    }
    if (velho) this.remover(levelId);
    const cresceu = this.garantir(this.nV + nV, this.nI + nI);
    if (cresceu) this.completo = true;
    const inicioV = this.nV;
    const inicioI = this.nI;
    this.escrever(inicioV, inicioI, dados);
    this.segmentos.set(levelId, { inicioV, nV, inicioI, nI, dados, caixa: caixaDePosicoes(dados.positions) });
    this.nV += nV;
    this.nI += nI;
    if (!this.completo) this.faixasParciais(inicioV, nV, inicioI, nI);
    this.sujo = true;
  }

  /** Tira o nível do lote; compacta o que sobrou. */
  remover(levelId: string): boolean {
    if (!this.segmentos.delete(levelId)) return false;
    this.remontar();
    return true;
  }

  /**
   * Fecha a montagem: põe os segmentos na ordem canônica (a ordem dos níveis no projeto) e corta a capacidade para o
   * tamanho exato usado. Sem isso, a ordem de chegada da montagem progressiva mudaria o layout dos buffers (e as arrays
   * teriam folga de capacidade), embora a geometria fosse a mesma.
   */
  consolidar(ordem: readonly string[]): void {
    this.reordenar(ordem);
    const totalV = this.nV;
    const totalI = this.nI;
    const pos = new Float32Array(totalV * 3);
    const nor = new Float32Array(totalV * 3);
    const idx = new Uint32Array(totalI);
    const antiga = this.geometria;
    this.posicoes = pos;
    this.normais = nor;
    this.indices = idx;
    this.capV = totalV;
    this.capI = totalI;
    this.geometria = this.criarGeometria();
    this.malha.geometry = this.geometria;
    antiga.dispose();
    let inicioV = 0;
    let inicioI = 0;
    for (const s of this.segmentos.values()) {
      s.inicioV = inicioV;
      s.inicioI = inicioI;
      s.caixa = caixaDePosicoes(s.dados.positions);
      this.escrever(inicioV, inicioI, s.dados);
      inicioV += s.nV;
      inicioI += s.nI;
    }
    this.completo = true;
    this.sujo = true;
  }

  private reordenar(ordem: readonly string[]): void {
    if (!this.segmentos.size) return;
    const novo = new Map<string, Segmento>();
    for (const id of ordem) {
      const s = this.segmentos.get(id);
      if (s) novo.set(id, s);
    }
    // Um nível aplicado que não veio na ordem (não deveria acontecer) fica no fim, sem perder dados.
    for (const [id, s] of this.segmentos) if (!novo.has(id)) novo.set(id, s);
    this.segmentos = novo;
  }

  /** Material do grupo (a vista pode trocar estilo/tema). */
  aplicarMaterial(material: THREE.Material): void {
    if (this.malha.material !== material) this.malha.material = material;
  }

  /** Sombras do grupo. */
  aplicarSombras(sombras: boolean): void {
    this.malha.castShadow = sombras;
    this.malha.receiveShadow = sombras;
  }

  /**
   * Fecha a atualização: refaz as faixas globais de elemento, o `drawRange`, a caixa e os envios pendentes. Devolve
   * `true` quando houve mudança de geometria (o BVH do picking é invalidado pela versão).
   */
  finalizar(): boolean {
    if (!this.sujo) return false;
    const faixas: ElementRange[] = [];
    for (const s of this.segmentos.values()) {
      for (const r of s.dados.ids) faixas.push({ id: r.id, start: s.inicioI + r.start, count: r.count });
    }
    this.malha.userData = { kind: this.categoria, materialId: this.materialId, ranges: faixas };
    this.geometria.setDrawRange(0, this.nI);
    this.malha.visible = this.nI > 0;
    this.atualizarCaixa();
    const pos = this.geometria.getAttribute('position') as THREE.BufferAttribute;
    const nor = this.geometria.getAttribute('normal') as THREE.BufferAttribute;
    const idx = this.geometria.getIndex()!;
    if (this.completo) {
      pos.clearUpdateRanges();
      nor.clearUpdateRanges();
      idx.clearUpdateRanges();
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    idx.needsUpdate = true;
    this.geometria.userData.versao = ++this.versao;
    this.orcamento.definir(this.chaveOrcamento, this.bytes);
    this.sujo = false;
    this.completo = false;
    return true;
  }

  dispose(): void {
    this.orcamento.remover(this.chaveOrcamento);
    this.geometria.dispose();
    this.segmentos.clear();
  }

  private criarGeometria(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posicoes, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.normais, 3));
    g.setIndex(new THREE.BufferAttribute(this.indices, 1));
    g.setDrawRange(0, this.nI);
    return g;
  }

  /** Garante capacidade; devolve `true` se recriou as arrays/geometria. */
  private garantir(necessarioV: number, necessarioI: number): boolean {
    if (necessarioV <= this.capV && necessarioI <= this.capI) return false;
    const capV = Math.max(necessarioV, Math.ceil(this.capV * 1.5), 1024);
    const capI = Math.max(necessarioI, Math.ceil(this.capI * 1.5), 1024);
    const pos = new Float32Array(capV * 3);
    const nor = new Float32Array(capV * 3);
    const idx = new Uint32Array(capI);
    pos.set(this.posicoes.subarray(0, this.nV * 3));
    nor.set(this.normais.subarray(0, this.nV * 3));
    idx.set(this.indices.subarray(0, this.nI));
    this.posicoes = pos;
    this.normais = nor;
    this.indices = idx;
    this.capV = capV;
    this.capI = capI;
    const antiga = this.geometria;
    this.geometria = this.criarGeometria();
    this.malha.geometry = this.geometria;
    antiga.dispose();
    return true;
  }

  /** Escreve os dados de um nível na posição dada (índices com o deslocamento de vértice). */
  private escrever(inicioV: number, inicioI: number, dados: DadosLote): void {
    const p = dados.positions;
    const n = dados.normals;
    for (let i = 0; i < p.length; i++) this.posicoes[inicioV * 3 + i] = p[i]!;
    for (let i = 0; i < n.length; i++) this.normais[inicioV * 3 + i] = n[i]!;
    const ix = dados.indices;
    for (let i = 0; i < ix.length; i++) this.indices[inicioI + i] = ix[i]! + inicioV;
  }

  /** Faixas de atualização parcial (posições, normais e índices), em elementos das arrays. */
  private faixasParciais(inicioV: number, nV: number, inicioI: number, nI: number): void {
    const pos = this.geometria.getAttribute('position') as THREE.BufferAttribute;
    const nor = this.geometria.getAttribute('normal') as THREE.BufferAttribute;
    const idx = this.geometria.getIndex()!;
    if (nV > 0) {
      pos.addUpdateRange(inicioV * 3, nV * 3);
      nor.addUpdateRange(inicioV * 3, nV * 3);
    }
    if (nI > 0) idx.addUpdateRange(inicioI, nI);
  }

  /** Remonta o lote inteiro (compactação depois de remover/trocar um segmento). */
  private remontar(): void {
    let totalV = 0;
    let totalI = 0;
    for (const s of this.segmentos.values()) {
      totalV += s.nV;
      totalI += s.nI;
    }
    this.garantir(totalV, totalI);
    let inicioV = 0;
    let inicioI = 0;
    for (const s of this.segmentos.values()) {
      s.inicioV = inicioV;
      s.inicioI = inicioI;
      this.escrever(inicioV, inicioI, s.dados);
      s.caixa = caixaDePosicoes(s.dados.positions);
      inicioV += s.nV;
      inicioI += s.nI;
    }
    this.nV = totalV;
    this.nI = totalI;
    this.completo = true;
    this.sujo = true;
  }

  private atualizarCaixa(): void {
    let caixa: Caixa | null = null;
    for (const s of this.segmentos.values()) caixa = unirCaixas(caixa, s.caixa);
    if (!caixa) {
      this.geometria.boundingBox = null;
      this.geometria.boundingSphere = null;
      return;
    }
    const box = new THREE.Box3(new THREE.Vector3(caixa[0], caixa[1], caixa[2]), new THREE.Vector3(caixa[3], caixa[4], caixa[5]));
    this.geometria.boundingBox = box;
    this.geometria.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  }
}
