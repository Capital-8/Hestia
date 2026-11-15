import { loteIssues } from '@hestia/engine';
import { isLot, type Project, type ValidationIssue } from '@hestia/model';
import { useI18n } from './i18n.ts';
import type { IssueTarget } from './issuesView.ts';

/**
 * Ligação do lote ao painel de avisos (ficha P4, molde de `terrenoVista.ts`): os quatro avisos do lote (ocupação, coeficiente, permeabilidade e edificação
 * fora da área edificável) e o alvo do "Ir para", que é o próprio lote. Os avisos vêm do motor (`loteIssues`), sem kernel: não há espera nem repintura.
 */

/** Avisos dos lotes do projeto, no idioma ativo. Vazio sem lote ou com todos os índices dentro dos limites. */
export function avisosGeometriaLote(p: Project, lang = useI18n.getState().lang): ValidationIssue[] {
  return loteIssues(p, lang);
}

/**
 * Alvo do "Ir para" de um aviso cujo elemento é um lote: o nível dele e a caixa do contorno (a planta enquadra o lote). Null para qualquer outro
 * elemento (quem chama segue o caminho comum) e para elemento ausente.
 */
export function alvoDoAvisoDeLote(p: Project, issue: Pick<ValidationIssue, 'elementId'>): IssueTarget | null {
  const id = issue.elementId;
  const e = id ? p.elements[id] : undefined;
  if (!id || !e || !isLot(e) || e.contorno.length === 0) return null;
  const xs = e.contorno.map((q) => q.x);
  const ys = e.contorno.map((q) => q.y);
  const box = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  return {
    elementId: id,
    levelId: p.levels.some((l) => l.id === e.levelId) ? e.levelId : null,
    center: { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 },
    box,
  };
}
