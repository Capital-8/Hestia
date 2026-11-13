/**
 * Peças da fatia B do despacho (decisão 0050, B5): a cena do Rust para pisos, lajes e junção, e a conversão da saída do Rust para os MESMOS tipos
 * do TypeScript (`ResolvedFloor`, `ResolvedSlab`, `JunctionLevel`). Quem decide (flag, sombra, memo, falhas) é `DespachoKernel`, em
 * `kernelDespacho.ts`; aqui não há política, só montagem e tradução. A conversão da junção (`converterJuncao`) está pronta, mas a B3 ainda não é
 * despachada: o `junction_nivel` do Rust diverge do TS fora da 0049 nos projetos com paredes anexadas (0050, B5). Só o modo sombra a consulta.
 *
 * A cena da B reúne as seções da fatia A (com a cota do término por camada, `flatAttach`), as da B1/B2 e, só quando a junção é pedida, as da B3.
 * O estado do Rust é cache: a fonte da verdade é o projeto em JS, reenviado por inteiro quando o projeto muda.
 */
import { CenaV2, ErroKernelGrave, fonteDeSecoes, type GerenciadorKernelV2 } from '@hestia/geom';
import { isWall, openingsOfWall, wallsOnLevel, type Id, type Project } from '@hestia/model';
import { ehParedeCortina, semCortina } from './cortinaProjeto.ts';
import type { ResolvedFloor } from './floors.ts';
import { projetoInteiroDaJuncao, type JunctionLevel } from './junctionLevel.ts';
import type { ResolvedSlab } from './slabs.ts';
import { montarCenaA1, type CenaA1 } from './kernelA1.ts';
import { montarCenaA3, type CenaA3 } from './kernelA3.ts';
import { montarPerfisA3d, type CenaA3d } from './kernelA3d.ts';
import { argumentosB2, decodificarB2, montarCenaB1, referenciaDeResultados, type CenaB1, type ElementoB1 } from './kernelB.ts';
import { decodificarB3, montarCenaB3, referenciaB3De, type CenaB3, type JuncaoB3 } from './kernelB3.ts';
import { levelCutterSet } from './junctionNet.ts';
import { compararB1 } from './kernelComparaB.ts';
import { compararB3 } from './kernelComparaB3.ts';
import { indexarQuantidades, montarCenaForros, quantidadesNivelRust, type CenaForros } from './kernelQuantidades.ts';
import type { QuantidadesRust, TipoQuant } from './quantidadesTipos.ts';

type Secoes = ReturnType<Parameters<typeof fonteDeSecoes>[0]>;

/** Elemento que a cena não contém (parede ou abertura sem tipo): a consulta não cobre, vale o TS. */
export class NaoCobertoB extends Error {}

/** Uma cena viva no kernel para a fatia B, e os mapas que traduzem os números internos de volta para ids do projeto. */
export interface EntradaB {
  ger: GerenciadorKernelV2;
  cena: CenaV2 | null;
  fonte: ReturnType<typeof fonteDeSecoes>;
  secoes: Secoes;
  a1: CenaA1;
  a3: CenaA3;
  b: CenaB1;
  b3: CenaB3 | null;
  /** Forros de todos os níveis (esquema v12), só quando as quantidades de forro foram pedidas. */
  forros: CenaForros | null;
  /** O projeto cujas seções estão no Rust; `null` quando o envio falhou no meio (a próxima chamada reenvia tudo). */
  projeto: Project | null;
}

