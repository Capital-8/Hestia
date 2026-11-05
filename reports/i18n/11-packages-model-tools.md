# Pacotes `model` e `tools` (11)

- Escopo: `packages/model/src/**` (167 arquivos) e `packages/tools/src/**` (375 arquivos) — só código de produção; testes lidos apenas para a seção de riscos.
- Arquivos analisados: 542 (varredura por grep dirigido, incluindo `dims/**` e `pasteLevels/**`); 93 arquivos com ocorrências.
- Ocorrências: 354 (P0: 62, P1: 275, P2: 17).

## Resumo executivo

O pacote `tools` já tem o contrato certo e **não o usa**: `ToolEnv.lang?()` existe em `packages/tools/src/types.ts:102` e o app o alimenta em `apps/web/src/editor/controller.ts:205`, mas o **único** consumidor é o `ArrayTool` (`arrayTool.ts:75-76`). Todas as outras ~40 ferramentas montam `hint`, `inputPrompt()` e `env.say(...)` em PT fixo — são 58 dicas, 21 prompts e 113 mensagens de status/erro catalogadas aqui que nunca trocam de idioma.

O segundo vazamento é o registro: `TOOL_LABEL` (43 rótulos PT) e `TOOL_GROUPS` (`Construir/Modificar/Anotar/Medir`) são consumidos **crus** pela UI — `OptionsBar.tsx:142,146`, `Properties.tsx:433` e `ShortcutsConfigDialog.tsx:16,120` — em vez de `toolLabel(id, lang)`/`grp_*` que já existem no `I18N`.

No pacote `model` não há i18n nenhum: nenhuma função recebe idioma. Por isso os **nomes padrão nascem em PT e ficam gravados no documento** (`Projeto sem título`, `Térreo`, `Pavimento 2`, `Vista 3D`, `… cópia`), junto com 19 materiais, 5 tipos de parede, 24 tipos de abertura, 5 pisos, 4 lajes, 3 telhados, 3 forros, 4 escadas, 2 rampas, 8 categorias de ambiente e todo o catálogo de esquadrias. Nomes de dados não traduzem depois de criados; a localização tem de acontecer **na criação** (parâmetro de idioma) ou o EN nunca conserta um arquivo existente.

A terceira fonte é a validação/erros do `model` (`validate.ts`, `validateRoofs/Slabs/Rooms`, `sectionView.ts`, `sheet.ts`, `graphics.ts`, `commands.ts`, `migrate.ts`) e os rótulos de enum que a UI lê direto (`GRAPHICS_CATEGORY_LABELS`, `FUNCTION_LABEL`, `SECTION_ROLE_LABEL`, `WALL/OPENING_DIM_REF_LABELS`, `OPENING_FAMILIES`, `DIM_READ_CONVENTION_OPTIONS`, `STAIR_*_LABEL`). Por fim, a formatação de escada/rampa força vírgula decimal (`replace('.', ',')`), então mesmo em EN os números saem em PT.

## Causas-raiz

1. **`env.lang` sem adoção** — `packages/tools/src/types.ts:102` declara `lang?(): 'pt' | 'en'`; `apps/web/src/editor/controller.ts:205` liga ao store; só `packages/tools/src/arrayTool.ts:75-76` lê. Nenhum outro `env.lang` no pacote (grep).
2. **Rótulos PT tratados como metadado** — `packages/tools/src/registry.ts:141` (`TOOL_LABEL`) e `registry.ts:45-48` (`TOOL_GROUPS[].title`). Consumidores diretos: `apps/web/src/ui/OptionsBar.tsx:142,146`, `apps/web/src/ui/Properties.tsx:433`, `apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:16,120`.
3. **`nomeComando()` duplica o que `nomeComandoLang()` já traduz** — `packages/tools/src/shortcutDefaults.ts:65-79`; usado em `apps/web/src/editor/shortcutConfig.ts:112,119,174` (mensagens de conflito/importação).
4. **`model` sem parâmetro de idioma** — `packages/model/src` não tem nenhuma ocorrência de `lang` em código de produção; `createEmptyProject` (`defaults.ts:171-177`), `nextLevelName` (`packages/tools/src/levelTool.ts:22-26`), `defaultView3DPointName` (`view3dPoints.ts:24-28`), `copyViewName` (`sectionView.ts:251-260`) e `duplicateOpeningType` (`openingTypeLibrary.ts:99`) gravam PT no documento.
5. **Catálogos/defaults embutidos em PT** — `defaults.ts:27-166`, `catalogoPortas.ts`, `catalogoJanelas.ts`, `catalogoComposicoes.ts`, `floor.ts:36-56`, `slab.ts:39-49`, `roof.ts:53-62`, `ceiling.ts:39-47`, `stair.ts:60-102`, `ramp.ts:56-76`.
6. **Rótulos de enum em `model`** — `graphics.ts:12-23`, `priority.ts:17-24`, `sectionView.ts:286-291`, `dimensionSettings.ts:39-51`, `dimensionFamily.ts:27-38`, `stairTypes.ts:152-164`, `opening.ts:153-173`.
7. **Mensagens de validação/erro em `model`** — 131 `throw new Error('…')` + ~90 `return '…'`/`push('…')`; exemplos: `validate.ts:60,119,140,168,214,253,273`, `sectionView.ts:35-76`, `sheet.ts:66,165-182`, `graphics.ts:280-336`, `commands.ts:304-571`, `migrate.ts:270-295`.
8. **Formatação com vírgula fixa** — `packages/model/src/ramp.ts:128,137`; `packages/tools/src/stairLiveMessages.ts:7`, `rampLiveMessages.ts:10`, `stairRunTool.ts:31,33`, `stairRunPlan.ts:140`, `rampTool.ts:23`.
9. **Duplicação de textos** — `stairLiveMessages.ts:4` e `rampLiveMessages.ts:7` têm a mesma string; `shortcutDefaults.ts:66-78` repete `nomeComandoLang` (`apps/web/src/editor/i18n.ts:722-737`); `rampTool.ts:14-16` e `stairRunTool.ts:16-20` repetem o mesmo padrão de dica.
10. **Testes acoplados ao PT** — ver seção de riscos; qualquer troca de literal quebra dezenas de `toBe`.

## Inventário

| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | `packages/tools/src/registry.ts:45` | Construir | metadado | P1 | grp_build | Build | TOOL_GROUPS[0].title; consumido cru em ShortcutsConfigDialog.tsx:120 |
| 2 | `packages/tools/src/registry.ts:46` | Modificar | metadado | P1 | grp_modify | Modify | TOOL_GROUPS[1].title; i18n.ts:48 ja tem grp_modify |
| 3 | `packages/tools/src/registry.ts:47` | Anotar | metadado | P1 | grp_annotate | Annotate | TOOL_GROUPS[2].title; i18n.ts:42 ja tem grp_annotate |
| 4 | `packages/tools/src/registry.ts:48` | Medir | metadado | P1 | grp_measure | Measure | TOOL_GROUPS[3].title; i18n.ts:50 ja tem grp_measure |
| 5 | `packages/tools/src/registry.ts:141` | TOOL_LABEL | metadado | P2 | tool_{id} | - | Manter como fallback; a UI deve usar toolLabel(id, lang). OptionsBar.tsx:142/146 e Properties.tsx:433 ainda leem TOOL_LABEL |
| 6 | `packages/tools/src/shortcutDefaults.ts:51` | Revit (duas letras) | metadado | P1 | shc_profile_revit | Revit (two letters) | PERFIL_NOMES exibido em ShortcutsConfigDialog.tsx:98 |
| 7 | `packages/tools/src/shortcutDefaults.ts:51` | Simples (uma tecla) | metadado | P1 | shc_profile_simple | Simple (one key) | mesma linha de PERFIL_NOMES |
| 8 | `packages/tools/src/shortcutDefaults.ts:66` | Atalhos de teclado | mensagem | P1 | shc_shortcuts | Keyboard shortcuts | nomeComando() sem lang; nomeComandoLang() (i18n.ts:722) ja traduz |
| 9 | `packages/tools/src/shortcutDefaults.ts:69` | Ocultar temporariamente (elemento) | mensagem | P1 | shc_temp_hide_elem | Temporary Hide (Element) | bloco 69-78: 10 nomes de comandos de visibilidade duplicam nomeComandoLang (i18n.ts:726-736) |
| 10 | `packages/tools/src/shortcutDefaults.ts:79` | return TOOL_LABEL[cmd] | mensagem | P2 | tool_{id} | - | fallback PT de nomeComando(); shortcutConfig.ts:112/119/174 usa a versao sem lang em mensagens de conflito |
| 11 | `apps/web/src/ui/OptionsBar.tsx:142` | TOOL_LABEL[tool] | rotulo enum | P0 | tool_{id} | Wall / Door / Window | barra de opcoes da ferramenta ativa (primeiro uso); deveria ser toolLabel(tool, lang) |
| 12 | `apps/web/src/ui/OptionsBar.tsx:146` | TOOL_LABEL[tool] | rotulo enum | P0 | tool_{id} | - | mesma barra no caminho generico (todas as ferramentas exceto o bloco da linha 141) |
| 13 | `apps/web/src/ui/Properties.tsx:433` | `Colocar ${TOOL_LABEL[tool]}` | mensagem | P0 | props_place_tool | Place {tool} | cabecalho do painel Propriedades durante a colocacao |
| 14 | `apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:16` | Outros | JSX texto | P1 | shc_other | Other | grupo fixo do dialogo de atalhos |
| 15 | `apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:120` | {g.titulo} | JSX texto | P1 | grp_build | const builder | cabecalho de grupo vem de TOOL_GROUPS.title (PT) |
| 16 | `packages/tools/src/alignTool.ts:44` | Alinhar: clique na referência e depois no que deseja alinhar. Ctrl+clique acumula vários; Tab alterna a feição sob o cursor; Esc volta um passo. | dica | P0 | th_align | Align: click the reference, then the item to align. Ctrl+click adds more; Tab cycles the feature under the cursor; Esc goes back one step. | getter hint -> barra de status |
| 17 | `packages/tools/src/angularDimensionTool.ts:60` | Cota angular: clique na primeira referência, depois na segunda. Mova o cursor para escolher o lado (interno = menor, externo = volta >180°) e o raio do arco; clique para criar. Tab alterna a referência. | dica | P1 | th_angdim | Angular dimension: click the first reference, then the second. Move the cursor to pick the side (inner = smaller, outer = reflex over 180) and the arc radius; click to create. Tab cycles the reference. |  |
| 18 | `packages/tools/src/attachRoofTool.ts:53` | Anexar topo: clique nas paredes (ou selecione-as antes) e depois Enter. Esc sai. | dica | P1 | th_attach_roof | Attach Top: click walls (or select them first), then Enter. Esc exits. |  |
| 19 | `packages/tools/src/attachRoofTool.ts:54` | Selecione o telhado: o topo das paredes escolhidas segue a face inferior dele. Enter volta às paredes. | dica | P1 | th_attach_roof_pick | Select the roof: the top of the chosen walls follows its underside. Enter returns to the walls. |  |
| 20 | `packages/tools/src/attachRoofTool.ts:188` | Desanexar topo: selecione as paredes e aperte Enter, ou clique numa parede anexada. Esc sai. | dica | P1 | th_detach_roof | Detach Top: select walls and press Enter, or click an attached wall. Esc exits. |  |
| 21 | `packages/tools/src/ceilingTool.ts:11` | Forro: crie o contorno pelo modo Criar/Editar perímetro. | dica | P1 | th_ceiling | Ceiling: create the outline with Create/Edit perimeter mode. |  |
| 22 | `packages/tools/src/detailLineTool.ts:13` | Linha de detalhe: clique no início e no fim. | dica | P1 | th_detail_line | Detail Line: click the start and the end. |  |
| 23 | `packages/tools/src/detailRegionTool.ts:10` | Região preenchida: clique nos vértices e pressione Enter para fechar. | dica | P1 | th_filled_region | Filled Region: click the vertices and press Enter to close. |  |
| 24 | `packages/tools/src/dimensionTool.ts:56` | Cota: clique no primeiro ponto medido, depois no segundo. Mova o cursor para o lado da linha de cota e clique (ou digite o deslocamento). | dica | P0 | th_dimension | Dimension: click the first measured point, then the second. Move the cursor to the dimension line side and click (or type the offset). |  |
| 25 | `packages/tools/src/floorTool.ts:10` | Piso: crie o contorno pelo modo Criar/Editar perímetro. | dica | P1 | th_floor | Floor: create the outline with Create/Edit perimeter mode. |  |
| 26 | `packages/tools/src/gridTool.ts:15` | Grade: clique no início e no fim do eixo, ou digite o comprimento e Enter. | dica | P1 | th_grid_line | Grid: click the axis start and end, or type the length and press Enter. |  |
| 27 | `packages/tools/src/gridTool.ts:16` | Grade em arco: clique no início, no fim e num ponto do arco (ou digite a flecha). | dica | P1 | th_grid_arc | Arc grid: click the start, the end and a point on the arc (or type the sagitta). |  |
| 28 | `packages/tools/src/gridTool.ts:17` | Grade: clique numa parede para criar a grade sobre o eixo dela. | dica | P1 | th_grid_pick | Grid: click a wall to create the grid along its axis. |  |
| 29 | `packages/tools/src/gridTool.ts:18` | Grade multissegmento: clique nos pontos; Enter ou duplo clique termina, Esc remove o último ponto. | dica | P1 | th_grid_multi | Multi-segment grid: click the points; Enter or double-click finishes, Esc removes the last point. |  |
| 30 | `packages/tools/src/joinTool.ts:25` | Junção: clique num canto de duas paredes para alternar Encosto e Esquadria (Tab inverte a dominância). Em T ou nó, clique para não unir a ponta. Escada/rampa: use Editar croqui. | dica | P1 | th_join | Join: click a corner of two walls to switch Butt and Miter (Tab flips dominance). At a T or node, click to disallow the join. Stair/ramp: use Edit Sketch. |  |
| 31 | `packages/tools/src/levelTool.ts:40` | Nível: clique no início da linha do nível. O fim fica na mesma cota. Esc cancela. | dica | P0 | th_level | Level: click the start of the level line. The end stays at the same elevation. Esc cancels. |  |
| 32 | `packages/tools/src/offsetTool.ts:21` | Deslocar: passe sobre uma parede, aresta de piso/laje/telhado/forro ou aresta do croqui de escada/rampa e clique para o lado desejado. A distância está na barra de opções. | dica | P1 | th_offset | Offset: hover a wall, a floor/slab/roof/ceiling edge or a stair/ramp sketch edge and click on the desired side. The distance is in the options bar. |  |
| 33 | `packages/tools/src/openingTool.ts:62` | ${this.label}: o lado do cursor define para onde abre; passe o cursor sobre uma parede e clique. Tab inverte o sentido, Espaço a dobradiça. | dica | P0 | th_opening | Door/Window: the cursor side sets the swing; hover a wall and click. Tab flips the hand, Space the hinge. |  |
| 34 | `packages/tools/src/parallelTool.ts:23` | Parede paralela: clique na parede de base e depois do lado desejado, ou digite a distância e Enter. Tab inverte o lado. A distância é medida face a face (padrão) ou entre eixos, conforme a barra de opções. Escada/rampa: use Editar croqui. | dica | P1 | th_parallel | Parallel Wall: click the base wall then the desired side, or type the distance and press Enter. Tab flips the side. Distance is face-to-face (default) or axis-to-axis, per the options bar. Stair/ramp: use Edit Sketch. |  |
| 35 | `packages/tools/src/pasteTool.ts:114` | Colar: clique para posicionar o conteúdo copiado. Esc cancela. | dica | P1 | th_paste | Paste: click to place the copied content. Esc cancels. |  |
| 36 | `packages/tools/src/perimeterTool.ts:26` | Perímetro: escolha uma forma na barra, ou clique numa linha para selecionar. Concluir fecha o contorno. | dica | P0 | th_perimeter | Perimeter: pick a shape in the bar, or click a line to select it. Finish closes the outline. |  |
| 37 | `packages/tools/src/perimeterTool.ts:27` | Selecione linhas: clique ou arraste uma janela (Shift soma, Ctrl subtrai, Ctrl+A todas). Delete remove. | dica | P1 | th_perim_select | Select lines: click or drag a window (Shift adds, Ctrl subtracts, Ctrl+A all). Delete removes. |  |
| 38 | `packages/tools/src/perimeterTool.ts:28` | Inclinação: clique no triângulo de uma aresta do contorno para ligar ou desligar. | dica | P1 | th_perim_slope | Slope: click the triangle on an outline edge to turn it on or off. |  |
| 39 | `packages/tools/src/perimeterToolInput.ts:76` | Linha numa face: passe sobre uma face, eixo ou borda do nível. Tab alterna; clique adiciona. | dica | P1 | th_perim_pick | Line on a face: hover a face, axis or level edge. Tab cycles; click adds. |  |
| 40 | `packages/tools/src/perimeterToolInput.ts:77` | Contorno pela caixa: arraste uma caixa sobre as paredes e solte. | dica | P1 | th_perim_box | Outline by box: drag a box over the walls and release. |  |
| 41 | `packages/tools/src/perimeterToolPick.ts:167` | Por ambiente: clique dentro de um ambiente com circuito fechado. O contorno dele entra no esboço. | dica | P1 | th_perim_room | By room: click inside a room with a closed loop. Its outline goes into the sketch. |  |
| 42 | `packages/tools/src/rampTool.ts:14` | Rampa: clique no centro da borda de início. Esc cancela. | dica | P0 | th_ramp | Ramp: click the center of the start edge. Esc cancels. |  |
| 43 | `packages/tools/src/rampTool.ts:15` | Rampa livre: clique o ponto inicial. Esc cancela. | dica | P1 | th_ramp_free | Free ramp: click the start point. Esc cancels. |  |
| 44 | `packages/tools/src/rampTool.ts:16` | Rampa: clique para dar a direção e o comprimento, ou digite o ângulo em graus (0 = eixo X). Esc cancela o ponto. | dica | P1 | th_ramp_dir | Ramp: click to set direction and length, or type the angle in degrees (0 = X axis). Esc cancels the point. |  |
| 45 | `packages/tools/src/rehostTool.ts:17` | Trocar anfitriã: clique na abertura a mover (ou selecione-a antes) e depois na nova parede. | dica | P1 | th_rehost | Rehost: click the opening to move (or select it first) and then the new wall. |  |
| 46 | `packages/tools/src/roofArrowTool.ts:11` | Seta de inclinação: clique no beiral da água e depois no ponto para onde ela sobe. A água sob o primeiro clique é alterada; fora de toda água, uma nova água cobre o contorno. | dica | P1 | th_roof_arrow | Slope Arrow: click the eave of the roof face, then the point it rises toward. The face under the first click changes; outside every face, a new face covers the outline. |  |
| 47 | `packages/tools/src/roofExtrusionTool.ts:17` | Telhado por extrusão: clique no primeiro canto e depois no canto oposto. O eixo da extrusão é o lado maior (Tab troca). | dica | P1 | th_roof_extrusion | Roof by Extrusion: click the first corner then the opposite corner. The extrusion axis is the longer side (Tab switches). |  |
| 48 | `packages/tools/src/roofTool.ts:11` | Telhado: use Criar/Editar perímetro na faixa. | dica | P0 | th_roof | Roof: use Create/Edit perimeter in the ribbon. |  |
| 49 | `packages/tools/src/roomSeparatorTool.ts:16` | Linha de separação: clique no ponto inicial e depois no ponto final. | dica | P1 | th_room_sep | Room Separator: click the start point then the end point. |  |
| 50 | `packages/tools/src/roomTool.ts:26` | Ambiente: aponte para um circuito fechado de paredes e clique dentro dele. | dica | P0 | th_room | Room: point to a closed loop of walls and click inside it. |  |
| 51 | `packages/tools/src/sectionEditTools.ts:64` | Mover no corte: arraste a seleção. Horizontal move a parede/abertura; vertical altera o peitoril da janela. Anotações também se movem. | dica | P1 | th_move_section | Move in section: drag the selection. Horizontal moves the wall/opening; vertical changes the window sill. Annotations move too. |  |
| 52 | `packages/tools/src/sectionEditTools.ts:329` | Alinhar no corte: clique na referência (topo, peitoril, ombreira ou centro) e depois no alvo. Não precisa selecionar. | dica | P1 | th_align_section | Align in section: click the reference (top, sill, jamb or center) then the target. No selection needed. |  |
| 53 | `packages/tools/src/sectionTool.ts:32` | Corte: clique no início da linha de corte. Esc cancela. | dica | P0 | th_section | Section: click the start of the section line. Esc cancels. |  |
| 54 | `packages/tools/src/selectTool.ts:58` | Clique para selecionar. Arraste para janela (esq→dir contém, dir→esq cruza). Shift ou Ctrl soma à seleção. | dica | P0 | th_select | Click to select. Drag for a window (left-to-right contains, right-to-left crosses). Shift or Ctrl adds to the selection. |  |
| 55 | `packages/tools/src/slabSlopeTool.ts:18` | Inclinação: selecione uma laje. Clique na origem do caimento e depois na direção. Enter aplica o percentual da barra. | dica | P1 | th_slab_slope | Slope: select a slab. Click the slope origin then the direction. Enter applies the bar percentage. |  |
| 56 | `packages/tools/src/slabTool.ts:11` | Laje: crie o contorno pelo modo Criar/Editar perímetro. | dica | P1 | th_slab | Slab: create the outline with Create/Edit perimeter mode. |  |
| 57 | `packages/tools/src/splitTool.ts:47` | Dividir: clique na parede (ponto de corte) ou numa aresta (insere vértice), inclusive do croqui de escada/rampa. Piso ou laje: dois cliques dividem. Digite a distância e Enter para medida exata. Tab: com intervalo. | dica | P1 | th_split | Split: click the wall (cut point) or an edge (inserts a vertex), including stair/ramp sketch edges. Floor or slab: two clicks split. Type the distance and Enter for an exact measure. Tab: with gap. |  |
| 58 | `packages/tools/src/stairRunTool.ts:16` | Escada: clique no centro do 1º espelho. Esc cancela. | dica | P0 | th_stair_run | Stair: click the center of the 1st riser. Esc cancels. |  |
| 59 | `packages/tools/src/stairRunTool.ts:17` | Escada livre: clique o ponto inicial (centro do 1º espelho). Esc cancela. | dica | P1 | th_stair_free | Free stair: click the start point (center of the 1st riser). Esc cancels. |  |
| 60 | `packages/tools/src/stairRunTool.ts:18` | Escada: clique para dar a direção de subida, ou digite o ângulo em graus (0 = eixo X). Esc cancela o ponto. | dica | P1 | th_stair_dir | Stair: click to set the run direction, or type the angle in degrees (0 = X axis). Esc cancels the point. |  |
| 61 | `packages/tools/src/stairRunTool.ts:19` | Caracol: clique no centro. Esc cancela. | dica | P1 | th_spiral_start | Spiral: click the center. Esc cancels. |  |
| 62 | `packages/tools/src/stairRunTool.ts:20` | Caracol: clique no raio externo e no ângulo inicial (ou digite o raio em metros). Backspace volta ao centro. | dica | P1 | th_spiral_radius | Spiral: click the outer radius and the start angle (or type the radius in meters). Backspace returns to the center. |  |
| 63 | `packages/tools/src/stairTool.ts:32` | Escada: desenhe o limite esquerdo; Enter passa ao direito e outro Enter vai a Espelhos. Esc cancela a cadeia; outro Esc descarta o croqui. | dica | P0 | th_stair_sketch | Stair: draw the left boundary; Enter moves to the right one and another Enter goes to Risers. Esc cancels the chain; another Esc discards the sketch. |  |
| 64 | `packages/tools/src/tagTool.ts:9` | Selecione um elemento, ative Etiqueta e clique onde posicionar o rótulo. | dica | P1 | th_tag | Select an element, start Tag and click where to place the label. |  |
| 65 | `packages/tools/src/textTool.ts:15` | Texto: clique no ponto onde o texto fica, digite o texto e Enter. | dica | P0 | th_text | Text: click where the text goes, type the text and press Enter. |  |
| 66 | `packages/tools/src/transformTools.ts:84` | ${this.label}: clique no ponto base e depois no destino, ou digite a distância. | dica | P0 | th_move | Move/Copy: click the base point then the destination, or type the distance. |  |
| 67 | `packages/tools/src/transformTools.ts:86` | Copiar: selecione elementos (Selecionar) para copiar. Uma aresta sozinha ainda não pode ser copiada (nem de piso/laje, nem do croqui de escada/rampa). | dica | P1 | th_edge_copy | Copy: select elements (Select) to copy. A single edge still cannot be copied (not from a floor/slab, nor from a stair/ramp sketch). |  |
| 68 | `packages/tools/src/transformTools.ts:87` | Mover: selecione elementos (Selecionar) ou clique numa aresta de piso, laje, telhado, forro ou do croqui de escada/rampa. | dica | P1 | th_edge_move | Move: select elements (Select) or click an edge of a floor, slab, roof, ceiling or a stair/ramp sketch. |  |
| 69 | `packages/tools/src/transformTools.ts:353` | Rotacionar: clique no centro, depois na direção de referência e na direção final — ou digite o ângulo em graus. | dica | P0 | th_rotate | Rotate: click the center, then the reference direction and the final direction - or type the angle in degrees. |  |
| 70 | `packages/tools/src/transformTools.ts:447` | Espelhar: clique em dois pontos para definir o eixo de simetria. Tab: pegar uma parede como eixo. | dica | P0 | th_mirror | Mirror: click two points to define the symmetry axis. Tab: pick a wall as the axis. |  |
| 71 | `packages/tools/src/trimAlign.ts:19` | Medir: clique em dois pontos. A cota fica no desenho até Esc ou um novo clique. | dica | P1 | th_measure | Measure: click two points. The dimension stays in the drawing until Esc or a new click. |  |
| 72 | `packages/tools/src/trimTool.ts:117` | Aparar/Estender: clique na parede de referência e depois na parede a estender, no lado que deve ficar. Arestas de piso/laje/telhado/forro ou do croqui de escada/rampa: duas arestas, como no canto. | dica | P0 | th_trim | Trim/Extend: click the reference wall then the wall to extend, on the side to keep. Floor/slab/roof/ceiling edges or stair/ramp sketch edges: two edges, as in the corner. |  |
| 73 | `packages/tools/src/wallTool.ts:22` | Parede: clique no ponto inicial. Tab alterna referências de alinhamento; Espaço inverte o lado. | dica | P0 | th_wall | Wall: click the start point. Tab cycles alignment references; Space flips the side. |  |
| 74 | `packages/tools/src/dimensionTool.ts:157` | Deslocamento | prompt | P1 | inp_offset | Offset | inputPrompt() -> campo numerico da barra de status |
| 75 | `packages/tools/src/gridTool.ts:87` | Flecha do arco | prompt | P1 | inp_arc_sagitta | Arc sagitta | inputPrompt(); tambem 'Comprimento' na mesma linha |
| 76 | `packages/tools/src/openingTool.ts:111` | Distância do início da parede | prompt | P1 | inp_wall_offset | Distance from wall start | inputPrompt() |
| 77 | `packages/tools/src/parallelTool.ts:45` | Distância | prompt | P1 | inp_distance | Distance | inputPrompt() |
| 78 | `packages/tools/src/perimeterTool.ts:277` | Comprimento | prompt | P1 | inp_length | Length | inputPrompt(); demais rotulos vem de sketchShapes.ts (SHAPE_KINDS) |
| 79 | `packages/tools/src/perimeterToolModifyMove.ts:20` | Distância (ou clique do lado) | prompt | P1 | inp_offset_click | Distance (or click the side) | transformPrompt() usado como inputPrompt() do perimetro |
| 80 | `packages/tools/src/perimeterToolModifyMove.ts:21` | Ângulo (graus) | prompt | P1 | inp_angle_deg | Angle (degrees) | transformPrompt() |
| 81 | `packages/tools/src/perimeterToolModifyMove.ts:22` | Quantidade | prompt | P1 | inp_count | Count | transformPrompt() (Matriz) |
| 82 | `packages/tools/src/rampTool.ts:70` | Comprimento (m) | prompt | P1 | inp_length_m | Length (m) | inputPrompt() |
| 83 | `packages/tools/src/rampTool.ts:71` | Ângulo (°) | prompt | P1 | inp_angle_deg | Angle (degrees) | inputPrompt() |
| 84 | `packages/tools/src/selectTool.ts:275` | Comprimento · Num nó, arrastar move todas as paredes ligadas. Alt solta só a pegada. | prompt | P1 | inp_wall_length | Length - at a node, dragging moves all connected walls. Alt releases only the grip. | inputPrompt() |
| 85 | `packages/tools/src/slabSlopeTool.ts:93` | Percentual (%) | prompt | P1 | inp_percent | Percentage (%) | inputPrompt() |
| 86 | `packages/tools/src/splitTool.ts:74` | Distância do início do trecho | prompt | P1 | inp_seg_offset | Distance from segment start | inputPrompt() |
| 87 | `packages/tools/src/stairRunTool.ts:126` | Comprimento (m) | prompt | P1 | inp_length_m | Length (m) | inputPrompt() |
| 88 | `packages/tools/src/stairRunTool.ts:129` | Raio externo (m) | prompt | P1 | inp_outer_radius | Outer radius (m) | inputPrompt() (caracol) |
| 89 | `packages/tools/src/stairRunTool.ts:129` | Varredura (°) | prompt | P1 | inp_sweep | Sweep (degrees) | inputPrompt() (caracol) |
| 90 | `packages/tools/src/stairTool.ts:261` | Comprimento | prompt | P1 | inp_length | Length | inputPrompt() |
| 91 | `packages/tools/src/textTool.ts:31` | Texto | prompt | P1 | inp_text | Text | inputPrompt() |
| 92 | `packages/tools/src/transformTools.ts:128` | Distância | prompt | P1 | inp_distance | Distance | inputPrompt() (Mover/Copiar) |
| 93 | `packages/tools/src/transformTools.ts:366` | Ângulo (graus) | prompt | P1 | inp_angle_deg | Angle (degrees) | inputPrompt() (Rotacionar) |
| 94 | `packages/tools/src/wallTool.ts:67` | Comprimento | prompt | P1 | inp_length | Length | inputPrompt(); tambem 'Flecha do arco' e 'Comprimento da corda' na mesma linha |
| 95 | `packages/tools/src/levelTool.ts:60` | Nível só funciona em corte/elevação. Abra um corte ou uma elevação. | mensagem | P1 | msg_level_section_only | Levels only work in section/elevation. Open a section or an elevation. | env.say -> barra de status |
| 96 | `packages/tools/src/levelTool.ts:127` | A linha do nível é horizontal: clique no fim na mesma cota do início. | mensagem | P1 | msg_level_horizontal | The level line is horizontal: click the end at the same elevation as the start. |  |
| 97 | `packages/tools/src/levelTool.ts:131` | A linha do nível está curta demais: clique mais longe do início. | mensagem | P1 | msg_level_short | The level line is too short: click farther from the start. |  |
| 98 | `packages/tools/src/levelTool.ts:148` | Nível ${level.name} criado em ${signedElevation(u, level.elevation)}. Clique no início do próximo nível. | mensagem | P0 | msg_level_created | Level {name} created at {elevation}. Click the start of the next level. |  |
| 99 | `packages/tools/src/wallTool.ts:78` | Lado externo à direita do sentido de desenho. | mensagem | P1 | msg_wall_side_right | Exterior side to the right of the draw direction. | env.say; variante 'a esquerda' na mesma linha |
| 100 | `packages/tools/src/wallTool.ts:134` | Retângulo muito estreito: afaste o canto oposto. | mensagem | P1 | msg_rect_narrow | Rectangle too narrow: move the opposite corner away. |  |
| 101 | `packages/tools/src/wallTool.ts:146` | Retângulo criado. Clique em outro canto para desenhar outro, ou Esc para sair. | mensagem | P1 | msg_rect_created | Rectangle created. Click another corner to draw another, or press Esc to exit. |  |
| 102 | `packages/tools/src/openingTool.ts:319` | ${openingType(pr, o).name} inserida. | mensagem | P1 | msg_opening_inserted | {type} inserted. | env.say; genero/concordancia muda com o idioma |
| 103 | `packages/tools/src/openingTool.ts:333` | Posição ocupada ou fora da parede. | mensagem | P1 | msg_opening_position | Position taken or outside the wall. |  |
| 104 | `packages/tools/src/perimeterTool.ts:181` | Inclinação por aresta só existe no telhado. | mensagem | P1 | msg_slope_roof_only | Edge slope only exists on roofs. |  |
| 105 | `packages/tools/src/perimeterTool.ts:204` | Perímetro concluído. | mensagem | P1 | msg_perimeter_done | Perimeter finished. |  |
| 106 | `packages/tools/src/perimeterTool.ts:215` | Perímetro descartado. | mensagem | P1 | msg_perimeter_discarded | Perimeter discarded. |  |
| 107 | `packages/tools/src/perimeterTool.ts:253` | Enter não conclui o perímetro: use o botão Concluir. | mensagem | P1 | msg_perimeter_enter | Enter does not finish the perimeter: use the Finish button. |  |
| 108 | `packages/tools/src/perimeterTool.ts:466` | Ponto repetido: clique noutro lugar. | mensagem | P1 | msg_point_repeated | Repeated point: click elsewhere. |  |
| 109 | `packages/tools/src/gridTool.ts:251` | Grade ${grid.name} criada. ${HINTS[mode]} | mensagem | P1 | msg_grid_created | Grid {name} created. {hint} |  |
| 110 | `packages/tools/src/joinTool.ts:103` | Junção: ${LABEL[kind]}${flip ? ', ordem invertida' : ''}. | mensagem | P1 | msg_join | Join: {type}{, reversed order}. |  |
| 111 | `packages/tools/src/joinTool.ts:171` | Não vira canto: a ponta está longe da extremidade da outra parede (no meio do vão). | mensagem | P1 | msg_join_far | Not a corner: the end is far from the other wall's endpoint (mid-span). |  |
| 112 | `packages/tools/src/trimTool.ts:304` | Nenhuma parede da lista pode ser aparada a essa referência (sem interseção ou arco fora de alcance). | mensagem | P1 | msg_trim_none | No wall in the list can be trimmed to that reference (no intersection or arc out of reach). |  |
| 113 | `packages/tools/src/trimTool.ts:374` | Shift+clique (várias) vale só para paredes. | mensagem | P1 | msg_trim_shift_walls | Shift+click (multiple) only applies to walls. |  |
| 114 | `packages/tools/src/trimTool.ts:434` | Arestas paralelas: não há canto. | mensagem | P1 | msg_trim_parallel | Parallel edges: no corner. |  |
| 115 | `packages/tools/src/stairRunTool.ts:377` | Não é possível criar a escada: ${r?.error ?? 'falha ao gravar.'} | mensagem | P0 | msg_stair_fail | Cannot create the stair: {error} |  |
| 116 | `packages/tools/src/stairRunTool.ts:384` | Escada criada: ${b.risers} espelhos de ${cm(b.riserHeight)} cm, piso ${cm(b.tread)} cm.${extra}${avisoText} Ctrl+Z desfaz. | mensagem | P0 | msg_stair_created | Stair created: {n} risers of {h} cm, tread {t} cm.{note} Ctrl+Z undoes. |  |
| 117 | `packages/tools/src/stairRunTool.ts:447` | Valor inválido. Digite o comprimento em metros. | mensagem | P1 | msg_invalid_length_m | Invalid value. Type the length in meters. |  |
| 118 | `packages/tools/src/stairRunTool.ts:535` | Afaste o cursor do centro para dar o raio externo. | mensagem | P1 | msg_spiral_radius | Move the cursor away from the center to set the outer radius. |  |
| 119 | `packages/tools/src/stairRunTool.ts:615` | Escada caracol criada: ${plan.risers} espelhos, varredura ${angleText(unitsOf(this.env.project()), plan.run.spiral.sweep)}.${extra} Ctrl+Z desfaz. | mensagem | P1 | msg_spiral_created | Spiral stair created: {n} risers, sweep {angle}.{note} Ctrl+Z undoes. |  |
| 120 | `packages/tools/src/stairRunTool.ts:625` | Valor inválido. Digite o raio externo em metros. | mensagem | P1 | msg_invalid_radius_m | Invalid value. Type the outer radius in meters. |  |
| 121 | `packages/tools/src/rampTool.ts:296` | O projeto não tem tipo de rampa. | mensagem | P1 | msg_no_ramp_type | The project has no ramp type. |  |
| 122 | `packages/tools/src/rampTool.ts:320` | Não é possível criar a rampa: ${r?.error ?? 'falha ao gravar.'} | mensagem | P0 | msg_ramp_fail | Cannot create the ramp: {error} |  |
| 123 | `packages/tools/src/rampTool.ts:326` | Rampa criada: ${flightsText(plan.flights)}, inclinação ${formatRampSlope(plan.slope)}, ${mText(plan.pathLength)} m.${nota}${avisoText} Ctrl+Z desfaz. | mensagem | P0 | msg_ramp_created | Ramp created: {flights}, slope {slope}, {length} m.{note} Ctrl+Z undoes. |  |
| 124 | `packages/tools/src/rampTool.ts:399` | Valor inválido. Digite o comprimento em metros. | mensagem | P1 | msg_invalid_length_m | Invalid value. Type the length in meters. |  |
| 125 | `packages/tools/src/roomTool.ts:75` | Ambiente ${room.number} criado: ${fmtArea(unitsOf(this.env.project()), polygonArea(polygon))}.${repeated ? ' Este circuito já tinha ambiente (aviso de duplicado).' : ''} Ctrl+Z desfaz. | mensagem | P0 | msg_room_created | Room {number} created: {area}.{warning} Ctrl+Z undoes. |  |
| 126 | `packages/tools/src/roomTool.ts:93` | Clique para criar o ambiente nesta área. | mensagem | P1 | msg_room_click | Click to create the room in this area. |  |
| 127 | `packages/tools/src/sectionTool.ts:89` | ${view.name} criado e aberto. Para voltar à planta, use a aba da planta. | mensagem | P1 | msg_section_created | {view} created and opened. To return to the plan, use the plan tab. |  |
| 128 | `packages/tools/src/selectTool.ts:281` | Comprimento: digite o valor em ${lengthUnitName(unitsOf(this.env.project()))} (aceita expressões) e Enter. | mensagem | P1 | msg_length_prompt | Length: type the value in {unit} (expressions allowed) and press Enter. |  |
| 129 | `packages/tools/src/selectTool.ts:293` | Valor inválido. Digite um número em ${lengthUnitName(unitsOf(this.env.project()))}. | mensagem | P1 | msg_invalid_number | Invalid value. Type a number in {unit}. |  |
| 130 | `packages/tools/src/selectTool.ts:322` | ${isSlab(f) ? 'Uma laje' : isRoof(f) ? 'Um telhado' : isCeiling(f) ? 'Um forro' : 'Um piso'} precisa de ao menos 3 vértices. | mensagem | P1 | msg_min_vertices | A slab/roof/ceiling/floor needs at least 3 vertices. |  |
| 131 | `packages/tools/src/splitTool.ts:326` | Parede dividida, com intervalo de ${fmt(unitsOf(this.env.project()), gap)}. | mensagem | P1 | msg_wall_split | Wall split with a {d} gap. / Wall split at {d} from the segment start. |  |
| 132 | `packages/tools/src/splitTool.ts:178` | Com intervalo vale só para paredes. | mensagem | P1 | msg_gap_walls_only | With gap only applies to walls. |  |
| 133 | `packages/tools/src/sectionEditTools.ts:113` | Movimento vertical de parede ainda não disponível; use as cotas/propriedades. | mensagem | P1 | msg_section_move_vertical | Vertical wall movement is not available yet; use dimensions/properties. |  |
| 134 | `packages/tools/src/sectionEditTools.ts:423` | O alvo não é uma janela, porta ou parede; nada foi alterado. | mensagem | P1 | msg_align_target_invalid | The target is not a window, door or wall; nothing changed. |  |
| 135 | `packages/tools/src/sectionEditTools.ts:495` | A referência fica baixa demais para o topo da parede; nada foi alterado. | mensagem | P1 | msg_ref_below_top | The reference is too low for the wall top; nothing changed. |  |
| 136 | `packages/tools/src/sectionEditTools.ts:522` | A aresta da parede é inclinada; alinhar não é seguro. Nada foi alterado. | mensagem | P1 | msg_edge_sloped | The wall edge is sloped; aligning is not safe. Nothing changed. |  |
| 137 | `packages/tools/src/alignTool.ts:170` | Alinhado. ${extra}Referência: ${this.ref.label}. Clique no próximo (Esc troca a referência). | mensagem | P1 | msg_aligned | Aligned. {extra}Reference: {ref}. Click the next one (Esc changes the reference). |  |
| 138 | `packages/tools/src/alignTool.ts:185` | Referência: ${cand.label}. Clique no que deseja alinhar (Tab troca a candidata). | mensagem | P1 | msg_align_reference | Reference: {ref}. Click what you want to align (Tab cycles the candidate). |  |
| 139 | `packages/tools/src/alignTool.ts:228` | Seleção múltipla cancelada. Referência: ${this.ref?.label ?? 'nenhuma'}. ${this.hint} | mensagem | P1 | msg_align_multi_cancel | Multiple selection cancelled. Reference: {ref}. {hint} |  |
| 140 | `packages/tools/src/angularDimensionTool.ts:302` | As duas referências são paralelas: escolha linhas que se cruzam. | mensagem | P1 | msg_angdim_parallel | The two references are parallel: choose lines that intersect. |  |
| 141 | `packages/tools/src/angularDimensionTool.ts:309` | Mova o cursor para o lado do ângulo e para o raio do arco; clique para criar a cota. | mensagem | P1 | msg_angdim_place | Move the cursor to the angle side and the arc radius; click to create the dimension. |  |
| 142 | `packages/tools/src/attachRoofTool.ts:143` | Clique sobre um telhado do nível atual. Enter volta às paredes. | mensagem | P1 | msg_attach_pick_roof | Click a roof on the current level. Enter returns to the walls. |  |
| 143 | `packages/tools/src/attachRoofTool.ts:237` | Nenhuma parede escolhida está anexada ao telhado. | mensagem | P1 | msg_attach_none | None of the chosen walls is attached to the roof. |  |
| 144 | `packages/tools/src/dimensionTool.ts:210` | Os dois pontos da cota são o mesmo: escolha outro ponto. | mensagem | P1 | msg_dim_same_point | The two dimension points are the same: choose another point. |  |
| 145 | `packages/tools/src/dimensionTool.ts:327` | O afastamento da cota não pode ser zero. | mensagem | P1 | msg_dim_offset_zero | The dimension offset cannot be zero. |  |
| 146 | `packages/tools/src/dimensionTool.ts:341` | ${pairs.length} cotas criadas na sequência. | mensagem | P1 | msg_dim_created | {n} dimensions created in the string. |  |
| 147 | `packages/tools/src/offsetTool.ts:120` | Deslocar aresta com cópia: não permitido. A cópia sobreporia a linha ou deixaria o croqui aberto (como no Revit). | mensagem | P1 | msg_offset_edge_copy | Offset edge with copy: not allowed. The copy would overlap the line or leave the sketch open (as in Revit). |  |
| 148 | `packages/tools/src/pasteTool.ts:175` | Não há o que colar neste nível. | mensagem | P1 | msg_paste_empty | There is nothing to paste on this level. |  |
| 149 | `packages/tools/src/rehostTool.ts:93` | A abertura não cabe nesta parede. | mensagem | P1 | msg_rehost_no_fit | The opening does not fit in this wall. |  |
| 150 | `packages/tools/src/roofArrowTool.ts:114` | Direção nula: afaste o segundo ponto do primeiro. | mensagem | P1 | msg_roof_dir_zero | Null direction: move the second point away from the first. |  |
| 151 | `packages/tools/src/roofExtrusionTool.ts:131` | Telhado não criado: ${problem} | mensagem | P1 | msg_roof_fail | Roof not created: {reason} |  |
| 152 | `packages/tools/src/roomSeparatorTool.ts:45` | Clique no ponto final da linha de separação. | mensagem | P1 | msg_roomsep_end | Click the end point of the room separator line. |  |
| 153 | `packages/tools/src/selectGrips.ts:159` | Parede com comprimento zero não existe: a ponta não pode encostar na outra. Use Excluir ou Juntar. | mensagem | P1 | msg_wall_zero_grip | A wall with zero length cannot exist: the end cannot touch the other. Use Delete or Join. |  |
| 154 | `packages/tools/src/slabSlopeTool.ts:130` | Inclinação de ${fmtPercent(unitsOf(this.env.project()), percent)} definida. Ctrl+Z desfaz. | mensagem | P1 | msg_slope_set | Slope of {pct} set. Ctrl+Z undoes. |  |
| 155 | `packages/tools/src/textTool.ts:61` | O texto não pode ser vazio. | mensagem | P1 | msg_text_empty | The text cannot be empty. |  |
| 156 | `packages/tools/src/tagTool.ts:26` | Etiqueta associada ao elemento. Selecione outro elemento para etiquetá-lo também. | mensagem | P1 | msg_tag_done | Tag associated with the element. Select another element to tag it too. |  |
| 157 | `packages/tools/src/trimAlign.ts:56` | Distância ${formatQuantity(u, 'length', d)} · ΔX ${formatQuantity(u, 'length', inf.point.x - this.a.x, { withUnit: false })} · ΔY ${formatQuantity(u, 'length', inf.point.y - this.a.y, { withUnit: false })} · ${formatQuantity(u, 'angle', (ang * Math.PI) / 180)} | mensagem | P1 | msg_measure | Distance {d} - dX {dx} - dY {dy} - {angle} | rotulos DX/DY e separador fixos |
| 158 | `packages/tools/src/sketchShapes.ts:143` | Linha | rotulo enum | P0 | shape_line | Line | SHAPE_KINDS: catalogo de formas do painel Perimetro |
| 159 | `packages/tools/src/sketchShapes.ts:144` | Retângulo | rotulo enum | P0 | shape_rectangle | Rectangle | SHAPE_KINDS |
| 160 | `packages/tools/src/sketchShapes.ts:147` | Retângulo girado | rotulo enum | P1 | shape_rot_rect | Rotated Rectangle | SHAPE_KINDS |
| 161 | `packages/tools/src/sketchShapes.ts:152` | Polígono inscrito | rotulo enum | P1 | shape_inscribed_poly | Inscribed Polygon | SHAPE_KINDS |
| 162 | `packages/tools/src/sketchShapes.ts:157` | Polígono circunscrito | rotulo enum | P1 | shape_circum_poly | Circumscribed Polygon | SHAPE_KINDS |
| 163 | `packages/tools/src/sketchShapes.ts:160` | Círculo | rotulo enum | P0 | shape_circle | Circle | SHAPE_KINDS |
| 164 | `packages/tools/src/sketchShapes.ts:163` | Arco por 3 pontos | rotulo enum | P0 | shape_arc_3p | Arc by 3 Points | SHAPE_KINDS |
| 165 | `packages/tools/src/sketchShapes.ts:168` | Arco centro-extremidades | rotulo enum | P1 | shape_arc_ce | Arc Center-Ends | SHAPE_KINDS |
| 166 | `packages/tools/src/sketchShapes.ts:173` | Arco tangente | rotulo enum | P1 | shape_arc_tan | Tangent Arc | SHAPE_KINDS |
| 167 | `packages/tools/src/sketchShapes.ts:178` | Concordância | rotulo enum | P0 | shape_fillet | Fillet | SHAPE_KINDS |
| 168 | `packages/tools/src/sketchShapes.ts:187` | Elipse | rotulo enum | P0 | shape_ellipse | Ellipse | SHAPE_KINDS |
| 169 | `packages/tools/src/sketchShapes.ts:144` | Primeiro canto | rotulo de parametro | P1 | shape_in_start | Start / End / First corner / Opposite corner | SHAPE_KINDS[].inputs[].label; rotulos de passo e prompt |
| 170 | `packages/tools/src/sketchShapes.ts:153` | Lados | rotulo de parametro | P1 | shape_in_center | Center / Vertex / Sides / Radius point / Tangent point | bloco 148-192 (~15 rotulos distintos) |
| 171 | `packages/tools/src/sketchShapes.ts:190` | Semieixo X | rotulo de parametro | P1 | shape_in_axis | Semi-axis X / Semi-axis Y / Rotation / Counterclockwise | bloco 169-192 |
| 172 | `packages/tools/src/perimeterModifyKind.ts:18` | Aparar/Estender | rotulo enum | P1 | pm_trim | Trim/Extend | PERIMETER_MODIFY_LABEL -> botoes do painel Modificar |
| 173 | `packages/tools/src/perimeterModifyKind.ts:19` | Dividir elemento | rotulo enum | P1 | pm_split | Split Element | PERIMETER_MODIFY_LABEL |
| 174 | `packages/tools/src/perimeterModifyKind.ts:20` | Deslocar | rotulo enum | P1 | pm_offset | Offset | PERIMETER_MODIFY_LABEL |
| 175 | `packages/tools/src/perimeterModifyKind.ts:21` | Mover | rotulo enum | P1 | pm_move | Move | PERIMETER_MODIFY_LABEL |
| 176 | `packages/tools/src/perimeterModifyKind.ts:22` | Copiar | rotulo enum | P1 | pm_copy | Copy | PERIMETER_MODIFY_LABEL |
| 177 | `packages/tools/src/perimeterModifyKind.ts:23` | Rotacionar | rotulo enum | P1 | pm_rotate | Rotate | PERIMETER_MODIFY_LABEL |
| 178 | `packages/tools/src/perimeterModifyKind.ts:24` | Espelhar | rotulo enum | P1 | pm_mirror | Mirror | PERIMETER_MODIFY_LABEL |
| 179 | `packages/tools/src/perimeterModifyKind.ts:25` | Matriz | rotulo enum | P1 | pm_array | Array | PERIMETER_MODIFY_LABEL |
| 180 | `packages/tools/src/perimeterModifyKind.ts:26` | Alinhar | rotulo enum | P1 | pm_align | Align | PERIMETER_MODIFY_LABEL |
| 181 | `packages/tools/src/perimeterModifyKind.ts:27` | Excluir | rotulo enum | P1 | pm_delete | Delete | PERIMETER_MODIFY_LABEL |
| 182 | `packages/tools/src/joinTool.ts:11` | Encosto | rotulo enum | P1 | join_butt | Butt | LABEL[join] -> etiqueta desenhada + barra de status |
| 183 | `packages/tools/src/joinTool.ts:11` | Esquadria | rotulo enum | P1 | join_miter | Miter | LABEL[join] |
| 184 | `packages/tools/src/stairSketchState.ts:10` | limites | rotulo enum | P1 | stt_sub_boundaries | Boundaries | STAIR_SUBMODE_LABEL -> status do croqui |
| 185 | `packages/tools/src/stairSketchState.ts:11` | espelhos | rotulo enum | P1 | stt_sub_risers | Risers | STAIR_SUBMODE_LABEL |
| 186 | `packages/tools/src/stairSketchState.ts:12` | caminhada | rotulo enum | P1 | stt_sub_walk | Walk Line | STAIR_SUBMODE_LABEL |
| 187 | `packages/tools/src/stairSketchState.ts:13` | patamar | rotulo enum | P1 | stt_sub_landing | Landing | STAIR_SUBMODE_LABEL |
| 188 | `packages/tools/src/stairSketchState.ts:14` | concluir | rotulo enum | P1 | stt_sub_finish | Finish | STAIR_SUBMODE_LABEL |
| 189 | `packages/tools/src/stairRunPlan.ts:28` | Reta | rotulo enum | P1 | stt_shape_straight | Straight | STAIR_RUN_SHAPE_LABEL -> seletor de forma |
| 190 | `packages/tools/src/stairRunPlan.ts:29` | Em L | rotulo enum | P1 | stt_shape_l | L-Shape | STAIR_RUN_SHAPE_LABEL |
| 191 | `packages/tools/src/stairRunPlan.ts:30` | Em U | rotulo enum | P1 | stt_shape_u | U-Shape | STAIR_RUN_SHAPE_LABEL |
| 192 | `packages/tools/src/stairRunPlan.ts:31` | Com leque | rotulo enum | P1 | stt_shape_winder | Winder | STAIR_RUN_SHAPE_LABEL |
| 193 | `packages/tools/src/stairRunPlan.ts:32` | Caracol | rotulo enum | P1 | stt_shape_spiral | Spiral | STAIR_RUN_SHAPE_LABEL |
| 194 | `packages/tools/src/stairRunPlan.ts:33` | Livre | rotulo enum | P1 | stt_shape_free | Free | STAIR_RUN_SHAPE_LABEL |
| 195 | `packages/tools/src/numeric.ts:71` | metros | mensagem | P1 | unit_length_long | meters / centimeters / millimeters / feet / inches / feet and inches | LENGTH_NAMES -> mensagens 'Digite um numero em ...' de todas as ferramentas |
| 196 | `packages/tools/src/stairLiveMessages.ts:4` | nível de topo alcançado | mensagem | P0 | msg_top_reached | top level reached | TEXTO_ALCANCADO: rotulo ao vivo da escada |
| 197 | `packages/tools/src/stairLiveMessages.ts:17` | falta 1 espelho | mensagem | P0 | msg_risers_missing | 1 riser missing / {n} risers missing ({d} m) | textoFaltaEspelhos; plural por idioma |
| 198 | `packages/tools/src/stairLiveMessages.ts:26` | ${excess === 1 ? 'passou 1 espelho' : `passou ${excess} espelhos`}: a escada termina antes do cursor | mensagem | P1 | msg_risers_passed | {n} riser(s) past: the stair ends before the cursor |  |
| 199 | `packages/tools/src/stairLiveMessages.ts:34` | ${risers} espelhos · ${numero(riserHeight * 100, 1)} cm · piso ${numero(tread * 100, 1)} cm · ${estado} | mensagem | P0 | msg_stair_live | {n} risers - {h} cm - tread {t} cm - {state} |  |
| 200 | `packages/tools/src/rampLiveMessages.ts:7` | nível de topo alcançado | mensagem | P0 | msg_top_reached | top level reached | TEXTO_NIVEL_ALCANCADO: rotulo ao vivo da rampa (duplica stairLiveMessages.ts:4) |
| 201 | `packages/tools/src/rampLiveMessages.ts:26` | faltam ${desnivel(falta)} de desnível${trechoEquivalente(falta, slope, ' de rampa')} | mensagem | P0 | msg_rise_missing | {d} m of rise missing ({l} m of ramp) |  |
| 202 | `packages/tools/src/rampLiveMessages.ts:34` | passou ${desnivel(passou)}${trechoEquivalente(passou, slope, '')}: termina antes do cursor | mensagem | P1 | msg_rise_passed | {d} m past ({l} m): ends before the cursor |  |
| 203 | `packages/tools/src/rampLiveMessages.ts:45` | dentro da norma | mensagem | P1 | msg_within_code | within code |  |
| 204 | `packages/tools/src/rampLiveMessages.ts:47` | ${resulta} · acima do máximo ${formatRampPercent(slopeMax)}${falta} | mensagem | P1 | msg_above_max | above the maximum {pct} - about {d} missing |  |
| 205 | `packages/tools/src/sectionEditTools.ts:183` | topo | rotulo de parametro | P1 | sec_feature_labels | top / sill / left jamb / right jamb / center | labels desenhados na referencia e citados na barra de status (linha 402) |
| 206 | `packages/tools/src/sectionEditTools.ts:127` | ponta | rotulo enum | P2 | sec_snap_labels | endpoint / midpoint / intersection / face / core / edge / alignment / perpendicular / center / tangent | SNAP_KIND_LABEL -> parentese do status |
| 207 | `packages/tools/src/sketchPickFace.ts:94` | Face ${side === 'ext' ? 'externa' : 'interna'} da ${wallName(w)} | mensagem | P1 | msg_pick_face | Exterior face of {wall} / Interior face of {wall} | rotulo da previa e da barra de status (perimetro/escada) |
| 208 | `packages/tools/src/sketchPickFace.ts:96` | Eixo da ${wallName(w)}${w.sag ? ' (arco)' : ''} | mensagem | P1 | msg_pick_axis | {wall} axis (arc) |  |
| 209 | `packages/tools/src/sketchPickFace.ts:102` | Borda do ${borda} do ${h.name} | mensagem | P1 | msg_pick_border | Outline/hole border of {element} |  |
| 210 | `packages/tools/src/alignFeatures.ts:233` | piso | rotulo enum | P1 | af_ring_kind | floor / slab / roof / ceiling | rotulo de feicao: 'aresta do piso', 'aresta do furo da laje' |
| 211 | `packages/tools/src/alignFeatures.ts:256` | aresta do ${nome} | mensagem | P1 | msg_af_edge | {type} edge / {type} hole edge |  |
| 212 | `packages/tools/src/alignFeatures.ts:285` | contorno do patamar | mensagem | P1 | msg_af_component | landing outline / stair boundary / ramp riser / walk line |  |
| 213 | `packages/tools/src/componentTarget.ts:11` | Aresta de escada/rampa: use Editar croqui para alterar o croqui. | mensagem | P1 | msg_component_edge | Stair/ramp edge: use Edit Sketch to change the sketch. |  |
| 214 | `packages/tools/src/componentTarget.ts:14` | Para mover a escada/rampa inteira, selecione o elemento (Selecionar) e use Mover. | mensagem | P1 | msg_component_move | To move the whole stair/ramp, select the element (Select) and use Move. |  |
| 215 | `packages/tools/src/outlineEdit.ts:7` | Contorno travado nas paredes. Use Desvincular nas propriedades para editar. | mensagem | P1 | msg_outline_locked | Outline locked to the walls. Use Detach in the properties to edit. |  |
| 216 | `packages/tools/src/outlineEdit.ts:10` | O forro deixou de acompanhar o ambiente (solto). Use Revincular ao ambiente nas propriedades. | mensagem | P1 | msg_ceiling_detached | The ceiling no longer follows the room (detached). Use Relink to Room in the properties. |  |
| 217 | `packages/tools/src/trimChange.ts:5` | Nada a aparar: as paredes já se encontram. | mensagem | P1 | msg_nothing_to_trim | Nothing to trim: the walls already meet. |  |
| 218 | `packages/tools/src/wallOverlapGuard.ts:19` | Não é possível: a parede ficaria em cima da parede ${elementLabel(c.wall)} (${emCm(c.overlap.length)} no mesmo nível). Nada foi alterado. | mensagem | P0 | msg_wall_overlap | Not possible: the wall would sit on top of wall {wall} ({d} on the same level). Nothing changed. | vai para a barra de status E para alerta modal (env.alert) |
| 219 | `packages/tools/src/hostedLoss.ts:104` | Esta alteração deixa ${losses.length} elemento(s) fora da parede: ${list}. Eles serão excluídos. Continuar? | mensagem | P0 | msg_hosted_loss | This change leaves {n} element(s) outside the wall: {list}. They will be deleted. Continue? | dialogo de confirmacao (modal) |
| 220 | `packages/tools/src/selectionFilters.ts:51` | Selecione uma parede, abertura ou piso primeiro. | mensagem | P1 | msg_filter_select_first | Select a wall, opening or floor first. |  |
| 221 | `packages/tools/src/selectionFilters.ts:52` | A seleção tem mais de um tipo. Selecione elementos de um só tipo. | mensagem | P1 | msg_filter_mixed | The selection has more than one type. Select elements of a single type. |  |
| 222 | `packages/tools/src/alignSolve.ts:66` | A referência não é paralela a esta feição. Para estender uma parede até ela, escolha a extremidade da parede (Tab). | mensagem | P1 | msg_align_not_parallel | The reference is not parallel to this feature. To extend a wall to it, choose the wall end (Tab). | bloco 60-132: 17 mensagens de erro do Alinhar |
| 223 | `packages/tools/src/stairRunPlan.ts:98` | O comprimento (${(length * 100).toFixed(0)} cm) é curto para ${N} espelhos: o piso ficaria abaixo do mínimo (${(rule.minTread * 100).toFixed(0)} cm). | mensagem | P1 | msg_stair_too_short | The length ({c} cm) is short for {n} risers: the tread would be below the minimum ({m} cm). |  |
| 224 | `packages/tools/src/stairDraw.ts:230` | Desenhe os limites antes dos espelhos. | mensagem | P1 | msg_draw_limits_first | Draw the boundaries before the risers. |  |
| 225 | `packages/tools/src/stairRunEdit.ts:13` | o nº de espelhos só se edita em escada reta gerada pela ferramenta. | mensagem | P2 | msg_risers_edit_straight | the riser count can only be edited on a straight stair generated by the tool. |  |
| 226 | `packages/tools/src/rampCommands.ts:124` | A rampa livre não permite editar o croqui pelos componentes. | mensagem | P1 | msg_ramp_free_no_edit | The free ramp does not allow editing the sketch by components. |  |
| 227 | `packages/tools/src/componentEdit.ts:41` | O elemento não é uma escada nem uma rampa. | mensagem | P1 | msg_not_stair_ramp | The element is neither a stair nor a ramp. |  |
| 228 | `packages/tools/src/lengthEdit.ts:15` | Selecione uma parede. | mensagem | P1 | msg_select_wall | Select a wall. |  |
| 229 | `packages/model/src/defaults.ts:171` | Projeto sem título | nome padrao | P0 | doc_untitled_project | Untitled Project | createEmptyProject(): nome do documento novo (barra de titulo, aba, prancha) |
| 230 | `packages/model/src/defaults.ts:176` | Térreo | nome padrao | P0 | doc_level_ground | Ground Floor | niveis iniciais do projeto novo; 'Terreo'/'Pavimento 2' aparecem na arvore e nas propriedades |
| 231 | `packages/model/src/defaults.ts:177` | Pavimento 2 | nome padrao | P0 | doc_level_2 | Level 2 | segundo nivel inicial |
| 232 | `packages/model/src/defaults.ts:28` | Tinta branca | dado | P1 |  | White Paint | material padrao criado no documento; bloco 28-46 com 19 nomes que precisam ser localizados na criacao |
| 233 | `packages/model/src/defaults.ts:30` | Bloco cerâmico 14 | dado | P1 |  | Ceramic Block 14 | idem (bloco de materiais) |
| 234 | `packages/model/src/defaults.ts:35` | Revestimento cerâmico | dado | P1 |  | Ceramic Finish | idem |
| 235 | `packages/model/src/defaults.ts:39` | Perfil de aço | dado | P1 |  | Steel Profile | idem |
| 236 | `packages/model/src/defaults.ts:44` | Telha cerâmica | dado | P1 |  | Ceramic Tile | idem |
| 237 | `packages/model/src/defaults.ts:73` | Alvenaria 14 + reboco | dado | P1 |  | Masonry 14 + Plaster | tipos de parede padrao (bloco 73-99, 5 nomes + descricoes) |
| 238 | `packages/model/src/defaults.ts:87` | Externa 19 + cerâmica | dado | P1 |  | Exterior 19 + Ceramic | idem |
| 239 | `packages/model/src/defaults.ts:94` | Drywall 7 | dado | P1 |  | Drywall 7 | idem |
| 240 | `packages/model/src/defaults.ts:139` | Porta 70 x 210 | dado | P1 |  | Door 70 x 210 | DEFAULT_OPENING_TYPES: bloco 139-162 com 26 tipos PT (P-01..P-11, J-01..J-11, V-01/V-02); visiveis no seletor de tipo |
| 241 | `packages/model/src/defaults.ts:145` | Vão livre 90 x 210 | dado | P1 |  | Opening 90 x 210 | idem |
| 242 | `packages/model/src/defaults.ts:150` | Portão seccionado 300 x 220 | dado | P1 |  | Sectional Garage Door 300 x 220 | idem |
| 243 | `packages/model/src/catalogoPortas.ts:29` | Porta corta-fogo ${classe} ${cm} x 210 | dado | P2 |  | Fire Door {class} {cm} x 210 | catalogo inteiro (linhas 29-92, ~44 portas); gerado na criacao, nao traduz depois |
| 244 | `packages/model/src/catalogoJanelas.ts:28` | Janela de correr 2 folhas 120 x 100 | dado | P2 |  | Sliding Window 2 Panels 120 x 100 | catalogo inteiro (linhas 28-75, ~48 janelas) |
| 245 | `packages/model/src/catalogoComposicoes.ts:88` | Porta de giro 90 x 210 com bandeira fixa 40 | dado | P2 |  | Hinged Door 90 x 210 with Fixed Transom 40 | catalogo de composicoes (linhas 88-134, 24 tipos) |
| 246 | `packages/model/src/templates.ts:13` | Em branco | JSX texto | P0 | tpl_blank | Blank | nome do template no dialogo de projeto novo |
| 247 | `packages/model/src/templates.ts:16` | Mostruário de esquadrias | JSX texto | P0 | tpl_openings | Opening Showcase | nome do template |
| 248 | `packages/model/src/templates.ts:21` | Casa térrea, 2 quartos | JSX texto | P0 | tpl_house2 | Single-Story House, 2 Bedrooms | nome do template |
| 249 | `packages/model/src/templates.ts:23` | Casa de alto padrão, 2 pavimentos | JSX texto | P0 | tpl_house_premium | High-End House, 2 Stories | nome do template |
| 250 | `packages/model/src/templates.ts:25` | Prédio, 10 pavimentos | JSX texto | P0 | tpl_building10 | Building, 10 Stories | nome do template |
| 251 | `packages/model/src/templates.ts:27` | Quitinete | JSX texto | P0 | tpl_studio | Studio Apartment | nome do template |
| 252 | `packages/model/src/templates.ts:13` | Dois níveis e os tipos de parede padrão. | JSX texto | P0 | tpl_blank_desc | Two levels and the standard wall types. | descricao do template (bloco 13-27, 6 descricoes) |
| 253 | `packages/model/src/templates.ts:21` | Sala e cozinha integradas, banheiro e dois quartos. | JSX texto | P0 | tpl_house2_desc | Open living and kitchen, bathroom and two bedrooms. | descricao do template |
| 254 | `packages/model/src/templates.ts:25` | Núcleo de circulação central e quatro unidades por andar; lajes e pisos param no núcleo. | JSX texto | P0 | tpl_building10_desc | Central circulation core and four units per floor; slabs and floors stop at the core. | descricao do template |
| 255 | `packages/model/src/templatePredio10.ts:41` | Térreo | nome padrao | P2 | doc_level_ground | Ground Floor / Level {n} | niveis do template; nome fica gravado no documento |
| 256 | `packages/model/src/templatePredio10.ts:48` | Laje maciça 19 (prédio) | dado | P2 |  | Solid Slab 19 (building) | tipo do template |
| 257 | `packages/model/src/templatePredio10.ts:61` | Piso cerâmico (prédio) | dado | P2 |  | Ceramic Floor (building) | tipo do template |
| 258 | `packages/model/src/templatePredio10.ts:159` | Corte AA (prédio) | dado | P2 |  | Section AA (building) | vista do template (linha 160: Corte BB) |
| 259 | `packages/model/src/templateCasaAltoPadrao.ts:27` | Portão de garagem 4,50 x 2,20 | dado | P2 |  | Garage Door 4.50 x 2.20 | tipo do template; linhas 340/342 tem 'Corte AA'/'Corte BB' |
| 260 | `packages/model/src/view3dPoints.ts:26` | Vista 3D | nome padrao | P1 | doc_view3d | 3D View | defaultView3DPointName(): nome do ponto 3D salvo ('Vista 3D 2' na sequencia) |
| 261 | `packages/model/src/sectionView.ts:254` | ${root} cópia | nome padrao | P1 | doc_view_copy | {base} Copy | copyViewName(): nome da vista duplicada (Ctrl+C/Colar) |
| 262 | `packages/model/src/openingTypeLibrary.ts:99` | ${origem.name} (cópia) | nome padrao | P1 | doc_type_copy | {name} (copy) | duplicateOpeningType(): nome do tipo duplicado |
| 263 | `packages/model/src/dimensionFamily.ts:22` | Padrão | nome padrao | P1 | dim_family_default | Default | DIM_FAMILY_PADRAO_NAME: familia implicita mostrada no dialogo/barra |
| 264 | `packages/model/src/opening.ts:154` | Porta de giro | rotulo enum | P1 | of_door_swing | Hinged Door | OPENING_FAMILIES (bloco 154-172, 19 nomes) exibido no seletor de familia |
| 265 | `packages/model/src/opening.ts:155` | Porta dupla | rotulo enum | P1 | of_door_double | Double Door | OPENING_FAMILIES |
| 266 | `packages/model/src/opening.ts:156` | Porta de correr | rotulo enum | P1 | of_door_sliding | Sliding Door | OPENING_FAMILIES |
| 267 | `packages/model/src/opening.ts:163` | Vão livre | rotulo enum | P1 | of_door_void | Opening | OPENING_FAMILIES |
| 268 | `packages/model/src/opening.ts:167` | Janela maxim-ar | rotulo enum | P1 | of_window_casement | Awning Window | OPENING_FAMILIES |
| 269 | `packages/model/src/opening.ts:169` | Janela guilhotina | rotulo enum | P1 | of_window_hung | Double-Hung Window | OPENING_FAMILIES |
| 270 | `packages/model/src/areaPlan.ts:155` | Sala | dado | P1 |  | Living Room | DEFAULT_ROOM_CATEGORIES (bloco 155-162, 8 categorias) mostradas na planta de area |
| 271 | `packages/model/src/areaPlan.ts:156` | Cozinha | dado | P1 |  | Kitchen | idem |
| 272 | `packages/model/src/areaPlan.ts:157` | Quarto | dado | P1 |  | Bedroom | idem |
| 273 | `packages/model/src/areaPlan.ts:158` | Banho | dado | P1 |  | Bathroom | idem |
| 274 | `packages/model/src/areaPlan.ts:159` | Circulação | dado | P1 |  | Circulation | idem |
| 275 | `packages/model/src/areaPlan.ts:160` | Serviço | dado | P1 |  | Service | idem |
| 276 | `packages/model/src/areaPlan.ts:161` | Garagem | dado | P1 |  | Garage | idem |
| 277 | `packages/model/src/areaPlan.ts:162` | Varanda | dado | P1 |  | Balcony | idem |
| 278 | `packages/model/src/priority.ts:18` | Estrutura | rotulo enum | P1 | layer_structure | Structure | FUNCTION_LABEL: editor de camadas de parede/piso/laje (bloco 18-23, 6) |
| 279 | `packages/model/src/priority.ts:19` | Substrato | rotulo enum | P1 | layer_substrate | Substrate | FUNCTION_LABEL |
| 280 | `packages/model/src/priority.ts:20` | Isolamento | rotulo enum | P1 | layer_thermal | Insulation | FUNCTION_LABEL |
| 281 | `packages/model/src/priority.ts:21` | Membrana | rotulo enum | P1 | layer_membrane | Membrane | FUNCTION_LABEL |
| 282 | `packages/model/src/priority.ts:22` | Acabamento 1 | rotulo enum | P1 | layer_finish1 | Finish 1 | FUNCTION_LABEL |
| 283 | `packages/model/src/priority.ts:23` | Acabamento 2 | rotulo enum | P1 | layer_finish2 | Finish 2 | FUNCTION_LABEL |
| 284 | `packages/model/src/graphics.ts:13` | parede | rotulo enum | P0 | cat_wall | Wall | GRAPHICS_CATEGORY_LABELS: lista de categorias de Ocultar/Isolar e validacao (bloco 13-22, 10) |
| 285 | `packages/model/src/graphics.ts:14` | porta | rotulo enum | P0 | cat_door | Door | GRAPHICS_CATEGORY_LABELS |
| 286 | `packages/model/src/graphics.ts:15` | janela | rotulo enum | P0 | cat_window | Window | GRAPHICS_CATEGORY_LABELS |
| 287 | `packages/model/src/graphics.ts:16` | piso | rotulo enum | P0 | cat_floor | Floor | GRAPHICS_CATEGORY_LABELS |
| 288 | `packages/model/src/graphics.ts:17` | laje | rotulo enum | P0 | cat_slab | Slab | GRAPHICS_CATEGORY_LABELS |
| 289 | `packages/model/src/graphics.ts:18` | telhado | rotulo enum | P0 | cat_roof | Roof | GRAPHICS_CATEGORY_LABELS |
| 290 | `packages/model/src/graphics.ts:19` | escada e rampa | rotulo enum | P0 | cat_stair | Stairs and Ramps | GRAPHICS_CATEGORY_LABELS |
| 291 | `packages/model/src/graphics.ts:20` | ambiente | rotulo enum | P0 | cat_room | Room | GRAPHICS_CATEGORY_LABELS |
| 292 | `packages/model/src/graphics.ts:21` | anotação | rotulo enum | P0 | cat_annotation | Annotation | GRAPHICS_CATEGORY_LABELS |
| 293 | `packages/model/src/graphics.ts:22` | objeto importado | rotulo enum | P0 | cat_generic | Imported Object | GRAPHICS_CATEGORY_LABELS |
| 294 | `packages/model/src/sectionView.ts:287` | Norte | rotulo enum | P1 | role_north | North | SECTION_ROLE_LABEL: papel da elevacao (bloco 287-290) |
| 295 | `packages/model/src/sectionView.ts:288` | Sul | rotulo enum | P1 | role_south | South | SECTION_ROLE_LABEL |
| 296 | `packages/model/src/sectionView.ts:289` | Leste | rotulo enum | P1 | role_east | East | SECTION_ROLE_LABEL |
| 297 | `packages/model/src/sectionView.ts:290` | Oeste | rotulo enum | P1 | role_west | West | SECTION_ROLE_LABEL |
| 298 | `packages/model/src/dimensionSettings.ts:40` | Eixo | rotulo enum | P1 | dimref_axis | Axis | WALL_DIM_REF_LABELS (bloco 40-43) no dialogo de cotas |
| 299 | `packages/model/src/dimensionSettings.ts:41` | Face acabada | rotulo enum | P1 | dimref_finish | Finished Face | WALL_DIM_REF_LABELS |
| 300 | `packages/model/src/dimensionSettings.ts:42` | Eixo do núcleo | rotulo enum | P1 | dimref_core_center | Core Center | WALL_DIM_REF_LABELS |
| 301 | `packages/model/src/dimensionSettings.ts:43` | Face do núcleo | rotulo enum | P1 | dimref_core_face | Core Face | WALL_DIM_REF_LABELS |
| 302 | `packages/model/src/dimensionSettings.ts:47` | Centro | rotulo enum | P1 | dimref_center | Center | OPENING_DIM_REF_LABELS (bloco 47-50) |
| 303 | `packages/model/src/dimensionSettings.ts:48` | Vão livre | rotulo enum | P1 | dimref_clear | Clear Opening | OPENING_DIM_REF_LABELS |
| 304 | `packages/model/src/dimensionSettings.ts:49` | Vão externo do batente | rotulo enum | P1 | dimref_frame | Frame Opening | OPENING_DIM_REF_LABELS |
| 305 | `packages/model/src/dimensionSettings.ts:50` | Com alizar | rotulo enum | P1 | dimref_casing | With Casing | OPENING_DIM_REF_LABELS |
| 306 | `packages/model/src/dimensionFamily.ts:28` | Acompanha a cota (legível por baixo) | rotulo enum | P1 | dim_read_aligned | Follows the dimension (readable from below) | DIM_READ_CONVENTION_OPTIONS no dialogo de familias |
| 307 | `packages/model/src/dimensionFamily.ts:29` | Acompanha a cota (nunca de cabeça para baixo) | rotulo enum | P1 | dim_read_upright | Follows the dimension (never upside down) | DIM_READ_CONVENTION_OPTIONS |
| 308 | `packages/model/src/dimensionFamily.ts:30` | Sempre horizontal | rotulo enum | P1 | dim_read_horizontal | Always horizontal | DIM_READ_CONVENTION_OPTIONS |
| 309 | `packages/model/src/dimensionFamily.ts:35` | Afastar com linha de chamada | rotulo enum | P1 | dim_fit_leader | Move out with a leader | DIM_TEXT_FIT_OPTIONS |
| 310 | `packages/model/src/dimensionFamily.ts:36` | Manter dentro do trecho | rotulo enum | P1 | dim_fit_inside | Keep inside the segment | DIM_TEXT_FIT_OPTIONS |
| 311 | `packages/model/src/dimensionFamily.ts:37` | Sempre fora, com linha de chamada | rotulo enum | P1 | dim_fit_outside | Always outside, with a leader | DIM_TEXT_FIT_OPTIONS |
| 312 | `packages/model/src/stairTypes.ts:153` | NBR 9050 (2R + T de 63 a 65 cm) | rotulo enum | P1 | stt_preset_nbr9050_full | NBR 9050 (2R + T from 63 to 65 cm) | rotulo da predefinicao de norma no painel da escada |
| 313 | `packages/model/src/stairTypes.ts:158` | NBR 9077 (2R + T de 63 a 64 cm) | rotulo enum | P1 | stt_preset_nbr9077_full | NBR 9077 (2R + T from 63 to 64 cm) | idem |
| 314 | `packages/model/src/stairTypes.ts:163` | IBC (2R + T de 60 a 65 cm, aproximação do Revit) | rotulo enum | P1 | stt_preset_ibc_full | IBC (2R + T from 60 to 65 cm, Revit approximation) | idem |
| 315 | `packages/model/src/floor.ts:36` | Cerâmico sobre contrapiso | dado | P1 |  | Ceramic over Screed | DEFAULT_FLOOR_TYPES (linhas 36-56, 5 tipos + descricoes) no seletor de tipo |
| 316 | `packages/model/src/floor.ts:42` | Acabamento sobre laje | dado | P1 |  | Finish over Slab | idem |
| 317 | `packages/model/src/floor.ts:47` | Laje de concreto 12 | dado | P1 |  | Concrete Slab 12 | idem |
| 318 | `packages/model/src/floor.ts:51` | Madeira sobre contrapiso | dado | P1 |  | Wood over Screed | idem |
| 319 | `packages/model/src/floor.ts:56` | Piso único (obra inteira) | dado | P1 |  | Single Floor (whole building) | idem |
| 320 | `packages/model/src/slab.ts:39` | Laje maciça 12 | dado | P1 |  | Solid Slab 12 | DEFAULT_SLAB_TYPES (linhas 39-49, 4) |
| 321 | `packages/model/src/slab.ts:40` | Laje maciça 15 | dado | P1 |  | Solid Slab 15 | idem |
| 322 | `packages/model/src/slab.ts:44` | Laje de cobertura 10 | dado | P1 |  | Roof Slab 10 | idem |
| 323 | `packages/model/src/slab.ts:49` | Laje única (obra inteira) | dado | P1 |  | Single Slab (whole building) | idem |
| 324 | `packages/model/src/roof.ts:53` | Telha cerâmica sobre madeiramento | dado | P1 |  | Ceramic Tile over Timber Framing | DEFAULT_ROOF_TYPES (linhas 53-62, 3) |
| 325 | `packages/model/src/roof.ts:58` | Telha de fibrocimento | dado | P1 |  | Fiber Cement Tile | idem |
| 326 | `packages/model/src/roof.ts:62` | Telha metálica sanduíche | dado | P1 |  | Insulated Metal Roof | idem |
| 327 | `packages/model/src/ceiling.ts:39` | Forro de gesso 12,5 mm | dado | P1 |  | Gypsum Ceiling 12.5 mm | DEFAULT_CEILING_TYPES (linhas 39-47, 3) |
| 328 | `packages/model/src/ceiling.ts:43` | Forro de PVC | dado | P1 |  | PVC Ceiling | idem |
| 329 | `packages/model/src/ceiling.ts:47` | Laje aparente | dado | P1 |  | Exposed Slab | idem |
| 330 | `packages/model/src/stair.ts:60` | Escada monolítica concreto | dado | P1 |  | Concrete Monolithic Stair | DEFAULT_STAIR_TYPES (linhas 60-102, 4 nomes + 4 descricoes) |
| 331 | `packages/model/src/stair.ts:73` | Escada de piso e espelho | dado | P1 |  | Tread and Riser Stair | idem |
| 332 | `packages/model/src/stair.ts:86` | Escada caracol monolítica | dado | P1 |  | Monolithic Spiral Stair | idem |
| 333 | `packages/model/src/stair.ts:100` | Escada caracol com poste central | dado | P1 |  | Spiral Stair with Center Post | idem |
| 334 | `packages/model/src/ramp.ts:56` | Rampa de concreto (NBR 9050) | dado | P1 |  | Concrete Ramp (NBR 9050) | DEFAULT_RAMP_TYPES (linhas 56-76, 2 nomes + 2 descricoes) |
| 335 | `packages/model/src/ramp.ts:74` | Rampa de concreto (ADA) | dado | P1 |  | Concrete Ramp (ADA) | idem |
| 336 | `packages/model/src/ramp.ts:128` | replace('.', ',') | formatacao | P2 | fmt_ramp_percent | {pct} % (decimal point) / 1:{ratio} | formatRampPercent/formatRampRatio forcam virgula; usados na barra de status e no canvas |
| 337 | `packages/tools/src/stairLiveMessages.ts:7` | replace('.', ',') | formatacao | P2 | fmt_stair_live | {n} cm (decimal point) | numero() com replace('.', ',') em todas as mensagens ao vivo da escada |
| 338 | `packages/tools/src/rampLiveMessages.ts:10` | replace('.', ',') | formatacao | P2 | fmt_ramp_live | {n} m (decimal point) | numero() com replace('.', ',') nas mensagens ao vivo da rampa |
| 339 | `packages/tools/src/stairRunTool.ts:31` | replace('.', ',') | formatacao | P2 | fmt_stair_cm | {n} cm (decimal point) | cm()/mText() locais; idem stairRunPlan.ts:140 e rampTool.ts:23 |
| 340 | `packages/tools/src/alignTool.ts:107` | ${prefix}${f.label} | mensagem | P1 | msg_af_preview_label | {prefix}{feature} | rotulo desenhado na previa; prefixo definido no proprio arquivo |
| 341 | `packages/tools/src/angularSectionRefs.ts:52` | Aresta ${AXIS_LABEL[track.axis]} | mensagem | P1 | msg_angular_edge | {axis} edge | rotulo da referencia angular no corte |
| 342 | `packages/tools/src/stairTool.ts:396` | deslocamento impossível | mensagem | P2 | msg_offset_impossible | offset not possible | rotulo de previa/status |
| 343 | `packages/tools/src/dims/driven.ts:94` | Um elemento associado à cota foi removido. | mensagem | P1 | msg_dim_element_removed | A dimensioned element was removed | edicao de cota dirigida: erro na barra de status |
| 344 | `packages/tools/src/dims/driven.ts:179` | Sobrepõe ${openingLabel(p, other)}. | mensagem | P1 | msg_dim_opening_overlap | Overlaps {opening} | aviso ao mover esquadria por cota |
| 345 | `packages/tools/src/dims/driven.ts:183` | Atravessa a parede perpendicular. | mensagem | P1 | msg_dim_cross_wall | Crosses the perpendicular wall | aviso ao mover esquadria por cota |
| 346 | `packages/tools/src/dims/driven.ts:200` | Alterar o comprimento por cota ainda não é suportado em parede curva. | mensagem | P1 | msg_dim_arc_wall | Changing the length by dimension is not supported on curved walls yet | idem |
| 347 | `packages/tools/src/dims/driven.ts:225` | O contorno está ligado às paredes: edite as paredes (ou desfaça o vínculo) em vez da cota. | mensagem | P1 | msg_dim_linked_outline | The outline is linked to the walls: edit the walls (or undo the link) instead of the dimension | idem |
| 348 | `packages/tools/src/dims/driven.ts:255` | Cota angular: editar o valor para mover elementos ainda não é suportado. | mensagem | P1 | msg_dim_angular_edit | Angular dimension: editing the value to move elements is not supported yet | idem |
| 349 | `packages/tools/src/dims/driven.ts:288` | O resultado não daria a medida pedida (limite de parede, junção ou geometria). | mensagem | P1 | msg_dim_result_mismatch | The result would not give the requested measure (wall limit, join or geometry) | idem |
| 350 | `packages/tools/src/dims/parallel.ts:100` | Digite uma distância maior que zero. | mensagem | P1 | msg_non_positive | Type a distance greater than zero. | NON_POSITIVE_MSG exportado |
| 351 | `packages/tools/src/trimTool.ts:148` | Aparar/Estender: agora clique na segunda aresta do croqui. | mensagem | P1 | msg_trim_prompt_sketch | Trim/Extend: now click the second sketch edge. | prompt() do Aparar (barra de status) |
| 352 | `packages/tools/src/trimTool.ts:149` | Aparar/Estender: agora clique na segunda aresta. | mensagem | P1 | msg_trim_prompt_edge | Trim/Extend: now click the second edge. | idem |
| 353 | `packages/tools/src/trimTool.ts:162` | Aparar/Estender ao canto: clique na parte que deseja manter da segunda parede. | mensagem | P1 | msg_trim_prompt_keep | Trim/Extend to corner: click the part of the second wall you want to keep. | idem |
| 354 | `packages/tools/src/trimTool.ts:163` | Aparar/Estender: Shift+clique acumula paredes a aparar; o clique sem Shift na referência aplica a todas. | mensagem | P1 | msg_trim_prompt_multi | Trim/Extend: Shift+click accumulates walls to trim; a click without Shift on the reference applies to all. | idem |

