/**
 * Menu de botão direito da planta, do corte e do 3D (padrão Revit, ver docs/paridade/menu-contexto.md).
 * Função pura: recebe o estado da tela e devolve a árvore de entradas. Quem executa é ui/CanvasContextMenu.tsx.
 */

import { t } from './i18n.ts';

export type MenuLang = 'pt' | 'en' | 'es' | 'de' | 'fr' | 'it' | 'pl';
export type MenuView = 'plan' | '3d' | 'section';

/** Comando recente ou último comando: id da ferramenta e o rótulo já traduzido. */
export interface MenuRef {
  id: string;
  label: string;
}

/** O que o menu precisa saber da tela no momento em que abre. */
export interface ContextMenuCtx {
  view: MenuView;
  /** Ferramenta ativa (`select` quando é o modo Modificar). */
  tool: string;
  /** Tipo de cada elemento selecionado (o `kind` do elemento: 'wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof', 'stair', 'room'…). */
  selectionKinds: string[];
  hasSelection: boolean;
  /** Os elementos selecionados são de um só tipo (mesmo typeId): libera Criar semelhante e Selecionar todas as instâncias. */
  singleType: boolean;
  recent: MenuRef[];
  last: MenuRef | null;
  canSelectPrevious: boolean;
  propsOpen: boolean;
  browserOpen: boolean;
  lang: MenuLang;
  /** Modo Reveal ativo: o menu troca Ocultar por Reexibir. */
  reveal: boolean;
  /** Categoria única dos elementos selecionados (para Ocultar/Reexibir categoria). */
  singleCategory: string | null;
  /** A vista tem algo oculto (permanente ou temporário). */
  hasHidden: boolean;
  /** Há algo copiado na área de transferência (habilita Colar e Alinhado aos níveis selecionados). */
  hasClip: boolean;
  /** A seleção tem algo que Copiar leva (paredes, pisos, lajes, telhados, escadas, rampas, ambientes e aberturas). */
  canCopy: boolean;
}

/** Entrada do menu. `soon`: recurso do Revit que o Hestia ainda não tem (esmaecido, com dica). */
export interface MenuEntry {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  soon?: boolean;
  /** Dica do item (motivo de estar desabilitado ou "ainda não disponível"). */
  hint?: string;
  checked?: boolean;
  separatorBefore?: boolean;
  children?: MenuEntry[];
}

/**
 * Chaves do dicionário para o menu. Os nomes seguem o Revit; o que não foi confirmado na web está marcado em
 * docs/paridade/menu-contexto.md. A tradução acontece na montagem, com o `ctx.lang` do momento da abertura.
 */
const TEXTOS = {
  repeat: 'edc_ctx_repeat',
  recent: 'edc_ctx_recent',
  cancel: 'edc_ctx_cancel',
  copy: 'edc_ctx_copy',
  paste: 'edc_ctx_paste',
  pasteLevels: 'edc_ctx_paste_levels',
  noSelection: 'edc_ctx_no_selection',
  nothingCopied: 'edc_ctx_nothing_copied',
  planOnly: 'edc_ctx_plan_only',
  selectPrevious: 'edc_ctx_select_previous',
  locate: 'edc_ctx_locate',
  zoomRegion: 'edc_ctx_zoom_region',
  zoomOut2x: 'edc_ctx_zoom_out_2x',
  zoomFit: 'edc_ctx_zoom_fit',
  panPrev: 'edc_ctx_pan_prev',
  panNext: 'edc_ctx_pan_next',
  browser: 'edc_ctx_browser',
  properties: 'edc_ctx_properties',
  hide: 'edc_ctx_hide',
  hideElements: 'edc_ctx_elements',
  hideCategory: 'edc_ctx_category',
  hideFilter: 'edc_ctx_hide_filter',
  unhide: 'edc_ctx_unhide',
  unhideElements: 'edc_ctx_elements',
  unhideCategory: 'edc_ctx_category',
  unhideAll: 'edc_ctx_unhide_all',
  isolate: 'edc_ctx_isolate',
  override: 'edc_ctx_override',
  createSimilar: 'edc_ctx_create_similar',
  editFamily: 'edc_ctx_edit_family',
  selectAll: 'edc_ctx_select_all',
  selectAllView: 'edc_ctx_select_all_view',
  selectAllProject: 'edc_ctx_select_all_project',
  delete: 'edc_ctx_delete',
  snapOverrides: 'edc_ctx_snap_overrides',
  steering: 'edc_ctx_steering',
  shortcutSpace: 'edc_ctx_space',
  soon: 'edc_ctx_soon',
  noRecent: 'edc_ctx_no_recent',
  noRepeat: 'edc_ctx_no_repeat',
  noPrevious: 'edc_ctx_no_previous',
  oneType: 'edc_ctx_one_type',
  notCopyable: 'edc_ctx_not_copyable',
} as const;

