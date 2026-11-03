# 03 — Diálogos de tipo, escada/rampa e dimensionamento

- Escopo: `apps/web/src/ui/dialogs/` (TypeDialog*.tsx, Stair*, Ramp*, *SectionPreview.tsx, Profile*, Dimension*, LineWeightsDialog, MaterialsDialog, RoomCategoriesDialog, GraphicsVisibilityDialog, StripsTab e os `.ts` de cálculo/desenho)
- Arquivos analisados: 38
- Ocorrências: 229 (P0: 14, P1: 150, P2: 65)

## Resumo executivo

A área tem dois mundos bem separados. Os diálogos de **escada** (`stt_*`) e as prévias de **rampa/escada** já estão traduzidos (ou bilíngues) e servem de referência. Todo o resto está em PT-BR fixo: os cinco diálogos de tipo de camada (parede, piso, laje, forro, telhado), o de grade, o de rampa, os de perfil, os de cota e os navegadores de material/categorias/pesos de linha **não importam `useI18n`** e não têm uma única chave. Como os rótulos vêm de constantes de módulo (`FAMILY`, `FUNCTION_LABEL`, `PROFILE_LABEL`, `HATCHES`, `DIM_*`), nem um patch pontual de JSX resolve: é preciso mover essas constantes para o dicionário. O mesmo vale para mensagens geradas em `.ts` (`coreHint`, `profilePresets`, `dimensionStyleModel`) e para os erros do modelo, que sobem em PT e são concatenados a prefixos PT nos diálogos. O diálogo de escada é o único caso de **mistura** real: usa `stt_*`, mas três mensagens de status/salvamento continuam fixas em português.

## Causas-raiz

1. **Diálogos de camada sem i18n algum.** `WallTypeDialog.tsx`, `FloorTypeDialog.tsx`, `SlabTypeDialog.tsx`, `CeilingTypeDialog.tsx` e `RoofTypeDialog.tsx` não importam `useI18n`/`I18N` (0 ocorrências). Título, rodapé, abas, tabela e ajuda são literais: `WallTypeDialog.tsx:93`, `FloorTypeDialog.tsx:89`, `SlabTypeDialog.tsx:89`, `CeilingTypeDialog.tsx:86`, `RoofTypeDialog.tsx:86`.
2. **Constantes de módulo em PT, avaliadas uma única vez.** `WRAP_OPTIONS` (`WallTypeDialog.tsx:18`), `FAMILY` (`typeFamilies.ts:4-11`), `FUNCTION_LABEL` (`packages/model/src/priority.ts:17`), `PROFILE_LABEL` (`RampTypeDialog.tsx:21`), `HATCHES` (`MaterialsDialog.tsx:8`), `SIDES`/`PRESETS` (`StripsTab.tsx:8,10-14`), `DIM_TICK_OPTIONS`/`UNIT_OPTIONS`/`PRECISION_OPTIONS` (`dimensionStyleModel.ts:27-57`), `CATEGORY_LABEL` (`graphicsLabels.ts:5-16`). Nenhuma acompanha a troca de idioma.
3. **Mensagens prontas em `.ts`.** `coreHint.ts:12,14,20` (usado por Floor/Slab), `profilePresets.ts:53`, `stairTypeForm.ts:161`, `dimensionStyleModel.ts:102-123`. Retornam strings PT que a UI apenas renderiza.
4. **Erros do modelo sobem em PT e são concatenados com prefixo PT.** `Não foi possível excluir: ${r.error}` em `FloorTypeDialog.tsx:77`, `SlabTypeDialog.tsx:77`, `CeilingTypeDialog.tsx:74`, `RoofTypeDialog.tsx:74`, `StairTypeDialog.tsx:192`, `RampTypeDialog.tsx:63`; `GridTypeDialog` mostra `issue`/`erro` crus (`GridTypeDialog.tsx:100`); `DimensionFamiliesDialog.tsx:72` mostra `dimensionFamilyIssue`.
5. **i18n parcial.** `StairTypeDialog.tsx` usa `stt_*` em quase tudo, mas mantém `Não foi possível salvar…` (134), `Corrija os erros…` (176) e `Não foi possível excluir…` (192). `RampTypeDialog.tsx` traduz só `ramp_type_title`/`ramp_norm_*` e deixa título composto, subtítulo, campos e tabela em PT.
6. **Nomes padrão de documento não localizados.** `(cópia)` (`WallTypeDialog.tsx:75`, `stairTypeForm.ts:161`), `Novo material` (`MaterialsDialog.tsx:39`), `Nova categoria` (`RoomCategoriesDialog.tsx:18`), `Nova família`/`(cópia)` (`DimensionFamiliesDialog.tsx:39,42`), `Faixa` e presets (`StripsTab.tsx:11-13,36`), `Padrão` (`DimensionFamiliesDialog.tsx:34`).
7. **Formatação dependente de locale fixo.** `dimensionStyleModel.ts:89,91,97` força vírgula decimal em qualquer idioma; `toLocaleLowerCase('pt-BR')`/`localeCompare(..., 'pt-BR')` em `DimensionFamiliesDialog.tsx:38,42` e `MaterialsDialog.tsx:19`.
8. **Prévia desenhada com texto congelado.** `SectionPreview.tsx:38-39,62`, `FloorSectionPreview.tsx:46-47,72`, `SlabSectionPreview.tsx:46-47,72`, `RoofSectionPreview.tsx:43-44`, `ProfilePreview.tsx:43`, `RoofProfileDialog.tsx:65`.

## Inventário

| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:18 | `Não envolver / Dos dois lados / Só lado externo / Só lado interno` | constante de módulo | P1 | `wall_wrap_options` | No wrap / Both sides / Exterior side only / Interior side only | WRAP_OPTIONS fora do i18n; 4 rótulos de enum |
| 2 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:75 | `(cópia)` | nome padrão gerado | P1 | `dlg_duplicate_suffix` | (copy) | Sufixo do nome ao duplicar; idem stairTypeForm.ts:161 |
| 3 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:84 | `Não foi possível excluir.` | mensagem gerada | P1 | `err_delete_generic` | Could not delete. | Status da barra |
| 4 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:93 | `Propriedades do tipo` | título de diálogo | P0 | `type_title_wall` | Type Properties | Título compartilhado por todos os diálogos de camada |
| 5 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:94 | `Parede · usado em {n} paredes` | subtítulo | P0 | `type_sub_wall` | Wall · used in {n} walls | Pluralização manual inline |
| 6 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:98 | `Há paredes usando este tipo / Excluir tipo` | atributo title | P1 | `wall_in_use` | Wall types in use / Delete type |  |
| 7 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:100 | `Cancelar / Aplicar / OK` | botão | P1 | `dlg_cancel_apply_ok` | Cancel / Apply / OK | 3 botões do rodapé |
| 8 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:102 | `Corrija as faixas inválidas` | atributo title | P1 | `wall_fix_strips` | Fix invalid strips | Tooltip de OK desabilitado |
| 9 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:108 | `Nome do tipo` | rótulo de campo | P1 | `fld_type_name` | Type Name |  |
| 10 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:112 | `Estrutura / Faixas / Gráficos / Identidade` | aba | P1 | `wall_tabs` | Structure / Strips / Graphics / Identity | 4 abas |
| 11 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:123 | `Função / Material / Esp. (cm) / Envolve` | cabeçalho de tabela | P1 | `col_function_material_thickness_wraps` | Function / Material / Thickness (cm) / Wraps | Também linhas 203 |
| 12 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:126 | `Face externa / Face interna` | texto em tabela | P2 | `wall_faces` | Exterior Face / Interior Face | Linhas 126 e 169 |
| 13 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:136 | `Função da camada {n}` | aria-label | P2 | `a11y_layer_function` | Layer {n} function |  |
| 14 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:139 | `Prioridade de junção efetiva / Mais / Opções avançadas da camada {n}` | atributo title | P2 | `a11y_layer_priority` | Effective join priority / More / Layer {n} advanced options | Linhas 139, 152, 176 |
| 15 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:143 | `Escolher material` | atributo title | P2 | `tt_pick_material` | Pick material |  |
| 16 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:149 | `Camada {n} envolve / Subir camada / Descer camada / Remover camada` | aria-label | P2 | `a11y_layer_actions` | Layer {n} wraps / Move layer up / Move layer down / Remove layer | Linhas 149, 153-155 |
| 17 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:173 | `Espessura total` | rótulo | P1 | `wall_total_thickness` | Total Thickness |  |
| 18 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:174 | `+ Inserir camada` | botão | P1 | `wall_add_layer` | + Insert Layer |  |
| 19 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:176 | `Retorno nos vãos / Retorno nas pontas` | rótulo de campo | P1 | `wall_wrap_inserts_ends` | Wrap at Inserts / Wrap at Ends | Linhas 176 e 182; com tooltips |
| 20 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:190 | `O núcleo (faixa azul) vai da primeira à última camada de estrutura e define as linhas de localização "do núcleo". Na junção, a camada de menor número de prioridade atravessa as demais.` | texto de ajuda | P2 | `wall_core_help` | The core (blue band) runs from the first to the last structural layer and defines the core location lines. At joins, the layer with the lowest priority number passes through the others. |  |
| 21 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:201 | `A hachura de corte e as cores vêm do material de cada camada. Edite no navegador de materiais.` | texto de ajuda | P2 | `wall_graphics_help` | Cut hatch and colors come from each layer material. Edit them in the material browser. |  |
| 22 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:217 | `Abrir navegador de materiais…` | botão/atalho | P2 | `open_material_browser` | Open Material Browser… |  |
| 23 | apps/web/src/ui/dialogs/WallTypeDialog.tsx:222 | `Código / Descrição` | rótulo de campo | P1 | `fld_code_description` | Code / Description | Linhas 222-223 |
| 24 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:77 | `Não foi possível excluir: {erro}` | mensagem gerada | P1 | `err_delete_with_reason` | Could not delete: {error} | Erro do modelo concatenado |
| 25 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:89 | `Propriedades do tipo de piso` | título de diálogo | P0 | `type_title_floor` | Floor Type Properties |  |
| 26 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:90 | `Piso · usado em {n} pisos` | subtítulo | P0 | `type_sub_floor` | Floor · used in {n} floors |  |
| 27 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:95 | `Excluir tipo` | atributo title | P1 | `dlg_delete_type` | Delete type |  |
| 28 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:97 | `Cancelar / Aplicar / OK` | botão | P1 | `dlg_cancel_apply_ok` | Cancel / Apply / OK |  |
| 29 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:105 | `Nome do tipo` | rótulo de campo | P1 | `fld_type_name` | Type Name |  |
| 30 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:112 | `Função / Material / Esp. (cm)` | cabeçalho de tabela | P1 | `col_function_material_thickness` | Function / Material / Thickness (cm) |  |
| 31 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:115 | `Topo do piso / Face inferior` | texto em tabela | P2 | `floor_faces` | Top of Floor / Bottom Face | Linhas 115 e 157 |
| 32 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:160 | `Espessura total` | rótulo | P1 | `floor_total_thickness` | Total Thickness |  |
| 33 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:162 | `Há camadas de funções diferentes com a mesma prioridade: elas não se cortam e deixam linha de fronteira.` | aviso | P2 | `layers_tied_priority` | There are layers with different functions at the same priority: they do not cut and leave a boundary line. |  |
| 34 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:163 | `+ Inserir camada` | botão | P1 | `floor_add_layer` | + Insert Layer |  |
| 35 | apps/web/src/ui/dialogs/FloorTypeDialog.tsx:168 | `A primeira camada é o acabamento de cima. O topo do piso fica na cota do nível mais o deslocamento da instância.` | texto de ajuda | P2 | `floor_help` | The first layer is the top finish. The top of the floor sits at the level elevation plus the instance offset. |  |
| 36 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:77 | `Não foi possível excluir: {erro}` | mensagem gerada | P1 | `err_delete_with_reason` | Could not delete: {error} |  |
| 37 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:89 | `Propriedades do tipo de laje` | título de diálogo | P0 | `type_title_slab` | Slab Type Properties |  |
| 38 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:90 | `Laje · usada em {n} lajes` | subtítulo | P0 | `type_sub_slab` | Slab · used in {n} slabs |  |
| 39 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:95 | `Excluir tipo` | atributo title | P1 | `dlg_delete_type` | Delete type |  |
| 40 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:97 | `Cancelar / Aplicar / OK` | botão | P1 | `dlg_cancel_apply_ok` | Cancel / Apply / OK |  |
| 41 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:105 | `Nome do tipo` | rótulo de campo | P1 | `fld_type_name` | Type Name |  |
| 42 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:112 | `Função / Material / Esp. (cm)` | cabeçalho de tabela | P1 | `col_function_material_thickness` | Function / Material / Thickness (cm) |  |
| 43 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:115 | `Topo da laje / Face inferior` | texto em tabela | P2 | `slab_faces` | Top of Slab / Bottom Face | Linhas 115 e 157 |
| 44 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:160 | `Espessura total` | rótulo | P1 | `slab_total_thickness` | Total Thickness |  |
| 45 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:162 | `Há camadas de funções diferentes com a mesma prioridade: elas não se cortam e deixam linha de fronteira.` | aviso | P2 | `layers_tied_priority` | There are layers with different functions at the same priority: they do not cut and leave a boundary line. |  |
| 46 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:163 | `+ Inserir camada` | botão | P1 | `slab_add_layer` | + Insert Layer |  |
| 47 | apps/web/src/ui/dialogs/SlabTypeDialog.tsx:168 | `A primeira camada é a de cima. O topo da laje fica na cota do nível mais o deslocamento da instância. A inclinação é definida na planta.` | texto de ajuda | P2 | `slab_help` | The first layer is the top one. The top of the slab sits at the level elevation plus the instance offset. Slope is defined in plan. |  |
| 48 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:74 | `Não foi possível excluir: {erro}` | mensagem gerada | P1 | `err_delete_with_reason` | Could not delete: {error} |  |
| 49 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:86 | `Propriedades do tipo de forro` | título de diálogo | P0 | `type_title_ceiling` | Ceiling Type Properties |  |
| 50 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:87 | `Forro · usada em {n} forros` | subtítulo | P0 | `type_sub_ceiling` | Ceiling · used in {n} ceilings | Concordância errada no PT (forro é masculino) |
| 51 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:92 | `Excluir tipo` | atributo title | P1 | `dlg_delete_type` | Delete type |  |
| 52 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:94 | `Cancelar / Aplicar / OK` | botão | P1 | `dlg_cancel_apply_ok` | Cancel / Apply / OK |  |
| 53 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:102 | `Nome do tipo` | rótulo de campo | P1 | `fld_type_name` | Type Name |  |
| 54 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:109 | `Função / Material / Esp. (cm)` | cabeçalho de tabela | P1 | `col_function_material_thickness` | Function / Material / Thickness (cm) |  |
| 55 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:112 | `Topo da forro / Face inferior` | texto em tabela | P2 | `ceiling_faces` | Top of Ceiling / Bottom Face | Erro de concordância "Topo da forro"; linhas 112 e 150 |
| 56 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:153 | `Espessura total` | rótulo | P1 | `ceiling_total_thickness` | Total Thickness |  |
| 57 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:154 | `+ Inserir camada` | botão | P1 | `ceiling_add_layer` | + Insert Layer |  |
| 58 | apps/web/src/ui/dialogs/CeilingTypeDialog.tsx:159 | `A primeira camada é a de cima. O topo da forro fica na cota do nível mais o deslocamento da instância. A inclinação é definida na planta.` | texto de ajuda | P2 | `ceiling_help` | The first layer is the top one. The top of the ceiling sits at the level elevation plus the instance offset. Slope is defined in plan. | Repete o erro "Topo da forro" |
| 59 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:74 | `Não foi possível excluir: {erro}` | mensagem gerada | P1 | `err_delete_with_reason` | Could not delete: {error} |  |
| 60 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:86 | `Propriedades do tipo de telhado` | título de diálogo | P0 | `type_title_roof` | Roof Type Properties |  |
| 61 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:87 | `Telhado · usado em {n} telhados` | subtítulo | P0 | `type_sub_roof` | Roof · used in {n} roofs |  |
| 62 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:92 | `Excluir tipo` | atributo title | P1 | `dlg_delete_type` | Delete type |  |
| 63 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:94 | `Cancelar / Aplicar / OK` | botão | P1 | `dlg_cancel_apply_ok` | Cancel / Apply / OK |  |
| 64 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:102 | `Nome do tipo` | rótulo de campo | P1 | `fld_type_name` | Type Name |  |
| 65 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:109 | `Função / Material / Esp. (cm)` | cabeçalho de tabela | P1 | `col_function_material_thickness` | Function / Material / Thickness (cm) |  |
| 66 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:112 | `Topo do telhado / Face inferior` | texto em tabela | P2 | `roof_faces` | Top of Roof / Bottom Face | Linhas 112 e 150 |
| 67 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:153 | `Espessura total` | rótulo | P1 | `roof_total_thickness` | Total Thickness |  |
| 68 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:154 | `+ Inserir camada` | botão | P1 | `roof_add_layer` | + Insert Layer |  |
| 69 | apps/web/src/ui/dialogs/RoofTypeDialog.tsx:159 | `A primeira camada é a de cima. O topo do telhado fica na cota do beiral (nível mais o deslocamento da instância). A forma e a inclinação são definidas no próprio telhado.` | texto de ajuda | P2 | `roof_help` | The first layer is the top one. The roof top sits at the eave elevation (level plus instance offset). Shape and slope are defined on the roof itself. |  |
| 70 | apps/web/src/ui/dialogs/GridTypeDialog.tsx:17 | `Tinta do tema` | rótulo de caixa | P1 | `grid_theme_ink` | Theme ink |  |
| 71 | apps/web/src/ui/dialogs/GridTypeDialog.tsx:44 | `Operação recusada.` | mensagem gerada | P1 | `err_operation_refused` | Operation refused. |  |
| 72 | apps/web/src/ui/dialogs/GridTypeDialog.tsx:85 | `Editar tipo de grade` | título de diálogo | P0 | `type_title_grid` | Edit Grid Type |  |
| 73 | apps/web/src/ui/dialogs/GridTypeDialog.tsx:86 | `Grade · bolhas e traços em mm de papel` | subtítulo | P0 | `type_sub_grid` | Grid · bubbles and lines in paper mm | NumField usa smallLength (cm) — unidade do subtítulo não bate com o campo |
| 74 | apps/web/src/ui/dialogs/GridTypeDialog.tsx:91 | `Excluir / Duplicar / Cancelar / Aplicar / OK` | botão | P1 | `dlg_crud_buttons` | Delete / Duplicate / Cancel / Apply / OK | Linhas 91-96 |
| 75 | apps/web/src/ui/dialogs/GridTypeDialog.tsx:101 | `Nome do tipo / Segmento central / Espessura / Traço` | rótulo de campo | P1 | `grid_fields` | Type Name / Center Segment / Weight / Pattern | Linhas 101-108 |
| 76 | apps/web/src/ui/dialogs/GridTypeDialog.tsx:113 | `Cor / Comprimento das pontas / Espessura do centro / Traço do centro / Cor do centro / Diâmetro da bolha / Altura do texto` | rótulo de campo | P1 | `grid_more_fields` | Color / End Length / Center Weight / Center Pattern / Center Color / Bubble Diameter / Text Height | Linhas 113-127 |
| 77 | apps/web/src/ui/dialogs/StairTypeDialog.tsx:134 | `Não foi possível salvar: {erro}` | mensagem gerada | P1 | `stt_err_save` | Could not save: {error} | Nova chave; erro do modelo em PT |
| 78 | apps/web/src/ui/dialogs/StairTypeDialog.tsx:176 | `Corrija os erros do tipo antes de duplicar.` | mensagem gerada | P1 | `stt_err_fix_before_duplicate` | Fix the type errors before duplicating. |  |
| 79 | apps/web/src/ui/dialogs/StairTypeDialog.tsx:192 | `Não foi possível excluir: {erro}` | mensagem gerada | P1 | `stt_err_delete` | Could not delete: {error} |  |
| 80 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:21 | `Personalizado` | constante de módulo | P1 | `ramp_profile_custom` | Custom | PROFILE_LABEL calculado uma vez; não acompanha o idioma |
| 81 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:63 | `Não foi possível excluir: {erro}` | mensagem gerada | P1 | `err_delete_with_reason` | Could not delete: {error} |  |
| 82 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:90 | `Propriedades · Tipo de rampa` | título de diálogo | P0 | `ramp_type_props` | Ramp Type Properties | Mistura "Propriedades" fixo com chave ramp_type_title |
| 83 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:91 | `Rampa · usada em {n} rampas` | subtítulo | P0 | `type_sub_ramp` | Ramp · used in {n} ramps |  |
| 84 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:96 | `Excluir tipo` | atributo title | P1 | `dlg_delete_type` | Delete type |  |
| 85 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:98 | `Cancelar / Aplicar / OK` | botão | P1 | `dlg_cancel_apply_ok` | Cancel / Apply / OK |  |
| 86 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:104 | `Escada` | nome de família | P1 | `family_ramp` | Ramp | FAMILY.stair usado no diálogo de rampa: mostra "Escada" |
| 87 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:106 | `Nome do tipo / Código / Descrição / Custo (R$) / Espessura estrutural / Espessura do patamar / Largura padrão / Largura mínima / Comprimento mínimo do patamar / Pé-direito livre mínimo / Inclinação padrão / Material` | rótulo de campo | P1 | `ramp_fields` | Type Name / Code / Description / Cost (BRL) / Structural Thickness / Landing Thickness / Default Width / Minimum Width / Minimum Landing Length / Minimum Headroom / Default Slope / Material | Linhas 106-122; moeda BRL fixa |
| 88 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:131 | `A inclinação do lance é resultado do desnível e do comprimento; o valor padrão é usado quando a rampa é criada no modo inclinação.` | texto de ajuda | P2 | `ramp_help` | Flight slope results from rise and length; the default value is used when the ramp is created in slope mode. |  |
| 89 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:138 | `Perfil de norma / Inclinação até / Desnível máx. por lance / Máx. de lances` | rótulo de campo | P1 | `ramp_norm_fields` | Norm Profile / Slope Up To / Max. Rise per Flight / Max. Flights | Linhas 138, 156-158 |
| 90 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:172 | `sem limite` | placeholder | P1 | `ramp_no_limit` | no limit |  |
| 91 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:177 | `Remover linha {n}` | aria-label | P2 | `a11y_remove_row` | Remove row {n} |  |
| 92 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:183 | `Adicionar linha / Remover linha` | botão | P1 | `ramp_add_remove_row` | Add row / Remove row |  |
| 93 | apps/web/src/ui/dialogs/RampTypeDialog.tsx:186 | `Valores de referência de fonte secundária; confira a norma vigente antes de usar.` | texto de ajuda | P2 | `ramp_norm_footnote` | Reference values from a secondary source; check the current code before use. |  |
| 94 | apps/web/src/ui/dialogs/TypeDialogHeader.tsx:32 | `Família:` | rótulo | P1 | `fld_family` | Family: |  |
| 95 | apps/web/src/ui/dialogs/TypeDialogHeader.tsx:35 | `Tipo:` | rótulo | P1 | `fld_type` | Type: |  |
| 96 | apps/web/src/ui/dialogs/TypeDialogHeader.tsx:42 | `Duplicar… / Renomear…` | botão | P1 | `dlg_duplicate_rename` | Duplicate… / Rename… |  |
| 97 | apps/web/src/ui/dialogs/TypeParams.tsx:21 | `{rótulo} informado` | aria-label | P2 | `a11y_value_informed` | {label} specified |  |
| 98 | apps/web/src/ui/dialogs/TypeParams.tsx:25 | `não informado` | texto | P1 | `value_not_set` | not set |  |
| 99 | apps/web/src/ui/dialogs/TypeParams.tsx:36 | `Desempenho e custo` | legenda | P1 | `type_params_legend` | Performance and Cost |  |
| 100 | apps/web/src/ui/dialogs/TypeParams.tsx:38 | `Custo` | rótulo de campo | P1 | `fld_cost` | Cost | Tooltip com texto longo em PT |
| 101 | apps/web/src/ui/dialogs/TypeParams.tsx:42 | `Transmitância U / Isolamento Rw / Resistência ao fogo / Fabricante` | rótulo de campo | P1 | `type_params_fields` | U-Factor / Rw Rating / Fire Resistance / Manufacturer | Linhas 42-46 |
| 102 | apps/web/src/ui/dialogs/TypeParams.tsx:47 | `Sistema ou fabricante de referência` | placeholder | P2 | `type_params_manufacturer_ph` | Reference system or manufacturer |  |
| 103 | apps/web/src/ui/dialogs/FloorSectionPreview.tsx:36 | `Seção do piso` | aria-label | P2 | `a11y_floor_section` | Floor section |  |
| 104 | apps/web/src/ui/dialogs/FloorSectionPreview.tsx:46 | `TOPO DO PISO / FACE INFERIOR` | texto em SVG | P2 | `svg_floor_top_bottom` | TOP OF FLOOR / BOTTOM FACE | Linhas 46-47 |
| 105 | apps/web/src/ui/dialogs/FloorSectionPreview.tsx:72 | `núcleo` | texto em SVG | P2 | `svg_core` | core |  |
| 106 | apps/web/src/ui/dialogs/SlabSectionPreview.tsx:36 | `Seção da laje` | aria-label | P2 | `a11y_slab_section` | Slab section |  |
| 107 | apps/web/src/ui/dialogs/SlabSectionPreview.tsx:46 | `TOPO DA LAJE / FACE INFERIOR` | texto em SVG | P2 | `svg_slab_top_bottom` | TOP OF SLAB / BOTTOM FACE | Linhas 46-47 |
| 108 | apps/web/src/ui/dialogs/SlabSectionPreview.tsx:72 | `núcleo` | texto em SVG | P2 | `svg_core` | core |  |
| 109 | apps/web/src/ui/dialogs/RoofSectionPreview.tsx:33 | `Seção do telhado` | aria-label | P2 | `a11y_roof_section` | Roof section |  |
| 110 | apps/web/src/ui/dialogs/RoofSectionPreview.tsx:43 | `TOPO DO TELHADO / FACE INFERIOR` | texto em SVG | P2 | `svg_roof_top_bottom` | TOP OF ROOF / BOTTOM FACE | Linhas 43-44 |
| 111 | apps/web/src/ui/dialogs/SectionPreview.tsx:28 | `Seção da parede` | aria-label | P2 | `a11y_wall_section` | Wall section |  |
| 112 | apps/web/src/ui/dialogs/SectionPreview.tsx:38 | `EXTERIOR / INTERIOR` | texto em SVG | P2 | `svg_wall_faces` | EXTERIOR / INTERIOR | Linhas 38-39 |
| 113 | apps/web/src/ui/dialogs/SectionPreview.tsx:62 | `núcleo` | texto em SVG | P2 | `svg_core` | core |  |
| 114 | apps/web/src/ui/dialogs/ProfilePreview.tsx:33 | `Elevação do topo da parede: altura máxima {h}` | aria-label | P2 | `a11y_wall_profile` | Wall top elevation: maximum height {h} |  |
| 115 | apps/web/src/ui/dialogs/ProfilePreview.tsx:43 | `topo máx. {h}` | texto em SVG | P2 | `svg_top_max` | top max. {h} |  |
| 116 | apps/web/src/ui/dialogs/ProfileDialog.tsx:37 | `Perfil superior` | título de diálogo | P1 | `profile_title` | Top Profile |  |
| 117 | apps/web/src/ui/dialogs/ProfileDialog.tsx:38 | `Comprimento {L} · altura reta {H}` | subtítulo | P1 | `profile_sub` | Length {L} · straight height {H} |  |
| 118 | apps/web/src/ui/dialogs/ProfileDialog.tsx:44 | `Cancelar / OK` | botão | P1 | `dlg_cancel_ok` | Cancel / OK |  |
| 119 | apps/web/src/ui/dialogs/ProfileDialog.tsx:49 | `Predefinições de perfil` | aria-label | P1 | `prof_presets` | Profile presets |  |
| 120 | apps/web/src/ui/dialogs/ProfileDialog.tsx:50 | `Inclinado / Empena (duas águas) / Degrau / Remover perfil` | botão | P1 | `prof_preset_buttons` | Sloped / Gable (two slopes) / Step / Remove profile | Linhas 50-53 |
| 121 | apps/web/src/ui/dialogs/ProfileDialog.tsx:59 | `Posição t / Altura h` | cabeçalho de tabela | P1 | `col_position_height` | Position t / Height h |  |
| 122 | apps/web/src/ui/dialogs/ProfileDialog.tsx:68 | `Excluir ponto {n} / O perfil precisa de ao menos 2 pontos / Excluir ponto` | aria-label | P2 | `a11y_delete_point` | Delete point {n} / The profile needs at least 2 points / Delete point |  |
| 123 | apps/web/src/ui/dialogs/ProfileDialog.tsx:77 | `+ ponto` | botão | P1 | `profile_add_point` | + point |  |
| 124 | apps/web/src/ui/dialogs/ProfileDialog.tsx:80 | `Topo reto. Editar a tabela cria o perfil.` | texto de ajuda | P2 | `profile_straight_hint` | Straight top. Editing the table creates the profile. |  |
| 125 | apps/web/src/ui/dialogs/ProfileDialog.tsx:85 | `Altura máxima / Altura média / Comprimento` | rótulo | P1 | `profile_stats` | Maximum height / Average height / Length | Linhas 85-87 |
| 126 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:55 | `Seção do telhado: altura máxima {h}` | aria-label | P2 | `a11y_roof_section_max` | Roof section: maximum height {h} |  |
| 127 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:65 | `altura máx. {h}` | texto em SVG | P2 | `svg_roof_max` | height max. {h} |  |
| 128 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:105 | `Perfil do telhado` | título de diálogo | P1 | `roof_profile_title` | Roof Profile |  |
| 129 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:106 | `Largura {L} na transversal` | subtítulo | P1 | `roof_profile_sub` | Cross-section width {L} |  |
| 130 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:112 | `Cancelar / OK` | botão | P1 | `dlg_cancel_ok` | Cancel / OK |  |
| 131 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:117 | `Predefinições de perfil` | aria-label | P1 | `prof_presets` | Profile presets |  |
| 132 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:118 | `Arco / Mansarda / Dente de serra / Borboleta / Uma água / Duas águas` | botão | P1 | `roof_preset_buttons` | Arch / Mansard / Sawtooth / Butterfly / Shed / Gable | Linhas 118-123 |
| 133 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:126 | `Altura / Dentes` | rótulo de campo | P1 | `roof_profile_h_dents` | Height / Teeth |  |
| 134 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:135 | `Posição t / Altura z` | cabeçalho de tabela | P1 | `col_position_height_tz` | Position t / Height z |  |
| 135 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:144 | `Excluir ponto {n} / O perfil precisa de ao menos 2 pontos / Excluir ponto` | aria-label | P2 | `a11y_delete_point` | Delete point {n} / The profile needs at least 2 points / Delete point |  |
| 136 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:153 | `+ ponto` | botão | P1 | `profile_add_point` | + point |  |
| 137 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:156 | `t é medido a partir da borda do contorno, na transversal; z é a altura acima do beiral.` | texto de ajuda | P2 | `roof_profile_hint` | t is measured from the boundary edge across the section; z is the height above the eave. |  |
| 138 | apps/web/src/ui/dialogs/RoofProfileDialog.tsx:161 | `Altura máxima / Trechos / Largura` | rótulo | P1 | `roof_profile_stats` | Maximum height / Segments / Width |  |
| 139 | apps/web/src/ui/dialogs/profilePresets.ts:53 | `as posições devem estar entre 0 e o comprimento da parede` | mensagem gerada | P1 | `profile_range_error` | positions must be between 0 and the wall length | Retornada por profileRangeError e exibida em ProfileDialog.tsx:79 |
| 140 | apps/web/src/ui/dialogs/stairTypeForm.ts:161 | `(cópia)` | nome padrão gerado | P1 | `dlg_duplicate_suffix` | (copy) | Sufixo do nome duplicado; idem WallTypeDialog.tsx:75 |
| 141 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:34 | `Padrão` | nome padrão | P1 | `dim_family_default` | Default | Nome da família implícita |
| 142 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:38 | `toLocaleLowerCase('pt-BR')` | formatação | P2 | `locale_lower` | toLocaleLowerCase(lang) | Colisão de nomes sempre em pt-BR; linhas 38 e 42 |
| 143 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:39 | `(cópia) / Nova família` | nome padrão gerado | P1 | `dim_family_copy_new` | (copy) / New family | Linhas 39 e 42 |
| 144 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:72 | `Família: {erro}` | mensagem gerada | P1 | `dim_family_error` | Family: {error} | Erro de dimensionFamilyIssue (PT no modelo) |
| 145 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:75 | `Famílias de cotas` | rótulo de undo | P2 | `dim_families_undo` | Dimension families | Rótulo do passo de desfazer |
| 146 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:118 | `Famílias de cotas` | título de diálogo | P1 | `dim_families_title` | Dimension Families |  |
| 147 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:119 | `Aparência nomeada das cotas: marcador, texto, leitura e formato. A família escolhida na barra é a da cota nova.` | subtítulo | P1 | `dim_families_sub` | Named dimension appearance: tick mark, text, reading and format. The family chosen in the bar is used for new dimensions. |  |
| 148 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:125 | `Duplicar / Nova / Excluir / Cancelar / OK` | botão | P1 | `dlg_list_crud` | Duplicate / New / Delete / Cancel / OK | Linhas 125-134 |
| 149 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:127 | `A família Padrão é o estilo do projeto e não pode ser excluída / Excluir a família` | atributo title | P1 | `dim_family_delete_tip` | The Default family is the project style and cannot be deleted / Delete family |  |
| 150 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:139 | `Famílias de cotas` | aria-label | P2 | `a11y_dim_families` | Dimension families |  |
| 151 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:149 | `(sem nome) / padrão` | texto | P2 | `dim_family_unnamed_default` | (unnamed) / default | Linhas 149-150 |
| 152 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:158 | `Nome / Padrão do projeto / Usar esta família nas cotas novas` | rótulo de campo | P1 | `dim_family_name_default` | Name / Project Default / Use this family for new dimensions | Linhas 158-162 |
| 153 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:164 | `A família Padrão é o estilo global do projeto (Cotas do projeto › Estilo das cotas). / Família nomeada: mudar aqui não afeta as outras.` | texto de ajuda | P2 | `dim_family_help` | The Default family is the global project style (Project Dimensions › Dimension Style). / Named family: changes here do not affect the others. |  |
| 154 | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx:165 | `Marcador / Tamanho do marcador / Posição do texto / Leitura do valor / Folga do texto até a linha / Altura do texto / Fonte / Folga da linha de extensão / Ultrapassagem da linha de extensão / Espaçamento entre cotas empilhadas / Quando o valor não cabe / Unidade / Precisão / Prefixo / Sufixo` | rótulo de campo | P1 | `dim_family_fields` | Tick Mark / Tick Mark Size / Text Position / Read Convention / Text Gap to Line / Text Height / Font / Extension Line Gap / Extension Line Overshoot / Stacked Dimension Spacing / When Value Does Not Fit / Unit / Precision / Prefix / Suffix | Linhas 165-185 |
| 155 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:152 | `Cotas do projeto` | título de diálogo | P1 | `dim_settings_title` | Project Dimensions |  |
| 156 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:153 | `Referências das cotas dinâmicas que aparecem ao colocar e ao selecionar / Estilo global das cotas: marcador, texto, linhas de extensão e formato` | subtítulo | P1 | `dim_settings_sub` | References for temporary dimensions shown on placement and selection / Global dimension style: tick mark, text, extension lines and format |  |
| 157 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:162 | `Restaurar padrões / Restaurar padrão` | botão | P1 | `restore_defaults` | Restore Defaults / Restore Default | Linhas 162-163 |
| 158 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:164 | `Famílias de cotas…` | botão | P1 | `dim_families_title` | Dimension Families… |  |
| 159 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:166 | `Cancelar / OK` | botão | P1 | `dlg_cancel_ok` | Cancel / OK |  |
| 160 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:172 | `Referências / Estilo das cotas` | aba | P1 | `dim_tabs` | References / Dimension Style |  |
| 161 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:179 | `Referência de paredes / Referência de portas e janelas / Mostrar ao colocar / Mostrar ao selecionar` | rótulo de campo | P1 | `dim_ref_fields` | Wall Reference / Door and Window Reference / Show on Placement / Show on Selection | Linhas 179-199 |
| 162 | apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx:207 | `Marcador / Tamanho do marcador (mm) / Altura do texto (mm) / Fonte / Folga da linha de extensão (mm) / Ultrapassagem da linha de extensão (mm) / Folga do texto até a linha (mm) / Posição do texto / Leitura do valor / Quando o valor não cabe / Linha de chamada quando não cabe / Espaçamento entre cotas empilhadas (mm) / Unidade / Precisão / Prefixo / Sufixo` | rótulo de campo | P1 | `dim_style_fields` | Tick Mark / Tick Mark Size (mm) / Text Height (mm) / Font / Extension Line Gap (mm) / Extension Line Overshoot (mm) / Text Gap to Line (mm) / Text Position / Read Convention / When Value Does Not Fit / Leader Line When It Does Not Fit / Stacked Dimension Spacing (mm) / Unit / Precision / Prefix / Suffix | Linhas 207-230 |
| 163 | apps/web/src/ui/dialogs/dimensionStyleModel.ts:28 | `Traço (45°) / Seta cheia / Seta aberta / Ponto` | rótulo de opção | P1 | `dim_tick_options` | Slash (45°) / Filled Arrow / Open Arrow / Dot | DIM_TICK_OPTIONS; linhas 28-31 |
| 164 | apps/web/src/ui/dialogs/dimensionStyleModel.ts:35 | `Acima da linha / Centrado (interrompe a linha)` | rótulo de opção | P1 | `dim_text_placement` | Above Line / Centered (interrupts line) |  |
| 165 | apps/web/src/ui/dialogs/dimensionStyleModel.ts:46 | `Unidade do projeto / Metros (m) / Centímetros (cm) / Milímetros (mm)` | rótulo de opção | P2 | `dim_unit_options` | Project Units / Meters (m) / Centimeters (cm) / Millimeters (mm) |  |
| 166 | apps/web/src/ui/dialogs/dimensionStyleModel.ts:53 | `0 casas / 1 casa / 2 casas / 3 casas` | rótulo de opção | P2 | `dim_precision_options` | 0 places / 1 place / 2 places / 3 places |  |
| 167 | apps/web/src/ui/dialogs/dimensionStyleModel.ts:102 | `Digite um número / Entre {min} e {max}` | mensagem de validação | P1 | `dim_err_number` | Enter a number / Between {min} and {max} | Linhas 102-103 |
| 168 | apps/web/src/ui/dialogs/dimensionStyleModel.ts:114 | `Marcador desconhecido / Posição desconhecida / Convenção desconhecida / Comportamento desconhecido / Unidade desconhecida / Precisão fora de 0 a 3 / Informe a fonte / Até {n} caracteres` | mensagem de validação | P1 | `dim_err_enum` | Unknown tick mark / Unknown position / Unknown convention / Unknown behavior / Unknown unit / Precision out of 0-3 / Enter the font / Up to {n} characters | Linhas 114-123 |
| 169 | apps/web/src/ui/dialogs/dimensionStyleModel.ts:89 | `replace('.', ',')` | formatação | P2 | `locale_decimal_sep` | lang === 'en' ? '.' : ',' | formatDecimal e formatDimValue fixam vírgula; linhas 89, 91 e 97 |
| 170 | apps/web/src/ui/dialogs/dimensionStylePreview.tsx:46 | `Prévia: cota de {valor}` | aria-label | P2 | `a11y_dim_preview` | Preview: dimension of {value} |  |
| 171 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:32 | `Pesos de linha` | título de diálogo | P1 | `lw_title` | Line Weights |  |
| 172 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:33 | `Projeto · padrão do Revit, com a escolha do Hestia por categoria` | subtítulo | P1 | `lw_sub` | Project · Revit default, with Hestia's choice per category |  |
| 173 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:38 | `Restaurar padrão / Fechar` | botão | P1 | `restore_default_close` | Restore Default / Close |  |
| 174 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:44 | `Largura da linha por peso (mm de papel) / Peso por categoria (1 a 16) / Nível de detalhe por escala` | título de seção | P1 | `lw_sections` | Line Width by Weight (paper mm) / Weight by Category (1 to 16) / Detail Level by Scale | Linhas 44, 66 e 97 |
| 175 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:45 | `Tabela de pesos de linha / Pesos de corte e projeção por categoria` | aria-label | P2 | `a11y_lw_tables` | Line weights table / Cut and projection weights by category | Linhas 45 e 67 |
| 176 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:48 | `Peso / Categoria / Corte / Projeção` | cabeçalho de tabela | P1 | `col_weight_category_cut_projection` | Weight / Category / Cut / Projection | Linhas 48, 70-72 |
| 177 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:84 | `Corte de {categoria} / Projeção de {categoria}` | aria-label | P2 | `a11y_cut_projection` | Cut of {category} / Projection of {category} |  |
| 178 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:99 | `Fino até a escala 1: / Médio até a escala 1:` | rótulo de campo | P1 | `lw_detail_limits` | Fine up to scale 1: / Medium up to scale 1: | Linhas 99 e 103 |
| 179 | apps/web/src/ui/dialogs/LineWeightsDialog.tsx:106 | `Acima do médio, o detalhe é grosso. Os valores são escalas (denominadores): 50 = 1:50.` | texto de ajuda | P2 | `lw_help` | Above medium the detail is coarse. Values are scale denominators: 50 = 1:50. |  |
| 180 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:8 | `Sem hachura / Diagonal / Cruzada / Pontos / Sólida` | constante de módulo | P1 | `hatch_options` | None / Diagonal / Cross / Dots / Solid | HATCHES fora do i18n; usado na aba Gráficos |
| 181 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:19 | `localeCompare(..., 'pt-BR')` | formatação | P2 | `locale_compare` | localeCompare(name, lang) | Ordenação fixa em pt-BR |
| 182 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:38 | `(cópia)` | nome padrão gerado | P1 | `dlg_duplicate_suffix` | (copy) |  |
| 183 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:39 | `Novo material` | nome padrão gerado | P1 | `mat_new_default` | New Material |  |
| 184 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:46 | `Navegador de materiais` | título de diálogo | P1 | `mat_browser_title` | Material Browser |  |
| 185 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:47 | `{n} materiais` | subtítulo | P1 | `mat_count` | {n} materials |  |
| 186 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:54 | `Usar este material / Cancelar / Fechar` | botão | P1 | `mat_use_cancel_close` | Use This Material / Cancel / Close | Linhas 54 e 56 |
| 187 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:62 | `Buscar material` | placeholder | P1 | `mat_search` | Search material | Também aria-label |
| 188 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:72 | `+ Novo / Duplicar` | botão | P1 | `dlg_new_duplicate` | + New / Duplicate |  |
| 189 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:78 | `Nome / Aparência / Gráficos / Físico` | rótulo e aba | P1 | `mat_fields` | Name / Appearance / Graphics / Physical | Linhas 78-79 |
| 190 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:82 | `Cor / Brilho / Opacidade / Hachura de corte / Custo / Unidade` | rótulo de campo | P1 | `mat_appearance_fields` | Color / Gloss / Opacity / Cut Hatch / Cost / Unit | Linhas 82-99 |
| 191 | apps/web/src/ui/dialogs/MaterialsDialog.tsx:110 | `Usado em {n} lugares. Alterar o material muda todos os tipos que o usam.` | texto de ajuda | P1 | `mat_usage` | Used in {n} places. Changing the material changes every type that uses it. |  |
| 192 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:18 | `Nova categoria` | nome padrão gerado | P1 | `rc_new_default` | New Category |  |
| 193 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:24 | `Não foi possível excluir a categoria.` | mensagem gerada | P1 | `rc_err_delete` | Could not delete the category. |  |
| 194 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:29 | `Categorias de ambiente` | título de diálogo | P1 | `rc_title` | Room Categories |  |
| 195 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:30 | `Nome, código, cor e hachura; a cor entra na planta de área quando o esquema é Por categoria` | subtítulo | P1 | `rc_sub` | Name, code, color and hatch; the color appears in the area plan when the scheme is By Category |  |
| 196 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:33 | `Nova categoria / Fechar` | botão | P1 | `rc_new_close` | New Category / Close |  |
| 197 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:37 | `Cor / Nome / Código / Hachura` | cabeçalho de tabela | P1 | `col_color_name_code_hatch` | Color / Name / Code / Hatch |  |
| 198 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:42 | `Cor de {nome} / Nome de {nome} / Código de {nome} / Hachura de {nome}` | aria-label | P2 | `a11y_rc_fields` | Color of {name} / Name of {name} / Code of {name} / Hatch of {name} | Linhas 42-46 |
| 199 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:47 | `Sem hachura / Diagonal / Cruzada / Pontilhada / Cheia` | rótulo de opção | P1 | `rc_hatch_options` | None / Diagonal / Cross / Dotted / Solid |  |
| 200 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:50 | `Excluir` | botão | P1 | `dlg_delete` | Delete | Tooltip "Excluir categoria" |
| 201 | apps/web/src/ui/dialogs/RoomCategoriesDialog.tsx:55 | `Excluir uma categoria em uso é recusado. A cor da categoria também aparece na legenda e no IFC.` | texto de ajuda | P2 | `rc_help` | Deleting a category in use is refused. The category color also appears in the legend and in IFC. |  |
| 202 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:20 | `do projeto / Definir / Do projeto` | texto e botão | P1 | `vis_project_value` | from project / Set / From project | Linhas 20, 21 e 28 |
| 203 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:27 | `Cor de {categoria} / Definir cor de {categoria}` | aria-label | P2 | `a11y_vis_color` | Color of {category} / Set color of {category} | Linhas 21 e 27 |
| 204 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:56 | `Visibilidade e gráficos` | título de diálogo | P1 | `vis_title` | Visibility and Graphics |  |
| 205 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:57 | `Modelo 3D / Corte/elevação / Planta · {nível}` | subtítulo | P1 | `vis_sub` | 3D View / Section/Elevation / Plan · {level} |  |
| 206 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:60 | `Fechar` | botão | P1 | `dlg_close` | Close |  |
| 207 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:62 | `Visibilidade e gráficos por categoria` | aria-label | P2 | `a11y_vis_table` | Visibility and graphics by category |  |
| 208 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:65 | `Categoria / Visível / Transparência / Meio-tom / Peso de corte / Peso de projeção / Cor` | cabeçalho de tabela | P1 | `col_vis_headers` | Category / Visible / Transparency / Halftone / Cut Weight / Projection Weight / Color |  |
| 209 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:82 | `Peso de corte de {categoria} / Peso de projeção de {categoria}` | aria-label | P2 | `a11y_vis_weight` | Cut weight of {category} / Projection weight of {category} |  |
| 210 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:86 | `Do projeto ({valor})` | rótulo de opção | P1 | `vis_project_value` | From project ({value}) |  |
| 211 | apps/web/src/ui/dialogs/GraphicsVisibilityDialog.tsx:112 | `Transparência: 0% opaco, 100% invisível. Meio-tom clareia a categoria. Vazio (Do projeto) usa o peso e a cor do projeto.` | texto de ajuda | P2 | `vis_help` | Transparency: 0% opaque, 100% invisible. Halftone lightens the category. Empty (From project) uses the project weight and color. |  |
| 212 | apps/web/src/ui/dialogs/StripsTab.tsx:8 | `Externo / Interno` | constante de módulo | P1 | `strip_sides` | Exterior / Interior |  |
| 213 | apps/web/src/ui/dialogs/StripsTab.tsx:11 | `Rodapé 10 cm / Barra de azulejo 1,50 m / Friso externo` | nome de preset | P1 | `strip_presets` | Baseboard 10 cm / Tile band 1.50 m / Exterior band | PRESETS e nomes padrão (Rodapé, Barra de azulejo, Friso); linhas 11-13 |
| 214 | apps/web/src/ui/dialogs/StripsTab.tsx:18 | `a altura final deve ser maior que a inicial. / a espessura deve ser maior que zero.` | mensagem de validação | P1 | `strip_err` | ending height must be greater than the starting height. / thickness must be greater than zero. | Linhas 18-19 |
| 215 | apps/web/src/ui/dialogs/StripsTab.tsx:36 | `Faixa` | nome padrão gerado | P1 | `strip_new_default` | Strip |  |
| 216 | apps/web/src/ui/dialogs/StripsTab.tsx:40 | `Faixas ficam fora da espessura da parede, entre as alturas indicadas. O rodapé só aparece em planta se atravessar o plano de corte (1,20 m); no 3D e nos quantitativos sempre aparece.` | texto de ajuda | P2 | `strip_help` | Strips sit outside the wall thickness between the given heights. The baseboard appears in plan only if it crosses the cut plane (1.20 m); in 3D and quantities it always appears. |  |
| 217 | apps/web/src/ui/dialogs/StripsTab.tsx:42 | `Presets de faixa` | aria-label | P2 | `a11y_strip_presets` | Strip presets |  |
| 218 | apps/web/src/ui/dialogs/StripsTab.tsx:50 | `Nome / Lado / Material / Espessura (cm) / Altura inicial (cm) / Altura final (cm)` | cabeçalho de tabela | P1 | `col_strip_headers` | Name / Side / Material / Thickness (cm) / Start Height (cm) / End Height (cm) |  |
| 219 | apps/web/src/ui/dialogs/StripsTab.tsx:54 | `Nenhuma faixa neste tipo.` | texto de estado vazio | P1 | `strip_empty` | No strips in this type. |  |
| 220 | apps/web/src/ui/dialogs/StripsTab.tsx:64 | `Lado da faixa {n} / Remover faixa {n}` | aria-label | P2 | `a11y_strip_side` | Strip {n} side / Remove strip {n} | Linhas 64 e 79 |
| 221 | apps/web/src/ui/dialogs/StripsTab.tsx:84 | `Faixa {n}: {erro}` | mensagem de validação | P1 | `strip_row_error` | Strip {n}: {error} |  |
| 222 | apps/web/src/ui/dialogs/StripsTab.tsx:94 | `+ Adicionar faixa` | botão | P1 | `strip_add` | + Add Strip |  |
| 223 | apps/web/src/ui/dialogs/coreHint.ts:12 | `Sem camadas: não há núcleo. / Sem camada Estrutura: o núcleo é o elemento inteiro. / Núcleo: camadas {a} a {b}, de {x} a {y} {unidade} da {face}.` | mensagem gerada | P2 | `core_hint_text` | No layers: there is no core. / No Structure layer: the whole element is the core. / Core: layers {a} to {b}, from {x} to {y} {unit} from the {face}. | Linhas 12, 14 e 20; exibido em FloorTypeDialog.tsx:161 e SlabTypeDialog.tsx:161 |
| 224 | apps/web/src/ui/typeFamilies.ts:5 | `Parede básica / Piso / Laje / Forro / Telhado / Escada` | nome de família | P1 | `family_names` | Basic Wall / Floor / Slab / Ceiling / Roof / Stair | FAMILY avaliada uma vez; exibida por TypeDialogHeader.tsx:33 |
| 225 | packages/model/src/priority.ts:17 | `Estrutura / Substrato / Isolamento / Membrana / Acabamento 1 / Acabamento 2` | rótulo de opção | P1 | `layer_function_labels` | Structure / Substrate / Insulation / Membrane / Finish 1 / Finish 2 | FUNCTION_LABEL usado nas opções de camada de todos os TypeDialog |
| 226 | apps/web/src/ui/graphicsLabels.ts:5 | `Parede / Porta / Janela / Piso / Laje / Telhado / Escada / Ambiente / Anotação / Objeto importado` | rótulo de categoria | P1 | `category_labels` | Walls / Doors / Windows / Floors / Slabs / Roofs / Stairs / Rooms / Annotation / Imported Object | CATEGORY_LABEL usado em LineWeightsDialog e GraphicsVisibilityDialog |
| 227 | packages/model/src/dimensionFamily.ts:28 | `Acompanha a cota (legível por baixo) / Acompanha a cota (nunca de cabeça para baixo) / Sempre horizontal` | rótulo de opção | P1 | `dim_read_conventions` | Aligned (readable from below) / Aligned (never upside down) / Always horizontal | DIM_READ_CONVENTION_OPTIONS; linhas 28-30 e 35-37 (text fit) |
| 228 | apps/web/src/ui/gridUi.ts:13 | `Contínuo (linha inteira) / Nenhum (só as pontas) / Personalizado (centro próprio) / Contínuo / Tracejado / Traço-ponto` | rótulo de opção | P1 | `grid_segment_pattern` | Continuous (full line) / None (ends only) / Custom (own center) / Solid / Dashed / Dash-dot | SEGMENT_LABEL (13) e PATTERN_LABEL (19); exibidos em GridTypeDialog.tsx:104,110 |
| 229 | apps/web/src/ui/gridUi.ts:39 | `(cópia)` | nome padrão gerado | P1 | `dlg_duplicate_suffix` | (copy) | Sufixo ao duplicar tipo de grade |

