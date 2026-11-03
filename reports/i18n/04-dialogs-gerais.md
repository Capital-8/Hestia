# 04 — Diálogos gerais, CAD/DXF, pranchas e configurações
- Escopo: `apps/web/src/ui/dialogs/` (26 arquivos listados na tarefa; exclui `openingType/`, `*ScheduleDialog.tsx` e `*TypeDialog.tsx`) + rótulos compartilhados que estes diálogos renderizam (`editor/dxf*.ts`, `editor/save*.ts`, `editor/shortcutConfig.ts`, `packages/model`, `packages/tools`)
- Arquivos analisados: 26 (+ 13 arquivos de apoio citados nas causas-raiz)
- Ocorrências: 488 (P0: 29, P1: 337, P2: 122)

## Resumo executivo
A área é praticamente monolíngue: **24 dos 26 arquivos não importam `useI18n`** e escrevem todo o texto em PT fixo no JSX. Só `OtherDialogs.tsx` e `ShortcutsConfigDialog.tsx` consultam `nomeComandoLang` — e mesmo neles apenas os *nomes de comando* trocam; títulos, colunas, botões e mensagens continuam em PT.
O padrão dominante é texto literal em `title`, `sub`, `label`, `placeholder`, `aria-label`, opções de `<select>` e mensagens de validação `setErro(...)`. Não há uma camada de `t()` nesses diálogos, então ativar EN não muda nada neles.
Os helpers puros (`unitsDialogModel`, `terminoForm`, `pasteLevelsModel`, `coreHint`) são os piores casos: produzem texto PT fora do React, com constantes de módulo calculadas uma única vez — precisam receber `lang` como parâmetro.
Há também dados gerados no documento em PT: nome padrão de nível novo ("Pavimento N"), nomes de camada do DXF (PAREDE_CONTORNO, ABERTURAS, FORRO…), datas criadas com `toLocaleDateString('pt-BR')` e o LEIA-ME do ZIP.
A exportação em lote (DXF), a importação CAD, as unidades e as pranchas são fluxos de primeiro uso: o impacto em EN é alto e imediatamente visível.
Parte do texto exibido nem está nesses arquivos: vem de tabelas de rótulos compartilhadas (`dxfExportDialogModel.ts`, `dimensionSettings.ts`, `TOOL_GROUPS`, `PERFIL_NOMES`) e dos módulos de status (`save*.ts`) — corrigir só o JSX deixaria esses pontos em PT.
Nenhuma chave `dlg_*` existe hoje no dicionário: todas as propostas abaixo são novas e devem ser declaradas em `apps/web/src/editor/i18n.ts` (bloco PT e bloco EN), exceto as marcadas como já existentes (`col_*`, `btn_export_dxf`, `scale`, `grp_build`, `grp_modify`, `grp_annotate`, `grp_measure`).

## Causas-raiz
- **Texto PT literal no JSX, sem `t()`**: padrão em todos os diálogos. Ex.: `apps/web/src/ui/dialogs/DxfExportDialog.tsx:103`, `SheetDialog.tsx:42`, `UnitsDialog.tsx:51`, `TextDialog.tsx:148`.
- **Helpers puros com PT embutido** (chamados fora de componente, sem `lang`): `unitsDialogModel.ts:29-55` (QUANTITY_LABELS/UNIT_LABELS), `terminoForm.ts:10-27` e `59-70`, `pasteLevelsModel.ts:50-54` e `185-199`, `coreHint.ts:11-21`.
- **Constantes de módulo calculadas uma vez**: `DxfLayerTable.tsx:6-21` (COLORS/LINETYPES), `OtherDialogs.tsx:130-155` (KEYS/DESCRICAO_COMANDO), `ExperimentosDialog.tsx:25-40` (OPERACOES/AVISOS), `dxfExportDialogModel.ts:11-37`.
- **Tabelas de rótulos fora dos diálogos**: `apps/web/src/editor/dxfExportDialogModel.ts:12-16` e `32-37`; `packages/model/src/dimensionSettings.ts:39-51`; `packages/tools/src/registry.ts:45-48`; `packages/tools/src/shortcutDefaults.ts:51`.
- **Status/erros gerados em módulos de apoio e exibidos no diálogo**: `apps/web/src/editor/saveBytes.ts:12-15`, `savePdf.ts:11-13`, `saveText.ts:11-19`, `shortcutConfig.ts:106-177`, `dxfBatch.ts:169-186`, `areaMerge.ts:75-80`, `packages/tools/src/hostedLoss.ts:104`.
- **Nomes de camada do DXF fixos em PT** (aparecem na tabela `DxfLayerTable` e dentro do arquivo): `packages/io/src/dxf.ts:144-193` (ex.: `PAREDE_CONTORNO`, `ABERTURAS`, `FORRO`, `ESCADA_POSTE`).
- **Formatação/locale fixo**: `SheetDialog.tsx:40` e `RevisionDialog.tsx:16` (`toLocaleDateString('pt-BR')`); `pasteLevelsModel.ts:75` (`localeCompare(..., 'pt-BR')`).
- **Nome padrão de documento em PT**: `OtherDialogs.tsx:55` (`Pavimento ${n}`) — o nome é editável (dado), mas o padrão nasce em PT mesmo com a UI em EN.
- **Plural escrito à mão com "(s)"**: `DxfExportDialog.tsx:115`, `ImportCadDialog.tsx:110`, `ManageCadDialog.tsx:71`, `AddViewDialog.tsx:64`, `RenumberSheetsDialog.tsx:31`, `PublishDialog.tsx:70/114`, `coreHint.ts:20` — em EN exige forma singular/plural real.

