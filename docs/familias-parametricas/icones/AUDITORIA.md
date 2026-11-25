# Auditoria de ícones: instalações (MEP) e estrutura metálica

Data: 2026-11-25. Somente leitura de código. Caminhos relativos à raiz do repositório (`apps/web/src/...`).

Arquivos lidos: `ui/ribbon/actions.ts`, `ui/ribbon/tabsMain.ts`, `ui/ribbon/tabsSoon.ts`, `ui/ribbon/tabEstrutura.ts`, `ui/ribbon/context.ts`, `ui/ribbon/model.ts`, `ui/ribbon/parts.tsx`, `ui/familia/familiaAbaPaineis.ts`, `ui/familia/familiaAbaPaineisVista.ts`, `ui/familia/FamiliaFaixa.tsx`, `ui/familia/FamiliaAbaRibbon.tsx`, `ui/PaletaMoveis.tsx`, `ui/paletaMoveis.ts`, `ui/familia/familiaNovo.ts`, `ui/Icon.tsx`, `ui/iconesMassaTerreno.ts`, `ui/iconesMep.ts`, `ui/browser/PlantasDeDisciplina.tsx`, `ui/familia/familiaCorpo.ts`, `packages/model/src/familia/destinosCategoria.ts`, `packages/model/src/familia/categorias.ts`, `packages/tools/src/tuboTool.ts`, e os textos em `editor/i18n/areas/familiasAbas.ts` e `familiasAbasDicas.ts`.

## Resumo

- 63 botões auditados (cada colocação na faixa ou na Biblioteca conta uma vez).
- 48 têm chave de ícone; 15 são abas de texto da Biblioteca, sem ícone.
- Dos 48, 45 dividem a chave com outra coisa; 3 têm chave exclusiva (Treliça, Contraventamento, Sistema de vigas).
- `Icon.tsx` tem 154 chaves: 104 declaradas em `R`, 34 importadas de `iconesMassaTerreno.ts` e 16 glifos de interface em `P`.
- Há 4 chaves `mep*` em `iconesMep.ts`, mas esse arquivo não é importado por ninguém: o app não as desenha.

## Como o ícone é resolvido (leia antes da tabela)

- Ferramenta sem `icon` usa o próprio id como chave (`ui/ribbon/parts.tsx:58`, `item.icon ?? item.tool`). `tubo` não é chave de `Icon.tsx`, por isso o botão Tubo define `icon: 'component'` explicitamente.
- Ação usa o campo `icon` do `ActionDef` em `ui/ribbon/actions.ts`.
- Item "em breve" sem ícone usa a chave `soon` (`ui/ribbon/parts.tsx:108`). Por isso `soon` é compartilhada por dezenas de botões.
- Chave que não existe em `Icon.tsx` desenha só um `<svg>` vazio (`ui/Icon.tsx`, `P[name] ?? ''`).

## 1. Tabela de botões

Legenda da coluna "Compartilhado?": a lista traz os outros usos da mesma chave no app. "Fallback soon" significa que o botão usa a chave genérica `soon`.

