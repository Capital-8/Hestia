# Escadas · relatório da pesquisa externa (fonte primária)

Executa o prompt de pesquisa externa (removido; ver histórico do git). **Data da coleta: 2026-10-20.**

> **Desvio assumido em relação ao prompt:** o prompt pede até ~6.000 palavras; este relatório tem ~10.000. A escolha foi
> manter as 78 linhas com citação literal, URL e versão (é insumo direto para `docs/paridade/escadas.md`), em vez de cortar
> evidência verificada. Se o objetivo for só a leitura corrida, use a §1 (tabela-resumo) e a §3 (divergências).

**Ferramentas de acesso usadas.** `web_fetch` (leitura da página inteira, não do trecho de busca) e `web_search` no agente
principal, mais 8 subagentes `opencode` (`opencode-go/deepseek-v4.1-flash`, com `webfetch` próprio) fatiados por seção
(A1–A19, A5–A22, B, C1–C9, C10–C18, D-IFC, D-normas 1–7, D-normas 8–13/23–24). A montagem, as tabelas e a revisão são do
agente principal.

**Hosts que abriram (200):** `help.autodesk.com` (Revit 2026 ENU e PTB, API 2026), `help.graphisoft.com` (AC29, © 2026),
`rvtdocs.com` (API 2021–2027), `raw.githubusercontent.com` (`buildingSMART/IFC4.x-development`, `Autodesk/revit-ifc`),
`web.archive.org`, PDFs de NBR 9050/9077/14718 e IT/NT em sites públicos.

**Hosts bloqueados.** `standards.buildingsmart.org` e `ifc43-docs.standards.buildingsmart.org`: **403** com desafio Cloudflare
(`Enable JavaScript and cookies to continue`) — contornado com o repositório-fonte do schema e com snapshots do Wayback.
`cbmerj.rj.gov.br`: **502 Bad Gateway**. PDF da NBR 9077:2025 em `levantebh.com.br`: abre vazio (camada de texto corrompida).
O antigo bloqueio de `help.autodesk.com`/`help.graphisoft.com` registrado em `docs/05` **não se repete** nesta sessão.

**Legenda.** `[OFICIAL]` documentação do fabricante ou texto da norma/especificação · `[SECUNDÁRIO]` fórum, blog, curso ·
`[NÃO ENCONTRADO]` procurou-se e não se achou · `[EXIGE TESTE]` só se responde abrindo o Revit/ArchiCAD (roteiro na §4).

---

## 1. Tabela-resumo

### Revit, escada por componente

| ID | Categoria | Resposta em uma linha | Fonte |
|---|---|---|---|
| A1 | [OFICIAL] | Rótulos PTB confirmados, e vários diferem do enunciado: "Altura máxima do espelho de degrau", "Profundidade mínima do degrau", "Largura mínima do lance da escada", botão "Regras de cálculo de escada" | help.autodesk.com 2026 PTB GUID-E36AE889 |
| A2 | [OFICIAL] | Cliques das 5 ferramentas confirmados: reto 3 cliques; espirais 2–3 (centro, raio/início, fim); leque L/U é **1 clique** após barra de espaço + snap | 2026 PTB GUID-26053199, -D35D5189, -F521015D, -4E05115C, -560F38C4 |
| A3 | [OFICIAL] | Pick Two Runs exige 2 lances da **mesma sessão de edição** e nível de início/fim coincidente; o patamar se reformata sozinho | 2026 GUID-2C23930C |
| A4 | [OFICIAL] | Só existe regra de **padrão** ("profundidade padrão do patamar = largura do lance"); **não há** regra de mínimo na ajuda | 2026 PTB GUID-D35D5189 |
| A5 | [EXIGE TESTE] | Fórmula de arredondamento não documentada; evidência secundária aponta **ceil**, não round | API 2026 a595b61c + BIM Pure (secundário) |
| A6 | [OFICIAL] | Calculadora usa Architectural Graphic Standards: R+T=445 mm, R·T=1905 mm, 2R+T entre 610 e 635 mm | 2026 GUID-E9368E33 |
| A7 | [OFICIAL] | "Minimum Run Width" é parâmetro de tipo; aviso exato: "Actual run width is less than minimum run width defined in stairs type." | API 2026 4cd90111 + rvtdocs 2021 |
| A8 | [OFICIAL] | Relação documentada só qualitativa: "Alterar a largura do lance de escada irá alterar a largura do patamar conectado" — sem proporção numérica | 2026 PTB GUID-33617010 |
| A9 | [OFICIAL] | "Convert to Sketch-Based" existe para **lance e patamar automático**; Tools > Convert to Sketch-Based, depois Close → editar croqui | 2026 GUID-E1479F1A |
| A10 | [OFICIAL] | Em lance sketchado, Maximum Riser Height e Minimum Tread Depth **não se aplicam**: "does not affect the creation of a sketched run" | 2026 GUID-E36AE889 |
| A11 | [OFICIAL] | Supports: Stringer (Closed) / Carriage (Open) / None, por lado esquerdo, direito e do meio, com tipo e deslocamento lateral | 2026 GUID-E36AE889 |
| A12 | [OFICIAL] | Duas famílias de patamar (monolítico/não-monolítico); espessura no **tipo** ("Espessura monolítica"); instância só tem "Espessura total" (leitura) | 2026 PTB GUID-68BBA40A, -20977DF3 |
| A13 | [OFICIAL] | Nosing Length = balanço do piso sobre o seguinte; Nosing Profile = sweep na borda; Riser Thickness/Profile = espessura e contorno do espelho | 2026 GUID-7189B9BD |
| A14 | [OFICIAL] | Multistory = seleção de níveis (`Multistory: Select Levels`); "Multistory Top Level" **não existe mais** em 2025/2026 | 2026 GUID-CCF34EC3, -4507DC21 |
| A15 | [OFICIAL] | Lista oficial de avisos em `BuiltInFailures.StairRampFailures` (187 membros), com o texto de cada aviso | rvtdocs 2021 + API 2026 4cd90111 |
| A16 | [OFICIAL] | Up/Down Text são propriedades de instância do Stair Path (defaults UP/DN); Tread Number tem Reference/Offset/Justify/Orientation/Number Size, sem checkbox de visibilidade | 2026 GUID-39D8BE87, -48F51A3A |
| A17 | [OFICIAL] | Anotação acima do corte limita-se com "Distance to Cut Mark" + "Show Arrowhead to Cut Mark" (Stair Path Type) e oculta-se por subcategorias `<Above>` no V/G | 2026 GUID-C9CEE41B, -9A78CD98 |
| A18 | [OFICIAL] | Não há troca automática por Coarse/Medium/Fine: duplica-se a vista e controlam-se as subcategorias de Stairs no V/G | 2026 GUID-9D1DE4A7 |
| A19 | [OFICIAL] | 6 alças: extremidade, comprimento do lance, largura do lance, comprimento do patamar, posição do leque, raio da espiral; cadeia conectada desabilita alças | 2026 PTB GUID-0FD4C314 |
| A20 | [OFICIAL] | Monolithic Run (material único, Structural Depth, Underside Surface) × Non-Monolithic Run (tread/riser separados); é o tipo do **run**, não da escada | 2026 GUID-E36AE889 + API `IsMonolithic` |
| A21 | [SECUNDÁRIO] | Blog Ideate (2012) e handout AU AB2086: "Stairs now have two options: Stair by Component and Stair by Sketch" | ideatesolutions.blogspot.com (2012) |
| A22 | [OFICIAL] | A regra é **atual ≥ mínimo**; o aviso aparece quando o piso fica **menor** que o mínimo — a frase "exceeds" da ajuda de 2013 está invertida | API 2026 4cd90111 + rvtdocs 2021 |

### Revit, escada por croqui

| ID | Categoria | Resposta em uma linha | Fonte |
|---|---|---|---|
| B1 | [OFICIAL] | Não existe mais comando "Stair by Sketch" em 2026: o croqui é `Run/Landing → Create Sketch` ou `Convert to Sketch-Based → Edit Sketch` | 2026 GUID-231DC68A, -0EF16913; legado 2016 GUID-6C4F7A35 |
| B2 | [EXIGE TESTE] | Ajuda 2026 não documenta "Actual Number of Risers Created/Remaining" na barra de opções; há contador **temporário** junto ao cursor ao posicionar o lance | 2026 GUID-0EF16913 + vídeo GUID-842A4DB6 |
| B3 | [OFICIAL] | Não há balanceamento automático no croqui; "Balanced" existe só no run L/U-Shape Winder de componente | 2026 GUID-7189B9BD, -560F38C4 |
| B4 | [OFICIAL] | Nº desejado de espelhos vem da altura entre níveis; espelho real = altura ÷ espelhos e nunca passa de Maximum Riser Height | 2026 GUID-541EB756 |
| B5 | [OFICIAL] | Sentido vem da "Up-direction"; Flip mantém o layout e inverte a direção; ordem de desenho dos espelhos não é normatizada na ajuda | 2026 GUID-26053199, -8082193C |
| B6 | [OFICIAL] | Espelho que passa do limite é **aparado** ("they are trimmed"), não é erro; cruzar/tocar/intersectar gera falhas com mensagens fixas | 2026 GUID-0EF16913 + API e66c9b7b |
| B7 | [OFICIAL] | Landing por croqui é laço fechado independente; liga-se ao run só por bordas coincidentes (sem união automática); dividir bordas quando há railing/stringer | 2026 API 0ae077db + GUID-BC9FC54E |
| B8 | [OFICIAL]+[SECUNDÁRIO] | Não há comando "winder por croqui": desenha-se limite externo + espelhos radiais num run comum; sem balanceamento. Passo a passo só em fonte ARKANCE (secundária) | 2026 GUID-0EF16913; ARKANCE UK |
| B9 | [OFICIAL] | Espessura da laje = "Structural Depth" no tipo do run (Underside Smooth/Stepped); "Waist" não é nome oficial no Revit | 2026 GUID-7189B9BD |
| B10 | [OFICIAL] | Em projeto: `Modify \| Stairs > Mode > Edit Sketch`; em modo de edição: selecionar o run/landing e clicar `Edit Sketch` | 2026 GUID-231DC68A, -BC9FC54E |
| B11 | [OFICIAL] | Sim: `StairsEditScope` + `StairsRun.CreateSketchedRun` (e `StairsLanding.CreateSketchedLanding`); não existe tipo `StairsSketchRun` | API 2026 bb782d95 |
| B12 | [OFICIAL] | Pick Lines pega paredes/linhas/arestas, com Offset e Lock na barra de opções; Tab seleciona cadeias inteiras | 2026 GUID-ED1582A8 |
| B13 | [OFICIAL] | Conversão é irreversível ("you cannot convert it back", só Undo) e perde o vínculo automático entre componentes | 2026 GUID-E1479F1A |
| B14 | [OFICIAL] | Regras: bordas não se tocam, espelhos ligam as duas bordas, path do 1º ao último espelho, só linha/arco; mensagens catalogadas | 2026 GUID-0EF16913 + API e66c9b7b |

