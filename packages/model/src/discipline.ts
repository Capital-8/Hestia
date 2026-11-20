import { DEFAULT_DISCIPLINE, DISCIPLINES, TONES, isDiscipline, isTone, type Discipline, type PlanView, type Tone } from './planView.ts';
import type { Element } from './types.ts';

/**
 * Disciplina e tons por planta (decisão 0060 §1.2, §4.1 e §4.2). O tipo `Discipline`, a lista `DISCIPLINES`,
 * os tons e os predicados já existem em `planView.ts` (etapa 2.1) e são reaproveitados daqui, sem duplicar.
 * A disciplina de um elemento é **derivada do kind**, nunca gravada nele (§1.2); os elementos `geral`
 * nunca recebem tom de disciplina (§4.1), só as regras de categoria e Hide in View valem para eles.
 */

export { DEFAULT_DISCIPLINE, DISCIPLINES, TONES, isDiscipline, isTone };
export type { Discipline, Tone };

/** Disciplina derivada de um elemento: as cinco das plantas, ou `geral` (terrain, lote, terreno, CAD, importado). */
export type ElementDiscipline = Discipline | 'geral';

/**
 * Tabela de derivação por kind (ADR §1.2). Exaustiva sobre a união `Element`: um kind novo sem classificação
 * quebra o `tsc`. As três disciplinas de MEP estão vazias hoje; os kinds MEP entram aqui no ADR de MEP (§10).
 */
export const DISCIPLINE_OF_KIND: Record<Element['kind'], ElementDiscipline> = {
  // arquitetura (ADR §1.2)
  wall: 'arquitetura',
  door: 'arquitetura',
  window: 'arquitetura',
  floor: 'arquitetura',
  ceiling: 'arquitetura',
  roof: 'arquitetura',
  stair: 'arquitetura',
  ramp: 'arquitetura',
  railing: 'arquitetura',
  mass: 'arquitetura',
  room: 'arquitetura',
  furniture: 'arquitetura',
  component: 'arquitetura',
  // estrutura (ADR §1.2)
  column: 'estrutura',
  beam: 'estrutura',
  footing: 'estrutura',
  slab: 'estrutura',
  // geral (ADR §1.2; anotações também são `geral`, mas não são elementos da união)
  terrain: 'geral',
  terrainRegion: 'geral',
  lot: 'geral',
  cad: 'geral',
  generic: 'geral',
};

/** Disciplina de um elemento, derivada do kind; nunca lança, nunca lê dado gravado no elemento. */
export const disciplineOfElement = (el: Element): ElementDiscipline => DISCIPLINE_OF_KIND[el.kind];

/**
 * Predefinidos de tom por planta (tabela da ADR §4.2): para cada disciplina da planta, o tom de cada disciplina
 * de elemento. `geral` não tem coluna: nunca recebe tom (§4.1, passo 3). O dono desvia por planta em
 * `PlanView.tones`, e o desvio vale sobre o predefinido (não substitui a tabela inteira).
 */
export const DISCIPLINE_TONE_PRESETS: Record<Discipline, Record<Discipline, Tone>> = {
  arquitetura: { arquitetura: 'normal', estrutura: 'normal', hidrossanitario: 'halftone', eletrico: 'halftone', hvac: 'halftone' },
  estrutura: { arquitetura: 'halftone', estrutura: 'normal', hidrossanitario: 'hidden', eletrico: 'hidden', hvac: 'hidden' },
  hidrossanitario: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'normal', eletrico: 'hidden', hvac: 'hidden' },
  eletrico: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'hidden', eletrico: 'normal', hvac: 'hidden' },
  hvac: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'hidden', eletrico: 'hidden', hvac: 'normal' },
};

/**
 * Tons efetivos de uma planta: o predefinido da disciplina dela combinado com os desvios gravados em
 * `PlanView.tones` (o desvio vale sobre o predefinido). Sem planta (a padrão do nível) usa o predefinido de
 * Arquitetura e **não grava nada** (`Level` não ganha campo — ADR §4.2). Aceita `ResolvedPlan`, que tem os
 * mesmos campos `discipline` e `tones`. Entradas malformadas (disciplina ou tom inválidos, valor ausente)
 * são ignoradas: a leitura nunca quebra por dado ruim (a validação de `planViewIssues` é que sinaliza).
 */
export function planTonesOf(planView?: Pick<PlanView, 'discipline' | 'tones'>): Record<Discipline, Tone> {
  const out: Record<Discipline, Tone> = { ...DISCIPLINE_TONE_PRESETS[planView?.discipline ?? DEFAULT_DISCIPLINE] };
  for (const [d, tone] of Object.entries(planView?.tones ?? {})) {
    if (isDiscipline(d) && isTone(tone)) out[d] = tone;
  }
  return out;
}
