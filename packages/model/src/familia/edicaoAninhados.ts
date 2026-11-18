import { lista } from './edicaoApoio.ts';
import type { Aninhado, Expr, Familia, Peca } from './tipos.ts';

/*
 * Operações de edição dos módulos aninhados (ficha ANIN-modelo). Mesmo contrato de `edicao.ts`: puras sobre o
 * rascunho, devolvem `null` em sucesso ou o MOTIVO da recusa em português; com erro a família fica exatamente como estava.
 * A validação estrutural (formato do id, fórmulas etc.) continua a cargo de `validarFamilia`.
 */

/** Texto que é só um número (com sinal e decimais), sem fórmula. */
const NUMERO_LITERAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/** Motivo da recusa quando a rotação é um número literal fora de 0, 90, 180 e 270 (fórmulas passam). */
function erroDeRotacao(rotacao: Expr | undefined): string | null {
  if (typeof rotacao !== 'string') return null;
  const texto = rotacao.trim();
  if (!NUMERO_LITERAL.test(texto)) return null;
  const graus = Number(texto);
  return graus === 0 || graus === 90 || graus === 180 || graus === 270
    ? null
    : `a rotação “${rotacao}” precisa ser 0, 90, 180 ou 270 graus`;
}

/** Peças e módulos aninhados dividem o mesmo espaço de ids usados nos `onde` da validação. */
function idOcupado(f: Familia, id: string): boolean {
  return lista<Aninhado>(f.aninhados).some((a) => a?.id === id) || lista<Peca>(f.pecas).some((p) => p?.id === id);
}

/** Acrescenta o aninhado ao fim (cria a lista se não houver). Erros: objeto inválido, id vazio ou repetido (entre aninhados E peças), `familiaId` vazio ou igual ao da própria família, rotação que não seja 0, 90, 180 ou 270 quando for número literal. */
export function adicionarAninhado(f: Familia, a: Aninhado): string | null {
  if (!a || typeof a !== 'object') return 'módulo aninhado inválido';
  if (f.aninhados !== undefined && !Array.isArray(f.aninhados)) return 'a família não tem lista de aninhados';
  if (typeof a.id !== 'string' || a.id.trim() === '') return 'o módulo aninhado precisa de um id não vazio';
  if (idOcupado(f, a.id)) return `id repetido: “${a.id}”`;
  if (typeof a.nome !== 'string' || a.nome.trim() === '') return 'o módulo aninhado precisa de um nome';
  if (typeof a.familiaId !== 'string' || a.familiaId.trim() === '') return 'o módulo aninhado precisa de um familiaId';
  if (a.familiaId === f.id) return 'o módulo aninhado não pode referenciar a própria família';
  const rotacao = erroDeRotacao(a.rotacao);
  if (rotacao !== null) return rotacao;

  if (f.aninhados === undefined) f.aninhados = [a];
  else f.aninhados.push(a);
  return null;
}

/** Troca os campos presentes no patch (nome, familiaId, tipoId, valores, origem, rotacao). Erros: inexistente; `familiaId` igual ao da própria família. */
export function editarAninhado(f: Familia, id: string, patch: Partial<Omit<Aninhado, 'id'>>): string | null {
  if (!patch || typeof patch !== 'object') return 'patch inválido';
  const alvo = lista<Aninhado>(f.aninhados).find((a) => a?.id === id);
  if (alvo === undefined) return `módulo aninhado “${id}” não existe`;

  if (patch.nome !== undefined && patch.nome.trim() === '') return 'o módulo aninhado precisa de um nome';
  if (patch.familiaId !== undefined) {
    if (patch.familiaId.trim() === '') return 'o módulo aninhado precisa de um familiaId';
    if (patch.familiaId === f.id) return 'o módulo aninhado não pode referenciar a própria família';
  }
  if (patch.rotacao !== undefined) {
    const rotacao = erroDeRotacao(patch.rotacao);
    if (rotacao !== null) return rotacao;
  }

  if (patch.nome !== undefined) alvo.nome = patch.nome;
  if (patch.familiaId !== undefined) alvo.familiaId = patch.familiaId;

  if ('tipoId' in patch) {
    if (patch.tipoId === undefined) delete alvo.tipoId;
    else alvo.tipoId = patch.tipoId;
  }
  if (patch.valores !== undefined) alvo.valores = patch.valores;
  if (patch.origem !== undefined) alvo.origem = patch.origem;

  if ('rotacao' in patch) {
    if (patch.rotacao === undefined) delete alvo.rotacao;
    else alvo.rotacao = patch.rotacao;
  }
  if ('repetir' in patch) {
    if (patch.repetir === undefined) delete alvo.repetir;
    else alvo.repetir = patch.repetir;
  }
  if ('quando' in patch) {
    if (patch.quando === undefined) delete alvo.quando;
    else alvo.quando = patch.quando;
  }
  return null;
}

/** Remove o aninhado. Erro: inexistente. */
export function excluirAninhado(f: Familia, id: string): string | null {
  if (!Array.isArray(f.aninhados)) return `módulo aninhado “${id}” não existe`;
  const indice = f.aninhados.findIndex((a) => a?.id === id);
  if (indice < 0) return `módulo aninhado “${id}” não existe`;

  f.aninhados.splice(indice, 1);
  return null;
}
