import type { BufferGeometry, Group, Object3D } from 'three';
import type { GraphicsCategory, Id, Material } from '@hestia/model';
import type { ColecaoCaixas } from './caixasDoNivel3d.ts';
import type { ElementRange, SolidBatch } from './solids.ts';

/**
 * Teto padrão do cache de malhas por nível, em bytes estimados (vértices, normais, índices e arestas). 128 MB: cabe no
 * navegador junto com o resto da página; um projeto de 20 pavimentos ocupa uma fração disso (ver o relatório da frente).
 */
export const TETO_MALHAS_BYTES = 128 * 2 ** 20;

/** Peça só de picking do wireframe: a geometria, o objeto dono (para a transformação) e o que o picking lê. */
export interface PickSource {
  geo: BufferGeometry;
  owner: Object3D;
  kind: GraphicsCategory;
  ranges: ElementRange[];
  /** Só para o raio (caixa de picking de uma cortina): não entra no realce de seleção/cursor, que segue a geometria real. */
  semRealce?: boolean;
}

/**
 * Malhas de um nível montadas: o grupo com as peças (paredes, pisos, lajes, telhados, escadas, aberturas, arestas), as peças
 * de picking do wireframe, os materiais que o nível usou e a chave do conteúdo com que foi montado.
 */
export interface EntradaNivel {
  readonly levelId: Id;
  /** Chave do conteúdo (ver `chaveNivel3d.ts`): igual = malha reaproveitável. */
  readonly chave: string;
  readonly grupo: Group;
  readonly picks: PickSource[];
  /** Chaves de material que o nível usou (marcadas de novo quando o nível é reaproveitado). */
  readonly mats: string[];
  /** Bytes estimados das geometrias do nível (o que o cache conta contra o teto). */
  readonly bytes: number;
  /** Caixas instanciadas do nível (paredes retas e esquadrias): as matrizes que a cena junta com as dos outros níveis. */
  readonly instancias?: readonly ColecaoCaixas[];
  /** Arestas das caixas do nível (pares de pontos); a cena junta as de todos os níveis numa linha só. */
  readonly arestasCaixas?: Float32Array;
  /** Arestas das caixas por parede (as mesmas de `arestasCaixas`, para trocar só as de uma parede). */
  readonly arestasParedes?: ReadonlyMap<Id, readonly number[]>;
  /** Sólidos do nível fora das caixas (pisos, lajes, telhados, beirais, escadas e paredes não retangulares). */
  readonly lotes?: readonly SolidBatch[];
  /** Arestas dos sólidos do nível (pares de pontos), quando a vista as pede. */
  readonly arestasSolidas?: Float32Array;
  /** Arestas de sólidos e caixas do nível já juntas (o que o gestor de GPU envia). */
  readonly arestas?: Float32Array;
  /** Materiais que não estão no projeto (acabamentos de beiral): a cena os usa na cor da peça. */
  readonly materiais?: Readonly<Record<Id, Material>>;
}

/** Bytes de uma geometria: os arrays dos atributos e o de índices. */
function bytesDeGeometria(g: BufferGeometry): number {
  let n = g.index?.array.byteLength ?? 0;
  for (const a of Object.values(g.attributes)) n += a.array.byteLength;
  return n;
}

/** Bytes estimados de um nível: as geometrias (grupo e peças de picking, sem contar duas vezes a mesma), as matrizes das
 * caixas, as arrays dos sólidos e as arestas que a GPU envia. */
export function bytesDeNivel(
  grupo: Group,
  picks: PickSource[],
  instancias: readonly ColecaoCaixas[] = [],
  arestasCaixas?: Float32Array,
  lotes: readonly SolidBatch[] = [],
  arestasSolidas?: Float32Array,
): number {
  const geos = new Set<BufferGeometry>();
  grupo.traverse((o) => {
    const g = (o as { geometry?: BufferGeometry }).geometry;
    if (g) geos.add(g);
  });
  for (const s of picks) geos.add(s.geo);
  let total = 0;
  for (const g of geos) total += bytesDeGeometria(g);
  for (const c of instancias) total += c.matrizes.byteLength;
  for (const b of lotes) {
    total += b.positions.length * 4 + b.normals.length * 4 + b.indices.length * 4;
  }
  total += arestasCaixas?.byteLength ?? 0;
  total += arestasSolidas?.byteLength ?? 0;
  return total;
}

/** Libera as geometrias de um nível (grupo e picking). Os materiais são do pool de materiais, não do nível. */
export function disposeNivel(e: EntradaNivel): void {
  e.grupo.traverse((o) => (o as { geometry?: BufferGeometry }).geometry?.dispose());
  for (const s of e.picks) s.geo.dispose();
}

/**
 * Cache LRU de malhas por nível, com teto em bytes. Guarda entradas só para reuso: uma entrada expulsa pode continuar na
 * cena (quem a tem na cena a descarta quando ela sai). A ordem do mapa é a de uso: a primeira é a menos recente.
 */
export class CacheMalhas {
  private entradas = new Map<Id, EntradaNivel>();

  constructor(readonly teto: number = TETO_MALHAS_BYTES) {}

  /** Bytes estimados guardados agora. */
  get total(): number {
    let t = 0;
    for (const e of this.entradas.values()) t += e.bytes;
    return t;
  }

  get tamanho(): number {
    return this.entradas.size;
  }

  /** Entrada do nível, se a chave for a mesma; torna-a a mais recente. Senão, undefined. */
  buscar(levelId: Id, chave: string): EntradaNivel | undefined {
    const e = this.entradas.get(levelId);
    if (!e || e.chave !== chave) return undefined;
    this.entradas.delete(levelId);
    this.entradas.set(levelId, e);
    return e;
  }

  /** Guarda a entrada como a mais recente. Devolve a que ela substitui (mesmo nível, outra chave), se houver. */
  guardar(e: EntradaNivel): EntradaNivel | undefined {
    const velha = this.entradas.get(e.levelId);
    this.entradas.delete(e.levelId);
    this.entradas.set(e.levelId, e);
    return velha;
  }

  /** Se a entrada ainda é a guardada para o nível. */
  contem(e: EntradaNivel): boolean {
    return this.entradas.get(e.levelId) === e;
  }

  /** Expulsa as menos recentes até o total caber no teto. Devolve as expulsas (quem as tem na cena decide). */
  enforcar(): EntradaNivel[] {
    const expulsas: EntradaNivel[] = [];
    let total = this.total;
    for (const [id, e] of this.entradas) {
      if (total <= this.teto) break;
      this.entradas.delete(id);
      expulsas.push(e);
      total -= e.bytes;
    }
    return expulsas;
  }

  /** Tira todas as entradas e devolve-as (para liberar). */
  limpar(): EntradaNivel[] {
    const todas = [...this.entradas.values()];
    this.entradas.clear();
    return todas;
  }
}
