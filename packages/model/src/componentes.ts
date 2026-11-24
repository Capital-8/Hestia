import { applyTransform, type Transform } from '@hestia/geom';
import { validarFamilia } from './familia/validar.ts';
import type { Familia } from './familia/tipos.ts';
import { conexoesIssue } from './sistemasMep.ts';
import type { Component, Id, Project } from './types.ts';

/*
 * Componentes no projeto (ADR 0049 §3.1): uma instância (`Component`) aponta para uma família guardada no projeto
 * (`Project.componentFamilies`). Funções puras sobre o projeto; os comandos que as usam estão em `commands.ts`.
 * Transformação da instância no mundo: `mundo = R(rotation) · E · local + (x, y)`, onde `E` espelha o eixo X local quando `mirrored`
 * (local em metros, origem no canto mínimo da família) e `z` sobe sobre o nível.
 * Com a inclinação 3D (ADR 0061, CONTRATO §7): `mundo = Rz(rotation) · E · Ry(inclinacao[0]) · Rz(inclinacao[1]) · local + (x, y, z)`.
 */

/** Ponto 3D (metros). */
export interface PontoXYZ {
  x: number;
  y: number;
  z: number;
}

/** Transformação de uma instância por mover, girar, espelhar ou copiar (a posição vai pelo mesmo `applyTransform` das outras peças). */
export function transformComponent(c: Component, t: Transform): Component {
  const pos = applyTransform(t, { x: c.x, y: c.y });
  if (t.kind === 'translate') return { ...c, x: pos.x, y: pos.y };
  if (t.kind === 'rotate') return { ...c, x: pos.x, y: pos.y, rotation: normalizarAngulo(c.rotation + t.angle) };
  // Espelho em torno da reta a→b (ângulo φ): θ' = 2φ − θ + π e o espelhamento local inverte (F·S = R(π)·S').
  const fi = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
  return { ...c, x: pos.x, y: pos.y, rotation: normalizarAngulo(2 * fi - c.rotation + Math.PI), mirrored: !c.mirrored };
}

/**
 * Matriz 4×4 do componente (local → mundo) em ORDEM DE COLUNA (16 números, como three.js/glTF: o elemento da linha `i`, coluna `j`
 * fica em `m[4·j + i]`; a translação `(x, y, z)` vai nos índices 12, 13 e 14). `Rz(rotation) · E · Ry(inclinacao[0]) · Rz(inclinacao[1])`,
 * com `E` espelhando X local quando `mirrored`. Sem `inclinacao` é exatamente `R(rotation) · E` e `z` somado (o comportamento de sempre).
 */
export function matrizDoComponente(c: Pick<Component, 'x' | 'y' | 'z' | 'rotation' | 'mirrored' | 'inclinacao'>): number[] {
  const [inc, giro] = c.inclinacao ?? [0, 0];
  const cr = Math.cos(c.rotation), sr = Math.sin(c.rotation);
  const ci = Math.cos(inc), si = Math.sin(inc);
  const cg = Math.cos(giro), sg = Math.sin(giro);
  // A = Ry(inc) · Rz(giro), por linhas.
  const a00 = ci * cg, a01 = -ci * sg, a02 = si;
  const a10 = sg, a11 = cg, a12 = 0;
  const a20 = -si * cg, a21 = si * sg, a22 = ci;
  // E espelha a linha X de A (E · A); Rz(rotation) gira as linhas X e Y.
  const e = c.mirrored ? -1 : 1;
  const b00 = e * a00, b01 = e * a01, b02 = e * a02;
  return [
    cr * b00 - sr * a10, sr * b00 + cr * a10, a20, 0,
    cr * b01 - sr * a11, sr * b01 + cr * a11, a21, 0,
    cr * b02 - sr * a12, sr * b02 + cr * a12, a22, 0,
    c.x, c.y, c.z, 1,
  ];
}

/** Ponto local da família (metros) no mundo, pela `matrizDoComponente`. */
export function pontoNoMundo(c: Pick<Component, 'x' | 'y' | 'z' | 'rotation' | 'mirrored' | 'inclinacao'>, local: PontoXYZ): PontoXYZ {
  const m = matrizDoComponente(c);
  const g = (i: number): number => m[i] ?? 0;
  return {
    x: g(0) * local.x + g(4) * local.y + g(8) * local.z + g(12),
    y: g(1) * local.x + g(5) * local.y + g(9) * local.z + g(13),
    z: g(2) * local.x + g(6) * local.y + g(10) * local.z + g(14),
  };
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
export function componentIssue(p: Project, c: Pick<Component, 'familyId' | 'typeId' | 'levelId' | 'x' | 'y' | 'z' | 'rotation' | 'groupId' | 'inclinacao'> & Partial<Pick<Component, 'id' | 'ligacoes'>>): string | null {
  const fam = p.componentFamilies?.[c.familyId];
  if (!fam) return 'Família do componente não existe no projeto.';
  if (c.typeId !== null && !fam.tipos.some((t) => t.id === c.typeId)) return 'Tipo do componente não existe na família.';
  if (!p.levels.some((l) => l.id === c.levelId)) return 'Nível do componente não existe.';
  if (c.groupId !== undefined && !p.componentGroups?.[c.groupId]) return 'Conjunto do componente não existe no projeto.';
  if (![c.x, c.y, c.z, c.rotation].every((n) => Number.isFinite(n))) return 'Posição ou rotação do componente inválida.';
  if (c.inclinacao !== undefined) {
    const [inc, giro] = c.inclinacao;
    if (!Number.isFinite(inc) || !Number.isFinite(giro)) return 'Inclinação do componente inválida.';
    if (inc < 0 || inc > Math.PI) return 'A inclinação do componente deve estar entre 0 e π.';
  }
  if (c.ligacoes !== undefined && c.id !== undefined) {
    const conexoes = conexoesIssue(p, { id: c.id, familyId: c.familyId, ligacoes: c.ligacoes });
    if (conexoes) return conexoes;
  }
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

/** Componentes do conjunto, na ordem de `membros`; ids que já não são componentes ficam de fora. */
export function componentesDoGrupo(p: Pick<Project, 'componentGroups' | 'elements'>, id: Id): Component[] {
  const grupo = p.componentGroups?.[id];
  if (!grupo) return [];
  return grupo.membros
    .map((membro) => p.elements[membro])
    .filter((e): e is Component => e?.kind === 'component');
}
