# 02 — Ribbon, abas, barras e chrome do app

- Escopo: `apps/web/src/ui/ribbon/**`, `apps/web/src/ui/{Ribbon,Icon,NavBar,StatusBar,InfoCenter,ViewTabs,ViewControlBar,FileMenu,Dock,PanelHead,LabelScroll,Tutorial,IssuesButton,DisjoinCheck,SnapButton,OrthoButton,EmptyViews,Browser}.tsx`, `apps/web/index.html` (atributo `lang`)
- Arquivos analisados: 34 (+7 de fronteira citados em anexo)
- Ocorrências: 93 (P0: 31, P1: 53, P2: 9)

## Resumo executivo

A faixa em si já é o subsistema mais bem internacionalizado do app: `ribbon/model.ts` define `Txt = string | {pt,en}`, `tabsMain.ts`/`tabsSoon.ts`/`panelsShared.ts`/`context.ts` usam `t()` em 100% dos rótulos e `parts.tsx` resolve tudo com `txt(x, lang)`. Os problemas estão nas bordas:

1. **Componentes de chrome sem `useI18n` nenhum** — `ViewTabs`, `Tutorial`, `SnapButton`, `OrthoButton`, `EmptyViews`, `IssuesButton`, `DisjoinCheck`, `Dock`, `PanelHead`, `LabelScroll`, `Browser` — com PT fixo em texto visível, `title` e `aria-label`.
2. **Mapas de módulo PT-only** consumidos em EN: `SNAP` em `StatusBar.tsx:13-25`, `ITEMS` em `SnapButton.tsx:15-26`, `DETAIL_LABEL`/`VISUAL_STYLE_LABEL` em `graphicsLabels.ts:18-37` (usados pela barra de controle de vista) e `SEM_ESBOCO`/`DICA_COMANDO` em `editor/perimeterComandos.ts:21-44` (usados nos tooltips da faixa).
3. **Mensagens de status e rótulos de undo gerados dentro de `run()`** sem `lang` em `ribbon/actions.ts` (8 pontos) e `FileMenu.tsx` (2 pontos). O botão troca de idioma, mas a mensagem que ele escreve na barra de status não.
4. **`Ribbon.tsx > OpeningActions`** (painel extra da aba contextual de portas/janelas) é 100% PT fixo, apesar de `lang` já estar disponível no componente pai.
5. **`commandSearch`** usa `toolLabel(it.tool, lang)` e ignora o `label` localizado do item da faixa: a busca mostra um nome diferente do botão (ex.: "Lance de escada" em vez de "Escada"), nos dois idiomas.

Causa provável: o padrão `t()`/`txt()` foi adotado na camada de dados da faixa (`ribbon/`), mas não foi propagado para os componentes de chrome nem para os textos gerados em callbacks; e os mapas de rótulo nasceram antes do seletor de idioma.

## Causas-raiz

