import { LOCALIZACAO_ZERO, localizacaoDe, localizacaoIssue, type Command, type Localizacao, type Project, type ProjectStore } from '@hestia/model';
import type { Lang } from '../../editor/i18n.ts';

/**
 * Lógica do formulário de Localização (ficha U1), sem React. O formulário trabalha com números: leste, norte e altitude em metros
 * (o campo converte para a unidade do projeto), norte verdadeiro em GRAUS; o modelo guarda RADIANOS (`Localizacao.norteVerdadeiro`).
 */

export interface FormLocalizacao {
  origemE: number;
  origemN: number;
  cotaZero: number;
  /** Norte verdadeiro em graus, sentido horário a partir de +y. */
  norteGraus: number;
  sistema: string;
}

const GRAU = Math.PI / 180;

/** Graus → radianos. */
export const grausParaRad = (g: number): number => g * GRAU;

/** Radianos → graus, sem o ruído de ponto flutuante (arredonda a 1e-9). */
export const radParaGraus = (r: number): number => Math.round((r / GRAU) * 1e9) / 1e9;

/** Valores iniciais do formulário a partir da localização do projeto (ausente = tudo zero). */
export function formDaLocalizacao(p: Pick<Project, 'localizacao'>): FormLocalizacao {
  const l = localizacaoDe(p);
  return { origemE: l.origemE, origemN: l.origemN, cotaZero: l.cotaZero, norteGraus: radParaGraus(l.norteVerdadeiro), sistema: l.sistema ?? '' };
}

/** Formulário → localização do modelo (norte em radianos; sistema só entra se tiver texto). */
export function localizacaoDoForm(f: FormLocalizacao): Localizacao {
  const sistema = f.sistema.trim();
  return { origemE: f.origemE, origemN: f.origemN, cotaZero: f.cotaZero, norteVerdadeiro: grausParaRad(f.norteGraus), ...(sistema === '' ? {} : { sistema }) };
}

/** Problema do formulário (validação ao vivo, com a regra do modelo), ou null se estiver válido. */
export const problemaDoForm = (f: FormLocalizacao, lang: Lang = 'pt'): string | null => localizacaoIssue(localizacaoDoForm(f), lang);

/** O formulário vale o mesmo que "sem localização" (tudo zero e sem sistema)? */
export function formEhZero(f: FormLocalizacao): boolean {
  const z = LOCALIZACAO_ZERO;
  return f.origemE === z.origemE && f.origemN === z.origemN && f.cotaZero === z.cotaZero && f.norteGraus === 0 && f.sistema.trim() === '';
}

/** Comando de aplicar: tudo zero e sem sistema remove a localização (projeto volta a "ausente"); senão grava. */
export const comandoDeLocalizacao = (f: FormLocalizacao): Command => ({ type: 'setLocalizacao', localizacao: formEhZero(f) ? null : localizacaoDoForm(f) });

/** O formulário difere do que o projeto já tem? (habilita o Aplicar). */
export function formMudou(f: FormLocalizacao, p: Pick<Project, 'localizacao'>): boolean {
  const a = formDaLocalizacao(p);
  return a.origemE !== f.origemE || a.origemN !== f.origemN || a.cotaZero !== f.cotaZero || a.norteGraus !== f.norteGraus || a.sistema !== f.sistema.trim();
}

/** Aplica o formulário como UM passo de desfazer. Devolve o problema (nada muda) ou null. */
export function aplicarLocalizacao(store: Pick<ProjectStore, 'exec'>, f: FormLocalizacao, rotulo: string, lang: Lang = 'pt'): string | null {
  const problema = problemaDoForm(f, lang);
  if (problema) return problema;
  try {
    store.exec(comandoDeLocalizacao(f), rotulo, lang);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
