import type { Draft } from 'immer';

/*
 * Histórico de desfazer/refazer do editor de famílias (molde: `ProjectStore` em `history.ts`, que usa patches do immer).
 * FICHA E1-historico: implementar a classe. Testes em `historico.test.ts`. Genérica: serve a qualquer estado imutável `T`.
 */

type Ouvinte = () => void;

export class HistoricoFamilia<T extends object> {
  /** Contador que cresce a cada mudança de `atual` (exec, desfazer, refazer); chave de cache para a interface. */
  versao = 0;

  /** `limite`: máximo de passos guardados em "desfazer"; ao passar disso o mais antigo é descartado. */
  constructor(inicial: T, limite = 200) {
    void inicial;
    void limite;
    throw new Error('não implementado: ficha E1-historico');
  }

  /** Estado atual (objeto imutável; nunca é alterado no lugar: cada mudança cria um novo). */
  get atual(): T {
    throw new Error('não implementado: ficha E1-historico');
  }

  get podeDesfazer(): boolean {
    throw new Error('não implementado: ficha E1-historico');
  }

  get podeRefazer(): boolean {
    throw new Error('não implementado: ficha E1-historico');
  }

  /** Rótulo do próximo passo a desfazer / refazer, ou `null`. */
  get rotuloDesfazer(): string | null {
    throw new Error('não implementado: ficha E1-historico');
  }

  get rotuloRefazer(): string | null {
    throw new Error('não implementado: ficha E1-historico');
  }

  /**
   * Aplica `receita` (estilo immer: altera o rascunho) como UM passo de desfazer chamado `rotulo`. Limpa o "refazer".
   * Se a receita não mudar nada (nenhum patch), NÃO cria passo nem notifica. Se lançar, o estado e o histórico ficam
   * como estavam e a exceção sobe. Dentro de `agrupar`, o passo entra no grupo em vez de criar um próprio.
   */
  exec(rotulo: string, receita: (rascunho: Draft<T>) => void): void {
    void rotulo;
    void receita;
    throw new Error('não implementado: ficha E1-historico');
  }

  /**
   * Junta tudo que `fn` executar via `exec` num único passo `rotulo` (arrastar uma cota = 1 desfazer). Se nada mudar, não
   * cria passo. Se `fn` lançar, o estado volta ao de antes do grupo. Grupos aninhados valem como um só (o de fora manda).
   */
  agrupar(rotulo: string, fn: () => void): void {
    void rotulo;
    void fn;
    throw new Error('não implementado: ficha E1-historico');
  }

  /** Devolve `false` (sem efeito) quando não há o que desfazer. */
  desfazer(): boolean {
    throw new Error('não implementado: ficha E1-historico');
  }

  refazer(): boolean {
    throw new Error('não implementado: ficha E1-historico');
  }

  /** Chamado depois de cada mudança de `atual`. Devolve a função que cancela a assinatura. */
  assinar(ouvinte: Ouvinte): () => void {
    void ouvinte;
    throw new Error('não implementado: ficha E1-historico');
  }
}
