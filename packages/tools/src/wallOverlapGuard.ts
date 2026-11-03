import { applyTransform, type Transform } from '@hestia/geom';
import { elementLabel, isWall, wallConflict, wallOverlap, type Id, type Project, type Wall, type WallCandidate, type WallConflict } from '@hestia/model';
import type { ToolEnv } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Bloqueio de parede em cima de parede (decisão 0044). O critério é o do C14 da validação (`wallOverlap`): eixos
 * praticamente colineares no mesmo nível, a menos de 1 cm na lateral, com trecho em comum acima de 5 cm.
 *
 * Bloquear em vez de só avisar vale para o que a operação está criando: a ferramenta Parede não cria sobre outra, e
 * mover/copiar/girar/espelhar não deixa uma parede em cima de outra. Um par que já se sobrepunha antes da operação
 * continua valendo — senão um projeto antigo (com o aviso C14) ficaria travado para edição.
 */

/** Comprimento da sobreposição em centímetros inteiros. */
const emCm = (m: number): string => `${Math.round(m * 100)} cm`;

/** Mensagem única do bloqueio: diz o motivo e que nada mudou. */
export function wallOverlapMessage(c: WallConflict, lang: Lang = 'pt'): string {
  return translate(lang, 'tl_msg_wall_overlap', { wall: elementLabel(c.wall), d: emCm(c.overlap.length) });
}

/**
 * Avisa o bloqueio na barra de status E no alerta modal (a interface exige o OK, para a recusa não passar
 * despercebida). Devolve true para quem recusa — as ferramentas usam `return notifyWallOverlap(...)`.
 */
export function notifyWallOverlap(env: ToolEnv, conflict: WallConflict): boolean {
  const message = wallOverlapMessage(conflict, env.lang?.() ?? 'pt');
  env.say(message);
  // A vista realça a parede que impede a operação em amarelo enquanto o alerta estiver aberto.
  env.alert?.(message, [conflict.wall.id]);
  return true;
}

/** Paredes dentre `ids`; pisos, lajes e demais elementos não entram no teste. */
export function wallsOf(p: Project, ids: readonly Id[]): Wall[] {
  return ids.map((id) => p.elements[id]).filter(isWall);
}

/** A parede com o eixo transformado por `t` (a sobreposição olha só o eixo a→b, como o C14). */
function probeWall(w: Wall, t: Transform): Wall {
  return { ...w, a: applyTransform(t, w.a), b: applyTransform(t, w.b) };
}

/** Primeira parede do projeto (mesmo nível) sob `after`, ignorando `ignore`. */
function covering(p: Project, after: Wall, ignore: ReadonlySet<Id>): WallConflict | null {
  for (const e of Object.values(p.elements)) {
    if (!isWall(e) || ignore.has(e.id) || e.levelId !== after.levelId) continue;
    const overlap = wallOverlap(after, e);
    if (overlap) return { wall: e, overlap };
  }
  return null;
}

/**
 * Sobreposição que MOVER `walls` por `t` criaria. `walls` são as paredes selecionadas: elas não contam umas para as
 * outras (o conjunto que se move não colide consigo mesmo), mas duas delas que passam a se sobrepor contam.
 */
export function moveOverlap(project: Project, walls: readonly Wall[], t: Transform): WallConflict | null {
  const ignore = new Set(walls.map((w) => w.id));
  for (const w of walls) {
    const after = probeWall(w, t);
    for (const e of Object.values(project.elements)) {
      if (!isWall(e) || ignore.has(e.id) || e.levelId !== after.levelId) continue;
      const overlap = wallOverlap(after, e);
      // Já se sobrepunham antes de mover: não é esta operação que criou a sobreposição.
      if (!overlap || wallOverlap(w, e)) continue;
      return { wall: e, overlap };
    }
  }
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i]!;
      const b = walls[j]!;
      const overlap = wallOverlap(probeWall(a, t), probeWall(b, t));
      if (overlap && !wallOverlap(a, b)) return { wall: b, overlap };
    }
  }
  return null;
}

/** Sobreposição que COPIAR `walls` por `t` criaria: a cópia é parede nova, então cobre qualquer parede, inclusive a de origem. */
export function copyOverlap(project: Project, walls: readonly Wall[], t: Transform): WallConflict | null {
  const none: ReadonlySet<Id> = new Set();
  for (const w of walls) {
    const conflict = covering(project, probeWall(w, t), none);
    if (conflict) return conflict;
  }
  return null;
}

/** Sobreposição entre a candidata e outras candidatas do mesmo lote (cópias que ainda não estão no projeto). */
function coveringAmong(candidates: readonly Wall[], after: Wall): WallConflict | null {
  for (const e of candidates) {
    if (e.levelId !== after.levelId) continue;
    const overlap = wallOverlap(after, e);
    if (overlap) return { wall: e, overlap };
  }
  return null;
}

/**
 * Sobreposição que um LOTE de cópias criaria (Matriz, Colar): cada `transforms[i]` é uma cópia do conjunto `walls`.
 * Confere contra o projeto e entre as próprias cópias do lote.
 */
export function copiesOverlap(project: Project, walls: readonly Wall[], transforms: readonly Transform[]): WallConflict | null {
  const lote: Wall[] = [];
  for (const t of transforms) {
    for (const w of walls) {
      const cand = probeWall(w, t);
      const conflict = covering(project, cand, new Set()) ?? coveringAmong(lote, cand);
      if (conflict) return conflict;
      lote.push(cand);
    }
  }
  return null;
}

/** Recusa (avisa e devolve true) quando o lote de cópias criaria parede em cima de outra. */
export function refuseCopiesOverlap(env: ToolEnv, ids: readonly Id[], transforms: readonly Transform[]): boolean {
  const p = env.project();
  const conflict = copiesOverlap(p, wallsOf(p, ids), transforms);
  if (!conflict) return false;
  return notifyWallOverlap(env, conflict);
}

/** Recusa (avisa e devolve true) quando mover `ids` por `t` deixaria uma parede em cima de outra. */
export function refuseMoveOverlap(env: ToolEnv, ids: readonly Id[], t: Transform): boolean {
  const p = env.project();
  const conflict = moveOverlap(p, wallsOf(p, ids), t);
  if (!conflict) return false;
  return notifyWallOverlap(env, conflict);
}

/** Recusa (avisa e devolve true) quando copiar `ids` por `t` criaria uma parede nova em cima de outra. */
export function refuseCopyOverlap(env: ToolEnv, ids: readonly Id[], t: Transform): boolean {
  const p = env.project();
  const conflict = copyOverlap(p, wallsOf(p, ids), t);
  if (!conflict) return false;
  return notifyWallOverlap(env, conflict);
}

/** Recusa (avisa e devolve true) criar `wall` em cima de uma parede existente (ferramenta Parede). */
export function refuseWallOverlap(env: ToolEnv, wall: WallCandidate): boolean {
  const conflict = wallConflict(env.project(), wall);
  if (!conflict) return false;
  return notifyWallOverlap(env, conflict);
}
