import { dist, type Vec2 } from '@hestia/geom';
import { isWall, type Id, type Project } from '@hestia/model';
import { t as translate, type Lang } from './i18n.ts';

/** Aviso quando o canto já está feito: o aparar não grava nada (sem passo de desfazer vazio). */
export const nothingToTrimMsg = (lang: Lang = 'pt'): string => translate(lang, 'tl_msg_nothing_to_trim');
export const NADA_A_APARAR = nothingToTrimMsg();

/** Algum ajuste de canto muda a parede (comparado com o projeto atual). Sem mudança, o aparar não grava nada. */
export function algumMudou(pr: Project, patches: Array<{ id: Id; patch: { a?: Vec2; b?: Vec2; sag?: number } }>): boolean {
  const mudou = (novo: Vec2 | undefined, atual: Vec2): boolean => !!novo && dist(novo, atual) > 1e-9;
  return patches.some(({ id, patch }) => {
    const w = pr.elements[id];
    if (!isWall(w)) return false;
    return mudou(patch.a, w.a) || mudou(patch.b, w.b) || (patch.sag !== undefined && Math.abs(patch.sag - (w.sag ?? 0)) > 1e-9);
  });
}
