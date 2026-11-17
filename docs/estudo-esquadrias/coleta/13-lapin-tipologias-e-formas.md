# Coleta 13: Lapin, catálogo de tipologias, formas de contorno e variações de abertura

Aprofunda `docs/estudo-esquadrias/02-lapin.md` sem repetir o que ele já cobre (modelo de dados, IFC, bay/bow, garagem em geral, persianas, quadros, decisões numeradas). Aqui: o catálogo completo do que o Lapin sabe construir, parâmetro a parâmetro, as formas de contorno com os casos-limite que o estudo 02 não pegou, e o que cada "variação de abertura" realmente muda no modelo.

Fonte: repositório Lapin (MIT), leitura estática, clone raso em `/home/user/ciuntuc-bim-studio/lapin`. Nada foi executado; os números abaixo vêm do código, não de medições.

Convenções. `[V]` = verificado no código, com `arquivo:linha`. `[I]` = inferência minha. Prefixos: `E:` = `engine/src/Modules/Architecture/Lapin.Architecture/`, `G:` = `engine/src/Geometry/Lapin.Geometry/`, `T:` = `engine/tests/Lapin.Engine.Tests/`, `U:` = `ui/src/modules/architecture/`. Comentários do código estão em inglês.

---

## 0. Achados que valem mais do que o resto

1. **A operação de abertura não muda a geometria 3D.** Em `Joinery.Boxes` há um único ramo para qualquer caixilho de janela (`E:Joinery.cs:1034-1072`) e um único para folha de porta (`E:Joinery.cs:1014`). Correr, basculante, pivotante, projetante, abrir: todos geram as mesmas caixas, na mesma posição, fechadas. A operação só altera (a) a posição da maçaneta, (b) o símbolo 2D (triângulos, setas, arcos de giro), (c) os termos IFC. Exceções reais em 3D: elevar-e-correr (folha na trilha interna, painel fixo na externa), vidro sem moldura (folha de correr pendurada à frente) e garagem (corpo próprio). Detalhe na seção 4. [V]
2. **A regra de 150 mm sob a cabeça e a de `Rise` são o único "contrato" entre forma e altura**, e há um defeito latente no arco `pointed` com `Rise` abaixo de `w/2` (o preset "Tudor" cai exatamente aí). Seção 3.4. [V] para as fórmulas, [I] para a conclusão geométrica.
3. **O portão (`Gates`) é uma tipologia separada** (entidade própria, não `JoinerySpec`), com 7 tipos, 5 tipos de preenchimento, topo plano/arqueado/pontudo e 11 estilos prontos. O "arqueado" do portão não é um arco de círculo: é uma senoide (`E:Gates/Gates.cs:397-405`), embora o comentário diga "a circle's segment". [V]
4. **Vão nu tem menos formas que esquadria:** `BareKinds` não inclui `pointed` nem `gable` (`E:Openings.cs:77`); a UI de vão nu ainda tem uma cópia própria do contorno com 24 passos fixos, sem a regra de cordas (`U:openingShape.ts:20-26`). [V]
5. **Os "estilos" da UI** (Georgian, Tudor, Gothic etc.) são pacotes de preenchimento de campos (forma + caixilharia + ornamentos de fachada), não tipos novos no motor (`U:JoineryDialog.tsx:145-179`). [V]

---

## 1. Catálogo de tipologias

Cinco famílias de objetos distintas, por ordem de generalidade:

| Família | Entidade | Parametrização | Onde |
|---|---|---|---|
| Porta e janela configurável (inclui combinadas, garagem, sem moldura, bay/bow/box) | `IfcDoor`/`IfcWindow` + tipo com `JoinerySpec` | grade de painéis + operações + forma + detalhes | `E:Joinery.cs` |
| Portão (cerca, muro) | entidade `Gates.Class` | `GateKind` + chaves JSON | `E:Gates/` |
| Janela de telhado e lucarna | item dentro de `openings` do telhado | 4 tamanhos + forma da lucarna | `E:Roofs/RoofOpenings.cs` |
| Porta em fachada-cortina | `IfcDoor` agregada à cortina, tipo marcado `curtainDoor` | `leaves`, `operation`, `width`, `height`, `glazed` | `E:CurtainCells.cs:528` |
| Vão nu (sem esquadria) | `IfcOpeningElement` sem preenchimento | largura, altura, peitoril, `shape`, `rise`, reveal, lintel | `E:BareOpenings.cs`, `E:Openings.cs:74-83` |

### 1.1 Os dois tipos-base e suas 16 predefinições

Valores iniciais (`DefaultWindow`/`DefaultDoor`, `E:Joinery.cs:251-269`) [V]:

| Campo | Janela | Porta |
|---|---|---|
| Nome / marca | `Window` / `W` | `Door` / `D` |
| Largura x altura, peitoril | 1,20 x 1,50, peitoril 0,90 | 0,90 x 2,10, peitoril 0 |
| Batente (prof., face, montante, travessa, offset) | 0,07 / 0,06 / 0,08 / 0,08 / 0 | 0,10 / 0,05 / 0,06 / 0,06 / 0 |
| Folha (largura do perfil, prof., espessura de folha, vidro) | 0,07 / 0,08 / 0,04 / 0,024 | 0,10 / 0,06 / 0,04 / 0,024 |
| Colunas, linhas | `[1,1]`, `[1]` | `[1]`, `[1]` |
| Painéis | `tilt-turn-left` + `side-right` | `swing-left` |
| Tábuas de peitoril (int, ext) | 0,20 e 0,05 | 0 e 0 |
| Soleira | 0 | 0,02 |
| Cores (batente, vidro, folha) | `#f2f2f2`, `#9cc8e8`, `#c8a27a` | `#e8e8e8`, `#9cc8e8`, `#c8a27a` |
| Externa, U | sim, 1,1 W/m²K | não |

Nota [V]: `Frame.Depth`/`Sash.Depth` da janela (0,07/0,08) é a profundidade ao longo da parede; a folha é mais funda que o batente. Isso é um padrão, não regra.

Predefinições nomeadas em `JoinerySpecs` (`E:Openings.cs:991-1098`). Colunas e linhas são **pesos relativos** da área útil, não medidas (`Joinery.Splits`, `E:Joinery.cs:482-495`); linhas contam de baixo para cima. [V]

