import { formatQuantity, type Command, type ResolvedUnits } from '@hestia/model';
import { parseQuantityText, type TempDim } from '@hestia/tools';
import { t, type Lang } from '../../editor/i18n.ts';

export type DimEditOutcome = { kind: 'done'; commands: Command[]; note?: string } | { kind: 'error'; message: string };

/** Duração do destaque vermelho de uma cota recusada (ms): feedback efêmero de interface. */
export const INVALID_FLASH_MS = 4000;

/**
 * Resolve o texto digitado numa cota: lê na unidade do projeto e pede ao provedor os comandos. Função pura: quem chama
 * executa os comandos (um passo de desfazer) ou mostra a mensagem.
 */
export function resolveDimEdit(dim: TempDim, text: string, units: ResolvedUnits, lang: Lang = 'pt'): DimEditOutcome {
  if (!dim.edit) return { kind: 'error', message: t(lang, 'cvv_dim_readonly') };
  const q = dim.quantity ?? 'length';
  const si = parseQuantityText(text, units, q);
  if (si === null) {
    const exemplo = formatQuantity(units, q, q === 'angle' ? Math.PI / 4 : 1.2, { trim: true, lang });
    const nome = t(lang, q === 'angle' ? 'cvv_dim_a_angle' : 'cvv_dim_a_distance');
    return { kind: 'error', message: t(lang, 'cvv_dim_invalid_measure', { noun: nome, example: exemplo }) };
  }
  const r = dim.edit(si);
  if ('error' in r) return { kind: 'error', message: r.error };
  return { kind: 'done', commands: r.commands, ...(r.note ? { note: r.note } : {}) };
}

/**
 * Versão em que as cotas temporárias da seleção devem ficar suspensas depois do botão "I": a versão em que a
 * conversão realmente gravou algo. Sem alteração (lista vazia ou comando recusado), não há suspensão.
 */
export function suspensionAfterConversion(versionBefore: number, versionAfter: number): number | null {
  return versionAfter === versionBefore ? null : versionAfter;
}

/**
 * As cotas da seleção estão suspensas? Só na mesma versão da conversão: desfazer ou qualquer alteração posterior
 * muda a versão e devolve as temporárias; trocar de seleção limpa a suspensão no estado.
 */
export function selectionDimsSuspended(suspendedVersion: number | null, projectVersion: number): boolean {
  return suspendedVersion !== null && suspendedVersion === projectVersion;
}
