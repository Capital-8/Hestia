/**
 * Avisos da estrutura (pilar, viga e fundação; docs/estrutura/PLANO.md, A.4.7 e A.8): `estr-invalida` (o elemento não pôde ir ao kernel: tipo, nível, perfil
 * ou número inválido, ou o kernel recusou com `ENTRADA`) e `estr-sem-kernel` (só do TS: sem o kernel a estrutura não é desenhada). Nunca bloqueiam.
 * As medidas dos avisos do kernel (consulta 204: pilar sem fundação, viga solta...) entram com a ficha K4/R1b.
 *
 * Os textos ficam aqui (pt e en; os demais idiomas caem em pt), no molde de `cortinaIssues.ts`; a ficha I18 traduz.
 */
import type { Id, Project, ValidationIssue } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';
import { elementosEstr, motivoInvalidoEstr } from './kernelEstrValidade.ts';

const MSG = {
  pt: {
    'estr-invalida': 'Estrutura: o elemento não foi desenhado. {motivo}',
    'estr-recusada': 'Estrutura: o kernel de geometria recusou este elemento (perfil, nível ou valores inválidos); ele não foi desenhado.',
    'estr-sem-kernel': 'Estrutura: o kernel de geometria não está ligado; pilares, vigas e fundações não são desenhados.',
  },
  en: {
    'estr-invalida': 'Structure: the element was not drawn. {motivo}',
    'estr-recusada': 'Structure: the geometry kernel rejected this element (invalid profile, level or values); it was not drawn.',
    'estr-sem-kernel': 'Structure: the geometry kernel is off; columns, beams and footings are not drawn.',
  },
} as const;

type Chave = keyof (typeof MSG)['pt'];

function texto(lang: Lang, codigo: Chave, motivo = ''): string {
  return (lang === 'en' ? MSG.en : MSG.pt)[codigo].replaceAll('{motivo}', motivo).trim();
}

/**
 * `estr-invalida`: um aviso por elemento que o TS deixou de enviar (`motivoInvalidoEstr`) e, em `recusados`, por elemento que o kernel recusou
 * com `ENTRADA` mesmo depois da validação (`ServicoEstr.recusados`). O código é um só para o usuário.
 */
export function estrAvisosDeInvalidez(p: Project, lang: Lang = 'pt', recusados: readonly Id[] = []): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const ja = new Set<Id>();
  for (const e of elementosEstr(p)) {
    const motivo = motivoInvalidoEstr(p, e, lang);
    if (motivo === null) continue;
    ja.add(e.id);
    out.push({ severity: 'warning', code: 'estr-invalida', message: texto(lang, 'estr-invalida', motivo), elementId: e.id });
  }
  for (const id of recusados) if (!ja.has(id)) out.push({ severity: 'warning', code: 'estr-invalida', message: texto(lang, 'estr-recusada'), elementId: id });
  return out;
}

/** `estr-sem-kernel`: um aviso por elemento válido enquanto o kernel não está pronto (os inválidos já têm o `estr-invalida`). */
export function estrAvisosSemKernel(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  return elementosEstr(p)
    .filter((e) => motivoInvalidoEstr(p, e) === null)
    .map((e) => ({ severity: 'warning', code: 'estr-sem-kernel', message: texto(lang, 'estr-sem-kernel'), elementId: e.id }));
}
