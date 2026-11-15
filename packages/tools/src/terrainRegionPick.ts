import { pointInRing, ringArea, type Ring, type Vec2 } from '@hestia/geom';
import { envoltoriaDasFontes, resolveFloors, resolveSlabs, servicoTerreno } from '@hestia/engine';
import { isTerrain, type Id, type Project, type Terrain } from '@hestia/model';
import { pickFloorAt } from './floorPick.ts';
import { pickSlabAt } from './slabPick.ts';

/**
 * Consultas da ferramenta de região de terreno (ficha T3): qual terreno está sob um ponto, quais vértices caem fora dele e qual laje ou
 * piso está sob um clique (opção "Por elemento" da plataforma). Funções puras, sem geração de malha: a cota e a posição vêm do kernel
 * (`servicoTerreno().cotaDoTerreno`); sem kernel, vale a borda do modelo (ou a envoltória das fontes) como reserva.
 */

const doModelo = (xy: readonly number[]): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < xy.length; i += 2) out.push({ x: xy[i]!, y: xy[i + 1]! });
  return out;
};

/** Borda de reserva do terreno: a do modelo ou a envoltória das fontes. Menos de 3 pontos = vazia. */
function bordaDeReserva(t: Terrain): Vec2[] {
  return t.borda && t.borda.length >= 6 ? doModelo(t.borda) : envoltoriaDasFontes(t);
}

/** Terrenos do projeto na ordem de criação. */
function terrenos(p: Project): Terrain[] {
  return Object.values(p.elements).filter(isTerrain).sort((a, b) => a.order - b.order);
}

/**
 * Terrenos que contêm cada ponto (`null` = fora de todos), na ordem dos pontos. Com o kernel pronto, quem responde é o kernel
 * (`cotaDoTerreno`: `null` no ponto = fora de todo terreno); sem kernel, a borda de reserva de cada terreno.
 */
export function terrenosSobPontos(p: Project, pontos: readonly Vec2[]): Array<Id | null> {
  if (pontos.length === 0) return [];
  const kernel = servicoTerreno().cotaDoTerreno(p, pontos, 1);
  if (kernel) return pontos.map((_, i) => kernel[i]?.terrenoId ?? null);
  const bordas = terrenos(p).map((t) => ({ id: t.id, anel: bordaDeReserva(t) })).filter((b) => b.anel.length >= 3);
  return pontos.map((q) => bordas.find((b) => pointInRing(q, b.anel))?.id ?? null);
}

/** O terreno sob o ponto, ou null (fora de todo terreno). */
export const terrenoSobPonto = (p: Project, at: Vec2): Id | null => terrenosSobPontos(p, [at])[0] ?? null;

/** Quantos vértices de `contorno` caem fora de TODO terreno (a parte de fora se perde na superfície proposta: aviso 6 do kernel). */
export function verticesForaDoTerreno(p: Project, contorno: readonly Vec2[]): number {
  return terrenosSobPontos(p, contorno).filter((id) => id === null).length;
}

/** Piso ou laje que serve de molde de uma plataforma: o contorno externo resolvido e a cota da face inferior. */
export interface ElementoDeContorno {
  id: Id;
  tipo: 'piso' | 'laje';
  /** Contorno externo resolvido (sem furos), sem repetir o primeiro ponto. */
  contorno: Vec2[];
  /** Cota absoluta da face inferior do elemento. */
  faceInferior: number;
}

/** Maior anel externo de um multipolígono (o contorno resolvido pode ter várias partes; a região é um polígono só). */
function maiorAnel(poligonos: ReadonlyArray<ReadonlyArray<Ring>>): Ring | null {
  let melhor: Ring | null = null;
  let area = 0;
  for (const poly of poligonos) {
    const externo = poly[0];
    if (!externo || externo.length < 3) continue;
    const a = Math.abs(ringArea(externo));
    if (a > area) {
      area = a;
      melhor = externo;
    }
  }
  return melhor ? melhor.map((q) => ({ x: q.x, y: q.y })) : null;
}

/**
 * Laje ou piso sob o clique no nível `levelId`, com o contorno RESOLVIDO (`resolveAllFloors`/`resolveAllSlabs`, não o contorno cru) e a
 * face inferior. A laje vence o piso quando os dois estão sob o ponto (a plataforma assenta sob a laje). Null: nada sob o clique ou o
 * elemento não tem contorno resolvido.
 */
export function elementoDeContornoSobPonto(p: Project, levelId: Id, at: Vec2, mpp: number): ElementoDeContorno | null {
  const slabId = pickSlabAt(p, levelId, at, mpp);
  if (slabId) {
    const r = resolveSlabs(p, levelId).find((x) => x.slabId === slabId);
    const anel = r ? maiorAnel(r.polygon) : null;
    if (r && anel) return { id: slabId, tipo: 'laje', contorno: anel, faceInferior: r.bottomZ };
  }
  const floorId = pickFloorAt(p, levelId, at, mpp);
  if (floorId) {
    const r = resolveFloors(p, levelId).find((x) => x.floorId === floorId);
    const anel = r ? maiorAnel(r.polygon) : null;
    if (r && anel) return { id: floorId, tipo: 'piso', contorno: anel, faceInferior: r.bottomZ };
  }
  return null;
}

/** Centro (média dos vértices) de um contorno, para achar o terreno quando o clique não cai sobre nenhum. */
export const centroDoContorno = (c: readonly Vec2[]): Vec2 => ({ x: c.reduce((s, q) => s + q.x, 0) / c.length, y: c.reduce((s, q) => s + q.y, 0) / c.length });
