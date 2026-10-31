import { regenRamp } from '@hestia/engine';
import {
  elementLevelId,
  hasLevel,
  isRamp,
  isStair,
  levelAbove,
  rampBaseZ,
  rampTopZ,
  stairBaseZ,
  stairFitPatch,
  stairTopZ,
  type Id,
  type LevelKeep,
  type Project,
  type ProjectStore,
  type Ramp,
  type Stair,
} from '@hestia/model';

/** Preferência da tela (não do projeto): como manter a cota ao trocar de nível. Padrão: manter a cota. */
export const LEVEL_KEEP_KEY = 'hestia.levelKeep';

export const LEVEL_KEEP_LABEL: Record<LevelKeep, string> = { elevation: 'Manter a cota', offset: 'Levar o deslocamento' };

export function readLevelKeep(): LevelKeep {
  try {
    const v = localStorage.getItem(LEVEL_KEEP_KEY);
    if (v === 'elevation' || v === 'offset') return v;
  } catch {
    /* armazenamento indisponível: vale o padrão */
  }
  return 'elevation';
}

export function writeLevelKeep(keep: LevelKeep): void {
  try {
    localStorage.setItem(LEVEL_KEEP_KEY, keep);
  } catch {
    /* sem armazenamento: a escolha vale só nesta sessão */
  }
}

export interface LevelMove {
  ok: boolean;
  /** Elementos que mudaram de nível. */
  moved: number;
  /** Mensagem para a barra de status. */
  message: string;
}

/** Ids que têm nível próprio. Aberturas ficam de fora: acompanham a parede anfitriã. */
export function levelBearingIds(p: Project, ids: Id[]): Id[] {
  return ids.filter((id) => hasLevel(p.elements[id]));
}

/**
 * Move os elementos para o nível dado, em um único passo de desfazer ("Mudar de nível").
 * A seleção e a vista não mudam; se o nível novo não for o da vista, a mensagem avisa.
 */
export function moveToLevel(store: ProjectStore, ids: Id[], levelId: Id, keep: LevelKeep, activeLevelId: Id): LevelMove {
  const p = store.project;
  const target = p.levels.find((l) => l.id === levelId);
  if (!target) return { ok: false, moved: 0, message: 'Nível inexistente.' };
  const unique = [...new Set(ids)];
  const targets = levelBearingIds(p, unique);
  const skippedOpenings = unique.length > targets.length;
  if (targets.length === 0) return { ok: false, moved: 0, message: 'Nada a mover: selecione paredes, pisos, lajes ou telhados.' };
  const moved = targets.filter((id) => elementLevelId(p.elements[id]) !== levelId).length;
  if (moved === 0) return { ok: true, moved: 0, message: `Já ${targets.length === 1 ? 'está' : 'estão'} em ${target.name}.` };
  try {
    store.exec({ type: 'setElementLevel', ids: targets, levelId, keep });
  } catch (e) {
    return { ok: false, moved: 0, message: e instanceof Error ? e.message : 'Falha ao mudar de nível.' };
  }
  const noun = moved === 1 ? 'elemento movido' : 'elementos movidos';
  const off = levelId !== activeLevelId ? ', fora do nível da vista' : '';
  const openings = skippedOpenings ? ' Aberturas acompanham a parede.' : '';
  return { ok: true, moved, message: `${moved} ${noun} para ${target.name}${off}.${openings} Ctrl+Z desfaz.` };
}

/** Escada/rampa sem altura positiva: o motor não gera degraus/furo (decisão 0011 §7). */
const semAltura = (h: number): boolean => !(h > 0.001);

/**
 * Fixa o nível de topo automático (`topLevelId: null` → `levelAbove`) no nível que é o topo AGORA.
 * Sem isso, editar a cota do nível (ou inserir um nível no meio) muda o alvo da escada sem o usuário pedir.
 * Devolve quantos elementos foram fixados.
 */
export function pinAutoTops(store: ProjectStore): number {
  const p = store.project;
  const list = Object.values(p.elements).filter((e) => isStair(e) || isRamp(e)).filter((e) => e.topLevelId === null);
  if (list.length === 0) return 0;
  let n = 0;
  store.transaction('Fixar topo das escadas e rampas', () => {
    for (const e of list) {
      const above = levelAbove(p, e.levelId);
      if (!above) continue;
      store.exec({ type: 'updateElements', ids: [e.id], patch: { topLevelId: above.id } });
      n++;
    }
  });
  return n;
}

export interface MoveLevelResult {
  ok: boolean;
  /** Escadas/rampas reajustadas à nova altura (espelhos ou comprimento). */
  adjusted: number;
  /** Escadas/rampas que continuam sem altura válida depois da edição. */
  invalid: number;
  message: string;
}

/** Escada/rampa cuja base ou topo dependem do nível (inclui o topo automático que hoje cai nele). */
function affectedByLevel(p: Project, levelId: Id): Array<Stair | Ramp> {
  return Object.values(p.elements).filter((e): e is Stair | Ramp => {
    if (!isStair(e) && !isRamp(e)) return false;
    if (e.levelId === levelId) return true;
    if (e.topLevelId === levelId) return true;
    return e.topLevelId === null && levelAbove(p, e.levelId)?.id === levelId;
  });
}

