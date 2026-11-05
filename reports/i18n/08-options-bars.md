# 08 — Barras de opções e modo perímetro
- Escopo: `apps/web/src/ui/*OptionsBar.tsx`, `apps/web/src/ui/perimeter/**`, mais dependências de rótulo renderizadas por essas barras (`gridUi.ts`, `stairRunFields.ts`, `RampLevelsFields.tsx`, `DisjoinCheck.tsx`, `fields.tsx`, `packages/tools/src/stairSketchState.ts`, `stairRunPlan.ts`, `perimeterModifyKind.ts`).
- Arquivos analisados: 30 (10 barras de opções fora do perímetro + 8 arquivos de `ui/perimeter` + 3 testes + 9 dependências compartilhadas de rótulo).
- Ocorrências: 254 (P0: 111, P1: 129, P2: 14).

## Resumo executivo
As barras de opções são a área mais monolíngue do app: **8 das 11 barras não importam `I18N`** e escrevem todo rótulo, opção, dica e `aria-label` em PT-BR fixo. Só `ArrayOptionsBar` está 100% traduzida; `RampOptionsBar` e `StairRunOptionsBar` usam `I18N` em poucos campos e deixam o resto em PT.
O modo perímetro é o pior caso: `PerimeterStatus.ts` concentra títulos, nomes de ferramenta, 11 mensagens de problema e o texto do botão Concluir em constantes de módulo PT, e a única tradução existente (`PERIMETER_TOOL_EN`) é usada **só** no rótulo da aba contextual — a barra de opções, o título das Propriedades e a barra de status continuam em PT mesmo em EN.
O nome da ferramenta exibido no início de todas as barras vem de `TOOL_LABEL` (`@hestia/tools`), não de `toolLabel`, então "Parede", "Laje", "Telhado" etc. nunca trocam.
Há ainda acoplamento perigoso: `OptionsBar.tsx:296` decide limpar o aviso comparando `status.startsWith('Distância inválida')`; traduzir a mensagem quebra esse fluxo silenciosamente.
Constantes de módulo (`LOCATION_LABEL`, `PERIMETER_TITLE`, `SHAPE_LABEL`, `HINT`, `GRID_MODES`, `STAIR_SUBMODE_LABEL`) são calculadas uma vez e não reagem à troca de idioma — precisam virar chaves consultadas em tempo de render.

## Causas-raiz
1. **Barras escritas sem dicionário**: grep por `useI18n|I18N` em `*OptionsBar.tsx` acha só `ArrayOptionsBar.tsx:4`, `StairRunOptionsBar.tsx:4` e `RampOptionsBar.tsx:5`. `OptionsBar.tsx`, `SlabOptionsBar.tsx`, `CeilingOptionsBar.tsx`, `RoofOptionsBar.tsx`, `RoofArrowOptionsBar.tsx`, `StairOptionsBar.tsx` e `GridOptionsBar.tsx` não têm nenhuma chave.
2. **Constantes PT de módulo** (nunca atualizam ao trocar `lang`):
   - `apps/web/src/ui/OptionsBar.tsx:22` `LOCATION_LABEL` (6 rótulos)
   - `apps/web/src/ui/perimeter/PerimeterStatus.ts:7` `PERIMETER_TITLE`, `:15` `PERIMETER_TOOL`, `:31` `GRAVA`, `:33` `ISSUE_TEXT`
   - `apps/web/src/ui/RampOptionsBar.tsx:10` `SHAPE_LABEL`
   - `apps/web/src/ui/StairOptionsBar.tsx:26` `PRIMITIVES`
   - `apps/web/src/ui/StairRunOptionsBar.tsx:10` `HINT`
   - `apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:37` `PERIMETER_SHAPES` (13 labels)
   - `apps/web/src/ui/gridUi.ts:6` `GRID_MODES`
   - `packages/tools/src/stairSketchState.ts:9` `STAIR_SUBMODE_LABEL`, `packages/tools/src/stairRunPlan.ts:27` `STAIR_RUN_SHAPE_LABEL`, `packages/tools/src/perimeterModifyKind.ts:17` `PERIMETER_MODIFY_LABEL`
3. **Nome da ferramenta via `TOOL_LABEL`** em vez de `toolLabel(tool, lang)`: `OptionsBar.tsx:142` e `:146` (e o mesmo padrão em `Properties.tsx:433`, fora desta área).
4. **Tradução EN duplicada e desconectada**: `PerimeterStatus.ts:23` `PERIMETER_TOOL_EN` só alimenta o rótulo da aba (`PerimeterRibbonPanels.tsx:203`); a barra (`PerimeterOptionsBar.tsx:36`), o título do grupo (`PerimeterProps.tsx:42`) e o botão Concluir (`PerimeterRibbonPanels.tsx:113/117`) usam as versões PT.
5. **Texto composto em função pura sem `lang`**: `PerimeterStatus.ts:58` `perimeterHint`, `:66` `sketchStatus`, `:76` `finishTitle`, `:92` `edgeStatus`; `stairActions.ts:69` `stairNote`; `stairSketchState.ts:217` `missingText` e `:223` `counterText`. Nenhuma recebe o idioma, então nem um `useI18n` no chamador resolve sem mudar assinatura.
6. **Formatação com vírgula fixa**: `RampOptionsBar.tsx:52` e `:74` (`.toFixed(2).replace('.', ',')`) e `StairRunOptionsBar.tsx:102` (`clique (1,00)`) ignoram `lang`/`fmtNum`; as mensagens de perímetro usam `formatQuantity(units, …)` sem idioma (`PerimeterStatus.ts:94-96`, `PerimeterProps.tsx:47`).
7. **Gate por texto de status**: `OptionsBar.tsx:296` faz `status.startsWith('Distância inválida')`; se a mensagem de `:295` virar chave traduzida, o "Pronto." nunca é reposto. Mesmo antipadrão em `Properties.tsx:269/275` (fora da área).
8. **Plural por concatenação**: `OptionsBar.tsx:313` (`selecionado${s}`), `PerimeterStatus.ts:72` (`problema(s)`), `stairSketchState.ts:219/225` — não há infraestrutura de plural no `I18N`.

