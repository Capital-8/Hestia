import { add, type Vec2 } from '@hestia/geom';
import { stairBaseZ, stairTopZ, type Project, type Stair, type StairLanding, type StairRun } from '@hestia/model';
import { riserCountFor, treadFor, treadRuleOf } from './stairGenerators.ts';
import { isSpiralRun } from './stairSpiral.ts';
import { regenStairFree } from './stairFreeEdit.ts';
import { appendToRun, fanRun, isStraightRun, mapComponent, newRunAfter, sharesRiser, splitRunWithLanding, stretchRun } from './stairRefitGeom.ts';

/** Motivo de o reajuste não ter mexido no croqui. */
export type StairRefitSkip = 'fixed' | 'no-height' | 'no-type' | 'unsupported-shape' | 'no-change' | 'error';

/**
 * Resultado do reajuste pela fórmula do tipo (Revit: Stair Calculator; ArchiCAD: lances esticam/encolhem com o
 * "Lock Baseline" desligado). `components` ausente = nada a gravar; `skipped` diz por quê.
 */
export interface StairRefitResult {
  /** Componentes com os lances esticados/encolhidos e os degraus novos no último lance. */
  components?: Array<StairRun | StairLanding>;
  /** Forma livre: trajeto resultante. */
  freePath?: Vec2[];
  manualLandings?: number[];
  /** Nº de espelhos final. */
  risers: number;
  /** Degraus acrescentados no último lance. */
  added: number;
  /** Degraus removidos do fim dos últimos lances (altura diminuiu e o espelho ficou abaixo do mínimo do tipo). */
  removed: number;
  /** Patamares intermediários inseridos pelo reajuste (NBR 9050: lance contínuo > 3,20 m). */
  landingsInserted?: number;
  /**
   * Ainda há lance contínuo acima de 3,20 m sem patamar e o reajuste não pôde inserir um (caracol, leque, livre ou lance
   * sem espaço para dividir). Nenhuma geometria é inventada; `message` explica.
   */
  landingNeeded?: boolean;
  /** h = H ÷ N final. */
  riserHeight: number;
  /** Piso calculado pela regra do tipo, já limitado a [minTread, maxTread]. */
  tread: number;
  skipped?: StairRefitSkip;
  /** Explicação em pt-BR quando `skipped` é `unsupported-shape` ou `error`, ou quando `landingNeeded`. */
  message?: string;
}

/** Nº de linhas de espelho distintas: a emenda entre dois lances sem patamar conta uma vez. */
export function riserCountOf(s: Stair): number {
  let n = 0;
  s.components.forEach((c, i) => {
    if (c.kind !== 'run') return;
    n += c.risers.length;
    const prev = s.components[i - 1];
    if (prev?.kind === 'run' && sharesRiser(prev, c)) n -= 1;
  });
  return n;
}

/** NBR 9050: desnível máximo vencido por lance contínuo (sem patamar), em metros. */
export const MAX_FLIGHT_RISE = 3.2;
/** NBR 9050: profundidade mínima do patamar (m). */
export const MIN_LANDING_DEPTH = 1.2;
/** Folga numérica para comparar alturas com o limite (18 × 3,2/18 não pode virar "acima"). */
const RISE_EPS = 1e-6;

interface Flight {
  /** Índices dos componentes (lances) do trecho, em ordem. */
  idx: number[];
  /** Nº de espelhos distintos do trecho (emendas contam uma vez). */
  risers: number;
}

/** Trechos contínuos entre patamares: lances emendados (reta+reta, winder) ficam no mesmo trecho. */
function flightsOf(components: Array<StairRun | StairLanding>): Flight[] {
  const out: Flight[] = [];
  let cur: Flight | null = null;
  components.forEach((c, i) => {
    if (c.kind === 'landing') {
      cur = null;
      return;
    }
    if (!cur) {
      cur = { idx: [], risers: 0 };
      out.push(cur);
    }
    const prev = components[i - 1];
    const shared = prev?.kind === 'run' && sharesRiser(prev, c) ? 1 : 0;
    cur.idx.push(i);
    cur.risers += c.risers.length - shared;
  });
  return out;
}

