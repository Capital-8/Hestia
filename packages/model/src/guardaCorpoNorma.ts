import type { Id, Project } from './types.ts';
import type { TipoGuardaCorpo } from './guardaCorpoTypes.ts';
import { t, type Lang } from './i18n.ts';

// Perfil de norma do guarda-corpo (decisão 0055, §4.3). Só gera avisos: nunca bloqueia nada.

/** Fonte de um limite: norma, item e se o valor foi verificado em texto público. */
export interface FonteNormaGC {
  norma: string;
  item: string;
  verificado: boolean;
}

/** Todos os limites são opcionais: `undefined` = não verificar. Metros, newtons, radianos. */
export interface LimitesNormaGC {
  // --- guarda ---
  /** Desnível a partir do qual a guarda é exigida (m). NBR 9077 4.8.1.1: 0,19. */
  desnivelExigeGuarda?: number;
  /** Altura mínima da guarda sobre piso, patamar, mezanino, varanda (m). */
  alturaMinima?: number;
  /** Altura mínima da guarda em escada INTERNA, medida da linha das quinas (m). */
  alturaMinimaEscadaInterna?: number;
  /** Altura mínima acima de uma cota de queda e o valor exigido ali (NBR 9077 4.8.1.3: 12 m → 1,30 m). */
  alturaMinimaAlta?: { acimaDe: number; altura: number };
  /** Maior esfera que não pode passar por nenhuma abertura da guarda (m). */
  esferaMaxima?: number;
  /** Idem, na abertura triangular entre degrau, espelho e trilho inferior. */
  esferaMaximaTriangulo?: number;
  /** Maior folga entre a base do preenchimento e o hospedeiro (m). */
  folgaInferiorMaxima?: number;
  /** Cargas de projeto (informativas: a verificação é "o tipo declara carga"). */
  cargaLinearHorizontal?: number; // N/m
  cargaAreaHorizontal?: number; // kPa
  cargaPontualGuarda?: number; // N
  // --- corrimão ---
  /** Faixa de altura do topo do corrimão (m), medida da linha das quinas em escada. */
  corrimaoAlturaMin?: number;
  corrimaoAlturaMax?: number;
  /** Alturas adicionais exigidas para o corrimão duplo (NBR 9050: 0,70 m). */
  corrimaoAlturasAdicionais?: number[];
  /** Diâmetro de seção circular (m). */
  corrimaoDiametroMin?: number;
  corrimaoDiametroMax?: number;
  /** Afastamento mínimo da parede/guarda (m). */
  corrimaoAfastamentoMin?: number;
  /** Prolongamento mínimo no início e no fim (m). */
  corrimaoExtensaoMin?: number;
  /** Exige corrimão nos dois lados. */
  corrimaoDoisLados?: boolean;
  /** Corrimão contínuo (sem interrupção) nos lances e patamares. */
  corrimaoContinuo?: boolean;
  /** Largura de escada acima da qual exige corrimão intermediário, e espaçamento máximo entre corrimãos (m). */
  corrimaoIntermediarioLargura?: number;
  corrimaoIntermediarioEspacamento?: number;
  cargaCorrimao?: number; // N
}

export interface PerfilNorma {
  id: Id;
  name: string;
  /** Código ISO 3166-1 alfa-2 ou 'XX' para personalizado. */
  pais: string;
  limites: LimitesNormaGC;
  /** Fonte por campo de `limites`. Campo sem fonte = valor do usuário. */
  fontes: Partial<Record<keyof LimitesNormaGC, FonteNormaGC>>;
  /** false = tem valores "a conferir": as mensagens acrescentam "(norma a conferir)". */
  verificado: boolean;
  /** Para onde a guarda vale (informativo). */
  uso: 'geral' | 'residencial' | 'publico' | 'saida-emergencia';
}

/** Perfil do projeto quando nenhum é escolhido: o Brasil composto. */
export const NORMA_GC_PADRAO_ID: Id = 'nbr-br';