| # | Botão (rótulo) | Id (ação ou ferramenta) | Aba > painel | Ícone (chave) | Arquivo:linha | O que a ferramenta faz | Compartilhado? |
|---|---|---|---|---|---|---|---|
| 1 | Tubo | ferramenta `tubo` | Sistemas > Hidráulica e tubulação | `component` (explícito) | `ui/ribbon/tabsSoon.ts:55` | Desenha trechos de tubo com DN e declividade, encaixando as conexões nas pontas (`packages/tools/src/tuboTool.ts`). | Sim: `component` em Componente (`tabsMain.ts:19`), Colocar móvel (`tabsMain.ts:182`), Componente mecânico (`tabsSoon.ts:62`), Ferramentas externas (`actions.ts:481`), Gerenciar suplementos (`actions.ts:487`), Módulo aninhado (`familia/FamiliaFaixa.tsx:72`), Vista 3D do editor (`familia/familiaAbaPaineisVista.ts:33`). |
| 2 | Tubos e conexões | ação `familiasHidro` | Sistemas > Hidráulica e tubulação (posição `tabsSoon.ts:56`) | `componentLibrary` | `ui/ribbon/actions.ts:500` | Abre a Biblioteca no grupo Hidráulica, para clicar ou arrastar tubos, conexões, caixas e reservatórios. | Sim: `componentLibrary` em Eletrodutos e dispositivos, Dutos e difusores e Perfis e chapas (`actions.ts:501-503`), Biblioteca (`actions.ts:519`, `tabsMain.ts:20`). |
| 3 | Verificar rede | ação `verificarRede` | Sistemas > Hidráulica e tubulação (posição `tabsSoon.ts:57`) | `detail` | `ui/ribbon/actions.ts:505` | Abre o diagnóstico da rede: ligações abertas, conexões incompatíveis, declividade fora de faixa e redes sem saída. | Sim: `detail` em Espessuras de linha (`actions.ts:514`). Também aparece como argumento `btn('frame', 'detail', ...)` em `ui/sheet/SheetControlBar.tsx:137` (confirmar se é o ícone). |
| 4 | Catálogo de tubos | ação `catalogoMep` | Sistemas > Hidráulica e tubulação (posição `tabsSoon.ts:58`) | `sheet` | `ui/ribbon/actions.ts:504` | Abre os catálogos de fabricante (Krona) e os próprios: vê medidas, importa CSV e cria famílias de tubo e conexão. | Sim: `sheet` em Prancha (`actions.ts:434`), Publicar pranchas (`actions.ts:459`), Prancha por nível (`actions.ts:465`), Carregar do arquivo (`familia/familiaAbaPaineis.ts:25`), Abrir e salvar (`familia/FamiliaFaixa.tsx:75`), Validar (`familia/familiaAbaPaineisVista.ts:51`), Importar PDF e Imagem em breve (`tabsMain.ts:177-178`). |
| 5 | Aparelho sanitário | sem ação (em breve) | Sistemas > Hidráulica e tubulação | `soon` (fallback, sem ícone próprio) | `ui/ribbon/tabsSoon.ts:59` | Ainda não existe. | Sim: fallback `soon`, igual a todo "em breve" sem ícone. |
| 6 | Eletrodutos e dispositivos | ação `familiasEletrico` | Sistemas > Elétrico | `componentLibrary` | `ui/ribbon/actions.ts:501` (posição `tabsSoon.ts:60`) | Abre a Biblioteca no grupo Elétrico: eletrodutos, eletrocalhas, caixas, tomadas, interruptores e luminárias. | Sim: `componentLibrary` (mesmas citações da linha 2). |
| 7 | Bandeja | sem ação (em breve) | Sistemas > Elétrico | `soon` (fallback) | `ui/ribbon/tabsSoon.ts:60` | Ainda não existe. | Sim: fallback `soon`. |
| 8 | Dutos e difusores | ação `familiasHvac` | Sistemas > HVAC | `componentLibrary` | `ui/ribbon/actions.ts:502` (posição `tabsSoon.ts:61`) | Abre a Biblioteca no grupo HVAC: dutos, curvas, reduções, difusores, grelha e split. | Sim: `componentLibrary` (mesmas citações da linha 2). |
| 9 | Tubo flexível | sem ação (em breve) | Sistemas > HVAC | `soon` (fallback) | `ui/ribbon/tabsSoon.ts:61` | Ainda não existe. | Sim: fallback `soon`. |
| 10 | Equipamento | sem ação (em breve) | Sistemas > Mecânico | `soon` (fallback) | `ui/ribbon/tabsSoon.ts:62` | Ainda não existe. | Sim: fallback `soon`. |
| 11 | Componente | ferramenta `component` | Sistemas > Mecânico | `component` (explícito) | `ui/ribbon/tabsSoon.ts:62` | Mesma ferramenta Componente de Construir. | Sim: as mesmas citações da linha 1 (`component`). |
| 12 | Conexão | sem ação (em breve) | Aço > Conexões | `soon` (fallback) | `ui/ribbon/tabsSoon.ts:44` | Ainda não existe. | Sim: fallback `soon`. |
| 13 | Ancoragem | sem ação (em breve) | Aço > Conexões | `soon` (fallback) | `ui/ribbon/tabsSoon.ts:44` | Ainda não existe. | Sim: fallback `soon`. |
| 14 | Perfis e chapas (rótulo padrão da ação) | ação `familiasEstrutura` | Aço > Conexões | `componentLibrary` | `ui/ribbon/actions.ts:503` (posição `tabsSoon.ts:44`) | Abre a Biblioteca no grupo Estrutura: perfis metálicos, chapa de base e parafuso. | Sim: `componentLibrary` (`actions.ts:500-502`, `519`; `tabsMain.ts:20`). |
| 15 | Parafuso e chapa | ação `familiasEstrutura` (rótulo próprio) | Aço > Elementos de aço | `componentLibrary` | `ui/ribbon/actions.ts:503` (posição `tabsSoon.ts:45`) | Mesma Biblioteca de Estrutura, com outro rótulo. | Sim: `componentLibrary` (mesmas citações da linha 14). |
| 16 | Solda | sem ação (em breve) | Aço > Elementos de aço | `soon` (fallback) | `ui/ribbon/tabsSoon.ts:45` | Ainda não existe. | Sim: fallback `soon`. |
| 17 | Pino | sem ação (em breve) | Aço > Elementos de aço | `soon` (fallback) | `ui/ribbon/tabsSoon.ts:45` | Ainda não existe. | Sim: fallback `soon`. |
| 18 | Entalhe | sem ação (em breve) | Aço > Modificar | `soon` (explícito) | `ui/ribbon/tabsSoon.ts:46` | Ainda não existe. | Sim: `soon`; "Entalhar" (`panelsShared.ts:34`) também é `soon`. |
| 19 | Corte | sem ação (em breve) | Aço > Modificar | `cut` | `ui/ribbon/tabsSoon.ts:46` | Ainda não existe (corte de geometria em aço). | Sim: `cut` em Cortar (`ui/ribbon/panelsShared.ts:33`) e Cortar geometria (`panelsShared.ts:34`). |
| 20 | Chanfro | sem ação (em breve) | Aço > Modificar | `soon` (explícito) | `ui/ribbon/tabsSoon.ts:46` | Ainda não existe. | Sim: `soon`. |
| 21 | Viga | ferramenta `beam` | Estrutura > Estrutura | `beam` | `ui/ribbon/tabEstrutura.ts:10` | Coloca viga estrutural. | Sim: `beam` em Prateleira (`familia/FamiliaFaixa.tsx:56`), Cabideiro (`FamiliaFaixa.tsx:63`), Plano de referência (`familia/familiaAbaPaineis.ts:38`), Alinhar (`familiaAbaPaineis.ts:51`), Mostrar planos (`familia/familiaAbaPaineisVista.ts:26`), opção Linha (`ui/ribbon/context.ts:33`). |
| 22 | Parede estrutural | sem ação (em breve) | Estrutura > Estrutura | `wall` | `ui/ribbon/tabEstrutura.ts:11` | Ainda não existe. | Sim: `wall` em Parede (`tabsMain.ts:15`), Parede de fundação (`tabEstrutura.ts:22`), Tamponamento (`FamiliaFaixa.tsx:61`), Espelhar (`familiaAbaPaineis.ts:47`), Frente e Lateral (`familiaAbaPaineisVista.ts:34-35`). |
| 23 | Pilar | ferramenta `column` | Estrutura > Estrutura | `column` | `ui/ribbon/tabEstrutura.ts:12` | Coloca pilar estrutural. | Sim: `column` em Pilar em breve (`tabsMain.ts:23`), ação de pilar (`actions.ts:713`), disciplina Estrutura no navegador (`ui/browser/PlantasDeDisciplina.tsx:49`). |
| 24 | Piso estrutural | sem ação (em breve) | Estrutura > Estrutura | `slab` | `ui/ribbon/tabEstrutura.ts:13` | Ainda não existe. | Sim: `slab` em Piso: Estrutural (Laje) (`tabsMain.ts:32`, sem ícone próprio, usa a chave `slab`), Tampo (`FamiliaFaixa.tsx:60`), Grosso, Médio e Fino (`familiaAbaPaineisVista.ts:17-19`). |
| 25 | Treliça | sem ação (em breve) | Estrutura > Estrutura | `truss` | `ui/ribbon/tabEstrutura.ts:14` | Ainda não existe. | Não: única ocorrência em todo `apps/web/src`. |
| 26 | Contraventamento | sem ação (em breve) | Estrutura > Estrutura | `brace` | `ui/ribbon/tabEstrutura.ts:15` | Ainda não existe. | Não: única ocorrência. |
| 27 | Sistema de vigas | sem ação (em breve) | Estrutura > Estrutura | `beamsystem` | `ui/ribbon/tabEstrutura.ts:16` | Ainda não existe. | Não: única ocorrência. |
| 28 | Isolada | ferramenta `footing` | Estrutura > Fundação | `footing` | `ui/ribbon/tabEstrutura.ts:21` | Coloca sapata isolada. | Sim: `footing` em ações de fundação (`actions.ts:727`, `actions.ts:778`) e na lista de ferramentas de contexto (`context.ts:22`). |
| 29 | Parede (fundação) | sem ação (em breve) | Estrutura > Fundação | `wall` | `ui/ribbon/tabEstrutura.ts:22` | Ainda não existe. | Sim: `wall` (ver linha 22). |
| 30 | Laje (fundação) | sem ação (em breve) | Estrutura > Fundação | `floor` | `ui/ribbon/tabEstrutura.ts:23` | Ainda não existe. | Sim: `floor` em Piso (`tabsMain.ts:30`), Piso por face em breve (`tabsMain.ts:33`), lista de contexto (`context.ts:21`). |
| 31 | Ligação | sem ação (em breve) | Estrutura > Conexão | `connection` | `ui/ribbon/tabEstrutura.ts:28` | Ainda não existe. | Sim: `connection` é o ícone da disciplina Elétrico no navegador (`ui/browser/PlantasDeDisciplina.tsx:51`). |
| 32 | Vergalhão | sem ação (em breve) | Estrutura > Armadura | `rebar` | `ui/ribbon/tabEstrutura.ts:33` | Ainda não existe. | Sim: `rebar` é o ícone da forma por varredura (`ui/familia/familiaCorpo.ts:35`, `ICONE_FORMA`). |
| 33 | Área | sem ação (em breve) | Estrutura > Armadura | `soon` (explícito) | `ui/ribbon/tabEstrutura.ts:35` | Ainda não existe. | Sim: `soon`. |
| 34 | Caminho | sem ação (em breve) | Estrutura > Armadura | `soon` (explícito) | `ui/ribbon/tabEstrutura.ts:36` | Ainda não existe. | Sim: `soon`. |
| 35 | Cobrimento | sem ação (em breve) | Estrutura > Armadura | `soon` (explícito) | `ui/ribbon/tabEstrutura.ts:37` | Ainda não existe. | Sim: `soon`. |
| 36 | Perfis e chapas (rótulo padrão da ação) | ação `familiasEstrutura` | Estrutura > Modelo | `componentLibrary` | `ui/ribbon/actions.ts:503` (posição `tabEstrutura.ts:43`) | Abre a Biblioteca no grupo Estrutura. | Sim: `componentLibrary` (mesmas citações da linha 14). |
| 37 | Texto do modelo | sem ação (em breve) | Estrutura > Modelo | `text` | `ui/ribbon/tabEstrutura.ts:45` | Ainda não existe. | Sim: `text` em Texto (`tabsMain.ts:73`) e lista de contexto (`context.ts:21`). |
| 38 | Linha do modelo | sem ação (em breve) | Estrutura > Modelo | `detailLine` | `ui/ribbon/tabEstrutura.ts:46` | Ainda não existe. | Sim: `detailLine` em Linha de detalhe (`tabsMain.ts:72`) e lista de contexto (`context.ts:21`). |
| 39 | Grupo de modelos | sem ação (em breve) | Estrutura > Modelo | `layers` | `ui/ribbon/tabEstrutura.ts:47` | Ainda não existe. | Sim: `layers` em Nível (`actions.ts:304`), Subpavimento (`actions.ts:394`), Sincronizar (`actions.ts:353`), Meus blocos (`actions.ts:498`), Modelos de vista em breve (`tabsMain.ts:86`). |
| 40 | Shaft | sem ação (em breve) | Estrutura > Abertura | `shaft` | `ui/ribbon/tabEstrutura.ts:53` | Ainda não existe. | Sim: `shaft` é o ícone da disciplina HVAC no navegador (`ui/browser/PlantasDeDisciplina.tsx:52`). |
| 41 | Por face | sem ação (em breve) | Estrutura > Abertura | `opening` (explícito) | `ui/ribbon/tabEstrutura.ts:55` | Ainda não existe. | Sim: `opening` em quatro botões de Abertura em breve (`tabsMain.ts:54`). |
| 42 | Parede (abertura) | sem ação (em breve) | Estrutura > Abertura | `opening` (explícito) | `ui/ribbon/tabEstrutura.ts:56` | Ainda não existe. | Sim: `opening` (mesmas citações da linha 41). |
| 43 | Vertical | sem ação (em breve) | Estrutura > Abertura | `opening` (explícito) | `ui/ribbon/tabEstrutura.ts:57` | Ainda não existe. | Sim: `opening` (mesmas citações da linha 41). |
| 44 | Nível | ação `levelTool` | Estrutura > Referência | `level` | `ui/ribbon/actions.ts:513` (posição `tabEstrutura.ts:63`) | Cria um nível no corte ou elevação, com clique no início e no fim. | Sim: `level` em Gerenciar níveis (`actions.ts:512`) e Nível (LL) (`tabsMain.ts:55`). |
| 45 | Eixo | ferramenta `grid` | Estrutura > Referência | `grid` | `ui/ribbon/tabEstrutura.ts:64` | Coloca linha de eixo (grade). | Sim: `grid` em Grade (`actions.ts:393`), Grade (`tabsMain.ts:55`), Grade de linhas (`tabsMain.ts:18`), Grade pequena (`tabsMain.ts:90`). |
| 46 | Tubulação | ação `familiasHidro` | Inserir > Tubulação | `componentLibrary` | `ui/ribbon/actions.ts:500` (posição `tabsMain.ts:181`) | Atalho para a Biblioteca de tubos (grupo Hidráulica). | Sim: `componentLibrary` (mesmas citações da linha 2). |
| 47 | Catálogo MEP | abre o diálogo `catalogoMep` | Editor de família > faixa Propriedades | `style` | `ui/familia/FamiliaFaixa.tsx:73` | Abre o catálogo MEP: ver tubos e conexões, importar CSV e criar famílias. | Sim: `style` em Catálogo (`FamiliaFaixa.tsx:73`), Símbolo 2D (`familiaAbaPaineis.ts:33`), Catálogo (`familiaAbaPaineisVista.ts:48`), Materiais da família (`familiaAbaPaineisVista.ts:57`). |
| 48 | Catálogo MEP | abre o diálogo `catalogoMep` | Editor de família > Gerenciar > Dados (`FamiliaAbaRibbon`) | `style` | `ui/familia/familiaAbaPaineisVista.ts:49` | Mesmo diálogo da linha 47. | Sim: `style` (mesmas citações da linha 47). |
| 49 | Hidráulica (aba) | id `grupo:hidraulica` | Biblioteca (paleta de móveis) > abas | nenhum (texto) | `ui/paletaMoveis.ts:26` | Filtra a Biblioteca às categorias de hidráulica. | Não se aplica: aba sem ícone. |
| 50 | Elétrico (aba) | id `grupo:eletrico` | Biblioteca > abas | nenhum (texto) | `ui/paletaMoveis.ts:27` | Filtra a Biblioteca às categorias elétricas. | Não se aplica: aba sem ícone. |
| 51 | HVAC (aba) | id `grupo:hvac` | Biblioteca > abas | nenhum (texto) | `ui/paletaMoveis.ts:28` | Filtra a Biblioteca às categorias de HVAC. | Não se aplica: aba sem ícone. |
| 52 | Estrutura (aba) | id `grupo:estrutura` | Biblioteca > abas | nenhum (texto) | `ui/paletaMoveis.ts:29` | Filtra a Biblioteca às categorias estruturais. | Não se aplica: aba sem ícone. |
| 53 | Tubulação (categoria) | categoria `tubulacao` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:23` | Filtra a Biblioteca por tubos. | Não se aplica: aba sem ícone. |
| 54 | Conexões de tubo | categoria `conexao_tubo` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:24` | Filtra por conexões. | Não se aplica. |
| 55 | Terminais hidráulicos | categoria `terminal_hidraulico` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:25` | Filtra por terminais hidráulicos. | Não se aplica. |
| 56 | Reservatórios | categoria `reservatorio` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:26` | Filtra por reservatórios. | Não se aplica. |
| 57 | Eletrodutos e eletrocalhas | categoria `eletroduto` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:27` | Filtra por eletrodutos e eletrocalhas. | Não se aplica. |
| 58 | Dispositivos elétricos | categoria `dispositivo_eletrico` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:28` | Filtra por dispositivos elétricos. | Não se aplica. |
| 59 | Luminárias | categoria `luminaria` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:29` | Filtra por luminárias. | Não se aplica. |
| 60 | Dutos | categoria `duto` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:30` | Filtra por dutos. | Não se aplica. |
| 61 | Terminais de ar | categoria `terminal_ar` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:31` | Filtra por terminais de ar. | Não se aplica. |
| 62 | Perfis estruturais | categoria `perfil_estrutural` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:32` | Filtra por perfis estruturais. | Não se aplica. |
| 63 | Chapas estruturais | categoria `chapa_estrutural` | Biblioteca > abas de categoria | nenhum (texto) | `ui/familia/familiaNovo.ts:33` | Filtra por chapas estruturais. | Não se aplica. |

