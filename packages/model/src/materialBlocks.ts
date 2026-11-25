import type { HatchKind, Material } from './types.ts';

/**
 * Blocos opcionais do `Material` (decisão 0056). Ausente = comportamento anterior; nenhum projeto antigo muda.
 * Regra de precedência (UMA só, em `materialEfetivo`): o que o TIPO do elemento define (ex.: hachura do tipo de
 * piso/forro) ganha do material; o material ganha do padrão do tema. Dentro do material, `graficos`/`aparencia`
 * ganham de `color`/`hatch`/`gloss`/`opacity`, que continuam sendo o valor de reserva.
 */

export interface MaterialIdentidade {
  descricao?: string;
  classe?: string;
  comentarios?: string;
  fabricante?: string;
  modelo?: string;
  url?: string;
  palavrasChave?: string[];
}

/** Padrão + cor. `cor` ausente = o render escolhe o valor padrão (mistura da cor do material com preto/branco). */
export interface PadraoCor {
  padrao?: HatchKind;
  cor?: string;
}

export interface CamadasGraficas {
  primeiroPlano?: PadraoCor;
  planoDeFundo?: PadraoCor;
}

export interface MaterialGraficos {
  sombreamento?: { cor?: string; /** 0 = opaco … 1 = invisível. */ transparencia?: number; usarAparenciaRender?: boolean };
  /** Superfície visível (piso, forro, cobertura em planta). */
  superficie?: CamadasGraficas;
  /** Elemento cortado (parede, laje em planta e corte). */
  corte?: CamadasGraficas;
}

/** TODO(etapa futura): textura por imagem no 3D (imagem no zip, UV triplanar, escala real). Só os campos agora. */
export interface MaterialTextura {
  imagemId: string;
  escalaMetros: number;
  rotacao: number;
  deslocamento: [number, number];
  repetir: boolean;
}

export interface MaterialAparencia {
  cor?: string;
  /** 0 liso … 1 áspero. */
  rugosidade?: number;
  metal?: number;
  opacidade?: number;
  textura?: MaterialTextura;
}

/** Só dados, para uso futuro. */
export interface MaterialFisico {
  densidade?: number;
  resistenciaCompressao?: number;
  resistenciaTracao?: number;
  moduloElasticidade?: number;
  condutividade?: number;
  dilatacao?: number;
}

/** Só dados. TODO(etapa futura): cálculo térmico no kernel Rust. */
export interface MaterialTermico {
  condutividadeTermica?: number;
  calorEspecifico?: number;
  densidade?: number;
  emissividade?: number;
  porosidade?: number;
  permeabilidade?: number;
}

/** Camada resolvida: sempre com padrão; `cor` pode ficar indefinida (= valor padrão do render). */
export interface CamadaEfetiva {
  padrao: HatchKind;
  cor: string | undefined;
}

export interface MaterialEfetivo {
  sombreamento: { cor: string; transparencia: number; usarAparenciaRender: boolean };
  superficie: { primeiroPlano: CamadaEfetiva; planoDeFundo: { padrao: HatchKind; cor: string } };
  corte: { primeiroPlano: CamadaEfetiva; planoDeFundo: { padrao: HatchKind; cor: string } };
  aparencia: { cor: string; rugosidade: number; metal: number; opacidade: number; textura: MaterialTextura | undefined };
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const corOu = (c: string | undefined, reserva: string): string => (c !== undefined && HEX.test(c) ? c : reserva);
const corOuNada = (c: string | undefined): string | undefined => (c !== undefined && HEX.test(c) ? c : undefined);
const unit = (n: number | undefined, reserva: number): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : reserva);

function camada(c: PadraoCor | undefined, padraoReserva: HatchKind): CamadaEfetiva {
  return { padrao: c?.padrao ?? padraoReserva, cor: corOuNada(c?.cor) };
}

function fundo(c: PadraoCor | undefined, corReserva: string): { padrao: HatchKind; cor: string } {
  return { padrao: c?.padrao ?? 'solid', cor: corOu(c?.cor, corReserva) };
}

/**
 * Resolve o material com todos os campos preenchidos. Sem blocos novos, devolve exatamente o que o render lia antes:
 * fundo sólido com `color`, primeiro plano com `hatch` (cor indefinida = mistura padrão), aparência com color/opacity
 * e rugosidade `1 - gloss * 0.75` (a mesma do 3D de hoje).
 * O chamador aplica a precedência do tipo do elemento: se o tipo define a hachura, ela substitui `primeiroPlano.padrao`.
 */
export function materialEfetivo(m: Material): MaterialEfetivo {
  const g = m.graficos;
  const a = m.aparencia;
  const usarRender = g?.sombreamento?.usarAparenciaRender ?? false;
  // Com `usarAparenciaRender`, o sombreamento acompanha a aparência; senão cai em color/opacity (comportamento anterior).
  const sombCor = corOu(g?.sombreamento?.cor, usarRender ? corOu(a?.cor, m.color) : m.color);
  return {
    sombreamento: {
      cor: sombCor,
      transparencia: unit(g?.sombreamento?.transparencia, 1 - (usarRender ? unit(a?.opacidade, m.opacity) : m.opacity)),
      usarAparenciaRender: usarRender,
    },
    superficie: { primeiroPlano: camada(g?.superficie?.primeiroPlano, m.hatch), planoDeFundo: fundo(g?.superficie?.planoDeFundo, sombCor) },
    corte: { primeiroPlano: camada(g?.corte?.primeiroPlano, m.hatch), planoDeFundo: fundo(g?.corte?.planoDeFundo, sombCor) },
    aparencia: {
      cor: corOu(a?.cor, m.color),
      rugosidade: unit(a?.rugosidade, 1 - m.gloss * 0.75),
      metal: unit(a?.metal, 0),
      opacidade: unit(a?.opacidade, m.opacity),
      textura: a?.textura,
    },
  };
}

