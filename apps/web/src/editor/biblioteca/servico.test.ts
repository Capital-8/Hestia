import { describe, expect, it } from 'vitest';
import { Biblioteca } from './biblioteca.ts';
import { lerIndice } from './indice.ts';
import type { DocumentoParaGravar, PastaId, ProjetoGravado } from './tipos.ts';
import type { PortaBiblioteca } from './porta.ts';

/**
 * Serviço da biblioteca com uma porta de memória: cobre a conversa entre tela inicial, "Salvar" e a pasta sem depender
 * de disco, de navegador ou do Tauri.
 */
class PortaMemoria implements PortaBiblioteca {
  readonly origem = 'navegador' as const;
  readonly pastas = new Map<string, { conteudo: string; modificadoEm: string }>();
  indiceTexto: string | null = null;
  raiz: PastaId | null = null;
  precisaPermissao = false;
  private relogio = Date.UTC(2026, 10, 5, 12, 0, 0);

  private agora(): string {
    this.relogio += 1000;
    return new Date(this.relogio).toISOString();
  }

  async escolherRaiz(): Promise<PastaId | null> {
    this.raiz = '/Hestia';
    return this.raiz;
  }

  async raizLembrada(): Promise<{ raiz: PastaId; precisaPermissao: boolean } | null> {
    return this.raiz ? { raiz: this.raiz, precisaPermissao: this.precisaPermissao } : null;
  }

  async permitir(): Promise<boolean> {
    this.precisaPermissao = false;
    return true;
  }

  async lerIndice(): Promise<string | null> {
    return this.indiceTexto;
  }

  async listarPastas(): Promise<Array<{ pasta: string; modificadoEm: string }>> {
    return [...this.pastas].map(([pasta, v]) => ({ pasta, modificadoEm: v.modificadoEm }));
  }

  async ler(_raiz: PastaId, pasta: string): Promise<string> {
    const arquivo = this.pastas.get(pasta);
    if (!arquivo) throw new Error('não existe');
    return arquivo.conteudo;
  }

  async gravar(_raiz: PastaId, doc: DocumentoParaGravar): Promise<ProjetoGravado> {
    const pastaNova = !this.pastas.has(doc.pasta);
    const modificadoEm = this.agora();
    this.pastas.set(doc.pasta, { conteudo: doc.conteudo, modificadoEm });
    return { pastaNova, projeto: { pasta: doc.pasta, nome: doc.nome, modificadoEm, miniatura: doc.miniatura, bytes: doc.conteudo.length } };
  }

  async gravarIndice(_raiz: PastaId, texto: string): Promise<void> {
    this.indiceTexto = texto;
  }

  async esquecer(): Promise<void> {
    this.raiz = null;
  }

  /** Simula uma pasta apagada fora do app. */
  apagarPasta(pasta: string): void {
    this.pastas.delete(pasta);
  }
}

