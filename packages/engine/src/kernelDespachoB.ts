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
import { isWall, openingsOfWall, wallsOnLevel, type Id, type Project, type Slab } from '@hestia/model';
import type { ResolvedFloor, ResolvedFloorLayer } from './floors.ts';
import type { ElementJunction, JunctionLevel, WallJunction } from './junctionLevel.ts';
import type { ResolvedPrism } from './junctionPlanar.ts';
import type { ResolvedSlab, ResolvedSlabLayer } from './slabs.ts';
import { montarCenaA1, type CenaA1 } from './kernelA1.ts';
import { montarCenaA3, type CenaA3 } from './kernelA3.ts';
import { montarPerfisA3d } from './kernelA3d.ts';
import { argumentosB2, decodificarB2, montarCenaB1, referenciaDeResultados, type CamadaB1, type CenaB1, type ElementoB1 } from './kernelB.ts';
import { decodificarB3, montarCenaB3, referenciaB3De, TIPO_B3, type CenaB3, type JuncaoB3 } from './kernelB3.ts';
import { bandKey } from './junctionLevel.ts';
import { levelCutterSet } from './junctionNet.ts';
import { compararB1 } from './kernelComparaB.ts';
import { compararB3 } from './kernelComparaB3.ts';
import type { OutlineProblem } from './outlineBound.ts';

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
  /** O projeto cujas seções estão no Rust; `null` quando o envio falhou no meio (a próxima chamada reenvia tudo). */
  projeto: Project | null;
}

/** Cada parede do projeto tem tipo e nível e cada abertura tem tipo (senão a cena não a contém e o Rust calcularia outra coisa). */
function verificarCobertura(p: Project, a1: CenaA1, a3: CenaA3): void {
  for (const l of p.levels) {
    for (const w of wallsOnLevel(p, l.id)) {
      if (!a1.idDe.has(w.id)) throw new NaoCobertoB(`parede ${w.id} sem tipo ou nível: a consulta não a cobre`);
      for (const o of openingsOfWall(p, w.id)) if (!a3.aberturaDe.has(o.id)) throw new NaoCobertoB(`abertura ${o.id} sem tipo: a consulta não a cobre`);
    }
  }
  // Paredes de nível inexistente: o TS as ignora por nível, mas a cena de paredes as perderia em silêncio.
  for (const el of Object.values(p.elements)) if (isWall(el) && !a1.idDe.has(el.id)) throw new NaoCobertoB(`parede ${el.id} sem tipo ou nível: a consulta não a cobre`);
}

function secoesDe(a1: CenaA1, a3: CenaA3, perfis: ReturnType<typeof montarPerfisA3d>, b: CenaB1, b3: CenaB3 | null): Secoes {
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
  };
}

/**
 * Garante que a cena do Rust tem as seções do projeto `p` (envio completo quando o projeto mudou: a edição invalida o que depende dela). Com
 * `comJuncao`, as seções da B3 também; uma cena que as tinha as mantém. Lança `NaoCobertoB` (nada foi enviado) se a cena não cobre o projeto.
 */
export function sincronizarB(atual: EntradaB | null, p: Project, ger: GerenciadorKernelV2, comJuncao: boolean): EntradaB {
  let e = atual;
  if (e && e.ger !== ger) {
    e.cena?.destruir();
    e = null;
  }
  if (e && e.projeto === p && e.cena && (e.b3 !== null || !comJuncao)) return e;
  const a1 = montarCenaA1(p, true);
  const a3 = montarCenaA3(p, a1);
  verificarCobertura(p, a1, a3);
  const perfis = montarPerfisA3d(p, a1, true);
  const b = montarCenaB1(p, a1.materialDe);
  const b3 = comJuncao || e?.b3 ? montarCenaB3(p, a1) : null;
  const secoes = secoesDe(a1, a3, perfis, b, b3);
  if (!e) {
    const nova: EntradaB = { ger, cena: null, fonte: fonteDeSecoes(() => nova.secoes), secoes, a1, a3, b, b3, projeto: null };
    e = nova;
  }
  e.projeto = null;
  Object.assign(e, { secoes, a1, a3, b, b3 });
  if (e.cena) e.fonte(e.cena);
  else e.cena = CenaV2.criar(ger, e.fonte);
  e.projeto = p;
  return e;
}

