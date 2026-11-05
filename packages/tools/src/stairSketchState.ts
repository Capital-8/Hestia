import { dist } from '@hestia/geom';
import { defaultUnits, formatQuantity, newId, type Id, type ResolvedUnits, type StairCurve, type StairGenerator, type StairLanding, type StairRun, type StairSpiralParams } from '@hestia/model';
import { stairLandingPolygon, trimRisers, validateRunSketch, type StairRunSketch, type StairSketchIssue } from '@hestia/engine';
import { t, type DictKey, type Lang } from './i18n.ts';

/** Sub-modos do croqui (Revit: Boundary, Riser, Stair Path, Landing, Finish). A ordem é a dos botões da barra. */
export const STAIR_SUBMODES = ['limites', 'espelhos', 'caminhada', 'patamar', 'concluir'] as const;
export type StairSubmode = (typeof STAIR_SUBMODES)[number];

export const STAIR_SUBMODE_LABEL: Record<StairSubmode, string> = {
  limites: 'Limites',
  espelhos: 'Espelhos',
  caminhada: 'Caminhada',
  patamar: 'Patamar',
  concluir: 'Concluir',
};

/** Rótulo do sub-modo no idioma pedido. */
export function stairSubmodeLabel(mode: StairSubmode, lang: Lang = 'pt'): string {
  return t(lang, SUBMODE_KEYS[mode]);
}

const SUBMODE_KEYS: Record<StairSubmode, DictKey> = {
  limites: 'tl_stt_sub_boundaries',
  espelhos: 'tl_stt_sub_risers',
  caminhada: 'tl_stt_sub_walk',
  patamar: 'tl_stt_sub_landing',
  concluir: 'tl_stt_sub_finish',
};

/** Primitiva de desenho: linha (cliques encadeados) ou arco por três cliques (início, fim, flecha). */
export type StairPrimitive = 'line' | 'arc';

/** Camada da prévia: cada uma tem uma cor na planta (limites, espelhos, caminhada, patamar) e os degraus calculados. */
export type StairTone = 'boundary' | 'riser' | 'path' | 'landing' | 'tread';

/** Opções da ferramenta Escada (barra de opções). Ausentes = padrão do projeto. */
export interface StairToolOptions {
  /** Tipo de escada na criação. Ausente ou inexistente = o padrão do projeto. */
  typeId?: Id;
  /** Sub-modo ao ativar a ferramenta (padrão: limites). */
  submode?: StairSubmode;
  /** Primitiva ao ativar a ferramenta (padrão: linha). */
  primitive?: StairPrimitive;
  /** N para "Distribuir N espelhos". Ausente = nº desejado (ceil(H ÷ espelho máximo)). */
  distributeCount?: number;
  /** Cotas e topo da criação (decisão 0011 §1, item 7). */
  baseOffset?: number;
  topOffset?: number;
  height?: number;
  topLevelId?: Id | null;
  /** Pegar linhas: deslocamento perpendicular da linha pega, em m (o lado é o do cursor). Ausente = 0. */
  pickOffset?: number;
  /** Pegar linhas: pega a cadeia de segmentos conectados de uma vez (opção "Corrente"). Ausente = falso. */
  pickChain?: boolean;
}

/** Croqui de um lance em edição: os mesmos campos do `StairRun`, sem o `kind`. */
export interface RunDraft {
  id?: Id;
  generatedBy?: StairGenerator;
  /** Parâmetros do caracol (decisão 0014 §2): as alças e a validação de voltas sobrepostas precisam deles. */
  spiral?: StairSpiralParams;
  boundaryLeft: StairCurve[];
  boundaryRight: StairCurve[];
  risers: StairCurve[];
  path: StairCurve[];
}

export interface LandingDraft {
  id?: Id;
  boundary: StairCurve[];
}

/** Um componente em ordem: lance ou patamar (decisão 0011 §1, item 3). */
export type StairPart = { kind: 'run'; run: RunDraft } | { kind: 'landing'; landing: LandingDraft };

/** Limites de cálculo: H (cota de topo − base), espelho máximo e largura mínima do tipo. */
export interface StairLimits {
  H: number;
  maxRiser: number;
  minRunWidth: number;
}

