/**
 * Despacho das fatias A e B do kernel Rust e modo sombra (decisão 0047 §12, passo A4; fatia B: decisão 0050, passo B5).
 *
 * Fatia B: `resolveFloors` e `resolveSlabs` (chamadas padrão, sem opções) consultam `pisos_lajes_com_paredes`; o resultado volta nos mesmos tipos do
 * TypeScript (`kernelDespachoB.ts`). `levelCutterSet`, as chamadas com `layers: false` e `junctionLevel` seguem no TypeScript: o `junction_nivel` do
 * Rust (B3) ainda diverge do TS fora da 0049 nos projetos com paredes anexadas (0050, B5), então não é entregue em produção; no modo sombra ele é
 * comparado e o TS é devolvido. Durante a montagem da cena da B o despacho da B fica fechado (o TS atende): montar a cena lê pisos e lajes, e
 * despachá-los de dentro dela seria um ciclo.
 *
 * `resolveLevel` (resolve.ts) consulta o despachante instalado aqui. Com a fatia A ligada e SEM modo sombra, o nível sai da consulta
 * `resolver_nivel` do Rust (a cena do projeto é montada e atualizada a partir do projeto em JS, que é a fonte da verdade; o estado do
 * Rust é cache) e volta como o mesmo `ResolvedLevel` do TypeScript. Com o modo sombra, roda o Rust e o TS, compara com os critérios do
 * harness (`compararA3d`, decisões 0048 e 0049), registra as divergências e DEVOLVE SEMPRE o resultado do TS.
 *
 * Falha leve (ENTRADA, NAO_IMPLEMENTADO, LIMITE, ou nível que a consulta ainda não cobre): só aquela chamada volta ao TS. Falha grave
 * (VERSAO, HANDLE, INTERNO, trap): a cena recria a instância e repete (no máximo 3 recriações em 5 min, no gerenciador); se ainda assim
 * falhar, a chamada volta ao TS e, esgotado o limite, o kernel fica desligado na sessão. Nada liga sem flag: o padrão é o TypeScript.
 */
import { CenaV2, ErroKernelGrave, GerenciadorKernelV2, baixarAssetDoWasm, fonteDeSecoes } from '@hestia/geom';
import { wallsOnLevel, openingsOfWall, type Id, type Project } from '@hestia/model';
import { montarCenaA1 } from './kernelA1.ts';
import { DespachoB, ErroDespachoKernel, type ContextoB, type DivergenciaB } from './kernelDespachoB.ts';
import { chaveDasOpcoes, interpretarMensagem, LIMITE_MENSAGEM, NaoCoberto, secoesDe, textoDoErro, type EntradaCena } from './kernelDespachoA.ts';
import { CONFIG_PADRAO, type ConfigDespacho } from './kernelDespachoConfig.ts';
export { CONFIG_PADRAO, K_0049_FATIA_B, type ConfigDespacho } from './kernelDespachoConfig.ts';
import type { ElementoB1 } from './kernelB.ts';
import type { JuncaoB3 } from './kernelB3.ts';
import type { ResolvedFloor } from './floors.ts';
import type { ResolvedSlab } from './slabs.ts';
import type { JunctionLevel } from './junctionLevel.ts';
import { montarCenaA3, type OpcoesA3c } from './kernelA3.ts';
import { argumentosA3d, codificarA3d, decodificarA3d, montarPerfisA3d, resolvidoDeA3d, type ResolvidoA3d } from './kernelA3d.ts';
import { compararA3d } from './kernelComparaA3d.ts';
import type { PlanResolveOptions } from './resolve.ts';
import { definirDespachanteDeNivel, definirDespachantesDaFatiaB } from './resolveDespacho.ts';
import type { ResolvedLevel } from './types.ts';

/** Quantas divergências o registro circular guarda. */
export const LIMITE_REGISTRO = 20;

