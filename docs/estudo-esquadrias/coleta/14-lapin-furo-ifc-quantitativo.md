# Coleta 14: Lapin, furo por contorno, acabamento (retorno), IFC, quantitativo, validação e configurador

Complemento de `../02-lapin.md` (não repete o que está lá; aprofunda cinco pontos). Fonte: `/home/user/ciuntuc-bim-studio/lapin` (clone raso, MIT), leitura estática, nada executado. Marcas: **[V]** = verificado no código (`arquivo:linha`), **[I]** = inferência minha.

Abreviações de caminho: `ARQ/` = `engine/src/Modules/Architecture/Lapin.Architecture/`; `IFC/` = `engine/src/Platform/Lapin.Ifc/`; `PLAT/` = `engine/src/Platform/Lapin.Platform/`; `T/` = `engine/tests/Lapin.Engine.Tests/`; `UI/` = `ui/src/modules/architecture/`.

---

## 1. Furo na parede por contorno

### 1.1 O furo é o mesmo contorno da esquadria, em dois lugares que precisam coincidir

- **Malha da parede**: `Openings.Cutter(f, p)` extruda `JoineryShapes.Outline(spec,0,0)` do plano `YMin-0,05` ao `YMax+0,05` quando a esquadria (ou o vão nu) tem forma; senão, uma caixa retangular. [V `ARQ/Openings.cs:436-450`]. A largura/altura usadas são as do **vão** (`p.Width`, `p.Height`), não as do tipo: `sized = spec with { Width = p.Width, Height = p.Height }` [V `Openings.cs:443`]. Isso importa em IFC importado, onde o furo do arquivo difere da esquadria (ver 1.3).
- **Vazio para IFC, quantitativos e coordenação**: `ArchitectureVoids.InWall` repete a mesma lógica (arco: banda radial; forma: `Outline` extrudado entre `YMin` e `YMax` exatos; reto: prisma retangular), com `offset` (folga de coordenação) somado à largura/altura e subtraído do peitoril [V `ARQ/ArchitectureVoids.cs:35-67`]. O comentário de classe diz "exatamente pela espessura toda do hospedeiro, acabamentos inclusos" (decisão 289) [V `ArchitectureVoids.cs:11-16`].
- **Parede cortada por booleana, parte a parte**: `Walls.cs:306` junta `Openings.Cutters` (furo + peles de acabamento + peitoris embutidos) e, para cada camada/parte, só subtrai as caixas cujo alcance em altura (`Reach`) cruza a faixa da parte (`c.o.Sill < z1 && c.o.Sill+c.o.Height > z0`) [V `ARQ/Walls.cs:306, 330-340`]. Se a biblioteca booleana (manifold) faltar, a parede é desenhada sem corte e um aviso é registrado [V `Walls.cs:314`]. Um modo de exportação limpa os cortadores (`CutOpenings=false`) para o IFC escrever o corpo cheio e deixar o leitor subtrair [V `Walls.cs:311-312`].

### 1.2 Contorno livre como furo de parede (vão nu)

- O vão nu pode ter `shape="outline"` com `profile` (cantos relativos a `along`/`sill`) e `profileArcs` (flechas por aresta) [V `Openings.cs:81-117`]. `Openings.AddOutlined` valida com `ArcOutline.Check`: >= 3 cantos, flecha finita e <= 10x a corda, área não nula, polígono sem auto-interseção, sentido anti-horário forçado [V `PLAT/ArcOutline.cs:162-186`]. `along`, `sill`, `width`, `height` do vão passam a ser **o envelope** do contorno; o contorno fica normalizado na caixa unitária (`(p.X-mid)/(x1-x0)`, `(p.Y-y0)/(y1-y0)`), então redimensionar o vão estica o desenho [V `Openings.cs:93-99, 107-121`].
- Contorno pode vir de um **croqui em vista de corte** (`drafting.convert` com `converter="wallOpening"`): um círculo desenhado vira vão `outline` com largura 1 e peitoril 1 no teste [V `T/OutlinedWallOpeningTests.cs:84-96`]. Testes também cobrem: contorno de arcos cortando parede curva, recusa de contorno que cruza a si mesmo/sai da parede [V `OutlinedWallOpeningTests.cs:27-64`; resumo, não li cada asserção].
- Para vão de **laje/forro** o contorno é lista de pontos em planta (`Slabs.HoleContour`, `contour`); `ArchitectureVoids.InSlab` aplica `Polygon2.Offset` para a folga e classifica a forma por geometria (`IsRound`: >= 12 pontos equidistantes do centro com tolerância de 1%; `IsRectangle`: ortogonalidade 1e-3) [V `ArchitectureVoids.cs:69-85, 118-138`].
- **Parede curva** nunca recebe contorno: o corte é radial retangular (`ArcCutter`, banda de arco) e o `Dressing` (acabamentos) é desligado (`PathCurve.Of(wall) is { IsArc: true }`) [V `Openings.cs:415, 429, 553`; `ArchitectureVoids.cs:42-43`].

