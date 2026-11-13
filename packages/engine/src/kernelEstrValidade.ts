/**
 * Validade dos elementos de estrutura ANTES de irem ao kernel (docs/estrutura/PLANO.md, A.0 item 2 e A.8 item 2): o TS valida e o kernel só calcula.
 * O que o kernel recusaria com `ENTRADA` (a consulta inteira falharia por causa de UM elemento) fica de fora da cena e vira o aviso `estr-invalida`.
 * Reusa os validadores do modelo; acrescenta só o que depende do projeto inteiro (tipo, nível e altura efetiva do pilar).
 */
import {
  beamIssue,
  beamTypeIssue,
  beamTypesOf,
  columnIssue,
  columnTypeIssue,
  columnTypesOf,
  footingIssue,
  footingTypeIssue,
  footingTypesOf,
  isBeam,
  isColumn,
  isFooting,
  tDoModelo as tModelo,
  VIGA_COMPRIMENTO_MIN,
  type Beam,
  type Column,
  type Element,
  type Footing,
  type Id,
  type Project,
} from '@hestia/model';
import type { Lang } from './i18nMessages.ts';

/** Pilar, viga ou fundação. */
export type ElementoEstr = Column | Beam | Footing;
export const ehElementoEstr = (e: Element | undefined): e is ElementoEstr => isColumn(e) || isBeam(e) || isFooting(e);

/** Os elementos de estrutura do projeto, em ordem estável (criação e depois id). */
export function elementosEstr(p: Project): ElementoEstr[] {
  return Object.values(p.elements)
    .filter(ehElementoEstr)
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

export const temEstrutura = (p: Project): boolean => Object.values(p.elements).some(ehElementoEstr);

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Cota (m) do nível do projeto; `undefined` quando o nível não existe ou a cota não é finita. */
export function cotaDoNivel(p: Project, id: Id): number | undefined {
  const c = p.levels.find((l) => l.id === id)?.elevation;
  return finito(c) ? c : undefined;
}

/** Base e topo (m) de um pilar, pelas regras da A.3; `null` quando o nível de base ou de topo não existe. */
export function baseETopoDoPilar(p: Project, c: Column): { base: number; topo: number } | null {
  const cotaBase = cotaDoNivel(p, c.levelId);
  if (cotaBase === undefined) return null;
  const base = cotaBase + c.baseOffset;
  if (c.topLevelId === null) return { base, topo: base + (c.height ?? Number.NaN) };
  const cotaTopo = cotaDoNivel(p, c.topLevelId);
  return cotaTopo === undefined ? null : { base, topo: cotaTopo + c.topOffset };
}

/**
 * Motivo de o elemento não poder ir ao kernel (mensagem localizada) ou `null` quando está apto. Cobre: tipo ou nível inexistente, perfil e
 * números inválidos (validadores do modelo) e pilar cujo topo não passa da base por pelo menos 1 mm (o kernel recusa com `ENTRADA`).
 */
export function motivoInvalidoEstr(p: Project, e: ElementoEstr, lang: Lang = 'pt'): string | null {
  if (cotaDoNivel(p, e.levelId) === undefined) return tModelo(lang, 'md_cmd_level_missing_id', { id: e.levelId });
  if (isColumn(e)) {
    const tipo = columnTypesOf(p)[e.typeId];
    if (!tipo) return tModelo(lang, 'md_cmd_column_type_missing');
    const m = columnTypeIssue(tipo, lang) ?? columnIssue(e, tipo, lang);
    if (m) return m;
    const bt = baseETopoDoPilar(p, e);
    if (!bt) return tModelo(lang, 'md_cmd_level_missing_id', { id: e.topLevelId ?? e.levelId });
    return finito(bt.base) && finito(bt.topo) && bt.topo - bt.base >= VIGA_COMPRIMENTO_MIN ? null : tModelo(lang, 'md_estr_pilar_altura');
  }
  if (isBeam(e)) {
    const tipo = beamTypesOf(p)[e.typeId];
    if (!tipo) return tModelo(lang, 'md_cmd_beam_type_missing');
    return beamTypeIssue(tipo, lang) ?? beamIssue(e, lang);
  }
  const tipo = footingTypesOf(p)[e.typeId];
  if (!tipo) return tModelo(lang, 'md_cmd_footing_type_missing');
  const m = footingTypeIssue(tipo, lang) ?? footingIssue(e, tipo, lang);
  if (m) return m;
  // O grupo preenchido tem de combinar com o modo do tipo (o kernel confere e recusa com ENTRADA).
  return tipo.modo === 'isolada' ? (e.pos ? null : tModelo(lang, 'md_estr_fund_isolada')) : e.a && e.b ? null : tModelo(lang, 'md_estr_fund_corrida');
}
