import type { Component, Id, Project } from '@hestia/model';
import type { CaixaLocal, Corpo, FaceDeParede } from './encaixeTipos.ts';

/**
 * Caixa do componente no sistema LOCAL (m): envolvente das peças não vazias resolvidas (`resolverComponente`), sem a transformação da
 * pose. Inclui o que sobra à frente (portas). `null` sem peças.
 */
export function caixaLocalDoComponente(_p: Project, _c: Component): CaixaLocal | null {
  throw new Error('não implementado');
}

/**
 * Os componentes do nível como `Corpo` (pose + caixa local), na ordem de `order`, menos os de `excluir`. Componentes sem peças ficam de fora.
 * A pose usa `z` = elevação do nível + `c.z`.
 */
export function corposDoNivel(_p: Project, _levelId: Id, _excluir: ReadonlySet<Id> = new Set()): Corpo[] {
  throw new Error('não implementado');
}

/**
 * Faces de parede do nível para o encaixe: para cada parede reta do nível, as DUAS faces (eixo ± espessura/2), cada uma orientada
 * para o lado livre ficar à ESQUERDA de a→b (a face do lado direito da parede é invertida). Paredes curvas ficam de fora (v1).
 * Ordem: por parede (ordem de criação) e, em cada uma, a face esquerda antes da direita.
 */
export function facesDasParedes(_p: Project, _levelId: Id): FaceDeParede[] {
  throw new Error('não implementado');
}
