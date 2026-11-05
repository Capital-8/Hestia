# 06 — Tabelas de quantitativos (dialogs *ScheduleDialog, colunas e CSV)

- Escopo: `apps/web/src/ui/dialogs/*ScheduleDialog.tsx`, `apps/web/src/ui/dialogs/scheduleUnits.ts`, `apps/web/src/editor/i18nTabelas.ts`, árvore de tabelas de `apps/web/src/ui/browser/Views.tsx` e geração de CSV em `packages/engine/src/*Schedule.ts`
- Arquivos analisados: 30 (24 com ocorrências)
- Ocorrências: 79 (P0: 0, P1: 30, P2: 49)

## Resumo executivo
Os 9 diálogos de tabela são a parte mais bem traduzida do programa: título, colunas, filtros, vazios, rodapés e botões usam `I18N[useI18n(...)]` de forma reativa, e as listas `COLS` guardam `labelKey` (não congelam idioma). O que continua em PT está nas bordas desse fluxo:

1. **A exportação CSV inteira é PT** — cabeçalhos, "Total", categoria Porta/Janela e rótulo de forma de telhado são montados no engine (`packages/engine/src/*Schedule.ts`), que não conhece `I18N`. É o maior buraco da área.
2. **A árvore do navegador que abre as tabelas** (`Views.tsx:235-256`) não importa `useI18n`: os 9 nomes e o nó "Tabelas/Quantidades (todas)" ficam em PT mesmo com o diálogo abrindo em EN.
3. **Células geradas no engine**: "Sentido" e "Ferragens" do quadro de portas/janelas são frases PT ("dobradiça invertida, abre à esquerda de a→b", "maçaneta a…, 3 dobradiças…").
4. **Unidades duplicadas/erradas**: `col_riser_height` e `col_tread` já trazem "(m)" e recebem `scheduleHeader`, gerando "(m) (m)"; `col_layers` fixa "(cm)"; a Rampa não converte unidades e fixa m²/m³.
5. **Pluralização e locale**: o subtítulo usa sempre o plural ("1 de 1 paredes") e toda ordenação de texto é `pt-BR`.

Não há chave `sched_*`/`col_*` usada que falte no dicionário (paridade PT/EN 135/135), mas `schedules` existe e não é usada.

## Causas-raiz
- CSV montado no engine, sem i18n: `packages/engine/src/schedule.ts:117-129`, `floorSchedule.ts:96-106`, `slabSchedule.ts:93-105`, `ceilingSchedule.ts:89-101`, `openingSchedule.ts:295-317`, `roofSchedule.ts:120-134`, `stairSchedule.ts:98-110`, `rampSchedule.ts:96-109`, `roomSchedule.ts:110-121`.
- Células PT geradas no engine: `openingSchedule.ts:110` (sentido), `:116-126` (ferragens), `:136` + `:185-202` (composição), `roofSchedule.ts:7-14` (forma).
- Árvore de tabelas sem i18n: `apps/web/src/ui/browser/Views.tsx:235-256` (não importa `useI18n`; `labels` fixos e plural por `'s'`).
- Unidade no texto da chave + `scheduleHeader` concatenando unidade: `i18nTabelas.ts:86,103-106`; uso em `StairScheduleDialog.tsx:30-31` e `:129`.
- Rampa fora do padrão dos outros quadros: `RampScheduleDialog.tsx:18-31` (sem `quantity`), `:39-40` (`toLocaleString` próprio), `:86` (CSV sem `units`), `:152-153` (m²/m³ fixos), `rampSchedule.ts:112`.
- Formatação presa às unidades do projeto, não ao idioma: `packages/model/src/unitsFormat.ts:67` usa `u.decimalSymbol` (padrão `,`); `csv.ts:9,14` fixa `;` e vírgula.
- Pluralização manual: subtítulo `${t.sched_of}` + substantivo plural em todos os diálogos; `sched_noun_opening` serve a dois sentidos.
- Chave existente não usada: `i18n.ts:115` (`schedules`), enquanto `Views.tsx:250` escreve outro texto à mão.