## Inventário
| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/dialogs/Dialog.tsx:93 | `Fechar` | aria-label | P1 | `btn_close` | Close | Botão ✕ de todos os diálogos; declarar em i18n.ts e usar no Dialog |
| 2 | apps/web/src/ui/dialogs/OtherDialogs.tsx:30 | `Erro` | mensagem | P2 | `dlg_error` | Error | fallback quando o erro não tem message |
| 3 | apps/web/src/ui/dialogs/OtherDialogs.tsx:34 | `Níveis` | título | P0 | `dlg_levels` | Levels | título do diálogo |
| 4 | apps/web/src/ui/dialogs/OtherDialogs.tsx:34 | `Referências verticais do projeto` | subtítulo | P1 | `dlg_levels_sub` | Vertical references of the project |  |
| 5 | apps/web/src/ui/dialogs/OtherDialogs.tsx:34 | `Fechar` | botão | P1 | `btn_close` | Close | rodapé |
| 6 | apps/web/src/ui/dialogs/OtherDialogs.tsx:36 | `Nome` | coluna | P1 | `col_name` | Name | já existe em i18nTabelas |
| 7 | apps/web/src/ui/dialogs/OtherDialogs.tsx:36 | `Elevação` | coluna | P1 | `col_elevation` | Elevation | nova chave; col_base_level é "Nível de base" |
| 8 | apps/web/src/ui/dialogs/OtherDialogs.tsx:44 | `Excluir` | botão | P1 | `btn_delete` | Delete | linha da tabela de níveis |
| 9 | apps/web/src/ui/dialogs/OtherDialogs.tsx:53 | `Novo nível` | mensagem | P2 | `undo_level_new` | New Level | rótulo do passo de desfazer |
| 10 | apps/web/src/ui/dialogs/OtherDialogs.tsx:55 | `Pavimento {n}` | dado padrão | P1 | `lvl_new_name` | Level {n} | nome padrão criado no documento; só o padrão traduz |
| 11 | apps/web/src/ui/dialogs/OtherDialogs.tsx:57 | `+ Novo nível` | botão | P1 | `dlg_levels_new` | New Level |  |
| 12 | apps/web/src/ui/dialogs/OtherDialogs.tsx:91 | `Novo projeto` | título | P0 | `dlg_new_project` | New Project | diálogo de abertura do app |
| 13 | apps/web/src/ui/dialogs/OtherDialogs.tsx:91 | `Crie um projeto em branco ou abra um projeto salvo` | subtítulo | P1 | `dlg_new_project_sub` | Create a blank project or open a saved one |  |
| 14 | apps/web/src/ui/dialogs/OtherDialogs.tsx:94 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 15 | apps/web/src/ui/dialogs/OtherDialogs.tsx:101 | `Em branco` | JSX texto | P0 | `tpl_blank` | Blank | cartão do projeto novo |
| 16 | apps/web/src/ui/dialogs/OtherDialogs.tsx:102 | `Dois níveis e os tipos de parede padrão.` | JSX texto | P1 | `tpl_blank_desc` | Two levels and the default wall types. |  |
| 17 | apps/web/src/ui/dialogs/OtherDialogs.tsx:103 | `Começa sem geometria` | JSX texto | P2 | `tpl_blank_meta` | Starts with no geometry |  |
| 18 | apps/web/src/ui/dialogs/OtherDialogs.tsx:103 | `novo` | etiqueta | P2 | `tag_new` | new |  |
| 19 | apps/web/src/ui/dialogs/OtherDialogs.tsx:109 | `Abrir projeto…` | JSX texto | P0 | `tpl_open` | Open Project… |  |
| 20 | apps/web/src/ui/dialogs/OtherDialogs.tsx:110 | `Um arquivo .hestia.json salvo no computador.` | JSX texto | P1 | `tpl_open_desc` | A .hestia.json file saved on your computer. |  |
| 21 | apps/web/src/ui/dialogs/OtherDialogs.tsx:111 | `Abrir do disco` | JSX texto | P2 | `tpl_open_meta` | Open from disk |  |
| 22 | apps/web/src/ui/dialogs/OtherDialogs.tsx:111 | `arquivo` | etiqueta | P2 | `tag_file` | file |  |
| 23 | apps/web/src/ui/dialogs/OtherDialogs.tsx:118 | `Último projeto salvo neste navegador` | JSX texto | P1 | `tpl_autosave` | Last project saved in this browser |  |
| 24 | apps/web/src/ui/dialogs/OtherDialogs.tsx:119 | `Retoma o projeto em que você estava trabalhando.` | JSX texto | P1 | `tpl_autosave_desc` | Resumes the project you were working on. |  |
| 25 | apps/web/src/ui/dialogs/OtherDialogs.tsx:120 | `Salvo automaticamente` | JSX texto | P2 | `tpl_autosave_meta` | Saved automatically |  |
| 26 | apps/web/src/ui/dialogs/OtherDialogs.tsx:120 | `retomar` | etiqueta | P2 | `tag_resume` | resume |  |
| 27 | apps/web/src/ui/dialogs/OtherDialogs.tsx:131 | `Esc` | atalho | P1 | `kb_esc` | Esc | descrição: Cancela o passo… |
| 28 | apps/web/src/ui/dialogs/OtherDialogs.tsx:132 | `Enter` | atalho | P1 | `kb_enter` | Enter | descrição PT ao lado |
| 29 | apps/web/src/ui/dialogs/OtherDialogs.tsx:133 | `0–9 , + − × ÷` | atalho | P1 | `kb_digits` | 0–9 , + − × ÷ | descrição PT ao lado |
| 30 | apps/web/src/ui/dialogs/OtherDialogs.tsx:134 | `Tab` | atalho | P1 | `kb_tab` | Tab | descrição PT ao lado |
| 31 | apps/web/src/ui/dialogs/OtherDialogs.tsx:135 | `Espaço` | atalho | P1 | `kb_space` | Space | nome da tecla + descrição PT |
| 32 | apps/web/src/ui/dialogs/OtherDialogs.tsx:136 | `Shift` | atalho | P1 | `kb_shift` | Shift | descrição PT ao lado |
| 33 | apps/web/src/ui/dialogs/OtherDialogs.tsx:137 | `Alt (ao arrastar uma ponta)` | atalho | P1 | `kb_alt` | Alt (while dragging an end) |  |
| 34 | apps/web/src/ui/dialogs/OtherDialogs.tsx:138 | `Ctrl+C / Ctrl+X / Ctrl+V` | atalho | P1 | `kb_copy` | Ctrl+C / Ctrl+X / Ctrl+V | descrição PT ao lado |
| 35 | apps/web/src/ui/dialogs/OtherDialogs.tsx:139 | `Del` | atalho | P1 | `kb_del` | Del | descrição PT ao lado |
| 36 | apps/web/src/ui/dialogs/OtherDialogs.tsx:140 | `Ctrl+Z / Ctrl+Y` | atalho | P1 | `kb_undo` | Ctrl+Z / Ctrl+Y | descrição PT ao lado |
| 37 | apps/web/src/ui/dialogs/OtherDialogs.tsx:141 | `Ctrl+S` | atalho | P1 | `kb_save` | Ctrl+S | descrição PT ao lado |
| 38 | apps/web/src/ui/dialogs/OtherDialogs.tsx:142 | `Roda / botão do meio` | atalho | P1 | `kb_wheel` | Wheel / middle button |  |
| 39 | apps/web/src/ui/dialogs/OtherDialogs.tsx:143 | `Botão direito` | atalho | P1 | `kb_right` | Right button |  |
| 40 | apps/web/src/ui/dialogs/OtherDialogs.tsx:148 | `Escada (croqui: limites, espelhos, caminhada, patamar)` | title (tooltip) | P2 | `cmd_desc_stair` | Stair (sketch: boundaries, risers, path, landing) | DESCRICAO_COMANDO |
| 41 | apps/web/src/ui/dialogs/OtherDialogs.tsx:149 | `Escada reta, em L, em U ou com leque` | title (tooltip) | P2 | `cmd_desc_stairrun` | Straight, L, U or winder stair |  |
| 42 | apps/web/src/ui/dialogs/OtherDialogs.tsx:150 | `Rampa reta, em L ou em U` | title (tooltip) | P2 | `cmd_desc_ramp` | Straight, L or U ramp |  |
| 43 | apps/web/src/ui/dialogs/OtherDialogs.tsx:151 | `Aparar/Estender` | title (tooltip) | P2 | `cmd_desc_trim` | Trim/Extend |  |
| 44 | apps/web/src/ui/dialogs/OtherDialogs.tsx:152 | `Junção de canto` | title (tooltip) | P2 | `cmd_desc_joins` | Corner join |  |
| 45 | apps/web/src/ui/dialogs/OtherDialogs.tsx:153 | `Dividir parede` | title (tooltip) | P2 | `cmd_desc_split` | Split wall |  |
| 46 | apps/web/src/ui/dialogs/OtherDialogs.tsx:154 | `Corte (duas marcas na planta)` | title (tooltip) | P2 | `cmd_desc_section` | Section (two marks on the plan) |  |
| 47 | apps/web/src/ui/dialogs/OtherDialogs.tsx:164 | `Atalhos` | título | P0 | `dlg_shortcuts` | Shortcuts | título diferente do diálogo de configuração ("Atalhos de teclado") |
| 48 | apps/web/src/ui/dialogs/OtherDialogs.tsx:167 | `Personalizar atalhos…` | botão | P1 | `dlg_shortcuts_customize` | Customize Shortcuts… |  |
| 49 | apps/web/src/ui/dialogs/OtherDialogs.tsx:167 | `Fechar` | botão | P1 | `btn_close` | Close |  |
| 50 | apps/web/src/ui/dialogs/OtherDialogs.tsx:171 | `sem tecla` | JSX texto | P1 | `kb_none` | no key |  |
| 51 | apps/web/src/ui/dialogs/OtherDialogs.tsx:171 | `Selecionar (volta com Esc)` | JSX texto | P1 | `kb_select` | Select (Esc returns) |  |
| 52 | apps/web/src/ui/dialogs/OtherDialogs.tsx:174 | `sem atalho` | JSX texto | P2 | `kb_unassigned` | no shortcut |  |
| 53 | apps/web/src/ui/dialogs/AlertaDialog.tsx:14 | `Aviso` | título | P0 | `dlg_warning` | Warning | alerta modal de recusa |
| 54 | apps/web/src/ui/dialogs/AreaMergeDialog.tsx:11 | `Fusão de áreas` | título | P1 | `dlg_area_merge` | Area Merge |  |
| 55 | apps/web/src/ui/dialogs/AreaMergeDialog.tsx:16 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 56 | apps/web/src/ui/dialogs/AreaMergeDialog.tsx:17 | `Confirmar e excluir menores` | botão | P1 | `dlg_area_merge_ok` | Confirm and delete smaller rooms |  |
| 57 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:49 | `Cotas automáticas` | título | P0 | `dlg_autocota` | Auto Dimensions |  |
| 58 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:50 | `Escolha o que cotar e por onde medir` | subtítulo | P1 | `dlg_autocota_sub` | Choose what to dimension and where to measure |  |
| 59 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:55 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 60 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:56 | `Gerar cotas` | botão | P0 | `dlg_autocota_generate` | Generate Dimensions |  |
| 61 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:60 | `O que cotar` | seção | P1 | `dlg_autocota_what` | What to dimension |  |
| 62 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:62 | `Total do lado (cotagem geral)` | checkbox | P1 | `dlg_autocota_total` | Overall side (general dimensioning) |  |
| 63 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:63 | `Contorno exterior (degraus da fachada)` | checkbox | P1 | `dlg_autocota_outline` | Exterior outline (facade jogs) |  |
| 64 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:64 | `Paredes e estruturas (espessuras e vãos)` | checkbox | P1 | `dlg_autocota_walls` | Walls and structure (thickness and openings) |  |
| 65 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:65 | `Aberturas (portas e janelas)` | checkbox | P1 | `dlg_autocota_openings` | Openings (doors and windows) |  |
| 66 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:68 | `Aberturas por` | label | P1 | `dlg_autocota_by` | Openings by |  |
| 67 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:74 | `Referência da parede` | seção | P1 | `dlg_autocota_wallref` | Wall reference |  |
| 68 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:75 | `Medir pelas` | label | P1 | `dlg_autocota_measure_by` | Measure from |  |
| 69 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:81 | `Lados e afastamento` | seção | P1 | `dlg_autocota_sides` | Sides and offset |  |
| 70 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:82 | `Cotar` | label | P1 | `dlg_autocota_dimension` | Dimension |  |
| 71 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:84 | `Os quatro lados` | opção de select | P1 | `dlg_autocota_side_all` | All four sides |  |
| 72 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:85 | `Só o lado sul` | opção de select | P1 | `dlg_autocota_side_south` | South side only |  |
| 73 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:86 | `Só o lado norte` | opção de select | P1 | `dlg_autocota_side_north` | North side only |  |
| 74 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:87 | `Só o lado oeste` | opção de select | P1 | `dlg_autocota_side_west` | West side only |  |
| 75 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:88 | `Só o lado leste` | opção de select | P1 | `dlg_autocota_side_east` | East side only |  |
| 76 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:91 | `Afastamento inicial` | label | P1 | `dlg_autocota_offset` | Initial offset |  |
| 77 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:94 | `Entre camadas` | label | P1 | `dlg_autocota_spacing` | Between layers |  |
| 78 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:98 | `Apenas o contorno externo (ignorar divisórias internas)` | checkbox | P1 | `dlg_autocota_exterior` | Exterior outline only (ignore interior partitions) |  |
| 79 | apps/web/src/ui/dialogs/AutoCotaDialog.tsx:102 | `Um lado só é cotado quando tem parede paralela a ele…` | texto de ajuda | P1 | `dlg_autocota_hint` | A side is only dimensioned when it has a parallel wall… | parágrafo de 4 linhas |
| 80 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:41 | `uma por nível, como a planta de piso` | texto de ajuda | P2 | `dxf_hint_plans` | one per level, like the floor plan | GROUP_HINT |
| 81 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:42 | `uma por planta de área` | texto de ajuda | P2 | `dxf_hint_areas` | one per area plan |  |
| 82 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:43 | `cada corte ou elevação do projeto` | texto de ajuda | P2 | `dxf_hint_sections` | each section or elevation in the project |  |
| 83 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:44 | `como plotadas: vistas na posição e escala do papel` | texto de ajuda | P2 | `dxf_hint_sheets` | as plotted: views at paper position and scale |  |
| 84 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:59 | `projeto` | dado padrão | P2 | `fallback_project_name` | project | prefixo padrão do arquivo quando o projeto não tem nome |
| 85 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:81 | `Estilo da camada do DXF` | mensagem | P2 | `undo_dxf_layer_style` | DXF layer style | rótulo do passo de desfazer |
| 86 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:95 | `falha desconhecida` | mensagem | P1 | `err_unknown` | unknown failure |  |
| 87 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:103 | `Exportar DXF` | título | P0 | `btn_export_dxf` | Export DXF | chave já existe no dicionário |
| 88 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:104 | `R2000 (AC1015) — desenhos e pranchas num ZIP` | subtítulo | P1 | `dlg_dxf_sub` | R2000 (AC1015) — drawings and sheets in a ZIP |  |
| 89 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:109 | `Restaurar as camadas do DXF` | mensagem | P2 | `undo_dxf_layers_reset` | Reset DXF layers | rótulo do passo de desfazer |
| 90 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:110 | `Restaurar camadas` | botão | P1 | `dlg_dxf_reset_layers` | Reset layers |  |
| 91 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:113 | `Fechar` | botão | P0 | `btn_close` | Close | depois de exportar |
| 92 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:113 | `Cancelar` | botão | P0 | `btn_cancel` | Cancel |  |
| 93 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:115 | `Gerando…` | botão | P0 | `dlg_dxf_generating` | Generating… | estado ocupado |
| 94 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:115 | `Exportar {n} arquivo(s)` | botão | P0 | `dlg_dxf_export_n` | Export {n} file(s) | plural por contagem |
| 95 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:122 | `Documentos ({n})` | aba | P0 | `dlg_dxf_tab_docs` | Documents ({n}) |  |
| 96 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:125 | `Camadas` | aba | P0 | `dlg_dxf_tab_layers` | Layers |  |
| 97 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:135 | `Marcar todas as vistas de {grupo}` | aria-label | P2 | `aria_dxf_check_group` | Check all views in {group} |  |
| 98 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:143 | `Exportar {alvo}` | aria-label | P2 | `aria_dxf_check_target` | Export {target} |  |
| 99 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:145 | `elevação` | JSX texto | P2 | `kind_elevation` | elevation | também "corte" na mesma linha |
| 100 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:145 | `corte` | JSX texto | P2 | `kind_section` | section |  |
| 101 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:146 | `prancha` | JSX texto | P2 | `kind_sheet` | sheet |  |
| 102 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:156 | `Opções` | seção | P1 | `dlg_options` | Options |  |
| 103 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:158 | `Unidade` | label | P1 | `dlg_unit` | Units |  |
| 104 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:159 | `Unidade do DXF` | aria-label | P2 | `aria_dxf_unit` | DXF units |  |
| 105 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:165 | `Mostrar projeção da cobertura nas plantas` | checkbox | P1 | `dlg_dxf_roof_projection` | Show roof projection on plans |  |
| 106 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:168 | `Prefixo` | label | P1 | `dlg_prefix` | Prefix |  |
| 107 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:172 | `Nome dos arquivos` | label | P1 | `dlg_dxf_file_pattern` | File names |  |
| 108 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:176 | `Tokens: {projeto} {tipo} {nome} {nivel} {prancha}. Pastas: PLANTAS, AREAS…` | texto de ajuda | P2 | `dlg_dxf_tokens_hint` | Tokens: {project} {type} {name} {level} {sheet}. Folders: … | nomes de pasta são dados de saída |
| 109 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:180 | `{n} desenho(s) em {zip}. {status}` | mensagem | P1 | `dlg_dxf_done` | {n} drawing(s) in {zip}. {status} | status vem de saveBytes (PT) |
| 110 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:195 | `A cor, o tipo de linha e a espessura valem para todos os arquivos do lote…` | texto de ajuda | P1 | `dlg_dxf_layers_hint` | Color, linetype and line weight apply to all files in the batch… |  |
| 111 | apps/web/src/ui/dialogs/DxfExportDialog.tsx:196 | `Pranchas usam as camadas próprias do desenho da folha…` | texto de ajuda | P1 | `dlg_dxf_layers_hint_sheets` | Sheets use the sheet drawing layers… |  |
| 112 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:7 | `Vermelho` | opção de select | P2 | `dxf_color_red` | Red |  |
| 113 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:8 | `Amarelo` | opção de select | P2 | `dxf_color_yellow` | Yellow |  |
| 114 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:9 | `Verde` | opção de select | P2 | `dxf_color_green` | Green |  |
| 115 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:10 | `Ciano` | opção de select | P2 | `dxf_color_cyan` | Cyan |  |
| 116 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:11 | `Azul` | opção de select | P2 | `dxf_color_blue` | Blue |  |
| 117 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:12 | `Magenta` | opção de select | P2 | `dxf_color_magenta` | Magenta |  |
| 118 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:13 | `Branco/preto` | opção de select | P2 | `dxf_color_white` | White/black |  |
| 119 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:14 | `Cinza escuro` | opção de select | P2 | `dxf_color_darkgray` | Dark gray |  |
| 120 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:15 | `Cinza claro` | opção de select | P2 | `dxf_color_lightgray` | Light gray |  |
| 121 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:19 | `Contínua` | opção de select | P2 | `dxf_linetype_continuous` | Continuous |  |
| 122 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:20 | `Tracejada` | opção de select | P2 | `dxf_linetype_dashed` | Dashed |  |
| 123 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:35 | `Camadas do DXF` | aria-label | P2 | `aria_dxf_layers_table` | DXF layers |  |
| 124 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:38 | `Camada` | coluna | P1 | `col_layer` | Layer |  |
| 125 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:39 | `Cor` | coluna | P1 | `col_color` | Color |  |
| 126 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:40 | `Tipo de linha` | coluna | P1 | `col_linetype` | Linetype |  |
| 127 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:41 | `Espessura` | coluna | P1 | `col_thickness` | Line weight | col_thickness já existe (espessura de camada) |
| 128 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:49 | `Cor da camada {nome}` | aria-label | P2 | `aria_dxf_layer_color` | Color of layer {name} |  |
| 129 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:56 | `Tipo de linha da camada {nome}` | aria-label | P2 | `aria_dxf_layer_linetype` | Linetype of layer {name} |  |
| 130 | apps/web/src/ui/dialogs/DxfLayerTable.tsx:61 | `Espessura da camada {nome}` | aria-label | P2 | `aria_dxf_layer_weight` | Line weight of layer {name} |  |
| 131 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:11 | `Milímetros (mm)` | opção de select | P1 | `unit_mm` | Millimeters (mm) | mesma lista do DXF |
| 132 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:12 | `Centímetros (cm)` | opção de select | P1 | `unit_cm` | Centimeters (cm) |  |
| 133 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:13 | `Metros (m)` | opção de select | P1 | `unit_m` | Meters (m) |  |
| 134 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:14 | `Pés (ft)` | opção de select | P1 | `unit_ft` | Feet (ft) |  |
| 135 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:15 | `Polegadas (in)` | opção de select | P1 | `unit_in` | Inches (in) |  |
| 136 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:55 | `Não foi possível ler o DXF.` | mensagem | P1 | `err_cad_read` | Could not read the DXF. |  |
| 137 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:73 | `CAD importado: {nome}` | mensagem | P1 | `status_cad_imported` | CAD imported: {name} | barra de status |
| 138 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:75 | `Não foi possível importar o DXF.` | mensagem | P1 | `err_cad_import` | Could not import the DXF. |  |
| 139 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:83 | `Importar CAD (DXF)` | título | P0 | `dlg_import_cad` | Import CAD (DXF) |  |
| 140 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:84 | `O desenho entra como um objeto só, com as camadas do arquivo` | subtítulo | P1 | `dlg_import_cad_sub` | The drawing enters as a single object, with the file layers |  |
| 141 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:90 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 142 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:92 | `Importando…` | botão | P0 | `dlg_importing` | Importing… |  |
| 143 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:92 | `Importar` | botão | P0 | `btn_import` | Import |  |
| 144 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:98 | `Arquivo DXF` | label | P0 | `dlg_cad_file` | DXF file |  |
| 145 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:102 | `Arquivo DXF` | aria-label | P1 | `dlg_cad_file` | DXF file |  |
| 146 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:110 | `{n} camada(s), {n} traço(s), {n} texto(s).` | mensagem | P1 | `dlg_cad_preview` | {n} layer(s), {n} path(s), {n} text(s). |  |
| 147 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:111 | `Unidade detectada:` | JSX texto | P1 | `dlg_cad_detected_unit` | Detected unit: |  |
| 148 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:115 | `Avisos:` | JSX texto | P1 | `dlg_cad_warnings` | Warnings: | avisos vêm do parser em PT |
| 149 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:123 | `Nível` | label | P1 | `col_level` | Level |  |
| 150 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:128 | `Unidade` | label | P1 | `dlg_unit` | Units |  |
| 151 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:133 | `Inserção X, Y (m)` | label | P1 | `dlg_cad_insert_xy` | Insertion X, Y (m) |  |
| 152 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:136 | `Inserção Y` | aria-label | P2 | `aria_cad_insert_y` | Insertion Y |  |
| 153 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:139 | `Rotação (°)` | label | P1 | `dlg_rotation` | Rotation (°) |  |
| 154 | apps/web/src/ui/dialogs/ImportCadDialog.tsx:142 | `Escala` | label | P1 | `scale` | Scale | chave scale já existe |
| 155 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:19 | `CAD importado` | título | P1 | `dlg_cad_manager` | Imported CAD |  |
| 156 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:20 | `Desenhos DXF do projeto: visibilidade, enquadramento e exclusão` | subtítulo | P1 | `dlg_cad_manager_sub` | Project DXF drawings: visibility, framing and deletion |  |
| 157 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:26 | `Fechar` | botão | P1 | `btn_close` | Close |  |
| 158 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:28 | `Importar DXF…` | botão | P1 | `dlg_import_dxf` | Import DXF… |  |
| 159 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:35 | `Nenhum desenho CAD importado. Use Importar DXF… para inserir a primeira planta de referência.` | JSX texto | P1 | `dlg_cad_empty` | No CAD drawing imported. Use Import DXF… to insert the first reference plan. |  |
| 160 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:42 | `Nome` | coluna | P1 | `col_name` | Name |  |
| 161 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:43 | `Nível` | coluna | P1 | `col_level` | Level |  |
| 162 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:44 | `Visível` | coluna | P1 | `col_visible` | Visible |  |
| 163 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:45 | `Conteúdo` | coluna | P1 | `col_content` | Content |  |
| 164 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:46 | `Ações` | coluna | P1 | `col_actions` | Actions |  |
| 165 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:65 | `Visível {nome}` | aria-label | P2 | `aria_cad_visible` | Visible {name} |  |
| 166 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:71 | `{n} camada(s) · {n} traço(s) · {n} texto(s)` | JSX texto | P1 | `dlg_cad_content` | {n} layer(s) · {n} path(s) · {n} text(s) |  |
| 167 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:74 | `Selecionar` | botão | P1 | `btn_select` | Select |  |
| 168 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:74 | `Seleciona o desenho (as Propriedades mostram o CAD)` | title (tooltip) | P2 | `tip_cad_select` | Selects the drawing (Properties show the CAD) |  |
| 169 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:82 | `Abre a planta do nível e enquadra o desenho` | title (tooltip) | P2 | `tip_cad_frame` | Opens the level plan and frames the drawing |  |
| 170 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:84 | `Enquadrar` | botão | P1 | `btn_zoom_fit` | Zoom to Fit | rótulo do Revit: Zoom to Fit |
| 171 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:86 | `Excluir` | botão | P1 | `btn_delete` | Delete |  |
| 172 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:86 | `Exclui o desenho (Ctrl+Z desfaz)` | title (tooltip) | P2 | `tip_cad_delete` | Deletes the drawing (Ctrl+Z undoes) |  |
| 173 | apps/web/src/ui/dialogs/ManageCadDialog.tsx:97 | `As linhas e os vértices dos desenhos visíveis entram na captura…` | texto de ajuda | P1 | `dlg_cad_snap_hint` | Lines and vertices of visible drawings are included in snapping… |  |
| 174 | apps/web/src/ui/dialogs/LayerAdvanced.tsx:5 | `Número menor = prioridade maior: a camada de menor número atravessa as de maior número…` | texto de ajuda | P1 | `layer_join_priority_help` | Lower number = higher priority: the lower-numbered layer cuts through the higher ones… |  |
| 175 | apps/web/src/ui/dialogs/LayerAdvanced.tsx:56 | `Prioridade de junção (sobrescreve a função)` | label | P1 | `layer_join_priority` | Join priority (overrides the function) |  |
| 176 | apps/web/src/ui/dialogs/LayerAdvanced.tsx:77 | `Padrão` | botão | P2 | `btn_default` | Default |  |
| 177 | apps/web/src/ui/dialogs/LayerTermino.tsx:68 | `Término nas paredes` | label | P1 | `layer_wall_termination` | Wall termination |  |
| 178 | apps/web/src/ui/dialogs/LayerTermino.tsx:92 | `Deslocamento em centímetros` | aria-label | P2 | `aria_layer_term_offset` | Offset in centimeters |  |
| 179 | apps/web/src/ui/dialogs/LayerTermino.tsx:92 | `Prioridade da parede, de 1 a 9` | aria-label | P2 | `aria_layer_term_priority` | Wall priority, from 1 to 9 |  |
| 180 | apps/web/src/ui/dialogs/LayerTermino.tsx:108 | `Limite no perímetro` | label | P1 | `layer_perimeter_limit` | Perimeter limit |  |
| 181 | apps/web/src/ui/dialogs/terminoForm.ts:11 | `Automático` | opção de select | P1 | `layer_term_auto` | Automatic |  |
| 182 | apps/web/src/ui/dialogs/terminoForm.ts:12 | `Até a face de acab.` | opção de select | P1 | `layer_term_face` | To finish face |  |
| 183 | apps/web/src/ui/dialogs/terminoForm.ts:13 | `Até o núcleo da parede` | opção de select | P1 | `layer_term_core` | To wall core |  |
| 184 | apps/web/src/ui/dialogs/terminoForm.ts:14 | `Passa por baixo` | opção de select | P1 | `layer_term_pass` | Passes underneath |  |
| 185 | apps/web/src/ui/dialogs/terminoForm.ts:15 | `Até a prioridade ≤ N` | opção de select | P1 | `layer_term_priority` | To priority ≤ N |  |
| 186 | apps/web/src/ui/dialogs/terminoForm.ts:16 | `Deslocamento (cm)` | opção de select | P1 | `layer_term_offset` | Offset (cm) |  |
| 187 | apps/web/src/ui/dialogs/terminoForm.ts:21 | `Padrão: o núcleo do piso vai até o núcleo da parede…` | texto de ajuda | P2 | `layer_term_help_auto` | Default: the floor core goes to the wall core… | TERMINO_AJUDA |
| 188 | apps/web/src/ui/dialogs/terminoForm.ts:22 | `Para na face de acabamento da parede: o piso não entra na parede.` | texto de ajuda | P2 | `layer_term_help_face` | Stops at the wall finish face: the floor does not enter the wall. |  |
| 189 | apps/web/src/ui/dialogs/terminoForm.ts:23 | `Avança sob o acabamento da parede e para no núcleo (estrutura).` | texto de ajuda | P2 | `layer_term_help_core` | Advances under the wall finish and stops at the core (structure). |  |
| 190 | apps/web/src/ui/dialogs/terminoForm.ts:24 | `Passa por baixo da parede: a parede não recorta esta camada.` | texto de ajuda | P2 | `layer_term_help_pass` | Passes under the wall: the wall does not cut this layer. |  |
| 191 | apps/web/src/ui/dialogs/terminoForm.ts:25 | `Para na primeira camada da parede com prioridade igual ou maior…` | texto de ajuda | P2 | `layer_term_help_priority` | Stops at the first wall layer with equal or higher priority… |  |
| 192 | apps/web/src/ui/dialogs/terminoForm.ts:26 | `Positivo avança sobre a parede; negativo recua, a partir da face de acabamento.` | texto de ajuda | P2 | `layer_term_help_offset` | Positive advances over the wall; negative recedes from the finish face. |  |
| 193 | apps/web/src/ui/dialogs/terminoForm.ts:43 | `Informe um número de {min} a {max}` | mensagem | P1 | `err_layer_term_priority` | Enter a number from {min} to {max} |  |
| 194 | apps/web/src/ui/dialogs/terminoForm.ts:49 | `Entre −{max} e {max} cm` | mensagem | P2 | `err_layer_term_range` | Between −{max} and {max} cm |  |
| 195 | apps/web/src/ui/dialogs/terminoForm.ts:60 | `Contorno do elemento` | opção de select | P1 | `layer_limit_element` | Element outline |  |
| 196 | apps/web/src/ui/dialogs/terminoForm.ts:61 | `Até face ext. parede` | opção de select | P1 | `layer_limit_wall_face` | To wall exterior face |  |
| 197 | apps/web/src/ui/dialogs/terminoForm.ts:62 | `Até face ext. núcleo` | opção de select | P1 | `layer_limit_core_face` | To core exterior face |  |
| 198 | apps/web/src/ui/dialogs/terminoForm.ts:67 | `A camada segue o contorno desenhado do elemento, como antes.` | texto de ajuda | P2 | `layer_limit_help_auto` | The layer follows the drawn element outline, as before. | LIMITE_EXTERNO_AJUDA |
| 199 | apps/web/src/ui/dialogs/terminoForm.ts:68 | `Vai até a face externa da parede, atravessando o acabamento externo dela.` | texto de ajuda | P2 | `layer_limit_help_wall` | Goes to the wall exterior face, through its exterior finish. |  |
| 200 | apps/web/src/ui/dialogs/terminoForm.ts:69 | `Passa sob o acabamento externo e para na face externa do núcleo…` | texto de ajuda | P2 | `layer_limit_help_core` | Passes under the exterior finish and stops at the core exterior face… |  |
| 201 | apps/web/src/ui/dialogs/AddViewDialog.tsx:22 | `Planta · {nome}` | JSX texto | P1 | `src_plan` | Plan · {name} | prefixo traduz; nome do nível é dado |
| 202 | apps/web/src/ui/dialogs/AddViewDialog.tsx:23 | `Elevação` | JSX texto | P1 | `kind_elevation` | Elevation | prefixo do item de vista |
| 203 | apps/web/src/ui/dialogs/AddViewDialog.tsx:23 | `Corte` | JSX texto | P1 | `kind_section` | Section |  |
| 204 | apps/web/src/ui/dialogs/AddViewDialog.tsx:26 | `Modelo 3D · {nome}` | JSX texto | P1 | `src_3d` | 3D Model · {name} |  |
| 205 | apps/web/src/ui/dialogs/AddViewDialog.tsx:29 | `Modelo 3D (enquadramento padrão)` | JSX texto | P1 | `src_3d_default` | 3D Model (default framing) |  |
| 206 | apps/web/src/ui/dialogs/AddViewDialog.tsx:60 | `Marque pelo menos uma vista.` | mensagem | P1 | `err_select_view` | Select at least one view. |  |
| 207 | apps/web/src/ui/dialogs/AddViewDialog.tsx:64 | `{n} vista(s) adicionada(s).` | mensagem | P1 | `status_views_added` | {n} view(s) added. | barra de status |
| 208 | apps/web/src/ui/dialogs/AddViewDialog.tsx:67 | `Não foi possível adicionar as vistas.` | mensagem | P1 | `err_add_views` | Could not add the views. |  |
| 209 | apps/web/src/ui/dialogs/AddViewDialog.tsx:72 | `Adicionar vistas` | título | P1 | `dlg_add_views` | Add Views |  |
| 210 | apps/web/src/ui/dialogs/AddViewDialog.tsx:78 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 211 | apps/web/src/ui/dialogs/AddViewDialog.tsx:79 | `Adicionar` | botão | P1 | `btn_add` | Add |  |
| 212 | apps/web/src/ui/dialogs/AddViewDialog.tsx:83 | `Vistas` | label | P1 | `dlg_views` | Views |  |
| 213 | apps/web/src/ui/dialogs/AddViewDialog.tsx:92 | `Marcar todas` | botão | P2 | `btn_check_all` | Check All |  |
| 214 | apps/web/src/ui/dialogs/AddViewDialog.tsx:93 | `Limpar` | botão | P2 | `btn_clear` | Clear |  |
| 215 | apps/web/src/ui/dialogs/AddViewDialog.tsx:96 | `Escala` | label | P1 | `scale` | Scale |  |
| 216 | apps/web/src/ui/dialogs/AddViewDialog.tsx:98 | `Automática` | opção de select | P1 | `scale_auto` | Automatic |  |
| 217 | apps/web/src/ui/dialogs/AddViewDialog.tsx:98 | `Automática · 1:{n}` | opção de select | P2 | `scale_auto_value` | Automatic · 1:{n} |  |
| 218 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:98 | `Selecionar níveis` | título | P1 | `dlg_select_levels` | Select Levels |  |
| 219 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:99 | `Colar alinhado` | subtítulo | P1 | `dlg_paste_aligned` | Paste Aligned | termo do Revit |
| 220 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:106 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 221 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:107 | `Pré-visualizar` | botão | P1 | `btn_preview` | Preview |  |
| 222 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:108 | `Colar {n}` | botão | P1 | `btn_paste_n` | Paste {n} |  |
| 223 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:118 | `Buscar nível…` | placeholder | P1 | `ph_search_level` | Search level… |  |
| 224 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:119 | `Buscar nível` | aria-label | P2 | `ph_search_level` | Search level |  |
| 225 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:123 | `Todos acima` | botão | P1 | `btn_all_above` | All Above |  |
| 226 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:124 | `Todos abaixo` | botão | P1 | `btn_all_below` | All Below |  |
| 227 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:125 | `Intervalo…` | botão | P1 | `btn_range` | Range… |  |
| 228 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:130 | `De` | label | P1 | `lbl_from` | From |  |
| 229 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:134 | `Primeiro nível do intervalo` | aria-label | P2 | `aria_range_from` | First level in range |  |
| 230 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:146 | `Até` | label | P1 | `lbl_to` | To |  |
| 231 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:150 | `Último nível do intervalo` | aria-label | P2 | `aria_range_to` | Last level in range |  |
| 232 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:166 | `Nenhum nível encontrado.` | JSX texto | P1 | `dlg_no_levels_found` | No level found. |  |
| 233 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:168 | `Níveis de destino` | aria-label | P2 | `aria_target_levels` | Target levels |  |
| 234 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:171 | `Nome` | coluna | P1 | `col_name` | Name |  |
| 235 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:172 | `Elevação` | coluna | P1 | `col_elevation` | Elevation |  |
| 236 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:199 | `Origem` | etiqueta | P1 | `tag_origin` | Origin |  |
| 237 | apps/web/src/ui/dialogs/SelectLevelsDialog.tsx:212 | `Manter cópias vinculadas` | checkbox | P1 | `dlg_keep_linked` | Keep copies linked |  |
| 238 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:51 | `Acima` | const módulo | P1 | `grp_above` | Above | GROUP_TITLES |
| 239 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:52 | `Atual` | const módulo | P1 | `grp_current` | Current |  |
| 240 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:53 | `Abaixo` | const módulo | P1 | `grp_below` | Below |  |
| 241 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:75 | `localeCompare(b.name, 'pt-BR')` | formatação | P2 | `n/a` | localeCompare(..., active lang) | ordenação fixa em pt-BR |
| 242 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:188 | `{n} nível(is) • {n} cópia(s)` | mensagem | P1 | `dlg_paste_summary` | {n} level(s) • {n} cop(y/ies) | resumo do rodapé por aria-live |
| 243 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:193 | `O projeto não tem níveis.` | mensagem | P1 | `err_no_levels` | The project has no levels. | validação |
| 244 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:194 | `Selecione ao menos um nível.` | mensagem | P1 | `err_select_one_level` | Select at least one level. |  |
| 245 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:197 | `Nível inexistente: {id}.` | mensagem | P1 | `err_level_missing` | Level does not exist: {id}. |  |
| 246 | apps/web/src/ui/dialogs/pasteLevelsModel.ts:198 | `O nível de origem não pode receber a cópia.` | mensagem | P1 | `err_origin_level` | The origin level cannot receive the copy. |  |
| 247 | apps/web/src/ui/dialogs/SheetDialog.tsx:10 | `Paisagem` | opção de select | P1 | `orient_landscape` | Landscape |  |
| 248 | apps/web/src/ui/dialogs/SheetDialog.tsx:10 | `Retrato` | opção de select | P1 | `orient_portrait` | Portrait |  |
| 249 | apps/web/src/ui/dialogs/SheetDialog.tsx:32 | `Alteração recusada.` | mensagem | P1 | `err_change_refused` | Change refused. |  |
| 250 | apps/web/src/ui/dialogs/SheetDialog.tsx:40 | `toLocaleDateString('pt-BR')` | formatação | P1 | `n/a` | toLocaleDateString(active lang) | data da revisão criada em pt-BR fixo |
| 251 | apps/web/src/ui/dialogs/SheetDialog.tsx:42 | `Propriedades da prancha` | título | P0 | `dlg_sheet_props` | Sheet Properties |  |
| 252 | apps/web/src/ui/dialogs/SheetDialog.tsx:42 | `Fechar` | botão | P1 | `btn_close` | Close |  |
| 253 | apps/web/src/ui/dialogs/SheetDialog.tsx:43 | `Folha` | seção | P1 | `dlg_sheet_group` | Sheet |  |
| 254 | apps/web/src/ui/dialogs/SheetDialog.tsx:44 | `Número` | label | P1 | `col_number` | Number |  |
| 255 | apps/web/src/ui/dialogs/SheetDialog.tsx:47 | `Nome` | label | P1 | `col_name` | Name |  |
| 256 | apps/web/src/ui/dialogs/SheetDialog.tsx:50 | `Disciplina` | label | P1 | `dlg_discipline` | Discipline |  |
| 257 | apps/web/src/ui/dialogs/SheetDialog.tsx:51 | `Arquitetura, Estrutura…` | placeholder | P2 | `ph_discipline` | Architecture, Structure… |  |
| 258 | apps/web/src/ui/dialogs/SheetDialog.tsx:53 | `Tamanho` | label | P1 | `dlg_sheet_size` | Size |  |
| 259 | apps/web/src/ui/dialogs/SheetDialog.tsx:60 | `Orientação` | label | P1 | `dlg_orientation` | Orientation |  |
| 260 | apps/web/src/ui/dialogs/SheetDialog.tsx:67 | `Margem` | label | P1 | `dlg_margin` | Margin |  |
| 261 | apps/web/src/ui/dialogs/SheetDialog.tsx:71 | `Carimbo` | seção | P1 | `dlg_title_block` | Title Block | termo do Revit |
| 262 | apps/web/src/ui/dialogs/SheetDialog.tsx:72 | `Projeto` | label | P1 | `dlg_project` | Project |  |
| 263 | apps/web/src/ui/dialogs/SheetDialog.tsx:75 | `Cliente` | label | P1 | `dlg_client` | Client |  |
| 264 | apps/web/src/ui/dialogs/SheetDialog.tsx:78 | `Autor` | label | P1 | `dlg_author` | Author |  |
| 265 | apps/web/src/ui/dialogs/SheetDialog.tsx:81 | `Data` | label | P1 | `dlg_date` | Date |  |
| 266 | apps/web/src/ui/dialogs/SheetDialog.tsx:84 | `Revisão` | label | P1 | `dlg_revision` | Revision |  |
| 267 | apps/web/src/ui/dialogs/SheetDialog.tsx:87 | `Escala (texto)` | label | P1 | `dlg_scale_text` | Scale (text) |  |
| 268 | apps/web/src/ui/dialogs/SheetDialog.tsx:88 | `Em branco: escalas das vistas` | placeholder | P2 | `ph_scale_note` | Blank: view scales |  |
| 269 | apps/web/src/ui/dialogs/SheetDialog.tsx:91 | `Revisões` | seção | P1 | `dlg_revisions` | Revisions |  |
| 270 | apps/web/src/ui/dialogs/SheetDialog.tsx:96 | `Tag` | coluna | P2 | `col_tag` | Tag |  |
| 271 | apps/web/src/ui/dialogs/SheetDialog.tsx:97 | `Data` | coluna | P1 | `dlg_date` | Date |  |
| 272 | apps/web/src/ui/dialogs/SheetDialog.tsx:98 | `Descrição` | coluna | P1 | `col_description` | Description |  |
| 273 | apps/web/src/ui/dialogs/SheetDialog.tsx:108 | `Remover a revisão {tag}` | title (tooltip) | P2 | `tip_revision_remove` | Remove revision {tag} |  |
| 274 | apps/web/src/ui/dialogs/SheetDialog.tsx:108 | `Remover` | botão | P1 | `btn_remove` | Remove |  |
| 275 | apps/web/src/ui/dialogs/SheetDialog.tsx:114 | `Nenhuma revisão nesta prancha.` | JSX texto | P1 | `dlg_no_revisions` | No revision on this sheet. |  |
| 276 | apps/web/src/ui/dialogs/SheetDialog.tsx:117 | `Adicionar revisão` | botão | P1 | `dlg_add_revision` | Add Revision |  |
| 277 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:28 | `Nenhuma prancha para renumerar.` | mensagem | P1 | `err_no_sheets` | No sheet to renumber. |  |
| 278 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:31 | `{n} prancha(s) renumerada(s): {a} a {b}.` | mensagem | P1 | `status_sheets_renumbered` | {n} sheet(s) renumbered: {a} to {b}. | barra de status |
| 279 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:34 | `Numeração recusada.` | mensagem | P1 | `err_numbering_refused` | Numbering refused. |  |
| 280 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:39 | `Renumerar pranchas` | título | P1 | `dlg_renumber_sheets` | Renumber Sheets |  |
| 281 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:40 | `Numeração em lote, na ordem do navegador` | subtítulo | P1 | `dlg_renumber_sub` | Batch numbering, in browser order |  |
| 282 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:45 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 283 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:46 | `Renumerar` | botão | P1 | `btn_renumber` | Renumber |  |
| 284 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:50 | `Prefixo` | label | P1 | `dlg_prefix` | Prefix |  |
| 285 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:53 | `Início` | label | P1 | `dlg_start` | Start |  |
| 286 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:56 | `Passo` | label | P1 | `dlg_step` | Step |  |
| 287 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:59 | `Casas` | label | P1 | `dlg_padding` | Digits |  |
| 288 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:62 | `Prévia` | label | P1 | `dlg_preview` | Preview |  |
| 289 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:64 | `Nenhuma prancha` | JSX texto | P1 | `dlg_no_sheets` | No sheets |  |
| 290 | apps/web/src/ui/dialogs/RenumberSheetsDialog.tsx:67 | `Enter ou sair do campo atualiza a prévia…` | texto de ajuda | P1 | `dlg_renumber_hint` | Enter or leaving the field updates the preview… |  |
| 291 | apps/web/src/ui/dialogs/RevisionDialog.tsx:16 | `toLocaleDateString('pt-BR')` | formatação | P1 | `n/a` | toLocaleDateString(active lang) | data inicial da revisão |
| 292 | apps/web/src/ui/dialogs/RevisionDialog.tsx:25 | `Descreva a revisão.` | mensagem | P1 | `err_describe_revision` | Describe the revision. |  |
| 293 | apps/web/src/ui/dialogs/RevisionDialog.tsx:32 | `Prancha inexistente.` | mensagem | P1 | `err_sheet_missing` | Sheet does not exist. |  |
| 294 | apps/web/src/ui/dialogs/RevisionDialog.tsx:35 | `Revisão {tag} emitida na prancha {n}.` | mensagem | P1 | `status_revision_issued` | Revision {tag} issued on sheet {n}. | barra de status |
| 295 | apps/web/src/ui/dialogs/RevisionDialog.tsx:38 | `Revisão recusada.` | mensagem | P1 | `err_revision_refused` | Revision refused. |  |
| 296 | apps/web/src/ui/dialogs/RevisionDialog.tsx:43 | `Emitir revisão` | título | P1 | `dlg_issue_revision` | Issue Revision |  |
| 297 | apps/web/src/ui/dialogs/RevisionDialog.tsx:49 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 298 | apps/web/src/ui/dialogs/RevisionDialog.tsx:50 | `Emitir revisão` | botão | P1 | `btn_issue_revision` | Issue Revision |  |
| 299 | apps/web/src/ui/dialogs/RevisionDialog.tsx:54 | `Tag` | label | P2 | `col_tag` | Tag |  |
| 300 | apps/web/src/ui/dialogs/RevisionDialog.tsx:57 | `Data` | label | P1 | `dlg_date` | Date |  |
| 301 | apps/web/src/ui/dialogs/RevisionDialog.tsx:60 | `Descrição` | label | P1 | `col_description` | Description |  |
| 302 | apps/web/src/ui/dialogs/RevisionDialog.tsx:61 | `O que mudou nesta revisão` | placeholder | P2 | `ph_revision_desc` | What changed in this revision |  |
| 303 | apps/web/src/ui/dialogs/RevisionDialog.tsx:63 | `Autor` | label | P1 | `dlg_author` | Author |  |
| 304 | apps/web/src/ui/dialogs/RevisionDialog.tsx:64 | `Em branco: sem autor` | placeholder | P2 | `ph_revision_author` | Blank: no author |  |
| 305 | apps/web/src/ui/dialogs/RevisionDialog.tsx:66 | `A revisão entra no histórico da prancha e a tag vai para o carimbo. Ctrl+Z desfaz.` | texto de ajuda | P2 | `dlg_revision_hint` | The revision enters the sheet history and the tag goes to the title block. Ctrl+Z undoes. |  |
| 306 | apps/web/src/ui/dialogs/PublishDialog.tsx:21 | `projeto` | dado padrão | P2 | `fallback_project_name` | project | nome base padrão |
| 307 | apps/web/src/ui/dialogs/PublishDialog.tsx:52 | `Marque ao menos uma prancha para publicar.` | mensagem | P1 | `err_select_sheet_publish` | Check at least one sheet to publish. |  |
| 308 | apps/web/src/ui/dialogs/PublishDialog.tsx:59 | `Nenhuma prancha válida para publicar.` | mensagem | P1 | `err_no_valid_sheet` | No valid sheet to publish. |  |
| 309 | apps/web/src/ui/dialogs/PublishDialog.tsx:60 | `projeto` | dado padrão | P2 | `fallback_project_name` | project | fallback do nome do arquivo |
| 310 | apps/web/src/ui/dialogs/PublishDialog.tsx:70 | `{n} arquivo(s) publicado(s).` | mensagem | P1 | `status_published_n` | {n} file(s) published. | barra de status |
| 311 | apps/web/src/ui/dialogs/PublishDialog.tsx:74 | `Não foi possível publicar.` | mensagem | P1 | `err_publish` | Could not publish. |  |
| 312 | apps/web/src/ui/dialogs/PublishDialog.tsx:82 | `Publicar pranchas` | título | P0 | `dlg_publish_sheets` | Publish Sheets |  |
| 313 | apps/web/src/ui/dialogs/PublishDialog.tsx:83 | `PDF em lote, na ordem escolhida` | subtítulo | P1 | `dlg_publish_sub` | Batch PDF, in the chosen order |  |
| 314 | apps/web/src/ui/dialogs/PublishDialog.tsx:88 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 315 | apps/web/src/ui/dialogs/PublishDialog.tsx:90 | `Publicando…` | botão | P0 | `dlg_publishing` | Publishing… |  |
| 316 | apps/web/src/ui/dialogs/PublishDialog.tsx:90 | `Publicar PDF` | botão | P0 | `btn_publish_pdf` | Publish PDF |  |
| 317 | apps/web/src/ui/dialogs/PublishDialog.tsx:90 | `Publicar {n} PDF` | botão | P0 | `btn_publish_n_pdf` | Publish {n} PDF |  |
| 318 | apps/web/src/ui/dialogs/PublishDialog.tsx:96 | `Nome base` | label | P1 | `dlg_base_name` | Base name |  |
| 319 | apps/web/src/ui/dialogs/PublishDialog.tsx:101 | `Um arquivo com todas as pranchas (desmarque para um PDF por prancha)` | checkbox | P1 | `dlg_one_file` | One file with all sheets (clear for one PDF per sheet) |  |
| 320 | apps/web/src/ui/dialogs/PublishDialog.tsx:110 | `Incluir {número}` | aria-label | P2 | `aria_include_sheet` | Include {number} |  |
| 321 | apps/web/src/ui/dialogs/PublishDialog.tsx:114 | `{n} vista(s) · rev. {tag}` | JSX texto | P1 | `dlg_sheet_meta` | {n} view(s) · rev. {tag} | plural por contagem |
| 322 | apps/web/src/ui/dialogs/PublishDialog.tsx:116 | `Mover para cima` | title (tooltip) | P2 | `tip_move_up` | Move Up |  |
| 323 | apps/web/src/ui/dialogs/PublishDialog.tsx:117 | `Mover para baixo` | title (tooltip) | P2 | `tip_move_down` | Move Down |  |
| 324 | apps/web/src/ui/dialogs/PublishDialog.tsx:121 | `Nenhuma prancha no projeto. Crie uma e adicione vistas.` | JSX texto | P1 | `dlg_no_sheets_project` | No sheet in the project. Create one and add views. |  |
| 325 | apps/web/src/ui/dialogs/PublishDialog.tsx:124 | `Dica: a exportação rápida do menu Arquivo › Exportar › PDF publica todas as pranchas de uma vez.` | texto de ajuda | P2 | `dlg_publish_tip` | Tip: quick export from File › Export › PDF publishes all sheets at once. |  |
| 326 | apps/web/src/ui/dialogs/UnitsDialog.tsx:51 | `Unidades do projeto` | título | P0 | `dlg_project_units` | Project Units | título já usado em nomeComandoLang("unidades") |
| 327 | apps/web/src/ui/dialogs/UnitsDialog.tsx:52 | `Medidas do modelo continuam em metros; isto muda o que você lê e digita` | subtítulo | P1 | `dlg_units_sub` | Model measurements stay in meters; this changes what you read and type |  |
| 328 | apps/web/src/ui/dialogs/UnitsDialog.tsx:57 | `Restaurar padrões` | botão | P0 | `btn_restore_defaults` | Restore Defaults |  |
| 329 | apps/web/src/ui/dialogs/UnitsDialog.tsx:59 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 330 | apps/web/src/ui/dialogs/UnitsDialog.tsx:67 | `Grandeza` | coluna | P1 | `col_quantity` | Quantity |  |
| 331 | apps/web/src/ui/dialogs/UnitsDialog.tsx:68 | `Unidade` | coluna | P1 | `col_unit` | Units |  |
| 332 | apps/web/src/ui/dialogs/UnitsDialog.tsx:69 | `Casas decimais` | coluna | P1 | `col_decimals` | Decimal places |  |
| 333 | apps/web/src/ui/dialogs/UnitsDialog.tsx:70 | `Suprimir zeros` | coluna | P1 | `col_suppress_zeros` | Suppress zeros |  |
| 334 | apps/web/src/ui/dialogs/UnitsDialog.tsx:84 | `{grandeza}: unidade` | aria-label | P2 | `aria_unit_of` | {quantity}: units |  |
| 335 | apps/web/src/ui/dialogs/UnitsDialog.tsx:98 | `{grandeza}: fração` | aria-label | P2 | `aria_fraction_of` | {quantity}: fraction |  |
| 336 | apps/web/src/ui/dialogs/UnitsDialog.tsx:107 | `{grandeza}: casas decimais` | aria-label | P2 | `aria_decimals_of` | {quantity}: decimal places |  |
| 337 | apps/web/src/ui/dialogs/UnitsDialog.tsx:118 | `{grandeza}: suprimir zeros` | aria-label | P2 | `aria_suppress_zeros_of` | {quantity}: suppress zeros |  |
| 338 | apps/web/src/ui/dialogs/UnitsDialog.tsx:129 | `Símbolo decimal` | label | P1 | `dlg_decimal_symbol` | Decimal symbol |  |
| 339 | apps/web/src/ui/dialogs/UnitsDialog.tsx:134 | `Símbolo decimal` | aria-label | P2 | `dlg_decimal_symbol` | Decimal symbol |  |
| 340 | apps/web/src/ui/dialogs/UnitsDialog.tsx:138 | `Vírgula` | opção de select | P1 | `decimal_comma` | Comma |  |
| 341 | apps/web/src/ui/dialogs/UnitsDialog.tsx:139 | `Ponto` | opção de select | P1 | `decimal_point` | Period |  |
| 342 | apps/web/src/ui/dialogs/UnitsDialog.tsx:144 | `Símbolo de moeda` | label | P1 | `dlg_currency_symbol` | Currency symbol |  |
| 343 | apps/web/src/ui/dialogs/UnitsDialog.tsx:149 | `Símbolo de moeda` | aria-label | P2 | `dlg_currency_symbol` | Currency symbol |  |
| 344 | apps/web/src/ui/dialogs/UnitsDialog.tsx:157 | `Exemplo ao vivo` | JSX texto | P1 | `dlg_live_example` | Live example |  |
| 345 | apps/web/src/ui/dialogs/unitsDialogModel.ts:30 | `Comprimento` | const módulo | P1 | `qty_length` | Length | QUANTITY_LABELS |
| 346 | apps/web/src/ui/dialogs/unitsDialogModel.ts:31 | `Comprimento pequeno (espessuras e folgas)` | const módulo | P1 | `qty_small_length` | Small length (thickness and clearance) |  |
| 347 | apps/web/src/ui/dialogs/unitsDialogModel.ts:32 | `Área` | const módulo | P1 | `qty_area` | Area |  |
| 348 | apps/web/src/ui/dialogs/unitsDialogModel.ts:33 | `Volume` | const módulo | P1 | `qty_volume` | Volume |  |
| 349 | apps/web/src/ui/dialogs/unitsDialogModel.ts:34 | `Ângulo` | const módulo | P1 | `qty_angle` | Angle |  |
| 350 | apps/web/src/ui/dialogs/unitsDialogModel.ts:35 | `Inclinação` | const módulo | P1 | `qty_slope` | Slope |  |
| 351 | apps/web/src/ui/dialogs/unitsDialogModel.ts:36 | `Moeda` | const módulo | P1 | `qty_currency` | Currency |  |
| 352 | apps/web/src/ui/dialogs/unitsDialogModel.ts:40 | `Metros` | const módulo | P1 | `unit_m_name` | Meters | UNIT_LABELS |
| 353 | apps/web/src/ui/dialogs/unitsDialogModel.ts:41 | `Centímetros` | const módulo | P1 | `unit_cm_name` | Centimeters |  |
| 354 | apps/web/src/ui/dialogs/unitsDialogModel.ts:42 | `Milímetros` | const módulo | P1 | `unit_mm_name` | Millimeters |  |
| 355 | apps/web/src/ui/dialogs/unitsDialogModel.ts:43 | `Pés` | const módulo | P1 | `unit_ft_name` | Feet |  |
| 356 | apps/web/src/ui/dialogs/unitsDialogModel.ts:44 | `Polegadas` | const módulo | P1 | `unit_in_name` | Inches |  |
| 357 | apps/web/src/ui/dialogs/unitsDialogModel.ts:45 | `Pés e polegadas` | const módulo | P1 | `unit_ftin_name` | Feet and inches |  |
| 358 | apps/web/src/ui/dialogs/unitsDialogModel.ts:50 | `Litros` | const módulo | P1 | `unit_l_name` | Liters |  |
| 359 | apps/web/src/ui/dialogs/unitsDialogModel.ts:52 | `Graus` | const módulo | P1 | `unit_deg_name` | Degrees |  |
| 360 | apps/web/src/ui/dialogs/unitsDialogModel.ts:53 | `Radianos` | const módulo | P1 | `unit_rad_name` | Radians |  |
| 361 | apps/web/src/ui/dialogs/unitsDialogModel.ts:54 | `Porcentagem` | const módulo | P1 | `unit_percent_name` | Percentage |  |
| 362 | apps/web/src/ui/dialogs/unitsDialogModel.ts:130 | `{grandeza}: as casas decimais precisam ser um inteiro de 0 a 5.` | mensagem | P1 | `err_decimals` | {quantity}: decimal places must be an integer from 0 to 5. | validação |
| 363 | apps/web/src/ui/dialogs/unitsDialogModel.ts:133 | `{grandeza}: fração de polegada inválida.` | mensagem | P2 | `err_fraction` | {quantity}: invalid inch fraction. |  |
| 364 | apps/web/src/ui/dialogs/unitsDialogModel.ts:137 | `O símbolo de moeda precisa ter de 1 a 4 caracteres.` | mensagem | P1 | `err_currency` | The currency symbol must have 1 to 4 characters. |  |
| 365 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:16 | `Outros` | const módulo | P2 | `grp_others` | Other | título de grupo da tabela |
| 366 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:50 | `Nenhuma tecla foi digitada: atalho não alterado.` | mensagem | P2 | `msg_no_key_typed` | No key was typed: shortcut unchanged. |  |
| 367 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:93 | `Atalhos de teclado` | título | P0 | `dlg_keyboard_shortcuts` | Keyboard Shortcuts | mesmo texto de nomeComandoLang("atalhos") |
| 368 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:93 | `Teclas de ferramentas e comandos` | subtítulo | P1 | `dlg_keyboard_shortcuts_sub` | Tool and command keys |  |
| 369 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:93 | `Fechar` | botão | P1 | `btn_close` | Close |  |
| 370 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:97 | `Perfil` | label | P1 | `dlg_profile` | Profile |  |
| 371 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:97 | `Perfil trocado: as alterações do perfil anterior foram descartadas.` | mensagem | P2 | `msg_profile_changed` | Profile changed: changes to the previous profile were discarded. |  |
| 372 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:101 | `Filtrar por nome` | placeholder | P1 | `ph_filter_by_name` | Filter by name |  |
| 373 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:101 | `Filtrar comandos por nome` | aria-label | P2 | `ph_filter_by_name` | Filter commands by name |  |
| 374 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:103 | `Exportar JSON` | botão | P1 | `btn_export_json` | Export JSON |  |
| 375 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:105 | `Importar JSON` | botão | P1 | `btn_import_json` | Import JSON |  |
| 376 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:108 | `Restaurar tudo` | botão | P1 | `btn_restore_all` | Restore All |  |
| 377 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:108 | `Todos os atalhos voltaram ao padrão do perfil.` | mensagem | P2 | `msg_restore_all` | All shortcuts were restored to the profile default. |  |
| 378 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:112 | `Pressione as novas teclas para {comando}: … Enter grava, Backspace apaga, Esc cancela.` | mensagem | P1 | `msg_press_new_keys` | Press the new keys for {command}: … Enter saves, Backspace deletes, Esc cancels. |  |
| 379 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:127 | `sem atalho` | JSX texto | P2 | `kb_unassigned` | no shortcut |  |
| 380 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:129 | `Atribuir` | botão | P1 | `btn_assign` | Assign |  |
| 381 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:130 | `Remover` | botão | P1 | `btn_remove` | Remove |  |
| 382 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:130 | `{comando}: sem atalho.` | mensagem | P2 | `msg_shortcut_removed` | {command}: no shortcut. |  |
| 383 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:131 | `Restaurar` | botão | P1 | `btn_restore` | Restore |  |
| 384 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:131 | `{comando}: atalho do perfil restaurado.` | mensagem | P2 | `msg_shortcut_restored` | {command}: profile shortcut restored. |  |
| 385 | apps/web/src/ui/dialogs/ShortcutsConfigDialog.tsx:140 | `Nenhum comando com esse nome.` | JSX texto | P1 | `dlg_no_command_found` | No command with that name. |  |
| 386 | apps/web/src/ui/dialogs/TextDialog.tsx:131 | `Digite o conteúdo da caixa de texto.` | mensagem | P1 | `err_text_empty` | Type the text box content. |  |
| 387 | apps/web/src/ui/dialogs/TextDialog.tsx:135 | `Caixa de texto` | mensagem | P2 | `undo_text_box` | Text Box | rótulo do passo de desfazer |
| 388 | apps/web/src/ui/dialogs/TextDialog.tsx:138 | `Caixa de texto criada na planta de área. Ctrl+Z desfaz.` | mensagem | P1 | `status_text_created_area` | Text box created on the area plan. Ctrl+Z undoes. | variante "no nível ativo" |
| 389 | apps/web/src/ui/dialogs/TextDialog.tsx:142 | `Não foi possível criar a caixa de texto.` | mensagem | P1 | `err_create_text` | Could not create the text box. |  |
| 390 | apps/web/src/ui/dialogs/TextDialog.tsx:148 | `Caixa de texto` | título | P0 | `dlg_text_box` | Text Box |  |
| 391 | apps/web/src/ui/dialogs/TextDialog.tsx:149 | `Texto com largura de quebra, moldura e alinhamento` | subtítulo | P1 | `dlg_text_box_sub` | Text with wrap width, frame and alignment |  |
| 392 | apps/web/src/ui/dialogs/TextDialog.tsx:154 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 393 | apps/web/src/ui/dialogs/TextDialog.tsx:155 | `Criar texto` | botão | P0 | `btn_create_text` | Create Text |  |
| 394 | apps/web/src/ui/dialogs/TextDialog.tsx:159 | `Conteúdo` | label | P1 | `dlg_content` | Content |  |
| 395 | apps/web/src/ui/dialogs/TextDialog.tsx:166 | `Digite o texto. O Enter quebra a linha.` | placeholder | P1 | `ph_text_content` | Type the text. Enter breaks the line. |  |
| 396 | apps/web/src/ui/dialogs/TextDialog.tsx:172 | `Altura` | label | P1 | `col_height` | Height |  |
| 397 | apps/web/src/ui/dialogs/TextDialog.tsx:175 | `Largura da caixa` | label | P1 | `dlg_box_width` | Box width |  |
| 398 | apps/web/src/ui/dialogs/TextDialog.tsx:176 | `Sem quebra` | placeholder | P2 | `ph_no_wrap` | No wrap |  |
| 399 | apps/web/src/ui/dialogs/TextDialog.tsx:178 | `Rotação` | label | P1 | `dlg_rotation` | Rotation |  |
| 400 | apps/web/src/ui/dialogs/TextDialog.tsx:181 | `Alinhamento` | label | P1 | `dlg_alignment` | Alignment |  |
| 401 | apps/web/src/ui/dialogs/TextDialog.tsx:183 | `Esquerda` | opção de select | P1 | `align_left` | Left |  |
| 402 | apps/web/src/ui/dialogs/TextDialog.tsx:184 | `Centro` | opção de select | P1 | `align_center` | Center |  |
| 403 | apps/web/src/ui/dialogs/TextDialog.tsx:185 | `Direita` | opção de select | P1 | `align_right` | Right |  |
| 404 | apps/web/src/ui/dialogs/TextDialog.tsx:189 | `Desenhar moldura em volta do texto` | checkbox | P1 | `dlg_draw_frame` | Draw frame around text |  |
| 405 | apps/web/src/ui/dialogs/TextDialog.tsx:190 | `Negrito` | checkbox | P1 | `fmt_bold` | Bold |  |
| 406 | apps/web/src/ui/dialogs/TextDialog.tsx:191 | `Itálico` | checkbox | P1 | `fmt_italic` | Italic |  |
| 407 | apps/web/src/ui/dialogs/TextDialog.tsx:192 | `Sublinhado` | checkbox | P1 | `fmt_underline` | Underline |  |
| 408 | apps/web/src/ui/dialogs/TextDialog.tsx:196 | `A caixa nasce no centro da vista ativa. Na planta de área ela fica na vista (não vai para a planta de piso).` | texto de ajuda | P2 | `dlg_text_box_hint` | The box is created at the center of the active view… |  |
| 409 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:26 | `União` | const módulo | P2 | `op_union` | Union | OPERACOES |
| 410 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:27 | `Diferença` | const módulo | P2 | `op_difference` | Difference |  |
| 411 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:28 | `Interseção` | const módulo | P2 | `op_intersection` | Intersection |  |
| 412 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:29 | `União (Clipper)` | const módulo | P2 | `op_union_clipper` | Union (Clipper) |  |
| 413 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:30 | `Diferença (Clipper)` | const módulo | P2 | `op_difference_clipper` | Difference (Clipper) |  |
| 414 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:31 | `Offset` | const módulo | P2 | `op_offset` | Offset | termo já em inglês |
| 415 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:39 | `Preferência salva. O kernel é ativado agora, sem bloquear a interface; recarregar a página garante um estado limpo.` | mensagem | P1 | `msg_kernel_on` | Preference saved. The kernel is enabled now, without blocking the interface; reloading the page ensures a clean state. |  |
| 416 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:40 | `Preferência salva. O TypeScript volta a atender as operações; recarregar a página mantém o TypeScript.` | mensagem | P1 | `msg_kernel_off` | Preference saved. TypeScript handles the operations again; reloading the page keeps TypeScript. |  |
| 417 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:94 | `Experimentais` | título | P1 | `dlg_experimental` | Experimental |  |
| 418 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:95 | `Recursos em teste, desligados por padrão` | subtítulo | P1 | `dlg_experimental_sub` | Features under test, off by default |  |
| 419 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:100 | `Atualizar medição` | botão | P1 | `btn_refresh_measure` | Refresh Measurement |  |
| 420 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:102 | `Fechar` | botão | P1 | `btn_close` | Close |  |
| 421 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:107 | `O kernel geométrico em Rust/WASM acelera as operações de união, diferença, interseção e offset…` | texto de ajuda | P1 | `dlg_kernel_hint` | The Rust/WASM geometry kernel speeds up union, difference, intersection and offset… |  |
| 422 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:112 | `Kernel geométrico experimental (Rust/WASM)` | label | P1 | `dlg_kernel_enable` | Experimental geometry kernel (Rust/WASM) |  |
| 423 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:124 | `Ligar` | botão | P1 | `btn_enable` | Enable |  |
| 424 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:125 | `Desligar` | botão | P1 | `btn_disable` | Disable |  |
| 425 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:126 | `ativando o wasm…` | JSX texto | P2 | `msg_activating_wasm` | enabling wasm… |  |
| 426 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:130 | `A URL força kernel={valor}: a preferência salva não vale nesta sessão…` | texto de ajuda | P2 | `dlg_kernel_url_override` | The URL forces kernel={value}: the saved preference does not apply in this session… |  |
| 427 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:136 | `Status agora` | JSX texto | P1 | `dlg_kernel_status` | Status now |  |
| 428 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:140 | `ativo ({nome})` | JSX texto | P1 | `kernel_active` | active ({name}) |  |
| 429 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:140 | `inativo — as operações rodam no TypeScript` | JSX texto | P1 | `kernel_inactive` | inactive — operations run in TypeScript |  |
| 430 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:142 | `Motivo:` | JSX texto | P1 | `lbl_reason` | Reason: |  |
| 431 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:143 | `falhas:` | JSX texto | P2 | `lbl_failures` | failures: |  |
| 432 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:147 | `Medição desta sessão` | JSX texto | P1 | `dlg_session_measure` | Measurement of this session |  |
| 433 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:149 | `chamada(s)` | JSX texto | P2 | `lbl_calls` | call(s) |  |
| 434 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:150 | `origem:` | JSX texto | P2 | `lbl_source` | source: |  |
| 435 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:155 | `Operação` | coluna | P1 | `col_operation` | Operation |  |
| 436 | apps/web/src/ui/dialogs/ExperimentosDialog.tsx:156 | `Chamadas` | coluna | P1 | `col_calls` | Calls |  |
| 437 | apps/web/src/ui/dialogs/HostedLossDialog.tsx:14 | `Aberturas fora da parede` | título | P1 | `dlg_hosted_loss` | Openings outside the wall |  |
| 438 | apps/web/src/ui/dialogs/HostedLossDialog.tsx:19 | `Cancelar` | botão | P1 | `btn_cancel` | Cancel |  |
| 439 | apps/web/src/ui/dialogs/HostedLossDialog.tsx:20 | `Excluir elementos e continuar` | botão | P1 | `dlg_hosted_loss_ok` | Delete elements and continue |  |
| 440 | apps/web/src/ui/dialogs/coreHint.ts:11 | `face de cima` | const módulo | P1 | `core_face_top` | top face | parâmetro padrão injetado no texto |
| 441 | apps/web/src/ui/dialogs/coreHint.ts:12 | `Sem camadas: não há núcleo.` | mensagem | P1 | `core_no_layers` | No layers: there is no core. |  |
| 442 | apps/web/src/ui/dialogs/coreHint.ts:14 | `Sem camada Estrutura: o núcleo é o elemento inteiro.` | mensagem | P1 | `core_no_structure` | No Structure layer: the core is the entire element. |  |
| 443 | apps/web/src/ui/dialogs/coreHint.ts:20 | `Núcleo: camadas {a} a {b}, de {x} a {y} {unidade} da {face}.` | mensagem | P1 | `core_hint` | Core: layers {a} to {b}, from {x} to {y} {unit} from the {face}. |  |
| 444 | apps/web/src/editor/dxfExportDialogModel.ts:12 | `Milímetros (mm)` | const módulo | P1 | `unit_mm` | Millimeters (mm) | DXF_UNIT_OPTIONS; usado pelo DxfExportDialog |
| 445 | apps/web/src/editor/dxfExportDialogModel.ts:13 | `Centímetros (cm)` | const módulo | P1 | `unit_cm` | Centimeters (cm) |  |
| 446 | apps/web/src/editor/dxfExportDialogModel.ts:14 | `Metros (m)` | const módulo | P1 | `unit_m` | Meters (m) |  |
| 447 | apps/web/src/editor/dxfExportDialogModel.ts:15 | `Pés (ft)` | const módulo | P1 | `unit_ft` | Feet (ft) |  |
| 448 | apps/web/src/editor/dxfExportDialogModel.ts:16 | `Polegadas (in)` | const módulo | P1 | `unit_in` | Inches (in) |  |
| 449 | apps/web/src/editor/dxfExportDialogModel.ts:33 | `Plantas de piso` | const módulo | P1 | `dxf_group_plans` | Floor Plans | GROUP_LABEL |
| 450 | apps/web/src/editor/dxfExportDialogModel.ts:34 | `Plantas de área` | const módulo | P1 | `dxf_group_areas` | Area Plans |  |
| 451 | apps/web/src/editor/dxfExportDialogModel.ts:35 | `Cortes e elevações` | const módulo | P1 | `dxf_group_sections` | Sections and Elevations |  |
| 452 | apps/web/src/editor/dxfExportDialogModel.ts:36 | `Pranchas` | const módulo | P1 | `dxf_group_sheets` | Sheets |  |
| 453 | packages/model/src/dimensionSettings.ts:40 | `Eixo` | const módulo | P1 | `dim_ref_axis` | Axis | WALL_DIM_REF_LABELS; opções do AutoCotaDialog |
| 454 | packages/model/src/dimensionSettings.ts:41 | `Face acabada` | const módulo | P1 | `dim_ref_finish` | Finished face |  |
| 455 | packages/model/src/dimensionSettings.ts:42 | `Eixo do núcleo` | const módulo | P1 | `dim_ref_core_center` | Core center |  |
| 456 | packages/model/src/dimensionSettings.ts:43 | `Face do núcleo` | const módulo | P1 | `dim_ref_core_face` | Core face |  |
| 457 | packages/model/src/dimensionSettings.ts:47 | `Centro` | const módulo | P1 | `dim_open_center` | Center | OPENING_DIM_REF_LABELS |
| 458 | packages/model/src/dimensionSettings.ts:48 | `Vão livre` | const módulo | P1 | `dim_open_clear` | Clear width |  |
| 459 | packages/model/src/dimensionSettings.ts:49 | `Vão externo do batente` | const módulo | P1 | `dim_open_frame` | Frame opening |  |
| 460 | packages/model/src/dimensionSettings.ts:50 | `Com alizar` | const módulo | P1 | `dim_open_casing` | With casing |  |
| 461 | packages/model/src/dxfLayerStyle.ts:26 | `Padrão` | mensagem | P2 | `dxf_weight_default` | Default | rótulo da espessura "Default" na tabela de camadas |
| 462 | packages/io/src/dxf.ts:144 | `PAREDE_CONTORNO` | dado de saída | P1 | `n/a` | WALL_OUTLINE | nomes de camada do DXF em PT, bloco 144–193 (ABERTURAS, FORRO, ESCADA…); aparecem na tabela de camadas e no arquivo |
| 463 | apps/web/src/editor/dxfBatch.ts:169 | `alvo inexistente` | mensagem | P2 | `dxf_skip_missing` | target does not exist | motivo listado no diálogo após exportar |
| 464 | apps/web/src/editor/dxfBatch.ts:179 | `prancha sem renderizador` | mensagem | P2 | `dxf_skip_no_renderer` | sheet without renderer |  |
| 465 | apps/web/src/editor/dxfBatch.ts:136 | `Hestia - exportação DXF em lote` | dado de saída | P1 | `n/a` | Hestia - DXF batch export | LEIA-ME.txt do ZIP (linhas 136–142) |
| 466 | apps/web/src/editor/saveBytes.ts:12 | `Salvo como {arquivo}.` | mensagem | P1 | `status_saved_as` | Saved as {file}. | status mostrado no DxfExportDialog |
| 467 | apps/web/src/editor/saveText.ts:11 | `Salvo como {arquivo}.` | mensagem | P1 | `status_saved_as` | Saved as {file}. | status mostrado no ShortcutsConfigDialog |
| 468 | apps/web/src/editor/saveText.ts:16 | `Download indisponível: o conteúdo foi copiado para a área de transferência.` | mensagem | P2 | `status_copied_clipboard` | Download unavailable: the content was copied to the clipboard. |  |
| 469 | apps/web/src/editor/savePdf.ts:11 | `Salvo como {arquivo}.` | mensagem | P1 | `status_saved_as` | Saved as {file}. | status da publicação |
| 470 | apps/web/src/editor/savePdf.ts:13 | `Não foi possível salvar o PDF neste navegador.` | mensagem | P1 | `err_pdf_save` | Could not save the PDF in this browser. |  |
| 471 | packages/tools/src/registry.ts:45 | `Construir` | const módulo | P1 | `grp_build` | Build | TOOL_GROUPS: cabeçalho de grupo na tela de atalhos |
| 472 | packages/tools/src/registry.ts:46 | `Modificar` | const módulo | P1 | `grp_modify` | Modify |  |
| 473 | packages/tools/src/registry.ts:47 | `Anotar` | const módulo | P1 | `grp_annotate` | Annotate |  |
| 474 | packages/tools/src/registry.ts:48 | `Medir` | const módulo | P1 | `grp_measure` | Measure |  |
| 475 | packages/tools/src/shortcutDefaults.ts:51 | `Revit (duas letras)` | const módulo | P2 | `profile_revit` | Revit (two letters) | PERFIL_NOMES: seletor de perfil |
| 476 | packages/tools/src/shortcutDefaults.ts:51 | `Simples (uma tecla)` | const módulo | P2 | `profile_simple` | Simple (one key) |  |
| 477 | apps/web/src/editor/shortcutConfig.ts:106 | `Use de 1 a 4 letras ou números, sem espaços.` | mensagem | P1 | `err_shortcut_format` | Use 1 to 4 letters or numbers, no spaces. | mensagens de atribuição exibidas no diálogo |
| 478 | apps/web/src/editor/shortcutConfig.ts:116 | `"{seq}" já é usada por {comandos}. Escolha outra.` | mensagem | P1 | `err_shortcut_in_use` | "{seq}" is already used by {commands}. Choose another. |  |
| 479 | apps/web/src/editor/shortcutConfig.ts:165 | `O arquivo não é um JSON válido.` | mensagem | P1 | `err_json_invalid` | The file is not valid JSON. |  |
| 480 | apps/web/src/editor/shortcutConfig.ts:167 | `Arquivo que não é de atalhos do Hestia (formato ou versão diferentes).` | mensagem | P1 | `err_shortcut_file` | File is not a Hestia shortcut file (different format or version). |  |
| 481 | apps/web/src/editor/shortcutConfig.ts:169 | `Perfil desconhecido no arquivo.` | mensagem | P2 | `err_unknown_profile` | Unknown profile in the file. |  |
| 482 | apps/web/src/editor/shortcutConfig.ts:174 | `Conflito no arquivo: {a} e {b} usam "{seq}". Nada foi importado.` | mensagem | P1 | `err_shortcut_conflict` | Conflict in the file: {a} and {b} use "{seq}". Nothing was imported. |  |
| 483 | apps/web/src/editor/shortcutConfig.ts:177 | `Atalhos importados.` | mensagem | P2 | `msg_shortcuts_imported` | Shortcuts imported. |  |
| 484 | apps/web/src/editor/areaMerge.ts:76 | `Ao remover esta parede/separador, os ambientes abaixo vão se fundir:` | mensagem | P1 | `area_merge_intro` | Removing this wall/separator merges the rooms below: | corpo do AreaMergeDialog |
| 485 | apps/web/src/editor/areaMerge.ts:77 | `Fica: {ambiente} ({área}).` | mensagem | P1 | `area_merge_keep` | Kept: {room} ({area}). |  |
| 486 | apps/web/src/editor/areaMerge.ts:78 | `Sai: {ambiente} ({área}).` | mensagem | P1 | `area_merge_remove` | Removed: {room} ({area}). |  |
| 487 | apps/web/src/editor/areaMerge.ts:79 | `A área final do circuito será {área}. Confirmar a expansão e apagar o(s) ambiente(s) menor(es)?` | mensagem | P1 | `area_merge_confirm` | The final loop area will be {area}. Confirm the expansion and delete the smaller room(s)? |  |
| 488 | packages/tools/src/hostedLoss.ts:104 | `Esta alteração deixa {n} elemento(s) fora da parede: {lista}. Eles serão excluídos. Continuar?` | mensagem | P1 | `hosted_loss_msg` | This change leaves {n} element(s) outside the wall: {list}. They will be deleted. Continue? | corpo do HostedLossDialog |

