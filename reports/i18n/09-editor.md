# Camada editor — ações, estado, mensagens, contexto e nomes padrão
- Escopo: `apps/web/src/editor/**` (exceto `i18n.ts`, `i18nTabelas.ts`, `i18n.test.ts`)
- Arquivos analisados: 208 no diretório (204 `.ts` de código na raiz + `pasteLevels/` e `__snapshots__/`); grep dirigido em todos e leitura dirigida nos 55 com ocorrências
- Ocorrências: 285 (P0: 4, P1: 244, P2: 37)

## Resumo executivo
A camada `editor` é a origem de quase todo texto que aparece na barra de status, nas dicas de desfazer e nas mensagens de validação/erro — e **nada disso passa pelo dicionário**. As funções puras montam frases em PT e as gravam direto em `useUi.setState({ status })` ou em `store.transaction('rótulo pt-BR')`; o `lang` só é repassado às ferramentas (`controller.ts:205`), nunca usado para texto. Consequência: em EN o usuário continua vendo "Pronto.", "Não há paredes neste nível…", "A vista está travada…" e a dica do botão Desfazer em PT. Os **nomes padrão gravados no documento** também são PT: "Nova prancha", "Planta de área — {nível}", "Planta — {nível}", "Modelo 3D", Norte/Sul/Leste/Oeste e o sufixo "(cópia)". Duas tabelas PT/EN já existem fora do `I18N` (`contextMenu.ts`, `ifcImport.ts`): funcionam, mas duplicam o dicionário. Por fim, há formatação com locale fixo (data do carimbo em `pt-BR`, vírgula decimal em diálogos) e acoplamentos frágeis: a UI compara prefixos do status em PT (`OptionsBar.tsx:296`, `Properties.tsx:269/275`) e `controller.ts:465` compara `Atalho: …`, então traduzir o texto sem ajustar esses pontos quebra o comportamento.

## Causas-raiz
1. **Funções puras sem `lang` gravando texto PT no estado global** — `controller.ts:517`, `controller.ts:524`, `levelActions.ts:68`, `sheetActions.ts:136`, `viewVisibility.ts:151`, `deleteIds.ts:47`, `transfer.ts:134`. Não existe helper `t()` na camada; `useI18n` só é importado em `controller.ts:38` para expor `lang()` ao `ToolEnv`.
2. **Rótulos de desfazer são texto PT persistido no histórico** — `store.transaction('Mover nível', …)` (`levelActions.ts:76`), `'Criar prancha'` (`sheetActions.ts:98`), `'Alterar gráficos da vista'` (`graphicsActions.ts:30`). São exibidos em `ui/TitleBar.tsx:64-65` (`title={undo}: ${store.undoLabel}`) e em `historyStatus.ts:13` ("Desfeito: {rótulo}."). Traduzir só na exibição não resolve: os rótulos também são afirmados em testes e precisam de uma chave estável no histórico.
3. **Nomes padrão nascem no documento sem idioma** — `areaPlanActions.ts:26` (`Planta de área — ${nível}`), `sheetActions.ts:30` (`Nova prancha`), `sheetInsert.ts:166` (`Planta — ${nível}`), `elevations.ts:28-31` (`Norte/Sul/Leste/Oeste`), `view3dPointActions.ts:27` → `packages/model/src/view3dPoints.ts:26` (`Vista 3D`, `Vista 3D 2`), sufixo `(cópia)` em 7 arquivos (`typeActions.ts:259` etc.). Como viram dado do projeto, trocar o idioma depois **não** os renomeia (stale por definição).
4. **Constantes de módulo com PT** (calculadas uma vez, sem reatividade) — `perimeterComandos.ts:21-44`, `issuesView.ts:22`, `dxfExportDialogModel.ts:11-37`, `levelActions.ts:28` (`LEVEL_KEEP_LABEL`), `dxfBatch.ts:136-142`. Se convertidas, precisam virar função de `lang` ou mapa PT/EN, nunca constante memorizada.
5. **Tabelas PT/EN paralelas ao `I18N`** — `contextMenu.ts:58-102` (40 entradas) e `ifcImport.ts:188-219` (`NOMES`). Funcionam em EN, mas são dívida de padronização e ficam fora do teste de cobertura de chaves.
6. **Formatação dependente de idioma com locale fixo** — `sheetActions.ts:34` (`toLocaleDateString('pt-BR')` no carimbo de toda prancha), `areaMerge.ts:29` (vírgula decimal em m²), `levelMovePlan.ts:129` (`f2`/`f3` com vírgula fixa em resumos de conflito).
7. **Duplicação de mensagens entre arquivos** — "Não há o que colar nos níveis escolhidos." em `controller.ts:918` e `transfer.ts:188`; "Operação cancelada: nada foi alterado." em `areaMergePrompt.ts:29` e `hostedLossPrompt.ts:33`; erros "É o único tipo … do projeto." repetidos em 6 arquivos de tipos.

## Inventário
Nas linhas de grupo (validação em bloco ou vários rótulos de desfazer do mesmo arquivo), `Texto atual` traz o primeiro literal e a coluna `Nota` lista as demais linhas; o CSV mantém a mesma granularidade.

| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | state.ts:193 | Orto ativado (F8): apenas 0°/90°. | mensagem status | P1 | msg_ortho_on | Ortho on (F8): 0°/90° only. | barra de status; toggleOrtho |
| 2 | state.ts:193 | Orto desativado (F8). | mensagem status | P1 | msg_ortho_off | Ortho off (F8). | barra de status; toggleOrtho |
| 3 | state.ts:205 | Polar ativado (F10): múltiplos de {deg}°. | mensagem status | P1 | msg_polar_on | Polar on (F10): multiples of {deg}° | barra de status; togglePolar |
| 4 | state.ts:205 | Polar desativado (F10). | mensagem status | P1 | msg_polar_off | Polar off (F10). | barra de status; togglePolar |
| 5 | state.ts:213 | O incremento polar deve estar entre 0,1° e 180°. | mensagem validação | P1 | msg_polar_increment_err | Polar increment must be between 0.1° and 180°. | setPolarIncrement |
| 6 | state.ts:337 | Pronto. | mensagem status | P0 | msg_ready | Ready. | status inicial; sempre visível na StatusBar |
| 7 | controller.ts:428 | Referência da cota trocada. | mensagem status | P1 | msg_dim_ref_changed | Dimension reference changed. | escolherReferenciaCota |
| 8 | controller.ts:465 | Atalho: {seq}… | mensagem status | P2 | msg_shortcut_buffer | Shortcut: {seq}… | a comparação de prefixo na linha 465 usa o texto PT e quebra se ele for traduzido |
| 9 | controller.ts:517 | Na planta de área ficam disponíveis só as ferramentas de anotação (medir, cota, texto, etiqueta e detalhe). | mensagem status | P1 | msg_area_tools_only | Only annotation tools (measure, dimension, text, tag and detail) are available in the area plan. | setTool; bloqueio de ferramenta |
| 10 | controller.ts:524 | Esta ferramenta é da planta. No corte use Medir, Cota, Texto, Detalhe, Alinhar ou Mover. | mensagem status | P1 | msg_section_tools_only | This is a plan tool. In a section use Measure, Dimension, Text, Detail, Align or Move. | setTool no corte |
| 11 | controller.ts:558 | Arraste o rótulo e solte para posicionar. A chamada liga ao sair do ambiente. | mensagem status | P1 | msg_room_tag_drag_hint | Drag the tag and release to position it. The leader turns on when you leave the room. | arraste de rótulo |
| 12 | controller.ts:574 | Rótulo reposicionado em todas as vistas. Ctrl+Z desfaz. | mensagem status | P1 | msg_room_tag_moved | Tag repositioned in all views. Ctrl+Z to undo. | arraste de rótulo |
| 13 | controller.ts:805 | Não há paredes neste nível para gerar elevações. | mensagem status | P1 | msg_no_walls_for_elevations | There are no walls on this level to generate elevations. | generateElevations |
| 14 | controller.ts:809 | Elevações Norte, Sul, Leste e Oeste geradas. Ctrl+Z desfaz. | mensagem status | P1 | msg_elevations_created | North, South, East and West elevations generated. Ctrl+Z to undo. | generateElevations |
| 15 | controller.ts:833 | Recortar só vale para paredes, pisos, lajes, telhados, escadas, rampas, ambientes e aberturas hospedadas (com a parede selecionada). | mensagem status | P1 | msg_cut_not_allowed | Cut only works for walls, floors, slabs, roofs, stairs, ramps, rooms and hosted openings (with the wall selected). | cutSelection |
| 16 | controller.ts:838 | Recortado(s). Ctrl+V cola seguindo o cursor. | mensagem status | P1 | msg_cut_done | Cut. Ctrl+V pastes following the cursor. | cutSelection |
| 17 | controller.ts:846 | Nada copiado. Use Copiar ou Ctrl+C. | mensagem status | P1 | msg_nothing_copied | Nothing copied. Use Copy or Ctrl+C. | repetido em 857 e 901 |
| 18 | controller.ts:906 | Escolha ao menos um nível de destino válido. | mensagem status | P1 | msg_paste_levels_invalid | Choose at least one valid destination level. | previewPasteLevels |
| 19 | controller.ts:918 | Não há o que colar nos níveis escolhidos. | mensagem status | P1 | msg_paste_levels_empty | There is nothing to paste into the chosen levels. | previewPasteLevels; idêntico em transfer.ts:188 |
| 20 | controller.ts:939 | Prévia de {n} cópia(s) em {m} nível(is). V cola; X cancela. | mensagem status | P1 | msg_paste_preview | Preview of {n} copy(ies) on {m} level(s). V pastes; X cancels. | plural forçado com (s)/(is) |
| 21 | controller.ts:979 | Colar alinhado cancelado. | mensagem status | P1 | msg_paste_cancelled | Aligned paste cancelled. | cancelPasteLevelsDialog |
| 22 | controller.ts:1006 | Selecione um elemento de andar-tipo (cópia vinculada) para sincronizar. | mensagem status | P1 | msg_copy_link_select_sync | Select a typical-floor element (linked copy) to synchronize. | sincronizar cópias |
| 23 | controller.ts:1011 | Não há outras cópias vinculadas para sincronizar. | mensagem status | P1 | msg_copy_link_none_sync | There are no other linked copies to synchronize. | sincronizar cópias |
| 24 | controller.ts:1015 | Andar-tipo sincronizado. Ctrl+Z desfaz. | mensagem status | P1 | msg_copy_link_synced | Typical floor synchronized. Ctrl+Z to undo. | sincronizar cópias |
| 25 | controller.ts:1023 | Selecione um elemento de andar-tipo (cópia vinculada) para desvincular. | mensagem status | P1 | msg_copy_link_select_unlink | Select a typical-floor element (linked copy) to unlink. | desvincular cópias |
| 26 | controller.ts:1027 | Cópias desvinculadas: continuam no projeto, mas não sincronizam mais. Ctrl+Z desfaz. | mensagem status | P1 | msg_copy_links_unlinked | Copies unlinked: they stay in the project but no longer synchronize. Ctrl+Z to undo. | desvincular cópias |
| 27 | controller.ts:1068 | Nenhuma cota gerada: confira as camadas escolhidas e os lados com parede paralela. | mensagem status | P1 | msg_auto_dimensions_none | No dimensions generated: check the chosen layers and the sides with a parallel wall. | cotasAutomaticasDaPlanta |
| 28 | controller.ts:1121 | Arquivo inválido | mensagem erro | P1 | msg_file_invalid | Invalid file | openFromText; exibido em fileActions |
| 29 | controller.ts:1140 | Salvamento cancelado. O projeto continua guardado neste navegador. | mensagem status | P1 | msg_save_cancelled | Save cancelled. The project is still stored in this browser. | save |
| 30 | controller.ts:1147 | JSON do projeto copiado para a área de transferência. | mensagem status | P1 | msg_json_copied | Project JSON copied to the clipboard. | save |
| 31 | controller.ts:1149 | Não foi possível baixar. O projeto está guardado neste navegador. | mensagem status | P1 | msg_download_failed | Could not download. The project is stored in this browser. | save |
| 32 | controller.ts:427 | Trocar referência da cota | rótulo undo | P1 | undo_dim_ref | Change dimension reference | também 572 Mover rótulo, 808 Gerar elevações, 1014 Sincronizar cópias vinculadas, 1026 Desvincular cópias, 1062 Cotas automáticas |
| 33 | historyStatus.ts:13 | Desfeito: {rótulo}. / Refeito: {rótulo}. | mensagem status | P1 | msg_undo_redo_status | Undone: {label}. / Redone: {label}. | usa o undoLabel PT do histórico |
| 34 | deleteIds.ts:11 | Excluir | rótulo undo | P1 | undo_delete | Delete | rótulo genérico do passo de exclusão |
| 35 | deleteIds.ts:47 | Na planta de área dá para excluir ambientes, separadores, etiquetas e anotações; paredes e demais elementos de modelo continuam bloqueados. | mensagem status | P1 | msg_area_delete_blocked | In an area plan you can delete rooms, separators, tags and annotations; walls and other model elements remain blocked. | deletePlanSelectionIn |
| 36 | deleteIds.ts:58 | Ambiente excluído. / Separador excluído. / Etiqueta excluída. / Anotações excluídas da planta de área. | mensagem status | P1 | msg_area_deleted | Room deleted. / Separator deleted. / Tag deleted. / Annotations deleted from the area plan. | quatro variantes na mesma linha |
| 37 | deleteIds.ts:68 | Ambientes menores excluídos; a área maior expandiu. Ctrl+Z desfaz. | mensagem status | P1 | msg_area_merged_deleted | Smaller rooms deleted; the larger area expanded. Ctrl+Z to undo. | deletePlanSelectionIn |
| 38 | deleteIds.ts:100 | Seleção excluída. / Seleção excluída; ambientes menores fundidos. Ctrl+Z desfaz. | mensagem status | P1 | msg_selection_deleted | Selection deleted. / Selection deleted; smaller rooms merged. Ctrl+Z to undo. | variante da linha 110 |
| 39 | transfer.ts:134 | Selecione paredes, pisos, lajes, forros, telhados, escadas, rampas, ambientes, objetos importados ou CAD para copiar. | mensagem status | P1 | msg_copy_nothing_copyable | Select walls, floors, slabs, ceilings, roofs, stairs, ramps, rooms, imported objects or CAD to copy. | copy |
| 40 | transfer.ts:138 | {descrição} copiado(s). Ctrl+V cola seguindo o cursor. | mensagem status | P1 | msg_copied | {description} copied. Ctrl+V pastes following the cursor. | copy |
| 41 | transfer.ts:145 | Nada copiado. Selecione elementos e use Ctrl+C. | mensagem status | P1 | msg_clipboard_empty_cut | Nothing copied. Select elements and use Ctrl+C. | paste |
| 42 | transfer.ts:150 | Não há o que colar neste nível. | mensagem status | P1 | msg_paste_nothing_here | There is nothing to paste on this level. | paste |
| 43 | transfer.ts:167 | {n} colado(s) no mesmo lugar. Ctrl+Z desfaz. | mensagem status | P1 | msg_pasted_in_place | {n} pasted in the same place. Ctrl+Z to undo. | paste |
| 44 | transfer.ts:183 | Nada copiado. Selecione elementos e use Copiar. | mensagem status | P1 | msg_clipboard_empty | Nothing copied. Select elements and use Copy. | pasteAligned |
| 45 | transfer.ts:188 | Não há o que colar nos níveis escolhidos. | mensagem status | P1 | msg_paste_levels_empty | There is nothing to paste into the chosen levels. | duplicado em controller.ts:918 |
| 46 | transfer.ts:205 | {n} elemento(s) colado(s) em {m} nível(is). {w} aviso(s). Ctrl+Z desfaz. | mensagem status | P1 | msg_pasted_levels | {n} element(s) pasted on {m} level(s). {w} warning(s). Ctrl+Z to undo. | plural forçado com (s)/(is) |
| 47 | transfer.ts:212 | {n} elemento(s) do mesmo tipo selecionado(s). / Nenhum elemento deste tipo neste nível. | mensagem status | P1 | msg_same_type_selected | {n} element(s) of the same type selected. / No element of this type on this level. | ofType |
| 48 | transfer.ts:219 | Selecione um ambiente primeiro: Mesmo nome seleciona os ambientes do nível com o mesmo nome (só ambientes). | mensagem status | P1 | msg_same_name_hint | Select a room first: Same Name selects the rooms on the level with the same name (rooms only). | sameName; mensagem de sucesso na mesma linha |
| 49 | transfer.ts:153 | Colar alinhado / Colar alinhado aos níveis selecionados | rótulo undo | P1 | undo_paste_aligned | Paste Aligned / Paste Aligned to Selected Levels | rótulos em 153 e 197 |
| 50 | areaMerge.ts:28 | Ambiente | nome padrão | P2 | def_room | Room | fallback do nome quando o ambiente não tem nome; é dado, não traduz |
| 51 | areaMerge.ts:29 | {área} m² | formatação | P2 | fmt_area_m2 | {area} m² | vírgula decimal fixa; comentário units-ok confirma intenção |
| 52 | areaMerge.ts:76 | Ao remover esta parede/separador, os ambientes abaixo vão se fundir: | mensagem diálogo | P1 | dlg_area_merge_intro | Removing this wall/separator will merge the rooms below: | corpo do diálogo de fusão de áreas |
| 53 | areaMerge.ts:77 | • Fica: {ambiente} ({área}). / • Sai: {ambiente} ({área}). | mensagem diálogo | P1 | dlg_area_merge_keep_remove | • Keeps: {room} ({area}). / • Removes: {room} ({area}). | linhas 77 e 78 |
| 54 | areaMerge.ts:79 | A área final do circuito será {área}. Confirmar a expansão e apagar o(s) ambiente(s) menor(es)? | mensagem confirmação | P1 | dlg_area_merge_confirm | The final circuit area will be {area}. Confirm the expansion and delete the smaller room(s)? | diálogo areaMerge |
| 55 | areaMergePrompt.ts:29 | Áreas fundidas; ambientes menores excluídos. Ctrl+Z desfaz. | mensagem status | P1 | msg_areas_merged | Areas merged; smaller rooms deleted. Ctrl+Z to undo. | responderAreaMerge |
| 56 | areaMergePrompt.ts:29 | Operação cancelada: nada foi alterado. | mensagem status | P1 | msg_operation_cancelled | Operation cancelled: nothing was changed. | repetido em hostedLossPrompt.ts:33 |
| 57 | typeActions.ts:15 | 1 em outro nível / {n} em outros níveis | mensagem status | P1 | msg_other_levels | 1 on another level / {n} on other levels | fragmento usado em selectAllPlan e whereUsed |
| 58 | typeActions.ts:61 | Nenhuma instância de «{tipo}» no projeto. | mensagem status | P1 | msg_no_instances_of_type | No instance of «{type}» in the project. | selectAllPlan |
| 59 | typeActions.ts:63 | Nenhuma instância neste nível; {n} em outros níveis. | mensagem status | P1 | msg_no_instances_here | No instance on this level; {n} on other levels. | selectAllPlan |
| 60 | typeActions.ts:65 | {n} instância(s) neste nível{, n em outros níveis}. | mensagem status | P1 | msg_instances_here | {n} instance(s) on this level{, n on other levels}. | selectAllPlan |
| 61 | typeActions.ts:92 | Tipo de destino incompatível. | mensagem erro | P1 | msg_type_incompatible | Incompatible destination type. | replaceType |
| 62 | typeActions.ts:102 | {n} instância(s) substituída(s) por «{tipo}». | mensagem status | P1 | msg_type_replaced | {n} instance(s) replaced with «{type}». | replaceStatus |
| 63 | typeActions.ts:202 | Nenhuma instância de «{nome}» no projeto. | mensagem status | P1 | msg_no_instances_of_type | No instance of «{name}» in the project. | whereUsed; reusa a chave de 61 |
| 64 | typeActions.ts:211 | {n} instância(s) de «{nome}» em {nível}{, n em outros níveis}. | mensagem status | P1 | msg_where_used | {n} instance(s) of «{name}» on {level}{, n on other levels}. | whereUsed |
| 65 | typeActions.ts:216 | É o tipo padrão do projeto. | mensagem validação | P1 | msg_type_is_default | It is the project default type. | wallTypeDeleteBlock |
| 66 | typeActions.ts:218 | Em uso por {n} parede(s). | mensagem validação | P1 | msg_in_use_by_walls | In use by {n} wall(s). | wallTypeDeleteBlock |
| 67 | typeActions.ts:239 | É o único tipo de piso do projeto. | mensagem validação | P1 | msg_last_floor_type | It is the only floor type in the project. | floorTypeDeleteBlock |
| 68 | typeActions.ts:241 | Em uso por {n} piso(s). | mensagem validação | P1 | msg_in_use_by_floors | In use by {n} floor(s). | floorTypeDeleteBlock |
| 69 | typeActions.ts:259 | {nome} (cópia) | nome padrão | P1 | def_copy_suffix | {name} (copy) | duplicateFloorType; aparece no Navegador de projeto |
| 70 | typeActions.ts:268 | Tipo inexistente. / Dê um nome ao tipo. | mensagem validação | P1 | msg_type_invalid_name | Type does not exist. / Give the type a name. | linhas 268-269 e 279 |
| 71 | typeActions.ts:280 | O tipo precisa de ao menos uma camada. | mensagem validação | P1 | msg_type_needs_layer | The type needs at least one layer. | floorTypeError |
| 72 | typeActions.ts:282 | Camada {n}: a espessura precisa ser maior que zero (só membrana pode ser zero). | mensagem validação | P1 | msg_layer_thickness | Layer {n}: thickness must be greater than zero (only membrane may be zero). | floorTypeError |
| 73 | typeActions.ts:95 | Substituir tipo / Duplicar tipo de piso / Renomear tipo de piso | rótulo undo | P1 | undo_floor_type | Replace Type / Duplicate Floor Type / Rename Floor Type | rótulos em 95, 260 e 270 |
| 74 | ceilingTypeActions.ts:11 | É o único tipo de forro do projeto. | mensagem validação | P1 | msg_last_ceiling_type | It is the only ceiling type in the project. | ceilingTypeDeleteBlock |
| 75 | ceilingTypeActions.ts:31 | {nome} (cópia) | nome padrão | P1 | def_copy_suffix | {name} (copy) | duplicateCeilingType |
| 76 | ceilingTypeActions.ts:40 | Tipo inexistente. | mensagem validação | P1 | msg_type_missing | Type does not exist. | renameCeilingType |
| 77 | ceilingTypeActions.ts:41 | Dê um nome ao tipo. | mensagem validação | P1 | msg_type_needs_name | Give the type a name. | renameCeilingType |
| 78 | ceilingTypeActions.ts:32 | Duplicar tipo de forro / Renomear tipo de forro | rótulo undo | P1 | undo_ceiling_type | Duplicate Ceiling Type / Rename Ceiling Type | rótulos em 32 e 42 |
| 79 | slabTypeActions.ts:11 | É o único tipo de laje do projeto. | mensagem validação | P1 | msg_last_slab_type | It is the only slab type in the project. | slabTypeDeleteBlock |
| 80 | slabTypeActions.ts:31 | {nome} (cópia) | nome padrão | P1 | def_copy_suffix | {name} (copy) | duplicateSlabType |
| 81 | slabTypeActions.ts:40 | Tipo inexistente. | mensagem validação | P1 | msg_type_missing | Type does not exist. | renameSlabType |
| 82 | slabTypeActions.ts:41 | Dê um nome ao tipo. | mensagem validação | P1 | msg_type_needs_name | Give the type a name. | renameSlabType |
| 83 | slabTypeActions.ts:32 | Duplicar tipo de laje / Renomear tipo de laje | rótulo undo | P1 | undo_slab_type | Duplicate Slab Type / Rename Slab Type | rótulos em 32 e 42 |
| 84 | roofTypeActions.ts:11 | É o único tipo de telhado do projeto. | mensagem validação | P1 | msg_last_roof_type | It is the only roof type in the project. | roofTypeDeleteBlock |
| 85 | roofTypeActions.ts:31 | {nome} (cópia) | nome padrão | P1 | def_copy_suffix | {name} (copy) | duplicateRoofType |
| 86 | roofTypeActions.ts:40 | Tipo inexistente. | mensagem validação | P1 | msg_type_missing | Type does not exist. | renameRoofType |
| 87 | roofTypeActions.ts:41 | Dê um nome ao tipo. | mensagem validação | P1 | msg_type_needs_name | Give the type a name. | renameRoofType |
| 88 | roofTypeActions.ts:32 | Duplicar tipo de telhado / Renomear tipo de telhado | rótulo undo | P1 | undo_roof_type | Duplicate Roof Type / Rename Roof Type | rótulos em 32 e 42 |
| 89 | rampTypeActions.ts:8 | É o único tipo de rampa do projeto. | mensagem validação | P1 | msg_last_ramp_type | It is the only ramp type in the project. | rampTypeDeleteBlock |
| 90 | rampTypeActions.ts:28 | {nome} (cópia) | nome padrão | P1 | def_copy_suffix | {name} (copy) | duplicateRampType |
| 91 | rampTypeActions.ts:37 | Tipo inexistente. | mensagem validação | P1 | msg_type_missing | Type does not exist. | renameRampType |
| 92 | rampTypeActions.ts:38 | Dê um nome ao tipo. | mensagem validação | P1 | msg_type_needs_name | Give the type a name. | linhas 38 e 45 |
| 93 | rampTypeActions.ts:29 | Duplicar tipo de rampa / Renomear tipo de rampa | rótulo undo | P1 | undo_ramp_type | Duplicate Ramp Type / Rename Ramp Type | rótulos em 29 e 39 |
| 94 | stairTypeActions.ts:9 | É o único tipo de escada do projeto. | mensagem validação | P1 | msg_last_stair_type | It is the only stair type in the project. | stairTypeDeleteBlock |
| 95 | stairTypeActions.ts:39 | {nome} (cópia) | nome padrão | P1 | def_copy_suffix | {name} (copy) | duplicateStairType; também linha 99 |
| 96 | stairTypeActions.ts:48 | Tipo inexistente. | mensagem validação | P1 | msg_type_missing | Type does not exist. | renameStairType |
| 97 | stairTypeActions.ts:49 | Dê um nome ao tipo. | mensagem validação | P1 | msg_type_needs_name | Give the type a name. | linhas 49 e 57 |
| 98 | stairTypeActions.ts:57 | Bloco de validação do tipo de escada (21 mensagens, linhas 57-79) | mensagem validação | P1 | stt_err_* | (reusar as chaves stt_err_* existentes em i18n.ts) | as mesmas mensagens já existem traduzidas em i18n.ts:250-274; trocar o literal PT pela chave |
| 99 | stairTypeActions.ts:79 | Tipo de escada inválido. | mensagem erro | P2 | msg_stair_type_invalid | Invalid stair type. | fallback de stairTypeError |
| 100 | stairTypeActions.ts:40 | Duplicar tipo de escada / Renomear tipo de escada / Editar tipo de escada | rótulo undo | P1 | undo_stair_type | Duplicate Stair Type / Rename Stair Type / Edit Stair Type | rótulos em 40, 50 e 100 |
| 101 | openingTypeActions.ts:15 | Tipo de abertura inexistente. | mensagem validação | P1 | msg_opening_type_missing | Opening type does not exist. | planOpeningTypeChange |
| 102 | openingTypeActions.ts:22 | Parede curta demais para {tipo}: a abertura não cabe. | mensagem validação | P1 | msg_wall_too_short | Wall too short for {type}: the opening does not fit. | planOpeningTypeChange |
| 103 | openingTypeActions.ts:32 | Sem espaço para {tipo} nesta parede: a abertura sobreporia outra. | mensagem validação | P1 | msg_no_space_for_opening | No room for {type} on this wall: the opening would overlap another. | planOpeningTypeChange |
| 104 | openingTypeActions.ts:53 | A abertura foi deslocada para caber: {de} → {para}. Ctrl+Z desfaz. / {n} aberturas foram deslocadas para caber. Ctrl+Z desfaz. | mensagem status | P1 | msg_openings_moved | The opening was moved to fit: {from} → {to}. Ctrl+Z to undo. / {n} openings were moved to fit. Ctrl+Z to undo. | linhas 53-54 |
| 105 | openingTypeActions.ts:48 | Trocar tipo de abertura | rótulo undo | P1 | undo_change_opening_type | Change Opening Type | changeOpeningType |
| 106 | levelActions.ts:28 | Manter a cota / Levar o deslocamento | label | P1 | msg_level_keep | Keep elevation / Carry the offset | LEVEL_KEEP_LABEL; seletor ao mudar de nível |
| 107 | levelActions.ts:68 | Nível inexistente. | mensagem erro | P1 | msg_level_missing | Level does not exist. | linhas 68, 135 e 229 |
| 108 | levelActions.ts:72 | Nada a mover: selecione paredes, pisos, lajes ou telhados. | mensagem status | P1 | msg_nothing_to_move | Nothing to move: select walls, floors, slabs or roofs. | moveToLevel |
| 109 | levelActions.ts:74 | Já está/estão em {nível}. | mensagem status | P1 | msg_already_on_level | Already on {level}. | moveToLevel |
| 110 | levelActions.ts:102 | {n} elemento(s) movido(s) para {nível}{, fora do nível da vista}. Aberturas acompanham a parede. Ctrl+Z desfaz. | mensagem status | P1 | msg_moved_to_level | {n} element(s) moved to {level}{, outside the view level}. Openings follow the wall. Ctrl+Z to undo. | fragmentos em 99-101 |
| 111 | levelActions.ts:131 | Mudança cancelada. Nada foi alterado. | mensagem status | P1 | msg_level_move_cancelled | Change cancelled. Nothing was changed. | applyLevelMove |
| 112 | levelActions.ts:191 | {n} degrau(s) removido(s) do fim; {n} acrescentado(s) no último lance; {n} escada(s)/rampa(s) reajustada(s); {n} excluída(s); {n} sem altura válida | mensagem status | P1 | msg_level_move_parts | {n} step(s) removed from the end; {n} added to the last run; {n} stair(s)/ramp(s) adjusted; {n} deleted; {n} without a valid height | bloco 191-195; plural por ternário |
| 113 | levelActions.ts:208 | {nível}: {resumo}. Ctrl+Z desfaz. / {nível} movido. Ctrl+Z desfaz. | mensagem status | P1 | msg_level_moved | {level}: {summary}. Ctrl+Z to undo. / {level} moved. Ctrl+Z to undo. | applyLevelMove |
| 114 | levelActions.ts:230 | Elevação inválida. | mensagem erro | P1 | msg_invalid_elevation | Invalid elevation. | moveLevel |
| 115 | levelActions.ts:231 | Nada a mover: {nível} já está nesta cota. | mensagem status | P1 | msg_level_already_at_elevation | Nothing to move: {level} is already at this elevation. | moveLevel |
| 116 | levelActions.ts:248 | {nível} movido; cotas de base/topo preservadas. Ctrl+Z desfaz. | mensagem status | P1 | msg_level_moved_keep_heights | {level} moved; base/top heights preserved. Ctrl+Z to undo. | moveLevel keepHeights |
| 117 | levelActions.ts:256 | {n} escada/rampa não cabe / {n} escadas mudam o nº de degraus ou o patamar | mensagem status | P1 | msg_level_move_conflicts | {n} stair/ramp does not fit / {n} stairs change the riser count or landing | linhas 256-257 |
| 118 | levelActions.ts:268 | {nível}: {conflito} no nível novo. Escolha aplicar, cancelar ou excluir. | mensagem confirmação | P1 | msg_level_move_decision | {level}: {conflict} on the new level. Choose apply, cancel or delete. | variante na linha 269 |
| 119 | levelActions.ts:292 | Não foi possível mover o nível: {erro} | mensagem erro | P1 | msg_level_move_failed | Could not move the level: {error} | linhas 292 e 294 |
| 120 | levelActions.ts:76 | Mudar de nível / Mover nível / Mover nível e excluir | rótulo undo | P1 | undo_move_level | Change Level / Move Level / Move Level and Delete | rótulos em 76, 140 e 236 |
| 121 | levelMovePlan.ts:34 | Fixar topo das escadas e rampas | rótulo undo | P1 | undo_pin_stair_tops | Pin Stair and Ramp Tops | pinAutoTops |
| 122 | levelMovePlan.ts:129 | {v} m (3 casas, vírgula fixa) | formatação | P2 | fmt_diag_decimal | {v} m (3 decimals, fixed dot) | f2/f3 com vírgula fixa; comentário units-ok diz que é diagnóstico |
| 123 | levelMovePlan.ts:144 | {d} m acima do máximo ({faixa} m) / {d} m abaixo do mínimo ({faixa} m) | mensagem diálogo | P1 | msg_riser_out_of_band | {d} m above the maximum ({range} m) / {d} m below the minimum ({range} m) | riserBandNote; linhas 144-146 |
| 124 | levelMovePlan.ts:158 | Escada de espelho fixo mantida: N {n}, espelho {r} m… / N mantido em {n}; espelho {r1} → {r2} m… / N {n1} → {n2}, espelho… piso… encurta/alonga… | mensagem diálogo | P1 | msg_stair_summary | Fixed-riser stair kept: N {n}, riser {r} m… / N kept at {n}; riser {r1} → {r2} m… / N {n1} → {n2}, riser… tread… shortens/lengthens… | stairSummary 158-168; exibido no diálogo de conflito |
| 125 | levelMovePlan.ts:197 | Nível inexistente. / Elevação inválida. | mensagem erro | P2 | msg_level_plan_invalid | Level does not exist. / Invalid elevation. | linhas 197, 198 e 200 (diagnóstico do plano) |
| 126 | levelMovePlan.ts:230 | Não foi possível recalcular a escada. | mensagem diálogo | P1 | msg_stair_recalc_failed | Could not recalculate the stair. | linhas 230 e 232 |
| 127 | levelMovePlan.ts:240 | A escada fica sem altura válida (topo no mesmo nível ou abaixo). | mensagem diálogo | P1 | msg_stair_invalid_height | The stair has no valid height (top at the same level or below). | motivo de conflito |
| 128 | levelMovePlan.ts:243 | Não foi possível continuar a escada. | mensagem diálogo | P1 | msg_stair_cannot_continue | Could not continue the stair. | motivo de conflito |
| 129 | levelMovePlan.ts:289 | A rampa fica sem altura válida (topo no mesmo nível ou abaixo). | mensagem diálogo | P1 | msg_ramp_invalid_height | The ramp has no valid height (top at the same level or below). | linhas 289 e 300 |
| 130 | sheetActions.ts:30 | Nova prancha | nome padrão | P0 | def_new_sheet | New Sheet | newSheet; nome da prancha ao criar (Navegador de projeto e aba) |
| 131 | sheetActions.ts:34 | toLocaleDateString('pt-BR') | formatação | P1 | fmt_sheet_date | toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR') | data do carimbo da prancha; locale fixo mesmo em EN |
| 132 | sheetActions.ts:89 | {nome} (cópia) | nome padrão | P1 | def_copy_suffix | {name} (copy) | duplicateSheetCommand |
| 133 | sheetActions.ts:116 | Prancha inexistente | mensagem erro | P2 | msg_sheet_missing | Sheet does not exist | linhas 116 e 349 (guarda interna) |
| 134 | sheetActions.ts:136 | A vista está travada. Destrave-a para mover. | mensagem erro | P1 | msg_view_locked_move | The view is locked. Unlock it to move. | moveViewportAction |
| 135 | sheetActions.ts:145 | Não foi possível mover a vista. | mensagem erro | P2 | msg_move_view_failed | Could not move the view. | fallback de exceção |
| 136 | sheetActions.ts:135 | Vista inexistente | mensagem erro | P2 | msg_view_missing | View does not exist | linhas 135, 199, 224, 247, 262, 282 e 301 |
| 137 | sheetActions.ts:200 | A vista está travada. Destrave-a para redimensionar. | mensagem erro | P1 | msg_view_locked_resize | The view is locked. Unlock it to resize. | resizeViewportAction |
| 138 | sheetActions.ts:213 | Não foi possível redimensionar a vista. | mensagem erro | P2 | msg_resize_view_failed | Could not resize the view. | fallback de exceção |
| 139 | sheetActions.ts:225 | A escala deve ser maior que zero. | mensagem validação | P1 | msg_scale_positive | The scale must be greater than zero. | setViewportScaleAction |
| 140 | sheetActions.ts:226 | A vista está travada. Destrave-a para trocar a escala. | mensagem erro | P1 | msg_view_locked_scale | The view is locked. Unlock it to change the scale. | setViewportScaleAction |
| 141 | sheetActions.ts:236 | Não foi possível alterar a escala. | mensagem erro | P2 | msg_change_scale_failed | Could not change the scale. | fallback de exceção |
| 142 | sheetActions.ts:248 | Só uma vista 3D tem ponto de vista. | mensagem validação | P1 | msg_only_3d_view_has_point | Only a 3D view has a viewpoint. | setViewportView3DPointAction |
| 143 | sheetActions.ts:254 | Não foi possível trocar o ponto de vista. | mensagem erro | P2 | msg_change_point_failed | Could not change the viewpoint. | fallback de exceção |
| 144 | sheetActions.ts:264 | Esta vista não tem modelo para enquadrar. | mensagem validação | P1 | msg_view_has_no_model | This view has no model to fit. | fitViewportAction |
| 145 | sheetActions.ts:265 | A vista está travada. Destrave-a para ajustar a moldura. | mensagem erro | P1 | msg_view_locked_fit | The view is locked. Unlock it to fit the frame. | fitViewportAction |
| 146 | sheetActions.ts:271 | Não foi possível ajustar a moldura. | mensagem erro | P2 | msg_fit_frame_failed | Could not fit the frame. | fallback de exceção |
| 147 | sheetActions.ts:283 | A vista está travada. Destrave-a para mover o conteúdo. | mensagem erro | P1 | msg_view_locked_pan | The view is locked. Unlock it to move the content. | moveViewportContentAction |
| 148 | sheetActions.ts:284 | O deslocamento do conteúdo deve ser um ponto finito. | mensagem validação | P1 | msg_offset_finite | The content offset must be a finite point. | moveViewportContentAction |
| 149 | sheetActions.ts:293 | Não foi possível mover o conteúdo da vista. | mensagem erro | P2 | msg_move_content_failed | Could not move the view content. | fallback de exceção |
| 150 | sheetActions.ts:306 | Não foi possível travar a vista. | mensagem erro | P2 | msg_lock_view_failed | Could not lock the view. | fallback de exceção |
| 151 | sheetActions.ts:372 | Não foi possível alterar a folha. | mensagem erro | P2 | msg_change_sheet_failed | Could not change the sheet. | fallback de exceção |
| 152 | sheetActions.ts:98 | Criar prancha / Adicionar vista à prancha / Mover vista da prancha / Redimensionar vista da prancha / Alterar escala da vista / Travar vista / Destravar vista / Ajustar moldura ao conteúdo / Mover conteúdo da vista / Criar prancha com a planta / Alterar folha da prancha | rótulo undo | P1 | undo_sheet_actions | Create Sheet / Add View to Sheet / Move Sheet View / Resize Sheet View / Change View Scale / Lock View / Unlock View / Size Crop to Fit / Move View Content / Create Sheet with Plan / Change Sheet | rótulos em 98, 127, 142, 210, 233, 251, 268, 289, 303, 334 e 369 |
| 153 | sheetInsert.ts:112 | Prancha inexistente | mensagem erro | P2 | msg_sheet_missing | Sheet does not exist | linhas 112, 233 |
| 154 | sheetInsert.ts:123 | A escala deve ser maior que zero. | mensagem validação | P1 | msg_scale_positive | The scale must be greater than zero. | linhas 123 e 161 |
| 155 | sheetInsert.ts:126 | A vista {n} não cabe na área de desenho da prancha. | mensagem erro | P1 | msg_view_does_not_fit | View {n} does not fit in the sheet drawing area. | linhas 126 e 143 |
| 156 | sheetInsert.ts:166 | Planta — {nível} | nome padrão | P1 | def_sheet_plan_name | Plan — {level} | sheetsPerLevelAction; nome da prancha |
| 157 | sheetInsert.ts:147 | Adicionar vistas à prancha / Criar pranchas dos níveis / Criar prancha | rótulo undo | P1 | undo_insert_views | Add Views to Sheet / Create Sheets for Levels / Create Sheet | rótulos em 147, 149, 164, 178, 179 e 239 |
| 158 | sheetAlign.ts:114 | Prancha inexistente | mensagem erro | P2 | msg_sheet_missing | Sheet does not exist | linhas 114 e 133 |
| 159 | sheetAlign.ts:116 | Selecione ao menos duas vistas da prancha. | mensagem validação | P1 | msg_select_two_views | Select at least two views on the sheet. | linhas 116 e 135 |
| 160 | sheetAlign.ts:126 | Não foi possível alinhar as vistas. | mensagem erro | P2 | msg_align_views_failed | Could not align the views. | fallback de exceção |
| 161 | sheetAlign.ts:145 | Não foi possível distribuir as vistas. | mensagem erro | P2 | msg_distribute_views_failed | Could not distribute the views. | fallback de exceção |
| 162 | sheetAlign.ts:123 | Alinhar vistas da prancha / Distribuir vistas da prancha | rótulo undo | P1 | undo_align_views | Align Sheet Views / Distribute Sheet Views | rótulos em 123 e 142 |
| 163 | areaPlanActions.ts:26 | Planta de área — {nível} | nome padrão | P0 | def_area_plan_name | Area Plan — {level} | areaPlanName; nome no Navegador e na aba |
| 164 | areaPlanActions.ts:63 | Copiar anotações do nível | rótulo undo | P1 | undo_seed_annotations | Copy Level Annotations | seedPlanAnnotationsAction; rótulos também em 138, 152, 194, 201, 219, 241, 249, 270, 296 e 306 |
| 165 | areaPlanActions.ts:135 | A etiqueta precisa de ao menos um campo. | mensagem erro | P1 | msg_tag_needs_field | The tag needs at least one field. | updateRoomTagAction |
| 166 | areaPlanActions.ts:175 | Nível inexistente | mensagem erro | P2 | msg_level_missing | Level does not exist | createAreaPlanAction |
| 167 | areaPlanActions.ts:280 | Por categoria / Por nível / Por faixa de área | nome padrão | P1 | def_scheme_name | By Category / By Level / By Area Range | applyColorSchemeAction; nome do esquema de cores no documento |
| 168 | areaPlanActions.ts:285 | até 5 m² / 5 a 12 m² / 12 a 25 m² / acima de 25 m² | nome padrão | P1 | def_scheme_ranges | up to 5 m² / 5 to 12 m² / 12 to 25 m² / above 25 m² | rótulos das faixas gravados na legenda (linhas 285-288) |
| 169 | areaPlanActions.ts:294 | Legenda de áreas | nome padrão | P1 | def_area_legend | Area Legend | título da legenda desenhada na planta |
| 170 | areaPlanActions.ts:295 | Quadro de áreas | nome padrão | P1 | def_area_table | Area Schedule | título do quadro desenhado na planta |
| 171 | areaPlanActions.ts:194 | Criar planta de área / Criar plantas de área / Aplicar esquema de cores / Retirar esquema de cores / Editar etiqueta da planta de área / Voltar etiqueta ao padrão da planta / Recentralizar rótulos / Mover rótulo | rótulo undo | P1 | undo_area_plan | Create Area Plan / Create Area Plans / Apply Color Scheme / Remove Color Scheme / Edit Area Plan Tag / Reset Tag to Plan Default / Recenter Tags / Move Tag | rótulos em 138, 152, 194, 201, 219, 241, 249, 270, 296 e 306 |
| 172 | perimeterMode.ts:49 | Perímetro em edição: use Concluir ou Cancelar antes de trocar de ferramenta. | mensagem status | P1 | msg_perimeter_open_tool | Perimeter being edited: use Finish or Cancel before changing tools. | ABERTO_FERRAMENTA |
| 173 | perimeterMode.ts:50 | Perímetro em edição: use Concluir ou Cancelar antes de mudar de vista ou de nível. | mensagem status | P1 | msg_perimeter_open_view | Perimeter being edited: use Finish or Cancel before changing view or level. | ABERTO_VISTA |
| 174 | perimeterMode.ts:51 | Já há um perímetro em edição: use Concluir ou Cancelar. | mensagem status | P1 | msg_perimeter_already_open | A perimeter is already being edited: use Finish or Cancel. | JA_ABERTO |
| 175 | perimeterMode.ts:123 | Este elemento não tem perímetro editável. | mensagem status | P1 | msg_no_editable_perimeter | This element has no editable perimeter. | abrir edição |
| 176 | perimeterMode.ts:167 | Edição do perímetro cancelada. O elemento não mudou. / Perímetro descartado. | mensagem status | P1 | msg_perimeter_discarded | Perimeter edit cancelled. The element was not changed. / Perimeter discarded. | cancelar |
| 177 | perimeterMode.ts:188 | Comando desligado: clique numa linha para selecionar. | mensagem status | P1 | msg_perimeter_command_off | Command off: click a line to select. | setModify |
| 178 | perimeterMode.ts:236 | Refeito no rascunho do perímetro. / Desfeito no rascunho do perímetro. / Nada a refazer no perímetro. / Nada a desfazer no perímetro. | mensagem status | P1 | msg_perimeter_undo_redo | Redone in the perimeter sketch. / Undone in the perimeter sketch. / Nothing to redo in the perimeter. / Nothing to undo in the perimeter. | linhas 236-237 |
| 179 | perimeterMode.ts:251 | Não há linhas no esboço para selecionar. | mensagem status | P1 | msg_no_sketch_lines | There are no lines in the sketch to select. | seleção no esboço |
| 180 | perimeterMode.ts:255 | {n} linha(s) selecionada(s). | mensagem status | P1 | msg_lines_selected | {n} line(s) selected. | plural forçado com (s) |
| 181 | perimeterMode.ts:278 | Só o telhado tem inclinação e balanço por aresta. | mensagem status | P1 | msg_only_roof_edge | Only the roof has slope and overhang per edge. | aresta |
| 182 | perimeterMode.ts:279 | Selecione uma aresta para mudar a inclinação ou o balanço. | mensagem status | P1 | msg_select_roof_edge | Select an edge to change the slope or overhang. | aresta |
| 183 | perimeterMode.ts:150 | Editar perímetro / Criar perímetro | rótulo undo | P1 | undo_perimeter | Edit Perimeter / Create Perimeter | gravação do esboço |
| 184 | perimeterComandos.ts:22 | Parede paralela usa uma parede do projeto: não se aplica às linhas do esboço. | tooltip | P1 | msg_tool_not_in_sketch | Parallel Wall uses a project wall: it does not apply to sketch lines. | linha 23 idem para Trocar hospedeiro |
| 185 | perimeterComandos.ts:27 | Ainda não existe para as linhas do esboço. | tooltip | P1 | msg_not_in_sketch_yet | Not available for sketch lines yet. | SEM_ESBOCO_AINDA |
| 186 | perimeterComandos.ts:31 | Aparar/Estender, Dividir, Deslocar, Mover, Copiar, Rotacionar, Espelhar, Matriz e Alinhar: dicas de clique e Tab | tooltip | P1 | msg_sketch_command_hint | Trim/Extend, Split, Offset, Move, Copy, Rotate, Mirror, Array and Align: click and Tab hints | DICA_COMANDO, linhas 31-40 (9 dicas) |
| 187 | perimeterComandos.ts:44 | Este comando não pode começar com as linhas atuais do esboço. | mensagem status | P1 | msg_sketch_command_refused | This command cannot start with the current sketch lines. | COMANDO_RECUSADO |
| 188 | viewVisibility.ts:151 | Selecione elementos (ou uma categoria) para ocultar na vista. | mensagem status | P1 | msg_hide_select | Select elements (or a category) to hide in the view. | hideInView |
| 189 | viewVisibility.ts:164 | Elementos ocultos nesta vista. Ctrl+Z desfaz. | mensagem status | P1 | msg_hidden_done | Elements hidden in this view. Ctrl+Z to undo. | hideInView |
| 190 | viewVisibility.ts:170 | Selecione elementos (ou uma categoria) para reexibir na vista. | mensagem status | P1 | msg_unhide_select | Select elements (or a category) to unhide in the view. | unhideInView |
| 191 | viewVisibility.ts:183 | Elementos reexibidos nesta vista. Ctrl+Z desfaz. | mensagem status | P1 | msg_unhidden_done | Elements unhidden in this view. Ctrl+Z to undo. | unhideInView |
| 192 | viewVisibility.ts:193 | Tudo reexibido nesta vista. Ctrl+Z desfaz. | mensagem status | P1 | msg_unhide_all_done | Everything unhidden in this view. Ctrl+Z to undo. | unhideAll |
| 193 | viewVisibility.ts:199 | Selecione elementos para ocultar temporariamente (HH). | mensagem status | P1 | msg_temp_hide_select | Select elements to hide temporarily (HH). | temporaryHide |
| 194 | viewVisibility.ts:210 | Oculto temporariamente nesta vista. HR restaura. | mensagem status | P1 | msg_temp_hidden | Temporarily hidden in this view. HR restores. | temporaryHide |
| 195 | viewVisibility.ts:216 | Selecione elementos para isolar temporariamente (HI). | mensagem status | P1 | msg_temp_isolate_select | Select elements to isolate temporarily (HI). | temporaryIsolate |
| 196 | viewVisibility.ts:226 | Isolado temporariamente nesta vista. HR restaura. | mensagem status | P1 | msg_temp_isolated | Temporarily isolated in this view. HR restores. | temporaryIsolate |
| 197 | viewVisibility.ts:237 | Tudo reexibido nesta vista. Ctrl+Z desfaz a ocultação permanente. | mensagem status | P1 | msg_unhide_all_reveal | Everything unhidden in this view. Ctrl+Z undoes permanent hiding. | resetTemporary |
| 198 | viewVisibility.ts:243 | Hide/isolate temporário restaurado. | mensagem status | P1 | msg_temp_reset | Temporary hide/isolate reset. | resetTemporary |
| 199 | viewVisibility.ts:253 | Revelar elementos ocultos ativo. Bordas azuis. / Revelar elementos ocultos desligado. | mensagem status | P1 | msg_reveal_toggle | Reveal Hidden Elements on. Blue edges. / Reveal Hidden Elements off. | toggleRevealHidden |
| 200 | viewVisibility.ts:286 | Selecione elementos de uma só categoria para ocultar a categoria. | mensagem status | P1 | msg_hide_category_select | Select elements of a single category to hide the category. | linhas 286, 301 e 321 |
| 201 | viewVisibility.ts:162 | Ocultar na vista / Reexibir na vista / Reexibir tudo na vista | rótulo undo | P1 | undo_visibility | Hide in View / Unhide in View / Unhide All in View | rótulos em 162, 181, 191 e 234 |
| 202 | graphicsActions.ts:17 | Gráficos inválidos. | mensagem erro | P2 | msg_graphics_invalid | Invalid graphics. | fallback de failed() |
| 203 | graphicsActions.ts:30 | Alterar gráficos da vista / Alterar gráficos do 3D / Alterar pesos de linha / Restaurar gráficos da vista / Restaurar gráficos do 3D / Restaurar gráficos do corte / Restaurar pesos de linha / Alterar gráficos do corte / Alternar linhas finas da planta / Alternar linhas finas do corte | rótulo undo | P1 | undo_graphics | Change View Graphics / Change 3D Graphics / Change Line Weights / Restore View Graphics / Restore 3D Graphics / Restore Section Graphics / Restore Line Weights / Change Section Graphics / Toggle Plan Thin Lines / Toggle Section Thin Lines | rótulos em 30, 42, 53, 68, 79, 87, 101, 117, 137 e 138 |
| 204 | contextMenu.ts:58 | TEXTOS: tabela PT/EN própria (40 entradas, linhas 58-102) | dívida i18n | P2 | ctx_* | (migrar para I18N com chaves ctx_*) | funciona em EN, mas duplica o dicionário; não tem stale porque é lido com ctx.lang a cada abertura |
| 205 | issuesView.ts:22 | Erros / Avisos / Informações | label | P1 | msg_issues_titles | Errors / Warnings / Information | títulos dos grupos do painel de avisos |
| 206 | issuesView.ts:38 | 1 erro / {n} erros · 1 aviso / {n} avisos · 1 informação / {n} informações | mensagem status | P1 | msg_issues_summary | 1 error / {n} errors · 1 warning / {n} warnings · 1 information / {n} information | summarize; botão da barra de status |
| 207 | dxfExportDialogModel.ts:12 | Milímetros (mm) / Centímetros (cm) / Metros (m) / Pés (ft) / Polegadas (in) | label | P1 | unit_labels | Millimeters (mm) / Centimeters (cm) / Meters (m) / Feet (ft) / Inches (in) | DXF_UNIT_OPTIONS 12-16; seletor do diálogo de exportação |
| 208 | dxfExportDialogModel.ts:33 | Plantas de piso / Plantas de área / Cortes e elevações / Pranchas | label | P1 | dxf_group_labels | Floor Plans / Area Plans / Sections and Elevations / Sheets | GROUP_LABEL 33-36; grupos da lista de exportação |
| 209 | dxfBatch.ts:136 | Hestia - exportação DXF em lote / Versão do formato: R2000 (AC1015) / Unidade: … / Data: … / Arquivos DXF: … / As pranchas saem como plotadas… | mensagem arquivo | P1 | dxf_readme | Hestia - DXF batch export / Format version: R2000 (AC1015) / Unit: … / Date: … / DXF files: … / Sheets are exported as plotted… | LEIA-ME.txt do ZIP (linhas 136-142) |
| 210 | dxfBatch.ts:153 | prancha sem renderizador / alvo inexistente / sem geometria | mensagem erro | P2 | dxf_skip_reasons | sheet has no renderer / target does not exist / no geometry | motivos exibidos no relatório do lote (linhas 153, 169 e 179) |
| 211 | dxfBatch.ts:195 | arquivo;tipo;nome;nivel;escala;prancha | mensagem arquivo | P2 | dxf_manifest_header | file;type;name;level;scale;sheet | cabeçalho do manifest.csv do ZIP |
| 212 | dxfSheet.ts:222 | Prancha inexistente: {id} | mensagem erro | P2 | msg_sheet_missing | Sheet does not exist: {id} | guarda interna do DXF |
| 213 | dxfAreaPlan.ts:110 | Planta de área inexistente | mensagem erro | P2 | msg_area_plan_missing | Area plan does not exist | guarda interna do DXF |
| 214 | dxfExport.ts:452 | Planta de área inexistente | mensagem erro | P2 | msg_area_plan_missing | Area plan does not exist | guarda interna do DXF |
| 215 | ifcImport.ts:107 | Importação cancelada. | mensagem erro | P1 | msg_ifc_cancelled | Import cancelled. | erro exibido no overlay de importação |
| 216 | ifcImport.ts:112 | A importação IFC passou de {n} s e foi cancelada. | mensagem erro | P1 | msg_ifc_timeout | The IFC import took longer than {n} s and was cancelled. | timeout do worker |
| 217 | ifcImport.ts:136 | O worker de importação IFC não carregou. | mensagem erro | P1 | msg_ifc_worker_failed | The IFC import worker failed to load. | falha do worker |
| 218 | roomActions.ts:14 | Todos os circuitos fechados já têm ambiente (ou não há circuito fechado neste nível). | mensagem status | P1 | msg_all_circuits_have_rooms | All closed circuits already have rooms (or there is no closed circuit on this level). | addRoomsAllCircuits |
| 219 | roomActions.ts:22 | {n} ambiente(s) criado(s) em circuitos fechados. Ctrl+Z desfaz. | mensagem status | P1 | msg_rooms_created | {n} room(s) created in closed circuits. Ctrl+Z to undo. | plural forçado com (s) |
| 220 | roomActions.ts:18 | Ambientes em todos os circuitos | rótulo undo | P1 | undo_rooms_all_circuits | Rooms in All Circuits | addRoomsAllCircuits |
| 221 | tagActions.ts:33 | Todos os elementos desta vista já têm etiqueta. | mensagem status | P1 | msg_all_tagged | All elements in this view already have a tag. | tagAllNotTagged |
| 222 | tagActions.ts:37 | {n} etiqueta(s) criada(s). | mensagem status | P1 | msg_tags_created | {n} tag(s) created. | plural forçado com (s) |
| 223 | tagActions.ts:34 | Etiquetar elementos sem etiqueta | rótulo undo | P1 | undo_tag_all | Tag All Not Tagged | tagAllNotTagged |
| 224 | ceilingRoomActions.ts:14 | Nenhum ambiente de circuito fechado sem forro neste nível (ou o projeto não tem tipo de forro). | mensagem status | P1 | msg_no_room_needs_ceiling | No closed-circuit room without a ceiling on this level (or the project has no ceiling type). | ceilingRoomActions |
| 225 | ceilingRoomActions.ts:20 | {n} forro(s) criado(s) nos ambientes. Ctrl+Z desfaz. | mensagem status | P1 | msg_ceilings_created | {n} ceiling(s) created in the rooms. Ctrl+Z to undo. | plural forçado com (s) |
| 226 | cadActions.ts:53 | O desenho CAD não tem geometria para enquadrar. | mensagem status | P1 | msg_cad_no_geometry | The CAD drawing has no geometry to fit. | enquadrar CAD |
| 227 | cadActions.ts:74 | CAD excluído: {nome} | mensagem status | P1 | msg_cad_deleted | CAD deleted: {name} | excluir CAD |
| 228 | cadActions.ts:73 | Excluir CAD | rótulo undo | P1 | undo_delete_cad | Delete CAD | excluir CAD |
| 229 | goToIssue.ts:11 | Este elemento não existe mais. | mensagem status | P1 | msg_element_gone | This element no longer exists. | ir para o aviso |
| 230 | sectionViewActions.ts:10 | Alteração recusada. | mensagem erro | P2 | msg_change_refused | Change refused. | fallback |
| 231 | sectionViewActions.ts:32 | {nome} excluído. Ctrl+Z desfaz. | mensagem status | P1 | msg_view_deleted | {name} deleted. Ctrl+Z to undo. | excluir vista |
| 232 | sectionViewActions.ts:7 | Alterar vista | rótulo undo | P1 | undo_change_view | Change View | alteração de vista |
| 233 | sectionHandles.ts:130 | Anotações excluídas do corte. Ctrl+Z desfaz. | mensagem status | P1 | msg_section_annotations_deleted | Section annotations deleted. Ctrl+Z to undo. | excluir anotações do corte |
| 234 | sectionHandles.ts:127 | Excluir anotações do corte | rótulo undo | P1 | undo_delete_section_annotations | Delete Section Annotations | excluir anotações do corte |
| 235 | view3dPointActions.ts:17 | A vista 3D não está aberta. Abra o Modelo 3D para usar a câmera atual. | mensagem erro | P1 | msg_3d_view_closed | The 3D view is not open. Open the 3D Model to use the current camera. | SEM_VISTA_3D |
| 236 | view3dPointActions.ts:31 | Não foi possível salvar o ponto de vista 3D. | mensagem erro | P2 | msg_save_point_failed | Could not save the 3D viewpoint. | falha padrão |
| 237 | view3dPointActions.ts:40 | Ponto de vista 3D inexistente. | mensagem erro | P1 | msg_point_missing | 3D viewpoint does not exist. | linhas 40, 53, 67 e 88 |
| 238 | view3dPointActions.ts:47 | Não foi possível atualizar o ponto de vista 3D. | mensagem erro | P2 | msg_update_point_failed | Could not update the 3D viewpoint. | falha padrão |
| 239 | view3dPointActions.ts:58 | Não foi possível renomear o ponto de vista 3D. | mensagem erro | P2 | msg_rename_point_failed | Could not rename the 3D viewpoint. | falha padrão |
| 240 | view3dPointActions.ts:72 | Não foi possível excluir o ponto de vista 3D. | mensagem erro | P2 | msg_delete_point_failed | Could not delete the 3D viewpoint. | falha padrão |
| 241 | view3dPointActions.ts:28 | Salvar ponto de vista 3D / Atualizar ponto de vista 3D / Renomear ponto de vista 3D / Excluir ponto de vista 3D | rótulo undo | P1 | undo_view3d_point | Save 3D Viewpoint / Update 3D Viewpoint / Rename 3D Viewpoint / Delete 3D Viewpoint | rótulos em 28, 44, 55 e 69 |
| 242 | viewRangeActions.ts:24 | Intervalo de vista inválido. | mensagem erro | P2 | msg_view_range_invalid | Invalid view range. | fallback |
| 243 | vista3dAoVivo.ts:40 | {n} elemento(s) visível(is) selecionado(s). / Nenhum elemento visível na vista 3D. | mensagem status | P1 | msg_visible_3d_selected | {n} visible element(s) selected. / No visible element in the 3D view. | Ctrl+A no 3D |
| 244 | wallFloorActions.ts:44 | Topo não anexado: a parede está / algumas paredes estão no nível mais alto e não há nível acima. | mensagem status | P1 | msg_top_not_attached | Top not attached: the wall is / some walls are on the highest level and there is no level above. | anexar topo ao piso |
| 245 | wallFloorActions.ts:14 | Anexar base ao piso / Desanexar base do piso / Anexar topo ao piso / Desanexar topo do piso | rótulo undo | P1 | undo_attach_wall | Attach Base to Floor / Detach Base from Floor / Attach Top to Floor / Detach Top from Floor | rótulos em 14 e 23 |
| 246 | rampActions.ts:94 | Rampa inexistente. | mensagem erro | P1 | msg_ramp_missing | Ramp does not exist. | patchRamps |
| 247 | rampActions.ts:96 | Tipo de rampa inexistente | mensagem erro | P1 | msg_ramp_type_missing | Ramp type does not exist | regenRamp |
| 248 | rampActions.ts:98 | O nível de topo não fica acima da base: nada a ajustar. | mensagem erro | P1 | msg_ramp_top_not_above | The top level is not above the base: nothing to adjust. | ajustar rampa |
| 249 | rampActions.ts:102 | A rampa não tem geometria válida para ajustar. | mensagem erro | P1 | msg_ramp_no_geometry | The ramp has no valid geometry to adjust. | ajustar rampa |
| 250 | rampActions.ts:43 | Editar rampa / Ajustar rampa | rótulo undo | P1 | undo_ramp | Edit Ramp / Adjust Ramp | rótulos em 43, 70 e 114 |
| 251 | stairActions.ts:44 | Editar escada | rótulo undo | P1 | undo_stair | Edit Stair | patchStairs |
| 252 | stairFreeActions.ts:22 | Escada livre inexistente. | mensagem erro | P1 | msg_free_stair_missing | Free stair does not exist. | aplicar regeneração |
| 253 | stairFreeActions.ts:24 | Tipo de escada inexistente | mensagem erro | P1 | msg_stair_type_missing | Stair type does not exist | regeneração |
| 254 | stairFreeActions.ts:26 | O nível de topo não fica acima da base: nada a ajustar. | mensagem erro | P1 | msg_stair_top_not_above | The top level is not above the base: nothing to adjust. | ajustar escada |
| 255 | stairFreeActions.ts:28 | A escada não tem um lance válido para ajustar. | mensagem erro | P1 | msg_stair_no_valid_run | The stair has no valid run to adjust. | ajustar escada |
| 256 | stairFreeActions.ts:45 | Escada inexistente. | mensagem erro | P1 | msg_stair_missing | Stair does not exist. | patchStairFree |
| 257 | stairFreeActions.ts:5 | Editar escada / Ajustar escada | rótulo undo | P1 | undo_stair | Edit Stair / Adjust Stair | rótulos em 5, 33 e 42 |
| 258 | fileActions.ts:11 | falha desconhecida | mensagem erro | P2 | msg_unknown_failure | unknown failure | fallback de why() |
| 259 | fileActions.ts:16 | Abrindo {arquivo}… | mensagem status | P1 | msg_opening_file | Opening {file}… | openProjectFile |
| 260 | fileActions.ts:18 | Aberto: {arquivo} / Não foi possível abrir: {erro} | mensagem status | P1 | msg_opened_file | Opened: {file} / Could not open: {error} | openProjectFile |
| 261 | fileActions.ts:34 | Nenhuma prancha para exportar. | mensagem status | P1 | msg_no_sheets_to_export | No sheets to export. | exportPdf |
| 262 | fileActions.ts:36 | Não foi possível exportar o PDF: {erro} | mensagem erro | P1 | msg_export_pdf_failed | Could not export the PDF: {error} | exportPdf |
| 263 | fileActions.ts:44 | Não foi possível exportar o IFC: {erro} | mensagem erro | P1 | msg_export_ifc_failed | Could not export the IFC: {error} | exportIfc |
| 264 | saveBytes.ts:12 | Salvo como {arquivo}. / Arquivo {arquivo} gerado. | mensagem status | P1 | msg_file_saved | Saved as {file}. / File {file} generated. | saveBytes; mesmo texto em saveText.ts:11 |
| 265 | saveBytes.ts:13 | Exportação cancelada. Nenhum arquivo foi salvo. | mensagem status | P1 | msg_export_cancelled | Export cancelled. No file was saved. | saveBytes, savePdf.ts:12 e saveText.ts:12 |
| 266 | saveBytes.ts:15 | Não foi possível exportar o arquivo. | mensagem erro | P2 | msg_export_failed | Could not export the file. | saveBytes e saveText.ts:18 |
| 267 | savePdf.ts:13 | Não foi possível salvar o PDF neste navegador. | mensagem erro | P1 | msg_save_pdf_failed | Could not save the PDF in this browser. | savePdf |
| 268 | saveText.ts:16 | Download indisponível: o conteúdo foi copiado para a área de transferência. | mensagem status | P1 | msg_download_unavailable | Download unavailable: the content was copied to the clipboard. | saveText |
| 269 | shortcutConfig.ts:106 | Use de 1 a 4 letras ou números, sem espaços. | mensagem validação | P1 | msg_shortcut_invalid_seq | Use 1 to 4 letters or digits, without spaces. | atribuirAtalho |
| 270 | shortcutConfig.ts:116 | "{seq}" já é usada por {lista}. Escolha outra. | mensagem validação | P1 | msg_shortcut_conflict | "{seq}" is already used by {list}. Choose another. | atribuirAtalho |
| 271 | shortcutConfig.ts:119 | {comando}: atalho {seq}. | mensagem status | P1 | msg_shortcut_assigned | {command}: shortcut {seq}. | atribuirAtalho |
| 272 | shortcutConfig.ts:165 | O arquivo não é um JSON válido. | mensagem validação | P1 | msg_json_invalid | The file is not valid JSON. | importaAtalhos |
| 273 | shortcutConfig.ts:167 | Arquivo que não é de atalhos do Hestia (formato ou versão diferentes). | mensagem validação | P1 | msg_shortcut_wrong_file | File is not a Hestia shortcuts file (different format or version). | importaAtalhos |
| 274 | shortcutConfig.ts:169 | Perfil desconhecido no arquivo. | mensagem validação | P1 | msg_shortcut_unknown_profile | Unknown profile in the file. | importaAtalhos |
| 275 | shortcutConfig.ts:171 | Comandos inválidos: cada comando precisa existir e ter uma sequência de letras e números, ou null. | mensagem validação | P1 | msg_shortcut_invalid_commands | Invalid commands: each command must exist and have a sequence of letters and digits, or null. | importaAtalhos |
| 276 | shortcutConfig.ts:174 | Conflito no arquivo: {a} e {b} usam "{seq}". Nada foi importado. | mensagem validação | P1 | msg_shortcut_file_conflict | Conflict in the file: {a} and {b} use "{seq}". Nothing was imported. | importaAtalhos |
| 277 | shortcutConfig.ts:177 | Atalhos importados. | mensagem status | P1 | msg_shortcuts_imported | Shortcuts imported. | importaAtalhos |
| 278 | viewTabActions.ts:18 | Planta de cobertura: {nível} | label | P1 | def_roof_plan_tab | Roof Plan: {level} | rótulo da aba da planta de cobertura |
| 279 | viewTabActions.ts:21 | Modelo 3D | label | P0 | def_3d_view_tab | 3D Model | rótulo da aba 3D (sempre visível) |
| 280 | elevations.ts:28 | Norte / Sul / Leste / Oeste | nome padrão | P1 | def_elevation_north | North / South / East / West | nomes padrão das elevações geradas (linhas 28-31); viram nome de vista no documento |
| 281 | aberturaProjeto.ts:206 | Arquivo inválido | mensagem erro | P1 | msg_file_invalid | Invalid file | erro de abertura exibido na barra de status |
| 282 | transfer.ts:42 | {n} parede(s), {n} piso(s), {n} laje(s), {n} forro(s), {n} telhado(s), {n} escada(s), {n} rampa(s), {n} ambiente(s), {n} objeto(s) importado(s), {n} desenho(s) CAD | mensagem status | P1 | msg_copy_counts | {n} wall(s), {n} floor(s), {n} slab(s), {n} ceiling(s), {n} roof(s), {n} stair(s), {n} ramp(s), {n} room(s), {n} imported object(s), {n} CAD drawing(s) | describe, linhas 42-52; entra em '{…} copiado(s)' e '{…} colado(s)' |
| 283 | profileWarning.ts:20 | Criado, mas esta vista oculta {camadas} (perfil da vista). Ajuste a visibilidade para vê-lo. | mensagem status | P1 | msg_hidden_by_profile | Created, but this view hides {layers} (view profile). Adjust visibility to see it. | hiddenCreationWarning; {camadas} = paredes/aberturas/pisos |
| 284 | view3dPointActions.ts:27 | Vista 3D (gerado por defaultView3DPointName) | nome padrão | P1 | def_3d_point_name | 3D View | nome do ponto de vista no documento; literal real em packages/model/src/view3dPoints.ts:26 |
| 285 | dxfBatch.ts:81 | AREA / PLANTA / PRANCHA / CORTE / ELEVACAO (tokens {tipo}) | nome padrão | P2 | dxf_kind_tokens | AREA / PLAN / SHEET / SECTION / ELEVATION | tokens usados no nome dos arquivos/pastas do ZIP; literais nas linhas 81-85 |

