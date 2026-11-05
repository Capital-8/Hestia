# Área 10 — Viewport/canvas, rótulos desenhados, cotas, pranchas e navegador
- Escopo: `apps/web/src/ui/{ViewportCanvas,ViewportOverlays,SectionCanvas,ViewCube,ViewCubeRing,viewcube,viewcube-ring,PlanLabels,graphicsLabels,quadroPlanta,montagem3dProgressiva,Progresso3D,ProgressoAbertura,plantaProvisoria,Tutorial,IssuesButton,CanvasContextMenu,useCanvasContextMenu,PopupMenu,SheetView,Browser}.tsx|.ts`, `apps/web/src/ui/dims/**`, `apps/web/src/ui/sheet/**`, `apps/web/src/ui/schematic/**`, `apps/web/src/ui/browser/**` (+6 arquivos de dependência fora do escopo, marcados na coluna Nota)
- Arquivos analisados: 55 (+6 de dependência)
- Ocorrências: 410 (P0: 115, P1: 196, P2: 99)

## Resumo executivo
A área de canvas/pranchas é a mais monolíngue do app: **nenhum** dos componentes de viewport, prancha, cotas ou navegador assina `useI18n`; o único arquivo que lê o idioma é `useCanvasContextMenu.ts`, e só para repassar `lang` ao menu de contexto (que já é bilíngue em `editor/contextMenu.ts`).
Tudo o mais é PT fixo: selo Corte/Elevação, textos do ViewCube e da bússola, barra da prancha, menus e nós do Navegador de projeto, status de cotas e overlay de progresso. Os textos desenhados (carimbo, legendas de vista, nome de ambiente) são gerados em `packages/render` e também não recebem `lang`.
Há três padrões de dívida: (1) constantes de módulo com texto PT (`CUBE_ZONES`, `COMPASS`, `FACE_LABEL`, `ALIGN`, `ROTULO_FASE`, `HINT`, `CATEGORY_LABEL`) que nunca reagiriam à troca de idioma mesmo se traduzidas no lugar; (2) pluralização manual (`vista/vistas`, `elemento(s)`, `camada(s)`, `feição(ões)`); (3) números com vírgula/formatos fixos (`useSheetMove.ts:42`) e unidades `mm` cravadas em textos.
O custo de corrigir é concentrado: criar as chaves uma vez e trocar as constantes por funções que recebem `lang`.

## Causas-raiz
1. **Componentes de canvas não assinam o store de idioma.** `ViewportOverlays.tsx`, `SectionCanvas.tsx`, `Progresso3D.tsx`, `ProgressoAbertura.tsx`, `Tutorial.tsx`, `IssuesButton.tsx`, `SheetControlBar.tsx` e todo o `browser/**` não importam `useI18n` (só `useCanvasContextMenu.ts` importa, para `toolLabel`).
2. **Rótulos em constantes de módulo, avaliados uma vez.** `viewcube.ts:28-44` (`FACE_NAME`/`FACE_LABEL`, e `CUBE_ZONES` na linha 82), `viewcube-ring.ts:20-25` (`COMPASS`), `graphicsLabels.ts:5-37`, `SheetControlBar.tsx:50-57` (`ALIGN`), `progressoAbertura.ts:7-11` (`ROTULO_FASE`), `useSheetAlign.ts:13` (`HINT`) e `sheetSnapPoints.ts:62-70` (`LABELS`). Mesmo com tradução, a troca de idioma em tempo real não atualizaria esses textos.
3. **Texto desenhado produzido fora da UI.** `packages/render/src/sheet/frame.ts:34-123` desenha legenda e carimbo ("Projeto:", "Cliente:", "Autor:", "Data:", "Revisão:", "Escala:", "Sem escala", "Quadro geral de áreas", "Vista inexistente", "Rev.") sem qualquer parâmetro de idioma; `packages/render/src/plan/rooms.ts:24` gera "Ambiente N" como nome padrão.
4. **Nomes padrão do documento em PT.** `packages/model/src/defaults.ts:171,176,177` cria "Projeto sem título", "Térreo" e "Pavimento 2" em qualquer idioma. Como o nome é gravado no documento, trocar o idioma depois não renomeia (e nem deve) — mas a criação precisa usar o idioma ativo.
5. **Mensagens de status construídas por concatenação e pluralização manual.** `browser/Views.tsx:123,197,253,280,291,311-312`, `sheet/useSheetAlign.ts:116,154`, `sheet/useSheetMove.ts:139,216`, `sheet/SheetStage.tsx:222,228,287` e `editor/issuesView.ts:22,38-40`.
6. **Formatação numérica/locale fixos.** `sheet/useSheetMove.ts:42` faz `toFixed(1).replace('.', ',')` (vírgula sempre, mesmo em EN); `browser/Families.tsx:22` ordena com `localeCompare(..., 'pt-BR')`; `SheetControlBar.tsx:153-154` e `SheetCanvas.tsx:344` cravam `mm`.
7. **aria-label do canvas em `packages/render/src/gpu/controlador.ts:168,185`** ("Área de desenho") não é traduzível — o component que cria o canvas não recebe o idioma.