const MINI = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('serviço da biblioteca', () => {
  it('sem pasta escolhida não há projeto nenhum e nada quebra', async () => {
    const biblioteca = new Biblioteca(new PortaMemoria());
    const estado = await biblioteca.abrir();
    expect(estado.raiz).toBeNull();
    expect(estado.projetos).toEqual([]);
    expect(biblioteca.pronta).toBe(false);
  });

  it('escolher a pasta cria a biblioteca vazia e já grava o índice', async () => {
    const porta = new PortaMemoria();
    const estado = await new Biblioteca(porta).escolher();
    expect(estado.raiz).toBe('/Hestia');
    expect(estado.projetos).toEqual([]);
    expect(JSON.parse(porta.indiceTexto!).projetos).toEqual([]);
  });

  it('salvar um projeto novo cria a pasta com nome seguro e entra no índice', async () => {
    const porta = new PortaMemoria();
    const biblioteca = new Biblioteca(porta);
    await biblioteca.escolher();
    const gravado = await biblioteca.salvar({ pasta: null, nome: 'Casa: 2 quartos', conteudo: '{"a":1}', miniatura: MINI });

    expect(gravado.pastaNova).toBe(true);
    expect(gravado.projeto.pasta).toBe('Casa 2 quartos');
    expect(porta.pastas.get('Casa 2 quartos')!.conteudo).toBe('{"a":1}');
    const indice = lerIndice(porta.indiceTexto!, '/Hestia');
    expect(indice.projetos.map((p) => p.pasta)).toEqual(['Casa 2 quartos']);
    expect(indice.projetos[0]!.miniatura).toBe(MINI);
  });

  it('nome repetido ganha sufixo em vez de sobrescrever o outro projeto', async () => {
    const porta = new PortaMemoria();
    const biblioteca = new Biblioteca(porta);
    await biblioteca.escolher();
    await biblioteca.salvar({ pasta: null, nome: 'Casa', conteudo: '{}', miniatura: null });
    const segundo = await biblioteca.salvar({ pasta: null, nome: 'Casa', conteudo: '{}', miniatura: null });
    expect(segundo.projeto.pasta).toBe('Casa (2)');
    expect(porta.pastas.size).toBe(2);
  });

  it('salvar de novo no mesmo projeto atualiza o arquivo, sem criar pasta nova', async () => {
    const porta = new PortaMemoria();
    const biblioteca = new Biblioteca(porta);
    await biblioteca.escolher();
    await biblioteca.salvar({ pasta: null, nome: 'Casa', conteudo: '{"v":1}', miniatura: null });
    const segundo = await biblioteca.salvar({ pasta: 'Casa', nome: 'Casa', conteudo: '{"v":2}', miniatura: MINI });

    expect(segundo.pastaNova).toBe(false);
    expect(porta.pastas.get('Casa')!.conteudo).toBe('{"v":2}');
    expect(biblioteca.estado.projetos).toHaveLength(1);
    expect(biblioteca.estado.projetos[0]!.miniatura).toBe(MINI);
  });

  it('abrir um projeto devolve o texto e a entrada da biblioteca', async () => {
    const porta = new PortaMemoria();
    const biblioteca = new Biblioteca(porta);
    await biblioteca.escolher();
    await biblioteca.salvar({ pasta: null, nome: 'Casa', conteudo: '{"v":7}', miniatura: null });
    const { texto, projeto } = await biblioteca.abrirProjeto('Casa');
    expect(texto).toBe('{"v":7}');
    expect(projeto?.nome).toBe('Casa');
  });

  it('índice ausente ou corrompido é reconstruído pela varredura das pastas', async () => {
    const porta = new PortaMemoria();
    const biblioteca = new Biblioteca(porta);
    await biblioteca.escolher();
    await biblioteca.salvar({ pasta: null, nome: 'Casa', conteudo: '{}', miniatura: MINI });

    porta.indiceTexto = '{{{';
    const outra = new Biblioteca(porta);
    const estado = await outra.abrir();
    expect(estado.projetos.map((p) => p.pasta)).toEqual(['Casa']);
    // Reconstruído: o índice válido volta ao disco.
    expect(lerIndice(porta.indiceTexto!, '/Hestia').projetos.map((p) => p.pasta)).toEqual(['Casa']);
  });

  it('pasta apagada fora do app sai da lista na releitura', async () => {
    const porta = new PortaMemoria();
    const biblioteca = new Biblioteca(porta);
    await biblioteca.escolher();
    await biblioteca.salvar({ pasta: null, nome: 'Casa', conteudo: '{}', miniatura: null });
    await biblioteca.salvar({ pasta: null, nome: 'Obra', conteudo: '{}', miniatura: null });

    porta.apagarPasta('Obra');
    const estado = await biblioteca.atualizar();
    expect(estado.projetos.map((p) => p.pasta)).toEqual(['Casa']);
  });

  it('esquecer a pasta não apaga nada e volta ao estado vazio', async () => {
    const porta = new PortaMemoria();
    const biblioteca = new Biblioteca(porta);
    await biblioteca.escolher();
    await biblioteca.salvar({ pasta: null, nome: 'Casa', conteudo: '{}', miniatura: null });
    const estado = await biblioteca.esquecer();
    expect(estado.raiz).toBeNull();
    expect(estado.projetos).toEqual([]);
    expect(porta.pastas.size).toBe(1);
  });

  it('permissão pendente mantém a lista vazia até o usuário liberar', async () => {
    const porta = new PortaMemoria();
    const primeira = new Biblioteca(porta);
    await primeira.escolher();
    await primeira.salvar({ pasta: null, nome: 'Casa', conteudo: '{}', miniatura: null });

    porta.precisaPermissao = true;
    const segunda = new Biblioteca(porta);
    expect((await segunda.abrir()).precisaPermissao).toBe(true);
    expect(segunda.estado.projetos).toEqual([]);
    const liberado = await segunda.liberar();
    expect(liberado.precisaPermissao).toBe(false);
    expect(liberado.projetos.map((p) => p.pasta)).toEqual(['Casa']);
  });
});
