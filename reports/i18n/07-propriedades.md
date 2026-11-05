# 07 — Propriedades, campos e seletores de tipo (paleta de propriedades)
- Escopo: `apps/web/src/ui/*Properties.tsx`, `fields.tsx`, `TypeSelector.tsx`, `TypeRow.tsx`, `TypePreview.tsx`, `typeFamilies.ts`, `typeOptions.ts`, `LevelField.tsx`, `NivelCotaEditor.tsx`, `ProfileRow.tsx`, `RoofProfileRow.tsx`, `RampLevelsFields.tsx`, `RoofMansardProps.tsx`, `RoofPlanesProps.tsx`, `rampFormat.ts`, `graphicsLabels.ts`, `ViewOptionRows.tsx`, `MoveLevel.tsx`, `LevelMoveConflictDialog.tsx`, `OutlineGroup.tsx`, `CeilingOutlineGroup.tsx`, `GridProperties.tsx`, `PanelHead.tsx`, `LabelScroll.tsx`, `EmptyViews.tsx`, `DisjoinCheck.tsx`, `PopupMenu.tsx`, `SheetView.tsx`
- Arquivos analisados: 50 (43 em `apps/web/src/ui` + 7 arquivos de rótulos compartilhados fora da pasta)
- Ocorrências: 1025 (P0: 212, P1: 771, P2: 42)

## Resumo executivo
A paleta de propriedades é o ponto mais monolítico de PT fixo do app: praticamente todos os rótulos de campo, títulos de grupo, opções de select, mensagens de validação e rótulos de desfazer são strings literais em português. Só `StairProperties`, `RampProperties`, `PlacementProperties` e `RampLevelsFields` importam `useI18n`, e mesmo eles usam o dicionário apenas em uma minoria dos textos (escada livre/rampa e níveis). O dicionário atual não tem chaves de campo (`fld_*`) nem de grupo de propriedades (`pgrp_*`): existem apenas `properties_title`, `type_selector_label` e `edit_type_btn`. Os enums compartilhados que alimentam a paleta — `LOCATION_LABEL`, `LEVEL_KEEP_LABEL`, `FUNCTION_LABEL`, `SECTION_ROLE_LABEL`, `ROOF_SHAPE_LABEL`, `STAIR_RUN_SHAPE_LABEL` e os nomes de família de abertura — também são mapas PT fixos, então trocar para EN deixa metade do painel em português. O seletor de tipo repete o problema: famílias (`Parede básica`, `Piso`, `Laje`...), estado misto (`variados`) e busca (`Pesquisar tipos…`) são PT, embora `edit_type_btn` já exista em EN. Formatação numérica força vírgula decimal em cinco pontos, independentemente do idioma/unidade, e alguns rótulos fixam `m`/`cm`/`mm` enquanto o campo usa a unidade do projeto (quebra em pés/polegadas).

## Causas-raiz
1. **Componentes sem i18n**: `Properties.tsx` não importa `useI18n` (imports em `apps/web/src/ui/Properties.tsx:1-71`); o mesmo vale para `RoomProperties`, `SlabProperties`, `FloorProperties`, `CeilingProperties`, `RoofProperties`, `AnnotationProps`, `AreaPlanProperties`, `SectionViewProps`, `GraphicsProps`, `TypeSelector`, `TypeRow`, `TypePreview`, `LevelField`, `ProfileRow`, `GridProperties`, `GenericProps`, `CadProps` e `ToolTypeProps`.
2. **Rótulos declarados em constantes de módulo**: `typeFamilies.ts:4-11`, `TypeRow.tsx:138-146`, `StairProperties.tsx:28-31`, `RampProperties.tsx:18-19`, `ToolTypeProps.tsx:11-23`, `GraphicsProps` via `graphicsLabels.ts:5-37`. Constantes calculadas uma vez nunca acompanham `lang`.
3. **Enums fora do dicionário**: `LOCATION_LABEL` em `apps/web/src/ui/OptionsBar.tsx:22-29` (usado em `Properties.tsx:190` e `PlacementProperties.tsx:50`); `LEVEL_KEEP_LABEL` em `apps/web/src/editor/levelActions.ts:28`; `FUNCTION_LABEL` em `packages/model/src/priority.ts:17-24`; `SECTION_ROLE_LABEL` em `packages/model/src/sectionView.ts:286-291`; `ROOF_SHAPE_LABEL` em `packages/engine/src/roofSchedule.ts:7-14`; `STAIR_RUN_SHAPE_LABEL` em `packages/tools/src/stairRunPlan.ts:27-34`; famílias de abertura em `packages/model/src/opening.ts:154-173`; categorias de ambiente em `packages/model/src/areaPlan.ts:154-163`.
4. **`TOOL_LABEL` usado como texto visível**: `Properties.tsx:433` monta ``Colocar ${TOOL_LABEL[tool]}``; deveria usar `toolLabel(tool)`/`I18N[lang]` (o `TOOL_LABEL` de `@hestia/tools` é o catálogo PT).
5. **Dicionário sem vocabulário de propriedades**: em `apps/web/src/editor/i18n.ts` só existem `properties_title` (linha 102), `type_selector_label` (104) e `edit_type_btn` (105); não há prefixos `fld_`, `pgrp_`, `opt_`, `msg_` de propriedades. Todas as chaves propostas neste relatório precisam ser declaradas nesse arquivo (bloco `// Propriedades`), em `pt` e `en`.
6. **Formatação numérica com vírgula fixa**: `fields.tsx:8` (`toFixed(...).replace('.', ',')`), `RampProperties.tsx:17`, `rampFormat.ts:10`, `StairProperties.tsx:268`, `GenericProps.tsx:7`, `NivelCotaEditor.tsx:83` e `:109`. Em EN o esperado é ponto decimal (e `Intl.NumberFormat`/locale).
7. **Unidade fixa no rótulo, unidade variável no campo**: `RampProperties.tsx:130` (`Pé-direito livre (m)`) e `:142` (`Folga lateral (m)`) usam `unit="m"`; `CadProps.tsx:34` (`Deslocamento (m)`) usa `quantity="length"`; `PlacementProperties.tsx:62` (`Folga da quina (cm)`) usa `quantity="smallLength"`; `SectionViewProps.tsx:105/108` (`Seta (mm)`/`Texto (mm)`); `NivelCotaEditor.tsx:179` sufixo `m`. Em unidades imperiais o rótulo mente.
8. **Estado persistido e validação acoplados ao texto PT**: `fields.tsx:236` usa `pgroup:${title}` como chave de localStorage — trocar de idioma “esquece” grupos abertos; `Properties.tsx:269` e `:275` usam `status.startsWith('Peitoril inválido')` / `'Altura inválida'` para limpar mensagem, então traduzir o texto quebra a limpeza; `StairProperties.tsx:85` depende de `t.stair_free_path_info` (ok), mas `RISER_MODE_OPTIONS` (29-30) é PT fixo.
9. **Mensagens de status e rótulos de desfazer em PT**: praticamente todo `useUi.setState({ status: ... })` e o segundo argumento de `store.exec(..., 'rótulo')` está em PT (`TypeRow.tsx:90-130`, `RoomProperties.tsx:66-128`, `StairProperties.tsx:94-158`, `SlabProperties.tsx:28`, `AnnotationProps.tsx:257`, `RoofProperties.tsx:94/109`, `GridProperties.tsx:28-36`). O histórico de desfazer aparece traduzido pela metade.
10. **Nomes padrão e dados do documento**: `typeFamilies.ts` e `opening.ts` definem famílias PT; `DEFAULT_ROOM_CATEGORIES` (`areaPlan.ts:154-163`) cria “Sala/Cozinha/Quarto...” no documento. Família/categoria são dado do usuário depois de criadas, mas o **nome padrão gerado na criação** precisa nascer no idioma ativo.