- **Componente sem acesso ao idioma**: `ViewTabs.tsx` (nenhum import de `useI18n`; `128`, `167-168`, `181`, `208-209`, `224`, `227`), `Tutorial.tsx` (`44-48`, `64-65`, `72`), `SnapButton.tsx` (`16-25`, `103`, `118`, `121-122`, `129`, `133`, `156-158`), `OrthoButton.tsx` (`18-19`, `25`, `27`, `35`, `37`, `43`, `52`, `61`), `EmptyViews.tsx` (`9-13`), `IssuesButton.tsx` (`49`, `68`, `77`, `86-87`), `DisjoinCheck.tsx` (`5`, `11`), `Dock.tsx` (`58`, `66`), `PanelHead.tsx` (`73`, `80`), `LabelScroll.tsx` (`58`), `Browser.tsx` (`17-22`, `28-29`).
- **Mapa constante calculado uma vez em PT**: `StatusBar.tsx:13-25` (`SNAP`) é lido em `47` sem tradução; `SnapButton.tsx:15-26` (`ITEMS`) idem; `graphicsLabels.ts:18-24` (`VISUAL_STYLE_LABEL`) e `32-37` (`DETAIL_LABEL`) usados em `ViewControlBar.tsx:76` e `86`; `editor/perimeterComandos.ts:21-44` usado em `ribbon/parts.tsx:46`.
- **Texto PT gerado em callback**: `ribbon/actions.ts:171`, `181`, `307`, `338`, `340`, `351`, `372`, `374`; `FileMenu.tsx:80`, `138`. Nesses pontos não há `I18N[lang]`, então a barra de status/undo fica PT em EN.
- **Painel da faixa que não recebeu `lang`**: `Ribbon.tsx:25-48` (`OpeningActions`) usa `title`/`aria-label`/`rb-title` fixos; o pai tem `lang` em `65` mas não o passa.
- **Busca ignora o rótulo localizado do item**: `ribbon/commandSearch.ts:30` chama `toolLabel(it.tool, lang)` mesmo quando `it.label` existe (`tabsMain.ts:19-39`, `tabsMain.ts:50`, `panelsShared.ts:20`).
- **Formatação sem locale**: `StatusBar.tsx:44`/`46` usam `formatQuantity`, que sempre formata com vírgula decimal (ver `packages/model/src/unitsFormat.ts`); as coordenadas da barra de status não seguem o idioma.
- **`<html lang>` estático**: `apps/web/index.html:2` (`lang="pt-BR"`), sem sincronização com `useI18n`.

## Inventário

| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/Ribbon.tsx:31 | `Abertura` | aria-label | P0 | `rb_open_panel` | Opening | painel extra da aba contextual; PT fixo |
| 2 | apps/web/src/ui/Ribbon.tsx:34 | `Inverter sentido (Tab)` | title + aria-label | P0 | `rb_flip_facing` | Flip Facing (Tab) | `aria-label="Inverter sentido"` na mesma linha |
| 3 | apps/web/src/ui/Ribbon.tsx:37 | `Inverter dobradiça (Espaço)` | title + aria-label | P0 | `rb_flip_hand` | Flip Hand (Space) | `aria-label="Inverter dobradiça"` na mesma linha |
| 4 | apps/web/src/ui/Ribbon.tsx:40 | `Etiquetas de portas e janelas` | title + aria-label | P0 | `rb_open_tags` | Door/Window Tags | alternador de etiquetas |
| 5 | apps/web/src/ui/Ribbon.tsx:45 | `Abertura` | JSX texto | P0 | `rb_open_panel` | Opening | `rb-title` do painel |
| 6 | apps/web/src/ui/Ribbon.tsx:156 | `pt ? 'Arquivo' : 'File'` (e demais) | ternário inline | P2 | — | — | padrão sistêmico (156-189); funciona, mas é dívida |
| 7 | apps/web/src/ui/ribbon/actions.ts:171 | `${n} ambiente(s) etiquetado(s).` / `Todos os ambientes desta planta já têm etiqueta.` | status | P1 | `status_rooms_tagged` / `status_rooms_all_tagged` | {n} room(s) tagged. / All rooms in this plan are already tagged. | mensagem gerada sem `lang` |
| 8 | apps/web/src/ui/ribbon/actions.ts:181 | `Alternar etiquetas do modelo` | undo label | P1 | `undo_toggle_tags` | Toggle model tags | aparece no tooltip de Desfazer |
| 9 | apps/web/src/ui/ribbon/actions.ts:307 | `Não foi possível alterar as linhas finas.` | status | P1 | `status_thin_lines_error` | Could not change thin lines. | fallback fixo |
| 10 | apps/web/src/ui/ribbon/actions.ts:338 | `Prancha criada.` | status | P1 | `status_sheet_created` | Sheet created. | confirmação |
| 11 | apps/web/src/ui/ribbon/actions.ts:340 | `Operação recusada.` | status | P1 | `status_op_rejected` | Operation not allowed. | fallback de exceção |
| 12 | apps/web/src/ui/ribbon/actions.ts:351 | `Abra uma prancha para adicionar vistas.` | status | P1 | `status_open_sheet_first` | Open a sheet to add views. | — |
| 13 | apps/web/src/ui/ribbon/actions.ts:372 | `Prancha do nível criada.` / `${n} pranchas criadas, uma por nível.` | status | P1 | `status_sheet_per_level` | Level sheet created. / {n} sheets created, one per level. | — |
| 14 | apps/web/src/ui/ribbon/actions.ts:374 | `Operação recusada.` | status | P1 | `status_op_rejected` | Operation not allowed. | segundo ponto |
| 15 | apps/web/src/ui/ribbon/parts.tsx:62 | `Na planta de área, use as ferramentas de anotação.` | ternário inline | P2 | `rb_area_plan_hint` | In an area plan, use the annotation tools. | funciona; padronizar em `I18N` |
| 16 | apps/web/src/ui/ribbon/parts.tsx:160 | `a criar` | ternário inline | P2 | `rb_soon_tag` | soon | texto do menu de split |
| 17 | apps/web/src/ui/ribbon/commandSearch.ts:30 | `toolLabel(it.tool, lang)` | lógica | P2 | — | — | ignora `it.label`; resultado diverge do botão |
| 18 | apps/web/src/ui/StatusBar.tsx:14 | `Extremidade` | mapa PT-only | P1 | `snap_endpoint` | Endpoint | mapa `SNAP` inteiro (13-25) é PT: endpoint/face/core/midpoint/intersection/perpendicular/nearest/alignment/ortho/polar/grid |
| 19 | apps/web/src/ui/StatusBar.tsx:43 | `Sequência de atalho em andamento` | aria-label | P1 | `sb_shortcut_pending` | Shortcut sequence in progress | — |
| 20 | apps/web/src/ui/StatusBar.tsx:44 | `formatQuantity(units, 'length', cursor.x)` | formatação | P2 | — | — | sem locale; vírgula decimal fixa (também linha 46) |
| 21 | apps/web/src/ui/InfoCenter.tsx:49 | `pt ? 'Pesquisar comando' : 'Search commands'` (e demais) | ternário inline | P2 | — | — | padrão sistêmico (49-81); funciona |
| 22 | apps/web/src/ui/ViewTabs.tsx:128 | `Vistas abertas` | aria-label | P1 | `viewtabs_aria` | Open views | arquivo sem `useI18n` |
| 23 | apps/web/src/ui/ViewTabs.tsx:167 | `Fechar ${t.label}` | aria-label | P1 | `viewtabs_close` | Close {name} | `title` igual na linha 168 |
| 24 | apps/web/src/ui/ViewTabs.tsx:181 | `Mais vistas` | title | P1 | `viewtabs_more` | More views | botão de overflow |
| 25 | apps/web/src/ui/ViewTabs.tsx:208 | `Fechar ${t.label}` | aria-label | P1 | `viewtabs_close` | Close {name} | duplicado no menu de overflow (209) |
| 26 | apps/web/src/ui/ViewTabs.tsx:224 | `Mostrar/ocultar propriedades` | title | P1 | `viewtabs_toggle_props` | Show/hide Properties | sem aria-label |
| 27 | apps/web/src/ui/ViewTabs.tsx:227 | `Mostrar/ocultar navegador` | title | P1 | `viewtabs_toggle_browser` | Show/hide Project Browser | sem aria-label |
| 28 | apps/web/src/ui/ViewControlBar.tsx:76 | `DETAIL_LABEL` = `Por escala/Grosso/Médio/Fino` | mapa PT-only | P0 | `detail_by_scale` + `detail_coarse/medium/fine` (já existem) | By scale / Coarse / Medium / Fine | EN mantém PT na lista |
| 29 | apps/web/src/ui/ViewControlBar.tsx:86 | `VISUAL_STYLE_LABEL` = `Aramado/Linhas ocultas/Sombreado/Cores consistentes/Realista` | mapa PT-only | P0 | `style_wireframe` (novo), `style_hidden`, `style_shaded`, `style_consistent`, `style_realistic` | Wireframe / Hidden Line / Shaded / Consistent Colors / Realistic | EN mantém PT na lista |
| 30 | apps/web/src/ui/ViewControlBar.tsx:36 | `Não foi possível alterar a vista.` | status | P1 | `status_view_error` | Could not change the view. | fallback fixo |
| 31 | apps/web/src/ui/ViewControlBar.tsx:65 | `pt ? 'Escala' : 'Scale'` (e demais) | ternário inline | P2 | — | — | padrão sistêmico (65-153); funciona |
| 32 | apps/web/src/ui/FileMenu.tsx:80 | `IFC importado em ${segundos} s: ${name} · ${r.texto}` | status | P1 | `status_ifc_imported` | IFC imported in {s} s: {name} · {summary} | PT mesmo no menu EN |
| 33 | apps/web/src/ui/FileMenu.tsx:138 | `Renomear projeto` | undo label | P1 | `undo_rename_project` | Rename project | tooltip de Desfazer |
| 34 | apps/web/src/ui/FileMenu.tsx:95 | `pt ? 'Novo' : 'New'` (e demais) | ternário inline | P2 | — | — | padrão sistêmico (95-165); funciona |
| 35 | apps/web/src/ui/NavBar.tsx:28 | `pt ? 'Barra de navegação' : 'Navigation bar'` (e demais) | ternário inline | P2 | — | — | padrão sistêmico (28-32); funciona |
| 36 | apps/web/src/ui/Dock.tsx:58 | `Altura dos painéis` | aria-label | P1 | `dock_resize_height` | Panel height | separador horizontal |
| 37 | apps/web/src/ui/Dock.tsx:66 | `Largura do painel` | aria-label | P1 | `dock_resize_width` | Panel width | separador vertical |
| 38 | apps/web/src/ui/PanelHead.tsx:73 | `Arraste para mover o painel` | title | P1 | `panel_drag_hint` | Drag to move the panel | cabeçalho de painel |
| 39 | apps/web/src/ui/PanelHead.tsx:80 | `Fechar (reabra em Vista ▸ Interface do usuário)` | title | P1 | `panel_close_hint` | Close (reopen in View ▸ User Interface) | — |
| 40 | apps/web/src/ui/LabelScroll.tsx:58 | `Largura da coluna de rótulos` / `Arraste para ajustar` | aria-label + title | P1 | `props_label_width` / `props_label_drag` | Label column width / Drag to adjust | divisor da paleta |
| 41 | apps/web/src/ui/Tutorial.tsx:44 | `Desenhe um circuito de paredes{w} — clique nos pontos e feche no primeiro` | JSX texto | P0 | `tut_step_walls` | Draw a loop of walls{w} — click the points and close on the first | onboarding de primeiro uso |
| 42 | apps/web/src/ui/Tutorial.tsx:45 | `Insira uma porta{d} e uma janela{n} sobre as paredes` | JSX texto | P0 | `tut_step_openings` | Insert a door{d} and a window{n} on the walls | — |
| 43 | apps/web/src/ui/Tutorial.tsx:46 | `Selecione uma parede e troque o tipo nas Propriedades` | JSX texto | P0 | `tut_step_type` | Select a wall and change its type in Properties | — |
| 44 | apps/web/src/ui/Tutorial.tsx:47 | `Abra o Modelo 3D no navegador de projeto` | JSX texto | P0 | `tut_step_3d` | Open the 3D Model in the Project Browser | — |
| 45 | apps/web/src/ui/Tutorial.tsx:48 | `Salve o projeto (Ctrl+S)` | JSX texto | P0 | `tut_step_save` | Save the project (Ctrl+S) | — |
| 46 | apps/web/src/ui/Tutorial.tsx:65 | `Passo ${now + 1} de ${steps.length}` | JSX texto | P0 | `tut_progress` | Step {n} of {total} | — |
| 47 | apps/web/src/ui/Tutorial.tsx:72 | `Dispensar` | JSX texto | P0 | `tut_dismiss` | Dismiss | — |
| 48 | apps/web/src/ui/Tutorial.tsx:64 | `Primeiros passos` | aria-label | P1 | `tut_title` | Getting started | — |
| 49 | apps/web/src/ui/IssuesButton.tsx:49 | `✓ Modelo sem avisos` | JSX texto | P0 | `issues_none` | ✓ Model has no warnings | status bar |
| 50 | apps/web/src/ui/IssuesButton.tsx:68 | `Ver avisos de validação do modelo` | title | P1 | `issues_tip` | View model validation warnings | — |
| 51 | apps/web/src/ui/IssuesButton.tsx:77 | `Avisos de validação` | aria-label | P1 | `issues_title` | Validation warnings | — |
| 52 | apps/web/src/ui/IssuesButton.tsx:86 | `Ir para o elemento: ${issue.message}` | aria-label | P1 | `issues_goto_aria` | Go to element: {msg} | — |
| 53 | apps/web/src/ui/IssuesButton.tsx:87 | `Ir para` | JSX texto | P1 | `issues_goto` | Go to | — |
| 54 | apps/web/src/ui/DisjoinCheck.tsx:5 | `A parede se solta das paredes ligadas às suas pontas em vez de esticá-las` | title/hint | P1 | `opt_disjoin_hint` | The wall detaches from walls at its ends instead of stretching them | — |
| 55 | apps/web/src/ui/DisjoinCheck.tsx:11 | `Desconectar` | JSX texto | P0 | `opt_disjoin` | Disjoin | barra de opções de Mover/Rotacionar/Espelhar |
| 56 | apps/web/src/ui/SnapButton.tsx:16 | `Extremidade` (+ `Pontas de paredes e vértices`) | mapa PT-only | P1 | `snap_endpoint` / `snap_endpoint_hint` | Endpoint / Wall ends and vertices | `ITEMS` inteiro (15-26) |
| 57 | apps/web/src/ui/SnapButton.tsx:17 | `Ponto Médio` (+ `Centro das paredes e arestas`) | mapa PT-only | P1 | `snap_midpoint` / `snap_midpoint_hint` | Midpoint / Center of walls and edges | — |
| 58 | apps/web/src/ui/SnapButton.tsx:18 | `Eixos de Parede` (+ `Pé sobre o eixo da parede…`) | mapa PT-only | P1 | `snap_axis` / `snap_axis_hint` | Wall Axes / Foot on the wall axis (hosts doors and windows) | — |
| 59 | apps/web/src/ui/SnapButton.tsx:19 | `Interseção` (+ `Cruzamento de eixos e quinas`) | mapa PT-only | P1 | `snap_intersection` / `snap_intersection_hint` | Intersection / Crossing of axes and corners | — |
| 60 | apps/web/src/ui/SnapButton.tsx:20 | `Perpendicular` (+ `Ângulo reto a partir do ponto anterior`) | mapa PT-only | P1 | `snap_perpendicular` / `snap_perpendicular_hint` | Perpendicular / Right angle from the previous point | — |
| 61 | apps/web/src/ui/SnapButton.tsx:21 | `Rastreamento Dinâmico` (+ `Linhas-guia pontilhadas…`) | mapa PT-only | P1 | `snap_alignment` / `snap_alignment_hint` | Dynamic Tracking / Dotted alignment guides with other points | — |
| 62 | apps/web/src/ui/SnapButton.tsx:22 | `Faces de Parede` (+ `Cantos e arestas…`) | mapa PT-only | P1 | `snap_faces` / `snap_faces_hint` | Wall Faces / Corners and edges of finish faces | — |
| 63 | apps/web/src/ui/SnapButton.tsx:23 | `Faces do Núcleo` (+ `Cantos e arestas da alvenaria estrutural`) | mapa PT-only | P1 | `snap_core` / `snap_core_hint` | Core Faces / Corners and edges of the structural core | — |
| 64 | apps/web/src/ui/SnapButton.tsx:24 | `CAD importado (DXF)` (+ `Vértices, meios, pontos…`) | mapa PT-only | P1 | `snap_cad` / `snap_cad_hint` | Imported CAD (DXF) / Vertices, midpoints, points and crossings | — |
| 65 | apps/web/src/ui/SnapButton.tsx:25 | `Pela grade` (+ `Captura nos pontos da grade visível…`) | mapa PT-only | P1 | `snap_grid` / `snap_grid_hint` | Snap to Grid / Snaps to visible grid points | — |
| 66 | apps/web/src/ui/SnapButton.tsx:103 | `Capturas de desenho (F3): extremidades, meios, interseções, alinhamento e CAD importado` | title | P1 | `snap_btn_tip` | Drafting snaps (F3): endpoints, midpoints, intersections, alignment and imported CAD | — |
| 67 | apps/web/src/ui/SnapButton.tsx:118 | `Capturas de desenho` | aria-label | P1 | `snap_pop_title` | Drafting snaps | — |
| 68 | apps/web/src/ui/SnapButton.tsx:121 | `Capturas de Objeto (Snaps)` | JSX texto | P0 | `snap_master_title` | Object Snaps | popover da barra de status |
| 69 | apps/web/src/ui/SnapButton.tsx:122 | `Atalho mestre:` | JSX texto | P1 | `snap_master_hint` | Master shortcut: | — |
| 70 | apps/web/src/ui/SnapButton.tsx:129 | `LIGADO` / `DESLIGADO` | JSX texto | P0 | `snap_on` / `snap_off` | ON / OFF | — |
| 71 | apps/web/src/ui/SnapButton.tsx:133 | `Checklist de capturas` | aria-label | P1 | `snap_checklist_aria` | Snap checklist | — |
| 72 | apps/web/src/ui/SnapButton.tsx:156 | `Tudo` | JSX texto | P0 | `snap_all` | All | ação em massa |
| 73 | apps/web/src/ui/SnapButton.tsx:157 | `Padrão` | JSX texto | P0 | `snap_default` | Default | — |
| 74 | apps/web/src/ui/SnapButton.tsx:158 | `Nenhum` | JSX texto | P0 | `snap_none` | None | — |
| 75 | apps/web/src/ui/OrthoButton.tsx:18 | `Orto/Polar` | aria-label | P1 | `status_ortho_polar` | Ortho/Polar | — |
| 76 | apps/web/src/ui/OrthoButton.tsx:19 | `Orto/Polar` | JSX texto | P0 | `status_ortho_polar` | Ortho/Polar | título visível do grupo |
| 77 | apps/web/src/ui/OrthoButton.tsx:25 | `Orto ativo (F8): apenas 0°/90°` / `Orto desligado (F8)` | title | P0 | `status_ortho_on` / `status_ortho_off` | Ortho on (F8): 0°/90° only / Ortho off (F8) | — |
| 78 | apps/web/src/ui/OrthoButton.tsx:27 | `Orto` | JSX texto | P0 | `status_ortho` | Ortho | — |
| 79 | apps/web/src/ui/OrthoButton.tsx:35 | `Polar ativo (F10): múltiplos de ${inc}°` / `Polar desligado (F10)` | title | P1 | `status_polar_on` / `status_polar_off` | Polar on (F10): multiples of {inc}° / Polar off (F10) | — |
| 80 | apps/web/src/ui/OrthoButton.tsx:37 | `Polar` | JSX texto | P0 | `status_polar` | Polar | — |
| 81 | apps/web/src/ui/OrthoButton.tsx:43 | `Incremento polar` | title | P1 | `status_polar_inc` | Polar increment | — |
| 82 | apps/web/src/ui/OrthoButton.tsx:52 | `Personalizado` | JSX texto | P1 | `opt_custom` | Custom | opção do select |
| 83 | apps/web/src/ui/OrthoButton.tsx:61 | `Incremento polar personalizado em graus` | aria-label | P1 | `status_polar_custom_aria` | Custom polar increment in degrees | — |
| 84 | apps/web/src/ui/EmptyViews.tsx:9 | `Nenhuma vista aberta` | JSX texto | P0 | `empty_views_title` | No views open | estado vazio da área de desenho |
| 85 | apps/web/src/ui/EmptyViews.tsx:10 | `Abra um nível ou o Modelo 3D pelo navegador de projeto.` | JSX texto | P0 | `empty_views_body` | Open a level or the 3D Model from the Project Browser. | — |
| 86 | apps/web/src/ui/EmptyViews.tsx:13 | `Mostrar navegador de projeto` | JSX texto | P0 | `empty_views_show_browser` | Show Project Browser | — |
| 87 | apps/web/src/ui/Browser.tsx:17 | `Navegador de projeto` | aria-label | P0 | `project_browser_title` (já existe) | Project Browser | reaproveitar chave |
| 88 | apps/web/src/ui/Browser.tsx:18 | `Navegador de projeto - ${p.name}` / `Fechar o navegador de projeto` | title + closeLabel | P0 | `project_browser_head` / `browser_close` | Project Browser - {name} / Close the Project Browser | nome do projeto é dado |
| 89 | apps/web/src/ui/Browser.tsx:19 | `Navegador de projeto - {p.name}` | JSX texto | P0 | `project_browser_head` | Project Browser - {name} | título do painel |
| 90 | apps/web/src/ui/Browser.tsx:22 | `Navegador de projeto` | aria-label (Tree) | P1 | `project_browser_title` (já existe) | Project Browser | — |
| 91 | apps/web/src/ui/Browser.tsx:28 | `Grupos` / `Ainda não disponível.` | JSX texto | P1 | `browser_groups` / `common_soon` | Groups / Not available yet. | nó desabilitado |
| 92 | apps/web/src/ui/Browser.tsx:29 | `Links do Revit` / `Ainda não disponível.` | JSX texto | P1 | `browser_links` / `common_soon` | Revit Links / Not available yet. | — |
| 93 | apps/web/index.html:2 | `<html lang="pt-BR">` | atributo | P1 | `html_lang` (runtime) | en / pt-BR | nunca sincroniza com `useI18n` |