## Mistura PT/EN no mesmo arquivo

- `apps/web/src/ui/dialogs/RampTypeDialog.tsx` — usa `t.ramp_type_title`, `t.ramp_norm_verified`, `t.ramp_norm_unverified`, mas o título começa com `Propriedades ·` (90), o subtítulo e todos os campos seguem em PT. `PROFILE_LABEL` (21) tem `Personalizado` fixo e `NBR 9050`/`ADA` corretos.
- `apps/web/src/ui/dialogs/StairTypeDialog.tsx` — `stt_title`, `stt_*` nos botões/seções, porém três mensagens de status em PT (134, 176, 192).
- `apps/web/src/ui/dialogs/rampSectionDrawing.ts` — `RAMP_DRAWING_TEXT` é bilíngue, mas a legenda usa ternário inline PT/EN (203) para remover o trecho do lance 2.
- `apps/web/src/ui/dialogs/stairSectionDrawing.ts` — `STAIR_DRAWING_TEXT` bilíngue, mas `defaultFmt` (77) usa vírgula fixa quando o chamador não passa `fmt`.
- `apps/web/src/ui/dialogs/TypeDialogHeader.tsx` — rótulos PT ("Família:", "Tipo:", "Duplicar…") + valores de família PT (`typeFamilies.ts:5-10`).
- `apps/web/src/ui/dialogs/MaterialsDialog.tsx` — diálogo todo PT, mas os nomes de material e as unidades `m²/m³` são dados do usuário (não traduzem).
- `apps/web/src/ui/dialogs/DimensionSettingsDialog.tsx` / `DimensionFamiliesDialog.tsx` — campos PT, mas `READ_CONVENTION_OPTIONS` e `TEXT_FIT_OPTIONS` vêm do modelo também em PT (`dimensionFamily.ts:27-38`): traduzir só no diálogo deixaria os selects parcialmente traduzidos.

