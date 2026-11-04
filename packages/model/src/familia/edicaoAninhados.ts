import type { Aninhado, Familia } from './tipos.ts';

/*
 * Operações de edição dos módulos aninhados (contrato; a ficha ANIN-modelo implementa). Mesmo contrato de `edicao.ts`: puras sobre o
 * rascunho, devolvem `null` em sucesso ou o MOTIVO da recusa em português; com erro a família fica exatamente como estava.
 */

/** Acrescenta o aninhado ao fim (cria a lista se não houver). Erros: objeto inválido, id vazio ou repetido (entre aninhados E peças), `familiaId` vazio ou igual ao da própria família, rotação que não seja 0, 90, 180 ou 270 quando for número literal. */
export function adicionarAninhado(_f: Familia, _a: Aninhado): string | null {
  throw new Error('não implementado');
}

/** Troca os campos presentes no patch (nome, familiaId, tipoId, valores, origem, rotacao). Erros: inexistente; `familiaId` igual ao da própria família. */
export function editarAninhado(_f: Familia, _id: string, _patch: Partial<Omit<Aninhado, 'id'>>): string | null {
  throw new Error('não implementado');
}

/** Remove o aninhado. Erro: inexistente. */
export function excluirAninhado(_f: Familia, _id: string): string | null {
  throw new Error('não implementado');
}
