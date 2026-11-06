/**
 * `CenaV2`: uma cena do kernel v2 (decisão 0046 §4). O projeto no JavaScript é a fonte da verdade; a cena no
 * Rust é cache. Por isso cada cena guarda uma "fonte da cena" (função que reenvia tudo) e o gerenciador a usa
 * para reconstruir a cena depois de recriar a instância.
 *
 * - Falha leve: lança `ErroKernelLeve`; o despacho das fatias A e B a transforma em erro explícito (sem TypeScript no lugar) e o kernel segue ligado.
 * - Falha grave (código grave ou trap): o gerenciador recria a instância, reenvia a cena e a chamada é
 *   repetida uma vez. Só chega ao chamador como `ErroKernelGrave` se isso também falhar ou se desligou.
 */
import {
  bytesDaSecao,
  definicaoDaSecao,
  escreverSecao,
  lerSaida,
  type ArrayTipado,
  type ColunasDeEntrada,
  type NomeSecao,
} from './codec.ts';
import { ehCodigoLeve, ErroKernelGrave, ErroKernelLeve } from './erros.ts';
import { CODIGOS, CONSULTAS, LIMITES, TIPOS } from './esquema.gerado.ts';
import { mensagem, type GerenciadorKernelV2, type InstanciaAbi2, type ParticipanteDaInstancia } from './gerenciador.ts';

export type NomeConsulta = keyof typeof CONSULTAS;
export type SaidasDaConsulta = Record<string, ArrayTipado>;

/** Reenvia todas as seções da cena (lê o projeto atual). Usada na criação e depois de cada recriação. */
export type FonteDaCena = (cena: CenaV2) => void;

const decodificador = new TextDecoder('utf-8');

export class CenaV2 implements ParticipanteDaInstancia {
  /** Tempos da última chamada de envio/consulta (diagnóstico e harness): codificação+upload, execução, leitura. */
  medidas: { codificacaoMs: number; execucaoMs: number; leituraMs: number } = { codificacaoMs: 0, execucaoMs: 0, leituraMs: 0 };
  private handle = 0;
  private destruida = false;
  /** Dentro de `reenviar`: sem repetição própria, quem chamou (gerenciador) trata a falha. */
  private reenviando = false;
  private fonte: FonteDaCena | null;

  private constructor(
    private readonly ger: GerenciadorKernelV2,
    fonte: FonteDaCena | null,
  ) {
    this.fonte = fonte;
  }

  /** Cria a cena no Rust e envia o conteúdo inicial pela fonte (se houver). */
  static criar(ger: GerenciadorKernelV2, fonte: FonteDaCena | null = null): CenaV2 {
    const cena = new CenaV2(ger, fonte);
    try {
      cena.reenviar();
    } catch (e) {
      if (e instanceof ErroKernelLeve) throw e;
      if (e instanceof ErroKernelGrave && e.desligado) throw e;
      ger.recriar(mensagem(e)); // reenvia as outras cenas; esta ainda não está registrada
      cena.reenviar();
    }
    ger.registrar(cena);
    return cena;
  }

  /** Troca a fonte da cena (usada na próxima recriação). */
  definirFonte(fonte: FonteDaCena | null): void {
    this.fonte = fonte;
  }

  /** Recria o handle na instância corrente e reenvia tudo pela fonte. Sem repetição própria: quem chama trata. */
  reenviar(): void {
    const inst = this.ger.instancia();
    this.handle = 0;
    let h: number;
    try {
      h = inst.exports.cena_criar();
    } catch (e) {
      throw new ErroKernelGrave(null, mensagem(e));
    }
    if (h === 0) throw new ErroKernelGrave(CODIGOS.INTERNO, 'cena_criar devolveu 0');
    this.handle = h;
    this.reenviando = true;
    try {
      this.fonte?.(this);
    } finally {
      this.reenviando = false;
    }
  }

  definirSecao(nome: NomeSecao, colunas: ColunasDeEntrada, nLinhas: number): void {
    this.comRetry(() => this.enviarSecao('cena_definir_secao', nome, colunas, nLinhas));
  }

  upsert(nome: NomeSecao, colunas: ColunasDeEntrada, nLinhas: number): void {
    this.comRetry(() => this.enviarSecao('cena_upsert_linhas', nome, colunas, nLinhas));
  }