Observações sobre a tabela:

- As abas da Biblioteca (linhas 49 a 63) são botões de texto em `ui/PaletaMoveis.tsx` (lista `role="tablist"`, rótulo por `rotuloDaAba`). Não há `Icon` ali.
- Os rótulos de Vista e Gerenciar vêm de `editor/i18n/areas/familiasAbasDicas.ts` (`fa_b_catalogo_mep` = "Catálogo MEP"). Os da faixa de Propriedades são texto direto em `FamiliaFaixa.tsx`.
- Fora do escopo desta auditoria (não listados): os demais botões de Inserir (Móveis, Carregar família, Importar, etc.), Encaixe/Ligação do editor de famílias e os botões gerais de Construir.

## 2. Itens "em breve" (soon) do MEP sem ícone próprio

Considerados: Sistemas (Hidráulica, Elétrico, HVAC, Mecânico), Aço e Estrutura.

A. Sem ícone declarado, caem na chave genérica `soon` (`parts.tsx:108`):
- Aparelho sanitário (`tabsSoon.ts:59`)
- Bandeja (`tabsSoon.ts:60`)
- Tubo flexível (`tabsSoon.ts:61`)
- Equipamento (`tabsSoon.ts:62`)
- Conexão (`tabsSoon.ts:44`)
- Ancoragem (`tabsSoon.ts:44`)
- Solda (`tabsSoon.ts:45`)
- Pino (`tabsSoon.ts:45`)