## Inventário
| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/OptionsBar.tsx:23 | Eixo da parede | const módulo | P0 | loc_wall_center | Wall Centerline | LOCATION_LABEL é const de módulo: nunca troca de idioma; usado também em Properties.tsx:190 e PlacementProperties.tsx:50 |
| 2 | apps/web/src/ui/OptionsBar.tsx:24 | Eixo do núcleo | const módulo | P0 | loc_core_center | Core Centerline | idem LOCATION_LABEL |
| 3 | apps/web/src/ui/OptionsBar.tsx:25 | Face externa do acabamento | const módulo | P0 | loc_finish_exterior | Finish Face: Exterior | idem LOCATION_LABEL |
| 4 | apps/web/src/ui/OptionsBar.tsx:26 | Face interna do acabamento | const módulo | P0 | loc_finish_interior | Finish Face: Interior | idem LOCATION_LABEL |
| 5 | apps/web/src/ui/OptionsBar.tsx:27 | Face externa do núcleo | const módulo | P0 | loc_core_exterior | Core Face: Exterior | idem LOCATION_LABEL |
| 6 | apps/web/src/ui/OptionsBar.tsx:28 | Face interna do núcleo | const módulo | P0 | loc_core_interior | Core Face: Interior | idem LOCATION_LABEL |
| 7 | apps/web/src/ui/OptionsBar.tsx:44 | Família | JSX texto | P0 | dim_family | Family | label do seletor de família de cotas |
| 8 | apps/web/src/ui/OptionsBar.tsx:49 | Aparência da cota: marcador, texto, folgas e formato. Edite em Famílias de cotas… | atributo title | P1 | dim_family_title | Dimension appearance: tick mark, text, gaps and format. Edit in Dimension Families… | tooltip do seletor de família |
| 9 | apps/web/src/ui/OptionsBar.tsx:55 | Direção | JSX texto | P0 | dim_direction | Direction | label da barra de Cota |
| 10 | apps/web/src/ui/OptionsBar.tsx:57 | Automática (pela referência) | opção select | P0 | dim_dir_auto | Automatic (by reference) |  |
| 11 | apps/web/src/ui/OptionsBar.tsx:58 | Alinhada | opção select | P0 | dim_dir_aligned | Aligned | Horizontal/Vertical (L59-60) são idênticos em EN |
| 12 | apps/web/src/ui/OptionsBar.tsx:63 | Sequência | JSX texto | P0 | dim_string | Dimension String | label; 'Individual' na mesma linha é idêntico em EN |
| 13 | apps/web/src/ui/OptionsBar.tsx:63 | Contínua | opção select | P0 | dim_string_continuous | Continuous |  |
| 14 | apps/web/src/ui/OptionsBar.tsx:63 | A partir de uma base | opção select | P0 | dim_string_baseline | Baseline |  |
| 15 | apps/web/src/ui/OptionsBar.tsx:65 | A direção vem dos pontos medidos | JSX texto | P2 | dim_dir_hint_points | Direction comes from the measured points | texto de apoio |
| 16 | apps/web/src/ui/OptionsBar.tsx:94 | Buscar | JSX texto | P1 | opt_search | Search | busca do seletor de tipo de abertura |
| 17 | apps/web/src/ui/OptionsBar.tsx:94 | nome ou código | atributo placeholder | P1 | opt_search_ph | name or code |  |
| 18 | apps/web/src/ui/OptionsBar.tsx:94 | Buscar tipo de abertura | atributo aria-label | P1 | opt_search_aria | Search opening type |  |
| 19 | apps/web/src/ui/OptionsBar.tsx:97 | Tipo | JSX texto | P0 | opt_type | Type | repetido em L152, L200, L208 e em Slab/Ceiling/Roof/Stair/Grid |
| 20 | apps/web/src/ui/OptionsBar.tsx:101 | ★ Favoritos | optgroup label | P1 | opt_favorites | ★ Favorites |  |
| 21 | apps/web/src/ui/OptionsBar.tsx:111 | Outros | optgroup label | P1 | opt_others | Others | tipos sem família |
| 22 | apps/web/src/ui/OptionsBar.tsx:120 | Remover tipo dos favoritos | atributo aria-label | P1 | opt_fav_remove | Remove type from favorites |  |
| 23 | apps/web/src/ui/OptionsBar.tsx:120 | Adicionar tipo aos favoritos | atributo aria-label | P1 | opt_fav_add | Add type to favorites |  |
| 24 | apps/web/src/ui/OptionsBar.tsx:121 | Remover dos favoritos (desfazível) | atributo title | P1 | opt_fav_remove_title | Remove from favorites (undoable) |  |
| 25 | apps/web/src/ui/OptionsBar.tsx:121 | Adicionar aos favoritos (desfazível) | atributo title | P1 | opt_fav_add_title | Add to favorites (undoable) |  |
| 26 | apps/web/src/ui/OptionsBar.tsx:122 | Favoritar tipo de abertura | mensagem de histórico | P1 | opt_fav_add_cmd | Favorite opening type | rótulo do passo de desfazer; 'Remover tipo dos favoritos' na mesma linha reusa opt_fav_remove |
| 27 | apps/web/src/ui/OptionsBar.tsx:142 | Opções da ferramenta | atributo aria-label | P1 | opt_group_aria | Tool options | repetido em L145 e em PerimeterOptionsBar.tsx:35 |
| 28 | apps/web/src/ui/OptionsBar.tsx:142 | TOOL_LABEL[tool] | const PT (@hestia/tools) | P0 | tool_* (toolLabel) | (usar toolLabel) | nome da ferramenta sempre em PT; idem L146; corrigir com toolLabel(tool, lang) de i18n.ts:715 |
| 29 | apps/web/src/ui/OptionsBar.tsx:142 | Configurações em Propriedades | JSX texto | P0 | opt_settings_in_props | Settings in Properties | estado de espera das ferramentas de colocação |
| 30 | apps/web/src/ui/OptionsBar.tsx:147 | Planta de área — anotação | JSX texto | P1 | opt_area_plan_note | Area plan — annotation |  |
| 31 | apps/web/src/ui/OptionsBar.tsx:148 | Cotas automáticas da planta de área ativa | atributo title | P1 | opt_auto_dim_title | Automatic dimensions of the active area plan |  |
| 32 | apps/web/src/ui/OptionsBar.tsx:148 | Cotas automáticas… | JSX texto botão | P0 | opt_auto_dim_btn | Auto Dimensions… | reusa tool_cotasAuto + '…' |
| 33 | apps/web/src/ui/OptionsBar.tsx:160 | Forma | JSX texto | P0 | opt_shape | Shape | idem Ramp e StairRun |
| 34 | apps/web/src/ui/OptionsBar.tsx:162 | Reta | opção select | P0 | opt_shape_line | Straight |  |
| 35 | apps/web/src/ui/OptionsBar.tsx:163 | Arco (3 pontos) | opção select | P0 | opt_shape_arc3 | Arc (3 points) |  |
| 36 | apps/web/src/ui/OptionsBar.tsx:164 | Retângulo (2 cantos) | opção select | P0 | opt_shape_rect | Rectangle (2 corners) |  |
| 37 | apps/web/src/ui/OptionsBar.tsx:168 | Linha de localização | JSX texto | P0 | opt_location_line | Location Line |  |
| 38 | apps/web/src/ui/OptionsBar.tsx:176 | Altura | JSX texto | P0 | opt_height | Height | repetido em L190, L200 e StairOptionsBar.tsx:134 |
| 39 | apps/web/src/ui/OptionsBar.tsx:179 | Encadear | JSX texto checkbox | P0 | opt_chain | Chain | idem StairOptionsBar.tsx:89 |
| 40 | apps/web/src/ui/OptionsBar.tsx:183 | Cria um ambiente em cada circuito fechado que ainda não tem um; um só Ctrl+Z desfaz tudo | atributo title | P1 | opt_rooms_all_title | Creates a room in every closed loop that does not have one yet; a single Ctrl+Z undoes it all |  |
| 41 | apps/web/src/ui/OptionsBar.tsx:184 | Ambientes em todos os circuitos fechados | JSX texto botão | P1 | opt_rooms_all | Rooms in all closed loops |  |
| 42 | apps/web/src/ui/OptionsBar.tsx:191 | Largura | JSX texto | P0 | opt_width | Width | repetido em L200 e em Ramp/StairRun |
| 43 | apps/web/src/ui/OptionsBar.tsx:192 | Chamada | JSX texto | P0 | opt_leader | Leader | label do select de líder |
| 44 | apps/web/src/ui/OptionsBar.tsx:192 | Sem líder | opção select | P0 | opt_leader_none | No leader |  |
| 45 | apps/web/src/ui/OptionsBar.tsx:192 | Com dobra | opção select | P0 | opt_leader_elbow | Elbow | 'Reta' na mesma linha reusa opt_shape_line |
| 46 | apps/web/src/ui/OptionsBar.tsx:195 | Mascarar elementos atrás | JSX texto checkbox | P1 | opt_region_mask | Mask elements behind |  |
| 47 | apps/web/src/ui/OptionsBar.tsx:196 | Cor | JSX texto | P1 | opt_color | Color |  |
| 48 | apps/web/src/ui/OptionsBar.tsx:197 | Traço | JSX texto | P1 | opt_line_style | Line Style |  |
| 49 | apps/web/src/ui/OptionsBar.tsx:197 | Contínuo | opção select | P1 | opt_line_solid | Solid |  |
| 50 | apps/web/src/ui/OptionsBar.tsx:197 | Tracejado | opção select | P1 | opt_line_dashed | Dashed |  |
| 51 | apps/web/src/ui/OptionsBar.tsx:197 | Pontilhado | opção select | P1 | opt_line_dotted | Dotted |  |
| 52 | apps/web/src/ui/OptionsBar.tsx:200 | Informação | JSX texto | P1 | opt_tag_info | Information | label do select de etiqueta |
| 53 | apps/web/src/ui/OptionsBar.tsx:200 | Nome | opção select | P1 | opt_name | Name |  |
| 54 | apps/web/src/ui/OptionsBar.tsx:200 | Marca | opção select | P1 | opt_mark | Mark |  |
| 55 | apps/web/src/ui/OptionsBar.tsx:200 | Nível | opção select | P1 | opt_level | Level |  |
| 56 | apps/web/src/ui/OptionsBar.tsx:201 | Orientação | JSX texto | P1 | opt_orientation | Orientation |  |
| 57 | apps/web/src/ui/OptionsBar.tsx:202 | Líder | JSX texto checkbox | P1 | opt_leader | Leader | reusa opt_leader |
| 58 | apps/web/src/ui/OptionsBar.tsx:216 | Deslocamento do topo | JSX texto | P0 | opt_top_offset | Top Offset | idem SlabOptionsBar.tsx:40 |
| 59 | apps/web/src/ui/OptionsBar.tsx:237 | Modo | JSX texto | P1 | opt_mode | Mode | idem GridOptionsBar.tsx:24 |
| 60 | apps/web/src/ui/OptionsBar.tsx:248 | Ao canto | opção select | P1 | opt_trim_corner | Trim/Extend to Corner |  |
| 61 | apps/web/src/ui/OptionsBar.tsx:249 | Um elemento | opção select | P1 | opt_trim_single | Trim/Extend Single Element |  |
| 62 | apps/web/src/ui/OptionsBar.tsx:250 | Vários | opção select | P1 | opt_trim_multi | Trim/Extend Multiple Elements |  |
| 63 | apps/web/src/ui/OptionsBar.tsx:257 | Copiar | JSX texto checkbox | P1 | opt_copy | Copy | reusa tool_copy; repetido em L263 (Espelhar) e L299 (Deslocar) |
| 64 | apps/web/src/ui/OptionsBar.tsx:295 | Distância inválida ({texto}): digite uma distância válida, maior que zero. Mantida: {valor}. | status/validação | P1 | opt_invalid_distance | Invalid distance ({value}): enter a valid distance greater than zero. Kept: {current}. | interpolação montada em JS; formatQuantity não recebe lang |
| 65 | apps/web/src/ui/OptionsBar.tsx:296 | Pronto. | status | P2 | status_ready | Ready. | estado inicial em state.ts:337; startsWith('Distância inválida') também depende do texto |
| 66 | apps/web/src/ui/OptionsBar.tsx:304 | Medir distância | JSX texto | P1 | opt_measure_distance | Measure distance |  |
| 67 | apps/web/src/ui/OptionsBar.tsx:306 | Face a face (padrão) | opção select | P1 | opt_offset_face | Face to face (default) |  |
| 68 | apps/web/src/ui/OptionsBar.tsx:307 | Entre eixos | opção select | P1 | opt_offset_axis | Between axes |  |
| 69 | apps/web/src/ui/OptionsBar.tsx:313 | {n} selecionado(s) | JSX texto | P0 | opt_selected_count | {n} selected | plural por concatenação de 's' |
| 70 | apps/web/src/ui/OptionsBar.tsx:313 | Nada selecionado | JSX texto | P0 | opt_nothing_selected | Nothing selected |  |
| 71 | apps/web/src/ui/OptionsBar.tsx:315 | Excluir (Del) | JSX texto botão | P0 | opt_delete | Delete (Del) | reusa stt_delete 'Excluir' |
| 72 | apps/web/src/ui/SlabOptionsBar.tsx:17 | Inclinação | JSX texto | P0 | opt_slope | Slope | reusa tool_slope |
| 73 | apps/web/src/ui/SlabOptionsBar.tsx:25 | Clique na origem e na direção do caimento. Enter aplica o percentual. | JSX texto hint | P1 | opt_slope_hint | Click the origin and the fall direction. Enter applies the percentage. |  |
| 74 | apps/web/src/ui/SlabOptionsBar.tsx:32 | Tipo | JSX texto | P0 | opt_type | Type |  |
| 75 | apps/web/src/ui/SlabOptionsBar.tsx:40 | Deslocamento do topo | JSX texto | P0 | opt_top_offset | Top Offset |  |
| 76 | apps/web/src/ui/CeilingOptionsBar.tsx:15 | Tipo | JSX texto | P0 | opt_type | Type |  |
| 77 | apps/web/src/ui/CeilingOptionsBar.tsx:23 | Cota do topo | JSX texto | P0 | opt_height_offset | Height Offset From Level |  |
| 78 | apps/web/src/ui/CeilingOptionsBar.tsx:26 | Cria um forro em cada ambiente de circuito fechado do nível que ainda não tem forro; um só Ctrl+Z desfaz tudo | atributo title | P1 | opt_ceilings_all_title | Creates a ceiling in every closed-loop room on the level that does not have one yet; a single Ctrl+Z undoes it all |  |
| 79 | apps/web/src/ui/CeilingOptionsBar.tsx:27 | Forro em todos os ambientes | JSX texto botão | P1 | opt_ceilings_all | Ceilings in all rooms |  |
| 80 | apps/web/src/ui/RoofOptionsBar.tsx:22 | Tipo | JSX texto | P0 | opt_type | Type |  |
| 81 | apps/web/src/ui/RoofOptionsBar.tsx:30 | Inclinação | JSX texto | P0 | opt_slope | Slope |  |
| 82 | apps/web/src/ui/RoofOptionsBar.tsx:34 | Graus | JSX texto | P0 | opt_degrees | Degrees |  |
| 83 | apps/web/src/ui/RoofOptionsBar.tsx:38 | Balanço | JSX texto | P0 | opt_overhang | Overhang | idem PerimeterOptionsBar.tsx:39 |
| 84 | apps/web/src/ui/RoofOptionsBar.tsx:42 | Cota do beiral | JSX texto | P0 | opt_eave_height | Eave Height |  |
| 85 | apps/web/src/ui/RoofOptionsBar.tsx:46 | Volta à altura da parede mais alta do nível | atributo title | P1 | opt_eave_auto_title | Returns to the height of the tallest wall on the level |  |
| 86 | apps/web/src/ui/RoofOptionsBar.tsx:47 | Automática | JSX texto botão | P0 | opt_automatic | Automatic |  |
| 87 | apps/web/src/ui/RoofOptionsBar.tsx:50 | Criar e editar o perímetro pela faixa. Depois de criado, cada aresta se edita na planta. | JSX texto hint | P1 | opt_roof_hint | Create and edit the perimeter in the ribbon. Once created, each edge is edited in the plan. |  |
| 88 | apps/web/src/ui/RoofArrowOptionsBar.tsx:23 | Converter para águas livres | JSX texto botão | P0 | opt_roof_arrow_free | Convert to Free Form |  |
| 89 | apps/web/src/ui/StairOptionsBar.tsx:27 | Linha | const módulo | P1 | opt_line | Line | PRIMITIVES (L26-29) fixo |
| 90 | apps/web/src/ui/StairOptionsBar.tsx:28 | Arco | const módulo | P1 | opt_arc | Arc | idem PRIMITIVES |
| 91 | apps/web/src/ui/StairOptionsBar.tsx:54 | Sub-modo do croqui | atributo aria-label | P1 | stair_submode_aria | Sketch sub-mode |  |
| 92 | apps/web/src/ui/StairOptionsBar.tsx:57 | STAIR_SUBMODE_LABEL[m] | const PT (@hestia/tools) | P0 | stair_submode_* | (usar I18N) | rótulos Limites/Espelhos/Caminhada/Patamar/Concluir em packages/tools/src/stairSketchState.ts:10-14 |
| 93 | apps/web/src/ui/StairOptionsBar.tsx:62 | Tipo | JSX texto | P0 | opt_type | Type |  |
| 94 | apps/web/src/ui/StairOptionsBar.tsx:68 | Tipo da escada em edição: altere em Propriedades. | atributo title | P1 | stair_type_edit_title | Stair type being edited: change it in Properties. | ternário inline no title |
| 95 | apps/web/src/ui/StairOptionsBar.tsx:68 | Tipo usado na criação | atributo title | P1 | stair_type_create_title | Type used at creation |  |
| 96 | apps/web/src/ui/StairOptionsBar.tsx:76 | Método de desenho | atributo aria-label | P1 | stair_primitive_aria | Drawing method |  |
| 97 | apps/web/src/ui/StairOptionsBar.tsx:78 | Tab alterna linha e arco | atributo title | P1 | stair_tab_hint | Tab alternates line and arc |  |
| 98 | apps/web/src/ui/StairOptionsBar.tsx:82 | Pega a parede (eixo, faces ou núcleo conforme a captura), a linha de escada ou a aresta de laje ou piso sob o cursor | atributo title | P1 | stair_pick_title | Picks the wall (axis, faces or core according to snap), the stair line or the slab/floor edge under the cursor |  |
| 99 | apps/web/src/ui/StairOptionsBar.tsx:83 | Pegar linhas | JSX texto botão | P0 | opt_pick_lines | Pick Lines |  |
| 100 | apps/web/src/ui/StairOptionsBar.tsx:88 | Pega a cadeia de segmentos conectados até as pontas (ou o laço inteiro) | atributo title | P1 | stair_pick_chain_title | Picks the chain of connected segments to the ends (or the whole loop) |  |
| 101 | apps/web/src/ui/StairOptionsBar.tsx:89 | Corrente | JSX texto botão | P1 | opt_chain | Chain |  |
| 102 | apps/web/src/ui/StairOptionsBar.tsx:92 | Deslocamento (m) | JSX texto | P1 | opt_offset_m | Offset (m) | unidade fixa no rótulo |
| 103 | apps/web/src/ui/StairOptionsBar.tsx:98 | Espelhos | JSX texto | P0 | opt_risers | Risers |  |
| 104 | apps/web/src/ui/StairOptionsBar.tsx:101 | Distribui N espelhos igualmente entre os limites do lance | atributo title | P1 | opt_distribute_risers_title | Distributes N risers evenly between the run boundaries |  |
| 105 | apps/web/src/ui/StairOptionsBar.tsx:102 | Distribuir espelhos | JSX texto botão | P1 | opt_distribute_risers | Distribute Risers |  |
| 106 | apps/web/src/ui/StairOptionsBar.tsx:104 | Apaga a camada do sub-modo atual (Del) | atributo title | P1 | opt_clear_layer_title | Clears the current sub-mode layer (Del) |  |
| 107 | apps/web/src/ui/StairOptionsBar.tsx:105 | Apagar camada | JSX texto botão | P1 | opt_clear_layer | Clear Layer |  |
| 108 | apps/web/src/ui/StairOptionsBar.tsx:107 | counterText(st) | status | P1 | stair_counter | (usar I18N) | texto gerado em packages/tools/src/stairSketchState.ts:223-226 |
| 109 | apps/web/src/ui/StairOptionsBar.tsx:110 | note.text | status | P1 | stair_note_* | (usar I18N) | firstError/issues vêm em PT de packages/tools (ex.: stair-width-min L213); missingText em stairSketchState.ts:217 |
| 110 | apps/web/src/ui/StairOptionsBar.tsx:116 | Nível de topo | JSX texto | P0 | ramp_levels_top | (já existe) Top level | reusa chave existente do i18n |
| 111 | apps/web/src/ui/StairOptionsBar.tsx:118 | Automático (nível acima) | opção select | P0 | ramp_levels_auto | (já existe) Automatic (level above) |  |
| 112 | apps/web/src/ui/StairOptionsBar.tsx:120 | Até {nível} | opção select | P0 | ramp_levels_until | (já existe) Up to | template com nome do nível (dado) |
| 113 | apps/web/src/ui/StairOptionsBar.tsx:125 | Desloc. da base | JSX texto | P0 | ramp_levels_base_offset | (já existe) Base offset |  |
| 114 | apps/web/src/ui/StairOptionsBar.tsx:129 | Desloc. do topo | JSX texto | P0 | ramp_levels_top_offset | (já existe) Top offset |  |
| 115 | apps/web/src/ui/StairOptionsBar.tsx:134 | Altura | JSX texto | P0 | opt_height | Height |  |
| 116 | apps/web/src/ui/StairOptionsBar.tsx:140 | Grava a escada (Enter em Concluir) | atributo title | P1 | stair_finish_title | Writes the stair (Enter on Finish) |  |
| 117 | apps/web/src/ui/StairOptionsBar.tsx:141 | Concluir | JSX texto botão | P0 | btn_finish | Finish | mesmo rótulo do Concluir do perímetro |
| 118 | apps/web/src/ui/StairRunOptionsBar.tsx:11 | Clique o centro do 1º espelho, depois a direção de subida (ou digite o ângulo em graus). | const módulo hint | P1 | stairrun_hint_dir | Click the center of the 1st riser, then the run direction (or type the angle in degrees). | mesma string em L11-14 para reta/L/U/leque; HINT é const fora do componente |
| 119 | apps/web/src/ui/StairRunOptionsBar.tsx:15 | Caracol: clique o centro, o raio externo e o ângulo inicial; gire para a varredura (ou digite os valores). Enter confirma. | const módulo hint | P1 | stairrun_hint_spiral | Spiral: click the center, the outer radius and the start angle; drag for the sweep (or type the values). Enter confirms. |  |
| 120 | apps/web/src/ui/StairRunOptionsBar.tsx:16 | Escada livre: clique os pontos do trajeto; Enter conclui, A ajusta, Backspace volta. | const módulo hint | P1 | stairrun_hint_free | Free stair: click the path points; Enter finishes, A adjusts, Backspace goes back. |  |
| 121 | apps/web/src/ui/StairRunOptionsBar.tsx:44 | Forma | JSX texto | P0 | opt_shape | Shape |  |
| 122 | apps/web/src/ui/StairRunOptionsBar.tsx:57 | STAIR_RUN_SHAPE_LABEL[shape] | const PT (@hestia/tools) | P0 | stair_shape_* | (usar I18N) | 5 rótulos PT em packages/tools/src/stairRunPlan.ts:28-32; só 'Livre' vem de t.stair_shape_free |
| 123 | apps/web/src/ui/StairRunOptionsBar.tsx:64 | Largura | JSX texto | P0 | opt_width | Width |  |
| 124 | apps/web/src/ui/StairRunOptionsBar.tsx:70 | Prof. patamar | JSX texto | P1 | opt_landing_depth | Landing Depth |  |
| 125 | apps/web/src/ui/StairRunOptionsBar.tsx:74 | largura | atributo placeholder | P1 | opt_landing_ph | width | placeholder do patamar |
| 126 | apps/web/src/ui/StairRunOptionsBar.tsx:84 | Giro | JSX texto | P1 | opt_turn | Turn |  |
| 127 | apps/web/src/ui/StairRunOptionsBar.tsx:86 | À esquerda | opção select | P1 | opt_turn_left | Left |  |
| 128 | apps/web/src/ui/StairRunOptionsBar.tsx:87 | À direita | opção select | P1 | opt_turn_right | Right |  |
| 129 | apps/web/src/ui/StairRunOptionsBar.tsx:94 | Raio interno (m) | JSX texto | P1 | opt_spiral_inner | Inner Radius (m) |  |
| 130 | apps/web/src/ui/StairRunOptionsBar.tsx:98 | Raio externo (m) | JSX texto | P1 | opt_spiral_outer | Outer Radius (m) |  |
| 131 | apps/web/src/ui/StairRunOptionsBar.tsx:102 | clique (1,00) | atributo placeholder | P1 | opt_spiral_outer_ph | click (1.00) | vírgula decimal fixa |
| 132 | apps/web/src/ui/StairRunOptionsBar.tsx:110 | Varredura (°) | JSX texto | P1 | opt_spiral_sweep | Sweep (°) |  |
| 133 | apps/web/src/ui/StairRunOptionsBar.tsx:114 | clique | atributo placeholder | P1 | opt_click_ph | click |  |
| 134 | apps/web/src/ui/StairRunOptionsBar.tsx:123 | Sentido | JSX texto | P1 | opt_spiral_sense | Direction |  |
| 135 | apps/web/src/ui/StairRunOptionsBar.tsx:125 | Anti-horário | opção select | P1 | opt_ccw | Counterclockwise |  |
| 136 | apps/web/src/ui/StairRunOptionsBar.tsx:126 | Horário | opção select | P1 | opt_cw | Clockwise |  |
| 137 | apps/web/src/ui/StairRunOptionsBar.tsx:132 | Tipo | JSX texto | P0 | opt_type | Type |  |
| 138 | apps/web/src/ui/RampOptionsBar.tsx:10 | Reta | const módulo | P0 | opt_shape_line | Straight | SHAPE_LABEL fixo; 'Livre' vem de t.ramp_shape_free |
| 139 | apps/web/src/ui/RampOptionsBar.tsx:10 | Em L | const módulo | P0 | opt_shape_l | L-Shape | idem SHAPE_LABEL |
| 140 | apps/web/src/ui/RampOptionsBar.tsx:10 | Em U | const módulo | P0 | opt_shape_u | U-Shape | idem SHAPE_LABEL |
| 141 | apps/web/src/ui/RampOptionsBar.tsx:42 | Forma | JSX texto | P0 | opt_shape | Shape |  |
| 142 | apps/web/src/ui/RampOptionsBar.tsx:48 | Largura | JSX texto | P0 | opt_width | Width |  |
| 143 | apps/web/src/ui/RampOptionsBar.tsx:52 | {largura padrão}.toFixed(2).replace('.', ',') | formatação numérica | P2 | - | (usar fmtNum) | vírgula decimal fixa no placeholder mesmo em EN; padrão em fonte |
| 144 | apps/web/src/ui/RampOptionsBar.tsx:61 | Giro | JSX texto | P1 | opt_turn | Turn |  |
| 145 | apps/web/src/ui/RampOptionsBar.tsx:63 | À esquerda | opção select | P1 | opt_turn_left | Left |  |
| 146 | apps/web/src/ui/RampOptionsBar.tsx:64 | À direita | opção select | P1 | opt_turn_right | Right |  |
| 147 | apps/web/src/ui/RampOptionsBar.tsx:70 | Profundidade do patamar | JSX texto | P1 | opt_landing_depth | Landing Depth |  |
| 148 | apps/web/src/ui/RampOptionsBar.tsx:74 | {patamar padrão}.toFixed(2).replace('.', ',') | formatação numérica | P2 | - | (usar fmtNum) | mesmo problema do placeholder de largura |
| 149 | apps/web/src/ui/RampOptionsBar.tsx:83 | Modo de entrada | JSX texto | P0 | opt_input_mode | Input Mode |  |
| 150 | apps/web/src/ui/RampOptionsBar.tsx:97 | Tipo | JSX texto | P0 | opt_type | Type |  |
| 151 | apps/web/src/ui/GridOptionsBar.tsx:24 | Modo | JSX texto | P1 | opt_mode | Mode |  |
| 152 | apps/web/src/ui/GridOptionsBar.tsx:26 | GRID_MODES[m].label | const PT (gridUi.ts) | P1 | grid_mode_* | (usar I18N) | rótulos fixos em apps/web/src/ui/gridUi.ts:7-10 |
| 153 | apps/web/src/ui/GridOptionsBar.tsx:30 | Tipo | JSX texto | P0 | opt_type | Type |  |
| 154 | apps/web/src/ui/GridOptionsBar.tsx:36 | Editar tipo… | JSX texto botão | P1 | edit_type_btn | (já existe) Edit Type + '…' | chave existente sem reticências |
| 155 | apps/web/src/ui/gridUi.ts:7 | Linha | const módulo | P1 | grid_mode_line | Line | GRID_MODES |
| 156 | apps/web/src/ui/gridUi.ts:8 | Arco | const módulo | P1 | grid_mode_arc | Arc | GRID_MODES |
| 157 | apps/web/src/ui/gridUi.ts:9 | Escolher linhas | const módulo | P1 | grid_mode_pick | Pick Lines | GRID_MODES |
| 158 | apps/web/src/ui/gridUi.ts:10 | Multissegmento | const módulo | P1 | grid_mode_multi | Multi-Segment | GRID_MODES |
| 159 | apps/web/src/ui/perimeter/PerimeterStatus.ts:8 | Perímetro do telhado | const módulo | P0 | pm_title_roof | Roof Perimeter | PERIMETER_TITLE; título do grupo nas Propriedades |
| 160 | apps/web/src/ui/perimeter/PerimeterStatus.ts:9 | Perímetro do piso | const módulo | P0 | pm_title_floor | Floor Perimeter |  |
| 161 | apps/web/src/ui/perimeter/PerimeterStatus.ts:10 | Perímetro da laje | const módulo | P0 | pm_title_slab | Slab Perimeter |  |
| 162 | apps/web/src/ui/perimeter/PerimeterStatus.ts:11 | Perímetro do forro | const módulo | P0 | pm_title_ceiling | Ceiling Perimeter |  |
| 163 | apps/web/src/ui/perimeter/PerimeterStatus.ts:16 | Criar perímetro do telhado | const módulo | P0 | pm_tool_roof | Create Roof Perimeter | já existe PERIMETER_TOOL_EN L24; usar I18N em vez de duas tabelas |
| 164 | apps/web/src/ui/perimeter/PerimeterStatus.ts:17 | Criar perímetro do piso | const módulo | P0 | pm_tool_floor | Create Floor Perimeter | idem |
| 165 | apps/web/src/ui/perimeter/PerimeterStatus.ts:18 | Criar perímetro da laje | const módulo | P0 | pm_tool_slab | Create Slab Perimeter | idem |
| 166 | apps/web/src/ui/perimeter/PerimeterStatus.ts:19 | Criar perímetro do forro | const módulo | P0 | pm_tool_ceiling | Create Ceiling Perimeter | idem |
| 167 | apps/web/src/ui/perimeter/PerimeterStatus.ts:31 | o telhado | const módulo | P1 | pm_saves_roof | the roof | GRAVA: compõe sketchStatus e finishTitle |
| 168 | apps/web/src/ui/perimeter/PerimeterStatus.ts:31 | o piso | const módulo | P1 | pm_saves_floor | the floor | idem GRAVA |
| 169 | apps/web/src/ui/perimeter/PerimeterStatus.ts:31 | a laje | const módulo | P1 | pm_saves_slab | the slab | idem GRAVA |
| 170 | apps/web/src/ui/perimeter/PerimeterStatus.ts:31 | o forro | const módulo | P1 | pm_saves_ceiling | the ceiling | idem GRAVA |
| 171 | apps/web/src/ui/perimeter/PerimeterStatus.ts:34 | Laço aberto: uma ponta não encontra outra linha. | const módulo | P0 | pm_issue_open | Open loop: one end does not meet another line. | ISSUE_TEXT; mensagem principal da barra de status ao fechar o contorno |
| 172 | apps/web/src/ui/perimeter/PerimeterStatus.ts:35 | Laço com menos de três lados. | const módulo | P0 | pm_issue_too_few | Loop with fewer than three sides. |  |
| 173 | apps/web/src/ui/perimeter/PerimeterStatus.ts:36 | Há uma linha de comprimento zero. | const módulo | P0 | pm_issue_zero_length | There is a zero-length line. |  |
| 174 | apps/web/src/ui/perimeter/PerimeterStatus.ts:37 | Uma linha cruza outra do mesmo laço. | const módulo | P0 | pm_issue_self_cross | One line crosses another in the same loop. |  |
| 175 | apps/web/src/ui/perimeter/PerimeterStatus.ts:38 | Linhas colineares se sobrepõem. | const módulo | P1 | pm_issue_overlap | Collinear lines overlap. |  |
| 176 | apps/web/src/ui/perimeter/PerimeterStatus.ts:39 | Dois laços se cruzam. | const módulo | P1 | pm_issue_loops_cross | Two loops cross. |  |
| 177 | apps/web/src/ui/perimeter/PerimeterStatus.ts:40 | Dois laços se tocam. | const módulo | P1 | pm_issue_loops_touch | Two loops touch. |  |
| 178 | apps/web/src/ui/perimeter/PerimeterStatus.ts:41 | O furo não fica inteiro dentro do contorno externo. | const módulo | P1 | pm_issue_hole_outside | The hole is not entirely inside the outer boundary. |  |
| 179 | apps/web/src/ui/perimeter/PerimeterStatus.ts:42 | Um laço dentro de furo não é permitido. | const módulo | P1 | pm_issue_hole_in_hole | A loop inside a hole is not allowed. |  |
| 180 | apps/web/src/ui/perimeter/PerimeterStatus.ts:43 | Há dois contornos externos separados. | const módulo | P1 | pm_issue_multi_outer | There are two separate outer boundaries. |  |
| 181 | apps/web/src/ui/perimeter/PerimeterStatus.ts:44 | Não há linhas para formar um contorno. | const módulo | P1 | pm_issue_empty | There are no lines to form a boundary. |  |
| 182 | apps/web/src/ui/perimeter/PerimeterStatus.ts:60 | Criar perímetro do telhado: clique nos vértices para ajustar. O triângulo de cada aresta define a inclinação. Use Aparar/Estender, Dividir e Deslocar nas linhas para fechar o contorno. Concluir grava, Cancelar descarta. | const módulo hint | P2 | pm_hint_roof | Create Roof Perimeter: click the vertices to adjust. Each edge's triangle defines the slope. Use Trim/Extend, Split and Offset on the lines to close the loop. Finish saves, Cancel discards. | perimeterHint/sketchStatus sem uso em src (só teste) |
| 183 | apps/web/src/ui/perimeter/PerimeterStatus.ts:62 | {ferramenta}: clique nos vértices para ajustar. Concluir grava, Cancelar descarta. | const módulo hint | P2 | pm_hint | {tool}: click the vertices to adjust. Finish saves, Cancel discards. | idem |
| 184 | apps/web/src/ui/perimeter/PerimeterStatus.ts:68 | Contorno fechado: Concluir grava {alvo}. | mensagem gerada | P2 | pm_loop_closed | Closed loop: Finish saves {target}. | sketchStatus não é chamado em src (só perimeter.test.ts) |
| 185 | apps/web/src/ui/perimeter/PerimeterStatus.ts:72 | {problema} Mais {n} problema(s) na lista. | mensagem gerada | P2 | pm_more_issues | {issue} {n} more issue(s) in the list. | plural por concatenação |
| 186 | apps/web/src/ui/perimeter/PerimeterStatus.ts:77 | Concluir perímetro (grava {alvo}) | mensagem gerada | P1 | pm_finish_title_ok | Finish Perimeter (saves {target}) | title do botão Concluir (vivo) |
| 187 | apps/web/src/ui/perimeter/PerimeterStatus.ts:79 | Concluir indisponível: {problema} | mensagem gerada | P1 | pm_finish_title_blocked | Finish unavailable: {issue} | title do botão Concluir |
| 188 | apps/web/src/ui/perimeter/PerimeterStatus.ts:79 | Concluir indisponível: desenhe um contorno fechado | mensagem gerada | P1 | pm_finish_title_empty | Finish unavailable: draw a closed loop |  |
| 189 | apps/web/src/ui/perimeter/PerimeterStatus.ts:93 | Aresta {n} | mensagem gerada | P2 | pm_edge_n | Edge {n} | edgeStatus sem uso em src (só teste) |
| 190 | apps/web/src/ui/perimeter/PerimeterStatus.ts:94 | Aresta {n}: {comprimento}. | mensagem gerada | P2 | pm_edge_length | Edge {n}: {length}. | formatQuantity não recebe lang |
| 191 | apps/web/src/ui/perimeter/PerimeterStatus.ts:95 | Aresta {n}: não define inclinação. | mensagem gerada | P2 | pm_edge_no_slope | Edge {n}: does not define slope. | idem |
| 192 | apps/web/src/ui/perimeter/PerimeterStatus.ts:96 | Aresta {n}: define inclinação ({valor}). | mensagem gerada | P2 | pm_edge_slope | Edge {n}: defines slope ({value}). | idem |
| 193 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:35 | Opções da ferramenta | atributo aria-label | P1 | opt_group_aria | Tool options | repetido em OptionsBar.tsx:142/145 |
| 194 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:36 | PERIMETER_TOOL[target] · PERIMETER_MODIFY_LABEL[modify] | const PT (@hestia/tools) | P0 | pm_tool_* + pm_modify_* | (usar I18N) | nome da barra sempre PT; PERIMETER_MODIFY_LABEL em packages/tools/src/perimeterModifyKind.ts:19-27 |
| 195 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:39 | Balanço | JSX texto | P0 | opt_overhang | Overhang |  |
| 196 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:45 | Deslocamento do nível | JSX texto | P0 | pm_level_offset | Level Offset |  |
| 197 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:56 | Vincular às paredes (esboço por perímetro) | JSX texto checkbox | P0 | pm_link_walls | Link to Walls (perimeter sketch) |  |
| 198 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:61 | Acompanhar o ambiente (esboço por ambiente) | JSX texto checkbox | P0 | pm_follow_room | Follow Room (room sketch) |  |
| 199 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:65 | Estender até o núcleo da parede | JSX texto checkbox | P0 | pm_extend_core | Extend to Wall Core |  |
| 200 | apps/web/src/ui/perimeter/PerimeterOptionsBar.tsx:69 | Inclinação padrão das arestas | JSX texto | P0 | pm_edge_slope | Default Edge Slope |  |
| 201 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:39 | Linha (contorno por pontos) | const label galeria | P0 | pm_shape_line | Line (boundary by points) | PERIMETER_SHAPES; vira title e aria-label dos botões |
| 202 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:42 | Retângulo | const label galeria | P0 | pm_shape_rect | Rectangle |  |
| 203 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:44 | Polígono inscrito | const label galeria | P1 | pm_shape_poly_in | Inscribed Polygon |  |
| 204 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:48 | Polígono circunscrito | const label galeria | P1 | pm_shape_poly_circ | Circumscribed Polygon |  |
| 205 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:51 | Círculo | const label galeria | P1 | pm_shape_circle | Circle |  |
| 206 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:53 | Arco (3 pontos) | const label galeria | P1 | pm_shape_arc3 | Arc (3 points) |  |
| 207 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:57 | Arco (centro e extremidades) | const label galeria | P1 | pm_shape_arc_center | Arc (center and ends) |  |
| 208 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:60 | Arco tangente | const label galeria | P1 | pm_shape_arc_tangent | Tangent Arc |  |
| 209 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:61 | Filete | const label galeria | P1 | pm_shape_fillet | Fillet |  |
| 210 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:62 | Elipse | const label galeria | P1 | pm_shape_ellipse | Ellipse |  |
| 211 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:64 | Escolher face ou eixo (parede, piso, referência) | const label galeria | P1 | pm_shape_pick_face | Pick Face or Axis (wall, floor, reference) |  |
| 212 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:68 | Por perímetro (caixa de seleção, contorno externo) | const label galeria | P1 | pm_shape_by_perimeter | By Perimeter (selection box, outer boundary) |  |
| 213 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:72 | Por ambiente (contorno do ambiente fechado) | const label galeria | P1 | pm_shape_pick_room | By Room (closed room boundary) | só alvo forro |
| 214 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:111 | Modo | atributo aria-label | P1 | pm_panel_mode | Mode | aria do painel Modo |
| 215 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:113 | Concluir | atributo aria-label | P0 | btn_finish | Finish |  |
| 216 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:117 | Concluir | JSX texto botão | P0 | btn_finish | Finish |  |
| 217 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:119 | Cancelar (descarta o rascunho) | atributo title | P1 | pm_cancel_title | Cancel (discards the sketch) |  |
| 218 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:119 | Cancelar | atributo aria-label | P0 | stt_cancel | (já existe) Cancel | reusa chave de diálogo |
| 219 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:123 | Cancelar | JSX texto botão | P0 | stt_cancel | (já existe) Cancel |  |
| 220 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:126 | Modo | JSX texto | P1 | pm_panel_mode | Mode | título do painel |
| 221 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:129 | Desenhar | atributo aria-label | P1 | pm_panel_draw | Draw |  |
| 222 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:132 | Linha de limite | atributo title + aria-label | P0 | pm_line_boundary | Boundary Line |  |
| 223 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:137 | Linha de limite | JSX texto botão | P0 | pm_line_boundary | Boundary Line |  |
| 224 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:140 | Seta de inclinação | atributo title + aria-label | P0 | pm_slope_arrow | Slope Arrow |  |
| 225 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:145 | Seta de inclinação | JSX texto botão | P0 | pm_slope_arrow | Slope Arrow |  |
| 226 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:149 | Formas de desenho | atributo aria-label | P1 | pm_shapes_aria | Drawing shapes |  |
| 227 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:165 | Rolar para cima | atributo title + aria-label | P1 | pm_scroll_up | Scroll up |  |
| 228 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:166 | Rolar para baixo | atributo title + aria-label | P1 | pm_scroll_down | Scroll down |  |
| 229 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:169 | Recolher a galeria | atributo title + aria-label | P1 | pm_gallery_collapse | Collapse gallery | ternário; idem aria-label L170 |
| 230 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:169 | Expandir a galeria | atributo title + aria-label | P1 | pm_gallery_expand | Expand gallery | ternário; idem aria-label L170 |
| 231 | apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:179 | Desenhar | JSX texto | P1 | pm_panel_draw | Draw | título do painel |
| 232 | apps/web/src/ui/perimeter/PerimeterProps.tsx:43 | Aresta selecionada | JSX texto | P0 | pm_edge_selected | Selected Edge | grupo do perímetro nas Propriedades |
| 233 | apps/web/src/ui/perimeter/PerimeterProps.tsx:44 | {n} de {total} | JSX texto | P0 | pm_edge_of | {n} of {total} |  |
| 234 | apps/web/src/ui/perimeter/PerimeterProps.tsx:46 | Comprimento | JSX texto | P0 | pm_length | Length |  |
| 235 | apps/web/src/ui/perimeter/PerimeterProps.tsx:51 | Define inclinação | JSX texto | P0 | pm_defines_slope | Defines Slope |  |
| 236 | apps/web/src/ui/perimeter/PerimeterProps.tsx:53 | sim | JSX texto | P0 | pm_yes | yes |  |
| 237 | apps/web/src/ui/perimeter/PerimeterProps.tsx:53 | não (empena) | JSX texto | P0 | pm_no_gable | no (gable) |  |
| 238 | apps/web/src/ui/perimeter/PerimeterProps.tsx:56 | Inclinação | JSX texto | P0 | opt_slope | Slope |  |
| 239 | apps/web/src/ui/perimeter/PerimeterProps.tsx:59 | Inclinação (ângulo) | JSX texto | P0 | pm_slope_angle | Slope (angle) |  |
| 240 | apps/web/src/ui/perimeter/PerimeterProps.tsx:70 | Balanço da aresta | JSX texto | P0 | pm_edge_overhang | Edge Overhang |  |
| 241 | apps/web/src/ui/perimeter/perimeterEditavel.ts:17 | Editar perímetro / Edit Perimeter | ternário inline | P2 | ctx_edit_perimeter | Edit Perimeter | funciona, mas é dívida de padronização; item do menu de contexto |
| 242 | apps/web/src/ui/DisjoinCheck.tsx:5 | A parede se solta das paredes ligadas às suas pontas em vez de esticá-las | const módulo | P1 | opt_disjoin_hint | The wall detaches from walls attached to its ends instead of stretching them | DISJOIN_HINT; title do checkbox |
| 243 | apps/web/src/ui/DisjoinCheck.tsx:11 | Desconectar | JSX texto | P0 | opt_disjoin | Disjoin | usado em Mover/Rotacionar/Espelhar |
| 244 | apps/web/src/ui/RampLevelsFields.tsx:54 | Nível ativo | fallback | P1 | ramp_active_level | Active Level | arquivo compartilhado com PlacementProperties; fallback quando o nível não existe |
| 245 | apps/web/src/ui/fields.tsx:140 | variados | atributo placeholder | P1 | field_mixed | varied | componente compartilhado; aparece em todos os NumField das barras |
| 246 | apps/web/src/ui/fields.tsx:223 | tipo | JSX texto | P1 | field_from_type_badge | type | selo de parâmetro herdado do tipo |
| 247 | apps/web/src/ui/fields.tsx:223 | Parâmetro do tipo — edite em Editar tipo | atributo title | P2 | field_from_type_title | Type parameter — edit in Edit Type |  |
| 248 | packages/tools/src/stairSketchState.ts:10 | Limites | const módulo | P0 | stair_submode_boundary | Boundary | STAIR_SUBMODE_LABEL renderizado em StairOptionsBar.tsx:57 |
| 249 | packages/tools/src/stairSketchState.ts:11 | Espelhos | const módulo | P0 | stair_submode_riser | Riser | idem |
| 250 | packages/tools/src/stairSketchState.ts:12 | Caminhada | const módulo | P0 | stair_submode_path | Stair Path | idem |
| 251 | packages/tools/src/stairSketchState.ts:13 | Patamar | const módulo | P0 | stair_submode_landing | Landing | idem |
| 252 | packages/tools/src/stairSketchState.ts:14 | Concluir | const módulo | P0 | stair_submode_finish | Finish | idem |
| 253 | packages/tools/src/stairSketchState.ts:219 | Faltam {n} espelho(s) para concluir (de {total}). | mensagem gerada | P1 | stair_missing_risers | {n} more riser(s) to finish (of {total}). | missingText; renderizado em StairOptionsBar.tsx:110 |
| 254 | packages/tools/src/stairSketchState.ts:225 | Espelhos: {n} criados, {m} restantes / {m} a mais | mensagem gerada | P1 | stair_counter | Risers: {n} created, {m} remaining / {m} over | counterText; renderizado em StairOptionsBar.tsx:107 |