| # | Predefinição | Marca | Vão (L x A) | Grade (cols; linhas de baixo p/ cima) | Painéis | Observações |
|---|---|---|---|---|---|---|
| 1 | Porta | D | 0,9 x 2,1 | 1; 1 | `swing-left` | padrão |
| 2 | Janela | W | 1,2 x 1,5, peit. 0,9 | 1+1; 1 | oscilo-batente esq. + lateral dir. | padrão |
| 3 | Porta dupla | DD | 1,5 x 2,1 | 1+1; 1 | `swing-left`, `swing-right`, `Mullions=[0]` | `Meeting` rebaixado, ativa dir. |
| 4 | Porta de vidro sem moldura em mola de piso | GD | 1,0 x 2,1 | 1; 1 | `double-acting-left` | `Frameless(floor-spring, HoldOpen 90)`, estilo `frameless-glass` |
| 5 | Garagem seccionada | GD | 2,4 x 2,1 | 1; 1 | `sectional-overhead` | ver 1.4 |
| 6 | Garagem enrolável | GD | 2,4 x 2,1 | 1; 1 | `roller` | acabamento `flat` |
| 7 | Garagem basculante | GD | 2,5 x 2,125 | 1; 1 | `up-and-over` | |
| 8 | Garagem seccionada lateral | GD | 2,5 x 2,125 | 1; 1 | `sectional-side-left` | acabamento `v-groove` |
| 9 | Garagem de duas folhas | GD | 2,4 x 2,1 | 1+1; 1 | derivada de #3 | batente 0,09, soleira 0, externa |
| 10 | Porta de varanda + janela | DW | 1,6 x 2,2 | 0,85+0,75; 0,85+1,3 | `swing-left` (2 linhas, vidro), `fixed` sólido, `tilt-turn-right` | PVC, vidro 4-16-4, U 1,1, tábuas 0,20/0,05, soleira 0,02 |
| 11 | Porta com laterais e bandeira | DS | 1,9 x 2,5 | 0,4+1,0+0,4; 2,1+0,35 | lateral fixa, `swing-left`, lateral fixa; bandeira fixa de 3 colunas | folha 0,10 x 0,06, espessura 0,06, vidro 4-16-4, externa |
| 12 | Portal elevar-e-correr (HS) | HS | 3,0 x 2,2 | 1+1; 1 | `fixed`, `lift-slide-left` | batente 0,16 prof., alumínio cinza, U 1,2, soleira 0 |
| 13 | Janela francesa | FW | 1,4 x 2,2, peit. 0 | 1+1; 1 | `tilt-turn-left`, `side-right` | PVC, sem tábuas |

Os números das linhas 10 a 13 vêm de `E:Openings.cs:1034-1098`; as garagens de `E:Openings.cs:1008-1032`. Só estas 13 são "predefinições de projeto"; as de bay estão na seção 1.5 e os estilos de UI na 1.7. [V]

### 1.2 Sistemas de perfil como atalho de tipologia

`Joinery.ProfileSystems` (`E:Joinery.cs:438-445`) fixa batente, folha e perfil de rebaixo por material. O estudo 02 §16.2 já tem a tabela; o que ele não diz é que **só duas predefinições (10 e 13) usam `pvc`**, as demais herdam os padrões genéricos acima, e que `Profile.Drip = false` só no aço. [V]

### 1.3 Papéis (roles) das peças

Toda peça do corpo da esquadria tem um `Role` string livre (`E:Joinery.cs:338`); as cores/materiais mapeiam em `E:Joinery.cs:142`. Papéis que aparecem no código de `Boxes` e nos geradores de forma [V]:

| Papel | O que é | Gerado em |
|---|---|---|
| `frame` | aduela (ombreiras, cabeça, soleira de janela), travessa na nascença do arco, barras da bandeira, mullions/transoms, trilho sob caixilho em porta, baguete e rebaixo do batente, pingadeira do batente | `Joinery.cs:957-1073`, `JoineryShapes.cs:394-455` |
| `sash` | perfil da folha de janela, lábio de sobreposição, baguete da folha, pingadeira da folha | `Joinery.cs:1059-1069` |
| `leaf` | folha de porta (banda + painel cego), folha elevar-e-correr, tira de encontro (astragal), ferrolhos | `Joinery.cs:1003-1033` |
| `glass` | vidro (retângulo, prisma de contorno ou da bandeira) | `Joinery.cs:1010-1066`, `JoineryShapes.cs:407` |
| `muntin` | caixilharia (barras finas), **segue a cor de `sash` ou `frame`** | `Joinery.cs:1152-1163` |
| `board` | tábuas de peitoril interna e externa | `Joinery.Boards` |
| `handle`, `hardware` | punho e fixação (roseta, placa, apoio da barra) | `Joinery.HandleBoxes`, `E:Joinery.cs:891` |
| `keystone`, `head`, `apron` | ornamentos de fachada (pedra-chave, cornija/frontão/capelo, avental) | `E:WindowDressings.cs` |

Barras da bandeira (sunburst, cross, mullions) usam o papel `frame`, e as de janela redonda também (`JoineryShapes.cs:413-455`, `:471-500`). Só as barras de caixilharia (`muntin`) são excluídas do corte em planta (já em 02 §5.4). [V]

### 1.4 Garagem: dimensões que o estudo 02 não listou

`E:GarageDoors.cs` (corpo e problemas) [V]:

- Tamanhos comuns, pré-definidos (`GarageDoors.Sizes`, `E:GarageDoors.cs:44-49`): AU 2,4 / 2,7 / 3,0 / 4,8 / 5,4 x 2,1; EU 2,375 x 2,0, 2,5 x 2,125, 3,0 x 2,125, 5,0 x 2,125.
- Limites: largura 0,6 a 12 m, altura 1,5 a 7 m (`GarageDoors.Problem`, `E:GarageDoors.cs:~78`).
- Restrições: uma coluna, uma linha, um painel; nada de sem-moldura, bay ou forma de cabeça (mesma função). Forma de contorno e garagem são mutuamente exclusivas.
- Constantes: `PanelHeight 0,61`, `SlatPitch 0,075`, `SectionalThickness 0,04`, `RollerThickness 0,012`, `PanelThickness 0,03`, `TrackWidth 0,035`, `TrackHeight 0,05`, `Radius 0,3`, `LowRadius 0,1` (`E:GarageDoors.cs:~52-54`).
- Valores iniciais do `JoineryGarage`: `Sections` nulo (calcula pela altura), `Finish ribbed`, `Wicket false`, `WicketWidth 0,9`, `WicketSide left`, `Track standard`, `Lift 0,6`, `Box inside`, `Mechanism canopy`, `Tracks true` (`E:GarageDoors.cs:23-25`).

