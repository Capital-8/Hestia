import { isGuardaCorpo, normaDe, type GuardaCorpo, type Id, type LimitesNormaGC, type PerfilNorma, type Project, type TipoGuardaCorpo } from '@hestia/model';
import type { Lang } from './i18nMessages.ts';

/** Aviso de guarda-corpo (molde de `StairIssueItem`). Nunca bloqueia; 'error' só para modelo inválido. */
export interface GuardaCorpoIssueItem {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  guardaId: Id;
  trecho?: number;
  ids?: string[];
}

/** Medida devolvida por `guarda_avisos` (decodificada). */
export interface MedidaAvisoGC {
  guardaId: Id;
  codigo: number;
  trecho: number;
  indice: number;
  medido: number;
  limite: number;
  x: number;
  y: number;
  z: number;
}

/** Código numérico de `guarda_avisos` (igual a `gc_avisos.rs`) para o código textual. */
export const CODIGO_AVISO_GC: Record<number, string> = {
  1: 'gc-vao-grande',
  2: 'gc-vao-inferior',
  3: 'gc-corrimao-altura',
  4: 'gc-corrimao-extensao',
  5: 'gc-altura-baixa',
};

// Estas mensagens ficam aqui, em pt e en (os demais idiomas caem em pt), para não tocar o dicionário `egb_` espelhado no app.
const MSG = {
  pt: {
    conferir: ' (norma a conferir)',
    'gc-altura-baixa': 'Guarda-corpo com {medido} m de altura; a norma pede no mínimo {limite} m.',
    'gc-vao-grande': 'Abertura em que passa esfera de {medido} m; o máximo é {limite} m.',
    'gc-vao-inferior': 'Folga inferior de {medido} m; o máximo é {limite} m.',
    'gc-corrimao-altura': 'Topo do corrimão a {medido} m; o limite mais próximo é {limite} m.',
    'gc-corrimao-extensao': 'Extensão do corrimão de {medido} m; o mínimo é {limite} m.',
    'gc-corrimao-diametro': 'Corrimão com {medido} m de diâmetro; a faixa é de {min} a {max} m.',
    'gc-corrimao-forma': 'Corrimão de seção não circular: confira a preensão.',
    'gc-corrimao-afastamento': 'Afastamento do corrimão de {medido} m; o mínimo é {limite} m.',
    'gc-carga-nao-declarada': 'O tipo não declara carga {carga} de pelo menos {limite} {unidade}.',
  },
  en: {
    conferir: ' (code to be checked)',
    'gc-altura-baixa': 'Railing is {medido} m high; the code asks for at least {limite} m.',
    'gc-vao-grande': 'Opening lets a {medido} m sphere through; the maximum is {limite} m.',
    'gc-vao-inferior': 'Bottom gap of {medido} m; the maximum is {limite} m.',
    'gc-corrimao-altura': 'Handrail top at {medido} m; the nearest limit is {limite} m.',
    'gc-corrimao-extensao': 'Handrail extension of {medido} m; the minimum is {limite} m.',
    'gc-corrimao-diametro': 'Handrail diameter {medido} m; the range is {min} to {max} m.',
    'gc-corrimao-forma': 'Non-circular handrail section: check the grip.',
    'gc-corrimao-afastamento': 'Handrail clearance of {medido} m; the minimum is {limite} m.',
    'gc-carga-nao-declarada': 'The type does not declare a {carga} load of at least {limite} {unidade}.',
  },
} as const;
type Chave = Exclude<keyof (typeof MSG)['pt'], 'conferir'>;

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);
function msg(lang: Lang, key: Chave, args: Record<string, string | number>, conferir: boolean): string {
  const d = lang === 'en' ? MSG.en : MSG.pt;
  const base = d[key].replace(/\{(\w+)\}/g, (w, n: string) => {
    const v = args[n];
    return v === undefined ? w : typeof v === 'number' ? fmt(v) : v;
  });
  return conferir ? base + d.conferir : base;
}

/** O limite ainda precisa ser conferido: a fonte do campo não é verificada ou, sem fonte, o perfil inteiro não é. */
export function precisaConferir(norma: PerfilNorma, campo: keyof LimitesNormaGC): boolean {
  const f = norma.fontes[campo];
  return f ? !f.verificado : !norma.verificado;
}

function item(g: Id, code: string, message: string, trecho?: number): GuardaCorpoIssueItem {
  const i: GuardaCorpoIssueItem = { code, severity: 'warning', message, guardaId: g, ids: [g] };
  if (trecho !== undefined) i.trecho = trecho;
  return i;
}