/** Resultado da análise do croqui: o que a interface mostra e o que o Concluir exige. */
export interface DraftReport {
  issues: StairSketchIssue[];
  errors: number;
  warnings: number;
  /** Mensagem do primeiro erro (pt-BR), ou null. */
  firstError: string | null;
  /** Espelhos desenhados (todos os lances). */
  created: number;
  /** Nº desejado = ceil(H ÷ espelho máximo). */
  desired: number;
  /** desejado − criados (negativo = há espelho a mais). */
  remaining: number;
  /** Altura real do espelho h = H ÷ N, ou null sem espelhos. */
  riserHeight: number | null;
  /** Sem erro: pode concluir. */
  canFinish: boolean;
}

export const copyCurve = (c: StairCurve): StairCurve => ({ a: { ...c.a }, b: { ...c.b }, sag: c.sag });
const copyChain = (cs: StairCurve[]): StairCurve[] => cs.map(copyCurve);

/** Croqui de um componente em ordem, do modelo para o rascunho (cópia: o modelo é imutável). */
export function partsFromComponents(cs: Array<StairRun | StairLanding>): StairPart[] {
  return cs.map((c): StairPart => {
    if (c.kind === 'landing') return { kind: 'landing', landing: { id: c.id, boundary: copyChain(c.boundary) } };
    const run: RunDraft = {
      id: c.id,
      boundaryLeft: copyChain(c.boundaryLeft),
      boundaryRight: copyChain(c.boundaryRight),
      risers: copyChain(c.risers),
      path: copyChain(c.path),
    };
    if (c.generatedBy) run.generatedBy = c.generatedBy;
    if (c.spiral) run.spiral = copySpiral(c.spiral);
    return { kind: 'run', run };
  });
}

/** Do rascunho para o modelo. Componentes novos recebem id aqui. */
export function componentsFromParts(parts: StairPart[]): Array<StairRun | StairLanding> {
  return parts.map((p): StairRun | StairLanding => {
    if (p.kind === 'landing') return { id: p.landing.id ?? newId('p'), kind: 'landing', boundary: copyChain(p.landing.boundary) };
    const out: StairRun = {
      id: p.run.id ?? newId('r'),
      kind: 'run',
      boundaryLeft: copyChain(p.run.boundaryLeft),
      boundaryRight: copyChain(p.run.boundaryRight),
      risers: copyChain(p.run.risers),
      path: copyChain(p.run.path),
    };
    if (p.run.generatedBy) out.generatedBy = p.run.generatedBy;
    if (p.run.spiral) out.spiral = copySpiral(p.run.spiral);
    return out;
  });
}

const copySpiral = (sp: StairSpiralParams): StairSpiralParams => ({ ...sp, center: { ...sp.center } });

/** Último componente, se for um lance (o lance em edição). */
export function lastRun(parts: StairPart[]): RunDraft | null {
  const p = parts[parts.length - 1];
  return p?.kind === 'run' ? p.run : null;
}

/** Croqui do motor (`validateRunSketch`, `stairRunSteps`) para um lance. */
export const runSketch = (r: RunDraft): StairRunSketch => ({
  boundaryLeft: r.boundaryLeft,
  boundaryRight: r.boundaryRight,
  risers: r.risers,
  path: r.path,
  // O motor lê a varredura do metadado `spiral` (validação por voltas e degraus do caracol).
  ...(r.spiral ? { spiral: r.spiral } : {}),
});

/** Nº de espelhos desejado: ceil(H ÷ espelho máximo), com folga para erro de ponto flutuante (2,8 ÷ 0,175 = 16). */
export function desiredRisers(H: number, maxRiser: number): number {
  if (!(H > 0) || !(maxRiser > 0)) return 0;
  return Math.max(1, Math.ceil(H / maxRiser - 1e-9));
}

const fmtM = (u: ResolvedUnits, v: number): string => formatQuantity(u, 'length', v);

function issue(code: string, severity: 'error' | 'warning', message: string, riserIndex?: number): StairSketchIssue {
  const out: StairSketchIssue = { code, severity, message };
  if (riserIndex !== undefined) out.riserIndex = riserIndex;
  return out;
}