### 1.5 Bay, bow, box: os 8 estilos de fábrica com números

Já em 02 §8 está a mecânica; aqui os preços de catálogo (`BayWindows.Styles`, `E:BayWindows.cs:684-711`) [V]:

| Id | Nome | L x A (peit.) | Colunas | Painéis | Projeção, ângulo | Base | Cabeça (tipo, espessura, avanço, inclinação) |
|---|---|---|---|---|---|---|---|
| bay-45 | Bay 45° | 2,4 x 1,5 (0,6) | 1+1+1+1 | oscilo-esq., fixo, fixo, oscilo-dir. | 0,6, 45° | none | hipped 0,12 / 0,10 / 30° |
| bay-30 | Bay 30° raso | 2,6 x 1,5 (0,6) | 1+2+1 | lateral, fixo, lateral | 0,45, 30° | none | lean-to, 20° |
| bay-60-floor | Bay 60° até o piso | 2,2 x 1,6 (0,5) | 1+1+1 | lateral, fixo, lateral | 0,7, 60° | floor (0,25 de espessura, tijolo) | hipped 35°, telha |
| bow-5 | Bow 5 painéis | 3,0 x 1,6 (0,6) | 5 x 1 | lat., 3 fixos, lat. | 0,5 | corbel (3 mísulas por padrão), pedra | hipped 25° |
| bow-4 | Bow 4 painéis | 2,4 x 1,5 (0,7) | 4 x 1 | oscilo, fixo, fixo, oscilo | 0,4 | slab concreto | flat |
| box-glazed | Box envidraçado | 2,0 x 1,5 (0,6) | 4 x 1 | lat., fixo, fixo, lat. | 0,5, 90° | slab | flat |
| box-solid | Box com laterais sólidas (cozinha) | 1,4 x 1,1 (0,95) | 1+1+1 | fixo, oscilo, fixo | 0,4, 90°, `Sides solid` madeira | none | lean-to 15° |
| oriel | Oriel | 2,0 x 1,6 (0,8) | 4 x 1 | oscilo, fixo, fixo, oscilo | 0,6, 90° | corbel (3, pedra) | hipped 35°, telha |

Observação [I]: o `Description` de "bay-45" diz "three faces", mas o estilo tem quatro colunas (`[1,1,1,1]`). Faz sentido pela regra "o meio é dividido em colunas" (02 §8): três faces, centro partido em duas colunas.

### 1.6 Portão, a tipologia que o 02 não toca

`E:Gates/GateKinds.cs` e `E:Gates/Gates.cs`. Entidade própria (`Gates.Class`), `Overall` = largura útil + pilares; o muro hospedeiro é cortado por um prisma retangular de pilar externo a pilar externo, do pé ao topo (`GateCuts`, `E:Gates/Gates.cs:~595-615`). Não participa da cadeia IfcWall/IfcOpeningElement/IfcDoor de 02 §2.1. [V]

**Sete tipos** (`GateKinds.All`, `E:Gates/GateKinds.cs:70-78`):

| Chave | Rótulo | Operação IFC | L x A | Preenchimento | Pilares | Observação |
|---|---|---|---|---|---|---|
| swing | Portão de giro | `SINGLE_SWING_LEFT` | 2,5 x 1,6 | verticalBars | alvenaria | |
| doubleSwing | De giro duplo | `DOUBLE_DOOR_SINGLE_SWING` | 3,6 x 1,6 | verticalBars | alvenaria | |
| sliding | De correr | `SLIDING_TO_LEFT` | 4,0 x 1,6 | horizontalSlats | alvenaria | `gap 0,08`, motor ligado |
| cantilever | De correr em balanço | `SLIDING_TO_LEFT` | 4,5 x 1,6 | verticalBars | aço | `gap 0,10`, motor ligado |
| pedestrian | Pedestre | `SINGLE_SWING_LEFT` | 1,0 x 1,6 | verticalBars | alvenaria | |
| swingWicket | Duplo com porta lateral | `USERDEFINED` ("Double swing gate with a pedestrian door") | 3,6 x 1,6 | verticalBars | alvenaria | `wicketWidth 1,0` |
| folding | Dobrável | `DOUBLE_DOOR_FOLDING` | 3,6 x 1,6 | solid | aço | `panels 2` por lado |

**Parâmetros comuns** (`Common`, `E:Gates/GateKinds.cs:~57-62`) [V]: `gap 0,05` do chão, `frame 0,06`, `spacing 0,12`, `top flat`, `rise 0,25`, `spears false`, `pierSize 0,4` (alvenaria) ou 0,1 (aço), `pierHeight = height + 0,2`, `cap pyramid`, `motor false`, `lock true`, `openingAngle 90`.

**Faixas válidas** (`GateKinds.Params`, `E:Gates/GateKinds.cs:84-102`): largura 0,6 a 12 m; altura 0,6 a 3,5; folga ao chão 0 a 0,3; porta lateral 0,7 a 1,5; painéis 1 a 4 por lado; abertura 45 a 180°; moldura 0,03 a 0,15; espaçamento de barras 0,05 a 0,4; elevação (`rise`) 0,05 a 1,2; pilar 0,05 a 0,9 e altura 0,5 a 4.

**Preenchimentos** (`Infills`): `verticalBars`, `horizontalSlats`, `solid`, `mesh`, `perforated`. Barras: seção `max(0,012, frame*0,33)`, quantidade `floor(vão/espaçamento)`, com ponta de lança opcional (frustum de 7 cm, 8 cm acima do topo). Ripas horizontais: espessura 70 % do espaçamento, só até a altura do ponto mais baixo do topo (`E:Gates/Gates.cs:~523-546`). Sólido tem espessura `min(0,03, frame*0,5)`, malha e perfurado 4 mm. [V]