### ArchiCAD (Stair Tool)

| ID | Categoria | Resposta em uma linha | Fonte |
|---|---|---|---|
| C1 | [OFICIAL] | Trechos confirmados, com correção de nome: o termo oficial é **Break Mark** (não "Breakline Position Height") | AC29 040_ElementsVB-179/-180/-181/-183/-186/-187/-188/-191/-202 |
| C2 | [OFICIAL] | AC29 **não tem** métodos de geometria Straight/Polygonal/Spiral/Curved: entra-se por Baseline (polilinha) + Magic Wand | AC29 -178, -179 |
| C3 | [OFICIAL] | Não há comando "Spiral": espiral = baseline circular/arco + Magic Wand; > 360° exige duas escadas | support.graphisoft.com (19/09/2026) |
| C4 | [OFICIAL] | Sim: Along Arc / Along Chord são **só** métodos de cálculo de comprimento do segmento | AC29 -188 |
| C5 | [EXIGE TESTE] | Nenhum campo de fórmula (Blondel/2R+G) documentado; o painel Rules and Standards só traz faixas mín/máx | AC29 -188 |
| C6 | [EXIGE TESTE] | Sem opções nomeadas "optimal riser"/"lock": há drop-downs recíprocos de nº de espelhos e altura; "Optimum Going Width" só no winder | AC29 -187, -181 |
| C7 | [EXIGE TESTE] | Regra de contagem com patamar não documentada; existem "Number of Treads (total)", "by Flights" e "restart Numbering at Landings" | AC29 060_ElementParameters-28, -202 |
| C8 | [OFICIAL] | Não há "laje" separada: espessura vem do Structure (Monolithic Flat/Stepped/Variable Thickness/Filled; Beam; Landing com espessura própria) | AC29 -192, -193, -191 |
| C9 | [OFICIAL] | Railing associativa à Stair Boundary, criada no Info Box (Right/Left/Both) ou por clique nos nós; apaga-se com a escada | AC29 -207, -205, -179 |
| C10 | [NÃO ENCONTRADO] | AC29 não tem Add/Delete Flight, Add/Delete Landing nem Insert/Delete Winder; existem Continue Stair, Select Segment Type, Turning Type; curvatura por arraste não documentada | AC29 -184 (ver §4) |
| C11 | [OFICIAL] | Patamar **não** é objeto separado: é segmento/turning, e seu contorno faz parte da Stair Boundary | AC29 -180 |
| C12 | [OFICIAL] | Walking Line com seta, componente "Description" (Up/Down) e Numbering (risers ou treads) na planta | AC29 -202 |
| C13 | [OFICIAL] | Dois níveis: 3D/corte Full × Schematic e Detail Level dos símbolos 2D (None/Visible/Hidden/ambos) | AC29 -200, -201 |
| C14 | [OFICIAL] | Não há furo automático ("Create Stair Hole" não existe): "Stairs are not associative to other 3D elements" → Solid Element Operations | AC29 -199 |
| C15 | [OFICIAL] | Falso para AC29: patamar não vira IfcSlab; a escada exporta como IfcStair única (ou contêiner) | AC29 121_IFC-37, -51 |
| C16 | [OFICIAL] | Escada do Stair Tool → IfcStair; "Keep hierarchy" mantém subelementos; IfcStairFlight não é gerado pela tabela AC29 | AC29 121_IFC-37, -48, -51 |
| C17 | [OFICIAL] | Não existe: "The StairMaker Add-on is no longer supported in ARCHICAD 21" | AC29 010_MigrationGuide-13 |
| C18 | [OFICIAL] | Nada da lógica do StairMaker migra; sobrevivem os objetos GDL resultantes, com parâmetros limitados | AC29 010_MigrationGuide-13 |

### Normas brasileiras

| ID | Categoria | Resposta em uma linha | Fonte |
|---|---|---|---|
| D1 | [OFICIAL] | Escadas na NBR 9050:2020 são **6.7/6.8/6.9** (6.6 é rampa; **não existe 6.6.5**): p 0,28–0,32; e 0,16–0,18; 0,63 ≤ 2e+p ≤ 0,65; patamar a cada 3,20 m; corrimão 0,92 e 0,70 m | NBR 9050:2020 (cópia Macaé/RJ) |
| D2 | [OFICIAL] | Vigente é **NBR 9077:2025** (3ª ed., 16.07.2025), que cancela a 2001; a tabela de larguras por população/UP foi substituída por mm/pessoa por perfil de risco | NBR 9077:2025 + 2º projeto de revisão (senge.org.br) |
| D3 | [OFICIAL] | IT 11/2019 (SP) e NT 11/2022 (GO): mínimo geral 1,20 m (1,65 m em H-2/H-3), Blondel 63 ≤ 2h+b ≤ 64 cm; em GO a NT 11/2025 já substituiu a 2022 | IT 11/2019 CBPMESP; NT 11/2022 CBMGO |
| D4 | [NÃO ENCONTRADO] federal | Não há norma federal; referência técnica é 0,80 m para uso restrito (< 20 pessoas, h ≤ 3,7 m, IT 11 5.7.5.1) e 0,80 m em código de obras municipal | IT 11/2019; NBR 9077:2001 4.7.7; Lei 208/96 Rio das Ostras |
| D5 | [OFICIAL] | NBR 9050 não fixa pé-direito de escada; NBR 9077 2,50 m (livre 2,00 m) e IT 11/2019 2,30 m (livre 2,10 m) | NBR 9077:2001 4.5.1.1 d; IT 11/2019 5.5.1.1 d |
| D6 | [OFICIAL] derivado | Nenhuma das duas fixa ângulo: resulta de p/e → 26,6° a 32,7°; inclinação transversal ≤ 1 % (interna) e ≤ 2 % (externa) | NBR 9050:2020 6.8.2/6.8.9 |
| D7 | [OFICIAL] | "50 cm" não existe: a 9050 usa **0,55 m** da borda interna (linha de percurso) + piso ≥ 15 cm no lado interno (7 cm em caracol) | NBR 9050:2020 6.8.6; IT 11/2019 5.7.3.1 c |
| D8 | [OFICIAL] | Guarda-corpo: NBR 14718 ≥ 1,10 m; NBR 9077 1,05 m interno e 0,92 m em escada interna, com 730 N/m a 1,05 m + 1,20 kPa; a 9050 manda atender as duas | NBR 14718:2001 4.3.1.2; NBR 9077:2001 4.8 |
| D9 | [OFICIAL] | Corrimão nos dois lados em **toda** escada/rampa (não depende da largura); altura medida da face superior até o **bocel/quina**; intermediário só se largura ≥ 2,40 m | NBR 9050:2020 6.9.3.2/6.9.3.5; NBR 9077 4.8.4.1 |
| D10 | [OFICIAL] | 1,5 cm é o limite: máximo (9050 6.7.1, IT 11) **e** mínimo (9077 4.7.3.1 e). 2 cm reprova na 9050 | NBR 9050:2020 6.7.1 |
| D11 | [OFICIAL] | Sim, literal: "As dimensões dos pisos e espelhos devem ser constantes em toda a escada"; entre lances, diferença de altura ≤ 5 mm | NBR 9050:2020 6.8.2; NBR 9077:2001 4.7.3.1 d |
| D12 | [OFICIAL] indireta | Só por remissão: a 15575-1 manda tratar irregularidades de escada pela 15575-3 e proteções pela 14718; não fixa geometria | NBR 15575-1:2013, 9.2.3 c/d |
| D13 | [OFICIAL] | Vigente NBR 9077:2025 (3ª ed., 16.07.2025, 51 p., Versão Corrigida 2025) **com Errata 1 de 24.09.2026** | catálogo ABNT/dinmedia + prefácio da norma |
| D23 | [OFICIAL] | A fórmula "p = (2h + b)·n + b" é legítima (NBR 9077:2001 4.7.3.3 a; CBMMG IT 08 5.7.3.3), mas **só vale para escada reta**, n=1 a 3 — não para mudança de direção | NBR 9077:2001; IT 08 CBMMG |
| D24 | [OFICIAL] | 9050:2020 = 0,63–0,65; NBR 9077:2001, IT 11, IT 08 MG, IN 09 SC = 0,63–0,64; DF (Dec. 25.856/2005) = 0,62–0,64; **58–62 e 60–65 sem fonte normativa** | NBR 9050:2020; NBR 9077:2001; IT 11; Dec. DF |

### IFC 4.3

