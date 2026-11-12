import * as THREE from 'three';
import { esquadriaDaCelula, itemDoSubelemento, modeloDaEsquadriaCortina, segmentosDoSubelemento3d, servicoCortina, subelementosDaCortina } from '@hestia/engine';
import { view3dOf, type Project, type SubelementoCortina } from '@hestia/model';
import { caixasEPrismasDoModelo } from './aberturas3d.ts';
import { arestasDasCaixas } from './caixas3d.ts';

/**
 * Realce do subelemento de uma parede cortina na 3D (ADR 0056, fase 2): a linha ou o trecho de montante como traço, e a célula como a caixa do
 * painel. Os traços saem por cima do modelo (sem teste de profundidade), porque a linha fica no plano central do sistema, dentro do vidro.
 * A geometria vem da grade do kernel (`segmentosDoSubelemento3d`); sem kernel ou sem o subelemento, a camada fica vazia.
 * A esquadria da célula (`kind: 'opening'`) é realçada pelo contorno das peças dela (folha, batente, vidro e ferragens, as mesmas do desenho), sem caixa.
 */
export class RealceSubelementoCortina {
  readonly camada = new THREE.Group();
  private projeto: Project | null = null;
  private chave = '';
  private linhas: THREE.LineSegments | null = null;

  /** Mostra o subelemento `sub` (ou tira, com `null`). Só refaz a geometria quando o projeto ou o subelemento mudam. */
  definir(p: Project, sub: SubelementoCortina | null, cor: string): void {
    const chave = sub ? `${cor}|${servicoCortina().pronto()}|${JSON.stringify(sub)}` : '';
    if (p === this.projeto && chave === this.chave) return;
    this.projeto = p;
    this.chave = chave;
    this.limpar();
    if (!sub) return;
    const pos: number[] = [];
    if (sub.kind === 'opening') this.arestasDaEsquadria(p, sub, pos);
    else {
      const par = subelementosDaCortina(p, sub.wallId);
      const item = par ? itemDoSubelemento(par, sub) : undefined;
      if (!par || !item) return;
      for (const [a, b] of segmentosDoSubelemento3d(par, item)) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: cor, depthTest: false, transparent: true });
    this.linhas = new THREE.LineSegments(geo, mat);
    this.linhas.renderOrder = 999;
    this.camada.add(this.linhas);
  }

  /** Arestas (mundo) das peças da esquadria virtual da célula: caixas pela matriz e prismas pela geometria, o mesmo que o Reveal faz com as esquadrias comuns. */
  private arestasDaEsquadria(p: Project, sub: Extract<SubelementoCortina, { kind: 'opening' }>, saida: number[]): void {
    const e = esquadriaDaCelula(p, sub.wallId, sub.cell);
    if (!e) return;
    const a = caixasEPrismasDoModelo(p, e.opening, e.geometria, e.baseZ, modeloDaEsquadriaCortina(p, e), view3dOf(p));
    if (!a) return;
    for (const c of a.caixas) arestasDasCaixas(c.matriz, saida);
    for (const pr of a.prismas) {
      const g = new THREE.EdgesGeometry(pr.geometry, 28);
      for (const x of g.getAttribute('position').array) saida.push(x);
      g.dispose();
      pr.geometry.dispose();
    }
  }

  /** Solta a geometria do realce atual. */
  dispose(): void {
    this.limpar();
    this.projeto = null;
    this.chave = '';
  }

  private limpar(): void {
    if (!this.linhas) return;
    this.camada.remove(this.linhas);
    this.linhas.geometry.dispose();
    (this.linhas.material as THREE.Material).dispose();
    this.linhas = null;
  }
}
