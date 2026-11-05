/**
 * Porta da biblioteca no app desktop: os comandos Rust de `desktop/src-tauri/src/biblioteca.rs`.
 *
 * No desktop não há permissão a pedir nem handle a guardar: o caminho da pasta é uma string e quem lembra dele é o lado
 * Rust (arquivo de configuração do app). Todo o trabalho de disco (backup, escrita atômica, varredura) fica lá.
 */

import { ErroBiblioteca, type DocumentoParaGravar, type PastaId, type ProjetoGravado } from './tipos.ts';
import type { PortaBiblioteca } from './porta.ts';
import { t, useI18n } from '../i18n.ts';

/** Mensagem da biblioteca no idioma ativo no momento da falha. */
const msg = (key: Parameters<typeof t>[1]): string => t(useI18n.getState().lang, key);

type Invoke = (comando: string, args?: Record<string, unknown>) => Promise<unknown>;

interface JanelaTauri {
  __TAURI__?: { core?: { invoke?: Invoke } };
  __TAURI_INTERNALS__?: { invoke?: Invoke };
}

/** `invoke` do Tauri (mesma detecção de `atualizacao/ponte.ts`, sem dependência de pacote). */
function invokeDoTauri(): Invoke | null {
  const w = globalThis as JanelaTauri;
  const invoke = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
  return typeof invoke === 'function' ? invoke : null;
}

/** O desktop responde a `biblioteca_raiz_lembrada`; sem isso, não é a casca do Hestia. */
export function emDesktopComBiblioteca(): boolean {
  return invokeDoTauri() !== null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null;
}

/** O Rust devolve milissegundos desde 1970; o índice (e a tela inicial) usam ISO. */
function dataIso(valor: unknown): string | null {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) return new Date(valor).toISOString();
  const comoTexto = texto(valor);
  return comoTexto && !Number.isNaN(Date.parse(comoTexto)) ? comoTexto : null;
}

export class PortaTauri implements PortaBiblioteca {
  readonly origem = 'desktop' as const;

  private invoke(): Invoke {
    const invoke = invokeDoTauri();
    if (!invoke) throw new ErroBiblioteca(msg('bib_err_desktop_only'), 'sem-suporte');
    return invoke;
  }

  async escolherRaiz(): Promise<PastaId | null> {
    const resposta = await this.invoke()('biblioteca_escolher_raiz');
    return texto(resposta);
  }

  async raizLembrada(): Promise<{ raiz: PastaId; precisaPermissao: boolean } | null> {
    const resposta = await this.invoke()('biblioteca_raiz_lembrada');
    const raiz = texto(resposta);
    // No desktop o app tem acesso pleno ao que o usuário escolheu: nunca há permissão pendente.
    return raiz ? { raiz, precisaPermissao: false } : null;
  }

  async permitir(): Promise<boolean> {
    return true;
  }

  async lerIndice(raiz: PastaId): Promise<string | null> {
    return texto(await this.invoke()('biblioteca_ler_indice', { raiz }));
  }

  async listarPastas(raiz: PastaId): Promise<Array<{ pasta: string; modificadoEm: string }>> {
    const resposta = await this.invoke()('biblioteca_listar', { raiz });
    if (!Array.isArray(resposta)) return [];
    const out: Array<{ pasta: string; modificadoEm: string }> = [];
    for (const item of resposta) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const pasta = texto(o.pasta);
      const modificadoEm = dataIso(o.modificadoEm);
      if (pasta && modificadoEm) out.push({ pasta, modificadoEm });
    }
    return out;
  }

  async ler(raiz: PastaId, pasta: string): Promise<string> {
    const resposta = await this.invoke()('biblioteca_ler', { raiz, pasta });
    const conteudo = texto(resposta);
    if (conteudo === null) throw new ErroBiblioteca(msg('bib_err_file_gone'), 'nao-existe');
    return conteudo;
  }

  async gravar(raiz: PastaId, doc: DocumentoParaGravar): Promise<ProjetoGravado> {
    const resposta = await this.invoke()('biblioteca_gravar', {
      raiz,
      pasta: doc.pasta,
      nome: doc.nome,
      conteudo: doc.conteudo,
    });
    if (!resposta || typeof resposta !== 'object') throw new ErroBiblioteca(msg('bib_err_write_project'), 'io');
    const o = resposta as Record<string, unknown>;
    const pasta = texto(o.pasta);
    const modificadoEm = dataIso(o.modificadoEm);
    if (!pasta || !modificadoEm) throw new ErroBiblioteca(msg('bib_err_write_project'), 'io');
    return {
      pastaNova: o.pastaNova === true,
      projeto: {
        pasta,
        nome: texto(o.nome) ?? doc.nome,
        modificadoEm,
        miniatura: doc.miniatura,
        ...(typeof o.bytes === 'number' ? { bytes: o.bytes } : {}),
      },
    };
  }

  async gravarIndice(raiz: PastaId, textoIndice: string): Promise<void> {
    await this.invoke()('biblioteca_gravar_indice', { raiz, texto: textoIndice });
  }

  async esquecer(): Promise<void> {
    await this.invoke()('biblioteca_esquecer');
  }
}