type Chave = keyof typeof TEXTOS;

/** Tipos de elemento que têm ferramenta de criação (Criar semelhante e Selecionar todas as instâncias). */
const TIPOS_COM_FERRAMENTA = new Set(['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof']);
/** Tipos que o menu mostra mas o Hestia ainda não cria por "semelhante" (Escada, Rampa e Ambiente). */
const TIPOS_EM_BREVE = new Set(['stair', 'ramp', 'room']);

/** Monta o menu de contexto para o estado dado. As entradas vêm em grupos separados por linha. */
export function buildContextMenu(ctx: ContextMenuCtx): MenuEntry[] {
  const T = (k: Chave): string => t(ctx.lang, TEXTOS[k]);
  const soon = (id: string, label: string, extra: Partial<MenuEntry> = {}): MenuEntry => ({ id, label, disabled: true, soon: true, hint: T('soon'), ...extra });
  const plan = ctx.view !== '3d';
  const na3d = ctx.view === '3d';

  const recentItem: MenuEntry = ctx.recent.length
    ? { id: 'recentes', label: T('recent'), children: ctx.recent.map((r) => ({ id: `recent:${r.id}`, label: r.label })) }
    : { id: 'recentes', label: T('recent'), disabled: true, hint: T('noRecent'), children: [] };

  const repeat: MenuEntry = ctx.last
    ? { id: 'repeat', label: `${T('repeat')} [${ctx.last.label}]`, shortcut: T('shortcutSpace') }
    : { id: 'repeat', label: T('repeat'), disabled: true, hint: T('noRepeat') };

  const zoom: MenuEntry[] = [
    soon('zoomRegion', T('zoomRegion')),
    { id: 'zoomOut2x', label: T('zoomOut2x') },
    { id: 'zoomFit', label: T('zoomFit') },
    soon('panPrev', T('panPrev')),
    soon('panNext', T('panNext')),
  ];
  const steer: MenuEntry[] = ctx.view === '3d' ? [soon('steering', T('steering'))] : [];
  const tail: MenuEntry[] = [
    { id: 'browser', label: T('browser'), checked: ctx.browserOpen },
    { id: 'properties', label: T('properties'), checked: ctx.propsOpen },
  ];
  const locate: MenuEntry[] = plan ? [soon('locate', T('locate'))] : [];

  // Copiar/Colar/Alinhado no topo, com a mesma regra de disponibilidade da faixa (Área de transferência).
  const clipboard: MenuEntry[] = [
    {
      id: 'copySelection',
      label: T('copy'),
      shortcut: 'Ctrl+C',
      disabled: !ctx.canCopy,
      hint: ctx.canCopy ? undefined : (ctx.hasSelection ? T('notCopyable') : T('noSelection')),
    },
    {
      id: 'pasteAligned',
      label: T('paste'),
      shortcut: 'Ctrl+V',
      // Mesma regra da faixa: o Colar seguindo o cursor só vale em planta.
      disabled: !ctx.hasClip || ctx.view !== 'plan',
      hint: ctx.view !== 'plan' ? T('planOnly') : (ctx.hasClip ? undefined : T('nothingCopied')),
    },
    {
      id: 'pasteAlignedLevels',
      label: T('pasteLevels'),
      disabled: !ctx.hasClip,
      hint: ctx.hasClip ? undefined : T('nothingCopied'),
    },
  ];

  const grupos: MenuEntry[][] = [];
  if (ctx.tool !== 'select') {
    // Ferramenta de criação ativa: Cancelar e o que ajuda a desenhar (sem Repetir nem Selecionar).
    grupos.push([{ id: 'cancel', label: T('cancel') }, recentItem, soon('snapOverrides', T('snapOverrides'))]);
    grupos.push([...steer, ...zoom]);
  } else if (ctx.hasSelection) {
    const kind = ctx.selectionKinds[0] ?? '';
    const mesmoTipo = ctx.singleType;
    const criar = criarSemelhante(ctx, T);
    // Na 3D, "Visíveis na vista" seleciona o que está no quadro: não exige um só tipo na seleção.
    const visiveisOk = na3d || mesmoTipo;
    const selecionarTodas: MenuEntry = {
      id: 'selectAll',
      label: T('selectAll'),
      disabled: !visiveisOk,
      hint: visiveisOk ? undefined : T('oneType'),
      children: [
        { id: 'selectAllView', label: T('selectAllView'), disabled: !visiveisOk, hint: visiveisOk ? undefined : T('oneType') },
        soon('selectAllProject', T('selectAllProject')),
      ],
    };
    grupos.push(clipboard);
    grupos.push([repeat, recentItem]);
    const categoriaOk = ctx.singleCategory !== null;
    const visibilidade: MenuEntry = ctx.reveal
      ? {
          id: 'unhide',
          label: T('unhide'),
          children: [
            { id: 'unhideElements', label: T('unhideElements'), shortcut: 'EU' },
            { id: 'unhideCategory', label: T('unhideCategory'), shortcut: 'VU', disabled: !categoriaOk, hint: categoriaOk ? undefined : T('oneType') },
          ],
        }
      : {
          id: 'hide',
          label: T('hide'),
          children: [
            { id: 'hideElements', label: T('hideElements'), shortcut: 'EH' },
            { id: 'hideCategory', label: T('hideCategory'), shortcut: 'VH', disabled: !categoriaOk, hint: categoriaOk ? undefined : T('oneType') },
            soon('hideFilter', T('hideFilter')),
          ],
        };
    grupos.push([
      visibilidade,
      { id: 'isolate', label: T('isolate'), children: [
        { id: 'isolateElements', label: T('hideElements'), shortcut: 'HI' },
        { id: 'isolateCategory', label: T('hideCategory'), shortcut: 'IC', disabled: !categoriaOk, hint: categoriaOk ? undefined : T('oneType') },
      ] },
      soon('override', T('override')),
      criar,
      ...(kind === 'door' || kind === 'window' ? [soon('editFamily', T('editFamily'))] : []),
      selecionarTodas,
    ]);
    grupos.push([{ id: 'delete', label: T('delete') }, ...locate]);
    grupos.push([...steer, ...zoom]);
  } else {
    grupos.push(clipboard);
    grupos.push([repeat, recentItem]);
    grupos.push([
      { id: 'selectPrevious', label: T('selectPrevious'), disabled: !ctx.canSelectPrevious, hint: ctx.canSelectPrevious ? undefined : T('noPrevious') },
      ...locate,
    ]);
    // Na 3D, sem seleção, "Visíveis na vista" continua disponível (seleciona o que está no quadro).
    if (na3d) {
      grupos.push([{
        id: 'selectAll',
        label: T('selectAll'),
        children: [
          { id: 'selectAllView', label: T('selectAllView') },
          soon('selectAllProject', T('selectAllProject')),
        ],
      }]);
    }
    grupos.push([...steer, ...zoom]);
  }
  if (ctx.hasHidden) grupos.push([{ id: 'unhideAll', label: T('unhideAll') }]);
  grupos.push(tail);

  // Cada grupo não vazio começa com linha divisória (exceto o primeiro).
  const out: MenuEntry[] = [];
  for (const g of grupos.filter((x) => x.length)) {
    if (out.length) out.push({ ...g[0]!, separatorBefore: true }, ...g.slice(1));
    else out.push(...g);
  }
  return out;
}

/**
 * Criar semelhante: só com um tipo de elemento que tem ferramenta (parede, porta, janela, piso, laje, forro, telhado).
 * Escada e ambiente aparecem esmaecidos; seleção mista ou sem tipo comum fica desabilitada com o motivo.
 */
function criarSemelhante(ctx: ContextMenuCtx, T: (k: Chave) => string): MenuEntry {
  const base = { id: 'createSimilar', label: T('createSimilar') };
  const kind = ctx.selectionKinds[0] ?? '';
  if (ctx.singleType && TIPOS_EM_BREVE.has(kind)) return { ...base, disabled: true, soon: true, hint: T('soon') };
  if (ctx.singleType && TIPOS_COM_FERRAMENTA.has(kind)) return base;
  return { ...base, disabled: true, hint: T('oneType') };
}
