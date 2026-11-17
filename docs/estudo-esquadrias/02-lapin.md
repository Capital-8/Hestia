# Estudo de esquadrias, parte 2: leitura profunda do Lapin

Tarefa A2. Fonte: repositório público MIT em `/home/user/ciuntuc-bim-studio/lapin` (somente leitura). Todos os caminhos abaixo são relativos a essa raiz, salvo indicação. Os comentários do código e as decisões do Lapin estão em inglês e romeno; aqui está tudo em português. As decisões numeradas vivem em `docs/decisions-pending.md` (uma linha por decisão, em romeno).

Convenções: `E:` = `engine/src/Modules/Architecture/Lapin.Architecture/`, `U:` = `ui/src/modules/architecture/`, `T:` = `engine/tests/Lapin.Engine.Tests/`. Nada foi executado: a leitura é estática. Onde uma afirmação é inferência minha e não está escrita no código, vai marcada como **(inferência)**.

---

## 0. Resumo executivo

1. O Lapin tem **uma única fonte de verdade geométrica** por esquadria: `JoinerySpec` (registro JSON no tipo) gera uma lista de caixas e prismas com papel (`JoineryBox`, `Joinery.Boxes`). **Tudo** (3D, planta, corte, elevação, IFC, quantitativos, janela do configurador) é derivado dessa lista ou do mesmo `JoineryShapes.Outline`. Por isso a "forma" (arco etc.) só foi escrita uma vez e todos os consumidores a seguem.
2. A forma é um **contorno em coordenadas do tipo** (`x` ao longo, `z` para cima, origem no meio da base do vão) com *inset*: `Outline(spec, inset)` devolve o contorno recuado `inset` para dentro (negativo: para fora). Parede, batente (banda entre inset 0 e inset=largura do batente), vidro (inset=largura), alizar (inset negativo) e corte em planta são todos o mesmo contorno com insets diferentes.
3. Oito formas paramétricas (`rect`, `round`, `segmental`, `elliptical`, `radiused`, `pointed`, `gable`, `circle`) mais `outline` livre (laço no cubo unitário, desenhado numa prancha). Matemática exata na seção 3.
4. A grade de caixilharia (colunas × linhas, painéis com span, operação e preenchimento) é independente da forma: quando há cabeça em arco, a grade para sob uma travessa na linha de nascença e acima há uma bandeira fixa em arco com barras (`sunburst`, `mullions`, `cross`). Alternativa (relatório #112): sem travessa, a fiada de cima das folhas segue o arco.
5. Portas de garagem, bay/bow/box, persianas/venezianas/grades/marquises, quadros e relatórios existem e são todos **dados no mesmo `JoinerySpec`** ou entidades vizinhas (`IfcShadingDevice`). Não há cortina/persiana interna.
6. O que é transferível ao Hestia com melhor retorno: o **kit de contorno com inset** (seção 3), a **representação de bandeira/arco em duas zonas** (grade + cabeça), a **geometria de duas folhas que se encontram** (batente/sobreposição/baguete), a **combinação porta+janela com preenchimento por painel** e o **mapeamento IFC de partitioning/operation** (tabelas prontas). Estimativa total na seção 17.

---

## 1. Mapa de arquivos lidos

| Tema | Arquivo | Linhas |
|---|---|---|
| Modelo de dados, grade, ops, IFC termos, corpo 3D | `E:Joinery.cs` | 1164 |
| Formas, contorno, cabeça, barras, muntins | `E:JoineryShapes.cs` | 495 |
| Dados livres (U, g, fogo) e psets | `E:JoineryData.cs` | 138 |
| Mapeamento IFC ida e volta | `E:JoineryIfc.cs` | 248 |
| Símbolos 2D (planta, elevação, corte) | `E:JoinerySymbols.cs` | 443 |
| Prancha de contorno livre | `E:JoineryOutlineBoard.cs` | 189 |
| Pré-visualização 3D do configurador | `E:JoineryPreview3D.cs` | 72 |
| Vão, posição, geometria no perete, acabamentos (Dressing) | `E:Openings.cs` | 1098 |
| Vão nu (sem porta/janela) | `E:BareOpenings.cs` | 221 |
| Vão que atravessa várias paredes | `E:ThroughOpenings.cs` | 167 |
| Mover/copiar/girar/espelhar | `E:HostedOpenings.cs` | 115 |
| Vãos gerados a partir de choques MEP | `E:OpeningMaker.cs` | 176 |
| Referências para cotas temporárias | `E:OpeningReferences.cs` | 188 |
| Portas e janelas por cômodo | `E:RoomOpenings.cs` | 432 |
| Janela de telhado e lucarna | `E:Roofs/RoofOpenings.cs` | 239 |
| Bay, bow, box | `E:BayWindows.cs` | 781 |
| Garagem | `E:GarageDoors.cs` | 687 |
| Persianas, grade, floreira, marquise, pedra-chave, frontão, avental | `E:WindowDressings.cs` | 302 |
| Vidro sem moldura | `E:Frameless.cs` | (lido o cabeçalho) |
| Vazios IFC dos vãos | `E:ArchitectureVoids.cs` | (trecho) |
| Quadros | `E:Schedules/ScheduleData.cs`, `ScheduleLayout.cs`, `ScheduleEntity.cs` | (trechos) |
| UI: configurador | `U:JoineryDialog.tsx` | 1258 |
| UI: grade de painéis | `U:joineryGrid.ts` | 244 |
| UI: vão nu | `U:OpeningDialog.tsx`, `U:openingShape.ts`, `U:WallOpening.tsx`, `U:wallOpeningGrips.ts` | |
| UI: ferramenta única | `U:openingTool.tsx` | 88 |
| UI: bay, garagem, dados, seção | `U:BayFields.tsx`, `U:garageDoors.ts`, `U:JoineryData.tsx`, `U:JoinerySection.tsx` | |
| UI: cotas temporárias | `U:openingDims.ts` | 238 |
| Docs | `docs/plan-door-window-assemblies.md`, `docs/plan-views-and-joinery.md`, `docs/spec-ifc.md` (§ "Deschiderea ușilor și ferestrelor"), `docs/decisions-pending.md` | |
| Testes | `T:Joinery*Tests.cs`, `DoorWindowCombinationTests.cs`, `DoorReportsTests.cs`, `GarageDoorTests.cs`, `BayWindowTests.cs`, `OutlinedWallOpeningTests.cs`, `WindowDressingTests.cs`, e outros (lista na seção 13) | |

Não existe no repositório um `docs/simboluri-tamplarie.md` (citado em comentários): o texto sobre símbolos está no código de `E:JoinerySymbols.cs`.

---

## 2. Modelo de dados

### 2.1 Cadeia de entidades (IFC nativo)

Em `E:Openings.cs` (comentário de classe, linhas 8–20 e `AddFill`, linhas 262–278):

```
IfcWall --(IfcRelVoidsElement)--> IfcOpeningElement --(IfcRelFillsElement)--> IfcDoor | IfcWindow
IfcDoor | IfcWindow --(IfcRelDefinesByType)--> IfcDoorType | IfcWindowType  (atributo "spec" = JoinerySpec em JSON)
```

- O **vão** (`IfcOpeningElement`) guarda só `along` (distância do centro ao início da parede, ao longo do eixo) e `sill` (base sobre a base da parede). Largura e altura vêm do **tipo** do preenchimento; vão sem preenchimento guarda `width`, `height` próprios. Mudar o tipo reajusta todos os vãos (`UpdateType` valida cada um com `CheckFits`).
- O **elemento** (porta/janela) guarda só: `flipHand` e `flipSide` (booleanos), opcionalmente `position` e parâmetros próprios. Um elemento espelhado em um eixo é a **imagem espelhada do tipo** (`Joinery.IsMirrored`: `flipHand != flipSide`); nos dois eixos é o tipo girado 180 graus.
- O **tipo** guarda `spec` (o `JoinerySpec`), `mark`, e os termos IFC derivados (`operationType` para porta, `partitioningType` para janela), `Openings.TypeAttrs`.
- Vão importado de arquivo guarda `holeWidth`, `holeHeight`, `fillOffset` (o furo do arquivo difere da esquadria; `Openings.Place`).
- Cada vão tem uma chave opcional `ThroughOpenings.Key` (corta todas as paredes que atravessa, padrão ligado; fórum #64, ver §11).

### 2.2 `JoinerySpec` (registro principal, `E:Joinery.cs:194–249`)

Eixos do tipo: **X** ao longo da parede (centrado no vão), **Y** através dela (0 no plano médio, +Y para o exterior), **Z** para cima a partir da base do vão. As folhas abrem para o interior (−Y). Esquerda e direita seguem a regra IFC (vistas olhando no sentido em que abrem).

| Campo | Tipo | Conteúdo |
|---|---|---|
| `Kind`, `Name`, `Mark` | texto | `door`/`window`; marca do quadro |
| `Width`, `Height`, `SillHeight` | m | tamanho do vão que preenche; peitoril da janela |
| `Frame` | `JoineryFrame(Depth, Width, Mullion, Transom, Offset)` | profundidade através da parede, face visível, largura de montante e travessa padrão, centro através da parede |
| `Sash` | `JoinerySash(Width, Depth, LeafThickness, GlassThickness, Glazing?)` | perfil da folha, espessura da folha de porta, vidro; `Glazing` é o texto "4-16-4" (ver §9) |
| `Columns[]`, `Rows[]` | pesos relativos | grade (1 a 12 de cada) |
| `Mullions?[]`, `Transoms?[]` | `double?[]` | uma largura por limite entre colunas / linhas (decisão 466): `null` = padrão do batente, `0` = sem barra, os painéis se encostam |
| `Panels[]` | `JoineryPanel(Col, Row, Operation, ColSpan, RowSpan, Glazed, Infill?)` | painel = célula ou bloco de células; `Infill` `glass`/`solid` (decisão 370) |
| `Board` | `JoineryBoard(Interior, Exterior)` | tábuas de peitoril de janela |
| `Threshold` | m | soleira de porta |
| `Colors`, `Materials` | cores e nomes de materiais por papel | `frame, sash, glass, leaf, board, hardware`; muntin segue `sash` ou `frame` |
| `Lintel` | regra de verga | nula = regra da parede |
| `Details` | `JoineryDetails` | ver §2.5 |
| `Shape` | `JoineryShape` | ver §3 |
| `Muntins` | `JoineryMuntins` | ver §5 |
| `Hardware` | `JoineryHardware(Handle, Height, Color)` | `auto lever knob pull window none` |
| `Bay` | `JoineryBay` | ver §8 |
| `Profile` | `JoineryProfile(System, Rebate, Overlap, Bead, Drip)` | rebaixo, lábio da folha, baguete, pingadeira (decisão 370) |
| `FrameSection`, `SashSection` | JSON de perfil de biblioteca | perfil real em montantes retos (decisão 417) |
| `Position` | `JoineryPosition(From, Distance)` | `exterior`, `core`, `centre`, `interior` (relatório #76 e decisão 530) |
| `Frameless` | `JoineryFrameless` | vidro temperado sem moldura (decisão 444, pergunta 7, tópico #28) |
| `Meeting` | `JoineryMeeting(Kind, Active, Width, Thickness, Bolts)` | encontro de duas folhas (decisão 466) |
| `Garage` | `JoineryGarage` | ver §9 |
| `ThermalTransmittance`, `IsExternal`, `Style` | | |

Funções de normalização: `Joinery.Normalised(spec)` (toda célula coberta por exatamente um painel; sobreposições são descartadas; células sem painel viram vidro fixo), `Joinery.Mirrored(spec)` (reverte colunas, mullions e troca mãos com `IfcHands.MirrorText`), `Joinery.Problem(spec)` (validação: primeira causa que impede construir).

`Joinery.KindOf(spec)` decide a **classe efetiva** (tópico #34): se tem folha de porta é `door`; se tem só caixilhos que abrem é `window`; senão o `Kind` declarado.

### 2.3 Operações dos painéis (`E:Joinery.cs:363–378`)

- Janela: `fixed`, `side-left/right`, `tilt-turn-left/right`, `bottom-hung`, `top-hung`, `pivot-horizontal`, `pivot-vertical`, `sliding-left/right`, `sliding-vertical`.
- Porta: `swing-left/right`, `double-acting-left/right`, `door-sliding-left/right`, `folding-left/right`, garagem (`sectional-overhead`, `roller`, `up-and-over`, `sectional-side-left/right`), elevar-e-correr e inclinar-e-correr (`lift-slide-*`, `tilt-slide-*`, tópico #34).
- Uma folha de janela (`IsSash`) pode estar **dentro de um tipo de porta** (tópico #34); o contrário, uma folha de porta em janela, não.

### 2.4 `JoineryData` (dados livres, relatório #76; `E:JoineryData.cs`)

Texto livre no tipo ou no elemento (o do elemento vence): `uValue`, `gValue`, `safetyGlass`, `fireRating`, `fittings` mais parâmetros extras do usuário. Escritos como parâmetros do tipo (`params`: `{name, kind:'text', value, pset}`), então etiquetas `{U-value}`, quadros e painel de propriedades os leem como quaisquer outros. IFC:
- `FireRating` vai em `Pset_DoorCommon`/`Pset_WindowCommon`; o resto em `Lapin_Joinery` (prefixo `Pset_` é reservado ao padrão).
- `JoineryDataSets` (mesmo arquivo, linha 113) emite: `ThermalTransmittance` quando o U-value é lido como número (regex `^\s*[-+]?\d+([.,]\d+)?`, vírgula decimal aceita), `GlazingAreaFraction` (soma das áreas das caixas `glass` / área do vão, janela), e `Pset_DoorWindowGlazingType` (`GlassLayers`, `GlassThickness1..3`, `IsLaminated`, `SolarHeatGainTransmittance` quando o g é razão ≤ 1) a partir do texto de composição do vidro.

### 2.5 `JoineryDetails` (acabamentos em volta, decisão 127 e planos `docs/plan-views-and-joinery.md` §3)

Cada campo nulo = padrão. Todos viram **peças com material** (`GeometryPart`), entram em corte e quantitativos, e vão ao IFC como partes:

- `Reveal(Mode wall|material|none, Material, Thickness 15 mm)`: acabamento da ombreira e da verga. Modo `wall` toma a camada de face de cada lado da parede, com espessura da camada até 25 mm (`Openings.Dressing.Finishes`, `E:Openings.cs:678`). Camada de espessura zero (tinta, membrana, decisão 291) não conta. **Desligado para vãos com forma** (a caixa de acabamento "quadraria a cabeça outra vez", comentário em `Dressing`).
- `SillInside` (peitoril interno), `SillOutside` (peitoril externo com inclinação em graus e pingadeira), `Surround` (alizar na fachada, largura e projeção, com ou sem lado inferior), `Threshold`.
- Dressings de fachada (decisão 174, relatórios #38/#39 e #47): `Shutters`, `Grille`, `WindowBox`, `Canopy`; (decisão 188): `Keystone`, `Head` (cornija, frontão, frontão segmentado, capelo que segue o arco), `Apron` (avental com consolos).
- `Cutters` (`E:Openings.cs:424`) devolve os volumes que a parede cede: o recorte do vão mais as peles de acabamento e os peitoris embutidos, cada um com o alcance em altura.

---

## 3. As formas: matemática do contorno

Tudo em `E:JoineryShapes.cs`. Notação: `w` = largura, `H` = altura, `f = Rise(s)` = altura da cabeça acima da linha de nascença, `zs = Spring = H − f`, `d` = *inset* (positivo para dentro), `x` medido do eixo do vão. Origem em Z: base do vão.

`JoineryShape(Kind, Rise?, Bars, Spokes, Transom?, Profile?)`. `KindOf(s)` cai em `"rect"` para qualquer valor desconhecido. Famílias derivadas:
- `Headed` = `round | segmental | elliptical | radiused | pointed | gable`.
- `Round` = `circle`. `Ringed` = `circle` ou `outline` (uma luz fixa dentro de anel).
- `Shaped` = qualquer coisa diferente de `rect`.

### 3.1 Altura da cabeça `Rise` (`JoineryShapes.cs:125`)

| Forma | `f` padrão | Limite |
|---|---|---|
| `round` | `w/2` | fixo (ignora `Rise`) |
| `segmental` | `w/6` | `clamp(Rise, 0,02, w/2)` |
| `elliptical` | `w/4` | `clamp(Rise, 0,02, w)` |
| `radiused` | `0,15` (raio do canto) | `clamp(Rise, 0,01, w/2)` |
| `pointed` | `w·√3/2` (equilátero) | `max(0,05, Rise)` |
| `gable` | `w/4` | `max(0,02, Rise)` |

Final: `f = min(f, max(0, H − 0,15))`: sempre sobram 150 mm de retângulo sob a cabeça. **Observação (inferência)**: esse clamp final reduz `f` mas `Top` para `round` continua usando o raio `w/2`, de modo que numa janela redonda de `H − 0,15 < w/2` o topo teórico `zs + w/2` passa de `H`. O teste `JoineryShapeTests` só cobre casos sem clamp. Vale testar antes de portar.

### 3.2 Topo do contorno `Top(s, x, d)` (linha 152)

Cada arco é calculado em torno do **próprio centro** com raio reduzido por `d`, de modo que a banda do batente (diferença entre `d=0` e `d=largura`) tem espessura quase uniforme.

- **round** (semicírculo, centro `(0, zs)`):
  `top = zs + sqrt( (w/2 − d)² − x² )`.
- **segmental** (arco de círculo por três pontos: nascenças e ápice):
  `R = (w²/4 + f²) / (2f)`; centro `(0, zs + f − R)`;
  `top = zs + f − R + sqrt( (R − d)² − x² )`.
- **elliptical** (meia elipse com as duas semi-eixos reduzidas por `d`):
  `a = w/2 − d`, `b = f − d`; `top = zs + b·sqrt(1 − x²/a²)`; se `a ≤ 0` ou `b ≤ 0`, `zs`.
- **radiused** (topo reto, cantos arredondados; `f` = raio do canto):
  `cx = w/2 − f`, `rc = f − d`;
  se `|x| ≤ cx` ou `rc ≤ 0`: `top = zs + f − d` (o plano do topo, já que `zs + f = H`);
  senão `top = zs + sqrt( rc² − (|x| − cx)² )`.
- **pointed** (arco gótico, dois arcos que se encontram no ápice, cada um com centro **no lado oposto do eixo**):
  `r = (f² + w²/4) / w`; no caso equilátero `f = w√3/2` dá `r = w`;
  `top = zs + sqrt( (r − d)² − ( |x| − (w/2 − r) )² )`.
  O centro do arco direito fica em `x = w/2 − r` (negativo quando `r > w/2`).
- **gable** (empena triangular): `top = zs + f − f·|x| / (w/2) − d·sqrt(1 + (f/(w/2))²)`.
  O fator `sqrt(1 + (f/(w/2))²)` é o secante da inclinação: o recuo `d` é medido **perpendicular** às águas, não na vertical.
- demais (`rect`): `H − d`.

### 3.3 Polilinha da cabeça `Head(s, d)` (linha 195)

Devolve os pontos da curva da junta direita para a esquerda, recuada `d`, com as pontas sobre as linhas das ombreiras `±(w/2 − d)`. O passo vem da **regra de cordas** `Chords.Count(raio, varredura, mínimo)` em `engine/src/Geometry/Lapin.Geometry/Chords.cs`:

- erro máximo de corda `Tolerance = 1 mm`;
- passo angular `Step(R) = clamp( 2·acos(1 − 1 mm / R), 0,5°, 15° )`;
- número de peças `= ceil(|varredura| / Step(R))`, com mínimo (`MinPieces = 32` por cabeça).

Por forma: `gable` = 3 pontos (`half, 0, −half`); `segmental` = arco entre as ombreiras com ângulos `a0 = acos(half / rho)` até `π − a0`, `rho = R − d`; `elliptical` = passos iguais do **ângulo da elipse** (`x = half·cos(π·i/n)`), com `n` definido pelo raio da curva mais plana `max(a²/b, b²/a)`; `radiused` = um quarto de círculo em cada canto (`MinPieces/2` peças) e a reta; `pointed` = cada metade um arco com `MinPieces/2` peças, ápice exatamente em `x = 0`; padrão (`round`) = semicírculo em passos iguais. Os `x` são alimentados em `Top` para obter os `z`.

### 3.4 `circle` (janela redonda ou oval, `Ellipse`, linha 265)

Elipse que preenche a largura e a altura, recuada `d`: centro `(0, H/2)`, semi-eixos `(w/2 − d, H/2 − d)`, partindo da direita, anti-horário; `n = Chords.Count(max(a0²/b0, b0²/a0), 2π, 48)`, **o mesmo `n` para todo `d`**, de modo que o anel (contorno externo e interno) casa ponto a ponto.

### 3.5 `outline` (contorno livre, auditoria S4 e S11)

`Profile` = laço em coordenadas do **cubo unitário** (`x` de −½ a ½ da largura, `y` de 0 a 1 da altura), de modo que redimensionar estica a forma. `Outline`: escala `(x·w, y·H)`, corrige a orientação (anti-horário) e recua com `Polygon2.Offset(pts, [−d, −d, …])`. Duas origens: (a) o tipo desenhado numa **prancha** (`E:JoineryOutlineBoard.cs`, comandos `architecture.editJoineryOutline`, `finishJoineryOutline`, `cancelJoineryOutline`, aceita polilinha fechada, círculo, elipse ou linhas e arcos que se encontram ponta a ponta); (b) vão nu com contorno próprio (`Openings.AddOutlined`: cantos mais "rises" de arco por aresta, `ArcOutline`). Janela só (`Joinery.Problem` recusa porta com contorno livre) e `Ringed`: sem grade, um anel de moldura e uma luz fixa.

### 3.6 Lista de contorno completo `Outline(s, d, bottom?)` (linha 274)

`[(half, z0)] + Head(s, d) + [(−half, z0)]`, com `half = w/2 − d` e `z0 = bottom ?? d`. Para vãos de parede usa-se `Outline(sized, 0, 0)`: base em 0, sem recuo. `Prism(role, pts, y0, y1)` empacota o contorno como `JoineryBox` com `Profile` (e `Holes`), cujos `Min/Max` são os limites.

---

## 4. Como cada elemento segue o contorno

Esta é a seção mais reutilizável: **o mecanismo**, não só as fórmulas.

| Consumidor | Como segue | Referência |
|---|---|---|
| **Vazio na parede** | `Cutter` extrude `Outline(sized,0,0)` pela espessura da parede mais 50 mm de cada lado (`Prism.Extrude`). Também usado em `ArchitectureVoids.InWall` (decisão 289), de modo que a malha da parede, a seção, o IFC e os quantitativos coincidem. Parede curva mantém o recorte retangular radial (`ArcCutter`). | `E:Openings.cs:436–450`, `E:ArchitectureVoids.cs:42–51` |
| **Batente (aduela)** | ombreiras (caixas) vão até `Spring(s)`; a cabeça é um prisma de banda: contorno externo `Head(s,0)` fechado por baixo pela linha de nascença, com furo interno `Head(s, fw)`, `fw` = largura do batente. | `Joinery.Boxes` linha 957–963, `JoineryShapes.HeadBoxes` |
| **Travessa na nascença** | caixa horizontal entre `±(w/2 − fw)`, de `zs − max(Transom, 0,02)` até `zs`. | `HeadBoxes` |
| **Vidro da bandeira** | prisma do polígono `[(half−fw, zs)] + inner.where(y>zs) + [(−half+fw, zs)]`, espessura do vidro centrada em `Frame.Offset`. | `HeadBoxes` |
| **Grade abaixo** | `InnerRect` termina em `Spring − max(Transom, 0,02)`. Com `Transom=false`, termina no ápice interno `Top(0, fw)`. | `Joinery.InnerRect` |
| **Painéis que seguem o arco** (relatório #112) | `PaneOutline(s, rect, inset)`: lados e fundo do retângulo do painel, topo a curva interna; `Band` (membros da folha, rebaixo do batente, baguetes) e `Sheet` (vidro, painel cego) usam o laço quando existe, retângulo senão. Montantes da fiada superior sobem até o arco (prisma de 4 pontos com `Top`). | `Joinery.Boxes` linhas 989–999, `Bars` 806 |
| **Alizar** | `SurroundOutline`: banda entre `Outline(s,−w, 0)` e `Outline(s, 0, 0)` sem o lado de baixo (para `Ringed` é anel completo); lado inferior é uma caixa separada quando `Sill`. | `E:Openings.cs:~820` |
| **Acabamento de ombreira** | **não aplicado** a esquadria com forma (o acabamento é uma caixa; reta quadraria a cabeça). Em vão **nu** o acabamento (`lining:<id>`) segue a cabeça (decisão 392). | `Dressing` ctor |
| **Planta** | `JoinerySymbols.Plan` **fatia as próprias caixas** na altura de corte: `JoineryShapes.Spans(box, z)` devolve os intervalos em que o plano cruza o prisma de contorno (inclui furos). Por isso um arco em planta mostra batente cortado onde o plano o atravessa, sem código especial por forma. | `JoinerySymbols.cs:183` |
| **Corte** | idem, vertical: `Spans(box, cutX, vertical:true)`. | `JoinerySymbols.Section` |
| **Elevação** | `ShapeLines`: contorno, anel interno (`Ringed`) ou bandeira + linha da travessa, e os prismas de contorno que não são batente largo (barras e muntins) como traço fino. Símbolo de abertura recebe `PaneTop(x)` para que os vértices do triângulo caiam sobre o arco. Exterior = espelhado em X. | `JoinerySymbols.cs:~300` |
| **IFC** | corpo = peças tesselagem do mesmo `Boxes`; vazio = o `Solid` de `ArchitectureVoids` (`OpeningVoid.shape`: `Rectangle`, `Round` quando `circle`, senão `Undefined`); a forma volta pelo JSON do `spec` em `Lapin_Intent` (o teste exporta `pointed` e lê `Shape.Kind == "pointed"` no retorno). **A semântica da forma não é escrita em termos IFC**; só o corpo e o JSON. | `JoineryShapeTests.A_shaped_window_goes_to_IFC…` |
| **Barras do cubo** | ver §5. | |
| **Ornamentos** | `Keystone` e `Head` usam `Apex(s)` = `Top(0,0)`; `Head` estilo `hood` usa `Head(s, −(sw + gap))` e `Head(s, −(sw + gap + h))` para a banda em volta do arco, com retornos curtos de `1,5·h` na nascença. | `WindowDressings.cs:~128` |

Regras de exceção explícitas no código: garagem e vidro sem moldura recusam forma (`GarageDoors.Problem`, `Frameless.Problem`); bay/bow/box recusam (`BayWindows.Problem`: "as faces carregam a forma"); acabamento de ambientes (`RoomFinishes.cs:443`) ignora vãos com forma.

---

## 5. Bandeira (fanlight), barras e caixilharia (muntins)

### 5.1 Duas zonas

Para toda cabeça (menos `Transom=false`): zona de baixo = **grade** do configurador (colunas × linhas), zona de cima = **bandeira fixa em arco** acima da travessa na nascença. O parâmetro `transom` (relatório #112, de um testador) desliga a travessa: a fiada superior da grade segue o arco (janela basculante em arco, sem barra sob o arco). `Joinery.Problem` verifica que o arco não desce sobre a fiada de cima (`Top(x, fw) − rows[^1].A < 0,1` para qualquer limite de coluna).

### 5.2 Barras da bandeira `Bars` (`FanBars`, linha 413)

Largura da barra `max(0,015, Frame.Mullion·0,4)`; profundidade `±30 %` da profundidade do batente em torno de `Frame.Offset`. `Hit(polyline, from, dir)` é um raio contra a polilinha interna (primeira saída).

- `sunburst`: `n = clamp(Spokes, 1, 24)` raios (padrão 5) partindo de `(0, zs)`, ângulos `a_i = π·i/(n+1)`, `i = 1…n`; cada barra vai da origem até `Hit` na curva interna.
- `mullions`: **os montantes da grade prolongados** até o arco, cada um com a própria largura (decisão 466); onde não há barra entre painéis (largura 0) não sobe nada. Posição `x = cols[i].B + mullion_i/2`.
- `cross`: uma barra vertical em `x=0`, da nascença até o arco (a linha horizontal é a própria travessa).

### 5.3 Janela redonda (`RoundBoxes`, linha 471)

Anel de moldura = prisma externo `Outline(s,0)` com furo `Outline(s,fw)`; vidro = prisma do contorno interno; barras partem do centro `(0, H/2)` (largura `max(0,015, Mullion·0,5)`): `cross` = 4 raios (0°, 90°, 180°, 270°), `sunburst` = `clamp(Spokes, 3, 24)` raios iguais (padrão 8), `mullions` = vertical (90° e 270°). Contorno livre não tem centro: sem barras.

### 5.4 Caixilharia / muntins (`JoineryMuntins`, `MuntinLines`, linha 353)

Aplica-se a **cada painel de vidro retangular** (fixo ou folha de janela; folha de porta com vidro **não** recebe muntins no código). Painéis menores que 50 mm em qualquer lado não recebem.

| Padrão | Geração (retângulo do vidro `r`, `w`, `h`) |
|---|---|
| `grid` (colonial) | `Across` × `Up` luzes (limitadas a 1…12): linhas em `x = X0 + w·i/Across` e `z = Z0 + h·j/Up` |
| `prairie` | quatro barras a `g = clamp(Margin, 0,03, min(w,h)/3)` de cada borda (padrão 0,10 m): duas verticais em `X0+g` e `X1−g`, duas horizontais em `Z0+g` e `Z1−g`, cada uma atravessando o painel inteiro |
| `diamond` | losangos **duas vezes mais altos que largos**: `dx = w/Across`, inclinação 2; duas famílias de retas `x → x ± h/2` partindo de `x ∈ [X0 − reach, X1 + reach]` com `reach = h/2 + w`, passo `dx`, recortadas ao retângulo por Liang–Barsky |

Cada linha vira uma barra (`Bar`: retângulo orientado de largura `clamp(Width, 0,008, 0,1)`, padrão 0,022, extrudado em profundidade `max(vidro + 0,01, 0,5·profundidade da folha)`) com papel `muntin`. Em painéis que seguem o arco, a linha é recortada ao laço convexo por **Cyrus–Beck** (`ClipConvex`). Muntins não aparecem em planta (papel excluído do corte) mas sim em elevação e corte.

---

## 6. Folhas que se encontram (decisão 466)

`JoineryMeeting(Kind butt|rebated|astragal, Active left|right, Width?, Thickness?, Bolts)`. Existe um par quando duas folhas de giro (uma `*-left`, outra `*-right`) ficam lado a lado sobre um limite de coluna com montante `0` (`Joinery.Meetings`).

- **butt**: cabeça a cabeça, espaço, as duas com maçaneta (comportamento antigo; é o padrão quando `Meeting` é nulo).
- **rebated** (padrão se `Meeting` existe): cada folha termina meio recorte antes da linha de encontro (`Body = Cell − Half`, `Half = Width/2`, padrão 14 mm de sobreposição); lábio de espessura `meia folha` cruza a linha, o da folha **ativa do lado do cômodo** (a que fecha por último), o da passiva do lado de fora.
- **astragal**: tira de 45 × 12 mm (padrão) na face do cômodo da folha ativa.
- Padrões: ativa = direita (convenção "vista do lado de onde se empurra, esquerda = dobradiça à esquerda"; a mais usada na Romênia e na Europa); maçaneta só na ativa; a passiva ganha **ferrolhos embutidos** no topo e na base junto à borda de encontro (`Bolts`). Folha de vai-e-vem sempre `butt`.
- A configuração é **uma por tipo**, não uma por limite (decisão explícita: "uma porta tem normalmente um só par").
- IFC: `DOUBLE_DOOR_SINGLE_SWING` etc.; um `IfcDoorPanelProperties` por folha com a largura como razão da luz; lining sem montante onde não há (`LiningOffsets`).

---

## 7. Combinação porta + janela e IFC

### 7.1 Estado implementado (tópico #34 do fórum, `docs/plan-door-window-assemblies.md`)

Um **único tipo** pode ter folhas de porta, caixilhos de janela, painéis fixos e cegos (`Infill solid`). A classe efetiva é decidida pelo conteúdo (`Joinery.KindOf`). Regras:
- caixilho dentro de porta na fiada de baixo ganha uma **travessa inferior** sob ele (`RailUnder`);
- coluna de porta sobre painel cego fixo (peitoril/guarda-corpo) leva as tábuas de janela na travessa sobre ele (`ParapetTop`);
- elevar-e-correr / inclinar-e-correr: folha na trilha interna, painéis fixos ao lado na trilha externa; só na fiada de baixo; símbolo com setas;
- vidro com composição por texto ("4-16-4", "33.1-16-4") define espessura (ver §2.4);
- predefinições (`E:Openings.cs:991–1098`, `JoinerySpecs`): `Door`, `Window`, `DoubleDoor`, `BalconyDoorWindow` (porta com folha de vidro à esquerda, janela oscilo-batente sobre painel cego à direita, 1600 × 2200), `DoorWithSidelights` (1900 × 2500: lateral fixa, folha, lateral fixa e bandeira fixa em 3 colunas), `LiftSlidePortal` (3000 × 2200), `FrenchWindow`, `FloorSpringDoor` e cinco de garagem.
- Teste: `T:DoorWindowCombinationTests.cs` (9 testes: classe por folha, presets constroem corpos fechados em parede fechada, caixilho em porta sobre trilho, IFC com cada operação, planta com as oscilações, elevar-e-correr, vidro, quadro).

### 7.2 Mapeamento IFC (`E:JoineryIfc.cs` e `Joinery.cs` 661–770)

Regra de orientação: +Y local do elemento é o sentido de abertura, esquerda/direita vistas nesse sentido (`docs/spec-ifc.md`). `IfcJoineryPlace`: origem no canto inferior esquerdo do vão, na face da parede de onde abre.

- **Janela** `PartitioningType`: 1 painel `SINGLE_PANEL`; 1 linha: 2 colunas `DOUBLE_PANEL_VERTICAL`, 3 `TRIPLE_PANEL_VERTICAL`; 1 coluna: 2 linhas `DOUBLE_PANEL_HORIZONTAL`, 3 `TRIPLE_PANEL_HORIZONTAL`; 2×2 com 3 painéis: `TRIPLE_PANEL_TOP/BOTTOM/LEFT/RIGHT` conforme o painel mais largo/alto; resto `USERDEFINED` com texto "`{nc}x{nr} grid, {n} panels`". Bay: `USERDEFINED` com `Describe(...)` mais número de painéis desdobrados.
- **Operação de painel de janela**: `FIXEDCASEMENT`, `SIDEHUNGLEFTHAND/RIGHTHAND`, `TILTANDTURNLEFTHAND/RIGHTHAND`, `BOTTOMHUNG`, `TOPHUNG`, `PIVOTHORIZONTAL`, `PIVOTVERTICAL`, `SLIDINGHORIZONTAL`, `SLIDINGVERTICAL`, resto `OTHEROPERATION`.
- **Porta** `OperationType`: uma folha `SINGLE_SWING_LEFT/RIGHT` (com painel fixo de lado: `SWING_FIXED_LEFT/RIGHT`), `DOUBLE_SWING_*`, `SLIDING_TO_LEFT/RIGHT`, `FOLDING_TO_*`; duas folhas `DOUBLE_DOOR_SINGLE_SWING` (esq+dir), `…_OPPOSITE_LEFT/RIGHT`, `DOUBLE_DOOR_DOUBLE_SWING`, `DOUBLE_DOOR_SLIDING`, `DOUBLE_DOOR_FOLDING`; resto `USERDEFINED` com o texto "`swing-left + fixed`" (relido ao importar).
- **PanelOperation de porta**: `SWINGING`, `DOUBLE_ACTING`, `SLIDING`, `FOLDING`, `FIXEDPANEL`; caixilho dentro de porta = `USERDEFINED` + termo exato em `Lapin_Joinery.PanelOperations`; elevar-e-correr = `LIFTANDSLIDE`/`TILTANDSLIDE` no mesmo conjunto.
- **Posição do painel** (`PanelPosition`): `LEFT/RIGHT/MIDDLE` com mais de uma coluna; `BOTTOM/TOP` em janela de uma coluna e várias linhas. Largura de painel de porta = razão da luz do batente.
- **Lining**: `IfcDoor/WindowLiningProperties` com profundidade, largura, montante/travessa **máximos** (IFC só tem uma espessura de cada), soleira (`Threshold`), e as posições de montantes e travessas como razões (`LiningOffsets`; em espelho `1 − x` revertido).
- **Importação** (`JoineryIfc.FromIfc`): reconstrói grade e operações a partir de `OperationType`/`PartitioningType` (mais `UserDefined` do próprio Lapin e propriedades dos painéis); direção oposta à esquerda da parede nativa vira `flipSide + flipHand`.
- **Plano recomendado e ainda não implementado** (variante C do documento de planos): um tipo com folhas de porta e de janela exporta como `IfcElementAssembly` agregando um `IfcDoor` e um `IfcWindow` por grupo, o corpo comum como `IfcMember`, e o Lapin lê de volta como um só. Também **não implementados**: Uw por EN ISO 10077-1 (`Uw = (Ag·Ug + Af·Uf + lg·ψg)/(Ag + Af)`, buscada por `grep 10077`: sem ocorrência no código), vidro por painel, tabela de vidros (corte).

---

## 8. Bay, bow, box (`E:BayWindows.cs`, relatório #60)

É **uma `IfcWindow` de um `IfcWindowType` num só vão**, igual a qualquer janela; o tipo diz como projeta (`JoinerySpec.Bay`).

- As **colunas da grade são as faces**: bay e box têm 3 faces (primeira coluna = lado esquerdo, última = lado direito, as do meio = centro dividido por elas); bow tem uma face por coluna (3 a 12 colunas). Cada face é uma **janela plana própria** (`Sub(s, c0, c1, largura)`: mesmos quadro, folhas, vidro, operações e materiais; `Bay=null, Details=null, Shape=null, Board=0, Frame.Offset=0`).
- `JoineryBay(Kind bay|bow|box, Projection 0,6, Angle 45, Sides glass|solid, SideMaterial, Seat, Base, Head, Sill, Style)`.
- **Linha dos quadros** (`Line`): bay e box: `[(−half, yExt), (−half + run, yExt + pc), (half − run, yExt + pc), (half, yExt)]` com `half = w/2 − Frame.Depth/2`, `pc = max(0,02, Projection − Frame.Depth/2)`, `run = pc / tan(angle)` (box: ângulo 90 graus, `run = 0`). **Bow**: arco de círculo; o `rise` é achado por **bisseção de 40 passos** para que a face mais externa (uma corda) saia exatamente `Projection`; pontos distribuídos pelos pesos das colunas: `phi = pl − (pl − pr)·acumulado/total`.
- Peças: poste de canto (cunha entre quadros), **assento** (tábua interna, espessura 40 mm, avanço 50 mm), **peitoril externo**, **base** (`none` pendurada, `floor` muros baixos até o piso, `slab` laje projetada, `corbel` laje sobre mísulas), **cabeça** (`none`, `flat` com platibanda, `hipped` quatro águas, `lean-to` uma água caindo da parede, `slab`) com **rufo** (`Flashing`) contra a parede; sólidos convexos (`ConvexBody`, cortes por planos) para os telhados.
- Planta: cada face usa o símbolo da janela plana; postes e laterais cheias (sólidas) cortadas; assento, peitoril e base vistos abaixo; telhado tracejado acima. Corte pelo meio. Elevação com faces escorçadas.
- IFC: `IfcWindow` com `PartitioningType USERDEFINED` e texto "Bay 45°, projection 600, 3 faces"; painéis e lining desdobrados (`Developed`: faces lado a lado, cada coluna com a largura que tem na face; lados cheios omitidos).
- Oito **estilos** de fábrica (`Styles`: bay-45, bay-30, canted bay on floor, bow-5, bow-4, box-glazed, box-solid, oriel) e **estilos do projeto** salvos/renomeados/apagados (`ProjectStyles`, comando `architecture.bayStyles`). UI em `U:BayFields.tsx`.
- Limites validados em `BayWindows.Problem`: 3 a 12 colunas, largura ≥ 600 mm, altura ≥ 300 mm, projeção de `Frame.Depth + 50 mm` a 3 m, bay de 15° a 90°, bow até meio círculo, água do telhado de 5° a 60°, face ≥ 250 mm.

---

## 9. Portas de garagem (`E:GarageDoors.cs`, decisão 530, tópico #48)

Uma **operação de porta** (um só painel que preenche o vão: 1 coluna, 1 linha, 1 painel) com configurações em `JoinerySpec.Garage` (`JoineryGarage`):

- Tipos: `sectional-overhead` (painéis horizontais subindo por dois trilhos), `roller` (cortina de réguas enrolada num tambor em caixa sobre o vão), `up-and-over` (um painel que bascula; mecanismo `canopy` ou `retractable`), `sectional-side-left/right` (painéis verticais correndo em curva ao longo da parede lateral).
- Parâmetros: `Sections` (nº de painéis; padrão ≈ 610 mm cada; lateral 550 mm), `Finish` (`ribbed flat v-groove glazed-top`), ponto de acesso `Wicket`+`WicketWidth` (0,6–1,2 m)+`WicketSide`, `Track` (`standard low-headroom high-lift` + `Lift`), `Headroom`/`Backroom`/`Sideroom` (nulo = do tipo, valores indicativos), `Box` (`inside`/`outside`), `Tracks` (trilhos como corpos 3D).
- Constantes: `PanelHeight 0,61`, `SlatPitch 0,075`, `SectionalThickness 0,04`, `RollerThickness 0,012`, `TrackWidth 0,035`, `Radius 0,3`, `LowRadius 0,1`.
- Espaços necessários (`HeadroomOf`, `BackroomOf`, `SideroomOf`): ex. seccional padrão `Headroom 0,3`, baixo `0,15`, alto `Lift + 0,3`; roller `0,3 + 0,06·H`; `Backroom` seccional `H + 0,5`, up-and-over `2H/3` (canopy) ou `H + 0,2`.
- Montagem a partir do **acabamento interior** (`Position("interior", 0)`, decisão 530), sem soleira. Tamanhos comuns indicativos AU (2400, 2700, 3000, 4800, 5400 × 2100) e EU (2375 × 2000, 2500 × 2125, 3000 × 2125, 5000 × 2125).
- Planta: cortina no vão (linha em LOD 100), trilhos e painel aberto **tracejados sobre o corte** até o `Backroom`; elevação: juntas, janelas, ponto de acesso, tambor.
- IFC (decisão 530, "de confirmar: interpretação de `LIFTING_HORIZONTAL`"): `roller` = `ROLLINGUP` em IFC4 e IFC4X3; `sectional-overhead` e `up-and-over` = `LIFTING_HORIZONTAL` (IFC4X3) e `USERDEFINED` `SECTIONAL_OVERHEAD`/`UP_AND_OVER` (IFC4); `sectional-side-*` = `USERDEFINED` `SECTIONAL_SIDE_LEFT/RIGHT`; painel `ROLLINGUP`, `SLIDING` ou `USERDEFINED`. Lido de volta, inclusive de arquivos externos (`GarageDoors.FromIfc`).
- Quantitativos: `Lapin_GarageDoor` (área da cortina, painéis, espaço necessário). Quadro: operação por extenso e linha "Hanging".
- UI: `U:garageDoors.ts` (tipo, rótulos, tamanhos, nomes) e seção "Garage door" em `U:JoineryDialog.tsx` (~linha 476): tipo, tamanho comum, acabamento, painéis, trilho, ponto de acesso, caixa do rolo, mecanismo, espaços.

---

## 10. Persianas, grades, marquises e proteção solar

**Não existe cortina nem persiana interior** no Lapin. O que existe:

### 10.1 Acessórios de fachada do tipo (`E:WindowDressings.cs`, decisão 174)

Todos medidos a partir das **faces reais da parede** (`WindowDressings.Of(spec, espessura)`: face externa, interna, fachada = externa + projeção do alizar), com `Along` e `Rise` ajustáveis à mão, mais `Gap` da face.

- `JoineryShutters` (venezianas/folhas de abrir): `Style louvred|panel|planks`, `Leaves 1|2`, `Open` (abertas dobradas contra a parede ao lado, ou fechadas sobre o vão), `Thickness 0,03`, `Gap 0,01`, `Overlap 0,03` (passa da ombreira), `Pitch 0,05` (aletas), `Height?`. Geometria: bastidor de 60 mm; aletas com 60 % da espessura e altura `0,7·pitch`; tábuas verticais com junta de 5 mm.
- `JoineryGrille`: `Side revealInside|reveal|outside|inside`, `Pattern horizontal|vertical|both`, `Bar 0,012`, `Spacing 0,1`, `FrameWidth 0,03`. Padrão **na ombreira interna** (relatório #47) e **nunca dentro do batente**.
- `JoineryWindowBox` (floreira), `JoineryCanopy` (marquise: projeção, espessura, inclinação em graus perfilada por varredura), `JoineryKeystone`, `JoineryHead` (cornija/frontão/segmentado/capelo), `JoineryApron` (avental, com consolos).
- Quantitativos: `ShutterArea`, `GrilleArea`, `WindowBoxLength`, `CanopyArea`.

### 10.2 Proteção solar (`E:Sunshades.cs`, relatório #56)

`IfcShadingDevice` de um `IfcShadingDeviceType` cujo `spec` diz o tipo: `canopy`, `fins`, `louvres` (brise-soleil, `LOUVER`), `eggcrate`, `screen` (perfurada), `awning` (toldo de tecido, `AWNING`), `pergola` e `jalousie` (persiana veneziana externa, `JALOUSIE`: largura/espessura da lâmina, espaçamento, ângulo, "abaixada 0 a 1", caixa, trilhos). Posiciona-se **sobre** porta ou janela (dimensionada ao vão com avanços laterais), ao longo de uma parede ou livre numa linha de fachada; segue o que serve de apoio. UI: `U:Sunshades.tsx` (342 linhas). Cada tipo expõe seus parâmetros por `ShadeParam(Key, Label, Kind, Min, Max, Choices, ShowIf)`.

---

## 11. Vãos nus, parede, cortina e outros hospedeiros

- **Vão nu** (`E:BareOpenings.cs`, `E:Openings.cs:285`, decisões 247, 253, 312, 392, relatório #114): `IfcOpeningElement` sozinho com `width`, `height`, `sill`, `shape` (`BareKinds`: `rect segmental elliptical round radiused circle`), `rise`, `reveal` (`none|plaster|lining`, espessura 15 mm / 20 mm, material "Plaster"/"Timber lining"), `lintel` (regra da parede ou nenhuma), ou contorno livre (`profile`, `profileArcs`). Convertido em porta/janela mantendo lugar, peitoril e GlobalId (`architecture.openingToFill {id, typeId|kind, fit}`; `fit` = tipo do tamanho e da cabeça do vão, nome pelo tamanho "Door 1000×2200"); e de volta (`fillToOpening`): cabeça `pointed` ou `gable` vira retângulo. Em parede curva o vão fica retangular radial.
- **`Openings.CheckFits`** (linha 136): recusa se sai da parede (comprimento e altura), ou sobrepõe outro vão na mesma parede; `ThroughOpenings.Reach` alarga os limites pelas paredes coladas que o vão também corta.
- **Atravessa várias paredes** (`E:ThroughOpenings.cs`, fórum #64: "uma porta que começa numa parede de concreto e sobe por alvenaria"): padrão ligado; corta toda parede reta **paralela** (toque ou sobreposição dos corpos) cujo corpo a caixa do vão alcança; calculado em cada construção (nunca guardado); paredes reconhecidas de IFC (`imported`) e curvas não participam; teste de desempenho (2000 paredes em tempo linear).
- **Mover/copiar/girar/espelhar** (`E:HostedOpenings.cs`, relatório #82): leva o meio do vão pelo transformador; se cair no corpo de outra parede, passa a ela; mantém o sentido de abertura no mundo (vira `flipHand`/`flipSide` conforme a parede nova); recusado se um não couber. Mover ao longo da parede mantém só a parte longitudinal.
- **Paredes reconhecidas de arquivo** (decisão 546): `PlacesOnRecognised`/`KeepPlaces` mantêm o vão onde o arquivo o colocou quando o início da parede se move.
- **Vãos de choque MEP** (`E:OpeningMaker.cs`, decisões 293 e 296): vão redondo (`circle`) para tubo, retangular para duto; afastamento mais arredondamento ao degrau da ordem de corte; ampliar leva a caixa dos dois.
- **Pré-visualização 3D** (`E:JoineryPreview3D.cs`, relatório #108): monta o tipo **num modelo privado** com um trecho de parede do primeiro tipo de parede do projeto (margem 0,6 m), cria tipo, vão e elemento, e pede geometria ao **mesmo produtor** de geometria que o modelo real, aplicando os mesmos filtros: o que se vê no configurador é o que se obtém.
- **Parede cortina** (relatório #133, `CurtainCells`): uma porta dentro de uma célula da cortina é um `IfcDoor` próprio, seu tipo no tamanho da célula (`SeatOf`), com os mesmos desenhos e giro.
- **Janela de telhado e lucarna** (`E:Roofs/RoofOpenings.cs`, portado do BubbleBIM Pro): guardados no telhado (`openings`: `kind window|dormer`, posição, largura, comprimento, `dormerShape gable|shed`, altura da parede, inclinação, beiral, espessura); resolvidos no quadro da água sob o ponto em planta (`Host`: z, direção do beiral `D`, direção para cima `N`); janela = furo + quadro + vidro; lucarna = parede frontal, duas faces, telhadinho próprio que encontra a água em rincões exatos e o entalhe recortado. Vão de laje e de telhado entram em `ArchitectureVoids`.
- **Portas e janelas por cômodo** (`E:RoomOpenings.cs`, `docs/rooms.md`): o cômodo guarda lista `roomOpenings` (item: tipo, lado por **ponto no lado**, mão `hand` e face `face` como direções em planta, chave `KeyTag`); cada item faz uma porta/janela comum na parede daquele lado; desligado por padrão; só paredes retas; cópia de componente refaz a lista (`Settle`).
- **Cotas temporárias** (`E:OpeningReferences.cs`, `U:openingDims.ts`, decisão 511, "como no Revit"): `architecture.openingReferences` devolve, em cada face da parede hospedeira, as posições (ao longo do eixo) de todas as paredes retas que encontram o hospedeiro (faces, faces do núcleo, eixo), das extremidades próprias e dos outros vãos (centro e largura); em parede curva as posições são comprimentos de arco com `scale` por face; para corte e elevação devolve base, topo e nível do pavimento. A UI cicla as pontas por clique e digita-se o valor que move o vão.
- **Ferramenta única** (`U:openingTool.tsx`, auditoria S14): "Opening" com escolha por hospedeiro: parede (porta, janela, bay, vão com forma), laje (abertura, furo no contorno), telhado (janela de telhado, lucarna); as ferramentas antigas viram aliases.
- **Alças** (`U:wallOpeningGrips.ts`): centro arrasta ao longo da parede (`architecture.moveOpening`), cada ombreira altera largura mantendo a outra (`jambTo`: largura mínima 50 mm), em `architecture.updateWallOpening {along, width}`.

---

## 12. Quadros e relatórios de portas

### 12.1 Quadro (`E:Schedules/ScheduleData.cs`, `ScheduleLayout.cs`, `ScheduleEntity.cs`)

- `Schedules.Joinery(model, kind)`: **uma linha por tipo** (`ScheduleEntry`), ocorrências numeradas por pavimento (marca `W1.3`, ou `Door-3`). Janelas antes de portas, ordenado por marca com **comparação numérica** (`CompareMarks`). Imagens espelhadas em **linha própria** com marca `D-M` e nome "(mirrored)" (relatório #83: o quadro antigo ficava com a mão do tipo mesmo depois de espelhar a porta). Portas de parede cortina com tamanho próprio ganham uma linha por tamanho (`#size:1450x2575`).
- Colunas (`ScheduleLayout.JoineryRows`): `name`, `size`, `bay`, `operation`, `hanging`, `sill`, `levels`, `total`, `uValue`, `fire`, `lintel` mais **colunas livres** (parâmetros de usuário e linhas manuais `manual:`). Texto de "Opening" segue o símbolo da planta (relatório #91: o quadro nomeava o giro ao contrário da planta; hoje o "swing-left" IFC é descrito como "swing right" por convenção do fabricante).
- Tipos: `door`, `window`, `all` ("Joinery schedule"), `lintel`. Verga (`Lintels`) como quadro próprio. Linhas sem uso (`Total = 0`) podem ser ocultas (`ShowsUnused`); alerta de marcas duplicadas e sem marca (`problems: twice, none, marks`).
- **Cartas com desenhos** (`ScheduleLayout.Bands` com `drawingsOf`): elevação de dentro e de fora, planta e corte de cada tipo, com a convenção do projeto e a nota de mão (`HandNote`). Os símbolos usam a mesma `JoinerySymbols` (a antiga `JoineryElevation` foi aposentada).

### 12.2 Relatórios de testadores citados nos comentários

`DoorReportsTests.cs` documenta #82 (MOVE/COPY/ROTATE/MIRROR de janela), #83 (quadro com a mão do tipo depois de espelhar) e #91 (quadro nomeava o giro invertido). Outros relatórios são citados em §14.

### 12.3 Configurações do projeto

`joinerySymbols` no projeto: `convention` (`handle` ou `hinge`), `hardware` (desenha dobradiças e maçanetas), `windowSwing` (`auto|none|dashed|solid`). `auto`: tracejado nos caixilhos que chegam ao piso (base ≤ 0,15 m, `ReachesFloor`: portas-balcão e janelas francesas), nenhum nos outros.

### 12.4 Símbolos 2D (`E:JoinerySymbols.cs`)

- **Planta** (`Plan(spec, cutZ, windowSwing, level, sill)`): corpo fatiado na altura de corte; folha de porta aberta 90 graus para o interior com arco de giro (vai-e-vem: outro lado tracejado; correr: faixa ao lado do vão com seta; dobrável: duas metades dobradas a 60 graus; elevar-e-correr: retângulo na trilha com seta; sobre mola de piso: folha girada em torno do pivô); janela com giro por `SashSwing`. **Três níveis** (decisão 405, LOD 100/200/300): `Coarse` só abertura e giro (a folha vira linha), `Medium` batente e linha do vidro, `Fine` tudo mais as tábuas.
- **Elevação** (`Elevation(spec, exterior, convention, hardware)`): `Rect` ou `ShapeLines`; por painel contorno, rebaixo fino da folha, moldura de painel cego, **marcas de abertura** (`OpeningMarks`) nas duas convenções: `handle` (padrão: ápice na maçaneta, fixo cruzado) e `hinge` (DIN 1356: linhas se encontram nas dobradiças, fixo liso). Tracejado quando abre para longe de quem vê (exterior). Com `hardware`: dobradiças e maçanetas conforme estilo; ferrolhos da folha passiva; baguete vista de dentro; mola de piso tracejada e eixo do pivô.
- **Corte** (`Section(spec, cutX)`): padrão pelo meio da primeira coluna; peças cortadas pesadas, vidro fino, maçanetas e ferragens vistas ao lado.

---

## 13. Configurador (UI)

`U:JoineryDialog.tsx` (1258 linhas) é um diálogo único que lista os tipos do projeto à esquerda e o tipo em edição à direita com **desenhos do motor** (elevação interna e externa, planta, corte) e **prévia 3D** (`U:JoineryPreview3D.tsx`), mais o termo IFC resultante. Salvar é um só comando (`architecture.createJoineryType` / `updateJoineryType`); cada elemento do tipo é refeito. Prévia: `architecture.joineryPreview`, devolve `boxes` (com `profile` e `holes`), `panels`, `drawings`, `grid` (`inner`, `cols`, `rows`, `mullions`, `transoms`, `meetings`, `pairs`), `ifcType`, `glazing`, `problem`.

### 13.1 Parâmetros expostos (agrupados como no diálogo)

- **Identificação**: nome, marca, largura, altura, peitoril (janela); **Estilo** (menu com "(modified)" quando um campo que o estilo define foi alterado: `styleModified`).
- **Quadro**: profundidade, largura, posição na parede (`exterior|core|centre|interior` + "set back"), largura de montante e de travessa padrão, perfil de biblioteca do batente e da folha (`ProfilePickerField`, botão "Plain"), **sistema de perfil** (PVC, alumínio, madeira, aço: `Joinery.ProfileSystems`, valores em §16.2) com rebaixo, sobreposição, baguete, pingadeira.
- **Grade**: colunas e linhas por pesos relativos **ou** por milímetros (largura de colunas, altura de linhas de baixo para cima); montantes e travessas com largura individual (null/0/valor) e atalho para `defaultMeeting` ao zerar um montante entre duas folhas.
- **Painéis** (`PaneEditor`): clique na elevação ou na lista; operação (agrupada por tipo de esquadria, rótulos de mão pelas convenções do fabricante: `HAND_LABELS`, atenção à inversão IFC), **preenchimento** (vidro/cego), **dividir** (adiciona linha de grade a uma distância em mm; folha de porta dividida horizontalmente deixa uma bandeira fixa de vidro), **unir** com vizinho (`joineryGrid.ts: split, merge, neighbour, tidy, resized, shifted`).
- **Encontro de folhas**: tipo, folha ativa, sobreposição do rebaixo (falso), largura e espessura da baguete, ferrolhos.
- **Forma e barras** (`ShapeFields`, linha ~418): forma (as oito mais "Drawn outline"); botão "Draw outline…" que abre a prancha; altura da cabeça (`Rise of the head`) ou raio do canto; checkbox "Transom at the springing"; barras na cabeça (`none|sunburst|mullions|cross`) e número de raios; muntins (`none|grid|prairie|diamond`) com luzes na largura/altura, margem, largura da barra. Campos aparecem/escondem conforme a forma (por exemplo, muntins ocultos para `circle` e `outline`).
- **Vidro**: composição ("4-16-4") com espessura derivada, ou espessura direta; cor e material.
- **Ferragens**: maçaneta (`auto lever knob pull window none`), altura da maçaneta de porta, cor.
- **Detalhes**: acabamento de ombreira (modo, material, espessura), peitoril interno e externo (projeção, espessura, avanço, inclinação), alizar (largura, projeção, lado inferior), soleira; fachada: venezianas, grade, floreira, marquise, fecho, cabeça, avental; cada um com material/cor e deslocamentos (`Along`, `Rise`, `Gap`).
- **Bay/bow/box** (`BayFields`), **garagem** (`garageDoors.ts`), **vidro sem moldura** (fixação pivô/dobradiça/mola de piso, vidro, folga, folga sob a folha; modelo da mola, pivô, fixação inferior, retenção), **dados** (`JoineryData.tsx`: botão em `JoinerySection`), **materiais por parte** (`MaterialPart`: frame, sash, glass, leaf, board, hardware), **verga** (`LintelRuleEditor`), **parâmetros livres** (`ParamsSection`), salvar na biblioteca e excluir o tipo.
- **Estilos** (decisão 188, "pacotes de estilo do BubbleBIM", `JOINERY_STYLES`, linha 146): `modern`, `classical` (grade 2×3), `georgian` (3×3), `victorian` (segmental com `rise = w/6` e grade 1×2), `romanesque` (round), `arched-casement` (#112: um caixilho em arco segmental `rise = w/4`, sem travessa, uma luz), `baroque` (round com sunburst 5 e grade 2×3), `gothic` (pointed, `bars = mullions`), `tudor` (pointed com `rise = 0,3·w`, losango 4 de largura), `prairie` (margens de 0,10), `traditional` (grade 1×2), `oculus` (circle com cruz, altura = largura), `frameless-glass`. Cada estilo põe forma, barras e muntins de uma vez; `styleDetails(key, d)` troca também os ornamentos (alizar, cornija, pedra-chave, avental, peitoril de pedra). Tudo permanece editável depois.

### 13.2 Vão nu (`U:OpeningDialog.tsx`, `U:WallOpening.tsx`)

Diálogo pequeno: largura, altura, peitoril, cabeça (retângulo, arco segmental, arco elíptico, semicírculo, cantos arredondados; círculo na ferramenta), `Rise`/raio do canto, finalização de ombreira (nenhuma/reboco/madeira, espessura, material), verga (regra da parede/nenhuma), figura SVG do vão na parede (usa `openingShape.ts`, a mesma matemática reescrita em TypeScript, **sem `pointed`/`gable`**; passo fixo de 24 peças em vez da regra de cordas), e "Change to" (porta/janela de tipo escolhido, "Fit the type to the opening"). Comando `architecture.updateWallOpening {ids, …}`: vários vãos de uma vez, um passo de desfazer.

---

## 14. Decisões numeradas citadas nos comentários

Texto completo em `docs/decisions-pending.md`. Resumo do que cada número muda:

| Nº | Assunto | Onde aparece |
|---|---|---|
| 127 | Acabamento de ombreira, peitoril interno e externo, alizar, soleira como peças com material | `Openings.Dressing`, `JoineryReveal`, plano §3 |
| 174 | Acessórios de fachada (venezianas, grade, floreira, marquise), medidos pelas faces reais da parede, ajustáveis à mão | `WindowDressings.cs`, relatórios #38/#39/#47 |
| 188 | Esquadrias que não são retângulo: formas, bandeira, barras, muntins, ornamentos, estilos, maçanetas | `JoineryShapes.cs`, `JoineryHardware`, estilos da UI, `JoineryShapeTests` |
| 247 | Vão nu (sem preenchimento) | `Openings.AddBare` |
| 253 | Vão nu com cabeça com forma; mesma matemática de `JoineryShapes`; acrescentou `elliptical` e `radiused` | `Openings.BareKinds`, `Reshape` |
| 280, 335 | citados em comentários de outros módulos; **não relacionados diretamente a esquadrias** (não foram lidos) | n/a |
| 289 | `ArchitectureVoids`: vazio exato do vão (contorno da cabeça, faixa da parede curva) | `ArchitectureVoids.cs` |
| 291 | camada sem espessura não reveste | `Dressing.Finishes` |
| 293 | Vãos a partir de choques MEP | `OpeningMaker.cs` |
| 296 | Vão real no lugar do vão de provisão | `OpeningMaker.cs` |
| 312 | Vão nu clicável e editável como porta/janela | `Openings.BareGeometry` |
| 370 | Preenchimento por painel (`Infill`), editor de painéis, sistemas de perfil (rebaixo, folha sobreposta, baguete, pingadeira), tábuas de peitoril | `JoineryPanel.Infill`, `ProfileSystems`, `joineryGrid.ts` |
| 392 | Configurador de vão nu, acabamento e verga do vão, conversão porta/janela/vão | `BareOpenings.cs`, `OpeningDialog.tsx` |
| 405 | Símbolos de planta em três níveis (LOD 100/200/300) | `JoinerySymbols.Plan`, `PlanDetail` |
| 417 | Perfil real de biblioteca em batente e folha | `FrameSection`, `SashSection`, `JoineryMember` |
| 444 | Vidro temperado sem moldura (pivô, dobradiça) | `Frameless.cs` |
| 466 | Largura de montante e travessa por limite; encontro de duas folhas (butt, rebated, astragal; ativa/passiva; ferrolhos) | `Mullions`, `Transoms`, `JoineryMeeting` |
| 488 | Mola de piso; plano de porta+janela combinadas | `Frameless`, `plan-door-window-assemblies.md` |
| 511 | Cotas temporárias de vãos | `OpeningReferences.cs`, `openingDims.ts` |
| 523 | Planta de garagem tracejada sobre o corte | `JoinerySymbols.Plan` (a decisão trata de topo de parede no registro; o comentário da planta de garagem a cita) |
| 530 | Portas de garagem | `GarageDoors.cs` |
| 546 | Manter vãos de paredes reconhecidas ao mover o início | `Openings.KeepPlaces` |

Outras referências por relatório e tópico: #48 (maçanetas e portas de garagem), #60 (bay/bow/box), #76 (posição do batente, materiais por parte, dados), #82/#83/#91 (mover, quadro), #108 (prévia 3D), #110/#111 (estilos), #112 (painéis que seguem o arco), #114 (vão nu editável), #133 (porta em parede cortina); tópico #28 (mola de piso), #34 (porta+janela e vidro), #45, #48, #64 (atravessar paredes), #72 (vãos em hospedeiro que não é parede); questão 7 (vidro sem moldura); auditoria S4 (contorno livre do vão), S11 (prancha de contorno), S14 (ferramenta única).

---

## 15. Testes (evidência do que está provado)

Há ~40 arquivos relevantes em `engine/tests/Lapin.Engine.Tests/`. Os mais úteis para derivar casos de teste no Hestia:

| Arquivo | Testes | O que prova |
|---|---|---|
| `JoineryShapeTests.cs` | 7 (a primeira é `Theory` com 8 casos) | `Rise` por forma: `round` com `w=1,2` dá 0,6; `segmental` 0,2; `elliptical` 0,3 ou 0,45; `radiused` 0,15 ou 0,6 (limite `w/2`); `pointed` equilátero 1,0392304845413265 (= 1,2·√3/2); `gable` 0,3. Parede perde exatamente a **área do arco**: `ganho = 2·(1 − π/4)·0,6²·espessura` (os dois cantos que o semicírculo não toma). Janela redonda é anel com vidro e barras e **não desenha símbolo de abertura**. IFC: exporta e relê `Shape.Kind == "pointed"` |
| `JoineryPaneTests.cs` | 4 | painel vidro ou cego qualquer que seja a operação; porta de loja com duas folhas, laterais e bandeira; montante com largura própria; sistemas de perfil acrescentam rebaixo/folha/baguete/pingadeira |
| `JoineryMeetingTests.cs` | 15 | larguras por limite, transoms, JSON ida e volta, espelho, falso, astragal, maçaneta só ativa, IFC |
| `DoorWindowCombinationTests.cs` | 9 | ver §7.1 |
| `GarageDoorTests.cs` | 8 | corpos fechados, painéis por altura, planta tracejada até o `Backroom`, IFC4 e IFC4X3, quadros |
| `BayWindowTests.cs` | 8 | peças saem da face externa, ângulos, bow sobre arco, telhado, IFC, estilos do projeto |
| `OutlinedWallOpeningTests.cs` | 4 | vão de contorno próprio, arcos cortados na curva, IFC ida e volta, desenhado sobre corte |
| `JoineryDataTests.cs` | 7 | posição `exterior/core/centre` , flip conserva a posição exterior, dados livres, psets |
| `JoineryIfcTests.cs` | 4 | mão, corpo no próprio quadro, tipo espelhado, todos os termos IFC voltam aos mesmos painéis |
| `JoineryDetailTests.cs` | 3 | acabamento por camadas da parede, parede de uma camada sem ombreira, peitoris/alizar/soleira com medidas |
| `WindowDressingTests.cs` | 5 | venezianas fechadas/abertas, grade na ombreira (nunca no batente), floreira e marquise, planta |
| `DoorReportsTests.cs` | ~10 | mover, copiar, espelhar, quadro com a mão certa |
| `ThroughOpeningTests.cs` | 11 | inclui desempenho: 2000 paredes em tempo linear |
| `OpeningReferenceTests.cs` | 6 | faces, núcleo, paredes curvas, base e topo para cortes |
| `RoundOpeningChordsTests.cs` | 3 | anel circunscrito mantém o círculo; vão redondo de provisão |
| `JoinerySymbolTests.cs` | 9 | convenções `handle`/`hinge`, tracejado do exterior, folha 90 graus com arco do tamanho da folha |
| `JoineryOutlineBoardTests.cs` | 2 | contorno desenhado vira tipo em um passo |
| `RoomOpeningTests.cs` | 8 | porta de cômodo abre para dentro seja qual for o sentido da parede |

Testes de UI (vitest): `U:garageDoors.test.ts`, `U:joineryGrid.test.ts`, `U:joineryData.test.ts`, `U:openingShape.test.ts`, `U:openingDims.test.ts`, `U:wallOpeningGrips.test.ts`, `U:joineryPreview3d.test.ts`.

---

## 16. Tabela de valores do Lapin (úteis como ponto de partida; indicativos)

### 16.1 Padrões do tipo

| Item | Janela | Porta |
|---|---|---|
| Tamanho | 1,2 × 1,5, peitoril 0,9 | 0,9 × 2,1 |
| `Frame(Depth, Width, Mullion, Transom, Offset)` | 0,07 · 0,06 · 0,08 · 0,08 · 0 | 0,10 · 0,05 · 0,06 · 0,06 · 0 |
| `Sash(Width, Depth, Leaf, Glass)` | 0,07 · 0,08 · 0,04 · 0,024 | 0,10 · 0,06 · 0,04 · 0,024 |
| Tábuas | interior 0,20; exterior 0,05 | 0 |
| Soleira | 0 | 0,02 |
| Painéis | `tilt-turn-left` + `side-right` | `swing-left` |

### 16.2 Sistemas de perfil (`Joinery.ProfileSystems`)

| Sistema | Frame (D, W, M, T) | Sash (W, D, folha, vidro) | Rebaixo | Sobreposição | Baguete | Pingadeira |
|---|---|---|---|---|---|---|
| PVC | 0,07 · 0,06 · 0,08 · 0,08 | 0,075 · 0,07 · 0,04 · 0,024 | 0,018 | 0,008 | 0,020 | sim |
| Alumínio | 0,065 · 0,05 · 0,06 · 0,06 | 0,06 · 0,065 · 0,04 · 0,024 | 0,012 | 0,006 | 0,015 | sim |
| Madeira | 0,078 · 0,068 · 0,09 · 0,09 | 0,078 · 0,068 · 0,044 · 0,024 | 0,020 | 0,012 | 0,018 | sim |
| Aço | 0,06 · 0,04 · 0,05 · 0,05 | 0,045 · 0,055 · 0,04 · 0,02 | 0,010 | 0,005 | 0,012 | não |

### 16.3 Constantes de maçaneta (`Joinery.Handle`: largura 0,03, profundidade 0,05, altura 0,14, afastamento 0,03; altura padrão 1,05 m da base da folha)

Alavanca: rosácea octogonal de raio 26 mm, pescoço 18 mm, braço até 0,13 m na direção do meio do painel; botão (rosácea 28 mm, haste 11 mm, cabeça 30 mm); barra (60 cm em porta, 25 cm em janela, em dois apoios); janela: placa 32 × 80 mm e punho pendente.

---

## 17. O que é transferível ao Hestia (TypeScript, motor TS/Rust-WASM)

### 17.1 Estado do Hestia relevante (lido, não alterado)

- `packages/model/src/openingTypes.ts`: `OpeningType` com `kind`, `width`, `height`, `sill`, `leaves 0..4`, `plan: PlanSymbol`, materiais, `frameWidth/Depth/DepthMode`, `casing`, `sillBoard`, `lintel/sillBeam`, `leafStyle`, `handle`, `frameStyle`; `Opening` com `offset`, `flipHand`, `flipFacing`, `plano`.
- `packages/model/src/openingComposition.ts` (contrato F1, ainda não exportado no `index.ts` conforme comentário): composição em células (folha, vidro fixo, painel cego, veneziana) cercadas por membros de quadro com perfis paramétricos e `ProfileSpec`; spec `docs/aberturas/F1-spec-composicao.md`, exemplos de porta com bandeira e laterais. **Bay/bow/canto fora do contrato** (riscos §(d) do mesmo doc).
- `packages/engine/src/openingCut.ts`: o furo é um **anel em planta** (`openingBandRing`, retângulo orientado ou setor radial em parede curva) usado para recortar camadas; não há perfil de cabeça no plano da elevação. **(inferência)** Um vão com cabeça em arco exigirá um recorte 3D (prisma do contorno extrudado pela espessura) além do recorte 2D, provavelmente no kernel `crates/geom-wasm/src/a3.rs` ou na camada de camadas (`camadas.rs`). Verificar antes de estimar fechado.
- `packages/geom/src/openingSymbol.ts`: símbolos de planta.
- Em `docs/aberturas/B-estado-atual.md` o corte e a elevação ainda foram descritos como retângulo, sem batente nem peitoril; verificar o estado atual (houve evolução posterior: v2, v3).

### 17.2 Matriz de transferibilidade

Esforços em **dias de desenvolvedor** (estimativa minha, para quem já conhece o repo; inclui testes; sem UI refinada salvo indicação). Não considera a decisão de produto.

| # | Item do Lapin | Valor para o Hestia | Reuso | Dependência | Esforço |
|---|---|---|---|---|---|
| 1 | **Kit de contorno com inset** (`Rise`, `Top`, `Head`, `Ellipse`, `Outline`, regra de cordas) | alto: base de tudo que tem forma | porta matemática 1:1 (fórmulas na §3); código C# é MIT, copiar o raciocínio e os valores, **não** o texto, e acrescentar o aviso no `NOTICE` | `Chords` (regra de cordas) já existe? **(inferência)** `arcSample` existe em `@hestia/geom`; confirmar se aceita tolerância | 3 a 4 |
| 2 | Recorte exato do vão por contorno (parede, camadas, IFC `OpeningElement`) | alto | muda a abstração de furo (de anel em planta a perfil de elevação extrudado); `a3.rs` já faz booleanas | risco maior: a malha de camadas e junções com furo curvo | 6 a 10 |
| 3 | Batente com cabeça em arco, travessa na nascença, bandeira fixa | alto | usa a ideia "grade + zona de cabeça"; no Hestia encaixa como **uma célula extra** da composição F1, cuja fronteira superior é a curva | composição F1 ainda não exportada; combinar com F3/F4 | 5 a 7 |
| 4 | Barras `sunburst`, `mullions` carregados, `cross`, janela redonda com raios | médio | funções puras (raio contra polilinha `Hit`, ângulos `π·i/(n+1)`) | item 3 | 2 |
| 5 | Muntins `grid`, `prairie`, `diamond` com recorte (Liang–Barsky, Cyrus–Beck) | médio | funções puras, sem dependência | folha/vidro | 2 a 3 |
| 6 | Painéis que seguem o arco (`PaneOutline`, `Band`, `Sheet`) (#112) | médio | exige que painel não seja só retângulo no modelo de composição | item 3 | 3 |
| 7 | Planta e corte por **fatia do corpo** (`Spans`), em vez de símbolo por forma | alto: evita casos especiais por forma | mudar o desenho de corte para fatiar prismas; já há símbolo próprio por família no Hestia, então é **opcional** e substitui código existente | `render/plan`, `render/section` | 4 a 6 |
| 8 | Duas folhas que se encontram (butt, rebated, astragal; ativa/passiva; ferrolhos) | médio-alto (portas duplas são comuns) | o Hestia tem `leaves 0..4`; falta o par e a ferragem | modelo de folhas | 3 a 4 |
| 9 | Largura de montante por limite (`Mullions[]`, 0 = painéis se tocam) | médio | simples, vai na composição | F1 | 1 |
| 10 | Combinação porta + janela por painel (`Infill`, operação por painel, `RailUnder`, `ParapetTop`) | alto, já é objetivo do Hestia (composição F1) | confirmar conceitos já cobertos pelo contrato F1; adotar `ParapetTop` e tábuas | F1 | 3 a 5 |
| 11 | Mapeamento IFC (§7.2): `PartitioningType`, `OperationType`, `PanelOperation`, `PanelPosition`, lining em razões, importação | alto | **tabelas prontas**, mínima reescrita; as tabelas são do padrão IFC, não propriedade intelectual do Lapin | exportador/importador IFC do Hestia | 4 a 6 |
| 12 | Pset `Pset_DoorWindowGlazingType` e `ThermalTransmittance` a partir de texto "4-16-4", "33.1" | médio | regex e fórmula de PVB em 2 linhas (§2.4); laminado `AB.n` = A+B mm + n·0,38 mm | dados do vidro | 1 |
| 13 | Posição do batente na parede por referência (`exterior/core/centre/interior` + distância) | alto, coerente com `frameDepthMode` | já há análoga; verificar equivalência | `openingHost.ts` | 1 a 2 |
| 14 | Acessórios de fachada (venezianas, grade, floreira, marquise, pedra-chave/frontão, avental) medidos por faces reais | médio (estilo "classicizante") | ideia de "faces da parede" + `Along/Rise/Gap`; geometria é caixas | dependência no item 1 para cornija em arco | 4 a 6 (todos) |
| 15 | Bay/bow/box como **faces = colunas**, linha de quadros por ângulo ou arco com bisseção, base e cobertura | médio-alto | **fora do contrato F1 do Hestia** (decisão de produto); reaproveitar `Line`/`Faces`/`Developed`/`Describe` e a lista de estilos | composição F1, telhado | 10 a 15 |
| 16 | Garagem (4 tipos + seccional lateral) com espaços necessários | médio (o mercado BR usa muito portão de enrolar/seccional) | `HeadroomOf`/`BackroomOf`/`SideroomOf`, `SectionBands`, `TrackLine` portáveis; IFC4X3 `LIFTING_HORIZONTAL` | planta tracejada sobre corte | 6 a 8 |
| 17 | Proteção solar como entidade (`IfcShadingDevice`) | médio | domínio separado, só jalousie/awning interessam já | outro módulo | 5 a 8 |
| 18 | Vão nu com cabeça, acabamento e verga; conversão porta/janela/vão com `fit` | alto: o Hestia já tem `leaves = 0` (vão livre) | estender `leaves 0` com `shape` e `rise` (pouco) | itens 1 e 2 | 2 a 3 |
| 19 | Vão que atravessa paredes sobrepostas | baixo-médio (paredes empilhadas) | cálculo por construção, nada guardado; cuidado com desempenho | camadas | 3 a 4 |
| 20 | Mover/copiar/girar/espelhar vãos mantendo o sentido de abertura | médio | regra simples: o produto escalar das direções decide `flipHand`/`flipSide` | transformador | 1 a 2 |
| 21 | Quadro com linha espelhada (`D-M`), marcas numéricas, cartas com os desenhos, nota de mão | alto, baixo custo | só regra de agrupamento e comparação numérica de marcas | `schedules` | 2 a 3 |
| 22 | Cotas temporárias de vão (`openingReferences`) | alto, depende de roteiro de cotas | o Hestia já tem `dimensionRefs.ts` (`docs/aberturas/pesquisa-f0/R7-revit-cotas-temporarias.md`); comparar | cotas | 0 a 2 (conferir) |
| 23 | Pré-visualização 3D num modelo privado com o mesmo produtor de geometria | alto, evita duas rotas de geração | arquitetura (um construtor, vários consumidores) | `openingTypeLibrary`, UI | 3 a 4 |
| 24 | Prancha de contorno livre (janela de forma própria) | baixo agora | exige o editor de esboço (`docs/detalhe-formas`) | esboço | 5+ |
| 25 | Vão de telhado e lucarna | outro módulo (telhado) | separar | telhado | n/a aqui |
| 26 | Portas/janelas por cômodo | baixo | recurso de produtividade | cômodos | 3 |

Soma indicativa dos itens **1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 18, 21, 23**: ≈ **35 a 55 dias**. Bay/garagem/dressings (15, 16, 14, 17) somam **25 a 37 dias** e podem ser fases posteriores.

### 17.3 O que **não** convém copiar

- O **modelo "spec JSON dentro do tipo"** com a geometria como função do spec está ligado a um runtime C# e a um módulo de geometria próprio; o Hestia já tem composição de células e membros (F1), que é mais explícita por membro. Aproveitar os algoritmos, manter o modelo do Hestia.
- A duplicação de `openingShape.ts` no Lapin (UI refaz o contorno em TypeScript com passo fixo de 24) **é uma fonte de divergência**: no Hestia a função de contorno deve viver só em `@hestia/geom` e ser consumida por UI, render e motor.
- Documentar o desenho de planta por forma não é necessário se o item 7 for adotado.
- `plan-door-window-assemblies.md` mostra um plano em que a variante C (um só elemento no modelo e `IfcElementAssembly` na saída) é a recomendação do autor; **não foi implementada**. Se o Hestia quiser esse comportamento, é trabalho novo; a variante A (uma classe pelo conteúdo, IFC `USERDEFINED` e propriedades por painel) é a que está pronta no Lapin.

### 17.4 Ordem sugerida (para um futuro roteiro; decisão do dono)

1. Itens 1, 9 e 21 (pequenos, independentes, ganho imediato).
2. Itens 11 e 12 (IFC fiel): independente da forma.
3. Itens 2, 3, 18 (arco no vão): é o corte de risco; fazer primeiro só `segmental` e `round` ponta a ponta (parede, batente, vidro, planta, corte, IFC) e só depois as demais formas.
4. Itens 4, 5, 6 (barras e muntins).
5. Itens 8 e 10 (portas duplas, combinações).
6. Itens 14, 15, 16, 17 (acessórios, bay, garagem, solar).

---

## 18. Riscos, pontos de atenção e dúvidas

1. **Possível ultrapassagem do topo em `round` com `H − 0,15 < w/2`** (§3.1, **inferência**; confirmar executando o teste).
2. **`openingShape.ts`** (UI) usa `riseOf` com `round = min(w/2, H)` enquanto o motor usa `min(w/2, H − 0,15)`: pequena divergência de desenho da figura no diálogo de vão nu.
3. **Forma não semântica no IFC**: um leitor externo vê uma `IfcWindow` com corpo em malha e um vão `Undefined`; só o Lapin relê `pointed` pelo JSON do `spec`. Se o Hestia quiser interoperar, escrever além disso `IfcOpeningElement` com `ExtrudedAreaSolid` sobre perfil (`IfcArbitraryClosedProfileDef`/`IfcIndexedPolyCurve`) é preferível.
4. **Curva por cordas**: a regra de 1 mm de erro e passo máximo de 15 graus é a que o Lapin usa em **toda** a geometria; o Hestia tem sua própria tolerância (`docs/parede-formas/ESTADO.md` fala em cordas e erro de 5e-4 de área). Alinhar antes de misturar.
5. `E:Joinery.cs` e `E:Openings.cs` são arquivos grandes e muito acoplados (1164 e 1098 linhas): o Lapin evitou "um módulo por tipo de esquadria"; no Hestia, dividir `contorno`, `grade`, `peças`, `símbolos` em arquivos separados, como o próprio Lapin faz com `JoineryShapes`, `JoinerySymbols`, `BayWindows`, `GarageDoors`.
6. **Licença**: MIT permite portar; exige manter o aviso de copyright e a licença em cópias substanciais. A recomendação é reimplementar a partir das fórmulas desta nota (que são geometria clássica: círculo por três pontos, elipse, arco gótico) e citar o Lapin em `NOTICE`/`docs/acknowledgements`-equivalente.
7. **Não foi executado** nenhum teste nem a UI do Lapin; os números dos testes vêm dos arquivos `.cs`.