/** Regras que dependem só da configuração (tipo, instância e norma); não esperam o Rust. */
export function guardaCorpoRegrasDoTipo(g: GuardaCorpo, tipo: TipoGuardaCorpo, norma: PerfilNorma, lang: Lang = 'pt'): GuardaCorpoIssueItem[] {
  const out: GuardaCorpoIssueItem[] = [];
  const l = norma.limites;
  const altura = g.altura ?? tipo.altura;
  if (l.alturaMinima !== undefined && altura < l.alturaMinima - 1e-9) {
    out.push(item(g.id, 'gc-altura-baixa', msg(lang, 'gc-altura-baixa', { medido: altura, limite: l.alturaMinima }, precisaConferir(norma, 'alturaMinima'))));
  }
  for (const c of tipo.corrimaos) {
    if (c.funcao !== 'corrimao') continue;
    const { corrimaoDiametroMin: min, corrimaoDiametroMax: max } = l;
    if (c.perfil.forma === 'circular') {
      if ((min !== undefined && c.perfil.largura < min - 1e-9) || (max !== undefined && c.perfil.largura > max + 1e-9)) {
        out.push(item(g.id, 'gc-corrimao-diametro', msg(lang, 'gc-corrimao-diametro', { medido: c.perfil.largura, min: min ?? 0, max: max ?? 'sem limite' }, precisaConferir(norma, 'corrimaoDiametroMin'))));
      }
    } else if (min !== undefined || max !== undefined) {
      out.push(item(g.id, 'gc-corrimao-diametro', msg(lang, 'gc-corrimao-forma', {}, false)));
    }
    if (l.corrimaoAfastamentoMin !== undefined && c.afastamento < l.corrimaoAfastamentoMin - 1e-9) {
      out.push(item(g.id, 'gc-corrimao-afastamento', msg(lang, 'gc-corrimao-afastamento', { medido: c.afastamento, limite: l.corrimaoAfastamentoMin }, precisaConferir(norma, 'corrimaoAfastamentoMin'))));
    }
  }
  const carga = (campo: 'cargaLinear' | 'cargaArea' | 'cargaPontual', lim: number | undefined, limCampo: keyof LimitesNormaGC, unidade: string): void => {
    if (lim === undefined) return;
    const v = tipo[campo];
    if (v === null || v < lim) out.push(item(g.id, 'gc-carga-nao-declarada', msg(lang, 'gc-carga-nao-declarada', { carga: campo, limite: lim, unidade }, precisaConferir(norma, limCampo))));
  };
  carga('cargaLinear', l.cargaLinearHorizontal, 'cargaLinearHorizontal', 'N/m');
  carga('cargaArea', l.cargaAreaHorizontal, 'cargaAreaHorizontal', 'kPa');
  carga('cargaPontual', l.cargaPontualGuarda, 'cargaPontualGuarda', 'N');
  return out;
}

const CAMPO_DO_CODIGO: Record<string, keyof LimitesNormaGC> = {
  'gc-altura-baixa': 'alturaMinima',
  'gc-vao-grande': 'esferaMaxima',
  'gc-vao-inferior': 'folgaInferiorMaxima',
  'gc-corrimao-altura': 'corrimaoAlturaMin',
  'gc-corrimao-extensao': 'corrimaoExtensaoMin',
};

/** Traduz as medidas do Rust em avisos (texto e sufixo "a conferir"). Código desconhecido é ignorado. */
export function guardaCorpoMedidasParaAvisos(medidas: readonly MedidaAvisoGC[], norma: PerfilNorma, lang: Lang = 'pt'): GuardaCorpoIssueItem[] {
  const out: GuardaCorpoIssueItem[] = [];
  for (const m of medidas) {
    const code = CODIGO_AVISO_GC[m.codigo];
    const campo = code ? CAMPO_DO_CODIGO[code] : undefined;
    if (!code || !campo) continue;
    out.push(item(m.guardaId, code, msg(lang, code as Chave, { medido: m.medido, limite: m.limite }, precisaConferir(norma, campo)), m.trecho));
  }
  return out;
}

/** Avisos de configuração do projeto (cada guarda-corpo contra a norma do seu tipo ou da sua instância). Ordem estável. */
export function guardaCorpoIssues(p: Project, lang: Lang = 'pt'): GuardaCorpoIssueItem[] {
  const out: GuardaCorpoIssueItem[] = [];
  const gs = Object.values(p.elements).filter(isGuardaCorpo).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const g of gs) {
    const tipo = p.tiposGuardaCorpo[g.typeId];
    if (!tipo) continue;
    const alvo = g.sobrescritas?.normaId ? { normaId: g.sobrescritas.normaId } : tipo;
    out.push(...guardaCorpoRegrasDoTipo(g, tipo, normaDe(p, alvo), lang));
  }
  return out;
}
