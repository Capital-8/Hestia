/** Preferências de atualização guardadas no navegador (fora do projeto). */
export interface PreferenciasAtualizacao {
  /** Mostra o aviso automático ao abrir o app. */
  avisarAoAbrir: boolean;
  /** Última versão que o usuário recusou; uma versão MAIOR volta a avisar. */
  versaoRecusada: string | null;
}

export const PREFERENCIAS_PADRAO: PreferenciasAtualizacao = {
  avisarAoAbrir: true,
  versaoRecusada: null,
};

/** Partes numéricas de uma versão (`v1.2.3-beta.1` → `[1, 2, 3, 1]`). */
export function partesDaVersao(versao: string): number[] {
  return versao
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((parte) => {
      const n = Number.parseInt(parte, 10);
      return Number.isFinite(n) ? n : null;
    })
    .filter((n): n is number => n !== null);
}

/** Comparação numérica simples: negativo se `a < b`, zero se iguais, positivo se `a > b`. */
export function compararVersoes(a: string, b: string): number {
  const pa = partesDaVersao(a);
  const pb = partesDaVersao(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Decide se o aviso automático deve aparecer ao abrir. Some quando a preferência
 * está desligada, quando o usuário adiou nesta sessão ou quando a versão nova não
 * é maior que a recusada. A verificação manual do Sobre não passa por aqui.
 */
export function deveAvisarAutomatico(
  versaoNova: string | null | undefined,
  preferencias: PreferenciasAtualizacao,
  adiadoNaSessao: boolean,
): boolean {
  if (!versaoNova || adiadoNaSessao || !preferencias.avisarAoAbrir) return false;
  if (preferencias.versaoRecusada && compararVersoes(versaoNova, preferencias.versaoRecusada) <= 0) return false;
  return true;
}
