# 03 · ArchiCAD e Revit: como parametrizam portas e janelas (formas, tipos, parâmetros, IFC)

Tarefa A3 do estudo de esquadrias. Complementa, sem repetir, `docs/aberturas/archicad/01-04`, `docs/aberturas/pesquisa-f0/R1-R7` e `docs/05-REFERENCIA-REVIT-ARCHICAD.md`. Quando um assunto já está bem coberto lá, este documento só aponta o arquivo e acrescenta o que faltava.

## 0. Método e limites desta pesquisa (leia antes)

**Limite de rede.** Nesta sessão o WebFetch não resolveu nenhum host (help.graphisoft.com, helpcenter.graphisoft.com, community.graphisoft.com, help.autodesk.com, ifc43-docs.standards.buildingsmart.org: `getaddrinfo ENOTFOUND`). Esses domínios precisam ser liberados nas configurações de rede da sessão se for desejada leitura direta das páginas. Toda informação nova abaixo vem de **resumos devolvidos pelo WebSearch** (que citam trechos das páginas), não de leitura integral. Por isso a legenda separa níveis:

| Marca | Significado |
|---|---|
| **[OFICIAL-busca]** | Trecho de página oficial (Graphisoft Help, GDL Reference, Autodesk Help, buildingSMART) devolvido pela busca desta sessão. Não li a página inteira. |
| **[OFICIAL-prévio]** | Já confirmado em página oficial nos docs anteriores do repositório (cito o arquivo). Não reverifiquei. |
| **[COMUNIDADE]** | Fórum Graphisoft/Autodesk/AUGI, blog (Novedge, BIMpure, etc.). Prática relatada, não norma do produto. |
| **[INFERIDO]** | Dedução minha ou conhecimento de memória não confirmado em fonte nesta sessão. Não vira código sem verificação. |

Faixas numéricas de parâmetros (mín/máx) raramente são publicadas pelos fabricantes; onde digo "faixa: não publicada", é isso. Onde sugiro faixa para o Hestia, está marcada [INFERIDO] e é proposta de projeto, não dado do ArchiCAD/Revit.

## 1. Resumo para decisão

1. **Nenhum dos dois tem um parâmetro "forma" genérico para esquadria.** No ArchiCAD a forma não retangular é um **objeto GDL** com furo (`WALLHOLE`) próprio, ou um elemento **Opening** (retangular/circular/poligonal) sem folha nem batente. No Revit é uma **família** com forma modelada por extrusões e **void** (ou "Opening" da família), com parâmetros ligados a planos de referência. A "forma" é geometria + script, não um enum.
2. **Furo e esquadria são duas geometrias.** Nos dois programas o furo na parede pode ser diferente do contorno da esquadria (ArchiCAD: `WALLHOLE` vs. script 3D; Revit: Opening/void vs. extrusões sólidas). Hestia deve manter **contorno do vão** e **contorno da esquadria** como dois polígonos distintos, com o do vão derivado do da esquadria + folga/requadro por padrão.
3. **Arco: nos dois é caso especial com poucos parâmetros** (ArchiCAD: objetos de biblioteca "arch top" + Masonry Arch como peça opcional com `Rise`; Revit: arco por família com altura do arco amarrada a plano de referência, e arco com altura 0 quebra). O Hestia deve tratar "arco" como **primitiva** (`arcoAbatido` com `flecha` > 0 e raio derivado), não como polígono.
4. **Circular, triângulo, trapézio, polígono livre**: nenhum dos dois tem biblioteca padrão confirmada para triângulo/trapézio (busca desta sessão: nada encontrado). A rota oficial é **polígono livre** (ArchiCAD: slab com ID "wallhole" salvo como janela editável, ou Opening poligonal; Revit: void extrusion com perfil desenhado). Para o Hestia, **contorno = lista de segmentos (reta/arco) com cotas e restrições** cobre todos os casos.
5. **IFC** carrega: dimensões globais (`OverallWidth/OverallHeight`), tipo de partição (`PartitioningType`), operação, e propriedades de batente/painel (`LiningDepth`, `LiningThickness`, `FrameDepth`, ...). **Não carrega** forma não retangular como parâmetro: ela vai na representação geométrica (e o furo vai em `IfcOpeningElement`) [INFERIDO sobre o furo; ver §6].
6. **Schedule/quadro**: Revit só agenda/etiqueta parâmetro **compartilhado** ou nativo; ArchiCAD agenda propriedades e parâmetros de biblioteca expostos. Hestia: todo parâmetro de quadro deve ter id estável (equivalente ao GUID de shared parameter).

## 2. Formas não retangulares

### 2.1 ArchiCAD

