import { familiaDoComponente } from './componentes.ts';
import { familiaDaBiblioteca } from './familia/biblioteca/index.ts';
import {
  BUILTIN_DISCIPLINES,
  DEFAULT_DISCIPLINE,
  DISCIPLINES,
  TONES,
  isBuiltinDiscipline,
  isDiscipline,
  isDisciplineId,
  isTone,
  type BuiltinDiscipline,
  type Discipline,
  type PlanView,
  type Tone,
} from './planView.ts';
import type { Element, Project } from './types.ts';

/**
 * Disciplina e tons por planta (decisão 0060 §1.2, §4.1 e §4.2). O tipo `Discipline`, a lista `DISCIPLINES`,
 * os tons e os predicados já existem em `planView.ts` (etapa 2.1) e são reaproveitados daqui, sem duplicar.
 * A disciplina de um elemento é **derivada**, nunca gravada nele (§1.2): do kind, e para `component` da família dele
 * (adendo 1). Os elementos `geral` nunca recebem tom de disciplina (§4.1), só as regras de categoria e Hide in View
 * valem para eles.
 */

export { BUILTIN_DISCIPLINES, DEFAULT_DISCIPLINE, DISCIPLINES, TONES, isBuiltinDiscipline, isDiscipline, isDisciplineId, isTone };
export type { BuiltinDiscipline, Discipline, Tone };

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

/**
 * Disciplina de um elemento (adendo 1 do ADR 0060). Para todos os kinds vale a tabela exaustiva; `component` é a
 * exceção: a disciplina vem de `Familia.disciplina`, procurada primeiro nas famílias do projeto e, se não houver, na
 * biblioteca base. Família ausente (componente órfão), família sem o campo ou valor malformado = Arquitetura, que é o
 * comportamento dos arquivos antigos. Nunca lança.
 */
export function disciplineOfElement(el: Element, p: Pick<Project, 'componentFamilies'>): ElementDiscipline {
  if (el.kind !== 'component') return DISCIPLINE_OF_KIND[el.kind];
  const familia = familiaDoComponente(p, el) ?? familiaDaBiblioteca(el.familyId);
  const disciplina = familia?.disciplina;
  return isDiscipline(disciplina) ? disciplina : DEFAULT_DISCIPLINE;
}

/**
 * Predefinidos de tom por planta (tabela da ADR §4.2): para cada disciplina embutida da planta, o tom de cada
 * disciplina embutida de elemento. `geral` não tem coluna: nunca recebe tom (§4.1, passo 3). O dono desvia por planta
 * em `PlanView.tones`, e o desvio vale sobre o predefinido (não substitui a tabela inteira).
 */
export const DISCIPLINE_TONE_PRESETS: Record<BuiltinDiscipline, Record<BuiltinDiscipline, Tone>> = {
  arquitetura: { arquitetura: 'normal', estrutura: 'normal', hidrossanitario: 'halftone', eletrico: 'halftone', hvac: 'halftone' },
  estrutura: { arquitetura: 'halftone', estrutura: 'normal', hidrossanitario: 'hidden', eletrico: 'hidden', hvac: 'hidden' },
  hidrossanitario: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'normal', eletrico: 'hidden', hvac: 'hidden' },
  eletrico: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'hidden', eletrico: 'normal', hvac: 'hidden' },
  hvac: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'hidden', eletrico: 'hidden', hvac: 'normal' },
};

/**
 * Tom predefinido de uma disciplina de elemento na planta de `trabalho` (adendo 3, decisão 4). As duas embutidas
 * usam a tabela §4.2; fora dela, a regra de fallback: a mesma disciplina é `normal`, outra é `halftone`.
 */
export function presetTone(trabalho: Discipline, elemento: Discipline): Tone {
  if (isBuiltinDiscipline(trabalho) && isBuiltinDiscipline(elemento)) return DISCIPLINE_TONE_PRESETS[trabalho][elemento];
  return trabalho === elemento ? 'normal' : 'halftone';
}

/**
 * Tons efetivos de uma planta: o predefinido da disciplina dela combinado com os desvios gravados em
 * `PlanView.tones` (o desvio vale sobre o predefinido). Sem planta (a padrão do nível) usa o predefinido de
 * Arquitetura e **não grava nada** (`Level` não ganha campo — ADR §4.2). Aceita `ResolvedPlan`, que tem os
 * mesmos campos `discipline` e `tones`. Entradas malformadas (disciplina ou tom inválidos, valor ausente)
 * são ignoradas: a leitura nunca quebra por dado ruim (a validação de `planViewIssues` é que sinaliza).
 * As cinco embutidas sempre saem; a própria disciplina da planta, se não for embutida, entra como `normal`.
 * Desvios só valem para as embutidas ou para a própria disciplina da planta, porque as disciplinas do projeto
 * ainda não são gravadas nesta fase (adendo 3, fase 0).
 */
export function planTonesOf(planView?: Pick<PlanView, 'discipline' | 'tones'>): Record<string, Tone> {
  const trabalho = planView?.discipline ?? DEFAULT_DISCIPLINE;
  const out: Record<string, Tone> = {};
  for (const d of DISCIPLINES) out[d] = presetTone(trabalho, d);
  if (!isBuiltinDiscipline(trabalho) && isDisciplineId(trabalho)) out[trabalho] = presetTone(trabalho, trabalho);
  for (const [d, tone] of Object.entries(planView?.tones ?? {})) {
    // Desvio só de disciplina conhecida nesta fase: embutida ou a própria disciplina da planta (as do projeto ainda
    // não são gravadas). Mantém o comportamento dos arquivos atuais e ignora chave desconhecida sem lançar.
    if (isDisciplineId(d) && isTone(tone) && (isBuiltinDiscipline(d) || d === trabalho)) out[d] = tone;
  }
  return out;
}