const fonte = (norma: string, item: string, verificado: boolean): FonteNormaGC => ({ norma, item, verificado });

/** Presets de norma no idioma pedido. Os valores são os da decisão 0055 §4.3; os "a conferir" saem com `verificado: false`. */
export function perfisNormaPadrao(lang: Lang = 'pt'): Record<Id, PerfilNorma> {
  const br: PerfilNorma = {
    id: 'nbr-br',
    name: t(lang, 'md_gc_norm_br'),
    pais: 'BR',
    uso: 'geral',
    verificado: false,
    limites: {
      desnivelExigeGuarda: 0.19,
      alturaMinima: 1.1,
      alturaMinimaEscadaInterna: 0.92,
      alturaMinimaAlta: { acimaDe: 12, altura: 1.3 },
      esferaMaxima: 0.11,
      esferaMaximaTriangulo: 0.15,
      corrimaoAlturaMin: 0.8,
      corrimaoAlturaMax: 0.92,
      corrimaoAlturasAdicionais: [0.7],
      corrimaoDiametroMin: 0.038,
      corrimaoDiametroMax: 0.045,
      corrimaoAfastamentoMin: 0.04,
      corrimaoExtensaoMin: 0.3,
      corrimaoDoisLados: true,
      corrimaoIntermediarioLargura: 2.2,
      corrimaoIntermediarioEspacamento: 1.8,
      cargaLinearHorizontal: 1000,
      cargaAreaHorizontal: 1.2,
      cargaCorrimao: 900,
    },
    fontes: {
      desnivelExigeGuarda: fonte('NBR 9077', '4.8.1.1', true),
      alturaMinima: fonte('NBR 14718 / NBR 9077', '14718 (1,10 m, a conferir); 9077 4.8.1.2 (1,05 m)', false),
      alturaMinimaEscadaInterna: fonte('NBR 9077', '4.8.1.2', true),
      alturaMinimaAlta: fonte('NBR 9077', '4.8.1.3', true),
      esferaMaxima: fonte('NBR 14718 / NBR 9077', '14718 (110 mm, a conferir); 9077 4.8.1.4 (150 mm)', false),
      esferaMaximaTriangulo: fonte('NBR 9077', '4.8.1.4', true),
      corrimaoAlturaMin: fonte('NBR 9077', '4.8.2', true),
      corrimaoAlturaMax: fonte('NBR 9077', '4.8.2', true),
      corrimaoAlturasAdicionais: fonte('NBR 9050', 'corrimão duplo, 0,70 m (a conferir)', false),
      corrimaoDiametroMin: fonte('NBR 9077 / NBR 9050', '9077 4.8.2 (38 a 65 mm); 9050 (30 a 45 mm, a conferir): interseção', false),
      corrimaoDiametroMax: fonte('NBR 9077 / NBR 9050', '9077 4.8.2 (38 a 65 mm); 9050 (30 a 45 mm, a conferir): interseção', false),
      corrimaoAfastamentoMin: fonte('NBR 9077', '4.8.2', true),
      corrimaoExtensaoMin: fonte('NBR 9050', 'prolongamento 0,30 m (a conferir)', false),
      corrimaoDoisLados: fonte('NBR 9050', 'dois lados (a conferir)', false),
      corrimaoIntermediarioLargura: fonte('NBR 9077', '4.8.4.1', true),
      corrimaoIntermediarioEspacamento: fonte('NBR 9077', '4.8.4.1', true),
      cargaLinearHorizontal: fonte('NBR 14718', '1000 N/m (a conferir); 9077 4.8.3: 730 N/m', false),
      cargaAreaHorizontal: fonte('NBR 9077', '4.8.3', true),
      cargaCorrimao: fonte('NBR 9077', '4.8.3.2', true),
    },
  };
  const ibc: PerfilNorma = {
    id: 'ibc-us',
    name: t(lang, 'md_gc_norm_ibc'),
    pais: 'US',
    uso: 'geral',
    verificado: false,
    limites: {
      desnivelExigeGuarda: 0.762,
      alturaMinima: 1.067,
      alturaMinimaEscadaInterna: 1.067,
      esferaMaxima: 0.102,
      esferaMaximaTriangulo: 0.152,
      corrimaoAlturaMin: 0.864,
      corrimaoAlturaMax: 0.965,
      corrimaoDiametroMin: 0.032,
      corrimaoDiametroMax: 0.051,
      corrimaoAfastamentoMin: 0.038,
      corrimaoExtensaoMin: 0.305,
      corrimaoDoisLados: true,
      cargaLinearHorizontal: 730,
      cargaAreaHorizontal: 0.24,
      cargaCorrimao: 890,
    },
    fontes: {
      desnivelExigeGuarda: fonte('IBC 2021', '1015.3 (30 pol, a conferir)', false),
      alturaMinima: fonte('IBC 2021', '1015.3 (42 pol)', false),
      alturaMinimaEscadaInterna: fonte('IBC 2021', '1015.3 (42 pol)', false),
      esferaMaxima: fonte('IBC 2021', '1015.4 (4 pol)', false),
      esferaMaximaTriangulo: fonte('IBC 2021', '1015.4 (6 pol)', false),
      corrimaoAlturaMin: fonte('IBC 2021', 'corrimão de guarda R-3 (34 a 38 pol, a conferir)', false),
      corrimaoAlturaMax: fonte('IBC 2021', 'corrimão de guarda R-3 (34 a 38 pol, a conferir)', false),
      corrimaoDiametroMin: fonte('IBC 2021', 'pegada 1 1/4 a 2 pol (a conferir)', false),
      corrimaoDiametroMax: fonte('IBC 2021', 'pegada 1 1/4 a 2 pol (a conferir)', false),
      corrimaoAfastamentoMin: fonte('IBC 2021', 'folga 1 1/2 pol da parede (a conferir)', false),
      corrimaoExtensaoMin: fonte('IBC 2021', '12 pol (a conferir)', false),
      corrimaoDoisLados: fonte('IBC 2021', 'a conferir', false),
      cargaLinearHorizontal: fonte('ASCE 7 via IBC', '50 lbf/pé (a conferir)', false),
      cargaAreaHorizontal: fonte('ASCE 7 via IBC', '5 psf (a conferir)', false),
      cargaCorrimao: fonte('ASCE 7 via IBC', '200 lbf (a conferir)', false),
    },
  };
  const uk: PerfilNorma = {
    id: 'uk-k',
    name: t(lang, 'md_gc_norm_uk'),
    pais: 'GB',
    uso: 'geral',
    verificado: false,
    limites: {
      desnivelExigeGuarda: 0.6,
      alturaMinima: 1.1,
      alturaMinimaEscadaInterna: 0.9,
      esferaMaxima: 0.1,
      corrimaoAlturaMin: 0.9,
      corrimaoAlturaMax: 1.0,
      corrimaoExtensaoMin: 0.3,
      corrimaoDoisLados: false,
    },
    fontes: {
      desnivelExigeGuarda: fonte('Approved Document K', 'a conferir', false),
      alturaMinima: fonte('Approved Document K', '1,10 m sacada (a conferir); 0,90 m interno', false),
      alturaMinimaEscadaInterna: fonte('Approved Document K', '0,90 m (a conferir)', false),
      esferaMaxima: fonte('Approved Document K', '100 mm (a conferir)', false),
      corrimaoAlturaMin: fonte('Approved Document K', '0,90 a 1,00 m (a conferir)', false),
      corrimaoAlturaMax: fonte('Approved Document K', '0,90 a 1,00 m (a conferir)', false),
      corrimaoExtensaoMin: fonte('Approved Document K', '300 mm (a conferir)', false),
      corrimaoDoisLados: fonte('Approved Document K', 'a conferir', false),
    },
  };
  return { [br.id]: br, [ibc.id]: ibc, [uk.id]: uk };
}

