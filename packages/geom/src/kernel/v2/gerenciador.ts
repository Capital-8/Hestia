/**
 * Gerenciador de instância do kernel v2 (decisão 0046 §2.3 e §4).
 *
 * Compila o módulo uma vez, instancia, valida `abi2_versao` e `abi2_esquema_versao` e aplica a política de
 * recriação: o estado do Rust é cache, então uma instância ruim é descartada e a cena é reenviada pela "fonte
 * da cena" de cada `CenaV2`. No máximo `maxRecriacoes` (3) recriações em `janelaMs` (5 min); excedido, o kernel
 * desliga na sessão com o motivo visível. O relógio é injetável para teste.
 */
import { ErroKernelGrave } from './erros.ts';
import { ABI_VERSAO, CODIGOS, ESQUEMA_VERSAO } from './esquema.gerado.ts';

/** Exportações do ABI v2 (decisão 0046 §3.1). */
export interface ExportsAbi2 {
  abi2_versao(): number;
  abi2_esquema_versao(): number;
  abi2_alocar(bytes: number): number;
  abi2_liberar(ptr: number, bytes: number): void;
  cena_criar(): number;
  cena_destruir(h: number): number;
  cena_definir_secao(h: number, secao: number, nLinhas: number, ptr: number): number;
  cena_upsert_linhas(h: number, secao: number, nLinhas: number, ptr: number): number;
  cena_remover_linhas(h: number, secao: number, nIds: number, ptrIds: number): number;
  cena_executar(h: number, consulta: number, nArgs: number, ptrArgs: number): number;
  saida_n(): number;
  saida_tipo(i: number): number;
  saida_ptr(i: number): number;
  saida_len(i: number): number;
  saida_liberar(): void;
  erro_ptr(): number;
  erro_len(): number;
  memoria_usada(): number;
}

export interface InstanciaAbi2 {
  readonly exports: ExportsAbi2;
  readonly memory: WebAssembly.Memory;
}

/** Quem precisa ser refeito quando a instância é recriada (as cenas). */
export interface ParticipanteDaInstancia {
  /** Recria o handle na instância atual e reenvia todas as seções pela fonte da cena. Pode lançar. */
  reenviar(): void;
}

export interface EstadoGerenciador {
  ligado: boolean;
  motivoDesligado: string | null;
  /** Recriações feitas na sessão (não zera com a janela). */
  recriacoesTotal: number;
  /** Recriações dentro da janela corrente (as que contam para o limite). */
  recriacoesNaJanela: number;
  ultimoMotivoRecriacao: string | null;
  versaoAbi: number | null;
  versaoEsquema: number | null;
}

export interface OpcoesGerenciador {
  /** Cria uma instância nova (síncrono: o módulo já está compilado). */
  criarInstancia: () => InstanciaAbi2;
  /** Relógio em ms. Padrão: `Date.now`. */
  agora?: () => number;
  maxRecriacoes?: number;
  janelaMs?: number;
}

export const MAX_RECRIACOES = 3;
export const JANELA_RECRIACAO_MS = 5 * 60 * 1000;

export const mensagem = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').trim();

/** Confere as versões de uma instância recém-criada; lança `ErroKernelGrave(VERSAO)` se não bater. */
export function validarInstancia(inst: InstanciaAbi2): { versaoAbi: number; versaoEsquema: number } {
  let versaoAbi: number;
  let versaoEsquema: number;
  try {
    versaoAbi = inst.exports.abi2_versao();
    versaoEsquema = inst.exports.abi2_esquema_versao();
  } catch (e) {
    throw new ErroKernelGrave(CODIGOS.VERSAO, `exportações do ABI v2 ausentes ou com falha (${mensagem(e)})`);
  }
  if (versaoAbi !== ABI_VERSAO) throw new ErroKernelGrave(CODIGOS.VERSAO, `abi2_versao=${versaoAbi}, esperado ${ABI_VERSAO}`);
  if (versaoEsquema !== ESQUEMA_VERSAO) {
    throw new ErroKernelGrave(CODIGOS.VERSAO, `abi2_esquema_versao=${versaoEsquema}, esperado ${ESQUEMA_VERSAO}`);
  }
  return { versaoAbi, versaoEsquema };
}