/**
 * Alturas vencidas (m) por trecho contínuo entre patamares, na ordem da escada: nº de espelhos do trecho × (H ÷ N).
 * NBR 9050: cada valor acima de 3,20 m pede patamar intermediário. Função pura, usada pelo reajuste e pelo alerta.
 */
export function stairFlightHeights(s: Stair, H: number): number[] {
  if (!(H > 0)) return [];
  const N = riserCountOf(s);
  if (N < 1) return [];
  const R = H / N;
  return flightsOf(s.components).map((f) => f.risers * R);
}

/**
 * NBR 9050: insere patamares (1,20 m de profundidade) para que nenhum trecho contínuo passe de 3,20 m. Só divide lances
 * retos, no ponto que melhor equilibra o trecho (cada parte com ≥ 2 espelhos), empurrando o que vem depois. Escada com
 * caracol no trecho, ou sem lance reto divisível, não é tocada: devolve `needed` (sem inventar geometria).
 */
function ensureLandings(components: Array<StairRun | StairLanding>, H: number, N: number): { components: Array<StairRun | StairLanding>; inserted: number; needed: boolean } {
  const R = H / N;
  let comps = components;
  let inserted = 0;
  for (let guard = 0; guard < 24; guard++) {
    const flights = flightsOf(comps);
    const bad = flights.find((f) => f.risers * R > MAX_FLIGHT_RISE + RISE_EPS);
    if (!bad) return { components: comps, inserted, needed: false };
    let best: { ci: number; k: number; score: number } | null = null;
    // Caracol/espiral no trecho: o patamar mudaria a forma; não se inventa.
    const hasSpiral = bad.idx.some((ci) => isSpiralRun(comps[ci] as StairRun));
    let acc = 0;
    if (!hasSpiral) {
      for (const ci of bad.idx) {
        const c = comps[ci] as StairRun;
        const prev = comps[ci - 1];
        const shared = prev?.kind === 'run' && sharesRiser(prev, c) ? 1 : 0;
        if (isStraightRun(c)) {
          for (let k = 2; k <= c.risers.length - 2; k++) {
            const f1 = acc + k - shared;
            const score = Math.max(f1, bad.risers - f1);
            if (!best || score < best.score) best = { ci, k, score };
          }
        }
        acc += c.risers.length - shared;
      }
    }
    if (!best) return { components: comps, inserted, needed: true };
    const run = comps[best.ci] as StairRun;
    const sp = splitRunWithLanding(run, best.k, MIN_LANDING_DEPTH);
    const next: Array<StairRun | StairLanding> = comps.slice(0, best.ci);
    next.push(sp.lower, sp.landing, sp.upper);
    for (const c of comps.slice(best.ci + 1)) next.push(mapComponent(c, (q) => add(q, sp.shift)));
    comps = next;
    inserted += 1;
  }
  return { components: comps, inserted, needed: true };
}

const fmt2 = (v: number): string => v.toFixed(2).replace('.', ',');

/** Espelho mínimo efetivo do tipo (tipos fora do esquema atual, sem `minRiser` válido, caem no padrão NBR 9050). */
function minRiserOf(maxRiser: number, minRiser: number | undefined): number {
  return minRiser !== undefined && minRiser > 0 && minRiser < maxRiser ? minRiser : maxRiser > 0.16 ? 0.16 : maxRiser / 2;
}

