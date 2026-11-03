import { useSyncExternalStore } from 'react';
import { fmtNum, t, type Lang } from '../editor/i18n.ts';

/** Fases nomeadas da abertura de um projeto (a barra mostra o rótulo e, na fase 2, "n de N"). */
export type FaseAbertura = 'lendo' | 'ativo' | 'projeto';

export interface ProgressoAbertura {
  fase: FaseAbertura;
  /** Só na fase `projeto`: tarefas feitas e total. */
  feitas: number;
  total: number;
}

const CHAVE_FASE: Record<FaseAbertura, 'cvv_prog_phase_reading' | 'cvv_prog_phase_active' | 'cvv_prog_phase_project'> = {
  lendo: 'cvv_prog_phase_reading',
  ativo: 'cvv_prog_phase_active',
  projeto: 'cvv_prog_phase_project',
};

/** Rótulo da fase no idioma ativo. */
export function rotuloFase(fase: FaseAbertura, lang: Lang = 'pt'): string {
  return t(lang, CHAVE_FASE[fase]);
}

/** Texto da barra: o rótulo da fase e, na fase 2, "n de N". */
export function textoDoProgresso(p: ProgressoAbertura, lang: Lang = 'pt'): string {
  if (p.fase === 'projeto') return `${rotuloFase('projeto', lang)}: ${t(lang, 'cvv_prog_phase_of', { n: fmtNum(Math.min(p.feitas + 1, p.total), 0, lang), total: fmtNum(p.total, 0, lang) })}`;
  return `${rotuloFase(p.fase, lang)}…`;
}

let atual: ProgressoAbertura | null = null;
const ouvintes = new Set<() => void>();

/** Publica o progresso da abertura; `null` esconde a barra. Valores iguais não notificam. */
export function publicarProgressoAbertura(p: ProgressoAbertura | null): void {
  if (atual === p || (atual && p && atual.fase === p.fase && atual.feitas === p.feitas && atual.total === p.total)) return;
  atual = p;
  for (const o of ouvintes) o();
}

export const progressoAberturaAtual = (): ProgressoAbertura | null => atual;

export function useProgressoAbertura(): ProgressoAbertura | null {
  return useSyncExternalStore(
    (cb) => {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    () => atual,
  );
}
