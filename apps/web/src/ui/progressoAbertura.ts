import { useSyncExternalStore } from 'react';

/** Fases nomeadas da abertura de um projeto (a barra mostra o rótulo e, na fase 2, "n de N"). */
export type FaseAbertura = 'lendo' | 'ativo' | 'projeto';

export interface ProgressoAbertura {
  fase: FaseAbertura;
  /** Só na fase `projeto`: tarefas feitas e total. */
  feitas: number;
  total: number;
}

export const ROTULO_FASE: Record<FaseAbertura, string> = {
  lendo: 'Lendo arquivo',
  ativo: 'Preparando o pavimento ativo',
  projeto: 'Preparando o projeto',
};

/** Texto da barra: o rótulo da fase e, na fase 2, "n de N". */
export function textoDoProgresso(p: ProgressoAbertura): string {
  return p.fase === 'projeto' ? `${ROTULO_FASE.projeto}: ${Math.min(p.feitas + 1, p.total)} de ${p.total}` : `${ROTULO_FASE[p.fase]}…`;
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