| Forma | Como se faz | Parâmetros expostos | Fonte / nível |
|---|---|---|---|
| Retangular (padrão) | Furo retangular automático A×B | `A`, `B`, tolerâncias, reveal | [OFICIAL-prévio] 03 §3.1 |
| **Furo livre em objeto GDL** | Script 3D com `WALLHOLE n, status, x1,y1,mask1...`. Se existir pelo menos um `WALLHOLE`, **nenhum furo retangular automático** é gerado; pode haver vários polígonos, até intersectantes; **não gera requadro (reveal) automático** e **não afeta a planta 2D** (para 2D usa `WALLHOLE2`, `WALLBLOCK2`, `WALLLINE2`, `WALLARC2`). `WALLNICHE` (prismático/piramidal/cunha; finito/semi/infinito) é mais estável sob espelhamento | polígono = lista de vértices com máscara de aresta; sem parâmetro "forma" | [OFICIAL-prévio] 01 §14.5, 02 §3.4; reforço [OFICIAL-busca] GDL Reference "Doors and Windows": https://gdl.graphisoft.com/reference-guide/doors-and-windows/ |
| **Janela/porta custom via modelo** | Modelar a forma com Slab/elementos; dar ao slab o ID `wallhole`; `File > Libraries and Objects > Save 3D Model as` tipo Window/Door com **Editable GDL Script** marcado. Sem o slab `wallhole`, o objeto salvo tem furo retangular. A orientação da vista 3D ao salvar define a orientação em planta | nenhum (objeto fixo) a menos que se edite o GDL | [OFICIAL-busca] Knowledge Base https://helpcenter.graphisoft.com/knowledgebase/25564/ ; [COMUNIDADE] https://community.graphisoft.com/t5/Design-articles/How-to-create-Custom-Window/ta-p/303432 e https://community.graphisoft.com/t5/Libraries-objects/Custom-Shaped-Window-and-Library-Part-Maker/m-p/343092 |
| Library Part Maker (add-on) | Só cria furo **retangular**; não serve para forma custom | - | [COMUNIDADE] (mesmo link acima) |
| **Arco (janela/porta de biblioteca)** | Objetos "arch top" da biblioteca; segmentos do arco controlados por um parâmetro tipo "Curve resolution" | resolução da curva; raio do arco não é ajustável em todos os objetos (usuários pedem) | [COMUNIDADE] https://community.graphisoft.com/t5/Modeling/Segmental-Arched-Transom-or-Window/m-p/144903 , https://community.graphisoft.com/t5/Modeling/Arched-Window-Headers/td-p/171702 ; exemplo comercial https://bimcomponents.com/GSM/Details/16449 |
| **Masonry Arch** (peça opcional de porta/janela) | Liga um arco de alvenaria sobre o vão; desligado por padrão | `Style` (reto, curvo, Jack...), `Rise` (flecha), `Skewback angle` (Jack), `Type` (Stucco/Brick), espessura tijolo/argamassa, `Keystone`, altura/profundidade, `Rear Hold Depth`, `Projection`, `Arch on Header`, `Niche below Arch`, `Horizontal Overhang` | [OFICIAL-prévio] 01 §3.16; reforço [OFICIAL-busca] https://help.graphisoft.com/AC/28/INT/_AC28_Help/151_DoorWindowCustomSettings/151_DoorWindowCustomSettings-19.htm e https://support.graphisoft.com/hc/en-us/articles/34225645616401-How-to-create-a-window-with-a-masonry-arch |
| Arco com requadro inclinado | Procedimento documentado pela Graphisoft (arquivo) | via GDL/objeto | [OFICIAL-busca, só título] https://helpcenter.graphisoft.com/graphisoft-archives/25614/ (não li o corpo) |
| **Elemento Opening** (ferramenta própria, sem folha/batente) | Corte em paredes, lajes, telhados etc. Formas: **Retangular, Circular, Polygonal** (poligonal desde AC25; editar o formato de retangular/circular o converte em poligonal, exceto elipse). Corpo = extrusão linear de um polígono base. Limites **Infinite / Limited** (um ou dois lados). Âncora em **9 pontos**; elevação medida da Home Story do elemento hospedeiro até a âncora. Orientação: Aligned (padrão), Vertical, Horizontal, Custom | forma, limites, âncora, orientação, elevação | [OFICIAL-busca] https://help.graphisoft.com/AC/28/INT/_AC28_Help/040_ElementsVB/040_ElementsVB-258.htm e https://help.graphisoft.com/AC/30/INT/Topics/040_ElementsVB/040_ElementsVB-259.html . Sem forma "arco" nativa: moderador sugere círculo meio dentro da parede, combinação de openings ou polígono (COMUNIDADE: https://community.graphisoft.com/t5/Modeling/Create-opening-from-Selection-does-not-follow-the-shape/m-p/632576) |
| Circular (oculus) | Opening circular, ou objeto GDL com `WALLHOLE` circular | diâmetro | [OFICIAL-busca] (Opening) ; GDL [OFICIAL-prévio] |
| Triângulo / trapézio | **Sem objeto de biblioteca confirmado**; rota = polígono (wallhole custom ou Opening poligonal) | vértices | busca desta sessão não achou; [INFERIDO] |
| Janela em parede curva / poligonal | Custom window pode funcionar em reta e falhar em curva; GDL é necessário para comportamento correto; trims GDL não curvam sozinhos | - | [COMUNIDADE] https://community.graphisoft.com/t5/Libraries-objects/Windows-in-curved-walls/m-p/36251 , https://community.graphisoft.com/t5/Modeling/Window-Mullions-Curved-Wall/td-p/31551 |
| Ferramenta de terceiros | "Infinite Openings" (CADswift) para formas arbitrárias | - | [COMUNIDADE] https://community.graphisoft.com/t5/Libraries-objects/Curved-arched-window/m-p/227243 |

**O que isso diz sobre o modelo do ArchiCAD** [INFERIDO a partir das fontes]: a esquadria "de forma" é um **par (furo, geometria)** gerado pelo mesmo script; o usuário final parametriza **largura/altura** e, quando existe, **flecha/raio**. Não há edição gráfica de vértices de uma janela de biblioteca na instância; para isso usa-se o elemento Opening (poligonal) ou cria-se outro objeto.

### 2.2 Revit