## Mistura PT/EN no mesmo arquivo

- `FileMenu.tsx`: o menu inteiro alterna PT/EN por ternário (95-165), mas a mensagem de importação em `80` e o rótulo de undo em `138` ficam PT em EN.
- `ViewControlBar.tsx`: tooltips e rótulos de botão alternam (99-153), mas as opções de detalhe/estilo (`76`, `86`) vêm de mapas PT-only — a barra fica meio EN, meio PT.
- `Ribbon.tsx`: abas e painéis trocam via `txt()`, mas `OpeningActions` (25-48) permanece PT.
- `StatusBar.tsx`: nome do snap em PT (`47` via mapa `13-25`), motor gráfico em EN (`39`, `55`), aria de atalho em PT (`43`).
- `SnapButton.tsx`: marca "Snap"/"OFF [F3]"/"F11" (neutros) com rótulos e dicas PT.
- `IssuesButton.tsx`: "Modelo sem avisos" em PT convive com o badge de motor `CPU/WebGPU` em EN.
- `Tutorial.tsx`, `EmptyViews.tsx`, `ViewTabs.tsx`, `OrthoButton.tsx`, `Browser.tsx`: 100% PT (sem mistura, mas sem i18n).

## Riscos / testes que quebram

- `apps/web/src/ui/ribbon/ribbon.test.ts:20` — lista de rótulos PT das abas.
- `ribbon.test.ts:72` e `:78` — `'Unidades do projeto'` na busca.
- `ribbon.test.ts:87`, `:99`, `:126`, `:132`, `:207`, `:218-219` — rótulos PT exatos de aba contextual/busca.
- `apps/web/src/ui/ViewControlBar.test.ts:28`, `:34`, `:56-57`, `:67`, `:72` — `aria-label`/`title` PT exatos ("Mostrar/ocultar níveis de referência", "Revelar elementos ocultos (RH)", "Sair de Revelar…").
- `apps/web/src/ui/DisjoinCheck.test.ts:24-25` — `toContain('Desconectar')` e `toContain(DISJOIN_HINT)`.
- `apps/web/src/ui/ribbon/perimeterFace.test.ts` e `sheetTools.test.ts` dependem de ids, não de texto — não quebram.
- `tutorialCircuito.test.ts` cobre só a lógica `temCircuito` — não quebram.