/**
 * Reajusta a escada à altura entre níveis aplicando a **regra de cálculo configurada no tipo** (a·R + b·T, com alvo e
 * faixa, e piso limitado a [minTread, maxTread]) e **recalculando o nº de espelhos** para o espelho ficar na faixa
 * [minRiser, maxRiser] do tipo (NBR 9050: 0,16–0,18 m):
 *
 * - faixa de N: `N_min = ceil(H ÷ maxRiser)` e `N_max = floor(H ÷ minRiser)`; se `N_min > N_max`, não há N válido
 *   (`skipped: 'error'` com explicação);
 * - N atual na faixa: mantém (só R e o piso variam); abaixo de `N_min`: sobe para `N_min`; acima de `N_max`: desce para
 *   `N_max`, removendo espelhos do fim do último lance reto (mínimo 2 por lance; o que sobrar sai do lance anterior,
 *   preservando patamares intermediários). Fim em leque/caracol não perde espelhos: tenta o lance reto anterior ou
 *   devolve `unsupported-shape`;
 * - todos os lances existentes são esticados/encolhidos para o piso `T` calculado com esse N;
 * - os degraus novos são acrescentados **no último lance**, empurrando o fim dele e os componentes seguintes para frente
 *   (Revit: Desired Number of Risers; ArchiCAD: "Continue Stair" / lances esticam); se o último lance não for reto
 *   (caracol/leque), continua-se com um **lance reto novo** emendado no último espelho;
 * - NBR 9050: trecho contínuo acima de 3,20 m ganha patamar de 1,20 m (ver `ensureLandings`); onde não dá,
 *   `landingNeeded: true` + `message`;
 * - croqui livre: regenerado pelo planejador com o novo N; só avisa (`landingNeeded`) se sobrar trecho > 3,20 m.
 *
 * Não mexe quando o modo é `fixed`, H ≤ 0, o tipo não tem `maxRiser`, ou não há lance para continuar.
 */
