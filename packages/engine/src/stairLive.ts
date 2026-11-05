import type { StairType } from '@hestia/model';
import { t, type Lang } from './i18nMessages.ts';
import { treadRuleOf, treadFor, riserCountFor } from './stairGenerators.ts';
import { DEFAULT_STAIR_NORMS, type StairNorms } from './stairNorms.ts';

/** Tolerância de contagem: 2 espelhos exigem um vão >= T; 4,2 − 1e-12 m ainda comporta 16 espelhos de 0,28 m. */
export const STAIR_COUNT_EPS = 1e-9;

/** Par (N, T) fixado por "Ajustar" ou medido da escada existente. */
export interface StairFixed {
  risers: number;
  tread: number;
}

export interface StairLiveParams {
  /** N: nº total de espelhos. */
  risers: number;
  /** h = H ÷ N. */
  riserHeight: number;
  /** T: piso (m), igual em toda a escada. */
  tread: number;
  /** M: máximo de espelhos por lance (norma: desnível máximo entre patamares). */
  maxPerFlight: number;
  /** P: comprimento do patamar em linha (m). */
  landingLength: number;
}

/**
 * N, h, T e M da escada livre. `fixed` troca N e T (h = H ÷ N). Erro (no idioma de `opts.lang`, padrão `'pt'`) se
 * H <= 0, N < 2 ou o tipo é inválido. Nunca lança.
 */
export function stairLiveParams(
  H: number,
  type: StairType,
  opts: { fixed?: StairFixed; width?: number; norms?: StairNorms; lang?: Lang } = {},
): StairLiveParams | { error: string } {
  const lang = opts.lang ?? 'pt';
  const norms = opts.norms ?? DEFAULT_STAIR_NORMS;
  if (!type || !(type.maxRiser > 0)) return { error: t(lang, 'egb_err_stair_type_invalid') };
  if (!(H > 0)) return { error: t(lang, 'egb_err_stair_height') };
  let N: number;
  if (opts.fixed) {
    N = opts.fixed.risers;
    if (!Number.isInteger(N) || !(opts.fixed.tread > 0)) return { error: t(lang, 'egb_err_stair_fixed') };
  } else {
    try {
      N = riserCountFor(H, type.maxRiser);
    } catch {
      return { error: t(lang, 'egb_err_stair_type_invalid') };
    }
  }
  if (N < 2) return { error: t(lang, 'egb_err_stair_too_low') };
  const h = H / N;
  const tread = opts.fixed?.tread ?? treadFor(h, treadRuleOf(type));
  return {
    risers: N,
    riserHeight: h,
    tread,
    maxPerFlight: Math.max(2, Math.floor(norms.maxRiseBetweenLandings / h + STAIR_COUNT_EPS)),
    landingLength: Math.max(norms.landingMinLength, opts.width ?? 0),
  };
}

export interface StairLayoutPiece {
  kind: 'flight' | 'landing';
  /** u do 1º espelho do lance (ou do início do patamar), a partir do início do vão. */
  at: number;
  /** Lance: (n−1)·T; patamar: P. */
  length: number;
  /** Lance: n >= 2; patamar: 0. */
  risers: number;
}

export interface StairSegmentLayout {
  pieces: StairLayoutPiece[];
  /** Total de espelhos do vão. */
  risers: number;
  /** Do início do vão ao fim da última peça (último espelho). */
  length: number;
  /** Sobrou exatamente 1 espelho a colocar e não foi possível rebalancear. */
  leftover1: boolean;
}

const emptyLayout = (): StairSegmentLayout => ({ pieces: [], risers: 0, length: 0, leftover1: false });

/**
 * Layout de um vão `span` (m; do 1º espelho ao último espelho permitido; pode ser Infinity quando `need` é finito).
 * Preenche lances de no máximo M espelhos; entre dois lances cheios vai um patamar de P m, mas só se sobra espaço para
 * P + T (lance seguinte de >= 2 espelhos) e ainda faltam espelhos. Para ao colocar `need` espelhos. Regra do resto: se
 * faltaria exatamente 1 espelho depois de um lance, tira 1 do lance (n−1 >= 2); sem poder, marca `leftover1`.
 * `balanceTail = false` desliga essa regra (último vão, que pode ser estendido). O rebalanceio de um lance cheio só vale
 * se o patamar seguinte ainda cabe (senão manteria o lance cheio e marcaria o resto).
 */
