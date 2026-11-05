/**
 * Porta da biblioteca no navegador: File System Access API (Chrome/Edge).
 *
 * Só o que o editor usa, descrito aqui — os tipos da API ainda não estão no `lib.dom` de todas as versões do TypeScript,
 * e assim não dependemos deles. O navegador que não tem `showDirectoryPicker` simplesmente não oferece a biblioteca
 * (a porta não é criada e o Ctrl+S segue baixando o JSON, como hoje).
 */

import { ARQUIVO_BACKUP, ARQUIVO_INDICE, ARQUIVO_PROJETO, ErroBiblioteca, type DocumentoParaGravar, type PastaId, type ProjetoGravado } from './tipos.ts';
import type { PortaBiblioteca } from './porta.ts';
import { apagarRaizLembrada, guardarRaizLembrada, lerRaizLembrada } from './armazenamentoRaiz.ts';
import { t, useI18n } from '../i18n.ts';

/** Mensagem da biblioteca no idioma ativo no momento da falha. */
const msg = (key: Parameters<typeof t>[1]): string => t(useI18n.getState().lang, key);

interface EscrivaoDeArquivo {
  write(dados: string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

interface ArquivoHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<{ text(): Promise<string>; lastModified: number; size: number }>;
  createWritable(): Promise<EscrivaoDeArquivo>;
}

interface PastaHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(nome: string, o?: { create?: boolean }): Promise<PastaHandle>;
  getFileHandle(nome: string, o?: { create?: boolean }): Promise<ArquivoHandle>;
  entries?(): AsyncIterableIterator<[string, PastaHandle | ArquivoHandle]>;
  [Symbol.asyncIterator]?(): AsyncIterableIterator<[string, PastaHandle | ArquivoHandle]>;
}

type Permissao = 'granted' | 'denied' | 'prompt';

/** Os dois métodos de permissão que o handle de pasta expõe no Chrome (e que o `lib.dom` nem sempre declara). */
interface HandleComPermissao {
  queryPermission(descricao: { mode: 'readwrite' }): Promise<Permissao>;
  requestPermission(descricao: { mode: 'readwrite' }): Promise<Permissao>;
}

interface JanelaComPicker {
  showDirectoryPicker(o?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }): Promise<PastaHandle>;
}

/** A API existe neste navegador? (pede gesto só na hora de escolher a pasta) */
export function navegadorTemBiblioteca(): boolean {
  return typeof (globalThis as Partial<JanelaComPicker>).showDirectoryPicker === 'function';
}

const erroDeArquivoAusente = (e: unknown): boolean => e instanceof Error && e.name === 'NotFoundError';

export class PortaNavegador implements PortaBiblioteca {
  readonly origem = 'navegador' as const;

  /** Handles da sessão, para a interface só trafegar um id (o `PastaId` é uma string). */
  private readonly handles = new Map<PastaId, PastaHandle>();
  private seq = 0;

  private registrar(handle: PastaHandle): PastaId {
    const id = `navegador:${++this.seq}:${handle.name}`;
    this.handles.set(id, handle);
    return id;
  }

  private handle(id: PastaId): PastaHandle {
    const handle = this.handles.get(id);
    if (!handle) throw new ErroBiblioteca(msg('bib_err_folder_gone'), 'nao-existe');
    return handle;
  }

  private permissoes(h: PastaHandle): HandleComPermissao | null {
    const comPermissao = h as unknown as Partial<HandleComPermissao>;
    if (typeof comPermissao.queryPermission !== 'function' || typeof comPermissao.requestPermission !== 'function') return null;
    return comPermissao as HandleComPermissao;
  }

  async escolherRaiz(): Promise<PastaId | null> {
    const picker = (globalThis as Partial<JanelaComPicker>).showDirectoryPicker;
    if (typeof picker !== 'function') throw new ErroBiblioteca(msg('bib_err_no_picker'), 'sem-suporte');
    let handle: PastaHandle;
    try {
      handle = await picker.call(globalThis, { id: 'hestia-projetos', mode: 'readwrite', startIn: 'documents' });
    } catch (e) {
      // `AbortError`: o usuário fechou o seletor — não é falha.
      if (e instanceof Error && e.name === 'AbortError') return null;
      throw new ErroBiblioteca(e instanceof Error ? e.message : msg('bib_err_open_folder'), 'io');
    }
    await guardarRaizLembrada(handle);
    return this.registrar(handle);
  }

  async raizLembrada(): Promise<{ raiz: PastaId; precisaPermissao: boolean } | null> {
    const handle = await lerRaizLembrada<PastaHandle>();
    if (!handle) return null;
    const permissoes = this.permissoes(handle);
    const estado = permissoes ? await permissoes.queryPermission({ mode: 'readwrite' }) : 'granted';
    return { raiz: this.registrar(handle), precisaPermissao: estado !== 'granted' };
  }