| Forma | Como se faz | Parâmetros | Fonte / nível |
|---|---|---|---|
| Retangular (padrão) | Família Window/Door com **Opening** (corte) retangular + extrusões de quadro/folha/vidro ligadas a planos de referência | `Width`, `Height`, (`Thickness` em porta) | [OFICIAL-prévio] R4; [COMUNIDADE] https://novedge.com/blogs/design-news/revit-tip-building-robust-parametric-window-families-in-revit |
| **Arco / circular / qualquer contorno** | Dentro da família: **Void Extrusion** (ou Void Sweep/Revolve) com o perfil desejado, travada em planos de referência, para cortar a parede. O "Opening Cut" do template é retangular em planta e não segue contorno curvo; fóruns recomendam trocar por void | altura do arco por plano de referência + cota; raio derivado | [COMUNIDADE] https://forums.autodesk.com/t5/revit-architecture-forum/arch-window-not-cutting-properly/td-p/7141614 , https://forums.autodesk.com/t5/revit-architecture-forum/straight-window-in-curved-wall/m-p/7497491 |
| Restrições do void | Uma família **não pode ter Opening e void cortando o mesmo hospedeiro** ("A family cannot have an opening and a cut in the same host"); um lado de extrusão não pode estar hospedado em dois planos de referência diferentes | - | [COMUNIDADE] https://forums.autodesk.com/t5/revit-architecture-forum/voids-in-door-family-with-openings/td-p/6247318 , https://forums.autodesk.com/t5/revit-architecture-forum/linking-generic-model-void-to-two-different-reference-planes/m-p/8855460 |
| Altura de arco = 0 | Impossível: o arco perde raio. Precisa de valor mínimo > 0 ou lógica `if` | faixa mínima > 0 | [COMUNIDADE] https://forums.autodesk.com/t5/revit-ideas/flat-straight-arcs/idc-p/10968317 |
| Void não-anexado ("Cut with Voids When Loaded") | Marca da família: ao carregar, vazios cortam sólidos; se o void ficar solto, corta-se manualmente com Cut Geometry (caso porta de bolso com topo arqueado) | checkbox de família | [COMUNIDADE] https://forums.autodesk.com/t5/revit-architecture-forum/arch-top-pocket-door/td-p/12908315 ; [COMUNIDADE, resumo de Autodesk Help 2021] https://revitcat.blogspot.com/2021/02 |
| Furo circular/poligonal **sem esquadria** | Ferramenta de projeto **Wall Opening** só faz retangular; circular/poligonal = **Edit Profile** da parede | perfil da parede | [OFICIAL-busca] Autodesk Help (citado em resumo): "Use the Wall Opening tool to cut rectangular openings... To cut round or polygon openings, see Edit a Wall Profile" |
| Void circular aninhado | Funciona em relatos | - | [COMUNIDADE] fórum acima |
| Janela reta em parede curva | Troca Opening por Void Cut | - | [COMUNIDADE] fórum "straight window in curved wall" |
| Triângulo / trapézio | **Nenhuma família nativa**; contorno = void com perfil desenhado | cotas de planos de referência | busca não achou nada específico; [INFERIDO] |

### 2.3 Comparação e proposta para o Hestia

| Aspecto | ArchiCAD | Revit | Proposta Hestia [INFERIDO] |
|---|---|---|---|
| Onde mora a forma | script GDL (`WALLHOLE`) ou Opening poligonal | geometria de void na família | `contornoVao` = polígono de segmentos reta/arco, separado de `contornoEsquadria` |
| Edição na instância | por parâmetros (A, B, flecha); vértices só em Opening | por parâmetros do tipo/instância | parâmetros de forma por **primitiva** (arco: `flecha`; círculo: `diametro`; trapézio: `alturaEsq/alturaDir`; triângulo: 2 lados + base) com fallback "polígono livre" |
| Requadro/reveal em forma livre | **não automático** (precisa script) | depende do void + Wall Closure por plano de referência | Hestia deve gerar requadro **offsetando o contorno** (decisão própria; ambos os produtos deixam manual) |
| Planta 2D | script 2D separado (`WALLHOLE2`...) | símbolo/linhas da família | planta derivada do mesmo contorno, com opção de simbólico |
| Parede curva | falha/exige GDL | exige void em vez de opening | declarar suporte explícito; v1 só parede reta |

## 3. ArchiCAD: portas e janelas (o que acrescentar ao que já existe)

O inventário completo de abas (Nominal Sizes, Shape, Door/Window Settings and Opening, Frame Style, Leaf, Sash, Opening Type and Angle, Model Attributes, Wall Opening, Reveal, Wall Closure, Wall Inset, Masonry Arch, Tolerances, Fixtures, Threshold, Sill, Board, Casing, Sunshade, Floor Plan and Section, Minimal Space) está em `aberturas/archicad/01` (porta) e `02` (janela), com marca de confiança. **Não repito.** Abaixo: (a) matriz parâmetro × onde afeta, consolidando o que já foi confirmado; (b) o que esta sessão acrescentou.

### 3.1 Matriz parâmetro × onde afeta

Colunas: **2D** = planta/símbolo; **3D** = geometria/corte/elevação; **Q** = quadro/lista/marcador; **IFC** = exportação. "Faixa" = intervalo documentado. Tipos: L = comprimento, B = booleano, E = enum, A = ângulo, T = texto.

