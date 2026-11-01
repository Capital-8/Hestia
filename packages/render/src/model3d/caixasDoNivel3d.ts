import * as THREE from 'three';
import type { GraphicsCategory, Id } from '@hestia/model';
import { arestasDasCaixas, geometriaDeCaixas, INDICES_POR_CAIXA, type MatrizCaixa } from './caixas3d.ts';
import type { ElementRange } from './solids.ts';

/**
 * Caixas de um nível agrupadas por categoria e material. O nível guarda as matrizes (`ColecaoCaixas`), e a cena as junta com as
 * dos outros níveis numa `InstancedMesh` por grupo (`gpu/instanciasGpu.ts`). O que o picking, o realce e a seleção leem
 * não vem da malha instanciada: vem de uma malha de picking por grupo, com os triângulos das caixas no mundo e as faixas de
 * elemento (decisão 0016), invisível e dentro do grupo do nível.
 */

/** Caixas de um grupo (categoria e material) de um nível: 16 números por caixa. */
export interface ColecaoCaixas {
  readonly categoria: GraphicsCategory;
  readonly materialId: Id;
  readonly matrizes: Float32Array;
}

/** Chave do grupo: a categoria (visibilidade e substituição, decisão 0015) e o material, como em `lotesMalha3d.ts`. */
export const chaveDaColecao = (categoria: GraphicsCategory, materialId: Id): string => `${categoria}|${materialId}`;

interface Grupo {
  categoria: GraphicsCategory;
  materialId: Id;
  matrizes: number[];
  ids: Id[];
}

/** Acumulador das caixas de um nível durante a montagem. */
export class CaixasDoNivel {
  private grupos = new Map<string, Grupo>();
  private arestas: number[] = [];

  /** Acrescenta uma caixa do elemento `id`. Com `comArestas`, suas 12 arestas entram na linha do nível. */
  adicionar(categoria: GraphicsCategory, materialId: Id, id: Id, matriz: MatrizCaixa, comArestas: boolean): void {
    const k = chaveDaColecao(categoria, materialId);
    let g = this.grupos.get(k);
    if (!g) {
      g = { categoria, materialId, matrizes: [], ids: [] };
      this.grupos.set(k, g);
    }
    for (let i = 0; i < 16; i++) g.matrizes.push(matriz[i]!);
    g.ids.push(id);
    if (comArestas) arestasDasCaixas(matriz, this.arestas);
  }

  /** Acrescenta arestas já calculadas (pares de pontos), como as da união das caixas de uma camada. */
  adicionarArestas(posicoes: readonly number[]): void {
    for (const x of posicoes) this.arestas.push(x);
  }

  get vazio(): boolean {
    return this.grupos.size === 0;
  }

  /**
   * Põe no grupo do nível as malhas de picking (uma por categoria e material, invisíveis, com as faixas de elemento).
   * Devolve as coleções que a cena instancia e as arestas das caixas (a cena junta as de todos os níveis numa linha só).
   */
  montar(grupo: THREE.Object3D, materialPicking: THREE.Material): CaixasMontadas {
    const colecoes: ColecaoCaixas[] = [];
    for (const g of this.grupos.values()) {
      const matrizes = Float32Array.from(g.matrizes);
      colecoes.push({ categoria: g.categoria, materialId: g.materialId, matrizes });
      const mesh = new THREE.Mesh(geometriaDeCaixas(matrizes), materialPicking);
      mesh.visible = false;
      // `caixasPick`: malha invisível de propósito (só picking); a seleção por caixa a trata como visível (selecaoPorCaixa3d.ts).
      mesh.userData = { kind: g.categoria, ranges: faixasDosIds(g.ids), caixasPick: true };
      grupo.add(mesh);
    }
    return { colecoes, arestas: Float32Array.from(this.arestas) };
  }
}

/** O que um nível entrega à cena: as coleções de caixas e as arestas delas (pares de pontos). */
export interface CaixasMontadas {
  colecoes: ColecaoCaixas[];
  arestas: Float32Array;
}

/** Faixas de elemento de uma lista de caixas (36 índices por caixa); caixas seguidas do mesmo elemento viram uma faixa só. */
export function faixasDosIds(ids: readonly Id[]): ElementRange[] {
  const out: ElementRange[] = [];
  ids.forEach((id, k) => {
    const ultima = out[out.length - 1];
    if (ultima?.id === id) ultima.count += INDICES_POR_CAIXA;
    else out.push({ id, start: k * INDICES_POR_CAIXA, count: INDICES_POR_CAIXA });
  });
  return out;
}
