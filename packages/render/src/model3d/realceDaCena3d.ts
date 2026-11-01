import * as THREE from 'three';
import type { Id } from '@hestia/model';
import { disposeHighlight, highlightOf, type HighlightStyle } from './highlight3d.ts';

/** Ranhuras do realce: a seleção (`sel`), o elemento sob o cursor (`hov`) e o aviso de conflito (`aviso`, decisão 0044). */
export type RanhuraDoRealce = 'sel' | 'hov' | 'aviso';

/** Sobreposição de realce (seleção ou elemento sob o cursor) e a chave que a identifica, para não refazê-la à toa. */
interface Realce {
  ids: readonly Id[];
  color: THREE.ColorRepresentation;
  fill: number;
  edges: number;
  obj: THREE.Object3D;
}

/**
 * Realces da cena (decisão 0016 §4): uma sobreposição por ranhura, num objeto à parte (`camada`), fora do modelo, para não
 * entrar nas malhas do modelo nem no picking por faixas. Só refaz a sobreposição cuja chave mudou.
 *
 * A comparação é feita sem montar string: a seleção chega com a mesma referência de array enquanto não muda (o estado do
 * app troca o array, nunca o altera no lugar), e o cursor chega como um array de um elemento novo a cada quadro —
 * comparar 1 id custa menos que juntar todos os ids em texto a 60 quadros por segundo.
 */
export class RealcesDaCena {
  /** Onde as sobreposições ficam; a cena a põe como filha. */
  readonly camada = new THREE.Object3D();
  private slots: Record<RanhuraDoRealce, Realce | null> = { sel: null, hov: null, aviso: null };

  /** `raiz` é de onde as sobreposições copiam os triângulos (a cena inteira). */
  constructor(private readonly raiz: THREE.Object3D) {}

  /** Troca a sobreposição da ranhura pelos elementos `ids`, se a cor ou os ids mudaram. */
  definir(slot: RanhuraDoRealce, ids: readonly Id[], style: HighlightStyle): void {
    const cur = this.slots[slot];
    if (cur && this.mesmo(cur, ids, style)) return;
    if (cur) this.soltar(slot);
    if (!ids.length) return;
    const obj = highlightOf(this.raiz, ids, style);
    this.camada.add(obj);
    this.slots[slot] = { ids, color: style.color, fill: style.fill, edges: style.edges, obj };
  }

  soltar(slot: RanhuraDoRealce): void {
    const cur = this.slots[slot];
    if (!cur) return;
    this.camada.remove(cur.obj);
    disposeHighlight(cur.obj);
    this.slots[slot] = null;
  }

  /** Tira as três sobreposições (o modelo foi refeito, ou a cena será descartada). */
  soltarTodos(): void {
    this.soltar('sel');
    this.soltar('hov');
    this.soltar('aviso');
  }

  private mesmo(cur: Realce, ids: readonly Id[], style: HighlightStyle): boolean {
    if (cur.color !== style.color || cur.fill !== style.fill || cur.edges !== style.edges) return false;
    if (cur.ids === ids) return true;
    if (cur.ids.length !== ids.length) return false;
    for (let i = 0; i < ids.length; i++) if (cur.ids[i] !== ids[i]) return false;
    return true;
  }
}
