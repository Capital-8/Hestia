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
  /** Outros locais (fora da raiz), por id. */
  readonly externas = new Map<PastaId, Map<string, { conteudo: string; modificadoEm: string }>>();
  /** Quando preenchido, `renomear` falha com esta mensagem (pasta aberta em outro programa). */
  falhaRenomear: string | null = null;
  destinoEscolhido: PastaId | null = '/Outro';
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

  private deRaiz(raiz: PastaId): Map<string, { conteudo: string; modificadoEm: string }> {
    if (raiz === '/Hestia') return this.pastas;
    let m = this.externas.get(raiz);
    if (!m) this.externas.set(raiz, (m = new Map()));
    return m;
  }

  async renomear(raiz: PastaId, de: string, para: string): Promise<void> {
    const pastas = this.deRaiz(raiz);
    if (this.falhaRenomear) throw new Error(this.falhaRenomear);
    if (pastas.has(para)) throw new Error('destino existe');
    const v = pastas.get(de);
    if (!v) throw new Error('origem não existe');
    pastas.delete(de);
    pastas.set(para, v);
  }

  async escolherDestino(): Promise<PastaId | null> {
    return this.destinoEscolhido;
  }

  async listarPastas(raiz: PastaId): Promise<Array<{ pasta: string; modificadoEm: string }>> {
    return [...this.deRaiz(raiz)].map(([pasta, v]) => ({ pasta, modificadoEm: v.modificadoEm }));
  }

  async ler(raiz: PastaId, pasta: string): Promise<string> {
    const arquivo = this.deRaiz(raiz).get(pasta);
    if (!arquivo) throw new Error('não existe');
    return arquivo.conteudo;
  }

  async gravar(raiz: PastaId, doc: DocumentoParaGravar): Promise<ProjetoGravado> {
    const pastas = this.deRaiz(raiz);
    const pastaNova = !pastas.has(doc.pasta);
    const modificadoEm = this.agora();
    pastas.set(doc.pasta, { conteudo: doc.conteudo, modificadoEm });
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
  describe('pasta acompanha o nome do projeto', () => {
    const doc = (pasta: string | null, nome: string, conteudo = '{}') => ({ pasta, nome, conteudo, miniatura: MINI });

    async function aberta(): Promise<{ porta: PortaMemoria; biblioteca: Biblioteca }> {
      const porta = new PortaMemoria();
      const biblioteca = new Biblioteca(porta);
      await biblioteca.escolher();
      return { porta, biblioteca };
    }

    it('renomeia a pasta quando o nome muda e atualiza o índice (sem duplicar a antiga)', async () => {
      const { porta, biblioteca } = await aberta();
      const primeiro = await biblioteca.salvar(doc(null, 'Projeto sem título'));
      expect(primeiro.projeto.pasta).toBe('Projeto sem título');
      const r = await biblioteca.salvar(doc(primeiro.projeto.pasta, 'teste', '{"v":2}'));
      expect(r.renomeadoDe).toBe('Projeto sem título');
      expect(r.projeto.pasta).toBe('teste');
      expect([...porta.pastas.keys()]).toEqual(['teste']);
      expect(porta.pastas.get('teste')?.conteudo).toBe('{"v":2}');
      expect(biblioteca.estado.projetos.map((p) => [p.pasta, p.nome])).toEqual([['teste', 'teste']]);
      expect(lerIndice(porta.indiceTexto ?? '', '/Hestia').projetos.map((p) => p.pasta)).toEqual(['teste']);
    });

    it('não renomeia quando a pasta já corresponde ao nome (inclusive com sufixo de duplicata)', async () => {
      const { porta, biblioteca } = await aberta();
      await biblioteca.salvar(doc(null, 'Casa'));
      const segunda = await biblioteca.salvar(doc(null, 'Casa'));
      expect(segunda.projeto.pasta).toBe('Casa (2)');
      const r = await biblioteca.salvar(doc('Casa (2)', 'Casa'));
      expect(r.renomeadoDe).toBeUndefined();
      expect(r.projeto.pasta).toBe('Casa (2)');
      expect([...porta.pastas.keys()].sort()).toEqual(['Casa', 'Casa (2)']);
    });

    it('colisão: o nome novo já é de outro projeto, então recebe (2)', async () => {
      const { porta, biblioteca } = await aberta();
      await biblioteca.salvar(doc(null, 'teste'));
      const outro = await biblioteca.salvar(doc(null, 'rascunho'));
      const r = await biblioteca.salvar(doc(outro.projeto.pasta, 'teste'));
      expect(r.projeto.pasta).toBe('teste (2)');
      expect([...porta.pastas.keys()].sort()).toEqual(['teste', 'teste (2)']);
    });

    it('nome com caracteres inválidos vira nome de pasta seguro', async () => {
      const { biblioteca } = await aberta();
      const a = await biblioteca.salvar(doc(null, 'x'));
      const r = await biblioteca.salvar(doc(a.projeto.pasta, 'Casa: 2/3?'));
      expect(r.projeto.pasta).toBe('Casa 2 3');
    });

    it('falha ao renomear: o projeto foi gravado na pasta antiga, que continua no índice', async () => {
      const { porta, biblioteca } = await aberta();
      const a = await biblioteca.salvar(doc(null, 'Projeto sem título'));
      porta.falhaRenomear = 'EBUSY';
      const r = await biblioteca.salvar(doc(a.projeto.pasta, 'teste', '{"v":3}'));
      expect(r.renomearFalhou).toBe(true);
      expect(r.projeto.pasta).toBe('Projeto sem título');
      expect(porta.pastas.get('Projeto sem título')?.conteudo).toBe('{"v":3}');
      expect(biblioteca.estado.projetos.map((p) => p.pasta)).toEqual(['Projeto sem título']);
      // Liberada a pasta, o salvamento seguinte renomeia.
      porta.falhaRenomear = null;
      const r2 = await biblioteca.salvar(doc(r.projeto.pasta, 'teste', '{"v":4}'));
      expect(r2.projeto.pasta).toBe('teste');
      expect([...porta.pastas.keys()]).toEqual(['teste']);
    });
  });

  describe('salvar em outro local', () => {
    const doc = (pasta: string | null, nome: string, conteudo = '{}') => ({ pasta, nome, conteudo, miniatura: MINI });

    it('grava no local escolhido sem tocar a raiz nem o índice, e as próximas gravações ficam lá', async () => {
      const porta = new PortaMemoria();
      const biblioteca = new Biblioteca(porta);
      await biblioteca.escolher();
      const naRaiz = await biblioteca.salvar(doc(null, 'Casa', '{"v":1}'));
      const fora = await biblioteca.salvarEm('/Outro', doc(null, 'Casa', '{"v":2}'));
      expect(fora.projeto.pasta).toBe('Casa');
      expect(porta.externas.get('/Outro')?.get('Casa')?.conteudo).toBe('{"v":2}');
      // A cópia da raiz não mudou e o índice continua com uma única entrada.
      expect(porta.pastas.get(naRaiz.projeto.pasta)?.conteudo).toBe('{"v":1}');
      expect(biblioteca.estado.projetos.map((p) => p.pasta)).toEqual(['Casa']);
      // Regravar (e renomear) no local novo.
      const deNovo = await biblioteca.salvarEm('/Outro', doc(fora.projeto.pasta, 'Sobrado', '{"v":3}'));
      expect(deNovo.projeto.pasta).toBe('Sobrado');
      expect([...(porta.externas.get('/Outro')?.keys() ?? [])]).toEqual(['Sobrado']);
      expect(porta.pastas.get('Casa')?.conteudo).toBe('{"v":1}');
      expect(biblioteca.estado.projetos.map((p) => p.pasta)).toEqual(['Casa']);
    });

    it('nome repetido no local novo ganha (2) em vez de sobrescrever', async () => {
      const porta = new PortaMemoria();
      const biblioteca = new Biblioteca(porta);
      await biblioteca.escolher();
      await biblioteca.salvarEm('/Outro', doc(null, 'Casa'));
      const r = await biblioteca.salvarEm('/Outro', doc(null, 'Casa'));
      expect(r.projeto.pasta).toBe('Casa (2)');
    });

    it('escolher a própria raiz equivale a salvar na biblioteca (indexa)', async () => {
      const porta = new PortaMemoria();
      const biblioteca = new Biblioteca(porta);
      await biblioteca.escolher();
      await biblioteca.salvarEm('/Hestia', doc(null, 'Casa'));
      expect(biblioteca.estado.projetos.map((p) => p.pasta)).toEqual(['Casa']);
      expect(porta.externas.size).toBe(0);
    });
  });

});
