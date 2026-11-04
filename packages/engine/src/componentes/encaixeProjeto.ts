import type { Component, Id, Project } from '@hestia/model';
import { levelElevation, totalThickness, wallType, wallsOnLevel } from '@hestia/model';
import { resolverComponente } from './instancia.ts';
import type { CaixaLocal, Corpo, FaceDeParede } from './encaixeTipos.ts';

/**
 * Caixa do componente no sistema LOCAL (m): envolvente das peças não vazias resolvidas (`resolverComponente`), sem a transformação da
 * pose. Inclui o que sobra à frente (portas). `null` sem peças.
 */
export function caixaLocalDoComponente(p: Project, c: Component): CaixaLocal | null {
  const { pecas } = resolverComponente(p, c);
  let encontrou = false;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const peca of pecas) {
    if (peca.vazio) continue;
    encontrou = true;
    for (let i = 0; i < 3; i++) {
      const inicio = peca.origem[i]!;
      const fim = inicio + peca.extensao[i]!;
      if (inicio < min[i]!) min[i] = inicio;
      if (fim > max[i]!) max[i] = fim;
    }
  }
  return encontrou ? { min, max } : null;
}

/**
 * Os componentes do nível como `Corpo` (pose + caixa local), na ordem de `order`, menos os de `excluir`. Componentes sem peças ficam de fora.
 * A pose usa `z` = elevação do nível + `c.z`.
 */
export function corposDoNivel(p: Project, levelId: Id, excluir: ReadonlySet<Id> = new Set()): Corpo[] {
  const elevacao = levelElevation(p, levelId);
  const componentes = Object.values(p.elements)
    .filter((e): e is Component => e.kind === 'component' && e.levelId === levelId)
    .sort((a, b) => a.order - b.order);
  const corpos: Corpo[] = [];
  for (const c of componentes) {
    if (excluir.has(c.id)) continue;
    const caixa = caixaLocalDoComponente(p, c);
    if (!caixa) continue;
    corpos.push({
      id: c.id,
      pose: { x: c.x, y: c.y, rotation: c.rotation, mirrored: c.mirrored, z: elevacao + c.z },
      caixa,
    });
  }
  return corpos;
}

/**
 * Faces de parede do nível para o encaixe: para cada parede reta do nível, as DUAS faces (eixo ± espessura/2), cada uma orientada
 * para o lado livre ficar à ESQUERDA de a→b (a face do lado direito da parede é invertida). Paredes curvas ficam de fora (v1).
 * Ordem: por parede (ordem de criação) e, em cada uma, a face esquerda antes da direita.
 */
export function facesDasParedes(p: Project, levelId: Id): FaceDeParede[] {
  const faces: FaceDeParede[] = [];
  for (const parede of wallsOnLevel(p, levelId)) {
    if (parede.sag !== 0) continue;
    const dx = parede.b.x - parede.a.x;
    const dy = parede.b.y - parede.a.y;
    const comprimento = Math.hypot(dx, dy);
    if (comprimento === 0) continue;
    // Normal à esquerda do eixo a→b (lado livre da face esquerda).
    const nx = -dy / comprimento;
    const ny = dx / comprimento;
    const meia = totalThickness(wallType(p, parede)) / 2;
    const esquerdaA = { x: parede.a.x + nx * meia, y: parede.a.y + ny * meia };
    const esquerdaB = { x: parede.b.x + nx * meia, y: parede.b.y + ny * meia };
    const direitaA = { x: parede.a.x - nx * meia, y: parede.a.y - ny * meia };
    const direitaB = { x: parede.b.x - nx * meia, y: parede.b.y - ny * meia };
    faces.push({ a: esquerdaA, b: esquerdaB });
    // A face do lado direito é percorrida de b para a para deixar o lado livre à esquerda.
    faces.push({ a: direitaB, b: direitaA });
  }
  return faces;
}
