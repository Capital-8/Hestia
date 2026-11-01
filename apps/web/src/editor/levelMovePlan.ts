/**
 * Plano e resumo da troca de cota de um nível: tipos do plano, verificação de conflitos e resumo em pt-BR.
 * Extraído de levelActions.ts para respeitar o limite de linhas; não importa levelActions.ts (sem import circular).
 */
import { refitStairToHeight, regenRamp, riserCountOf, stairWallOverlapIssues, treadFor, treadRuleOf } from '@hestia/engine';
import {
  ProjectStore,
  isRamp,
  isStair,
  levelAbove,
  rampBaseZ,
  rampTopZ,
  stairBaseZ,
  stairTopZ,
  type Id,
  type Project,
  type Ramp,
  type Stair,
  type StairType,
  type StairLanding,
  type StairRun,
} from '@hestia/model';

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

/** Escada/rampa sem altura positiva: o motor não gera degraus/furo (decisão 0011 §7). */
const semAltura = (h: number): boolean => !(h > 0.001);

/** Escada/rampa cuja base ou topo dependem do nível (inclui o topo automático que hoje cai nele). */
export function affectedByLevel(p: Project, levelId: Id): Array<Stair | Ramp> {
  return Object.values(p.elements).filter((e): e is Stair | Ramp => {
    if (!isStair(e) && !isRamp(e)) return false;
    if (e.levelId === levelId) return true;
    if (e.topLevelId === levelId) return true;
    return e.topLevelId === null && levelAbove(p, e.levelId)?.id === levelId;
  });
}

export const invalidStair = (p: Project, s: Stair): boolean => semAltura(stairTopZ(p, s) - stairBaseZ(p, s));
export const invalidRamp = (p: Project, r: Ramp): boolean => semAltura(rampTopZ(p, r) - rampBaseZ(p, r));

/** O que a decisão do usuário faz com as escadas/rampas em conflito. */
export type LevelMoveDecision = 'add' | 'delete' | 'cancel';

export interface LevelMoveStairPlan {
  id: Id;
  label: string;
  /** Nº de espelhos antes e depois (sobe quando o espelho passa do máximo; desce quando fica abaixo do mínimo do tipo). */
  from: number;
  to: number;
  /** Degraus acrescentados no último lance. */
  added: number;
  /** Degraus removidos do fim dos últimos lances (espelho abaixo do mínimo do tipo). */
  removed: number;
  /** Patamares inseridos pelo reajuste (NBR 9050: lance contínuo acima de 3,20 m). */
  landingsInserted?: number;
  /** Ainda falta patamar e o reajuste não pôde inseri-lo; `warning` explica. */
  landingNeeded?: boolean;
  riserHeight: number;
  tread: number;
  /** Espelho e piso antes da mudança (piso pela regra do tipo para o espelho antigo). */
  fromRiserHeight: number;
  fromTread: number;
  /** Escada de espelho fixo: o reajuste a manteve como está. */
  fixed?: boolean;
  /** Mudança relevante (N, patamar inserido ou faltando): pede resumo e confirmação antes de gravar. */
  needsConfirm: boolean;
  /** Resumo de uma linha (pt-BR), mostrado no diálogo e na barra de status. */
  summary: string;
  /** Aviso do motor (ex.: falta patamar). */
  warning?: string;
  status: 'ok' | 'conflict';
  reason?: string;
  components?: Array<StairRun | StairLanding>;
  freePath?: Stair['freePath'];
  manualLandings?: Stair['manualLandings'];
}

export interface LevelMoveRampPlan {
  id: Id;
  label: string;
  status: 'ok' | 'conflict';
  reason?: string;
  components?: Array<StairRun | StairLanding>;
  inputMode?: Ramp['inputMode'];
  slopeTarget?: number | null;
  landingDepth?: number;
  freePath?: Ramp['freePath'];
}

export interface LevelMovePlan {
  levelId: Id;
  levelName: string;
  elevation: number;
  stairs: LevelMoveStairPlan[];
  ramps: LevelMoveRampPlan[];
  /** Quantos precisam de decisão (não couberam/colidem). */
  conflicts: number;
  /** Escadas que mudam N, ganham patamar ou ficam sem patamar: pedem confirmação mesmo sem conflito. */
  confirmations: number;
  /** Quantos têm geometria nova para gravar. */
  adjusted: number;
  /** Quantos ficam sem altura válida depois da mudança. */
  invalid: number;
}

const labelOf = (e: { id: Id; mark: string }): string => (e.mark ? `${e.mark} (${e.id})` : e.id);

const f2 = (v: number): string => v.toFixed(2).replace('.', ',');
const f3 = (v: number): string => v.toFixed(3).replace('.', ',');

/** Espelho mínimo efetivo do tipo (mesmo critério do motor: sem `minRiser` válido, vale 0,16 m ou metade do máximo). */
export function effectiveMinRiser(type: Pick<StairType, 'maxRiser'> & { minRiser?: number }): number {
  const { maxRiser, minRiser } = type;
  return minRiser !== undefined && minRiser > 0 && minRiser < maxRiser ? minRiser : maxRiser > 0.16 ? 0.16 : maxRiser / 2;
}

