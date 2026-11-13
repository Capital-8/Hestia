/**
 * Avisos do lote (A.6): taxa de ocupação, coeficiente de aproveitamento, permeabilidade e edificação fora da área edificável. Nunca
 * bloqueiam. Limite ausente = sem aviso. Os limites são digitados pelo usuário (a conferir na lei local).
 *
 * Os textos ficam neste arquivo (pt e en; os demais idiomas caem em pt), no molde de `guardaCorpoIssues.ts` e `cortinaIssues.ts`.
 */
import { formatQuantity, isLot, unitsOf, type Project, type ValidationIssue } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';
import { indicesDoLote, TOLERANCIA_FORA_EDIFICAVEL } from './loteIndices.ts';

/** Folga numérica nas comparações de fração. */
const EPS = 1e-9;

const MSG = {
  pt: {
    'lote-excede-ocupacao': 'Lote {nome}: taxa de ocupação de {medido}; o máximo informado é {limite}.',
    'lote-excede-coeficiente': 'Lote {nome}: coeficiente de aproveitamento de {medido}; o máximo informado é {limite}.',
    'lote-abaixo-permeabilidade': 'Lote {nome}: permeabilidade de {medido}; o mínimo informado é {limite}.',
    'lote-edificacao-fora-do-edificavel': 'Lote {nome}: {medido} da edificação ficam fora da área edificável (dentro dos recuos).',
  },
  en: {
    'lote-excede-ocupacao': 'Lot {nome}: site coverage is {medido}; the stated maximum is {limite}.',
    'lote-excede-coeficiente': 'Lot {nome}: floor area ratio is {medido}; the stated maximum is {limite}.',
    'lote-abaixo-permeabilidade': 'Lot {nome}: permeability is {medido}; the stated minimum is {limite}.',
    'lote-edificacao-fora-do-edificavel': 'Lot {nome}: {medido} of the building lies outside the buildable area (inside the setbacks).',
  },
} as const;
type Codigo = keyof (typeof MSG)['pt'];

/** Códigos dos quatro avisos do lote. */
export const CODIGOS_AVISO_LOTE = Object.keys(MSG.pt) as Codigo[];

const texto = (lang: Lang, code: Codigo, args: Record<string, string>): string =>
  (lang === 'en' ? MSG.en : MSG.pt)[code].replace(/\{(\w+)\}/g, (w, n: string) => args[n] ?? w);

/** Avisos de todos os lotes do projeto, em ordem estável (`order`, depois id). */
export function loteIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const units = unitsOf(p, lang === 'en' ? 'en' : 'pt');
  const out: ValidationIssue[] = [];
  const lotes = Object.values(p.elements).filter(isLot).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const l of lotes) {
    const ind = indicesDoLote(p, l);
    const pct = (v: number): string => formatQuantity(units, 'slope', v);
    // Razão sem unidade: o formatador não tem grandeza própria; 'currency' sem símbolo dá o número com o separador decimal do projeto.
    const razao = (v: number): string => formatQuantity(units, 'currency', v, { withUnit: false });
    const area = (v: number): string => formatQuantity(units, 'area', v);
    const aviso = (code: Codigo, medido: string, limite: string): void => {
      out.push({ severity: 'warning', code, message: texto(lang, code, { nome: l.name, medido, limite }), elementId: l.id, ids: [l.id] });
    };
    const { taxaOcupacaoMax, coefAproveitamentoMax, permeabilidadeMin } = l.limites;
    if (taxaOcupacaoMax !== undefined && ind.taxaOcupacao > taxaOcupacaoMax + EPS) aviso('lote-excede-ocupacao', pct(ind.taxaOcupacao), pct(taxaOcupacaoMax));
    if (coefAproveitamentoMax !== undefined && ind.coefAproveitamento > coefAproveitamentoMax + EPS) {
      aviso('lote-excede-coeficiente', razao(ind.coefAproveitamento), razao(coefAproveitamentoMax));
    }
    if (permeabilidadeMin !== undefined && ind.permeabilidade < permeabilidadeMin - EPS) aviso('lote-abaixo-permeabilidade', pct(ind.permeabilidade), pct(permeabilidadeMin));
    if (ind.projecaoForaDoEdificavel > TOLERANCIA_FORA_EDIFICAVEL) aviso('lote-edificacao-fora-do-edificavel', area(ind.projecaoForaDoEdificavel), '');
  }
  return out;
}
