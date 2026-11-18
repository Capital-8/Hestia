import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia } from './tipos.ts';
import { validarFamilia } from './validar.ts';

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

/** Chaves que jamais podem vir de um arquivo: mexer nelas é poluir o protótipo. */
const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/** Profundidade máxima percorrida ao procurar chave proibida (defesa contra estrutura hostil ou cíclica). */
const PROFUNDIDADE_MAX = 64;

/** Campos do contrato `Familia`: só eles são lidos da família importada. */
const CAMPOS_FAMILIA = [
  'formato',
  'versao',
  'id',
  'nome',
  'categoria',
  'descricao',
  'unidade',
  'hospedagem',
  'origem',
  'parametros',
  'planos',
  'pecas',
  'aninhados',
  'ferragens',
  'conectores',
  'escolhas',
  'tipos',
  'tipoPadrao',
] as const;

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function temProprio(o: Record<string, unknown>, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, chave);
}

/** Nome legível para o relatório de famílias ignoradas. */
function nomeDo(bruto: Record<string, unknown>): string {
  const nome = bruto['nome'];
  return typeof nome === 'string' && nome.trim() !== '' ? nome : '(sem nome)';
}

/**
 * Procura chave proibida em qualquer nível (objetos e listas). Devolve `'proibida'`, `'fundo'` (passou do limite de
 * profundidade) ou `null`. Recursivo com limite para não estourar a pilha em estrutura muito aninhada ou cíclica.
 */
function varreduraProibida(v: unknown, profundidade = 0): 'proibida' | 'fundo' | null {
  if (profundidade > PROFUNDIDADE_MAX) return 'fundo';
  if (Array.isArray(v)) {
    for (const item of v) {
      const achado = varreduraProibida(item, profundidade + 1);
      if (achado) return achado;
    }
    return null;
  }
  if (!ehObjetoSimples(v)) return null;
  for (const chave of Object.keys(v)) {
    if (CHAVES_PROIBIDAS.has(chave)) return 'proibida';
    const achado = varreduraProibida(v[chave], profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

/** Cópia profunda só dos campos de `Familia`, com formato e versão atuais. Chamar depois da varredura de chaves. */
function copiarFamilia(bruto: Record<string, unknown>): Familia {
  const saida: Record<string, unknown> = {};
  for (const chave of CAMPOS_FAMILIA) {
    if (temProprio(bruto, chave)) saida[chave] = bruto[chave];
  }
  saida['formato'] = FAMILIA_FORMATO;
  saida['versao'] = FAMILIA_VERSAO;
  return structuredClone(saida) as unknown as Familia;
}

/** Cópia profunda: o que sai não compartilha objeto com o projeto. `formato` e `versao` são os atuais (FAMILIA_VERSAO). */
export function exportarFamilias(familias: readonly Familia[]): ArquivoFamilias {
  return {
    formato: FAMILIA_FORMATO,
    versao: FAMILIA_VERSAO,
    familias: familias.map((f) => {
      const copia = structuredClone(f);
      copia.formato = FAMILIA_FORMATO;
      copia.versao = FAMILIA_VERSAO;
      return copia;
    }),
  };
}

/** JSON com 2 espaços de recuo, chaves na ordem em que estão nos objetos. */
export function serializar(a: ArquivoFamilias): string {
  return JSON.stringify(a, null, 2);
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
  if (!ehObjetoSimples(dados)) throw new Error('O arquivo não é de famílias do Hestia.');
  if (dados['formato'] !== FAMILIA_FORMATO) throw new Error('O arquivo não é de famílias do Hestia.');

  const versao = dados['versao'];
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) {
    throw new Error('Versão do arquivo de famílias ausente ou inválida.');
  }
  if (versao > FAMILIA_VERSAO) {
    throw new Error(
      `Arquivo mais novo que este programa: versão ${versao} do formato, este Hestia lê até a ${FAMILIA_VERSAO}. Atualize o Hestia para importá-lo.`,
    );
  }

  const brutas = dados['familias'];
  if (!Array.isArray(brutas)) throw new Error('O arquivo não traz a lista de famílias.');
  if (brutas.length > ARQUIVO_MAX_FAMILIAS) {
    throw new Error(`O arquivo traz ${brutas.length} famílias, acima do máximo de ${ARQUIVO_MAX_FAMILIAS}.`);
  }

  const familias: Familia[] = [];
  const ignoradas: FamiliaIgnorada[] = [];
  const idsVistos = new Set<string>();

  for (const bruta of brutas) {
    if (!ehObjetoSimples(bruta)) {
      ignoradas.push({ nome: '(sem nome)', motivo: 'não é uma família' });
      continue;
    }

    const nome = nomeDo(bruta);
    const id = bruta['id'];
    const nomeBruto = bruta['nome'];
    if (typeof id !== 'string' || id.trim() === '') {
      ignoradas.push({ nome, motivo: 'id ausente ou vazio' });
      continue;
    }
    if (typeof nomeBruto !== 'string' || nomeBruto.trim() === '') {
      ignoradas.push({ nome, motivo: 'nome ausente ou vazio' });
      continue;
    }

    const varredura = varreduraProibida(bruta);
    if (varredura === 'proibida') {
      ignoradas.push({ nome, motivo: 'contém chave proibida (__proto__, constructor ou prototype)' });
      continue;
    }
    if (varredura === 'fundo') {
      ignoradas.push({ nome, motivo: 'aninhamento excessivo' });
      continue;
    }

    const familia = copiarFamilia(bruta);
    const problemas = validarFamilia(familia);
    const primeiro = problemas.find((p) => p.nivel === 'erro');
    if (primeiro) {
      ignoradas.push({ nome, motivo: `${primeiro.mensagem} (${primeiro.onde})` });
      continue;
    }

    if (idsVistos.has(familia.id)) {
      ignoradas.push({ nome, motivo: `id repetido no arquivo: ${familia.id}` });
      continue;
    }

    idsVistos.add(familia.id);
    familias.push(familia);
  }

  return { familias, ignoradas };
}

/** `JSON.parse` + `importarFamilias`. Texto maior que ARQUIVO_MAX_CARACTERES ou JSON inválido: lança `Error('Arquivo inválido: …')`. */
export function lerArquivo(texto: string): ResultadoImportacao {
  if (texto.length > ARQUIVO_MAX_CARACTERES) {
    throw new Error(`Arquivo inválido: o texto passa de ${ARQUIVO_MAX_CARACTERES} caracteres.`);
  }
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new Error(`Arquivo inválido: ${detalhe}`);
  }
  return importarFamilias(dados);
}