**Topos** (`Tops`): `flat`, `arched`, `pointed`, com `rise` (m). A função de topo (`E:Gates/Gates.cs:397-405`):
- `arched`: `Altura + rise·sin(π·t)`, `t` da posição no vão (0 a 1);
- `pointed`: `Altura + rise·(1 − |2t − 1|)`, um telhadinho em V invertido, não um arco gótico.
O comentário no código diz "arched: a circle's segment", mas a fórmula é senoidal. [V] para a fórmula, [I] para a discrepância ser descuido e não decisão. Portão de correr ignora o topo (`s.Kind.Slides` → altura reta). [V]

**Estilos prontos** (`GateStyles.All`, `E:Gates/Gates.cs:719-742`), 11: ferro forjado duplo (arqueado, rise 0,35, lanças, esp. 0,11), correr de ripas horizontais (motor), dobrável de aço, pedestre arqueado (rise 0,25, pilar 2,0), madeira de entrada (pontudo rise 0,2, h 1,8, pilar 2,1, lariço), tela de segurança (aço, h 2,0), balanço automático, duplo com porta lateral (rise 0,3), cercado de fazenda (3,6 x 1,2, ripas 0,22, sem trava), correr perfurado, jardim em madeira (1,2 de altura, rise 0,15). [V]

**Papéis e materiais** (`GateKinds.Roles`): `frame, infill, pier, cap, hardware, motor`, com materiais padrão (aço antracite, tijolo aparente, concreto pré-moldado, aço galvanizado, plástico cinza) (`E:Gates/GateKinds.cs:28-40`). [V]

Útil para o Hestia como contraste: o portão **não tem contorno de parede em arco**; a parede é cortada em retângulo sempre. [V] (cortador retangular citado acima)

### 1.7 Estilos da UI (pacotes, não tipos)

`JOINERY_STYLES` (`U:JoineryDialog.tsx:145-160`) e `styleDetails` (`:164-179`) [V]:

| Estilo | Forma | Caixilharia | Ornamentos de fachada |
|---|---|---|---|
| Modern | retângulo | nenhuma | nenhum |
| Classical | retângulo | grid 2 x 3 | alizar 0,16 (proj. 0,04), cornija 0,12, avental, peitoril de pedra |
| Georgian | retângulo | grid 3 x 3 | alizar 0,12, pedra-chave, peitoril de pedra |
| Victorian | `segmental`, rise `w/6` | grid 1 x 2 | alizar 0,10, pedra-chave 0,20, avental com mísulas |
| Romanesque | `round` | nenhuma | alizar 0,20 sem peitoril, pedra-chave |
| Arched casement | `segmental`, rise `w/4`, **sem travessa**, 1 painel `side-left`/`swing-left` | nenhuma | nenhum |
| Baroque | `round`, sunburst com 5 raios | grid 2 x 3 | alizar 0,14, pedra-chave, frontão segmentado rise 0,2, avental |
| Gothic | `pointed` (equilátero), barras = montantes prolongados | nenhuma | alizar 0,10, capelo (`hood`) 0,08 |
| Tudor | `pointed`, rise `0,3·w`, barras = montantes | losango 4 de largura | capelo 0,08 |
| Prairie | retângulo | prairie, margem 0,10 | peitoril de pedra 0,06 |
| Traditional | retângulo | grid 1 x 2 | alizar 0,12, cornija 0,06 |
| Round window (oculus) | `circle`, cruz, **altura = largura**, 1 painel fixo | nenhuma | alizar 0,12, pedra-chave 0,18 |
| Frameless glass | retângulo | nenhuma | sem moldura, `Frameless` padrão |

Todo estilo exceto o último desliga `Frameless` (`U:JoineryDialog.tsx:~161`). `styleModified` compara a spec com o que o estilo aplicaria e mostra "modificado" quando algum campo mudou (`:~181`). [V]

### 1.8 Janela de telhado, lucarna, porta em fachada-cortina

- **Janela de telhado** (`RoofOpening`, `E:Roofs/RoofOpenings.cs:9-27`) [V]: largura 0,78, comprimento (ao longo da água) 1,18, tipo `window`, nome "Roof window".
- **Lucarna** (`dormer`): largura 1,6, comprimento 1,18, `dormerShape` `gable` (padrão) ou `shed`, altura de parede 1,2, inclinação 40° (gable) ou 15° (shed), beiral 0,2, espessura 0,15. Constrói parede frontal com a janela, duas bochechas, telhado próprio com vales exatos e o entalhe na água. Comentário: "BubbleBIM Pro's, ported".
- **Porta de cortina** (`CurtainCells.CreateDoorType`, `E:CurtainCells.cs:528-560`) [V]: 1 ou 2 folhas; operação `swing` ou `sliding`; largura 1,0 (1 folha) ou 1,8 (2 folhas); altura 2,2; envidraçada por padrão; sistema `aluminium`. Painéis de cortina têm tipos próprios: `glass`, `solid`, `framed` (moldura 0,05 x 0,06, vidro recuado 0,01), `empty`; espessura 0,024 (`E:CurtainCells.cs:15-25`).

### 1.9 Acessórios de fachada: números que 02 §10 não trouxe

Padrões dos registros (`E:WindowDressings.cs:23-70`) [V]:

| Acessório | Padrões |
|---|---|
| Venezianas | louvred, 2 folhas, abertas, esp. 0,03, folga 0,01, sobreposição 0,03, passo de aleta 0,05 |
| Grade | `revealInside`, horizontal, barra 0,012, espaçamento 0,10, moldura 0,03, folga 0,03, sobreposição 0,05 |
| Floreira | profundidade 0,20, altura 0,18, `Drop 0,06` abaixo do vão |
| Marquise | projeção 0,6, esp. 0,06, avanço 0,15, elevação 0,15, inclinação 5° |
| Pedra-chave | base 0,14 (topo 1,35x), altura 0,24, 25 % embutida na cabeça, projeção 0,03 |
| Cabeça (`Head`) | cornija: avanço 0,08, altura 0,10, projeção 0,10; frontão `rise 0,25` com triângulo; segmentado: arco `r = (half² + rise²)/(2 rise)` em 24 passos; `hood`: faixa seguindo o arco com retornos de `1,5·h` |
| Avental | altura 0,2, projeção 0,03, mísulas de 0,1 de largura |