export function refitStairToHeight(p: Project, s: Stair): StairRefitResult {
  let risers = 0;
  try {
    risers = riserCountOf(s);
  } catch {
    return { risers: 0, added: 0, removed: 0, riserHeight: 0, tread: 0, skipped: 'error', message: 'Croqui da escada inválido: não foi possível contar os espelhos.' };
  }
  const H = stairTopZ(p, s) - stairBaseZ(p, s);
  const type = p.stairTypes[s.typeId];
  if (!type) return { risers, added: 0, removed: 0, riserHeight: 0, tread: 0, skipped: 'no-type' };
  if (s.riserMode === 'fixed') return { risers, added: 0, removed: 0, riserHeight: H > 0 ? H / risers : 0, tread: 0, skipped: 'fixed' };
  if (!(H > 0) || risers < 1 || !(type.maxRiser > 0)) {
    return { risers, added: 0, removed: 0, riserHeight: 0, tread: 0, skipped: 'no-height' };
  }
  const minRiser = minRiserOf(type.maxRiser, type.minRiser);
  const nMin = riserCountFor(H, type.maxRiser);
  const nMax = Math.floor(H / minRiser + 1e-9);
  if (nMin > nMax) {
    return {
      risers,
      added: 0,
      removed: 0,
      riserHeight: H / risers,
      tread: 0,
      skipped: 'error',
      message: `Nenhum nº de espelhos cumpre o tipo para a altura de ${fmt2(H)} m: o espelho teria de ficar entre ${fmt2(minRiser)} e ${fmt2(type.maxRiser)} m. Ajuste a altura ou os espelhos mínimo/máximo do tipo.`,
    };
  }
  const targetN = Math.min(nMax, Math.max(nMin, risers));
  const added = Math.max(0, targetN - risers);
  const removed = Math.max(0, risers - targetN);
  const riserHeight = H / targetN;
  const tread = treadFor(riserHeight, treadRuleOf(type));

  if (s.freePath && s.freePath.length >= 2) {
    // Livre: o planejador refaz lances e patamares com o novo N; patamar novo só se o usuário o marcar (não se inventa).
    const r = regenStairFree(s, p, { fixed: { risers: targetN, tread } });
    if ('error' in r) return { risers, added, removed, riserHeight, tread, skipped: 'error', message: r.error };
    const out: StairRefitResult = { components: r.components, freePath: r.freePath, manualLandings: r.manualLandings, risers: targetN, added, removed, riserHeight, tread };
    const worst = Math.max(0, ...stairFlightHeights({ ...s, components: r.components }, H));
    if (worst > MAX_FLIGHT_RISE + RISE_EPS) {
      out.landingNeeded = true;
      out.message = `Há um lance contínuo de ${fmt2(worst)} m (acima de 3,20 m, NBR 9050) sem patamar: marque um patamar intermediário de pelo menos 1,20 m no trajeto livre.`;
    }
    return out;
  }

  const lastRunIndex = s.components.reduce((last, c, i) => (c.kind === 'run' ? i : last), -1);
  if (lastRunIndex < 0) {
    return { risers, added, removed, riserHeight, tread, skipped: 'unsupported-shape', message: 'A escada não tem lance para continuar.' };
  }

  // Remoção: do fim para o início, só em lance reto seguido de patamar ou do fim da escada, deixando ≥ 2 espelhos.
  const trim = new Map<number, number>();
  if (removed > 0) {
    let rest = removed;
    for (let i = s.components.length - 1; i >= 0 && rest > 0; i--) {
      const c = s.components[i]!;
      const next = s.components[i + 1];
      if (c.kind !== 'run' || (next && next.kind === 'run') || !isStraightRun(c)) continue;
      const take = Math.min(c.risers.length - 2, rest);
      if (take <= 0) continue;
      trim.set(i, c.risers.length - take);
      rest -= take;
    }
    if (rest > 0) {
      return {
        risers,
        added: 0,
        removed,
        riserHeight,
        tread,
        skipped: 'unsupported-shape',
        message: `A altura diminuiu e o espelho ficaria abaixo de ${fmt2(minRiser)} m, mas não há como remover ${removed} espelho(s) (caracol/leque ou lances com menos de 3 espelhos). Ajuste o croqui manualmente.`,
      };
    }
  }

  let shift: Vec2 = { x: 0, y: 0 };
  let changed = false;
  const lastIsStraight = !fanRun(s.components[lastRunIndex] as StairRun);
  let components: Array<StairRun | StairLanding> = [];
  try {
    for (let i = 0; i < s.components.length; i++) {
      const moved = mapComponent(s.components[i]!, (q) => add(q, shift));
      if (moved.kind !== 'run') {
        components.push(moved);
        continue;
      }
      const keep = trim.get(i);
      const r = fanRun(moved) ? { run: moved, shift: { x: 0, y: 0 } } : stretchRun(moved, tread, keep);
      if (!r) {
        components.push(moved);
        continue;
      }
      if (keep !== undefined) changed = true;
      if (r.shift.x !== 0 || r.shift.y !== 0) changed = true;
      shift = add(shift, r.shift);
      // Os degraus novos vão no último lance (ou num lance reto novo, se ele for leque/caracol).
      if (i === lastRunIndex && added > 0) {
        if (lastIsStraight) {
          const a = appendToRun(r.run, added, tread);
          if (a) {
            shift = add(shift, a.shift);
            changed = true;
            components.push(a.run);
            continue;
          }
        } else {
          const nr = newRunAfter(r.run, added, tread);
          if (nr) {
            shift = add(shift, nr.shift);
            changed = true;
            components.push(r.run, nr.run);
            continue;
          }
        }
      }
      components.push(r.run);
    }
  } catch {
    return { risers, added, removed, riserHeight, tread, skipped: 'error', message: 'Não foi possível continuar o croqui desta escada; ajuste manualmente.' };
  }

  // NBR 9050: patamar em trecho contínuo acima de 3,20 m.
  let landingsInserted = 0;
  let message: string | undefined;
  try {
    const fit = ensureLandings(components, H, targetN);
    components = fit.components;
    landingsInserted = fit.inserted;
    if (landingsInserted > 0) changed = true;
    if (fit.needed) {
      const worst = Math.max(0, ...flightsOf(components).map((f) => (f.risers * H) / targetN));
      message = `Há um lance contínuo de ${fmt2(worst)} m (acima de 3,20 m, NBR 9050) sem patamar e o reajuste não consegue inserir um aqui (caracol, leque ou lance sem espaço para dividir). Acrescente um patamar intermediário de pelo menos 1,20 m.`;
    }
  } catch {
    return { risers, added, removed, riserHeight, tread, skipped: 'error', message: 'Não foi possível inserir o patamar intermediário; ajuste manualmente.' };
  }
  const extra: Partial<StairRefitResult> = {};
  if (landingsInserted > 0) extra.landingsInserted = landingsInserted;
  if (message) {
    extra.landingNeeded = true;
    extra.message = message;
  }
  return changed
    ? { components, risers: targetN, added, removed, riserHeight, tread, ...extra }
    : { risers: targetN, added: 0, removed: 0, riserHeight, tread, skipped: 'no-change', ...extra };
}
