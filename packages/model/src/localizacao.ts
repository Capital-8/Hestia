import type { Project } from './types.ts';
import { t, type Lang } from './i18n.ts';

export interface Localizacao {
  /** Coordenada real (leste, norte), em metros, do ponto (0, 0) do projeto. */
  origemE: number;
  origemN: number;
  /** Altitude real (m) da cota 0 do projeto. Cota exibida = z do projeto + cotaZero. */
  cotaZero: number;
  /** Norte verdadeiro: ângulo (rad) medido do eixo +y do projeto, sentido horário. 0 = o norte é +y. */
  norteVerdadeiro: number;
  /** Texto livre do sistema de referência (ex.: "SIRGAS 2000 / UTM 23S"). Só informação. */
  sistema?: string;
}

/** Localização zerada: vale quando o projeto não tem `localizacao`. */
export const LOCALIZACAO_ZERO: Localizacao = { origemE: 0, origemN: 0, cotaZero: 0, norteVerdadeiro: 0 };

/** Localização efetiva do projeto (ausente = tudo zero). */
export const localizacaoDe = (p: Pick<Project, 'localizacao'>): Localizacao => p.localizacao ?? LOCALIZACAO_ZERO;

/** Cota exibida ao usuário: z do projeto mais a altitude real da cota zero (A.3 item 7). Use com `formatQuantity`. */
export const cotaExibida = (p: Pick<Project, 'localizacao'>, z: number): number => z + localizacaoDe(p).cotaZero;

/** Inverso de `cotaExibida`: valor digitado pelo usuário → z do projeto. */
export const cotaDoProjeto = (p: Pick<Project, 'localizacao'>, valor: number): number => valor - localizacaoDe(p).cotaZero;

/**
 * Coordenada real (leste, norte), em metros, de um ponto (x, y) do projeto.
 * Convenção: `norteVerdadeiro` (θ) é o ângulo do +y do projeto até o norte verdadeiro, sentido horário (θ = 0: o norte é +y).
 * Logo o norte verdadeiro é (sen θ, cos θ) no projeto e o leste verdadeiro é (cos θ, −sen θ):
 *   leste = origemE + x·cos θ − y·sen θ;  norte = origemN + x·sen θ + y·cos θ.
 * Com θ = 0: leste = origemE + x e norte = origemN + y. Com θ = π/2 o +y do projeto aponta para o oeste verdadeiro.
 */
export function coordenadaReal(p: Pick<Project, 'localizacao'>, pt: { x: number; y: number }): { leste: number; norte: number } {
  const l = localizacaoDe(p);
  const c = Math.cos(l.norteVerdadeiro);
  const s = Math.sin(l.norteVerdadeiro);
  return { leste: l.origemE + pt.x * c - pt.y * s, norte: l.origemN + pt.x * s + pt.y * c };
}

/** Inverso de `coordenadaReal`: coordenada real (leste, norte) → ponto (x, y) do projeto. */
export function coordenadaDoProjeto(p: Pick<Project, 'localizacao'>, real: { leste: number; norte: number }): { x: number; y: number } {
  const l = localizacaoDe(p);
  const c = Math.cos(l.norteVerdadeiro);
  const s = Math.sin(l.norteVerdadeiro);
  const dE = real.leste - l.origemE;
  const dN = real.norte - l.origemN;
  return { x: dE * c + dN * s, y: -dE * s + dN * c };
}

/** Problema da localização, ou null se estiver válida (todos os números finitos). */
export function localizacaoIssue(l: Localizacao, lang: Lang = 'pt'): string | null {
  const ok = [l?.origemE, l?.origemN, l?.cotaZero, l?.norteVerdadeiro].every((n) => typeof n === 'number' && Number.isFinite(n));
  return ok ? null : t(lang, 'md_loc_invalida');
}