const invalidStair = (p: Project, s: Stair): boolean => semAltura(stairTopZ(p, s) - stairBaseZ(p, s));
const invalidRamp = (p: Project, r: Ramp): boolean => semAltura(rampTopZ(p, r) - rampBaseZ(p, r));

/**
 * Edita a cota de um nível como operação de projeto (Revit: mudar o nível regenera os dependentes):
 * fixa os topos automáticos, aplica a cota e, na mesma transação, reajusta escadas (nº de espelhos) e rampas
 * (comprimento no modo 'slope'). Nunca apaga nem esconde o elemento: o que não couber fica inválido e visível.
 * `keepHeights` (opcional) compensa os offsets para manter base/topo nas cotas absolutas de antes.
 */
export function moveLevel(store: ProjectStore, levelId: Id, elevation: number, keepHeights = false): MoveLevelResult {
  const p0 = store.project;
  const level = p0.levels.find((l) => l.id === levelId);
  if (!level) return { ok: false, adjusted: 0, invalid: 0, message: 'Nível inexistente.' };
  if (!Number.isFinite(elevation)) return { ok: false, adjusted: 0, invalid: 0, message: 'Elevação inválida.' };
  if (elevation === level.elevation) return { ok: true, adjusted: 0, invalid: 0, message: `Nada a mover: ${level.name} já está nesta cota.` };

  const delta = elevation - level.elevation;
  const affected = affectedByLevel(p0, levelId);
  let adjusted = 0;
  let failed = 0;

  store.transaction('Mover nível', () => {
    // 1. O topo automático vira referência explícita no nível que é o topo antes da edição.
    for (const e of affected) {
      if (e.topLevelId !== null) continue;
      const above = levelAbove(p0, e.levelId);
      if (above) store.exec({ type: 'updateElements', ids: [e.id], patch: { topLevelId: above.id } });
    }
    // 2. Política "manter altura": compensa o deslocamento para a base/topo ficarem na cota absoluta de antes.
    if (keepHeights) {
      for (const e of affected) {
        const cur = store.project.elements[e.id];
        if (!cur || (!isStair(cur) && !isRamp(cur))) continue;
        const patch: { baseOffset?: number; topOffset?: number } = {};
        if (cur.levelId === levelId) patch.baseOffset = cur.baseOffset - delta;
        if (cur.topLevelId === levelId) patch.topOffset = cur.topOffset - delta;
        if (Object.keys(patch).length > 0) store.exec({ type: 'updateElements', ids: [cur.id], patch });
      }
    }
    // 3. A cota do nível (fecha a transação com um único Ctrl+Z).
    store.exec({ type: 'upsertLevel', level: { ...level, elevation } });

    // 4. Reajuste dos dependentes (Revit/ArchiCAD: mudança pequena mantém N; grande reajusta).
    if (!keepHeights) {
      for (const e of affected) {
        const cur = store.project.elements[e.id];
        if (isStair(cur)) {
          const fit = stairFitPatch(store.project, cur);
          if (fit) {
            store.exec({ type: 'updateElements', ids: [cur.id], patch: fit });
            adjusted++;
          }
        } else if (isRamp(cur)) {
          // Modo 'length': o comprimento manda; o aviso `ramp-slope-differs` já aponta a inclinação nova.
          if (cur.inputMode !== 'slope' || cur.slopeTarget === null) continue;
          const regen = regenRamp(cur, store.project, {});
          if ('error' in regen) {
            failed++;
            continue;
          }
          store.exec({
            type: 'updateElements',
            ids: [cur.id],
            patch: {
              components: regen.components,
              inputMode: regen.inputMode,
              slopeTarget: regen.slopeTarget,
              landingDepth: regen.landingDepth,
              ...(regen.freePath ? { freePath: regen.freePath } : {}),
            },
          });
          adjusted++;
        }
      }
    }
  });

  const p1 = store.project;
  const invalid = affected.filter((e) => {
    const cur = p1.elements[e.id];
    return isStair(cur) ? invalidStair(p1, cur) : isRamp(cur) ? invalidRamp(p1, cur) : false;
  }).length;
  const parts: string[] = [];
  if (adjusted > 0) parts.push(`${adjusted} ${adjusted === 1 ? 'escada/rampa reajustada' : 'escadas/rampas reajustadas'} à nova altura`);
  if (invalid > 0) parts.push(`${invalid} ${invalid === 1 ? 'ficou' : 'ficaram'} sem altura válida (veja os avisos)`);
  if (failed > 0) parts.push(`${failed} ${failed === 1 ? 'rampa não pôde' : 'rampas não puderam'} ser regenerada(s)`);
  return {
    ok: true,
    adjusted,
    invalid,
    message: parts.length > 0 ? `${level.name}: ${parts.join('; ')}. Ctrl+Z desfaz.` : `${level.name} movido. Ctrl+Z desfaz.`,
  };
}