/** Uma divergência do modo sombra: o nível, a parede (id do projeto, quando a mensagem a cita) e o campo. */
export interface DivergenciaRegistrada {
  /** `Date.now()` do registro. */
  quando: number;
  nivel: Id;
  /** Fatia que registrou (ausente: A). */
  fatia?: 'A' | 'B';
  parede: Id | null;
  /** Piso ou laje da divergência (só na fatia B, quando a mensagem o identifica). */
  elemento?: Id | null;
  campo: string;
  mensagem: string;
  /** Quantas divergências a comparação inteira desse nível teve (a mensagem é a primeira). */
  nesteNivel: number;
}

export interface DiagnosticoDespacho {
  config: ConfigDespacho;
  /** O despachante está instalado (alguém chamou `instalarDespachoKernel`). */
  instalado: boolean;
  /** O wasm está carregado e o gerenciador ligado. */
  pronto: boolean;
  /** Motivo de o kernel não estar disponível (wasm ausente, versão errada, limite de recriações); `null` quando disponível. */
  indisponivel: string | null;
  /** Níveis entregues pelo Rust (modo sem sombra). */
  entreguesPeloRust: number;
  /** Consultas da fatia B entregues pelo Rust (pisos e lajes de um nível contam uma vez; a junção ainda não é despachada). */
  entreguesB: number;
  /** Chamadas que voltaram ao TS por falha leve ou por nível não coberto (sem recriar a instância). */
  voltasLeves: number;
  /** Chamadas que voltaram ao TS por falha grave (a instância já foi recriada e a chamada repetida pela cena). */
  voltasGraves: number;
  /** Recriações da instância na sessão (do gerenciador). */
  recriacoes: number;
  ultimoErro: string | null;
  /** Comparações feitas pelo modo sombra. */
  comparacoes: number;
  /** Comparações com ao menos uma divergência. */
  divergencias: number;
  ultimaDivergencia: DivergenciaRegistrada | null;
  /** Registro circular: as últimas divergências, da mais antiga para a mais recente (no máximo `LIMITE_REGISTRO`). */
  registro: DivergenciaRegistrada[];
}

export interface OpcoesDespacho {
  /** O gerenciador do kernel v2, quando já está carregado (síncrono: `resolveLevel` não espera). */
  gerenciador: () => GerenciadorKernelV2 | null;
  config: () => ConfigDespacho;
  /** Motivo de indisponibilidade do carregamento (para o diagnóstico). */
  motivoIndisponivel?: () => string | null;
  /** Relógio do registro. Padrão `Date.now`. */
  agora?: () => number;
  /**
   * Gancho de TESTE: altera a saída decodificada do Rust antes de usá-la (o teste de sombra injeta uma divergência artificial).
   * Nunca é usado em produção.
   */
  intervencaoDeTeste?: (r: ResolvidoA3d) => ResolvidoA3d;
  /** Gancho de TESTE da fatia B: altera a saída decodificada de `pisos_lajes_com_paredes` e de `junction_nivel` (divergência artificial). */
  intervencaoDeTesteB?: { pisosELajes?: (el: ElementoB1[]) => ElementoB1[]; juncao?: (j: JuncaoB3) => JuncaoB3 };
}

export class DespachoKernel {
  private readonly cenas = new Map<boolean, EntradaCena>();
  private readonly memo = new WeakMap<Project, Map<string, ResolvedLevel>>();
  private readonly comparados = new WeakMap<Project, Set<string>>();
  private readonly agora: () => number;
  private entreguesPeloRust = 0;
  private entreguesB = 0;
  private voltasLeves = 0;
  private voltasGraves = 0;
  private ultimoErro: string | null = null;
  private comparacoes = 0;
  private divergencias = 0;
  private readonly registro: DivergenciaRegistrada[] = [];

  private readonly b: DespachoB;