  remover(nome: NomeSecao, ids: ArrayLike<number>): void {
    this.comRetry(() => {
      const inst = this.ger.instancia();
      const def = definicaoDaSecao(nome);
      const n = ids.length;
      const bytes = n * TIPOS.u32.bytes;
      const ptr = n === 0 ? 0 : this.alocar(inst, bytes);
      try {
        if (n > 0) {
          const alvo = new Uint32Array(inst.memory.buffer, ptr, n);
          for (let i = 0; i < n; i++) alvo[i] = ids[i]!;
        }
        this.verificar(inst, inst.exports.cena_remover_linhas(this.handle, def.id, n, ptr));
      } finally {
        this.liberar(inst, ptr, bytes);
      }
    });
  }

  /** Executa uma consulta do esquema; devolve cópias das saídas, por nome. */
  consultar(nome: NomeConsulta, args: readonly number[]): SaidasDaConsulta {
    return this.comRetry(() => {
      const inst = this.ger.instancia();
      const def = CONSULTAS[nome];
      const nArgs: number = args.length;
      const esperados: number = def.args.length;
      const variaveis = 'argsVariaveis' in def && def.argsVariaveis === true;
      if (variaveis ? nArgs < esperados : nArgs !== esperados) {
        throw new ErroKernelLeve(CODIGOS.ENTRADA, `${nome} espera ${esperados} argumentos, recebeu ${nArgs}`);
      }
      const t0 = performance.now();
      const bytes = nArgs * TIPOS.f64.bytes;
      const ptr = nArgs === 0 ? 0 : this.alocar(inst, bytes);
      let t1 = t0;
      try {
        if (nArgs > 0) new Float64Array(inst.memory.buffer, ptr, nArgs).set(args);
        t1 = performance.now();
        this.verificar(inst, inst.exports.cena_executar(this.handle, def.id, nArgs, ptr));
      } finally {
        this.liberar(inst, ptr, bytes);
      }
      const t2 = performance.now();
      try {
        return this.lerSaidas(inst, nome);
      } finally {
        inst.exports.saida_liberar();
        this.medidas = { codificacaoMs: t1 - t0, execucaoMs: t2 - t1, leituraMs: performance.now() - t2 };
      }
    });
  }

  /** Bytes vivos no wasm (diagnóstico e teste de vazamento). */
  memoriaUsada(): number {
    return this.ger.instancia().exports.memoria_usada();
  }

  get ativa(): boolean {
    return !this.destruida;
  }

  /** Destrói a cena no Rust. Nunca lança (o estado do Rust é cache). */
  destruir(): void {
    if (this.destruida) return;
    this.destruida = true;
    this.ger.desregistrar(this);
    try {
      if (this.ger.ligado && this.handle !== 0) this.ger.instancia().exports.cena_destruir(this.handle);
    } catch {
      // Instância ruim: some junto com a recriação seguinte.
    }
    this.handle = 0;
  }

  private lerSaidas(inst: InstanciaAbi2, nome: NomeConsulta): SaidasDaConsulta {
    const def = CONSULTAS[nome];
    const e = inst.exports;
    const n = e.saida_n();
    if (n !== def.saidas.length) throw new ErroKernelGrave(CODIGOS.INTERNO, `${nome}: ${n} saídas, esperado ${def.saidas.length}`);
    const saida: SaidasDaConsulta = {};
    for (let i = 0; i < n; i++) {
      const s = def.saidas[i]!;
      const tipo = e.saida_tipo(i);
      if (tipo !== TIPOS[s.tipo].codigo) {
        throw new ErroKernelGrave(CODIGOS.INTERNO, `${nome}.${s.nome}: tipo ${tipo}, esperado ${TIPOS[s.tipo].codigo}`);
      }
      const len = e.saida_len(i);
      if (typeof s.elementos === 'number' && len !== s.elementos) {
        throw new ErroKernelGrave(CODIGOS.INTERNO, `${nome}.${s.nome}: ${len} elementos, esperado ${s.elementos}`);
      }
      if (s.elementos === '2n' && len % 2 !== 0) throw new ErroKernelGrave(CODIGOS.INTERNO, `${nome}.${s.nome}: tamanho ímpar (${len})`);
      const multiplo = typeof s.elementos === 'string' ? /^(\d+)n$/.exec(s.elementos) : null;
      if (multiplo && s.elementos !== '2n' && len % Number(multiplo[1]) !== 0) {
        throw new ErroKernelGrave(CODIGOS.INTERNO, `${nome}.${s.nome}: ${len} elementos, esperado múltiplo de ${multiplo[1]}`);
      }
      try {
        const ptr = e.saida_ptr(i); // chamar antes de ler `buffer`: a chamada pode crescer a memória
        saida[s.nome] = lerSaida(inst.memory.buffer, tipo, ptr, len);
      } catch (err) {
        throw new ErroKernelGrave(CODIGOS.INTERNO, `${nome}.${s.nome}: ${mensagem(err)}`);
      }
    }
    return saida;
  }

