import { intersection } from '@hestia/geom';
import { formatRampPercent, formatRampRatio, isRamp, rampMaxSlope, rampNormRowFor, type Id, type Project, type ValidationIssue } from '@hestia/model';
import { numLang, t, type Lang } from './i18nMessages.ts';
import { resolveRamps, type ResolvedRamp } from './ramps.ts';
import { topCovers, type TopCover } from './stairChecks.ts';

/** Aviso ou erro de uma rampa. `componentIndex` (posição em `components`) quando o caso é de um lance ou patamar. */
export interface RampIssueItem {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  rampId: string;
  componentIndex?: number;
  /** Elementos envolvidos, para o "Ir para". */
  ids?: string[];
}

const EPS = 1e-6;
const AREA_EPS = 1e-6;

const numIn = (lang: Lang) => (n: number): string => numLang(n, 2, lang);
const pctIn = (lang: Lang) => (s: number): string => formatRampPercent(s, lang);
const ratioIn = (lang: Lang) => (s: number): string => formatRampRatio(s, lang);

export function makeRampIssue(
  rampId: string,
  code: string,
  severity: 'error' | 'warning',
  message: string,
  componentIndex?: number,
  ids?: string[],
): RampIssueItem {
  const out: RampIssueItem = { code, severity, message, rampId };
  if (componentIndex !== undefined) out.componentIndex = componentIndex;
  if (ids) out.ids = ids;
  return out;
}

/** Linha que vale para a inclinação: a da tabela; sem linha, a última (tabela vazia → null). */
const rowFor = (rr: ResolvedRamp) => {
  const row = rampNormRowFor(rr.type, rr.slope);
  if (row) return row;
  return rr.type.normTable[rr.type.normTable.length - 1] ?? null;
};

/** Avisos de norma de uma rampa resolvida. Todos são avisos; nunca bloqueiam. */
export function rampNormIssues(rr: ResolvedRamp, lang: Lang = 'pt'): RampIssueItem[] {
  const num = numIn(lang);
  const pct = pctIn(lang);
  const ratio = ratioIn(lang);
  const out: RampIssueItem[] = [];
  const suffix = rr.type.normChecked ? '' : t(lang, 'egb_ramp_norm_check');
  const push = (code: string, message: string, componentIndex?: number): void =>
    void out.push(makeRampIssue(rr.id, code, 'warning', `${message}${suffix}`, componentIndex));
  const table = rr.type.normTable;

  if (table.length > 0 && rampNormRowFor(rr.type, rr.slope) === null) {
    const max = rampMaxSlope(rr.type) ?? table[table.length - 1]!.maxSlope;
    push('ramp-slope-over-norm', t(lang, 'egb_issue_ramp_slope_over', { slope: pct(rr.slope), ratio: ratio(rr.slope), max: pct(max), maxRatio: ratio(max) }));
  }

  const row = rowFor(rr);
  if (row) {
    rr.flights.forEach((f, i) => {
      const rise = f.z1 - f.z0;
      if (rise > row.maxRise + EPS) {
        push('ramp-flight-rise-over-norm', t(lang, 'egb_issue_ramp_flight_rise', { n: i + 1, rise: num(rise), slope: pct(rr.slope), max: num(row.maxRise) }), f.componentIndex);
      }
    });
    if (row.maxFlights !== null && rr.flights.length > row.maxFlights) {
      push('ramp-flights-over-norm', t(lang, 'egb_issue_ramp_flights', { n: rr.flights.length, slope: pct(rr.slope), max: row.maxFlights }));
    }
  }

  rr.landings.forEach((l, i) => {
    if (l.minDim < rr.type.landingMinLength - EPS) {
      push('ramp-landing-short', t(lang, 'egb_issue_ramp_landing', { n: i + 1, length: num(l.minDim), min: num(rr.type.landingMinLength) }), l.componentIndex);
    }
  });

  rr.flights.forEach((f, i) => {
    if (f.width < rr.type.minWidth - EPS) {
      push('ramp-width-min', t(lang, 'egb_issue_ramp_width', { n: i + 1, w: num(f.width), min: num(rr.type.minWidth) }), f.componentIndex);
    }
  });

  return out;
}