## Mistura PT/EN no mesmo arquivo
- `OtherDialogs.tsx`: nomes de comando via `nomeComandoLang` (EN correto) ao lado de título, rodapé, tabela de teclas e cartões de projeto 100% PT.
- `ShortcutsConfigDialog.tsx`: nomes de comando e perfil em PT (`PERFIL_NOMES`) misturados com botões/mensagens PT; o título "Atalhos de teclado" difere do título "Atalhos" do diálogo somente-leitura.
- `DxfExportDialog.tsx`: tokens técnicos e nomes de pasta em maiúsculas EN-ish (`PLANTAS`, `CORTES`) com moldura PT; "Camadas" também é o nome de aba em EN aceitável, mas as colunas vêm em PT.
- `ExperimentosDialog.tsx`: "Offset" (EN) convive com "União/Diferença/Interseção"; "wasm", "ABI" e "Status agora" no mesmo bloco.
- `TextDialog.tsx`: opções de alinhamento em PT, mas o tipo interno (`left/center/right`) e o campo `align` são EN.
- `DxfLayerTable.tsx`: cores em PT ("Branco/preto") e tipos de linha do DXF em EN (`CONTINUOUS`, `DASHED`) na mesma célula.

## Riscos / testes que quebram
- `apps/web/src/ui/dialogs/pasteLevelsModel.test.ts:198-202` (`summary`), `:212`, `:217`, `:222-223` (`validate`) — comparam texto PT exato; quebram ao traduzir.
- `apps/web/src/ui/dialogs/terminoForm.test.ts:52-55` — `{ erro: 'Informe um número de 1 a 9' }`.
- `apps/web/src/ui/dialogs/coreHint.test.ts:11-36` — texto completo do núcleo, incluindo "face de cima"/"face externa".
- `apps/web/src/ui/dialogs/UnitsDialog.test.ts:25-28` — `aria-label="Símbolo decimal"`, `aria-label="Símbolo de moeda"` e o botão "Restaurar padrões".
- `apps/web/src/ui/dialogs/AutoCotaDialog.test.ts:17-20` — espera "Face do núcleo"/"Vão livre" vindos de `dimensionSettings.ts`.
- `apps/web/src/ui/dialogs/ShortcutsConfigDialog.test.ts` — depende de `nomeComandoLang`/rótulos de grupo; revisar ao trocar `TOOL_GROUPS`.
- `apps/web/src/editor/dxfExportDialogModel.test.ts:14-19` usa rótulos de dado (Térreo, Corte A), mas qualquer mudança em `GROUP_LABEL`/`DXF_UNIT_OPTIONS` afeta snapshots de lista.
- `apps/web/src/editor/dxfBatch.test.ts:144-162` compara `reason` em PT ('sem geometria', 'prancha sem renderizador', 'alvo inexistente').
- `apps/web/src/editor/areaMerge.test.ts` e `alertaPrompt.test.ts:12` verificam mensagens PT de `areaMerge.ts`/`pedirAlerta`.
- `apps/web/src/editor/shortcutConfig.test.ts` verifica as mensagens de `atribuirAtalho`/`importaAtalhos`.
- `UnitsDialog` usa `aria-label` interpolado com `QUANTITY_LABELS`; trocar o rótulo muda todos os `aria-label` de uma vez (bom), mas os testes de HTML quebram.

## Já correto
- `ShortcutsConfigDialog.tsx:77`, `:112`, `:126`, `:130-131` — nomes de comando sempre por `nomeComandoLang(cmd, lang)` (não usam `TOOL_LABEL`).
- `OtherDialogs.tsx:175` — tabela de atalhos usa `nomeComandoLang` para o nome do comando; só a descrição fixa ficou em PT.
- `DxfExportDialog.tsx` / `PublishDialog.tsx` — não há `toLocaleString` sem `lang`; números de contagem são inteiros crus.
- `UnitsDialog` — a formatação dos exemplos usa `formatQuantity`/`resolveUnits` (unidade do projeto), não `toLocaleString` fixo; o problema ali é só o texto dos rótulos.
- `Dialog.tsx` — único texto visível é o `aria-label="Fechar"`; não tem título fixo (recebe `title` por prop).