| Parâmetro (nome ArchiCAD) | Tipo | Faixa | 2D | 3D | Q | IFC | Nível |
|---|---|---|---|---|---|---|---|
| Width (`A`) / Height (`B`) = nominal | L | não publicada | sim | sim (define furo retangular) | sim (cota do marcador, `Size to Show`) | `OverallWidth/OverallHeight` | [OFICIAL-prévio] 01 §3.1, 03 §10.1; IFC [OFICIAL-busca] https://help.graphisoft.com/AC/28/INT/_AC28_Help/121_IFC/121_IFC-50.htm |
| `Size to Show` do marcador: Wallhole / Unit / Leaf / Egress | E | 4 valores | sim | não | sim | não | [OFICIAL-busca] AC19 Nominal Sizes https://help.graphisoft.com/AC/19/INT/AC19Help/Appendix_Tools/Appendix_Tools-35.htm |
| `ac_wallhole_*`, `ac_unit_*`, `ac_reveal_*`, `ac_egress_*`, `ac_leaf_*` | L | derivadas | não | sim | sim | parcial [INFERIDO] | [OFICIAL-prévio] 03 §10.1 |
| Tolerance / Oversize | L | não publicada | não | sim (folga unit×furo) | não | não | [OFICIAL-prévio] 03 §3.2 |
| Shape (sidelights/transom, nº de folhas) | E + L | depende do objeto | sim | sim | sim (contagem de folhas) | `PartitioningType` [INFERIDO] | [OFICIAL-prévio] R5 §1 |
| Frame Style (1/2/3), Frame Width/Thickness, Uniform Width | E, L | não publicada | sim | sim | não | `LiningDepth/LiningThickness` [INFERIDO] | [OFICIAL-prévio] 01 §3.4 |
| Sash Type/Options, Sash width/thk, Editable Grid | E, L | seis tipos citados em material AC9; lista atual NÃO CONFIRMADA | sim | sim | não | `FrameDepth/FrameThickness` do painel [INFERIDO] | [OFICIAL-prévio] 02 §4.2, §23 item 1; "Editable Grid" e "Custom Panel" [OFICIAL-busca] https://help.graphisoft.com/AC/28/INT/_AC28_Help/151_DoorWindowCustomSettings/151_DoorWindowCustomSettings-10.htm |
| Opening Type (Side Hung, Top Hung, Tilt and Turn, ...) e Opening Angle | E, A | 0..máx do objeto | sim (arco de giro/linhas) | sim (estado aberto) | sim (operação) | `OperationType` / `PanelOperation` [INFERIDO] | [OFICIAL-prévio] 01 §3.10, 02 §5 |
| Reveal depth + Reveal side (`WIDO_REVEAL_SIDE`: 1 = oposto à abertura; padrão 0 janela, 1 porta) + Anchor (face × core) | L, B/E | 0..espessura da parede [INFERIDO] | sim | sim | sim | não | `WIDO_REVEAL_SIDE`/`WIDO_SILL` [OFICIAL-busca] https://gdl.graphisoft.com/reference-guide/wall-door-window-and-wall-end-parameters/ ; resto [OFICIAL-prévio] 03 §4 |
| Wall Closure (tipos predefinidos ou custom), exclusivo com Turn Plaster | E, L | AC28: lista NÃO CONFIRMADA | sim | sim | não | não | [OFICIAL-prévio] 01 §3.14, R5 §3 |
| Wall Inset (janela: recorte abaixo) | L | - | sim | sim | não | não | [OFICIAL-prévio] 02 §10 |
| Casing Outside / Inside (liga/desliga por face) | B + L | largura/espessura/offset: NÃO CONFIRMADO texto | sim | sim | não | não | [OFICIAL-prévio] R5 §3 |
| Sill (peitoril), Board (tábua), Threshold (soleira) | E + L | tipos NÃO CONFIRMADOS | sim | sim | não | não | [OFICIAL-prévio] 02 §9 |
| Sill/Header height (altura medida de base da parede, topo da parede ou nível de história) | L + E | - | sim | sim (posição) | sim (marcador) | `IfcRelFillsElement`/posição [INFERIDO] | [OFICIAL-busca] https://help.graphisoft.com/AC/28/INT/_AC28_Help/040_ElementsVB/040_ElementsVB-310.htm |
| Subfloor thickness no marcador | L | - | sim (só exibição) | não | sim | não | [OFICIAL-busca, AC19-20] https://help.graphisoft.com/AC/20/INT/AC20Help/03_1_Elements_Virtual_Building/03_1_Elements_Virtual_Building-220.htm |
| Anchor Point de colocação (lado/centro) | E | - | sim | sim | não | não | [OFICIAL-busca] https://help.graphisoft.com/AC/28/INT/_AC28_Help/150_UserInterfaceToolSettings/150_UserInterfaceToolSettings-16.htm |
| Dimension Marker / Marker Settings (cotas automáticas, `doorwindow parameters for markers`) | E, B | - | sim | não | sim | não | [OFICIAL-prévio] 01 §10; globais de marcador [OFICIAL-busca] https://gdl.graphisoft.com/reference-guide/doorwindow-parameters-for-markers/ |
| Floor Plan Display (simbólico × projetado), Model View Options, Detail Level | E | - | sim | não | não | não | [OFICIAL-prévio] 01 §8-9 |
| Classification and Properties (ex. IfcDoor/IfcWindow, FireRating, AcousticRating) | T/E | depende do template | não | não | sim | sim | [OFICIAL-prévio] 01 §10.3 + mapeamento [OFICIAL-busca] 121_IFC-50 |

### 3.2 Itens do pedido: onde estão e o que se sabe

| Item pedido | Onde já está / o que acrescentei |
|---|---|
| Opening Settings | O diálogo Door/Window tem Preview and Positioning + Custom Settings + Floor Plan and Section + Dimension Marker + Marker Settings + Classification and Properties: `01 §2`. O **elemento Opening** (ferramenta separada) é novo aqui: §2.1 acima. |
| Frame/Sash, Panel | 01 §3.4 e §3.8-3.9; 02 §6. Fórum: "Custom Panel" aplica sash customizado ao sidelight (AC28 151-10 [OFICIAL-busca]). Parâmetros nomeados `gs_*` em 03 §10.1. |
| Sill/Header | altura: AC28 040-310 (acima); peça "Sill" (peitoril): 02 §9. |
| Marker, Dimension marker | 01 §10, 02 §18; globais GDL de marcador: gdl.graphisoft.com (link acima). Marcador de **painel de curtain wall** não usa marcador de porta/janela [OFICIAL-prévio] R5 §1B. |
| Reveal, Wall inset, Anchor | 03 §4, 02 §7. `WIDO_REVEAL_SIDE`, `WIDO_SILL` e `WIDO_ORIG_DIST` (distância da origem local ao centro de curvatura da parede) [OFICIAL-busca] GDL Reference. |
| Nominal size, Tolerance | 01 §3.1, 03 §2.3. |
| Casing | R5 §3 (parâmetros numéricos NÃO CONFIRMADOS). |
| Corner windows | 02 §14: ferramenta Corner Window (par espelhado vinculado, só parede reta) vs. Custom Corner (Frame / Corner Column / Glass; ângulo; espessuras diferentes). Nada novo. |
| Skylight | 02 §15: só em Roof/Shell; `Constraint in Roof` Horizontal/Vertical; âncora sill/header; Flip in Shell; planta por projeção 3D. Nada novo. |
| Curtain Wall com porta/janela | R5 §1B. |