| ID | Categoria | Resposta em uma linha | Fonte |
|---|---|---|---|
| D14 | [OFICIAL] | `IfcStair` só tem `PredefinedType`; `IfcStairFlight` mantém `NumberOfRisers`, `NumberOfTreads`, `RiserHeight`, `TreadLength` **depreciados** (NIL) + `PredefinedType`; o resto vive em Psets | IFC4.3 `Entities/IfcStairFlight.md` |
| D15 | [OFICIAL] | 17 enumeradores em `IfcStairTypeEnum`, incluindo `LADDER` | ifc43-docs (snapshot Wayback 2026-04-11) |
| D16 | [OFICIAL] | 7 enumeradores em `IfcStairFlightTypeEnum`: STRAIGHT, WINDER, SPIRAL, CURVED, FREEFORM, USERDEFINED, NOTDEFINED | IFC4.3 `Types/IfcStairFlightTypeEnum.md` |
| D17 | [OFICIAL] | 6 em `IfcRailingTypeEnum`: BALUSTRADE, FENCE (novo no 4.3), GUARDRAIL, HANDRAIL, USERDEFINED, NOTDEFINED | ifc43-docs (snapshot Wayback) |
| D18 | [OFICIAL] | `LANDING` confirmado em `IfcSlabTypeEnum` ("used to represent a landing within a stair or ramp") | IFC4.3 `Types/IfcSlabTypeEnum.md` |
| D19 | [OFICIAL] | `STRINGER` confirmado em `IfcMemberTypeEnum` ("linear element used to support stair or ramp flights") | IFC4.3 `Types/IfcMemberTypeEnum.md` |
| D20 | [OFICIAL] | `Pset_StairCommon` 19 propriedades, `Pset_StairFlightCommon` 12; **`WaistThickness` existe nos dois**, não em atributo | ifc43-docs (snapshots Wayback) |
| D21 | [OFICIAL] | Revit: escada → `IfcStair`; run → `IfcStairFlight`; patamar → `IfcSlab/LANDING`; stringer → `IfcMember/STRINGER`; corrimão → `IfcRailing` | `Autodesk/revit-ifc` StairsExporter.cs / RailingExporter.cs |
| D22 | [OFICIAL] | ArchiCAD AC29: Stair → IfcStair/IfcStairType; Riser/Tread/Stair Structure → IfcMember; Railing → IfcRailing; sem IfcStairFlight nem IfcSlab/LANDING na tabela | AC29 121_IFC-51, -48 |

---

## 2. Detalhes por ID

### 2.1 Revit · componente (A)

**A1 — nomes PTB (Revit 2026 PTB, 2026-10-20).** Tipo: "Altura máxima do espelho de degrau", "Profundidade mínima do degrau",
"Largura mínima do lance da escada", botão **"Regras de cálculo de escada"** ("Calculadora de escada" via **Editar**), "Tipo de
lance da escada", **"Tipo de patamar"**, "Função", "Método de conexão" (Corte reto/Entalhe), "Extensão/Espessura do entalhe",
"Distância da folga horizontal/vertical", "Suporte direito/esquerdo/do meio", "Tipo de suporte", "Deslocamento lateral".
Barra de opções: "Linha de localização", "Deslocamento", "Largura real do lance da escada", **"Patamar automático"**.
Citação: "Define a largura mínima do piso ao longo do caminho central para todos os lances de escada comuns" —
<https://help.autodesk.com/cloudhelp/2026/PTB/Revit-ArchDesign/files/GUID-E36AE889-D507-4288-90BE-FCE2F120C2B6.htm>.

**A2 — cliques.** Reto: ponto inicial → mover → clique final ("clique para especificar o ponto inicial para o lance da
escada", GUID-D35D5189). Espiral com degrau completo: centro → raio → concluir, anti-horário por padrão, "Inverter" troca o
sentido (GUID-F521015D). Espiral com centro e extremidades: centro → início → fim (GUID-4E05115C). Leque L/U: escolher
ferramenta, definir linha de localização, **barra de espaço** gira a forma, snap na parede e **um clique** coloca:
"Pressione a barra de espaço para rotacionar a forma do lance de escada com degrau em leque" (GUID-560F38C4). Versão 2026
PTB.

**A3 — Pick Two Runs.** Pré-requisitos quando "Patamar automático" não foi marcado: os 2 lances vêm da **mesma sessão de
edição** e "o início ou o fim de um lance de escada seja o mesmo no início ou no fim do nível do outro". Depois `Editar
escadas > Componente > Patamar > Selecionar dois lances de escada`. "Selecione o primeiro lance de degrau. Selecione o
segundo lance de degrau." O patamar "é reformatado automaticamente se a posição ou as cotas do lance da escada forem
alteradas" — <https://help.autodesk.com/cloudhelp/2026/PTB/Revit-ArchDesign/files/GUID-2C23930C-1277-4B7A-9EE7-5CCDE59CA6B1.htm>.

**A4 — patamar automático em L e U.** A forma é derivada do ângulo dos lances ("a forma do patamar é ajustada para acomodar
o novo ângulo do lance de escada"). A **única** regra numérica documentada é o padrão: "A profundidade padrão do patamar é a
mesma que a largura do lance de escada" (GUID-D35D5189). **Não há** mínimo normatizado na ajuda; a forma é editável depois
(alça 4 / "Redefinir a forma de um patamar").

**A5 — Desired Number of Risers `[EXIGE TESTE]`.** Nada de round/floor/ceil na ajuda nem na API; a API só afirma "The number
of risers is calculated based on the height between levels." e "the actual riser height = stairs height / desired riser
number." (`html/a595b61c-…htm`). O secundário BIM Pure (2017) diz "the lowest number of risers you need to not go beyond
Maximum Riser Height" (= ceil), coerente com a falha `StairsIllegalDesiredNumRisers`: "Desired Number of Risers is too
small. Computed Actual Riser Height is greater than Maximum Riser Height allowed by type." Hipótese: **ceil**; confirmar no
teste da §4.

**A6 — Stair Calculator `[OFICIAL]`.** "Riser + Tread = 17.5 inches (445mm): 7.5 inches (191mm) for the riser height; 10
inches (254mm) for the tread depth." · "Riser * Tread = 75 inches (1905mm)." · "2(Riser) + Tread is greater than or equal to
24 inches (610mm) (minimum threshold) or less than or equal to 25 inches (635mm) (maximum threshold)." O diálogo pede os
multiplicadores de Rise e Tread e os resultados máximo/mínimo; "The stair calculator computes the tread depth for new stairs
only" — <https://help.autodesk.com/cloudhelp/2026/ENU/Revit-ArchDesign/files/GUID-E9368E33-2F3C-4B58-9F40-4B852FDF8F4E.htm>.

**A7 — Minimum Run Width.** "Sets the initial value for the width of a common run. This parameter does not affect the
creation of a sketched run." (GUID-E36AE889). Aviso confirmado em duas fontes independentes: "Actual run width is less than
minimum run width defined in stairs type." (`StairsActualRunWidthLessThanMinimumFailure` — API 2026 `html/4cd90111-…htm` e
<https://rvtdocs.com/2021/Autodesk.Revit.DB.StairRampFailures.StairsActualRunWidthLessThanMinimumFailure>). É aviso, não
bloqueio.

**A8 — Actual Run Width × patamar.** Relação só qualitativa: "Alterar a largura do lance de escada irá alterar a largura do
patamar conectado" (PTB GUID-33617010). A página "Modificar as cotas da escada" (GUID-7EA40FA9) não menciona patamar, logo
não existe proporção publicada (ex.: 2× a largura).

**A9 — Convert to Sketch-Based `[OFICIAL]`.** "Select the component stair, and on the Edit panel, click (Edit Stairs). Select
the run or automatic landing component, and on the Tools menu, click (Convert to Sketch-Based). At the confirmation prompt,
click Close." Serve para lance **e** patamar automático —
<https://help.autodesk.com/cloudhelp/2026/ENU/Revit-ArchDesign/files/GUID-E1479F1A-C311-494C-A90A-1CAD3ED7ACE4.htm>.

**A10 — lance sketchado ignora as regras de cálculo.** "Minimum Tread Depth — Sets the minimum tread width along the center
path for all common runs (winder, spiral, and straight). **This parameter does not affect the creation of a sketched run.**"
O mesmo vale para Minimum Run Width. Maximum Riser Height continua entrando pela instância (Actual Riser Height ≤ Maximum
Riser Height) — GUID-E36AE889 e GUID-541EB756.

**A11 — apoios.** "Right/Left Support — Specifies whether a Stringer (Closed), Carriage (Open), or No right support is
created with the stair. A stringer encases the treads and risers. A carriage exposes the treads and risers." Há ainda
Support Type, Lateral Offset, e Middle Support/Type/Number (GUID-E36AE889).

**A12 — patamar.** 2 famílias de sistema (monolítico e não-monolítico). No tipo: "Espessura monolítica — Especifica a
espessura do patamar", Material monolítico, Material do degrau, "Mesmo do lance da escada", Piso, Espessura do degrau,
Comprimento/Perfil do bocel. Na instância: "Altura relativa" e "Espessura total — Indica a espessura do patamar. Este é um
valor de somente leitura." (GUID-68BBA40A, GUID-20977DF3).

**A13 — nariz e espelho.** "Nosing Length — Specifies the amount of the tread depth that overhangs the next tread." ·
"Nosing Profile — The profile for a sweep added to the front or sides of the tread" · "Riser Thickness — Specifies the
thickness of the risers." · "Riser Profile — … The default is Rectangular." Efeito colateral: aviso "Can't end Stairs with
Riser because Riser Thickness is too small." (GUID-7189B9BD).

**A14 — multistory.** "Create a multistory stair from a stair by selecting the building levels." / "Multistory stairs
automatically adjust if level heights change." Alinhamento por "Mid-Landing" ou "Run-Start". **"Multistory Top Level" não
aparece** nas propriedades de 2026 (a API expõe `Stairs.MultistoryStairsId`); a mensagem legada confirma a retirada: "You
have set the stair's multistory top level to None, and Revit will remove this parameter" — GUID-CCF34EC3, GUID-4507DC21.

**A15 — lista de avisos.** Classe `BuiltInFailures.StairRampFailures`, 187 membros, cada um com texto fixo
(<https://rvtdocs.com/2021/Autodesk.Revit.DB.BuiltInFailures.StairRampFailures>; API 2026 `html/4cd90111-…htm`). Os que
importam para o Hestia, verbatim: "The actual riser height for one or more stairs violates the maximum set in the type." ·
"Actual run width is less than minimum run width defined in stairs type." · "Computed actual tread depth of stairs is less
than minimum tread depth defined in stairs type." · "The Actual Tread Depth for one or more Stairs violates the Minimum
Depth set in the type." · "Desired Number of Risers is too small. Computed Actual Riser Height is greater than Maximum Riser
Height allowed by type." · "Can't make monolithic Stairs." · "Can't create nosing on one or more treads." · "Can't create
stringer at landing." · "Some run(s) are deleted, so automatic landing is converted to sketched landing." · e a família
inteira de winder: "A winder leg is too short." · "Two consecutive legs are parallel." · "The relationship between the
current values of Actual Run Width, Minimum Width at Inside Boundary, and Parallel Treads at Start or End does not support
the creation of the winder run."

**A16 — Up/Down e numeração.** Stair Path Instance: "Show Up Text", "Up Text" ("The default value is UP."), "Show Down
Text", "Down Text" ("The default value is DN."), Text Type, Orientation; posicionamento por arraste ("Move a Stair Label"),
sem offset numérico. Tread/Riser Number: Tag Type, Display Rule, Reference, Offset from Reference, Justify, Justify Offset,
Orientation, Number Size — "these numbers are only visible in the view in which they were placed" (GUID-39D8BE87). Ajuste de
fonte de Tread Number: não documentado (só em fórum, `forums.autodesk.com/.../m-p/13210669`).

**A17 — anotação acima do corte.** No Stair Path Type: "Distance to Cut Mark — Specifies the distance at which to stop the
stair path line on both sides of the cut mark symbol." e "Show Arrowhead to Cut Mark". Para ocultar o que está acima: V/G
desligando `<Above>` de Supports/Nosing Lines/Riser Lines e a subcategoria de anotação `<Above> Up Arrows` (GUID-C9CEE41B,
GUID-9A78CD98). Cut Mark Type: Cut Line Type/Distance/Extension/Angle + Cut Mark Symbol/Size (GUID-CF95A04B).

**A18 — nível de detalhe.** A ajuda não mapeia Coarse/Medium/Fine: "you can use the Duplicate View option and the display
control for Stairs subcategories in the Visibility/Graphics dialog." No exemplo "coarse", sobram `<Above> Outlines` e
`Outlines` e desligam-se `<Above> Up Arrows` e `UP Text` (GUID-9D1DE4A7).

**A19 — alças.** 1) extremidade aberta: posição e adiciona/remove pisos/espelhos; 2) seta ao longo do caminho: adiciona/remove
degraus mantendo a altura; 3) seta de largura; 4) seta do patamar: "Arraste o controle de seta para alterar o comprimento do
patamar onde ele está conectado a um degrau."; 5) quadrado do leque; 6) ponto oco da espiral: raio. Cadeia conectada
desabilita alças; não se adicionam degraus abaixo do nível base (GUID-0FD4C314).

