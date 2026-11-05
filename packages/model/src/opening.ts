import type { Id, OpeningLeaves, OpeningType, PlanSymbol, Project } from './types.ts';
import { t, type Lang } from './i18n.ts';
import { OPENING_SPAN_GAP_MAX } from './openingNominal.ts';
import { acabamentoIssue, openingCasing, type OpeningAcabamento } from './openingExtras.ts';
import { openingHardwareIssue, openingHardwareWarning } from './openingHardware.ts';
import { openingOptionSupport } from './openingSupport.ts';

/** Campos v2 do tipo conferidos ao salvar (todos opcionais: ausente vale o padrão por leitura). */
type OpeningTypeRuleFields = Partial<
  Pick<
    OpeningType,
    | 'width'
    | 'height'
    | 'leafStyle'
    | 'handle'
    | 'frameStyle'
    | 'grid'
    | 'transom'
    | 'sidelights'
    | 'angle2d'
    | 'angle3d'
    | 'planDisplay'
    | 'detail2d'
    | 'detail3d'
    | 'showSwing'
    | 'swingStyle'
    | 'leafPlan'
    | 'leafSide'
    | 'nominalRef'
    | 'spanGap'
    | 'reveal'
    | 'leafUndercut'
    | 'handleHeight'
    | 'handleInset'
    | 'hinges'
    | 'threshold'
  >
>;

type OpeningTypeRules = Pick<OpeningType, 'kind' | 'plan' | 'leaves'> & OpeningAcabamento & OpeningTypeRuleFields;

const LEAF_STYLES = ['flush', 'panel', 'glass', 'louver', 'grille'] as const;
const HANDLES = ['none', 'lever', 'knob', 'pull'] as const;
const FRAME_STYLES = ['rebate', 'simple', 'aduela', 'block'] as const;
const PLAN_DISPLAYS = ['symbolic', 'projected'] as const;
const DETAIL_2D = ['scale', 'low', 'mid', 'high', 'off'] as const;
const DETAIL_3D = ['view', 'schematic', 'simple', 'full', 'off'] as const;
const SWING_STYLES = ['arc', 'dash', 'line'] as const;
const LEAF_PLANS = ['open', 'closed', 'both'] as const;
const LEAF_SIDES = ['swing', 'opposite'] as const;
const NOMINAL_REFS = ['opening', 'leaf'] as const;
const REVEAL_MAX = 0.5;

const inSet = (v: unknown, valid: readonly string[]): boolean => typeof v === 'string' && valid.includes(v);

/** Ângulo de abertura em graus, dentro de 0..120. */
const angleOk = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 120;

/** Divisões do caixilho: inteiros de 1 a 8. */
const gridOk = (g: { cols: number; rows: number }): boolean =>
  Number.isInteger(g?.cols) && Number.isInteger(g?.rows) && g.cols >= 1 && g.cols <= 8 && g.rows >= 1 && g.rows <= 8;

/**
 * Confere os campos v2 opcionais (ângulos, divisões, bandeiras, conjuntos de estilo). Devolve a 1ª mensagem, ou null.
 * Campo ausente não é conferido: vale o padrão por leitura (`openingStyle.ts`).
 */
