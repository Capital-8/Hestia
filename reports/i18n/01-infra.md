# 01 — Infraestrutura i18n + shell (store, dicionário, teste, App/TitleBar/HTML)

- Escopo: `apps/web/src/editor/{i18n.ts,i18nTabelas.ts,i18n.test.ts,appShell.ts,storage.ts}`, `apps/web/src/{App.tsx,main.tsx}`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/src/ui/TitleBar.tsx`, `apps/web/src/ui/useUnits.ts`; auditoria global de `useI18n|I18N|toolLabel|nomeComandoLang|fmtNum` em `apps/web/src/**`
- Arquivos analisados: 46 consumidores diretos de i18n (154 referências) + 9 arquivos de infraestrutura/shell + 13 arquivos de formatação numérica/data
- Ocorrências: 57 (P0: 1, P1: 19, P2: 37)

## Resumo executivo
O mecanismo funciona no caminho feliz: o store `useI18n` é zustand, quase todo componente assina `lang` e re-renderiza ao trocar o idioma, e o dicionário PT/EN tem 313 chaves com paridade exata (nenhuma chave só de um lado, nenhuma duplicada). O que quebra não é o "motor": é a **cobertura** e a **arquitetura de onde o texto mora**.

1. Existem **quatro vocabulários paralelos** para a mesma UI: `I18N.pt/en` (313 chaves), `Txt {pt,en}` inline na faixa (245 literais `t('…','…')`), tuplas `TEXTOS` no menu de contexto (43) e dados PT-only de `packages/tools` (`TOOL_LABEL`, `TOOL_GROUPS`, `PERFIL_NOMES`, `nomeComando`). Nada garante que os quatro cubram o mesmo texto.
2. O dicionário é **monolítico** (739 linhas em `i18n.ts` + 281 em `i18nTabelas.ts`; ~200 chaves `stt_*` de um único diálogo) e tem **51 chaves sem nenhum consumidor** (`ribbon_*`, `grp_*`, `btn_*`, `detail_*`, `style_*`, `tip_*`, `views_all`…), enquanto a UI grava à mão exatamente esses textos — sinal de que o dicionário nasceu "oficial" e a UI seguiu por fora.
3. O que "congela" no idioma antigo não são `useMemo`s: são **strings renderizadas guardadas em store**. `useUi.status` (`App.tsx:245`, `state.ts:337`, `controller.ts:517`) e `store.undoLabel` (`App.tsx:147` → `TitleBar.tsx:64`) guardam texto PT, não chave+parâmetros. O `useEffect` do status tem `deps: []`, então trocar para EN não reescreve a barra de status.
4. **`<html lang>` e `document.title` nunca são atualizados**: `index.html:2` é `pt-BR` fixo, `index.html:9` é `<title>Hestia</title>` e não há uma única atribuição a `document.documentElement.lang`/`document.title` no código.
5. Não há um `t()` com fallback: quem usa `t[key]` direto renderiza `undefined` (célula vazia) se a chave faltar; `toolLabel` cai no **id cru** (`wall`), não em PT. Como a paridade é garantida só por teste de chave, uma chave nova usada por template (`roof_shape_${shape}`, `tool_${id}`) pode passar do teste.
6. Números têm **três regras concorrentes**: `fmtNum` (idioma, `i18n.ts:710`), `formatQuantity` (símbolo do projeto, default vírgula em `packages/model/src/units.ts:92`) e `.toFixed().replace('.',',')` espalhado (`fields.tsx:8`, `GenericProps.tsx:7`, `RampProperties.tsx:17`, `NivelCotaEditor.tsx:109`). Resultado: em EN, campos comuns continuam "1,50" enquanto o cartão de Blondel mostra "1.50".
7. Datas de prancha/revisão são sempre `toLocaleDateString('pt-BR')` (`sheetActions.ts:34`, `SheetDialog.tsx:40`, `RevisionDialog.tsx:16`), inclusive no que é impresso.

## Causas-raiz

- **Sem contrato de tipo único**: `I18N` é `{ pt: {...}, en: {...} } as const` (`i18n.ts:31`, `:369`); a paridade é verificada em runtime por `expect(en).toEqual(pt)` (`i18n.test.ts:33`). O alias `Dict = Record<keyof typeof I18N.pt, string>` existe só local, em `StairTypeSections.tsx:9`. Nada impede uma chave nova ser usada na UI e não entrar no dicionário (o TS só acusa quando o acesso é literal por `I18N[lang][key]`).
- **Dicionário virou depósito por feature**: `i18n.ts` tem 739 linhas e ~200 chaves `stt_*`; a única divisão foi por tamanho (`i18nTabelas.ts:1`, 281 linhas). 51 chaves não têm consumidor (`ribbon_arch`, `grp_build`, `properties_title`, `project_browser_title`, `type_selector_label`, `edit_type_btn`, `search_project`, `views_all`, `floor_plans`, `views_3d`, `btn_open`, `btn_save`, `btn_undo`, `btn_redo`, `detail_*`, `style_*`, `thin_lines`, `hide_isolate`, `reset_hide`, `tip_*`), enquanto `ui/browser/Views.tsx:158-159` grava `"Vistas (todas)"`/`"Plantas de piso"` à mão e `TitleBar.tsx:55-58` repete `Abrir/Salvar/Desfazer/Refazer` que já têm chave.
- **Texto renderizado em store**: `App.tsx:245` grava a dica inicial PT com `useEffect(..., [])`; `editor/state.ts:337` inicializa `status: 'Pronto.'`; `controller.ts:517/524/558/574` e `state.ts:193/205/213/218` gravam mensagens PT. Trocar o idioma re-renderiza o `StatusBar`, mas o valor de `status` continua o mesmo texto. `undoLabel` segue o mesmo caminho (`App.tsx:147` → `TitleBar.tsx:64`).
- **Sem sincronização de documento**: `index.html:2` (`lang="pt-BR"`) e `index.html:9` (`<title>Hestia</title>`) são estáticos; `main.tsx:16` só monta o React. Grep por `documentElement.lang`/`document.title` em `apps/web/src` = 0 ocorrências. Leitor de tela e hifenização continuam em PT; a aba nunca reflete projeto/vista.
- **Fallback inexistente/silencioso**: `I18N[lang][key]` devolve `undefined` em chave ausente; `toolLabel` faz `|| toolId` (`i18n.ts:717`), então a UI mostra `roofextrusion` em vez de "Telhado por extrusão"; `fill()` apaga o placeholder (`StairBlondelCard.tsx:6`), exibindo frase sem o número.
- **Hidratação sem validação**: `i18n.ts:18` faz `safeGet(LANG_KEY) as Lang`; qualquer valor diferente de `pt`/`en` (versão antiga, edição manual, `en-US`) faz `I18N[lang]` ser `undefined` e `t.xxx` estourar `TypeError` no primeiro componente que renderiza.
- **Três formatadores de número**: `fmtNum` (idioma, `i18n.ts:710`), `formatQuantity` (`packages/model/src/unitsFormat.ts:44`, usa `u.decimalSymbol`, default `,` em `units.ts:92`) e o padrão `.toFixed().replace('.', ',')` (`fields.tsx:8`, `GenericProps.tsx:7`, `RampProperties.tsx:17`, `NivelCotaEditor.tsx:109`, `RampOptionsBar.tsx:52/74` — os dois últimos já reportados em 08). `useUnits.ts:6` nem depende de `lang`.
- **Datas fixas em PT**: `sheetActions.ts:34`, `SheetDialog.tsx:40`, `RevisionDialog.tsx:16` usam `toLocaleDateString('pt-BR')` sem `lang`.
- **Collation fixa em PT**: 20 linhas `localeCompare(..., 'pt-BR')` em 13 arquivos (9 `*ScheduleDialog`, `cadActions.ts:18`, `MaterialsDialog.tsx:19`, `browser/Families.tsx:22`, `pasteLevelsModel.ts:75`); em EN a ordem alfabética continua a portuguesa.

## Auditoria dos consumidores (`useI18n` / `I18N` / `toolLabel` / `nomeComandoLang` / `fmtNum`)

Não existe **nenhum** acesso a valor por `I18N.pt[...]` fora de `i18n.ts`/testes: as 14 ocorrências de `I18N.pt` são todas `keyof typeof I18N.pt` (tipo). O problema dos consumidores é outro: PT fixo, ternário inline e dado PT de `packages/tools`.

| Arquivo | Veredito | Evidência |
|---|---|---|
| `ui/dialogs/*ScheduleDialog.tsx` (8) | OK | `t = I18N[useI18n(s=>s.lang)]` + `labelKey: keyof typeof I18N.pt`; ordenação fixa em `pt-BR` |
| `ui/dialogs/StairBlondelCard/StairCalculatorPanel/StairSectionPreview/StairTypeDialog/StairTypeSections` | OK | `I18N[lang]`, `fmtNum(..., lang)`, `Dict` local em `StairTypeSections.tsx:9` |
| `ui/RampProperties/RampLevelsFields/PlacementProperties/StairProperties/StairRunOptionsBar/ArrayOptionsBar/RampOptionsBar` | OK | `I18N[useI18n(...)]` / `fmtNum(..., lang)` |
| `ui/dialogs/openingType/OpeningTypeSections.tsx` | OK | `t[c.labelKey]`, `labelKey: keyof typeof I18N.pt` |
| `ui/ribbon/**` + `ui/Ribbon.tsx` | OK (dívida) | `txt(x, lang)`; 245 `Txt` inline e 8 ternários em `Ribbon.tsx:156-189` |
| `ui/InfoCenter.tsx` + `ui/ribbon/commandSearch.ts` | OK (dívida) | `searchCommands(q, lang, ctx)`; 7 ternários de chrome |
| `ui/FileMenu.tsx` | OK (dívida) | troca de idioma funciona (`setLang` em 20/150-151); 37 ternários |
| `ui/NavBar.tsx`, `ui/IfcImportOverlay.tsx`, `ui/ribbon/ConfirmCancelPanel.tsx` | OK (dívida) | recebem/assinam `lang`; 5/3/13 ternários |
| `ui/perimeter/perimeterEditavel.ts:17`, `ui/dialogs/rampSectionDrawing.ts:196/203`, `ui/dialogs/stairBlondel.ts:33`, `ui/dialogs/RampSectionPreview.tsx:40` | OK (dívida) | ternário ou `replace(',','.')` para separador |
| **`ui/TitleBar.tsx`** | **falha** | 13 ternários + `undoLabel` PT em 64; `document.title` nunca recebe o título de 54 |
| **`ui/StatusBar.tsx`** | **falha** | `SNAP` PT-only em 13-25 lido em 47; `aria-label` PT em 43 (já em 02) |
| **`ui/dialogs/ShortcutsConfigDialog.tsx`** | **falha** | nome do comando OK via `nomeComandoLang`, mas chrome/dados PT (16, 93, 98, 112, 127-131) |
| **`ui/dialogs/OtherDialogs.tsx` (ShortcutsDialog)** | **falha** | idem (130-178) |
| **`ui/dialogs/RampScheduleDialog.tsx`** | quase | `t[...]` OK; `fmt` com `getState()` em 40 e collation em 45/69 |
| **`ui/useCanvasContextMenu.ts`** + `editor/contextMenu.ts` | quase | `getState().lang` no clique (35); menu aberto não se traduz |
| `editor/controller.ts:205` | OK | `lang: () => useI18n.getState().lang` para gerar mensagem no idioma corrente |

## Inventário global dos padrões

### `lang === 'pt'` / `pt ? … : …` — 126 ocorrências em 17 arquivos

| Arquivo | Ocorrências |
|---|---:|
| apps/web/src/ui/FileMenu.tsx | 37 |
| apps/web/src/ui/ViewControlBar.tsx | 20 |
| apps/web/src/ui/ribbon/ConfirmCancelPanel.tsx | 13 |
| apps/web/src/ui/TitleBar.tsx | 13 |
| apps/web/src/ui/Ribbon.tsx | 8 |
| apps/web/src/ui/InfoCenter.tsx | 7 |
| apps/web/src/editor/i18n.ts | 6 |
| apps/web/src/ui/NavBar.tsx | 5 |
| apps/web/src/ui/ribbon/parts.tsx | 4 |
| apps/web/src/ui/IfcImportOverlay.tsx | 3 |
| apps/web/src/ui/dialogs/rampSectionDrawing.ts | 3 |
| apps/web/src/ui/StatusBar.tsx | 2 |
| apps/web/src/editor/contextMenu.ts | 1 |
| apps/web/src/ui/dialogs/RampScheduleDialog.tsx | 1 |
| apps/web/src/ui/perimeter/perimeterEditavel.ts | 1 |
| apps/web/src/ui/dialogs/stairBlondel.ts | 1 |
| apps/web/src/ui/dialogs/RampSectionPreview.tsx | 1 |

### `toLocaleString` / `toLocaleDateString` / `Intl.*` — 5 ocorrências em 5 arquivos

| Arquivo:linha | Chamada | Usa `lang`? |
|---|---|---|
| `apps/web/src/editor/i18n.ts:711` | `v.toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR', …)` | sim (correto) |
| `apps/web/src/ui/dialogs/RampScheduleDialog.tsx:40` | `v.toLocaleString(useI18n.getState().lang === 'en' ? …)` | sim, mas via `getState()` e duplicando `fmtNum` |
| `apps/web/src/editor/sheetActions.ts:34` | `today.toLocaleDateString('pt-BR')` | não |
| `apps/web/src/ui/dialogs/SheetDialog.tsx:40` | `new Date().toLocaleDateString('pt-BR')` | não |
| `apps/web/src/ui/dialogs/RevisionDialog.tsx:16` | `new Date().toLocaleDateString('pt-BR')` | não |

Não há `Intl.*` no código. `localeCompare(..., 'pt-BR')`: 20 linhas em 13 arquivos (2 por `*ScheduleDialog`, exceto `OpeningScheduleDialog`/`RoomScheduleDialog` com 1; mais `cadActions.ts:18`, `MaterialsDialog.tsx:19`, `browser/Families.tsx:22`, `pasteLevelsModel.ts:75`).

## Inventário

| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/editor/i18n.ts:18 | `lang: (safeGet(LANG_KEY) as Lang) \|\| 'pt'` | infra (validação) | P1 | — | — | cast sem validar: "pt-BR"/"en-US"/lixo no localStorage faz I18N[lang] virar undefined e derruba o app |
| 2 | apps/web/src/editor/i18n.ts:31 | `export const I18N = {` | infra (dicionário monolítico) | P2 | — | — | 739 linhas; só as tabelas foram extraídas para i18nTabelas.ts (281 linhas); ~200 chaves stt_* de um único diálogo |
| 3 | apps/web/src/editor/i18n.ts:717 | `return I18N[lang][key] \|\| toolId;` | fallback | P2 | — | — | chave ausente em EN cai no id cru da ferramenta (não em PT); é o único ponto com fallback explícito |
| 4 | apps/web/src/editor/i18n.ts:722 | `Atalhos de teclado / Keyboard shortcuts` | ternário inline | P2 | `cmd_shortcuts` | Keyboard Shortcuts | nome de comando fora do dicionário (nomeComandoLang); testado por valor, não por chave |
| 5 | apps/web/src/editor/i18n.ts:723 | `Unidades do projeto / Project Units` | ternário inline | P2 | `cmd_units` | Project Units | idem |
| 6 | apps/web/src/editor/i18n.ts:724 | `Criar semelhante / Create Similar` | ternário inline | P2 | `cmd_create_similar` | Create Similar | idem |
| 7 | apps/web/src/editor/i18n.ts:726 | `Ocultar temporariamente (elemento) / Temporary Hide (Element)` | dict paralelo | P2 | `cmd_temporary_hide` | Temporary Hide (Element) | tabela [pt,en] embutida na função (726-737): 4ª fonte de tradução, não coberta pelo teste de paridade |
| 8 | apps/web/src/editor/i18n.test.ts:33 | `expect(en).toEqual(pt)` | teste (cobertura) | P2 | — | — | só paridade de chaves + alguns valores; não varre a UI, não checa chave usada, nem <html lang>, nem fmtNum |
| 9 | apps/web/src/editor/i18nTabelas.ts:2 | `export const PT_TABELAS = {` | infra (split por tamanho) | P2 | — | — | EN em :143; separação existe só por limite de linhas, sem namespace por área (dialog/tabela/ferramenta) |
| 10 | apps/web/src/App.tsx:245 | `Pronto. Pressione ${parede} para desenhar paredes, ou selecione para editar. / Pronto. Escolha uma ferramenta, ou selecione para editar.` | status | P0 | `status_ready_wall_hint / status_ready_hint` | Ready. Press {key} to draw walls, or select to edit. / Ready. Pick a tool, or select to edit. | useEffect com deps []: grava texto PT uma vez; trocar para EN não reescreve a barra de status |
| 11 | apps/web/src/App.tsx:147 | `Estilo de cotas` | undo label | P1 | `undo_dim_style` | Dimension Style | vai para store.undoLabel e aparece em "Desfazer: ... (Ctrl+Z)" na TitleBar:64 |
| 12 | apps/web/index.html:9 | `<title>Hestia</title>` | título da aba | P2 | `app_title` | Hestia | nunca muda; document.title jamais é atribuído (grep = 0 ocorrências em apps/web/src) |
| 13 | apps/web/src/main.tsx:16 | `createRoot(...).render(<App />)` | infra (sync ausente) | P1 | — | — | nenhum updater de document.documentElement.lang/document.title; index.html:2 fica lang="pt-BR" para sempre (attr já reportado em 02-ribbon) |
| 14 | apps/web/src/ui/TitleBar.tsx:20 | `Vista 3D: Modelo 3D / 3D View: 3D Model` | ternário inline | P2 | `title_view_3d` | 3D View: 3D Model | viewTitle() monta o título da vista com ternários |
| 15 | apps/web/src/ui/TitleBar.tsx:23 | `Elevação / Corte` | ternário inline | P2 | `title_elevation / title_section` | Elevation / Section | nome da vista de corte/elevação |
| 16 | apps/web/src/ui/TitleBar.tsx:27 | `Prancha / Sheet` | ternário inline | P2 | `title_sheet` | Sheet | - |
| 17 | apps/web/src/ui/TitleBar.tsx:31 | `Planta de área / Area Plan` | ternário inline | P2 | `title_area_plan` | Area Plan | - |
| 18 | apps/web/src/ui/TitleBar.tsx:33 | `Planta de cobertura / Planta de piso` | ternário inline | P2 | `title_roof_plan / title_floor_plan` | Roof Plan / Floor Plan | - |
| 19 | apps/web/src/ui/TitleBar.tsx:55 | `Abrir / Open` | ternário inline | P2 | `btn_open` | Open | a chave btn_open já existe em i18n.ts:122 e não é usada |
| 20 | apps/web/src/ui/TitleBar.tsx:56 | `Salvar / Save` | ternário inline | P2 | `btn_save` | Save | btn_save já existe (i18n.ts:123) |
| 21 | apps/web/src/ui/TitleBar.tsx:57 | `Desfazer / Undo` | ternário inline | P2 | `btn_undo` | Undo | btn_undo já existe (i18n.ts:126) |
| 22 | apps/web/src/ui/TitleBar.tsx:58 | `Refazer / Redo` | ternário inline | P2 | `btn_redo` | Redo | btn_redo já existe (i18n.ts:127) |
| 23 | apps/web/src/ui/TitleBar.tsx:64 | `Desfazer: ${store.undoLabel} (Ctrl+Z)` | tooltip composto | P1 | `tip_undo_label` | Undo: {label} (Ctrl+Z) | undoLabel é texto PT gravado na transação (ex.: App.tsx:147, "Criar parede" em packages/model); em EN o tooltip mistura EN + PT |
| 24 | apps/web/src/ui/TitleBar.tsx:74 | `Menu Arquivo / File menu` | aria-label + title | P2 | `menu_file` | File menu | botão H |
| 25 | apps/web/src/ui/TitleBar.tsx:78 | `Barra de acesso rápido / Quick access toolbar` | aria-label | P2 | `qat_aria` | Quick access toolbar | - |
| 26 | apps/web/src/ui/TitleBar.tsx:80 | `Mais comandos de acesso rápido / More quick access commands` | aria-label | P2 | `qat_more` | More quick access commands | - |
| 27 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:16 | `titulo: 'Outros' + g.title` | dado PT de packages/tools | P1 | `kbd_group_others` | Others | TOOL_GROUPS.title é PT fixo ("Construir", "Modificar"...); cabeçalhos ficam PT em EN (render em 120) |
| 28 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:50 | `Nenhuma tecla foi digitada: atalho não alterado.` | mensagem | P2 | `kbd_msg_empty` | No key was pressed: shortcut unchanged. | setMsg PT fixo |
| 29 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:66 | `Atribuição cancelada.` | mensagem | P2 | `kbd_msg_cancelled` | Assignment cancelled. | - |
| 30 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:93 | `Atalhos de teclado / Teclas de ferramentas e comandos` | título de diálogo | P1 | `kbd_title / kbd_sub` | Keyboard Shortcuts / Tool and command keys | diálogo inteiro em PT apesar de usar nomeComandoLang para os comandos |
| 31 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:98 | `Revit (duas letras) / Simples (uma tecla)` | dado PT de packages/tools | P1 | `kbd_profile_revit / kbd_profile_simple` | Revit (two letters) / Simple (one key) | PERFIL_NOMES é Record PT-only em shortcutDefaults.ts |
| 32 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:112 | `Pressione as novas teclas para {comando}: Enter grava, Backspace apaga, Esc cancela.` | JSX texto | P2 | `kbd_press_keys` | Press the new keys for {command}: Enter saves, Backspace deletes, Esc cancels. | - |
| 33 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:127 | `sem atalho` | JSX texto | P2 | `kbd_no_shortcut` | no shortcut | também em OtherDialogs:174 |
| 34 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:129 | `Atribuir` | botão | P1 | `kbd_assign` | Assign | - |
| 35 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:130 | `Remover` | botão | P1 | `btn_remove` | Remove | mensagem composta "…: sem atalho." também PT |
| 36 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:131 | `Restaurar` | botão | P1 | `kbd_restore` | Restore | mensagem "…: atalho do perfil restaurado." também PT |
| 37 | apps/web/src/ui/dialogs/OtherDialogs.tsx:130 | `Esc / Cancela o passo; segundo Esc sai da ferramenta...` | dado PT (tabela KEYS) | P2 | `kbd_key_esc` | Esc / Cancels the step; a second Esc leaves the tool... | 14 linhas de descrição PT em 130-144, renderizadas em 178 |
| 38 | apps/web/src/ui/dialogs/OtherDialogs.tsx:147 | `Escada (croqui: limites, espelhos, caminhada, patamar)` | dado PT (tooltip) | P2 | `kbd_desc_stair` | Stair (sketch: boundaries, risers, run, landing) | DESCRICAO_COMANDO 147-155 vira title da célula em 175 |
| 39 | apps/web/src/ui/dialogs/OtherDialogs.tsx:164 | `Atalhos` | título de diálogo | P1 | `dlg_shortcuts` | Shortcuts | ShortcutsDialog: usa nomeComandoLang para o nome, mas o resto é PT |
| 40 | apps/web/src/ui/dialogs/OtherDialogs.tsx:167 | `Personalizar atalhos… / Fechar` | botões | P1 | `kbd_customize / btn_close` | Customize Shortcuts… / Close | btn_close existe no dicionário |
| 41 | apps/web/src/ui/dialogs/OtherDialogs.tsx:171 | `sem tecla / Selecionar (volta com Esc)` | JSX texto | P1 | `kbd_no_key / kbd_select_row` | no key / Select (returns with Esc) | primeira linha da tabela de atalhos |
| 42 | apps/web/src/ui/dialogs/OtherDialogs.tsx:174 | `sem atalho` | JSX texto | P2 | `kbd_no_shortcut` | no shortcut | mesma chave de ShortcutsConfigDialog:127 |
| 43 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:40 | `useI18n.getState().lang === 'en' ? 'en-US' : 'pt-BR'` | formatação numérica | P2 | — | — | duplica fmtNum (i18n.ts:710) e lê o store fora do React; hoje funciona só porque é chamado no render |
| 44 | apps/web/src/ui/fields.tsx:8 | `v.toFixed(decimals).replace('.', ',')` | formatação numérica | P1 | — | — | formatter de todo número puro (NumField): em EN continua "1,50"; deveria usar fmtNum(v, d, lang) |
| 45 | apps/web/src/ui/GenericProps.tsx:7 | `n.toFixed(d).replace('.', ',')` | formatação numérica | P1 | — | — | propriedades genéricas IFC sempre com vírgula |
| 46 | apps/web/src/ui/RampProperties.tsx:17 | `n.toFixed(d).replace('.', ',')` | formatação numérica | P2 | — | — | painel de propriedades da rampa |
| 47 | apps/web/src/ui/NivelCotaEditor.tsx:109 | `hit.value.toFixed(2).replace('.', ',')` | formatação numérica | P2 | — | — | editor de cota do nível |
| 48 | packages/model/src/units.ts:92 | `decimalSymbol: ','` | formatação numérica (raiz) | P1 | — | — | padrão do projeto é vírgula e não depende do idioma; quem não mexe em Unidades vê vírgula em EN |
| 49 | packages/model/src/unitsFormat.ts:44 | `numberText(v, decimals, decimalSymbol, trim)` | formatação numérica (raiz) | P1 | — | — | formatQuantity não recebe lang: coordenadas, propriedades e tabelas seguem o símbolo do projeto, não o idioma |
| 50 | apps/web/src/ui/useUnits.ts:6 | `unitsOf(editor.project)` | store sem lang | P2 | — | — | snapshot só muda com settings.units; trocar idioma não re-renderiza quem formata medida |
| 51 | apps/web/src/editor/sheetActions.ts:34 | `today.toLocaleDateString('pt-BR')` | data | P1 | — | — | data do carimbo da prancha criada: dd/mm/aaaa mesmo em EN |
| 52 | apps/web/src/ui/dialogs/SheetDialog.tsx:40 | `new Date().toLocaleDateString('pt-BR')` | data | P1 | — | — | data da nova revisão da prancha |
| 53 | apps/web/src/ui/dialogs/RevisionDialog.tsx:16 | `new Date().toLocaleDateString('pt-BR')` | data | P2 | — | — | valor inicial do campo de data |
| 54 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:45 | `localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })` | collation fixa | P2 | — | — | ordenação usa collation PT em EN (mesmo padrão em 13 arquivos, 20 linhas) |
| 55 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:69 | `a.name.localeCompare(b.name, 'pt-BR')` | collation fixa | P2 | — | — | ordem da lista de tipos |
| 56 | apps/web/src/ui/useCanvasContextMenu.ts:35 | `const lang = useI18n.getState().lang;` | snapshot de idioma | P2 | — | — | menu montado no clique: se o idioma mudar com o menu aberto, ele não se traduz (aceitável, mas é leitura não reativa) |
| 57 | apps/web/src/editor/contextMenu.ts:113 | `const pt = ctx.lang === 'pt' ? 0 : 1;` | dict paralelo (tuplas) | P2 | — | — | 43 pares [pt,en] em TEXTOS (59-105): 3ª fonte de tradução, fora do I18N e do teste de paridade |

## Mistura PT/EN no mesmo arquivo

- `ui/dialogs/ShortcutsConfigDialog.tsx`: nomes de comando traduzidos por `nomeComandoLang` (126) ao lado de título/botões/mensagens PT (50, 66, 93, 112, 127-131) e cabeçalhos de grupo PT vindos de `TOOL_GROUPS` (16, 120).
- `ui/dialogs/OtherDialogs.tsx` (`ShortcutsDialog`): `nomeComandoLang` (175) + tabela `KEYS`/`DESCRICAO_COMANDO` PT (130-155) + título/botões PT (164-174).
- `ui/TitleBar.tsx`: "Undo: {store.undoLabel}" mistura rótulo EN com label PT; os demais rótulos são ternários (funcionam).
- `ui/StatusBar.tsx`: `CPU/WebGPU/WebGL2` (EN universal) + `SNAP` PT + `aria-label` PT + filtro ternário.
- `ui/dialogs/RampScheduleDialog.tsx`: cabeçalhos/células localizados + número com `getState()` + collation `pt-BR`.
- `ui/dialogs/StairBlondelCard.tsx`: PT/EN corretos via `t`, mas `fmtNum` (idioma) ao lado de `formatQuantity` (unidade do projeto) em outros painéis — o mesmo valor aparece com separadores diferentes em EN.

## Riscos / testes que quebram

- `apps/web/src/editor/i18n.test.ts:18-25`, `:48-73` — asserções em valores PT/EN (`'Corte'`, `'Atalhos de teclado'`, `'Unidades do projeto'`, `'Criar semelhante'`, `'Livre'`). Quebram se o texto virar chave/namespace ou se o EN for padronizado.
- `apps/web/src/editor/i18n.test.ts:30-34` — paridade de chaves; continua passando mesmo com 100% da UI em PT (não mede cobertura de uso).
- `apps/web/src/editor/contextMenu.test.ts:39-40`, `:78`, `:115`, `:212`, `:226`, `:294` — esperam `'Repetir [Parede]'`, `'Espaço'`, `'ainda não disponível'`, `'Selecione elementos de um só tipo'`, `'Copiar só vale para…'`.
- `apps/web/src/ui/StairProperties.test.ts:29-34` e `apps/web/src/ui/dialogs/StairBlondelCard.test.ts:14-15/39-40` — valores PT/EN e troca de `lang` no store; sensíveis a qualquer mudança de chave.
- `apps/web/src/editor/areaPlanDelete.test.ts:55` (`status` contém `'paredes'`), `apps/web/src/editor/graphicsActions.test.ts:22/51/92/100/114/143` e `apps/web/src/editor/areaMerge.test.ts:30` — quebram quando `status`/`undoLabel`/erros passarem a ser chave+params.
- `apps/web/src/editor/dxfBatch.test.ts:78-83/129-130` e `apps/web/src/editor/floorActions.test.ts:63/70` — nomes padrão de vista/prancha/tipo em PT ("Planta de área", "PR-01 Planta Térreo", "(cópia)", "Cerâmica"). Se a criação passar a usar o idioma, o teste precisa fixar `lang='pt'`.
- `packages/engine/src/*Schedule.test.ts` (ex.: `rampSchedule.test.ts:51`) — CSV com cabeçalho PT e vírgula decimal; qualquer `lang` no export muda o snapshot.
- Sem teste de `<html lang>`/`document.title`: a regressão só aparece em auditoria manual ou e2e.

## Já correto

- `apps/web/src/editor/appShell.ts` e `apps/web/src/editor/storage.ts`: sem texto de usuário (só comentários).
- `apps/web/src/editor/i18nTabelas.ts`: `sched_*`, `col_*`, `roof_shape_*` com paridade PT/EN exata (313 = 313 chaves no total; 0 duplicadas; 0 assimétricas).
- `apps/web/src/ui/dialogs/*ScheduleDialog.tsx`, `Stair*` e `Ramp*`: `I18N[lang]` + `fmtNum(..., lang)` com assinatura correta e re-render ao trocar `lang`.
- `apps/web/src/ui/ribbon/{model,tabs,tabsMain,tabsSoon,panelsShared,context}.ts`: `Txt = string | {pt,en}` tipado e `txt(x, lang)` — o melhor padrão do app; serve de modelo para o dicionário central.
- `apps/web/src/ui/ribbon/commandSearch.ts`: recebe `lang` e monta rótulos/`where` localizados (o desvio de usar `toolLabel` em vez de `it.label` está em 02).
- `apps/web/src/ui/FileMenu.tsx:146-152`: seletor PT/EN persiste em `localStorage['hestia.lang']` e re-renderiza na hora; os nomes dos idiomas ficam no próprio idioma (correto).

## Arquitetura-alvo mínima (proposta, sem implementar)

1. **Um `Dict` derivado, não dois objetos soltos.** Exportar `export type Dict = typeof I18N.pt` e anotar o EN: `const EN: Dict = { … }`. Paridade passa a ser erro de compilação; o teste `expect(en).toEqual(pt)` fica como cinto de segurança. Promover o alias local de `StairTypeSections.tsx:9`.
2. **`t()` único com namespace e interpolação.** `t(lang, 'dialog.shortcuts.title')` ou, no mínimo, `t(lang, key, params?)` com `fill` embutido (hoje há `fill` copiado em `StairBlondelCard`, `StairCalculatorPanel`, `StairTypeSections`). Dividir `i18n.ts` em `editor/i18n/{common,ribbon,dialogs,schedules,stair,ramp}.ts` e reexportar `I18N` para não quebrar imports; namespace mata as 51 chaves órfãs.
3. **Fallback explícito e observável.** `t()` devolve `pt` quando faltar `en` (não `undefined`) e registra `console.warn` em dev com a chave; `toolLabel` deixa de devolver o id cru. Teste de desenvolvimento: qualquer `undefined`/id cru vira falha.
4. **Estado guarda chave, não texto.** Trocar `status: string` por `statusKey: string` + `statusArgs`, e `undoLabel` por `undoKey`; `StatusBar`/`TitleBar` traduzem no render. Isso resolve a classe inteira de "congelou no idioma antigo" (App.tsx:245, state.ts:337, controller.ts:517, App.tsx:147).
5. **Sincronização de documento num efeito único** (`App.tsx` ou `main.tsx`): assinar `useI18n` e escrever `document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'` e `document.title` com o mesmo `viewTitle` que a `TitleBar` já calcula (54). Validar a hidratação (`if (v !== 'pt' && v !== 'en') v = 'pt'`) em `i18n.ts:18`.
6. **Um único formatador numérico.** `fmtNum(v, dec, lang)` como API de UI; `formatQuantity` passa a receber `lang` (ou a derivar `decimalSymbol` do idioma quando o projeto não sobrescreveu) e os `.toFixed().replace(',','.')`/`replace('.',',')` saem. Datas: `toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR')` via helper `fmtDate`. Collation: `localeCompare(a, b, lang === 'en' ? 'en' : 'pt-BR', {numeric:true})` num helper `cmpTexto`.
7. **Teste de cobertura por varredura (não só paridade).** Um `i18n.cobertura.test.ts` varre `apps/web/src/**/*.tsx` com a regex do briefing (acentos + palavras PT) em nós de texto/`title`/`aria-label`/`placeholder` e falha listando `arquivo:linha`, com allowlist versionada para dados do usuário. Complemento: varrer `I18N.en[k] === I18N.pt[k]` só para valores legítimos (siglas) e garantir que toda chave referenciada por template (`tool_*`, `col_*`, `sched_*`, `roof_shape_*`) exista nos dois idiomas.
8. **Migração incremental sugerida (baixo risco):** (a) `Dict` + validação + `<html lang>`; (b) status/undoKey; (c) `TitleBar`/`Shortcut*` consumindo `btn_*`/novas chaves; (d) varredura de PT no CI para impedir regressão.