**A20 — Monolithic × Assembled.** "Run component types are available from 2 predefined system families: Monolithic Run /
Non-Monolithic Run". Monolítico: Monolithic Material, Structural Depth, Total Depth, Underside Surface (Smooth/Stepped).
Não-monolítico: Tread/Riser com espessuras e perfis próprios e materiais separados. API: `StairsRunType.IsMonolithic` ("True
if the stairs run is monolithic, false otherwise") e "Tread thickness can't be zero for non-monolithic stairs". A página
"About Monolithic Stairs" não existe isolada em 2026. As 3 famílias de escada (Cast-In-Place / Precast / Assembled) são
combinações desses run/landing types (GUID-E36AE889).

**A21 — Revit Learning/Blog `[SECUNDÁRIO]`.** Blog Ideate Solutions, 09/05/2012 (Revit 2013): "In addition to the Stair
Sketch tools from previous Revit versions, a new Component based stair is now available." e "the original sketching tools
are also still available". Handout AU AB2086 (Paul F. Aubin): "Stairs now have two options: Stair by Component and Stair by
Sketch." Não foi localizado post do blog oficial da Autodesk legível na íntegra.

**A22 — direção do aviso.** A regra é **actual ≥ mínimo**; o aviso dispara quando o piso fica **menor**. Textos oficiais:
"Computed actual tread depth of stairs is less than minimum tread depth defined in stairs type."
(`StairsActualTreadDepthLessThanMinimumFailure`, confirmado em `rvtdocs.com` e na API 2026) e "The Actual Tread Depth for one
or more Stairs violates the Minimum Depth set in the type." (`TreadDepthBelowMin`). A ajuda de 2013 ("If the Actual Tread
Depth value exceeds this value, Revit issues a warning") está **invertida** — erro de redação legado.

### 2.2 Revit · croqui (B)

**B1 — "Stair by Sketch" em 2026.** Não existe como comando. Em 2026: `Architecture > Circulation > Stair`, depois
`Run/Landing → Create Sketch` (`GUID-0EF16913`) ou `Convert to Sketch-Based → Edit Sketch` (`GUID-E1479F1A`). A existência no
passado é oficial: "Click Architecture tab Circulation panel Stair drop-down (Stair by Sketch)" (ajuda 2016,
`GUID-6C4F7A35`). O ano da fusão (2018) só tem fonte secundária — ver §3.

**B2 — barra de opções do croqui `[EXIGE TESTE]`.** A página do procedimento lista apenas as ferramentas de desenho; os
campos documentados são os do run de componente. Existe contador textual: "the display continuously updates to show the
number of risers created and the number of risers remaining" (vídeo oficial `GUID-842A4DB6`) — junto ao cursor, não como
campo fixo. Os números formais ficam em Properties ("Desired Number of Risers", "Actual Number of Risers" read-only).
Roteiro na §4.

**B3 — auto balance.** Não existe no croqui: "You can define custom runs by sketching boundaries and risers instead of
having Revit calculate the stair run automatically" (GUID-0EF16913). "Balanced - Symmetrical layout style. (Default)" é
Winder Style do run L/U de componente (GUID-7189B9BD), reforçado por "balance the steps between the winder legs"
(GUID-560F38C4).

**B4 — fórmula do degrau no croqui.** "Desired Number of Risers: The number of risers is calculated based on the height
between levels." + "Actual Riser Height … equal to or less than the value specified in the Maximum Riser Height stair type
property." (GUID-541EB756). Ou seja: espelho real = altura ÷ nº de espelhos, teto = Maximum Riser Height; acima disso a falha
é "Computed actual riser height of stairs is greater than maximum riser height defined in stairs type." Cada espelho
desenhado muda a contagem ("Each riser created changes the count of risers needed to create the stair.", GUID-195B2068);
com Begin/End with Riser, pisos = espelhos − 1 (dedução a partir de "Clearing this option will change the number of risers in
the run.").

**B5 — ordem e sentido.** O caminho é definido em relação à "Up-direction": "Location Line … relative to the Up-direction
path used to create the run" (GUID-26053199). O Stair Path "is used to generate the annotation stair path" e "must start at
the first riser line and end at the last riser line" (GUID-0EF16913). Inverter: "This function maintains the stair layout,
but reverses the original direction." (GUID-8082193C). A ordem de desenho dos espelhos não é normatizada na ajuda, mas a
exigência de o path interceptar todas as cadeias de espelhos fixa a sequência.

**B6 — espelho que passa do limite.** Oficial: "If riser lines extend beyond the boundaries, they are trimmed when the run
is created." Erros reais são os casos de toque/cruzamento — mensagens fixas: "Part of the riser lies on the boundary is not
allowed." · "Crossing risers are not allowed" · "Riser intersects with boundary more than once." · "Only single boundary case
may have riser with its both ends on boundary." · "More than 2 intersection points between riser segment and boundary
encountered" · "The highlighted risers have the same location along the boundary line." · "Actual Number of Risers is
different from Desired Number of Risers. Add/remove Risers or change Desired Number of Risers in Stairs Properties."
(`BuiltInFailures.StairRampFailures`, API 2026 `html/e66c9b7b-…htm`).

**B7 — ligação patamar × run.** O parâmetro `StairsLanding.CreateSketchedLanding` exige um `CurveLoop` fechado de
Line/Arc: "Creates a customized landing between two runs by providing the closed boundary curves of the landing."
(`html/0ae077db-…htm`). Sem vínculo paramétrico: "they do not have the automatic relationship to each other … Sketched
components must be updated manually." (GUID-231DC68A). A ligação é lógica: falhas "Stair element is incomplete, not all
components are logic connected." / "Stair sub-elements are not connected". Para railing/stringer contínuos a orientação
oficial é dividir (Split) as bordas do run onde encontram o patamar (GUID-BC9FC54E).

**B8 — winder por croqui.** Não há comando dedicado: desenha-se um run comum com limite externo + espelhos radiais. Limites
oficiais são os gerais ("Connect riser lines between the left and right boundaries"; arcos permitidos; nada de
balanceamento). O passo a passo de winder por sketch só existe em fonte secundária (ARKANCE UK, "Revit — Creating a Stair
with a Winder using Sketch Stair", 2025-02-13).

**B9 — espessura.** "Structural Depth — If the Underside Surface is smooth, the Structural Depth is the dimension in the
following image" (medida perpendicular à face inferior); "Tread Thickness — Specifies the thickness of the treads."; "Riser
Thickness — Specifies the thickness of the risers." (GUID-7189B9BD). "Waist" não é nome oficial no Revit.

**B10 — editar o croqui.** Em projeto: "Select the stairs. Click Modify | Stairs tab Mode panel Edit Sketch."; dentro do modo
de montagem: "Select a sketched run or landing in stair edit mode, and click (Edit Sketch)." (GUID-231DC68A, GUID-BC9FC54E).

**B11 — API.** `StairsEditScope` + `StairsRun.CreateSketchedRun(document, stairsId, baseElevation, boundaryCurves,
riserCurves, stairsPath)`: "Creates a sketched run in the project document by providing a group of boundary curves and riser
curves." Fora da sessão: "The stairs element represented by stairsId is not in an active StairsEditScope." Há também
`StairsLanding.CreateSketchedLanding`. Nenhum tipo `StairsSketchRun` na referência 2026 (`html/bb782d95-…htm`).

**B12 — Pick Lines.** "Pick options (for example, (Pick Lines)) select existing walls, lines, or edges. When you use Pick
Lines, there is a Lock option … Tip: You can use Tab to toggle to available chains." E offset: "When you use offset with the
Pick Lines option, the element or sketch line is offset from a line specific to an element." (GUID-ED1582A8).

**B13 — o que se perde.** "After you convert a common component to a sketch-based component, you cannot convert it back. It
is now a sketched component. Use the Undo tool to return to the common component, if desired." + "no longer retains the
automatic relationship to other components". Em multistory: "Can't keep elements joined. Avoid converting stairs to
skeched-based component in Multistory stairs."

**B14 — regras de validade.** Ajuda: não conectar bordas esquerda/direita; bordas podem ser linha ou multi-segmento (retas +
arcos); espelhos ligam as duas bordas; espelho que ultrapassa é aparado; path do primeiro ao último espelho; dividir bordas
nos landings. API (`CreateSketchedRun`): só Line/Arc; par de cadeias (esq./dir.) que não se tocam; espelhos em ≥ 2 cadeias
ligando as bordas; path = 1 cadeia que intercepta todas as cadeias de espelhos. Mensagens: "Part of the riser lies on the
boundary is not allowed." · "Crossing risers are not allowed" · "Riser intersects with boundary more than once." · "Only
single boundary case may have riser with its both ends on boundary." · "Path doesn't join to border risers is not allowed." ·
"The stairs path doesn't intersect with riser lines." · "The slope of stringer may not parallel runs and landings. To get a
parallel stringer, split boundary lines at the ends of landings."

### 2.3 ArchiCAD · Stair Tool (C)

Base: Archicad 29 Help (INT, © 2026), pasta `040_ElementsVB/`, lida em 2026-10-20; prefixo
`https://help.graphisoft.com/AC/29/INT/_AC29_Help/040_ElementsVB/040_ElementsVB-<N>.htm`.

**C1 — confirmação dos trechos citados, com correções.**
- Baseline: "The Stair Baseline is placed along the traced polygon/polyline." e "Input is available on the Floor Plan and in
  the 3D window, using methods similar to polyline or Wall input." (-179, -178).
- Segmentos: "A Stair segment can be defined as Flight, Landing, or one of two Winder types." (-183).
- Turning Types: "Automatic Landing / Winder with Equal Angles / Winder with Equal Goings" (-181); Automatic Landing tem
  "minimum Landing length" e "Distribute Extra Landing Length" (-188).
- Estruturas: "Structure types include Monolithic, Beam, Cantilevered, or Stringers Only." (-191); Beams -193, cantilever
  -195, stringers -196, split -197.
- Stair Settings: Main (-186), Geometry and Positioning (-187), Rules and Standards (-188).
- Posição do corte: o termo oficial é **Break Mark**, não "Breakline Position Height": "Set Break Mark position by Height or
  at a particular Riser number" (-202).
- Baseline × boundary: "Boundary editing changes the outer shape of the Stair, but the Walking Line and Baseline stay put."
  (-180); a baseline "can be edited in any window (regardless of Edit mode)".

**C2 — métodos de geometria.** O índice de "Stairs" em AC29 não tem página de Geometry Methods; o Info Box traz "Stair
Baseline Position: Left, Right, Center / Input Stair Upward/Downward / Add Railing to Stair" (-179). Os nomes
Straight/Polygonal/Spiral/Curved **não existem** no Stair Tool atual: eram tipos do StairMaker (ver C17/C18 e §3).

**C3 — espiral.** Fluxo oficial (support.graphisoft.com, atualizado 19/09/2026): desenhar círculo/arco como baseline → Stair
Tool → baseline "Right" → Magic Wand (Space + clique) → ajustar turnings. "spiral staircases that extend beyond a 360-degree
turn cannot be modeled as a single piece"; a solução é duplicar a escada, usar "Linked Top Story: Not Linked", deslocar pela
altura da primeira e pôr "Flight-Start … Vertical Cut" com dx = 0.

**C4 — Along Arc / Along Chord.** "Choose a method to calculate the length of each Stair segment along turnings."; "Along
Arc: segment measured along its arc"; "Along Chord: segment measured along its chord (e.g. for German standard)."; "Along Arc
(Legacy): This method is used by all Stairs in pre-Archicad 25 versions." Só comprimento — não muda a forma da baseline (-188).

**C5 — fórmula `[EXIGE TESTE]`.** "These values define the range of possible input values in the Geometry and Position
Panel" — o painel Rules and Standards só documenta faixas mín/máx/preferido; nenhuma menção a Blondel/2R+G (-188).

**C6 — `[EXIGE TESTE]`.** "Number of Risers — Choose a value from the drop-down list." e "Riser Height — Choose a value from
the drop-down list." (derivados mutuamente, sem cadeado documentado); "Going Depth: Flexible or Fixed" (-187). O único
"optimum" documentado é de winder: "Optimum Going Width: The program automatically finds a Going Width…" (-181).

**C7 — `[EXIGE TESTE]`.** "Number of Treads (total) — Total number of treads in the Stair"; "Number of Treads by Flights —
Lists the number of treads in each flight"; simétrico para risers (`060_ElementParameters-28.htm`). Na numeração: "Numbering:
Choose Risers or Treads" + "restart Numbering at Landings" (-202). A regra de o patamar consumir degrau não está escrita.

**C8 — espessura.** Monolithic tem 4 formas de fundo: "Flat, Stepped, Variable Thickness (at each end), Filled", com
"Below, enter values for the thickness/offset variables as applicable" (-192); Beam: "enter a value for the Beam thickness"
(-193); Landing tem espessura própria e "The 'Uniform attributes' checkbox applies only to Structure attributes, not its
thickness." Não existe objeto "slab" dentro da escada (-199).

**C9 — railing.** "By default, a new Railing is set to be associative to another model element." · "Stair (Railing is
associated to the Stair Boundary)" · "If you delete the parent element, the Railing is deleted too." Criação: "Click one or
both 'Add Railing' options in the Stair Info Box" (Right/Left/Both) ou clicando nos extremos da boundary (-207, -205, -179).

**C10 — `[NÃO ENCONTRADO]`.** A ajuda AC29 documenta apenas Continue Stair (pet palette da baseline), "Select Segment Type"
(Flight/Landing/Winder) e "Turning Type Options"; no Edit Mode vale "you cannot add new Treads, Risers or Structures - you
can just edit existing ones" (-184). Não há Add/Delete Flight, Add/Delete Landing nem Insert/Delete Winder, e o arraste para
curvar a baseline não está documentado (-184; roteiro na §4).

**C11 — contorno do patamar.** Não é objeto separado: "Boundary editing changes the outer shape of the Stair, but the Walking
Line and Baseline stay put." (-180). Controle individual existe só para ocultar trechos: "For any selected Stair segment, use
the Boundary Segment Settings pet palette command". A estrutura Landing é editável isoladamente no Edit Mode, mas não é
elemento autônomo.

**C12 — planta.** "Walking Line End Symbol: Edit Arrow Width/Height" · "Numbering: Choose Risers or Treads" · componentes
listados incluem "Description" (texto Up/Down), todos símbolos 2D independentes do 3D (-202).

**C13 — detalhe.** "Choose either Full or Schematic, to define the display and output of Stairs in Sections/Elevations, and
in the 3D…" (-200) e, no 2D, "Set the Detail level of each Symbol component" (None / Visible Only / Hidden Only / Visible &
Hidden) (-201).

**C14 — furo na laje.** "Stairs are not associative to other 3D elements. To join a Stair to a Slab or to a Wall, use Solid
Element Operations." (-199). Não existe "Create Stair Hole"; o furo é contorno interno da laje e o recorte de parede é SEO.

**C15 — patamar no IFC.** A tabela Built-in IFC Type Mapping do AC29 mapeia Stair → IFCStair/IFCStairType e Tread/Riser/Stair
Structure → IFCMember; **não há linha Landing nem IfcSlab** (-51). "If exported as a single element, it will be a single IFC
entity, which contains within itself the geometry of all its sub-elements." (-37).

**C16 — IfcStair × IfcStairFlight.** "Convert to single element … or Keep hierarchy: Retain the original element's
hierarchical structure, including sub-elements." (-37, -48). O default produz IfcStair única; a tabela AC29 não traz
IfcStairFlight para a Stair nativa (-51).

**C17/C18 — StairMaker.** "The StairMaker Add-on is no longer supported in ARCHICAD 21." (`010_MigrationGuide-13.htm`).
Logo não existe "Create Stair Using Selection". Escadas antigas: "StairMaker Stairs from older-version projects are
converted into GDL Stair-type objects, with limited GDL parameters available from Object Settings." — nada da lógica de
edição migra.

### 2.4 Normas brasileiras (D1–D13, D23, D24)

**D1 — NBR 9050:2020 (4ª ed., 03.08.2020; cópia pública `macae.rj.gov.br/midia/uploads/NBR%209050_2020.pdf`).**
Correção de mapa: **escadas são 6.7, 6.8 e 6.9**; 6.6 é **rampa**; **não existe 6.6.5**.
- 6.8.2: "As dimensões dos pisos e espelhos devem ser constantes em toda a escada…", com 0,63 m ≤ p + 2e ≤ 0,65 m, p entre
  0,28 e 0,32 m e e entre 0,16 e 0,18 m.
- 6.8.7: "As escadas devem ter no mínimo um patamar a cada 3,20 m de desnível e sempre que houver mudança de direção."
- 6.8.8: patamar longitudinal ≥ 1,20 m; em mudança de direção, dimensões iguais à largura da escada.
- 6.9.3.2: "Os corrimãos devem ser instalados em rampas e escadas em ambos os lados, a 0,92 m e a 0,70 m do piso…", medidas
  "da face superior até o bocel ou quina do degrau"; prolongamento ≥ 0,30 m; 6.9.3.5 exige corrimão intermediário se largura
  ≥ 2,40 m.
- 6.7.1: proibido espelho vazado; bocel ≤ 1,5 cm. 6.8.3: largura mínima 1,20 m em rota acessível (e pelo fluxo da 9077).

**D2 — NBR 9077 vigente é a de 2025.** "A ABNT NBR 9077:2025 cancela e substitui a ABNT NBR 9077:2001" (prefácio). 3ª ed.,
16.07.2025, 51 p. A tabela clássica população × ocupação × UP **não existe mais**: o cálculo passa a ser por
"Estratégias de abandono" (6), densidade populacional (Tabela 4), perfil de risco de vida (A1–A4, B1–B4, C1–C4) e largura em
mm/pessoa por saída vertical (9.4). Citação do 2º projeto de revisão (nov/2024, **sem valor normativo**,
`senge.org.br`): "O cálculo da largura das rotas horizontais é realizado multiplicando a população calculada pelos valores
da Tabela 8". As Tabelas 9–11 da versão publicada não são legíveis na cópia pública — ver §6.

**D3 — IT 11/2019 (CBPMESP) e NT 11/2022 (CBMGO).**
- IT 11 5.4.2: "As larguras mínimas das saídas de emergência para acessos, escadas, rampas ou descargas, devem ser de 1,2 m,
  para as ocupações em geral" (1,65 m em H-2/H-3).
- IT 11 5.7.3.1: h 16–18 cm (±0,5 cm), Blondel "63 cm ≤ (2h + b) ≤ 64 cm", lanço máximo 3,70 m; alíneas d/e/f: alturas iguais
  no lance, diferença ≤ 5 mm entre lanços, bocel máximo 1,5 cm.
- IT 11 5.7.5.1: uso restrito (< 20 pessoas, ≤ 3,7 m): largura mínima 0,80 m; e "a parte mais estreita … não tenha menos de
  15 cm para lanço curvo … e 7 cm para espiral".
- IT 11 5.7.1.2: leque/espiral não valem como escada de segurança, exceto mezaninos e áreas privativas.
- NT 11/2022 (GO): 5.4.2.1 com 1,20 m geral e 1,65 m em H-2/H-3, UP = 0,55 m; Anexo A (coeficientes por divisão e
  capacidade da UP) e Anexo C (tipos de escada por altura e ocupação); 5.7.3.1 b repete 63 ≤ 2h+b ≤ 64. **Em GO a NT
  11/2025 (Portaria 3447, 19.05.2025) já está em vigor.**

**D5 — pé-direito.** A 9050 não fixa pé-direito de escada (só 6.11.2.4, portas com 2,10 m). NBR 9077:2001 4.5.1.1 d: "ter
pé-direito mínimo de 2,50 m, com exceção de obstáculos … cuja altura mínima livre deve ser de 2,00 m". IT 11/2019 5.5.1.1 d:
"pé-direito mínimo de 2,30 m … altura mínima livre … 2,10 m". NT 11/2022 5.7.1: 2,5 m / livre 2,10 m.

**D6 — inclinação.** Nenhuma das duas publica ângulo-limite: decorre de p/e, dando 26,6° (0,16/0,32) a 32,7° (0,18/0,28). O
que existe é limite transversal: "A inclinação transversal dos degraus não pode exceder 1 % em escadas internas e 2 % em
escadas externas" (9050 6.8.5/6.8.9).

**D7 — leque.** 9050 6.8.6: "…à distância de 0,55 m da borda interna da escada … os pisos e espelhos sejam dimensionados
conforme 6.8.2". IT 11 5.7.3.1 c: mínimo 15 cm (lanço curvo) e 7 cm (espiral) na parte mais estreita. NBR 9077:2001 4.7.9.1
c: "a borda interna (borda da bomba) do degrau em posição mais desfavorável deve ter, no mínimo, 15 cm". **"50 cm" não
existe em nenhuma delas.**

**D8 — guarda-corpo.** NBR 14718:2001 4.3.1.2: "A altura mínima do guarda-corpo … deve ser de 1 100 mm" (a edição 2019
mantém ≥ 1,10 m e cria classes de carga). NBR 9077:2001 4.8.1.2: "no mínimo, de 1,05 m ao longo dos patamares … podendo ser
reduzida para até 92 cm nas escadas internas"; cargas 4.8.3.1: "730 N/m aplicada a 1,05 m de altura" e "1,20 kPa aplicada à
área bruta da guarda"; corrimão 4.8.3.2: 900 N em qualquer ponto. NBR 9050 6.9.2: "Os guarda-corpos devem atender às ABNT
NBR 9077 e ABNT NBR 14718."

**D9 — corrimão.** Não há largura mínima para "dois lados": a exigência da 9050 6.9.3.2 é incondicional. A largura só muda o
corrimão **intermediário** (9050 6.9.3.5: ≥ 2,40 m; NBR 9077 4.8.4.1: "mais de 2,20 m … no máximo, a cada 1,80 m"). Exceção
da 9077 4.7.5.1 b, escada secundária: "bastando, porém, apenas um corrimão nas escadas com até 1,20 m de largura". Ponto de
medição: **bocel/quina**, não o centro do piso.

**D10 — nariz.** 9050 6.7.1: "a projeção da aresta pode avançar no máximo 1,5 cm sobre o piso abaixo". NBR 9077:2001 4.7.3.1
e: "ter bocel (nariz) de 1,5 cm, no mínimo". IT 11 5.7.3.1 f: "no máximo 1,5 cm". Só **exatamente 1,5 cm** satisfaz as duas;
2 cm reprova na 9050.

**D11 — piso constante.** 9050 6.8.2 (literal, acima) e NBR 9077:2001 4.7.3.1 d: "ter, num mesmo lanço, larguras e alturas
iguais e, em lanços sucessivos de uma mesma escada, diferenças entre as alturas de degraus de, no máximo, 5 mm".

**D12 — NBR 15575.** Regra só por remissão: 15575-1:2013, 9.2.3 c) "queda de pessoas em função de rupturas das proteções, as
quais devem ser ensaiadas conforme ABNT NBR 14718" e d) "…irregularidades nos pisos, rampas e escadas, conforme a ABNT NBR
15575-3". Não há geometria de degrau na 15575. **Atenção:** a edição vigente é **NBR 15575-1:2025** (05.12.2025), não lida.