### 3.3 Corner window e Skylight: o que importa para a forma

- Corner Window: dois objetos espelhados; ângulo entre paredes não pode ser 0 nem 180 graus; um par por canto [OFICIAL-prévio] 02 §14.1. Implicação: **janela de canto não é uma forma**, é **relação entre duas instâncias** (já anotado em 02 §14.2).
- Skylight: planta por projeção 3D, hospedada em telhado inclinado; não aplicável a paredes. Fora do escopo v1 do Hestia.

### 3.4 Lacunas ArchiCAD que continuam abertas

- Texto oficial da página **Shape** (AC28 151-3) e **Leaf and Sash Dimension** (151-9): só figuras; nesta sessão a página não pôde ser lida (host inacessível).
- Valores padrão e faixas de cada campo: não publicados.
- Mapeamento IFC completo de porta/janela: a página `121_IFC-50` (Predefined Property Mapping) existe e lista pelo menos `OverallWidth/OverallHeight` e propriedades `Pset_..Common` (`IsExternal`, `LoadBearing`); **não li a tabela completa**. `IfcWindowLiningProperties` não apareceu nos resultados do ArchiCAD.

## 4. Revit: família, tipo, instância, parâmetros

Estrutura geral já descrita em `pesquisa-f0/R4-revit.md` (bandeiras, perfis, trim) e `05-REFERENCIA` §2 (Wall Closure). Abaixo, o que faltava: lista de parâmetros, reference planes, shared, flex, nested, cut, schedules, curtain panel.

### 4.1 Família, tipo, instância

| Nível | O que é | Exemplos | Nível de fonte |
|---|---|---|---|
| **Família** (.rfa) | Geometria + parâmetros + categoria (Doors/Windows) + template (`Door.rft`, `Window.rft`, `Door - Curtain Wall.rft`) | - | [COMUNIDADE] https://novedge.com/blogs/design-news/revit-tip-parametric-door-and-window-family-best-practices |
| **Tipo** | Conjunto de valores dos parâmetros de tipo; define o "produto" | Width, Height, materiais, Construction Type | [COMUNIDADE]/[OFICIAL-busca] |
| **Instância** | Valores por elemento colocado | Mark, Sill Height, Level, Comments | idem |

Regra prática: tamanho/material = tipo; marca e altura de peitoril = instância [COMUNIDADE] (Novedge, link acima).

### 4.2 Parâmetros de porta (Door Type Properties)

Fonte: https://help.autodesk.com/cloudhelp/2026/ENU/Revit-ArchDesign/files/GUID-29905EE0-3D7D-422E-A627-5A7A8AC34D7B.htm (**[OFICIAL-busca]**, resumo; versões 2014-2020 em https://help.autodesk.com/cloudhelp/2020/ENU/Revit-Model/files/GUID-29905EE0-3D7D-422E-A627-5A7A8AC34D7B.htm).

| Parâmetro | Tipo | Faixa | Onde afeta | Observação |
|---|---|---|---|---|
| Width / Height / Thickness | L (tipo) | livre (positivo) | 2D+3D, quadro | definem folha/vão |
| Rough Width / Rough Height | L (tipo) | livre | **quadro/exportação** (não geometria) | Autodesk: "can be scheduled or exported"; na prática são **fórmulas** (tamanho + folga) [COMUNIDADE] |
| Frame Material, Frame Width/Thickness | material / L | - | 3D | Frame Width/Thickness **não são parâmetros de sistema**: são autorais da família (BIMpure; AU deck lista "Frame Head Face Width", "Frame Jamb Face Width") |
| Trim Width, Trim Projection Int/Ext | L | - | 3D | listados em 2014-2020; presença em 2024+ NÃO CONFIRMADA (R4) |
| Fire Rating | T | - | quadro, IFC | em Identity Data |
| Function (Interior/Exterior) | E | 2 valores | quadro, IFC (`IsExternal`) [INFERIDO] | |
| Wall Closure | E | By Host / valores | 3D (retorno de camadas) | sobrescreve a parede; posição por plano "Wall Closure" na família (05 §2) |
| Construction Type, Door Material | T/material | - | quadro | |

### 4.3 Parâmetros de janela (Window Type Properties)

Fonte: https://help.autodesk.com/cloudhelp/2026/ENU/Revit-ArchDesign/files/GUID-1C03B7DF-89EE-48B1-B501-571745B1D513.htm **[OFICIAL-busca]**.

| Parâmetro | Tipo | Onde afeta | Observação |
|---|---|---|---|
| Height, Width | L (tipo) | 2D+3D | |
| **Default Sill Height** | L (tipo) | só **colocação inicial** | Relatos: mudar depois **não** move janelas já colocadas; quem move é o **Sill Height da instância** [COMUNIDADE] https://forums.augi.com/archive/index.php/t-76280.html |
| Window Inset | L | 3D (recuo na parede) | |
| Rough Width / Rough Height | L | quadro/exportação | |
| Glass Pane Material | material | 3D | |
| Wall Closure, Construction Type | E, T | 3D, quadro | |
| Instância: Sill Height, Head Height, Mark, Level | L/T | quadro | Head Height pode ser o que determina a colocação (relato) https://forums.autodesk.com/t5/revit-ideas/window-head-height-determines-placement-rather-than-sill-height/m-p/6590636 |