/** Onde o espelho cai em relação à faixa do tipo (texto curto em pt-BR), ou null se não há faixa. */
export function riserBandNote(riser: number, type: Pick<StairType, 'maxRiser'> & { minRiser?: number }): { inside: boolean; text: string } | null {
  if (!(riser > 0) || !(type.maxRiser > 0)) return null;
  const min = effectiveMinRiser(type);
  const band = `${f2(min)}–${f2(type.maxRiser)}`;
  if (riser > type.maxRiser + 5e-4) return { inside: false, text: `${f3(riser - type.maxRiser)} m acima do máximo (${band} m)` };
  if (riser < min - 5e-4) return { inside: false, text: `${f3(min - riser)} m abaixo do mínimo (${band} m)` };
  return { inside: true, text: `dentro de ${band}` };
}

type StairSummaryInput = Pick<
  LevelMoveStairPlan,
  'from' | 'to' | 'added' | 'removed' | 'landingsInserted' | 'landingNeeded' | 'riserHeight' | 'tread' | 'fromRiserHeight' | 'fromTread' | 'fixed'
>;

/** Resumo de uma linha da escada reajustada: N, espelho, piso, encurta/alonga e patamar. */
function stairSummary(x: StairSummaryInput, type: StairType | undefined): string {
  const band = type ? riserBandNote(x.riserHeight, type) : null;
  if (x.fixed) {
    return `Escada de espelho fixo mantida: N ${x.from}, espelho ${f3(x.riserHeight)} m${band ? (band.inside ? ` (${band.text})` : `, ${band.text}`) : ''}.`;
  }
  const patamar = x.landingsInserted ? 'patamar inserido (NBR 9050)' : x.landingNeeded ? 'falta patamar (NBR 9050)' : '';
  if (x.to === x.from) {
    return `N mantido em ${x.from}; espelho ${f3(x.fromRiserHeight)} → ${f3(x.riserHeight)} m${band ? ` (${band.text})` : ''}${patamar ? ` · ${patamar}` : ''}`;
  }
  const parts = [`N ${x.from} → ${x.to}`, `espelho ${f3(x.fromRiserHeight)} → ${f3(x.riserHeight)} m`, `piso ${f2(x.fromTread)} → ${f2(x.tread)} m`];
  if (x.removed > 0) parts.push(`encurta ${f2(x.removed * x.tread)} m`);
  else if (x.added > 0) parts.push(`alonga ${f2(x.added * x.tread)} m`);
  if (patamar) parts.push(patamar);
  return parts.join(' · ');
}

/** Projeto de teste com o topo automático fixado e a cota já aplicada (não mexe no projeto real). */
function probeWithLevel(store: ProjectStore, levelId: Id, elevation: number): Project | null {
  const probe = new ProjectStore(store.project);
  pinAutoTops(probe);
  const level = probe.project.levels.find((l) => l.id === levelId);
  if (!level) return null;
  probe.exec({ type: 'upsertLevel', level: { ...level, elevation } });
  return probe.project;
}

/** A extensão proposta invade uma parede? (mesma regra do aviso `stair-wall-overlap`). */
function proposedWallReason(p: Project, s: Stair, components: Array<StairRun | StairLanding>): string | null {
  const candidate: Project = { ...p, elements: { ...p.elements, [s.id]: { ...s, components } } };
  const issue = stairWallOverlapIssues(candidate).find((i) => i.stairId === s.id);
  return issue ? issue.message : null;
}

/**
 * Planeja a edição da cota de um nível sem gravar nada. Para cada escada afetada, calcula o N novo
 * (`ceil(H ÷ maxRiser)`), o piso `T` pela regra do tipo, os degraus a acrescentar no último lance e os
 * componentes propostos; marca conflito quando a extensão invade parede, a forma não permite continuar ou
 * a escada fica sem altura. A tela usa isso para perguntar antes de aplicar.
 */