## Inventário
| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/ViewportOverlays.tsx:37 | `Sem GPU: planta em modo CPU. O 3D fica indisponível.` | JSX texto | P1 | `vp_cpu_note` | No GPU: floor plan in CPU mode. 3D is unavailable. | Aviso fixo no canto do canvas; declarar em I18N. |
| 2 | apps/web/src/ui/ViewportOverlays.tsx:40 | `Este navegador não oferece WebGL nem WebGPU. Use a planta.` | JSX texto | P1 | `vp_no_webgl` | This browser does not support WebGL or WebGPU. Use the floor plan. | Fallback que ocupa a vista 3D inteira. |
| 3 | apps/web/src/ui/ViewportOverlays.tsx:51 | `Enter confirma` | JSX texto | P1 | `vp_enter_confirms` | Enter confirms | Rodapé da caixa de digitação (typebox) da planta. |
| 4 | apps/web/src/ui/SectionCanvas.tsx:68 | `Corte` | ternário PT/EN inline | P0 | `vp_section_kind` | Section | Selo da vista de corte, sempre visível no canto. |
| 5 | apps/web/src/ui/SectionCanvas.tsx:68 | `Elevação` | ternário PT/EN inline | P0 | `vp_elevation_kind` | Elevation | Mesmo ternário do selo; EN fixo no código. |
| 6 | apps/web/src/ui/SectionCanvas.tsx:69 | `Fechar corte e voltar à planta` | atributo (title+aria-label) | P1 | `vp_close_section` | Close section and return to floor plan | title e aria-label repetem o mesmo literal. |
| 7 | apps/web/src/ui/ViewportCanvas.tsx:416 | `Peitoril ${formatQuantity(...)}` | canvas/SVG (rótulo desenhado) | P0 | `vp_preview_sill` | Sill ${value} | Rótulo da prévia de peitoril da janela na planta. |
| 8 | apps/web/src/ui/ViewportCanvas.tsx:417 | `Altura ${formatQuantity(...)}` | canvas/SVG (rótulo desenhado) | P0 | `vp_preview_height` | Height ${value} | Rótulo da prévia de altura da abertura. |
| 9 | apps/web/src/ui/ViewportCanvas.tsx:952 | `Texto movido` | status | P2 | `vp_note_moved` | Text moved | Status após arrastar anotação de texto. |
| 10 | apps/web/src/ui/ViewportCanvas.tsx:952 | `Texto da cota movido` | status | P2 | `vp_dim_text_moved` | Dimension text moved | Status após arrastar o texto da cota. |
| 11 | apps/web/src/ui/ViewportCanvas.tsx:952 | `Afastamento da cota atualizado` | status | P2 | `vp_dim_offset_updated` | Dimension offset updated | Status após arrastar a linha de cota. |
| 12 | apps/web/src/ui/ViewportCanvas.tsx:953 | `${msg}. Ctrl+Z desfaz.` | status | P2 | `vp_undo_hint` | ${msg}. Ctrl+Z undoes. | Sufixo de desfazer concatenado em PT. |
| 13 | apps/web/src/ui/ViewportCanvas.tsx:969 | `Peitoril atualizado` | status | P2 | `vp_sill_updated` | Sill updated | Status das alças de abertura no corte. |
| 14 | apps/web/src/ui/ViewportCanvas.tsx:969 | `Altura atualizada` | status | P2 | `vp_head_updated` | Head height updated | Status das alças de abertura no corte. |
| 15 | apps/web/src/ui/ViewportCanvas.tsx:969 | `Lado atualizado` | status | P2 | `vp_side_updated` | Side updated | Status das alças de lateral (jamb-a/jamb-b). |
| 16 | apps/web/src/ui/ViewportCanvas.tsx:970 | `${labels[...]}. Ctrl+Z desfaz.` | status | P2 | `vp_undo_hint_labels` | ${label}. Ctrl+Z undoes. | Sufixo de desfazer concatenado em PT. |
| 17 | apps/web/src/ui/ViewportCanvas.tsx:1028 | `Modo de seleção ativado.` | status | P1 | `vp_select_mode` | Selection mode enabled. | Status ao clicar no vazio sem ferramenta. |
| 18 | apps/web/src/ui/ViewCube.tsx:130 | `Vista para o ${ringHover.name}` | canvas/SVG (tooltip) | P1 | `vc_view_to_dir` | View to ${name} | ringHover.name vem de COMPASS (PT). |
| 19 | apps/web/src/ui/ViewCube.tsx:131 | `Clique numa zona ou letra para ir à vista; arraste para girar a vista` | atributo (title) | P1 | `vc_hint` | Click a zone or letter to go to that view; drag to orbit the view | title do palco do cubo. |
| 20 | apps/web/src/ui/ViewCube.tsx:136 | `Controle da vista 3D` | aria-label | P1 | `vc_group` | 3D view control | role="group" do ViewCube. |
| 21 | apps/web/src/ui/ViewCube.tsx:172 | `Girar a vista 90° para a esquerda` | aria-label | P1 | `vc_rotate_left` | Rotate view 90° left | aria-label do botão. |
| 22 | apps/web/src/ui/ViewCube.tsx:172 | `Girar 90° para a esquerda` | atributo (title) | P1 | `vc_rotate_left_title` | Rotate 90° left | title do mesmo botão (texto difere do aria-label). |
| 23 | apps/web/src/ui/ViewCube.tsx:175 | `Início: vista padrão e enquadrar o modelo` | aria-label | P1 | `vc_home_aria` | Home: default view and fit model | aria-label do botão Home. |
| 24 | apps/web/src/ui/ViewCube.tsx:175 | `Início: vista padrão e enquadrar` | atributo (title) | P1 | `vc_home_title` | Home: default view and fit | title do botão Home. |
| 25 | apps/web/src/ui/ViewCube.tsx:178 | `Projeção ortogonal: alternar para perspectiva` | aria-label | P1 | `vc_ortho_on` | Orthographic projection: switch to perspective | Ternário de acessibilidade. |
| 26 | apps/web/src/ui/ViewCube.tsx:178 | `Projeção em perspectiva: alternar para ortogonal` | aria-label | P1 | `vc_persp_on` | Perspective projection: switch to orthographic | Ternário de acessibilidade. |
| 27 | apps/web/src/ui/ViewCube.tsx:178 | `Alternar entre perspectiva e ortogonal` | atributo (title) | P1 | `vc_toggle_ortho` | Toggle between perspective and orthographic | title do mesmo botão. |
| 28 | apps/web/src/ui/ViewCube.tsx:179 | `Ortogonal` | JSX texto | P1 | `vc_ortho` | Orthographic | Texto visível do botão de projeção. |
| 29 | apps/web/src/ui/ViewCube.tsx:179 | `Perspectiva` | JSX texto | P1 | `vc_persp` | Perspective | Texto visível do botão de projeção. |
| 30 | apps/web/src/ui/ViewCube.tsx:181 | `Girar a vista 90° para a direita` | aria-label | P1 | `vc_rotate_right` | Rotate view 90° right | aria-label do botão. |
| 31 | apps/web/src/ui/ViewCube.tsx:181 | `Girar 90° para a direita` | atributo (title) | P1 | `vc_rotate_right_title` | Rotate 90° right | title do mesmo botão. |
| 32 | apps/web/src/ui/viewcube.ts:38 | `SUPERIOR` | canvas/SVG (rótulo visível) | P0 | `vc_face_top` | TOP | FACE_LABEL: texto desenhado na face do cubo. |
| 33 | apps/web/src/ui/viewcube.ts:39 | `INFERIOR` | canvas/SVG (rótulo visível) | P0 | `vc_face_bottom` | BOTTOM | FACE_LABEL. |
| 34 | apps/web/src/ui/viewcube.ts:40 | `FRONTAL` | canvas/SVG (rótulo visível) | P0 | `vc_face_front` | FRONT | FACE_LABEL. |
| 35 | apps/web/src/ui/viewcube.ts:41 | `POSTERIOR` | canvas/SVG (rótulo visível) | P0 | `vc_face_back` | BACK | FACE_LABEL. |
| 36 | apps/web/src/ui/viewcube.ts:42 | `DIREITA` | canvas/SVG (rótulo visível) | P0 | `vc_face_right` | RIGHT | FACE_LABEL. |
| 37 | apps/web/src/ui/viewcube.ts:43 | `ESQUERDA` | canvas/SVG (rótulo visível) | P0 | `vc_face_left` | LEFT | FACE_LABEL. |
| 38 | apps/web/src/ui/viewcube.ts:29 | `superior` | constante módulo (aria) | P1 | `vc_name_top` | top | FACE_NAME: usada em "Vista superior". |
| 39 | apps/web/src/ui/viewcube.ts:30 | `inferior` | constante módulo (aria) | P1 | `vc_name_bottom` | bottom | FACE_NAME. |
| 40 | apps/web/src/ui/viewcube.ts:31 | `frontal` | constante módulo (aria) | P1 | `vc_name_front` | front | FACE_NAME. |
| 41 | apps/web/src/ui/viewcube.ts:32 | `posterior` | constante módulo (aria) | P1 | `vc_name_back` | back | FACE_NAME. |
| 42 | apps/web/src/ui/viewcube.ts:33 | `direita` | constante módulo (aria) | P1 | `vc_name_right` | right | FACE_NAME. |
| 43 | apps/web/src/ui/viewcube.ts:34 | `esquerda` | constante módulo (aria) | P1 | `vc_name_left` | left | FACE_NAME. |
| 44 | apps/web/src/ui/viewcube.ts:70 | ` e ` | constante módulo (conector) | P2 | `vc_join_and` |  and  | Conector de "superior, frontal e direita"; listas EN usam vírgula + and ou espaço. |
| 45 | apps/web/src/ui/viewcube.ts:77 | `Vista ${joined}` | constante módulo (aria) | P1 | `vc_view_name` | ${joined} view | CUBE_ZONES é montado no load do módulo: nunca reage à troca de idioma (stale i18n). |
| 46 | apps/web/src/ui/viewcube-ring.ts:10 | `'N' \| 'L' \| 'S' \| 'O'` | canvas/SVG (rótulo visível) | P1 | `vc_compass_keys` | N \| E \| S \| W | Letras da bússola desenhadas no anel; renderizadas em ViewCubeRing.tsx:40. |
| 47 | apps/web/src/ui/viewcube-ring.ts:21 | `norte` | constante módulo (aria) | P1 | `vc_compass_north` | north | COMPASS[].name usado no tooltip "Vista para o norte". |
| 48 | apps/web/src/ui/viewcube-ring.ts:22 | `leste` | constante módulo (aria) | P1 | `vc_compass_east` | east | COMPASS[].name. |
| 49 | apps/web/src/ui/viewcube-ring.ts:23 | `sul` | constante módulo (aria) | P1 | `vc_compass_south` | south | COMPASS[].name. |
| 50 | apps/web/src/ui/viewcube-ring.ts:24 | `oeste` | constante módulo (aria) | P1 | `vc_compass_west` | west | COMPASS[].name (em EN a letra é W, não O). |
| 51 | apps/web/src/ui/graphicsLabels.ts:6 | `Parede` | constante módulo | P1 | `tool_wall` | Wall | CATEGORY_LABEL; reutilizar tool_wall. |
| 52 | apps/web/src/ui/graphicsLabels.ts:7 | `Porta` | constante módulo | P1 | `tool_door` | Door | CATEGORY_LABEL; reutilizar tool_door. |
| 53 | apps/web/src/ui/graphicsLabels.ts:8 | `Janela` | constante módulo | P1 | `tool_window` | Window | CATEGORY_LABEL; reutilizar tool_window. |
| 54 | apps/web/src/ui/graphicsLabels.ts:9 | `Piso` | constante módulo | P1 | `tool_floor` | Floor | CATEGORY_LABEL; reutilizar tool_floor. |
| 55 | apps/web/src/ui/graphicsLabels.ts:10 | `Laje` | constante módulo | P1 | `tool_slab` | Slab | CATEGORY_LABEL; reutilizar tool_slab. |
| 56 | apps/web/src/ui/graphicsLabels.ts:11 | `Telhado` | constante módulo | P1 | `tool_roof` | Roof | CATEGORY_LABEL; reutilizar tool_roof. |
| 57 | apps/web/src/ui/graphicsLabels.ts:12 | `Escada` | constante módulo | P1 | `graphics_cat_stair` | Stairs | CATEGORY_LABEL; tool_stair é "Escada por croqui" (ferramenta), não categoria. |
| 58 | apps/web/src/ui/graphicsLabels.ts:13 | `Ambiente` | constante módulo | P1 | `tool_room` | Room | CATEGORY_LABEL; reutilizar tool_room. |
| 59 | apps/web/src/ui/graphicsLabels.ts:14 | `Anotação` | constante módulo | P1 | `graphics_cat_annotation` | Annotation | CATEGORY_LABEL. |
| 60 | apps/web/src/ui/graphicsLabels.ts:15 | `Objeto importado` | constante módulo | P1 | `graphics_cat_generic` | Imported object | CATEGORY_LABEL. |
| 61 | apps/web/src/ui/graphicsLabels.ts:19 | `Aramado` | constante módulo | P1 | `graphics_style_wireframe` | Wireframe | VISUAL_STYLE_LABEL. |
| 62 | apps/web/src/ui/graphicsLabels.ts:20 | `Linhas ocultas` | constante módulo | P1 | `graphics_style_hidden` | Hidden Lines | VISUAL_STYLE_LABEL. |
| 63 | apps/web/src/ui/graphicsLabels.ts:21 | `Sombreado` | constante módulo | P1 | `style_shaded` | Shaded | VISUAL_STYLE_LABEL; style_shaded já existe. |
| 64 | apps/web/src/ui/graphicsLabels.ts:22 | `Cores consistentes` | constante módulo | P1 | `graphics_style_consistent` | Consistent Colors | VISUAL_STYLE_LABEL. |
| 65 | apps/web/src/ui/graphicsLabels.ts:23 | `Realista` | constante módulo | P1 | `graphics_style_realistic` | Realistic | VISUAL_STYLE_LABEL. |
| 66 | apps/web/src/ui/graphicsLabels.ts:27 | `Modelo inteiro` | constante módulo | P1 | `graphics_partial_entire` | Entire Model | PARTIAL_LABEL (Partial Structure). |
| 67 | apps/web/src/ui/graphicsLabels.ts:28 | `Sem acabamentos` | constante módulo | P1 | `graphics_partial_no_finishes` | No Finishes | PARTIAL_LABEL. |
| 68 | apps/web/src/ui/graphicsLabels.ts:29 | `Só núcleo` | constante módulo | P1 | `graphics_partial_core` | Core Only | PARTIAL_LABEL. |
| 69 | apps/web/src/ui/graphicsLabels.ts:33 | `Por escala` | constante módulo | P1 | `graphics_detail_by_scale` | By Scale | DETAIL_LABEL. |
| 70 | apps/web/src/ui/graphicsLabels.ts:34 | `Grosso` | constante módulo | P1 | `detail_coarse` | Coarse | DETAIL_LABEL; detail_coarse existe ("Baixo"). |
| 71 | apps/web/src/ui/graphicsLabels.ts:35 | `Médio` | constante módulo | P1 | `detail_medium` | Medium | DETAIL_LABEL; detail_medium existe. |
| 72 | apps/web/src/ui/graphicsLabels.ts:36 | `Fino` | constante módulo | P1 | `detail_fine` | Fine | DETAIL_LABEL; detail_fine existe ("Alto"). |
| 73 | apps/web/src/ui/Progresso3D.tsx:28 | `Montando o modelo 3D` | aria-label | P1 | `prog_3d_aria` | Building 3D model | role="progressbar" do overlay de montagem. |
| 74 | apps/web/src/ui/Progresso3D.tsx:29 | `Montando o modelo 3D… ${montados} de ${total} pavimentos` | JSX texto | P0 | `prog_3d_text` | Building 3D model… {n} of {total} levels | Texto principal do carregamento da vista 3D. |
| 75 | apps/web/src/ui/ProgressoAbertura.tsx:29 | `Abrindo o projeto` | aria-label | P1 | `prog_open_aria` | Opening project | role="progressbar" da abertura de projeto. |
| 76 | apps/web/src/ui/progressoAbertura.ts:14 | `Lendo arquivo` | constante módulo | P0 | `prog_phase_reading` | Reading file | ROTULO_FASE: constante calculada uma vez, nunca reage a lang. |
| 77 | apps/web/src/ui/progressoAbertura.ts:15 | `Preparando o pavimento ativo` | constante módulo | P0 | `prog_phase_active` | Preparing active level | ROTULO_FASE. |
| 78 | apps/web/src/ui/progressoAbertura.ts:16 | `Preparando o projeto` | constante módulo | P0 | `prog_phase_project` | Preparing project | ROTULO_FASE. |
| 79 | apps/web/src/ui/progressoAbertura.ts:21 | `de` | formatação | P1 | `prog_phase_of` | of | "${feitas} de ${total}" é montado com palavra PT fixa. |
| 80 | apps/web/src/ui/Tutorial.tsx:44 | `Desenhe um circuito de paredes${sufixoAtalho('wall')} — clique nos pontos e feche no primeiro` | JSX texto | P0 | `tut_step_walls` | Draw a loop of walls{shortcut} — click the points and close on the first one | Passo 1 do onboarding; template literal. |
| 81 | apps/web/src/ui/Tutorial.tsx:45 | `Insira uma porta${sufixoAtalho('door')} e uma janela${sufixoAtalho('window')} sobre as paredes` | JSX texto | P0 | `tut_step_openings` | Insert a door{doorShortcut} and a window{windowShortcut} on the walls | Passo 2. |
| 82 | apps/web/src/ui/Tutorial.tsx:46 | `Selecione uma parede e troque o tipo nas Propriedades` | JSX texto | P0 | `tut_step_type` | Select a wall and change its type in Properties | Passo 3. |
| 83 | apps/web/src/ui/Tutorial.tsx:47 | `Abra o Modelo 3D no navegador de projeto` | JSX texto | P0 | `tut_step_3d` | Open the 3D Model in the Project Browser | Passo 4. |
| 84 | apps/web/src/ui/Tutorial.tsx:48 | `Salve o projeto (Ctrl+S)` | JSX texto | P0 | `tut_step_save` | Save the project (Ctrl+S) | Passo 5. |
| 85 | apps/web/src/ui/Tutorial.tsx:64 | `Primeiros passos` | aria-label | P1 | `tut_aria` | Getting started | role="region" da faixa de tutorial. |
| 86 | apps/web/src/ui/Tutorial.tsx:65 | `Passo ${now + 1} de ${steps.length}` | JSX texto | P0 | `tut_step_count` | Step {n} of {total} | Contador do tutorial. |
| 87 | apps/web/src/ui/Tutorial.tsx:72 | `Dispensar` | JSX texto | P0 | `tut_dismiss` | Dismiss | Botão de fechar o tutorial. |
| 88 | apps/web/src/ui/IssuesButton.tsx:49 | `✓ Modelo sem avisos` | JSX texto | P0 | `issue_none` | ✓ Model has no warnings | Estado normal da barra de status (sempre visível). |
| 89 | apps/web/src/ui/IssuesButton.tsx:68 | `Ver avisos de validação do modelo` | atributo (title) | P1 | `issue_open_title` | Check model warnings | title do botão da barra de status. |
| 90 | apps/web/src/ui/IssuesButton.tsx:77 | `Avisos de validação` | aria-label | P1 | `issue_popover_aria` | Model warnings | role="dialog" do popover. |
| 91 | apps/web/src/ui/IssuesButton.tsx:86 | `Ir para o elemento: ${issue.message}` | aria-label | P1 | `issue_go_aria` | Go to element: ${message} | aria-label do atalho "Ir para". |
| 92 | apps/web/src/ui/IssuesButton.tsx:87 | `Ir para` | JSX texto | P1 | `issue_go` | Go to | Botão de cada aviso. |
| 93 | apps/web/src/editor/issuesView.ts:22 | `Erros` | constante módulo (dado de UI) | P0 | `issue_sev_error` | Errors | TITLE: título do grupo de erros do popover (fora dos arquivos listados). |
| 94 | apps/web/src/editor/issuesView.ts:22 | `Avisos` | constante módulo (dado de UI) | P0 | `issue_sev_warning` | Warnings | TITLE: grupo de avisos. |
| 95 | apps/web/src/editor/issuesView.ts:22 | `Informações` | constante módulo (dado de UI) | P0 | `issue_sev_info` | Information | TITLE: grupo de informações. |
| 96 | apps/web/src/editor/issuesView.ts:38 | `1 erro` | status | P0 | `issue_count_error_one` | 1 error | summarize(): singular. |
| 97 | apps/web/src/editor/issuesView.ts:38 | `${errors} erros` | status | P0 | `issue_count_errors` | {n} errors | summarize(): plural. |
| 98 | apps/web/src/editor/issuesView.ts:39 | `1 aviso` | status | P0 | `issue_count_warning_one` | 1 warning | summarize(): singular. |
| 99 | apps/web/src/editor/issuesView.ts:39 | `${warnings} avisos` | status | P0 | `issue_count_warnings` | {n} warnings | summarize(): plural. |
| 100 | apps/web/src/editor/issuesView.ts:40 | `1 informação` | status | P0 | `issue_count_info_one` | 1 information | summarize(): singular. |
| 101 | apps/web/src/editor/issuesView.ts:40 | `${infos} informações` | status | P0 | `issue_count_info` | {n} information | summarize(): plural. |
| 102 | apps/web/src/editor/issuesView.ts:41 | ` · ` | formatação | P2 | `issue_count_sep` |  ·  | Separador do resumo; manter. |
| 103 | apps/web/src/ui/Browser.tsx:17 | `Navegador de projeto` | aria-label | P1 | `project_browser_title` | Project Browser | aria-label do <aside>; chave já existe. |
| 104 | apps/web/src/ui/Browser.tsx:18 | `Navegador de projeto - ${p.name}` | JSX texto | P0 | `br_panel_title` | Project Browser - ${name} | Título do painel (PanelHead name). |
| 105 | apps/web/src/ui/Browser.tsx:18 | `Fechar o navegador de projeto` | atributo (closeLabel) | P1 | `br_close` | Close Project Browser | closeLabel do PanelHead. |
| 106 | apps/web/src/ui/Browser.tsx:22 | `Navegador de projeto` | aria-label (Tree) | P1 | `project_browser_title` | Project Browser | aria-label da árvore. |
| 107 | apps/web/src/ui/Browser.tsx:28 | `Grupos` | JSX texto | P0 | `br_groups` | Groups | Nó de grupo do navegador. |
| 108 | apps/web/src/ui/Browser.tsx:28 | `Ainda não disponível.` | JSX texto | P1 | `br_not_available` | Not available yet. | Estado vazio dos nós Grupos/Links (repete em 29). |
| 109 | apps/web/src/ui/Browser.tsx:29 | `Links do Revit` | JSX texto | P1 | `br_revit_links` | Revit Links | Nó do navegador. |
| 110 | apps/web/src/ui/browser/Views.tsx:49 | `Novo nome de ${view.name}` | aria-label | P1 | `br_rename_aria` | New name for ${name} | Input de renomear corte/elevação. |
| 111 | apps/web/src/ui/browser/Views.tsx:63 | `Abrir` | menu (label) | P0 | `br_open` | Open | Menu de contexto da vista. |
| 112 | apps/web/src/ui/browser/Views.tsx:64 | `Renomear` | menu (label) | P0 | `br_rename` | Rename | Menu de contexto. |
| 113 | apps/web/src/ui/browser/Views.tsx:65 | `Excluir` | menu (label) | P0 | `br_delete` | Delete | Menu de contexto. |
| 114 | apps/web/src/ui/browser/Views.tsx:67 | `Duplo clique abre a vista; arraste para a prancha; botão direito: renomear, excluir.` | atributo (title) | P1 | `br_view_title` | Double-click to open the view; drag to a sheet; right-click to rename or delete. | title do nó de corte/elevação. |
| 115 | apps/web/src/ui/browser/Views.tsx:67 | `${view.kind === 'elevation' ? 'Elevação' : 'Corte'} · ${view.name}` | texto de arraste | P2 | `br_drag_view` | {Elevation\|Section} · ${name} | Rótulo do arraste para a prancha. |
| 116 | apps/web/src/ui/browser/Views.tsx:86 | `Vista 3D: ${point.name}.` | status | P2 | `br_status_go3d` | 3D view: ${name}. | Barra de status ao ir para um ponto. |
| 117 | apps/web/src/ui/browser/Views.tsx:96 | `Ponto de vista renomeado para "${draft.trim()}".` | status | P2 | `br_status_renamed` | View point renamed to "${name}". | Barra de status. |
| 118 | apps/web/src/ui/browser/Views.tsx:101 | `Novo nome de ${point.name}` | aria-label | P1 | `br_rename_aria` | New name for ${name} | Input de renomear ponto 3D. |
| 119 | apps/web/src/ui/browser/Views.tsx:115 | `Ir para o 3D` | menu (label) | P1 | `br_go_3d` | Go to 3D | Menu do ponto de vista. |
| 120 | apps/web/src/ui/browser/Views.tsx:115 | `Abre o Modelo 3D com a câmera salva neste ponto.` | atributo (hint) | P1 | `br_go_3d_hint` | Opens the 3D Model with the camera saved at this point. | hint do item. |
| 121 | apps/web/src/ui/browser/Views.tsx:116 | `Atualizar com a câmera atual` | menu (label) | P1 | `br_update_camera` | Update with Current Camera | Menu do ponto de vista. |
| 122 | apps/web/src/ui/browser/Views.tsx:116 | `Grava a órbita da vista 3D no ponto; as pranchas que o usam acompanham.` | atributo (hint) | P1 | `br_update_camera_hint` | Stores the 3D view orbit in the point; sheets that use it follow. | hint. |
| 123 | apps/web/src/ui/browser/Views.tsx:116 | `Ponto "${point.name}" atualizado com a câmera atual.` | status | P2 | `br_status_camera` | Point "${name}" updated with the current camera. | Barra de status. |
| 124 | apps/web/src/ui/browser/Views.tsx:117 | `Renomear…` | menu (label) | P0 | `br_rename_viewpoint` | Rename… | Menu do ponto de vista. |
| 125 | apps/web/src/ui/browser/Views.tsx:119 | `Excluir` | menu (label) | P0 | `br_delete` | Delete | Menu do ponto de vista. |
| 126 | apps/web/src/ui/browser/Views.tsx:120 | `Ponto de vista 3D excluído; as pranchas que o usavam mantêm a câmera.` | status | P2 | `br_status_deleted` | 3D view point deleted; sheets that used it keep the camera. | Barra de status. |
| 127 | apps/web/src/ui/browser/Views.tsx:123 | `Usado em ${pranchas} vista${pranchas === 1 ? '' : 's'} de prancha; elas mantêm a câmera.` | atributo (hint) | P1 | `br_used_in_sheets` | Used in {n} sheet view(s); they keep the camera. | Pluralização PT "vista/vistas" fixa. |
| 128 | apps/web/src/ui/browser/Views.tsx:123 | `Nenhuma prancha usa este ponto.` | atributo (hint) | P1 | `br_not_used` | No sheet uses this view point. | hint quando usage = 0. |
| 129 | apps/web/src/ui/browser/Views.tsx:131 | `Duplo clique leva o 3D a este ponto; arraste para a prancha; botão direito: atualizar, renomear, excluir.` | atributo (title) | P1 | `br_point_title` | Double-click sends 3D to this point; drag to a sheet; right-click to update, rename or delete. | title do nó. |
| 130 | apps/web/src/ui/browser/Views.tsx:134 | `3D · ${point.name}` | texto de arraste | P2 | `br_drag_3d` | 3D · ${name} | Rótulo do arraste. |
| 131 | apps/web/src/ui/browser/Views.tsx:150 | `Gerar elevações (Norte, Sul, Leste, Oeste)` | menu (label) | P0 | `br_generate_elevations` | Generate Elevations (North, South, East, West) | Menu do grupo Elevações. |
| 132 | apps/web/src/ui/browser/Views.tsx:150 | `Cria as quatro em volta das paredes do nível ativo; substitui as de mesmo nome.` | atributo (hint) | P1 | `br_generate_elevations_hint` | Creates the four around the active level walls; replaces same-named ones. | hint. |
| 133 | apps/web/src/ui/browser/Views.tsx:155 | `Ponto de vista 3D "${... }" salvo. Botão direito no ponto: renomear.` | status | P2 | `br_status_saved` | 3D view point "${name}" saved. Right-click the point to rename. | Barra de status. |
| 134 | apps/web/src/ui/browser/Views.tsx:158 | `Vistas (todas)` | JSX texto | P0 | `views_all` | Views (all) | Nó raiz do navegador; chave já existe. |
| 135 | apps/web/src/ui/browser/Views.tsx:159 | `Plantas de piso (Planta de piso)` | JSX texto | P0 | `br_floor_plans_node` | Floor Plans (Floor Plan) | Nó de grupo; floor_plans existe só como "Floor Plans". |
| 136 | apps/web/src/ui/browser/Views.tsx:159 | `Níveis…` | menu (label) | P0 | `br_levels` | Levels… | Menu dos grupos de plantas. |
| 137 | apps/web/src/ui/browser/Views.tsx:167 | `Elevação ${formatQuantity(...)}. Duplo clique abre; arraste para a prancha.` | atributo (title) | P1 | `br_plan_level_title` | Elevation ${value}. Double-click to open; drag to a sheet. | title do nó de planta. |
| 138 | apps/web/src/ui/browser/Views.tsx:169 | `Planta · ${l.name}` | texto de arraste | P2 | `br_drag_plan` | Plan · ${name} | Rótulo do arraste. |
| 139 | apps/web/src/ui/browser/Views.tsx:170 | `Abrir` | menu (label) | P0 | `br_open` | Open | Menu do nó de planta. |
| 140 | apps/web/src/ui/browser/Views.tsx:175 | `Plantas de cobertura (Planta de cobertura)` | JSX texto | P0 | `br_roof_plans_node` | Roof Plans (Roof Plan) | Nó de grupo sem chave existente. |
| 141 | apps/web/src/ui/browser/Views.tsx:183 | `Planta de cobertura do nível ${l.name}. Duplo clique abre.` | atributo (title) | P1 | `br_roof_plan_title` | Roof plan of level ${name}. Double-click to open. | title. |
| 142 | apps/web/src/ui/browser/Views.tsx:185 | `Abrir` | menu (label) | P0 | `br_open` | Open | Menu. |
| 143 | apps/web/src/ui/browser/Views.tsx:189 | `Plantas de forro (Planta de forro)` | JSX texto | P0 | `br_ceiling_plans_node` | Ceiling Plans (Ceiling Plan) | Nó de grupo. |
| 144 | apps/web/src/ui/browser/Views.tsx:189 | `Ainda não disponível: o forro aparece na planta de piso.` | JSX texto | P1 | `br_ceiling_empty` | Not available yet: ceilings appear in the floor plan. | Estado vazio do grupo. |
| 145 | apps/web/src/ui/browser/Views.tsx:192 | `Plantas de área (Área)` | JSX texto | P0 | `br_area_plans_node` | Area Plans (Area) | Nó de grupo. |
| 146 | apps/web/src/ui/browser/Views.tsx:197 | `Criar para todos os níveis` | menu (label) | P1 | `br_create_all_levels` | Create for All Levels | Menu do grupo Plantas de área. |
| 147 | apps/web/src/ui/browser/Views.tsx:197 | `${ids.length} planta(s) de área criada(s).` | status | P2 | `br_status_area_created` | {n} area plan(s) created. | Pluralização "(s)" fixa. |
| 148 | apps/web/src/ui/browser/Views.tsx:197 | `Todos os níveis já têm planta de área.` | status | P2 | `br_status_area_all` | All levels already have an area plan. | Barra de status. |
| 149 | apps/web/src/ui/browser/Views.tsx:199 | `Nenhuma planta de área. Botão direito: criar para todos os níveis.` | JSX texto | P1 | `br_area_empty` | No area plans. Right-click: create for all levels. | Estado vazio. |
| 150 | apps/web/src/ui/browser/Views.tsx:208 | `Planta de área: linhas de referência, etiquetas e quadro. Duplo clique abre; arraste para a prancha.` | atributo (title) | P1 | `br_area_plan_title` | Area plan: reference lines, tags and schedule. Double-click to open; drag to a sheet. | title. |
| 151 | apps/web/src/ui/browser/Views.tsx:210 | `Área · ${ap.name}` | texto de arraste | P2 | `br_drag_area` | Area · ${name} | Rótulo do arraste. |
| 152 | apps/web/src/ui/browser/Views.tsx:213 | `Excluir planta de área` | rótulo de desfazer | P2 | `br_undo_delete_area` | Delete Area Plan | Nome do passo de desfazer (aparece no menu Desfazer). |
| 153 | apps/web/src/ui/browser/Views.tsx:218 | `Vistas 3D (3D View)` | JSX texto | P0 | `br_3d_views_node` | 3D Views (3D View) | Nó de grupo. |
| 154 | apps/web/src/ui/browser/Views.tsx:218 | `Salvar vista atual…` | menu (label) | P0 | `br_save_view` | Save Current View… | Menu do grupo 3D. |
| 155 | apps/web/src/ui/browser/Views.tsx:218 | `Guarda a câmera da vista 3D aberta como um ponto do catálogo.` | atributo (hint) | P1 | `br_save_view_hint` | Stores the open 3D view camera as a catalog point. | hint. |
| 156 | apps/web/src/ui/browser/Views.tsx:219 | `Modelo 3D` | JSX texto | P0 | `br_3d_model` | 3D Model | Nó da vista 3D viva. |
| 157 | apps/web/src/ui/browser/Views.tsx:222 | `Elevações (Elevação de edifício)` | JSX texto | P0 | `br_elevations_node` | Elevations (Building Elevation) | elevations existe só como "Elevations (Building Elevation)". |
| 158 | apps/web/src/ui/browser/Views.tsx:222 | `Nenhuma elevação. Botão direito: Gerar elevações.` | JSX texto | P1 | `br_elevations_empty` | No elevations. Right-click: Generate Elevations. | Estado vazio. |
| 159 | apps/web/src/ui/browser/Views.tsx:225 | `Cortes (Corte de edifício)` | JSX texto | P0 | `br_sections_node` | Sections (Building Section) | Nó de grupo. |
| 160 | apps/web/src/ui/browser/Views.tsx:225 | `Nenhum corte. Use a ferramenta Corte na planta.` | JSX texto | P1 | `br_sections_empty` | No sections. Use the Section tool in the floor plan. | Estado vazio. |
| 161 | apps/web/src/ui/browser/Views.tsx:228 | `Vistas de desenho (Detalhe)` | JSX texto | P0 | `br_drafting_node` | Drafting Views (Detail) | Nó de grupo. |
| 162 | apps/web/src/ui/browser/Views.tsx:228 | `Ainda não disponível.` | JSX texto | P1 | `br_not_available` | Not available yet. | Estado vazio. |
| 163 | apps/web/src/ui/browser/Views.tsx:229 | `Legendas` | JSX texto | P0 | `br_legends_node` | Legends | Nó de grupo. |
| 164 | apps/web/src/ui/browser/Views.tsx:229 | `Ainda não disponível.` | JSX texto | P1 | `br_not_available` | Not available yet. | Estado vazio. |
| 165 | apps/web/src/ui/browser/Views.tsx:239 | `Tabela de ambientes` | JSX texto | P0 | `br_sched_rooms` | Room Schedule | Grupo Tabelas/Quantidades. |
| 166 | apps/web/src/ui/browser/Views.tsx:240 | `Tabela de escadas` | JSX texto | P0 | `br_sched_stairs` | Stair Schedule | Idem. |
| 167 | apps/web/src/ui/browser/Views.tsx:241 | `Tabela de rampas` | JSX texto | P0 | `br_sched_ramps` | Ramp Schedule | Idem. |
| 168 | apps/web/src/ui/browser/Views.tsx:242 | `Tabela de forros` | JSX texto | P0 | `br_sched_ceilings` | Ceiling Schedule | Idem. |
| 169 | apps/web/src/ui/browser/Views.tsx:243 | `Tabela de lajes` | JSX texto | P0 | `br_sched_slabs` | Slab Schedule | Idem. |
| 170 | apps/web/src/ui/browser/Views.tsx:244 | `Tabela de paredes` | JSX texto | P0 | `br_sched_walls` | Wall Schedule | Idem. |
| 171 | apps/web/src/ui/browser/Views.tsx:245 | `Tabela de pisos` | JSX texto | P0 | `br_sched_floors` | Floor Schedule | Idem. |
| 172 | apps/web/src/ui/browser/Views.tsx:246 | `Tabela de portas e janelas` | JSX texto | P0 | `br_sched_openings` | Door and Window Schedule | Idem. |
| 173 | apps/web/src/ui/browser/Views.tsx:247 | `Tabela de telhados` | JSX texto | P0 | `br_sched_roofs` | Roof Schedule | Idem. |
| 174 | apps/web/src/ui/browser/Views.tsx:250 | `Tabelas/Quantidades (todas)` | JSX texto | P0 | `schedules` | Schedules/Quantities (all) | Nó de grupo. |
| 175 | apps/web/src/ui/browser/Views.tsx:253 | `${r.n} elemento${r.n === 1 ? '' : 's'}. Duplo clique abre.` | atributo (title) | P1 | `br_sched_count` | {n} element(s). Double-click to open. | Pluralização PT fixa. |
| 176 | apps/web/src/ui/browser/Views.tsx:267 | `Operação recusada.` | status | P1 | `vp_operation_refused` | Operation refused. | Fallback de erro em sheetAction. |
| 177 | apps/web/src/ui/browser/Views.tsx:279 | `A prancha já está no início da lista.` | status | P2 | `br_sheet_first` | The sheet is already first in the list. | Barra de status. |
| 178 | apps/web/src/ui/browser/Views.tsx:279 | `A prancha já está no fim da lista.` | status | P2 | `br_sheet_last` | The sheet is already last in the list. | Barra de status. |
| 179 | apps/web/src/ui/browser/Views.tsx:280 | `Mover prancha para cima` | rótulo de desfazer | P2 | `br_undo_sheet_up` | Move Sheet Up | Nome do passo de desfazer. |
| 180 | apps/web/src/ui/browser/Views.tsx:280 | `Mover prancha para baixo` | rótulo de desfazer | P2 | `br_undo_sheet_down` | Move Sheet Down | Nome do passo de desfazer. |
| 181 | apps/web/src/ui/browser/Views.tsx:280 | `Prancha movida para cima.` | status | P2 | `br_sheet_moved_up` | Sheet moved up. | Barra de status. |
| 182 | apps/web/src/ui/browser/Views.tsx:280 | `Prancha movida para baixo.` | status | P2 | `br_sheet_moved_down` | Sheet moved down. | Barra de status. |
| 183 | apps/web/src/ui/browser/Views.tsx:285 | `Pranchas (todas)` | JSX texto | P0 | `sheets` | Sheets (all) | Nó de grupo; chave já existe. |
| 184 | apps/web/src/ui/browser/Views.tsx:289 | `Nenhuma prancha. Botão direito: Nova prancha.` | JSX texto | P1 | `br_sheets_empty` | No sheets. Right-click: New Sheet. | Estado vazio. |
| 185 | apps/web/src/ui/browser/Views.tsx:291 | `Nova prancha` | menu (label) | P0 | `br_new_sheet` | New Sheet | Menu do grupo Pranchas. |
| 186 | apps/web/src/ui/browser/Views.tsx:291 | `Prancha criada.` | status | P2 | `br_sheet_created` | Sheet created. | Barra de status. |
| 187 | apps/web/src/ui/browser/Views.tsx:292 | `Renumerar pranchas…` | menu (label) | P0 | `br_renumber_sheets` | Renumber Sheets… | Menu do grupo Pranchas. |
| 188 | apps/web/src/ui/browser/Views.tsx:303 | `Folha ${sh.size}${sh.discipline ? ` · ${sh.discipline}` : ''}. Duplo clique abre.` | atributo (title) | P1 | `br_sheet_title` | Sheet ${size}${discipline}. Double-click to open. | title do nó de prancha. |
| 189 | apps/web/src/ui/browser/Views.tsx:306 | `Abrir` | menu (label) | P0 | `br_open` | Open | Menu da prancha. |
| 190 | apps/web/src/ui/browser/Views.tsx:307 | `Propriedades da prancha…` | menu (label) | P0 | `br_sheet_props` | Sheet Properties… | Menu da prancha. |
| 191 | apps/web/src/ui/browser/Views.tsx:308 | `Mover para cima` | menu (label) | P0 | `br_move_up` | Move Up | Menu da prancha. |
| 192 | apps/web/src/ui/browser/Views.tsx:309 | `Mover para baixo` | menu (label) | P0 | `br_move_down` | Move Down | Menu da prancha. |
| 193 | apps/web/src/ui/browser/Views.tsx:310 | `Emitir revisão…` | menu (label) | P1 | `br_issue_revision` | Issue Revision… | Menu da prancha. |
| 194 | apps/web/src/ui/browser/Views.tsx:311 | `Duplicar` | menu (label) | P0 | `br_duplicate` | Duplicate | Menu da prancha. |
| 195 | apps/web/src/ui/browser/Views.tsx:311 | `Duplicar prancha` | rótulo de desfazer | P2 | `br_undo_duplicate_sheet` | Duplicate Sheet | Nome do passo de desfazer. |
| 196 | apps/web/src/ui/browser/Views.tsx:311 | `Prancha duplicada.` | status | P2 | `br_sheet_duplicated` | Sheet duplicated. | Barra de status. |
| 197 | apps/web/src/ui/browser/Views.tsx:312 | `Excluir prancha` | rótulo de desfazer | P2 | `br_undo_delete_sheet` | Delete Sheet | Nome do passo de desfazer. |
| 198 | apps/web/src/ui/browser/Views.tsx:312 | `Prancha excluída.` | status | P2 | `br_sheet_deleted` | Sheet deleted. | Barra de status. |
| 199 | apps/web/src/ui/browser/Families.tsx:21 | `Outros` | JSX texto | P1 | `br_family_others` | Others | Grupo de tipos sem família. |
| 200 | apps/web/src/ui/browser/Families.tsx:22 | `pt-BR` | formatação (locale) | P2 | `br_sort_locale` | en-US | localeCompare com locale fixo: ordem alfabética não acompanha o idioma. |
| 201 | apps/web/src/ui/browser/Families.tsx:48 | `Famílias` | JSX texto | P0 | `families` | Families | Nó raiz; chave já existe. |
| 202 | apps/web/src/ui/browser/Families.tsx:49 | `Escadas` | JSX texto | P1 | `br_cat_stairs` | Stairs | Categoria de família. |
| 203 | apps/web/src/ui/browser/Families.tsx:56 | `Rampas` | JSX texto | P1 | `br_cat_ramps` | Ramps | Categoria de família. |
| 204 | apps/web/src/ui/browser/Families.tsx:63 | `Forros` | JSX texto | P1 | `br_cat_ceilings` | Ceilings | Categoria de família. |
| 205 | apps/web/src/ui/browser/Families.tsx:70 | `Janelas` | JSX texto | P1 | `br_cat_windows` | Windows | Categoria de família. |
| 206 | apps/web/src/ui/browser/Families.tsx:71 | `Lajes` | JSX texto | P1 | `br_cat_slabs` | Slabs | Categoria de família. |
| 207 | apps/web/src/ui/browser/Families.tsx:78 | `Paredes` | JSX texto | P1 | `br_cat_walls` | Walls | Categoria de família. |
| 208 | apps/web/src/ui/browser/Families.tsx:85 | `Pisos` | JSX texto | P1 | `br_cat_floors` | Floors | Categoria de família. |
| 209 | apps/web/src/ui/browser/Families.tsx:92 | `Portas` | JSX texto | P1 | `br_cat_doors` | Doors | Categoria de família. |
| 210 | apps/web/src/ui/browser/Families.tsx:93 | `Telhados` | JSX texto | P1 | `br_cat_roofs` | Roofs | Categoria de família. |
| 211 | apps/web/src/ui/browser/Cad.tsx:17 | `CAD importado` | JSX texto | P1 | `br_cad_imported` | Imported CAD | Nó de grupo do navegador. |
| 212 | apps/web/src/ui/browser/Cad.tsx:21 | `Nenhum desenho CAD. Menu Inserir → Importar CAD (DXF).` | JSX texto | P1 | `br_cad_empty` | No CAD drawings. Insert menu → Import CAD (DXF). | Estado vazio. |
| 213 | apps/web/src/ui/browser/Cad.tsx:23 | `Importar CAD (DXF)…` | menu (label) | P0 | `br_import_cad` | Import CAD (DXF)… | Menu do grupo. |
| 214 | apps/web/src/ui/browser/Cad.tsx:24 | `Gerenciar CAD…` | menu (label) | P1 | `br_manage_cad` | Manage CAD… | Menu do grupo. |
| 215 | apps/web/src/ui/browser/Cad.tsx:30 | `Ocultar` | menu (label) | P0 | `br_hide` | Hide | Menu do desenho CAD. |
| 216 | apps/web/src/ui/browser/Cad.tsx:30 | `Mostrar` | menu (label) | P0 | `br_show` | Show | Menu do desenho CAD. |
| 217 | apps/web/src/ui/browser/Cad.tsx:31 | `Selecionar` | menu (label) | P1 | `br_select` | Select | Menu do desenho CAD. |
| 218 | apps/web/src/ui/browser/Cad.tsx:32 | `Enquadrar` | menu (label) | P1 | `br_zoom_fit` | Zoom to Fit | Menu do desenho CAD. |
| 219 | apps/web/src/ui/browser/Cad.tsx:33 | `Renomear…` | menu (label) | P1 | `br_rename_cad` | Rename… | Menu do desenho CAD. |
| 220 | apps/web/src/ui/browser/Cad.tsx:34 | `Excluir` | menu (label) | P1 | `br_delete` | Delete | Menu do desenho CAD. |
| 221 | apps/web/src/ui/browser/Cad.tsx:40 | `${c.name} (oculto)` | JSX texto | P1 | `br_cad_hidden` | ${name} (hidden) | Sufixo fixo no nó. |
| 222 | apps/web/src/ui/browser/Cad.tsx:42 | `${cadLevelName(p, c)} · ${c.layers.length} camada(s), ${c.paths.length} traço(s), ${c.texts.length} texto(s). Duplo clique seleciona; botão direito: mostrar/ocultar, enquadrar, excluir.` | atributo (title) | P1 | `br_cad_title` | ${level} · {n} layer(s), {n} line(s), {n} text(s). Double-click selects; right-click: show/hide, zoom to fit, delete. | Pluralização "(s)" fixa. |
| 223 | apps/web/src/ui/dims/dimsActions.ts:14 | `Esta cota é só de leitura.` | status | P1 | `dim_readonly` | This dimension is read-only. | Erro ao editar cota sem `edit`. |
| 224 | apps/web/src/ui/dims/dimsActions.ts:19 | `um ângulo` | JSX texto/status | P2 | `dim_a_angle` | an angle | Nome da grandeza na mensagem de medida inválida. |
| 225 | apps/web/src/ui/dims/dimsActions.ts:19 | `uma distância` | JSX texto/status | P2 | `dim_a_distance` | a distance | Nome da grandeza na mensagem. |
| 226 | apps/web/src/ui/dims/dimsActions.ts:20 | `Medida inválida: digite ${nome}, como ${exemplo}.` | status | P1 | `dim_invalid_measure` | Invalid measurement: enter ${noun}, such as ${example}. | Barra de status do editor de cota. |
| 227 | apps/web/src/ui/dims/dimEditModel.ts:35 | `Cota de corte é só anotação: não move elementos.` | status | P1 | `dim_section_refusal` | A section dimension is annotation only: it does not move elements. | SECTION_REFUSAL. |
| 228 | apps/web/src/ui/dims/dimEditModel.ts:41 | `Medida inválida: digite uma distância, como ${...}.` | status | P1 | `dim_invalid_distance` | Invalid measurement: enter a distance, such as ${example}. | Duplica a mensagem de dimsActions. |
| 229 | apps/web/src/ui/dims/DimValueEditor.tsx:70 | `Confirme o diálogo para aplicar a cota.` | status | P1 | `dim_confirm_dialog` | Confirm the dialog to apply the dimension. | Status quando o comando fica pendente. |
| 230 | apps/web/src/ui/dims/DimValueEditor.tsx:73 | `Cota atualizada.` | status | P1 | `dim_updated` | Dimension updated. | Status de sucesso. |
| 231 | apps/web/src/ui/dims/DimValueEditor.tsx:82 | `Valor da cota` | aria-label | P1 | `dim_value_aria` | Dimension value | Input flutuante da cota permanente. |
| 232 | apps/web/src/ui/dims/DimValueEditor.tsx:97 | `Ponta que fica parada: automático, A ou B` | atributo (title) | P1 | `dim_fixed_tip` | End that stays put: automatic, A or B | title do botão de fixar ponta. |
| 233 | apps/web/src/ui/dims/DimValueEditor.tsx:102 | `automático` | JSX texto | P1 | `dim_auto` | automatic | Texto do botão quando não fixado. |
| 234 | apps/web/src/ui/dims/DimValueEditor.tsx:102 | `fixar ${fixed.toUpperCase()}` | JSX texto | P1 | `dim_fix_end` | lock ${end} | Estado "fixar A/B" do botão. |
| 235 | apps/web/src/ui/dims/DimValueEditor.tsx:68 | `Alterar cota` | rótulo de desfazer | P2 | `dim_undo_edit` | Edit Dimension | Nome do passo de desfazer. |
| 236 | apps/web/src/ui/dims/TempDimsOverlay.tsx:143 | `Confirme o diálogo para aplicar a cota.` | status | P1 | `dim_confirm_dialog` | Confirm the dialog to apply the dimension. | Repetido de DimValueEditor. |
| 237 | apps/web/src/ui/dims/TempDimsOverlay.tsx:146 | `Cota atualizada.` | status | P1 | `dim_updated` | Dimension updated. | Status de sucesso. |
| 238 | apps/web/src/ui/dims/TempDimsOverlay.tsx:153 | `Converter em cotas permanentes` | rótulo de desfazer | P2 | `dim_undo_make_permanent` | Convert to Permanent Dimensions | Nome do passo de desfazer. |
| 239 | apps/web/src/ui/dims/TempDimsOverlay.tsx:156 | `Nada a converter.` | status | P1 | `dim_nothing_convert` | Nothing to convert. | Status do botão "I". |
| 240 | apps/web/src/ui/dims/TempDimsOverlay.tsx:162 | `Cotas criadas.` | status | P1 | `dim_created` | Dimensions created. | Status do botão "I". |
| 241 | apps/web/src/ui/dims/TempDimsOverlay.tsx:205 | `Cota: ${dim.key.split(':').pop()}` | aria-label | P1 | `dim_field_aria` | Dimension: ${id} | aria-label do campo de valor (mostra a chave crua). |
| 242 | apps/web/src/ui/dims/TempDimsOverlay.tsx:206 | `Digite a medida e pressione Enter` | atributo (title) | P1 | `dim_edit_tip` | Type the measurement and press Enter | title quando editável. |
| 243 | apps/web/src/ui/dims/TempDimsOverlay.tsx:206 | `Cota de leitura` | atributo (title) | P1 | `dim_readonly_tip` | Read-only dimension | title quando não editável. |
| 244 | apps/web/src/ui/dims/TempDimsOverlay.tsx:247 | `Clique no elemento para a nova referência (Esc cancela).` | status | P1 | `dim_pick_ref` | Click the element for the new reference (Esc cancels). | Shift+clique na alça. |
| 245 | apps/web/src/ui/dims/TempDimsOverlay.tsx:253 | `Trocar referência da cota` | rótulo de desfazer | P2 | `dim_undo_ref` | Change Dimension Reference | Nome do passo de desfazer. |
| 246 | apps/web/src/ui/dims/TempDimsOverlay.tsx:268 | `Converter em cotas permanentes` | aria-label + title | P1 | `dim_convert_permanent` | Convert to Permanent Dimensions | Botão "I". |
| 247 | apps/web/src/ui/dims/dimsView.ts:90 | `Referência: ${dimElementRefLabel(...)} (clique para alternar; Shift+clique para escolher outro elemento)` | atributo (title) | P1 | `dim_grip_alt` | Reference: ${label} (click to cycle; Shift+click to pick another element) | title da alça de cota. |
| 248 | apps/web/src/ui/dims/dimsView.ts:99 | `Referência: ${refLabel(...)} (clique para alternar)` | atributo (title) | P1 | `dim_grip` | Reference: ${label} (click to cycle) | title da alça de cota. |
| 249 | apps/web/src/ui/dims/dimsView.ts:76 | ` · ` | formatação | P2 | `dim_secondary_sep` |  ·  | Separador entre valor e medida secundária ("5,00 · 53,1°"). |
| 250 | apps/web/src/ui/sheet/SheetControlBar.tsx:51 | `Esquerda` | constante módulo (label) | P0 | `sheet_align_left` | Left | ALIGN: rótulo do botão de alinhar. |
| 251 | apps/web/src/ui/sheet/SheetControlBar.tsx:51 | `Alinhar as vistas selecionadas à esquerda` | constante módulo (title) | P1 | `sheet_align_left_tip` | Align selected views to the left | title/aria do botão. |
| 252 | apps/web/src/ui/sheet/SheetControlBar.tsx:52 | `Centro H` | constante módulo (label) | P0 | `sheet_align_hcenter` | H Center | ALIGN. |
| 253 | apps/web/src/ui/sheet/SheetControlBar.tsx:52 | `Centralizar as vistas selecionadas na horizontal` | constante módulo (title) | P1 | `sheet_align_hcenter_tip` | Center selected views horizontally | title/aria. |
| 254 | apps/web/src/ui/sheet/SheetControlBar.tsx:53 | `Direita` | constante módulo (label) | P0 | `sheet_align_right` | Right | ALIGN. |
| 255 | apps/web/src/ui/sheet/SheetControlBar.tsx:53 | `Alinhar as vistas selecionadas à direita` | constante módulo (title) | P1 | `sheet_align_right_tip` | Align selected views to the right | title/aria. |
| 256 | apps/web/src/ui/sheet/SheetControlBar.tsx:54 | `Topo` | constante módulo (label) | P0 | `sheet_align_top` | Top | ALIGN. |
| 257 | apps/web/src/ui/sheet/SheetControlBar.tsx:54 | `Alinhar as vistas selecionadas pelo topo` | constante módulo (title) | P1 | `sheet_align_top_tip` | Align selected views by the top | title/aria. |
| 258 | apps/web/src/ui/sheet/SheetControlBar.tsx:55 | `Centro V` | constante módulo (label) | P0 | `sheet_align_vcenter` | V Center | ALIGN. |
| 259 | apps/web/src/ui/sheet/SheetControlBar.tsx:55 | `Centralizar as vistas selecionadas na vertical` | constante módulo (title) | P1 | `sheet_align_vcenter_tip` | Center selected views vertically | title/aria. |
| 260 | apps/web/src/ui/sheet/SheetControlBar.tsx:56 | `Base` | constante módulo (label) | P0 | `sheet_align_bottom` | Bottom | ALIGN. |
| 261 | apps/web/src/ui/sheet/SheetControlBar.tsx:56 | `Alinhar as vistas selecionadas pela base` | constante módulo (title) | P1 | `sheet_align_bottom_tip` | Align selected views by the bottom | title/aria. |
| 262 | apps/web/src/ui/sheet/SheetControlBar.tsx:82 | `Barra da prancha` | aria-label | P1 | `sheet_bar_aria` | Sheet bar | role="toolbar" da barra inferior. |
| 263 | apps/web/src/ui/sheet/SheetControlBar.tsx:83 | `Diminuir o zoom da folha` | atributo (title+aria) | P1 | `sheet_zoom_out` | Zoom out of sheet | Botão −. |
| 264 | apps/web/src/ui/sheet/SheetControlBar.tsx:84 | `Zoom ${zoomPct}%` | aria-label | P2 | `sheet_zoom_aria` | Zoom ${pct}% | Leitor de tela do nível de zoom. |
| 265 | apps/web/src/ui/sheet/SheetControlBar.tsx:85 | `Aumentar o zoom da folha` | atributo (title+aria) | P1 | `sheet_zoom_in` | Zoom in on sheet | Botão +. |
| 266 | apps/web/src/ui/sheet/SheetControlBar.tsx:86 | `Ajustar` | JSX texto | P0 | `sheet_fit` | Fit | Botão de enquadrar. |
| 267 | apps/web/src/ui/sheet/SheetControlBar.tsx:86 | `Enquadrar a folha inteira (Z)` | atributo (title+aria) | P1 | `sheet_fit_tip` | Fit the whole sheet (Z) | title/aria. |
| 268 | apps/web/src/ui/sheet/SheetControlBar.tsx:87 | `Tamanho real na tela (100%)` | atributo (title+aria) | P1 | `sheet_actual_size` | Actual size on screen (100%) | Botão 1:1. |
| 269 | apps/web/src/ui/sheet/SheetControlBar.tsx:88 | `Ver vista` | JSX texto | P0 | `sheet_zoom_to_view` | Zoom to View | Botão. |
| 270 | apps/web/src/ui/sheet/SheetControlBar.tsx:88 | `Enquadrar a vista selecionada` | atributo (title+aria) | P1 | `sheet_zoom_to_view_tip` | Fit the selected view | title/aria. |
| 271 | apps/web/src/ui/sheet/SheetControlBar.tsx:90 | `Grade` | JSX texto | P0 | `sheet_grid` | Grid | Botão. |
| 272 | apps/web/src/ui/sheet/SheetControlBar.tsx:90 | `Mostra a grade de 10 mm da folha (G)` | atributo (title+aria) | P1 | `sheet_grid_tip` | Shows the 10 mm sheet grid (G) | title/aria. |
| 273 | apps/web/src/ui/sheet/SheetControlBar.tsx:91 | `Encaixe` | JSX texto | P0 | `sheet_snap` | Snap | Botão. |
| 274 | apps/web/src/ui/sheet/SheetControlBar.tsx:91 | `Encaixa nas bordas e centros das outras vistas` | atributo (title+aria) | P1 | `sheet_snap_tip` | Snaps to the edges and centers of other views | title/aria. |
| 275 | apps/web/src/ui/sheet/SheetControlBar.tsx:92 | `Mover` | JSX texto | P0 | `sheet_move` | Move | Botão; reutilizar tool_move. |
| 276 | apps/web/src/ui/sheet/SheetControlBar.tsx:92 | `Mover a vista pela moldura ou por um ponto do desenho (M)` | atributo (title+aria) | P1 | `sheet_move_tip` | Move the view by its frame or a drawing point (M) | title/aria. |
| 277 | apps/web/src/ui/sheet/SheetControlBar.tsx:93 | `Alinhar` | JSX texto | P0 | `sheet_align` | Align | Botão; reutilizar tool_align. |
| 278 | apps/web/src/ui/sheet/SheetControlBar.tsx:93 | `Alinhar pela moldura ou por faces/eixos do desenho (A) — Esc cancela` | atributo (title+aria) | P1 | `sheet_align_tip` | Align by the frame or drawing faces/axes (A) — Esc cancels | title/aria. |
| 279 | apps/web/src/ui/sheet/SheetControlBar.tsx:97 | `Escala da vista selecionada` | atributo (title) | P1 | `sheet_scale_tip` | Scale of the selected view | title do campo. |
| 280 | apps/web/src/ui/sheet/SheetControlBar.tsx:99 | `Escala` | JSX texto | P0 | `scale` | Scale | Label visível; chave scale já existe. |
| 281 | apps/web/src/ui/sheet/SheetControlBar.tsx:103 | `Escala da vista` | aria-label | P1 | `sheet_scale_aria` | View scale | aria-label do select. |
| 282 | apps/web/src/ui/sheet/SheetControlBar.tsx:114 | `Ponto de vista 3D mostrado na vista` | atributo (title) | P1 | `sheet_point3d_tip` | 3D view point shown in the view | title do campo Ponto. |
| 283 | apps/web/src/ui/sheet/SheetControlBar.tsx:116 | `Ponto` | JSX texto | P0 | `sheet_point` | Point | Label visível do seletor. |
| 284 | apps/web/src/ui/sheet/SheetControlBar.tsx:120 | `Ponto de vista 3D` | aria-label | P1 | `sheet_point3d_aria` | 3D view point | aria-label do select. |
| 285 | apps/web/src/ui/sheet/SheetControlBar.tsx:124 | `Enquadramento padrão` | JSX texto | P0 | `sheet_default_framing` | Default framing | Opção do select. |
| 286 | apps/web/src/ui/sheet/SheetControlBar.tsx:130 | `Trocar` | JSX texto | P0 | `sheet_change` | Change | Botão que aplica o ponto. |
| 287 | apps/web/src/ui/sheet/SheetControlBar.tsx:130 | `Trocar o ponto de vista 3D da vista` | atributo (title+aria) | P1 | `sheet_change_tip` | Change the 3D view point of the view | title/aria. |
| 288 | apps/web/src/ui/sheet/SheetControlBar.tsx:133 | `Ajustar moldura` | JSX texto | P0 | `sheet_fit_crop` | Fit Crop | Botão. |
| 289 | apps/web/src/ui/sheet/SheetControlBar.tsx:133 | `Ajusta a moldura ao desenho, na escala atual` | atributo (title+aria) | P1 | `sheet_fit_crop_tip` | Fits the crop to the drawing at the current scale | title/aria. |
| 290 | apps/web/src/ui/sheet/SheetControlBar.tsx:134 | `Recortar` | JSX texto | P0 | `sheet_crop` | Crop | Botão. |
| 291 | apps/web/src/ui/sheet/SheetControlBar.tsx:134 | `Recorta o desenho à moldura (Revit: Crop View)` | atributo (title+aria) | P1 | `sheet_crop_tip` | Crops the drawing to the frame (Revit: Crop View) | title/aria. |
| 292 | apps/web/src/ui/sheet/SheetControlBar.tsx:135 | `Moldura` | JSX texto | P0 | `sheet_frame` | Frame | Botão. |
| 293 | apps/web/src/ui/sheet/SheetControlBar.tsx:135 | `Mostra a moldura da vista na folha` | atributo (title+aria) | P1 | `sheet_frame_tip` | Shows the view frame on the sheet | title/aria. |
| 294 | apps/web/src/ui/sheet/SheetControlBar.tsx:136 | `Legenda` | JSX texto | P0 | `sheet_view_title` | View Title | Botão. |
| 295 | apps/web/src/ui/sheet/SheetControlBar.tsx:136 | `Mostra a legenda da vista` | atributo (title+aria) | P1 | `sheet_view_title_tip` | Shows the view title | title/aria. |
| 296 | apps/web/src/ui/sheet/SheetControlBar.tsx:137 | `Travar` | JSX texto | P0 | `sheet_lock` | Lock | Botão. |
| 297 | apps/web/src/ui/sheet/SheetControlBar.tsx:137 | `Trava a vista: não se move nem se redimensiona` | atributo (title+aria) | P1 | `sheet_lock_tip` | Locks the view: it cannot move or resize | title/aria. |
| 298 | apps/web/src/ui/sheet/SheetControlBar.tsx:138 | `Moldura auto` | JSX texto | P0 | `sheet_auto_crop` | Auto Fit | Botão. |
| 299 | apps/web/src/ui/sheet/SheetControlBar.tsx:138 | `Ao trocar a escala, a moldura acompanha o desenho` | atributo (title+aria) | P1 | `sheet_auto_crop_tip` | When the scale changes, the frame follows the drawing | title/aria. |
| 300 | apps/web/src/ui/sheet/SheetControlBar.tsx:145 | `Distribuir H` | JSX texto | P0 | `sheet_distribute_h` | Distribute H | Botão. |
| 301 | apps/web/src/ui/sheet/SheetControlBar.tsx:145 | `Distribui as vistas com vãos iguais na horizontal` | atributo (title+aria) | P1 | `sheet_distribute_h_tip` | Distributes views with equal horizontal gaps | title/aria. |
| 302 | apps/web/src/ui/sheet/SheetControlBar.tsx:146 | `Distribuir V` | JSX texto | P0 | `sheet_distribute_v` | Distribute V | Botão. |
| 303 | apps/web/src/ui/sheet/SheetControlBar.tsx:146 | `Distribui as vistas com vãos iguais na vertical` | atributo (title+aria) | P1 | `sheet_distribute_v_tip` | Distributes views with equal vertical gaps | title/aria. |
| 304 | apps/web/src/ui/sheet/SheetControlBar.tsx:150 | `Adicionar vista` | JSX texto | P0 | `sheet_add_view` | Add View | Botão. |
| 305 | apps/web/src/ui/sheet/SheetControlBar.tsx:150 | `Adiciona uma planta, corte ou 3D a esta prancha` | atributo (title+aria) | P1 | `sheet_add_view_tip` | Adds a plan, section or 3D to this sheet | title/aria. |
| 306 | apps/web/src/ui/sheet/SheetControlBar.tsx:151 | `Propriedades` | JSX texto | P0 | `properties_title` | Properties | Botão; chave properties_title já existe. |
| 307 | apps/web/src/ui/sheet/SheetControlBar.tsx:151 | `Propriedades da prancha (folha, carimbo, revisões)` | atributo (title+aria) | P1 | `sheet_props_tip` | Sheet properties (paper, title block, revisions) | title/aria. |
| 308 | apps/web/src/ui/sheet/SheetControlBar.tsx:152 | `Folha ${sheet.size} com ${sheet.viewports.length} vistas` | atributo (title) | P1 | `sheet_info_tip` | Sheet ${size} with {n} views | title do resumo. |
| 309 | apps/web/src/ui/sheet/SheetControlBar.tsx:153 | `vista${sheet.viewports.length === 1 ? '' : 's'}` | JSX texto | P1 | `sheet_view_count` | view${n === 1 ? "" : "s"} | Pluralização manual no resumo. |
| 310 | apps/web/src/ui/sheet/SheetControlBar.tsx:154 | ` · vista ${...} × ${...} mm` | JSX texto | P2 | `sheet_view_size` |  · view {w} × {h} mm | Unidade mm fixa no texto. |
| 311 | apps/web/src/ui/sheet/SheetCanvas.tsx:228 | `Folha ${sheet.size} ${orientação}, ${n} vistas` | aria-label | P1 | `sheet_canvas_aria` | Sheet ${size} ${orientation}, {n} views | aria do SVG da prancha. |
| 312 | apps/web/src/ui/sheet/SheetCanvas.tsx:228 | `deitada` | JSX texto | P1 | `sheet_landscape` | landscape | Ternário PT dentro do aria-label. |
| 313 | apps/web/src/ui/sheet/SheetCanvas.tsx:228 | `em pé` | JSX texto | P1 | `sheet_portrait` | portrait | Ternário PT dentro do aria-label. |
| 314 | apps/web/src/ui/sheet/SheetCanvas.tsx:315 | `Referência: ` | canvas/SVG (rótulo desenhado) | P2 | `sheet_ref_prefix` | Reference:  | Prefix desenhado nas guias do Alinhar. |
| 315 | apps/web/src/ui/sheet/SheetCanvas.tsx:317 | `Alinhar: ` | canvas/SVG (rótulo desenhado) | P2 | `sheet_align_prefix` | Align:  | Prefix das guias da fila. |
| 316 | apps/web/src/ui/sheet/SheetCanvas.tsx:320 | `Mover: ` | canvas/SVG (rótulo desenhado) | P2 | `sheet_move_prefix` | Move:  | Prefix da guia candidata. |
| 317 | apps/web/src/ui/sheet/SheetCanvas.tsx:344 | `Δ ${...} mm` | canvas/SVG (rótulo desenhado) | P2 | `sheet_delta` | Δ ${value} mm | Distância do fantasma; mm fixo e arredondamento manual. |
| 318 | apps/web/src/ui/sheet/SheetCanvas.tsx:374 | `${dropPreview.label} — 1:${scale}${adjusted ? ' — ajustada para caber' : ''}` | canvas/SVG (rótulo desenhado) | P1 | `sheet_drop_preview` | ${label} — 1:${scale}${adjusted ? " — adjusted to fit" : ""} | Prévia da vista arrastada do navegador. |
| 319 | apps/web/src/ui/sheet/SheetStage.tsx:309 | `Prancha inexistente.` | JSX texto | P1 | `sheet_missing` | Sheet not found. | Estado de erro quando a prancha some. |
| 320 | apps/web/src/ui/sheet/SheetStage.tsx:392 | `Folha vazia.` | JSX texto | P1 | `sheet_empty` | Empty sheet. | Estado vazio da prancha sem vistas. |
| 321 | apps/web/src/ui/sheet/SheetStage.tsx:394 | `Adicionar vista` | JSX texto | P0 | `sheet_add_view` | Add View | Botão do estado vazio da prancha. |
| 322 | apps/web/src/ui/sheet/SheetStage.tsx:396 | `Arraste uma vista do Navegador para cá · roda do mouse para zoom · botão do meio para pan` | JSX texto | P1 | `sheet_empty_hint` | Drag a view from the Browser here · mouse wheel to zoom · middle button to pan | Dica do estado vazio da prancha. |
| 323 | apps/web/src/ui/sheet/SheetStage.tsx:23 | `Operação recusada.` | status | P1 | `vp_operation_refused` | Operation refused. | Fallback de erro (refused). |
| 324 | apps/web/src/ui/sheet/SheetStage.tsx:134 | `A vista está travada. Use Travar na barra para destravar.` | status | P1 | `sheet_locked_hint` | The view is locked. Use Lock on the bar to unlock it. | Status ao tentar mover vista travada. |
| 325 | apps/web/src/ui/sheet/SheetStage.tsx:159 | `Vista travada. Use Travar na barra para destravar.` | status | P1 | `sheet_locked_hint_short` | View locked. Use Lock on the bar to unlock it. | Mesma mensagem, redação diferente. |
| 326 | apps/web/src/ui/sheet/SheetStage.tsx:222 | `Vistas movidas. / Vista movida.` | status | P2 | `sheet_moved` | Views moved. / View moved. | Pluralização manual. |
| 327 | apps/web/src/ui/sheet/SheetStage.tsx:228 | `Vista redimensionada: ${w} × ${h} mm.` | status | P2 | `sheet_resized` | View resized: {w} × {h} mm. | mm fixo. |
| 328 | apps/web/src/ui/sheet/SheetStage.tsx:287 | `Vistas removidas. / Vista removida.` | status | P2 | `sheet_removed` | Views removed. / View removed. | Pluralização manual. |
| 329 | apps/web/src/ui/sheet/SheetStage.tsx:322 | `Vistas alinhadas.` | status | P2 | `sheet_aligned` | Views aligned. | Status. |
| 330 | apps/web/src/ui/sheet/SheetStage.tsx:326 | `Vistas distribuídas.` | status | P2 | `sheet_distributed` | Views distributed. | Status. |
| 331 | apps/web/src/ui/sheet/SheetStage.tsx:422 | `Escala alterada para 1:${s}.` | status | P2 | `sheet_scale_changed` | Scale changed to 1:${scale}. | Status. |
| 332 | apps/web/src/ui/sheet/SheetStage.tsx:424 | `Recortar vista na prancha` | rótulo de desfazer | P2 | `sheet_undo_crop` | Crop View on Sheet | Nome do passo de desfazer. |
| 333 | apps/web/src/ui/sheet/SheetStage.tsx:425 | `Moldura da vista` | rótulo de desfazer | P2 | `sheet_undo_frame` | View Frame | Nome do passo de desfazer. |
| 334 | apps/web/src/ui/sheet/SheetStage.tsx:426 | `Legenda da vista` | rótulo de desfazer | P2 | `sheet_undo_label` | View Title | Nome do passo de desfazer. |
| 335 | apps/web/src/ui/sheet/SheetStage.tsx:430 | `Vista destravada. / Vista travada.` | status | P2 | `sheet_lock_toggle` | View unlocked. / View locked. | Status do botão Travar. |
| 336 | apps/web/src/ui/sheet/SheetStage.tsx:435 | `Moldura ajustada ao desenho.` | status | P2 | `sheet_frame_fitted` | Frame fitted to the drawing. | Status. |
| 337 | apps/web/src/ui/sheet/sheetCommit.ts:10 | `Operação recusada.` | status | P1 | `vp_operation_refused` | Operation refused. | Fallback de erro de gravação. |
| 338 | apps/web/src/ui/sheet/sheetCommit.ts:28 | `Mover vistas da prancha / Mover vista da prancha` | rótulo de desfazer | P2 | `sheet_undo_move` | Move Sheet Views / Move Sheet View | Nome do passo de desfazer. |
| 339 | apps/web/src/ui/sheet/sheetCommit.ts:39 | `As vistas selecionadas estão travadas.` | status | P1 | `sheet_all_locked` | The selected views are locked. | Recusa do nudge. |
| 340 | apps/web/src/ui/sheet/sheetCommit.ts:45 | `As vistas selecionadas estão travadas.` | status | P1 | `sheet_all_locked` | The selected views are locked. | Recusa ao remover. |
| 341 | apps/web/src/ui/sheet/sheetCommit.ts:49 | `Excluir vistas da prancha / Excluir vista da prancha` | rótulo de desfazer | P2 | `sheet_undo_delete` | Delete Sheet Views / Delete Sheet View | Nome do passo de desfazer. |
| 342 | apps/web/src/ui/sheet/useSheetAlign.ts:13 | `Alinhar: clique na referência e depois no que deseja alinhar. Ctrl+clique acumula vários; Tab alterna a feição; Esc volta um passo.` | constante módulo (status) | P1 | `sheet_align_hint` | Align: click the reference and then what you want to align. Ctrl+click accumulates several; Tab cycles the feature; Esc steps back. | HINT calculado no load do módulo. |
| 343 | apps/web/src/ui/sheet/useSheetAlign.ts:76 | `a vista de referência não se move` | status | P2 | `sheet_align_note_ref` | the reference view does not move | Nota interna da mensagem "Nada a alinhar". |
| 344 | apps/web/src/ui/sheet/useSheetAlign.ts:81 | `a folha não se move` | status | P2 | `sheet_align_note_sheet` | the sheet does not move | Nota. |
| 345 | apps/web/src/ui/sheet/useSheetAlign.ts:87 | `vista travada` | status | P2 | `sheet_align_note_locked` | view locked | Nota. |
| 346 | apps/web/src/ui/sheet/useSheetAlign.ts:92 | `linhas não paralelas` | status | P2 | `sheet_align_note_parallel` | non-parallel lines | Nota. |
| 347 | apps/web/src/ui/sheet/useSheetAlign.ts:100 | `Nada a alinhar: ${notes.join('; ')}. / Já estão alinhados.` | status | P2 | `sheet_align_nothing` | Nothing to align: ${notes}. / Already aligned. | Junta as notas. |
| 348 | apps/web/src/ui/sheet/useSheetAlign.ts:116 | `Vistas alinhadas / Alinhada${partial} . Referência: ${label}. Clique no próximo (Esc troca a referência).` | status | P2 | `sheet_align_done` | Views aligned / Aligned${partial}. Reference: ${label}. Click the next one (Esc changes the reference). | (encostou no limite da folha) também PT fixo. |
| 349 | apps/web/src/ui/sheet/useSheetAlign.ts:139 | `Clique sobre uma face, eixo, aresta ou na moldura da vista.` | status | P2 | `sheet_align_pick` | Click a face, axis, edge or the view frame. | Status. |
| 350 | apps/web/src/ui/sheet/useSheetAlign.ts:144 | `Referência: ${cand.label}. Clique no que deseja alinhar (Tab troca a candidata).` | status | P2 | `sheet_align_ref_set` | Reference: ${label}. Click what you want to align (Tab cycles the candidate). | Status. |
| 351 | apps/web/src/ui/sheet/useSheetAlign.ts:148 | `Clique sobre a feição que deseja mover.` | status | P2 | `sheet_align_pick_target` | Click the feature you want to move. | Status. |
| 352 | apps/web/src/ui/sheet/useSheetAlign.ts:154 | `${n} feição(ões) para alinhar. Ctrl+clique soma ou tira; clique sem Ctrl (ou Enter) aplica.` | status | P2 | `sheet_align_queue` | {n} feature(s) to align. Ctrl+click adds or removes; click without Ctrl (or Enter) applies. | Pluralização "(ões)". |
| 353 | apps/web/src/ui/sheet/useSheetAlign.ts:167 | `${cands[0].label}. ${HINT}` | status | P2 | `sheet_align_cycle_one` | ${label}. ${hint} | Status do Tab quando só há uma candidata. |
| 354 | apps/web/src/ui/sheet/useSheetAlign.ts:172 | `Clique para alinhar; Tab troca a feição.` | status | P2 | `sheet_align_click_align` | Click to align; Tab cycles the feature. | Ternário do status do Tab (com referência escolhida). |
| 355 | apps/web/src/ui/sheet/useSheetAlign.ts:172 | `Clique para usar como referência; Tab troca a feição.` | status | P2 | `sheet_align_click_ref` | Click to use as reference; Tab cycles the feature. | Status do Tab. |
| 356 | apps/web/src/ui/sheet/useSheetAlign.ts:178 | `Seleção múltipla cancelada. Referência: ${ref?.label ?? 'nenhuma'}. ${HINT}` | status | P2 | `sheet_align_cancel` | Multiple selection canceled. Reference: ${label ?? "none"}. ${hint} | Esc na fila. |
| 357 | apps/web/src/ui/sheet/useSheetMove.ts:42 | `${dist.toFixed(1).replace('.', ',')} mm · ${angle.toFixed(0)}°` | formatação | P1 | `sheet_move_fmt` | ${dist} mm · ${angle}° | Vírgula decimal fixa: em EN o separador deve ser ponto. |
| 358 | apps/web/src/ui/sheet/useSheetMove.ts:82 | `Mover: clique no ponto base e depois no destino (ou digite a distância). Esc cancela.` | status | P2 | `sheet_move_start_base` | Move: click the base point and then the destination (or type the distance). Esc cancels. | Status. |
| 359 | apps/web/src/ui/sheet/useSheetMove.ts:83 | `Mover: clique numa vista (moldura ou desenho) para escolher, depois no ponto base e no destino.` | status | P2 | `sheet_move_start_pick` | Move: click a view (frame or drawing) to select it, then the base point and the destination. | Status. |
| 360 | apps/web/src/ui/sheet/useSheetMove.ts:123 | `As vistas selecionadas estão travadas.` | status | P2 | `sheet_all_locked` | The selected views are locked. | Status. |
| 361 | apps/web/src/ui/sheet/useSheetMove.ts:139 | `Movido ${fmtText(delta)}${partial ? ' (encostou no limite da folha)' : ''}.` | status | P2 | `sheet_move_done` | Moved ${delta}${partial}. | Status. |
| 362 | apps/web/src/ui/sheet/useSheetMove.ts:153 | `Mover: clique sobre a moldura ou o desenho de uma vista.` | status | P2 | `sheet_move_pick` | Move: click the frame or drawing of a view. | Status. |
| 363 | apps/web/src/ui/sheet/useSheetMove.ts:159 | `Mover: clique no ponto base (ponto do desenho ou da moldura).` | status | P2 | `sheet_move_base` | Move: click the base point (drawing or frame point). | Status. |
| 364 | apps/web/src/ui/sheet/useSheetMove.ts:168 | `Mover: clique no destino - ou digite a distância em mm e Enter. Esc cancela o ponto base.` | status | P2 | `sheet_move_dest` | Move: click the destination - or type the distance in mm and press Enter. Esc cancels the base point. | Status. |
| 365 | apps/web/src/ui/sheet/useSheetMove.ts:183 | `Distância cancelada. Clique no destino ou digite outra distância.` | status | P2 | `sheet_move_dist_cancel` | Distance canceled. Click the destination or type another distance. | Status. |
| 366 | apps/web/src/ui/sheet/useSheetMove.ts:189 | `Ponto base cancelado. Clique no ponto base.` | status | P2 | `sheet_move_base_cancel` | Base point canceled. Click the base point. | Status. |
| 367 | apps/web/src/ui/sheet/useSheetMove.ts:200 | `Distância inválida. Digite um número em mm.` | status | P2 | `sheet_move_dist_invalid` | Invalid distance. Type a number in mm. | Status. |
| 368 | apps/web/src/ui/sheet/useSheetMove.ts:216 | `Distância: ${next} mm - Enter aplica, Esc cancela.` | status | P2 | `sheet_move_dist` | Distance: ${value} mm - Enter applies, Esc cancels. | Status. |
| 369 | apps/web/src/ui/sheet/useSheetMove.ts:226 | `Clique no destino ou digite a distância.` | status | P2 | `sheet_move_dest_hint` | Click the destination or type the distance. | Status. |
| 370 | apps/web/src/ui/sheet/useSheetDrop.ts:100 | `A vista não cabe na área de desenho desta prancha.` | status | P1 | `sheet_drop_too_big` | The view does not fit in this sheet drawing area. | Status ao soltar vista. |
| 371 | apps/web/src/ui/sheet/useSheetDrop.ts:106 | `${src.label} adicionada à prancha · 1:${scale}${adjusted ? ' (reescalada para caber)' : ''}` | status | P2 | `sheet_drop_done` | ${label} added to the sheet · 1:${scale}${adjusted} | Status. |
| 372 | apps/web/src/ui/sheet/useSheetDrop.ts:108 | `Não foi possível inserir a vista.` | status | P1 | `sheet_drop_failed` | Could not insert the view. | Fallback de erro. |
| 373 | apps/web/src/ui/sheet/sheetSnapPoints.ts:62 | `Extremidade` | constante módulo | P2 | `snap_endpoint` | Endpoint | LABELS: rótulo do tipo de snap (status/tooltip). |
| 374 | apps/web/src/ui/sheet/sheetSnapPoints.ts:63 | `Interseção` | constante módulo | P2 | `snap_intersection` | Intersection | LABELS. |
| 375 | apps/web/src/ui/sheet/sheetSnapPoints.ts:64 | `Meio` | constante módulo | P2 | `snap_midpoint` | Midpoint | LABELS. |
| 376 | apps/web/src/ui/sheet/sheetSnapPoints.ts:65 | `Canto da moldura` | constante módulo | P2 | `snap_frame_corner` | Frame corner | LABELS. |
| 377 | apps/web/src/ui/sheet/sheetSnapPoints.ts:66 | `Meio da moldura` | constante módulo | P2 | `snap_frame_mid` | Frame midpoint | LABELS. |
| 378 | apps/web/src/ui/sheet/sheetSnapPoints.ts:67 | `Centro da moldura` | constante módulo | P2 | `snap_frame_center` | Frame center | LABELS. |
| 379 | apps/web/src/ui/sheet/sheetSnapPoints.ts:68 | `Canto da folha` | constante módulo | P2 | `snap_sheet_corner` | Sheet corner | LABELS. |
| 380 | apps/web/src/ui/sheet/sheetSnapPoints.ts:69 | `Meio da folha` | constante módulo | P2 | `snap_sheet_mid` | Sheet midpoint | LABELS. |
| 381 | apps/web/src/ui/sheet/sheetSnapPoints.ts:70 | `Centro da folha` | constante módulo | P2 | `snap_sheet_center` | Sheet center | LABELS. |
| 382 | apps/web/src/ui/sheet/sheetAlignTool.ts:154 | `moldura da vista` | rótulo de feição | P2 | `sheet_feat_frame` | view frame | label exibido no status do Alinhar. |
| 383 | apps/web/src/ui/sheet/sheetAlignTool.ts:252 | `linha do desenho` | rótulo de feição | P2 | `sheet_feat_line` | drawing line | label do Alinhar. |
| 384 | apps/web/src/ui/sheet/sheetAlignTool.ts:290 | `borda da folha` | rótulo de feição | P2 | `sheet_feat_sheet_edge` | sheet edge | label do Alinhar. |
| 385 | apps/web/src/ui/sheet/sheetAlignTool.ts:294 | `centro da folha` | rótulo de feição | P2 | `sheet_feat_sheet_center` | sheet center | label do Alinhar. |
| 386 | packages/render/src/sheet/frame.ts:34 | ` · Sem escala` | canvas/SVG (rótulo desenhado) | P0 | `sheet_caption_nts` |  · NTS | Legenda da vista 3D na prancha/PDF; Revit imprime "NTS". |
| 387 | packages/render/src/sheet/frame.ts:38 | `Vista inexistente` | canvas/SVG (rótulo desenhado) | P1 | `sheet_view_missing` | View not found | Fallback do nome da vista na legenda. |
| 388 | packages/render/src/sheet/frame.ts:40 | `Quadro geral de áreas` | canvas/SVG (rótulo desenhado) | P0 | `sheet_area_summary` | Area Summary Schedule | Título do quadro de áreas na prancha. |
| 389 | packages/render/src/sheet/frame.ts:45 | `3D` | canvas/SVG (rótulo desenhado) | P1 | `sheet_3d_default` | 3D | Nome padrão da legenda quando não há ponto; dado gerado. |
| 390 | packages/render/src/sheet/frame.ts:51 | `Sem escala` | canvas/SVG (rótulo desenhado) | P0 | `sheet_nts` | NTS | Campo Escala do carimbo quando não há vistas com escala. |
| 391 | packages/render/src/sheet/frame.ts:113 | `Projeto: ${tb.project}` | canvas/SVG (carimbo) | P0 | `sheet_stamp_project` | Project: ${value} | Carimbo desenhado na tela e no PDF. |
| 392 | packages/render/src/sheet/frame.ts:114 | `Cliente: ${tb.client}` | canvas/SVG (carimbo) | P0 | `sheet_stamp_client` | Client: ${value} | Carimbo. |
| 393 | packages/render/src/sheet/frame.ts:115 | `Autor: ${tb.author}` | canvas/SVG (carimbo) | P0 | `sheet_stamp_author` | Author: ${value} | Carimbo. |
| 394 | packages/render/src/sheet/frame.ts:116 | `Data: ${tb.date}` | canvas/SVG (carimbo) | P0 | `sheet_stamp_date` | Date: ${value} | Carimbo; a data é texto do usuário (não converte formato). |
| 395 | packages/render/src/sheet/frame.ts:117 | `Revisão: ${tb.revision}` | canvas/SVG (carimbo) | P0 | `sheet_stamp_revision` | Revision: ${value} | Carimbo. |
| 396 | packages/render/src/sheet/frame.ts:118 | `Escala: ${...}` | canvas/SVG (carimbo) | P0 | `sheet_stamp_scale` | Scale: ${value} | Carimbo. |
| 397 | packages/render/src/sheet/frame.ts:123 | `Rev. ${r.tag}` | canvas/SVG (carimbo) | P1 | `sheet_stamp_rev_row` | Rev. ${tag} | Tabela de revisões acima do carimbo. |
| 398 | packages/render/src/gpu/controlador.ts:168 | `Área de desenho` | aria-label (canvas) | P1 | `canvas_aria` | Drawing area | aria-label do canvas WebGL/WebGPU; repetido na linha 185. |
| 399 | packages/render/src/plan/rooms.ts:24 | `Ambiente ${r.number} / Ambiente` | canvas/SVG (rótulo desenhado) | P1 | `room_default_name` | Room ${number} / Room | Nome padrão desenhado quando o ambiente não tem nome; o nome do usuário é dado e não traduz. |
| 400 | packages/model/src/defaults.ts:171 | `Projeto sem título` | nome padrão do documento | P0 | `doc_untitled` | Untitled Project | Nome inicial do projeto (título da aba e navegador). |
| 401 | packages/model/src/defaults.ts:176 | `Térreo` | nome padrão do documento | P0 | `level_ground` | Level 1 | Nível padrão; aparece no navegador e nas plantas. |
| 402 | packages/model/src/defaults.ts:177 | `Pavimento 2` | nome padrão do documento | P0 | `level_2` | Level 2 | Nível padrão. |
| 403 | packages/model/src/dimensionSettings.ts:40 | `Eixo` | constante módulo | P1 | `dimref_axis` | Axis | WALL_DIM_REF_LABELS: title das alças de cota. |
| 404 | packages/model/src/dimensionSettings.ts:41 | `Face acabada` | constante módulo | P1 | `dimref_finish` | Finished Face | WALL_DIM_REF_LABELS. |
| 405 | packages/model/src/dimensionSettings.ts:42 | `Eixo do núcleo` | constante módulo | P1 | `dimref_core_center` | Core Center | WALL_DIM_REF_LABELS. |
| 406 | packages/model/src/dimensionSettings.ts:43 | `Face do núcleo` | constante módulo | P1 | `dimref_core_face` | Core Face | WALL_DIM_REF_LABELS. |
| 407 | packages/model/src/dimensionSettings.ts:47 | `Centro` | constante módulo | P1 | `dimref_center` | Center | OPENING_DIM_REF_LABELS. |
| 408 | packages/model/src/dimensionSettings.ts:48 | `Vão livre` | constante módulo | P1 | `dimref_clear` | Clear Opening | OPENING_DIM_REF_LABELS. |
| 409 | packages/model/src/dimensionSettings.ts:49 | `Vão externo do batente` | constante módulo | P1 | `dimref_frame` | Frame Opening | OPENING_DIM_REF_LABELS. |
| 410 | packages/model/src/dimensionSettings.ts:50 | `Com alizar` | constante módulo | P1 | `dimref_casing` | With Casing | OPENING_DIM_REF_LABELS. |