function openingStyleIssue(t: OpeningTypeRules): string | null {
  if (t.angle2d !== undefined && !angleOk(t.angle2d)) return 'Ângulo de abertura 2D: use um valor de 0 a 120°.';
  if (t.angle3d !== undefined && !angleOk(t.angle3d)) return 'Ângulo de abertura 3D: use um valor de 0 a 120°.';
  if (t.grid !== undefined && !gridOk(t.grid)) return 'Divisões do caixilho: use colunas e linhas inteiras de 1 a 8.';
  if (t.transom !== undefined) {
    const h = t.transom.height;
    if (typeof h !== 'number' || !Number.isFinite(h) || h <= 0 || (t.height !== undefined && h >= t.height)) {
      return 'Bandeira: a altura deve ser maior que 0 e menor que a altura do tipo.';
    }
  }
  if (t.sidelights !== undefined) {
    const w = t.sidelights.width;
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0 || (t.width !== undefined && w >= t.width)) {
      return 'Bandeira lateral: a largura deve ser maior que 0 e menor que a largura do tipo.';
    }
  }
  if (t.leafStyle !== undefined && !inSet(t.leafStyle, LEAF_STYLES)) return 'Estilo da folha desconhecido.';
  if (t.handle !== undefined && !inSet(t.handle, HANDLES)) return 'Maçaneta desconhecida.';
  if (t.frameStyle !== undefined && !inSet(t.frameStyle, FRAME_STYLES)) return 'Estilo do batente desconhecido.';
  if (t.planDisplay !== undefined && !inSet(t.planDisplay, PLAN_DISPLAYS)) return 'Exibição em planta desconhecida.';
  if (t.detail2d !== undefined && !inSet(t.detail2d, DETAIL_2D)) return 'Nível de detalhe 2D desconhecido.';
  if (t.detail3d !== undefined && !inSet(t.detail3d, DETAIL_3D)) return 'Nível de detalhe 3D desconhecido.';
  if (t.showSwing !== undefined && typeof t.showSwing !== 'boolean') return 'Arco de giro em planta: valor inválido.';
  if (t.swingStyle !== undefined && !inSet(t.swingStyle, SWING_STYLES)) return 'Estilo do arco de giro desconhecido.';
  if (t.leafPlan !== undefined && !inSet(t.leafPlan, LEAF_PLANS)) return 'Folha em planta desconhecida (aberta, fechada ou ambas).';
  if (t.leafSide !== undefined && !inSet(t.leafSide, LEAF_SIDES)) return 'Posição da folha desconhecida.';
  if (t.nominalRef !== undefined && !inSet(t.nominalRef, NOMINAL_REFS)) return 'Referência nominal desconhecida (vão ou folha).';
  if (t.spanGap !== undefined) {
    const { w, h } = t.spanGap;
    const ok = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= OPENING_SPAN_GAP_MAX;
    if (!ok(w) || !ok(h)) return `Folga do vão sobre a folha: use valores de 0 a ${Math.round(OPENING_SPAN_GAP_MAX * 100)} cm.`;
  }
  if (t.reveal !== undefined) {
    const d = t.reveal.depth;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0 || d > REVEAL_MAX) return `Recuo do batente: use um valor de 0 a ${Math.round(REVEAL_MAX * 100)} cm.`;
  }
  return null;
}

/**
 * Família de abertura (Revit: família da porta/janela; ArchiCAD: Library Part). A família define o COMPORTAMENTO e o
 * SÍMBOLO de planta e quais contagens de folhas ela aceita; o tipo (`OpeningType`) escolhe a família e os valores; a
 * instância (`Opening`) guarda a posição, o lado da dobradiça e o sentido de abertura.
 *
 * `double` e `pivot` continuam em `PlanSymbol` para ler arquivos antigos: `double` é o giro com duas folhas (o símbolo
 * normaliza, ver `normalize` em `geom/openingSymbol.ts`) e a porta pivotante é mantida por decisão do dono do projeto.
 */
export type OpeningFamilyId =
  | 'door_swing'
  | 'door_double'
  | 'door_sliding'
  | 'door_pivot'
  | 'door_void'
  | 'door_dblact'
  | 'door_pocket'
  | 'door_bifold'
  | 'door_accordion'
  | 'door_garage'
  | 'window_hinged'
  | 'window_hung'
  | 'window_pivot'
  | 'window_louver'
  | 'window_fixed'
  | 'window_tilt'
  | 'window_casement'
  | 'window_sliding'
  | 'window_void';

export interface OpeningFamily {
  id: OpeningFamilyId;
  kind: 'door' | 'window';
  /** Símbolo de planta da família. */
  plan: PlanSymbol;
  /**
   * Contagens de folhas aceitas pela família. Porta: 1 (giro e pivotante), 2 (dupla e correr) ou 0 (vão livre). Janela:
   * 1 (fixa, basculante e maxim-ar), 2 ou 3 (correr) ou 0 (vão livre).
   */
  leaves: readonly OpeningLeaves[];
  /** Nome para a interface. */
  name: string;
}

