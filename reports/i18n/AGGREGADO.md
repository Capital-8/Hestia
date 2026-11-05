# Mapa i18n — agregado automático

- CSVs lidos: 12
- Ocorrências: 4082 (P0: 628, P1: 2824, P2: 630)
- Arquivos citados: 449

## Por área

| Área | Total | P0 | P1 | P2 |
|---|---:|---:|---:|---:|
| 07-propriedades | 1025 | 212 | 771 | 42 |
| 12-packages-render-io-engine | 591 | 32 | 437 | 122 |
| 04-dialogs-gerais | 488 | 29 | 337 | 122 |
| 10-canvas-pranchas | 410 | 115 | 196 | 99 |
| 11-packages-model-tools | 342 | 62 | 263 | 17 |
| 09-editor | 285 | 4 | 244 | 37 |
| 08-options-bars | 254 | 111 | 129 | 14 |
| 03-dialogs-tipos | 229 | 14 | 150 | 65 |
| 05-dialogs-esquadrias | 229 | 17 | 195 | 17 |
| 02-ribbon | 93 | 31 | 53 | 9 |
| 06-dialogs-tabelas | 79 | 0 | 30 | 49 |
| 01-infra | 57 | 1 | 19 | 37 |

## Top 40 arquivos

| Arquivo | Ocorrências |
|---|---:|
| apps/web/src/ui/Properties.tsx | 119 |
| apps/web/src/ui/browser/Views.tsx | 101 |
| apps/web/src/ui/AnnotationProps.tsx | 99 |
| apps/web/src/ui/PlacementProperties.tsx | 97 |
| apps/web/src/ui/OptionsBar.tsx | 79 |
| apps/web/src/ui/RoomProperties.tsx | 78 |
| apps/web/src/ui/StairProperties.tsx | 63 |
| apps/web/src/ui/AreaPlanProperties.tsx | 61 |
| apps/web/src/ui/sheet/SheetControlBar.tsx | 61 |
| apps/web/src/ui/dialogs/OtherDialogs.tsx | 57 |
| apps/web/src/ui/RoofProperties.tsx | 50 |
| packages/engine/src/openingSchedule.ts | 49 |
| apps/web/src/ui/graphicsLabels.ts | 45 |
| apps/web/src/ui/SectionViewProps.tsx | 44 |
| apps/web/src/ui/RampProperties.tsx | 41 |
| packages/io/src/dxf.ts | 36 |
| apps/web/src/ui/GraphicsProps.tsx | 36 |
| apps/web/src/ui/perimeter/PerimeterStatus.ts | 34 |
| apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx | 33 |
| apps/web/src/ui/dialogs/DxfExportDialog.tsx | 32 |
| apps/web/src/ui/dialogs/SheetDialog.tsx | 31 |
| apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx | 31 |
| apps/web/src/ui/StairOptionsBar.tsx | 29 |
| apps/web/src/ui/dialogs/ExperimentosDialog.tsx | 28 |
| apps/web/src/ui/TypeRow.tsx | 28 |
| apps/web/src/ui/LevelMoveConflictDialog.tsx | 26 |
| controller.ts | 26 |
| packages/engine/src/roofSchedule.ts | 25 |
| apps/web/src/ui/SlabProperties.tsx | 25 |
| apps/web/src/ui/dialogs/ImportCadDialog.tsx | 24 |
| packages/model/src/dimensionSettings.ts | 24 |
| packages/render/src/sheet/frame.ts | 24 |
| apps/web/src/ui/dialogs/WallTypeDialog.tsx | 23 |
| apps/web/src/ui/dialogs/AutoCotaDialog.tsx | 23 |
| apps/web/src/ui/dialogs/TextDialog.tsx | 23 |
| sheetActions.ts | 23 |
| apps/web/src/ui/ToolTypeProps.tsx | 21 |
| apps/web/src/ui/dialogs/terminoForm.ts | 20 |
| apps/web/src/ui/dialogs/SelectLevelsDialog.tsx | 20 |
| apps/web/src/ui/dialogs/PublishDialog.tsx | 20 |

## Ocorrências P0

