import * as THREE from 'three';
import type { Id } from '@hestia/model';
import type { ElementRange } from './solids.ts';
import { disposeHighlight, highlightOf, type HighlightStyle } from './highlight3d.ts';
import { mapaDaMalha } from './indiceDeElementos3d.ts';
import {
  aplicarEstiloAoMaterial,
  criarMaterialDoRealce,
  geometriaDoRealce,
  MascaraDoRealce,
  TabelaDeCodigos,
  texturaDaMascara,
  type MaterialDoRealce,
} from './realceGpu3d.ts';

/** Ranhuras do realce: a seleção (`sel`), o elemento sob o cursor (`hov`) e o aviso de conflito (`aviso`, decisão 0044). */
export type RanhuraDoRealce = 'sel' | 'hov' | 'aviso';

/** Até esta quantidade de elementos o realce leva também as arestas (montadas na CPU, em cache); acima, só preenchimento. */
export const LIMITE_DE_ARESTAS_DO_REALCE = 48;

/** O realce de uma ranhura e a chave que o identifica, para não refazê-lo à toa. */
interface Realce {
  ids: readonly Id[];
  color: THREE.ColorRepresentation;
  fill: number;
  edges: number;
  /** Arestas (só com poucos elementos), na camada. */
  arestas: THREE.Object3D | null;
}

/** Estado de GPU de uma ranhura: material, máscara (e sua textura) e as sobreposições por malha de origem. */
class RanhuraGpu {
  readonly material: MaterialDoRealce = criarMaterialDoRealce();
  readonly mascara = new MascaraDoRealce();
  textura: THREE.DataTexture | null = null;
  /** Sobreposição de cada malha do modelo (criada na primeira vez que a malha tem elemento realçado). */
  readonly sobreposicoes = new Map<THREE.Mesh, THREE.Mesh>();
  /** As que estão na camada agora (têm elemento desta ranhura). */
  noAr = new Set<THREE.Mesh>();
}

/**
 * Realces da cena (decisão 0016 §4): um realce por ranhura, num objeto à parte (`camada`), fora do modelo, para não entrar
 * nas malhas do modelo nem no picking por faixas. Só refaz o realce cuja chave mudou.
 *
 * O preenchimento é feito na GPU (`realceGpu3d.ts`): uma sobreposição por malha do modelo, com a máscara da ranhura numa
 * textura. Mudar a seleção escreve 1 byte por elemento e acha as malhas pelo índice id → malhas (montado uma vez por
 * modelo), sem varrer a cena nem montar um objeto por elemento. As arestas (EdgesGeometry em cache por intervalo) só vão
 * junto quando há poucos elementos.
 *
 * A comparação é feita sem montar string: a seleção chega com a mesma referência de array enquanto não muda (o estado do
 * app troca o array, nunca o altera no lugar), e o cursor chega como um array de um elemento novo a cada quadro —
 * comparar 1 id custa menos que juntar todos os ids em texto a 60 quadros por segundo.
 */
export class RealcesDaCena {
  /** Onde as sobreposições ficam; a cena a põe como filha. */
  readonly camada = new THREE.Object3D();
  private slots: Record<RanhuraDoRealce, Realce | null> = { sel: null, hov: null, aviso: null };
  private gpu: Record<RanhuraDoRealce, RanhuraGpu> = { sel: new RanhuraGpu(), hov: new RanhuraGpu(), aviso: new RanhuraGpu() };
  private tabela = new TabelaDeCodigos();
  /** id → malhas do modelo com faixas dele. Montado na primeira necessidade; descartado quando o modelo é refeito. */
  private malhasDoId: Map<Id, THREE.Mesh[]> | null = null;

  /** `raiz` é de onde as sobreposições leem as malhas (a cena inteira). */
  constructor(private readonly raiz: THREE.Object3D) {}

  /** Troca o realce da ranhura pelos elementos `ids`, se a cor ou os ids mudaram. */
  definir(slot: RanhuraDoRealce, ids: readonly Id[], style: HighlightStyle): void {
    const cur = this.slots[slot];
    if (cur && this.mesmo(cur, ids, style)) return;
    this.soltarArestas(cur);
    if (!ids.length) {
      this.limparGpu(slot);
      this.slots[slot] = null;
      return;
    }
    this.atualizarGpu(slot, ids, style);
    let arestas: THREE.Object3D | null = null;
    if (ids.length <= LIMITE_DE_ARESTAS_DO_REALCE) {
      this.raiz.updateMatrixWorld(true);
      arestas = highlightOf(this.raiz, ids, style, { preenchimento: false });
      this.camada.add(arestas);
    }
    this.slots[slot] = { ids, color: style.color, fill: style.fill, edges: style.edges, arestas };
  }

  soltar(slot: RanhuraDoRealce): void {
    this.soltarArestas(this.slots[slot]);
    this.limparGpu(slot);
    this.slots[slot] = null;
  }

