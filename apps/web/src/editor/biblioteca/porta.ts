import type { DocumentoParaGravar, OrigemBiblioteca, PastaId, ProjetoDaBiblioteca, ProjetoGravado } from './tipos.ts';
import { PortaNavegador, navegadorTemBiblioteca } from './portaNavegador.ts';
import { PortaTauri, emDesktopComBiblioteca } from './portaTauri.ts';

/**
 * Porta para o sistema de arquivos da biblioteca: o navegador (File System Access API) e o app desktop (comandos Rust)
 * implementam a mesma interface, e o editor não sabe qual está por baixo.
 *
 * Tudo o que a porta faz é curto e "burro": listar, ler, gravar. As regras (nome da pasta, índice, ordenação) ficam em
 * `nomes.ts`/`indice.ts` e são testadas sem tocar em disco.
 */
export interface PortaBiblioteca {
  readonly origem: OrigemBiblioteca;

  /** Pede a pasta raiz ao usuário (precisa de gesto dele). `null` quando cancelou. */
  escolherRaiz(): Promise<PastaId | null>;

  /** Raiz lembrada da sessão/dispositivo anterior. `precisaPermissao` quando o sistema exige o gesto de novo. */
  raizLembrada(): Promise<{ raiz: PastaId; precisaPermissao: boolean } | null>;

  /** Libera a raiz lembrada com um gesto do usuário. `false` se ele recusou. */
  permitir(raiz: PastaId): Promise<boolean>;

  /** `biblioteca.json` como está no disco, ou `null` quando não existe. */
  lerIndice(raiz: PastaId): Promise<string | null>;

  /** Pastas de projeto na raiz, com a data do documento (a miniatura vem do índice). */
  listarPastas(raiz: PastaId): Promise<Array<{ pasta: string; modificadoEm: string }>>;

  /** Documento de um projeto (texto JSON). */
  ler(raiz: PastaId, pasta: string): Promise<string>;

  /** Grava o documento: guarda a versão anterior e escreve de forma atômica. */
  gravar(raiz: PastaId, doc: DocumentoParaGravar): Promise<ProjetoGravado>;

  /** Grava `biblioteca.json`. */
  gravarIndice(raiz: PastaId, texto: string): Promise<void>;

  /** Apaga a raiz lembrada (a pasta em si não é tocada). */
  esquecer(): Promise<void>;
}

/** Quais projetos da raiz existem, para a tela inicial. */
export type ListaDaRaiz = { pasta: string; modificadoEm: string }[];

/**
 * A porta do ambiente: o desktop quando o app roda na casca Tauri, senão o navegador (quando ele tem o seletor de
 * pastas). `null` = sem biblioteca: o editor segue salvando por download, como hoje.
 */
export function criarPorta(): PortaBiblioteca | null {
  if (emDesktopComBiblioteca()) return new PortaTauri();
  if (navegadorTemBiblioteca()) return new PortaNavegador();
  return null;
}

export type { ProjetoDaBiblioteca };