export function layoutStairSegment(
  span: number,
  p: Pick<StairLiveParams, 'tread' | 'maxPerFlight' | 'landingLength'>,
  need: number = Infinity,
  balanceTail = true,
): StairSegmentLayout {
  const T = p.tread;
  const M = p.maxPerFlight;
  const P = p.landingLength;
  const lay = emptyLayout();
  let pos = 0;
  let rem = span;
  let left = need;
  for (let guard = 0; guard < 200; guard++) {
    const cap = rem < 0 ? 0 : Math.floor(rem / T + STAIR_COUNT_EPS) + 1;
    const nPre = Math.min(cap, M, left);
    if (nPre < 2) break;
    let n = nPre;
    // Vão infinito (último vão estendido) sempre comporta o patamar depois do rebalanceio: nunca deixa 1 espelho sobrando
    // (ex.: N = 18 com M = 17 virava 17 + patamar + resto 1 → "não foi possível distribuir os espelhos").
    if ((balanceTail || !Number.isFinite(span)) && left - n === 1) {
      if (n - 1 >= 2) {
        // Se um patamar em linha ainda vai seguir o lance, o vão restante precisa comportá-lo depois do rebalanceio.
        const follows = nPre === M;
        if (!follows || rem - (n - 2) * T >= P + T - STAIR_COUNT_EPS) n -= 1;
        else lay.leftover1 = true;
      } else lay.leftover1 = true;
    }
    lay.pieces.push({ kind: 'flight', at: pos, length: (n - 1) * T, risers: n });
    lay.risers += n;
    pos += (n - 1) * T;
    rem -= (n - 1) * T;
    left -= n;
    if (left < 2) break; // nunca patamar sem um lance de >= 2 espelhos depois
    if (nPre < M) break; // parou por falta de espaço
    if (rem < P + T - STAIR_COUNT_EPS) break;
    lay.pieces.push({ kind: 'landing', at: pos, length: P, risers: 0 });
    pos += P;
    rem -= P;
  }
  lay.length = pos;
  return lay;
}

export interface StairRemaining {
  status: 'falta' | 'alcancado' | 'passou';
  /** Espelhos até o cursor, contando os já colocados antes (limitado a N). */
  placed: number;
  /** Espelhos que faltam (status 'falta'), senão 0. */
  falta: number;
  /** ≈ falta · T (m). */
  faltaLength: number;
  /** Espelhos a mais do que o cursor colocaria (status 'passou'), senão 0. */
  excess: number;
  /** Distância (do início do vão vivo) do espelho N; null se ainda não fecha. */
  closeAt: number | null;
}

/** Restante em espelhos para o cursor: `span` = vão vivo, `risersBefore` = espelhos já colocados nos trechos anteriores. */
export function liveStairRemaining(i: { params: StairLiveParams; span: number; risersBefore: number }): StairRemaining {
  const { params: p } = i;
  const need = Math.max(0, p.risers - i.risersBefore);
  const lay = layoutStairSegment(i.span, p);
  const falta = need - lay.risers;
  const placed = Math.min(p.risers, i.risersBefore + lay.risers);
  if (falta > 0) return { status: 'falta', placed, falta, faltaLength: falta * p.tread, excess: 0, closeAt: null };
  if (falta === 0) return { status: 'alcancado', placed, falta: 0, faltaLength: 0, excess: 0, closeAt: lay.length };
  return {
    status: 'passou',
    placed,
    falta: 0,
    faltaLength: 0,
    excess: -falta,
    closeAt: layoutStairSegment(Infinity, p, need).length,
  };
}

/** Distribuição de N espelhos entre os vãos de um trajeto de comprimento FIXO. */
export interface StairDistribution {
  /** Um por vão (vão sem espaço = layout vazio). */
  layouts: StairSegmentLayout[];
  /** Espelhos colocados (<= N). */
  placed: number;
  /** Índice do vão em que o espelho N foi colocado; null se faltaram espelhos. */
  closedAt: number | null;
  /** N − placed. */
  missing: number;
}

/**
 * Distribui os N espelhos pelos vãos em ordem. O vão menor que um piso (trecho de passagem) fica vazio (quem trata é o
 * plano). Só o último vão fica sem rebalanceio do resto (pode ser estendido).
 */
export function distributeStairRisers(spans: number[], p: StairLiveParams): StairDistribution {
  let left = p.risers;
  let closedAt: number | null = null;
  const layouts: StairSegmentLayout[] = [];
  spans.forEach((s, k) => {
    if (left <= 0 || !(s >= p.tread - STAIR_COUNT_EPS)) {
      layouts.push(emptyLayout());
      return;
    }
    const lay = layoutStairSegment(s, p, left, k < spans.length - 1);
    layouts.push(lay);
    left -= lay.risers;
    if (left <= 0 && closedAt === null) closedAt = k;
  });
  return { layouts, placed: p.risers - left, closedAt, missing: left };
}