**D13 — NBR 9077:2025 e errata.** Vigente: 3ª ed., 16.07.2025, 51 p., "Versão Corrigida:2025-07-16"; existe
**"ABNT NBR 9077 Errata 1:2026-09-24"** (dinmedia.de). Mudanças estruturais: capítulo 6 "Estratégias de abandono", densidade
por atividade, perfil de risco de vida, 9.4.4 "Largura para abandono faseado" — substituindo a lógica de unidade de passagem
de 0,55 m.

**D23 — "p = (2h + b)·n + b".** A fonte primária existe: NBR 9077:2001, 4.7.3.3 a), repetida na CBMMG IT 08 (1ª ed.,
Portaria 06/2006), 5.7.3.3 a): "p = (2h + b)n + b", "onde n é um número inteiro (1, 2 ou 3), quando se tratar de escada
reta, medido na direção do trânsito". **Mas** a alínea b) diz "no mínimo, igual à largura da escada, quando há mudança de
direção … não se aplicando, neste caso, a fórmula anterior". Ou seja: a fórmula **não** vale para patamar de mudança de
direção — o uso que se vê em blogs mineiros é leitura errada da norma.

**D24 — faixas de 2e+p.** 9050:2020 6.8.2 a: "0,63 m ≤ p + 2e ≤ 0,65 m". NBR 9077:2001 4.7.3.1 b, IT 11 5.7.3.1 b, IT 08
MG 5.7.3.1 b, CBMSC IN 09: "63 cm ≤ (2h + b) ≤ 64 cm". Faixa municipal **62–64**: Decreto DF 25.856/2005, art. 3º, II
("fórmula de Blondel (62cm=2h+b=64cm…)"). **58–62 e 60–65 não têm fonte normativa primária** — "60–65" aparece em blogs que
atribuem à 9050 um valor que ela não tem.

