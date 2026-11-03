import { validarFamilia, type Familia, type ProjectStore } from '@hestia/model';

/*
 * "Carregar no projeto" do editor de famílias: valida com o mesmo validador da interface e grava a família no projeto
 * aberto num único passo de desfazer. A cópia entra no projeto; o histórico do editor continua intacto.
 */

export type ResultadoCarregamento = { ok: true; familia: Familia } | { ok: false; erro: string };

/** Motivo (em português) pelo qual a família não pode ser carregada, ou null. Só erros; avisos não bloqueiam. */
export function validarParaCarregar(familia: Familia): string | null {
  const erro = validarFamilia(familia).find((p) => p.nivel === 'erro');
  return erro ? `Não foi possível carregar “${familia.nome}”: ${erro.mensagem} (${erro.onde}).` : null;
}

/** Valida e grava a família no projeto aberto. Recusa com a mensagem quando a validação encontra erro. */
export function carregarNoProjeto(store: ProjectStore, familia: Familia): ResultadoCarregamento {
  const erro = validarParaCarregar(familia);
  if (erro) return { ok: false, erro };
  const copia = structuredClone(familia);
  try {
    store.exec({ type: 'upsertFamily', family: copia }, 'Carregar família no projeto');
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Operação recusada.' };
  }
  return { ok: true, familia: copia };
}