  constructor(private readonly opcoes: OpcoesDespacho) {
    this.agora = opcoes.agora ?? (() => Date.now());
    const contexto: ContextoB = {
      gerenciador: () => this.opcoes.gerenciador(),
      fatiaLigada: () => this.opcoes.config().fatiaB,
      sombra: () => this.opcoes.config().sombra,
      agora: this.agora,
      ...(opcoes.intervencaoDeTesteB ? { intervencao: opcoes.intervencaoDeTesteB } : {}),
      registrar: (d: DivergenciaB) => this.registrar(d),
      contar: (campo) => {
        if (campo === 'entreguesB') this.entreguesB++;
        else if (campo === 'voltasLeves') this.voltasLeves++;
        else if (campo === 'voltasGraves') this.voltasGraves++;
        else if (campo === 'comparacoes') this.comparacoes++;
        else this.divergencias++;
      },
      erro: (mensagem) => {
        this.ultimoErro = mensagem;
      },
      aoGrave: () => {
        for (const x of this.cenas.values()) x.projeto = null;
      },
      limiteRegistro: LIMITE_REGISTRO,
    };
    this.b = new DespachoB(contexto);
  }

  /** O despachante de `resolveFloors` (fatia B). */
  resolverPisos(p: Project, levelId: Id, ts: () => ResolvedFloor[]): ResolvedFloor[] {
    return this.b.resolverPisos(p, levelId, ts);
  }

  /** O despachante de `resolveSlabs` (fatia B). */
  resolverLajes(p: Project, levelId: Id, ts: () => ResolvedSlab[]): ResolvedSlab[] {
    return this.b.resolverLajes(p, levelId, ts);
  }

  /** O despachante de `junctionLevel` (fatia B): só o modo sombra consulta a B3. */
  resolverJuncao(p: Project, levelId: Id, ts: () => JunctionLevel): JunctionLevel {
    return this.b.resolverJuncao(p, levelId, ts);
  }

  /** O despachante de `resolveLevel`. */
  resolver(p: Project, levelId: Id, opts: PlanResolveOptions, ts: () => ResolvedLevel): ResolvedLevel {
    const cfg = this.opcoes.config();
    if (!cfg.fatiaA) return ts();
    const ger = this.opcoes.gerenciador();
    if (!ger) return ts(); // wasm ainda não carregado: o app inicia antes dele
    if (!ger.ligado) {
      if (cfg.sombra) return ts();
      const motivo = ger.estado().motivoDesligado ?? 'kernel desligado';
      this.ultimoErro = motivo;
      throw new ErroDespachoKernel('A', levelId, `kernel desligado: ${motivo}`);
    }
    return cfg.sombra ? this.emSombra(p, levelId, opts, ts, ger) : this.noRust(p, levelId, opts, ts, ger);
  }

  diagnostico(): DiagnosticoDespacho {
    const ger = this.opcoes.gerenciador();
    const estado = ger?.estado();
    const indisponivel = ger ? (estado!.ligado ? null : estado!.motivoDesligado) : (this.opcoes.motivoIndisponivel?.() ?? 'wasm ainda não carregado');
    return {
      config: this.opcoes.config(),
      instalado: true,
      pronto: !!ger && ger.ligado,
      indisponivel,
      entreguesPeloRust: this.entreguesPeloRust,
      entreguesB: this.entreguesB,
      voltasLeves: this.voltasLeves,
      voltasGraves: this.voltasGraves,
      recriacoes: estado?.recriacoesTotal ?? 0,
      ultimoErro: this.ultimoErro,
      comparacoes: this.comparacoes,
      divergencias: this.divergencias,
      ultimaDivergencia: this.registro[this.registro.length - 1] ?? null,
      registro: [...this.registro],
    };
  }

  /** Libera as cenas no Rust (testes e troca de gerenciador). O estado é cache: a próxima chamada reconstrói. */
  encerrar(): void {
    for (const e of this.cenas.values()) e.cena?.destruir();
    this.cenas.clear();
    this.b.encerrar();
  }

  // --- caminhos ---------------------------------------------------------------------------------------------------------------

