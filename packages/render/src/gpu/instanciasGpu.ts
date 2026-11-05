import * as THREE from 'three';
import type { GraphicsCategory } from '@hestia/model';
import type { OrcamentoVram } from './orcamento.ts';
import { unirCaixas, type Caixa } from './loteGeometria.ts';

/**
 * Instâncias por categoria e material (Fase 2.2): todas as caixas (paredes retas, esquadrias e o que mais for
 * parametrizável) de todos os níveis numa `InstancedMesh` por grupo. O buffer de matrizes guarda um segmento por nível;
 * quando um nível muda com o mesmo número de caixas, só a faixa dele é reenviada (`instanceMatrix.addUpdateRange`).
 * A caixa unitária é uma só, compartilhada; nada de geometria por quadro.
 */

interface Segmento {
  inicio: number;
  n: number;
  matrizes: Float32Array;
  caixa: Caixa | null;
}

/** Caixa (mundo) de um conjunto de matrizes de caixa unitária (16 números por instância). */
export function caixaDeMatrizes(matrizes: Float32Array): Caixa | null {
  const centro: number[] = [];
  for (let i = 0; i < matrizes.length; i += 16) {
    const hx = 0.5 * (Math.abs(matrizes[i]!) + Math.abs(matrizes[i + 4]!) + Math.abs(matrizes[i + 8]!));
    const hy = 0.5 * (Math.abs(matrizes[i + 1]!) + Math.abs(matrizes[i + 5]!) + Math.abs(matrizes[i + 9]!));
    const hz = 0.5 * (Math.abs(matrizes[i + 2]!) + Math.abs(matrizes[i + 6]!) + Math.abs(matrizes[i + 10]!));
    centro.push(matrizes[i + 12]! - hx, matrizes[i + 13]! - hy, matrizes[i + 14]! - hz, matrizes[i + 12]! + hx, matrizes[i + 13]! + hy, matrizes[i + 14]! + hz);
  }
  if (!centro.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (let i = 0; i < centro.length; i += 6) {
    if (centro[i]! < x0) x0 = centro[i]!;
    if (centro[i + 1]! < y0) y0 = centro[i + 1]!;
    if (centro[i + 2]! < z0) z0 = centro[i + 2]!;
    if (centro[i + 3]! > x1) x1 = centro[i + 3]!;
    if (centro[i + 4]! > y1) y1 = centro[i + 4]!;
    if (centro[i + 5]! > z1) z1 = centro[i + 5]!;
  }
  return [x0, y0, z0, x1, y1, z1];
}

export class InstanciasGpu {
  private malhaAtual: THREE.InstancedMesh | null = null;
  private matrizes: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private cap = 0;
  private total = 0;
  private segmentos = new Map<string, Segmento>();
  private sujo = false;
  private completo = false;
  private chaveOrcamento: string;

  constructor(
    readonly chave: string,
    readonly categoria: GraphicsCategory,
    readonly materialId: string,
    private readonly caixaUnitaria: THREE.BufferGeometry,
    private material: THREE.Material,
    private readonly orcamento: OrcamentoVram,
  ) {
    this.chaveOrcamento = `inst:${chave}`;
  }

  get malha(): THREE.InstancedMesh | null {
    return this.malhaAtual;
  }

  get vazio(): boolean {
    return this.segmentos.size === 0;
  }

  get instancias(): number {
    return this.total;
  }

  get bytes(): number {
    return this.matrizes.byteLength;
  }

  get(levelId: string): boolean {
    return this.segmentos.has(levelId);
  }

  /** Aplica as matrizes de um nível (16 números por caixa). */
  definir(levelId: string, dados: Float32Array): void {
    const n = Math.floor(dados.length / 16);
    const velho = this.segmentos.get(levelId);
    if (velho && velho.n === n) {
      this.matrizes.set(dados, velho.inicio * 16);
      this.faixaParcial(velho.inicio, n);
      velho.matrizes = dados;
      velho.caixa = caixaDeMatrizes(dados);
      this.sujo = true;
      return;
    }
    if (velho) this.remover(levelId);
    if (n === 0) return;
    const cresceu = this.garantir(this.total + n);
    if (cresceu) this.completo = true;
    const inicio = this.total;
    this.matrizes.set(dados, inicio * 16);
    this.segmentos.set(levelId, { inicio, n, matrizes: dados, caixa: caixaDeMatrizes(dados) });
    this.total += n;
    if (!this.completo) this.faixaParcial(inicio, n);
    this.sujo = true;
  }

  remover(levelId: string): boolean {
    if (!this.segmentos.delete(levelId)) return false;
    this.remontar();
    return true;
  }

  /** Ordena os segmentos pela ordem do projeto e corta a capacidade para o total exato de instâncias. */
  consolidar(ordem: readonly string[]): void {
    if (this.segmentos.size) {
      const novo = new Map<string, Segmento>();
      for (const id of ordem) {
        const s = this.segmentos.get(id);
        if (s) novo.set(id, s);
      }
      for (const [id, s] of this.segmentos) if (!novo.has(id)) novo.set(id, s);
      this.segmentos = novo;
    }
    const total = this.total;
    if (total === 0) return;
    if (this.cap !== total || !this.malhaAtual) this.recriarExato(total);
    let inicio = 0;
    for (const s of this.segmentos.values()) {
      s.inicio = inicio;
      s.caixa = caixaDeMatrizes(s.matrizes);
      this.matrizes.set(s.matrizes, inicio * 16);
      inicio += s.n;
    }
    this.completo = true;
    this.sujo = true;
  }

  aplicarMaterial(material: THREE.Material): void {
    this.material = material;
    if (this.malhaAtual) this.malhaAtual.material = material;
  }

  /** Fecha a atualização: conta, sombras, caixa e envio pendente. */
  finalizar(sombras: boolean): boolean {
    if (!this.sujo) return false;
    const malha = this.malhaAtual;
    if (!malha) {
      this.sujo = false;
      this.completo = false;
      return false;
    }
    malha.count = this.total;
    malha.visible = this.total > 0;
    malha.castShadow = sombras;
    malha.receiveShadow = sombras;
    malha.userData = { kind: this.categoria, semPick: true, materialId: this.materialId };
    this.atualizarCaixa(malha);
    if (this.completo) malha.instanceMatrix.clearUpdateRanges();
    malha.instanceMatrix.needsUpdate = true;
    this.orcamento.definir(this.chaveOrcamento, this.bytes);
    this.sujo = false;
    this.completo = false;
    return true;
  }

  dispose(): void {
    this.orcamento.remover(this.chaveOrcamento);
    this.malhaAtual?.dispose();
    this.malhaAtual = null;
    this.segmentos.clear();
  }

  private faixaParcial(inicio: number, n: number): void {
    this.malhaAtual?.instanceMatrix.addUpdateRange(inicio * 16, n * 16);
  }

  /** Garante capacidade; recria a `InstancedMesh` (os buffers antigos são liberados) quando precisa crescer. */
  private garantir(necessario: number): boolean {
    if (necessario <= this.cap) return false;
    const cap = Math.max(necessario, Math.ceil(this.cap * 1.5), 1);
    const antiga = this.malhaAtual;
    const nova = new THREE.InstancedMesh(this.caixaUnitaria, this.material, cap);
    nova.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const matrizes = nova.instanceMatrix.array as Float32Array;
    matrizes.set(this.matrizes.subarray(0, this.total * 16));
    this.matrizes = matrizes;
    this.cap = cap;
    nova.count = this.total;
    nova.matrixAutoUpdate = false;
    nova.userData = { kind: this.categoria, semPick: true, materialId: this.materialId };
    antiga?.dispose();
    this.malhaAtual = nova;
    return true;
  }

  /** Recria a malha com capacidade exata (usado no fecho da montagem). */
  private recriarExato(total: number): void {
    const antiga = this.malhaAtual;
    const nova = new THREE.InstancedMesh(this.caixaUnitaria, this.material, total);
    nova.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const matrizes = nova.instanceMatrix.array as Float32Array;
    matrizes.set(this.matrizes.subarray(0, total * 16));
    this.matrizes = matrizes;
    this.cap = total;
    nova.count = total;
    nova.matrixAutoUpdate = false;
    nova.userData = { kind: this.categoria, semPick: true, materialId: this.materialId };
    antiga?.dispose();
    this.malhaAtual = nova;
  }

  private remontar(): void {
    let total = 0;
    for (const s of this.segmentos.values()) total += s.n;
    this.garantir(total);
    let inicio = 0;
    for (const s of this.segmentos.values()) {
      s.inicio = inicio;
      this.matrizes.set(s.matrizes, inicio * 16);
      s.caixa = caixaDeMatrizes(s.matrizes);
      inicio += s.n;
    }
    this.total = total;
    this.completo = true;
    this.sujo = true;
  }

  private atualizarCaixa(malha: THREE.InstancedMesh): void {
    let caixa: Caixa | null = null;
    for (const s of this.segmentos.values()) caixa = unirCaixas(caixa, s.caixa);
    if (!caixa) {
      malha.boundingBox = null;
      malha.boundingSphere = null;
      return;
    }
    const box = new THREE.Box3(new THREE.Vector3(caixa[0], caixa[1], caixa[2]), new THREE.Vector3(caixa[3], caixa[4], caixa[5]));
    malha.boundingBox = box;
    malha.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  }
}