### 2.5 IFC 4.3 (D14–D22)

Todas as fontes: repositório-fonte `buildingSMART/IFC4.x-development` (branch `master`, IFC 4.3.2 / IFC4X3_ADD2) e snapshots
Wayback de `ifc43-docs`; exportadores: `Autodesk/revit-ifc` e Archicad 29 Help.

**D14 — atributos.** `IfcStair`: só `PredefinedType` (o antigo `ShapeType` foi renomeado no IFC4). `IfcStairFlight`:
`NumberOfRisers`, `NumberOfTreads`, `RiserHeight`, `TreadLength`, `PredefinedType`; os quatro primeiros estão depreciados —
"IFC4 CHANGE The attribute has been deprecated it shall only be exposed with a NIL value. Use
`Pset_StairFlightCommon.NumberOfRisers` instead." `TreadLengthAtOffset`, `TreadLengthAtInnerSide`, `NosingLength` e
`WaistThickness` **não são atributos** em IFC4.3: só existem em Psets.

**D15 — `IfcStairTypeEnum` (17).** CURVED_RUN_STAIR, DOUBLE_RETURN_STAIR, HALF_TURN_STAIR, HALF_WINDING_STAIR, LADDER,
QUARTER_TURN_STAIR, QUARTER_WINDING_STAIR, SPIRAL_STAIR, STRAIGHT_RUN_STAIR, THREE_QUARTER_TURN_STAIR,
THREE_QUARTER_WINDING_STAIR, TWO_CURVED_RUN_STAIR, TWO_QUARTER_TURN_STAIR, TWO_QUARTER_WINDING_STAIR,
TWO_STRAIGHT_RUN_STAIR, USERDEFINED, NOTDEFINED. "Stairs which are subdivided into more than three landings, or stairs with
non-regular shapes are to be defined with type being USERDEFINED or NOTDEFINED."