Proteção solar (`E:Sunshades.cs:65-125`), padrões [V]: marquise 0,9 de projeção; aletas verticais 0,35 de profundidade, espaçadas 0,6; brise (louvres) lâmina 0,2, esp. 0,03, passo 0,25, ângulo 30°, perfil aerofólio; egg-crate 0,3 de profundidade, 0,45 x 0,5; tela perfurada 6 mm, furo 0,05 em passo 0,1, aço corten; toldo 1,2 de projeção, 20°; pérgola 2,5 de projeção, caibros 0,06 x 0,18 a 0,6; persiana veneziana externa lâmina 0,08, esp. 0,004, passo 0,07, 45°.

---

## 2. Papel das peças: a anatomia que o código implementa

Ordem de construção em `Joinery.Boxes` (`E:Joinery.cs:944-1075`) [V], útil como lista de "o que uma esquadria é" para o Hestia:

1. **Ombreiras** do batente (dois prismas, de 0 até `jambTop`: `Spring` se tem cabeça, senão a altura).
2. **Cabeça**: caixa horizontal (retângulo) ou `HeadBoxes` (arco: faixa, travessa na nascença, vidro da bandeira, barras).
3. **Soleira/fundo** do batente: caixa baixa se `InnerRect.Z0 > 0` (janela tem montante inferior; porta tem soleira de altura `Threshold`).
4. **Barras da grade** (`Bars`): montantes e travessas que não são atravessadas por painel com span (`SpansCol`/`SpansRow`, `E:Joinery.cs:798-799`).
5. **Trilho sob caixilho em porta** (`RailUnder`): caixilho na fiada de baixo de uma porta recebe uma travessa do batente sob ele.
6. **Por painel**: elevar-e-correr (anel `leaf` na trilha interna + vidro + maçaneta longa), folha de porta (banda `leaf`, vidro, baguete se há `Profile`, encontro, maçanetas nas duas faces), vidro fixo (vidro + muntins + rebaixo + baguete), caixilho de janela (banda `sash`, vidro, muntins, rebaixo, lábio, baguete, pingadeira, maçaneta).
7. **Pingadeira** na peça inferior externa do batente da janela.
8. **Tábuas** de peitoril.

Pontos finos:

- A **folha de janela é uma banda entre dois recuos** do painel (`Band(0, sh.Width, …)`), com o vidro **recuado `sh.Width`** (`Sheet("glass", sh.Width, …)`); a baguete (`Profile.Bead`) é uma segunda banda interna junto ao vidro, 18 mm de profundidade (`:1041-1067`). Para folha de porta, a banda se chama `leaf` e usa espessura própria `LeafThickness`, não profundidade. [V]
- O **vidro fixo vai direto no batente** (recuo 0): "glazed straight into the frame (a rebate holds it, beads inside)" (`:1034-1043`); o rebaixo externo é uma banda `frame` do vidro até a face externa do batente (`Band(0, pr.Rebate, yc + infillT/2, y1, "frame")`). [V]
- A **espessura do vidro vem da composição** "4-16-4" quando `Sash.Glazing` existe (`GlazingBuildUp.Parse`), e o motor rejeita composição mais grossa que `max(Sash.Depth, Frame.Depth) − 4 mm` (`E:Joinery.cs:~627`). [V]
- **Painéis `solid`** usam espessura `max(LeafThickness, GlassThickness)` (`:1000`), não a do vidro. [V]
- A **soleira de porta** é `max(0, Threshold)`; a janela tem fundo de montante `Frame.Width` (`E:Joinery.cs:468-480`, `InnerRect`). [V]

---

## 3. Formas de contorno

A matemática de `Rise`/`Top`/`Head`/`Ellipse`/`outline` está completa em 02 §3. Não repito. Aqui: o que ele não verificou, os casos-limite, as regras de cordas, e as divergências entre a cópia do contorno na UI e no motor.

### 3.1 Regra de cordas, com os números reais

`Chords` (`G:Chords.cs`) [V]:

- Tolerância de corda 1 mm (`Tolerance = 0.001`), passo máximo 15° (`MaxStep = π/12`), mínimo 0,5° (`MinStep = π/360`).
- `Step(R) = clamp(2·acos(1 − 1 mm / R), 0,5°, 15°)`. Se `R ≤ 2 mm` devolve `maxStep`.
- `Count(R, varredura, min) = max(min, ceil(|varredura| / Step(R) − 1e-9))`. O `−1e-9` evita arredondar para cima um múltiplo exato.
- `Circle(R) = Count(R, 2π, 3)`: **mínimo 24 lados** (por causa do passo máximo de 15°), 3 só se a regra desse menos, o que não ocorre.

Tabela derivada [I, calculada a partir de `Step`; não executada]. `Step(R) = 2·acos(1 − 0,001/R)` em graus:

| Raio R | Passo | Peças em 180° (semicírculo) |
|---|---|---|
| 0,05 m | 15° (satura) | 12 |
| 0,30 m | 15° | 12 |
| 0,60 m (janela de 1,2 m) | ~5,4° | ~34 |
| 1,50 m | ~3,4° | ~54 |
| 5 m | ~1,8° | ~100 |
| 105 m ou mais | 0,5° (satura) | 360 |

Como a cabeça tem **mínimo de 32 peças** (`MinPieces = 32`, `E:JoineryShapes.cs:256`), um semicírculo de 1,2 m (34 pelo cálculo) praticamente coincide com o piso, e arcos pequenos (menos de ~0,5 m de raio) ficam em 32, mais finos que o necessário. [V] para a constante, [I] para a tabela.

**Como cada forma chama a regra** (`E:JoineryShapes.cs:195-253`) [V]:

