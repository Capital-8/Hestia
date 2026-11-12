import { isFloor, isGuardaCorpo, isOpening, isRamp, isRoof, isRoom, isSlab, isStair, isWall, type Id, type Project, type ValidationIssue, type ValidationSeverity } from '@hestia/model';
import { t, useI18n } from './i18n.ts';
import { rampBox, rampPoints } from './rampActions.ts';
import { stairBox, stairPoints } from './stairActions.ts';

export interface IssueGroup {
  severity: ValidationSeverity;
  title: string;
  items: ValidationIssue[];
}

/** Destino de "Ir para": elemento a selecionar, nível a abrir (se houver) e ponto central da parede. */
export interface IssueTarget {
  elementId: Id;
  /** Nível da parede (ou da parede anfitriã da abertura); null quando o nível não existe. */
  levelId: Id | null;
  /** Ponto médio da parede; null quando o elemento não está ligado a uma parede. */
  center: { x: number; y: number } | null;
  /** Caixa do piso, da laje, do telhado ou da escada (contorno): a vista enquadra a caixa em vez do ponto. Só existe para essas famílias. */
  box?: { minX: number; minY: number; maxX: number; maxY: number };
}

const TITLE: Record<ValidationSeverity, 'edc_issues_errors' | 'edc_issues_warnings' | 'edc_issues_info'> = {
  error: 'edc_issues_errors',
  warning: 'edc_issues_warnings',
  info: 'edc_issues_info',
};

/** Agrupa por severidade, erros primeiro. Grupos vazios não aparecem; a ordem original é mantida dentro de cada grupo. */
export function groupIssues(issues: readonly ValidationIssue[]): IssueGroup[] {
  const lang = useI18n.getState().lang;
  const order: ValidationSeverity[] = ['error', 'warning', 'info'];
  return order
    .map((severity) => ({ severity, title: t(lang, TITLE[severity]), items: issues.filter((i) => i.severity === severity) }))
    .filter((g) => g.items.length > 0);
}

/** Resumo para o botão da barra de status, ex.: "2 erros · 3 avisos". Vazio quando não há problemas. */
export function summarize(issues: readonly ValidationIssue[]): string {
  const lang = useI18n.getState().lang;
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const infos = issues.filter((i) => i.severity === 'info').length;
  const parts: string[] = [];
  if (errors > 0) parts.push(errors === 1 ? t(lang, 'edc_issues_error_one') : t(lang, 'edc_issues_error_many', { n: errors }));
  if (warnings > 0) parts.push(warnings === 1 ? t(lang, 'edc_issues_warning_one') : t(lang, 'edc_issues_warning_many', { n: warnings }));
  if (infos > 0) parts.push(infos === 1 ? t(lang, 'edc_issues_info_one') : t(lang, 'edc_issues_info_many', { n: infos }));
  return parts.join(' · ');
}

/** Severidade mais grave presente, ou null quando não há problemas. */
export function worstSeverity(issues: readonly ValidationIssue[]): ValidationSeverity | null {
  if (issues.some((i) => i.severity === 'error')) return 'error';
  if (issues.some((i) => i.severity === 'warning')) return 'warning';
  return issues.length > 0 ? 'info' : null;
}

/**
 * Resolve o alvo de um aviso. Aberturas usam a parede anfitriã para nível e centro.
 * Devolve null quando o aviso não tem elemento ou o elemento não existe mais.
 */
export function issueTarget(p: Project, issue: ValidationIssue): IssueTarget | null {
  const id = issue.elementId;
  if (!id) return null;
  const el = p.elements[id];
  if (!el) return null;
  if (isFloor(el) || isSlab(el) || isRoof(el)) {
    const xs = el.boundary.map((q) => q.x);
    const ys = el.boundary.map((q) => q.y);
    if (xs.length === 0) return null;
    const box = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    return {
      elementId: id,
      levelId: p.levels.some((l) => l.id === el.levelId) ? el.levelId : null,
      center: { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
      box,
    };
  }
  // Ambiente: o ponto interior é o centro do aviso (o contorno vem do circuito e pode não existir).
  if (isRoom(el)) {
    return { elementId: id, levelId: p.levels.some((l) => l.id === el.levelId) ? el.levelId : null, center: el.point };
  }
  if (isStair(el) || isRamp(el)) {
    const box = isStair(el) ? stairBox(el) : rampBox(el);
    const pts = isStair(el) ? stairPoints(el) : rampPoints(el);
    const center = box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : null;
    return {
      elementId: id,
      levelId: p.levels.some((l) => l.id === el.levelId) ? el.levelId : null,
      center: pts.length ? center : null,
      ...(box ? { box } : {}),
    };
  }
  // Guarda-corpo: enquadra o caminho manual, ou a escada ou rampa que o hospeda.
  if (isGuardaCorpo(el)) {
    const h = el.hospedeiro;
    const hosp = h.tipo === 'escada' ? p.elements[h.escadaId] : h.tipo === 'rampa' ? p.elements[h.rampaId] : undefined;
    let box: IssueTarget['box'] | null = null;
    if (h.tipo === 'manual' && h.caminho.length > 0) {
      const xs = h.caminho.map((q) => q.x);
      const ys = h.caminho.map((q) => q.y);
      box = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    } else if (isStair(hosp)) box = stairBox(hosp);
    else if (isRamp(hosp)) box = rampBox(hosp);
    return {
      elementId: id,
      levelId: p.levels.some((l) => l.id === el.levelId) ? el.levelId : null,
      center: box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : null,
      ...(box ? { box } : {}),
    };
  }
  const host = isOpening(el) ? p.elements[el.hostId] : undefined;
  const wall = isWall(el) ? el : isWall(host) ? host : null;
  const levelExists = wall !== null && p.levels.some((l) => l.id === wall.levelId);
  return {
    elementId: id,
    levelId: wall && levelExists ? wall.levelId : null,
    center: wall ? { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 } : null,
  };
}