| Área | Arquivo:linha | Texto | Tipo | Chave | EN |
|---|---|---|---|---|---|
| 01-infra | apps/web/src/App.tsx:245 | Pronto. Pressione ${parede} para desenhar paredes, ou selecione para editar. / Pronto. Escolha uma ferramenta, ou selecione para editar. | status | status_ready_wall_hint / status_ready_hint | Ready. Press {key} to draw walls, or select to edit. / Ready. Pick a tool, or select to edit. |
| 02-ribbon | apps/web/src/ui/Ribbon.tsx:31 | Abertura | aria-label | rb_open_panel | Opening |
| 02-ribbon | apps/web/src/ui/Ribbon.tsx:34 | Inverter sentido (Tab) | title + aria-label | rb_flip_facing | Flip Facing (Tab) |
| 02-ribbon | apps/web/src/ui/Ribbon.tsx:37 | Inverter dobradiça (Espaço) | title + aria-label | rb_flip_hand | Flip Hand (Space) |
| 02-ribbon | apps/web/src/ui/Ribbon.tsx:40 | Etiquetas de portas e janelas | title + aria-label | rb_open_tags | Door/Window Tags |
| 02-ribbon | apps/web/src/ui/Ribbon.tsx:45 | Abertura | JSX texto | rb_open_panel | Opening |
| 02-ribbon | apps/web/src/ui/ViewControlBar.tsx:76 | DETAIL_LABEL = Por escala/Grosso/Médio/Fino | mapa PT-only | detail_by_scale + detail_coarse/medium/fine (já existem) | By scale / Coarse / Medium / Fine |
| 02-ribbon | apps/web/src/ui/ViewControlBar.tsx:86 | VISUAL_STYLE_LABEL = Aramado/Linhas ocultas/Sombreado/Cores consistentes/Realista | mapa PT-only | style_wireframe (novo), style_hidden, style_shaded, style_consistent, style_realistic | Wireframe / Hidden Line / Shaded / Consistent Colors / Realistic |
| 02-ribbon | apps/web/src/ui/Tutorial.tsx:44 | Desenhe um circuito de paredes{w} — clique nos pontos e feche no primeiro | JSX texto | tut_step_walls | Draw a loop of walls{w} — click the points and close on the first |
| 02-ribbon | apps/web/src/ui/Tutorial.tsx:45 | Insira uma porta{d} e uma janela{n} sobre as paredes | JSX texto | tut_step_openings | Insert a door{d} and a window{n} on the walls |
| 02-ribbon | apps/web/src/ui/Tutorial.tsx:46 | Selecione uma parede e troque o tipo nas Propriedades | JSX texto | tut_step_type | Select a wall and change its type in Properties |
| 02-ribbon | apps/web/src/ui/Tutorial.tsx:47 | Abra o Modelo 3D no navegador de projeto | JSX texto | tut_step_3d | Open the 3D Model in the Project Browser |
| 02-ribbon | apps/web/src/ui/Tutorial.tsx:48 | Salve o projeto (Ctrl+S) | JSX texto | tut_step_save | Save the project (Ctrl+S) |
| 02-ribbon | apps/web/src/ui/Tutorial.tsx:65 | Passo ${now + 1} de ${steps.length} | JSX texto | tut_progress | Step {n} of {total} |
| 02-ribbon | apps/web/src/ui/Tutorial.tsx:72 | Dispensar | JSX texto | tut_dismiss | Dismiss |
| 02-ribbon | apps/web/src/ui/IssuesButton.tsx:49 | ✓ Modelo sem avisos | JSX texto | issues_none | ✓ Model has no warnings |
| 02-ribbon | apps/web/src/ui/DisjoinCheck.tsx:11 | Desconectar | JSX texto | opt_disjoin | Disjoin |
| 02-ribbon | apps/web/src/ui/SnapButton.tsx:121 | Capturas de Objeto (Snaps) | JSX texto | snap_master_title | Object Snaps |
| 02-ribbon | apps/web/src/ui/SnapButton.tsx:129 | LIGADO / DESLIGADO | JSX texto | snap_on / snap_off | ON / OFF |
| 02-ribbon | apps/web/src/ui/SnapButton.tsx:156 | Tudo | JSX texto | snap_all | All |
| 02-ribbon | apps/web/src/ui/SnapButton.tsx:157 | Padrão | JSX texto | snap_default | Default |
| 02-ribbon | apps/web/src/ui/SnapButton.tsx:158 | Nenhum | JSX texto | snap_none | None |
| 02-ribbon | apps/web/src/ui/OrthoButton.tsx:19 | Orto/Polar | JSX texto | status_ortho_polar | Ortho/Polar |
| 02-ribbon | apps/web/src/ui/OrthoButton.tsx:25 | Orto ativo (F8): apenas 0°/90° / Orto desligado (F8) | title | status_ortho_on / status_ortho_off | Ortho on (F8): 0°/90° only / Ortho off (F8) |
| 02-ribbon | apps/web/src/ui/OrthoButton.tsx:27 | Orto | JSX texto | status_ortho | Ortho |
| 02-ribbon | apps/web/src/ui/OrthoButton.tsx:37 | Polar | JSX texto | status_polar | Polar |
| 02-ribbon | apps/web/src/ui/EmptyViews.tsx:9 | Nenhuma vista aberta | JSX texto | empty_views_title | No views open |
| 02-ribbon | apps/web/src/ui/EmptyViews.tsx:10 | Abra um nível ou o Modelo 3D pelo navegador de projeto. | JSX texto | empty_views_body | Open a level or the 3D Model from the Project Browser. |
| 02-ribbon | apps/web/src/ui/EmptyViews.tsx:13 | Mostrar navegador de projeto | JSX texto | empty_views_show_browser | Show Project Browser |
| 02-ribbon | apps/web/src/ui/Browser.tsx:17 | Navegador de projeto | aria-label | project_browser_title (já existe) | Project Browser |
| 02-ribbon | apps/web/src/ui/Browser.tsx:18 | Navegador de projeto - ${p.name} / Fechar o navegador de projeto | title + closeLabel | project_browser_head / browser_close | Project Browser - {name} / Close the Project Browser |
| 02-ribbon | apps/web/src/ui/Browser.tsx:19 | Navegador de projeto - {p.name} | JSX texto | project_browser_head | Project Browser - {name} |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/WallTypeDialog.tsx:93 | Propriedades do tipo | título de diálogo | type_title_wall | Type Properties |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/WallTypeDialog.tsx:94 | Parede · usado em {n} paredes | subtítulo | type_sub_wall | Wall · used in {n} walls |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:89 | Propriedades do tipo de piso | título de diálogo | type_title_floor | Floor Type Properties |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:90 | Piso · usado em {n} pisos | subtítulo | type_sub_floor | Floor · used in {n} floors |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:89 | Propriedades do tipo de laje | título de diálogo | type_title_slab | Slab Type Properties |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:90 | Laje · usada em {n} lajes | subtítulo | type_sub_slab | Slab · used in {n} slabs |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:86 | Propriedades do tipo de forro | título de diálogo | type_title_ceiling | Ceiling Type Properties |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:87 | Forro · usada em {n} forros | subtítulo | type_sub_ceiling | Ceiling · used in {n} ceilings |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:86 | Propriedades do tipo de telhado | título de diálogo | type_title_roof | Roof Type Properties |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:87 | Telhado · usado em {n} telhados | subtítulo | type_sub_roof | Roof · used in {n} roofs |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/GridTypeDialog.tsx:85 | Editar tipo de grade | título de diálogo | type_title_grid | Edit Grid Type |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/GridTypeDialog.tsx:86 | Grade · bolhas e traços em mm de papel | subtítulo | type_sub_grid | Grid · bubbles and lines in paper mm |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/RampTypeDialog.tsx:90 | Propriedades · Tipo de rampa | título de diálogo | ramp_type_props | Ramp Type Properties |
| 03-dialogs-tipos | apps/web/src/ui/dialogs/RampTypeDialog.tsx:91 | Rampa · usada em {n} rampas | subtítulo | type_sub_ramp | Ramp · used in {n} ramps |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/OtherDialogs.tsx:34 | Níveis | título | dlg_levels | Levels |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/OtherDialogs.tsx:91 | Novo projeto | título | dlg_new_project | New Project |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/OtherDialogs.tsx:101 | Em branco | JSX texto | tpl_blank | Blank |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/OtherDialogs.tsx:109 | Abrir projeto… | JSX texto | tpl_open | Open Project… |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/OtherDialogs.tsx:164 | Atalhos | título | dlg_shortcuts | Shortcuts |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/AlertaDialog.tsx:14 | Aviso | título | dlg_warning | Warning |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:49 | Cotas automáticas | título | dlg_autocota | Auto Dimensions |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:56 | Gerar cotas | botão | dlg_autocota_generate | Generate Dimensions |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/DxfExportDialog.tsx:103 | Exportar DXF | título | btn_export_dxf | Export DXF |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/DxfExportDialog.tsx:113 | Fechar | botão | btn_close | Close |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/DxfExportDialog.tsx:113 | Cancelar | botão | btn_cancel | Cancel |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/DxfExportDialog.tsx:115 | Gerando… | botão | dlg_dxf_generating | Generating… |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/DxfExportDialog.tsx:115 | Exportar {n} arquivo(s) | botão | dlg_dxf_export_n | Export {n} file(s) |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/DxfExportDialog.tsx:122 | Documentos ({n}) | aba | dlg_dxf_tab_docs | Documents ({n}) |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/DxfExportDialog.tsx:125 | Camadas | aba | dlg_dxf_tab_layers | Layers |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/ImportCadDialog.tsx:83 | Importar CAD (DXF) | título | dlg_import_cad | Import CAD (DXF) |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/ImportCadDialog.tsx:92 | Importando… | botão | dlg_importing | Importing… |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/ImportCadDialog.tsx:92 | Importar | botão | btn_import | Import |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/ImportCadDialog.tsx:98 | Arquivo DXF | label | dlg_cad_file | DXF file |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/SheetDialog.tsx:42 | Propriedades da prancha | título | dlg_sheet_props | Sheet Properties |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/PublishDialog.tsx:82 | Publicar pranchas | título | dlg_publish_sheets | Publish Sheets |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/PublishDialog.tsx:90 | Publicando… | botão | dlg_publishing | Publishing… |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/PublishDialog.tsx:90 | Publicar PDF | botão | btn_publish_pdf | Publish PDF |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/PublishDialog.tsx:90 | Publicar {n} PDF | botão | btn_publish_n_pdf | Publish {n} PDF |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/UnitsDialog.tsx:51 | Unidades do projeto | título | dlg_project_units | Project Units |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/UnitsDialog.tsx:57 | Restaurar padrões | botão | btn_restore_defaults | Restore Defaults |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:93 | Atalhos de teclado | título | dlg_keyboard_shortcuts | Keyboard Shortcuts |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/TextDialog.tsx:148 | Caixa de texto | título | dlg_text_box | Text Box |
| 04-dialogs-gerais | apps/web/src/ui/dialogs/TextDialog.tsx:155 | Criar texto | botão | btn_create_text | Create Text |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:159 | Propriedades do tipo | título do diálogo | ot_title | Type Properties |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:160 | Porta | subtítulo | ot_kind_door | Door |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:160 | Janela | subtítulo | ot_kind_window | Window |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:160 | usado em {n} | subtítulo | ot_sub_used | used {n}× |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:164 | + Novo tipo | botão | ot_btn_new | + New Type |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:166 | Cancelar | botão | stt_cancel | Cancel |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeDialog.tsx:167 | Aplicar | botão | stt_apply | Apply |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeHeader.tsx:48 | Família: | rótulo | ot_f_family | Family: |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypeHeader.tsx:56 | Tipo: | rótulo | ot_f_type | Type: |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypePreview.tsx:12 | Planta \| Elevação \| Corte \| 3D linhas \| 3D sombreado | options | ot_prev_tabs | Floor Plan \| Elevation \| Section \| 3D lines \| 3D shaded |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypePreview.tsx:179 | Inverter dobradiça | botão | ot_prev_flip_hand | Flip hinge |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypePreview.tsx:180 | Inverter sentido | botão | ot_prev_flip_facing | Flip facing |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/OpeningTypePreview.tsx:189 | Verificações | rótulo | ot_checks_title | Checks |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/panels/OverviewPanel.tsx:17 | Nome | rótulo | col_name | Name |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/panels/OverviewPanel.tsx:18 | Largura | rótulo | col_width | Width |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/panels/OverviewPanel.tsx:19 | Altura | rótulo | col_height | Height |
| 05-dialogs-esquadrias | apps/web/src/ui/dialogs/openingType/panels/OverviewPanel.tsx:20 | Peitoril | rótulo | ot_f_sill | Sill height |
| 07-propriedades | apps/web/src/ui/Properties.tsx:152 | Tipo de parede | rótulo do seletor de tipo | prop_type_wall | Wall Type |
| 07-propriedades | apps/web/src/ui/Properties.tsx:153 | Paredes (${n}) | rótulo de categoria | cat_walls | Walls ({n}) |
| 07-propriedades | apps/web/src/ui/Properties.tsx:160 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/Properties.tsx:161 | Nível base | rótulo de campo | fld_base_level | Base Level |
| 07-propriedades | apps/web/src/ui/Properties.tsx:162 | Desloc. da base | rótulo de campo | fld_base_offset | Base Offset |
| 07-propriedades | apps/web/src/ui/Properties.tsx:163 | Nível superior | rótulo de campo | fld_top_level | Top Level |
| 07-propriedades | apps/web/src/ui/Properties.tsx:165 | variados | opção de select | opt_varied | Varies |
| 07-propriedades | apps/web/src/ui/Properties.tsx:166 | Não vinculado | opção de select | opt_not_attached | Not Attached |
| 07-propriedades | apps/web/src/ui/Properties.tsx:167 | Até {l.name} | opção de select | opt_up_to | Up to {name} |
| 07-propriedades | apps/web/src/ui/Properties.tsx:171 | Altura | rótulo de campo | fld_height | Height |
| 07-propriedades | apps/web/src/ui/Properties.tsx:173 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/Properties.tsx:175 | Topo no telhado | rótulo de campo | fld_top_to_roof | Top Attached to Roof |
| 07-propriedades | apps/web/src/ui/Properties.tsx:176 | Base no piso | rótulo de campo | fld_base_to_floor | Base Attached to Floor |
| 07-propriedades | apps/web/src/ui/Properties.tsx:176 | Desanexar | botão | btn_detach | Detach |
| 07-propriedades | apps/web/src/ui/Properties.tsx:176 | Anexar | botão | btn_attach | Attach |
| 07-propriedades | apps/web/src/ui/Properties.tsx:177 | Topo no piso | rótulo de campo | fld_top_to_floor | Top Attached to Floor |
| 07-propriedades | apps/web/src/ui/Properties.tsx:177 | Desanexar | botão | btn_detach | Detach |
| 07-propriedades | apps/web/src/ui/Properties.tsx:177 | Anexar | botão | btn_attach | Attach |
| 07-propriedades | apps/web/src/ui/Properties.tsx:182 | Até {l.name} | opção de select | opt_up_to | Up to {name} |
| 07-propriedades | apps/web/src/ui/Properties.tsx:187 | Linha de localização | rótulo de campo | fld_location_line | Location Line |
| 07-propriedades | apps/web/src/ui/Properties.tsx:194 | Inverter lado externo | rótulo de campo | fld_flip_exterior | Flip Exterior |
| 07-propriedades | apps/web/src/ui/Properties.tsx:213 | Dimensões | título de grupo | pgrp_dimensions | Dimensions |
| 07-propriedades | apps/web/src/ui/Properties.tsx:254 | Tipo de abertura | rótulo do seletor de tipo | prop_type_opening | Opening Type |
| 07-propriedades | apps/web/src/ui/Properties.tsx:255 | Portas (${n}) | rótulo de categoria | cat_doors | Doors ({n}) |
| 07-propriedades | apps/web/src/ui/Properties.tsx:255 | Janelas (${n}) | rótulo de categoria | cat_windows | Windows ({n}) |
| 07-propriedades | apps/web/src/ui/Properties.tsx:255 | Aberturas (${n}) | rótulo de categoria | cat_openings | Openings ({n}) |
| 07-propriedades | apps/web/src/ui/Properties.tsx:264 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/Properties.tsx:267 | Distância ao início | rótulo de campo | fld_distance_from_start | Distance from Start |
| 07-propriedades | apps/web/src/ui/Properties.tsx:268 | Peitoril | rótulo de campo | fld_sill | Sill Height |
| 07-propriedades | apps/web/src/ui/Properties.tsx:274 | Altura do vão | rótulo de campo | fld_opening_height | Opening Height |
| 07-propriedades | apps/web/src/ui/Properties.tsx:282 | Inverter dobradiça | rótulo de campo | fld_flip_hand | Flip Hand |
| 07-propriedades | apps/web/src/ui/Properties.tsx:283 | Inverter sentido | rótulo de campo | fld_flip_facing | Flip Facing |
| 07-propriedades | apps/web/src/ui/Properties.tsx:285 | Dimensões | título de grupo | pgrp_dimensions | Dimensions |
| 07-propriedades | apps/web/src/ui/Properties.tsx:288 | Largura | rótulo de campo | fld_width | Width |
| 07-propriedades | apps/web/src/ui/Properties.tsx:289 | Altura | rótulo de campo | fld_height | Height |
| 07-propriedades | apps/web/src/ui/Properties.tsx:314 | Intervalo de vista | título de grupo | pgrp_view_range | View Range |
| 07-propriedades | apps/web/src/ui/Properties.tsx:315 | Topo | rótulo de campo | fld_top | Top |
| 07-propriedades | apps/web/src/ui/Properties.tsx:316 | Plano de corte | JSX texto | fld_cut_plane,Cut Plane,rótulo de campo, | undefined |
| 07-propriedades | apps/web/src/ui/Properties.tsx:317 | Base | rótulo de campo | fld_bottom | Base |
| 07-propriedades | apps/web/src/ui/Properties.tsx:318 | Profundidade | rótulo de campo | fld_depth | Depth |
| 07-propriedades | apps/web/src/ui/Properties.tsx:350 | Planta de cobertura | texto de cabeçalho | view_roof_plan | Roof Plan |
| 07-propriedades | apps/web/src/ui/Properties.tsx:350 | Planta | texto de cabeçalho | view_plan | Plan |
| 07-propriedades | apps/web/src/ui/Properties.tsx:350 | Elevação | texto de cabeçalho | view_elevation | Elevation |
| 07-propriedades | apps/web/src/ui/Properties.tsx:350 | Corte | texto de cabeçalho | view_section | Section |
| 07-propriedades | apps/web/src/ui/Properties.tsx:350 | Modelo 3D | texto de cabeçalho | view_3d | 3D Model |
| 07-propriedades | apps/web/src/ui/Properties.tsx:351 | Planta de área | texto de cabeçalho | view_area_plan | Area Plan |
| 07-propriedades | apps/web/src/ui/Properties.tsx:351 | Planta de piso | texto de cabeçalho | view_floor_plan | Floor Plan |
| 07-propriedades | apps/web/src/ui/Properties.tsx:357 | Vista | título de grupo | pgrp_view | View |
| 07-propriedades | apps/web/src/ui/Properties.tsx:358 | Nível | rótulo de campo | fld_level | Level |
| 07-propriedades | apps/web/src/ui/Properties.tsx:433 | Colocar ${tool} | texto do cabeçalho | msg_placing_tool | Place {tool} |
| 07-propriedades | apps/web/src/ui/Properties.tsx:433 | Nível ${name} | texto do cabeçalho | msg_level_name | Level {name} |
| 07-propriedades | apps/web/src/ui/Properties.tsx:436 | Propriedades | JSX texto | properties_title | Properties |
| 07-propriedades | apps/web/src/ui/TypeSelector.tsx:99 | variados | opção de select | opt_varied | Varies |
| 07-propriedades | apps/web/src/ui/TypeSelector.tsx:142 | ✎ Editar tipo | botão | edit_type_btn | Edit Type |
| 07-propriedades | apps/web/src/ui/typeFamilies.ts:5 | Parede básica | nome de família | fam_wall_basic | Basic Wall |
| 07-propriedades | apps/web/src/ui/typeFamilies.ts:6 | Piso | nome de família | fam_floor | Floor |
| 07-propriedades | apps/web/src/ui/typeFamilies.ts:7 | Laje | nome de família | fam_slab | Slab |
| 07-propriedades | apps/web/src/ui/typeFamilies.ts:8 | Forro | nome de família | fam_ceiling | Ceiling |
| 07-propriedades | apps/web/src/ui/typeFamilies.ts:9 | Telhado | nome de família | fam_roof | Roof |
| 07-propriedades | apps/web/src/ui/typeFamilies.ts:10 | Escada | nome de família | fam_stair | Stair |
| 07-propriedades | apps/web/src/ui/LevelField.tsx:13 | Nível | rótulo de campo | fld_level | Level |
| 07-propriedades | apps/web/src/ui/LevelField.tsx:40 | Sem nível | opção de select | opt_no_level | No Level |
| 07-propriedades | apps/web/src/ui/LevelField.tsx:49 | Ao trocar: | rótulo de campo | fld_when_changing | When Changing |
| 07-propriedades | apps/web/src/ui/LevelField.tsx:51 | Manter a cota | opção de select | opt_keep_elevation | Keep Elevation |
| 07-propriedades | apps/web/src/ui/LevelField.tsx:52 | Levar o deslocamento | opção de select | opt_keep_offset | Keep Offset |
| 07-propriedades | apps/web/src/ui/SlabProperties.tsx:78 | Tipo de laje | rótulo do seletor de tipo | prop_type_slab | Slab Type |
| 07-propriedades | apps/web/src/ui/SlabProperties.tsx:79 | Lajes (${n}) | rótulo de categoria | cat_slabs | Slabs ({n}) |
| 07-propriedades | apps/web/src/ui/SlabProperties.tsx:86 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/SlabProperties.tsx:88 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/SlabProperties.tsx:92 | Inclinação | título de grupo | pgrp_slope | Slope |
| 07-propriedades | apps/web/src/ui/SlabProperties.tsx:93 | Caimento | rótulo de campo | fld_slope_percent | Slope |
| 07-propriedades | apps/web/src/ui/FloorProperties.tsx:55 | Tipo de piso | rótulo do seletor de tipo | prop_type_floor | Floor Type |
| 07-propriedades | apps/web/src/ui/FloorProperties.tsx:56 | Pisos (${n}) | rótulo de categoria | cat_floors | Floors ({n}) |
| 07-propriedades | apps/web/src/ui/FloorProperties.tsx:63 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/FloorProperties.tsx:65 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/CeilingProperties.tsx:52 | Tipo de forro | rótulo do seletor de tipo | prop_type_ceiling | Ceiling Type |
| 07-propriedades | apps/web/src/ui/CeilingProperties.tsx:53 | Forros (${n}) | rótulo de categoria | cat_ceilings | Ceilings ({n}) |
| 07-propriedades | apps/web/src/ui/CeilingProperties.tsx:60 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/CeilingProperties.tsx:62 | Cota do topo | rótulo de campo | fld_top_elevation | Top Elevation |
| 07-propriedades | apps/web/src/ui/CeilingProperties.tsx:65 | Face inferior | rótulo de campo | fld_bottom_face | Bottom Face |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:118 | Tipo de telhado | rótulo do seletor de tipo | prop_type_roof | Roof Type |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:119 | Telhados (${n}) | rótulo de categoria | cat_roofs | Roofs ({n}) |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:126 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:128 | Cota do beiral | rótulo de campo | fld_eave_elevation | Eave Elevation |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:132 | Forma | título de grupo | fld_form | Form |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:133 | Forma | rótulo de campo | fld_form | Form |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:136 | variadas | opção de select | opt_varied_fem | Varies |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:142 | Inclinação | rótulo de campo | fld_inclination | Slope |
| 07-propriedades | apps/web/src/ui/RoofProperties.tsx:145 | Inclinação | rótulo de campo | fld_inclination | Slope |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:165 | Tipo de escada | rótulo do seletor de tipo | prop_type_stair | Stair Type |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:166 | Escadas (${n}) | rótulo de categoria | cat_stairs | Stairs ({n}) |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:173 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:175 | Nível base | rótulo de campo | fld_base_level | Base Level |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:181 | Nível base | rótulo de campo | fld_base_level | Base Level |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:183 | Nível de topo | rótulo de campo | fld_top_level | Top Level |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:185 | variados | opção de select | opt_varied | Varies |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:186 | Automático (nível acima) | opção de select | opt_level_above | Automatic (level above) |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:190 | Desloc. da base | rótulo de campo | fld_base_offset | Base Offset |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:191 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:192 | Espelhos | rótulo de campo | fld_riser_mode | Risers |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:199 | variados | opção de select | opt_varied | Varies |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:205 | Altura | rótulo de campo | fld_height | Height |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:207 | Abertura da laje | rótulo de campo | fld_slab_opening | Shaft Opening |
| 07-propriedades | apps/web/src/ui/StairProperties.tsx:209 | variados | opção de select | opt_varied | Varies |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:100 | Tipo de rampa | rótulo do seletor de tipo | prop_type_ramp | Ramp Type |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:101 | Rampas (${n}) | rótulo de categoria | cat_ramps | Ramps ({n}) |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:108 | Restrições | título de grupo | pgrp_constraints | Constraints |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:109 | Nível base | rótulo de campo | fld_base_level | Base Level |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:110 | Nível de topo | rótulo de campo | fld_top_level | Top Level |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:112 | variados | opção de select | opt_varied | Varies |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:113 | Automático (nível acima) | opção de select | ramp_levels_auto | Automatic (level above) |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:117 | Desloc. da base | rótulo de campo | fld_base_offset | Base Offset |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:118 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:120 | Altura | rótulo de campo | fld_height | Height |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:122 | Abertura da laje | rótulo de campo | fld_slab_opening | Shaft Opening |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:124 | variados | opção de select | opt_varied | Varies |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:145 | Rampa | título de grupo | pgrp_ramp | Ramp |
| 07-propriedades | apps/web/src/ui/RampProperties.tsx:154 | Largura | rótulo de campo | fld_width | Width |
| 07-propriedades | apps/web/src/ui/GraphicsProps.tsx:18 | Gráficos da vista | título de grupo | pgrp_view_graphics | View Graphics |
| 07-propriedades | apps/web/src/ui/GraphicsProps.tsx:65 | Gráficos da vista | título de grupo | pgrp_view_graphics | View Graphics |
| 07-propriedades | apps/web/src/ui/GraphicsProps.tsx:127 | Gráficos do 3D | título de grupo | pgrp_3d_graphics | 3D Graphics |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:31 | planta de área “${nome}” | mensagem | msg_area_plan_target | area plan “{name}” |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:31 | nível ativo (${nome}) | mensagem | msg_active_level_target | active level ({name}) |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:44 | Colocação · Parede | título de grupo | pgrp_placement_wall | Placement · Wall |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:45 | Reta | opção de select | opt_line | Line |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:45 | Arco (3 pontos) | opção de select | opt_arc_3_points | Arc (3 points) |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:45 | Retângulo | opção de select | opt_rectangle | Rectangle |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:46 | Nível base | rótulo de campo | fld_base_level | Base Level |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:48 | Nível superior | rótulo de campo | fld_top_level | Top Level |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:48 | Por altura | opção de select | opt_by_height | By Height |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:49 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:49 | Altura | rótulo de campo | fld_height | Height |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:50 | Linha de localização | rótulo de campo | fld_location_line | Location Line |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:51 | Inverter lado externo | rótulo de campo | fld_flip_exterior | Flip Exterior |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:56 | Colocação · Porta | título de grupo | pgrp_placement_door | Placement · Door |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:56 | Colocação · Janela | título de grupo | pgrp_placement_window | Placement · Window |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:57 | Inverter dobradiça | rótulo de campo | fld_flip_hand | Flip Hand |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:58 | Inverter sentido | rótulo de campo | fld_flip_facing | Flip Facing |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:59 | Sentido | rótulo de campo | fld_facing | Facing |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:72 | Colocação · Piso | título de grupo | pgrp_placement_floor | Placement · Floor |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:73 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:77 | Colocação · Inclinação | título de grupo | pgrp_placement_slope | Placement · Slope |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:77 | Colocação · Laje | título de grupo | pgrp_placement_slab | Placement · Slab |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:79 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:85 | Colocação · Forro | título de grupo | pgrp_placement_ceiling | Placement · Ceiling |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:86 | Cota do topo | rótulo de campo | fld_top_elevation | Top Elevation |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:90 | Colocação · Telhado | título de grupo | pgrp_placement_roof | Placement · Roof |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:91 | Inclinação | rótulo de campo | fld_inclination | Slope |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:92 | Balanço do beiral | rótulo de campo | fld_eave_overhang | Eave Overhang |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:93 | Cota do beiral | rótulo de campo | fld_eave_elevation | Eave Elevation |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:98 | Colocação · Escada | título de grupo | pgrp_placement_stair | Placement · Stair |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:99 | Nível de topo | rótulo de campo | fld_top_level | Top Level |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:99 | Automático (nível acima) | opção de select | opt_level_above | Automatic (level above) |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:100 | Desloc. da base | rótulo de campo | fld_base_offset | Base Offset |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:101 | Desloc. do topo | rótulo de campo | fld_top_offset | Top Offset |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:102 | Altura | rótulo de campo | fld_height | Height |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:109 | Colocação · Escada por lance | título de grupo | pgrp_placement_stair_run | Placement · Stair by Run |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:110 | Forma | rótulo de campo | fld_form | Form |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:111 | Largura | rótulo de campo | fld_width | Width |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:120 | Colocação · Rampa | título de grupo | pgrp_placement_ramp | Placement · Ramp |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:125 | Colocação · Ambiente | título de grupo | pgrp_placement_room | Placement · Room |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:126 | Nível | rótulo de campo | fld_level | Level |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:138 | Colocação · Texto | título de grupo | pgrp_placement_text | Placement · Text |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:146 | Colocação · Ambiente | título de grupo | pgrp_placement_room | Placement · Room |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:146 | Colocação · Separador de ambiente | título de grupo | pgrp_placement_room_separator | Placement · Room Separator |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:146 | Colocação · Cota | título de grupo | pgrp_placement_dimension | Placement · Dimension |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:146 | Colocação · Texto | título de grupo | pgrp_placement_text | Placement · Text |
| 07-propriedades | apps/web/src/ui/PlacementProperties.tsx:146 | Colocação · Corte | título de grupo | pgrp_placement_section | Placement · Section |
| 07-propriedades | apps/web/src/ui/AnnotationProps.tsx:312 | Texto | título de grupo | pgrp_text | Text |
| 07-propriedades | apps/web/src/ui/AreaPlanProperties.tsx:23 | Perfil da vista (planta de área) | título de grupo | pgrp_area_plan_profile | View Profile (Area Plan) |
| 07-propriedades | apps/web/src/ui/AreaPlanProperties.tsx:24 | Nome | rótulo de campo | fld_name | Name |
| 07-propriedades | apps/web/src/ui/AreaPlanProperties.tsx:27 | Escala | rótulo de campo | fld_scale | Scale |
| 07-propriedades | apps/web/src/ui/AreaPlanProperties.tsx:30 | Ambientes | rótulo de campo | fld_rooms | Rooms |
| 07-propriedades | apps/web/src/ui/SectionViewProps.tsx:32 | Elevação | valor | view_elevation | Elevation |
| 07-propriedades | apps/web/src/ui/SectionViewProps.tsx:32 | Corte | valor | view_section | Section |
| 07-propriedades | apps/web/src/ui/SectionViewProps.tsx:42 | Dados de identidade | título de grupo | pgrp_identity | Identity Data |
| 07-propriedades | apps/web/src/ui/SectionViewProps.tsx:43 | Tipo | rótulo de campo | fld_type | Type |
| 07-propriedades | apps/web/src/ui/SectionViewProps.tsx:45 | Nome | rótulo de campo | fld_name | Name |
| 07-propriedades | apps/web/src/ui/LevelProps.tsx:35 | Nível | título de grupo | pgrp_level | Level |
| 07-propriedades | apps/web/src/ui/LevelProps.tsx:36 | Nome | rótulo de campo | fld_name | Name |
| 07-propriedades | apps/web/src/ui/LevelProps.tsx:39 | Elevação | rótulo de campo | fld_elevation | Elevation |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:12 | Colocar Parede | rótulo de categoria | place_wall | Place Wall |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:13 | Colocar Porta | rótulo de categoria | place_door | Place Door |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:14 | Colocar Janela | rótulo de categoria | place_window | Place Window |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:15 | Colocar Piso | rótulo de categoria | place_floor | Place Floor |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:16 | Colocar Laje | rótulo de categoria | place_slab | Place Slab |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:17 | Colocar Forro | rótulo de categoria | place_ceiling | Place Ceiling |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:18 | Colocar Telhado | rótulo de categoria | place_roof | Place Roof |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:19 | Colocar Telhado por extrusão | rótulo de categoria | place_roof_extrusion | Place Roof by Extrusion |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:20 | Colocar Escada (croqui) | rótulo de categoria | place_stair_sketch | Place Stair by Sketch |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:21 | Colocar Escada | rótulo de categoria | place_stair | Place Stair |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:22 | Colocar Rampa | rótulo de categoria | place_ramp | Place Ramp |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:41 | Tipo de parede | rótulo do seletor de tipo | prop_type_wall | Wall Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:46 | Tipo de abertura | rótulo do seletor de tipo | prop_type_opening | Opening Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:51 | Tipo de abertura | rótulo do seletor de tipo | prop_type_opening | Opening Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:56 | Tipo de piso | rótulo do seletor de tipo | prop_type_floor | Floor Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:61 | Tipo de laje | rótulo do seletor de tipo | prop_type_slab | Slab Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:66 | Tipo de forro | rótulo do seletor de tipo | prop_type_ceiling | Ceiling Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:72 | Tipo de telhado | rótulo do seletor de tipo | prop_type_roof | Roof Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:78 | Tipo de escada | rótulo do seletor de tipo | prop_type_stair | Stair Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:88 | Tipo de escada | rótulo do seletor de tipo | prop_type_stair | Stair Type |
| 07-propriedades | apps/web/src/ui/ToolTypeProps.tsx:96 | Tipo de rampa | rótulo do seletor de tipo | prop_type_ramp | Ramp Type |
| 07-propriedades | apps/web/src/ui/MoveLevel.tsx:38 | Nível | rótulo de campo | fld_level | Level |
| 07-propriedades | apps/web/src/ui/MoveLevel.tsx:46 | Ao trocar | rótulo de campo | fld_when_changing | When Changing |
| 07-propriedades | apps/web/src/ui/OptionsBar.tsx:23 | Eixo da parede | opção de select | loc_wall_center | Wall Centerline |
| 07-propriedades | apps/web/src/ui/OptionsBar.tsx:24 | Eixo do núcleo | opção de select | loc_core_center | Core Centerline |
| 07-propriedades | apps/web/src/ui/OptionsBar.tsx:25 | Face externa do acabamento | opção de select | loc_finish_exterior | Finish Face: Exterior |
| 07-propriedades | apps/web/src/ui/OptionsBar.tsx:26 | Face interna do acabamento | opção de select | loc_finish_interior | Finish Face: Interior |
| 07-propriedades | apps/web/src/ui/OptionsBar.tsx:27 | Face externa do núcleo | opção de select | loc_core_exterior | Core Face: Exterior |
| 07-propriedades | apps/web/src/ui/OptionsBar.tsx:28 | Face interna do núcleo | opção de select | loc_core_interior | Core Face: Interior |
| 07-propriedades | apps/web/src/editor/levelActions.ts:28 | Manter a cota | opção de select | opt_keep_elevation | Keep Elevation |
| 07-propriedades | apps/web/src/editor/levelActions.ts:28 | Levar o deslocamento | opção de select | opt_keep_offset | Keep Offset |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:23 | Eixo da parede | const módulo | loc_wall_center | Wall Centerline |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:24 | Eixo do núcleo | const módulo | loc_core_center | Core Centerline |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:25 | Face externa do acabamento | const módulo | loc_finish_exterior | Finish Face: Exterior |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:26 | Face interna do acabamento | const módulo | loc_finish_interior | Finish Face: Interior |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:27 | Face externa do núcleo | const módulo | loc_core_exterior | Core Face: Exterior |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:28 | Face interna do núcleo | const módulo | loc_core_interior | Core Face: Interior |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:44 | Família | JSX texto | dim_family | Family |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:55 | Direção | JSX texto | dim_direction | Direction |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:57 | Automática (pela referência) | opção select | dim_dir_auto | Automatic (by reference) |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:58 | Alinhada | opção select | dim_dir_aligned | Aligned |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:63 | Sequência | JSX texto | dim_string | Dimension String |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:63 | Contínua | opção select | dim_string_continuous | Continuous |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:63 | A partir de uma base | opção select | dim_string_baseline | Baseline |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:97 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:142 | TOOL_LABEL[tool] | const PT (@hestia/tools) | tool_* (toolLabel) | (usar toolLabel) |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:142 | Configurações em Propriedades | JSX texto | opt_settings_in_props | Settings in Properties |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:148 | Cotas automáticas… | JSX texto botão | opt_auto_dim_btn | Auto Dimensions… |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:160 | Forma | JSX texto | opt_shape | Shape |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:162 | Reta | opção select | opt_shape_line | Straight |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:163 | Arco (3 pontos) | opção select | opt_shape_arc3 | Arc (3 points) |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:164 | Retângulo (2 cantos) | opção select | opt_shape_rect | Rectangle (2 corners) |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:168 | Linha de localização | JSX texto | opt_location_line | Location Line |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:176 | Altura | JSX texto | opt_height | Height |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:179 | Encadear | JSX texto checkbox | opt_chain | Chain |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:191 | Largura | JSX texto | opt_width | Width |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:192 | Chamada | JSX texto | opt_leader | Leader |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:192 | Sem líder | opção select | opt_leader_none | No leader |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:192 | Com dobra | opção select | opt_leader_elbow | Elbow |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:216 | Deslocamento do topo | JSX texto | opt_top_offset | Top Offset |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:313 | {n} selecionado(s) | JSX texto | opt_selected_count | {n} selected |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:313 | Nada selecionado | JSX texto | opt_nothing_selected | Nothing selected |
| 08-options-bars | apps/web/src/ui/OptionsBar.tsx:315 | Excluir (Del) | JSX texto botão | opt_delete | Delete (Del) |
| 08-options-bars | apps/web/src/ui/SlabOptionsBar.tsx:17 | Inclinação | JSX texto | opt_slope | Slope |
| 08-options-bars | apps/web/src/ui/SlabOptionsBar.tsx:32 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/SlabOptionsBar.tsx:40 | Deslocamento do topo | JSX texto | opt_top_offset | Top Offset |
| 08-options-bars | apps/web/src/ui/CeilingOptionsBar.tsx:15 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/CeilingOptionsBar.tsx:23 | Cota do topo | JSX texto | opt_height_offset | Height Offset From Level |
| 08-options-bars | apps/web/src/ui/RoofOptionsBar.tsx:22 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/RoofOptionsBar.tsx:30 | Inclinação | JSX texto | opt_slope | Slope |
| 08-options-bars | apps/web/src/ui/RoofOptionsBar.tsx:34 | Graus | JSX texto | opt_degrees | Degrees |
| 08-options-bars | apps/web/src/ui/RoofOptionsBar.tsx:38 | Balanço | JSX texto | opt_overhang | Overhang |
| 08-options-bars | apps/web/src/ui/RoofOptionsBar.tsx:42 | Cota do beiral | JSX texto | opt_eave_height | Eave Height |
| 08-options-bars | apps/web/src/ui/RoofOptionsBar.tsx:47 | Automática | JSX texto botão | opt_automatic | Automatic |
| 08-options-bars | apps/web/src/ui/RoofArrowOptionsBar.tsx:23 | Converter para águas livres | JSX texto botão | opt_roof_arrow_free | Convert to Free Form |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:57 | STAIR_SUBMODE_LABEL[m] | const PT (@hestia/tools) | stair_submode_* | (usar I18N) |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:62 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:83 | Pegar linhas | JSX texto botão | opt_pick_lines | Pick Lines |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:98 | Espelhos | JSX texto | opt_risers | Risers |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:116 | Nível de topo | JSX texto | ramp_levels_top | (já existe) Top level |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:118 | Automático (nível acima) | opção select | ramp_levels_auto | (já existe) Automatic (level above) |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:120 | Até {nível} | opção select | ramp_levels_until | (já existe) Up to |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:125 | Desloc. da base | JSX texto | ramp_levels_base_offset | (já existe) Base offset |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:129 | Desloc. do topo | JSX texto | ramp_levels_top_offset | (já existe) Top offset |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:134 | Altura | JSX texto | opt_height | Height |
| 08-options-bars | apps/web/src/ui/StairOptionsBar.tsx:141 | Concluir | JSX texto botão | btn_finish | Finish |
| 08-options-bars | apps/web/src/ui/StairRunOptionsBar.tsx:44 | Forma | JSX texto | opt_shape | Shape |
| 08-options-bars | apps/web/src/ui/StairRunOptionsBar.tsx:57 | STAIR_RUN_SHAPE_LABEL[shape] | const PT (@hestia/tools) | stair_shape_* | (usar I18N) |
| 08-options-bars | apps/web/src/ui/StairRunOptionsBar.tsx:64 | Largura | JSX texto | opt_width | Width |
| 08-options-bars | apps/web/src/ui/StairRunOptionsBar.tsx:132 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/RampOptionsBar.tsx:10 | Reta | const módulo | opt_shape_line | Straight |
| 08-options-bars | apps/web/src/ui/RampOptionsBar.tsx:10 | Em L | const módulo | opt_shape_l | L-Shape |
| 08-options-bars | apps/web/src/ui/RampOptionsBar.tsx:10 | Em U | const módulo | opt_shape_u | U-Shape |
| 08-options-bars | apps/web/src/ui/RampOptionsBar.tsx:42 | Forma | JSX texto | opt_shape | Shape |
| 08-options-bars | apps/web/src/ui/RampOptionsBar.tsx:48 | Largura | JSX texto | opt_width | Width |
| 08-options-bars | apps/web/src/ui/RampOptionsBar.tsx:83 | Modo de entrada | JSX texto | opt_input_mode | Input Mode |
| 08-options-bars | apps/web/src/ui/RampOptionsBar.tsx:97 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/GridOptionsBar.tsx:30 | Tipo | JSX texto | opt_type | Type |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:8 | Perímetro do telhado | const módulo | pm_title_roof | Roof Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:9 | Perímetro do piso | const módulo | pm_title_floor | Floor Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:10 | Perímetro da laje | const módulo | pm_title_slab | Slab Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:11 | Perímetro do forro | const módulo | pm_title_ceiling | Ceiling Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:16 | Criar perímetro do telhado | const módulo | pm_tool_roof | Create Roof Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:17 | Criar perímetro do piso | const módulo | pm_tool_floor | Create Floor Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:18 | Criar perímetro da laje | const módulo | pm_tool_slab | Create Slab Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:19 | Criar perímetro do forro | const módulo | pm_tool_ceiling | Create Ceiling Perimeter |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:34 | Laço aberto: uma ponta não encontra outra linha. | const módulo | pm_issue_open | Open loop: one end does not meet another line. |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:35 | Laço com menos de três lados. | const módulo | pm_issue_too_few | Loop with fewer than three sides. |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:36 | Há uma linha de comprimento zero. | const módulo | pm_issue_zero_length | There is a zero-length line. |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterStatus.ts:37 | Uma linha cruza outra do mesmo laço. | const módulo | pm_issue_self_cross | One line crosses another in the same loop. |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:36 | PERIMETER_TOOL[target] · PERIMETER_MODIFY_LABEL[modify] | const PT (@hestia/tools) | pm_tool_* + pm_modify_* | (usar I18N) |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:39 | Balanço | JSX texto | opt_overhang | Overhang |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:45 | Deslocamento do nível | JSX texto | pm_level_offset | Level Offset |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:56 | Vincular às paredes (esboço por perímetro) | JSX texto checkbox | pm_link_walls | Link to Walls (perimeter sketch) |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:61 | Acompanhar o ambiente (esboço por ambiente) | JSX texto checkbox | pm_follow_room | Follow Room (room sketch) |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:65 | Estender até o núcleo da parede | JSX texto checkbox | pm_extend_core | Extend to Wall Core |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:69 | Inclinação padrão das arestas | JSX texto | pm_edge_slope | Default Edge Slope |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:39 | Linha (contorno por pontos) | const label galeria | pm_shape_line | Line (boundary by points) |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:42 | Retângulo | const label galeria | pm_shape_rect | Rectangle |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:113 | Concluir | atributo aria-label | btn_finish | Finish |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:117 | Concluir | JSX texto botão | btn_finish | Finish |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:119 | Cancelar | atributo aria-label | stt_cancel | (já existe) Cancel |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:123 | Cancelar | JSX texto botão | stt_cancel | (já existe) Cancel |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:132 | Linha de limite | atributo title + aria-label | pm_line_boundary | Boundary Line |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:137 | Linha de limite | JSX texto botão | pm_line_boundary | Boundary Line |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:140 | Seta de inclinação | atributo title + aria-label | pm_slope_arrow | Slope Arrow |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:145 | Seta de inclinação | JSX texto botão | pm_slope_arrow | Slope Arrow |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:43 | Aresta selecionada | JSX texto | pm_edge_selected | Selected Edge |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:44 | {n} de {total} | JSX texto | pm_edge_of | {n} of {total} |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:46 | Comprimento | JSX texto | pm_length | Length |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:51 | Define inclinação | JSX texto | pm_defines_slope | Defines Slope |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:53 | sim | JSX texto | pm_yes | yes |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:53 | não (empena) | JSX texto | pm_no_gable | no (gable) |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:56 | Inclinação | JSX texto | opt_slope | Slope |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:59 | Inclinação (ângulo) | JSX texto | pm_slope_angle | Slope (angle) |
| 08-options-bars | apps/web/src/ui/perimeter/PerimeterProps.tsx:70 | Balanço da aresta | JSX texto | pm_edge_overhang | Edge Overhang |
| 08-options-bars | apps/web/src/ui/DisjoinCheck.tsx:11 | Desconectar | JSX texto | opt_disjoin | Disjoin |
| 08-options-bars | packages/tools/src/stairSketchState.ts:10 | Limites | const módulo | stair_submode_boundary | Boundary |
| 08-options-bars | packages/tools/src/stairSketchState.ts:11 | Espelhos | const módulo | stair_submode_riser | Riser |
| 08-options-bars | packages/tools/src/stairSketchState.ts:12 | Caminhada | const módulo | stair_submode_path | Stair Path |
| 08-options-bars | packages/tools/src/stairSketchState.ts:13 | Patamar | const módulo | stair_submode_landing | Landing |
| 08-options-bars | packages/tools/src/stairSketchState.ts:14 | Concluir | const módulo | stair_submode_finish | Finish |
| 09-editor | state.ts:337 | Pronto. | mensagem status | msg_ready | Ready. |
| 09-editor | sheetActions.ts:30 | Nova prancha | nome padrão | def_new_sheet | New Sheet |
| 09-editor | areaPlanActions.ts:26 | Planta de área — {nível} | nome padrão | def_area_plan_name | Area Plan — {level} |
| 09-editor | viewTabActions.ts:21 | Modelo 3D | label | def_3d_view_tab | 3D Model |
| 10-canvas-pranchas | apps/web/src/ui/SectionCanvas.tsx:68 | Corte | ternário PT/EN inline | vp_section_kind | Section |
| 10-canvas-pranchas | apps/web/src/ui/SectionCanvas.tsx:68 | Elevação | ternário PT/EN inline | vp_elevation_kind | Elevation |
| 10-canvas-pranchas | apps/web/src/ui/ViewportCanvas.tsx:416 | Peitoril ${formatQuantity(...)} | canvas/SVG (rótulo desenhado) | vp_preview_sill | Sill ${value} |
| 10-canvas-pranchas | apps/web/src/ui/ViewportCanvas.tsx:417 | Altura ${formatQuantity(...)} | canvas/SVG (rótulo desenhado) | vp_preview_height | Height ${value} |
| 10-canvas-pranchas | apps/web/src/ui/viewcube.ts:38 | SUPERIOR | canvas/SVG (rótulo visível) | vc_face_top | TOP |
| 10-canvas-pranchas | apps/web/src/ui/viewcube.ts:39 | INFERIOR | canvas/SVG (rótulo visível) | vc_face_bottom | BOTTOM |
| 10-canvas-pranchas | apps/web/src/ui/viewcube.ts:40 | FRONTAL | canvas/SVG (rótulo visível) | vc_face_front | FRONT |
| 10-canvas-pranchas | apps/web/src/ui/viewcube.ts:41 | POSTERIOR | canvas/SVG (rótulo visível) | vc_face_back | BACK |
| 10-canvas-pranchas | apps/web/src/ui/viewcube.ts:42 | DIREITA | canvas/SVG (rótulo visível) | vc_face_right | RIGHT |
| 10-canvas-pranchas | apps/web/src/ui/viewcube.ts:43 | ESQUERDA | canvas/SVG (rótulo visível) | vc_face_left | LEFT |
| 10-canvas-pranchas | apps/web/src/ui/Progresso3D.tsx:29 | Montando o modelo 3D… ${montados} de ${total} pavimentos | JSX texto | prog_3d_text | Building 3D model… {n} of {total} levels |
| 10-canvas-pranchas | apps/web/src/ui/progressoAbertura.ts:14 | Lendo arquivo | constante módulo | prog_phase_reading | Reading file |
| 10-canvas-pranchas | apps/web/src/ui/progressoAbertura.ts:15 | Preparando o pavimento ativo | constante módulo | prog_phase_active | Preparing active level |
| 10-canvas-pranchas | apps/web/src/ui/progressoAbertura.ts:16 | Preparando o projeto | constante módulo | prog_phase_project | Preparing project |
| 10-canvas-pranchas | apps/web/src/ui/Tutorial.tsx:44 | Desenhe um circuito de paredes${sufixoAtalho('wall')} — clique nos pontos e feche no primeiro | JSX texto | tut_step_walls | Draw a loop of walls{shortcut} — click the points and close on the first one |
| 10-canvas-pranchas | apps/web/src/ui/Tutorial.tsx:45 | Insira uma porta${sufixoAtalho('door')} e uma janela${sufixoAtalho('window')} sobre as paredes | JSX texto | tut_step_openings | Insert a door{doorShortcut} and a window{windowShortcut} on the walls |
| 10-canvas-pranchas | apps/web/src/ui/Tutorial.tsx:46 | Selecione uma parede e troque o tipo nas Propriedades | JSX texto | tut_step_type | Select a wall and change its type in Properties |
| 10-canvas-pranchas | apps/web/src/ui/Tutorial.tsx:47 | Abra o Modelo 3D no navegador de projeto | JSX texto | tut_step_3d | Open the 3D Model in the Project Browser |
| 10-canvas-pranchas | apps/web/src/ui/Tutorial.tsx:48 | Salve o projeto (Ctrl+S) | JSX texto | tut_step_save | Save the project (Ctrl+S) |
| 10-canvas-pranchas | apps/web/src/ui/Tutorial.tsx:65 | Passo ${now + 1} de ${steps.length} | JSX texto | tut_step_count | Step {n} of {total} |
| 10-canvas-pranchas | apps/web/src/ui/Tutorial.tsx:72 | Dispensar | JSX texto | tut_dismiss | Dismiss |
| 10-canvas-pranchas | apps/web/src/ui/IssuesButton.tsx:49 | ✓ Modelo sem avisos | JSX texto | issue_none | ✓ Model has no warnings |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:22 | Erros | constante módulo (dado de UI) | issue_sev_error | Errors |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:22 | Avisos | constante módulo (dado de UI) | issue_sev_warning | Warnings |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:22 | Informações | constante módulo (dado de UI) | issue_sev_info | Information |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:38 | 1 erro | status | issue_count_error_one | 1 error |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:38 | ${errors} erros | status | issue_count_errors | {n} errors |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:39 | 1 aviso | status | issue_count_warning_one | 1 warning |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:39 | ${warnings} avisos | status | issue_count_warnings | {n} warnings |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:40 | 1 informação | status | issue_count_info_one | 1 information |
| 10-canvas-pranchas | apps/web/src/editor/issuesView.ts:40 | ${infos} informações | status | issue_count_info | {n} information |
| 10-canvas-pranchas | apps/web/src/ui/Browser.tsx:18 | Navegador de projeto - ${p.name} | JSX texto | br_panel_title | Project Browser - ${name} |
| 10-canvas-pranchas | apps/web/src/ui/Browser.tsx:28 | Grupos | JSX texto | br_groups | Groups |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:63 | Abrir | menu (label) | br_open | Open |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:64 | Renomear | menu (label) | br_rename | Rename |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:65 | Excluir | menu (label) | br_delete | Delete |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:117 | Renomear… | menu (label) | br_rename_viewpoint | Rename… |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:119 | Excluir | menu (label) | br_delete | Delete |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:150 | Gerar elevações (Norte, Sul, Leste, Oeste) | menu (label) | br_generate_elevations | Generate Elevations (North, South, East, West) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:158 | Vistas (todas) | JSX texto | views_all | Views (all) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:159 | Plantas de piso (Planta de piso) | JSX texto | br_floor_plans_node | Floor Plans (Floor Plan) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:159 | Níveis… | menu (label) | br_levels | Levels… |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:170 | Abrir | menu (label) | br_open | Open |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:175 | Plantas de cobertura (Planta de cobertura) | JSX texto | br_roof_plans_node | Roof Plans (Roof Plan) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:185 | Abrir | menu (label) | br_open | Open |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:189 | Plantas de forro (Planta de forro) | JSX texto | br_ceiling_plans_node | Ceiling Plans (Ceiling Plan) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:192 | Plantas de área (Área) | JSX texto | br_area_plans_node | Area Plans (Area) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:218 | Vistas 3D (3D View) | JSX texto | br_3d_views_node | 3D Views (3D View) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:218 | Salvar vista atual… | menu (label) | br_save_view | Save Current View… |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:219 | Modelo 3D | JSX texto | br_3d_model | 3D Model |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:222 | Elevações (Elevação de edifício) | JSX texto | br_elevations_node | Elevations (Building Elevation) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:225 | Cortes (Corte de edifício) | JSX texto | br_sections_node | Sections (Building Section) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:228 | Vistas de desenho (Detalhe) | JSX texto | br_drafting_node | Drafting Views (Detail) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:229 | Legendas | JSX texto | br_legends_node | Legends |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:239 | Tabela de ambientes | JSX texto | br_sched_rooms | Room Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:240 | Tabela de escadas | JSX texto | br_sched_stairs | Stair Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:241 | Tabela de rampas | JSX texto | br_sched_ramps | Ramp Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:242 | Tabela de forros | JSX texto | br_sched_ceilings | Ceiling Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:243 | Tabela de lajes | JSX texto | br_sched_slabs | Slab Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:244 | Tabela de paredes | JSX texto | br_sched_walls | Wall Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:245 | Tabela de pisos | JSX texto | br_sched_floors | Floor Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:246 | Tabela de portas e janelas | JSX texto | br_sched_openings | Door and Window Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:247 | Tabela de telhados | JSX texto | br_sched_roofs | Roof Schedule |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:250 | Tabelas/Quantidades (todas) | JSX texto | schedules | Schedules/Quantities (all) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:285 | Pranchas (todas) | JSX texto | sheets | Sheets (all) |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:291 | Nova prancha | menu (label) | br_new_sheet | New Sheet |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:292 | Renumerar pranchas… | menu (label) | br_renumber_sheets | Renumber Sheets… |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:306 | Abrir | menu (label) | br_open | Open |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:307 | Propriedades da prancha… | menu (label) | br_sheet_props | Sheet Properties… |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:308 | Mover para cima | menu (label) | br_move_up | Move Up |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:309 | Mover para baixo | menu (label) | br_move_down | Move Down |
| 10-canvas-pranchas | apps/web/src/ui/browser/Views.tsx:311 | Duplicar | menu (label) | br_duplicate | Duplicate |
| 10-canvas-pranchas | apps/web/src/ui/browser/Families.tsx:48 | Famílias | JSX texto | families | Families |
| 10-canvas-pranchas | apps/web/src/ui/browser/Cad.tsx:23 | Importar CAD (DXF)… | menu (label) | br_import_cad | Import CAD (DXF)… |
| 10-canvas-pranchas | apps/web/src/ui/browser/Cad.tsx:30 | Ocultar | menu (label) | br_hide | Hide |
| 10-canvas-pranchas | apps/web/src/ui/browser/Cad.tsx:30 | Mostrar | menu (label) | br_show | Show |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:51 | Esquerda | constante módulo (label) | sheet_align_left | Left |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:52 | Centro H | constante módulo (label) | sheet_align_hcenter | H Center |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:53 | Direita | constante módulo (label) | sheet_align_right | Right |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:54 | Topo | constante módulo (label) | sheet_align_top | Top |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:55 | Centro V | constante módulo (label) | sheet_align_vcenter | V Center |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:56 | Base | constante módulo (label) | sheet_align_bottom | Bottom |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:86 | Ajustar | JSX texto | sheet_fit | Fit |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:88 | Ver vista | JSX texto | sheet_zoom_to_view | Zoom to View |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:90 | Grade | JSX texto | sheet_grid | Grid |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:91 | Encaixe | JSX texto | sheet_snap | Snap |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:92 | Mover | JSX texto | sheet_move | Move |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:93 | Alinhar | JSX texto | sheet_align | Align |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:99 | Escala | JSX texto | scale | Scale |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:116 | Ponto | JSX texto | sheet_point | Point |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:124 | Enquadramento padrão | JSX texto | sheet_default_framing | Default framing |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:130 | Trocar | JSX texto | sheet_change | Change |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:133 | Ajustar moldura | JSX texto | sheet_fit_crop | Fit Crop |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:134 | Recortar | JSX texto | sheet_crop | Crop |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:135 | Moldura | JSX texto | sheet_frame | Frame |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:136 | Legenda | JSX texto | sheet_view_title | View Title |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:137 | Travar | JSX texto | sheet_lock | Lock |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:138 | Moldura auto | JSX texto | sheet_auto_crop | Auto Fit |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:145 | Distribuir H | JSX texto | sheet_distribute_h | Distribute H |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:146 | Distribuir V | JSX texto | sheet_distribute_v | Distribute V |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:150 | Adicionar vista | JSX texto | sheet_add_view | Add View |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetControlBar.tsx:151 | Propriedades | JSX texto | properties_title | Properties |
| 10-canvas-pranchas | apps/web/src/ui/sheet/SheetStage.tsx:394 | Adicionar vista | JSX texto | sheet_add_view | Add View |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:34 | · Sem escala | canvas/SVG (rótulo desenhado) | sheet_caption_nts | · NTS |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:40 | Quadro geral de áreas | canvas/SVG (rótulo desenhado) | sheet_area_summary | Area Summary Schedule |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:51 | Sem escala | canvas/SVG (rótulo desenhado) | sheet_nts | NTS |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:113 | Projeto: ${tb.project} | canvas/SVG (carimbo) | sheet_stamp_project | Project: ${value} |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:114 | Cliente: ${tb.client} | canvas/SVG (carimbo) | sheet_stamp_client | Client: ${value} |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:115 | Autor: ${tb.author} | canvas/SVG (carimbo) | sheet_stamp_author | Author: ${value} |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:116 | Data: ${tb.date} | canvas/SVG (carimbo) | sheet_stamp_date | Date: ${value} |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:117 | Revisão: ${tb.revision} | canvas/SVG (carimbo) | sheet_stamp_revision | Revision: ${value} |
| 10-canvas-pranchas | packages/render/src/sheet/frame.ts:118 | Escala: ${...} | canvas/SVG (carimbo) | sheet_stamp_scale | Scale: ${value} |
| 10-canvas-pranchas | packages/model/src/defaults.ts:171 | Projeto sem título | nome padrão do documento | doc_untitled | Untitled Project |
| 10-canvas-pranchas | packages/model/src/defaults.ts:176 | Térreo | nome padrão do documento | level_ground | Level 1 |
| 10-canvas-pranchas | packages/model/src/defaults.ts:177 | Pavimento 2 | nome padrão do documento | level_2 | Level 2 |
| 11-packages-model-tools | apps/web/src/ui/OptionsBar.tsx:142 | TOOL_LABEL[tool] | rotulo enum | tool_{id} | Wall / Door / Window |
| 11-packages-model-tools | apps/web/src/ui/OptionsBar.tsx:146 | TOOL_LABEL[tool] | rotulo enum | tool_{id} | - |
| 11-packages-model-tools | apps/web/src/ui/Properties.tsx:433 | `Colocar ${TOOL_LABEL[tool]}` | mensagem | props_place_tool | Place {tool} |
| 11-packages-model-tools | packages/tools/src/alignTool.ts:44 | Alinhar: clique na referência e depois no que deseja alinhar. Ctrl+clique acumula vários; Tab alterna a feição sob o cursor; Esc volta um passo. | dica | th_align | Align: click the reference, then the item to align. Ctrl+click adds more; Tab cycles the feature under the cursor; Esc goes back one step. |
| 11-packages-model-tools | packages/tools/src/dimensionTool.ts:56 | Cota: clique no primeiro ponto medido, depois no segundo. Mova o cursor para o lado da linha de cota e clique (ou digite o deslocamento). | dica | th_dimension | Dimension: click the first measured point, then the second. Move the cursor to the dimension line side and click (or type the offset). |
| 11-packages-model-tools | packages/tools/src/levelTool.ts:40 | Nível: clique no início da linha do nível. O fim fica na mesma cota. Esc cancela. | dica | th_level | Level: click the start of the level line. The end stays at the same elevation. Esc cancels. |
| 11-packages-model-tools | packages/tools/src/openingTool.ts:62 | ${this.label}: o lado do cursor define para onde abre; passe o cursor sobre uma parede e clique. Tab inverte o sentido, Espaço a dobradiça. | dica | th_opening | Door/Window: the cursor side sets the swing; hover a wall and click. Tab flips the hand, Space the hinge. |
| 11-packages-model-tools | packages/tools/src/perimeterTool.ts:26 | Perímetro: escolha uma forma na barra, ou clique numa linha para selecionar. Concluir fecha o contorno. | dica | th_perimeter | Perimeter: pick a shape in the bar, or click a line to select it. Finish closes the outline. |
| 11-packages-model-tools | packages/tools/src/rampTool.ts:14 | Rampa: clique no centro da borda de início. Esc cancela. | dica | th_ramp | Ramp: click the center of the start edge. Esc cancels. |
| 11-packages-model-tools | packages/tools/src/roofTool.ts:11 | Telhado: use Criar/Editar perímetro na faixa. | dica | th_roof | Roof: use Create/Edit perimeter in the ribbon. |
| 11-packages-model-tools | packages/tools/src/roomTool.ts:26 | Ambiente: aponte para um circuito fechado de paredes e clique dentro dele. | dica | th_room | Room: point to a closed loop of walls and click inside it. |
| 11-packages-model-tools | packages/tools/src/sectionTool.ts:32 | Corte: clique no início da linha de corte. Esc cancela. | dica | th_section | Section: click the start of the section line. Esc cancels. |
| 11-packages-model-tools | packages/tools/src/selectTool.ts:58 | Clique para selecionar. Arraste para janela (esq→dir contém, dir→esq cruza). Shift ou Ctrl soma à seleção. | dica | th_select | Click to select. Drag for a window (left-to-right contains, right-to-left crosses). Shift or Ctrl adds to the selection. |
| 11-packages-model-tools | packages/tools/src/stairRunTool.ts:16 | Escada: clique no centro do 1º espelho. Esc cancela. | dica | th_stair_run | Stair: click the center of the 1st riser. Esc cancels. |
| 11-packages-model-tools | packages/tools/src/stairTool.ts:32 | Escada: desenhe o limite esquerdo; Enter passa ao direito e outro Enter vai a Espelhos. Esc cancela a cadeia; outro Esc descarta o croqui. | dica | th_stair_sketch | Stair: draw the left boundary; Enter moves to the right one and another Enter goes to Risers. Esc cancels the chain; another Esc discards the sketch. |
| 11-packages-model-tools | packages/tools/src/textTool.ts:15 | Texto: clique no ponto onde o texto fica, digite o texto e Enter. | dica | th_text | Text: click where the text goes, type the text and press Enter. |
| 11-packages-model-tools | packages/tools/src/transformTools.ts:84 | ${this.label}: clique no ponto base e depois no destino, ou digite a distância. | dica | th_move | Move/Copy: click the base point then the destination, or type the distance. |
| 11-packages-model-tools | packages/tools/src/transformTools.ts:353 | Rotacionar: clique no centro, depois na direção de referência e na direção final — ou digite o ângulo em graus. | dica | th_rotate | Rotate: click the center, then the reference direction and the final direction - or type the angle in degrees. |
| 11-packages-model-tools | packages/tools/src/transformTools.ts:447 | Espelhar: clique em dois pontos para definir o eixo de simetria. Tab: pegar uma parede como eixo. | dica | th_mirror | Mirror: click two points to define the symmetry axis. Tab: pick a wall as the axis. |
| 11-packages-model-tools | packages/tools/src/trimTool.ts:117 | Aparar/Estender: clique na parede de referência e depois na parede a estender, no lado que deve ficar. Arestas de piso/laje/telhado/forro ou do croqui de escada/rampa: duas arestas, como no canto. | dica | th_trim | Trim/Extend: click the reference wall then the wall to extend, on the side to keep. Floor/slab/roof/ceiling edges or stair/ramp sketch edges: two edges, as in the corner. |
| 11-packages-model-tools | packages/tools/src/wallTool.ts:22 | Parede: clique no ponto inicial. Tab alterna referências de alinhamento; Espaço inverte o lado. | dica | th_wall | Wall: click the start point. Tab cycles alignment references; Space flips the side. |
| 11-packages-model-tools | packages/tools/src/levelTool.ts:148 | Nível ${level.name} criado em ${signedElevation(u, level.elevation)}. Clique no início do próximo nível. | mensagem | msg_level_created | Level {name} created at {elevation}. Click the start of the next level. |
| 11-packages-model-tools | packages/tools/src/stairRunTool.ts:377 | Não é possível criar a escada: ${r?.error ?? 'falha ao gravar.'} | mensagem | msg_stair_fail | Cannot create the stair: {error} |
| 11-packages-model-tools | packages/tools/src/stairRunTool.ts:384 | Escada criada: ${b.risers} espelhos de ${cm(b.riserHeight)} cm, piso ${cm(b.tread)} cm.${extra}${avisoText} Ctrl+Z desfaz. | mensagem | msg_stair_created | Stair created: {n} risers of {h} cm, tread {t} cm.{note} Ctrl+Z undoes. |
| 11-packages-model-tools | packages/tools/src/rampTool.ts:320 | Não é possível criar a rampa: ${r?.error ?? 'falha ao gravar.'} | mensagem | msg_ramp_fail | Cannot create the ramp: {error} |
| 11-packages-model-tools | packages/tools/src/rampTool.ts:326 | Rampa criada: ${flightsText(plan.flights)}, inclinação ${formatRampSlope(plan.slope)}, ${mText(plan.pathLength)} m.${nota}${avisoText} Ctrl+Z desfaz. | mensagem | msg_ramp_created | Ramp created: {flights}, slope {slope}, {length} m.{note} Ctrl+Z undoes. |
| 11-packages-model-tools | packages/tools/src/roomTool.ts:75 | Ambiente ${room.number} criado: ${fmtArea(unitsOf(this.env.project()), polygonArea(polygon))}.${repeated ? ' Este circuito já tinha ambiente (aviso de duplicado).' : ''} Ctrl+Z desfaz. | mensagem | msg_room_created | Room {number} created: {area}.{warning} Ctrl+Z undoes. |
| 11-packages-model-tools | packages/tools/src/sketchShapes.ts:143 | Linha | rotulo enum | shape_line | Line |
| 11-packages-model-tools | packages/tools/src/sketchShapes.ts:144 | Retângulo | rotulo enum | shape_rectangle | Rectangle |
| 11-packages-model-tools | packages/tools/src/sketchShapes.ts:160 | Círculo | rotulo enum | shape_circle | Circle |
| 11-packages-model-tools | packages/tools/src/sketchShapes.ts:163 | Arco por 3 pontos | rotulo enum | shape_arc_3p | Arc by 3 Points |
| 11-packages-model-tools | packages/tools/src/sketchShapes.ts:178 | Concordância | rotulo enum | shape_fillet | Fillet |
| 11-packages-model-tools | packages/tools/src/sketchShapes.ts:187 | Elipse | rotulo enum | shape_ellipse | Ellipse |
| 11-packages-model-tools | packages/tools/src/stairLiveMessages.ts:4 | nível de topo alcançado | mensagem | msg_top_reached | top level reached |
| 11-packages-model-tools | packages/tools/src/stairLiveMessages.ts:17 | falta 1 espelho | mensagem | msg_risers_missing | 1 riser missing / {n} risers missing ({d} m) |
| 11-packages-model-tools | packages/tools/src/stairLiveMessages.ts:34 | ${risers} espelhos · ${numero(riserHeight * 100, 1)} cm · piso ${numero(tread * 100, 1)} cm · ${estado} | mensagem | msg_stair_live | {n} risers - {h} cm - tread {t} cm - {state} |
| 11-packages-model-tools | packages/tools/src/rampLiveMessages.ts:7 | nível de topo alcançado | mensagem | msg_top_reached | top level reached |
| 11-packages-model-tools | packages/tools/src/rampLiveMessages.ts:26 | faltam ${desnivel(falta)} de desnível${trechoEquivalente(falta, slope, ' de rampa')} | mensagem | msg_rise_missing | {d} m of rise missing ({l} m of ramp) |
| 11-packages-model-tools | packages/tools/src/wallOverlapGuard.ts:19 | Não é possível: a parede ficaria em cima da parede ${elementLabel(c.wall)} (${emCm(c.overlap.length)} no mesmo nível). Nada foi alterado. | mensagem | msg_wall_overlap | Not possible: the wall would sit on top of wall {wall} ({d} on the same level). Nothing changed. |
| 11-packages-model-tools | packages/tools/src/hostedLoss.ts:104 | Esta alteração deixa ${losses.length} elemento(s) fora da parede: ${list}. Eles serão excluídos. Continuar? | mensagem | msg_hosted_loss | This change leaves {n} element(s) outside the wall: {list}. They will be deleted. Continue? |
| 11-packages-model-tools | packages/model/src/defaults.ts:171 | Projeto sem título | nome padrao | doc_untitled_project | Untitled Project |
| 11-packages-model-tools | packages/model/src/defaults.ts:176 | Térreo | nome padrao | doc_level_ground | Ground Floor |
| 11-packages-model-tools | packages/model/src/defaults.ts:177 | Pavimento 2 | nome padrao | doc_level_2 | Level 2 |
| 11-packages-model-tools | packages/model/src/templates.ts:13 | Em branco | JSX texto | tpl_blank | Blank |
| 11-packages-model-tools | packages/model/src/templates.ts:16 | Mostruário de esquadrias | JSX texto | tpl_openings | Opening Showcase |
| 11-packages-model-tools | packages/model/src/templates.ts:21 | Casa térrea, 2 quartos | JSX texto | tpl_house2 | Single-Story House, 2 Bedrooms |
| 11-packages-model-tools | packages/model/src/templates.ts:23 | Casa de alto padrão, 2 pavimentos | JSX texto | tpl_house_premium | High-End House, 2 Stories |
| 11-packages-model-tools | packages/model/src/templates.ts:25 | Prédio, 10 pavimentos | JSX texto | tpl_building10 | Building, 10 Stories |
| 11-packages-model-tools | packages/model/src/templates.ts:27 | Quitinete | JSX texto | tpl_studio | Studio Apartment |
| 11-packages-model-tools | packages/model/src/templates.ts:13 | Dois níveis e os tipos de parede padrão. | JSX texto | tpl_blank_desc | Two levels and the standard wall types. |
| 11-packages-model-tools | packages/model/src/templates.ts:21 | Sala e cozinha integradas, banheiro e dois quartos. | JSX texto | tpl_house2_desc | Open living and kitchen, bathroom and two bedrooms. |
| 11-packages-model-tools | packages/model/src/templates.ts:25 | Núcleo de circulação central e quatro unidades por andar; lajes e pisos param no núcleo. | JSX texto | tpl_building10_desc | Central circulation core and four units per floor; slabs and floors stop at the core. |
| 11-packages-model-tools | packages/model/src/graphics.ts:13 | parede | rotulo enum | cat_wall | Wall |
| 11-packages-model-tools | packages/model/src/graphics.ts:14 | porta | rotulo enum | cat_door | Door |
| 11-packages-model-tools | packages/model/src/graphics.ts:15 | janela | rotulo enum | cat_window | Window |
| 11-packages-model-tools | packages/model/src/graphics.ts:16 | piso | rotulo enum | cat_floor | Floor |
| 11-packages-model-tools | packages/model/src/graphics.ts:17 | laje | rotulo enum | cat_slab | Slab |
| 11-packages-model-tools | packages/model/src/graphics.ts:18 | telhado | rotulo enum | cat_roof | Roof |
| 11-packages-model-tools | packages/model/src/graphics.ts:19 | escada e rampa | rotulo enum | cat_stair | Stairs and Ramps |
| 11-packages-model-tools | packages/model/src/graphics.ts:20 | ambiente | rotulo enum | cat_room | Room |
| 11-packages-model-tools | packages/model/src/graphics.ts:21 | anotação | rotulo enum | cat_annotation | Annotation |
| 11-packages-model-tools | packages/model/src/graphics.ts:22 | objeto importado | rotulo enum | cat_generic | Imported Object |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:60 | Extremidade | canvas texto | snap_endpoint | Endpoint |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:61 | Canto da face | canvas texto | snap_face | Face Corner |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:62 | Face do núcleo | canvas texto | snap_core | Core Face |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:63 | Ponto médio | canvas texto | snap_midpoint | Midpoint |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:64 | Interseção | canvas texto | snap_intersection | Intersection |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:65 | Perpendicular | canvas texto | snap_perpendicular | Perpendicular |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:66 | Na parede | canvas texto | snap_nearest | Nearest |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:67 | Alinhamento | canvas texto | snap_alignment | Alignment |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:68 | Ortogonal | canvas texto | snap_ortho | Orthogonal |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:69 | Polar | canvas texto | snap_polar | Polar |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:70 | Centro do arco | canvas texto | snap_center | Arc Center |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:71 | Tangente ao arco | canvas texto | snap_tangent | Tangent |
| 12-packages-render-io-engine | packages/render/src/plan/overlay.ts:81 | parede | canvas texto | snap_host_wall | wall |
| 12-packages-render-io-engine | packages/render/src/plan/stairs.ts:397 | SOBE | canvas texto | stair_up | UP |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:34 | Sem escala | PDF/carimbo | sheet_no_scale | Not to Scale |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:38 | Vista inexistente | PDF/carimbo | sheet_view_missing | View not found |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:40 | Quadro geral de áreas | PDF/carimbo | sheet_area_table | Area Summary |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:43 | Vista inexistente | PDF/carimbo | sheet_view_missing | View not found |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:51 | Sem escala | PDF/carimbo | sheet_no_scale | Not to Scale |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:113 | Projeto: | PDF/carimbo | sheet_tb_project | Project: |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:114 | Cliente: | PDF/carimbo | sheet_tb_client | Client: |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:115 | Autor: | PDF/carimbo | sheet_tb_author | Author: |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:116 | Data: | PDF/carimbo | sheet_tb_date | Date: |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:117 | Revisão: | PDF/carimbo | sheet_tb_revision | Revision: |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:118 | Escala: | PDF/carimbo | sheet_tb_scale | Scale: |
| 12-packages-render-io-engine | packages/render/src/sheet/frame.ts:123 | Rev. | PDF/carimbo | sheet_tb_rev_short | Rev. |
| 12-packages-render-io-engine | packages/render/src/sheet/viewports.ts:58 | Vista removida | PDF/quadro | sheet_view_removed | View removed |
| 12-packages-render-io-engine | packages/render/src/sheet/viewports.ts:102 | Nº | PDF/cabeçalho | sheet_col_no | No. |
| 12-packages-render-io-engine | packages/render/src/sheet/viewports.ts:103 | AMBIENTE | PDF/cabeçalho | sheet_col_room | ROOM |
| 12-packages-render-io-engine | packages/render/src/sheet/viewports.ts:104 | NÍVEL | PDF/cabeçalho | sheet_col_level | LEVEL |
| 12-packages-render-io-engine | packages/render/src/sheet/viewports.ts:105 | ÁREA | PDF/cabeçalho | sheet_col_area | AREA |
| 12-packages-render-io-engine | packages/render/src/sheet/viewports.ts:112 | Quadro geral de áreas | PDF/quadro | sheet_area_table | Area Summary |
