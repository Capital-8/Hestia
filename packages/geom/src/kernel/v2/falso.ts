/**
 * Implementação FALSA do ABI v2 em TypeScript (decisão 0046 §3.1), sobre uma `WebAssembly.Memory` real com
 * alocador de bump. Serve para desenvolver e testar o lado TypeScript (codec, gerenciador, cena, harness) sem o
 * binário do Rust, e para injetar falhas (código INTERNO, trap, ENTRADA, versão errada, memória crescendo).
 *
 * As três consultas são a referência de força bruta de `referencia.ts`. Não é usada em produção.
 */
import { bytesDaSecao, codigoDoTipo, definicaoDaSecao, lerSecao, type NomeSecao } from './codec.ts';
import { ABI_VERSAO, CODIGOS, CONSULTAS, ESQUEMA_VERSAO, LIMITES, SECOES } from './esquema.gerado.ts';
import {
  referenciaEstatisticasNivel,
  referenciaParesProximos,
  referenciaParedesNaCaixa,
  type LinhaParede,
} from './referencia.ts';
import { GerenciadorKernelV2, type ExportsAbi2, type InstanciaAbi2 } from './gerenciador.ts';

const PAGINA = 65536;
const CHAVE_AUSENTE = 0xffffffff;

/** Efeito injetado: `'trap'` lança `WebAssembly.RuntimeError`; um número é devolvido como código de erro. */
export type EfeitoInjetado = 'trap' | number;

export interface FalhaInjetada {
  /** Nome da exportação (por exemplo `cena_executar`). */
  funcao: keyof ExportsAbi2;
  efeito: EfeitoInjetado;
  /** Quantas vezes dispara (padrão 1). */
  vezes?: number;
  /** Deixa passar as primeiras `apos` chamadas daquela função antes de começar a falhar. */
  apos?: number;
}

export interface OpcoesFalso {
  versaoAbi?: number;
  versaoEsquema?: number;
  /** Cresce a memória em uma página depois de toda chamada (destaca o `ArrayBuffer` anterior). */
  crescerAposCadaChamada?: boolean;
  /** Soma 1 ao primeiro valor u32 de cada saída (para provar que o harness detecta divergência). */
  corromperSaidas?: boolean;
}

export interface ControleDoFalso {
  injetar(falha: FalhaInjetada): void;
  chamadas(funcao: keyof ExportsAbi2): number;
  cenasVivas(): number;
}

export type InstanciaFalsa = InstanciaAbi2 & { controle: ControleDoFalso };

type Linha = Record<string, number>;
type Cena = Map<number, Map<number, Linha>>;

