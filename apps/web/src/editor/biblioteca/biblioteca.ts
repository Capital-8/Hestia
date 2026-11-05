import { comProjeto, indiceVazio, lerIndice, mesclarDescobertos, semProjeto, serializarIndice } from './indice.ts';
import { nomeDePastaUnico, nomeDoProjeto } from './nomes.ts';
import { criarPorta, type PortaBiblioteca } from './porta.ts';
import type { IndiceBiblioteca, OrigemBiblioteca, PastaId, ProjetoDaBiblioteca, ProjetoGravado } from './tipos.ts';
import { VERSAO_INDICE } from './tipos.ts';
import { t, useI18n } from '../i18n.ts';

/**
 * Serviço da biblioteca: o que a tela inicial e o "Salvar" precisam saber, sem tocar em disco.
 *
 * A porta faz o I/O; aqui ficam as decisões — quando reler, quando reescrever o índice, o que acontece quando o índice
 * some, qual projeto fica ligado ao documento aberto. A classe recebe a porta por construtor, então os testes rodam com
 * uma porta de memória.
 */

export interface EstadoBiblioteca {
  origem: OrigemBiblioteca;
  /** Pasta raiz escolhida (ou `null` quando ainda não há biblioteca). */
  raiz: PastaId | null;
  /** O navegador pede um clique para liberar a escrita de novo. */
  precisaPermissao: boolean;
  projetos: ProjetoDaBiblioteca[];
}

/** Documento que o editor manda gravar (o JSON do projeto + a miniatura para o índice). */
export interface DocumentoDoEditor {
  /** Pasta do projeto; `null` cria uma nova a partir de `nome`. */
  pasta: string | null;
  nome: string;
  conteudo: string;
  miniatura: string | null;
}

export class Biblioteca {
  private raiz: PastaId | null = null;
  private precisaPermissao = false;
  private projetos: ProjetoDaBiblioteca[] = [];

  constructor(readonly porta: PortaBiblioteca) {}

  get estado(): EstadoBiblioteca {
    return { origem: this.porta.origem, raiz: this.raiz, precisaPermissao: this.precisaPermissao, projetos: this.projetos };
  }

  /** Há uma pasta escolhida e liberada? */
  get pronta(): boolean {
    return this.raiz !== null && !this.precisaPermissao;
  }

  /** Abre a biblioteca lembrada, sem gesto do usuário (a escrita pode ficar pendente de permissão). */
  async abrir(): Promise<EstadoBiblioteca> {
    const lembrada = await this.porta.raizLembrada();
    if (!lembrada) return this.estado;
    this.raiz = lembrada.raiz;
    this.precisaPermissao = lembrada.precisaPermissao;
    if (!this.precisaPermissao) await this.carregar();
    return this.estado;
  }

  /** Usuário escolheu a pasta raiz agora. */
  async escolher(): Promise<EstadoBiblioteca> {
    const raiz = await this.porta.escolherRaiz();
    if (!raiz) return this.estado;
    this.raiz = raiz;
    this.precisaPermissao = false;
    await this.carregar();
    return this.estado;
  }

  /** Libera a permissão pendente (precisa ser chamado dentro de um clique). */
  async liberar(): Promise<EstadoBiblioteca> {
    if (!this.raiz) return this.estado;
    const ok = await this.porta.permitir(this.raiz);
    this.precisaPermissao = !ok;
    if (ok) await this.carregar();
    return this.estado;
  }

  /** Relê a pasta (por exemplo, ao voltar para a tela inicial). */
  async atualizar(): Promise<EstadoBiblioteca> {
    if (this.pronta) await this.carregar();
    return this.estado;
  }

  /** Texto do documento de um projeto e a entrada da biblioteca dele. */
  async abrirProjeto(pasta: string): Promise<{ texto: string; projeto: ProjetoDaBiblioteca | null }> {
    const raiz = this.raizNecessaria();
    const texto = await this.porta.ler(raiz, pasta);
    return { texto, projeto: this.projetos.find((p) => p.pasta === pasta) ?? null };
  }

  /**
   * Grava o documento e atualiza a biblioteca. A pasta é criada quando `pasta` é `null` (nunca sobrescreve outro
   * projeto por causa de nome repetido: a porta resolve com `(2)`, `(3)`…). O índice é cache: falhar nele não falha o
   * salvamento.
   */
  async salvar(doc: DocumentoDoEditor): Promise<ProjetoGravado> {
    const raiz = this.raizNecessaria();
    // O nome da pasta é decidido aqui (uma vez, em TS): a porta só cria/grava com o nome que receber.
    const pasta = doc.pasta ?? nomeDePastaUnico(doc.nome, this.projetos.map((p) => p.pasta));
    const gravado = await this.porta.gravar(raiz, { pasta, nome: doc.nome, conteudo: doc.conteudo, miniatura: doc.miniatura });
    this.projetos = comProjeto(this.indice(), gravado.projeto).projetos;
    await this.gravarIndice();
    return gravado;
  }

  /** Esquece a pasta escolhida (a pasta e os projetos continuam no disco). */
  async esquecer(): Promise<EstadoBiblioteca> {
    await this.porta.esquecer();
    this.raiz = null;
    this.precisaPermissao = false;
    this.projetos = [];
    return this.estado;
  }

  /** Tira um projeto da lista (pasta apagada fora do app). */
  async removerDaLista(pasta: string): Promise<EstadoBiblioteca> {
    this.projetos = semProjeto(this.indice(), pasta).projetos;
    await this.gravarIndice();
    return this.estado;
  }

  /** Lê o índice e a varredura das pastas; reescreve o índice quando o disco está atrasado ou ausente. */
  private async carregar(): Promise<void> {
    const raiz = this.raizNecessaria();
    let textoIndice: string | null = null;
    try {
      textoIndice = await this.porta.lerIndice(raiz);
    } catch {
      // Índice ilegível não impede abrir a biblioteca: vale a varredura das pastas.
    }
    const guardado = textoIndice ? lerIndice(textoIndice, raiz) : indiceVazio(raiz);
    const pastas = await this.porta.listarPastas(raiz);
    const descobertos: ProjetoDaBiblioteca[] = pastas.map((p) => ({
      pasta: p.pasta,
      nome: nomeDoProjeto(p.pasta),
      modificadoEm: p.modificadoEm,
      miniatura: null,
    }));
    this.projetos = mesclarDescobertos(guardado, descobertos).projetos;
    const novo = serializarIndice(this.indice());
    if (novo !== textoIndice) {
      try {
        await this.porta.gravarIndice(raiz, novo);
      } catch {
        // Sem o índice a tela inicial ainda funciona (só fica mais lenta na próxima abertura).
      }
    }
  }

  private async gravarIndice(): Promise<void> {
    if (!this.raiz) return;
    try {
      await this.porta.gravarIndice(this.raiz, serializarIndice(this.indice()));
    } catch {
      // Idem: o índice é cache.
    }
  }

  private indice(): IndiceBiblioteca {
    return { versao: VERSAO_INDICE, raiz: this.raiz ?? '', projetos: this.projetos };
  }

  private raizNecessaria(): PastaId {
    if (!this.raiz) throw new Error(t(useI18n.getState().lang, 'bib_err_no_folder'));
    return this.raiz;
  }
}

let instancia: Biblioteca | null | undefined;

/** Biblioteca do ambiente (criada na primeira chamada). `null` = este ambiente não tem pastas: salvar por download. */
export function bibliotecaDoAmbiente(): Biblioteca | null {
  if (instancia === undefined) {
    const porta = criarPorta();
    instancia = porta ? new Biblioteca(porta) : null;
  }
  return instancia;
}
