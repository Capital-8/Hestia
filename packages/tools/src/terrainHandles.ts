import { type Transform, type Vec2 } from '@hestia/geom';
import { envoltoriaDasFontes } from '@hestia/engine';
import { copiarTerreno, isTerrain, isTerrainRegion, newId, transformTerrain, transformTerrainRegion, type Command, type Id, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import type { PreviewItem } from './types.ts';

/**
 * O terreno como GRUPO nas ferramentas de modificação (regra 3 do contrato): o terreno e as suas regiões andam juntos.
 * O `transform` do modelo move um terreno sozinho (M1); aqui as ferramentas completam isso: a seleção leva as regiões
 * (`selectedTerrenosComRegioes`), o fantasma as desenha (`ghostTerreno`), a cópia nasce com as regiões remapeadas para o
 * terreno novo (`comandosCopiaTerreno`) e o deslocamento vertical do corte soma a todas as cotas (`comandosVerticalTerreno`).
 * As alças de edição dos pontos são do modo "Editar terreno" (ficha T2).
 */

/** Regiões do terreno, na ordem de criação. */
export function regioesDoTerreno(p: Project, terrenoId: Id): TerrainRegion[] {
  return Object.values(p.elements)
    .filter((e): e is TerrainRegion => isTerrainRegion(e) && e.terrenoId === terrenoId)
    .sort((a, b) => a.order - b.order);
}

/** Terrenos dentro da seleção. */
export const selectedTerrains = (p: Project, ids: readonly Id[]): Id[] => ids.filter((id) => isTerrain(p.elements[id]));

/** Terrenos selecionados, cada um seguido das suas regiões (sem repetir). Região sozinha na seleção não entra (é da ficha T3). */
export function selectedTerrenosComRegioes(p: Project, ids: readonly Id[]): Id[] {
  const out: Id[] = [];
  const visto = new Set<Id>();
  for (const id of selectedTerrains(p, ids)) {
    for (const x of [id, ...regioesDoTerreno(p, id).map((r) => r.id)]) {
      if (visto.has(x)) continue;
      visto.add(x);
      out.push(x);
    }
  }
  return out;
}

const pares = (v: readonly number[], passo: number): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < v.length; i += passo) out.push({ x: v[i]!, y: v[i + 1]! });
  return out;
};

/** Limite de segmentos do fantasma (arrastar milhares de curvas por quadro pesaria no cursor). */
const FANTASMA_MAX_SEGMENTOS = 600;

/**
 * Fantasma do terreno ou da região sob uma transformação: a borda (ou a envoltória das fontes), as curvas desenhadas e
 * os pontos (no limite) do terreno, e o contorno da região. É dado do modelo: nada de malha nem de curva derivada.
 */
export function ghostTerreno(p: Project, id: Id, t: Transform): PreviewItem[] {
  const e = p.elements[id];
  if (isTerrainRegion(e)) return [{ kind: 'polygon', ring: transformTerrainRegion(e, t).contorno, dashed: true }];
  if (!isTerrain(e)) return [];
  const tn = transformTerrain(e, t);
  const out: PreviewItem[] = [];
  const borda = tn.borda && tn.borda.length >= 6 ? pares(tn.borda, 2) : envoltoriaDasFontes(tn);
  if (borda.length >= 3) out.push({ kind: 'polygon', ring: borda, dashed: true });
  let n = 0;
  for (const c of tn.curvas) {
    const pts = pares(c.xy, 2);
    const fim = c.fechada ? pts.length : pts.length - 1;
    for (let i = 0; i < fim && n < FANTASMA_MAX_SEGMENTOS; i++, n++) out.push({ kind: 'line', a: pts[i]!, b: pts[(i + 1) % pts.length]!, dashed: true });
  }
  for (let i = 0; i + 2 < tn.pontos.length && n < FANTASMA_MAX_SEGMENTOS; i += 3, n++) out.push({ kind: 'point', at: { x: tn.pontos[i]!, y: tn.pontos[i + 1]! } });
  return out;
}

/** Soma `dz` às cotas das fontes (pontos, curvas e quebras); o resto fica como está. */
export function fontesComCotaSomada(tn: Pick<Terrain, 'pontos' | 'curvas' | 'quebras'>, dz: number): Pick<Terrain, 'pontos' | 'curvas' | 'quebras'> {
  const somaZ = (v: readonly number[]): number[] => v.map((x, i) => (i % 3 === 2 ? x + dz : x));
  return {
    pontos: somaZ(tn.pontos),
    curvas: tn.curvas.map((c) => ({ z: c.z + dz, xy: c.xy.slice(), fechada: c.fechada })),
    quebras: tn.quebras.map((q) => ({ xyz: somaZ(q.xyz) })),
  };
}

/**
 * Cópia dos terrenos `ids` sob a transformação `t` (e `dz` somado a todas as cotas): um `addTerrain` com as fontes
 * transformadas e um `addTerrainRegion` por região, já com `terrenoId` do terreno NOVO. O `transform` com `copy` do modelo
 * deixaria a região copiada presa ao terreno original. Devolve também o mapa de ids (original para cópia).
 */
export function comandosCopiaTerreno(p: Project, ids: readonly Id[], t: Transform, dz = 0, mint: (prefixo: string) => Id = newId): { commands: Command[]; idMap: Record<Id, Id> } {
  const commands: Command[] = [];
  const idMap: Record<Id, Id> = {};
  for (const id of selectedTerrains(p, ids)) {
    const tn = transformTerrain(p.elements[id] as Terrain, t);
    const novo = mint('tn');
    idMap[id] = novo;
    const { order: _ordem, ...sem } = copiarTerreno(tn);
    commands.push({ type: 'addTerrain', terrain: { ...sem, id: novo, ...(dz ? fontesComCotaSomada(sem, dz) : {}) } });
    for (const r of regioesDoTerreno(p, id)) {
      const rn = mint('rg');
      idMap[r.id] = rn;
      const { order: _o, ...resto } = transformTerrainRegion(r, t);
      commands.push({ type: 'addTerrainRegion', regiao: { ...resto, id: rn, terrenoId: novo, cota: resto.papel === 'subdivisao' ? resto.cota : resto.cota + dz, contorno: resto.contorno.map((q) => ({ ...q })) } });
    }
  }
  return { commands, idMap };
}

/**
 * Deslocamento vertical do terreno (mover no corte): soma `dz` a TODAS as cotas das fontes num único comando
 * (`substituirFontes`). A cota das regiões plataforma e nivelada sobe junto (é absoluta), em `updateTerrainRegion`.
 */
export function comandosVerticalTerreno(p: Project, id: Id, dz: number): Command[] {
  const e = p.elements[id];
  if (isTerrainRegion(e)) return e.papel === 'subdivisao' ? [] : [{ type: 'updateTerrainRegion', id, patch: { cota: e.cota + dz } }];
  if (!isTerrain(e)) return [];
  const f = fontesComCotaSomada(e, dz);
  return [{ type: 'editTerrainFontes', terrenoId: id, ops: [{ op: 'substituirFontes', ...f }] }];
}