## Mistura PT/EN no mesmo arquivo
- `apps/web/src/ui/StairRunOptionsBar.tsx`: `t.stair_shape_free` traduz só "Livre" (`:57`); labels das outras formas vêm de `STAIR_RUN_SHAPE_LABEL` PT, e todos os rótulos de campo (`Forma`, `Largura`, `Giro`, `Sentido`…) são fixos.
- `apps/web/src/ui/RampOptionsBar.tsx`: `t.ramp_mode_*`, `t.ramp_prop_slope_target`, `t.ramp_shape_free` e `rampRiseText` estão traduzidos; `SHAPE_LABEL:10`, `Forma`, `Largura`, `Giro`, `Profundidade do patamar`, `Modo de entrada`, `Tipo` não.
- `apps/web/src/ui/perimeter/PerimeterStatus.ts`: `PERIMETER_TOOL_EN:23` é a única tabela EN; todo o resto (`:8-11`, `:16-19`, `:31`, `:34-44`, `:60-96`) é PT.
- `apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx`: `:203` monta `label: { pt, en }` corretamente, mas `:39-72`, `:111-179` são PT fixo.
- `apps/web/src/ui/OptionsBar.tsx`: nenhum `I18N`; mistura `TOOL_LABEL` (PT), texto JSX e mensagens de status.
- `apps/web/src/ui/ArrayOptionsBar.tsx`: único arquivo da área 100% no dicionário (nenhuma ocorrência).