  /** Tira as três ranhuras (o modelo foi refeito, ou a cena será descartada). */
  soltarTodos(): void {
    this.soltar('sel');
    this.soltar('hov');
    this.soltar('aviso');
    // As sobreposições apontam para as malhas do modelo antigo.
    for (const g of Object.values(this.gpu)) g.sobreposicoes.clear();
    this.malhasDoId = null;
  }

  /** Sobreposições de GPU hoje na camada (diagnóstico e teste). */
  sobreposicoesNoAr(slot: RanhuraDoRealce): THREE.Mesh[] {
    return [...this.gpu[slot].noAr].map((m) => this.gpu[slot].sobreposicoes.get(m)!);
  }

  private soltarArestas(r: Realce | null): void {
    if (!r?.arestas) return;
    this.camada.remove(r.arestas);
    disposeHighlight(r.arestas);
  }

  /** Esvazia a máscara e tira as sobreposições da camada (mantém o cache delas para o próximo realce). */
  private limparGpu(slot: RanhuraDoRealce): void {
    const g = this.gpu[slot];
    for (const m of g.noAr) this.camada.remove(g.sobreposicoes.get(m)!);
    g.noAr = new Set();
    if (g.mascara.quantidade) {
      g.mascara.definir([]);
      if (g.textura) g.textura.needsUpdate = true;
    }
  }

  private atualizarGpu(slot: RanhuraDoRealce, ids: readonly Id[], style: HighlightStyle): void {
    const g = this.gpu[slot];
    const indice = this.indiceDeMalhas();
    const alvo = new Set<THREE.Mesh>();
    const encontrados: Id[] = [];
    for (const id of ids) {
      const ms = indice.get(id);
      if (!ms) continue;
      encontrados.push(id);
      for (const m of ms) alvo.add(m);
    }
    // Sobreposições novas (geometria com `aElem` em cache por versão) e saída das que não têm mais elemento.
    let matrizes = false;
    for (const m of alvo) {
      let s = g.sobreposicoes.get(m);
      if (!s) {
        const geo = geometriaDoRealce(m, this.tabela);
        if (!geo) continue;
        s = new THREE.Mesh(geo, g.material);
        s.renderOrder = 5;
        s.matrixAutoUpdate = false;
        // O recorte cobre elementos no mundo: sem esfera própria para o teste de frustum.
        s.frustumCulled = false;
        g.sobreposicoes.set(m, s);
        matrizes = true;
      }
    }
    if (matrizes) this.raiz.updateMatrixWorld(true);
    const novoNoAr = new Set<THREE.Mesh>();
    for (const m of alvo) {
      const s = g.sobreposicoes.get(m);
      if (!s) continue;
      s.matrix.copy(m.matrixWorld);
      novoNoAr.add(m);
      if (!g.noAr.has(m)) this.camada.add(s);
    }
    for (const m of g.noAr) if (!novoNoAr.has(m)) this.camada.remove(g.sobreposicoes.get(m)!);
    g.noAr = novoNoAr;

    // Máscara: os códigos já existem (a geometria registra todos os ids da malha); `codigo` registra os que faltarem.
    const codigos = encontrados.map((id) => this.tabela.codigo(id));
    if (g.mascara.garantir(this.tabela.tamanho) || !g.textura) {
      g.textura?.dispose();
      g.mascara.definir(codigos);
      g.textura = texturaDaMascara(g.mascara);
      (g.material.uniforms.uMascara as { value: THREE.Texture | null }).value = g.textura;
    } else {
      g.mascara.definir(codigos);
      g.textura.needsUpdate = true;
    }
    aplicarEstiloAoMaterial(g.material, style.color, style.fill);
  }

  /** id → malhas do modelo com faixas dele (todas as malhas com `userData.ranges`, inclusive as de picking). */
  private indiceDeMalhas(): Map<Id, THREE.Mesh[]> {
    if (this.malhasDoId) return this.malhasDoId;
    const out = new Map<Id, THREE.Mesh[]>();
    this.raiz.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const faixas = mesh.userData.ranges as ElementRange[] | undefined;
      const geo = mesh.geometry as THREE.BufferGeometry | undefined;
      // A caixa de picking de uma cortina (`semRealce`) fica fora do realce: a cortina realça as próprias instâncias (`realceCortina3d.ts`).
      if (!mesh.isMesh || !faixas || !geo?.index || mesh.userData.semRealce) return;
      for (const id of mapaDaMalha(faixas).keys()) {
        const l = out.get(id);
        if (l) l.push(mesh);
        else out.set(id, [mesh]);
      }
    });
    this.malhasDoId = out;
    return out;
  }

  private mesmo(cur: Realce, ids: readonly Id[], style: HighlightStyle): boolean {
    if (cur.color !== style.color || cur.fill !== style.fill || cur.edges !== style.edges) return false;
    if (cur.ids === ids) return true;
    if (cur.ids.length !== ids.length) return false;
    for (let i = 0; i < ids.length; i++) if (cur.ids[i] !== ids[i]) return false;
    return true;
  }
}