## Inventário
| # | Arquivo:linha | Texto atual | Tipo | Sev. | Chave proposta | EN proposto | Nota |
|---|---|---|---|---|---|---|---|
| 1 | apps/web/src/ui/browser/Views.tsx:239 | `Tabela de ambientes` | JSX label | P1 | sched_title_room | Room Schedule | árvore que abre os quadros não importa useI18n; o diálogo abre em EN e a lista fica em PT |
| 2 | apps/web/src/ui/browser/Views.tsx:240 | `Tabela de escadas` | JSX label | P1 | sched_title_stair | Stair Schedule | mesmo array `rows` (238-248) todo em PT |
| 3 | apps/web/src/ui/browser/Views.tsx:241 | `Tabela de rampas` | JSX label | P1 | sched_title_ramp | Ramp Schedule | idem |
| 4 | apps/web/src/ui/browser/Views.tsx:242 | `Tabela de forros` | JSX label | P1 | sched_title_ceiling | Ceiling Schedule | idem |
| 5 | apps/web/src/ui/browser/Views.tsx:243 | `Tabela de lajes` | JSX label | P1 | sched_title_slab | Slab Schedule | idem |
| 6 | apps/web/src/ui/browser/Views.tsx:244 | `Tabela de paredes` | JSX label | P1 | sched_title_wall | Wall Schedule | idem; dialog interno é `schedule` |
| 7 | apps/web/src/ui/browser/Views.tsx:245 | `Tabela de pisos` | JSX label | P1 | sched_title_floor | Floor Schedule | idem |
| 8 | apps/web/src/ui/browser/Views.tsx:246 | `Tabela de portas e janelas` | JSX label | P1 | sched_title_opening | Door and Window Schedule | idem |
| 9 | apps/web/src/ui/browser/Views.tsx:247 | `Tabela de telhados` | JSX label | P1 | sched_title_roof | Roof Schedule | idem |
| 10 | apps/web/src/ui/browser/Views.tsx:250 | `Tabelas/Quantidades (todas)` | JSX label | P1 | schedules | Schedules / Quantities | a chave já existe em i18n.ts:115 com outro texto; aqui está fixo e diverge do dicionário |
| 11 | apps/web/src/ui/browser/Views.tsx:253 | `${r.n} elemento${r.n === 1 ? '' : 's'}. Duplo clique abre.` | template de texto | P1 | browser_sched_count | {n} element(s). Double-click to open. | pluralização por sufixo "s" e frase PT no title do nó |
| 12 | apps/web/src/ui/browser/Views.tsx:253 | `Abrir` | menu de contexto | P2 | btn_open | Open | chave já existe (i18n.ts:122); compartilhado com outras árvores |
| 13 | apps/web/src/ui/dialogs/Dialog.tsx:93 | `Fechar` | atributo aria-label | P1 | stt_close | Close | botão ✕ de todos os 9 quadros; não existe `btn_close` genérico — `stt_close` (i18n.ts:291) é o texto idêntico disponível |
| 14 | apps/web/src/editor/saveText.ts:11 | `Salvo como ${filename}.` | status/toast | P1 | export_saved | Saved as {file}. | mensagem exibida no rodapé da tabela e na barra de status; linhas 12, 13, 16 e 18 também são PT fixo |
| 15 | apps/web/src/ui/dialogs/WallScheduleDialog.tsx:84 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | fallback do nome; linha 85 monta `${base}-paredes.csv` (sufixo PT) |
| 16 | apps/web/src/ui/dialogs/FloorScheduleDialog.tsx:81 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 82: `${base}-pisos.csv` |
| 17 | apps/web/src/ui/dialogs/SlabScheduleDialog.tsx:85 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 86: `${base}-lajes.csv` |
| 18 | apps/web/src/ui/dialogs/CeilingScheduleDialog.tsx:83 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 84: `${base}-forros.csv` |
| 19 | apps/web/src/ui/dialogs/RoofScheduleDialog.tsx:92 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 93: `${base}-telhados.csv` |
| 20 | apps/web/src/ui/dialogs/StairScheduleDialog.tsx:84 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 85: `${base}-escadas.csv` |
| 21 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:85 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 86: `${base}-rampas.csv` |
| 22 | apps/web/src/ui/dialogs/RoomScheduleDialog.tsx:77 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 78: `${base}-ambientes.csv` |
| 23 | apps/web/src/ui/dialogs/OpeningScheduleDialog.tsx:91 | `'projeto'` | nome de arquivo | P2 | csv_default_project | project | linha 92: `${base}-portas-e-janelas.csv` |
| 24 | apps/web/src/ui/dialogs/WallScheduleDialog.tsx:93 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_wall}` | pluralização | P2 | sched_sub_count | {shown} of {total} walls | usa sempre o plural: com 1 linha sai "1 de 1 paredes" / "1 of 1 walls" |
| 25 | apps/web/src/ui/dialogs/FloorScheduleDialog.tsx:90 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_floor}` | pluralização | P2 | sched_sub_count | {shown} of {total} floors | mesmo padrão |
| 26 | apps/web/src/ui/dialogs/SlabScheduleDialog.tsx:94 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_slab}` | pluralização | P2 | sched_sub_count | {shown} of {total} slabs | mesmo padrão |
| 27 | apps/web/src/ui/dialogs/CeilingScheduleDialog.tsx:92 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_ceiling}` | pluralização | P2 | sched_sub_count | {shown} of {total} ceilings | mesmo padrão |
| 28 | apps/web/src/ui/dialogs/RoofScheduleDialog.tsx:101 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_roof}` | pluralização | P2 | sched_sub_count | {shown} of {total} roofs | mesmo padrão |
| 29 | apps/web/src/ui/dialogs/StairScheduleDialog.tsx:93 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_stair}` | pluralização | P2 | sched_sub_count | {shown} of {total} stairs | mesmo padrão |
| 30 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:94 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_ramp}` | pluralização | P2 | sched_sub_count | {shown} of {total} ramps | mesmo padrão |
| 31 | apps/web/src/ui/dialogs/RoomScheduleDialog.tsx:86 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_room}` | pluralização | P2 | sched_sub_count | {shown} of {total} rooms | mesmo padrão |
| 32 | apps/web/src/ui/dialogs/OpeningScheduleDialog.tsx:100 | `${visible.length} ${t.sched_of} ${schedule.rows.length} ${t.sched_noun_opening}` | pluralização | P2 | sched_sub_count | {shown} of {total} types | mesmo padrão |
| 33 | apps/web/src/ui/dialogs/WallScheduleDialog.tsx:46 | `localeCompare(String(y), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | ordem alfabética de marcas/tipos/níveis fixa em pt-BR; o sort de tipos em :68 repete |
| 34 | apps/web/src/ui/dialogs/FloorScheduleDialog.tsx:43 | `localeCompare(String(y), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | sort de tipos em :65 repete |
| 35 | apps/web/src/ui/dialogs/SlabScheduleDialog.tsx:47 | `localeCompare(String(y), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | sort de tipos em :69 repete |
| 36 | apps/web/src/ui/dialogs/CeilingScheduleDialog.tsx:45 | `localeCompare(String(y), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | sort de tipos em :67 repete |
| 37 | apps/web/src/ui/dialogs/RoofScheduleDialog.tsx:47 | `localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | sort de tipos em :76 repete |
| 38 | apps/web/src/ui/dialogs/StairScheduleDialog.tsx:45 | `localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | sort de tipos em :68 repete |
| 39 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:45 | `localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | sort de tipos em :69 repete |
| 40 | apps/web/src/ui/dialogs/RoomScheduleDialog.tsx:45 | `localeCompare(String(y), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | mesmo padrão |
| 41 | apps/web/src/ui/dialogs/OpeningScheduleDialog.tsx:55 | `localeCompare(String(y ?? ''), 'pt-BR', { numeric: true })` | ordenação/locale | P2 | — | — | mesmo padrão; o engine também ordena com pt-BR em openingSchedule.ts:210-212 |
| 42 | packages/engine/src/schedule.ts:118 | `Marca` | cabeçalho CSV | P1 | col_mark | Mark | array csvHeader (118-129) inteiro em PT; "Área de vãos" (:125) diverge de col_openings_area ("Vãos") |
| 43 | packages/engine/src/floorSchedule.ts:97 | `Marca` | cabeçalho CSV | P1 | col_mark | Mark | csvHeader (96-106) inteiro em PT |
| 44 | packages/engine/src/slabSchedule.ts:94 | `Marca` | cabeçalho CSV | P1 | col_mark | Mark | csvHeader (93-105) em PT; ordem do CSV põe Inclinação depois de Volume, diferente da tabela |
| 45 | packages/engine/src/ceilingSchedule.ts:90 | `Marca` | cabeçalho CSV | P1 | col_mark | Mark | csvHeader (89-101) inteiro em PT |
| 46 | packages/engine/src/openingSchedule.ts:296 | `Código` | cabeçalho CSV | P1 | col_code | Code | csvHeader (295-317) inteiro em PT |
| 47 | packages/engine/src/openingSchedule.ts:332 | `r.kind === 'door' ? 'Porta' : 'Janela'` | célula CSV | P1 | sched_kind_door | Door | a coluna Categoria do CSV sai sempre PT; na tela ela é traduzida em OpeningScheduleDialog.tsx:144 |
| 48 | packages/engine/src/openingSchedule.ts:319 | `Composição` | cabeçalho CSV | P2 | col_composition | Composition | coluna extra do CSV sem chave em i18nTabelas |
| 49 | packages/engine/src/openingSchedule.ts:110 | `${o.flipHand ? 'dobradiça invertida' : 'dobradiça padrão'}, abre à ${o.flipFacing ? 'direita' : 'esquerda'} de a→b` | valor de célula | P1 | sched_sense_* | inverted hinge, opens left/right of a→b | coluna Sentido: frase inteira gerada em PT no engine e exibida na tabela em EN |
| 50 | packages/engine/src/openingSchedule.ts:119 | `maçaneta a ${...}` | valor de célula | P1 | sched_hw_handle | handle at {h} | coluna Ferragens: linhas 121 "dobradiça/dobradiças", 122 "folga inferior" e 124 "soleira" também são PT; valores usam formatQuantity (decimal do projeto) |
| 51 | packages/engine/src/openingSchedule.ts:190 | `janela ${...} módulos (${...})` | valor de célula | P2 | sched_composition | window {n} modules (...) | compositionSummary (185-202) monta "porta + 2 laterais + bandeira superior" em PT; vai só para o CSV, mas sem chave |
| 52 | packages/engine/src/roofSchedule.ts:121 | `Marca` | cabeçalho CSV | P1 | col_mark | Mark | csvHeader (120-134) inteiro em PT |
| 53 | packages/engine/src/roofSchedule.ts:147 | `r.shapeLabel` | célula CSV | P1 | roof_shape_* | Shed | shapeLabel vem de ROOF_SHAPE_LABEL (PT); na tela RoofScheduleDialog.tsx:66 traduz, no CSV não |
| 54 | packages/engine/src/roofSchedule.ts:132 | `Empena` | cabeçalho CSV | P2 | col_gable | Gable | linha 133 "Arestas com inclinação" (col_sloped_edges) também não tem chave; nenhuma das duas colunas existe na tabela do diálogo |
| 55 | packages/engine/src/stairSchedule.ts:99 | `Marca` | cabeçalho CSV | P1 | col_mark | Mark | csvHeader (98-110) inteiro em PT |
| 56 | packages/engine/src/rampSchedule.ts:96 | `Marca` | cabeçalho CSV | P1 | col_mark | Mark | CSV_HEADER (96-109) inteiro em PT |
| 57 | packages/engine/src/rampSchedule.ts:104 | `Desnível (m)` | cabeçalho CSV | P2 | col_rise | Rise (m) | unidade fixa "(m)" em 104-106 e "m²"/"m³" em 107-108; rampScheduleToCsv nem recebe units |
| 58 | packages/engine/src/roomSchedule.ts:111 | `Número` | cabeçalho CSV | P1 | col_number | Number | csvHeader (110-121) inteiro em PT |
| 59 | packages/engine/src/csv.ts:9 | `cells.join(';')` | formatação | P2 | — | — | separador ";" e decimal "," (linha 14) fixos: CSV em EN continua no formato pt-BR |
| 60 | packages/engine/src/roofSchedule.ts:7 | `Uma água` | constante de módulo | P2 | roof_shape_* | Shed | ROOF_SHAPE_LABEL (7-14) é constante PT usada no CSV e na ordenação; não há versão EN |
| 61 | apps/web/src/editor/i18nTabelas.ts:86 | `Camadas (cm)` | unidade fixa | P2 | col_layers | Layers | a coluna não passa por scheduleHeader; o "(cm)" fixo mente em projeto imperial/mm; EN em :226 repete |
| 62 | apps/web/src/editor/i18nTabelas.ts:103 | `Desnível (m)` | unidade fixa | P2 | col_rise | Rise | EN em :243; usado só na Rampa, que não converte unidades — o símbolo deve vir do formatador |
| 63 | apps/web/src/editor/i18nTabelas.ts:104 | `Comprimento (m)` | unidade fixa | P2 | col_path_length | Length | EN em :244; mesma unidade fixa |
| 64 | apps/web/src/editor/i18nTabelas.ts:105 | `Altura do espelho (m)` | unidade fixa | P2 | col_riser_height | Riser height | EN em :245; na Escada recebe scheduleHeader e vira "(m) (m)" — tirar "(m)" da chave |
| 65 | apps/web/src/editor/i18nTabelas.ts:106 | `Piso médio (m)` | unidade fixa | P2 | col_tread | Average tread | EN em :246; mesmo problema de unidade duplicada |
| 66 | apps/web/src/editor/i18nTabelas.ts:25 | `tipos` | dicionário (chave) | P2 | sched_noun_opening | types | serve ao subtítulo (linhas = tipos) e ao rodapé (instâncias): com 12 portas o rodapé diz "12 tipos" |
| 67 | apps/web/src/editor/i18n.ts:115 | `Tabelas / Quantitativos` | chave não usada | P2 | schedules | Schedules / Quantities | nenhum componente usa t.schedules; Views.tsx:250 tem "Tabelas/Quantidades (todas)" fixo |
| 68 | apps/web/src/ui/dialogs/StairScheduleDialog.tsx:30 | `labelKey: 'col_riser_height'` | coluna da tabela | P1 | col_riser_height | Riser height | label já traz "(m)" e scheduleHeader (:129) acrescenta " (m)" → cabeçalho "Altura do espelho (m) (m)" |
| 69 | apps/web/src/ui/dialogs/StairScheduleDialog.tsx:31 | `labelKey: 'col_tread'` | coluna da tabela | P1 | col_tread | Average tread | mesmo defeito → "Piso médio (m) (m)" |
| 70 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:25 | `labelKey: 'col_slope', decimals: 2` | coluna da tabela | P2 | col_slope | Slope | sem `quantity`: cabeçalho fica "Inclinação" sem (%) embora o valor seja percentual (:54) |
| 71 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:29 | `labelKey: 'col_plan_area', decimals: 2` | coluna da tabela | P1 | col_plan_area | Plan area | COLS (18-31) não têm `quantity` e o diálogo não usa useUnits: valores SI crus, sem conversão nem símbolo; único quadro assim |
| 72 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:86 | `rampScheduleToCsv(visible, totals)` | exportação CSV | P1 | — | — | não passa units; o CSV sai sempre em m/m²/m³ |
| 73 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:152 | `m²` | unidade fixa | P2 | — | — | rodapé hardcoded; ignora unidades do projeto |
| 74 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:153 | `m³` | unidade fixa | P2 | — | — | idem |
| 75 | apps/web/src/ui/dialogs/RampScheduleDialog.tsx:40 | `toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR', ...)` | formatação de número | P2 | — | — | Rampa segue o idioma; os outros 8 quadros seguem units.decimalSymbol (vírgula por padrão) → em EN coexistem 1.23 e 1,23 |
| 76 | apps/web/src/ui/dialogs/RoofScheduleDialog.tsx:47 | `String(y ?? '').localeCompare(...)` | ordenação/locale | P2 | — | — | coluna Forma ordena por `shapeLabel`, que é o rótulo PT do engine, mesmo com a célula exibida em EN |
| 77 | apps/web/src/ui/dialogs/RoofScheduleDialog.tsx:30 | `labelKey: 'col_shape'` | coluna da tabela | P2 | col_gable | Gable | tabela tem 11 colunas; o CSV exporta 13 (Empena e Arestas com inclinação) — paridade tabela/CSV quebrada |
| 78 | apps/web/src/ui/dialogs/RoomScheduleDialog.tsx:107 | `t.sched_empty_room.replace(' (Z)', sufixoAtalho('room'))` | template de texto | P2 | sched_empty_room | There are no rooms... | depende do literal " (Z)" dentro da tradução; quebra se o texto mudar |
| 79 | apps/web/src/ui/dialogs/WallScheduleDialog.tsx:64 | `useState('')` | status/toast | P2 | — | — | msg guarda a frase já gerada: depois de trocar de idioma o status antigo continua em PT (vale para os 9 quadros) |

## Mistura PT/EN no mesmo arquivo
- `apps/web/src/ui/browser/Views.tsx`: "Vistas 3D (3D View)" convive com "Tabelas/Quantidades (todas)" e "Tabela de paredes"; os quadros abrem traduzidos.
- `RampScheduleDialog.tsx`: números com ponto em EN (`toLocaleString`), ao lado de "m²"/"m³" e cabeçalhos com "(m)".
- `i18nTabelas.ts`: EN "Riser height (m)" / "Layers (cm)" — texto EN com unidade PT-métrica fixa.
- CSV de qualquer quadro: cabeçalho PT + nomes de tipo/nível do usuário (PT) e, se o projeto veio de IFC, nomes EN.

## Riscos / testes que quebram
- `packages/engine/src/schedule.test.ts:61-62` — espera `Marca;Tipo;Nível;` e `Total;`.
- `packages/engine/src/schedule.test.ts:70-75` — exige vírgula decimal e nenhum ponto.
- `packages/engine/src/floorSchedule.test.ts:68` — cabeçalho PT completo.
- `packages/engine/src/rampSchedule.test.ts:53` — cabeçalho PT com "(m)"/"(m²)"/"(m³)".
- `packages/engine/src/ceilings.test.ts:130` — `Marca;Tipo;Código;Nível;Ambiente;Área (m²);`.
- `packages/engine/src/openingSchedule.test.ts:105-106` — linha inteira com "Porta", "Madeira" e vírgula decimal.
- `packages/engine/src/netQuantities.test.ts:173` — linha de total PT.
- `apps/web/src/ui/dialogs/OpeningScheduleDialog.test.ts:22,32-34` — espera rótulos PT e frases "dobradiça invertida…"/"maçaneta a 1,00 m…".
- `apps/web/src/ui/dialogs/scheduleUnits.test.ts:8-9,14-17` — espera "12,35", "Área (m²)", "Área (ft²)".
- Testes passam hoje só porque o idioma inicial é `pt` (`i18n.ts:18`); qualquer mudança de default ou vazamento de `localStorage['hestia.lang']` quebra esses snapshots.

## Já correto
- Todos os 9 `*ScheduleDialog` usam `I18N[useI18n((s) => s.lang)]` no corpo do componente — trocar o idioma re-renderiza título, colunas, filtros, vazios, rodapé e botões.
- `COLS` são `labelKey`, não texto: não há const de módulo congelando o idioma nos diálogos.
- Paridade PT/EN de `i18nTabelas.ts`: 135 chaves em cada lado, nenhuma faltando; todas as `sched_*`/`col_*` são usadas (as `roof_shape_*` via template `roof_shape_${s}`).
- `scheduleUnits.ts` é puro (sem texto): `scheduleCell`/`scheduleHeader` só compõem número + símbolo.
- `RoofScheduleDialog.tsx:66` traduz a forma na exibição da tabela e no filtro (o problema é só CSV/ordenação).
- Filtros "Todos os níveis/tipos/formas", categorias de abertura e mensagens de vazio estão todas em chaves.
