import { t, type Lang } from './i18n.ts';
import { isCurtainType, wallThicknessOf } from './wallType.ts';
import type { Project, Wall } from './types.ts';

/** Limite da inclinação de parede, em graus a partir da vertical. */
export const WALL_TILT_MAX = 60;

type WallTiltInput = Pick<Wall, 'a' | 'b' | 'sag' | 'typeId' | 'levelId' | 'topLevelId' | 'baseOffset' | 'topOffset' | 'height' | 'topProfile'>;

/** Inclinação efetiva em graus (ausente = 0). */
export const wallTiltOf = (w: { tilt?: number }): number => w.tilt ?? 0;

/**
 * Altura vertical que o modelo consegue conhecer sem o motor: nível de topo + deslocamento menos a base; se o nível não
 * existir ou a altura sair não positiva, a altura nominal `height`. Topo/base anexados a piso ou telhado dependem do
 * motor e não são resolvidos aqui (usa-se o valor nominal).
 */
export function wallNominalHeight(p: Project, w: WallTiltInput): number {
  if (w.topLevelId) {
    const base = p.levels.find((l) => l.id === w.levelId);
    const top = p.levels.find((l) => l.id === w.topLevelId);
    if (base && top) {
      const h = top.elevation + w.topOffset - (base.elevation + w.baseOffset);
      if (h > 0) return h;
    }
  }
  return w.height;
}

/**
 * Motivo (já traduzido) pelo qual `tilt` não pode valer para a parede `w`, ou null se é válido. Regras: finito, |tilt| ≤ 60,
 * sem coexistir com `topProfile` (até a Fase 3) e, em arco inclinado para o centro, R − H·tan|θ| > t/(2cosθ) + 0,01.
 * Sem o tipo da parede no projeto, a regra do arco não se aplica (o comando é a camada que valida).
 */
export function wallTiltIssue(p: Project, w: WallTiltInput, tilt: number, lang: Lang = 'pt'): string | null {
  if (typeof tilt !== 'number' || !Number.isFinite(tilt)) return t(lang, 'md_cmd_tilt_invalid');
  if (Math.abs(tilt) > WALL_TILT_MAX) return t(lang, 'md_cmd_tilt_limit', { max: WALL_TILT_MAX });
  if (tilt === 0) return null;
  if (w.topProfile) return t(lang, 'md_cmd_tilt_top_profile');
  const s = Math.abs(w.sag);
  // Parede cortina inclinada: só reta (a grade e os painéis são resolvidos num plano; o arco inclinado seria um cone).
  if (s > 1e-9 && isCurtainType(p.wallTypes[w.typeId])) return t(lang, 'md_cmd_tilt_curtain_arc');
  if (s <= 1e-9) return null;
  const type = p.wallTypes[w.typeId];
  if (!type) return null;
  const chord = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const r = (chord * chord / 4 + s * s) / (2 * s);
  // Deslocamento do centro à esquerda de a→b; no semicírculo (0), a concavidade abre do lado oposto à flecha.
  const sgn = Math.sign(w.sag);
  const centro = w.sag - r * sgn;
  const ladoCentro = Math.abs(centro) > 1e-9 ? Math.sign(centro) : -sgn;
  if (Math.sign(tilt) !== ladoCentro) return null;
  const th = (Math.abs(tilt) * Math.PI) / 180;
  const esp = wallThicknessOf(type);
  if (r - wallNominalHeight(p, w) * Math.tan(th) > esp / (2 * Math.cos(th)) + 0.01) return null;
  return t(lang, 'md_cmd_tilt_arc_closes', { r: r.toFixed(2), t: esp.toFixed(3) }); // units-ok: mensagem de diagnóstico em metros, sem unidade de exibição
}