## Mistura PT/EN no mesmo arquivo

- `packages/tools/src/shortcutDefaults.ts` — perfis (`Revit (duas letras)`) e nomes de comando PT convivendo com sequências EN (`WA`, `HH`).
- `packages/tools/src/transformTools.ts` — mensagens PT com teclas EN (`Ctrl`, `Tab`, `Esc`).
- `packages/tools/src/stairRunPlan.ts` / `stairLiveMessages.ts` / `rampLiveMessages.ts` — frase PT com unidade EN (`cm`, `m`) e vírgula decimal.
- `packages/tools/src/joinTool.ts` — `Encosto`/`Esquadria` (PT) em etiqueta desenhada no canvas.
- `packages/model/src/templates.ts` — nomes/descrições PT com área em `m²`.
- `packages/model/src/dimensionFamily.ts` — opções PT com `unit: 'project'`/`'m'`.
- `packages/model/src/opening.ts` — famílias PT (`Porta de giro`) com `plan`/`kind` em EN.

## Riscos / testes que quebram

Testes que comparam literais PT (quebram ao trocar por chave/idioma):

- `packages/tools/src/arrayI18n.test.ts:8-14` — espera `Radial array:` em EN e `Matriz radial:`/`Matriz linear:` em PT (`arrayHint`). Observação: **não existe `arrayI18n.ts`**; o helper está em `arrayTool.ts:14-44`. O teste referencia o nome antigo.
- `packages/tools/src/attachRoof.test.ts:115-117` — `TOOL_LABEL.attachroof === 'Anexar topo'`, `detachroof === 'Desanexar topo'`, `TOOL_GROUPS` com título `Modificar`.
- `packages/tools/src/mensagensUnidade.test.ts:18,26,35` — `Valor inválido. Digite um número em centímetros.`
- `packages/tools/src/numeric.test.ts:45-49` — `lengthUnitName(...) === 'centímetros' | 'milímetros' | 'pés' | 'pés e polegadas'`.
- `packages/tools/src/levelTool.test.ts:91-94,114` — `Nível 2/3/4`, `Criar/editar nível`.
- `packages/tools/src/medirFrenteG.test.ts:24,38,114,116` — `Distância 3,00 m · ΔX`, `Distância do início do trecho`, `Parede dividida a 1,50 m…`.
- `packages/tools/src/rampTool.test.ts:41,97,157,164,308` e `rampLiveMessages.test.ts:6-28` — dicas, `Ângulo (°)`, `faltam … de desnível`, `nível de topo alcançado`.
- `packages/tools/src/stairLiveMessages.test.ts:30`, `stairLiveSession.test.ts:39,50,113`, `stairRunLength.test.ts:57`, `stairSpiralTool.test.ts:106,179,197` — rótulos ao vivo e avisos.
- `packages/tools/src/trimNada.test.ts:16`, `trimAlignArc.test.ts:82`, `trimAlignEdge.test.ts:84,149` — mensagens do Aparar.
- `packages/tools/src/hostedLoss.test.ts:74` — diálogo modal de perda de aberturas.
- `packages/tools/src/alignWall.test.ts:162`, `roofRidgeCases.test.ts:47-149`, `roofCurvedCommit.test.ts:65,92,146`, `slabSlope.test.ts:113`, `splitTool.test.ts:83`, `roomSeparatorGrip.test.ts:87` — mensagens de status.
- `packages/model/src/opening.test.ts:36,61-62,165,166,190` — `Porta dupla`, `Combinação inválida…`, `Ângulo de abertura…`, `Maçaneta desconhecida.`
- `packages/model/src/graphics.test.ts:317` — `Nível "Térreo" (lv_0): A escala deve ser…` (usa `GRAPHICS_CATEGORY_LABELS`).
- `packages/model/src/view3dPoints.test.ts:42,46` — `Vista 3D`, `Vista 3D 2`.
- `packages/model/src/sectionView.test.ts:126` — `Corte A cópia`.
- `packages/model/src/openingTypeLibrary.test.ts:26` — `Porta 80 x 210 (cópia)`.
- `packages/model/src/dimensionFamily.test.ts:126,129` — `Arquitetônica (cópia)`, `Nova família`.
- `packages/model/src/templateEsquadrias.test.ts:12` — `Mostruário de esquadrias`.
- `packages/model/src/dxfLayerStyle.test.ts:13` — `Padrão`.
- `packages/model/src/ramp.test.ts:64,69` — `A inclinação padrão deve ser maior que zero.`
- `apps/web/src/editor/i18n.test.ts:18-25` — fixa `toolLabel('section','pt') === 'Corte'` e `toolLabel('roofextrusion','pt') === 'Telhado por extrusão'`; se `TOOL_LABEL` for removido, `i18n.test.ts:2` quebra.

## Já correto

- `packages/tools/src/arrayTool.ts` — padrão a copiar: `TEXTOS.pt/en` (`:14-41`), `arrayHint(radial, lang)` (`:44`), `env.lang()` em `hint`/`inputPrompt()`/`say` (`:67-118`, `:170`, `:229`).
- `packages/model/src/unitsFormat.ts` — formatação recebe `ResolvedUnits` (`decimalSymbol`, `currency`, unidade) e não fixa locale (`:55-71`).
- `packages/model/src/units.ts` — símbolos de unidade neutros (`m`, `cm`, `m²`, `°`, `%`) em `:160-186`.
- `packages/model/src/level.ts`, `room.ts`, `wall.ts`, `slab.ts`, `floor.ts` (construtores) — só geometria/campos, sem texto visível.
- `packages/tools/src/sketchShapes.ts` (geradores `:12-136`), `roofGeom.ts`, `snap*.ts`, `pick*.ts`, `infer.ts` — geometria pura, sem texto de UI.
- `packages/tools/src/testEnv.ts` e fixtures — ignorados por definição.