### 4.4 Reference Planes (estrutura da parametrização)

- **"Is Reference"**: valores **Strong Reference**, **Weak Reference**, **Not a Reference** e os **nomes pré-definidos** (Left, Right, Front, Back, Top, Bottom, Center (Left/Right) etc.). Nomes pré-definidos tornam o plano **strong** e dão um plano comum que o Revit usa ao **trocar famílias** [OFICIAL-busca] https://help.autodesk.com/cloudhelp/2020/ENU/RevitLT-Model/files/GUID-A9B4F5C7-E5E4-4369-AA68-F798DB5D50A3.htm . "Not a Reference" não é visível no projeto (não cotável).
- **Wall Closure**: plano de referência nomeado "Wall Closure" na família define onde as camadas da parede se dobram; só configurável no editor de família [OFICIAL-busca] (mesma página) e [OFICIAL-prévio] 05 §2.
- Boas práticas: construir um **esqueleto de planos** guiados por Width/Height; travar (lock) sólidos, voids e aninhados a **planos**, não a outras geometrias [COMUNIDADE] https://novedge.com/blogs/design-news/revit-tip-revit-reference-plane-best-practices , https://www.bimpure.com/blog/8-tips-to-master-reference-planes-in-revit-families
- Planos fortes fazem a família **esticar com a parede**; fracos movem a família inteira [COMUNIDADE] https://baks.verde.ag/revit-reference-planes.html
- **Planos padrão do `Window.rft`/`Door.rft`** (Left, Right, Center (Left/Right), Sill/Head, Exterior/Interior, Wall Closure): [INFERIDO] por memória; confirmar abrindo o template.

### 4.5 Parâmetros compartilhados, quadros e etiquetas

- Parâmetro de **família** comum **não aparece em schedule nem tag**; para agendar/etiquetar usa-se **parâmetro compartilhado** (GUID em arquivo `.txt`) ou parâmetro nativo [COMUNIDADE] https://ukcommunity.arkance.world/hc/en-us/articles/24946873703314-Revit-Tip-Creating-Builders-Works-Holes-or-MEP-Service-Openings (resumo da busca) e https://archgyan.com/revit-shared-parameters-and-schedules/ . Para Project Parameters: `Manage > Project Parameters > Add > Shared Parameter`, escolher categorias, vincular como Type ou Instance.
- Tags são baseadas em **tipo**; a etiqueta de janela por padrão lê Type Mark, "Window Tag - Number" lê o Mark da instância [COMUNIDADE] https://forums.autodesk.com/t5/revit-architecture-forum/window-tags/td-p/3274103 .
- Valores únicos (número da porta) = **instância**; produto = **tipo** [COMUNIDADE].
- Nested compartilhado: pode contar **duas vezes** na schedule (painel e hospedeira como "duas portas") [COMUNIDADE] https://forums.autodesk.com/t5/revit-architecture-forum/shared-parameters-amp-tags/m-p/11394074 . Roll-up com shared nested: https://novedge.com/blogs/design-news/revit-tip-revit-nested-tagging-shared-nested-families-and-roll-up-parameters .

### 4.6 Famílias aninhadas (nested)

- Associação de parâmetros: tipos devem ser **iguais** (comprimento com comprimento); um parâmetro do host pode ligar a vários do nested [OFICIAL-busca] https://help.autodesk.com/cloudhelp/2021/ENU/Revit-Customize/files/GUID-E2E6B19B-E47F-4F35-9F6D-1273A3248A50.htm .
- **Não compartilhada**: só o host controla; parâmetros ligados aos do host. **Compartilhada**: parâmetros de instância do nested não são editáveis no projeto, os de tipo sim [COMUNIDADE] https://forums.autodesk.com/t5/revit-mep-forum/nested-family-parameters-questions/m-p/12028084/highlight/true .
- Visibilidade: um nested compartilhado dentro de host não compartilhado pode não obedecer o parâmetro de visibilidade do host [COMUNIDADE] https://forums.autodesk.com/t5/revit-ideas/1-more-nested-family-visibility-options-2-link-parameters-of/idc-p/11487837 .
- Prática: nested na **mesma categoria** do pai (porta dentro de porta) [COMUNIDADE, AU class citada em R4].
- Use sparingly: muitos aninhados pioram desempenho [COMUNIDADE] https://novedge.com/blogs/design-news/revit-tip-avoid-excessive-nested-parameters-in-revit-families .

### 4.7 Flex (testar a família)

Nenhuma fonte desta sessão cobre "flex" (resultado da busca: nada). [INFERIDO por prática geral do Revit]: **flexar** = no Family Editor, Family Types > alternar valores de cada tipo (ou instância) e ver se a geometria acompanha sem erro (planos, travas, fórmulas). **Para o Hestia o análogo é um teste automatizado**: gerar a esquadria com valores mínimo, máximo e intermediários de cada parâmetro (inclusive flecha de arco perto de 0 e relação folha/vão extrema) e verificar que o contorno continua válido. NÃO CONFIRMADO em fonte.

### 4.8 Wall Opening Cut

