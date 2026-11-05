import { add, len, mul, norm, sub } from '@hestia/geom';
import { formatQuantity, isWall, unitsOf, type Command, type Id, type Project } from '@hestia/model';
import { followingEnds } from './pick.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Comprimento mínimo aceito pela cota temporária (mesmo limite da ferramenta Parede). */
export const MIN_EDIT_LENGTH = 0.01;

/**
 * Comandos que dão à parede reta o comprimento `length`, mantendo a extremidade `a` fixa e movendo `b`
 * ao longo do eixo. Paredes ligadas em `b` acompanham (mesma regra da alça de extremidade).
 * Devolve erro em texto quando a operação não é possível; não altera nada.
 */
export function resizeWallCommands(p: Project, levelId: Id, wallId: Id, length: number, lang: Lang = 'pt'): { commands: Command[] } | { error: string } {
  const w = p.elements[wallId];
  if (!isWall(w)) return { error: translate(lang, 'tl_msg_select_wall') };
  if (w.sag !== 0) return { error: 'Alterar o comprimento por cota ainda não é suportado em parede curva.' };
  // Negação escrita como comparação positiva: NaN também é rejeitado.
  if (!(length >= MIN_EDIT_LENGTH)) return { error: `Comprimento mínimo: ${formatQuantity(unitsOf(p), 'length', MIN_EDIT_LENGTH)}.` };
  const d = sub(w.b, w.a);
  if (len(d) < 1e-9) return { error: 'A parede não tem direção definida.' };
  const newB = add(w.a, mul(norm(d), length));
  const follow = followingEnds(p, levelId, w.b, new Set([wallId]));
  const commands: Command[] = [{ type: 'setWallEnds', id: wallId, b: newB }];
  for (const c of follow) {
    commands.push(c.end === 'a' ? { type: 'setWallEnds', id: c.wallId, a: newB } : { type: 'setWallEnds', id: c.wallId, b: newB });
  }
  return { commands };
}