B. Com ícone genérico ou emprestado de outro elemento (não próprio):
- Entalhe (`soon`, `tabsSoon.ts:46`), Chanfro (`soon`, `tabsSoon.ts:46`), Corte (`cut`, `tabsSoon.ts:46`)
- Parede estrutural (`wall`, `tabEstrutura.ts:11`), Piso estrutural (`slab`, `tabEstrutura.ts:13`)
- Parede de fundação (`wall`, `tabEstrutura.ts:22`), Laje de fundação (`floor`, `tabEstrutura.ts:23`)
- Ligação (`connection`, `tabEstrutura.ts:28`, mesma chave da disciplina Elétrico), Vergalhão (`rebar`, `tabEstrutura.ts:33`, mesma chave da forma por varredura)
- Shaft (`shaft`, `tabEstrutura.ts:53`, mesma chave da disciplina HVAC)
- Área, Caminho, Cobrimento (`soon`, `tabEstrutura.ts:35-37`)
- Por face, Parede e Vertical de abertura (`opening`, `tabEstrutura.ts:55-57`)
- Texto do modelo (`text`, `tabEstrutura.ts:45`), Linha do modelo (`detailLine`, `tabEstrutura.ts:46`), Grupo de modelos (`layers`, `tabEstrutura.ts:47`)