## Mistura PT/EN no mesmo arquivo
- `browser/Views.tsx`: menus PT ("Abrir", "Renomear", "Excluir") convivem com o rótulo "3D View" e "Modelo 3D" no mesmo nó (`g:3d`, linha 218-219).
- `browser/Families.tsx`: cabeçalhos PT ("Escadas", "Paredes") sobre nomes de família/tipo que já vêm em PT do documento ("Alvenaria 14", "Porta 80").
- `sheet/SheetControlBar.tsx`: rótulos PT ("Escala", "Recortar") ao lado de "1:1" e "Zoom %" universais.
- `SectionCanvas.tsx`: o nome da vista (`view.name`, dado) aparece ao lado do selo fixo "Corte"/"Elevação".
- `browser/Cad.tsx`: "CAD importado" + contadores "camada(s)/traço(s)/texto(s)" (pluralização PT) no mesmo title.
- `ViewCube.tsx`: rótulos das faces em caixa alta PT ("SUPERIOR") e botão "Ortogonal/Perspectiva" no mesmo controle que usa ícones.

## Riscos / testes que quebram
- `apps/web/src/ui/viewcube.test.ts:56-63` — `expect(zoneById(...).name).toBe('Vista frontal')` etc. Quebra ao traduzir `zoneOf`.
- `apps/web/src/ui/sheet/SheetControlBar.test.ts:64-70,83-85` — espera `aria-label="Ponto de vista 3D"`, `>Ponto<`, `>Enquadramento padrão<`, `>Trocar<`.
- `apps/web/src/ui/dims/dimsView.test.ts:36-43,52,69-73` — espera `refLabel(...)` em PT ("Eixo", "Face acabada", "Vão livre"...) e `dimText` com "·".
- `apps/web/src/ui/sheet/sheetSnapPoints.test.ts:61,105,176-179` — espera "Canto da moldura", "Extremidade", "Interseção", "Meio da folha", "Centro da moldura".
- `apps/web/src/ui/sheet/sheetAlignTool.test.ts:68,87,137,157` — espera `label` "moldura da vista", "linha do desenho", "borda da folha".
- `apps/web/src/ui/browser/Views.test.ts:16` — espera o title "Duplo clique leva o 3D a este ponto".
- `apps/web/src/ui/schematic/renderSchematic.test.ts:50-51` — usa "Corte de teste" só como dado de entrada; não quebra.
- Testes de `packages/render/src/sheet/*.test.ts` que comparam textos do carimbo/legenda em PT (ex.: `areaPlanSheet.test.ts:50-53,82-83`) quebram se `frame.ts` passar a receber idioma.
- Fora dos testes: `editor/contextMenu.ts` já é bilíngue; se as chaves novas forem declaradas em `i18n.ts`, manter a paridade `pt`/`en` (o tipo `as const` não força as duas tabelas a terem as mesmas chaves, então uma chave só em PT cai no fallback cru).