| Mecanismo | Quando | Limite | Fonte |
|---|---|---|---|
| **Opening** do template da família | corte retangular padrão de porta/janela hospedada | não segue contorno curvo; não pode coexistir com void no mesmo host | [COMUNIDADE] fóruns §2.2 |
| **Void** na família | contornos não retangulares, parede curva | pode errar em paredes unidas/empilhadas; "Cut with Voids When Loaded" ajuda | [COMUNIDADE] https://forums.autodesk.com/t5/revit-architecture-forum/door-family-not-cutting-joined-walls/td-p/11278926 , https://forums.autodesk.com/t5/revit-architecture-forum/void-in-face-based-family-not-cutting-multiple-layers/td-p/9064666 |
| **Wall Opening** (ferramenta de projeto) | furo retangular sem esquadria | só retangular; circular/poligonal = Edit Profile | [OFICIAL-busca] resumo do Autodesk Help |
| **Wrapping at Inserts / Wall Closure** | retorno das camadas no vão | ver 05 §2 | [OFICIAL-prévio] |

### 4.9 Schedules de porta e janela

- Categorias **Doors** e **Windows** têm schedules próprios (campos: Mark, Type Mark, Width, Height, Rough W/H, Fire Rating, Count, parâmetros compartilhados) [COMUNIDADE]/[OFICIAL-busca].
- **Portas de curtain wall**: Autodesk diz que são famílias "consideradas pelo Revit como pertencentes às categorias Door e Curtain Panel"; por isso aparecem no schedule de portas. Criar a partir de **`Door - Curtain Wall.rft`**; um painel genérico **não** agenda como porta [OFICIAL-busca, resumo] https://help.autodesk.com/cloudhelp/2026/ENU/Revit-HaveYouTried/files/GUID-43DA0959-A541-459F-8370-C5149433FFB4.htm ; [COMUNIDADE] https://forums.autodesk.com/t5/revit-architecture-forum/add-curtain-wall-doors-to-doors-schedule/td-p/8330815 , https://forums.autodesk.com/t5/revit-architecture-forum/how-to-create-a-curtain-wall-door-family/m-p/11779211 .
- Relatos de dupla contagem/auto-numeração em curtain panel (R4).

### 4.10 Curtain Panel doors

Já em R4 §1: porta como painel (unpin, trocar tipo, apagar mullion sob a porta), mullions funcionam como batente, perfil de mullion como família `Profile - Mullion` (tipo, posição, offset, ângulo -90..90). Nada novo além de §4.9.

## 5. IFC: como as duas ferramentas expõem a esquadria

Fonte: buildingSMART IFC 4.3 / IFC4 via busca (**[OFICIAL-busca]**, não li páginas completas).

| Entidade / atributo | Conteúdo | Mapeia para (conceito) | Nível |
|---|---|---|---|
| `IfcDoor` / `IfcWindow` | `OverallWidth`, `OverallHeight`; IFC4 acrescentou `PredefinedType` e `OperationType` | nominal A×B | [OFICIAL-busca] https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoor.htm ; AC28 mapeia Width/Height para esses atributos |
| `IfcDoorType` | `PredefinedType` (IfcDoorTypeEnum), `OperationType` (IfcDoorTypeOperationEnum) | tipo + operação | [OFICIAL-busca] https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorType.htm |
| `IfcWindowType` | `PredefinedType`, **`PartitioningType`** (IfcWindowTypePartitioningEnum: layout geral e apresentação simbólica) | número/arranjo de painéis | [OFICIAL-busca] https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindowType.htm |
| `IfcWindowLiningProperties` | `LiningDepth`, `LiningThickness`, `LiningToPanelOffsetX/Y` (+ talvez `LiningOffset`; fontes divergem); regra: não pode dar só `LiningDepth` (ou ambos, ou só `LiningThickness`, depth variável); `ShapeAspectStyle` deprecado | quadro (marco): espessura, profundidade, folga quadro-painel | [OFICIAL-busca] https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindowLiningProperties.htm , https://steptools.com/stds/ifc/html/t_ifcwindowliningproperties.html |
| `IfcWindowPanelProperties` | `OperationType` e `PanelPosition` obrigatórios; `FrameDepth`, `FrameThickness` opcionais | folha/sash | [OFICIAL-busca] https://steptools.com/stds/ifc/html/t_ifcwindowpanelproperties.html |
| `IfcDoorLiningProperties`, `IfcDoorPanelProperties` | **não confirmados nesta sessão**. [INFERIDO por memória]: lining com `LiningDepth/Thickness`, `ThresholdDepth/Thickness`, `TransomThickness/Offset`, `CasingThickness/Depth`; panel com `PanelDepth`, `PanelOperation`, `PanelWidth`, `PanelPosition` | marco, soleira, bandeira/travessa, alizar; folha | NÃO CONFIRMADO |
| `Pset_DoorCommon` / `Pset_WindowCommon` | `FireRating`, `AcousticRating`, `SecurityRating`, `IsExternal`, `Reference`, ... | propriedades de quadro | [OFICIAL-busca] https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_DoorCommon.htm ; lista completa de `Pset_WindowCommon` NÃO lida |
| Forma não retangular | Em IFC a forma vai na **representação** (perfil extrudado / B-rep) e o furo em `IfcOpeningElement` [INFERIDO] | contorno | NÃO CONFIRMADO |

**ArchiCAD → IFC**: usa **Property Mapping** (preset do tradutor de exportação), um sentido apenas (editar no IFC não volta); parâmetros de biblioteca podem ser ligados a propriedades IFC (exemplo de comunidade: área envidraçada em `Pset_WindowCommon`) [OFICIAL-busca] https://help.graphisoft.com/AC/28/INT/_AC28_Help/121_IFC/121_IFC-50.htm ; https://helpcenter.graphisoft.com/knowledgebase/63190/ ; [COMUNIDADE] https://speckle.community/t/archicad-property-related-questions-and-proposals/17253/10 .
**Revit → IFC**: mapeamento por tabela/Shared Parameters (`IfcExportAs`, psets definidos pelo usuário) [INFERIDO por memória; não pesquisado nesta sessão].

## 6. Mapa de verificação (resumo)