## Mistura PT/EN no mesmo arquivo
- `apps/web/src/editor/controller.ts`: "Ctrl+Z desfaz" (PT) + "Hide/isolate" e "JSON" (EN) nas mesmas mensagens.
- `apps/web/src/editor/viewVisibility.ts:243`: "Hide/isolate temporário restaurado."
- `apps/web/src/editor/ifcImport.ts`: tabela `NOMES` bilíngue (188-219) convive com erros PT fixos (107, 112, 136).
- `apps/web/src/editor/dxfBatch.ts`: "Hestia - exportação DXF em lote" com "R2000 (AC1015)" e cabeçalho CSV em PT.
- `apps/web/src/editor/contextMenu.ts`: tabela PT/EN correta, mas o rótulo do último comando (`ctx.last.label`) chega pronto em PT de `recentCommands`/`toolLabel`.
- `apps/web/src/editor/typeActions.ts` e `levelActions.ts`: nomes de tipo entre `«»` (PT) misturados a identificadores em EN.

## Riscos / testes que quebram
- `apps/web/src/editor/graphicsActions.test.ts:22,100,193,229,240` — `undoLabel` comparado com texto PT.
- `apps/web/src/editor/levelActions.test.ts:54,222,229,242` — mensagens e resumo de escada PT.
- `apps/web/src/editor/typeActions.test.ts:31,35,44,48,70,103` — status de "Selecionar todas as instâncias" e bloqueio de exclusão.
- `apps/web/src/editor/openingTypeActions.test.ts:53`, `roomActions.test.ts:30`, `wallFloorActions.test.ts:55`, `levelElevation.test.ts:41`.
- `apps/web/src/editor/perimeter.test.ts:88,104,147,213,226` e `perimeterSelecao.test.ts:86` — `useUi.getState().status`.
- `apps/web/src/editor/sheetActions.test.ts:57` — nome "(cópia)".
- `apps/web/src/editor/view3dPointActions.test.ts:107` — recusa PT.
- `apps/web/src/editor/issuesView.test.ts:126,128`, `ifcImport.test.ts:52-73`, `contextMenu.test.ts:40,78,115,212,226,294`.
- `apps/web/src/editor/dxfBatch.test.ts:78-83,129-130` — rótulos de alvo/prancha.
- **Fora do escopo, mas acoplados ao texto PT:** `apps/web/src/ui/OptionsBar.tsx:296` (`status.startsWith('Distância inválida')`) e `apps/web/src/ui/Properties.tsx:269,275` (`startsWith('Peitoril inválido')` / `'Altura inválida'`); `apps/web/src/ui/StatusBar.tsx:29-42` só renderiza o status. `apps/web/src/editor/controller.ts:465` compara o prefixo `Atalho: ${tentativa}…`.

## Já correto
- `apps/web/src/editor/ifcImport.ts` — resumo da importação escolhe PT/EN por `Lang` (`NOMES`, 188-219); só os erros de worker/timeout estão fixos.
- `apps/web/src/editor/contextMenu.ts` — menu de contexto responde a `ctx.lang` em todas as entradas (dívida: tabela própria).
- `apps/web/src/editor/i18n.ts` e `i18nTabelas.ts` — fonte oficial (fora do escopo deste relatório).
- Sem texto visível ao usuário: `fluxoEdicao.ts`, `openViews.ts`, `dockLayout.ts`, `dockActions.ts`, `geometryCache.ts`, `resolucaoAssincrona.ts`, `avisosWorker.ts`, `avisosCliente.ts`, `avisosProjeto.ts`, `avisosCalculo.ts`, `atividadeUsuario.ts`, `appShell.ts`, `storage.ts`, `preparoProjeto.ts`, `projetoDerivado.ts`, `interacaoAtiva.ts`, `selectionClick.ts`, `toolSelection.ts`, `toolKeys.ts`, `nomeArquivo.ts` (sanitiza nome de arquivo, não é UI).
