import { TOOL_LABEL, toolLabelLang, type ToolId } from './registry.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Atalhos padrão, em dados. Um comando é uma ferramenta do registro ou a tela de atalhos (`atalhos`).
 * A sequência é de letras e dígitos (ex.: `WA`); o usuário altera pela tela "Atalhos de teclado" e o app guarda a alteração.
 */
export type ShortcutCommand = ToolId | 'atalhos' | 'unidades' | 'createSimilar'
  | 'temporaryHide' | 'temporaryIsolate' | 'temporaryCategory' | 'isolateCategory'
  | 'resetTemporary' | 'hideInView' | 'hideCategoryInView' | 'revealHidden'
  | 'unhideInView' | 'unhideCategoryInView';
export type ShortcutProfile = 'revit' | 'simples';
export type ShortcutMap = Partial<Record<ShortcutCommand, string>>;

/**
 * Perfil Revit (padrão): sequências de duas letras, como no Revit (parede WA).
 * Selecionar não tem tecla: o Esc cancela o passo e volta à seleção.
 * As sequências livres de conflito dos comandos sem atalho no Revit: Extrusão de telhado (TE), Separador de ambiente (RS), Atalhos de teclado (KS), Unidades do projeto (UN) e Criar semelhante (CS).
 */
export const PERFIL_REVIT: ShortcutMap = {
  wall: 'WA', door: 'DR', window: 'WN', curtainDoor: 'CP', curtainWindow: 'CJ', floor: 'SB', slab: 'LJ', ceiling: 'FR', slope: 'IN', roof: 'TL', roofarrow: 'SI', roofextrusion: 'TE',
  attachroof: 'AT', detachroof: 'DT', stair: 'ES', stairrun: 'LE', ramp: 'RA', railing: 'GC', room: 'RM', roomsep: 'RS', dimension: 'DI', angularDimension: 'DA', text: 'TX',
  move: 'MV', copy: 'CO', rotate: 'RO', mirror: 'MM', array: 'AR', offset: 'OF', parallel: 'PP', trim: 'TR', align: 'AL', joins: 'UG',
  split: 'SL', measure: 'ME', level: 'LL', section: 'CT', rehost: 'TH', atalhos: 'KS', unidades: 'UN', createSimilar: 'CS',
  detailLine: 'DL', filledRegion: 'RP', tag: 'TG', grid: 'GR',
  // Visibilidade (Revit): HH/HC/HI/IC/HR são temporários; EH/VH são permanentes na vista; RH revela; EU/VU reexibe.
  temporaryHide: 'HH', temporaryCategory: 'HC', temporaryIsolate: 'HI', isolateCategory: 'IC', resetTemporary: 'HR',
  hideInView: 'EH', hideCategoryInView: 'VH', revealHidden: 'RH', unhideInView: 'EU', unhideCategoryInView: 'VU',
};

/**
 * Perfil simples: uma tecla por comando (as letras atuais do app).
 * Sem letra livre para as ferramentas novas (forro, inclinação, seta, extrusão, anexar/desanexar, separador de ambiente) e para o atalho da tela:
 * usam os dígitos 1 a 8, que não conflitam com as letras (o "K" da Corte impediria "KS" por prefixo).
 * Etiqueta (VT), Grade (VG), Unidades (VU) e Criar semelhante (VS) dividem a letra V: acabaram as teclas livres, então usam duas teclas.
 */