C. Com chave própria e exclusiva (não está na lista acima, mas ainda é "em breve"): Treliça (`truss`), Contraventamento (`brace`), Sistema de vigas (`beamsystem`), em `tabEstrutura.ts:14-16`.

## 3. Chaves de ícone existentes em `Icon.tsx` (154)

Ordem de aparição no arquivo. Origem indicada em cada grupo.

Grupo 1, declaradas no objeto `R` (104), em `ui/Icon.tsx` linhas 14 a 177:

spotElevation, spotCoordinate, revisionCloud, northArrow, tagRoom, roomsep, select, move, copy, rotate, mirror, array, parallel, offset, trim, align, joins, split, measure, rehost, attachroof, detachroof, sametype, samename, editperimeter, wall, door, window, floor, slab, ceiling, roof, slope, roofarrow, roofextrusion, stair, stairrun, room, dimension, angularDimension, text, detailLine, filledRegion, tag, cotasAuto, section, plan, fit, grid, cube, sun, layers, materialSphere, paintBucket, faceStudio, schedule, type, soon, props, paste, cut, cutscissors, hide, eye, component, componentLibrary, componentGroup, componentUngroup, familyEditor, componentBudget, componentRun, column, beam, footing, brace, truss, beamsystem, rebar, shaft, connection, ramp, railing, level, curtain, opening, sheet, link, detail, tl, scale, style, crop, isolate, funnel, nav, zoom, search, user, qopen, qsave, qundo, qredo, qhelp, qclose

