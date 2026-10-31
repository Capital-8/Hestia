/**
 * Menu de botão direito da planta, do corte e do 3D (padrão Revit, ver docs/paridade/menu-contexto.md).
 * Função pura: recebe o estado da tela e devolve a árvore de entradas. Quem executa é ui/CanvasContextMenu.tsx.
 */

export type MenuLang = 'pt' | 'en';
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

/** Textos PT-BR e EN. Os nomes seguem o Revit; o que não foi confirmado na web está marcado em docs/paridade/menu-contexto.md. */
const TEXTOS = {
  repeat: ['Repetir', 'Repeat'],
  recent: ['Comandos recentes', 'Recent Commands'],
  cancel: ['Cancelar', 'Cancel'],
  copy: ['Copiar', 'Copy'],
  paste: ['Colar', 'Paste'],
  pasteLevels: ['Alinhado aos níveis selecionados…', 'Aligned to Selected Levels…'],
  noSelection: ['Nada selecionado', 'Nothing selected'],
  nothingCopied: ['Nada copiado. Use Copiar ou Ctrl+C', 'Nothing copied. Use Copy or Ctrl+C'],
  planOnly: ['Colar seguindo o cursor só vale em planta', 'Paste following the cursor works in plan views only'],
  selectPrevious: ['Selecionar anterior', 'Select Previous'],
  locate: ['Localizar vistas de referência', 'Locate Reference Views'],
  zoomRegion: ['Ampliar região', 'Zoom In Region'],
  zoomOut2x: ['Reduzir (2x)', 'Zoom Out (2x)'],
  zoomFit: ['Ajustar zoom', 'Zoom to Fit'],
  panPrev: ['Pan/Zoom anterior', 'Previous Pan/Zoom'],
  panNext: ['Próximo Pan/Zoom', 'Next Pan/Zoom'],
  browser: ['Navegador', 'Browser'],
  properties: ['Propriedades', 'Properties'],
  hide: ['Ocultar na vista', 'Hide in View'],
  hideElements: ['Elementos', 'Elements'],
  hideCategory: ['Categoria', 'Category'],
  hideFilter: ['Por filtro', 'By Filter'],
  unhide: ['Reexibir na vista', 'Unhide in View'],
  unhideElements: ['Elementos', 'Elements'],
  unhideCategory: ['Categoria', 'Category'],
  unhideAll: ['Reexibir tudo nesta vista', 'Unhide All in View'],
  isolate: ['Isolar temporariamente', 'Temporary Isolate'],
  override: ['Substituir gráficos na vista', 'Override Graphics in View'],
  createSimilar: ['Criar semelhante', 'Create Similar'],
  editFamily: ['Editar família', 'Edit Family'],
  selectAll: ['Selecionar todas as instâncias', 'Select All Instances'],
  selectAllView: ['Visíveis na vista', 'Visible in View'],
  selectAllProject: ['No projeto inteiro', 'In Entire Project'],
  delete: ['Excluir', 'Delete'],
  snapOverrides: ['Opções de captura', 'Snap Overrides'],
  steering: ['Rodas de navegação', 'Steering Wheels'],
  shortcutSpace: ['Espaço', 'Space'],
  soon: ['ainda não disponível', 'not available yet'],
  noRecent: ['Nenhum comando recente', 'No recent commands'],
  noRepeat: ['Nenhum comando para repetir', 'No command to repeat'],
  noPrevious: ['Nenhuma seleção anterior', 'No previous selection'],
  oneType: ['Selecione elementos de um só tipo', 'Select elements of one type only'],
  notCopyable: ['Copiar só vale para paredes, pisos, lajes, telhados, escadas, rampas, ambientes e aberturas hospedadas', 'Copy only works for walls, floors, slabs, roofs, stairs, ramps, rooms and hosted openings'],
} as const;

type Chave = keyof typeof TEXTOS;

/** Tipos de elemento que têm ferramenta de criação (Criar semelhante e Selecionar todas as instâncias). */
const TIPOS_COM_FERRAMENTA = new Set(['wall', 'door', 'window', 'floor', 'slab', 'ceiling', 'roof']);
/** Tipos que o menu mostra mas o Hestia ainda não cria por "semelhante" (Escada, Rampa e Ambiente). */
const TIPOS_EM_BREVE = new Set(['stair', 'ramp', 'room']);

/** Monta o menu de contexto para o estado dado. As entradas vêm em grupos separados por linha. */
export function buildContextMenu(ctx: ContextMenuCtx): MenuEntry[] {
  const pt = ctx.lang === 'pt' ? 0 : 1;
  const T = (k: Chave): string => TEXTOS[k][pt];
  const soon = (id: string, label: string, extra: Partial<MenuEntry> = {}): MenuEntry => ({ id, label, disabled: true, soon: true, hint: T('soon'), ...extra });
  const plan = ctx.view !== '3d';

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
    const selecionarTodas: MenuEntry = {
      id: 'selectAll',
      label: T('selectAll'),
      disabled: !mesmoTipo,
      hint: mesmoTipo ? undefined : T('oneType'),
      children: [
        { id: 'selectAllView', label: T('selectAllView'), disabled: !mesmoTipo, hint: mesmoTipo ? undefined : T('oneType') },
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
