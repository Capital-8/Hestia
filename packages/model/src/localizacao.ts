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

/** Problema da localização, ou null se estiver válida (todos os números finitos). */
export function localizacaoIssue(l: Localizacao, lang: Lang = 'pt'): string | null {
  const ok = [l?.origemE, l?.origemN, l?.cotaZero, l?.norteVerdadeiro].every((n) => typeof n === 'number' && Number.isFinite(n));
  return ok ? null : t(lang, 'md_loc_invalida');
}