  private noRust(p: Project, levelId: Id, opts: PlanResolveOptions, _ts: () => ResolvedLevel, ger: GerenciadorKernelV2): ResolvedLevel {
    const chave = chaveDasOpcoes(levelId, opts);
    const guardado = this.memo.get(p)?.get(chave);
    if (guardado) return guardado;
    const r = this.consultar(p, levelId, opts, ger);
    if (!r) throw new ErroDespachoKernel('A', levelId, this.ultimoErro ?? 'o Rust não devolveu resultado');
    let porProjeto = this.memo.get(p);
    if (!porProjeto) this.memo.set(p, (porProjeto = new Map()));
    porProjeto.set(chave, r.resolvido);
    this.entreguesPeloRust++;
    return r.resolvido;
  }

  private emSombra(p: Project, levelId: Id, opts: PlanResolveOptions, ts: () => ResolvedLevel, ger: GerenciadorKernelV2): ResolvedLevel {
    const resultadoTs = ts();
    const chave = chaveDasOpcoes(levelId, opts);
    let feitos = this.comparados.get(p);
    if (!feitos) this.comparados.set(p, (feitos = new Set()));
    if (feitos.has(chave)) return resultadoTs;
    const r = this.consultar(p, levelId, opts, ger);
    if (!r) return resultadoTs;
    feitos.add(chave);
    try {
      const ref = codificarA3d(resultadoTs, r.entrada.a1);
      const curvas = new Set<number>();
      const q = r.entrada.a1.secoes.paredes_quadro;
      q['id_num']!.forEach((id, i) => {
        if (q['sag']![i] !== 0) curvas.add(id);
      });
      const doModelo = new Set<number>();
      for (const [id, num] of r.entrada.a1.idDe) if ((p.elements[id] as { topProfile?: unknown }).topProfile) doModelo.add(num);
      const cmp = compararA3d(ref, r.rust, curvas, doModelo, LIMITE_REGISTRO);
      this.comparacoes++;
      if (cmp.divergencias.length > 0) {
        this.divergencias++;
        const primeira = cmp.divergencias[0]!;
        const { parede, campo } = interpretarMensagem(primeira, r.entrada.a1);
        this.registrar({ quando: this.agora(), nivel: levelId, parede, campo, mensagem: primeira.slice(0, LIMITE_MENSAGEM), nesteNivel: cmp.divergencias.length });
      }
    } catch (e) {
      // Falha ao comparar não pode afetar o resultado: o TS já está em mãos.
      this.ultimoErro = `comparação: ${textoDoErro(e)}`;
    }
    return resultadoTs;
  }

  private registrar(d: DivergenciaRegistrada): void {
    this.registro.push(d);
    if (this.registro.length > LIMITE_REGISTRO) this.registro.shift();
  }

  /** Cena sincronizada com o projeto + consulta + decodificação. `null`: falhou (já contado) e a chamada fora da sombra lança `ErroDespachoKernel`. */
  private consultar(p: Project, levelId: Id, opts: PlanResolveOptions, ger: GerenciadorKernelV2): { resolvido: ResolvedLevel; rust: ResolvidoA3d; entrada: EntradaCena } | null {
    const flat = opts.flatAttach === true;
    let fase: 'envio' | 'consulta' = 'envio';
    try {
      const entrada = this.sincronizar(p, flat, ger);
      this.verificarCobertura(p, levelId, entrada);
      fase = 'consulta';
      const opcoes: OpcoesA3c = { ...(opts.cutZ === undefined ? {} : { cutZ: opts.cutZ }), ...(opts.outlineWalls ? { outlineWalls: opts.outlineWalls } : {}), ...(opts.planOpenings ? { planOpenings: opts.planOpenings } : {}) };
      const saidas = entrada.cena!.consultar('resolver_nivel', argumentosA3d(p, levelId, entrada.a1, entrada.a3, opcoes));
      let rust = decodificarA3d(saidas);
      if (this.opcoes.intervencaoDeTeste) rust = this.opcoes.intervencaoDeTeste(rust);
      return { resolvido: resolvidoDeA3d(rust, levelId, entrada.a1), rust, entrada };
    } catch (e) {
      this.ultimoErro = textoDoErro(e);
      if (e instanceof ErroKernelGrave) {
        // A cena já recriou a instância e repetiu; a chamada falha com erro explícito (fora da sombra). As cenas são reenviadas por inteiro na próxima.
        this.voltasGraves++;
        for (const x of this.cenas.values()) x.projeto = null;
      } else {
        // Falha leve (ou nível não coberto): só esta chamada falha, sem recriar. Se o envio parou no meio, a cena fica suja.
        this.voltasLeves++;
        const viva = this.cenas.get(flat);
        if (fase === 'envio' && viva) viva.projeto = null;
      }
      return null;
    }
  }