Grupo 2, espalhadas em `R` a partir de `ui/iconesMassaTerreno.ts` (34):

mass, massExtrude, massBlend, massLoft, massBulb, massShow, massInPlace, massPlace, massFloors, massWalls, massRoofFace, massWallFace, massCeilFace, massFloorFace, terrTopo, terrPoints, terrContours, terrImport, terrEdit, terrSubregion, terrRegion, terrPad, terrPadElem, terrGraded, terrSiteComp, lotLines, lotDraw, lotTable, lotIndices, lotEnvelope, terrCutFill, terrCutFillMap, terrContourLabel, terrSpot

Grupo 3, glifos de interface no objeto `P` (16), em `ui/Icon.tsx` linhas 180 a 197:

elevation, levels, moon, undo, redo, save, open, plus, trash, file, edit, chevron, up, down, close, help

Não há chave repetida entre os três grupos (154 únicas).

Não estão em `Icon.tsx`: `mepTubo`, `mepJoelho`, `mepVerificarRede`, `mepEsgoto` (em `ui/iconesMep.ts`, sem importação em lugar nenhum; o app não as desenha).

## 4. Ícones que faltam

Nenhuma das sugestões de chave abaixo existe hoje em `Icon.tsx` (conferido pelo nome). As sugestões seguem a convenção `mep` + PascalCase do guia `docs/familias-parametricas/icones/GUIA.md`.