**D16 — `IfcStairFlightTypeEnum` (7).** STRAIGHT, WINDER, SPIRAL, CURVED, FREEFORM, USERDEFINED, NOTDEFINED.

**D17 — `IfcRailingTypeEnum` (6).** BALUSTRADE, FENCE, GUARDRAIL, HANDRAIL, USERDEFINED, NOTDEFINED. `FENCE` é acréscimo do
IFC4.3: "non-load bearing vertical construction, usually lightweight, which bounds or subdivides an external area."

**D18 — `IfcSlabTypeEnum`.** FLOOR, ROOF, **LANDING**, BASESLAB, APPROACH_SLAB, PAVING, WEARING, SIDEWALK, TRACKSLAB,
USERDEFINED, NOTDEFINED. LANDING: "The slab is used to represent a landing within a stair or ramp."

**D19 — `IfcMemberTypeEnum`.** Contém **STRINGER**: "A linear element used to support stair or ramp flights, usually used
with slope." (lista completa em §2.5 do schema; 21 valores).

**D20 — Psets.** `Pset_StairCommon` (19): Reference (depreciado), Status, NumberOfRiser, NumberOfTreads, RiserHeight,
TreadLength, NosingLength, WalkingLineOffset, TreadLengthAtOffset, TreadLengthAtInnerSide, **WaistThickness**,
RequiredHeadroom, HandicapAccessible, HasNonSkidSurface, IsExternal, ThermalTransmittance, LoadBearing, FireRating, FireExit.
`Pset_StairFlightCommon` (12): Reference (depreciado), Status, NumberOfRiser, NumberOfTreads, RiserHeight, TreadLength,
NosingLength, WalkingLineOffset, TreadLengthAtOffset, TreadLengthAtInnerSide, Headroom, **WaistThickness** ("Minimum thickness
of the stair flight, measured perpendicular to the slope of the flight").

**D21 — Revit → IFC.** Fonte primária é o código do exportador oficial (o help não publica a tabela): escada → `IfcStair`
contêiner; cada run → `IfcStairFlight`; cada patamar → `IfcSlab` com `PredefinedType=LANDING`; suportes/stringers →
`IfcMember` com `PredefinedType=STRINGER`; corrimão → `IfcRailing`. "NOTE: If we are exporting stairs, we are ignoring the
IfcExportAs for the Run, and forcing export to IfcStairFlight." (`StairsExporter.cs`, `RailingExporter.cs`, IFC Exporter
26.4.x). Há fallback para geometria única `IfcStair` se a decomposição falhar.

**D22 — ArchiCAD 29 → IFC.** Tabela "by Element Type": Stair → IFCStair/IFCStairType; Riser → IFCMember/IFCMemberType;
Tread → IFCMember; Stair Structure → IFCMember; Railing → IFCRailing/IFCRailingType. "If exported with the hierarchical
method ('Keep Hierarchy'), it will be an IFC Container entity." **Sem** IfcStairFlight e **sem** IfcSlab/LANDING para a Stair
nativa (-51, -48).

---

## 3. Divergências entre fontes