  /** As seções da cena no Rust são as do projeto `p` (envio completo quando o projeto mudou: a edição invalida o que depende dela). */
  private sincronizar(p: Project, flat: boolean, ger: GerenciadorKernelV2): EntradaCena {
    let e = this.cenas.get(flat);
    if (e && e.ger !== ger) {
      e.cena?.destruir();
      this.cenas.delete(flat);
      e = undefined;
    }
    if (e && e.projeto === p && e.cena) return e;
    const a1 = montarCenaA1(p, flat);
    const a3 = montarCenaA3(p, a1);
    const secoes = secoesDe(a1, a3, montarPerfisA3d(p, a1, flat));
    if (!e) {
      const nova: EntradaCena = { ger, cena: null, fonte: fonteDeSecoes(() => nova.secoes), secoes, a1, a3, projeto: null };
      this.cenas.set(flat, nova);
      e = nova;
    }
    e.projeto = null;
    Object.assign(e, { secoes, a1, a3 });
    if (e.cena) e.fonte(e.cena);
    else e.cena = CenaV2.criar(ger, e.fonte);
    e.projeto = p;
    return e;
  }

  private verificarCobertura(p: Project, levelId: Id, e: EntradaCena): void {
    if (!e.a1.nivelDe.has(levelId)) throw new NaoCoberto(`nível ${levelId} fora do projeto`);
    for (const w of wallsOnLevel(p, levelId)) {
      if (!e.a1.idDe.has(w.id)) throw new NaoCoberto(`parede ${w.id} sem tipo ou nível: a consulta não a cobre`);
      for (const o of openingsOfWall(p, w.id)) if (!e.a3.aberturaDe.has(o.id)) throw new NaoCoberto(`abertura ${o.id} sem tipo: a consulta não a cobre`);
    }
  }
}

// --- instalação e carregamento ---------------------------------------------------------------------------------------------------

let despacho: DespachoKernel | null = null;
let configAtual: ConfigDespacho = CONFIG_PADRAO;
let gerenciadorAtual: GerenciadorKernelV2 | null = null;
let motivoIndisponivel: string | null = null;
let carregando: Promise<void> | null = null;
let diagnosticoRemoto: DiagnosticoDespacho | null = null;

/** Instala o despachante em `resolveLevel` com as opções dadas (testes injetam o gerenciador; o app usa `iniciarDespachoKernel`). */
export function instalarDespachoKernel(opcoes: OpcoesDespacho): DespachoKernel {
  despacho?.encerrar();
  const d = new DespachoKernel(opcoes);
  despacho = d;
  definirDespachanteDeNivel((p, levelId, opts, ts) => d.resolver(p, levelId, opts, ts));
  definirDespachantesDaFatiaB({
    pisos: (p, levelId, ts) => d.resolverPisos(p, levelId, ts),
    lajes: (p, levelId, ts) => d.resolverLajes(p, levelId, ts),
    juncao: (p, levelId, ts) => d.resolverJuncao(p, levelId, ts),
  });
  return d;
}

/** Remove o despachante: `resolveLevel` volta a ser só o TypeScript. */
export function removerDespachoKernel(): void {
  despacho?.encerrar();
  despacho = null;
  definirDespachanteDeNivel(null);
  definirDespachantesDaFatiaB(null);
  configAtual = CONFIG_PADRAO;
  gerenciadorAtual = null;
  motivoIndisponivel = null;
  carregando = null;
  diagnosticoRemoto = null;
}