/** Cada parede do projeto tem tipo e nível e cada abertura tem tipo (senão a cena não a contém e o Rust calcularia outra coisa). */
function verificarCobertura(p: Project, a1: CenaA1, a3: CenaA3): void {
  for (const l of p.levels) {
    for (const w of semCortina(p, wallsOnLevel(p, l.id))) {
      if (!a1.idDe.has(w.id)) throw new NaoCobertoB(`parede ${w.id} sem tipo ou nível: a consulta não a cobre`);
      for (const o of openingsOfWall(p, w.id)) if (!a3.aberturaDe.has(o.id)) throw new NaoCobertoB(`abertura ${o.id} sem tipo: a consulta não a cobre`);
    }
  }
  // Paredes de nível inexistente: o TS as ignora por nível, mas a cena de paredes as perderia em silêncio.
  for (const el of Object.values(p.elements)) if (isWall(el) && !ehParedeCortina(p, el) && !a1.idDe.has(el.id)) throw new NaoCobertoB(`parede ${el.id} sem tipo ou nível: a consulta não a cobre`);
}

function secoesDe(a1: CenaA1, a3: CenaA3, perfis: ReturnType<typeof montarPerfisA3d>, b: CenaB1, b3: CenaB3 | null, forros: CenaForros | null): Secoes {
  const s = a1.secoes;
  const n = a1.nLinhas;
  const sb = b.secoes;
  const nb = b.nLinhas;
  return {
    paredes: { colunas: s.paredes, n: n.paredes },
    tipos_parede: { colunas: s.tipos_parede, n: n.tipos_parede },
    camadas: { colunas: s.camadas, n: n.camadas },
    faixas: { colunas: s.faixas, n: n.faixas },
    paredes_quadro: { colunas: s.paredes_quadro, n: n.paredes_quadro },
    paredes_z: { colunas: s.paredes_z, n: n.paredes_z },
    perfis_z: { colunas: perfis.colunas, n: perfis.n },
    tipos_abertura: { colunas: a3.secoes.tipos_abertura, n: a3.nLinhas.tipos_abertura },
    aberturas: { colunas: a3.secoes.aberturas, n: a3.nLinhas.aberturas },
    tipos_piso: { colunas: sb.tipos_piso, n: nb.tipos_piso },
    tipos_laje: { colunas: sb.tipos_laje, n: nb.tipos_laje },
    camadas_piso: { colunas: sb.camadas_piso, n: nb.camadas_piso },
    camadas_laje: { colunas: sb.camadas_laje, n: nb.camadas_laje },
    pisos: { colunas: sb.pisos, n: nb.pisos },
    lajes: { colunas: sb.lajes, n: nb.lajes },
    contornos_estaticos: { colunas: sb.contornos_estaticos, n: nb.contornos_estaticos },
    contornos_vinculados: { colunas: sb.contornos_vinculados, n: nb.contornos_vinculados },
    furos_nivel: { colunas: sb.furos_nivel, n: nb.furos_nivel },
    niveis: { colunas: sb.niveis, n: nb.niveis },
    ...(b3
      ? {
          paredes_z_juncao: { colunas: b3.secoes.paredes_z_juncao, n: b3.nLinhas.paredes_z_juncao },
          perfis_z_juncao: { colunas: b3.secoes.perfis_z_juncao, n: b3.nLinhas.perfis_z_juncao },
          faixas_juncao: { colunas: b3.secoes.faixas_juncao, n: b3.nLinhas.faixas_juncao },
          pontos_faixas_juncao: { colunas: b3.secoes.pontos_faixas_juncao, n: b3.nLinhas.pontos_faixas_juncao },
        }
      : {}),
    ...(forros
      ? {
          camadas_forro: { colunas: forros.secoes.camadas_forro, n: forros.nLinhas.camadas_forro },
          pontos_forro: { colunas: forros.secoes.pontos_forro, n: forros.nLinhas.pontos_forro },
        }
      : {}),
  };
}

/**
 * Garante que a cena do Rust tem as seções do projeto `p` (envio completo quando o projeto mudou: a edição invalida o que depende dela). Com
 * `comJuncao`, as seções da B3 também; uma cena que as tinha as mantém. Lança `NaoCobertoB` (nada foi enviado) se a cena não cobre o projeto.
 */