  async permitir(raiz: PastaId): Promise<boolean> {
    const handle = this.handle(raiz);
    const permissoes = this.permissoes(handle);
    if (!permissoes) return true;
    // Precisa acontecer dentro do clique do usuário: o navegador recusa fora de um gesto.
    return (await permissoes.requestPermission({ mode: 'readwrite' })) === 'granted';
  }

  async lerIndice(raiz: PastaId): Promise<string | null> {
    const dir = this.handle(raiz);
    try {
      const arquivo = await dir.getFileHandle(ARQUIVO_INDICE);
      return await (await arquivo.getFile()).text();
    } catch (e) {
      if (erroDeArquivoAusente(e)) return null;
      throw new ErroBiblioteca(msg('bib_err_read_index'), 'io');
    }
  }

  async listarPastas(raiz: PastaId): Promise<Array<{ pasta: string; modificadoEm: string }>> {
    const dir = this.handle(raiz);
    const iterador = dir.entries?.() ?? dir[Symbol.asyncIterator]?.();
    if (!iterador) throw new ErroBiblioteca(msg('bib_err_no_listing'), 'sem-suporte');
    const out: Array<{ pasta: string; modificadoEm: string }> = [];
    for await (const [, entrada] of iterador) {
      if (entrada.kind !== 'directory') continue;
      try {
        const arquivo = await entrada.getFileHandle(ARQUIVO_PROJETO);
        const file = await arquivo.getFile();
        out.push({ pasta: entrada.name, modificadoEm: new Date(file.lastModified).toISOString() });
      } catch {
        // Pasta que não é de projeto (ou cujo documento sumiu): fica de fora da biblioteca.
      }
    }
    return out;
  }

  async ler(raiz: PastaId, pasta: string): Promise<string> {
    const dir = this.handle(raiz);
    try {
      const projeto = await dir.getDirectoryHandle(pasta);
      const arquivo = await projeto.getFileHandle(ARQUIVO_PROJETO);
      return await (await arquivo.getFile()).text();
    } catch (e) {
      if (erroDeArquivoAusente(e)) throw new ErroBiblioteca(msg('bib_err_file_gone'), 'nao-existe');
      throw new ErroBiblioteca(msg('bib_err_read_project'), 'io');
    }
  }

  async gravar(raiz: PastaId, doc: DocumentoParaGravar): Promise<ProjetoGravado> {
    const dir = this.handle(raiz);
    const { pasta } = doc;
    const pastaNova = !(await this.existePasta(dir, pasta));
    try {
      const projeto = await dir.getDirectoryHandle(pasta, { create: true });
      const arquivo = await projeto.getFileHandle(ARQUIVO_PROJETO, { create: true });
      // Backup: a versão anterior vira `.bak` antes da nova entrar.
      const anterior = await this.textoSeExistir(arquivo);
      if (anterior !== null) await this.escrever(await projeto.getFileHandle(ARQUIVO_BACKUP, { create: true }), anterior);
      // `createWritable` grava num temporário e troca no `close`: sem arquivo pela metade se algo falhar.
      await this.escrever(arquivo, doc.conteudo);
      const file = await arquivo.getFile();
      return {
        pastaNova,
        projeto: {
          pasta,
          nome: doc.nome,
          modificadoEm: new Date(file.lastModified).toISOString(),
          miniatura: doc.miniatura,
          bytes: doc.conteudo.length,
        },
      };
    } catch (e) {
      if (e instanceof ErroBiblioteca) throw e;
      throw new ErroBiblioteca(msg('bib_err_write_locked'), 'io');
    }
  }

  async gravarIndice(raiz: PastaId, texto: string): Promise<void> {
    const dir = this.handle(raiz);
    const arquivo = await dir.getFileHandle(ARQUIVO_INDICE, { create: true });
    await this.escrever(arquivo, texto);
  }

  async esquecer(): Promise<void> {
    this.handles.clear();
    await apagarRaizLembrada();
  }

  private async escrever(arquivo: ArquivoHandle, texto: string): Promise<void> {
    const escrivao = await arquivo.createWritable();
    try {
      await escrivao.write(texto);
      await escrivao.close();
    } catch (e) {
      await escrivao.abort?.().catch(() => undefined);
      throw e;
    }
  }

  private async textoSeExistir(arquivo: ArquivoHandle): Promise<string | null> {
    try {
      return await (await arquivo.getFile()).text();
    } catch {
      return null;
    }
  }

  /** A pasta do projeto já existe na raiz? (para dizer se o salvamento criou uma pasta nova) */
  private async existePasta(dir: PastaHandle, pasta: string): Promise<boolean> {
    try {
      await dir.getDirectoryHandle(pasta);
      return true;
    } catch {
      return false;
    }
  }
}