/**
 * Famílias aceitas, na ordem em que a interface as oferece. Portas e janelas de correr têm sempre duas folhas no
 * símbolo (as folhas se deslocam em faces opostas); a janela de correr aceita ainda três, que o símbolo desenha em
 * faixas paralelas.
 */
export function openingFamilyList(lang: Lang = 'pt'): readonly OpeningFamily[] {
  return [
    { id: 'door_swing', kind: 'door', plan: 'swing', leaves: [1], name: t(lang, 'md_of_door_swing') },
    { id: 'door_double', kind: 'door', plan: 'double', leaves: [2], name: t(lang, 'md_of_door_double') },
    { id: 'door_sliding', kind: 'door', plan: 'sliding', leaves: [2, 1], name: t(lang, 'md_of_door_sliding') },
    { id: 'door_pivot', kind: 'door', plan: 'pivot', leaves: [1], name: t(lang, 'md_of_door_pivot') },
    { id: 'door_dblact', kind: 'door', plan: 'dblact', leaves: [1, 2], name: t(lang, 'md_of_door_dblact') },
    { id: 'door_pocket', kind: 'door', plan: 'pocket', leaves: [1], name: t(lang, 'md_of_door_pocket') },
    { id: 'door_bifold', kind: 'door', plan: 'bifold', leaves: [2, 4], name: t(lang, 'md_of_door_bifold') },
    { id: 'door_accordion', kind: 'door', plan: 'accordion', leaves: [1], name: t(lang, 'md_of_door_accordion') },
    { id: 'door_garage', kind: 'door', plan: 'garage', leaves: [1], name: t(lang, 'md_of_door_garage') },
    { id: 'door_void', kind: 'door', plan: 'swing', leaves: [0], name: t(lang, 'md_of_door_void') },
    { id: 'window_fixed', kind: 'window', plan: 'fixed', leaves: [1], name: t(lang, 'md_of_window_fixed') },
    { id: 'window_hinged', kind: 'window', plan: 'hinged', leaves: [1, 2], name: t(lang, 'md_of_window_hinged') },
    { id: 'window_tilt', kind: 'window', plan: 'tilt', leaves: [1], name: t(lang, 'md_of_window_tilt') },
    { id: 'window_casement', kind: 'window', plan: 'casement', leaves: [1], name: t(lang, 'md_of_window_casement') },
    { id: 'window_sliding', kind: 'window', plan: 'sliding', leaves: [2, 3, 4], name: t(lang, 'md_of_window_sliding') },
    { id: 'window_hung', kind: 'window', plan: 'hung', leaves: [2], name: t(lang, 'md_of_window_hung') },
    { id: 'window_pivot', kind: 'window', plan: 'pivotwin', leaves: [1], name: t(lang, 'md_of_window_pivot') },
    { id: 'window_louver', kind: 'window', plan: 'louver', leaves: [1], name: t(lang, 'md_of_window_louver') },
    { id: 'window_void', kind: 'window', plan: 'fixed', leaves: [0], name: t(lang, 'md_of_window_void') },
  ];
}

/** Famílias em PT (compatibilidade); use `openingFamilyList(lang)` para o idioma ativo. */
export const OPENING_FAMILIES: readonly OpeningFamily[] = openingFamilyList('pt');

/** Famílias de porta ou de janela, na ordem da interface, no idioma pedido. */
export function openingFamilies(kind: OpeningType['kind'], lang: Lang = 'pt'): OpeningFamily[] {
  return openingFamilyList(lang).filter((f) => f.kind === kind);
}

/**
 * Família de um tipo de abertura, ou null quando a combinação (símbolo × folhas) não existe. O vão livre tem 0 folhas:
 * na porta o símbolo é o arco e na janela é a fixa, porque sem folha o desenho é só a soleira tracejada.
 */