### 1.3 Furo versus esquadria (IFC importado)

- `Place` devolve largura/altura do **furo** = `holeWidth`/`holeHeight` do vão quando existem, senão as do tipo; `fillOffset` desloca a esquadria dentro do furo [V `Openings.cs:63-72`]. Recomendação do Lapin em importação: tipos importados nascem com `details.reveal.mode="none"`, porque um retorno alargaria o furo da alvenaria da espessura do reboco nos dois lados e em cima [V `docs/spec-ifc.md:243` (texto), `Openings.cs:669` (mecanismo)].
- Em IFC, o corpo da parede exportado é o **cheio** e cada vão sai como `IfcOpeningElement` com Brep próprio (a malha de `IVoidShapes`, ou do `Solid` do vazio), `PredefinedType=OPENING`, ligado por `IfcRelVoidsElement`; o preenchimento por `IfcRelFillsElement` é escrito no fim [V `IFC/IfcExport.cs:1719-1759, 2470`]. O formato do furo **não é semântica IFC**: só o Brep + JSON do `spec` em `Lapin_Intent` (ver 3.4).
- Vão que atravessa várias paredes colineares: um `IfcOpeningElement` **por parede**, GlobalId derivado `through/<paredeId>` [V `IfcExport.cs:1762-1770`]. IFC não admite um vazio em dois hospedeiros, e o Lapin resolve duplicando [V comentário `IfcExport.cs:1762-1763`].

### 1.4 Lacunas relevantes

- **Planta**: os "vãos" que abrem a hachura da parede na planta usam só `Along ± Width/2`, ou seja, um retângulo, mesmo com cabeça em arco [V `Walls.cs:341-342`]. [I] Não é erro (a planta corta no plano do cabeçote baixo), mas um vão cujo contorno é irregular na altura de corte (ex.: circular acima do peitoril) aparece como retângulo na planta.
- **Sem checagem de interferência entre contornos**: `CheckFits` só testa caixas (`Along`, `Sill`, `Width`, `Height`) entre vãos [V `Openings.cs:136-152`]. [I] Dois vãos de contorno em arco cuja caixa não colide mas cujas curvas colidem passam; o inverso (caixas se tocando com contornos afastados) é recusado.

---

## 2. Retorno / acabamento do vão (`Reveal`, peitoris, alizar, soleira)

O Lapin chama de `Reveal` o que o Hestia chama de retorno: revestimento das ombreiras e da verga entre a face da esquadria e a face da parede.

### 2.1 Origem da espessura (regra "wall")

