import { intersection, offsetMulti, type MultiPolygon, type Ring } from '@hestia/geom';
import { terminoCamadaOf, terminoMeters, terminoOf, type Id, type Layer, type LayerTermino, type OutlineSource, type Project } from '@hestia/model';
import { enclosedRooms, outerPerimeter, roomAt, type RoomExtend } from './enclosed.ts';
import type { ResolvedWall } from './types.ts';
import { regionMinusWalls, regionPlusWalls, wallsOfLevel } from './terminoBlock.ts';
import { regionCamada } from './terminoCamada.ts';

/**
 * Contorno por camada de piso e de laje vinculados às paredes (decisão 0023 §2, P8). Cada camada escolhe, pelo seu
 * término (`termino`), entre o contorno na face de acabamento da parede e o contorno no núcleo dela. A escolha usa só
 * atributos de camada: a posição no núcleo do elemento (`core`) e o término. Nome e material não entram.
 */

/** Elemento vinculado: a origem do contorno e os furos manuais (os de escada entram depois, em `floors`/`slabs`). */
export interface LinkedHost {
  outlineSource?: OutlineSource;
  holes: Ring[];
}

/** Polígono de um circuito fechado (anel externo e ilhas de parede) com os furos manuais do elemento. */
function withHoles(room: Ring[], holes: Ring[]): MultiPolygon {
  return [[room[0]!, ...holes, ...room.slice(1)]];
}

/** Faixa de cota de uma camada (absoluta, m), para escolher as paredes que a tocam. */
export interface LayerZone {
  z0: number;
  z1: number;
}

/**
 * Paredes que contam para as camadas do elemento (decisão 0025): os níveis dados (piso: o próprio nível; laje: também o
 * de baixo e o de cima, para o teto entre pavimentos) e a faixa de cota de cada camada.
 */
export interface WallScope {
  levelIds: Id[];
  zones: readonly LayerZone[];
}

/** Término que pede a prioridade de parede (`{ ate }`). */
const isAte = (t: LayerTermino): t is { ate: { prioridade: number } } => typeof t === 'object' && 'ate' in t;

/**
 * Contorno de cada camada, antes do corte de escada. Elemento estático, de perímetro externo ou com circuito aberto:
 * as camadas com `auto` recebem `base`, como antes — exceto no perímetro pelo núcleo (decisão 0026, D3): a camada fora
 * do núcleo para na face interna da parede (`regionMinusWalls` com `{ kind: 'face' }` e a faixa de cota da própria
 * camada) e a camada do núcleo (ou o tipo sem camada estrutural) fica no contorno do elemento, que já é o do núcleo.
 * Vinculado a circuito fechado: `finish` e `core` vêm do mesmo circuito (o do modo do elemento é o `base`; o outro é
 * recalculado). Quando o circuito do núcleo não fecha, as camadas que iriam ao núcleo ficam na face de acabamento.
 *
 * Término (decisão 0023 §2 e 0025): `face` = até a face de acabamento; `nucleo` = até o núcleo; `passa` = sem recorte;
 * `{ate}` = até a primeira camada da parede de prioridade ≤ N; `{cm}` = a face de acabamento deslocada (positivo avança), só
 * em elemento vinculado: em estático e em perímetro o deslocamento segue ignorado, como antes.
 * `{camada}` (decisão 0054) = até uma camada da parede, em toda parede que a camada toca (`regionCamada`, contorno de acabamento como
 * partida). Nos três casos com parede, a região é o contorno menos a zona bloqueada das paredes do `scope` (`regionMinusWalls`).
 * Em elemento vinculado, `face` e `nucleo` saem dos circuitos (P8, sem mudança). Sem `scope`, não há paredes.
 */
