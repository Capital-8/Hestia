import type { Aninhado, Expr, Familia } from '@hestia/model';

/*
 * Lógica pura do diálogo de módulo aninhado (ficha ANIN-ui): lista das famílias que podem ser aninhadas, id livre,
 * montagem do `Aninhado` a partir dos textos do formulário e validação da entrada. As recusas estruturais (id
 * repetido, família própria, rotação inválida) continuam sendo das operações de `edicaoAninhados`, fonte de verdade
 * sobre o rascunho do histórico.
 */

/** Estado do formulário, tudo em texto: exatamente o que o autor digitou nos campos. */
export interface EntradaAninhado {
  familiaId: string;
  /** Texto vazio é o "Padrão" (o tipo da família fica ausente no aninhado). */
  tipoId: string;
  nome: string;
  id: string;
  /** Fórmulas em mm, uma por eixo; texto vazio vale `0`. */
  origem: [string, string, string];
  /** Graus em texto: `''`, `'0'`, `'90'`, `'180'` ou `'270'`. */
  rotacao: string;
}

/** Rotações válidas no v1: múltiplos de 90° em torno de Z (motor `componentes/aninhados.ts`). */
export const ROTACOES_ANINHADO: readonly number[] = [0, 90, 180, 270];

/** Biblioteca base + famílias do projeto, sem repetir id e sem a própria família (família não se aninha nela mesma). */
export function familiasParaAninhar(base: readonly Familia[], projeto: readonly Familia[], propriaId: string): Familia[] {
  const out: Familia[] = [];
  const vistos = new Set<string>([propriaId]);
  for (const f of [...projeto, ...base]) {
    if (!f || typeof f.id !== 'string' || vistos.has(f.id)) continue;
    vistos.add(f.id);
    out.push(f);
  }
  return out;
}

/** Nome da família na lista, ou o próprio id (um aninhado pode apontar para família que não está na lista). */
export function nomeDaFamilia(familias: readonly Familia[], id: string): string {
  return familias.find((f) => f?.id === id)?.nome ?? id;
}

/** Id livre para um aninhado novo (`aninhado_1`, `aninhado_2`, ...), sem repetir aninhados nem peças (o modelo recusa repetição entre os dois). */
export function idLivreDeAninhado(f: Familia): string {
  const usados = new Set<string>();
  for (const a of Array.isArray(f.aninhados) ? f.aninhados : []) usados.add(a?.id ?? '');
  for (const p of Array.isArray(f.pecas) ? f.pecas : []) usados.add(p?.id ?? '');
  let n = 1;
  while (usados.has(`aninhado_${n}`)) n++;
  return `aninhado_${n}`;
}

/** Motivo da recusa da entrada, em português; `null` quando dá para criar. O resto (id repetido, família própria…) é do modelo. */
export function validarEntrada(entrada: EntradaAninhado): string | null {
  if (entrada.familiaId.trim() === '') return 'Escolha a família que será aninhada.';
  if (entrada.nome.trim() === '') return 'O nome do módulo aninhado não pode ficar vazio.';
  if (entrada.id.trim() === '') return 'O id do módulo aninhado não pode ficar vazio.';
  return null;
}

/** Texto da rotação como número válido em texto: graus conhecidos voltam normalizados ('090' → '90'); qualquer outra coisa vale 0. */
export function rotacaoDeTexto(texto: string): string {
  const n = Number(texto.trim());
  return ROTACOES_ANINHADO.includes(n) ? String(n) : '0';
}

/** Monta o `Aninhado` da entrada: nome padrão é o da família escolhida, "Padrão" deixa o tipo ausente, origem vazia vale `0`. */
export function montarAninhado(entrada: EntradaAninhado, familias: readonly Familia[]): Aninhado {
  const familia = familias.find((f) => f?.id === entrada.familiaId);
  const nomeDigitado = entrada.nome.trim();
  const a: Aninhado = {
    id: entrada.id.trim(),
    nome: nomeDigitado !== '' ? nomeDigitado : (familia?.nome ?? ''),
    familiaId: entrada.familiaId.trim(),
    valores: {},
    origem: [
      entrada.origem[0]?.trim() || '0',
      entrada.origem[1]?.trim() || '0',
      entrada.origem[2]?.trim() || '0',
    ],
    rotacao: rotacaoDeTexto(entrada.rotacao),
  };
  const tipo = entrada.tipoId.trim();
  if (tipo !== '') a.tipoId = tipo;
  return a;
}

/**
 * Patch do `editarAninhado` (tudo menos o id, que não muda na edição). Os `valores` não têm campo no formulário:
 * na edição eles continuam os do aninhado atual (passar `valoresAtuais` evita apagá-los).
 */
export function patchDoAninhado(
  entrada: EntradaAninhado,
  familias: readonly Familia[],
  valoresAtuais?: Record<string, Expr>,
): Partial<Omit<Aninhado, 'id'>> {
  const a = montarAninhado(entrada, familias);
  const patch: Partial<Omit<Aninhado, 'id'>> = {
    nome: a.nome,
    familiaId: a.familiaId,
    valores: valoresAtuais ?? a.valores,
    origem: a.origem,
    rotacao: a.rotacao,
  };
  if (a.tipoId !== undefined) patch.tipoId = a.tipoId;
  else patch.tipoId = undefined;
  return patch;
}