| Forma | Pontos | Raio usado em `Count` | Mínimo |
|---|---|---|---|
| `gable` | 3 (`half, 0, −half`) | n/a | n/a |
| `segmental` | arco entre as ombreiras, ângulos `a0 = acos(half/ρ)` a `π − a0`, `ρ = R − inset` | `ρ` | 32 |
| `elliptical` | passos iguais do ângulo da elipse, `x = half·cos(π·i/n)` | `max(a²/b, b²/a)` (raio da parte mais plana) | 32 |
| `radiused` | quarto de círculo em cada canto, reta no meio | `rc = f − inset` | 16 por canto (`MinPieces/2`) |
| `pointed` | cada metade um arco com centro no lado oposto; ápice em `x = 0` exato | `ρ = r − inset` | 16 por metade |
| `round` (padrão) | semicírculo em passos iguais | `half` | 32 |
| `circle` (elipse completa) | `Ellipse`, mesma contagem para todo recuo, para o anel casar ponto a ponto | `max(a0²/b0, b0²/a0)` do contorno **externo** | 48 |

Detalhes que o 02 não registra:

- **Fallbacks silenciosos.** `segmental` com `ρ ≤ half` cai no ramo `default` (semicírculo): `if (rho <= half + 1e-12) goto default;` (`:213`). Quando o recuo do batente é grande, um arco raso vira semicírculo de raio `half`, que **não é** o arco recuado. [V] [I] sobre o efeito visual (a banda do batente deixa de ter espessura uniforme).
- **`radiused` com recuo maior que o raio**: `rc ≤ 1e-9` devolve dois pontos retos (`:231`), com a cabeça do vidro voltando a ser um retângulo. O topo continua sendo `Top(…)` em cada ponto. [V]
- **`pointed` com `rho ≤ 0`**: o ramo usa `[half, 0]` direto (`:241`). [V]
- Em `Head(...)` as pontas ficam **exatamente sobre as juntas**: `xs[0] = half; xs[^1] = -half` para o semicírculo (`:249`) e `right[0] = half; right[^1] = 0` para o pontudo (`:242`), para não deixar fresta por erro de ponto flutuante. [V]
- `Clean` remove pontos repetidos em até 1e-7 e o ponto final se coincidir com o inicial (`:298-304`). [V]

### 3.2 Parâmetros de cada forma (resumo útil, só o que muda o resultado)

`Rise` (altura da cabeça) por forma, limites (`E:JoineryShapes.cs:125-139`) [V]:

| Forma | Padrão | Faixa aceita | Teste (L 1,2, A 2,0) |
|---|---|---|---|
| `round` | `w/2` | fixo | 0,6 |
| `segmental` | `w/6` | 0,02 a `w/2` | pedido 0,2 → 0,2 |
| `elliptical` | `w/4` | 0,02 a `w` | padrão 0,3; pedido 0,45 → 0,45 |
| `radiused` | 0,15 (raio do canto) | 0,01 a `w/2` | padrão 0,15; pedido 1,0 → 0,6 |
| `pointed` | `w·√3/2` | mínimo 0,05, sem teto próprio | padrão 1,0392304845413265 |
| `gable` | `w/4` | mínimo 0,02, sem teto próprio | pedido 0,3 → 0,3 |

Todos limitados por `Altura − 0,15`. Os números da última coluna são os `InlineData` de `T:JoineryShapeTests.cs:27-34`, exatos até 9 casas (`Assert.Equal(expected, …, 9)`). O teste também afirma que o contorno encontra as ombreiras na nascença e alcança a altura total no meio, **para todos os 8 casos** (`:41-43`), e que todas as caixas ficam `≤ 2,0` (`:49`). [V]

### 3.3 `elliptical` com `rise > w/2`: forma "de ovo", sem ponto de apoio

`Rise` de `elliptical` vai até `w` (`E:JoineryShapes.cs:132`), mas o tratamento é de meia-elipse com semi-eixo menor `b = f − inset`; para `f > w/2` a meia elipse é mais alta que larga (um arco "alto"). Para `inset > 0` valem ambos os semi-eixos reduzidos, então a banda do batente é aproximadamente uniforme. [V] para fórmula, [I] sobre o aspecto geométrico.

### 3.4 Defeito latente em `pointed` com `Rise < w/2` [V fórmula, I conclusão]

A fórmula do arco pontudo (`E:JoineryShapes.cs:178-182`, `Top`):

`r = (f² + w²/4) / w`, centro de cada meia em `x = ±(w/2 − r)`, `top = zs + sqrt((r − inset)² − (|x| − (w/2 − r))²)`.

Para `f ≥ w/2`, `r ≥ w/2` e `w/2 − r ≤ 0`: cada arco tem centro **do outro lado do eixo**, e o ápice é um bico em `x = 0` (arco gótico correto). Para `f < w/2` temos `r < w/2` e o centro passa para o **mesmo lado** do arco (`w/2 − r > 0`). A derivada de `top` em `|x| = 0⁺` fica positiva: a curva **sobe** do eixo até `x = w/2 − r` e só então desce até a nascença. O ponto mais alto passa a ser `zs + r`, que é **maior** que `zs + f`.

Exemplo numérico com o preset **Tudor** (`rise = 0,3·w`, `U:JoineryDialog.tsx:156`): `r = (0,09 + 0,25)·w = 0,34·w`, `w/2 − r = 0,16·w`; no eixo `top = zs + 0,3·w`, em `|x| = 0,16·w` `top = zs + 0,34·w`. Ou seja, **o arco "Tudor" produzido pelo motor tem um vale no meio e passa 0,04·w acima da altura do vão** [I]. Os testes só cobrem `pointed` com `Rise` nulo (equilátero) em `T:JoineryShapeTests.cs:33`, que satisfazem `f = w√3/2 ≥ w/2`. `Joinery.Problem` não valida a relação entre `Rise` e `w` para `pointed` (`E:Joinery.cs:606-657`). Se o Hestia portar esta função, **limitar `f ≥ w/2`** (ou usar outra construção para arco rebaixado, como o arco de quatro centros) é uma decisão de projeto, não detalhe. [I]

Do mesmo modo, `Head` para o ramo `pointed` usa `Acos((half − cx)/ρ)` e `Acos(−cx/ρ)` (`:241`) sem verificar o sinal de `cx`, e `right[0] = half; right[^1] = 0` força as pontas; com `cx > 0`, o resultado é uma polilinha não convexa. O corte por Cyrus-Beck para caixilharia em painéis que seguem o arco (`ClipConvex`, `:105-122`) exige laço convexo (comentário: "a convex loop running counter-clockwise") e então só vale para arcos convexos. O preset Tudor não aciona isso porque usa `transom` (padrão, não `ArchedPanes`). [V] para o requisito, [I] para o risco.