/** Presets em PT (compatibilidade); use `perfisNormaPadrao(lang)` para o idioma ativo. */
export const PERFIS_NORMA_PADRAO: Record<Id, PerfilNorma> = perfisNormaPadrao('pt');

/**
 * Perfis disponíveis no projeto. Projeto sem `perfisNorma` lê os presets; o primeiro comando de escrita grava o
 * conjunto completo (ver `materializarPerfisNorma`), para que apagar um preset não o faça voltar.
 */
export function perfisNormaDo(p: Pick<Project, 'perfisNorma'>): Record<Id, PerfilNorma> {
  return p.perfisNorma ?? PERFIS_NORMA_PADRAO;
}

/** Grava os presets no projeto antes de uma escrita, se ainda não gravados. */
export function materializarPerfisNorma(p: Project, lang: Lang = 'pt'): Record<Id, PerfilNorma> {
  if (!p.perfisNorma) p.perfisNorma = perfisNormaPadrao(lang);
  return p.perfisNorma;
}

/** Perfil que vale para o tipo: o do próprio tipo, senão o do projeto, senão o Brasil composto. */
export function normaDe(p: Pick<Project, 'perfisNorma' | 'settings'>, tipo: Pick<TipoGuardaCorpo, 'normaId'> | null): PerfilNorma {
  const perfis = perfisNormaDo(p);
  const id = tipo?.normaId ?? p.settings.normaGuardaCorpoId ?? NORMA_GC_PADRAO_ID;
  const padrao = PERFIS_NORMA_PADRAO[NORMA_GC_PADRAO_ID];
  if (!padrao) throw new Error(`perfil de norma padrão ausente: ${NORMA_GC_PADRAO_ID}`);
  return perfis[id] ?? perfis[NORMA_GC_PADRAO_ID] ?? padrao;
}