## Riscos / testes que quebram

- `apps/web/src/ui/dialogs/coreHint.test.ts:11,16,21,26,30,36` — compara o texto PT exato de `coreHint` (inclusive unidade mm na linha 36).
- `apps/web/src/ui/dialogs/rampSectionDrawing.test.ts:53,56,69` — espera `máx.`, `Pé-direito livre mín.`, `a conferir` no desenho.
- `apps/web/src/ui/dialogs/stairSectionDrawing.test.ts:67,70,71,131,148,174` — espera `Piso`, `Espessura estrutural`, `Pé-direito livre mín.`, `Sobreposição`, `Piso inferior`.
- `apps/web/src/ui/dialogs/stairTypeForm.test.ts:100` — espera `Base (cópia)`.
- `apps/web/src/ui/dialogs/dimensionSettingsModel.test.ts:24,25` — espera rótulos PT de `WALL_OPTIONS`/`OPENING_OPTIONS` (vindos do modelo).
- `apps/web/src/ui/dialogs/dimensionStyleModel.test.ts:115,120,121` — espera vírgula decimal (`2,5`, `3,50`); muda se o separador seguir o idioma.
- `apps/web/src/ui/dialogs/StairBlondelCard.test.ts:48` — exige paridade de chaves `I18N.pt`/`I18N.en`; toda chave nova precisa entrar nos dois dicionários.
- `apps/web/src/ui/dialogs/stairFieldVisibility.test.ts:64` — já espera a **chave** (`stt_f_material_pisos`), não o texto; é o padrão a seguir.