export function planLevelMove(store: ProjectStore, levelId: Id, elevation: number): LevelMovePlan | { error: string } {
  const p0 = store.project;
  const level = p0.levels.find((l) => l.id === levelId);
  if (!level) return { error: 'Nível inexistente.' };
  if (!Number.isFinite(elevation)) return { error: 'Elevação inválida.' };
  const p1 = probeWithLevel(store, levelId, elevation);
  if (!p1) return { error: 'Nível inexistente.' };
  const affected = affectedByLevel(p0, levelId);
  // Estado "antes" (topo automático fixado, cota antiga): dá o espelho/piso de partida.
  const pBefore = probeWithLevel(store, levelId, level.elevation) ?? p0;
  const stairs: LevelMoveStairPlan[] = [];
  const ramps: LevelMoveRampPlan[] = [];

  for (const e of affected) {
    if (isStair(e)) {
      const s1 = p1.elements[e.id];
      if (!isStair(s1)) continue;
      let from = 0;
      let fit: ReturnType<typeof refitStairToHeight>;
      try {
        from = riserCountOf(e);
        fit = refitStairToHeight(p1, s1);
      } catch (err) {
        // Componente malformado: o erro vira conflito com motivo (a tela pergunta) em vez de derrubar a edição da cota.
        stairs.push({
          id: e.id,
          label: labelOf(e),
          from,
          to: from,
          added: 0,
          removed: 0,
          riserHeight: 0,
          tread: 0,
          fromRiserHeight: 0,
          fromTread: 0,
          needsConfirm: false,
          summary: 'Não foi possível recalcular a escada.',
          status: 'conflict',
          reason: `Não foi possível recalcular a escada (${err instanceof Error ? err.message : 'erro desconhecido'}).`,
        });
        continue;
      }
      let status: 'ok' | 'conflict' = 'ok';
      let reason: string | undefined;
      if (invalidStair(p1, s1)) {
        status = 'conflict';
        reason = 'A escada fica sem altura válida (topo no mesmo nível ou abaixo).';
      } else if (!fit.components && fit.skipped !== 'fixed' && fit.skipped !== 'no-change') {
        status = 'conflict';
        reason = fit.message ?? 'Não foi possível continuar a escada.';
      } else if (fit.components) {
        const wall = proposedWallReason(p1, s1, fit.components);
        if (wall) {
          status = 'conflict';
          reason = wall;
        }
      }
      const type = p1.stairTypes[s1.typeId];
      const sBefore = pBefore.elements[e.id];
      const hBefore = isStair(sBefore) ? stairTopZ(pBefore, sBefore) - stairBaseZ(pBefore, sBefore) : 0;
      const fromRiserHeight = from > 0 && hBefore > 0 ? hBefore / from : 0;
      const fromTread = type && fromRiserHeight > 0 ? treadFor(fromRiserHeight, treadRuleOf(type)) : 0;
      const fixed = fit.skipped === 'fixed';
      const base = {
        from,
        to: fit.risers,
        added: fit.added,
        removed: fit.removed,
        riserHeight: fit.riserHeight,
        // Espelho fixo: o motor não recalcula o piso; vale o de antes.
        tread: fixed ? fromTread : fit.tread,
        fromRiserHeight,
        fromTread,
        ...(fit.landingsInserted ? { landingsInserted: fit.landingsInserted } : {}),
        ...(fit.landingNeeded ? { landingNeeded: true } : {}),
        ...(fixed ? { fixed: true } : {}),
      };
      const needsConfirm = status === 'ok' && !fixed && (fit.risers !== from || !!fit.landingsInserted || !!fit.landingNeeded);
      stairs.push({
        id: e.id,
        label: labelOf(e),
        ...base,
        needsConfirm,
        summary: stairSummary(base, type),
        ...(fit.landingNeeded && fit.message ? { warning: fit.message } : {}),
        status,
        ...(reason ? { reason } : {}),
        ...(fit.components ? { components: fit.components } : {}),
        ...(fit.freePath ? { freePath: fit.freePath } : {}),
        ...(fit.manualLandings ? { manualLandings: fit.manualLandings } : {}),
      });
    } else if (isRamp(e)) {
      const r1 = p1.elements[e.id];
      if (!isRamp(r1)) continue;
      if (invalidRamp(p1, r1)) {
        ramps.push({ id: e.id, label: labelOf(e), status: 'conflict', reason: 'A rampa fica sem altura válida (topo no mesmo nível ou abaixo).' });
        continue;
      }
      if (r1.inputMode !== 'slope' || r1.slopeTarget === null) {
        ramps.push({ id: e.id, label: labelOf(e), status: 'ok' });
        continue;
      }
      let regen: ReturnType<typeof regenRamp>;
      try {
        regen = regenRamp(r1, p1, {});
      } catch (err) {
        ramps.push({ id: e.id, label: labelOf(e), status: 'conflict', reason: `Não foi possível recalcular a rampa (${err instanceof Error ? err.message : 'erro desconhecido'}).` });
        continue;
      }
      if ('error' in regen) {
        ramps.push({ id: e.id, label: labelOf(e), status: 'conflict', reason: regen.error });
        continue;
      }
      ramps.push({
        id: e.id,
        label: labelOf(e),
        status: 'ok',
        components: regen.components,
        inputMode: regen.inputMode,
        slopeTarget: regen.slopeTarget,
        landingDepth: regen.landingDepth,
        ...(regen.freePath ? { freePath: regen.freePath } : {}),
      });
    }
  }

  const conflicts = stairs.filter((s) => s.status === 'conflict').length + ramps.filter((r) => r.status === 'conflict').length;
  const confirmations = stairs.filter((s) => s.needsConfirm).length;
  const adjusted = stairs.filter((s) => !!s.components).length + ramps.filter((r) => !!r.components).length;
  const invalid = stairs.filter((s) => invalidStair(p1, p1.elements[s.id] as Stair)).length + ramps.filter((r) => invalidRamp(p1, p1.elements[r.id] as Ramp)).length;
  return { levelId, levelName: level.name, elevation, stairs, ramps, conflicts, confirmations, adjusted, invalid };
}
