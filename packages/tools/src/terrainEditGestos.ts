import { aplicarOpsFontes, isTerrain, isTerrainRegion, terrainIssue, type Id, type OpTerreno, type Project, type Terrain } from '@hestia/model';
import type { Lang } from './i18n.ts';
import type { FonteRef } from './terrainEditPick.ts';
import type { ToolEnv } from './types.ts';

/**
 * Operações sobre as FONTES do terreno que cada gesto do modo "Editar terreno" produz (A.6). Funções puras: devolvem a lista de `OpTerreno` de UM
 * `editTerrainFontes` (um desfazer). Nada aqui gera malha, curva de nível ou perfil: são só dados do modelo.
 */

/** Terreno da seleção: o selecionado, ou o da região selecionada. */
export function terrenoDaSelecao(p: Project, ids: readonly Id[]): Terrain | null {
  for (const id of ids) {
    const e = p.elements[id];
    if (isTerrain(e)) return e;
    if (isTerrainRegion(e)) {
      const t = p.elements[e.terrenoId];
      if (isTerrain(t)) return t;
    }
  }
  return null;
}

/** Terreno da seleção; sem seleção, o único terreno do nível (senão nenhum). */
export function terrenoAlvo(p: Project, ids: readonly Id[], levelId: Id): Terrain | null {
  const sel = terrenoDaSelecao(p, ids);
  if (sel) return sel;
  const doNivel = Object.values(p.elements).filter((e): e is Terrain => isTerrain(e) && e.levelId === levelId);
  return doNivel.length === 1 ? doNivel[0]! : null;
}

/** Mover o item para (x, y). A cota não muda. Rótulo e ponto cotado não se arrastam (apagam-se e recolocam-se). */
export function opsMover(tn: Terrain, ref: FonteRef, x: number, y: number): OpTerreno[] {
  switch (ref.tipo) {
    case 'ponto': return [{ op: 'movePonto', i: ref.i, x, y, z: tn.pontos[ref.i * 3 + 2]! }];
    case 'curva': return [{ op: 'moveVerticeCurva', i: ref.i, j: ref.j, x, y }];
    case 'quebra': return [{ op: 'moveVerticeQuebra', i: ref.i, j: ref.j, x, y, z: tn.quebras[ref.i]!.xyz[ref.j * 3 + 2]! }];
    default: return [];
  }
}

/** Mudar a cota: do ponto; da CURVA INTEIRA (vértice de curva); do vértice da quebra. Rótulo e ponto cotado não têm cota própria. */
export function opsCota(tn: Terrain, ref: FonteRef, z: number): OpTerreno[] {
  switch (ref.tipo) {
    case 'ponto': return [{ op: 'movePonto', i: ref.i, x: tn.pontos[ref.i * 3]!, y: tn.pontos[ref.i * 3 + 1]!, z }];
    case 'curva': return [{ op: 'setCurvaZ', i: ref.i, z }];
    case 'quebra': {
      const k = ref.j * 3;
      return [{ op: 'moveVerticeQuebra', i: ref.i, j: ref.j, x: tn.quebras[ref.i]!.xyz[k]!, y: tn.quebras[ref.i]!.xyz[k + 1]!, z }];
    }
    default: return [];
  }
}

const semK = (v: readonly number[], k: number, n: number): number[] => v.filter((_, m) => m < k * n || m >= (k + 1) * n);

/**
 * Remover o item. Ponto, linha de rótulo e ponto cotado saem inteiros. Vértice de curva ou de quebra sai SÓ ele: a linha é refeita sem o vértice
 * (`removeCurva` + `addCurva` no mesmo passo; a linha passa para o fim da lista); sobrando menos de 2 pontos, a linha toda é removida.
 */
export function opsRemover(tn: Terrain, ref: FonteRef): OpTerreno[] {
  switch (ref.tipo) {
    case 'ponto': return [{ op: 'removePonto', i: ref.i }];
    case 'rotulo': return [{ op: 'setLinhasRotulo', v: semK(tn.linhasRotulo, ref.i, 4) }];
    case 'cotado': return [{ op: 'setPontosCotados', v: semK(tn.pontosCotados, ref.i, 2) }];
    case 'curva': {
      const c = tn.curvas[ref.i]!;
      const xy = semK(c.xy, ref.j, 2);
      if (xy.length / 2 < 2) return [{ op: 'removeCurva', i: ref.i }];
      return [{ op: 'removeCurva', i: ref.i }, { op: 'addCurva', z: c.z, xy, fechada: c.fechada && xy.length / 2 >= 3 }];
    }
    case 'quebra': {
      const q = tn.quebras[ref.i]!;
      const xyz = semK(q.xyz, ref.j, 3);
      if (xyz.length / 3 < 2) return [{ op: 'removeQuebra', i: ref.i }];
      return [{ op: 'removeQuebra', i: ref.i }, { op: 'addQuebra', xyz }];
    }
  }
}

export const opsPonto = (x: number, y: number, z: number): OpTerreno[] => [{ op: 'addPonto', x, y, z }];

export const opsCurva = (pts: ReadonlyArray<{ x: number; y: number }>, z: number, fechada: boolean): OpTerreno[] => [
  { op: 'addCurva', z, xy: pts.flatMap((q) => [q.x, q.y]), fechada },
];

/** Linha de quebra: cada vértice com a sua cota (`zs` tem o mesmo tamanho de `pts`). */
export const opsQuebra = (pts: ReadonlyArray<{ x: number; y: number }>, zs: readonly number[]): OpTerreno[] => [
  { op: 'addQuebra', xyz: pts.flatMap((q, k) => [q.x, q.y, zs[k]!]) },
];

/** Borda: polígono fechado (o comando normaliza o sentido). */
export const opsBorda = (pts: ReadonlyArray<{ x: number; y: number }>): OpTerreno[] => [{ op: 'setBorda', xy: pts.flatMap((q) => [q.x, q.y]) }];

/** "Remover borda": volta a valer a envoltória das fontes. */
export const opsRemoverBorda = (): OpTerreno[] => [{ op: 'setBorda', xy: null }];

/** Acrescenta a linha de rótulo (x1, y1, x2, y2). */
export const opsRotulo = (tn: Terrain, a: { x: number; y: number }, b: { x: number; y: number }): OpTerreno[] => [
  { op: 'setLinhasRotulo', v: [...tn.linhasRotulo, a.x, a.y, b.x, b.y] },
];

/** Acrescenta o ponto cotado (x, y). */
export const opsCotado = (tn: Terrain, q: { x: number; y: number }): OpTerreno[] => [{ op: 'setPontosCotados', v: [...tn.pontosCotados, q.x, q.y] }];

/**
 * Grava as operações como UM `editTerrainFontes` (um desfazer). Valida antes: terreno que ficaria inválido não é gravado e a mensagem do modelo
 * sai na barra de status. Devolve se gravou.
 */
export function gravarOps(env: ToolEnv, tn: Terrain, ops: OpTerreno[], rotulo: string, lang: Lang): boolean {
  if (ops.length === 0) return false;
  try {
    const problema = terrainIssue(aplicarOpsFontes(tn, ops, lang), lang);
    if (problema) {
      env.say(problema);
      return false;
    }
  } catch (e) {
    env.say(e instanceof Error ? e.message : String(e));
    return false;
  }
  env.transaction(rotulo, () => env.exec({ type: 'editTerrainFontes', terrenoId: tn.id, ops }));
  return true;
}