## Inventário
| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/Properties.tsx:84 | `Encosto` | opção de select | P1 | `opt_join_butt` | Butt | tipo de junção (Revit: Butt) |
| 2 | apps/web/src/ui/Properties.tsx:84 | `Esquadria` | opção de select | P1 | `opt_join_miter` | Miter | tipo de junção (Revit: Miter) |
| 3 | apps/web/src/ui/Properties.tsx:92 | `Início` | rótulo de campo | P1 | `fld_start` | Start |  |
| 4 | apps/web/src/ui/Properties.tsx:92 | `Fim` | rótulo de campo | P1 | `fld_end` | End |  |
| 5 | apps/web/src/ui/Properties.tsx:104 | `${label}: junção` | rótulo de campo (template) | P1 | `fld_join_at` | ${label}: Join | concatenar com o rótulo Início/Fim |
| 6 | apps/web/src/ui/Properties.tsx:110 | `Inverter ordem` | rótulo de campo | P1 | `fld_flip_order` | Flip Order |  |
| 7 | apps/web/src/ui/Properties.tsx:115 | `Livre` | valor | P1 | `opt_join_free` | Free | estado da junção |
| 8 | apps/web/src/ui/Properties.tsx:115 | `Não unido` | valor | P1 | `opt_not_joined` | Not Joined |  |
| 9 | apps/web/src/ui/Properties.tsx:115 | `Em T (encosto fixo)` | valor | P1 | `opt_tee_fixed` | Tee (fixed butt) |  |
| 10 | apps/web/src/ui/Properties.tsx:115 | `Nó com ${n} paredes` | mensagem | P1 | `msg_node_walls` | Node with {n} walls | template com contagem |
| 11 | apps/web/src/ui/Properties.tsx:116 | `${label}: junção` | rótulo de campo (template) | P1 | `fld_join_at` | ${label}: Join | segunda ocorrência (junção sem par) |
| 12 | apps/web/src/ui/Properties.tsx:152 | `Tipo de parede` | rótulo do seletor de tipo | P0 | `prop_type_wall` | Wall Type |  |
| 13 | apps/web/src/ui/Properties.tsx:153 | `Paredes (${n})` | rótulo de categoria | P0 | `cat_walls` | Walls ({n}) | template com contagem |
| 14 | apps/web/src/ui/Properties.tsx:160 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 15 | apps/web/src/ui/Properties.tsx:161 | `Nível base` | rótulo de campo | P0 | `fld_base_level` | Base Level |  |
| 16 | apps/web/src/ui/Properties.tsx:162 | `Desloc. da base` | rótulo de campo | P0 | `fld_base_offset` | Base Offset |  |
| 17 | apps/web/src/ui/Properties.tsx:163 | `Nível superior` | rótulo de campo | P0 | `fld_top_level` | Top Level |  |
| 18 | apps/web/src/ui/Properties.tsx:165 | `variados` | opção de select | P0 | `opt_varied` | Varies | usado quando a seleção tem valores diferentes |
| 19 | apps/web/src/ui/Properties.tsx:166 | `Não vinculado` | opção de select | P0 | `opt_not_attached` | Not Attached |  |
| 20 | apps/web/src/ui/Properties.tsx:167 | `Até {l.name}` | opção de select | P0 | `opt_up_to` | Up to {name} | template com nome do nível |
| 21 | apps/web/src/ui/Properties.tsx:171 | `Altura` | rótulo de campo | P0 | `fld_height` | Height |  |
| 22 | apps/web/src/ui/Properties.tsx:173 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 23 | apps/web/src/ui/Properties.tsx:175 | `Topo no telhado` | rótulo de campo | P0 | `fld_top_to_roof` | Top Attached to Roof |  |
| 24 | apps/web/src/ui/Properties.tsx:176 | `Base no piso` | rótulo de campo | P0 | `fld_base_to_floor` | Base Attached to Floor |  |
| 25 | apps/web/src/ui/Properties.tsx:176 | `Desanexar` | botão | P0 | `btn_detach` | Detach |  |
| 26 | apps/web/src/ui/Properties.tsx:176 | `Anexar` | botão | P0 | `btn_attach` | Attach |  |
| 27 | apps/web/src/ui/Properties.tsx:177 | `Topo no piso` | rótulo de campo | P0 | `fld_top_to_floor` | Top Attached to Floor |  |
| 28 | apps/web/src/ui/Properties.tsx:177 | `Desanexar` | botão | P0 | `btn_detach` | Detach |  |
| 29 | apps/web/src/ui/Properties.tsx:177 | `Anexar` | botão | P0 | `btn_attach` | Attach |  |
| 30 | apps/web/src/ui/Properties.tsx:179 | `Nível do topo` | rótulo de campo | P1 | `fld_top_level_ref` | Top Level |  |
| 31 | apps/web/src/ui/Properties.tsx:182 | `Até {l.name}` | opção de select | P0 | `opt_up_to` | Up to {name} | repetido para o select do topo |
| 32 | apps/web/src/ui/Properties.tsx:187 | `Linha de localização` | rótulo de campo | P0 | `fld_location_line` | Location Line |  |
| 33 | apps/web/src/ui/Properties.tsx:193 | `Flecha do arco` | rótulo de campo | P1 | `fld_arc_sag` | Arc Sag |  |
| 34 | apps/web/src/ui/Properties.tsx:194 | `Inverter lado externo` | rótulo de campo | P0 | `fld_flip_exterior` | Flip Exterior |  |
| 35 | apps/web/src/ui/Properties.tsx:195 | `Não unir no início` | rótulo de campo | P1 | `fld_no_join_start` | Do Not Join at Start |  |
| 36 | apps/web/src/ui/Properties.tsx:196 | `Não unir no fim` | rótulo de campo | P1 | `fld_no_join_end` | Do Not Join at End |  |
| 37 | apps/web/src/ui/Properties.tsx:198 | `Construção` | título de grupo | P1 | `pgrp_construction` | Construction |  |
| 38 | apps/web/src/ui/Properties.tsx:201 | `Espessura total` | rótulo de campo | P1 | `fld_total_thickness` | Total Thickness |  |
| 39 | apps/web/src/ui/Properties.tsx:210 | `Selecione uma única parede para ver as camadas.` | mensagem | P1 | `msg_select_one_wall_layers` | Select a single wall to see its layers. |  |
| 40 | apps/web/src/ui/Properties.tsx:213 | `Dimensões` | título de grupo | P0 | `pgrp_dimensions` | Dimensions |  |
| 41 | apps/web/src/ui/Properties.tsx:216 | `Comprimento` | rótulo de campo | P1 | `fld_length` | Length |  |
| 42 | apps/web/src/ui/Properties.tsx:217 | `Raio do eixo` | rótulo de campo | P1 | `fld_axis_radius` | Axis Radius |  |
| 43 | apps/web/src/ui/Properties.tsx:218 | `Área líquida` | rótulo de campo | P1 | `fld_net_area` | Net Area |  |
| 44 | apps/web/src/ui/Properties.tsx:219 | `Volume` | rótulo de campo | P1 | `fld_volume` | Volume |  |
| 45 | apps/web/src/ui/Properties.tsx:222 | `Comprimento total` | rótulo de campo | P1 | `fld_total_length` | Total Length |  |
| 46 | apps/web/src/ui/Properties.tsx:226 | `Junções` | título de grupo | P1 | `pgrp_joins` | Joins |  |
| 47 | apps/web/src/ui/Properties.tsx:230 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 48 | apps/web/src/ui/Properties.tsx:231 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 49 | apps/web/src/ui/Properties.tsx:232 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 50 | apps/web/src/ui/Properties.tsx:254 | `Tipo de abertura` | rótulo do seletor de tipo | P0 | `prop_type_opening` | Opening Type |  |
| 51 | apps/web/src/ui/Properties.tsx:255 | `Portas (${n})` | rótulo de categoria | P0 | `cat_doors` | Doors ({n}) |  |
| 52 | apps/web/src/ui/Properties.tsx:255 | `Janelas (${n})` | rótulo de categoria | P0 | `cat_windows` | Windows ({n}) |  |
| 53 | apps/web/src/ui/Properties.tsx:255 | `Aberturas (${n})` | rótulo de categoria | P0 | `cat_openings` | Openings ({n}) | seleção mista porta+janela |
| 54 | apps/web/src/ui/Properties.tsx:264 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 55 | apps/web/src/ui/Properties.tsx:267 | `Distância ao início` | rótulo de campo | P0 | `fld_distance_from_start` | Distance from Start |  |
| 56 | apps/web/src/ui/Properties.tsx:268 | `Peitoril` | rótulo de campo | P0 | `fld_sill` | Sill Height |  |
| 57 | apps/web/src/ui/Properties.tsx:269 | `Peitoril inválido: digite um número, como 0,90.` | mensagem de validação | P1 | `msg_invalid_sill` | Invalid sill: enter a number such as 0.90. | separador decimal fixo em vírgula |
| 58 | apps/web/src/ui/Properties.tsx:269 | `Peitoril inválido` | mensagem (prefixo) | P2 | `msg_invalid_sill_prefix` | Invalid sill | usado em startsWith: acopla a lógica ao texto PT |
| 59 | apps/web/src/ui/Properties.tsx:269 | `Pronto.` | mensagem de status | P1 | `msg_ready` | Ready. |  |
| 60 | apps/web/src/ui/Properties.tsx:272 | `Usar peitoril do tipo` | botão | P1 | `btn_use_type_sill` | Use Type Sill |  |
| 61 | apps/web/src/ui/Properties.tsx:274 | `Altura do vão` | rótulo de campo | P0 | `fld_opening_height` | Opening Height |  |
| 62 | apps/web/src/ui/Properties.tsx:275 | `Altura inválida: digite um número, como 1,20.` | mensagem de validação | P1 | `msg_invalid_height` | Invalid height: enter a number such as 1.20. | separador decimal fixo em vírgula |
| 63 | apps/web/src/ui/Properties.tsx:275 | `Altura inválida` | mensagem (prefixo) | P2 | `msg_invalid_height_prefix` | Invalid height | usado em startsWith |
| 64 | apps/web/src/ui/Properties.tsx:275 | `Pronto.` | mensagem de status | P1 | `msg_ready` | Ready. |  |
| 65 | apps/web/src/ui/Properties.tsx:278 | `Usar altura do tipo` | botão | P1 | `btn_use_type_height` | Use Type Height |  |
| 66 | apps/web/src/ui/Properties.tsx:282 | `Inverter dobradiça` | rótulo de campo | P0 | `fld_flip_hand` | Flip Hand |  |
| 67 | apps/web/src/ui/Properties.tsx:283 | `Inverter sentido` | rótulo de campo | P0 | `fld_flip_facing` | Flip Facing |  |
| 68 | apps/web/src/ui/Properties.tsx:285 | `Dimensões` | título de grupo | P0 | `pgrp_dimensions` | Dimensions |  |
| 69 | apps/web/src/ui/Properties.tsx:288 | `Largura` | rótulo de campo | P0 | `fld_width` | Width |  |
| 70 | apps/web/src/ui/Properties.tsx:289 | `Altura` | rótulo de campo | P0 | `fld_height` | Height |  |
| 71 | apps/web/src/ui/Properties.tsx:290 | `Anfitriã` | rótulo de campo | P1 | `fld_host` | Host |  |
| 72 | apps/web/src/ui/Properties.tsx:294 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 73 | apps/web/src/ui/Properties.tsx:295 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 74 | apps/web/src/ui/Properties.tsx:314 | `Intervalo de vista` | título de grupo | P0 | `pgrp_view_range` | View Range |  |
| 75 | apps/web/src/ui/Properties.tsx:315 | `Topo` | rótulo de campo | P0 | `fld_top` | Top |  |
| 76 | apps/web/src/ui/Properties.tsx:316 | `Plano de corte` | JSX texto | P0 | `fld_cut_plane,Cut Plane,rótulo de campo,` | undefined |  |
| 77 | apps/web/src/ui/Properties.tsx:317 | `Base` | rótulo de campo | P0 | `fld_bottom` | Base |  |
| 78 | apps/web/src/ui/Properties.tsx:318 | `Profundidade` | rótulo de campo | P0 | `fld_depth` | Depth |  |
| 79 | apps/web/src/ui/Properties.tsx:319 | `Direção da vista` | rótulo de campo | P1 | `fld_view_direction` | View Direction |  |
| 80 | apps/web/src/ui/Properties.tsx:321 | `Para baixo` | opção de select | P1 | `opt_view_down` | Down |  |
| 81 | apps/web/src/ui/Properties.tsx:322 | `Para cima (planta de forro)` | opção de select | P1 | `opt_view_up_ceiling` | Up (Ceiling Plan) |  |
| 82 | apps/web/src/ui/Properties.tsx:326 | `Restaurar intervalo padrão` | botão | P1 | `btn_restore_view_range` | Restore View Range |  |
| 83 | apps/web/src/ui/Properties.tsx:328 | `Nenhum elemento fora do intervalo de vista.` | mensagem | P1 | `msg_no_elements_outside_range` | No elements outside the view range. |  |
| 84 | apps/web/src/ui/Properties.tsx:334 | `Selecionar` | botão | P1 | `btn_select` | Select |  |
| 85 | apps/web/src/ui/Properties.tsx:350 | `Planta de cobertura` | texto de cabeçalho | P0 | `view_roof_plan` | Roof Plan |  |
| 86 | apps/web/src/ui/Properties.tsx:350 | `Planta` | texto de cabeçalho | P0 | `view_plan` | Plan |  |
| 87 | apps/web/src/ui/Properties.tsx:350 | `Elevação` | texto de cabeçalho | P0 | `view_elevation` | Elevation |  |
| 88 | apps/web/src/ui/Properties.tsx:350 | `Corte` | texto de cabeçalho | P0 | `view_section` | Section |  |
| 89 | apps/web/src/ui/Properties.tsx:350 | `Modelo 3D` | texto de cabeçalho | P0 | `view_3d` | 3D Model |  |
| 90 | apps/web/src/ui/Properties.tsx:351 | `Planta de área` | texto de cabeçalho | P0 | `view_area_plan` | Area Plan |  |
| 91 | apps/web/src/ui/Properties.tsx:351 | `Planta de piso` | texto de cabeçalho | P0 | `view_floor_plan` | Floor Plan |  |
| 92 | apps/web/src/ui/Properties.tsx:357 | `Vista` | título de grupo | P0 | `pgrp_view` | View |  |
| 93 | apps/web/src/ui/Properties.tsx:358 | `Nível` | rótulo de campo | P0 | `fld_level` | Level |  |
| 94 | apps/web/src/ui/Properties.tsx:363 | `Elevação` | rótulo de campo | P1 | `fld_elevation` | Elevation |  |
| 95 | apps/web/src/ui/Properties.tsx:364 | `Grade` | rótulo de campo | P1 | `fld_grid` | Grid |  |
| 96 | apps/web/src/ui/Properties.tsx:367 | `Automático` | opção de select | P1 | `opt_automatic` | Automatic |  |
| 97 | apps/web/src/ui/Properties.tsx:371 | `Subpavimento` | rótulo de campo | P1 | `fld_underlay` | Underlay |  |
| 98 | apps/web/src/ui/Properties.tsx:373 | `Projeção da cobertura` | rótulo de campo | P1 | `fld_roof_projection` | Roof Projection |  |
| 99 | apps/web/src/ui/Properties.tsx:374 | `Depurar junções` | rótulo de campo | P2 | `fld_debug_joins` | Debug Joins |  |
| 100 | apps/web/src/ui/Properties.tsx:375 | `Nível de detalhe` | rótulo de campo | P1 | `fld_detail_level` | Detail Level |  |
| 101 | apps/web/src/ui/Properties.tsx:377 | `Grosseiro` | opção de select | P1 | `opt_coarse` | Coarse |  |
| 102 | apps/web/src/ui/Properties.tsx:378 | `Médio` | opção de select | P1 | `opt_medium` | Medium |  |
| 103 | apps/web/src/ui/Properties.tsx:379 | `Fino` | opção de select | P1 | `opt_fine` | Fine |  |
| 104 | apps/web/src/ui/Properties.tsx:382 | `Editar níveis…` | botão | P1 | `btn_edit_levels` | Edit Levels… |  |
| 105 | apps/web/src/ui/Properties.tsx:390 | `Padrões do projeto` | título de grupo | P1 | `pgrp_project_defaults` | Project Standards |  |
| 106 | apps/web/src/ui/Properties.tsx:391 | `Tolerância de junção` | rótulo de campo | P2 | `fld_join_tolerance` | Join Tolerance |  |
| 107 | apps/web/src/ui/Properties.tsx:392 | `Altura de parede` | rótulo de campo | P1 | `fld_wall_height` | Wall Height |  |
| 108 | apps/web/src/ui/Properties.tsx:393 | `Unidades…` | botão | P1 | `btn_units` | Units… |  |
| 109 | apps/web/src/ui/Properties.tsx:393 | `Cotas…` | botão | P1 | `btn_dimensions` | Dimensions… |  |
| 110 | apps/web/src/ui/Properties.tsx:395 | `Selecione um elemento para ver e editar suas propriedades. Mudar o tipo altera todas as instâncias; mudar a instância altera só a selecionada.` | mensagem | P1 | `msg_select_element_hint` | Select an element to view and edit its properties. Changing the type changes every instance; changing the instance changes only the selection. | contém <em>tipo</em> e <em>instância</em> no JSX |
| 111 | apps/web/src/ui/Properties.tsx:433 | `Colocar ${tool}` | texto do cabeçalho | P0 | `msg_placing_tool` | Place {tool} | usa TOOL_LABEL (PT) em vez de toolLabel |
| 112 | apps/web/src/ui/Properties.tsx:433 | `Nível ${name}` | texto do cabeçalho | P0 | `msg_level_name` | Level {name} |  |
| 113 | apps/web/src/ui/Properties.tsx:435 | `Propriedades` | aria-label | P1 | `properties_title` | Properties | aria-label do aside |
| 114 | apps/web/src/ui/Properties.tsx:436 | `Propriedades` | JSX texto | P0 | `properties_title` | Properties | título e nome do painel |
| 115 | apps/web/src/ui/Properties.tsx:436 | `Fechar as propriedades` | aria-label | P1 | `aria_close_properties` | Close Properties |  |
| 116 | apps/web/src/ui/Properties.tsx:457 | `Seleção mista de elementos. Selecione apenas um tipo de elemento (parede, abertura, piso, laje, telhado, escada, rampa ou ambiente) para editar propriedades.` | mensagem | P1 | `msg_mixed_selection` | Mixed element selection. Select only one element type (wall, opening, floor, slab, roof, stair, ramp or room) to edit properties. |  |
| 117 | apps/web/src/ui/Properties.tsx:466 | `Ajuda de propriedades` | botão | P1 | `btn_properties_help` | Properties Help |  |
| 118 | apps/web/src/ui/Properties.tsx:468 | `Aplicar` | botão | P1 | `btn_apply` | Apply | reaproveitar como btn genérico |
| 119 | apps/web/src/ui/fields.tsx:8 | `toFixed(decimals).replace('.', ',')` | formatação de número | P2 | `fmt_decimal_separator` | — | força vírgula decimal mesmo em EN; usar Intl/locale do lang |
| 120 | apps/web/src/ui/fields.tsx:140 | `variados` | opção de select | P1 | `opt_varied` | Varies | placeholder de campo misto |
| 121 | apps/web/src/ui/fields.tsx:181 | `variados` | opção de select | P1 | `opt_varied` | Varies | placeholder de campo misto |
| 122 | apps/web/src/ui/fields.tsx:223 | `Parâmetro do tipo — edite em Editar tipo` | tooltip | P1 | `tip_type_param` | Type parameter — edit in Edit Type |  |
| 123 | apps/web/src/ui/fields.tsx:236 | `pgroup:${title}` | estado persistido | P2 | `group_state_key` | — | a chave do grupo aberto/fechado usa o título traduzido: trocar de idioma perde o estado |
| 124 | apps/web/src/ui/TypeSelector.tsx:99 | `variados` | opção de select | P0 | `opt_varied` | Varies | nome da família quando os tipos variam |
| 125 | apps/web/src/ui/TypeSelector.tsx:109 | `Pesquisar tipos` | aria-label | P1 | `aria_search_types` | Search types |  |
| 126 | apps/web/src/ui/TypeSelector.tsx:110 | `Pesquisar tipos…` | placeholder | P1 | `ph_search_types` | Search types… |  |
| 127 | apps/web/src/ui/TypeSelector.tsx:135 | `Nenhum tipo encontrado.` | mensagem | P1 | `msg_no_types_found` | No types found. |  |
| 128 | apps/web/src/ui/TypeSelector.tsx:142 | `✎ Editar tipo` | botão | P0 | `edit_type_btn` | Edit Type | chave já existe no dicionário |
| 129 | apps/web/src/ui/typeSelectorModel.ts:20 | `★ Favoritos` | título de grupo | P1 | `grp_favorites` | ★ Favorites |  |
| 130 | apps/web/src/ui/TypeRow.tsx:71 | `Não há outro tipo compatível.` | mensagem | P1 | `msg_no_compatible_type` | There is no other compatible type. |  |
| 131 | apps/web/src/ui/TypeRow.tsx:71 | `Este tipo não tem instâncias.` | mensagem | P1 | `msg_type_has_no_instances` | This type has no instances. | repetido em hint na linha 142 |
| 132 | apps/web/src/ui/TypeRow.tsx:90 | `Não foi possível substituir: ${erro}` | mensagem de status | P1 | `msg_replace_failed` | Could not replace: {error} |  |
| 133 | apps/web/src/ui/TypeRow.tsx:96 | `Não foi possível excluir «${nome}»: ${erro}` | mensagem de status | P1 | `msg_delete_type_failed` | Could not delete “{name}”: {error} |  |
| 134 | apps/web/src/ui/TypeRow.tsx:117 | `Tipo «${nome}» excluído.` | mensagem de status | P1 | `msg_type_deleted` | Type “{name}” deleted. |  |
| 135 | apps/web/src/ui/TypeRow.tsx:121 | `Tipo «${nome}» duplicado. Duplo clique na cópia para editar.` | mensagem de status | P1 | `msg_type_duplicated` | Type “{name}” duplicated. Double-click the copy to edit. |  |
| 136 | apps/web/src/ui/TypeRow.tsx:121 | `Não foi possível duplicar este tipo.` | mensagem de status | P1 | `msg_duplicate_failed` | Could not duplicate this type. |  |
| 137 | apps/web/src/ui/TypeRow.tsx:130 | `Tipo renomeado para «${nome}».` | mensagem de status | P1 | `msg_type_renamed` | Type renamed to “{name}”. |  |
| 138 | apps/web/src/ui/TypeRow.tsx:139 | `Propriedades de tipo…` | item de menu | P1 | `menu_type_properties` | Type Properties… |  |
| 139 | apps/web/src/ui/TypeRow.tsx:140 | `Usar ao desenhar` | item de menu | P1 | `menu_use_for_drawing` | Use for Drawing |  |
| 140 | apps/web/src/ui/TypeRow.tsx:141 | `Selecionar todas as instâncias (nível atual)` | item de menu | P1 | `menu_select_all_instances` | Select All Instances (Current Level) |  |
| 141 | apps/web/src/ui/TypeRow.tsx:142 | `Onde é usado` | item de menu | P1 | `menu_where_used` | Where Used |  |
| 142 | apps/web/src/ui/TypeRow.tsx:142 | `Vai ao nível com mais instâncias, enquadra e seleciona.` | tooltip | P1 | `menu_where_used_hint` | Goes to the level with the most instances, zooms to fit and selects them. |  |
| 143 | apps/web/src/ui/TypeRow.tsx:143 | `Substituir por outro tipo…` | item de menu | P1 | `menu_replace_type` | Replace With Another Type… |  |
| 144 | apps/web/src/ui/TypeRow.tsx:144 | `Duplicar` | item de menu | P1 | `menu_duplicate` | Duplicate |  |
| 145 | apps/web/src/ui/TypeRow.tsx:144 | `Renomear` | item de menu | P1 | `menu_rename` | Rename |  |
| 146 | apps/web/src/ui/TypeRow.tsx:145 | `Excluir` | item de menu | P1 | `btn_delete` | Delete |  |
| 147 | apps/web/src/ui/TypeRow.tsx:145 | `Não é possível excluir: ${motivo}` | tooltip | P1 | `menu_delete_blocked` | Cannot delete: {reason} |  |
| 148 | apps/web/src/ui/TypeRow.tsx:149 | `Novo nome do tipo` | aria-label | P1 | `aria_new_type_name` | New type name |  |
| 149 | apps/web/src/ui/TypeRow.tsx:157 | `Substituir por…` | rótulo de campo | P1 | `fld_replace_with` | Replace with… |  |
| 150 | apps/web/src/ui/TypeRow.tsx:158 | `Novo tipo` | aria-label | P1 | `aria_new_type` | New type |  |
| 151 | apps/web/src/ui/TypeRow.tsx:163 | `Aplicar` | botão | P1 | `btn_apply` | Apply | reaproveitar como btn genérico |
| 152 | apps/web/src/ui/TypeRow.tsx:164 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel | hoje só stt_cancel existe |
| 153 | apps/web/src/ui/TypeRow.tsx:169 | `Excluir o tipo ${nome}` | aria-label | P2 | `aria_delete_type` | Delete type {name} |  |
| 154 | apps/web/src/ui/TypeRow.tsx:170 | `Excluir o tipo «${nome}», que ficou sem uso?` | mensagem | P1 | `msg_delete_unused_type` | Delete type “{name}”, which is no longer used? |  |
| 155 | apps/web/src/ui/TypeRow.tsx:172 | `Excluir tipo` | botão | P1 | `btn_delete_type` | Delete Type |  |
| 156 | apps/web/src/ui/TypeRow.tsx:173 | `Manter` | botão | P1 | `btn_keep` | Keep |  |
| 157 | apps/web/src/ui/TypeRow.tsx:186 | `${nome} — ${n} ${uso} no projeto. Clique usa ao desenhar; duplo clique edita; botão direito abre o menu.` | tooltip | P1 | `tip_type_row` | {name} — {n} {use} in the project. Click to use for drawing; double-click to edit; right-click for the menu. | pluralização "uso/usos" embutida |
| 158 | apps/web/src/ui/TypePreview.tsx:142 | `Prévia da porta` | aria-label | P1 | `aria_door_preview` | Door preview |  |
| 159 | apps/web/src/ui/TypePreview.tsx:157 | `vão livre` | texto em SVG | P1 | `msg_open_void` | open void | desenhado no SVG da prévia |
| 160 | apps/web/src/ui/TypePreview.tsx:202 | `Prévia da janela` | aria-label | P1 | `aria_window_preview` | Window preview |  |
| 161 | apps/web/src/ui/TypePreview.tsx:218 | `vão sem esquadria` | texto em SVG | P1 | `msg_void_no_frame` | void without frame |  |
| 162 | apps/web/src/ui/typeFamilies.ts:5 | `Parede básica` | nome de família | P0 | `fam_wall_basic` | Basic Wall | aparece no seletor de tipo |
| 163 | apps/web/src/ui/typeFamilies.ts:6 | `Piso` | nome de família | P0 | `fam_floor` | Floor |  |
| 164 | apps/web/src/ui/typeFamilies.ts:7 | `Laje` | nome de família | P0 | `fam_slab` | Slab |  |
| 165 | apps/web/src/ui/typeFamilies.ts:8 | `Forro` | nome de família | P0 | `fam_ceiling` | Ceiling |  |
| 166 | apps/web/src/ui/typeFamilies.ts:9 | `Telhado` | nome de família | P0 | `fam_roof` | Roof |  |
| 167 | apps/web/src/ui/typeFamilies.ts:10 | `Escada` | nome de família | P0 | `fam_stair` | Stair |  |
| 168 | apps/web/src/ui/typeFamilies.ts:15 | `Outros` | nome de família | P1 | `fam_other` | Other | fallback de família de abertura |
| 169 | apps/web/src/ui/LevelField.tsx:13 | `Nível` | rótulo de campo | P0 | `fld_level` | Level | valor padrão do rótulo |
| 170 | apps/web/src/ui/LevelField.tsx:40 | `Sem nível` | opção de select | P0 | `opt_no_level` | No Level |  |
| 171 | apps/web/src/ui/LevelField.tsx:43 | `Inexistente (${id})` | opção de select | P1 | `opt_missing_level` | Missing ({id}) |  |
| 172 | apps/web/src/ui/LevelField.tsx:49 | `Ao trocar:` | rótulo de campo | P0 | `fld_when_changing` | When Changing |  |
| 173 | apps/web/src/ui/LevelField.tsx:50 | `Ao trocar de nível` | aria-label | P2 | `aria_when_changing_level` | When changing level |  |
| 174 | apps/web/src/ui/LevelField.tsx:51 | `Manter a cota` | opção de select | P0 | `opt_keep_elevation` | Keep Elevation | mesma chave LEVEL_KEEP_LABEL |
| 175 | apps/web/src/ui/LevelField.tsx:52 | `Levar o deslocamento` | opção de select | P0 | `opt_keep_offset` | Keep Offset |  |
| 176 | apps/web/src/ui/NivelCotaEditor.tsx:83 | `Number(d.value.replace(',', '.'))` | formatação de número | P2 | `parse_decimal_comma` | — | só aceita vírgula como separador na edição da cota |
| 177 | apps/web/src/ui/NivelCotaEditor.tsx:109 | `toFixed(2).replace('.', ',')` | formatação de número | P2 | `fmt_decimal_comma` | — | valor da cota sempre com vírgula |
| 178 | apps/web/src/ui/NivelCotaEditor.tsx:179 | `m` | unidade | P2 | `unit_meter_short` | m | sufixo fixo "m" mesmo com unidades do projeto em pés |
| 179 | apps/web/src/ui/ProfileRow.tsx:8 | `Perfil superior só em parede reta` | mensagem/tooltip | P1 | `msg_profile_straight_only` | Top profile is only available for straight walls |  |
| 180 | apps/web/src/ui/ProfileRow.tsx:21 | `selecione uma parede` | mensagem | P1 | `msg_select_a_wall` | select a wall |  |
| 181 | apps/web/src/ui/ProfileRow.tsx:23 | `Poligonal · máx ${valor}` | mensagem | P1 | `msg_profile_polygonal_max` | Polygonal · max {value} |  |
| 182 | apps/web/src/ui/ProfileRow.tsx:24 | `Reto` | valor | P1 | `opt_profile_straight` | Straight |  |
| 183 | apps/web/src/ui/ProfileRow.tsx:27 | `Perfil superior` | rótulo de campo | P1 | `fld_top_profile` | Top Profile |  |
| 184 | apps/web/src/ui/ProfileRow.tsx:30 | `selecione uma parede` | tooltip | P1 | `msg_select_a_wall` | select a wall |  |
| 185 | apps/web/src/ui/ProfileRow.tsx:31 | `Editar…` | botão | P1 | `btn_edit` | Edit… |  |
| 186 | apps/web/src/ui/RoofProfileRow.tsx:16 | `${n} trechos · altura máx. ${valor}` | mensagem | P1 | `msg_profile_summary` | {n} segments · max height {value} |  |
| 187 | apps/web/src/ui/RoofProfileRow.tsx:16 | `sem perfil` | mensagem | P1 | `msg_no_profile` | no profile |  |
| 188 | apps/web/src/ui/RoofProfileRow.tsx:19 | `Perfil` | rótulo de campo | P1 | `fld_profile` | Profile |  |
| 189 | apps/web/src/ui/RoofProfileRow.tsx:23 | `Perfil…` | botão | P1 | `btn_profile` | Profile… |  |
| 190 | apps/web/src/ui/RoomProperties.tsx:17 | `Nome` | opção de etiqueta | P1 | `tag_name` | Name | campos da etiqueta de ambiente |
| 191 | apps/web/src/ui/RoomProperties.tsx:18 | `Número` | opção de etiqueta | P1 | `tag_number` | Number | campos da etiqueta de ambiente |
| 192 | apps/web/src/ui/RoomProperties.tsx:19 | `Área` | opção de etiqueta | P1 | `tag_area` | Area | campos da etiqueta de ambiente |
| 193 | apps/web/src/ui/RoomProperties.tsx:20 | `Categoria` | opção de etiqueta | P1 | `tag_category` | Category | campos da etiqueta de ambiente |
| 194 | apps/web/src/ui/RoomProperties.tsx:21 | `Nível` | opção de etiqueta | P1 | `tag_level` | Level | campos da etiqueta de ambiente |
| 195 | apps/web/src/ui/RoomProperties.tsx:22 | `Perímetro` | opção de etiqueta | P1 | `tag_perimeter` | Perimeter | campos da etiqueta de ambiente |
| 196 | apps/web/src/ui/RoomProperties.tsx:23 | `Volume` | opção de etiqueta | P1 | `tag_volume` | Volume | campos da etiqueta de ambiente |
| 197 | apps/web/src/ui/RoomProperties.tsx:24 | `Personalizado` | opção de etiqueta | P1 | `tag_custom` | Custom | campos da etiqueta de ambiente |
| 198 | apps/web/src/ui/RoomProperties.tsx:49 | `Sem circuito fechado: o ponto interior não está dentro de paredes fechadas.` | mensagem | P1 | `msg_room_not_closed_point` | Not closed: the interior point is not inside closed walls. | vem de roomWarning |
| 199 | apps/web/src/ui/RoomProperties.tsx:50 | `Circuito aberto: há um vão entre as paredes em volta do ambiente.` | mensagem | P1 | `msg_room_open_loop` | Open loop: there is a gap between the walls around the room. |  |
| 200 | apps/web/src/ui/RoomProperties.tsx:51 | `Mesmo circuito do ambiente "${nome}".` | mensagem | P1 | `msg_room_duplicate` | Same loop as room “{name}”. |  |
| 201 | apps/web/src/ui/RoomProperties.tsx:66 | `O ambiente não tem circuito fechado nesta planta.` | mensagem de status | P1 | `msg_room_not_closed_plan` | The room has no closed loop in this plan. |  |
| 202 | apps/web/src/ui/RoomProperties.tsx:68 | `Não foi possível alterar a etiqueta.` | mensagem de status | P1 | `msg_tag_update_failed` | Could not change the tag. |  |
| 203 | apps/web/src/ui/RoomProperties.tsx:78 | `Etiqueta nesta planta de área` | título de grupo | P1 | `pgrp_room_tag_plan` | Tag in This Area Plan |  |
| 204 | apps/web/src/ui/RoomProperties.tsx:81 | `Campos` | rótulo de campo | P1 | `fld_fields` | Fields |  |
| 205 | apps/web/src/ui/RoomProperties.tsx:91 | `Texto` | rótulo de campo | P1 | `fld_text` | Text |  |
| 206 | apps/web/src/ui/RoomProperties.tsx:92 | `Texto da etiqueta` | placeholder | P1 | `ph_tag_text` | Tag text |  |
| 207 | apps/web/src/ui/RoomProperties.tsx:95 | `Orientação` | rótulo de campo | P1 | `fld_orientation` | Orientation |  |
| 208 | apps/web/src/ui/RoomProperties.tsx:97 | `Horizontal` | opção de select | P1 | `opt_horizontal` | Horizontal |  |
| 209 | apps/web/src/ui/RoomProperties.tsx:98 | `Vertical` | opção de select | P1 | `opt_vertical` | Vertical |  |
| 210 | apps/web/src/ui/RoomProperties.tsx:101 | `Chamada` | rótulo de campo | P1 | `fld_leader` | Leader |  |
| 211 | apps/web/src/ui/RoomProperties.tsx:103 | `Nenhuma` | opção de select | P1 | `opt_none_fem` | None | hoje "Nenhuma" concorda com "chamada" |
| 212 | apps/web/src/ui/RoomProperties.tsx:104 | `Reta` | opção de select | P1 | `opt_straight` | Straight |  |
| 213 | apps/web/src/ui/RoomProperties.tsx:105 | `Com cotovelo` | opção de select | P1 | `opt_kinked` | Kinked |  |
| 214 | apps/web/src/ui/RoomProperties.tsx:106 | `Duas linhas cruzadas` | opção de select | P1 | `opt_crossed` | Two Crossing Lines |  |
| 215 | apps/web/src/ui/RoomProperties.tsx:109 | `Visível nesta planta` | rótulo de campo | P1 | `fld_visible_in_plan` | Visible in This Plan |  |
| 216 | apps/web/src/ui/RoomProperties.tsx:116 | `A etiqueta desta planta já está criada.` | mensagem de status | P1 | `msg_tag_already_created` | The tag for this plan already exists. |  |
| 217 | apps/web/src/ui/RoomProperties.tsx:116 | `Etiqueta criada nesta planta.` | mensagem de status | P1 | `msg_tag_created` | Tag created in this plan. |  |
| 218 | apps/web/src/ui/RoomProperties.tsx:119 | `Criar/atualizar etiqueta` | botão | P1 | `btn_create_update_tag` | Create/Update Tag |  |
| 219 | apps/web/src/ui/RoomProperties.tsx:121 | `Etiqueta voltou ao padrão da planta.` | mensagem de status | P1 | `msg_tag_reset` | Tag reset to the plan default. |  |
| 220 | apps/web/src/ui/RoomProperties.tsx:121 | `Esta planta já usa o padrão.` | mensagem de status | P1 | `msg_tag_already_default` | This plan already uses the default. |  |
| 221 | apps/web/src/ui/RoomProperties.tsx:122 | `Voltar ao padrão` | botão | P1 | `btn_reset_to_default` | Reset to Default |  |
| 222 | apps/web/src/ui/RoomProperties.tsx:125 | `Estes ajustes valem só nesta planta de área. A posição do rótulo continua compartilhada em “Rótulo (todas as vistas)”.` | mensagem | P1 | `msg_tag_plan_only` | These settings apply only to this area plan. The label position remains shared in “Label (All Views)”. |  |
| 223 | apps/web/src/ui/RoomProperties.tsx:128 | `Sem circuito fechado: feche as paredes em volta do ambiente para a etiqueta aparecer nesta planta.` | mensagem | P1 | `msg_tag_needs_closed_loop` | No closed loop: close the walls around the room for the tag to appear in this plan. |  |
| 224 | apps/web/src/ui/RoomProperties.tsx:164 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 225 | apps/web/src/ui/RoomProperties.tsx:165 | `Nome` | rótulo de campo | P1 | `fld_name` | Name |  |
| 226 | apps/web/src/ui/RoomProperties.tsx:166 | `Número` | rótulo de campo | P1 | `fld_number` | Number |  |
| 227 | apps/web/src/ui/RoomProperties.tsx:167 | `Categoria` | rótulo de campo | P1 | `fld_category` | Category |  |
| 228 | apps/web/src/ui/RoomProperties.tsx:169 | `Sem categoria` | opção de select | P1 | `opt_no_category` | No category |  |
| 229 | apps/web/src/ui/RoomProperties.tsx:174 | `Gerenciar categorias…` | botão | P1 | `btn_manage_categories` | Manage Categories… |  |
| 230 | apps/web/src/ui/RoomProperties.tsx:177 | `Ponto interior` | rótulo de campo | P1 | `fld_interior_point` | Interior Point |  |
| 231 | apps/web/src/ui/RoomProperties.tsx:178 | `Ponto usado para achar o circuito de paredes (somente leitura)` | tooltip | P2 | `tip_interior_point` | Point used to find the wall loop (read-only) |  |
| 232 | apps/web/src/ui/RoomProperties.tsx:184 | `Dimensões` | título de grupo | P1 | `pgrp_dimensions` | Dimensions |  |
| 233 | apps/web/src/ui/RoomProperties.tsx:185 | `Desloc. da base` | rótulo de campo | P1 | `fld_base_offset` | Base Offset |  |
| 234 | apps/web/src/ui/RoomProperties.tsx:188 | `Pé-direito` | rótulo de campo | P1 | `fld_ceiling_height` | Ceiling Height |  |
| 235 | apps/web/src/ui/RoomProperties.tsx:191 | `Área líquida` | rótulo de campo | P1 | `fld_net_area` | Net Area |  |
| 236 | apps/web/src/ui/RoomProperties.tsx:191 | `Área total` | rótulo de campo | P1 | `fld_area_total` | Total Area |  |
| 237 | apps/web/src/ui/RoomProperties.tsx:192 | `Perímetro` | rótulo de campo | P1 | `fld_perimeter` | Perimeter |  |
| 238 | apps/web/src/ui/RoomProperties.tsx:192 | `Perímetro total` | rótulo de campo | P1 | `fld_perimeter_total` | Total Perimeter |  |
| 239 | apps/web/src/ui/RoomProperties.tsx:193 | `Volume` | rótulo de campo | P1 | `fld_volume` | Volume |  |
| 240 | apps/web/src/ui/RoomProperties.tsx:193 | `Volume total` | rótulo de campo | P1 | `fld_volume_total` | Total Volume |  |
| 241 | apps/web/src/ui/RoomProperties.tsx:195 | `Acabamentos` | título de grupo | P1 | `pgrp_finishes` | Finishes |  |
| 242 | apps/web/src/ui/RoomProperties.tsx:196 | `Piso` | rótulo de campo | P1 | `fld_floor_finish` | Floor Finish |  |
| 243 | apps/web/src/ui/RoomProperties.tsx:197 | `Parede` | rótulo de campo | P1 | `fld_wall_finish` | Wall Finish |  |
| 244 | apps/web/src/ui/RoomProperties.tsx:198 | `Forro` | rótulo de campo | P1 | `fld_ceiling_finish` | Ceiling Finish |  |
| 245 | apps/web/src/ui/RoomProperties.tsx:201 | `Rótulo (todas as vistas)` | título de grupo | P1 | `pgrp_room_label_all_views` | Label (All Views) |  |
| 246 | apps/web/src/ui/RoomProperties.tsx:202 | `Posição X` | rótulo de campo | P1 | `fld_position_x` | X Position |  |
| 247 | apps/web/src/ui/RoomProperties.tsx:203 | `Mover rótulo` | rótulo de desfazer | P1 | `undo_move_label` | Move Label |  |
| 248 | apps/web/src/ui/RoomProperties.tsx:205 | `Posição Y` | rótulo de campo | P1 | `fld_position_y` | Y Position |  |
| 249 | apps/web/src/ui/RoomProperties.tsx:206 | `Mover rótulo` | rótulo de desfazer | P1 | `undo_move_label` | Move Label |  |
| 250 | apps/web/src/ui/RoomProperties.tsx:208 | `Rotação` | rótulo de campo | P1 | `fld_rotation` | Rotation |  |
| 251 | apps/web/src/ui/RoomProperties.tsx:209 | `Girar rótulo` | rótulo de desfazer | P1 | `undo_rotate_label` | Rotate Label |  |
| 252 | apps/web/src/ui/RoomProperties.tsx:211 | `Chamada` | rótulo de campo | P1 | `fld_leader` | Leader |  |
| 253 | apps/web/src/ui/RoomProperties.tsx:212 | `Alterar chamada do rótulo` | rótulo de desfazer | P1 | `undo_change_label_leader` | Change Label Leader |  |
| 254 | apps/web/src/ui/RoomProperties.tsx:213 | `Automática (liga ao sair)` | opção de select | P1 | `opt_leader_auto` | Automatic (attaches on exit) |  |
| 255 | apps/web/src/ui/RoomProperties.tsx:214 | `Sem chamada` | opção de select | P1 | `opt_leader_none` | No Leader |  |
| 256 | apps/web/src/ui/RoomProperties.tsx:215 | `Reta` | opção de select | P1 | `opt_straight` | Straight |  |
| 257 | apps/web/src/ui/RoomProperties.tsx:216 | `Com cotovelo` | opção de select | P1 | `opt_kinked` | Kinked |  |
| 258 | apps/web/src/ui/RoomProperties.tsx:217 | `Duas linhas cruzadas` | opção de select | P1 | `opt_crossed` | Two Crossing Lines |  |
| 259 | apps/web/src/ui/RoomProperties.tsx:221 | `Recentralizar rótulo` | botão | P1 | `btn_recenter_label` | Recenter Label |  |
| 260 | apps/web/src/ui/RoomProperties.tsx:221 | `Recentralizar rótulo` | rótulo de desfazer | P1 | `undo_recenter_label` | Recenter Label |  |
| 261 | apps/web/src/ui/RoomProperties.tsx:223 | `A posição vale na planta de piso, na planta de área e em qualquer vista onde o rótulo aparecer.` | mensagem | P1 | `msg_label_position_scope` | The position applies to the floor plan, the area plan and any view where the label appears. |  |
| 262 | apps/web/src/ui/RoomProperties.tsx:229 | `Vista` | título de grupo | P1 | `pgrp_view` | View |  |
| 263 | apps/web/src/ui/RoomProperties.tsx:230 | `Cor` | rótulo de campo | P1 | `fld_color` | Color |  |
| 264 | apps/web/src/ui/RoomProperties.tsx:232 | `Cor do ambiente` | aria-label | P1 | `aria_room_color` | Room color |  |
| 265 | apps/web/src/ui/RoomProperties.tsx:233 | `Padrão` | botão | P1 | `opt_default` | Default |  |
| 266 | apps/web/src/ui/RoomProperties.tsx:233 | `Volta à cor padrão do tema` | tooltip | P1 | `tip_reset_theme_color` | Returns to the theme default color |  |
| 267 | apps/web/src/ui/RoomProperties.tsx:236 | `A cor do ambiente aparece só na planta de área; a planta de piso usa o preenchimento padrão do tema.` | mensagem | P1 | `msg_room_color_scope` | The room color appears only in the area plan; the floor plan uses the theme default fill. |  |
| 268 | apps/web/src/ui/SlabProperties.tsx:28 | `Alterar inclinação` | rótulo de desfazer | P1 | `undo_change_slope` | Change Slope |  |
| 269 | apps/web/src/ui/SlabProperties.tsx:78 | `Tipo de laje` | rótulo do seletor de tipo | P0 | `prop_type_slab` | Slab Type |  |
| 270 | apps/web/src/ui/SlabProperties.tsx:79 | `Lajes (${n})` | rótulo de categoria | P0 | `cat_slabs` | Slabs ({n}) |  |
| 271 | apps/web/src/ui/SlabProperties.tsx:86 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 272 | apps/web/src/ui/SlabProperties.tsx:88 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 273 | apps/web/src/ui/SlabProperties.tsx:92 | `Inclinação` | título de grupo | P0 | `pgrp_slope` | Slope |  |
| 274 | apps/web/src/ui/SlabProperties.tsx:93 | `Caimento` | rótulo de campo | P0 | `fld_slope_percent` | Slope | campo em % |
| 275 | apps/web/src/ui/SlabProperties.tsx:98 | `Variação do topo` | rótulo de campo | P1 | `fld_top_variation` | Top Variation |  |
| 276 | apps/web/src/ui/SlabProperties.tsx:100 | `Remover inclinação` | botão | P1 | `btn_remove_slope` | Remove Slope |  |
| 277 | apps/web/src/ui/SlabProperties.tsx:104 | `Selecione uma laje para ver a variação do topo.` | mensagem | P1 | `msg_select_one_slab_variation` | Select one slab to see the top variation. |  |
| 278 | apps/web/src/ui/SlabProperties.tsx:104 | `Sem inclinação. Use Inclinação na faixa Arquitetura e clique na planta.` | mensagem | P1 | `msg_no_slope_hint` | No slope. Use Slope on the Architecture tab and click in the plan. |  |
| 279 | apps/web/src/ui/SlabProperties.tsx:108 | `Construção` | título de grupo | P1 | `pgrp_construction` | Construction |  |
| 280 | apps/web/src/ui/SlabProperties.tsx:111 | `Espessura total` | rótulo de campo | P1 | `fld_total_thickness` | Total Thickness |  |
| 281 | apps/web/src/ui/SlabProperties.tsx:120 | `Selecione lajes do mesmo tipo para ver as camadas.` | mensagem | P1 | `msg_select_same_type_layers` | Select elements of the same type to see the layers. |  |
| 282 | apps/web/src/ui/SlabProperties.tsx:123 | `Dimensões` | título de grupo | P1 | `pgrp_dimensions` | Dimensions |  |
| 283 | apps/web/src/ui/SlabProperties.tsx:126 | `Área em planta` | rótulo de campo | P1 | `fld_plan_area` | Plan Area |  |
| 284 | apps/web/src/ui/SlabProperties.tsx:127 | `Área real` | rótulo de campo | P1 | `fld_real_area` | Actual Area |  |
| 285 | apps/web/src/ui/SlabProperties.tsx:128 | `Perímetro` | rótulo de campo | P1 | `fld_perimeter` | Perimeter |  |
| 286 | apps/web/src/ui/SlabProperties.tsx:129 | `Furos` | rótulo de campo | P1 | `fld_holes` | Holes |  |
| 287 | apps/web/src/ui/SlabProperties.tsx:133 | `Área em planta` | rótulo de campo | P1 | `fld_plan_area` | Plan Area |  |
| 288 | apps/web/src/ui/SlabProperties.tsx:134 | `Área real` | rótulo de campo | P1 | `fld_real_area` | Actual Area |  |
| 289 | apps/web/src/ui/SlabProperties.tsx:135 | `Perímetro total` | rótulo de campo | P1 | `fld_perimeter_total` | Total Perimeter |  |
| 290 | apps/web/src/ui/SlabProperties.tsx:139 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 291 | apps/web/src/ui/SlabProperties.tsx:140 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 292 | apps/web/src/ui/SlabProperties.tsx:141 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 293 | apps/web/src/ui/FloorProperties.tsx:55 | `Tipo de piso` | rótulo do seletor de tipo | P0 | `prop_type_floor` | Floor Type |  |
| 294 | apps/web/src/ui/FloorProperties.tsx:56 | `Pisos (${n})` | rótulo de categoria | P0 | `cat_floors` | Floors ({n}) |  |
| 295 | apps/web/src/ui/FloorProperties.tsx:63 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 296 | apps/web/src/ui/FloorProperties.tsx:65 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 297 | apps/web/src/ui/FloorProperties.tsx:70 | `Construção` | título de grupo | P1 | `pgrp_construction` | Construction |  |
| 298 | apps/web/src/ui/FloorProperties.tsx:73 | `Espessura total` | rótulo de campo | P1 | `fld_total_thickness` | Total Thickness |  |
| 299 | apps/web/src/ui/FloorProperties.tsx:82 | `Selecione pisos do mesmo tipo para ver as camadas.` | mensagem | P1 | `msg_select_same_type_layers` | Select elements of the same type to see the layers. |  |
| 300 | apps/web/src/ui/FloorProperties.tsx:85 | `Dimensões` | título de grupo | P1 | `pgrp_dimensions` | Dimensions |  |
| 301 | apps/web/src/ui/FloorProperties.tsx:88 | `Área líquida` | rótulo de campo | P1 | `fld_net_area` | Net Area |  |
| 302 | apps/web/src/ui/FloorProperties.tsx:89 | `Perímetro` | rótulo de campo | P1 | `fld_perimeter` | Perimeter |  |
| 303 | apps/web/src/ui/FloorProperties.tsx:90 | `Furos` | rótulo de campo | P1 | `fld_holes` | Holes |  |
| 304 | apps/web/src/ui/FloorProperties.tsx:94 | `Área líquida total` | rótulo de campo | P1 | `fld_net_area_total` | Total Net Area |  |
| 305 | apps/web/src/ui/FloorProperties.tsx:95 | `Perímetro total` | rótulo de campo | P1 | `fld_perimeter_total` | Total Perimeter |  |
| 306 | apps/web/src/ui/FloorProperties.tsx:99 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 307 | apps/web/src/ui/FloorProperties.tsx:100 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 308 | apps/web/src/ui/FloorProperties.tsx:101 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 309 | apps/web/src/ui/CeilingProperties.tsx:52 | `Tipo de forro` | rótulo do seletor de tipo | P0 | `prop_type_ceiling` | Ceiling Type |  |
| 310 | apps/web/src/ui/CeilingProperties.tsx:53 | `Forros (${n})` | rótulo de categoria | P0 | `cat_ceilings` | Ceilings ({n}) |  |
| 311 | apps/web/src/ui/CeilingProperties.tsx:60 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 312 | apps/web/src/ui/CeilingProperties.tsx:62 | `Cota do topo` | rótulo de campo | P0 | `fld_top_elevation` | Top Elevation |  |
| 313 | apps/web/src/ui/CeilingProperties.tsx:65 | `Face inferior` | rótulo de campo | P0 | `fld_bottom_face` | Bottom Face |  |
| 314 | apps/web/src/ui/CeilingProperties.tsx:68 | `Construção` | título de grupo | P1 | `pgrp_construction` | Construction |  |
| 315 | apps/web/src/ui/CeilingProperties.tsx:71 | `Espessura total` | rótulo de campo | P1 | `fld_total_thickness` | Total Thickness |  |
| 316 | apps/web/src/ui/CeilingProperties.tsx:80 | `Selecione forros do mesmo tipo para ver as camadas.` | mensagem | P1 | `msg_select_same_type_layers` | Select elements of the same type to see the layers. |  |
| 317 | apps/web/src/ui/CeilingProperties.tsx:83 | `Dimensões` | título de grupo | P1 | `pgrp_dimensions` | Dimensions |  |
| 318 | apps/web/src/ui/CeilingProperties.tsx:86 | `Área` | rótulo de campo | P1 | `fld_area` | Area |  |
| 319 | apps/web/src/ui/CeilingProperties.tsx:87 | `Perímetro` | rótulo de campo | P1 | `fld_perimeter` | Perimeter |  |
| 320 | apps/web/src/ui/CeilingProperties.tsx:88 | `Furos` | rótulo de campo | P1 | `fld_holes` | Holes |  |
| 321 | apps/web/src/ui/CeilingProperties.tsx:89 | `Ambiente` | rótulo de campo | P1 | `tool_room` | Room |  |
| 322 | apps/web/src/ui/CeilingProperties.tsx:93 | `Área total` | rótulo de campo | P1 | `fld_area_total` | Total Area |  |
| 323 | apps/web/src/ui/CeilingProperties.tsx:94 | `Perímetro total` | rótulo de campo | P1 | `fld_perimeter_total` | Total Perimeter |  |
| 324 | apps/web/src/ui/CeilingProperties.tsx:98 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 325 | apps/web/src/ui/CeilingProperties.tsx:99 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 326 | apps/web/src/ui/CeilingProperties.tsx:100 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 327 | apps/web/src/ui/RoofProperties.tsx:94 | `Forma do telhado` | rótulo de desfazer | P2 | `undo_change_roof_shape` | Change Roof Shape |  |
| 328 | apps/web/src/ui/RoofProperties.tsx:109 | `Acabamento do beiral` | rótulo de desfazer | P2 | `undo_change_eave` | Change Eave |  |
| 329 | apps/web/src/ui/RoofProperties.tsx:118 | `Tipo de telhado` | rótulo do seletor de tipo | P0 | `prop_type_roof` | Roof Type |  |
| 330 | apps/web/src/ui/RoofProperties.tsx:119 | `Telhados (${n})` | rótulo de categoria | P0 | `cat_roofs` | Roofs ({n}) |  |
| 331 | apps/web/src/ui/RoofProperties.tsx:126 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 332 | apps/web/src/ui/RoofProperties.tsx:128 | `Cota do beiral` | rótulo de campo | P0 | `fld_eave_elevation` | Eave Elevation |  |
| 333 | apps/web/src/ui/RoofProperties.tsx:132 | `Forma` | título de grupo | P0 | `fld_form` | Form |  |
| 334 | apps/web/src/ui/RoofProperties.tsx:133 | `Forma` | rótulo de campo | P0 | `fld_form` | Form |  |
| 335 | apps/web/src/ui/RoofProperties.tsx:135 | `Forma do telhado` | aria-label | P1 | `aria_roof_shape` | Roof shape |  |
| 336 | apps/web/src/ui/RoofProperties.tsx:136 | `variadas` | opção de select | P0 | `opt_varied_fem` | Varies | concorda com "forma" |
| 337 | apps/web/src/ui/RoofProperties.tsx:142 | `Inclinação` | rótulo de campo | P0 | `fld_inclination` | Slope | campo em % |
| 338 | apps/web/src/ui/RoofProperties.tsx:145 | `Inclinação` | rótulo de campo | P0 | `fld_inclination` | Slope | campo em graus |
| 339 | apps/web/src/ui/RoofProperties.tsx:150 | `Subida` | rótulo de campo | P1 | `fld_rise_direction` | Rise | para telhado de uma água |
| 340 | apps/web/src/ui/RoofProperties.tsx:150 | `Cumeeira` | rótulo de campo | P1 | `fld_ridge_direction` | Ridge |  |
| 341 | apps/web/src/ui/RoofProperties.tsx:154 | `Rotacionar 90°` | botão | P1 | `btn_rotate_90` | Rotate 90° |  |
| 342 | apps/web/src/ui/RoofProperties.tsx:159 | `Águas livres: cada água tem inclinação e subida próprias (lista abaixo).` | mensagem | P1 | `msg_free_roof_planes` | Free roof: each plane has its own slope and rise (list below). |  |
| 343 | apps/web/src/ui/RoofProperties.tsx:160 | `Duas águas: a inclinação vale para as arestas paralelas à cumeeira. Para editar uma aresta, use Editar perímetro.` | mensagem | P1 | `msg_gable_edges` | Gable: the slope applies to edges parallel to the ridge. To edit an edge, use Edit Perimeter. |  |
| 344 | apps/web/src/ui/RoofProperties.tsx:161 | `Quatro águas: a inclinação vale para todas as arestas do contorno. Para editar uma aresta, use Editar perímetro.` | mensagem | P1 | `msg_hip_edges` | Hip: the slope applies to all boundary edges. To edit an edge, use Edit Perimeter. |  |
| 345 | apps/web/src/ui/RoofProperties.tsx:162 | `Por arestas: inclinação só nas arestas que a definem. Para editar uma aresta, use Editar perímetro.` | mensagem | P1 | `msg_edges_slope` | By Edges: slope only on the edges that define it. To edit an edge, use Edit Perimeter. |  |
| 346 | apps/web/src/ui/RoofProperties.tsx:163 | `Telhado por extrusão: o perfil (altura por transversal) se edita pelo botão abaixo.` | mensagem | P1 | `msg_extrusion_roof` | Roof by Extrusion: edit the profile (height across) with the button below. |  |
| 347 | apps/web/src/ui/RoofProperties.tsx:164 | `Forma de uma água, duas águas ou quatro águas: troque por Por arestas para editar cada aresta.` | mensagem | P1 | `msg_preset_roof_edges` | Shed, gable or hip: switch to By Edges to edit each edge. |  |
| 348 | apps/web/src/ui/RoofProperties.tsx:165 | `Selecione um telhado para editar a direção da cumeeira.` | mensagem | P1 | `msg_select_roof_ridge` | Select a roof to edit the ridge direction. |  |
| 349 | apps/web/src/ui/RoofProperties.tsx:169 | `O balanço do beiral se define por aresta, em Editar perímetro. O contorno se ajusta pelas alças.` | mensagem | P1 | `msg_eave_by_edge` | The eave overhang is defined per edge in Edit Perimeter. The outline is adjusted by the handles. |  |
| 350 | apps/web/src/ui/RoofProperties.tsx:173 | `Beiral e acabamentos` | título de grupo | P1 | `pgrp_eave_finishes` | Eave and Finishes |  |
| 351 | apps/web/src/ui/RoofProperties.tsx:175 | `Unir telhados que se sobrepõem` | rótulo de campo | P1 | `fld_join_roofs` | Join Roofs That Overlap |  |
| 352 | apps/web/src/ui/RoofProperties.tsx:177 | `Corte do caibro` | rótulo de campo | P1 | `fld_rafter_cut` | Rafter Cut |  |
| 353 | apps/web/src/ui/RoofProperties.tsx:178 | `Corte do caibro` | aria-label | P1 | `aria_rafter_cut` | Rafter cut |  |
| 354 | apps/web/src/ui/RoofProperties.tsx:180 | `Prumo` | opção de select | P1 | `opt_plumb` | Plumb |  |
| 355 | apps/web/src/ui/RoofProperties.tsx:181 | `Esquadro` | opção de select | P1 | `opt_square` | Square |  |
| 356 | apps/web/src/ui/RoofProperties.tsx:184 | `Testeira` | rótulo de campo | P1 | `fld_fascia` | Fascia |  |
| 357 | apps/web/src/ui/RoofProperties.tsx:185 | `Testeira` | caixa de seleção | P1 | `fld_fascia` | Fascia |  |
| 358 | apps/web/src/ui/RoofProperties.tsx:187 | `Altura da testeira` | rótulo de campo | P1 | `fld_fascia_height` | Fascia Height |  |
| 359 | apps/web/src/ui/RoofProperties.tsx:190 | `Calha` | rótulo de campo | P1 | `fld_gutter` | Gutter |  |
| 360 | apps/web/src/ui/RoofProperties.tsx:191 | `Calha` | caixa de seleção | P1 | `fld_gutter` | Gutter |  |
| 361 | apps/web/src/ui/RoofProperties.tsx:193 | `Forro de beiral` | rótulo de campo | P1 | `fld_soffit` | Soffit |  |
| 362 | apps/web/src/ui/RoofProperties.tsx:194 | `Forro de beiral` | caixa de seleção | P1 | `fld_soffit` | Soffit |  |
| 363 | apps/web/src/ui/RoofProperties.tsx:197 | `Construção` | título de grupo | P1 | `pgrp_construction` | Construction |  |
| 364 | apps/web/src/ui/RoofProperties.tsx:200 | `Espessura total` | rótulo de campo | P1 | `fld_total_thickness` | Total Thickness |  |
| 365 | apps/web/src/ui/RoofProperties.tsx:209 | `Selecione telhados do mesmo tipo para ver as camadas.` | mensagem | P1 | `msg_select_same_type_layers` | Select elements of the same type to see the layers. |  |
| 366 | apps/web/src/ui/RoofProperties.tsx:212 | `Quantitativos` | título de grupo | P1 | `pgrp_quantities` | Quantities |  |
| 367 | apps/web/src/ui/RoofProperties.tsx:213 | `Área em planta` | rótulo de campo | P1 | `fld_plan_area` | Plan Area |  |
| 368 | apps/web/src/ui/RoofProperties.tsx:214 | `Área real` | rótulo de campo | P1 | `fld_real_area` | Actual Area |  |
| 369 | apps/web/src/ui/RoofProperties.tsx:215 | `Águas` | rótulo de campo | P1 | `fld_roof_planes` | Roof Planes |  |
| 370 | apps/web/src/ui/RoofProperties.tsx:216 | `Beiral` | rótulo de campo | P1 | `fld_eave` | Eave |  |
| 371 | apps/web/src/ui/RoofProperties.tsx:217 | `Cumeeira` | rótulo de campo | P1 | `fld_ridge` | Ridge |  |
| 372 | apps/web/src/ui/RoofProperties.tsx:218 | `Espigão` | rótulo de campo | P1 | `fld_hip` | Hip |  |
| 373 | apps/web/src/ui/RoofProperties.tsx:219 | `Rincão` | rótulo de campo | P1 | `fld_valley` | Valley |  |
| 374 | apps/web/src/ui/RoofProperties.tsx:221 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 375 | apps/web/src/ui/RoofProperties.tsx:222 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 376 | apps/web/src/ui/RoofProperties.tsx:223 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 377 | apps/web/src/ui/StairProperties.tsx:29 | `Automático (recalcula e continua)` | opção de select | P1 | `opt_riser_auto` | Automatic (recalculates and continues) | constante de módulo RISER_MODE_OPTIONS |
| 378 | apps/web/src/ui/StairProperties.tsx:30 | `Fixo (mantém o desenho)` | opção de select | P1 | `opt_riser_fixed` | Fixed (keeps the sketch) |  |
| 379 | apps/web/src/ui/StairProperties.tsx:94 | `Caracol: ${erro}` | mensagem de status | P1 | `msg_spiral_error` | Spiral: {error} |  |
| 380 | apps/web/src/ui/StairProperties.tsx:97 | `Editar caracol` | rótulo de desfazer | P2 | `undo_edit_spiral` | Edit Spiral |  |
| 381 | apps/web/src/ui/StairProperties.tsx:108 | `Escada: ${erro}` | mensagem de status | P1 | `msg_stair_error` | Stair: {error} |  |
| 382 | apps/web/src/ui/StairProperties.tsx:111 | `Editar nº de espelhos` | rótulo de desfazer | P2 | `undo_edit_risers` | Edit Riser Count |  |
| 383 | apps/web/src/ui/StairProperties.tsx:132 | `Escada: ${erro}` | mensagem de status | P1 | `msg_stair_error` | Stair: {error} |  |
| 384 | apps/web/src/ui/StairProperties.tsx:148 | `Escada: ${erro}` | mensagem de status | P1 | `msg_stair_error` | Stair: {error} |  |
| 385 | apps/web/src/ui/StairProperties.tsx:151 | `Editar escada` | rótulo de desfazer | P2 | `undo_edit_stair` | Edit Stair |  |
| 386 | apps/web/src/ui/StairProperties.tsx:158 | `Escada: ${erro}` | mensagem de status | P1 | `msg_stair_error` | Stair: {error} |  |
| 387 | apps/web/src/ui/StairProperties.tsx:165 | `Tipo de escada` | rótulo do seletor de tipo | P0 | `prop_type_stair` | Stair Type |  |
| 388 | apps/web/src/ui/StairProperties.tsx:166 | `Escadas (${n})` | rótulo de categoria | P0 | `cat_stairs` | Stairs ({n}) |  |
| 389 | apps/web/src/ui/StairProperties.tsx:173 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 390 | apps/web/src/ui/StairProperties.tsx:175 | `Nível base` | rótulo de campo | P0 | `fld_base_level` | Base Level |  |
| 391 | apps/web/src/ui/StairProperties.tsx:181 | `Nível base` | rótulo de campo | P0 | `fld_base_level` | Base Level |  |
| 392 | apps/web/src/ui/StairProperties.tsx:183 | `Nível de topo` | rótulo de campo | P0 | `fld_top_level` | Top Level |  |
| 393 | apps/web/src/ui/StairProperties.tsx:185 | `variados` | opção de select | P0 | `opt_varied` | Varies |  |
| 394 | apps/web/src/ui/StairProperties.tsx:186 | `Automático (nível acima)` | opção de select | P0 | `opt_level_above` | Automatic (level above) | chave ramp_levels_auto já existe com o mesmo texto |
| 395 | apps/web/src/ui/StairProperties.tsx:190 | `Desloc. da base` | rótulo de campo | P0 | `fld_base_offset` | Base Offset |  |
| 396 | apps/web/src/ui/StairProperties.tsx:191 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 397 | apps/web/src/ui/StairProperties.tsx:192 | `Espelhos` | rótulo de campo | P0 | `fld_riser_mode` | Risers | select do modo dos espelhos |
| 398 | apps/web/src/ui/StairProperties.tsx:197 | `Modo dos espelhos` | rótulo de desfazer | P2 | `undo_riser_mode` | Riser Mode |  |
| 399 | apps/web/src/ui/StairProperties.tsx:199 | `variados` | opção de select | P0 | `opt_varied` | Varies |  |
| 400 | apps/web/src/ui/StairProperties.tsx:203 | `Automático: recalcula o nº de degraus e o piso pela fórmula do tipo, continuando no último lance. Fixo: o croqui não muda e a escada só avisa.` | mensagem | P1 | `msg_riser_mode_hint` | Automatic: recalculates the riser count and tread using the type formula, continuing in the last run. Fixed: the sketch does not change and the stair only warns. |  |
| 401 | apps/web/src/ui/StairProperties.tsx:205 | `Altura` | rótulo de campo | P0 | `fld_height` | Height |  |
| 402 | apps/web/src/ui/StairProperties.tsx:207 | `Abertura da laje` | rótulo de campo | P0 | `fld_slab_opening` | Shaft Opening |  |
| 403 | apps/web/src/ui/StairProperties.tsx:209 | `variados` | opção de select | P0 | `opt_varied` | Varies |  |
| 404 | apps/web/src/ui/StairProperties.tsx:210 | `Pé-direito livre` | opção de select | P1 | `opt_headroom` | Headroom |  |
| 405 | apps/web/src/ui/StairProperties.tsx:211 | `Contorno completo` | opção de select | P1 | `opt_full_outline` | Full Outline |  |
| 406 | apps/web/src/ui/StairProperties.tsx:212 | `Sem abertura` | opção de select | P1 | `opt_no_opening` | No Opening |  |
| 407 | apps/web/src/ui/StairProperties.tsx:215 | `Pé-direito livre` | rótulo de campo | P1 | `fld_headroom` | Headroom |  |
| 408 | apps/web/src/ui/StairProperties.tsx:228 | `Folga lateral` | rótulo de campo | P1 | `fld_side_clearance` | Side Clearance |  |
| 409 | apps/web/src/ui/StairProperties.tsx:229 | `Furo retangular` | rótulo de campo | P1 | `fld_rectangular_opening` | Rectangular Opening |  |
| 410 | apps/web/src/ui/StairProperties.tsx:244 | `Caracol` | título de grupo | P1 | `pgrp_spiral` | Spiral |  |
| 411 | apps/web/src/ui/StairProperties.tsx:245 | `Raio interno` | rótulo de campo | P1 | `fld_inner_radius` | Inner Radius |  |
| 412 | apps/web/src/ui/StairProperties.tsx:248 | `Raio externo` | rótulo de campo | P1 | `fld_outer_radius` | Outer Radius |  |
| 413 | apps/web/src/ui/StairProperties.tsx:251 | `Ângulo inicial` | rótulo de campo | P1 | `fld_start_angle` | Start Angle |  |
| 414 | apps/web/src/ui/StairProperties.tsx:254 | `Varredura` | rótulo de campo | P1 | `fld_sweep` | Sweep |  |
| 415 | apps/web/src/ui/StairProperties.tsx:264 | `Sentido` | rótulo de campo | P1 | `fld_direction` | Direction |  |
| 416 | apps/web/src/ui/StairProperties.tsx:264 | `horário` | valor | P1 | `opt_clockwise` | clockwise |  |
| 417 | apps/web/src/ui/StairProperties.tsx:264 | `anti-horário` | valor | P1 | `opt_counterclockwise` | counterclockwise |  |
| 418 | apps/web/src/ui/StairProperties.tsx:268 | `Espelhos por volta` | rótulo de campo | P1 | `fld_risers_per_turn` | Risers per Turn |  |
| 419 | apps/web/src/ui/StairProperties.tsx:269 | `Folga entre voltas` | rótulo de campo | P1 | `fld_headroom_between_turns` | Headroom Between Turns |  |
| 420 | apps/web/src/ui/StairProperties.tsx:274 | `Dimensões` | título de grupo | P1 | `pgrp_dimensions` | Dimensions |  |
| 421 | apps/web/src/ui/StairProperties.tsx:278 | `Nº de espelhos` | rótulo de campo | P1 | `fld_riser_count` | Riser Count |  |
| 422 | apps/web/src/ui/StairProperties.tsx:282 | `Nº de espelhos` | rótulo de campo | P1 | `fld_riser_count` | Riser Count |  |
| 423 | apps/web/src/ui/StairProperties.tsx:284 | `Altura do espelho` | rótulo de campo | P1 | `fld_riser_height` | Riser Height |  |
| 424 | apps/web/src/ui/StairProperties.tsx:289 | `Espelho {band.text}.` | mensagem de aviso | P1 | `msg_riser_band` | Riser {text}. | texto vem de riserBandNote (PT) |
| 425 | apps/web/src/ui/StairProperties.tsx:292 | `Piso médio` | rótulo de campo | P1 | `fld_average_tread` | Average Tread |  |
| 426 | apps/web/src/ui/StairProperties.tsx:293 | `Largura` | rótulo de campo | P1 | `fld_width` | Width |  |
| 427 | apps/web/src/ui/StairProperties.tsx:294 | `Área em planta` | rótulo de campo | P1 | `fld_plan_area` | Plan Area |  |
| 428 | apps/web/src/ui/StairProperties.tsx:295 | `Volume` | rótulo de campo | P1 | `fld_volume` | Volume |  |
| 429 | apps/web/src/ui/StairProperties.tsx:298 | `Escada sem geometria válida: veja os avisos.` | mensagem | P1 | `msg_invalid_stair_geometry` | Stair has no valid geometry: see the warnings. |  |
| 430 | apps/web/src/ui/StairProperties.tsx:298 | `Selecione uma escada para ver os quantitativos.` | mensagem | P1 | `msg_select_stair_quantities` | Select a stair to see quantities. |  |
| 431 | apps/web/src/ui/StairProperties.tsx:301 | `Avisos (${n})` | título de grupo | P1 | `pgrp_warnings` | Warnings ({n}) | template com contagem |
| 432 | apps/web/src/ui/StairProperties.tsx:303 | `Sem avisos.` | mensagem | P1 | `msg_no_warnings` | No warnings. |  |
| 433 | apps/web/src/ui/StairProperties.tsx:308 | `Ir para` | botão | P1 | `btn_go_to` | Go To |  |
| 434 | apps/web/src/ui/StairProperties.tsx:313 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 435 | apps/web/src/ui/StairProperties.tsx:314 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 436 | apps/web/src/ui/StairProperties.tsx:315 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 437 | apps/web/src/ui/StairProperties.tsx:319 | `Estilo monolítico.` | mensagem | P1 | `msg_style_monolithic` | Monolithic style. |  |
| 438 | apps/web/src/ui/StairProperties.tsx:319 | `Estilo de poste central, sem espelho.` | mensagem | P1 | `msg_style_post` | Center post style, without risers. |  |
| 439 | apps/web/src/ui/StairProperties.tsx:319 | `Estilo de piso e espelho.` | mensagem | P1 | `msg_style_assembled` | Tread and riser style. |  |
| 440 | apps/web/src/ui/RampProperties.tsx:17 | `toFixed(d).replace('.', ',')` | formatação de número | P2 | `fmt_decimal_comma` | — | vírgula fixa |
| 441 | apps/web/src/ui/RampProperties.tsx:18 | `Reta` | opção de select | P1 | `opt_straight_ramp` | Straight | constante SHAPE_LABEL |
| 442 | apps/web/src/ui/RampProperties.tsx:18 | `Em L` | opção de select | P1 | `opt_l_shape` | L-Shaped |  |
| 443 | apps/web/src/ui/RampProperties.tsx:18 | `Em U` | opção de select | P1 | `opt_u_shape` | U-Shaped |  |
| 444 | apps/web/src/ui/RampProperties.tsx:18 | `Livre` | opção de select | P1 | `opt_free` | Free |  |
| 445 | apps/web/src/ui/RampProperties.tsx:19 | `À esquerda` | opção/valor | P1 | `opt_turn_left` | Left |  |
| 446 | apps/web/src/ui/RampProperties.tsx:19 | `À direita` | opção/valor | P1 | `opt_turn_right` | Right |  |
| 447 | apps/web/src/ui/RampProperties.tsx:100 | `Tipo de rampa` | rótulo do seletor de tipo | P0 | `prop_type_ramp` | Ramp Type |  |
| 448 | apps/web/src/ui/RampProperties.tsx:101 | `Rampas (${n})` | rótulo de categoria | P0 | `cat_ramps` | Ramps ({n}) |  |
| 449 | apps/web/src/ui/RampProperties.tsx:108 | `Restrições` | título de grupo | P0 | `pgrp_constraints` | Constraints |  |
| 450 | apps/web/src/ui/RampProperties.tsx:109 | `Nível base` | rótulo de campo | P0 | `fld_base_level` | Base Level |  |
| 451 | apps/web/src/ui/RampProperties.tsx:110 | `Nível de topo` | rótulo de campo | P0 | `fld_top_level` | Top Level |  |
| 452 | apps/web/src/ui/RampProperties.tsx:112 | `variados` | opção de select | P0 | `opt_varied` | Varies |  |
| 453 | apps/web/src/ui/RampProperties.tsx:113 | `Automático (nível acima)` | opção de select | P0 | `ramp_levels_auto` | Automatic (level above) | chave já existe |
| 454 | apps/web/src/ui/RampProperties.tsx:117 | `Desloc. da base` | rótulo de campo | P0 | `fld_base_offset` | Base Offset |  |
| 455 | apps/web/src/ui/RampProperties.tsx:118 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 456 | apps/web/src/ui/RampProperties.tsx:120 | `Altura` | rótulo de campo | P0 | `fld_height` | Height |  |
| 457 | apps/web/src/ui/RampProperties.tsx:122 | `Abertura da laje` | rótulo de campo | P0 | `fld_slab_opening` | Shaft Opening |  |
| 458 | apps/web/src/ui/RampProperties.tsx:124 | `variados` | opção de select | P0 | `opt_varied` | Varies |  |
| 459 | apps/web/src/ui/RampProperties.tsx:125 | `Pé-direito livre` | opção de select | P1 | `opt_headroom` | Headroom |  |
| 460 | apps/web/src/ui/RampProperties.tsx:126 | `Contorno completo` | opção de select | P1 | `opt_full_outline` | Full Outline |  |
| 461 | apps/web/src/ui/RampProperties.tsx:127 | `Sem abertura` | opção de select | P1 | `opt_no_opening` | No Opening |  |
| 462 | apps/web/src/ui/RampProperties.tsx:130 | `Pé-direito livre (m)` | rótulo de campo | P1 | `fld_headroom_m` | Headroom (m) | unidade fixa "m" no rótulo, mas o campo usa unit="m" |
| 463 | apps/web/src/ui/RampProperties.tsx:142 | `Folga lateral (m)` | rótulo de campo | P1 | `fld_side_clearance_m` | Side Clearance (m) | unidade fixa "m" |
| 464 | apps/web/src/ui/RampProperties.tsx:143 | `Furo retangular` | rótulo de campo | P1 | `fld_rectangular_opening` | Rectangular Opening |  |
| 465 | apps/web/src/ui/RampProperties.tsx:145 | `Rampa` | título de grupo | P0 | `pgrp_ramp` | Ramp |  |
| 466 | apps/web/src/ui/RampProperties.tsx:148 | `Modo` | rótulo de campo | P1 | `fld_mode` | Mode |  |
| 467 | apps/web/src/ui/RampProperties.tsx:154 | `Largura` | rótulo de campo | P0 | `fld_width` | Width |  |
| 468 | apps/web/src/ui/RampProperties.tsx:173 | `Forma` | rótulo de campo | P1 | `fld_form` | Form |  |
| 469 | apps/web/src/ui/RampProperties.tsx:174 | `Giro` | rótulo de campo | P1 | `fld_turn` | Turn |  |
| 470 | apps/web/src/ui/RampProperties.tsx:181 | `Selecione uma rampa para editar largura, inclinação e comprimento.` | mensagem | P1 | `msg_select_ramp_geometry` | Select a ramp to edit width, slope and length. |  |
| 471 | apps/web/src/ui/RampProperties.tsx:184 | `Resultados` | título de grupo | P1 | `pgrp_results` | Results |  |
| 472 | apps/web/src/ui/RampProperties.tsx:190 | `Rampa sem geometria válida: veja os avisos.` | mensagem | P1 | `msg_invalid_ramp_geometry` | Ramp has no valid geometry: see the warnings. |  |
| 473 | apps/web/src/ui/RampProperties.tsx:190 | `Selecione uma rampa para ver os quantitativos.` | mensagem | P1 | `msg_select_ramp_quantities` | Select a ramp to see quantities. |  |
| 474 | apps/web/src/ui/RampProperties.tsx:193 | `Avisos (${n})` | título de grupo | P1 | `pgrp_warnings` | Warnings ({n}) |  |
| 475 | apps/web/src/ui/RampProperties.tsx:195 | `Sem avisos.` | mensagem | P1 | `msg_no_warnings` | No warnings. |  |
| 476 | apps/web/src/ui/RampProperties.tsx:200 | `Ir para` | botão | P1 | `btn_go_to` | Go To |  |
| 477 | apps/web/src/ui/RampProperties.tsx:205 | `Dados de identidade` | título de grupo | P1 | `pgrp_identity` | Identity Data |  |
| 478 | apps/web/src/ui/RampProperties.tsx:206 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 479 | apps/web/src/ui/RampProperties.tsx:207 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 480 | apps/web/src/ui/rampFormat.ts:10 | `toFixed(2).replace('.', ',')` | formatação de número | P2 | `fmt_decimal_comma` | — | vírgula fixa |
| 481 | apps/web/src/ui/rampFormat.ts:20 | `Desnível` | rótulo de campo | P1 | `ramp_prop_rise` | Rise | chave já existe |
| 482 | apps/web/src/ui/rampFormat.ts:21 | `Inclinação` | rótulo de campo | P1 | `ramp_prop_slope` | Slope | chave já existe |
| 483 | apps/web/src/ui/rampFormat.ts:22 | `Lances` | rótulo de campo | P1 | `ramp_prop_flights` | Flights | chave já existe |
| 484 | apps/web/src/ui/rampFormat.ts:23 | `Patamares` | rótulo de campo | P1 | `ramp_prop_landings` | Landings | chave já existe |
| 485 | apps/web/src/ui/rampFormat.ts:24 | `Comprimento do percurso` | rótulo de campo | P1 | `ramp_prop_path_length` | Path Length | chave já existe |
| 486 | apps/web/src/ui/rampFormat.ts:25 | `Área` | rótulo de campo | P1 | `ramp_prop_area` | Area | chave já existe |
| 487 | apps/web/src/ui/rampFormat.ts:26 | `Volume` | rótulo de campo | P1 | `ramp_prop_volume` | Volume | chave já existe |
| 488 | apps/web/src/ui/RampLevelsFields.tsx:34 | `${rótulo}: ${valor} m` | mensagem | P2 | `msg_rise_value` | {label}: {value} m | unidade "m" fixa após fmtNum |
| 489 | apps/web/src/ui/RampLevelsFields.tsx:54 | `Nível ativo` | mensagem/fallback | P1 | `msg_level_active` | Active Level |  |
| 490 | apps/web/src/ui/GraphicsProps.tsx:18 | `Gráficos da vista` | título de grupo | P0 | `pgrp_view_graphics` | View Graphics |  |
| 491 | apps/web/src/ui/GraphicsProps.tsx:21 | `Escala da planta` | aria-label | P1 | `aria_plan_scale` | Plan scale |  |
| 492 | apps/web/src/ui/GraphicsProps.tsx:22 | `Outra` | opção de select | P1 | `opt_other_scale` | Other |  |
| 493 | apps/web/src/ui/GraphicsProps.tsx:29 | `Detalhe` | rótulo de campo | P1 | `fld_detail` | Detail Level |  |
| 494 | apps/web/src/ui/GraphicsProps.tsx:34 | `Estilo visual` | rótulo de campo | P1 | `fld_visual_style` | Visual Style |  |
| 495 | apps/web/src/ui/GraphicsProps.tsx:39 | `Parcial de estrutura` | rótulo de campo | P1 | `fld_partial_structure` | Parts Visible |  |
| 496 | apps/web/src/ui/GraphicsProps.tsx:44 | `Linhas finas (tela)` | rótulo de campo | P1 | `fld_thin_lines_screen` | Thin Lines (screen) |  |
| 497 | apps/web/src/ui/GraphicsProps.tsx:45 | `A plotagem (prancha, PDF e DXF) mantém os pesos de linha reais.` | mensagem | P1 | `msg_plot_keeps_line_weights` | Plotting (sheet, PDF and DXF) keeps the real line weights. |  |
| 498 | apps/web/src/ui/GraphicsProps.tsx:47 | `Visibilidade e gráficos…` | botão | P1 | `btn_visibility_graphics` | Visibility/Graphics… |  |
| 499 | apps/web/src/ui/GraphicsProps.tsx:48 | `Restaurar padrão` | botão | P1 | `btn_restore_default` | Restore Default |  |
| 500 | apps/web/src/ui/GraphicsProps.tsx:50 | `Oculto nesta vista: ${lista}.` | mensagem | P1 | `msg_hidden_in_view` | Hidden in this view: {list}. |  |
| 501 | apps/web/src/ui/GraphicsProps.tsx:65 | `Gráficos da vista` | título de grupo | P0 | `pgrp_view_graphics` | View Graphics |  |
| 502 | apps/web/src/ui/GraphicsProps.tsx:68 | `Escala do corte` | aria-label | P1 | `aria_section_scale` | Section scale |  |
| 503 | apps/web/src/ui/GraphicsProps.tsx:69 | `Outra` | opção de select | P1 | `opt_other_scale` | Other |  |
| 504 | apps/web/src/ui/GraphicsProps.tsx:76 | `Detalhe` | rótulo de campo | P1 | `fld_detail` | Detail Level |  |
| 505 | apps/web/src/ui/GraphicsProps.tsx:81 | `Estilo visual` | rótulo de campo | P1 | `fld_visual_style` | Visual Style |  |
| 506 | apps/web/src/ui/GraphicsProps.tsx:86 | `Parcial de estrutura` | rótulo de campo | P1 | `fld_partial_structure` | Parts Visible |  |
| 507 | apps/web/src/ui/GraphicsProps.tsx:91 | `Linhas finas (tela)` | rótulo de campo | P1 | `fld_thin_lines_screen` | Thin Lines (screen) |  |
| 508 | apps/web/src/ui/GraphicsProps.tsx:92 | `A plotagem (prancha, PDF e DXF) mantém os pesos de linha reais.` | mensagem | P1 | `msg_plot_keeps_line_weights` | Plotting (sheet, PDF and DXF) keeps the real line weights. |  |
| 509 | apps/web/src/ui/GraphicsProps.tsx:94 | `Visibilidade e gráficos…` | botão | P1 | `btn_visibility_graphics` | Visibility/Graphics… |  |
| 510 | apps/web/src/ui/GraphicsProps.tsx:95 | `Restaurar padrão` | botão | P1 | `btn_restore_default` | Restore Default |  |
| 511 | apps/web/src/ui/GraphicsProps.tsx:97 | `Oculto nesta vista: ${lista}.` | mensagem | P1 | `msg_hidden_in_view` | Hidden in this view: {list}. |  |
| 512 | apps/web/src/ui/GraphicsProps.tsx:112 | `Cor do fundo do 3D` | aria-label | P1 | `aria_3d_background` | 3D background color |  |
| 513 | apps/web/src/ui/GraphicsProps.tsx:127 | `Gráficos do 3D` | título de grupo | P0 | `pgrp_3d_graphics` | 3D Graphics |  |
| 514 | apps/web/src/ui/GraphicsProps.tsx:128 | `Estilo visual` | rótulo de campo | P1 | `fld_visual_style` | Visual Style |  |
| 515 | apps/web/src/ui/GraphicsProps.tsx:133 | `Exibição parcial` | rótulo de campo | P1 | `fld_partial_display` | Parts Visible |  |
| 516 | apps/web/src/ui/GraphicsProps.tsx:138 | `Sombras` | rótulo de campo | P1 | `fld_shadows` | Shadows |  |
| 517 | apps/web/src/ui/GraphicsProps.tsx:139 | `Arestas` | rótulo de campo | P1 | `fld_edges` | Edges |  |
| 518 | apps/web/src/ui/GraphicsProps.tsx:140 | `Mostrar níveis` | rótulo de campo | P1 | `fld_show_levels` | Show Levels |  |
| 519 | apps/web/src/ui/GraphicsProps.tsx:141 | `Sol: azimute` | rótulo de campo | P1 | `fld_sun_azimuth` | Sun: Azimuth |  |
| 520 | apps/web/src/ui/GraphicsProps.tsx:142 | `Sol: elevação` | rótulo de campo | P1 | `fld_sun_elevation` | Sun: Elevation |  |
| 521 | apps/web/src/ui/GraphicsProps.tsx:143 | `Fundo` | rótulo de campo | P1 | `fld_background` | Background |  |
| 522 | apps/web/src/ui/GraphicsProps.tsx:145 | `Padrão do tema` | caixa de seleção | P1 | `opt_theme_default` | Theme default |  |
| 523 | apps/web/src/ui/GraphicsProps.tsx:150 | `Visibilidade e gráficos…` | botão | P1 | `btn_visibility_graphics` | Visibility/Graphics… |  |
| 524 | apps/web/src/ui/GraphicsProps.tsx:151 | `Restaurar padrão` | botão | P1 | `btn_restore_default` | Restore Default |  |
| 525 | apps/web/src/ui/GraphicsProps.tsx:153 | `Oculto no 3D: ${lista}.` | mensagem | P1 | `msg_hidden_in_3d` | Hidden in 3D: {list}. |  |
| 526 | apps/web/src/ui/graphicsLabels.ts:6 | `Parede` | rótulo de opção | P1 | `cat_wall` | Wall | arquivo compartilhado por propriedades e diálogos |
| 527 | apps/web/src/ui/graphicsLabels.ts:7 | `Porta` | rótulo de opção | P1 | `cat_door` | Door | arquivo compartilhado por propriedades e diálogos |
| 528 | apps/web/src/ui/graphicsLabels.ts:8 | `Janela` | rótulo de opção | P1 | `cat_window` | Window | arquivo compartilhado por propriedades e diálogos |
| 529 | apps/web/src/ui/graphicsLabels.ts:9 | `Piso` | rótulo de opção | P1 | `cat_floor` | Floor | arquivo compartilhado por propriedades e diálogos |
| 530 | apps/web/src/ui/graphicsLabels.ts:10 | `Laje` | rótulo de opção | P1 | `cat_slab` | Slab | arquivo compartilhado por propriedades e diálogos |
| 531 | apps/web/src/ui/graphicsLabels.ts:11 | `Telhado` | rótulo de opção | P1 | `cat_roof` | Roof | arquivo compartilhado por propriedades e diálogos |
| 532 | apps/web/src/ui/graphicsLabels.ts:12 | `Escada` | rótulo de opção | P1 | `cat_stair` | Stair | arquivo compartilhado por propriedades e diálogos |
| 533 | apps/web/src/ui/graphicsLabels.ts:13 | `Ambiente` | rótulo de opção | P1 | `cat_room` | Room | arquivo compartilhado por propriedades e diálogos |
| 534 | apps/web/src/ui/graphicsLabels.ts:14 | `Anotação` | rótulo de opção | P1 | `cat_annotation` | Annotation | arquivo compartilhado por propriedades e diálogos |
| 535 | apps/web/src/ui/graphicsLabels.ts:15 | `Objeto importado` | rótulo de opção | P1 | `cat_generic` | Imported Object | arquivo compartilhado por propriedades e diálogos |
| 536 | apps/web/src/ui/graphicsLabels.ts:19 | `Aramado` | rótulo de opção | P1 | `opt_wireframe` | Wireframe | arquivo compartilhado por propriedades e diálogos |
| 537 | apps/web/src/ui/graphicsLabels.ts:20 | `Linhas ocultas` | rótulo de opção | P1 | `opt_hidden_line` | Hidden Line | arquivo compartilhado por propriedades e diálogos |
| 538 | apps/web/src/ui/graphicsLabels.ts:21 | `Sombreado` | rótulo de opção | P1 | `opt_shaded` | Shaded | arquivo compartilhado por propriedades e diálogos |
| 539 | apps/web/src/ui/graphicsLabels.ts:22 | `Cores consistentes` | rótulo de opção | P1 | `opt_consistent_colors` | Consistent Colors | arquivo compartilhado por propriedades e diálogos |
| 540 | apps/web/src/ui/graphicsLabels.ts:23 | `Realista` | rótulo de opção | P1 | `opt_realistic` | Realistic | arquivo compartilhado por propriedades e diálogos |
| 541 | apps/web/src/ui/graphicsLabels.ts:27 | `Modelo inteiro` | rótulo de opção | P1 | `opt_entire_model` | Entire Model | arquivo compartilhado por propriedades e diálogos |
| 542 | apps/web/src/ui/graphicsLabels.ts:28 | `Sem acabamentos` | rótulo de opção | P1 | `opt_no_finishes` | Exterior Shell | arquivo compartilhado por propriedades e diálogos |
| 543 | apps/web/src/ui/graphicsLabels.ts:29 | `Só núcleo` | rótulo de opção | P1 | `opt_core_only` | Core Only | arquivo compartilhado por propriedades e diálogos |
| 544 | apps/web/src/ui/graphicsLabels.ts:33 | `Por escala` | rótulo de opção | P1 | `opt_by_scale` | By Scale | arquivo compartilhado por propriedades e diálogos |
| 545 | apps/web/src/ui/graphicsLabels.ts:34 | `Grosso` | rótulo de opção | P1 | `opt_coarse` | Coarse | arquivo compartilhado por propriedades e diálogos |
| 546 | apps/web/src/ui/graphicsLabels.ts:35 | `Médio` | rótulo de opção | P1 | `opt_medium` | Medium | arquivo compartilhado por propriedades e diálogos |
| 547 | apps/web/src/ui/graphicsLabels.ts:36 | `Fino` | rótulo de opção | P1 | `opt_fine` | Fine | arquivo compartilhado por propriedades e diálogos |
| 548 | apps/web/src/ui/PlacementProperties.tsx:31 | `planta de área “${nome}”` | mensagem | P0 | `msg_area_plan_target` | area plan “{name}” | usado no texto de destino da anotação |
| 549 | apps/web/src/ui/PlacementProperties.tsx:31 | `nível ativo (${nome})` | mensagem | P0 | `msg_active_level_target` | active level ({name}) |  |
| 550 | apps/web/src/ui/PlacementProperties.tsx:31 | `Nível atual` | mensagem/fallback | P1 | `msg_current_level` | Current Level |  |
| 551 | apps/web/src/ui/PlacementProperties.tsx:44 | `Colocação · Parede` | título de grupo | P0 | `pgrp_placement_wall` | Placement · Wall | o prefixo "Colocação ·" se repete em 10 grupos |
| 552 | apps/web/src/ui/PlacementProperties.tsx:45 | `Reta` | opção de select | P0 | `opt_line` | Line |  |
| 553 | apps/web/src/ui/PlacementProperties.tsx:45 | `Arco (3 pontos)` | opção de select | P0 | `opt_arc_3_points` | Arc (3 points) |  |
| 554 | apps/web/src/ui/PlacementProperties.tsx:45 | `Retângulo` | opção de select | P0 | `opt_rectangle` | Rectangle |  |
| 555 | apps/web/src/ui/PlacementProperties.tsx:46 | `Nível base` | rótulo de campo | P0 | `fld_base_level` | Base Level |  |
| 556 | apps/web/src/ui/PlacementProperties.tsx:48 | `Nível superior` | rótulo de campo | P0 | `fld_top_level` | Top Level |  |
| 557 | apps/web/src/ui/PlacementProperties.tsx:48 | `Por altura` | opção de select | P0 | `opt_by_height` | By Height |  |
| 558 | apps/web/src/ui/PlacementProperties.tsx:49 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 559 | apps/web/src/ui/PlacementProperties.tsx:49 | `Altura` | rótulo de campo | P0 | `fld_height` | Height |  |
| 560 | apps/web/src/ui/PlacementProperties.tsx:50 | `Linha de localização` | rótulo de campo | P0 | `fld_location_line` | Location Line |  |
| 561 | apps/web/src/ui/PlacementProperties.tsx:51 | `Inverter lado externo` | rótulo de campo | P0 | `fld_flip_exterior` | Flip Exterior |  |
| 562 | apps/web/src/ui/PlacementProperties.tsx:52 | `Encadear` | rótulo de campo | P1 | `fld_chain` | Chain |  |
| 563 | apps/web/src/ui/PlacementProperties.tsx:56 | `Colocação · Porta` | título de grupo | P0 | `pgrp_placement_door` | Placement · Door |  |
| 564 | apps/web/src/ui/PlacementProperties.tsx:56 | `Colocação · Janela` | título de grupo | P0 | `pgrp_placement_window` | Placement · Window |  |
| 565 | apps/web/src/ui/PlacementProperties.tsx:57 | `Inverter dobradiça` | rótulo de campo | P0 | `fld_flip_hand` | Flip Hand |  |
| 566 | apps/web/src/ui/PlacementProperties.tsx:58 | `Inverter sentido` | rótulo de campo | P0 | `fld_flip_facing` | Flip Facing |  |
| 567 | apps/web/src/ui/PlacementProperties.tsx:59 | `Sentido` | rótulo de campo | P0 | `fld_facing` | Facing |  |
| 568 | apps/web/src/ui/PlacementProperties.tsx:59 | `Pelo cursor` | opção de select | P1 | `opt_by_cursor` | By Cursor |  |
| 569 | apps/web/src/ui/PlacementProperties.tsx:59 | `Manual` | opção de select | P1 | `opt_manual` | Manual |  |
| 570 | apps/web/src/ui/PlacementProperties.tsx:60 | `Abrir` | rótulo de campo | P1 | `fld_open` | Open |  |
| 571 | apps/web/src/ui/PlacementProperties.tsx:60 | `para o lado do cursor` | opção de select | P1 | `opt_toward_cursor` | toward the cursor |  |
| 572 | apps/web/src/ui/PlacementProperties.tsx:60 | `para o lado oposto` | opção de select | P1 | `opt_away_from_cursor` | away from the cursor |  |
| 573 | apps/web/src/ui/PlacementProperties.tsx:61 | `Âncora` | rótulo de campo | P1 | `fld_anchor` | Anchor |  |
| 574 | apps/web/src/ui/PlacementProperties.tsx:61 | `Centro` | opção de select | P1 | `opt_center` | Center |  |
| 575 | apps/web/src/ui/PlacementProperties.tsx:61 | `Ombreira da dobradiça` | opção de select | P1 | `opt_hinge_jamb` | Hinge Jamb |  |
| 576 | apps/web/src/ui/PlacementProperties.tsx:61 | `Ombreira do trinco` | opção de select | P1 | `opt_latch_jamb` | Latch Jamb |  |
| 577 | apps/web/src/ui/PlacementProperties.tsx:62 | `Folga da quina (cm)` | rótulo de campo | P1 | `fld_corner_clearance_cm` | Corner Clearance (cm) | unidade fixa "cm" mas usa quantity smallLength (muda com o projeto) |
| 578 | apps/web/src/ui/PlacementProperties.tsx:63 | `Cota: parede` | rótulo de campo | P1 | `fld_dim_wall` | Dimension: Wall |  |
| 579 | apps/web/src/ui/PlacementProperties.tsx:63 | `Padrão do projeto` | opção de select | P1 | `opt_project_default` | Project Default | repetido na linha 64 |
| 580 | apps/web/src/ui/PlacementProperties.tsx:64 | `Cota: esquadria` | rótulo de campo | P1 | `fld_dim_opening` | Dimension: Opening |  |
| 581 | apps/web/src/ui/PlacementProperties.tsx:64 | `Padrão do projeto` | opção de select | P1 | `opt_project_default` | Project Default |  |
| 582 | apps/web/src/ui/PlacementProperties.tsx:65 | `Etiquetas de portas e janelas` | rótulo de campo | P1 | `fld_opening_tags` | Door and Window Tags |  |
| 583 | apps/web/src/ui/PlacementProperties.tsx:66 | `Etiquetar ao inserir` | rótulo de campo | P1 | `fld_tag_on_place` | Tag on Placement |  |
| 584 | apps/web/src/ui/PlacementProperties.tsx:67 | `Peitoril` | rótulo de campo | P1 | `fld_sill` | Sill Height | placeholder "{valor} (tipo)" também em PT |
| 585 | apps/web/src/ui/PlacementProperties.tsx:67 | `(tipo)` | sufixo | P2 | `suffix_from_type` | (type) |  |
| 586 | apps/web/src/ui/PlacementProperties.tsx:68 | `A parede anfitriã e a posição são escolhidas na planta. Largura, altura e peitoril vêm do tipo selecionado.` | mensagem | P1 | `msg_opening_placement_hint` | The host wall and position are picked in the plan. Width, height and sill come from the selected type. |  |
| 587 | apps/web/src/ui/PlacementProperties.tsx:72 | `Colocação · Piso` | título de grupo | P0 | `pgrp_placement_floor` | Placement · Floor |  |
| 588 | apps/web/src/ui/PlacementProperties.tsx:73 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 589 | apps/web/src/ui/PlacementProperties.tsx:77 | `Colocação · Inclinação` | título de grupo | P0 | `pgrp_placement_slope` | Placement · Slope |  |
| 590 | apps/web/src/ui/PlacementProperties.tsx:77 | `Colocação · Laje` | título de grupo | P0 | `pgrp_placement_slab` | Placement · Slab |  |
| 591 | apps/web/src/ui/PlacementProperties.tsx:79 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 592 | apps/web/src/ui/PlacementProperties.tsx:81 | `Caimento` | rótulo de campo | P1 | `fld_slope_percent` | Slope |  |
| 593 | apps/web/src/ui/PlacementProperties.tsx:85 | `Colocação · Forro` | título de grupo | P0 | `pgrp_placement_ceiling` | Placement · Ceiling |  |
| 594 | apps/web/src/ui/PlacementProperties.tsx:86 | `Cota do topo` | rótulo de campo | P0 | `fld_top_elevation` | Top Elevation |  |
| 595 | apps/web/src/ui/PlacementProperties.tsx:90 | `Colocação · Telhado` | título de grupo | P0 | `pgrp_placement_roof` | Placement · Roof |  |
| 596 | apps/web/src/ui/PlacementProperties.tsx:91 | `Inclinação` | rótulo de campo | P0 | `fld_inclination` | Slope |  |
| 597 | apps/web/src/ui/PlacementProperties.tsx:92 | `Balanço do beiral` | rótulo de campo | P0 | `fld_eave_overhang` | Eave Overhang |  |
| 598 | apps/web/src/ui/PlacementProperties.tsx:93 | `Cota do beiral` | rótulo de campo | P0 | `fld_eave_elevation` | Eave Elevation |  |
| 599 | apps/web/src/ui/PlacementProperties.tsx:94 | `Cota automática` | botão | P1 | `btn_auto_elevation` | Automatic Elevation |  |
| 600 | apps/web/src/ui/PlacementProperties.tsx:98 | `Colocação · Escada` | título de grupo | P0 | `pgrp_placement_stair` | Placement · Stair |  |
| 601 | apps/web/src/ui/PlacementProperties.tsx:99 | `Nível de topo` | rótulo de campo | P0 | `fld_top_level` | Top Level |  |
| 602 | apps/web/src/ui/PlacementProperties.tsx:99 | `Automático (nível acima)` | opção de select | P0 | `opt_level_above` | Automatic (level above) |  |
| 603 | apps/web/src/ui/PlacementProperties.tsx:100 | `Desloc. da base` | rótulo de campo | P0 | `fld_base_offset` | Base Offset |  |
| 604 | apps/web/src/ui/PlacementProperties.tsx:101 | `Desloc. do topo` | rótulo de campo | P0 | `fld_top_offset` | Top Offset |  |
| 605 | apps/web/src/ui/PlacementProperties.tsx:102 | `Altura` | rótulo de campo | P0 | `fld_height` | Height |  |
| 606 | apps/web/src/ui/PlacementProperties.tsx:109 | `Colocação · Escada por lance` | título de grupo | P0 | `pgrp_placement_stair_run` | Placement · Stair by Run |  |
| 607 | apps/web/src/ui/PlacementProperties.tsx:110 | `Forma` | rótulo de campo | P0 | `fld_form` | Form |  |
| 608 | apps/web/src/ui/PlacementProperties.tsx:111 | `Largura` | rótulo de campo | P0 | `fld_width` | Width |  |
| 609 | apps/web/src/ui/PlacementProperties.tsx:112 | `Prof. do patamar` | rótulo de campo | P1 | `fld_landing_depth` | Landing Depth |  |
| 610 | apps/web/src/ui/PlacementProperties.tsx:112 | `largura` | placeholder | P2 | `ph_width` | width |  |
| 611 | apps/web/src/ui/PlacementProperties.tsx:113 | `Giro` | rótulo de campo | P1 | `fld_turn` | Turn |  |
| 612 | apps/web/src/ui/PlacementProperties.tsx:113 | `Esquerda` | opção de select | P1 | `opt_left` | Left |  |
| 613 | apps/web/src/ui/PlacementProperties.tsx:113 | `Direita` | opção de select | P1 | `opt_right` | Right |  |
| 614 | apps/web/src/ui/PlacementProperties.tsx:115 | `Raio interno` | rótulo de campo | P1 | `fld_inner_radius` | Inner Radius |  |
| 615 | apps/web/src/ui/PlacementProperties.tsx:115 | `Raio externo` | rótulo de campo | P1 | `fld_outer_radius` | Outer Radius |  |
| 616 | apps/web/src/ui/PlacementProperties.tsx:115 | `Varredura` | rótulo de campo | P1 | `fld_sweep` | Sweep |  |
| 617 | apps/web/src/ui/PlacementProperties.tsx:120 | `Colocação · Rampa` | título de grupo | P0 | `pgrp_placement_ramp` | Placement · Ramp |  |
| 618 | apps/web/src/ui/PlacementProperties.tsx:125 | `Colocação · Ambiente` | título de grupo | P0 | `pgrp_placement_room` | Placement · Room |  |
| 619 | apps/web/src/ui/PlacementProperties.tsx:126 | `Nível` | rótulo de campo | P0 | `fld_level` | Level |  |
| 620 | apps/web/src/ui/PlacementProperties.tsx:127 | `Nome` | rótulo de campo | P1 | `fld_name` | Name |  |
| 621 | apps/web/src/ui/PlacementProperties.tsx:127 | `Automático` | placeholder | P1 | `opt_automatic` | Automatic |  |
| 622 | apps/web/src/ui/PlacementProperties.tsx:128 | `Número` | rótulo de campo | P1 | `fld_number` | Number |  |
| 623 | apps/web/src/ui/PlacementProperties.tsx:128 | `Automático` | placeholder | P1 | `opt_automatic` | Automatic |  |
| 624 | apps/web/src/ui/PlacementProperties.tsx:129 | `Desloc. da base` | rótulo de campo | P1 | `fld_base_offset` | Base Offset |  |
| 625 | apps/web/src/ui/PlacementProperties.tsx:130 | `Pé-direito` | rótulo de campo | P1 | `fld_ceiling_height` | Ceiling Height |  |
| 626 | apps/web/src/ui/PlacementProperties.tsx:131 | `Acabamento do piso` | rótulo de campo | P1 | `fld_floor_finish` | Floor Finish |  |
| 627 | apps/web/src/ui/PlacementProperties.tsx:132 | `Acabamento da parede` | rótulo de campo | P1 | `fld_wall_finish` | Wall Finish |  |
| 628 | apps/web/src/ui/PlacementProperties.tsx:133 | `Acabamento do forro` | rótulo de campo | P1 | `fld_ceiling_finish` | Ceiling Finish |  |
| 629 | apps/web/src/ui/PlacementProperties.tsx:134 | `Cor do ambiente` | aria-label | P1 | `aria_room_color` | Room color |  |
| 630 | apps/web/src/ui/PlacementProperties.tsx:138 | `Colocação · Texto` | título de grupo | P0 | `pgrp_placement_text` | Placement · Text |  |
| 631 | apps/web/src/ui/PlacementProperties.tsx:139 | `Altura do texto` | rótulo de campo | P1 | `fld_text_height` | Text Size |  |
| 632 | apps/web/src/ui/PlacementProperties.tsx:140 | `Rotação` | rótulo de campo | P1 | `fld_rotation` | Rotation |  |
| 633 | apps/web/src/ui/PlacementProperties.tsx:141 | `Caixa de texto…` | botão | P1 | `btn_text_box` | Text Box… |  |
| 634 | apps/web/src/ui/PlacementProperties.tsx:142 | `Clique na planta e digite o texto, ou use a caixa de texto para largura, moldura e quebra de linha.` | mensagem | P1 | `msg_text_placement_hint` | Click in the plan and type the text, or use the text box for width, border and line breaks. |  |
| 635 | apps/web/src/ui/PlacementProperties.tsx:146 | `Colocação · Ambiente` | título de grupo | P0 | `pgrp_placement_room` | Placement · Room |  |
| 636 | apps/web/src/ui/PlacementProperties.tsx:146 | `Colocação · Separador de ambiente` | título de grupo | P0 | `pgrp_placement_room_separator` | Placement · Room Separator |  |
| 637 | apps/web/src/ui/PlacementProperties.tsx:146 | `Colocação · Cota` | título de grupo | P0 | `pgrp_placement_dimension` | Placement · Dimension |  |
| 638 | apps/web/src/ui/PlacementProperties.tsx:146 | `Colocação · Texto` | título de grupo | P0 | `pgrp_placement_text` | Placement · Text |  |
| 639 | apps/web/src/ui/PlacementProperties.tsx:146 | `Colocação · Corte` | título de grupo | P0 | `pgrp_placement_section` | Placement · Section |  |
| 640 | apps/web/src/ui/PlacementProperties.tsx:147 | `As opções geométricas e o conteúdo são definidos durante o desenho. A anotação será criada na ${destino}.` | mensagem | P1 | `msg_annotation_target_hint` | Geometric options and content are defined while drawing. The annotation will be created in the {target}. |  |
| 641 | apps/web/src/ui/PlacementProperties.tsx:151 | `Nível e identidade` | título de grupo | P1 | `pgrp_level_identity` | Level and Identity |  |
| 642 | apps/web/src/ui/PlacementProperties.tsx:152 | `Nível` | rótulo de campo | P1 | `fld_level` | Level |  |
| 643 | apps/web/src/ui/PlacementProperties.tsx:153 | `Marca` | rótulo de campo | P1 | `fld_mark` | Mark |  |
| 644 | apps/web/src/ui/PlacementProperties.tsx:154 | `Comentários` | rótulo de campo | P1 | `fld_comments` | Comments |  |
| 645 | apps/web/src/ui/AnnotationProps.tsx:121 | `Não foi possível alterar a anotação.` | mensagem de status | P1 | `msg_annotation_update_failed` | Could not change the annotation. |  |
| 646 | apps/web/src/ui/AnnotationProps.tsx:171 | `ponta A (livre)` | mensagem | P1 | `msg_end_a_free` | end A (free) |  |
| 647 | apps/web/src/ui/AnnotationProps.tsx:171 | `ponta B (livre)` | mensagem | P1 | `msg_end_b_free` | end B (free) |  |
| 648 | apps/web/src/ui/AnnotationProps.tsx:173 | `parede ${nome}` | mensagem | P1 | `msg_ref_wall` | wall {name} | nome curto da referência |
| 649 | apps/web/src/ui/AnnotationProps.tsx:173 | `porta ${nome}` | mensagem | P1 | `msg_ref_door` | door {name} |  |
| 650 | apps/web/src/ui/AnnotationProps.tsx:173 | `janela ${nome}` | mensagem | P1 | `msg_ref_window` | window {name} |  |
| 651 | apps/web/src/ui/AnnotationProps.tsx:188 | `Padrão` | opção de select | P1 | `opt_default_family` | Default | família de cota global |
| 652 | apps/web/src/ui/AnnotationProps.tsx:192 | `Família` | rótulo de campo | P1 | `fld_family` | Family |  |
| 653 | apps/web/src/ui/AnnotationProps.tsx:223 | `Cota angular` | título de grupo | P1 | `pgrp_angular_dimension` | Angular Dimension |  |
| 654 | apps/web/src/ui/AnnotationProps.tsx:224 | `Valor` | rótulo de campo | P1 | `fld_value` | Value |  |
| 655 | apps/web/src/ui/AnnotationProps.tsx:226 | `Texto` | rótulo de campo | P1 | `fld_text` | Text |  |
| 656 | apps/web/src/ui/AnnotationProps.tsx:229 | `Lado` | rótulo de campo | P1 | `fld_side` | Side |  |
| 657 | apps/web/src/ui/AnnotationProps.tsx:229 | `Menor (interno)` | opção de select | P1 | `opt_minor_internal` | Minor (internal) |  |
| 658 | apps/web/src/ui/AnnotationProps.tsx:229 | `Maior (externo/360°)` | opção de select | P1 | `opt_reflex_external` | Major (external/360°) |  |
| 659 | apps/web/src/ui/AnnotationProps.tsx:229 | `Maior (suplementar)` | opção de select | P1 | `opt_major_supplementary` | Major (supplementary) |  |
| 660 | apps/web/src/ui/AnnotationProps.tsx:230 | `Raio` | rótulo de campo | P1 | `fld_radius` | Radius |  |
| 661 | apps/web/src/ui/AnnotationProps.tsx:231 | `Casas decimais` | rótulo de campo | P1 | `fld_decimals` | Decimal Places |  |
| 662 | apps/web/src/ui/AnnotationProps.tsx:232 | `Altura do texto` | rótulo de campo | P1 | `fld_text_height` | Text Size |  |
| 663 | apps/web/src/ui/AnnotationProps.tsx:233 | `Marca` | rótulo de campo | P1 | `fld_tick_mark` | Tick Mark | select do estilo do traço |
| 664 | apps/web/src/ui/AnnotationProps.tsx:233 | `Traço` | opção de select | P1 | `opt_tick_slash` | Slash |  |
| 665 | apps/web/src/ui/AnnotationProps.tsx:233 | `Seta` | opção de select | P1 | `opt_tick_arrow` | Arrow |  |
| 666 | apps/web/src/ui/AnnotationProps.tsx:233 | `Ponto` | opção de select | P1 | `opt_tick_dot` | Dot |  |
| 667 | apps/web/src/ui/AnnotationProps.tsx:234 | `A cota angular mede o encontro de duas referências e não move paredes. Texto vazio mostra o valor medido.` | mensagem | P1 | `msg_angular_dimension_hint` | The angular dimension measures the intersection of two references and does not move walls. Empty text shows the measured value. |  |
| 668 | apps/web/src/ui/AnnotationProps.tsx:239 | `Cota` | título de grupo | P1 | `pgrp_dimension` | Dimension |  |
| 669 | apps/web/src/ui/AnnotationProps.tsx:241 | `Valor` | rótulo de campo | P1 | `fld_value` | Value |  |
| 670 | apps/web/src/ui/AnnotationProps.tsx:244 | `Medida` | rótulo de campo | P1 | `fld_measurement` | Measurement |  |
| 671 | apps/web/src/ui/AnnotationProps.tsx:257 | `Alterar cota` | rótulo de desfazer | P2 | `undo_change_dimension` | Change Dimension |  |
| 672 | apps/web/src/ui/AnnotationProps.tsx:258 | `Confirme o diálogo para aplicar a cota.` | mensagem de status | P1 | `msg_confirm_dimension_dialog` | Confirm the dialog to apply the dimension. |  |
| 673 | apps/web/src/ui/AnnotationProps.tsx:259 | `Cota atualizada: elementos associados movidos.` | mensagem de status | P1 | `msg_dimension_updated` | Dimension updated: associated elements moved. |  |
| 674 | apps/web/src/ui/AnnotationProps.tsx:263 | `Move` | rótulo de campo | P1 | `fld_move` | Move |  |
| 675 | apps/web/src/ui/AnnotationProps.tsx:265 | `Automático: ${ponta}` | opção de select | P1 | `opt_move_auto` | Automatic: {end} |  |
| 676 | apps/web/src/ui/AnnotationProps.tsx:266 | `Mover ${ponta} (fixa ${outra})` | opção de select | P1 | `opt_move_end` | Move {end} (fixed {other}) |  |
| 677 | apps/web/src/ui/AnnotationProps.tsx:267 | `Mover ${ponta} (fixa ${outra})` | opção de select | P1 | `opt_move_end` | Move {end} (fixed {other}) |  |
| 678 | apps/web/src/ui/AnnotationProps.tsx:270 | `Cota travada: destrave abaixo para a medida mover as paredes.` | mensagem | P1 | `msg_dimension_locked` | Dimension locked: unlock below so the measurement can move the walls. |  |
| 679 | apps/web/src/ui/AnnotationProps.tsx:274 | `Travada (a medida não move os elementos)` | caixa de seleção | P1 | `fld_locked` | Locked (the measurement does not move elements) |  |
| 680 | apps/web/src/ui/AnnotationProps.tsx:275 | `Deslocamento` | rótulo de campo | P1 | `fld_offset` | Offset |  |
| 681 | apps/web/src/ui/AnnotationProps.tsx:278 | `Direção` | rótulo de campo | P1 | `fld_direction` | Direction |  |
| 682 | apps/web/src/ui/AnnotationProps.tsx:278 | `Alinhada` | opção de select | P1 | `opt_aligned` | Aligned |  |
| 683 | apps/web/src/ui/AnnotationProps.tsx:278 | `Horizontal` | opção de select | P1 | `opt_horizontal` | Horizontal |  |
| 684 | apps/web/src/ui/AnnotationProps.tsx:278 | `Vertical` | opção de select | P1 | `opt_vertical` | Vertical |  |
| 685 | apps/web/src/ui/AnnotationProps.tsx:280 | `Aparência` | título de grupo | P1 | `pgrp_appearance` | Appearance |  |
| 686 | apps/web/src/ui/AnnotationProps.tsx:281 | `Texto fixo` | rótulo de campo | P1 | `fld_fixed_text` | Fixed Text |  |
| 687 | apps/web/src/ui/AnnotationProps.tsx:282 | `${valor} (automático)` | placeholder | P1 | `ph_auto_value` | {value} (automatic) |  |
| 688 | apps/web/src/ui/AnnotationProps.tsx:284 | `Editar família…` | botão | P1 | `btn_edit_family` | Edit Family… |  |
| 689 | apps/web/src/ui/AnnotationProps.tsx:284 | `Abrir a família desta cota no editor de famílias` | tooltip | P1 | `tip_edit_dimension_family` | Open this dimension family in the family editor |  |
| 690 | apps/web/src/ui/AnnotationProps.tsx:285 | `Unidade` | rótulo de campo | P1 | `fld_units` | Units |  |
| 691 | apps/web/src/ui/AnnotationProps.tsx:285 | `Projeto` | opção de select | P1 | `opt_project_units` | Project |  |
| 692 | apps/web/src/ui/AnnotationProps.tsx:285 | `Metros` | opção de select | P1 | `opt_meters` | Meters |  |
| 693 | apps/web/src/ui/AnnotationProps.tsx:285 | `Centímetros` | opção de select | P1 | `opt_centimeters` | Centimeters |  |
| 694 | apps/web/src/ui/AnnotationProps.tsx:285 | `Milímetros` | opção de select | P1 | `opt_millimeters` | Millimeters |  |
| 695 | apps/web/src/ui/AnnotationProps.tsx:286 | `Casas decimais` | rótulo de campo | P1 | `fld_decimals` | Decimal Places |  |
| 696 | apps/web/src/ui/AnnotationProps.tsx:287 | `Prefixo` | rótulo de campo | P1 | `fld_prefix` | Prefix |  |
| 697 | apps/web/src/ui/AnnotationProps.tsx:288 | `Sufixo` | rótulo de campo | P1 | `fld_suffix` | Suffix |  |
| 698 | apps/web/src/ui/AnnotationProps.tsx:289 | `Altura do texto` | rótulo de campo | P1 | `fld_text_height` | Text Size |  |
| 699 | apps/web/src/ui/AnnotationProps.tsx:290 | `Marca` | rótulo de campo | P1 | `fld_tick_mark` | Tick Mark |  |
| 700 | apps/web/src/ui/AnnotationProps.tsx:290 | `Traço` | opção de select | P1 | `opt_tick_slash` | Slash |  |
| 701 | apps/web/src/ui/AnnotationProps.tsx:290 | `Seta` | opção de select | P1 | `opt_tick_arrow` | Arrow |  |
| 702 | apps/web/src/ui/AnnotationProps.tsx:290 | `Ponto` | opção de select | P1 | `opt_tick_dot` | Dot |  |
| 703 | apps/web/src/ui/AnnotationProps.tsx:292 | `Cota da vista de corte: mede o par (t,z) gravado e não acompanha paredes.` | mensagem | P1 | `msg_section_dimension_hint` | Section view dimension: measures the stored (t,z) pair and does not follow walls. |  |
| 704 | apps/web/src/ui/AnnotationProps.tsx:292 | `Edite a Medida para mover as paredes associadas.` | mensagem | P1 | `msg_edit_measurement_hint` | Edit the Measurement to move the associated walls. |  |
| 705 | apps/web/src/ui/AnnotationProps.tsx:296 | `Linha de detalhe` | título de grupo | P1 | `pgrp_detail_line` | Detail Line |  |
| 706 | apps/web/src/ui/AnnotationProps.tsx:296 | `Traço` | rótulo de campo | P1 | `fld_line_style` | Line Style |  |
| 707 | apps/web/src/ui/AnnotationProps.tsx:296 | `Contínuo` | opção de select | P1 | `opt_continuous` | Continuous |  |
| 708 | apps/web/src/ui/AnnotationProps.tsx:296 | `Tracejado` | opção de select | P1 | `opt_dashed` | Dashed |  |
| 709 | apps/web/src/ui/AnnotationProps.tsx:296 | `Pontilhado` | opção de select | P1 | `opt_dotted` | Dotted |  |
| 710 | apps/web/src/ui/AnnotationProps.tsx:297 | `Região de detalhe` | título de grupo | P1 | `pgrp_detail_region` | Detail Region |  |
| 711 | apps/web/src/ui/AnnotationProps.tsx:297 | `Preenchimento` | rótulo de campo | P1 | `fld_fill` | Fill Pattern |  |
| 712 | apps/web/src/ui/AnnotationProps.tsx:297 | `Mascarar elementos` | caixa de seleção | P1 | `fld_mask_elements` | Mask Elements |  |
| 713 | apps/web/src/ui/AnnotationProps.tsx:298 | `Etiqueta` | título de grupo | P1 | `pgrp_tag` | Tag |  |
| 714 | apps/web/src/ui/AnnotationProps.tsx:298 | `Informação` | rótulo de campo | P1 | `fld_information` | Information |  |
| 715 | apps/web/src/ui/AnnotationProps.tsx:298 | `Tipo` | opção de select | P1 | `fld_type` | Type |  |
| 716 | apps/web/src/ui/AnnotationProps.tsx:298 | `Nome` | opção de select | P1 | `fld_name` | Name |  |
| 717 | apps/web/src/ui/AnnotationProps.tsx:298 | `Marca` | opção de select | P1 | `fld_mark` | Mark |  |
| 718 | apps/web/src/ui/AnnotationProps.tsx:298 | `Nível` | opção de select | P1 | `fld_level` | Level |  |
| 719 | apps/web/src/ui/AnnotationProps.tsx:298 | `Largura` | opção de select | P1 | `fld_width` | Width |  |
| 720 | apps/web/src/ui/AnnotationProps.tsx:298 | `Altura` | opção de select | P1 | `fld_height` | Height |  |
| 721 | apps/web/src/ui/AnnotationProps.tsx:298 | `Orientação` | rótulo de campo | P1 | `fld_orientation` | Orientation |  |
| 722 | apps/web/src/ui/AnnotationProps.tsx:298 | `Horizontal` | opção de select | P1 | `opt_horizontal` | Horizontal |  |
| 723 | apps/web/src/ui/AnnotationProps.tsx:298 | `Vertical` | opção de select | P1 | `opt_vertical` | Vertical |  |
| 724 | apps/web/src/ui/AnnotationProps.tsx:298 | `Mostrar líder` | caixa de seleção | P1 | `fld_show_leader` | Show Leader |  |
| 725 | apps/web/src/ui/AnnotationProps.tsx:306 | `Abra a vista para centralizar o texto.` | mensagem de status | P1 | `msg_open_view_to_center` | Open the view to center the text. |  |
| 726 | apps/web/src/ui/AnnotationProps.tsx:312 | `Texto` | título de grupo | P0 | `pgrp_text` | Text |  |
| 727 | apps/web/src/ui/AnnotationProps.tsx:313 | `Conteúdo` | rótulo de campo | P1 | `fld_content` | Content |  |
| 728 | apps/web/src/ui/AnnotationProps.tsx:316 | `Altura` | rótulo de campo | P1 | `fld_height` | Height |  |
| 729 | apps/web/src/ui/AnnotationProps.tsx:319 | `Largura da caixa` | rótulo de campo | P1 | `fld_box_width` | Box Width |  |
| 730 | apps/web/src/ui/AnnotationProps.tsx:320 | `Sem quebra` | placeholder | P1 | `ph_no_wrap` | No wrap |  |
| 731 | apps/web/src/ui/AnnotationProps.tsx:322 | `Rotação` | rótulo de campo | P1 | `fld_rotation` | Rotation |  |
| 732 | apps/web/src/ui/AnnotationProps.tsx:325 | `Moldura` | rótulo de campo | P1 | `fld_frame` | Border |  |
| 733 | apps/web/src/ui/AnnotationProps.tsx:328 | `Alinhamento` | rótulo de campo | P1 | `fld_alignment` | Alignment |  |
| 734 | apps/web/src/ui/AnnotationProps.tsx:328 | `Esquerda` | opção de select | P1 | `opt_left` | Left |  |
| 735 | apps/web/src/ui/AnnotationProps.tsx:328 | `Centro` | opção de select | P1 | `opt_center` | Center |  |
| 736 | apps/web/src/ui/AnnotationProps.tsx:328 | `Direita` | opção de select | P1 | `opt_right` | Right |  |
| 737 | apps/web/src/ui/AnnotationProps.tsx:329 | `Negrito` | caixa de seleção | P1 | `fld_bold` | Bold |  |
| 738 | apps/web/src/ui/AnnotationProps.tsx:330 | `Itálico` | caixa de seleção | P1 | `fld_italic` | Italic |  |
| 739 | apps/web/src/ui/AnnotationProps.tsx:331 | `Sublinhado` | caixa de seleção | P1 | `fld_underline` | Underline |  |
| 740 | apps/web/src/ui/AnnotationProps.tsx:332 | `Posição X` | rótulo de campo | P1 | `fld_position_x` | X Position |  |
| 741 | apps/web/src/ui/AnnotationProps.tsx:335 | `Posição Y` | rótulo de campo | P1 | `fld_position_y` | Y Position |  |
| 742 | apps/web/src/ui/AnnotationProps.tsx:338 | `Centralizar no ponto` | botão | P1 | `btn_center_at_point` | Center at Point |  |
| 743 | apps/web/src/ui/AnnotationProps.tsx:338 | `Move a caixa para o centro da vista ativa` | tooltip | P1 | `tip_center_in_view` | Moves the box to the center of the active view |  |
| 744 | apps/web/src/ui/AreaPlanProperties.tsx:23 | `Perfil da vista (planta de área)` | título de grupo | P0 | `pgrp_area_plan_profile` | View Profile (Area Plan) |  |
| 745 | apps/web/src/ui/AreaPlanProperties.tsx:24 | `Nome` | rótulo de campo | P0 | `fld_name` | Name |  |
| 746 | apps/web/src/ui/AreaPlanProperties.tsx:25 | `Renomear planta de área` | rótulo de desfazer | P2 | `undo_rename_area_plan` | Rename Area Plan |  |
| 747 | apps/web/src/ui/AreaPlanProperties.tsx:27 | `Escala` | rótulo de campo | P0 | `fld_scale` | Scale |  |
| 748 | apps/web/src/ui/AreaPlanProperties.tsx:28 | `Alterar escala da planta` | rótulo de desfazer | P2 | `undo_change_plan_scale` | Change Plan Scale |  |
| 749 | apps/web/src/ui/AreaPlanProperties.tsx:30 | `Ambientes` | rótulo de campo | P0 | `fld_rooms` | Rooms |  |
| 750 | apps/web/src/ui/AreaPlanProperties.tsx:30 | `${n} no nível` | mensagem | P1 | `msg_n_in_level` | {n} in level |  |
| 751 | apps/web/src/ui/AreaPlanProperties.tsx:33 | `Desenho` | título de grupo | P1 | `pgrp_drawing` | Drawing |  |
| 752 | apps/web/src/ui/AreaPlanProperties.tsx:34 | `Paredes` | rótulo de campo | P1 | `fld_walls_display` | Walls |  |
| 753 | apps/web/src/ui/AreaPlanProperties.tsx:36 | `Claras` | opção de select | P1 | `opt_walls_light` | Light |  |
| 754 | apps/web/src/ui/AreaPlanProperties.tsx:37 | `Normais` | opção de select | P1 | `opt_walls_normal` | Normal |  |
| 755 | apps/web/src/ui/AreaPlanProperties.tsx:38 | `Ocultas` | opção de select | P1 | `opt_walls_hidden` | Hidden |  |
| 756 | apps/web/src/ui/AreaPlanProperties.tsx:41 | `Linhas de referência` | rótulo de campo | P1 | `fld_reference_lines` | Reference Lines |  |
| 757 | apps/web/src/ui/AreaPlanProperties.tsx:43 | `Sempre` | opção de select | P1 | `opt_always` | Always |  |
| 758 | apps/web/src/ui/AreaPlanProperties.tsx:44 | `Só no selecionado` | opção de select | P1 | `opt_selected_only` | Selected Only |  |
| 759 | apps/web/src/ui/AreaPlanProperties.tsx:45 | `Nunca` | opção de select | P1 | `opt_never` | Never |  |
| 760 | apps/web/src/ui/AreaPlanProperties.tsx:48 | `Contorno` | rótulo de campo | P1 | `fld_outline` | Outline |  |
| 761 | apps/web/src/ui/AreaPlanProperties.tsx:50 | `Sem contorno` | opção de select | P1 | `opt_no_outline` | No Outline |  |
| 762 | apps/web/src/ui/AreaPlanProperties.tsx:51 | `Fino` | opção de select | P1 | `opt_thin` | Thin |  |
| 763 | apps/web/src/ui/AreaPlanProperties.tsx:52 | `Tracejado` | opção de select | P1 | `opt_dashed` | Dashed |  |
| 764 | apps/web/src/ui/AreaPlanProperties.tsx:55 | `Conteúdo do rótulo` | rótulo de campo | P1 | `fld_tag_content` | Tag Content |  |
| 765 | apps/web/src/ui/AreaPlanProperties.tsx:65 | `Nome, número e área` | opção de select | P1 | `opt_tag_name_number_area` | Name, Number and Area |  |
| 766 | apps/web/src/ui/AreaPlanProperties.tsx:66 | `Nome e área` | opção de select | P1 | `opt_tag_name_area` | Name and Area |  |
| 767 | apps/web/src/ui/AreaPlanProperties.tsx:67 | `Nome e número` | opção de select | P1 | `opt_tag_name_number` | Name and Number |  |
| 768 | apps/web/src/ui/AreaPlanProperties.tsx:68 | `Só o nome` | opção de select | P1 | `opt_tag_name_only` | Name Only |  |
| 769 | apps/web/src/ui/AreaPlanProperties.tsx:69 | `Nome, área e perímetro` | opção de select | P1 | `opt_tag_name_area_perimeter` | Name, Area and Perimeter |  |
| 770 | apps/web/src/ui/AreaPlanProperties.tsx:74 | `Vista e anotações` | título de grupo | P1 | `pgrp_view_annotations` | View and Annotations |  |
| 771 | apps/web/src/ui/AreaPlanProperties.tsx:75 | `Mostrar aberturas` | rótulo de campo | P1 | `fld_show_openings` | Show Openings |  |
| 772 | apps/web/src/ui/AreaPlanProperties.tsx:76 | `Mostrar eixos` | rótulo de campo | P1 | `fld_show_grids` | Show Grids |  |
| 773 | apps/web/src/ui/AreaPlanProperties.tsx:77 | `Mostrar marcas de corte` | rótulo de campo | P1 | `fld_show_section_marks` | Show Section Marks |  |
| 774 | apps/web/src/ui/AreaPlanProperties.tsx:78 | `Mostrar cotas` | rótulo de campo | P1 | `fld_show_dimensions` | Show Dimensions |  |
| 775 | apps/web/src/ui/AreaPlanProperties.tsx:79 | `Mostrar anotações do nível` | rótulo de campo | P1 | `fld_show_level_annotations` | Show Level Annotations |  |
| 776 | apps/web/src/ui/AreaPlanProperties.tsx:80 | `Mostrar piso/laje` | rótulo de campo | P1 | `fld_show_floors` | Show Floors/Slabs |  |
| 777 | apps/web/src/ui/AreaPlanProperties.tsx:81 | `Mostrar escadas e rampas` | rótulo de campo | P1 | `fld_show_stairs_ramps` | Show Stairs and Ramps |  |
| 778 | apps/web/src/ui/AreaPlanProperties.tsx:82 | `Mostrar telhados (projeção)` | rótulo de campo | P1 | `fld_show_roofs_projection` | Show Roofs (Projection) |  |
| 779 | apps/web/src/ui/AreaPlanProperties.tsx:83 | `Mostrar objetos importados` | rótulo de campo | P1 | `fld_show_imported_objects` | Show Imported Objects |  |
| 780 | apps/web/src/ui/AreaPlanProperties.tsx:84 | `Subpavimento` | rótulo de campo | P1 | `fld_underlay` | Underlay |  |
| 781 | apps/web/src/ui/AreaPlanProperties.tsx:86 | `Cotas automáticas…` | botão | P1 | `btn_auto_dimensions` | Auto Dimensions… |  |
| 782 | apps/web/src/ui/AreaPlanProperties.tsx:92 | `${n} anotação(ões) copiada(s) do nível.` | mensagem de status | P1 | `msg_annotations_copied` | {n} annotation(s) copied from the level. | pluralização improvisada com "(ões)" |
| 783 | apps/web/src/ui/AreaPlanProperties.tsx:92 | `O nível não tem anotações para copiar.` | mensagem de status | P1 | `msg_no_level_annotations` | The level has no annotations to copy. |  |
| 784 | apps/web/src/ui/AreaPlanProperties.tsx:95 | `Copiar anotações do nível` | botão | P1 | `btn_copy_level_annotations` | Copy Level Annotations |  |
| 785 | apps/web/src/ui/AreaPlanProperties.tsx:99 | `${n} anotação(ões) nesta vista.` | mensagem | P1 | `msg_annotations_in_view` | {n} annotation(s) in this view. | pluralização improvisada |
| 786 | apps/web/src/ui/AreaPlanProperties.tsx:99 | `Sem anotações próprias: a vista usa as do nível.` | mensagem | P1 | `msg_no_own_annotations` | No annotations of its own: the view uses the level annotations. |  |
| 787 | apps/web/src/ui/AreaPlanProperties.tsx:99 | `Sem anotações nesta vista.` | mensagem | P1 | `msg_no_annotations_in_view` | No annotations in this view. |  |
| 788 | apps/web/src/ui/AreaPlanProperties.tsx:100 | `Cotas, textos, detalhes e etiquetas ficam presos a esta planta e não vazam para a planta de piso.` | mensagem | P1 | `msg_annotation_scope` | Dimensions, text, details and tags stay in this plan and do not leak into the floor plan. |  |
| 789 | apps/web/src/ui/AreaPlanProperties.tsx:104 | `Cor (opcional)` | título de grupo | P1 | `pgrp_color_optional` | Color (Optional) |  |
| 790 | apps/web/src/ui/AreaPlanProperties.tsx:105 | `Sem esquema, a planta fica em preto e branco. A cor entra só depois de configurar.` | mensagem | P1 | `msg_no_color_scheme` | Without a scheme, the plan is black and white. Color appears only after configuration. |  |
| 791 | apps/web/src/ui/AreaPlanProperties.tsx:107 | `Por categoria` | botão | P1 | `btn_by_category` | By Category |  |
| 792 | apps/web/src/ui/AreaPlanProperties.tsx:108 | `Por nível` | botão | P1 | `btn_by_level` | By Level |  |
| 793 | apps/web/src/ui/AreaPlanProperties.tsx:109 | `Por faixa` | botão | P1 | `btn_by_range` | By Range |  |
| 794 | apps/web/src/ui/AreaPlanProperties.tsx:110 | `Sem cor` | botão | P1 | `btn_no_color` | No Color |  |
| 795 | apps/web/src/ui/AreaPlanProperties.tsx:113 | `Gerenciar categorias…` | botão | P1 | `btn_manage_categories` | Manage Categories… |  |
| 796 | apps/web/src/ui/AreaPlanProperties.tsx:116 | `Preenchimento` | rótulo de campo | P1 | `fld_fill` | Fill Pattern |  |
| 797 | apps/web/src/ui/AreaPlanProperties.tsx:118 | `Sem preenchimento` | opção de select | P1 | `opt_no_fill` | No Fill |  |
| 798 | apps/web/src/ui/AreaPlanProperties.tsx:119 | `Cor do esquema` | opção de select | P1 | `opt_scheme_color` | Scheme Color |  |
| 799 | apps/web/src/ui/AreaPlanProperties.tsx:120 | `Hachura (P&B)` | opção de select | P1 | `opt_hatch_bw` | Hatch (B&W) |  |
| 800 | apps/web/src/ui/AreaPlanProperties.tsx:126 | `Rótulos` | título de grupo | P1 | `pgrp_labels` | Labels |  |
| 801 | apps/web/src/ui/AreaPlanProperties.tsx:128 | `Recentralizar rótulos` | botão | P1 | `btn_recenter_labels` | Recenter Labels |  |
| 802 | apps/web/src/ui/AreaPlanProperties.tsx:128 | `${n} rótulo(s) recentralizado(s).` | mensagem de status | P1 | `msg_labels_recentered` | {n} label(s) recentered. | pluralização improvisada |
| 803 | apps/web/src/ui/AreaPlanProperties.tsx:128 | `Nenhum rótulo para recentralizar.` | mensagem de status | P1 | `msg_no_labels_to_recenter` | No labels to recenter. |  |
| 804 | apps/web/src/ui/AreaPlanProperties.tsx:130 | `Todo ambiente com circuito fechado já aparece com rótulo, sem precisar gerar. Arraste o rótulo e a chamada acompanha; a posição vale em todas as vistas.` | mensagem | P1 | `msg_room_label_hint` | Every room with a closed loop already shows a label; no generation needed. Drag the label and the leader follows; the position applies to all views. |  |
| 805 | apps/web/src/ui/SectionViewProps.tsx:32 | `Elevação` | valor | P0 | `view_elevation` | Elevation |  |
| 806 | apps/web/src/ui/SectionViewProps.tsx:32 | `Corte` | valor | P0 | `view_section` | Section |  |
| 807 | apps/web/src/ui/SectionViewProps.tsx:42 | `Dados de identidade` | título de grupo | P0 | `pgrp_identity` | Identity Data |  |
| 808 | apps/web/src/ui/SectionViewProps.tsx:43 | `Tipo` | rótulo de campo | P0 | `fld_type` | Type |  |
| 809 | apps/web/src/ui/SectionViewProps.tsx:44 | `Papel` | rótulo de campo | P1 | `fld_role` | Role | valor vem de SECTION_ROLE_LABEL |
| 810 | apps/web/src/ui/SectionViewProps.tsx:45 | `Nome` | rótulo de campo | P0 | `fld_name` | Name |  |
| 811 | apps/web/src/ui/SectionViewProps.tsx:48 | `Número` | rótulo de campo | P1 | `fld_number` | Number |  |
| 812 | apps/web/src/ui/SectionViewProps.tsx:49 | `Ex.: A` | placeholder | P1 | `ph_example_a` | e.g. A |  |
| 813 | apps/web/src/ui/SectionViewProps.tsx:51 | `Título` | rótulo de campo | P1 | `fld_title` | Title |  |
| 814 | apps/web/src/ui/SectionViewProps.tsx:52 | `Título na prancha` | placeholder | P1 | `ph_title_on_sheet` | Title on sheet |  |
| 815 | apps/web/src/ui/SectionViewProps.tsx:54 | `Rótulo` | rótulo de campo | P1 | `fld_label` | Label |  |
| 816 | apps/web/src/ui/SectionViewProps.tsx:55 | `Texto da marca` | placeholder | P1 | `ph_mark_text` | Mark text |  |
| 817 | apps/web/src/ui/SectionViewProps.tsx:59 | `Geometria` | título de grupo | P1 | `pgrp_geometry` | Geometry |  |
| 818 | apps/web/src/ui/SectionViewProps.tsx:60 | `Profundidade` | rótulo de campo | P1 | `fld_depth` | Depth |  |
| 819 | apps/web/src/ui/SectionViewProps.tsx:63 | `Início X` | rótulo de campo | P1 | `fld_start_x` | Start X |  |
| 820 | apps/web/src/ui/SectionViewProps.tsx:66 | `Início Y` | rótulo de campo | P1 | `fld_start_y` | Start Y |  |
| 821 | apps/web/src/ui/SectionViewProps.tsx:69 | `Fim X` | rótulo de campo | P1 | `fld_end_x` | End X |  |
| 822 | apps/web/src/ui/SectionViewProps.tsx:72 | `Fim Y` | rótulo de campo | P1 | `fld_end_y` | End Y |  |
| 823 | apps/web/src/ui/SectionViewProps.tsx:75 | `Sentido` | rótulo de campo | P1 | `fld_direction` | Direction |  |
| 824 | apps/web/src/ui/SectionViewProps.tsx:76 | `Inverter direção` | botão | P1 | `btn_invert_direction` | Flip Direction |  |
| 825 | apps/web/src/ui/SectionViewProps.tsx:80 | `Marca` | título de grupo | P1 | `pgrp_mark` | Mark |  |
| 826 | apps/web/src/ui/SectionViewProps.tsx:81 | `Visível` | rótulo de campo | P1 | `fld_visible` | Visible |  |
| 827 | apps/web/src/ui/SectionViewProps.tsx:84 | `Setas` | rótulo de campo | P1 | `fld_arrows` | Arrows |  |
| 828 | apps/web/src/ui/SectionViewProps.tsx:87 | `Rótulo na marca` | rótulo de campo | P1 | `fld_label_on_mark` | Label on Mark |  |
| 829 | apps/web/src/ui/SectionViewProps.tsx:90 | `Posição` | rótulo de campo | P1 | `fld_position` | Position |  |
| 830 | apps/web/src/ui/SectionViewProps.tsx:92 | `Nas duas pontas` | opção de select | P1 | `opt_both_ends` | At Both Ends |  |
| 831 | apps/web/src/ui/SectionViewProps.tsx:93 | `Só no início` | opção de select | P1 | `opt_start_only` | At Start Only |  |
| 832 | apps/web/src/ui/SectionViewProps.tsx:94 | `Só no fim` | opção de select | P1 | `opt_end_only` | At End Only |  |
| 833 | apps/web/src/ui/SectionViewProps.tsx:95 | `No meio` | opção de select | P1 | `opt_middle` | In the Middle |  |
| 834 | apps/web/src/ui/SectionViewProps.tsx:98 | `Traço` | rótulo de campo | P1 | `fld_line_style` | Line Style |  |
| 835 | apps/web/src/ui/SectionViewProps.tsx:100 | `Traço-ponto` | opção de select | P1 | `opt_dash_dot` | Dash Dot |  |
| 836 | apps/web/src/ui/SectionViewProps.tsx:101 | `Contínuo` | opção de select | P1 | `opt_continuous` | Continuous |  |
| 837 | apps/web/src/ui/SectionViewProps.tsx:102 | `Tracejado` | opção de select | P1 | `opt_dashed` | Dashed |  |
| 838 | apps/web/src/ui/SectionViewProps.tsx:105 | `Seta (mm)` | rótulo de campo | P1 | `fld_arrow_mm` | Arrow (mm) | unidade fixa no rótulo |
| 839 | apps/web/src/ui/SectionViewProps.tsx:108 | `Texto (mm)` | rótulo de campo | P1 | `fld_text_mm` | Text (mm) |  |
| 840 | apps/web/src/ui/SectionViewProps.tsx:111 | `Desloc. X` | rótulo de campo | P1 | `fld_offset_x` | X Offset |  |
| 841 | apps/web/src/ui/SectionViewProps.tsx:114 | `Desloc. Y` | rótulo de campo | P1 | `fld_offset_y` | Y Offset |  |
| 842 | apps/web/src/ui/SectionViewProps.tsx:119 | `Associação` | título de grupo | P1 | `pgrp_association` | Association |  |
| 843 | apps/web/src/ui/SectionViewProps.tsx:120 | `Extremidade A` | rótulo de campo | P1 | `fld_end_a` | End A |  |
| 844 | apps/web/src/ui/SectionViewProps.tsx:120 | `Presa à parede` | valor | P1 | `opt_attached_to_wall` | Attached to Wall |  |
| 845 | apps/web/src/ui/SectionViewProps.tsx:120 | `Livre` | valor | P1 | `opt_free` | Free |  |
| 846 | apps/web/src/ui/SectionViewProps.tsx:121 | `Extremidade B` | rótulo de campo | P1 | `fld_end_b` | End B |  |
| 847 | apps/web/src/ui/SectionViewProps.tsx:123 | `Referências` | rótulo de campo | P1 | `fld_references` | References |  |
| 848 | apps/web/src/ui/SectionViewProps.tsx:124 | `Soltar` | botão | P1 | `btn_detach_refs` | Detach |  |
| 849 | apps/web/src/ui/CadProps.tsx:18 | `Nome` | rótulo de campo | P1 | `fld_name` | Name |  |
| 850 | apps/web/src/ui/CadProps.tsx:22 | `Renomear CAD` | rótulo de desfazer | P2 | `undo_rename_cad` | Rename CAD |  |
| 851 | apps/web/src/ui/CadProps.tsx:25 | `Nível` | rótulo de campo | P1 | `fld_level` | Level |  |
| 852 | apps/web/src/ui/CadProps.tsx:26 | `Visível` | rótulo de campo | P1 | `fld_visible` | Visible |  |
| 853 | apps/web/src/ui/CadProps.tsx:29 | `Visível ${nome}` | aria-label | P2 | `aria_visible_name` | Visible {name} |  |
| 854 | apps/web/src/ui/CadProps.tsx:31 | `Visibilidade do CAD` | rótulo de desfazer | P2 | `undo_cad_visibility` | CAD Visibility |  |
| 855 | apps/web/src/ui/CadProps.tsx:34 | `Deslocamento (m)` | rótulo de campo | P1 | `fld_offset_m` | Offset (m) | unidade fixa "m" no rótulo, mas o campo usa quantity length |
| 856 | apps/web/src/ui/CadProps.tsx:39 | `Deslocamento do CAD` | rótulo de desfazer | P2 | `undo_cad_offset` | CAD Offset |  |
| 857 | apps/web/src/ui/CadProps.tsx:42 | `Camadas` | rótulo de campo | P1 | `fld_layers` | Layers |  |
| 858 | apps/web/src/ui/CadProps.tsx:43 | `Traços` | rótulo de campo | P1 | `fld_paths` | Paths |  |
| 859 | apps/web/src/ui/CadProps.tsx:44 | `Textos` | rótulo de campo | P1 | `fld_texts` | Texts |  |
| 860 | apps/web/src/ui/CadProps.tsx:45 | `Unidade de origem` | rótulo de campo | P1 | `fld_source_unit` | Source Unit |  |
| 861 | apps/web/src/ui/CadProps.tsx:46 | `Captura` | rótulo de campo | P1 | `fld_snapping` | Snapping |  |
| 862 | apps/web/src/ui/CadProps.tsx:47 | `Linhas e vértices (Snap → CAD importado)` | mensagem | P1 | `msg_cad_snapping` | Lines and vertices (Snap → Imported CAD) |  |
| 863 | apps/web/src/ui/CadProps.tsx:49 | `Ações` | rótulo de campo | P1 | `fld_actions` | Actions |  |
| 864 | apps/web/src/ui/CadProps.tsx:51 | `Enquadrar` | botão | P1 | `btn_zoom_to_fit` | Zoom to Fit |  |
| 865 | apps/web/src/ui/CadProps.tsx:52 | `Excluir` | botão | P1 | `btn_delete` | Delete |  |
| 866 | apps/web/src/ui/LevelProps.tsx:35 | `Nível` | título de grupo | P0 | `pgrp_level` | Level |  |
| 867 | apps/web/src/ui/LevelProps.tsx:36 | `Nome` | rótulo de campo | P0 | `fld_name` | Name |  |
| 868 | apps/web/src/ui/LevelProps.tsx:39 | `Elevação` | rótulo de campo | P0 | `fld_elevation` | Elevation |  |
| 869 | apps/web/src/ui/LevelProps.tsx:42 | `Mover a elevação move junto todos os elementos do nível. Escadas e rampas ligadas ao nível são reajustadas automaticamente.` | mensagem | P1 | `msg_level_elevation_hint` | Moving the elevation moves every element on the level. Stairs and ramps attached to the level are adjusted automatically. |  |
| 870 | apps/web/src/ui/LevelProps.tsx:43 | `Δ abaixo` | rótulo de campo | P1 | `fld_delta_below` | Δ Below |  |
| 871 | apps/web/src/ui/LevelProps.tsx:44 | `Δ acima` | rótulo de campo | P1 | `fld_delta_above` | Δ Above |  |
| 872 | apps/web/src/ui/LevelProps.tsx:47 | `Gerenciar níveis…` | botão | P1 | `btn_manage_levels` | Manage Levels… |  |
| 873 | apps/web/src/ui/GenericProps.tsx:17 | `variados` | valor | P1 | `opt_varied` | Varies |  |
| 874 | apps/web/src/ui/GenericProps.tsx:50 | `Sim` | valor | P1 | `opt_yes` | Yes |  |
| 875 | apps/web/src/ui/GenericProps.tsx:50 | `Não` | valor | P1 | `opt_no` | No |  |
| 876 | apps/web/src/ui/GenericProps.tsx:74 | `Grade ${nome}` | texto do cabeçalho | P1 | `msg_grid_name` | Grid {name} |  |
| 877 | apps/web/src/ui/GenericProps.tsx:86 | `${tipo} ${nome}` | texto do cabeçalho | P1 | `msg_view_name` | {type} {name} | tipo = Elevação/Corte |
| 878 | apps/web/src/ui/GenericProps.tsx:87 | `Vista` | texto do cabeçalho | P1 | `msg_view` | View |  |
| 879 | apps/web/src/ui/GenericProps.tsx:103 | `Objeto importado` | título de grupo | P1 | `pgrp_imported_object` | Imported Object |  |
| 880 | apps/web/src/ui/GenericProps.tsx:104 | `Classe IFC` | rótulo de campo | P1 | `fld_ifc_class` | IFC Class |  |
| 881 | apps/web/src/ui/GenericProps.tsx:105 | `Tipo predefinido` | rótulo de campo | P1 | `fld_predefined_type` | Predefined Type |  |
| 882 | apps/web/src/ui/GenericProps.tsx:106 | `Tipo de objeto` | rótulo de campo | P1 | `fld_object_type` | Object Type |  |
| 883 | apps/web/src/ui/GenericProps.tsx:115 | `Nível` | rótulo de campo | P1 | `fld_level` | Level |  |
| 884 | apps/web/src/ui/GenericProps.tsx:116 | `Triângulos` | rótulo de campo | P1 | `fld_triangles` | Triangles |  |
| 885 | apps/web/src/ui/GenericProps.tsx:117 | `Volume indicativo` | rótulo de campo | P1 | `fld_indicative_volume` | Indicative Volume |  |
| 886 | apps/web/src/ui/GenericProps.tsx:117 | `Volume` | rótulo de campo | P1 | `fld_volume` | Volume |  |
| 887 | apps/web/src/ui/GenericProps.tsx:118 | `Área` | rótulo de campo | P1 | `fld_area` | Area |  |
| 888 | apps/web/src/ui/GenericProps.tsx:127 | `+${n} propriedades IFC não exibidas` | mensagem | P1 | `msg_ifc_props_hidden` | +{n} IFC properties not shown |  |
| 889 | apps/web/src/ui/ToolTypeProps.tsx:12 | `Colocar Parede` | rótulo de categoria | P0 | `place_wall` | Place Wall | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 890 | apps/web/src/ui/ToolTypeProps.tsx:13 | `Colocar Porta` | rótulo de categoria | P0 | `place_door` | Place Door | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 891 | apps/web/src/ui/ToolTypeProps.tsx:14 | `Colocar Janela` | rótulo de categoria | P0 | `place_window` | Place Window | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 892 | apps/web/src/ui/ToolTypeProps.tsx:15 | `Colocar Piso` | rótulo de categoria | P0 | `place_floor` | Place Floor | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 893 | apps/web/src/ui/ToolTypeProps.tsx:16 | `Colocar Laje` | rótulo de categoria | P0 | `place_slab` | Place Slab | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 894 | apps/web/src/ui/ToolTypeProps.tsx:17 | `Colocar Forro` | rótulo de categoria | P0 | `place_ceiling` | Place Ceiling | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 895 | apps/web/src/ui/ToolTypeProps.tsx:18 | `Colocar Telhado` | rótulo de categoria | P0 | `place_roof` | Place Roof | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 896 | apps/web/src/ui/ToolTypeProps.tsx:19 | `Colocar Telhado por extrusão` | rótulo de categoria | P0 | `place_roof_extrusion` | Place Roof by Extrusion | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 897 | apps/web/src/ui/ToolTypeProps.tsx:20 | `Colocar Escada (croqui)` | rótulo de categoria | P0 | `place_stair_sketch` | Place Stair by Sketch | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 898 | apps/web/src/ui/ToolTypeProps.tsx:21 | `Colocar Escada` | rótulo de categoria | P0 | `place_stair` | Place Stair | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 899 | apps/web/src/ui/ToolTypeProps.tsx:22 | `Colocar Rampa` | rótulo de categoria | P0 | `place_ramp` | Place Ramp | TOOL_TYPE_LABEL fixo em PT; deveria usar toolLabel/TOOL_LABEL com lang |
| 900 | apps/web/src/ui/ToolTypeProps.tsx:41 | `Tipo de parede` | rótulo do seletor de tipo | P0 | `prop_type_wall` | Wall Type |  |
| 901 | apps/web/src/ui/ToolTypeProps.tsx:46 | `Tipo de abertura` | rótulo do seletor de tipo | P0 | `prop_type_opening` | Opening Type |  |
| 902 | apps/web/src/ui/ToolTypeProps.tsx:51 | `Tipo de abertura` | rótulo do seletor de tipo | P0 | `prop_type_opening` | Opening Type |  |
| 903 | apps/web/src/ui/ToolTypeProps.tsx:56 | `Tipo de piso` | rótulo do seletor de tipo | P0 | `prop_type_floor` | Floor Type |  |
| 904 | apps/web/src/ui/ToolTypeProps.tsx:61 | `Tipo de laje` | rótulo do seletor de tipo | P0 | `prop_type_slab` | Slab Type |  |
| 905 | apps/web/src/ui/ToolTypeProps.tsx:66 | `Tipo de forro` | rótulo do seletor de tipo | P0 | `prop_type_ceiling` | Ceiling Type |  |
| 906 | apps/web/src/ui/ToolTypeProps.tsx:72 | `Tipo de telhado` | rótulo do seletor de tipo | P0 | `prop_type_roof` | Roof Type |  |
| 907 | apps/web/src/ui/ToolTypeProps.tsx:78 | `Tipo de escada` | rótulo do seletor de tipo | P0 | `prop_type_stair` | Stair Type |  |
| 908 | apps/web/src/ui/ToolTypeProps.tsx:88 | `Tipo de escada` | rótulo do seletor de tipo | P0 | `prop_type_stair` | Stair Type |  |
| 909 | apps/web/src/ui/ToolTypeProps.tsx:96 | `Tipo de rampa` | rótulo do seletor de tipo | P0 | `prop_type_ramp` | Ramp Type |  |
| 910 | apps/web/src/ui/RoofMansardProps.tsx:25 | `Mansarda` | título de grupo | P1 | `pgrp_mansard` | Mansard |  |
| 911 | apps/web/src/ui/RoofMansardProps.tsx:26 | `Mansarda` | rótulo de campo | P1 | `fld_mansard` | Mansard |  |
| 912 | apps/web/src/ui/RoofMansardProps.tsx:28 | `Duas faixas por água` | caixa de seleção | P1 | `fld_two_bands_per_plane` | Two Bands per Plane |  |
| 913 | apps/web/src/ui/RoofMansardProps.tsx:33 | `Inclinação de baixo` | rótulo de campo | P1 | `fld_lower_slope` | Lower Slope |  |
| 914 | apps/web/src/ui/RoofMansardProps.tsx:36 | `Inclinação de cima` | rótulo de campo | P1 | `fld_upper_slope` | Upper Slope |  |
| 915 | apps/web/src/ui/RoofMansardProps.tsx:39 | `Largura da faixa de baixo` | rótulo de campo | P1 | `fld_lower_band_width` | Lower Band Width |  |
| 916 | apps/web/src/ui/RoofPlanesProps.tsx:38 | `Águas (${n})` | título de grupo | P1 | `pgrp_roof_planes` | Roof Planes ({n}) |  |
| 917 | apps/web/src/ui/RoofPlanesProps.tsx:39 | `Sem águas: o telhado precisa de ao menos uma. Acrescente uma água abaixo.` | mensagem | P1 | `msg_no_roof_planes` | No planes: the roof needs at least one. Add a plane below. |  |
| 918 | apps/web/src/ui/RoofPlanesProps.tsx:42 | `Água ${n} inclinação` | rótulo de campo | P1 | `fld_plane_slope` | Plane {n} Slope |  |
| 919 | apps/web/src/ui/RoofPlanesProps.tsx:45 | `Água ${n} subida` | rótulo de campo | P1 | `fld_plane_rise` | Plane {n} Rise |  |
| 920 | apps/web/src/ui/RoofPlanesProps.tsx:49 | `Excluir água ${n}` | aria-label | P2 | `aria_delete_plane` | Delete plane {n} |  |
| 921 | apps/web/src/ui/RoofPlanesProps.tsx:50 | `Excluir água ${n}` | botão | P1 | `btn_delete_plane` | Delete Plane {n} |  |
| 922 | apps/web/src/ui/RoofPlanesProps.tsx:56 | `+ água` | botão | P1 | `btn_add_plane` | + Plane |  |
| 923 | apps/web/src/ui/RoofPlanesProps.tsx:58 | `Cada água cobre o contorno inteiro: águas acrescentadas se sobrepõem às outras, então exclua as que não quiser.` | mensagem | P1 | `msg_roof_planes_hint` | Each plane covers the entire outline: added planes overlap the others, so delete the ones you do not want. |  |
| 924 | apps/web/src/ui/GridProperties.tsx:21 | `Operação recusada.` | mensagem de status | P1 | `msg_operation_refused` | Operation refused. |  |
| 925 | apps/web/src/ui/GridProperties.tsx:26 | `Grade` | título de grupo | P1 | `pgrp_grid` | Grid |  |
| 926 | apps/web/src/ui/GridProperties.tsx:27 | `Nome` | rótulo de campo | P1 | `fld_name` | Name |  |
| 927 | apps/web/src/ui/GridProperties.tsx:28 | `Renomear grade` | rótulo de desfazer | P2 | `undo_rename_grid` | Rename Grid |  |
| 928 | apps/web/src/ui/GridProperties.tsx:30 | `Tipo` | rótulo de campo | P1 | `fld_type` | Type |  |
| 929 | apps/web/src/ui/GridProperties.tsx:31 | `Trocar tipo de grade` | rótulo de desfazer | P2 | `undo_change_grid_type` | Change Grid Type |  |
| 930 | apps/web/src/ui/GridProperties.tsx:35 | `Bolha no início` | rótulo de campo | P1 | `fld_bubble_start` | Bubble at Start |  |
| 931 | apps/web/src/ui/GridProperties.tsx:35 | `Bolha no início da grade` | rótulo de desfazer | P2 | `undo_bubble_start` | Grid Bubble at Start |  |
| 932 | apps/web/src/ui/GridProperties.tsx:36 | `Bolha no fim` | rótulo de campo | P1 | `fld_bubble_end` | Bubble at End |  |
| 933 | apps/web/src/ui/GridProperties.tsx:36 | `Bolha no fim da grade` | rótulo de desfazer | P2 | `undo_bubble_end` | Grid Bubble at End |  |
| 934 | apps/web/src/ui/GridProperties.tsx:37 | `Editar tipo…` | botão | P1 | `btn_edit_type` | Edit Type… |  |
| 935 | apps/web/src/ui/GridProperties.tsx:39 | `Geometria` | título de grupo | P1 | `pgrp_geometry` | Geometry |  |
| 936 | apps/web/src/ui/GridProperties.tsx:40 | `Pontos` | rótulo de campo | P1 | `fld_points` | Points |  |
| 937 | apps/web/src/ui/GridProperties.tsx:41 | `Flecha do arco` | rótulo de campo | P1 | `fld_arc_sag` | Arc Sag |  |
| 938 | apps/web/src/ui/GridProperties.tsx:42 | `Segmento central` | rótulo de campo | P1 | `fld_center_segment` | Center Segment |  |
| 939 | apps/web/src/ui/GridProperties.tsx:42 | `Contínuo` | valor | P1 | `opt_continuous` | Continuous |  |
| 940 | apps/web/src/ui/GridProperties.tsx:42 | `Só as pontas` | valor | P1 | `opt_ends_only` | Ends Only |  |
| 941 | apps/web/src/ui/GridProperties.tsx:42 | `Personalizado` | valor | P1 | `opt_custom` | Custom |  |
| 942 | apps/web/src/ui/LevelMoveConflictDialog.tsx:45 | `Nível` | título de diálogo | P1 | `fld_level` | Level |  |
| 943 | apps/web/src/ui/LevelMoveConflictDialog.tsx:45 | `Fechar` | botão | P1 | `btn_close` | Close |  |
| 944 | apps/web/src/ui/LevelMoveConflictDialog.tsx:46 | `Não foi possível planejar a mudança de nível.` | mensagem de erro | P1 | `msg_level_move_plan_failed` | Could not plan the level change. |  |
| 945 | apps/web/src/ui/LevelMoveConflictDialog.tsx:53 | `Escada/rampa não cabe no nível novo` | título de diálogo | P1 | `msg_stair_ramp_does_not_fit` | Stair/ramp does not fit in the new level |  |
| 946 | apps/web/src/ui/LevelMoveConflictDialog.tsx:53 | `Confirmar o reajuste da escada` | título de diálogo | P1 | `msg_confirm_stair_adjust` | Confirm Stair Adjustment |  |
| 947 | apps/web/src/ui/LevelMoveConflictDialog.tsx:59 | `Cancelar a mudança` | botão | P1 | `btn_cancel_change` | Cancel Change |  |
| 948 | apps/web/src/ui/LevelMoveConflictDialog.tsx:66 | `Excluir ${itens}? A cota do nível será aplicada e a exclusão entra no mesmo Ctrl+Z.` | confirmação | P1 | `msg_confirm_delete_conflicts` | Delete {items}? The level elevation will be applied and the deletion goes into the same Undo. | window.confirm em PT |
| 949 | apps/web/src/ui/LevelMoveConflictDialog.tsx:69 | `Excluir o elemento` | botão | P1 | `btn_delete_element` | Delete Element |  |
| 950 | apps/web/src/ui/LevelMoveConflictDialog.tsx:72 | `Aplica a cota e o reajuste mostrado no resumo (degraus acrescentados no último lance ou removidos do fim)` | tooltip | P1 | `tip_apply_level_move` | Applies the elevation and the adjustment shown in the summary (risers added to the last run or removed from the end) |  |
| 951 | apps/web/src/ui/LevelMoveConflictDialog.tsx:72 | `Esta escada não pode ser reajustada automaticamente` | tooltip | P1 | `tip_stair_cannot_adjust` | This stair cannot be adjusted automatically |  |
| 952 | apps/web/src/ui/LevelMoveConflictDialog.tsx:73 | `Aplicar` | botão | P1 | `btn_apply` | Apply |  |
| 953 | apps/web/src/ui/LevelMoveConflictDialog.tsx:80 | `Um elemento não cabe` | mensagem | P1 | `msg_one_element_does_not_fit` | One element does not fit |  |
| 954 | apps/web/src/ui/LevelMoveConflictDialog.tsx:80 | `${n} elementos não cabem` | mensagem | P1 | `msg_n_elements_do_not_fit` | {n} elements do not fit |  |
| 955 | apps/web/src/ui/LevelMoveConflictDialog.tsx:80 | `na altura nova sem sair da faixa de espelho do tipo ou sem invadir o que está em volta.` | mensagem | P1 | `msg_does_not_fit_reason` | at the new height without leaving the type riser range or without clashing with surrounding elements. |  |
| 956 | apps/web/src/ui/LevelMoveConflictDialog.tsx:81 | `O reajuste muda o nº de degraus ou o patamar de uma escada.` | mensagem | P1 | `msg_adjust_changes_stair` | The adjustment changes the riser count or the landing of a stair. |  |
| 957 | apps/web/src/ui/LevelMoveConflictDialog.tsx:82 | `A cota do nível ainda não foi alterada` | mensagem | P1 | `msg_level_not_changed_yet` | The level elevation has not been changed yet |  |
| 958 | apps/web/src/ui/LevelMoveConflictDialog.tsx:86 | `Escada` | cabeçalho de tabela | P1 | `fld_stair` | Stair |  |
| 959 | apps/web/src/ui/LevelMoveConflictDialog.tsx:86 | `Resumo` | cabeçalho de tabela | P1 | `fld_summary` | Summary |  |
| 960 | apps/web/src/ui/LevelMoveConflictDialog.tsx:86 | `Situação` | cabeçalho de tabela | P1 | `fld_status` | Status |  |
| 961 | apps/web/src/ui/LevelMoveConflictDialog.tsx:93 | `Não cabe` | valor | P1 | `msg_does_not_fit` | Does not fit |  |
| 962 | apps/web/src/ui/LevelMoveConflictDialog.tsx:93 | `Confirmar` | valor | P1 | `msg_confirm` | Confirm |  |
| 963 | apps/web/src/ui/LevelMoveConflictDialog.tsx:93 | `Ok` | valor | P1 | `msg_ok` | OK |  |
| 964 | apps/web/src/ui/LevelMoveConflictDialog.tsx:102 | `Rampa` | cabeçalho de tabela | P1 | `fld_ramp` | Ramp |  |
| 965 | apps/web/src/ui/LevelMoveConflictDialog.tsx:102 | `Situação` | cabeçalho de tabela | P1 | `fld_status` | Status |  |
| 966 | apps/web/src/ui/LevelMoveConflictDialog.tsx:107 | `Não cabe` | valor | P1 | `msg_does_not_fit` | Does not fit |  |
| 967 | apps/web/src/ui/LevelMoveConflictDialog.tsx:113 | `“Aplicar” recalcula o nº de degraus e o piso pela fórmula do tipo (acrescenta degraus no último lance ou remove do fim; insere patamar quando o lance passa de 3,20 m); se a extensão invadir uma parede, o aviso de invasão continua. “Cancelar” mantém tudo como está. “Excluir” remove só os elementos em conflito.` | mensagem | P1 | `msg_level_move_help` | “Apply” recalculates the riser count and tread using the type formula (adds risers to the last run or removes from the end; inserts a landing when the run exceeds 3.20 m); if the extension clashes with a wall, the clash warning remains. “Cancel” keeps everything as is. “Delete” removes only the conflicting elements. |  |
| 968 | apps/web/src/ui/MoveLevel.tsx:26 | `Mover para o nível` | título de diálogo | P1 | `dlg_move_to_level` | Move to Level |  |
| 969 | apps/web/src/ui/MoveLevel.tsx:27 | `elemento` | mensagem | P1 | `msg_n_element` | {n} element | pluralização improvisada |
| 970 | apps/web/src/ui/MoveLevel.tsx:27 | `elementos` | mensagem | P1 | `msg_n_elements` | {n} elements | pluralização improvisada |
| 971 | apps/web/src/ui/MoveLevel.tsx:32 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 972 | apps/web/src/ui/MoveLevel.tsx:33 | `Mover` | botão | P1 | `btn_move` | Move |  |
| 973 | apps/web/src/ui/MoveLevel.tsx:38 | `Nível` | rótulo de campo | P0 | `fld_level` | Level |  |
| 974 | apps/web/src/ui/MoveLevel.tsx:46 | `Ao trocar` | rótulo de campo | P0 | `fld_when_changing` | When Changing |  |
| 975 | apps/web/src/ui/MoveLevel.tsx:53 | `Os elementos mudam de nível sem trocar a vista. Ctrl+Z desfaz.` | mensagem | P1 | `msg_move_level_hint` | Elements change level without changing the view. Ctrl+Z undoes it. |  |
| 976 | apps/web/src/ui/OutlineGroup.tsx:15 | `face de acabamento` | valor | P1 | `opt_outline_wall_finish` | wall finish face |  |
| 977 | apps/web/src/ui/OutlineGroup.tsx:16 | `núcleo` | valor | P1 | `opt_outline_core` | core |  |
| 978 | apps/web/src/ui/OutlineGroup.tsx:17 | `perímetro externo` | valor | P1 | `opt_outline_perimeter` | outer perimeter |  |
| 979 | apps/web/src/ui/OutlineGroup.tsx:39 | `Vinculado às paredes (modo: ${modo})` | mensagem | P1 | `msg_outline_linked_mode` | Attached to walls (mode: {mode}) |  |
| 980 | apps/web/src/ui/OutlineGroup.tsx:39 | `Vinculado às paredes (modos variados)` | mensagem | P1 | `msg_outline_linked_mixed` | Attached to walls (mixed modes) |  |
| 981 | apps/web/src/ui/OutlineGroup.tsx:41 | `Estático (editado à mão)` | mensagem | P1 | `msg_outline_static` | Static (edited manually) |  |
| 982 | apps/web/src/ui/OutlineGroup.tsx:42 | `Sem vínculo (desenhado por croqui)` | mensagem | P1 | `msg_outline_unlinked` | Unlinked (drawn by sketch) |  |
| 983 | apps/web/src/ui/OutlineGroup.tsx:44 | `Sem elementos` | mensagem | P1 | `msg_no_elements` | No elements |  |
| 984 | apps/web/src/ui/OutlineGroup.tsx:66 | `Desvincular contorno` | rótulo de desfazer | P2 | `undo_detach_outline` | Detach Outline |  |
| 985 | apps/web/src/ui/OutlineGroup.tsx:66 | `Revincular contorno às paredes` | rótulo de desfazer | P2 | `undo_relink_outline` | Relink Outline to Walls |  |
| 986 | apps/web/src/ui/OutlineGroup.tsx:79 | `Contorno` | título de grupo | P1 | `pgrp_outline` | Outline |  |
| 987 | apps/web/src/ui/OutlineGroup.tsx:83 | `Desvincular` | botão | P1 | `btn_detach` | Detach |  |
| 988 | apps/web/src/ui/OutlineGroup.tsx:88 | `Revincular às paredes` | botão | P1 | `btn_relink_walls` | Relink to Walls |  |
| 989 | apps/web/src/ui/CeilingOutlineGroup.tsx:34 | `Acompanha o ambiente «${nome}»` | mensagem | P1 | `msg_ceiling_follows_room` | Follows room “{name}” |  |
| 990 | apps/web/src/ui/CeilingOutlineGroup.tsx:35 | `Ambiente apagado: mantém o último contorno` | mensagem | P1 | `msg_ceiling_room_deleted` | Room deleted: keeps the last outline |  |
| 991 | apps/web/src/ui/CeilingOutlineGroup.tsx:36 | `Ambiente «${nome}» não fecha: mantém o último contorno` | mensagem | P1 | `msg_ceiling_room_open` | Room “{name}” is not closed: keeps the last outline |  |
| 992 | apps/web/src/ui/CeilingOutlineGroup.tsx:39 | `Estático (editado à mão)` | mensagem | P1 | `msg_outline_static` | Static (edited manually) |  |
| 993 | apps/web/src/ui/CeilingOutlineGroup.tsx:42 | `Sem ambiente (desenhado à mão)` | mensagem | P1 | `msg_ceiling_no_room` | No room (drawn manually) |  |
| 994 | apps/web/src/ui/CeilingOutlineGroup.tsx:45 | `Sem elementos` | mensagem | P1 | `msg_no_elements` | No elements |  |
| 995 | apps/web/src/ui/CeilingOutlineGroup.tsx:54 | `Soltar forro do ambiente` | rótulo de desfazer | P2 | `undo_detach_ceiling` | Detach Ceiling from Room |  |
| 996 | apps/web/src/ui/CeilingOutlineGroup.tsx:71 | `Revincular forro ao ambiente` | rótulo de desfazer | P2 | `undo_relink_ceiling` | Relink Ceiling to Room |  |
| 997 | apps/web/src/ui/CeilingOutlineGroup.tsx:81 | `Nenhum ambiente contém o forro.` | mensagem de status | P1 | `msg_no_room_contains_ceiling` | No room contains the ceiling. |  |
| 998 | apps/web/src/ui/CeilingOutlineGroup.tsx:90 | `Contorno` | título de grupo | P1 | `pgrp_outline` | Outline |  |
| 999 | apps/web/src/ui/CeilingOutlineGroup.tsx:94 | `Desvincular` | botão | P1 | `btn_detach` | Detach |  |
| 1000 | apps/web/src/ui/CeilingOutlineGroup.tsx:99 | `Revincular ao ambiente` | botão | P1 | `btn_relink_room` | Relink to Room |  |
| 1001 | apps/web/src/ui/ViewOptionRows.tsx:13 | `Pavimento de referência` | rótulo de campo | P1 | `fld_reference_level` | Reference Level |  |
| 1002 | apps/web/src/ui/ViewOptionRows.tsx:21 | `Abaixo (automático)` | opção de select | P1 | `opt_below_automatic` | Below (automatic) |  |
| 1003 | apps/web/src/ui/PanelHead.tsx:73 | `Arraste para mover o painel` | tooltip | P2 | `tip_drag_panel` | Drag to move the panel |  |
| 1004 | apps/web/src/ui/PanelHead.tsx:80 | `Fechar (reabra em Vista ▸ Interface do usuário)` | tooltip | P1 | `tip_close_panel` | Close (reopen in View ▸ User Interface) |  |
| 1005 | apps/web/src/ui/LabelScroll.tsx:58 | `Largura da coluna de rótulos` | aria-label | P2 | `aria_label_column_width` | Label column width |  |
| 1006 | apps/web/src/ui/LabelScroll.tsx:58 | `Arraste para ajustar` | tooltip | P2 | `tip_drag_to_adjust` | Drag to adjust |  |
| 1007 | apps/web/src/ui/EmptyViews.tsx:9 | `Nenhuma vista aberta` | mensagem | P1 | `msg_no_view_open` | No view open |  |
| 1008 | apps/web/src/ui/EmptyViews.tsx:10 | `Abra um nível ou o Modelo 3D pelo navegador de projeto.` | mensagem | P1 | `msg_open_view_hint` | Open a level or the 3D Model from the Project Browser. |  |
| 1009 | apps/web/src/ui/EmptyViews.tsx:13 | `Mostrar navegador de projeto` | botão | P1 | `btn_show_project_browser` | Show Project Browser |  |
| 1010 | apps/web/src/ui/DisjoinCheck.tsx:5 | `A parede se solta das paredes ligadas às suas pontas em vez de esticá-las` | tooltip | P1 | `tip_disjoin` | The wall detaches from walls joined at its ends instead of stretching them |  |
| 1011 | apps/web/src/ui/DisjoinCheck.tsx:11 | `Desconectar` | caixa de seleção | P1 | `fld_disjoin` | Disallow Join |  |
| 1012 | apps/web/src/ui/OptionsBar.tsx:23 | `Eixo da parede` | opção de select | P0 | `loc_wall_center` | Wall Centerline | LOCATION_LABEL compartilhado com Properties/PlacementProperties; OptionsBar é de outro agente |
| 1013 | apps/web/src/ui/OptionsBar.tsx:24 | `Eixo do núcleo` | opção de select | P0 | `loc_core_center` | Core Centerline | LOCATION_LABEL compartilhado com Properties/PlacementProperties; OptionsBar é de outro agente |
| 1014 | apps/web/src/ui/OptionsBar.tsx:25 | `Face externa do acabamento` | opção de select | P0 | `loc_finish_exterior` | Finish Face: Exterior | LOCATION_LABEL compartilhado com Properties/PlacementProperties; OptionsBar é de outro agente |
| 1015 | apps/web/src/ui/OptionsBar.tsx:26 | `Face interna do acabamento` | opção de select | P0 | `loc_finish_interior` | Finish Face: Interior | LOCATION_LABEL compartilhado com Properties/PlacementProperties; OptionsBar é de outro agente |
| 1016 | apps/web/src/ui/OptionsBar.tsx:27 | `Face externa do núcleo` | opção de select | P0 | `loc_core_exterior` | Core Face: Exterior | LOCATION_LABEL compartilhado com Properties/PlacementProperties; OptionsBar é de outro agente |
| 1017 | apps/web/src/ui/OptionsBar.tsx:28 | `Face interna do núcleo` | opção de select | P0 | `loc_core_interior` | Core Face: Interior | LOCATION_LABEL compartilhado com Properties/PlacementProperties; OptionsBar é de outro agente |
| 1018 | apps/web/src/editor/levelActions.ts:28 | `Manter a cota` | opção de select | P0 | `opt_keep_elevation` | Keep Elevation | LEVEL_KEEP_LABEL usado por LevelField/MoveLevel |
| 1019 | apps/web/src/editor/levelActions.ts:28 | `Levar o deslocamento` | opção de select | P0 | `opt_keep_offset` | Keep Offset | LEVEL_KEEP_LABEL |
| 1020 | packages/model/src/priority.ts:18 | `Estrutura` | mapa de rótulos | P1 | `layer_function_*` | Structure/Substrate/Thermal/Membrane/Finish 1/Finish 2 | rótulos PT fixos usados nas camadas de parede/piso/laje/forro/telhado |
| 1021 | packages/model/src/opening.ts:154 | `Porta de giro` | mapa de rótulos | P1 | `family_open_*` | Swing Door/Double Door/Sliding Door/… | nomes PT fixos exibidos no seletor de tipo e no diálogo de tipo de abertura |
| 1022 | packages/model/src/areaPlan.ts:155 | `Sala` | dado padrão | P1 | `room_cat_*` | Living/Kitchen/Bedroom/Bath/Circulation/Service/Garage/Balcony | nomes de categoria criados no documento em PT; não traduzir dado do usuário, mas o padrão gerado deve ser localizado |
| 1023 | packages/model/src/sectionView.ts:287 | `Norte` | mapa de rótulos | P1 | `section_role_*` | North/South/East/West | papel da elevação exibido em SectionViewProps |
| 1024 | packages/engine/src/roofSchedule.ts:8 | `Uma água` | mapa de rótulos | P1 | `roof_shape_*` | Shed/Gable/Hip/Free/By Edges/By Extrusion | usado no select Forma de RoofProperties; já existe chave roof_shape_* em i18nTabelas |
| 1025 | packages/tools/src/stairRunPlan.ts:28 | `Reta` | mapa de rótulos | P1 | `stair_run_*` | Straight/L-Shaped/U-Shaped/Winder/Spiral/Free | usado no select Forma de PlacementProperties (escada por lance) |