## Já correto

- `apps/web/src/ui/dialogs/StairTypeSections.tsx` — 100% por chave, inclusive limites/erros via `stairIssueText`.
- `apps/web/src/ui/dialogs/StairBlondelCard.tsx` — 100% por chave + `fmtNum(..., lang)`.
- `apps/web/src/ui/dialogs/StairCalculatorPanel.tsx` — 100% por chave + `fmtNum(..., lang)`.
- `apps/web/src/ui/dialogs/StairSectionPreview.tsx` — 100% por chave, `useMemo` com `lang` nas dependências.
- `apps/web/src/ui/dialogs/RampSectionPreview.tsx` — `TEXT.pt`/`TEXT.en` local, `lang` nas dependências.
- `apps/web/src/ui/dialogs/stairSectionDrawing.ts` — `STAIR_DRAWING_TEXT` PT/EN completo.
- `apps/web/src/ui/dialogs/rampSectionDrawing.ts` — `RAMP_DRAWING_TEXT` PT/EN completo (exceto o ternário da linha 203).
- `apps/web/src/ui/dialogs/stairBlondel.ts` e `stairTypeCalc.ts` — sem texto de UI; só números e códigos.
- `apps/web/src/ui/dialogs/dimensionSettingsModel.ts` — sem strings próprias; apenas herda rótulos PT do modelo.