### 3.5 Caso `round` com altura baixa (a observação do 02 §3.1, com o que dá para dizer)

`Rise(round) = min(w/2, max(0, H − 0,15))` (`:138`). Se `H − 0,15 < w/2` (por exemplo largura 1,2 e altura 0,7), `f = 0,55 < 0,6` e `Spring = 0,15`. Mas `Top` para `round` ainda usa `sqrt((w/2 − inset)² − x²)` (`:159-160`), ou seja, raio `w/2` fixo: no eixo `top = zs + w/2 = 0,15 + 0,6 = 0,75 > H`. A cabeça "salta" 5 cm acima da altura declarada. Nenhum teste cobre isso (o teste de `round` é com `H = 2,0`). [V] fórmulas, [I] consequência. Correção óbvia para um port: em `round`, usar `f` como semi-eixo (virar elipse) ou limitar `w` ao diâmetro permitido.

### 3.6 Janela redonda e contorno livre (anel)

- `circle` (`Ellipse`, `:265-271`): elipse completa preenchendo `L x A`. A **altura mínima** é `2·Frame.Width + 0,1` e a largura também (`E:Joinery.cs:~636`). O preset "Round window" força `altura = largura`. [V]
- `outline`: laço no cubo unitário, orientação corrigida (`SignedArea < 0` → inverte), recuo por `Polygon2.Offset`. Só janela (`Joinery.Problem` recusa porta com contorno livre). Área interna mínima do vidro: `SignedArea(inner) ≥ 0,01 m²`. [V]
- Um tipo "anel" (`Ringed`) **não tem grade**: `RoundBoxes` gera moldura (com furo), vidro, e barras só se for `circle` (`Angles()` devolve `[]` para `outline`, `:488`). `InnerRect` devolve o quadrado inscrito na elipse (`/√2`) apenas para posicionar símbolos. [V]
- A prancha de contorno (`E:JoineryOutlineBoard.cs`, 189 linhas) aceita polilinha fechada, círculo, elipse, ou linhas e arcos encadeados. [V cabeçalho citado em 02]

### 3.7 Vão nu: menos formas, e a UI replica o contorno com regra pior

- Formas aceitas: `rect, segmental, elliptical, round, radiused, circle` (`E:Openings.cs:77`). **Faltam `pointed` e `gable`**, que existem para esquadria. O comando que converte esquadria em vão nu troca ponta e gable por retângulo: `"a pointed or a triangular head becomes a rectangle"` (`E:BareOpenings.cs:186`). [V]
- A janela de vão nu da UI (`U:openingShape.ts:1-60`) tem `STEPS = 24` fixo e um `riseOf` diferente do motor: `round` usa `min(width/2, height)` (o motor, `min(w/2, H − 0,15)`); o limite do `rise` é `height` (o motor, `H − 0,15`). `round` e `elliptical` compartilham o mesmo ramo na UI, com semi-eixo menor `max(f − inset, 1e-6)`. Isso é só a **imagem da prévia**; o corte real usa `Outline(sized, 0, 0)` do motor. [V]
- O vão nu também aceita **contorno próprio** (desenhado numa elevação/seção): `shape = "outline"`, `profile`, `profileArcs` (`E:Openings.cs:~84`); as arestas em arco usam `ArcOutline`. [V cabeçalho]

### 3.8 O que cada forma NÃO faz

- Porta com `outline` é recusada (`E:Joinery.cs:~638`). Garagem e sem-moldura recusam qualquer forma. Bay/bow/box recusam forma: as faces carregam a forma (02 §4). [V]
- **Muntins não aparecem na bandeira**: o vidro da cabeça (`HeadBoxes`) **não** passa por `Muntins` (a função só é chamada nos ramos de painel, `:1040`, `:1066`); só as barras de `shape.bars` dividem a bandeira. [V]
- **Em janela redonda, `sunburst` usa mínimo de 3 raios** (`Math.Clamp(Spokes, 3, 24)`, padrão 8), enquanto na bandeira o mínimo é 1 (`Clamp(Spokes, 1, 24)`, padrão 5). [V `JoineryShapes.cs:421-423`, `:486`]
- As **barras** têm largura `max(0,015, Frame.Mullion·0,4)` na bandeira e `·0,5` no círculo; a profundidade é `±30 %` da profundidade do batente em torno de `Frame.Offset` (`:418`, `:481`). [V]

---

## 4. Variações de abertura: o que muda e o que não muda

### 4.1 Lista completa de operações do código

`E:Joinery.cs:363-378` [V]:
- 12 de janela: `fixed`, `side-left/right`, `tilt-turn-left/right`, `bottom-hung`, `top-hung`, `pivot-horizontal`, `pivot-vertical`, `sliding-left/right`, `sliding-vertical`.
- 16 de porta: `swing-left/right`, `double-acting-left/right`, `door-sliding-left/right`, `folding-left/right`, 5 de garagem, `lift-slide-left/right`, `tilt-slide-left/right`.

### 4.2 Matriz: o que cada operação altera [V]

| Operação | Corpo 3D | Maçaneta | Símbolo de elevação | Planta |
|---|---|---|---|---|
| `fixed` | vidro direto no batente | nenhuma | cruz (X) na convenção "handle"; nada na "hinge" | nada |
| `side-*`, `swing-*`, `double-acting-*` | folha fechada | lateral oposta à dobradiça (`HandleSide`, `:792`) | triângulo com ápice no puxador (ou na dobradiça, DIN) | folha aberta a 90° e arco só em `SwingsInPlan`; janela só com o modo de giro ligado |
| `tilt-turn-*` | igual a side | lateral | triângulo + triângulo de baixo | só o giro lateral (`SashSwingsInPlan`) |
| `bottom-hung`, `top-hung` | igual | no topo/base, deitada (`Across`) | triângulo de base / topo | nada |
| `pivot-horizontal/vertical` | igual | **sem maçaneta** (`HandleSide` nulo) | eixo tracejado + dois V | nada |
| `sliding-*` (janela), `door-sliding-*` | igual à folha fechada, **sem trilho nem deslocamento em 3D** | lateral oposta ao sentido | seta | nada (porta: arco só em `SwingsInPlan`, que não inclui correr) |
| `sliding-vertical` | igual | nenhuma | seta vertical | nada |
| `folding-*` | igual | nenhuma (`HandleSide` nulo) | dois V quebrados | nada |
| `lift-slide-*`, `tilt-slide-*` | **anel `leaf` na trilha interna** (profundidade `min(Sash.Depth, Frame.Depth/2)` a partir da face interna do batente); painéis fixos ao lado na trilha externa; maçaneta longa | tipo "window" | seta + seta ou triângulo | símbolo com setas |
| garagem (5) | corpo próprio (seção 1.4) | `lever` | juntas, janelas | cortina, trilhos e painel aberto tracejado |