const HATCHES: ReadonlySet<string> = new Set(['solid', 'diagonal', 'cross', 'dots', 'gesso', 'none', 'brick', 'concrete', 'timber', 'insulation', 'earth', 'cmu', 'exposedBrick', 'rcConcrete', 'stone', 'gravel', 'sand', 'eps', 'woolZigzag', 'gypsum', 'timberEnd', 'steel']);

function limpaCamada(c: unknown): PadraoCor | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  const out: PadraoCor = {};
  if (typeof o.padrao === 'string' && HATCHES.has(o.padrao)) out.padrao = o.padrao as HatchKind;
  if (typeof o.cor === 'string' && HEX.test(o.cor)) out.cor = o.cor;
  return Object.keys(out).length ? out : undefined;
}

function limpaCamadas(c: unknown): CamadasGraficas | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, unknown>;
  const out: CamadasGraficas = {};
  const pp = limpaCamada(o.primeiroPlano);
  const pf = limpaCamada(o.planoDeFundo);
  if (pp) out.primeiroPlano = pp;
  if (pf) out.planoDeFundo = pf;
  return Object.keys(out).length ? out : undefined;
}

function numeros<K extends string>(raw: unknown, chaves: readonly K[]): Partial<Record<K, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const out: Partial<Record<K, number>> = {};
  for (const k of chaves) if (typeof o[k] === 'number' && Number.isFinite(o[k])) out[k] = o[k] as number;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validação defensiva de um material vindo de arquivo: descarta valores inválidos dos blocos opcionais em vez de
 * rejeitar o projeto. Projeto antigo (sem blocos) passa intacto, mesma referência.
 */
export function normalizarMaterial(m: Material): Material {
  const r = m as unknown as Record<string, unknown>;
  if (r.identidade === undefined && r.graficos === undefined && r.aparencia === undefined && r.fisico === undefined && r.termico === undefined) return m;
  const { identidade: _i, graficos: _g, aparencia: _a, fisico: _f, termico: _t, ...base } = r;
  const out: Record<string, unknown> = { ...base };

  const id = r.identidade as Record<string, unknown> | undefined;
  if (id && typeof id === 'object') {
    const ident: MaterialIdentidade = {};
    for (const k of ['descricao', 'classe', 'comentarios', 'fabricante', 'modelo', 'url'] as const) if (typeof id[k] === 'string') ident[k] = id[k] as string;
    if (Array.isArray(id.palavrasChave)) ident.palavrasChave = id.palavrasChave.filter((x): x is string => typeof x === 'string');
    if (Object.keys(ident).length) out.identidade = ident;
  }

  const g = r.graficos as Record<string, unknown> | undefined;
  if (g && typeof g === 'object') {
    const graf: MaterialGraficos = {};
    const s = g.sombreamento as Record<string, unknown> | undefined;
    if (s && typeof s === 'object') {
      const sb: NonNullable<MaterialGraficos['sombreamento']> = {};
      if (typeof s.cor === 'string' && HEX.test(s.cor)) sb.cor = s.cor;
      if (typeof s.transparencia === 'number' && Number.isFinite(s.transparencia)) sb.transparencia = unit(s.transparencia, 0);
      if (typeof s.usarAparenciaRender === 'boolean') sb.usarAparenciaRender = s.usarAparenciaRender;
      if (Object.keys(sb).length) graf.sombreamento = sb;
    }
    const sup = limpaCamadas(g.superficie);
    const cor = limpaCamadas(g.corte);
    if (sup) graf.superficie = sup;
    if (cor) graf.corte = cor;
    if (Object.keys(graf).length) out.graficos = graf;
  }

  const a = r.aparencia as Record<string, unknown> | undefined;
  if (a && typeof a === 'object') {
    const ap: MaterialAparencia = { ...(numeros(a, ['rugosidade', 'metal', 'opacidade'] as const) ?? {}) };
    for (const k of ['rugosidade', 'metal', 'opacidade'] as const) if (ap[k] !== undefined) ap[k] = unit(ap[k], 0);
    if (typeof a.cor === 'string' && HEX.test(a.cor)) ap.cor = a.cor;
    const t = a.textura as Record<string, unknown> | undefined;
    if (t && typeof t === 'object' && typeof t.imagemId === 'string' && typeof t.escalaMetros === 'number' && t.escalaMetros > 0) {
      const d = Array.isArray(t.deslocamento) && t.deslocamento.length === 2 && t.deslocamento.every((x) => typeof x === 'number') ? (t.deslocamento as [number, number]) : ([0, 0] as [number, number]);
      ap.textura = { imagemId: t.imagemId, escalaMetros: t.escalaMetros, rotacao: typeof t.rotacao === 'number' ? t.rotacao : 0, deslocamento: d, repetir: t.repetir !== false };
    }
    if (Object.keys(ap).length) out.aparencia = ap;
  }

  const f = numeros(r.fisico, ['densidade', 'resistenciaCompressao', 'resistenciaTracao', 'moduloElasticidade', 'condutividade', 'dilatacao'] as const);
  if (f) out.fisico = f;
  const t = numeros(r.termico, ['condutividadeTermica', 'calorEspecifico', 'densidade', 'emissividade', 'porosidade', 'permeabilidade'] as const);
  if (t) out.termico = t;
  return out as unknown as Material;
}