/** 1ª mensagem de erro de um perfil de norma, ou null: nome vazio, limite não positivo, faixa invertida. */
export function perfilNormaIssue(perfil: PerfilNorma, lang: Lang = 'pt'): string | null {
  if (!perfil.name.trim()) return t(lang, 'md_gc_norm_name_empty');
  const l = perfil.limites;
  const positivos: Array<number | undefined> = [
    l.desnivelExigeGuarda,
    l.alturaMinima,
    l.alturaMinimaEscadaInterna,
    l.esferaMaxima,
    l.esferaMaximaTriangulo,
    l.folgaInferiorMaxima,
    l.corrimaoAlturaMin,
    l.corrimaoAlturaMax,
    l.corrimaoDiametroMin,
    l.corrimaoDiametroMax,
    l.corrimaoAfastamentoMin,
    l.corrimaoExtensaoMin,
    l.corrimaoIntermediarioLargura,
    l.corrimaoIntermediarioEspacamento,
    l.cargaLinearHorizontal,
    l.cargaAreaHorizontal,
    l.cargaPontualGuarda,
    l.cargaCorrimao,
    ...(l.corrimaoAlturasAdicionais ?? []),
  ];
  if (l.alturaMinimaAlta) positivos.push(l.alturaMinimaAlta.acimaDe, l.alturaMinimaAlta.altura);
  if (positivos.some((v) => v !== undefined && !(v > 0))) return t(lang, 'md_gc_norm_positive');
  if (l.corrimaoAlturaMin !== undefined && l.corrimaoAlturaMax !== undefined && l.corrimaoAlturaMin > l.corrimaoAlturaMax) {
    return t(lang, 'md_gc_norm_range');
  }
  if (l.corrimaoDiametroMin !== undefined && l.corrimaoDiametroMax !== undefined && l.corrimaoDiametroMin > l.corrimaoDiametroMax) {
    return t(lang, 'md_gc_norm_range');
  }
  return null;
}