## Anexo — fronteira com outras áreas (não contabilizado acima)

Estes arquivos não estão no glob atribuído, mas são renderizados dentro da faixa/chrome e explicam textos PT que aparecem nela:

- `apps/web/src/ui/perimeter/PerimeterRibbonPanels.tsx:39-72` (rótulos das formas) e `:111-179` (`Modo`, `Concluir`, `Cancelar`, `Desenhar`, `Linha de limite`, `Seta de inclinação`, `Rolar para cima/baixo`, `Recolher/Expandir a galeria`, `Formas de desenho`) — 100% PT na aba contextual do perímetro.
- `apps/web/src/ui/perimeter/PerimeterStatus.ts` — nomes/dicas do comando de perímetro exibidos na faixa e na barra de status.
- `apps/web/src/editor/perimeterComandos.ts:21-44` — `SEM_ESBOCO`, `SEM_ESBOCO_AINDA`, `DICA_COMANDO`, `COMANDO_RECUSADO` em PT, usados em `ribbon/parts.tsx:46` e na barra de status.
- `apps/web/src/ui/graphicsLabels.ts:5-37` — `CATEGORY_LABEL`, `VISUAL_STYLE_LABEL`, `PARTIAL_LABEL`, `DETAIL_LABEL` PT-only (consumidos por `ViewControlBar.tsx:76,86` e pelas propriedades).
- `apps/web/src/editor/viewTabActions.ts:18` (`Planta de cobertura: …`) e `:21` (`Modelo 3D`) — rótulos das abas em `ViewTabs.tsx`.
- `packages/model/src/*` — mensagens de validação exibidas em `IssuesButton.tsx` (PT).
- `apps/web/src/ui/TitleBar.tsx` — QAT e título (fora do escopo, mas compartilha `FileMenu`/`InfoCenter`).