Fontes: lista de `HandleSide` (`E:Joinery.cs:792-793`), `SwingsInPlan` (`:448-449`), `SashSwingsInPlan` (`:452`), `OpeningMarks` (`E:JoinerySymbols.cs:208-258`), ramo elevar-e-correr (`E:Joinery.cs:1003-1013`). [V]

Consequências para o Hestia [I]:
- Um modelo de janela que só precisa de **geometria fechada + símbolo + termos IFC** pode tratar a operação como metadado. O Lapin trata assim, e só exige geometria diferente para elevar-e-correr, sem-moldura e garagem.
- A convenção do símbolo é um **parâmetro de projeto**, não do tipo: `joinerySymbols.convention` ("handle" ou "hinge") e `hardware` (`E:Joinery.cs:~385-392`, `SymbolSettings`). Na "handle", painel fixo ganha X; na "hinge" (DIN 1356) não. `windowSwing` ("auto", "none", "dashed", "solid") controla o giro em planta; "auto" desenha tracejado só para caixilhos cujo fundo está a `≤ ReachesFloor = 0,15` do piso (`E:Joinery.cs:465`, `E:JoinerySymbols.cs:142-153`). [V]

### 4.3 Posição da maçaneta

`HandleAt` (`E:Joinery.cs:868-880`) [V]: recuo da borda `Handle.Inset + Handle.Width/2`; para folha de porta o centro está a `min(Z0 + clamp(Hardware.Height ?? 1,05, 0,3, 2,2), meio + 0,3)`; para janela, no meio da altura do painel. Para `bottom-hung`/`top-hung` a maçaneta fica no meio da largura, junto da borda, deitada. Constantes de `Handle` em 02 §16.3.

### 4.4 Folhas que se encontram

Já em 02 §6. O que falta: `Meetings` só detecta par quando **a barra entre as colunas vale 0**, a esquerda é `swing-left`/`double-acting-left` e a direita `*-right`, e as faixas de linhas se sobrepõem (`E:Joinery.cs:529-545`). Para folhas `double-acting` o tipo é sempre `butt` (`:538`). [V]

### 4.5 Abertura de portão

`openingAngle` (45 a 180°, padrão 90), definida por tipo e pelo parâmetro `open` ao desenhar (`E:Gates/Gates.cs:436`). Folha única articulada a `x1 − 0,01` (porta lateral e portão pedestre); duas folhas com dobradiças em `x0 + 0,01` e `x1 − 0,01`; dobrável: `panels` por lado, cada painel de largura `(vão/2 − 0,02)/panels`; correr: folha em `lx0 = −L/2 − 0,1` (balanço: `−0,05`), zona de estacionamento tracejada, setas de sentido. [V]

---

## 5. Quadro de estudo para o Hestia (inferências, sem decisão do dono)

Sugestões decorrentes deste aprofundamento, todas [I]:

1. **Arco rebaixado com cantos.** Se o Hestia quiser arco gótico "baixo" (Tudor), não usar a fórmula do Lapin sem restringir `f ≥ w/2`; o caminho robusto é a construção de quatro centros. O arco gótico equilátero e o lanceta (`f > w/2`) são seguros.
2. **Contrato forma vs altura.** Fixar um invariante parecido ao do Lapin ("sobram 150 mm de retângulo sob a cabeça") e **estendê-lo** para o semicírculo, que no Lapin o ignora.
3. **Cordas.** A regra `2·acos(1 − tol/R)` com passo limitado entre 0,5° e 15° é barata e consistente; o mínimo de 32 peças por cabeça é um piso de qualidade, não uma exigência da tolerância. O Hestia pode adotar a mesma função em todo o motor (parede curva, tubos, cabeça).
4. **Mesmo `n` para contorno externo e interno do anel.** O Lapin usa o mesmo número de pontos para todos os recuos de uma elipse (`:265-271`), para que o par de laços seja homólogo ponto a ponto e a banda do batente triangule sem remendos. É uma ideia para o planejado trabalho de booleana por contorno.
5. **Operação como metadado.** Copiar a separação "geometria fechada + símbolo + IFC" reduz o tamanho do catálogo: nenhuma das 12 operações de janela muda o corpo.
6. **Papéis de peça.** O conjunto `frame, sash, leaf, glass, muntin, board, handle, hardware` (mais `keystone, head, apron` para fachada) é suficiente para colorir e quantificar; o Lapin liga cor e material por papel, com `muntin` seguindo `sash` ou `frame`.
7. **Portões** e **fachadas-cortina** são tipologias à parte, com entidade própria; não vale forçá-las dentro do mesmo registro de esquadria. O Lapin as separou.

---

## 6. Limites desta coleta

- Leitura estática; nenhum teste foi rodado, então comportamento citado como "latente" na seção 3.4 e 3.5 foi derivado das fórmulas e não observado. Para confirmar, bastaria um teste que chame `JoineryShapes.Top` com `pointed` e `Rise = 0,3·w`, e outro com `round` e `H − 0,15 < w/2`.
- Não li `E:JoineryOutlineBoard.cs`, `E:RoomOpenings.cs` nem `U:JoineryDialog.tsx` por inteiro. Os números de `JoineryGarage`, `Gates` e `Sunshades` vêm de leitura direta; onde há `~` no número de linha o intervalo é aproximado.
- Os gráficos e relatórios de testadores (`#112`, `#114`, etc.) são citados nos comentários do código e já listados em 02 §14; não foram cruzados com `docs/decisions-pending.md` aqui.
- A tabela de cordas da seção 3.1 é cálculo meu a partir de `Step`; não é saída do Lapin.