## Riscos / testes que quebram
- `apps/web/src/ui/perimeter/perimeter.test.ts:142-152` — `expect(...).toBe('Contorno fechado: Concluir grava o telhado.')`, `'Concluir perímetro (grava o forro)'`, `'Aresta 1: define inclinação (30,0%).'`, `'Aresta 3: 3,50 m.'`: quebram ao traduzir `PerimeterStatus`.
- `apps/web/src/ui/OptionsBar.tsx:296` — o `onValid` depende do prefixo literal `'Distância inválida'`. Traduzir `:295` sem trocar o gate deixa o aviso preso na barra de status.
- `apps/web/src/editor/historyStatus.test.ts:23` — espera `'Pronto.'` (default de `state.ts:337`).
- `packages/tools/src/stairRunTool.test.ts:43` — espera `['Reta','Em L','Em U','Com leque','Caracol','Livre']` de `STAIR_RUN_SHAPE_LABEL`.
- `packages/tools/src/stairSpiralTool.test.ts:48` — espera `'Caracol'`.
- `packages/tools/src/attachRoof.test.ts:115-116` — espera `TOOL_LABEL.attachroof === 'Anexar topo'` e `detachroof === 'Desanexar topo'`; mexer em `TOOL_LABEL` para EN afeta também atalhos (`shortcutDefaults.ts:56,79`).
- `apps/web/src/ui/perimeter/PerimeterStatus.ts:76-96` (`finishTitle`/`edgeStatus`) e `:53` (`issueLines`) só têm chamadas em teste: ao traduzir, decidir se o código morto sai ou se será religado.
- `stairActions.ts:69` devolve `firstError`/`issue.message` produzidos em `packages/tools` (ex.: `stairSketchState.ts:213` "A largura do lance…"); traduzir só a barra deixa a nota do croqui meio PT/meio EN.

## Já correto
- `apps/web/src/ui/ArrayOptionsBar.tsx` — todos os rótulos e mensagens via `t.arr_*` (PT/EN completos em `i18n.ts:153-164` e `:491-502`).
- `apps/web/src/ui/RampOptionsBar.tsx:103` + `apps/web/src/ui/RampLevelsFields.tsx:32-35` — `rampRiseText` usa `fmtNum(rise, 2, lang)`; campos de níveis via `t.ramp_levels_*` (exceto o fallback `'Nível ativo'`, inventariado).
- `apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:191-203` — rótulo da aba contextual com `{ pt, en }` e `PERIMETER_TOOL_EN`.
- `apps/web/src/ui/perimeter/perimeter.css` — só comentários e `content: ''`; nenhuma string visível.
- `apps/web/src/ui/StairRunOptionsBar.tsx:57` — a forma "Livre" já vem de `t.stair_shape_free` (as demais não).