### Ferramentas existentes (sem ícone próprio)

- Tubo (`tubo`): hoje `component`. Já existe rascunho `mepTubo` em `iconesMep.ts`, não ligado. Sugestão: `mepTubo`.
- Tubos e conexões, Biblioteca de hidráulica (`familiasHidro`): hoje `componentLibrary`. Sugestão: `mepBibliotecaHidraulica`.
- Eletrodutos e dispositivos (`familiasEletrico`): hoje `componentLibrary`. Sugestão: `mepBibliotecaEletrica`.
- Dutos e difusores (`familiasHvac`): hoje `componentLibrary`. Sugestão: `mepBibliotecaHvac`.
- Perfis e chapas, Parafuso e chapa (`familiasEstrutura`): hoje `componentLibrary`. Sugestão: `mepBibliotecaEstrutura`.
- Catálogo de tubos (`catalogoMep`): hoje `sheet`. Sugestão: `mepCatalogo`.
- Verificar rede (`verificarRede`): hoje `detail`. Já existe rascunho `mepVerificarRede`, não ligado.
- Catálogo MEP no editor de famílias: hoje `style`. Sugestão: `mepCatalogoEditor`.
- Conexão, Ancoragem, Solda, Pino (aço): hoje sem ícone. Sugestões: `mepConexaoAco`, `mepAncoragem`, `mepSolda`, `mepPino`.
- Entalhe, Chanfro (aço): hoje `soon`. Corte (aço): hoje `cut`, compartilhado. Sugestões: `mepEntalhe`, `mepChanfro`, `mepCorte`.
- Esgoto (rascunho `mepEsgoto` existe, não ligado) e demais sistemas: ver grupo "Sistemas".