/** Argumentos de `pisos_lajes_com_paredes` e de `junction_nivel` (os mesmos: o nível e a tolerância de junção do projeto). */
export const argumentosDaFatiaB = argumentosB2;

const inverso = <V>(m: ReadonlyMap<V, number>): Map<number, V> => new Map([...m].map(([k, n]) => [n, k] as const));

const PROBLEMAS: ReadonlyArray<OutlineProblem | null> = [null, 'aberto', 'fora'];

function numeroParaId(m: ReadonlyMap<number, Id>, n: number, o: string): Id {
  const id = m.get(n);
  if (id === undefined) throw new Error(`${o} ${n} da saída do Rust não existe no projeto`);
  return id;
}

/** O que a conversão precisa da cena que gerou a saída (guardado junto dela: a cena é substituída a cada edição do projeto). */
export interface MapasB {
  b: CenaB1;
  a1: CenaA1;
}

function camada(c: CamadaB1, material: ReadonlyMap<number, Id>): ResolvedFloorLayer & ResolvedSlabLayer {
  return {
    layerIndex: c.indice,
    materialId: numeroParaId(material, c.material, 'material'),
    z0: c.z0,
    z1: c.z1,
    priority: c.prioridade,
    core: c.nucleo,
    membrane: c.membrana,
    explicit: c.explicita,
    polygon: c.poligono,
  };
}

/** `ElementoB1` do Rust -> `ResolvedFloor` e `ResolvedSlab` do nível, na mesma ordem (pisos e depois lajes) e com os mesmos campos do TypeScript. */
export function converterPisosELajes(p: Project, levelId: Id, el: readonly ElementoB1[], m: MapasB): { pisos: ResolvedFloor[]; lajes: ResolvedSlab[] } {
  const piso = inverso(m.b.pisoDe);
  const laje = inverso(m.b.lajeDe);
  const tipoPiso = inverso(m.b.tipoPisoDe);
  const tipoLaje = inverso(m.b.tipoLajeDe);
  const material = inverso(m.b.materialDe);
  const pisos: ResolvedFloor[] = [];
  const lajes: ResolvedSlab[] = [];
  for (const e of el) {
    const base = {
      levelId,
      polygon: e.poligono,
      topZ: e.topoZ,
      bottomZ: e.baseZ,
      problem: PROBLEMAS[e.problema] ?? null,
    };
    const layers = e.camadas.map((c) => camada(c, material));
    if (e.laje) {
      const slabId = numeroParaId(laje, e.id, 'laje');
      const s = p.elements[slabId] as Slab;
      lajes.push({ slabId, typeId: numeroParaId(tipoLaje, e.tipo, 'tipo de laje'), ...base, slope: s.slope, layers });
    } else {
      pisos.push({ floorId: numeroParaId(piso, e.id, 'piso'), typeId: numeroParaId(tipoPiso, e.tipo, 'tipo de piso'), ...base, layers });
    }
  }
  return { pisos, lajes };
}

/** `JuncaoB3` do Rust -> `JunctionLevel` (o inverso de `referenciaB3De`; os cortadores não voltam: `levelCutterSet` segue no TypeScript). */
export function converterJuncao(levelId: Id, j: JuncaoB3, m: MapasB): JunctionLevel {
  const piso = inverso(m.b.pisoDe);
  const laje = inverso(m.b.lajeDe);
  const parede = inverso(m.a1.idDe);
  const prismas = (ps: ReadonlyArray<{ poligono: ResolvedPrism['poly']; z0: number; z1: number }>): ResolvedPrism[] => ps.map((x) => ({ poly: x.poligono, z0: x.z0, z1: x.z1 }));
  const elements = new Map<Id, ElementJunction>();
  for (const e of j.elementos) {
    const id = e.tipo === TIPO_B3.floor ? numeroParaId(piso, e.dono, 'piso') : numeroParaId(laje, e.dono, 'laje');
    elements.set(id, { cut: e.corte, layers: e.camadas.map((c) => ({ layerIndex: c.camada, parts: prismas(c.partes) })), region: e.regiao });
  }
  const walls = new Map<Id, WallJunction>();
  for (const w of j.paredes) {
    walls.set(numeroParaId(parede, w.parede, 'parede'), { cut: w.corte, bands: new Map(w.faixas.map((f) => [bandKey(f.camada, f.banda), prismas(f.partes)] as const)) });
  }
  return { levelId, elements, walls };
}

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
}