export function layerOutlines(p: Project, levelId: Id, el: LinkedHost, layers: readonly Layer[], core: readonly boolean[], base: MultiPolygon, scope?: WallScope): MultiPolygon[] {
  const src = el.outlineSource;
  const linked = !!src?.linked && src.mode !== 'perimeter' && !!src.seed;
  // Elemento de perímetro com contorno no núcleo (decisão 0026, D3): a camada do núcleo fica no contorno inteiro (que já
  // está na face do núcleo) e as demais param na face interna da parede. Fora do modo core, `auto` continua como antes.
  const perimetroCore = !linked && src?.mode === 'perimeter' && src.extend === 'core';
  const fallback = layers.map(() => base);
  const term = layers.map(terminoOf);
  let walls: ResolvedWall[] | null = null;
  const wallsNow = (): ResolvedWall[] => (walls ??= scope ? scope.levelIds.flatMap((id) => wallsOfLevel(p, id)) : []);
  const zoneOf = (i: number): LayerZone => scope?.zones[i] ?? { z0: 0, z1: 0 };
  // O `passa` de elemento vinculado soma a pegada das paredes que tocam o ELEMENTO (0025 §4), não só a camada: a
  // estrutura pode estar abaixo do contato da parede e ainda assim correr por baixo dela (revisão de 2026-10-22).
  const allZ0 = scope?.zones.length ? Math.min(...scope.zones.map((z) => z.z0)) : 0;
  const allZ1 = scope?.zones.length ? Math.max(...scope.zones.map((z) => z.z1)) : 0;
  /**
   * Limite no perímetro externo (decisão 0027). Independente do `termino` (que governa as paredes internas): corta a
   * região da camada no contorno externo da edificação, na face pedida — `parede` na face externa do acabamento, `nucleo`
   * na face externa do núcleo, que deixa o acabamento externo contínuo por fora da laje. Sem limite, fica o contorno.
   */
  const limite = (i: number, m: MultiPolygon): MultiPolygon => {
    const lim = layers[i]?.limiteExterno;
    if (!lim) return m;
    const ring = outerPerimeter(p, levelId, src?.seed, lim === 'nucleo' ? 'core' : 'finish');
    return ring ? intersection(m, [[ring]]) : m;
  };
  if (src?.mode === 'perimeter') {
    // F6 (0023 §2): a borda externa tem a face de acabamento e a do núcleo, como as paredes internas.
    const edge = (extend: RoomExtend): MultiPolygon | null => {
      const ring = outerPerimeter(p, levelId, src.seed, extend);
      return ring ? [[ring, ...el.holes]] : null;
    };
    const finish = edge('finish');
    if (!finish) return fallback;
    const needCore = term.some((t) => t === 'nucleo' || t === 'passa' || isAte(t));
    const corePoly = needCore ? edge('core') : null;
    const ref = corePoly ?? finish;
    return layers.map((_, i) => {
      const t = term[i]!;
      if (t === 'passa') return base;
      const porCamada = terminoCamadaOf(t);
      if (porCamada) return regionCamada(p, finish, wallsNow(), porCamada, zoneOf(i).z0, zoneOf(i).z1);
      if (isAte(t)) return regionMinusWalls(p, ref, wallsNow(), { kind: 'ate', prioridade: t.ate.prioridade }, zoneOf(i).z0, zoneOf(i).z1);
      // `{cm}` desloca a face externa da camada (F6): positivo avança sobre a parede, como nas paredes internas.
      if (typeof t === 'object' && 'cm' in t) return t.cm === 0 ? finish : offsetMulti(finish, terminoMeters(t));
      if (t === 'nucleo') return corePoly ?? finish;
      if (t === 'face') return finish;
      // `auto` no perímetro fica na face de acabamento, por compatibilidade com os projetos antigos (0023 F6; a decisão
      // de levar o `auto` ao núcleo é o item 14 do plano). No perímetro pelo núcleo (T7, decisão 0026 D3) a camada do
      // núcleo fica no contorno inteiro, que já está na face do núcleo, e as demais param na face interna da parede.
      if (!perimetroCore) return finish;
      return core[i] ? base : regionMinusWalls(p, base, wallsNow(), { kind: 'face' }, zoneOf(i).z0, zoneOf(i).z1);
    }).map((m, i) => limite(i, m));
  }
  const circuit = (extend: RoomExtend): MultiPolygon | null => {
    const room = roomAt(enclosedRooms(p, levelId, extend), src!.seed!);
    return room ? withHoles(room, el.holes) : null;
  };
  const finish = !linked ? base : src!.mode === 'walls-finish' ? base : circuit('finish');
  if (!finish) return fallback;
  const needCore = linked && term.some((t, i) => t === 'nucleo' || t === 'passa' || isAte(t) || (t === 'auto' && core[i]));
  const corePoly = !linked ? base : src!.mode === 'walls-core' ? base : needCore ? circuit('core') : null;
  const ref = corePoly ?? finish;
  return layers.map((_, i) => {
    const t = term[i]!;
    const porCamada = terminoCamadaOf(t);
    if (porCamada) return regionCamada(p, finish, wallsNow(), porCamada, zoneOf(i).z0, zoneOf(i).z1);
    if (typeof t === 'object' && 'cm' in t) return linked && t.cm !== 0 ? offsetMulti(finish, terminoMeters(t)) : base;
    if (t === 'face') return linked ? finish : regionMinusWalls(p, base, wallsNow(), { kind: 'face' }, zoneOf(i).z0, zoneOf(i).z1);
    if (t === 'nucleo') return linked ? ref : regionMinusWalls(p, base, wallsNow(), { kind: 'nucleo' }, zoneOf(i).z0, zoneOf(i).z1);
    if (t === 'passa') return linked ? regionPlusWalls(p, ref, wallsNow(), allZ0, allZ1) : base;
    if (isAte(t)) return regionMinusWalls(p, ref, wallsNow(), { kind: 'ate', prioridade: t.ate.prioridade }, zoneOf(i).z0, zoneOf(i).z1);
    return core[i] && corePoly ? corePoly : finish;
  }).map((m, i) => limite(i, m));
}

/**
 * Corte de escada com memória: a mesma forma (objeto) não é recortada duas vezes. Camadas com o contorno do elemento
 * reaproveitam o resultado do próprio elemento.
 */
export function memoCut(cut: (m: MultiPolygon) => MultiPolygon): (m: MultiPolygon) => MultiPolygon {
  const done = new Map<MultiPolygon, MultiPolygon>();
  return (m) => {
    let r = done.get(m);
    if (!r) {
      r = cut(m);
      done.set(m, r);
    }
    return r;
  };
}
