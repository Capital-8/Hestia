import { isWall, WALL_TILT_MAX, type Id, type ProjectStore } from '@hestia/model';
import { t, useI18n } from './i18n.ts';
import { useUi } from './state.ts';

/** Limite da inclinação em radianos (o campo numérico de ângulo trabalha em SI). */
export const TILT_MAX_RAD = (WALL_TILT_MAX * Math.PI) / 180;

/** Graus da inclinação para radianos (valor que o campo de ângulo recebe). */
export const radDeGrau = (graus: number): number => (graus * Math.PI) / 180;

/** Radianos do campo para graus, arredondados a 1e-6° para não gravar ruído de conversão (15 vira 15, não 15,000000000000002). */
export const grauDeRad = (rad: number): number => Math.round(((rad * 180) / Math.PI) * 1e6) / 1e6;

/** Aviso da barra de status quando o campo recusa um valor fora de ±60°. */
export function avisoLimiteInclinacao(): void {
  useUi.setState({ status: t(useI18n.getState().lang, 'prc_msg_tilt_limit', { max: WALL_TILT_MAX }) });
}

/**
 * Grava a inclinação `graus` nas paredes de `ids` (só as que são parede) num único passo de desfazer. Devolve null se
 * gravou, ou o motivo já traduzido (limite, arco que se fecha, perfil de topo) para a barra de status ou o diálogo.
 */
export function inclinarParedes(store: ProjectStore, ids: readonly Id[], graus: number): string | null {
  const lang = useI18n.getState().lang;
  const paredes = ids.filter((id) => isWall(store.project.elements[id]));
  if (paredes.length === 0) return t(lang, 'prc_msg_tilt_no_wall');
  try {
    store.exec({ type: 'setWallTilt', ids: paredes, tilt: graus }, undefined, lang);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'prc_msg_tilt_invalid');
  }
}