| Afirmação | Situação |
|---|---|
| `WALLHOLE` desliga o furo retangular; sem reveal automático; sem efeito em 2D | Confirmado (prévio + GDL Reference na busca) |
| Opening do ArchiCAD: retangular/circular/poligonal; limites infinito/limitado; 9 âncoras | Confirmado (busca, Help AC26-AC30) |
| Custom window via slab "wallhole" + Save 3D Model as com Editable GDL | Confirmado em KB Graphisoft (busca) e comunidade; **procedimento exato** não lido |
| Triângulo/trapézio sem biblioteca em ArchiCAD e Revit | **Ausência não provada**; só "não encontrado" |
| Arch top: raio ajustável nos objetos padrão | Não confirmado (relato indica que não) |
| Revit: Opening vs. Void não coexistem; void recomendado para curvas | Comunidade (vários posts coerentes) |
| Revit: Wall Opening de projeto só retangular | Oficial (resumo de busca) |
| Revit: Default Sill Height só afeta colocação | Comunidade conflitante entre fontes; testar |
| Trim Width/Projection em Door Type 2024+ | Não confirmado |
| Reference plane "Is Reference" valores e Wall Closure plane | Oficial (busca) |
| Shared parameter obrigatório para schedule/tag de parâmetro custom | Comunidade consistente |
| Flex como procedimento | Inferido |
| IfcDoorLining/PanelProperties, Pset_WindowCommon completos | Não confirmado |
| Revit → IFC mapping | Inferido |
| Faixas mín/máx de parâmetros | Não publicadas por nenhum dos dois |

## 7. Implicações para o modelo do Hestia (todas [INFERIDO], propostas)

1. Dois contornos por esquadria: `contornoEsquadria` e `contornoVao` (default = esquadria + folga/requadro). Segmentos reta/arco com `flecha` explícita e mínimo > 0.
2. Primitivas de forma (retangular, arco abatido, arco pleno, circular, trapézio, triângulo, polígono livre) + validação por "flex" automatizado.
3. Requadro e alizar derivados por offset do contorno (nenhum dos dois automatiza em forma livre).
4. Cada parâmetro com: id estável, tipo/instância, unidade, faixa, e flags de destino (2D, 3D, quadro, IFC). A matriz de §3.1 é o ponto de partida.
5. Janela de canto = relação entre duas instâncias; claraboia fora da v1.
6. Exportar IFC: nominal (`OverallWidth/Height`), `PartitioningType`, `OperationType`, lining/panel properties, psets de quadro; forma via representação + `IfcOpeningElement`.

## 8. Fontes consultadas nesta sessão (via busca; páginas completas não abertas)

ArchiCAD / Graphisoft
- https://gdl.graphisoft.com/reference-guide/doors-and-windows/
- https://gdl.graphisoft.com/reference-guide/wall-door-window-and-wall-end-parameters/
- https://gdl.graphisoft.com/reference-guide/doorwindow-parameters-for-markers/
- https://help.graphisoft.com/AC/28/INT/_AC28_Help/040_ElementsVB/040_ElementsVB-258.htm (Create Opening)
- https://help.graphisoft.com/AC/30/INT/Topics/040_ElementsVB/040_ElementsVB-259.html
- https://help.graphisoft.com/AC/28/INT/_AC28_Help/040_ElementsVB/040_ElementsVB-310.htm (Sill or Header Heights)
- https://help.graphisoft.com/AC/28/INT/_AC28_Help/150_UserInterfaceToolSettings/150_UserInterfaceToolSettings-16.htm (Preview and Positioning)
- https://help.graphisoft.com/AC/28/INT/_AC28_Help/151_DoorWindowCustomSettings/151_DoorWindowCustomSettings-1.htm, -10.htm, -19.htm
- https://help.graphisoft.com/AC/28/INT/_AC28_Help/121_IFC/121_IFC-50.htm
- https://helpcenter.graphisoft.com/knowledgebase/25564/ ; https://helpcenter.graphisoft.com/graphisoft-archives/25614/ ; https://helpcenter.graphisoft.com/knowledgebase/63190/
- https://support.graphisoft.com/hc/en-us/articles/34225645616401-How-to-create-a-window-with-a-masonry-arch
- Comunidade: links citados no corpo (community.graphisoft.com)

Revit / Autodesk
- https://help.autodesk.com/cloudhelp/2026/ENU/Revit-ArchDesign/files/GUID-29905EE0-3D7D-422E-A627-5A7A8AC34D7B.htm (Door Type Properties)
- https://help.autodesk.com/cloudhelp/2026/ENU/Revit-ArchDesign/files/GUID-1C03B7DF-89EE-48B1-B501-571745B1D513.htm (Window Type Properties)
- https://help.autodesk.com/cloudhelp/2020/ENU/RevitLT-Model/files/GUID-A9B4F5C7-E5E4-4369-AA68-F798DB5D50A3.htm (Reference planes, Is Reference)
- https://help.autodesk.com/cloudhelp/2021/ENU/Revit-Customize/files/GUID-E2E6B19B-E47F-4F35-9F6D-1273A3248A50.htm (Associate Family Parameters)
- https://help.autodesk.com/cloudhelp/2026/ENU/Revit-HaveYouTried/files/GUID-43DA0959-A541-459F-8370-C5149433FFB4.htm (Curtain Wall Editing)
- Fóruns Autodesk/AUGI e blogs Novedge/BIMpure/RevitCat: links no corpo

IFC / buildingSMART
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoor.htm, IfcDoorType.htm, IfcWindowType.htm, IfcWindowLiningProperties.htm, Pset_DoorCommon.htm
- https://steptools.com/stds/ifc/html/t_ifcwindowliningproperties.html ; t_ifcwindowpanelproperties.html