export function sincronizarB(atual: EntradaB | null, p: Project, ger: GerenciadorKernelV2, comJuncao: boolean, comForros = false): EntradaB {
  let e = atual;
  if (e && e.ger !== ger) {
    e.cena?.destruir();
    e = null;
  }
  if (e && e.projeto === p && e.cena && (e.b3 !== null || !comJuncao) && (e.forros !== null || !comForros)) return e;
  // Mesmo projeto, só faltam as seções da junção ou dos forros: as demais (função só do projeto) valem e não são remontadas.
  const mesmo = e !== null && e.projeto === p && e.cena !== null;
  const a1 = mesmo ? e!.a1 : montarCenaA1(p, true);
  const a3 = mesmo ? e!.a3 : montarCenaA3(p, a1);
  if (!mesmo) verificarCobertura(p, a1, a3);
  const perfis = mesmo ? ({ colunas: e!.secoes.perfis_z!.colunas, n: e!.secoes.perfis_z!.n } as CenaA3d) : montarPerfisA3d(p, a1, true);
  const b = mesmo ? e!.b : montarCenaB1(p, a1.materialDe);
  const b3 = mesmo && e!.b3 ? e!.b3 : comJuncao || e?.b3 ? montarCenaB3(p, a1) : null;
  const forros = mesmo && e!.forros ? e!.forros : comForros || e?.forros ? montarCenaForros(p, b.nivelDe) : null;
  const secoes = secoesDe(a1, a3, perfis, b, b3, forros);
  if (!e) {
    const nova: EntradaB = { ger, cena: null, fonte: fonteDeSecoes(() => nova.secoes), secoes, a1, a3, b, b3, forros, projeto: null };
    e = nova;
  }
  e.projeto = null;
  Object.assign(e, { secoes, a1, a3, b, b3, forros });
  if (e.cena) e.fonte(e.cena);
  else e.cena = CenaV2.criar(ger, e.fonte);
  e.projeto = p;
  return e;
}

/** Argumentos de `pisos_lajes_com_paredes` e de `junction_nivel` (os mesmos: o nível e a tolerância de junção do projeto). */
export const argumentosDaFatiaB = argumentosB2;

export { converterJuncao, converterPisosELajes, type MapasB } from './kernelConversaoB.ts';
import { converterJuncao, converterPisosELajes, type MapasB } from './kernelConversaoB.ts';

/** Uma divergência do modo sombra da B (o registro circular e o diálogo são do `DespachoKernel`). */
export interface DivergenciaB {
  quando: number;
  nivel: Id;
  fatia: 'B';
  parede: Id | null;
  elemento: Id | null;
  campo: string;
  mensagem: string;
  nesteNivel: number;
}

export type ContagemB = 'entreguesB' | 'voltasLeves' | 'voltasGraves' | 'comparacoes' | 'divergencias';

/** O que o despacho da B precisa do `DespachoKernel` (contadores, registro, erro e as cenas da fatia A). */
export interface ContextoB {
  gerenciador: () => GerenciadorKernelV2 | null;
  fatiaLigada: () => boolean;
  sombra: () => boolean;
  agora: () => number;
  intervencao?: { pisosELajes?: (el: ElementoB1[]) => ElementoB1[]; juncao?: (j: JuncaoB3) => JuncaoB3 };
  registrar: (d: DivergenciaB) => void;
  contar: (campo: ContagemB) => void;
  erro: (mensagem: string) => void;
  /** A instância foi recriada: as cenas da fatia A também precisam ser reenviadas. */
  aoGrave: () => void;
  limiteRegistro: number;
  /** O erro de quem pede sem wasm: `KernelPendente` (ainda carregando) ou `ErroDespachoKernel` (o carregamento falhou). */
  semKernel: (nivel: Id | null) => Error;
}

const LIMITE_MENSAGEM_B = 400;
const K_0049_B = 0.08;