## Já correto
- `apps/web/src/ui/PopupMenu.tsx` — não tem texto próprio; só glifos ✓/▸ e `aria-*` estruturais. Os labels vêm de `editor/contextMenu.ts`, que mantém `TEXTOS` PT/EN.
- `apps/web/src/ui/CanvasContextMenu.tsx` — só orquestra o `PopupMenu`; sem literais de UI.
- `apps/web/src/ui/useCanvasContextMenu.ts` — lê `lang` do store e passa `toolLabel` para os comandos recentes (linhas 35,48-49); único ponto da área que segue o idioma.
- `apps/web/src/ui/PlanLabels.tsx` — camada de renderização pura: recebe `LabelOp[].text` já pronto do render e marca o contêiner como `aria-hidden`.
- `apps/web/src/ui/schematic/SchematicDrawing.tsx` e `schematic/{drawing,geometry,lanes}.ts` — componentes/geometria sem texto fixo; `ariaLabel`, `label`, `caption` e `text` vêm por props dos diálogos.
- `apps/web/src/ui/sheet/{sheetCamera,sheetGestures,sheetSnap,sheetSelection,useSheetCamera,useSheetKeys}.ts` — sem literais de UI (só chaves técnicas, cursores e eixos).
- `apps/web/src/ui/{quadroPlanta,plantaProvisoria,montagem3dProgressiva,progresso3d}.ts` e `ViewCubeRing.tsx` — sem texto de UI (o anel só desenha as letras de `COMPASS`).
- `apps/web/src/ui/SheetView.tsx` — delega ao palco da prancha; sem literais.