const LIMITE_MENSAGEM_B = 400;
const K_0049_B = 0.08;

/** O campo divergente de uma mensagem dos comparadores da B (`elemento 0 (piso 1), camada 2: z0: ...` -> `z0`). */
function campoDaMensagem(m: string): string {
  const resto = m.includes(': ') ? m.slice(m.indexOf(': ') + 2) : m;
  const campo = resto.split(/[:(]/)[0]!.replace(/\s+(?:-?[\d.e+-]+|true|false|null|undefined)\s*$/i, '').trim();
  return campo.slice(0, 40) || m.slice(0, 30);
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
  /** Saída do Rust por projeto e nível (`null`: a consulta falhou e a chamada ficou no TS; não se repete para o mesmo projeto e nível). */
  private readonly rustPisosELajes = new WeakMap<Project, Map<Id, { el: ElementoB1[]; mapas: MapasB } | null>>();
  private readonly rustJuncao = new WeakMap<Project, Map<Id, { juncao: JuncaoB3; mapas: MapasB } | null>>();
  private readonly memoPisosELajes = new WeakMap<Project, Map<Id, { pisos: ResolvedFloor[]; lajes: ResolvedSlab[] }>>();
  private readonly comparadosB = new WeakMap<Project, Set<string>>();
  /** Projetos que a cena da B não cobre (parede sem tipo ou nível, abertura sem tipo): vale o TS, sem remontar a cena a cada nível. */
  private readonly semCoberturaB = new WeakSet<Project>();

  constructor(private readonly ctx: ContextoB) {}

  /** O despachante de `resolveFloors`. */
  resolverPisos(p: Project, levelId: Id, ts: () => ResolvedFloor[]): ResolvedFloor[] {
    const ger = this.gerenciador();
    if (!ger) return ts();
    return this.ctx.sombra() ? this.emSombraPisosELajes(p, levelId, ts, ger, false) : (this.pisosELajesDoRust(p, levelId, ger)?.pisos ?? ts());
  }

  /** O despachante de `resolveSlabs`. */
  resolverLajes(p: Project, levelId: Id, ts: () => ResolvedSlab[]): ResolvedSlab[] {
    const ger = this.gerenciador();
    if (!ger) return ts();
    return this.ctx.sombra() ? this.emSombraPisosELajes(p, levelId, ts, ger, true) : (this.pisosELajesDoRust(p, levelId, ger)?.lajes ?? ts());
  }

  /**
   * O despachante de `junctionLevel`. Com a fatia B ligada, a junção vem do Rust (convertida para o formato do TS); o modo
   * sombra compara as duas. Qualquer falha (sem cena, conversão com erro) volta ao TypeScript, sem quebrar o app.
   */
  resolverJuncao(p: Project, levelId: Id, ts: () => JunctionLevel): JunctionLevel {
    const ger = this.gerenciador();
    if (!ger) return ts();
    if (this.ctx.sombra()) return this.emSombraJuncao(p, levelId, ts, ger);
    return this.juncaoDoRust(p, levelId, ger) ?? ts();
  }

  private readonly memoJuncao = new WeakMap<Project, Map<Id, JunctionLevel>>();

  /** A junção do Rust, convertida e guardada por projeto e nível (a conversão é cara; o projeto muda a cada edição). */
  private juncaoDoRust(p: Project, levelId: Id, ger: GerenciadorKernelV2): JunctionLevel | null {
    const guardado = this.memoJuncao.get(p)?.get(levelId);
    if (guardado) return guardado;
    const r = this.consultarJuncao(p, levelId, ger);
    if (!r) return null;
    const convertido = this.converter(() => converterJuncao(levelId, r.juncao, r.mapas));
    if (!convertido) return null;
    this.ctx.contar('entreguesB');
    let por = this.memoJuncao.get(p);
    if (!por) this.memoJuncao.set(p, (por = new Map()));
    por.set(levelId, convertido);
    return convertido;
  }

  /** O gerenciador, só com a fatia B ligada, o wasm pronto e fora da montagem da cena. */
  private gerenciador(): GerenciadorKernelV2 | null {
    if (!this.ctx.fatiaLigada() || this.montandoB) return null;
    const ger = this.ctx.gerenciador();
    return ger && ger.ligado ? ger : null;
  }

  private pisosELajesDoRust(p: Project, levelId: Id, ger: GerenciadorKernelV2): { pisos: ResolvedFloor[]; lajes: ResolvedSlab[] } | null {
    const guardado = this.memoPisosELajes.get(p)?.get(levelId);
    if (guardado) return guardado;
    const r = this.consultarPisosELajes(p, levelId, ger);
    if (!r) return null;
    const convertido = this.converter(() => converterPisosELajes(p, levelId, r.el, r.mapas));
    if (!convertido) return null;
    let por = this.memoPisosELajes.get(p);
    if (!por) this.memoPisosELajes.set(p, (por = new Map()));
    por.set(levelId, convertido);
    this.ctx.contar('entreguesB');
    return convertido;
  }

  /** Conversão para os tipos do TS: se a saída do Rust não casa com o projeto (id desconhecido), a chamada volta ao TS. */
  private converter<T>(f: () => T): T | null {
    try {
      return f();
    } catch (e) {
      this.ctx.erro(`conversão: ${textoDoErro(e)}`);
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
  private consultarB<T>(p: Project, ger: GerenciadorKernelV2, comJuncao: boolean, consulta: (e: EntradaB) => T): T | null {
    if (this.semCoberturaB.has(p)) return null;
    let fase: 'envio' | 'consulta' = 'envio';
    this.montandoB = true;
    try {
      const e = sincronizarB(this.cenaB, p, ger, comJuncao);
      this.cenaB = e;
      fase = 'consulta';
      return consulta(e);
    } catch (e) {
      this.ctx.erro(textoDoErro(e));
      if (e instanceof ErroKernelGrave) {
        // A cena já recriou a instância e repetiu; a chamada volta ao TS. As cenas são reenviadas por inteiro na próxima.
        this.ctx.contar('voltasGraves');
        this.ctx.aoGrave();
        if (this.cenaB) this.cenaB.projeto = null;
      } else {
        // Falha leve (ou projeto que a consulta não cobre): só esta chamada volta ao TS, sem recriar. Se o envio parou no meio, a cena fica suja.
        this.ctx.contar('voltasLeves');
        if (e instanceof NaoCobertoB) this.semCoberturaB.add(p);
        else if (fase === 'envio' && this.cenaB) this.cenaB.projeto = null;
      }
      return null;
    } finally {
      this.montandoB = false;
    }
  }

  private emSombraPisosELajes<T extends ResolvedFloor | ResolvedSlab>(p: Project, levelId: Id, ts: () => T[], ger: GerenciadorKernelV2, laje: boolean): T[] {
    const resultadoTs = ts();
    const chave = `${laje ? 'lajes' : 'pisos'}|${levelId}`;
    let feitos = this.comparadosB.get(p);
    if (!feitos) this.comparadosB.set(p, (feitos = new Set()));
    if (feitos.has(chave)) return resultadoTs;
    const r = this.consultarPisosELajes(p, levelId, ger);
    if (!r) return resultadoTs;
    feitos.add(chave);
    try {
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
      // Falha ao comparar não pode afetar o resultado: o TS já está em mãos.
      this.ctx.erro(`comparação: ${textoDoErro(e)}`);
    }
    return resultadoTs;
  }

  private emSombraJuncao(p: Project, levelId: Id, ts: () => JunctionLevel, ger: GerenciadorKernelV2): JunctionLevel {
    const resultadoTs = ts();
    const chave = `juncao|${levelId}`;
    let feitos = this.comparadosB.get(p);
    if (!feitos) this.comparadosB.set(p, (feitos = new Set()));
    if (feitos.has(chave)) return resultadoTs;
    const r = this.consultarJuncao(p, levelId, ger);
    if (!r) return resultadoTs;
    feitos.add(chave);
    try {
      // `levelCutterSet` é o do TS (nunca despachado); os pisos e as lajes que ele lê podem vir do Rust (equivalentes na B2).
      const ref = referenciaB3De(levelCutterSet(p, levelId), resultadoTs, r.mapas.b, r.mapas.a1);
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
    return resultadoTs;
  }

  /** Libera a cena da B no Rust (testes e troca de gerenciador). O estado é cache: a próxima chamada reconstrói. */
  encerrar(): void {
    this.cenaB?.cena?.destruir();
    this.cenaB = null;
  }
}
