import { TERRENO_LIMITES, type OpTerreno, type Terrain } from '@hestia/model';
import type { FonteRef } from './terrainEditPick.ts';

/** Vértice de fonte com cota (ponto solto, vértice de curva ou de quebra): o que o painel "Ponto selecionado" edita. */
export type RefDePonto = Extract<FonteRef, { tipo: 'ponto' | 'curva' | 'quebra' }>;

export const ehRefDePonto = (ref: FonteRef | null): ref is RefDePonto => ref !== null && (ref.tipo === 'ponto' || ref.tipo === 'curva' || ref.tipo === 'quebra');

/** Leitura do ponto escolhido, em coordenadas do projeto (x, y) e z do projeto (a cota exibida soma a cota zero). */
export interface DadosDoPonto {
  ref: RefDePonto;
  x: number;
  y: number;
  z: number;
}

/** Posição e cota do ponto; null se a referência não existe mais (por exemplo, depois de um desfazer). */
export function dadosDoPonto(tn: Terrain, ref: RefDePonto): DadosDoPonto | null {
  switch (ref.tipo) {
    case 'ponto': {
      const k = ref.i * 3;
      return tn.pontos.length > k + 2 ? { ref, x: tn.pontos[k]!, y: tn.pontos[k + 1]!, z: tn.pontos[k + 2]! } : null;
    }
    case 'curva': {
      const c = tn.curvas[ref.i];
      return c && c.xy.length > ref.j * 2 + 1 ? { ref, x: c.xy[ref.j * 2]!, y: c.xy[ref.j * 2 + 1]!, z: c.z } : null;
    }
    case 'quebra': {
      const q = tn.quebras[ref.i];
      return q && q.xyz.length > ref.j * 3 + 2 ? { ref, x: q.xyz[ref.j * 3]!, y: q.xyz[ref.j * 3 + 1]!, z: q.xyz[ref.j * 3 + 2]! } : null;
    }
  }
}

/** Campos a mudar (os ausentes ficam como estão): x e y do projeto; z do projeto. */
export interface CamposDoPonto {
  x?: number;
  y?: number;
  z?: number;
}

/** Os campos são números finitos dentro dos limites do terreno (coordenada e cota)? */
export function camposValidos(c: CamposDoPonto): boolean {
  const ok = (v: number | undefined, max: number): boolean => v === undefined || (Number.isFinite(v) && Math.abs(v) <= max);
  return ok(c.x, TERRENO_LIMITES.coordMax) && ok(c.y, TERRENO_LIMITES.coordMax) && ok(c.z, TERRENO_LIMITES.cotaMax);
}

/**
 * Operações de UM `editTerrainFontes` que levam o ponto aos novos valores, pelas operações que o editor já usa: ponto solto `movePonto`;
 * vértice de curva `moveVerticeCurva` (x, y) e `setCurvaZ` (a cota vale para a CURVA INTEIRA); vértice de quebra `moveVerticeQuebra`.
 * Só o que mudou vira operação; sem mudança, lista vazia.
 */
export function opsDoPonto(atual: DadosDoPonto, c: CamposDoPonto): OpTerreno[] {
  const x = c.x ?? atual.x;
  const y = c.y ?? atual.y;
  const z = c.z ?? atual.z;
  const moveu = x !== atual.x || y !== atual.y;
  const mudouZ = z !== atual.z;
  const { ref } = atual;
  if (!moveu && !mudouZ) return [];
  switch (ref.tipo) {
    case 'ponto': return [{ op: 'movePonto', i: ref.i, x, y, z }];
    case 'quebra': return [{ op: 'moveVerticeQuebra', i: ref.i, j: ref.j, x, y, z }];
    case 'curva': {
      const ops: OpTerreno[] = [];
      if (moveu) ops.push({ op: 'moveVerticeCurva', i: ref.i, j: ref.j, x, y });
      if (mudouZ) ops.push({ op: 'setCurvaZ', i: ref.i, z });
      return ops;
    }
  }
}