/** Compila os bytes uma vez e devolve um criador síncrono de instâncias. */
export async function criarInstanciadorDoWasm(bytes: ArrayBuffer | Uint8Array | WebAssembly.Module): Promise<() => InstanciaAbi2> {
  const modulo = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes as BufferSource);
  return () => {
    const instancia = new WebAssembly.Instance(modulo, {});
    const memory = instancia.exports.memory;
    if (!(memory instanceof WebAssembly.Memory)) throw new ErroKernelGrave(CODIGOS.VERSAO, 'o módulo não exporta "memory"');
    return { exports: instancia.exports as unknown as ExportsAbi2, memory };
  };
}

export class GerenciadorKernelV2 {
  private atual: InstanciaAbi2;
  private readonly participantes = new Set<ParticipanteDaInstancia>();
  private readonly recriacoes: number[] = [];
  private readonly agora: () => number;
  private readonly maxRecriacoes: number;
  private readonly janelaMs: number;
  private readonly criarNova: () => InstanciaAbi2;
  private total = 0;
  private motivoDesligado: string | null = null;
  private ultimoMotivo: string | null = null;
  private versoes: { versaoAbi: number; versaoEsquema: number };

  private constructor(opcoes: OpcoesGerenciador) {
    this.criarNova = opcoes.criarInstancia;
    this.agora = opcoes.agora ?? (() => Date.now());
    this.maxRecriacoes = opcoes.maxRecriacoes ?? MAX_RECRIACOES;
    this.janelaMs = opcoes.janelaMs ?? JANELA_RECRIACAO_MS;
    this.atual = this.criarNova();
    this.versoes = validarInstancia(this.atual);
  }

  /** Cria o gerenciador e a primeira instância. Versão errada: `ErroKernelGrave(VERSAO)`. */
  static criar(opcoes: OpcoesGerenciador): GerenciadorKernelV2 {
    return new GerenciadorKernelV2(opcoes);
  }

  /** Atalho: compila os bytes uma vez e cria o gerenciador. */
  static async dosBytes(
    bytes: ArrayBuffer | Uint8Array | WebAssembly.Module,
    opcoes: Omit<OpcoesGerenciador, 'criarInstancia'> = {},
  ): Promise<GerenciadorKernelV2> {
    return new GerenciadorKernelV2({ ...opcoes, criarInstancia: await criarInstanciadorDoWasm(bytes) });
  }

  get ligado(): boolean {
    return this.motivoDesligado === null;
  }

  /** Instância corrente. Lança `ErroKernelGrave` (desligado) se o kernel foi desligado. */
  instancia(): InstanciaAbi2 {
    if (this.motivoDesligado !== null) throw new ErroKernelGrave(null, `desligado: ${this.motivoDesligado}`, true);
    return this.atual;
  }

  registrar(p: ParticipanteDaInstancia): void {
    this.participantes.add(p);
  }

  desregistrar(p: ParticipanteDaInstancia): void {
    this.participantes.delete(p);
  }

  desligar(motivo: string): void {
    if (this.motivoDesligado === null) this.motivoDesligado = motivo;
  }

  estado(): EstadoGerenciador {
    this.podarJanela();
    return {
      ligado: this.ligado,
      motivoDesligado: this.motivoDesligado,
      recriacoesTotal: this.total,
      recriacoesNaJanela: this.recriacoes.length,
      ultimoMotivoRecriacao: this.ultimoMotivo,
      versaoAbi: this.versoes.versaoAbi,
      versaoEsquema: this.versoes.versaoEsquema,
    };
  }

  private podarJanela(): void {
    const limite = this.agora() - this.janelaMs;
    while (this.recriacoes.length > 0 && this.recriacoes[0]! <= limite) this.recriacoes.shift();
  }

  /**
   * Descarta a instância, cria outra e reenvia a cena de cada participante. Uma falha durante o reenvio conta
   * como nova recriação. Ao exceder o limite, desliga e lança `ErroKernelGrave` com `desligado = true`.
   */
  recriar(motivo: string): void {
    let razao = motivo;
    for (;;) {
      this.instancia(); // lança se já desligado
      this.podarJanela();
      if (this.recriacoes.length >= this.maxRecriacoes) {
        const msg = `${this.maxRecriacoes} recriações em ${Math.round(this.janelaMs / 60000)} min excedidas; último motivo: ${razao}`;
        this.desligar(msg);
        throw new ErroKernelGrave(null, msg, true);
      }
      this.recriacoes.push(this.agora());
      this.total++;
      this.ultimoMotivo = razao;
      try {
        this.atual = this.criarNova();
        this.versoes = validarInstancia(this.atual);
        for (const p of [...this.participantes]) p.reenviar();
        return;
      } catch (e) {
        razao = `falha ao recriar: ${mensagem(e)}`;
      }
    }
  }
}
