import { applyTransform, type Transform } from '@hestia/geom';
import { validarFamilia } from './familia/validar.ts';
import type { Familia } from './familia/tipos.ts';
import type { Component, Id, Project } from './types.ts';

/*
 * Componentes no projeto (ADR 0049 §3.1): uma instância (`Component`) aponta para uma família guardada no projeto
 * (`Project.componentFamilies`). Funções puras sobre o projeto; os comandos que as usam estão em `commands.ts`.
 * Transformação da instância no mundo: `mundo = R(rotation) · E · local + (x, y)`, onde `E` espelha o eixo X local quando `mirrored`
 * (local em metros, origem no canto mínimo da família) e `z` sobe sobre o nível.
 */

/** Transformação de uma instância por mover, girar, espelhar ou copiar (a posição vai pelo mesmo `applyTransform` das outras peças). */
export function transformComponent(c: Component, t: Transform): Component {
  const pos = applyTransform(t, { x: c.x, y: c.y });
  if (t.kind === 'translate') return { ...c, x: pos.x, y: pos.y };
  if (t.kind === 'rotate') return { ...c, x: pos.x, y: pos.y, rotation: normalizarAngulo(c.rotation + t.angle) };
  // Espelho em torno da reta a→b (ângulo φ): θ' = 2φ − θ + π e o espelhamento local inverte (F·S = R(π)·S').
  const fi = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
  return { ...c, x: pos.x, y: pos.y, rotation: normalizarAngulo(2 * fi - c.rotation + Math.PI), mirrored: !c.mirrored };
}

/** Ângulo em (−π, π]. */
export function normalizarAngulo(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  else if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

/** Família do projeto para a instância, ou `undefined`. */
export function familiaDoComponente(p: Pick<Project, 'componentFamilies'>, c: Pick<Component, 'familyId'>): Familia | undefined {
  return p.componentFamilies?.[c.familyId];
}

/** Motivo (em português) pelo qual a instância não pode entrar no projeto, ou `null`. */
export function componentIssue(p: Project, c: Pick<Component, 'familyId' | 'typeId' | 'levelId' | 'x' | 'y' | 'z' | 'rotation'>): string | null {
  const fam = p.componentFamilies?.[c.familyId];
  if (!fam) return 'Família do componente não existe no projeto.';
  if (c.typeId !== null && !fam.tipos.some((t) => t.id === c.typeId)) return 'Tipo do componente não existe na família.';
  if (!p.levels.some((l) => l.id === c.levelId)) return 'Nível do componente não existe.';
  if (![c.x, c.y, c.z, c.rotation].every((n) => Number.isFinite(n))) return 'Posição ou rotação do componente inválida.';
  return null;
}

/** Motivo pelo qual a família não pode entrar no projeto (primeiro erro de `validarFamilia`), ou `null`. */
export function familyIssue(f: Familia): string | null {
  const erro = validarFamilia(f).find((x) => x.nivel === 'erro');
  return erro ? `${erro.mensagem} (${erro.onde})` : null;
}

/** Instâncias do projeto que usam a família. */
export function componentesDaFamilia(p: Project, familyId: Id): Component[] {
  return Object.values(p.elements).filter((e): e is Component => e.kind === 'component' && e.familyId === familyId);
}
