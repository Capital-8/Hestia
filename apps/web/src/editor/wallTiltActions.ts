import { cadeiaContinua, joinStatus, levelFrames } from '@hestia/engine';
import { isWall, wallTiltOf, WALL_TILT_MAX, type Command, type Id, type ProjectStore } from '@hestia/model';
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

/** Cadeia contínua (com sinal por sentido a→b) da primeira parede selecionada; vazia se não houver parede. */
function cadeiaDaSelecao(store: ProjectStore, ids: readonly Id[]): Array<{ id: Id; sinal: 1 | -1 }> {
  const ref = ids.map((id) => store.project.elements[id]).find(isWall);
  if (!ref) return [];
  return cadeiaContinua(levelFrames(store.project, ref.levelId), ref.id, store.project.settings?.joinTolerance);
}

/**
 * Ação D "Acompanhar inclinação": aplica a inclinação da primeira parede selecionada a toda a cadeia contínua dela (o sinal
 * acompanha o sentido a→b de cada parede), num único desfazer. Nunca age sozinho. Devolve null se aplicou, ou o motivo traduzido.
 */
export function acompanharInclinacao(store: ProjectStore, ids: readonly Id[]): string | null {
  const lang = useI18n.getState().lang;
  const cadeia = cadeiaDaSelecao(store, ids);
  if (cadeia.length === 0) return t(lang, 'prc_msg_tilt_no_wall');
  const ref = store.project.elements[cadeia[0]!.id];
  const graus = isWall(ref) ? wallTiltOf(ref) : 0;
  try {
    store.exec({ type: 'alignTiltOfChain', items: cadeia.map((c) => ({ id: c.id, tilt: graus * c.sinal })) }, undefined, lang);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'prc_msg_tilt_invalid');
  }
}

/**
 * Ação B "Cunha": marca `transicao: 'cunha'` (ou volta a 'degrau') nas junções da cadeia contínua da parede selecionada, num
 * único desfazer. A geometria da parede não muda; só ganha o prisma que fecha o degrau. Devolve null se aplicou.
 */
export function definirTransicaoDaCadeia(store: ProjectStore, ids: readonly Id[], cunha: boolean): string | null {
  const lang = useI18n.getState().lang;
  const cadeia = cadeiaDaSelecao(store, ids);
  if (cadeia.length < 2) return t(lang, 'prc_msg_tilt_chain_none');
  const p = store.project;
  const frames = levelFrames(p, (p.elements[cadeia[0]!.id] as { levelId: Id }).levelId);
  const noCadeia = new Set(cadeia.map((c) => c.id));
  const cmds: Command[] = [];
  const vistos = new Set<string>();
  for (const { id } of cadeia) {
    const w = p.elements[id];
    if (!isWall(w)) continue;
    for (const end of ['a', 'b'] as const) {
      const st = joinStatus(frames, id, end, p.settings?.joinTolerance);
      const par = st.kind === 'pair' ? st.partners[0] : undefined;
      if (!par || !noCadeia.has(par.wallId)) continue;
      const chave = [`${id}|${end}`, `${par.wallId}|${par.end}`].sort().join('~');
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const outra = p.elements[par.wallId];
      const dona = !isWall(outra) || w.order <= outra.order ? { w, end } : { w: outra, end: par.end };
      const cfg = dona.end === 'a' ? dona.w.joinStart : dona.w.joinEnd;
      const { transicao: _t, ...resto } = cfg;
      cmds.push({ type: 'setJoin', ends: [{ wallId: id, end }, par], config: cunha ? { ...resto, transicao: 'cunha' } : resto });
    }
  }
  if (cmds.length === 0) return t(lang, 'prc_msg_tilt_chain_none');
  try {
    store.exec(cmds.length === 1 ? cmds[0]! : { type: 'batch', commands: cmds }, undefined, lang);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'prc_msg_tilt_invalid');
  }
}
