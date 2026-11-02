import { FAMILIA_FORMATO, type Familia } from './tipos.ts';

/*
 * Arquivo de famílias `hestia-familia` (ADR 0049 §3.6; molde: `openingTypeLibrary.ts`). FICHA E1-arquivo: implementar as
 * quatro funções abaixo. Testes em `arquivo.test.ts`. Tudo puro: quem grava em disco é o chamador.
 */

export interface ArquivoFamilias {
  formato: typeof FAMILIA_FORMATO;
  /** Versão do formato que gravou o arquivo (FAMILIA_VERSAO deste programa). */
  versao: number;
  familias: Familia[];
}

export interface FamiliaIgnorada {
  /** Nome da família quando legível, senão `(sem nome)`. */
  nome: string;
  motivo: string;
}

export interface ResultadoImportacao {
  familias: Familia[];
  ignoradas: FamiliaIgnorada[];
}

/** Máximo de famílias aceitas num arquivo e tamanho máximo do texto de `lerArquivo` (defesa contra arquivo hostil). */
export const ARQUIVO_MAX_FAMILIAS = 200;
export const ARQUIVO_MAX_CARACTERES = 5_000_000;

/** Cópia profunda: o que sai não compartilha objeto com o projeto. `formato` e `versao` são os atuais (FAMILIA_VERSAO). */
export function exportarFamilias(familias: readonly Familia[]): ArquivoFamilias {
  void familias;
  throw new Error('não implementado: ficha E1-arquivo');
}

/** JSON com 2 espaços de recuo, chaves na ordem em que estão nos objetos. */
export function serializar(a: ArquivoFamilias): string {
  void a;
  throw new Error('não implementado: ficha E1-arquivo');
}

/**
 * Valida e importa. LANÇA `Error` (mensagem em português) só nos casos fatais:
 *  - `dados` não é objeto simples; `formato` diferente de FAMILIA_FORMATO; `versao` ausente, não inteira ou menor que 1;
 *    `versao` MAIOR que FAMILIA_VERSAO ("arquivo mais novo que este programa"); `familias` que não é lista; mais de
 *    ARQUIVO_MAX_FAMILIAS famílias.
 * Cada família ruim vira item de `ignoradas` (as boas entram), com `motivo`:
 *  - não é objeto simples, ou falta `id`/`nome` string não vazia;
 *  - contém, em qualquer nível, uma chave `__proto__`, `constructor` ou `prototype` (motivo cita "chave proibida");
 *  - `validarFamilia` devolve algum problema de nível 'erro' (motivo = a mensagem do primeiro + " (" + onde + ")");
 *  - o `id` repete o de uma família anterior do mesmo arquivo (a segunda é ignorada).
 * A família importada é cópia profunda; do objeto de entrada só são lidas as chaves de `Familia` (as demais chaves de
 * primeiro nível são descartadas em silêncio); `formato` e `versao` da família passam a ser os atuais.
 */
export function importarFamilias(dados: unknown): ResultadoImportacao {
  void dados;
  throw new Error('não implementado: ficha E1-arquivo');
}

/** `JSON.parse` + `importarFamilias`. Texto maior que ARQUIVO_MAX_CARACTERES ou JSON inválido: lança `Error('Arquivo inválido: …')`. */
export function lerArquivo(texto: string): ResultadoImportacao {
  void texto;
  throw new Error('não implementado: ficha E1-arquivo');
}