export function criarInstanciaFalsa(opcoes: OpcoesFalso = {}): InstanciaFalsa {
  const memory = new WebAssembly.Memory({ initial: 16 });
  let topo = PAGINA; // reserva a primeira página (ponteiro 0 = falha)
  const vivas = new Map<number, number>();
  const cenas = new Map<number, Cena>();
  let proximoHandle = 1;
  let saidas: { tipo: number; ptr: number; len: number; bytes: number }[] = [];
  let erroPtr = 0;
  let erroLen = 0;
  const falhas: (FalhaInjetada & { restantes: number; pular: number })[] = [];
  const contagem = new Map<string, number>();

  const alocar = (bytes: number): number => {
    if (bytes <= 0) return 0;
    const tam = (bytes + 7) & ~7;
    const fim = topo + tam;
    if (fim > memory.buffer.byteLength) memory.grow(Math.ceil((fim - memory.buffer.byteLength) / PAGINA));
    const ptr = topo;
    topo = fim;
    vivas.set(ptr, bytes);
    return ptr;
  };
  const liberar = (ptr: number): void => {
    vivas.delete(ptr);
  };
  const definirErro = (texto: string): void => {
    if (erroPtr) liberar(erroPtr);
    const bytes = new TextEncoder().encode(texto);
    erroPtr = alocar(bytes.length);
    erroLen = bytes.length;
    new Uint8Array(memory.buffer, erroPtr, bytes.length).set(bytes);
  };
  const falhar = (codigo: number, texto: string): number => {
    definirErro(texto);
    return codigo;
  };
  const tamanhoDasCenas = (): number => {
    let t = 0;
    for (const c of cenas.values()) for (const s of c.values()) t += s.size * 64;
    return t;
  };
  const liberarSaidas = (): void => {
    for (const s of saidas) liberar(s.ptr);
    saidas = [];
  };

  function aplicarSecao(h: number, secaoId: number, n: number, ptr: number, substituir: boolean): number {
    const cena = cenas.get(h);
    if (!cena) return falhar(CODIGOS.HANDLE, `handle ${h} inválido`);
    const nome = (Object.keys(SECOES) as NomeSecao[]).find((k) => SECOES[k].id === secaoId);
    if (!nome) return falhar(CODIGOS.ENTRADA, `seção ${secaoId} desconhecida`);
    const def = definicaoDaSecao(nome);
    if (n > LIMITES.linhas_por_secao || bytesDaSecao(def, n) > LIMITES.bytes_por_chamada) return falhar(CODIGOS.LIMITE, 'limite excedido');
    const cols = n === 0 ? {} : lerSecao(memory.buffer, ptr, def, n);
    const linhas: Linha[] = [];
    const chaves = new Set<number>();
    for (let i = 0; i < n; i++) {
      const l: Linha = {};
      for (const c of def.colunas) {
        const v = cols[c.nome]![i]!;
        if (c.tipo === 'f64' && !Number.isFinite(v)) return falhar(CODIGOS.ENTRADA, `${c.nome} não finito`);
        l[c.nome] = v;
      }
      const k = l[def.chave]!;
      if (k === CHAVE_AUSENTE) return falhar(CODIGOS.ENTRADA, 'chave ausente');
      if (chaves.has(k)) return falhar(CODIGOS.ENTRADA, `chave duplicada ${k}`);
      chaves.add(k);
      linhas.push(l);
    }
    let tabela = cena.get(secaoId);
    if (!tabela || substituir) {
      tabela = new Map();
      cena.set(secaoId, tabela);
    }
    for (const l of linhas) tabela.set(l[def.chave]!, l);
    return CODIGOS.OK;
  }

  function executar(h: number, consulta: number, nArgs: number, ptrArgs: number): number {
    liberarSaidas();
    const cena = cenas.get(h);
    if (!cena) return falhar(CODIGOS.HANDLE, `handle ${h} inválido`);
    const nome = (Object.keys(CONSULTAS) as (keyof typeof CONSULTAS)[]).find((k) => CONSULTAS[k].id === consulta);
    if (!nome) return falhar(CODIGOS.NAO_IMPLEMENTADO, `consulta ${consulta} desconhecida`);
    if (nArgs !== CONSULTAS[nome].args.length) return falhar(CODIGOS.ENTRADA, 'número de argumentos');
    const args = Array.from(new Float64Array(memory.buffer, ptrArgs, nArgs));
    if (args.some((a) => !Number.isFinite(a))) return falhar(CODIGOS.ENTRADA, 'argumento não finito');
    const paredes: LinhaParede[] = [...(cena.get(SECOES.paredes.id)?.values() ?? [])].map((l) => ({
      id: l.id_num!,
      nivel: l.nivel_num!,
      ax: l.ax!,
      ay: l.ay!,
      bx: l.bx!,
      by: l.by!,
      espessura: l.espessura!,
    }));
    const emitir = (tipo: 'u32' | 'f64', dados: ArrayLike<number>): void => {
      const bytes = dados.length * (tipo === 'f64' ? 8 : 4);
      const ptr = alocar(Math.max(bytes, 8));
      const alvo = tipo === 'f64' ? new Float64Array(memory.buffer, ptr, dados.length) : new Uint32Array(memory.buffer, ptr, dados.length);
      for (let i = 0; i < dados.length; i++) alvo[i] = dados[i]!;
      if (opcoes.corromperSaidas && tipo === 'u32' && dados.length > 0) alvo[0] = alvo[0]! + 1;
      saidas.push({ tipo: codigoDoTipo(tipo), ptr, len: dados.length, bytes });
    };
    if (nome === 'estatisticas_nivel') {
      const r = referenciaEstatisticasNivel(paredes, args[0]!);
      emitir('u32', [r.nParedes]);
      emitir('f64', r.caixa);
      emitir('f64', [r.comprimentoTotal]);
    } else if (nome === 'paredes_na_caixa') {
      emitir('u32', referenciaParedesNaCaixa(paredes, args[0]!, args[1]!, args[2]!, args[3]!, args[4]!));
    } else {
      emitir('u32', referenciaParesProximos(paredes, args[0]!, args[1]!));
    }
    return CODIGOS.OK;
  }

  const base: ExportsAbi2 = {
    abi2_versao: () => opcoes.versaoAbi ?? ABI_VERSAO,
    abi2_esquema_versao: () => opcoes.versaoEsquema ?? ESQUEMA_VERSAO,
    abi2_alocar: (bytes) => alocar(bytes),
    abi2_liberar: (ptr) => liberar(ptr),
    cena_criar: () => {
      const h = proximoHandle++;
      cenas.set(h, new Map());
      return h;
    },
    cena_destruir: (h) => (cenas.delete(h) ? CODIGOS.OK : falhar(CODIGOS.HANDLE, `handle ${h} inválido`)),
    cena_definir_secao: (h, s, n, p) => aplicarSecao(h, s, n, p, true),
    cena_upsert_linhas: (h, s, n, p) => aplicarSecao(h, s, n, p, false),
    cena_remover_linhas: (h, s, n, p) => {
      const cena = cenas.get(h);
      if (!cena) return falhar(CODIGOS.HANDLE, `handle ${h} inválido`);
      const tabela = cena.get(s);
      for (const id of n === 0 ? [] : new Uint32Array(memory.buffer, p, n).slice()) tabela?.delete(id);
      return CODIGOS.OK;
    },
    cena_executar: executar,
    saida_n: () => saidas.length,
    saida_tipo: (i) => saidas[i]?.tipo ?? 0,
    saida_ptr: (i) => saidas[i]?.ptr ?? 0,
    saida_len: (i) => saidas[i]?.len ?? 0,
    saida_liberar: liberarSaidas,
    erro_ptr: () => erroPtr,
    erro_len: () => erroLen,
    memoria_usada: () => {
      let t = tamanhoDasCenas();
      for (const b of vivas.values()) t += b;
      return t;
    },
  };

  const exports = {} as ExportsAbi2;
  for (const nome of Object.keys(base) as (keyof ExportsAbi2)[]) {
    const original = base[nome] as (...a: number[]) => number | void;
    (exports as unknown as Record<string, unknown>)[nome] = (...a: number[]) => {
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
      const f = falhas.find((x) => x.funcao === nome && x.restantes > 0);
      if (f) {
        if (f.pular > 0) f.pular--;
        else {
          f.restantes--;
          if (f.efeito === 'trap') throw new WebAssembly.RuntimeError('unreachable (falha injetada)');
          return falhar(f.efeito, `falha injetada em ${nome}`);
        }
      }
      const r = original(...a);
      if (opcoes.crescerAposCadaChamada) memory.grow(1);
      return r;
    };
  }

  const controle: ControleDoFalso = {
    injetar: (f) => falhas.push({ ...f, restantes: f.vezes ?? 1, pular: f.apos ?? 0 }),
    chamadas: (f) => contagem.get(f) ?? 0,
    cenasVivas: () => cenas.size,
  };
  return { exports, memory, controle };
}

/** Gerenciador sobre instâncias falsas; `instancias` lista cada instância criada (a última é a corrente). */
export function gerenciadorFalso(opcoes: {
  agora?: () => number;
  opcoesDaInstancia?: (indice: number) => OpcoesFalso;
  maxRecriacoes?: number;
  janelaMs?: number;
  /** Chamado para cada instância recém-criada (por exemplo, para injetar falhas na recriada). */
  aoCriar?: (instancia: InstanciaFalsa, indice: number) => void;
} = {}): { ger: GerenciadorKernelV2; instancias: InstanciaFalsa[] } {
  const instancias: InstanciaFalsa[] = [];
  const ger = GerenciadorKernelV2.criar({
    agora: opcoes.agora,
    maxRecriacoes: opcoes.maxRecriacoes,
    janelaMs: opcoes.janelaMs,
    criarInstancia: () => {
      const i = criarInstanciaFalsa(opcoes.opcoesDaInstancia?.(instancias.length));
      instancias.push(i);
      opcoes.aoCriar?.(i, instancias.length - 1);
      return i;
    },
  });
  return { ger, instancias };
}