/**
 * Analisa o croqui inteiro (decisão 0011 §3): erros de geometria e de completude (bloqueiam Concluir) e avisos de
 * norma e tipo (não bloqueiam). Com `limits` nulo (sem tipo), só a geometria é avaliada.
 */
export function analyzeDraft(parts: StairPart[], limits: StairLimits | null, u: ResolvedUnits = defaultUnits()): DraftReport {
  const issues: StairSketchIssue[] = [];
  const runs = parts.filter((p): p is { kind: 'run'; run: RunDraft } => p.kind === 'run').map((p) => p.run);
  const created = runs.reduce((n, r) => n + r.risers.length, 0);
  if (runs.length === 0) issues.push(issue('stair-no-run', 'error', 'Desenhe os limites do lance.'));
  for (const r of runs) {
    if (r.boundaryLeft.length === 0) issues.push(issue('stair-boundary-missing', 'error', 'Desenhe o limite esquerdo do lance.'));
    else if (r.boundaryRight.length === 0) issues.push(issue('stair-boundary-missing', 'error', 'Desenhe o limite direito do lance.'));
    else {
      if (r.risers.length === 0) issues.push(issue('stair-no-risers', 'error', 'Desenhe os espelhos.'));
      const geo = validateRunSketch(runSketch(r));
      issues.push(...geo);
      if (geo.every((i) => i.severity !== 'error') && r.risers.length > 0 && limits) issues.push(...widthWarning(r, limits, u));
    }
  }
  for (const p of parts) {
    if (p.kind === 'landing') issues.push(...stairLandingPolygon({ boundary: p.landing.boundary }).issues);
  }
  const H = limits?.H ?? 0;
  const maxRiser = limits?.maxRiser ?? 0;
  const desired = desiredRisers(H, maxRiser);
  const riserHeight = H > 0 && created > 0 ? H / created : null;
  if (riserHeight !== null && maxRiser > 0 && riserHeight > maxRiser + 1e-9) {
    issues.push(issue('stair-riser-too-high', 'warning', `A altura real do espelho (${fmtM(u, riserHeight)}) excede a máxima do tipo (${fmtM(u, maxRiser)}).`));
  }
  if (created > 0 && desired > 0 && created !== desired) {
    issues.push(issue('stair-risers-count', 'warning', `O nº de espelhos (${created}) difere do nº desejado (${desired}): adicione/remova espelhos ou ajuste a altura.`));
  }
  const errs = issues.filter((i) => i.severity === 'error');
  const warnings = issues.length - errs.length;
  return {
    issues,
    errors: errs.length,
    warnings,
    firstError: errs[0]?.message ?? null,
    created,
    desired,
    remaining: desired - created,
    riserHeight,
    canFinish: errs.length === 0,
  };
}

/** Aviso de largura: o menor espelho aparado (que liga os dois limites) é a largura útil do lance. */
function widthWarning(r: RunDraft, limits: StairLimits, u: ResolvedUnits): StairSketchIssue[] {
  const trimmed = trimRisers(runSketch(r));
  if (trimmed.length === 0) return [];
  const width = Math.min(...trimmed.map((t) => dist(t.points[0]!, t.points[t.points.length - 1]!)));
  if (!(limits.minRunWidth > 0) || width >= limits.minRunWidth - 1e-9) return [];
  return [issue('stair-width-min', 'warning', `A largura do lance (${fmtM(u, width)}) é menor que a mínima do tipo (${fmtM(u, limits.minRunWidth)}).`)];
}

/** Espelhos que faltam para o nº desejado, com a conta: "Faltam 3 espelhos para concluir (de 17)"; null se não faltam. */
export function missingText(rep: Pick<DraftReport, 'created' | 'remaining' | 'desired'>): string | null {
  if (rep.created === 0 || rep.remaining <= 0) return null;
  return `Faltam ${rep.remaining} espelho${rep.remaining > 1 ? 's' : ''} para concluir (de ${rep.desired}).`;
}

/** Texto do contador: "N restantes" ou "N a mais". */
export function counterText(rep: Pick<DraftReport, 'created' | 'remaining'>): string {
  const rest = rep.remaining >= 0 ? `${rep.remaining} restantes` : `${-rep.remaining} a mais`;
  return `Espelhos: ${rep.created} criados, ${rest}`;
}
