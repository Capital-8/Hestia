import { difference, type MultiPolygon } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { WallFrame } from './frame.ts';
import { computeEnds, joinStatus, type JoinStatus, type WallEnds } from './joins.ts';
import { ringsOfShape } from './geomSig.ts';

/** O que a pintura lê de um item do cluster. */
interface ItemPintura {
  wallId: Id;
  layerIndex: number;
  priority: number;
  through: boolean;
  coreT: number;
  order: number;
  shape: MultiPolygon;
}

/**
 * Pintura (`paint`) compartilhada entre resoluções do mesmo cluster. O pintor só lê a forma, a prioridade e a ordem dos
 * itens, nunca as esquadrias: abrir, mover ou apagar uma janela do cluster refaz os vãos, mas a pintura de cada conjunto
 * ativo de camadas é a mesma. Guardá-la por conteúdo dos itens (e devolver os MESMOS polígonos) poupa a maior parte do
 * custo de resolver o cluster depois de uma edição de esquadria, e dá identidade estável aos fragmentos (ver `furosDe`).
 */
const LIMITE_PINTURAS = 48;
const pinturasPorItens = new Map<string, Map<string, MultiPolygon[]>>();

export function pinturasDoCluster(items: readonly ItemPintura[]): Map<string, MultiPolygon[]> {
  const chave = items.map((i) => `${i.wallId}|${i.layerIndex}|${i.priority}|${i.through ? 1 : 0}|${i.coreT}|${i.order}|${ringsOfShape(i.shape)}`).join('\n');
  let m = pinturasPorItens.get(chave);
  if (m) {
    pinturasPorItens.delete(chave);
  } else {
    m = new Map();
    if (pinturasPorItens.size >= LIMITE_PINTURAS) pinturasPorItens.delete(pinturasPorItens.keys().next().value as string);
  }
  pinturasPorItens.set(chave, m);
  return m;
}

/** Esvazia os caches por conteúdo desta peça (pintura dos clusters e estrutura de junções); ver `cachesDeConteudo.ts`. */
export function esvaziarCachesDeResolucao(): void {
  pinturasPorItens.clear();
  estruturaPorNivel.clear();
}

/** Fragmento menos os vãos, por identidade do fragmento e conteúdo dos vãos (o fragmento é estável, ver `pinturasDoCluster`). */
const furosPorFragmento = new WeakMap<MultiPolygon, Map<string, MultiPolygon>>();

export function furosDe(frag: MultiPolygon, holes: MultiPolygon[]): MultiPolygon {
  const chave = holes.map(ringsOfShape).join('#');
  let m = furosPorFragmento.get(frag);
  if (!m) furosPorFragmento.set(frag, (m = new Map()));
  let r = m.get(chave);
  if (!r) m.set(chave, (r = difference(frag, ...holes)));
  return r;
}

/**
 * Estrutura de junções de um nível: as pontas resolvidas (`computeEnds`) e a situação de cada extremidade (`joinStatus`).
 * Só dependem dos quadros das paredes (parede, tipo, cotas) e da tolerância; abrir, mover ou apagar uma esquadria não
 * mexe em nada disso, e o cálculo é quadrático no número de paredes do nível. Por isso fica guardado por nível, validado
 * por identidade das fontes: parede ou tipo trocado (mesmo `id`, objeto novo) invalida; esquadria editada não.
 */
interface EstruturaDasJuncoes {
  ends: Map<string, WallEnds>;
  status(wallId: Id, which: 'a' | 'b'): JoinStatus;
}

const estruturaPorNivel = new Map<Id, { fontes: readonly unknown[]; valor: EstruturaDasJuncoes }>();

export function estruturaDasJuncoes(levelId: Id, frames: WallFrame[], tol: number | undefined): EstruturaDasJuncoes {
  const fontes: unknown[] = [tol, frames.length];
  for (const f of frames) fontes.push(f.wall, f.type, f.z?.z0, f.z?.top);
  const antes = estruturaPorNivel.get(levelId);
  if (antes && antes.fontes.length === fontes.length && antes.fontes.every((x, i) => x === fontes[i])) return antes.valor;
  const memo = new Map<string, JoinStatus>();
  const valor: EstruturaDasJuncoes = {
    ends: computeEnds(frames, tol),
    status(wallId, which) {
      const k = `${wallId}|${which}`;
      let s = memo.get(k);
      if (!s) {
        s = joinStatus(frames, wallId, which, tol);
        memo.set(k, s);
      }
      return s;
    },
  };
  estruturaPorNivel.set(levelId, { fontes, valor });
  return valor;
}


/** Pintura de `active` (itens → polígonos) vinda do cache compartilhado do cluster, ou calculada por `pintar` e guardada nele. */
export function pintarCompartilhado<I>(cache: Map<string, MultiPolygon[]>, chave: string, active: readonly I[], pintar: (itens: I[]) => Map<I, MultiPolygon>): Map<I, MultiPolygon> {
  let arr = cache.get(chave);
  if (!arr) {
    const pintado = pintar([...active]);
    arr = active.map((i) => pintado.get(i) ?? []);
    cache.set(chave, arr);
  }
  const lista = arr;
  return new Map(active.map((i, k) => [i, lista[k]!] as const));
}