### Peças

- Joelho: rascunho `mepJoelho` existe em `iconesMep.ts`, não ligado.
- Tê: sugestão `mepTe`.
- Junção: sugestão `mepJuncao`.
- Redução: sugestão `mepReducao`.
- Luva: sugestão `mepLuva`.
- Tampão: sugestão `mepTampao`.
- Prumada: sugestão `mepPrumada`.

### Sistemas

- Esgoto: rascunho `mepEsgoto` existe, não ligado.
- Água fria: sugestão `mepAguaFria`.
- Elétrico: sugestão `mepEletrico`.
- HVAC: sugestão `mepHvac`.
- Estrutura: sugestão `mepEstrutura`.

### Elétrica

- Eletroduto: sugestão `mepEletroduto`.
- Eletrocalha: sugestão `mepEletrocalha`.
- Caixa: sugestão `mepCaixa`.
- Circuito: sugestão `mepCircuito`.
- Quadro: sugestão `mepQuadro`.
- Tomada: sugestão `mepTomada`.
- Interruptor: sugestão `mepInterruptor`.
- Luminária: sugestão `mepLuminaria`.

### Outros

- Aparelho sanitário: sugestão `mepAparelhoSanitario`.
- Bandeja: sugestão `mepBandeja`.
- Tubo flexível: sugestão `mepTuboFlexivel`.
- Equipamento: sugestão `mepEquipamento`.

## Observações

- Colisões já existentes no navegador: `ui/browser/PlantasDeDisciplina.tsx` usa `componentRun` para Hidrossanitário (linha 50), `connection` para Elétrico (linha 51) e `shaft` para HVAC (linha 52). Ao criar os ícones MEP, essas três disciplinas também devem mudar, ou a faixa e o navegador continuam mostrando ícones diferentes para o mesmo sistema.
- `component` é a chave genérica de ferramentas sem família própria (Componente, Colocar móvel, Tubo, Ferramentas externas, Gerenciar suplementos e Módulo aninhado). Trocar o Tubo para `mepTubo` tira só este botão da chave `component`; as demais continuam compartilhando.
- `componentLibrary` é usada pelas quatro Bibliotecas MEP e pela Biblioteca geral (`actions.ts:519`). Os quatro botões de sistema precisam de chaves distintas para se diferenciar.
- Nenhum botão de sistema MEP (hidráulica, elétrica, HVAC) tem chave própria hoje. A única ferramenta MEP, Tubo, usa `component`. Viga, Pilar e Isolada (Estrutura) têm chave própria, mas são de concreto e estrutura geral, não de sistema.
- A chave `soon` é o fallback de centenas de itens em breve em todo o app, então não serve como indicador de sistema.
