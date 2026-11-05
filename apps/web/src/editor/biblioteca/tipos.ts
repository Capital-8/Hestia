import type { Id } from '@hestia/model';

/**
 * Biblioteca de projetos em pasta (decisão de produto: uma pasta por projeto).
 *
 * A pasta raiz é escolhida pelo usuário uma vez e guarda:
 *
 * ```
 * Hestia/
 *   biblioteca.json          ← índice leve (nome, data, miniatura) para a tela inicial abrir sem ler os projetos
 *   Casa Térreo 2 quartos/
 *     projeto.hestia.json    ← o documento, no formato de sempre (com `miniatura` dentro)
 *     projeto.hestia.json.bak← a gravação anterior
 * ```
 *
 * A miniatura vive DENTRO do documento (fonte da verdade: viaja com o projeto e não tem como ficar trocada) e é
 * repetida no índice só como cache. Apagar o índice não perde nada: ele é reconstruído lendo os projetos.
 */

/** Nome do arquivo do projeto, dentro da pasta dele. */
export const ARQUIVO_PROJETO = 'projeto.hestia.json';
/** Cópia da gravação anterior (escrita antes da nova: uma queda no meio não perde a última versão boa). */
export const ARQUIVO_BACKUP = 'projeto.hestia.json.bak';
/** Índice da pasta raiz. */
export const ARQUIVO_INDICE = 'biblioteca.json';
/** Versão do índice: muda só se o formato dele mudar (o do projeto tem o seu, `schemaVersion`). */
export const VERSAO_INDICE = 1;

/** Um projeto que está na pasta da biblioteca. */
export interface ProjetoDaBiblioteca {
  /** Nome da pasta dentro da raiz: identidade estável do projeto na biblioteca. */
  pasta: string;
  /** Nome do projeto (campo `name` do documento), para exibir. */
  nome: string;
  /** Última gravação, ISO 8601 (ordena a lista da tela inicial). */
  modificadoEm: string;
  /** Miniatura `data:` URL (JPEG/WebP), ou `null` quando o projeto ainda não foi salvo com uma. */
  miniatura: string | null;
  /** Tamanho do documento em bytes, quando conhecido (mostra projetos pesados na tela inicial). */
  bytes?: number;
}

/** Conteúdo de `biblioteca.json`. */
export interface IndiceBiblioteca {
  versao: number;
  /** Pasta raiz como o usuário escolheu (só informativo; o caminho real é o handle/comando do sistema). */
  raiz: string;
  /** Projetos, na ordem de exibição (mais recente primeiro). */
  projetos: ProjetoDaBiblioteca[];
}

/** De onde a biblioteca fala com o sistema de arquivos: o navegador ou o app desktop. */
export type OrigemBiblioteca = 'navegador' | 'desktop';

/** Uma pasta do sistema de arquivos, opaca para o editor (handle do navegador ou caminho no desktop). */
export type PastaId = string;

/** O que a camada de arquivos precisa saber para gravar um projeto. */
export interface DocumentoParaGravar {
  /** Pasta do projeto dentro da raiz (já resolvida e única: quem decide o nome é o serviço, não a porta). */
  pasta: string;
  nome: string;
  /** O documento JSON (formato de sempre, com `miniatura` dentro quando houver). */
  conteudo: string;
  /** Miniatura `data:` URL, repetida no índice para a tela inicial. `null` mantém a anterior. */
  miniatura: string | null;
}

/** Resultado de gravar: a entrada da biblioteca já atualizada. */
export interface ProjetoGravado {
  projeto: ProjetoDaBiblioteca;
  /** true quando a pasta do projeto foi criada agora. */
  pastaNova: boolean;
}

/** Falha de acesso à pasta, com uma mensagem pronta para o usuário. */
export class ErroBiblioteca extends Error {
  constructor(
    message: string,
    /** `sem-permissao`: o usuário não liberou a pasta (a tela inicial oferece reabrir). */
    readonly motivo: 'sem-permissao' | 'nao-existe' | 'sem-suporte' | 'io',
  ) {
    super(message);
    this.name = 'ErroBiblioteca';
  }
}

/** Ids do projeto da biblioteca não passam por aqui: o documento guarda os dele. */
export type IdDoProjeto = Id;