export const PERFIL_SIMPLES: ShortcutMap = {
  wall: 'W', floor: 'F', slab: 'B', roof: 'U', door: 'D', window: 'J', curtainDoor: 'VK', curtainWindow: 'VJ', move: 'M', copy: 'C', rotate: 'R', mirror: 'S', array: 'A', offset: 'O',
  parallel: 'G', trim: 'T', align: 'L', joins: 'N', split: 'P', measure: 'E', level: 'VL', section: 'K', rehost: 'H', stair: 'I', stairrun: 'Q', ramp: ',', railing: 'VC',
  dimension: 'Y', angularDimension: 'VD', text: 'X', room: 'Z',
  ceiling: '1', slope: '2', roofarrow: '3', roofextrusion: '4', attachroof: '5', detachroof: '6', roomsep: '7', atalhos: '8', unidades: 'VU', createSimilar: 'VS',
  detailLine: '9', filledRegion: '0', tag: 'VT', grid: 'VG',
  // Visibilidade: o perfil simples não tem H livre (H = reancorar); usa V + dígito para não conflitar.
  temporaryHide: 'V1', temporaryCategory: 'V2', temporaryIsolate: 'V3', isolateCategory: 'V4', resetTemporary: 'V5',
  hideInView: 'V6', hideCategoryInView: 'V7', revealHidden: 'V8', unhideInView: 'V9', unhideCategoryInView: 'V0',
};

export const SHORTCUT_PROFILES: Record<ShortcutProfile, ShortcutMap> = { revit: PERFIL_REVIT, simples: PERFIL_SIMPLES };

export const PERFIL_PADRAO: ShortcutProfile = 'revit';

export const PERFIL_NOMES: Record<ShortcutProfile, string> = { revit: 'Revit (duas letras)', simples: 'Simples (uma tecla)' };

/** Nome do perfil de atalhos no idioma pedido. */
export function perfilNome(profile: ShortcutProfile, lang: Lang = 'pt'): string {
  return translate(lang, profile === 'revit' ? 'tl_profile_revit' : 'tl_profile_simple');
}

/** Todos os comandos que podem ter atalho (exceto Selecionar, que não tem tecla). */
export const COMANDOS_COM_ATALHO: ShortcutCommand[] = [
  // Colar é um modo transitório (Ctrl+V ou o botão Colar), não uma ferramenta da faixa: não recebe sequência de letras.
  ...(Object.keys(TOOL_LABEL) as ToolId[]).filter((id) => id !== 'select' && id !== 'paste'),
  'atalhos',
  'unidades',
  'createSimilar',
  'temporaryHide', 'temporaryCategory', 'temporaryIsolate', 'isolateCategory', 'resetTemporary',
  'hideInView', 'hideCategoryInView', 'revealHidden', 'unhideInView', 'unhideCategoryInView',
];

/** Nome de exibição de um comando (rótulo da ferramenta, ou o da tela de atalhos), em português. */
export function nomeComando(cmd: ShortcutCommand): string {
  return nomeComandoLang(cmd, 'pt');
}

/** Nome de exibição de um comando no idioma pedido (não altera `nomeComando`, que segue em PT). */
export function nomeComandoLang(cmd: ShortcutCommand, lang: Lang): string {
  if (cmd === 'atalhos') return translate(lang, 'tl_cmd_atalhos');
  if (cmd === 'unidades') return translate(lang, 'tl_cmd_unidades');
  if (cmd === 'createSimilar') return translate(lang, 'tl_cmd_create_similar');
  if (cmd === 'temporaryHide') return translate(lang, 'tl_cmd_temporary_hide');
  if (cmd === 'temporaryCategory') return translate(lang, 'tl_cmd_temporary_category');
  if (cmd === 'temporaryIsolate') return translate(lang, 'tl_cmd_temporary_isolate');
  if (cmd === 'isolateCategory') return translate(lang, 'tl_cmd_isolate_category');
  if (cmd === 'resetTemporary') return translate(lang, 'tl_cmd_reset_temporary');
  if (cmd === 'hideInView') return translate(lang, 'tl_cmd_hide_in_view');
  if (cmd === 'hideCategoryInView') return translate(lang, 'tl_cmd_hide_category_in_view');
  if (cmd === 'revealHidden') return translate(lang, 'tl_cmd_reveal_hidden');
  if (cmd === 'unhideInView') return translate(lang, 'tl_cmd_unhide_in_view');
  if (cmd === 'unhideCategoryInView') return translate(lang, 'tl_cmd_unhide_category_in_view');
  return toolLabelLang(cmd, lang);
}