- `Dressing.Finishes` lê as bandas de camada da parede (`Walls.Section`) com espessura > 0 (camada sem espessura, como tinta/membrana, não conta); tira a mais externa e a mais interna; **só conta se não for o miolo e tiver material** e limita a **25 mm** (`Math.Min(0.025, ...)`) [V `Openings.cs:678-690`]. Se a parede tem < 2 bandas: sem retorno. Faces e lados seguem `flipSide` (`sy`).
- Modos: `wall` (padrão), `material` (material e espessura dados, mesma nos dois lados, `Math.Max(0, r.Thickness)`), `none` [V `Openings.cs:680-681`].
- **Retorno por lado**: caixa de ombreira esquerda, direita e verga, cada uma do plano do batente (`_yFE`/`_yFI`, offset +- profundidade/2) até a face da parede, altura `H + t` [V `Openings.cs:725-738`].
- **O que a parede cede**: `Dressing.Cutters` corta uma caixa mais larga (`W + 2t`, altura `H + t`) em cada lado, mas **só na camada que alcança** (`Reach(0,t)`), e a parede mantém o miolo do tamanho do vão nu. O teste confirma: "furo do reboco = largura + 2x20 mm; do gesso = + 2x15 mm; do tijolo: estreito = largura, largo = + 2x20 mm" [V `Openings.cs:793-801`; `T/JoineryDetailTests.cs:43-70`]. [I] Esse é o mecanismo que realmente modela o retorno como "revestimento que entra no vão", e não como adesivo no vazio: a camada de reboco é recortada mais larga e uma peça separada preenche o retorno.
- **Desativado para forma**: `_finish = JoineryShapes.Shaped(spec) ? [(0,null),(0,null)] : Finishes(...)` [V `Openings.cs:668-669`]. Em esquadria com forma o retorno é zero e a parede mantém as suas faces cortadas pelo contorno. Para **vão nu** com forma, ao contrário, existe `BareOpenings.Lining`, que é um prisma de contorno (anel, ou "U" se o vão estiver no piso) com espessura 15 mm (reboco) ou 20 mm (forro), furo interno `Outline(spec, t, bottom)` [V `ARQ/BareOpenings.cs:42-67`]. Valida `2t < largura` e `t < altura`, e espessura de 0 a 200 mm [V `BareOpenings.cs:44, 111-120, 126-130`].
- **Alizar (surround)** é diferente de retorno: banda na face externa, largura `w` e projeção `dpt`; para forma, `SurroundOutline` = banda entre `Outline(s,-w)` e `Outline(s,0)` sem a aresta inferior (anel completo para `Ringed`) [V `Openings.cs:759-770, 823-830`].

### 2.2 Peitoris e soleira

