import { LIMITES_GUARDA_CORPO } from './guardaCorpoTypes.ts';
import { t, type Lang } from './i18n.ts';
import { isGuardaCorpo, isRamp, isStair, type GuardaCorpo, type Project } from './types.ts';
import type { ValidationIssue } from './validate.ts';

// Erros simples de modelo do guarda-corpo: tipo, nível, hospedeiro e caminho manual. Os avisos de norma e de
// geometria vêm depois (decisão 0055 §8). O guarda-corpo fica no modelo mesmo com erro; só não é desenhado.

/** Problemas de modelo de um guarda-corpo. */
function railingIssuesOf(p: Project, g: GuardaCorpo, lang: Lang): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const name = g.mark || g.id;
  const push = (code: string, key: Parameters<typeof t>[1], params: Record<string, string | number> = {}): void =>
    void out.push({ severity: 'error', code, message: t(lang, key, { name, ...params }), elementId: g.id });
  if (!p.tiposGuardaCorpo?.[g.typeId]) push('railing-type-missing', 'md_gc_type_missing');
  if (!p.levels.some((l) => l.id === g.levelId)) push('railing-level-missing', 'md_gc_level_missing');
  const h = g.hospedeiro;
  if (h.tipo === 'escada' && !isStair(p.elements[h.escadaId])) push('railing-host-missing', 'md_gc_host_missing');
  if (h.tipo === 'rampa' && !isRamp(p.elements[h.rampaId])) push('railing-host-missing', 'md_gc_host_missing');
  if (h.tipo === 'manual') {
    const n = h.caminho.length;
    if (n < 2 || n > LIMITES_GUARDA_CORPO.caminhoManual) {
      push('railing-path-invalid', 'md_gc_manual_path', { max: LIMITES_GUARDA_CORPO.caminhoManual });
    }
  }
  return out;
}

/** Problemas de modelo de todos os guarda-corpos do projeto. */
export function guardaCorpoIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  return Object.values(p.elements)
    .filter(isGuardaCorpo)
    .flatMap((g) => railingIssuesOf(p, g, lang));
}