  private enviarSecao(fn: 'cena_definir_secao' | 'cena_upsert_linhas', nome: NomeSecao, colunas: ColunasDeEntrada, n: number): void {
    const inst = this.ger.instancia();
    const def = definicaoDaSecao(nome);
    const bytes = bytesDaSecao(def, n);
    if (n > LIMITES.linhas_por_secao) throw new ErroKernelLeve(CODIGOS.LIMITE, `${n} linhas em "${nome}"`);
    if (bytes > LIMITES.bytes_por_chamada) throw new ErroKernelLeve(CODIGOS.LIMITE, `${bytes} bytes em uma chamada`);
    const t0 = performance.now();
    const ptr = n === 0 ? 0 : this.alocar(inst, bytes);
    let t1 = t0;
    try {
      if (n > 0) {
        try {
          escreverSecao(inst.memory.buffer, ptr, def, colunas, n);
        } catch (e) {
          if (e instanceof RangeError) throw new ErroKernelLeve(CODIGOS.ENTRADA, e.message);
          throw e;
        }
      }
      t1 = performance.now();
      this.verificar(inst, inst.exports[fn](this.handle, def.id, n, ptr));
    } finally {
      this.liberar(inst, ptr, bytes);
      this.medidas = { codificacaoMs: t1 - t0, execucaoMs: performance.now() - t1, leituraMs: 0 };
    }
  }

  private alocar(inst: InstanciaAbi2, bytes: number): number {
    const ptr = inst.exports.abi2_alocar(bytes);
    if (ptr === 0) throw new ErroKernelLeve(CODIGOS.LIMITE, `abi2_alocar(${bytes}) falhou`);
    return ptr;
  }

  private liberar(inst: InstanciaAbi2, ptr: number, bytes: number): void {
    if (ptr === 0) return;
    try {
      inst.exports.abi2_liberar(ptr, bytes);
    } catch {
      // Se a instância já está quebrada, a recriação a descarta.
    }
  }

  /** Código ≠ 0: lê o texto do erro e lança leve ou grave. */
  private verificar(inst: InstanciaAbi2, codigo: number): void {
    if (codigo === CODIGOS.OK) return;
    let texto = '';
    try {
      const len = inst.exports.erro_len();
      const ptr = inst.exports.erro_ptr();
      if (len > 0) texto = decodificador.decode(new Uint8Array(inst.memory.buffer, ptr, len));
    } catch {
      // Diagnóstico opcional.
    }
    if (ehCodigoLeve(codigo)) throw new ErroKernelLeve(codigo, texto);
    throw new ErroKernelGrave(codigo, texto);
  }

  /** Executa `op`; em falha grave recria a instância (reenviando a cena) e repete uma vez. */
  private comRetry<T>(op: () => T): T {
    if (this.destruida) throw new ErroKernelLeve(CODIGOS.ENTRADA, 'cena já destruída');
    if (this.reenviando) return op();
    for (let tentativa = 0; ; tentativa++) {
      try {
        return op();
      } catch (e) {
        if (e instanceof ErroKernelLeve) throw e;
        if (e instanceof ErroKernelGrave && e.desligado) throw e;
        const grave = e instanceof ErroKernelGrave ? e : new ErroKernelGrave(null, mensagem(e));
        if (tentativa >= 1) throw grave;
        this.ger.recriar(grave.message);
      }
    }
  }
}