/** O campo divergente de uma mensagem dos comparadores da B (`elemento 0 (piso 1), camada 2: z0: ...` -> `z0`). */
function campoDaMensagem(m: string): string {
  const resto = m.includes(': ') ? m.slice(m.indexOf(': ') + 2) : m;
  const campo = resto.split(/[:(]/)[0]!.replace(/\s+(?:-?[\d.e+-]+|true|false|null|undefined)\s*$/i, '').trim();
  return campo.slice(0, 40) || m.slice(0, 30);
}

/**
 * O Rust falhou com a fatia ligada (e fora do modo sombra): não há substituição pelo TypeScript (decisão do dono: só o Rust calcula as partes de A e B).
 * Leva a fatia, o nível e a mensagem original; chega ao chamador de `resolveLevel`, `resolveFloors`, `resolveSlabs` e `junctionLevel`.
 */
export class ErroDespachoKernel extends Error {
  constructor(
    readonly fatia: 'A' | 'B',
    readonly nivel: Id | null,
    readonly mensagemOriginal: string,
  ) {
    super(`kernel Rust (fatia ${fatia}, nível ${nivel}): ${mensagemOriginal}`);
    this.name = 'ErroDespachoKernel';
  }
}

const textoDoErro = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').trim().slice(0, LIMITE_MENSAGEM_B);

/**
 * Estado e política do despacho da fatia B: pisos e lajes vão ao Rust (memo por projeto e nível, falha leve volta ao TS, grave recria); a junção
 * (B3) só é consultada no modo sombra e o TS é devolvido. O `DespachoKernel` guarda os contadores e o registro; aqui fica só o que é da B.
 */
export class DespachoB {
  private cenaB: EntradaB | null = null;
  /** Despacho da B fechado: a montagem da cena (que lê pisos e lajes) está em curso. */
  private montandoB = false;
  /** Saída do Rust por projeto e nível (`null`: a consulta falhou e a chamada lançou erro explícito; não se repete para o mesmo projeto e nível). */
  private readonly rustPisosELajes = new WeakMap<Project, Map<Id, { el: ElementoB1[]; mapas: MapasB } | null>>();
  private readonly rustJuncao = new WeakMap<Project, Map<Id, { juncao: JuncaoB3; mapas: MapasB } | null>>();
  /** Mensagem da falha do Rust por projeto e chave (`pl|nivel`, `j|nivel`): o erro explícito se repete para o mesmo projeto e nível. */
  private readonly falhas = new WeakMap<Project, Map<string, string>>();
  private readonly memoPisosELajes = new WeakMap<Project, Map<Id, { pisos: ResolvedFloor[]; lajes: ResolvedSlab[] }>>();
  private readonly comparadosB = new WeakMap<Project, Set<string>>();
  /** Projetos que a cena da B não cobre (parede sem tipo ou nível, abertura sem tipo): vale o TS, sem remontar a cena a cada nível. */
  private readonly semCoberturaB = new WeakSet<Project>();

  constructor(private readonly ctx: ContextoB) {}

  /** O despachante de `resolveFloors`. */
  resolverPisos(p: Project, levelId: Id, ts: () => ResolvedFloor[]): ResolvedFloor[] {
    const ger = this.gerenciador(levelId);
    if (!ger) return ts();
    return this.pisosELajes(p, levelId, ts, ger, false) as ResolvedFloor[];
  }

  /** O despachante de `resolveSlabs`. */
  resolverLajes(p: Project, levelId: Id, ts: () => ResolvedSlab[]): ResolvedSlab[] {
    const ger = this.gerenciador(levelId);
    if (!ger) return ts();
    return this.pisosELajes(p, levelId, ts, ger, true) as ResolvedSlab[];
  }

  /**
   * O despachante das quantidades (esquema v12). `null`: fatia B desligada (ou cena em montagem), e quem chama usa o motor TypeScript. Com a fatia
   * ligada, o resultado é o do Rust, `KernelPendente` (wasm sem carregar) ou `ErroDespachoKernel`; nunca o TypeScript, nem no modo sombra.
   */
  quantificar(p: Project, levelId: Id, tipo: TipoQuant): QuantidadesRust | null {
    const ger = this.gerenciador(levelId);
    if (!ger) return null;
    return this.exigir(this.quantidadesDoRust(p, levelId, tipo, ger), p, levelId, `q${tipo}`);
  }

  private readonly memoQuantidades = new WeakMap<Project, Map<string, QuantidadesRust>>();

  private quantidadesDoRust(p: Project, levelId: Id, tipo: TipoQuant, ger: GerenciadorKernelV2): QuantidadesRust | null {
    const chave = `${tipo}|${levelId}`;
    const guardado = this.memoQuantidades.get(p)?.get(chave);
    if (guardado) return guardado;
    const r = this.consultarB(
      p,
      ger,
      true,
      (e) => {
        const [nivel, tol] = argumentosDaFatiaB(p, levelId, e.b) as [number, number];
        const numeroDe = tipo === 'paredes' ? e.a1.idDe : tipo === 'pisos' ? e.b.pisoDe : tipo === 'lajes' ? e.b.lajeDe : e.forros!.forroDe;
        return indexarQuantidades(quantidadesNivelRust(e.cena!, nivel, tol, tipo), numeroDe, tipo);
      },
      true, // os forros entram na cena desde a primeira consulta: pedi-los só na de forros reenviava a cena inteira uma segunda vez
    );
    if (!r) {
      if (!this.falhas.get(p)?.has(`q${tipo}|${levelId}`)) this.guardarFalha(p, `q${tipo}|${levelId}`);
      return null;
    }
    let por = this.memoQuantidades.get(p);
    if (!por) this.memoQuantidades.set(p, (por = new Map()));
    por.set(chave, r);
    this.ctx.contar('entreguesB');
    return r;
  }

  /** O despachante de `junctionLevel`. Com a fatia B ligada, a junção vem do Rust (convertida para o formato do TS); o modo
   * sombra compara as duas. Qualquer falha do Rust (sem cena, conversão com erro) lança `ErroDespachoKernel`; o TypeScript só é devolvido no modo sombra.
   */
  resolverJuncao(p: Project, levelId: Id, ts: () => JunctionLevel): JunctionLevel {
    const ger = this.gerenciador(levelId);
    if (!ger) return ts();
    // O Rust tem a cena do projeto inteiro: o projeto reduzido da jun��o (c�pia nova a cada n�vel) vira o inteiro, sen�o cada n�vel reenviaria a
    // cena toda e as paredes dos n�veis cortados pela redu��o ficariam fora da cobertura.
    const inteiro = projetoInteiroDaJuncao.get(p) ?? p;
    const rust = this.exigir(this.juncaoDoRust(inteiro, levelId, ger), inteiro, levelId, 'j');
    if (this.ctx.sombra()) this.compararJuncao(inteiro, levelId, ts, ger, p);
    return rust;
  }

  /** Fora do modo sombra o resultado é o do Rust ou o erro explícito: nunca o TypeScript. */
  private exigir<T>(r: T | null, p: Project, levelId: Id, chave: string): T {
    if (r) return r;
    const msg = this.falhas.get(p)?.get(`${chave}|${levelId}`) ?? 'o Rust não devolveu resultado';
    throw new ErroDespachoKernel('B', levelId, msg);
  }

  /** Guarda a mensagem da falha que acabou de acontecer para a chave (o erro explícito a repete enquanto o resultado nulo estiver em cache). */
  private guardarFalha(p: Project, chave: string): void {
    let m = this.falhas.get(p);
    if (!m) this.falhas.set(p, (m = new Map()));
    m.set(chave, this.ultimaMsg);
  }
  private ultimaMsg = 'o Rust não devolveu resultado';
  private readonly motivoSemCobertura = new WeakMap<Project, string>();

  private readonly memoJuncao = new WeakMap<Project, Map<Id, JunctionLevel>>();

  /** A junção do Rust, convertida e guardada por projeto e nível (a conversão é cara; o projeto muda a cada edição). */
  private juncaoDoRust(p: Project, levelId: Id, ger: GerenciadorKernelV2): JunctionLevel | null {
    const guardado = this.memoJuncao.get(p)?.get(levelId);
    if (guardado) return guardado;
    const r = this.consultarJuncao(p, levelId, ger);
    if (!r) {
      if (!this.falhas.get(p)?.has(`j|${levelId}`)) this.guardarFalha(p, `j|${levelId}`);
      return null;
    }
    const convertido = this.converter(() => converterJuncao(levelId, r.juncao, r.mapas));
    if (!convertido) {
      this.guardarFalha(p, `j|${levelId}`);
      return null;
    }
    this.ctx.contar('entreguesB');
    let por = this.memoJuncao.get(p);
    if (!por) this.memoJuncao.set(p, (por = new Map()));
    por.set(levelId, convertido);
    return convertido;
  }

  /**
   * O gerenciador, só com a fatia B ligada e fora da montagem da cena (`null`: vale o TypeScript, que é só a fatia desligada). Sem wasm carregado
   * ainda: `KernelPendente`. Kernel DESLIGADO por falhas (limite de recriações): erro explícito. Nunca TypeScript com a fatia ligada.
   */
  private gerenciador(levelId: Id): GerenciadorKernelV2 | null {
    if (!this.ctx.fatiaLigada() || this.montandoB) return null;
    const ger = this.ctx.gerenciador();
    if (!ger) throw this.ctx.semKernel(levelId);
    if (!ger.ligado) {
      const motivo = ger.estado().motivoDesligado ?? 'kernel desligado';
      this.ctx.erro(motivo);
      throw new ErroDespachoKernel('B', levelId, `kernel desligado: ${motivo}`);
    }
    return ger;
  }

  private pisosELajesDoRust(p: Project, levelId: Id, ger: GerenciadorKernelV2): { pisos: ResolvedFloor[]; lajes: ResolvedSlab[] } | null {
    const guardado = this.memoPisosELajes.get(p)?.get(levelId);
    if (guardado) return guardado;
    const r = this.consultarPisosELajes(p, levelId, ger);
    if (!r) {
      if (!this.falhas.get(p)?.has(`pl|${levelId}`)) this.guardarFalha(p, `pl|${levelId}`);
      return null;
    }
    const convertido = this.converter(() => converterPisosELajes(p, levelId, r.el, r.mapas));
    if (!convertido) {
      this.guardarFalha(p, `pl|${levelId}`);
      return null;
    }
    let por = this.memoPisosELajes.get(p);
    if (!por) this.memoPisosELajes.set(p, (por = new Map()));
    por.set(levelId, convertido);
    this.ctx.contar('entreguesB');
    return convertido;
  }

  /** Conversão para os tipos do TS: se a saída do Rust não casa com o projeto (id desconhecido), a chamada falha com erro explícito (fora da sombra). */
  private converter<T>(f: () => T): T | null {
    try {
      return f();
    } catch (e) {
      this.ultimaMsg = `conversão: ${textoDoErro(e)}`;
      this.ctx.erro(this.ultimaMsg);
      this.ctx.contar('voltasLeves');
      return null;
    }
  }

  private consultarPisosELajes(p: Project, levelId: Id, ger: GerenciadorKernelV2): { el: ElementoB1[]; mapas: MapasB } | null {
    let por = this.rustPisosELajes.get(p);
    if (por?.has(levelId)) return por.get(levelId)!;
    if (!por) this.rustPisosELajes.set(p, (por = new Map()));
    const r = this.consultarB(p, ger, false, (e) => {
      let el = decodificarB2(e.cena!.consultar('pisos_lajes_com_paredes', argumentosDaFatiaB(p, levelId, e.b)));
      if (this.ctx.intervencao?.pisosELajes) el = this.ctx.intervencao.pisosELajes(el);
      return { el, mapas: { b: e.b, a1: e.a1 } };
    });
    por.set(levelId, r);
    return r;
  }

  private consultarJuncao(p: Project, levelId: Id, ger: GerenciadorKernelV2): { juncao: JuncaoB3; mapas: MapasB } | null {
    let por = this.rustJuncao.get(p);
    if (por?.has(levelId)) return por.get(levelId)!;
    if (!por) this.rustJuncao.set(p, (por = new Map()));
    const r = this.consultarB(p, ger, true, (e) => {
      let juncao = decodificarB3(e.cena!.consultar('junction_nivel', argumentosDaFatiaB(p, levelId, e.b)));
      if (this.ctx.intervencao?.juncao) juncao = this.ctx.intervencao.juncao(juncao);
      return { juncao, mapas: { b: e.b, a1: e.a1 } };
    });
    por.set(levelId, r);
    return r;
  }

  /** Sincroniza a cena da B com o projeto e roda a consulta. `null`: falhou (já contado) e a chamada volta ao TS. */
  private consultarB<T>(p: Project, ger: GerenciadorKernelV2, comJuncao: boolean, consulta: (e: EntradaB) => T, comForros = false): T | null {
    if (this.semCoberturaB.has(p)) {
      this.ultimaMsg = this.motivoSemCobertura.get(p) ?? 'projeto fora da cobertura da fatia B';
      return null;
    }
    let fase: 'envio' | 'consulta' = 'envio';
    this.montandoB = true;
    try {
      const e = sincronizarB(this.cenaB, p, ger, comJuncao, comForros);
      this.cenaB = e;
      fase = 'consulta';
      return consulta(e);
    } catch (e) {
      this.ultimaMsg = textoDoErro(e);
      this.ctx.erro(this.ultimaMsg);
      if (e instanceof ErroKernelGrave) {
        // A cena já recriou a instância e repetiu; a chamada falha com erro explícito (fora da sombra). As cenas são reenviadas por inteiro na próxima.
        this.ctx.contar('voltasGraves');
        this.ctx.aoGrave();
        if (this.cenaB) this.cenaB.projeto = null;
      } else {
        // Falha leve (ou projeto que a consulta não cobre): só esta chamada falha com erro explícito, sem recriar. Se o envio parou no meio, a cena fica suja.
        this.ctx.contar('voltasLeves');
        if (e instanceof NaoCobertoB) {
          this.semCoberturaB.add(p);
          this.motivoSemCobertura.set(p, this.ultimaMsg);
        }
        else if (fase === 'envio' && this.cenaB) this.cenaB.projeto = null;
      }
      return null;
    } finally {
      this.montandoB = false;
    }
  }

  /** Pisos ou lajes do Rust (memo por projeto e nível). No modo sombra, compara uma vez com o TypeScript; o resultado devolvido é sempre o do Rust. */
  private pisosELajes(p: Project, levelId: Id, ts: () => (ResolvedFloor | ResolvedSlab)[], ger: GerenciadorKernelV2, laje: boolean): (ResolvedFloor | ResolvedSlab)[] {
    const rust = this.exigir(this.pisosELajesDoRust(p, levelId, ger), p, levelId, 'pl');
    if (this.ctx.sombra()) this.compararPisosELajes(p, levelId, ts, ger, laje);
    return laje ? rust.lajes : rust.pisos;
  }

  /** Só o modo sombra: o TypeScript entra aqui apenas como referência da comparação (uma vez por projeto, nível e tipo). */
  private compararPisosELajes(p: Project, levelId: Id, ts: () => (ResolvedFloor | ResolvedSlab)[], ger: GerenciadorKernelV2, laje: boolean): void {
    const chave = `${laje ? 'lajes' : 'pisos'}|${levelId}`;
    let feitos = this.comparadosB.get(p);
    if (!feitos) this.comparadosB.set(p, (feitos = new Set()));
    if (feitos.has(chave)) return;
    const r = this.consultarPisosELajes(p, levelId, ger);
    if (!r) return;
    feitos.add(chave);
    try {
      const resultadoTs = ts();
      const ref = referenciaDeResultados(laje ? [] : (resultadoTs as ResolvedFloor[]), laje ? (resultadoTs as ResolvedSlab[]) : [], r.mapas.b);
      const cmp = compararB1(ref, r.el.filter((e) => e.laje === laje), { k0049: K_0049_B, maxDivergencias: this.ctx.limiteRegistro });
      this.ctx.contar('comparacoes');
      if (cmp.divergencias.length > 0) {
        this.ctx.contar('divergencias');
        const primeira = cmp.divergencias[0]!;
        const idx = cmp.detalhes[0]?.elemento ?? -1;
        const el = resultadoTs[idx] as ResolvedFloor | ResolvedSlab | undefined;
        const elemento = el ? ('floorId' in el ? el.floorId : el.slabId) : null;
        this.ctx.registrar({ quando: this.ctx.agora(), nivel: levelId, fatia: 'B', parede: null, elemento, campo: campoDaMensagem(primeira), mensagem: primeira.slice(0, LIMITE_MENSAGEM_B), nesteNivel: cmp.divergencias.length });
      }
    } catch (e) {
      // Falha ao comparar não pode afetar o resultado: ele é o do Rust.
      this.ctx.erro(`comparação: ${textoDoErro(e)}`);
    }
  }

  /** Só o modo sombra: compara a junção do Rust com a do TypeScript (referência), uma vez por projeto e nível. */
  private compararJuncao(p: Project, levelId: Id, ts: () => JunctionLevel, ger: GerenciadorKernelV2, pTs: Project = p): void {
    const chave = `juncao|${levelId}`;
    let feitos = this.comparadosB.get(p);
    if (!feitos) this.comparadosB.set(p, (feitos = new Set()));
    if (feitos.has(chave)) return;
    const r = this.consultarJuncao(p, levelId, ger);
    if (!r) return;
    feitos.add(chave);
    try {
      const resultadoTs = ts();
      // `levelCutterSet` é o do TS (nunca despachado); os pisos e as lajes que ele lê podem vir do Rust (equivalentes na B2).
      const ref = referenciaB3De(levelCutterSet(pTs, levelId), resultadoTs, r.mapas.b, r.mapas.a1);
      const cmp = compararB3(ref, r.juncao, { k0049: K_0049_B, maxDivergencias: this.ctx.limiteRegistro });
      this.ctx.contar('comparacoes');
      if (cmp.divergencias.length > 0) {
        this.ctx.contar('divergencias');
        const primeira = cmp.divergencias[0]!;
        const piso = new Map([...r.mapas.b.pisoDe].map(([id, n]) => [n, id] as const));
        const laje = new Map([...r.mapas.b.lajeDe].map(([id, n]) => [n, id] as const));
        const parede = new Map([...r.mapas.a1.idDe].map(([id, n]) => [n, id] as const));
        const doElemento = /^elemento \d+ \((piso|laje) (\d+)\)/.exec(primeira);
        const daParede = /^parede \d+ \((\d+)\)/.exec(primeira);
        const elemento = doElemento ? ((doElemento[1] === 'piso' ? piso : laje).get(Number(doElemento[2])) ?? null) : null;
        this.ctx.registrar({ quando: this.ctx.agora(), nivel: levelId, fatia: 'B', parede: daParede ? (parede.get(Number(daParede[1])) ?? null) : null, elemento, campo: campoDaMensagem(primeira), mensagem: primeira.slice(0, LIMITE_MENSAGEM_B), nesteNivel: cmp.divergencias.length });
      }
    } catch (e) {
      this.ctx.erro(`comparação: ${textoDoErro(e)}`);
    }
  }

  /** Libera a cena da B no Rust (testes e troca de gerenciador). O estado é cache: a próxima chamada reconstrói. */
  encerrar(): void {
    this.cenaB?.cena?.destruir();
    this.cenaB = null;
  }
}