export function openingFamilyOf(t: Pick<OpeningType, 'kind' | 'plan' | 'leaves'>): OpeningFamily | null {
  const families = openingFamilies(t.kind);
  const exact = families.find((f) => f.plan === t.plan && f.leaves.includes(t.leaves));
  if (exact) return exact;
  // Porta de duas folhas: o arquivo antigo guarda `double` e o editor pode gravar `swing` com 2 folhas. Os dois são a
  // mesma família (o símbolo normaliza `double` para `swing` com 2 folhas).
  if (t.kind === 'door' && t.leaves === 2 && (t.plan === 'swing' || t.plan === 'double')) {
    return families.find((f) => f.id === 'door_double') ?? null;
  }
  return null;
}

/** Contagens de folhas aceitas pelo tipo, ou vazio quando a família não existe. */
export function openingLeaves(t: Pick<OpeningType, 'kind' | 'plan' | 'leaves'>): readonly OpeningLeaves[] {
  return openingFamilyOf(t)?.leaves ?? [];
}

/** Nome da família do tipo ("Porta de giro"), ou null quando a combinação não existe. */
export function openingFamilyName(t: Pick<OpeningType, 'kind' | 'plan' | 'leaves'>): string | null {
  return openingFamilyOf(t)?.name ?? null;
}

/**
 * Regra do tipo que o modelo confere ao salvar (`upsertOpeningType`): a família e a contagem de folhas têm de existir, e o acabamento tem de estar nos limites.
 * Devolve a 1ª mensagem, ou null. O tipo é um schema fechado (nada de parâmetros autorais como no Revit): o que não
 * está em `OPENING_FAMILIES` não é desenhável e por isso é recusado.
 */
export function openingTypeIssue(t: OpeningTypeRules): string | null {
  if (!openingFamilyOf(t)) {
    const kind = t.kind === 'door' ? 'porta' : 'janela';
    const leaves = t.leaves === 0 ? 'sem folha (vão livre)' : `${t.leaves} folha${t.leaves > 1 ? 's' : ''}`;
    return `Combinação inválida: ${kind} com o símbolo "${t.plan}" e ${leaves}.`;
  }
  return acabamentoIssue(t) ?? openingStyleIssue(t) ?? openingHardwareIssue(t, openingOptionSupport(openingFamilyOf(t)?.id));
}

/**
 * Aviso (não erro) do tipo: alizar e retorno do acabamento são exclusivos (como no ArchiCAD); com alizar, o
 * `closure` explícito é ignorado e o vão não ganha retorno. A interface pode mostrar o texto.
 */
export function openingTypeWarning(t: Pick<OpeningType, 'closure' | 'casing'> & Partial<Pick<OpeningType, 'kind' | 'plan' | 'leaves' | 'handleHeight'>>): string | null {
  if (t.closure !== undefined && t.closure !== 'inherit' && openingCasing(t)) {
    return 'Com alizar, o retorno do acabamento no vão não é gerado (os dois são exclusivos).';
  }
  // Sem a família (tipo parcial), não há como saber se a maçaneta vale: o aviso da altura só sai com o tipo completo.
  if (t.kind === undefined || t.plan === undefined || t.leaves === undefined) return null;
  return openingHardwareWarning(t, openingOptionSupport(openingFamilyOf({ kind: t.kind, plan: t.plan, leaves: t.leaves })?.id));
}

/** Tipos favoritos do projeto, na ordem gravada (vazio quando não há nenhum). */
export function openingFavorites(p: Pick<Project, 'settings'>): Id[] {
  return p.settings?.favoriteOpeningTypes ?? [];
}

/** Lista de favoritos depois de ligar/desligar um tipo (função pura; o comando grava o resultado). */
export function nextOpeningFavorite(list: readonly Id[], id: Id): Id[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Liga ou desliga o favorito de um tipo no projeto (muda `p` no lugar, para uso do comando). */
export function toggleFavoriteIn(p: Project, id: Id): void {
  if (!p.openingTypes[id]) throw new Error('Tipo de abertura inexistente');
  p.settings = { ...p.settings, favoriteOpeningTypes: nextOpeningFavorite(p.settings.favoriteOpeningTypes ?? [], id) };
}
