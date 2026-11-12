import * as THREE from 'three';
import { itemDoSubelemento, segmentosDoSubelemento3d, servicoCortina, subelementosDaCortina } from '@hestia/engine';
import type { Project, SubelementoCortina } from '@hestia/model';
import { arestasDaCortina, celulaContemCentro, subconjuntoDeLotes } from './cortina3d.ts';
import type { GrupoDeRealceCortina } from './realceCortina3d.ts';

type ParedeDoSubelemento = NonNullable<ReturnType<typeof subelementosDaCortina>>;
type GeoCelula = { kind: 'cell'; s0: number; s1: number; z0: number; z1: number };

/**
 * Realce do subelemento de uma parede cortina na 3D (ADR 0056, fase 2).
 * - Linha e trecho de montante: traço sobre o plano central do sistema (sem teste de profundidade, pois a linha fica dentro do vidro).
 * - Célula: os painéis que estão dentro dela, com o mesmo realce da geometria real (preenchimento e arestas levadas pelas matrizes das
 *   instâncias). Sem caixa: a caixa da célula é só a região em que se procuram os painéis, e nunca é desenhada.
 * A geometria vem da grade do kernel (`segmentosDoSubelemento3d`); sem kernel ou sem o subelemento, a camada fica vazia.
 */
export class RealceSubelementoCortina {
  readonly camada = new THREE.Group();
  private projeto: Project | null = null;
  private grupos: readonly GrupoDeRealceCortina[] | null = null;
  private chave = '';
  private atual: THREE.Object3D | null = null;

  /**
   * Mostra o subelemento `sub` (ou tira, com `null`). `grupos` são os níveis com cortina da cena (para os painéis da célula). Só refaz a
   * geometria quando o projeto, o subelemento ou os grupos mudam.
   */
  definir(p: Project, sub: SubelementoCortina | null, cor: string, grupos: readonly GrupoDeRealceCortina[] = []): void {
    const chave = sub ? `${cor}|${servicoCortina().pronto()}|${JSON.stringify(sub)}` : '';
    if (p === this.projeto && chave === this.chave && grupos === this.grupos) return;
    this.projeto = p;
    this.chave = chave;
    this.grupos = grupos;
    this.limpar();
    if (!sub) return;
    const par = subelementosDaCortina(p, sub.wallId);
    const item = par ? itemDoSubelemento(par, sub) : undefined;
    if (!par || !item) return;
    const geo = item.geo;
    this.atual = geo.kind === 'cell' ? this.celula(par, geo, cor, grupos) : this.traco(par, item, cor);
    if (this.atual) this.camada.add(this.atual);
  }

  /** Solta a geometria do realce atual. */
  dispose(): void {
    this.limpar();
    this.projeto = null;
    this.grupos = null;
    this.chave = '';
  }

  private traco(par: ParedeDoSubelemento, item: NonNullable<ReturnType<typeof itemDoSubelemento>>, cor: string): THREE.LineSegments {
    const pos: number[] = [];
    for (const [a, b] of segmentosDoSubelemento3d(par, item)) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: cor, depthTest: false, transparent: true });
    const linhas = new THREE.LineSegments(geo, mat);
    linhas.renderOrder = 999;
    return linhas;
  }

  /**
   * Os painéis (papéis 1 e 2) cujo centro cai dentro da célula, desta parede: preenchimento por instância e arestas vivas levadas pelas
   * matrizes. Os montantes ficam de fora (papel 0), e a célula é só o critério de seleção, nunca um desenho.
   */
  private celula(par: ParedeDoSubelemento, g: GeoCelula, cor: string, grupos: readonly GrupoDeRealceCortina[]): THREE.Object3D | null {
    const angulo = grupos[0]?.anguloRad;
    if (angulo === undefined) return null;
    const lotes = grupos.flatMap((gr) => gr.desenhos.flatMap((d) => ('lote' in d && d.lote.papel !== 0 ? [d.lote] : [])));
    const sub = subconjuntoDeLotes(lotes, (dono, centro) => dono === par.wallId && celulaContemCentro(centro, par, g));
    if (!sub.length) return null;
    const obj = new THREE.Group();
    const preenchimento = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.35, depthWrite: false, depthTest: true });
    for (const l of sub) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(l.vertices, 3));
      geo.setIndex(new THREE.BufferAttribute(l.indices, 1));
      const malha = new THREE.InstancedMesh(geo, preenchimento, l.n);
      malha.instanceMatrix.array.set(l.matrizes);
      malha.instanceMatrix.needsUpdate = true;
      malha.frustumCulled = false;
      malha.renderOrder = 5;
      obj.add(malha);
    }
    const arestas = arestasDaCortina(sub, angulo);
    if (arestas.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arestas, 3));
      const linhas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: cor, depthTest: false, transparent: true }));
      linhas.frustumCulled = false;
      linhas.renderOrder = 999;
      obj.add(linhas);
    }
    return obj;
  }

  private limpar(): void {
    if (!this.atual) return;
    this.camada.remove(this.atual);
    this.atual.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
    this.atual = null;
  }
}