- Peitoril interno: caixa de `W + 2*Overhang`, `Projection`, `Thickness`, abaixo do plano do batente [V `Openings.cs:743-748`]. Externo: perfil varrido com inclinação (`Slope`, clamp 0..45 graus) e gotejador; o cortador da parede inclui a cunha acima do topo inclinado para a parede não "ficar de fora" (relatório #76) [V `Openings.cs:700-710, 805-810`; teste `T/JoineryDataTests.cs:30`].
- Soleira: caixa `W x (YInt..YExt) x Threshold`; o membro inferior do batente cede o lugar (`Replaces`) [V `Openings.cs:693-697, 780-786`]. Só para portas (`ThresholdOn = IsDoor && Threshold.On`) [V `Openings.cs:685`].

### 2.3 Quantidades que o retorno produz (lado quantitativo)

`DetailQuantities` produz, por esquadria, em `Lapin_Details`: `RevealAreaOutside` e `RevealAreaInside` = `(2h + w) * profundidade`, onde profundidade = `t/2 - (Offset + Depth/2)` (externo) ou `(Offset - Depth/2) + t/2` (interno), ou seja, a profundidade livre entre a face do batente e a face da parede **sem descontar a espessura da própria pele**; `SillInsideLength`/`SillOutsideLength` = `w + 2*Overhang`; `SurroundArea` = `(w+2sw)*(h+sw+[sill? sw:0]) - w*h`; `ThresholdLength` = `w`; mais `ShutterArea`, `GrilleArea`, `WindowBoxLength`, `CanopyArea` [V `Openings.cs:832-870`, em especial 845-856]. **Só gera linhas para partes que existem** (filtra `FillGeometry().Parts` por chave `reveal*|sill*|surround|threshold|shutters|grille|windowbox|canopy`) [V `Openings.cs:839`].
- [I] Como o retorno é zero para forma (2.1), a esquadria com cabeça em arco **não tem `RevealArea*`**. Quem quantificar acabamento de vão em arco no Lapin não obtém a área (cai para zero/ausente).

---

## 3. IFC: psets, tipos e PredefinedType

### 3.1 PredefinedType: sempre o mesmo, na prática

- Ao criar tipo: `DoorType`/`WindowType` com `predefined = "DOOR"`/`"WINDOW"` [V `Openings.cs:226`]; elemento `Door`/`Window` com `"DOOR"`/`"WINDOW"` [V `Openings.cs:272`; também `BareOpenings.cs:~139`, `CurtainCells.cs:607` copia o do original]. [I] Não existe campo no `JoinerySpec` para escolher `GATE`, `TRAPDOOR`, `SKYLIGHT` ou `LIGHTDOME`; esses só aparecem por outros caminhos (janela de telhado `("roof-windows") => SKYLIGHT` [V `IFC/IfcExport.cs:1569`]; barreira como `BOOM_BARRIER` em 4.3 [V `IfcExport.cs:1558`]).
- `KindOf` valida o predefinido contra a tabela por classe: `IfcDoor: DOOR, GATE, TRAPDOOR`; `IfcWindow: WINDOW, SKYLIGHT, LIGHTDOME` [V `IfcExport.cs:125-126`]; fora da lista vira `USERDEFINED` com o texto como `ObjectType` [V `IfcExport.cs:1240-1241`].
- Sem predefinido: `NOTDEFINED` [V `IfcExport.cs:1232`]. Em IFC 4.3 há tabela própria (`Classes43`, usada em `IfcExport.cs:1223`).
- **Atributos de `IfcDoor`/`IfcWindow`**: `OverallHeight`, `OverallWidth`, `PredefinedType`, `OperationType`/`PartitioningType`, `UserDefinedOperationType` [V `IfcExport.cs:1277-1278`, via `Overall()` em 1289-1298: altura/largura vêm do `spec` do tipo, senão do vão]. A porta de parede cortina usa o tamanho da célula (`IJoineryIfc.Size`) [V `IfcExport.cs:1293`; `ARQ/JoineryIfc.cs:70`].
- **Operação (porta)**: `IfcDoorTypeOperationEnum` (`SINGLE_SWING_LEFT`, ...) vai em `OperationType` do tipo **e** do elemento (o elemento repete o valor), e o texto livre (`"swing-left + fixed"`) em `UserDefinedOperationType`, relido na importação [V `IfcExport.cs:1272-1275, 1387-1393`]. Garagem: em IFC4X3 usa termos de porta de elevação; em IFC4 só "rolante" (`Operation4X3`) [V `JoineryIfc.cs` ~58-66, comentário "IFC4X3 names a lifting door, IFC4 only a rolling one"].

### 3.2 Psets/Qto e propriedades de tipo

| Conjunto | Onde nasce | O que carrega | Ref. |
|---|---|---|---|
| `Pset_DoorCommon` / `Pset_WindowCommon` (elemento) | `IfcExport.Properties` | `Reference` = **nome do tipo** (não a marca), `IsExternal` (do `spec.IsExternal` do tipo), `Status` (das fases), + FireRating e propriedades de `JoineryDataSets` | `IFC/IfcExport.cs:1812-1822, 1838-1846` |
| `ThermalTransmittance` | `JoineryDataSets` | só quando o texto de U-valor é lido como número (aceita vírgula decimal) | `ARQ/JoineryData.cs:~125-128` |
| `GlazingAreaFraction` (só janela) | idem | soma de `(Max.X-Min.X)*(Max.Z-Min.Z)` das caixas `glass` / (W x H) | `JoineryData.cs:133-134` |
| `Pset_DoorWindowGlazingType` | idem | `GlassLayers`, `GlassThickness1..3`, `IsLaminated`, `SolarHeatGainTransmittance` (g <= 1) | `JoineryData.cs:~114-124` |
| `IfcDoorPanelProperties` / `IfcWindowPanelProperties` | `JoinerySets` | um por painel (operação, posição, largura como razão da luz) | `IfcExport.cs:467-480` |
| `IfcDoorLiningProperties` / `IfcWindowLiningProperties` | idem | profundidade, espessura, soleira, posições de travessa/montante em razão (máx. 2 de cada) | `IfcExport.cs:481-489` |
| `Lapin_Joinery` | `terms.Properties` + parâmetros do usuário | termos que o IFC não diz (`PanelOperations`, `Opening`, `Glazing`) | `JoineryIfc.cs:~48-52`; `IfcExport.cs:1359-1367` |
| `Lapin_Intent` | `IntentOf` | todos os atributos editáveis (inclui `spec` JSON no tipo, `along`/`sill` no vão) | `docs/spec-ifc.md` (seção Propriedades) |
| `Qto_DoorBaseQuantities` / `Qto_WindowBaseQuantities` | `ArchitectureModule.FillQuantities` | só **`Width`, `Height`, `Area`** | `ARQ/ArchitectureModule.cs:181-182, 1408-1418` |
| `Lapin_Details` / `Lapin_GarageDoor` | idem | áreas/comprimentos de retorno, peitoris etc.; quantidades da garagem | `ArchitectureModule.cs:1419-1423` |

Pontos de atenção:
- `IsExternal` é do **tipo** (`spec["isExternal"]`) e não do elemento; só escrito se houver o campo [V `IfcExport.cs:1821`; `docs/spec-ifc.md:60` confirma "IsExternal e al tipului (#71)"]. [I] Duas ocorrências do mesmo tipo, uma interna outra externa, não são expressáveis sem criar outro tipo.
- A fração de vidro usa a **caixa envolvente** do prisma de vidro (`Min/Max` de `JoineryShapes.Prism` são os limites, ver `JoineryShapes.cs:291-295`), então vidro de cabeça em arco superestima a área [I; mecanismo V em `JoineryData.cs:133` e `JoineryShapes.cs:291-295`].
- `Qto_DoorBaseQuantities.Area` = `Width * Height` do **retângulo**, para qualquer forma [V `ArchitectureModule.cs:1412`]; **não há `Perimeter`, nem `GrossArea`/`NetArea` do furo**. O único ajuste é para janelas bay/bow/box (área desenvolvida das faces) [V `ArchitectureModule.cs:1411-1412`].
- Não há quantidades no `IfcOpeningElement` (nenhum `r.Quantities(IfcClass.OpeningElement, ...)`; só a geometria é registrada) [V `ArchitectureModule.cs:180`, busca por `Quantities(IfcClass.OpeningElement` sem resultado].

### 3.3 Estrutura de tipo e instância

- Hierarquia: `IfcRelDefinesByType` (tipo -> elemento); `IfcRelFillsElement` (vão -> elemento); `IfcRelVoidsElement` (parede -> vão); o elemento fica contido no pavimento da parede (`HostStorey`) [V `Openings.cs:262-278`; `IfcExport.cs:1216-1217`].
- Espelho: o elemento invertido em um eixo referencia um **tipo espelhado** ("<nome> (mirrored)", GlobalId derivado `#mirrored`, `LapinMirrorOf`), porque uma colocação IFC não pode espelhar [V `docs/spec-ifc.md` (seção Deschiderea), `IfcExport.cs:1342-1352`].
- Materiais: `IfcMaterialConstituentSet` por peça (`Frame`, `Sash`, `Glazing`, `Panel`, `Board`...), nomeados por `JoineryConstituents` [V `IfcExport.cs:1451-1478`].

### 3.4 O que o IFC não leva de volta

- A cabeça em arco / forma livre viaja só no JSON do `spec` (`Lapin_Intent` do tipo), e como Brep do vão e do corpo. O `OpeningVoid.shape` (`Rectangle`/`Round`/`Undefined`) classifica apenas para coordenação [V `ArchitectureVoids.cs:63-64`]. Um leitor que ignore `Lapin_Intent` vê o furo e o corpo corretos como geometria, mas sem a noção "esta janela é segmentada". Teste: exporta janela `pointed` e relê `Shape.Kind == "pointed"` via JSON [V resumo em `../02-lapin.md` §4; teste `T/JoineryShapeTests.cs` não relido por mim].
- Plano não implementado (variante C): esquadria mista porta+janela exportar como `IfcElementAssembly` agregando `IfcDoor` + `IfcWindow` [V descrito em `docs/plan-door-window-assemblies.md`; já citado em `../02-lapin.md` §7.2].

---

## 4. Quadro e quantitativo de esquadrias

### 4.1 Quadro de esquadrias (`Schedules.Joinery`)

- **Linha por tipo**, não por instância: `ScheduleEntry(Key, Kind, Spec, Mark, Name, Width, Height, Counts, Total, Occurrences, ...)`; `Counts` por pavimento; ocorrências numeradas por pavimento e ordem do modelo [V `ARQ/Schedules/ScheduleData.cs:23-24, 90-98`].
- Ordem: janelas antes de portas, marca com comparação numérica (`CompareMarks`), depois largura [V `ScheduleData.cs:55, 120`].
- Linhas separadas para (a) espelhados (`mark + MirroredMark`, "(mirrored)"), (b) porta de parede cortina com tamanho diferente do tipo (`SizedKey`) [V `ScheduleData.cs:100-117`].
- Colunas embutidas: `name, size, bay, operation, hanging, sill, levels, total, uValue, fire, lintel`; ainda parâmetros livres (`param:`) e colunas manuais (`custom:`); texto digitado sobrepõe o do modelo [V `ARQ/Schedules/ScheduleLayout.cs:46, 128-181`]. **Sem coluna de área, perímetro, volume ou peso** [V a lista `JoineryRows`, `ScheduleLayout.cs:46`].
- Nomenclatura de mão: o quadro descreve a abertura pela convenção dos arquitetos (`DoorHand`: "swing-left" IFC vira "swing right") para casar com a planta, inversa à do IFC [V `ScheduleLayout.cs:51-80`].
- Verga: quadro próprio (`Schedules.Lintels`), que lê as peças `lintel:*` da geometria de cada parede, agrupa por (pré-moldada, produto, seção, comprimento, aço), mede comprimento/largura/altura pela extensão dos vértices (arco: pelo comprimento de arco e distância radial) e marca `!` se não há comprimento comercial [V `ScheduleData.cs:128-175`; `ScheduleLayout.cs:171`]. O quadro de esquadrias cruza com a verga pela marca do tipo (`typeMarkOf`) [V `ScheduleData.cs:134-136`].
- Aviso de marcas: `Check` devolve (`twice`, `none`, `marks`) para o quadro de itens (elemento listado duas vezes, listado em nenhum quadro) [V `ARQ/Schedules/ScheduleEntity.cs:123-136, 646-681`]. [I] Isto é verificação de **cobertura de quadro** (elemento fora de qualquer quadro), não unicidade de marca de tipo; a unicidade de marca entre tipos não é imposta no motor (a marca é texto livre em `spec.Mark`; a numeração do elemento usa `Numbering.Next` por sufixo numérico) [V `ARQ/Numbering.cs:9`; `Openings.cs:269-272`]. Se a nota do `../02-lapin.md` afirma "alerta de marcas duplicadas", valia conferir o texto de `ScheduleEntity.cs:121-136` antes de repetir.

### 4.2 Quantitativo geral (`QuantityTakeoff`)

- Soma `QuantitySet`s dos elementos por dimensão (`kind`, `type`, `storey`, `material`) e mede com nomes comuns: `Length`, `GrossArea`, `NetArea`, volumes, peso, `Pieces` [V `ARQ/Schedules/QuantityTakeoff.cs:26-44`; `PLAT/QuantityNames.cs:13-36`]. Para esquadria entra o `Area` do `Qto_*BaseQuantities` (Width x Height do retângulo), tomado como bruto **e** líquido ("a door's Area is both") [V `QuantityNames.cs:21-27`].
- **Parede**: `Qto_WallBaseQuantities.NetSideArea` = volume líquido das peças / largura, onde o volume é da malha **já cortada**; portanto o desconto de vão por contorno (arco, forma livre) é exato, e não pela caixa [V `ARQ/Walls.cs:1199-1217`]. `GrossSideArea = comprimento x altura`. [I] A área de parede a pintar/revestir se obtém por camada (`Lapin_WallLayerQuantities` com `NetSideArea` por camada) e já respeita o furo cortado e o alargamento de cada pele de retorno [V `Walls.cs:1250-1259`].
- Dependência prática: sem booleana (manifold) a parede sai "sem corte" e esses líquidos ficam errados [V aviso `Walls.cs:314`].

### 4.3 O que falta, no Lapin, para quantitativo de esquadria completo

[I, a partir de 3.2 e 4.1] perímetro de furo (para selante/espuma), área real do contorno em forma, área de vidro por painel (só em fração), peso/vidro por composição, e quantidade do `IfcOpeningElement`. A tabela de vidros e Uw por EN ISO 10077-1 são citadas como não implementadas (buscas por `10077` sem ocorrência) [V `../02-lapin.md` §7.2].

---

## 5. Regras de validação (o que o Lapin recusa, e onde)

Todas em português abaixo; texto original em inglês no código.

### 5.1 No tipo (`Joinery.Problem`, `ARQ/Joinery.cs:606-657`)

1. Largura/altura positivas e finitas; profundidade e largura de batente positivas.
2. 1 a 12 colunas e linhas; larguras de coluna/linha positivas; montantes/travessas entre 0 e 1.
3. Encontro de folhas: tipo válido (`JoineryMeeting.Kinds`), lado ativo válido, sobreposição/astrágalo 0 a 120 mm, espessura do astrágalo 0 a 40 mm.
4. Vidro: composição `4-16-4` legível; espessura total <= `max(Sash.Depth, Frame.Depth) - 4 mm` (exceto sem moldura).
5. Elevar-e-correr só na fileira de baixo.
6. Janela redonda: precisa de `2*FrameWidth + 100 mm` em largura e altura. Contorno livre ("ringed"): idem + área interna >= 0,01 m2; **porta não pode ter contorno livre** (só retângulo ou as cabeças).
7. Cabeça com travessa: folga mínima de 100 mm sob a nascença; painéis que seguem o arco: nenhum painel de topo pode ter o arco descendo a menos de 100 mm da base da fileira; célula mínima 50 mm; folha com lado mínimo `2*Sash.Width + 50 mm`.
8. Bay/bow/box: janela apenas, retangular, 3 a 12 colunas, projeção entre `Depth+50 mm` e 3 m, ângulo 15..90 graus (bay), flecha <= meia largura (bow), telhado 5..60 graus, cada face >= 250 mm e validada como janela plana [V `ARQ/BayWindows.cs:211-234`].
9. Porta de garagem: 1x1, retângulo emoldurado sem forma/bay/sem moldura, 0,6..12 m x 1,5..7 m, listas fechadas (acabamento, trilho, caixa, mecanismo, lado do postigo), 2..16 seções, headroom 0..4 m, backroom 0..15 m, sideroom 0..2 m, postigo 0,6..1,2 m e >= 1,9 m de altura [V `ARQ/GarageDoors.cs:69-95`].
10. Vidro sem moldura: retângulo, vidro 6..25 mm, folga 0..20 mm, folga sob folha 0..30 mm, mola de piso dentro de limites de massa/largura/pivô/retenção; só folhas na fileira de baixo; painel >= 150 mm [V `ARQ/Frameless.cs:85-150`].

### 5.2 Na colocação (`Openings.CheckFits`, `ARQ/Openings.cs:136-152`)

- Largura e altura positivas; dentro do comprimento da parede e da altura (alargados pelo alcance de paredes coladas se `ThroughOpenings`); sem sobreposição de caixa com outro vão da mesma parede. Mensagens citam mm. `UpdateType` reaplica a todos os vãos do tipo (recusa se algum deixar de caber) [V `Openings.cs:236-248`].
- `alone=true` (vão lido de arquivo) restringe ao próprio hospedeiro [V `Openings.cs:140-142`].

### 5.3 No vão nu, na conversão e no desenho de contorno

- Cabeça: uma de `rect, segmental, elliptical, round, radiused, circle`; `rise > 0` [V `Openings.cs:325-336`]. Retorno: espessura 0..200 mm e `2t < largura`, `t < altura` [V `BareOpenings.cs:111-130`]. Verga: `wall` ou `none`. Conversão porta/janela -> vão nu: cabeça `pointed`/`gable` vira retângulo [V `BareOpenings.cs:153-158`, ver `../02-lapin.md` §11].
- Contorno livre: regras de `ArcOutline.Check` (1.2); prancha de contorno recusa porta e exige uma única figura fechada (`JoineryOutlineBoard.Edit`, `.Finish`) [V `ARQ/JoineryOutlineBoard.cs:44-47, 120-125`].

### 5.4 Quando recusa pela exceção cruzada

- Garagem, vidro sem moldura e bay recusam forma; acabamento de ambientes ignora vão com forma [já em `../02-lapin.md` §4].

### 5.5 Onde a validação aparece ao usuário

- **Pré-visualização**: `Preview3D` devolve `{problem}` com a mesma mensagem de `Joinery.Problem` (ou a `CommandException` capturada) e o diálogo mostra em `error-text` e **desabilita "Save type/Create type"** enquanto houver `problem` (ou o tipo mudar de classe) [V `ARQ/JoineryPreview3D.cs:23, 44`; `UI/JoineryDialog.tsx:1203, 1214`]. A validação roda no motor, não no front: a UI só reflete [I].
- Criar/atualizar tipo chama `Joinery.Problem` e lança `CommandException` [V `Openings.cs:222, 245`].

---

## 6. Configurador de esquadrias: pontos além de `02-lapin.md` §13

(Não repito a lista de parâmetros.)

- **Um único canal de verdade**: o front não valida geometria. A cada edição ele chama `architecture.joineryPreview` e recebe `boxes` (com `profile`/`holes`), `panels`, `drawings`, `grid`, `ifcType`, `glazing`, `problem` [V `UI/JoineryDialog.tsx:191` (tipo `Preview`); `ARQ/JoineryPreview3D.cs:23-44`]. O botão Salvar fica preso ao `problem`. **Consequência [I]**: o termo IFC (`ifcType`) e os desenhos já aparecem em tempo real, então o usuário vê "DOUBLE_PANEL_VERTICAL" ou `USERDEFINED` antes de salvar.
- **Salvar atualiza todas as instâncias**: um comando (`createJoineryType`/`updateJoineryType`), cada elemento do tipo é refeito, `UpdateType` reaplica `CheckFits` em todo vão [V `ArchitectureModule.cs:916-923`; `Openings.cs:240-248`]. Mudar entre porta e janela é recusado (`kindChanges` desabilita o botão) [V `Openings.cs:244`; `JoineryDialog.tsx:1214`].
- **Estilos como pacotes**: um estilo define forma + barras + muntins + ornamentos de uma vez e o campo marcado "(modified)" avisa quando algo foi alterado (`styleModified`) [V `JoineryDialog.tsx` ~linha 146, `JOINERY_STYLES`; já em `../02-lapin.md` §13.1].
- **Atalhos de acabamento no configurador**: a seção "Detalhes" (retorno, peitoris, alizar, soleira, fachada) edita o `JoineryDetails` do mesmo tipo; por isso o retorno é dado do **tipo**, e não do vão (diferente do vão nu, onde o retorno é do próprio vão). [V `Openings.cs:660-669` (lê `spec.Details.Reveal`); `BareOpenings.cs:Finish` (lê o vão)]. [I] Para o Hestia, é uma escolha de modelagem a copiar ou evitar: retorno por tipo exige tipos diferentes para paredes de revestimento diferente; o Lapin contorna com a regra `wall`, que lê as camadas da própria parede.
- **Vão nu com a mesma matemática reescrita em TS** (`openingShape.ts`), sem `pointed`/`gable`, passo fixo de 24 peças [V `../02-lapin.md` §13.2]; [I] duplicação deliberada para figura SVG instantânea.

---

## 7. Conclusões para o Hestia (curtas, todas [I])

1. **Furo por contorno**: copiar a regra "um só contorno para parede, IFC e quantitativo" (`Openings.Cutter` e `ArchitectureVoids.InWall` coincidem), e a decisão de o furo usar largura/altura do **vão**, não da esquadria (compatível com IFC importado).
2. **Retorno**: o mecanismo "parede mais larga só na camada de acabamento + peça de retorno que preenche" é o que faz o quadro de áreas fechar. O desligamento para esquadria com forma é uma limitação, não uma virtude: o Hestia, se quiser retorno em arco, deve seguir o caminho de `BareOpenings.Lining` (anel em torno do contorno), que já existe.
3. **IFC**: o Lapin deixa `PredefinedType` fixo (DOOR/WINDOW), preenche `OverallHeight/Width` do tipo, `Pset_*Common` mínimo e o resto em `Lapin_*`. Quem quiser quadro por IFC no Hestia precisa de mais Qto (`Perimeter`, `GrossArea` do furo, áreas de vidro/moldura) do que o Lapin entrega.
4. **Quantitativo**: nenhuma quantidade no `IfcOpeningElement` e nenhuma área real para forma; ambos são lacunas a cobrir no Hestia, não coisas a copiar.
5. **Validação**: regras ricas e fechadas, em um só `Problem(spec)`, refletidas na prévia e travando o botão. O padrão (valida no motor, UI só mostra e bloqueia) é diretamente aproveitável.

## 8. O que não consegui confirmar

- Não reli cada asserção dos testes `OutlinedWallOpeningTests`, `JoineryShapeTests` e `OpeningVoidTests`; usei os nomes e trechos lidos.
- Não abri `JoineryIfc.FromIfc` (importação) nem `IfcImport` além de grep; o que digo da importação vem de `docs/spec-ifc.md`.
- As linhas citadas de `JoineryData.cs` (~114-128) e `JoineryIfc.cs` (~48-66) são aproximadas (li o trecho, não anotei o número exato de cada instrução).