## Já correto

- `apps/web/src/ui/ribbon/model.ts` — `Txt` + `t()` + `txt()`; base do padrão.
- `apps/web/src/ui/ribbon/tabsMain.ts`, `tabsSoon.ts`, `panelsShared.ts`, `context.ts` — todos os rótulos/painéis bilíngues; `contextTab` monta "Modificar | Colocar X" com `toolLabel` nos dois idiomas.
- `apps/web/src/ui/ribbon/tabs.ts` — só ordem/ids (a mensagem de erro em `14` é de dev).
- `apps/web/src/ui/ribbon/FitRow.tsx` — recebe `ariaLabel`/`moreLabel` prontos; sem texto próprio.
- `apps/web/src/ui/ribbon/ConfirmCancelPanel.tsx` — PT/EN completos por ternário (dívida P2, sem falha).
- `apps/web/src/ui/ribbon/commandSearch.ts` — rótulos via `toolLabel`/`txt` (exceto o ponto 17).
- `apps/web/src/ui/ribbon/parts.tsx` — tooltips/aria montados com `txt()` e `lang`; só os dois ternários P2.
- `apps/web/src/ui/InfoCenter.tsx`, `NavBar.tsx` — PT/EN completos por ternário (dívida P2).
- `apps/web/src/ui/Icon.tsx` — SVG com `aria-hidden`; os `<text>` internos são glifos ("Aa", "12", "30°", "TL", "1:n"), não texto de UI.
- Nenhum arquivo desta área importa `TOOL_LABEL` de `@hestia/tools` (só o teste `ribbon.test.ts:2`, para validar cobertura); os rótulos de ferramenta vêm de `toolLabel`.
- `ribbon/commandSearch.ts` não tem campo de descrição (`Command` em `8-14` é `id/label/where/run`): a busca é só por rótulo, então não há descrição PT a traduzir — o ponto a corrigir ali é o `label` (item 17).
