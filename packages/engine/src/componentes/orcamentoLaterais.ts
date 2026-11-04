import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import type { CaixaLocal, Pose } from './encaixeTipos.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import { caixaLocalDoComponente } from './encaixeProjeto.ts';
import { resolverComponente } from './instancia.ts';
import type { PecaResolvida } from './pecas.ts';

/*
 * Lateral compartilhada entre módulos vizinhos de uma fila (F6-lateral). Um conjunto com a regra
 * `'lateral-compartilhada'` economiza uma lateral por par de módulos ENCOSTADOS: a lateral do lado direito do
 * módulo seguinte (maior x local) some da lista, porque a do anterior já ocupa aquele lado. Puro e determinístico.
 */

/** Uma lateral a descontar do orçamento, indicando o conjunto, o módulo e a peça. */
export interface LateralCompartilhada {
  grupoId: Id;
  /** Módulo de onde a peça sai (o segundo do par, `k + 1`). */
  descontadoDe: Id;
  /** Id da peça na família (`PecaResolvida.id`). */
  peca: string;
}

/** Distância máxima (m) entre os lados para considerar os módulos encostados: 2 mm. */
const TOLERANCIA_ENCOSTADO = 0.002;

function componenteDoProjeto(p: Project, id: Id): Component | null {
  const e = p.elements[id];
  return e !== undefined && isComponent(e) ? e : null;
}

function poseDe(c: Component): Pose {
  return { x: c.x, y: c.y, rotation: c.rotation, mirrored: c.mirrored, z: c.z };
}

/** Ponto médio entre dois cantos. */
function meio(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Distância (m) entre o lado de x local mínimo do primeiro módulo e o de x local máximo do segundo, medida em planta.
 * Os retângulos vêm de `retanguloNoMundo` com as poses e as caixas locais; como as rotações são iguais, os lados são
 * paralelos e a distância é a do afastamento entre as retas. `null` quando a caixa é degenerada.
 */
function distanciaEntreLados(poseA: Pose, caixaA: CaixaLocal, poseB: Pose, caixaB: CaixaLocal): number | null {
  const cantosA = retanguloNoMundo(poseA, caixaA);
  const cantosB = retanguloNoMundo(poseB, caixaB);
  // Aresta do lado de x = mínimo: cantos 0 → 3 (mesma direção do eixo y local, que o espelho não muda).
  const direcao = { x: cantosA[3]!.x - cantosA[0]!.x, y: cantosA[3]!.y - cantosA[0]!.y };
  const comprimento = Math.hypot(direcao.x, direcao.y);
  if (comprimento === 0) return null;
  const normal = { x: -direcao.y / comprimento, y: direcao.x / comprimento };
  const meioA = meio(cantosA[0]!, cantosA[3]!);
  const meioB = meio(cantosB[1]!, cantosB[2]!);
  return Math.abs((meioB.x - meioA.x) * normal.x + (meioB.y - meioA.y) * normal.y);
}

function encostados(p: Project, a: Component, b: Component): boolean {
  if (a.rotation !== b.rotation) return false;
  const caixaA = caixaLocalDoComponente(p, a);
  const caixaB = caixaLocalDoComponente(p, b);
  if (caixaA === null || caixaB === null) return false;
  const distancia = distanciaEntreLados(poseDe(a), caixaA, poseDe(b), caixaB);
  return distancia !== null && distancia <= TOLERANCIA_ENCOSTADO;
}

/** Id da peça de papel `lateral` com maior origem x local (a lateral do lado direito do módulo), ou `null`. */
function lateralDoLadoDireito(p: Project, c: Component): string | null {
  const { pecas } = resolverComponente(p, c);
  let escolhida: PecaResolvida | null = null;
  for (const peca of pecas) {
    if (peca.vazio || peca.papel !== 'lateral') continue;
    if (escolhida === null || peca.origem[0] > escolhida.origem[0]) escolhida = peca;
  }
  return escolhida?.id ?? null;
}

/**
 * Laterais compartilhadas do projeto: para cada conjunto (em ordem de id) com a regra `'lateral-compartilhada'`,
 * percorre os `membros` na ordem da fila e, para cada par consecutivo encostado (rotações iguais e distância entre os
 * lados ≤ 2 mm), indica a lateral de maior x local do segundo módulo. Módulo sem peça `lateral` não gera desconto.
 * Determinístico: conjuntos por id e membros na ordem recebida.
 */
export function lateraisCompartilhadas(p: Project): LateralCompartilhada[] {
  const grupos = p.componentGroups;
  if (grupos === undefined) return [];
  const saida: LateralCompartilhada[] = [];
  for (const grupoId of Object.keys(grupos).sort()) {
    const grupo = grupos[grupoId];
    if (grupo === undefined || grupo.regras?.includes('lateral-compartilhada') !== true) continue;
    for (let k = 0; k + 1 < grupo.membros.length; k++) {
      const anterior = componenteDoProjeto(p, grupo.membros[k]!);
      const seguinte = componenteDoProjeto(p, grupo.membros[k + 1]!);
      if (anterior === null || seguinte === null || !encostados(p, anterior, seguinte)) continue;
      const peca = lateralDoLadoDireito(p, seguinte);
      if (peca === null) continue;
      saida.push({ grupoId, descontadoDe: seguinte.id, peca });
    }
  }
  return saida;
}