## Mistura PT/EN no mesmo arquivo
- `StairProperties.tsx`: usa `I18N` para “Escada livre”, “Largura do lance” e “Ajustar” (linhas 232-238), mas mantém “Restrições”, “Nível de topo”, “Espelhos”, “Dimensões”, “Avisos” e todas as opções de abertura em PT.
- `RampProperties.tsx`: usa `I18N` para modo/inclinação/comprimento/ajustar (150-176), mas “Restrições”, “Nível de topo”, “Largura”, “Forma”, “Resultados”, “Avisos” continuam PT.
- `PlacementProperties.tsx`: usa `I18N` só para `stair_shape_free` (110); todos os outros rótulos e opções são PT literais.
- `RampLevelsFields.tsx`: rótulos via `I18N` (58-75), mas o fallback “Nível ativo” (54) e o sufixo “ m” (34) são fixos.
- `Properties.tsx`: cabeçalho usa `TOOL_LABEL` (PT) e o resto é PT; nenhuma chamada a `useI18n`.
- `TypeSelector.tsx`: “✎ Editar tipo” poderia usar `edit_type_btn` (EN “Edit Type”), mas está escrito à mão; “Pesquisar tipos…” e “Nenhum tipo encontrado.” também.
- `GenericProps.tsx`: mistura `m³`/`m²` fixos com `fmt()` de vírgula fixa e rótulos PT.
- `LevelMoveConflictDialog.tsx`: “Ok” (EN) convive com “Não cabe”, “Confirmar”, “Cancelar a mudança”, “Aplicar” no mesmo diálogo.

