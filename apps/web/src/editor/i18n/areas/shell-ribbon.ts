/** Shard de dicionário: shell-ribbon. Paridade PT/EN garantida pelo tipo. */
export const PT_SHELL_RIBBON = {
  // Painel "Abertura" da aba contextual de portas/janelas (Ribbon.tsx).
  shr_open_panel: 'Abertura',
  shr_open_flip_facing: 'Inverter sentido (Tab)',
  shr_open_flip_facing_aria: 'Inverter sentido',
  shr_open_flip_hand: 'Inverter dobradiça (Espaço)',
  shr_open_flip_hand_aria: 'Inverter dobradiça',
  shr_open_tags: 'Etiquetas de portas e janelas',

  // Chrome da faixa: abas, Arquivo, "mais" e recolher/expandir.
  shr_tabs_aria: 'Abas da faixa de ferramentas',
  shr_file_tab: 'Arquivo',
  shr_tabs: 'Abas',
  shr_more_tabs: 'Mais abas',
  shr_toolbar_aria: 'Ferramentas',
  shr_more_panels: 'Mais painéis',
  shr_expand_ribbon: 'Expandir a faixa',
  shr_minimize_ribbon: 'Recolher a faixa',

  // Botões e tooltips dos itens da faixa (parts.tsx).
  shr_area_plan_hint: 'Na planta de área, use as ferramentas de anotação.',
  shr_not_for_sheets: 'não se aplica à prancha',
  shr_soon_unavailable: 'ainda não disponível',
  shr_soon_tag: 'a criar',

  // Painel "Modo"/"Prévia" do Colar alinhado (ConfirmCancelPanel.tsx).
  shr_mode: 'Modo',
  shr_preview: 'Prévia',
  shr_paste_levels_tip: 'Colar nos níveis selecionados (um passo de desfazer)',
  shr_cancel: 'Cancelar',
  shr_cancel_tip: 'Cancelar (volta à vista, sem alterar o modelo)',
  shr_target_levels: 'Níveis de destino',
  shr_total_copies: 'Total de cópias',

  // Mensagens de status e rótulo de desfazer das ações da faixa (actions.ts).
  shr_status_rooms_tagged_one: '{n} ambiente etiquetado.',
  shr_status_rooms_tagged_many: '{n} ambientes etiquetados.',
  shr_status_rooms_all_tagged: 'Todos os ambientes desta planta já têm etiqueta.',
  shr_undo_toggle_tags: 'Alternar etiquetas do modelo',
  shr_status_thin_lines_error: 'Não foi possível alterar as linhas finas.',
  shr_status_sheet_created: 'Prancha criada.',
  shr_status_op_rejected: 'Operação recusada.',
  shr_status_open_sheet_first: 'Abra uma prancha para adicionar vistas.',
  shr_status_sheet_per_level: 'Prancha do nível criada.',
  shr_status_sheets_per_level: '{n} pranchas criadas, uma por nível.',
} as const;

export const EN_SHELL_RIBBON: Record<keyof typeof PT_SHELL_RIBBON, string> = {
  shr_open_panel: 'Opening',
  shr_open_flip_facing: 'Flip Facing (Tab)',
  shr_open_flip_facing_aria: 'Flip Facing',
  shr_open_flip_hand: 'Flip Hand (Space)',
  shr_open_flip_hand_aria: 'Flip Hand',
  shr_open_tags: 'Door/Window Tags',

  shr_tabs_aria: 'Ribbon tabs',
  shr_file_tab: 'File',
  shr_tabs: 'Tabs',
  shr_more_tabs: 'More tabs',
  shr_toolbar_aria: 'Tools',
  shr_more_panels: 'More panels',
  shr_expand_ribbon: 'Expand ribbon',
  shr_minimize_ribbon: 'Minimize ribbon',

  shr_area_plan_hint: 'In an area plan, use the annotation tools.',
  shr_not_for_sheets: 'not available for sheets',
  shr_soon_unavailable: 'not available yet',
  shr_soon_tag: 'soon',

  shr_mode: 'Mode',
  shr_preview: 'Preview',
  shr_paste_levels_tip: 'Paste to the selected levels (one undo step)',
  shr_cancel: 'Cancel',
  shr_cancel_tip: 'Cancel (return to the view without changing the model)',
  shr_target_levels: 'Target levels',
  shr_total_copies: 'Total copies',

  shr_status_rooms_tagged_one: '{n} room tagged.',
  shr_status_rooms_tagged_many: '{n} rooms tagged.',
  shr_status_rooms_all_tagged: 'All rooms in this plan are already tagged.',
  shr_undo_toggle_tags: 'Toggle model tags',
  shr_status_thin_lines_error: 'Could not change thin lines.',
  shr_status_sheet_created: 'Sheet created.',
  shr_status_op_rejected: 'Operation not allowed.',
  shr_status_open_sheet_first: 'Open a sheet to add views.',
  shr_status_sheet_per_level: 'Level sheet created.',
  shr_status_sheets_per_level: '{n} sheets created, one per level.',
};