/** Menor folga de cabeça (m) das fatias sob uma cobertura; null sem sobreposição. */
function worstHeadroom(rr: ResolvedRamp, covers: TopCover[]): { h: number; ci: number } | null {
  let worst: { h: number; ci: number } | null = null;
  for (const slice of rr.slices) {
    for (const c of covers) {
      for (const piece of intersection(c.polygon, [[slice.polygon]])) {
        const ring = piece[0];
        if (!ring || ring.length < 3) continue;
        let area = 0;
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i]!;
          const q = ring[(i + 1) % ring.length]!;
          area += p.x * q.y - q.x * p.y;
        }
        if (Math.abs(area / 2) < AREA_EPS) continue;
        for (const v of ring) {
          const h = c.underside(v) - slice.z;
          if (!worst || h < worst.h) worst = { h, ci: slice.componentIndex };
        }
      }
    }
  }
  return worst;
}

/** Aviso de folga de cabeça sob a laje (mesma conta de `stairHeadroomIssue`, pelas fatias da rampa). */
export function rampHeadroomIssue(rr: ResolvedRamp, covers: TopCover[], lang: Lang = 'pt'): RampIssueItem | null {
  const worst = worstHeadroom(rr, covers);
  if (!worst || worst.h >= rr.type.minHeadroom - 1e-9) return null;
  return makeRampIssue(
    rr.id,
    'ramp-headroom',
    'warning',
    t(lang, 'egb_issue_ramp_headroom', { h: numIn(lang)(worst.h), min: numIn(lang)(rr.type.minHeadroom) }),
    worst.ci,
  );
}

/** Todos os avisos e erros das rampas: os de `resolveRamps` mais o `ramp-headroom`. */
export function rampIssueList(p: Project, lang: Lang = 'pt'): RampIssueItem[] {
  const covers = new Map<string, TopCover[]>();
  return resolveRamps(p, lang).flatMap((rr) => {
    const list = [...rr.issues];
    if (rr.topLevelId) {
      let onLevel = covers.get(rr.topLevelId);
      if (!onLevel) {
        onLevel = topCovers(p, rr.topLevelId);
        covers.set(rr.topLevelId, onLevel);
      }
      const h = rampHeadroomIssue(rr, onLevel, lang);
      if (h) list.push(h);
    }
    return list;
  });
}

/**
 * Avisos de uma só rampa: o mesmo que `rampIssueList(p).filter((i) => i.rampId === id)`, sem resolver as outras. A criação
 * usa isto para não resolver todas as rampas do projeto só para achar o aviso da nova. O projeto de um elemento basta para
 * resolver a rampa (ela lê o próprio elemento e os níveis); a folga de cabeça usa as lajes e pisos do nível de topo, como na lista.
 */
export function rampIssuesOf(p: Project, id: Id, lang: Lang = 'pt'): RampIssueItem[] {
  const e = p.elements[id];
  if (!isRamp(e)) return [];
  const [rr] = resolveRamps({ ...p, elements: { [id]: e } }, lang);
  if (!rr) return [];
  const list = [...rr.issues];
  if (rr.topLevelId) {
    const h = rampHeadroomIssue(rr, topCovers(p, rr.topLevelId), lang);
    if (h) list.push(h);
  }
  return list;
}

/** Aviso no formato do painel, com os ids da relação (quando houver) além do `elementId`. */
export type RampValidationIssue = ValidationIssue & { ids?: string[] };

/** Os mesmos avisos no formato do painel (`ValidationIssue`, com `elementId` = id da rampa). */
export function rampValidationIssues(p: Project, lang: Lang = 'pt'): RampValidationIssue[] {
  return rampIssueList(p, lang).map((i) => ({
    severity: i.severity,
    code: i.code,
    message: i.message,
    elementId: i.rampId,
    ...(i.ids ? { ids: i.ids } : {}),
  }));
}