## Riscos / testes que quebram
- `apps/web/src/ui/AnnotationProps.test.ts:155` espera ausência de “Volta (360° - ângulo)”; `:200` espera “Família”; `:209` “Centímetros”; `:210` “Padrão”.
- `apps/web/src/ui/CeilingOutlineGroup.test.ts:22` espera `Acompanha o ambiente «101»`; `:30` “Ambiente apagado: mantém o último contorno”; `:40` “Estático (editado à mão)”.
- `apps/web/src/ui/OutlineGroup.test.ts:14` espera “Vinculado às paredes (modo: núcleo)”; `:21` “Estático (editado à mão)”; `:28` “Sem vínculo (desenhado por croqui)”; `:35` a composição com “ · ”.
- `apps/web/src/ui/RampLevelsFields.test.ts:46` espera `Desnível: 1,50 m`; `:54-56` “Até Nível 2”/“Até Cobertura”/“Até Térreo”; `:64` “Nível base”.
- `apps/web/src/ui/RoofProfileRow.test.ts:22` e `:27` esperam “altura máx. 2,00 m” / “altura máx. 200,0 cm”.
- `apps/web/src/ui/RoomProperties.test.ts:13-14` esperam “Sem circuito fechado” e “Circuito aberto”.
- `apps/web/src/ui/rampFormat.test.ts:26-31` esperam “Desnível”, “Inclinação”, “Área” e vírgula decimal.
- `apps/web/src/ui/DisjoinCheck.test.ts:24` espera “Desconectar”.
- `apps/web/src/ui/GenericProps.test.ts:70` espera o nome de nível “Térreo” (dado do projeto, não deve traduzir; o teste continua válido).
- `apps/web/src/ui/fields.test.ts:20-24` fixa `1,2`/`1,2346`; se `formatQuantityField` passar a respeitar o locale EN, esses testes quebram.

## Já correto
- `apps/web/src/ui/typeOptions.ts`: sem texto visível (só monta opções a partir dos tipos).
- `apps/web/src/ui/SheetView.tsx`: delega ao `SheetStage`, sem strings.
- `apps/web/src/ui/PopupMenu.tsx`: rótulos vêm de `MenuEntry` (contextMenu); o componente não fixa texto.
- `apps/web/src/ui/useUnits.ts`: usa `formatQuantity`/`unitsOf` e acompanha as unidades do projeto (o problema está nos rótulos com unidade fixa, não aqui).
- `NivelCotaEditor.tsx`: a lógica de contexto/edição está OK; só o separador decimal e o sufixo `m` precisam de locale.
- `RampLevelsFields.tsx` e `StairProperties.tsx` (parte da escada livre): já usam `I18N` e `fmtNum` corretamente nos textos que cobrem.