1. **A22 — "exceeds" × "menor que".** Ajuda 2013 ("If the Actual Tread Depth value exceeds this value, Revit issues a
   warning") × API 2026 e prática ("less than minimum"). Mais confiável: **API 2026**, porque é o texto que dispara a
   `FailureDefinition`; a frase de 2013 é erro de redação legado.
2. **A5 — round × ceil.** Documentação oficial silencia; BIM Pure (2017) diz o menor nº que não estoura o espelho máximo
   (= ceil); um quiz genérico diz "arredonda". Mais confiável: **ceil**, por coerência com `StairsIllegalDesiredNumRisers` —
   ainda assim é hipótese, resolvida só por teste.
3. **A4/A8 — profundidade do patamar.** GUID-D35D5189 afirma que a profundidade **padrão** = largura do lance (regra de
   criação); GUID-33617010 só promete propagação da **largura** ao editar. Coexistem: igualdade na criação, sem garantia
   depois.
4. **A20 — Monolithic.** Ajuda antiga trata "Monolithic" como checkbox do tipo de escada; em 2026 é o tipo do **run/landing**.
   Mais confiável: 2026.
5. **A1 — terminologia PTB inconsistente na mesma versão**: "Finalizar modo de edição" × "Concluir modo de edição"; "Largura
   real do lance da escada" × "Largura real do lance de degrau"; "Profundidade real do degrau" × "Profundidade real do piso".
   Ajuda GUID-7EA40FA9 cita "Altura máxima do lance da escada", que não existe — a correta é "Altura máxima do espelho de
   degrau". Mais confiável: a página de propriedades (GUID-E36AE889).
6. **B1/B6 — croqui.** Fóruns dizem que espelho que não toca o limite é erro; a ajuda diz que só é **aparado** quando
   ultrapassa. Reconciliação: ultrapassar e seguir = trim; tocar/cruzar/intersectar ≥ 2 vezes = falha. Mais confiável: ajuda
   + mensagens oficiais.
7. **B1 — ano da fusão.** CADnotes ("a ferramenta continua lá, só virou opção") × Revit Link/RevitCat ("comando removido").
   Ambos certos em níveis diferentes: o **comando de menu** saiu (2018, só secundárias concordam); a **capacidade de croqui**
   ficou como Create Sketch/Convert. Nenhuma nota "What's New 2018" oficial localizada.
8. **B9 — nome do parâmetro.** Usuários chamam "Waist"; a documentação Revit chama **Structural Depth**. No IFC, aí sim,
   `WaistThickness`.
9. **C2 — nomenclatura ArchiCAD.** Até AC20/StairMaker existiam "21 basic types … from straight runs to winders … and to
   spiral and circular stairs" (AC18 Help). Eram **tipos de escada**, não métodos de geometria. O Stair Tool atual não tem
   Straight/Polygonal/Spiral/Curved. Mais confiável: AC29 (vigente).
10. **C1 — "Breakline Position Height"** não é termo oficial: em AC29 é **Break Mark** (posição por altura ou por nº de riser).
11. **C15/C16 — ArchiCAD no IFC.** Documentação antiga listava "Object > Stair Flight → IfcStairFlight"; a tabela AC29 não
    traz essa linha. Descreve objeto de biblioteca, não a Stair nativa.
12. **D1 — numeração da NBR 9050.** O pedido cita 6.6/6.6.5 para escadas; na 9050:2020 escadas são 6.7/6.8/6.9 e 6.6 é rampa.
    Mais confiável: o texto da norma.
13. **Blondel 63–64 × 63–65.** NBR 9050 admite até 0,65 m; NBR 9077, IT 11, IT 08 MG e CBMSC param em 0,64 m. Para rota
    acessível, adote a interseção **0,63–0,64**.
14. **Guarda-corpo 0,92 m (9077, escada interna) × 1,10 m (14718/9050).** A 9050 manda atender as duas; na prática 1,10 m,
    salvo aceitação formal da exceção da 9077 pelo órgão licenciador.
15. **Bocel: máximo 1,5 cm (9050, IT 11) × mínimo 1,5 cm (9077).** Só exatamente 1,5 cm satisfaz as duas.
16. **D2/D13 — NBR 9077:2001 × 2025.** A 2025 muda a metodologia (perfil de risco, densidade, estratégias de abandono) e é a
    vigente; as ITs estaduais ainda raciocinam em UP. Divergência real entre norma e IT, não erro de leitura.
17. **D3 — GO.** NT 11/2022 foi superada pela NT 11/2025; use 2025 salvo processo protocolado na vigência anterior.
18. **D20 — nome da propriedade:** a nota de depreciação do `IfcStairFlight` manda usar `Pset_StairFlightCommon.NumberOfRisers`
    (plural), mas a propriedade publicada é **`NumberOfRiser`** (singular) nos dois Psets. Mais confiável: a tabela publicada
    do Pset; a nota do atributo tem erro de nome.
19. **D21 × D22 — Revit × ArchiCAD.** O Revit decompõe em `IfcStairFlight` + `IfcSlab/LANDING` + `IfcMember/STRINGER`; o
    ArchiCAD nativo exporta `IfcStair` única (ou contêiner com `IfcMember`). Não há "verdade única": o mapeamento é definido
    pelo exportador. Cada fonte é a mais confiável para o seu.
20. **D20 — `WaistThickness`** aparece nos **dois** Psets no IFC 4.3.2, não só no flight (substitui o PSD antigo `RC4`).

---

## 4. Experimentos para o usuário rodar

**E1 · nº de espelhos (A5).** Revit 2026: níveis 0 e 2,952 m; tipo com Maximum Riser Height = 180 mm (H/máx = 16,4). Criar
Stair by Component e ler "Desired Number of Risers": **17 → ceil**, 16 → round/floor (verificar se aparece aviso e se Actual
Riser Height = 184,5 mm). Repetir com H = 2,898 m (H/máx = 16,1): ceil 17, round 16. Conferir via API/Dynamo
`Stairs.DesiredRisersNumber`, `Stairs.ActualRiserHeight`, `StairsType.MaxRiserHeight`.

**E2 · barra de opções do croqui (B2).** Planta → Architecture > Stair → componente Run → **Create Sketch** → Riser; fotografar
a Options Bar inteira; desenhar 1 espelho e ver se surgem campos "Actual Number of Risers Created"/"Remaining"; comparar com
Properties do run. Observar nome exato e se é read-only.

**E3 · regras do croqui (B6, B14).** Boundary esquerdo e direito paralelos a 1,20 m e 3,00 m; 5 espelhos ligando as duas
bordas. Repetir 4 variantes: (a) **um** espelho 20 cm **além** do limite; (b) espelho que **não toca** o limite; (c) **dois**
espelhos que se **cruzam**; (d) espelho que toca o limite **duas vezes**. Registrar a mensagem exata e se o check verde
(Finalizar) é aceito. Repetir com um arco como boundary.

**E4 · sentido e ordem dos espelhos / Stair Path (B5).** Criar run por croqui de 10 espelhos, anotar posição do 1º espelho e
da seta; aplicar **Flip**; observar o que inverte (seta, Begin/End with Riser, railing, numeração) e se a geometria se move.
Repetir desenhando os espelhos em ordem inversa e ver se o Revit aceita e como fica a seta.

**E5 · divisão (Split) de bordas no patamar (B7).** Escada por croqui com patamar: criar railing e stringer sem dividir as
bordas; depois dividir as bordas do run onde encontram o patamar e repetir. Observar "The slope of stringer may not parallel
runs and landings…" e se o stringer passa a acompanhar o patamar.

**E6 · Convert to Sketch-Based (B13).** Escada de componente com 2 lances + patamar automático: converter o patamar, mudar a
largura do lance e ver se o patamar acompanha (não deve); tentar "converter de volta" (não deve existir comando); testar em
escada multistory (esperar o aviso "Can't keep elements joined…").

**E7 · winder por croqui (B8).** Desenhar boundary externa em L, limite interno em 2 segmentos e 8 espelhos radiais na curva;
observar largura mínima no lado interno que o Revit aceita e se há mensagem de piso mínimo. Comparar com run L-Shape Winder
de componente (Winder Style Balanced × Single-point) para calibrar o que implementar.

**E8 · patamar automático: existe mínimo? (A4).** 2 lances retos com Patamar automático; reduzir a largura do lance a 60 cm;
medir o patamar e tentar arrastar a alça 4 abaixo da largura do lance. Observar se há mínimo imposto.

**E9 · ArchiCAD: tipos de segmento e baseline × boundary (C10, C11).** AC29, Stair Tool, escada reta com 2 segmentos e
Landing. (1) Selecionar um segmento e ler a pet palette inteira (nomes exatos). (2) Inserir nó na baseline e curvar
("Curve Edge"): ver se a escada recalcula e se os goings ficam desiguais. (3) "Continue Stair" para acrescentar um flight e
"Select Segment Type" para converter Flight ↔ Landing ↔ Winder. (4) Entrar no Edit Mode e verificar se aparece qualquer
comando de inserir/apagar flight/landing/winder. (5) Editar a **boundary** e conferir a frase oficial: a Walking Line e a
Baseline não se movem.

**E10 · ArchiCAD: furo na laje (C14).** Criar escada de 2 pavimentos; tentar qualquer parâmetro de Stair Settings que crie
furo (não deve haver); depois fazer o furo como contorno interno da laje e, em separado, com Solid Element Operations.
Comparar o resultado e o comportamento ao mover a escada (o furo deve ficar órfão).

**E11 · ArchiCAD: fórmula e travas (C5, C6).** Stair Settings → Main → "Treads & Risers": percorrer todas as linhas e
pop-ups de nome de regra procurando campo tipo "2R+G"/"Stair Formula" (esperado: só mín/máx/preferido). Em Geometry and
Positioning, verificar se "Number of Risers"/"Riser Height" têm cadeado e se existe "Optimal Riser".

**E12 · ArchiCAD: contagem com patamar (C7).** Escada U com 2 patamares e 18 espelhos; abrir o Listing/Parameters e comparar
"Number of Risers (total)" × "Number of Treads (total)" × "by Flights"; ativar Numbering = Treads com "restart at Landings".
Observar se o patamar entra na contagem e onde reinicia.

**E13 · IFC (D21, D22, opcional).** Exportar uma escada de 2 lances do Revit 2026 e do AC29 em IFC4.3 e inspecionar o arquivo:
Revit deve dar `IfcStair` + `IfcStairFlight` + `IfcSlab(LANDING)` + `IfcMember(STRINGER)` + `IfcRailing`; AC29, com "Convert
to single element" e depois com "Keep Hierarchy", deve dar `IfcStair` única / contêiner com `IfcMember`. Guardar em
`tests/golden/`.

---

## 5. Recomendações de projeto (fato × opinião)

Fatos que o modelo de dados do Hestia precisa acomodar: (1) escada é **montagem** de componentes tipados — run, landing,
support, railing —, e o tipo da escada só escolhe os tipos de run/landing (A20, A12); (2) lance e patamar podem ser
**calculados** (paramétricos, interdependentes) ou **croqui** (independentes, sem vínculo automático) e a conversão é
**irreversível** (B13); (3) no modo croqui as regras de cálculo do tipo **não se aplicam** (A10), mas a altura do espelho
continua limitada pelo tipo (B4); (4) a validação do croqui é geométrica e tem mensagens fixas — bordas que não se tocam,
espelhos ligando as duas bordas, path do primeiro ao último espelho, só linha/arco (B14); (5) patamar padrão = largura do
lance, sem mínimo normativo no Revit (A4) — o mínimo vem de norma (D1/D3), não do programa; (6) no IFC o patamar é
`IfcSlab/LANDING`, o stringer é `IfcMember/STRINGER` e os números migraram para Psets (D14/D20).

Opinião (marcada como opinião): eu começaria pelo caminho **calculado** (lances + patamares automáticos com patamar = largura
do lance), deixaria o modo croqui para a fase seguinte com as mesmas guardas do Revit, e trataria a norma como camada de
**aviso**, não de bloqueio — a NBR 9050 e a 9077 divergem entre si em pontos objetivos (2e+p 63–65 × 63–64; guarda-corpo
0,92 × 1,10 m; pé-direito 2,30 × 2,50 m) e o programa não deve escolher por conta própria. Para o IFC, seguir o mapeamento do
Revit (o mais granular): `IfcStair` → `IfcStairFlight` → `IfcSlab/LANDING` → `IfcMember/STRINGER`.

---

## 6. `[NÃO ENCONTRADO]` e o que abrir manualmente

| Item | O que falta | Onde abrir |
|---|---|---|
| A5 | fórmula de arredondamento do nº de espelhos (round/floor/ceil) | Revit 2026 + experimento E1 |
| A15 | texto exato que a **UI** mostra para cada aviso (a API dá a string, a UI pode abreviar) | Revit 2026, Review Warnings |
| A21 | post oficial do Revit Blog sobre croqui × componente | blogs.autodesk.com ou handout AU AB2086 |
| B2 | campos reais da barra de opções no croqui | Revit 2026 + experimento E2 |
| B1 | nota oficial "What's New 2018" sobre a fusão do Stair by Sketch | help.autodesk.com → Revit 2018 → What's New → Stairs & Railings |
| B5/B8 | efeitos de Flip e procedimento oficial de winder por croqui (não existe na ajuda) | Revit 2026 + E4/E7 |
| C5/C6/C7 | fórmula (Blondel), travas de nº de espelhos/altura, contagem com patamar | ArchiCAD 29 + E11/E12 |
| C10 | Add/Delete Flight/Landing/Winder e curvatura por arraste | ArchiCAD 29 + E9 |
| D2 | Tabelas 9–11 da NBR 9077:2025 (mm/pessoa, tipos de escada) | ABNT Catálogo (norma paga) — a cópia pública tem texto corrompido |
| D4 | largura mínima de escada unifamiliar: **não há fonte federal** | Código de Obras do município da obra |
| D8/D10 | texto integral da NBR 14718:2019 (classes de carga) e da NBR 9050 na edição paga | ABNT Catálogo |
| D12 | NBR 15575-1:2025 e 15575-3:2021 | ABNT Catálogo |
| D13 | o que a Errata 1:2026-09-24 da NBR 9077 corrige | ABNT Catálogo |
| D24 | origem normativa das faixas 58–62 e 60–65 | não localizada; se algum município usa, indicar lei/artigo |

Observações de acesso, para repetir a coleta: `standards.buildingsmart.org` e `ifc43-docs.standards.buildingsmart.org`
respondem **403** (Cloudflare) — use `raw.githubusercontent.com/buildingSMART/IFC4.x-development/master/docs/schemas/...` e,
para as páginas renderizadas, snapshots do `web.archive.org`. `cbmerj.rj.gov.br` deu **502** o dia todo.