/** Existe despachante instalado? */
export const despachoInstalado = (): boolean => despacho !== null;

/** Diagnóstico local (esta thread). `null` sem despachante instalado. */
export function diagnosticoLocalDoDespacho(): DiagnosticoDespacho | null {
  return despacho ? despacho.diagnostico() : null;
}

/** O worker manda o diagnóstico dele junto da resposta; a thread principal guarda o último para o diálogo "Experimentais". */
export function registrarDiagnosticoRemoto(d: DiagnosticoDespacho | null | undefined): void {
  if (d === null) diagnosticoRemoto = null;
  else if (d) diagnosticoRemoto = d;
}

/**
 * Diagnóstico para a interface: a thread principal e o worker (a resolução roda nos dois) somados; a última divergência é a mais recente.
 * `null`: nenhum despachante instalado em lugar nenhum.
 */
export function diagnosticoDespacho(): DiagnosticoDespacho | null {
  const local = diagnosticoLocalDoDespacho();
  const remoto = diagnosticoRemoto;
  if (!local) return remoto;
  if (!remoto) return local;
  const registro = [...local.registro, ...remoto.registro].sort((a, b) => a.quando - b.quando).slice(-LIMITE_REGISTRO);
  return {
    config: local.config.fatiaA || local.config.fatiaB ? local.config : remoto.config,
    instalado: true,
    pronto: local.pronto || remoto.pronto,
    indisponivel: local.pronto || remoto.pronto ? null : (local.indisponivel ?? remoto.indisponivel),
    entreguesPeloRust: local.entreguesPeloRust + remoto.entreguesPeloRust,
    entreguesB: local.entreguesB + (remoto.entreguesB ?? 0),
    voltasLeves: local.voltasLeves + remoto.voltasLeves,
    voltasGraves: local.voltasGraves + remoto.voltasGraves,
    recriacoes: local.recriacoes + remoto.recriacoes,
    ultimoErro: remoto.ultimoErro ?? local.ultimoErro,
    comparacoes: local.comparacoes + remoto.comparacoes,
    divergencias: local.divergencias + remoto.divergencias,
    ultimaDivergencia: registro[registro.length - 1] ?? null,
    registro,
  };
}

/** Quem carrega o wasm: bytes do asset. Injetável nos testes. */
export type CarregadorDeBytes = () => Promise<ArrayBuffer | Uint8Array>;

/**
 * Liga (ou desliga) o despacho conforme a configuração. Idempotente: o primeiro pedido com a fatia A ligada instala o despachante e
 * carrega o wasm em segundo plano (nunca bloqueia nem lança); enquanto não fica pronto, e se o carregamento falhar (binário sem o
 * ABI v2, por exemplo), `resolveLevel` segue no TypeScript. Sem fatia ligada (A ou B), nada é instalado nem baixado.
 */
export function iniciarDespachoKernel(config: ConfigDespacho, carregar: CarregadorDeBytes = baixarAssetDoWasm): Promise<void> {
  const alguma = config.fatiaA || config.fatiaB;
  configAtual = { fatiaA: config.fatiaA, fatiaB: config.fatiaB, sombra: alguma && config.sombra };
  if (!alguma) return carregando ?? Promise.resolve();
  if (!despacho) {
    instalarDespachoKernel({ gerenciador: () => gerenciadorAtual, config: () => configAtual, motivoIndisponivel: () => motivoIndisponivel });
  }
  if (!carregando) {
    carregando = (async () => {
      try {
        gerenciadorAtual = await GerenciadorKernelV2.dosBytes(await carregar());
      } catch (e) {
        motivoIndisponivel = textoDoErro(e);
      }
    })();
  }
  return carregando;
}
export { ErroDespachoKernel } from './kernelDespachoB.ts';
