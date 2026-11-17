# 06 · Esquadrias e interoperabilidade IFC (tarefa A6)

Data: 2026-11-17. Escopo: `packages/io/src/ifc` (exportação) e `packages/io/src/ifcImport` (importação) do Hestia, contra IFC4 (ADD2 TC1), IFC4.3 (ADD2), Revit, ArchiCAD e Vectorworks.

## 0. Como ler este documento (legenda e limites da pesquisa)

Cada afirmação traz uma marca de confiança.

| Marca | Significado |
|---|---|
| **[V-schema]** | Verificado no schema EXPRESS e nos templates de pset que vêm dentro do IfcOpenShell 0.9.0.post1 instalado na sessão (`ifcopenshell_wrapper.schema_by_name('IFC4')` = IFC4 ADD2 TC1; `IFC4X3_ADD2`; `util/schema/Pset_IFC4_ADD2.ifc` e `Pset_IFC4X3.ifc`). É a fonte mais próxima do padrão que consegui abrir. |
| **[V-código]** | Verificado lendo o código do Hestia (caminho e função citados). |
| **[V-exp]** | Verificado por experimento nesta sessão: exportei um projeto Hestia, abri o resultado no IfcOpenShell, e importei de volta um IFC sintético com abertura em arco. Os scripts ficaram no scratchpad, não no repositório. |
| **[V-web]** | Vem de resultado de busca na web (título/trecho). A página em si NÃO foi aberta, porque o acesso foi bloqueado (ver abaixo). |
| **[I]** | Inferido: conhecimento prévio sobre IFC/ferramentas, ou dedução. Confirmar antes de implementar. |

**Limite de acesso.** Os hosts `standards.buildingsmart.org`, `ifc43-docs.standards.buildingsmart.org` e `docs.xbim.net` NÃO resolvem nesta sessão (fora da lista de domínios permitidos; o proxy devolve 403). Por isso não abri nenhuma página oficial da buildingSMART. Os URLs da seção 14 foram localizados por busca. Para fechar os itens marcados [I]/[V-web], libere esses hosts e reabra as páginas. O `gh api` do IfcOpenShell também está bloqueado (repositório não anexado à sessão).

---

## 1. Resumo executivo

O que o Hestia já faz bem [V-código, V-exp]: exporta `IfcOpeningElement` + `IfcRelVoidsElement` + `IfcDoor`/`IfcWindow` + `IfcRelFillsElement`, com `IfcDoorType`/`IfcWindowType`, `IfcRelDefinesByType`, `Pset_DoorCommon`/`Pset_WindowCommon`, `Pset_ManufacturerTypeInformation`, material, e a esquadria detalhada (batente, folha, vidro, montante, maçaneta) como sólidos extrudados com estilo. O round-trip Hestia para Hestia é sem perda, porque o registro nativo viaja em `Pset_Hestia_Element` (`HestiaJSON`) e `Pset_Hestia_Project`.

O problema está no IFC "puro" (sem a extensão privada):

1. **Vão sempre retangular.** `OpeningType` não tem forma. Arco, círculo, trapézio e polígono não existem no modelo, nem na exportação (`rectOf`/`extrudeSolid`), e a importação achata qualquer perfil para a caixa envolvente [V-exp, seção 8].
2. **`IfcIndexedPolyCurve` perde os arcos na leitura.** `curvePoints` lê só a lista de pontos e ignora o atributo `Segments` (`IfcArcIndex`). Um arco de 3 pontos vira polilinha pelos pontos de controle [V-código `profiles.ts`].
3. **Nenhum `IfcDoorLiningProperties`, `IfcDoorPanelProperties`, `IfcWindowLiningProperties` ou `IfcShapeAspect`.** Todos os parâmetros de esquadria do Hestia (`frameWidth`, `frameDepth`, `leafThickness`, `threshold`, `grid`, `transom`...) existem só na geometria. Quem lê o IFC não consegue consultá-los como dado [V-exp: nenhuma dessas entidades no arquivo gerado].
4. **Sem representações 2D** (`Plan`/`FootPrint`/`Axis`) e sem `IfcRepresentationMap`/`IfcMappedItem` no tipo. Cada ocorrência repete a geometria; o símbolo de planta (arco de giro) não vai no IFC [V-exp].
5. **Operação da janela perdida na importação.** `operationOf` só olha os atributos do próprio tipo; a operação (`SIDEHUNGRIGHTHAND` etc.) está em `IfcWindowPanelProperties`, que a importação não lê. `flipHand` e `plan` da janela se perdem [V-código `elementTypes.ts`].
6. **Propriedades de desempenho entram na importação só como `ifcProperties` somente leitura** da instância. `fireRating`, `uValue` e `acousticRw` do `OpeningType` NÃO são repovoados; só `manufacturer` e `solarFactor` são [V-código `bimFieldsOf`]. O quadro de esquadrias do Hestia fica vazio nesses campos após importar IFC de terceiros.
7. **Erros de conformidade na exportação** (seção 13): `SolarHeatGainTransmittance` gravada em `Pset_WindowCommon`, onde ela não existe [V-schema]; valores sem o tipo de medida do IFC (`IfcReal`/`IfcInteger` em vez de `IfcThermalTransmittanceMeasure` etc.) [V-exp]; `pivot` mapeado para `REVOLVING`; `double` mapeado para `DOUBLE_DOOR_DOUBLE_SWING`; só um `IfcWindowPanelProperties` por janela, independente do número de folhas.

---

## 2. Estado atual do Hestia (o que o código faz)

### 2.1 Exportação (`packages/io/src/ifc/ifcExport.ts::addOpenings`, `ifcOpeningTypes.ts`)

[V-código] e confirmado por [V-exp] com um projeto de teste (parede de 4 m, janela `ot_ja120`, porta `ot_p90`):

- `IFCOPENINGELEMENT` (`PredefinedType = .OPENING.`), corpo `SweptSolid` = caixa retangular (`rectOf(roughWidth, thickness + 0,02)`) extrudada na altura do vão bruto; ligada à parede por `IFCRELVOIDSELEMENT`.
- `IFCDOOR(... OverallHeight, OverallWidth, .DOOR., OperationType)` e `IFCWINDOW(... .WINDOW., PartitioningType)`; `ObjectType` = nome da família (`openingFamilyName`); `Tag` = `Opening.mark`; ligadas ao vão por `IFCRELFILLSELEMENT`.
- Corpo da esquadria: uma lista de `IFCEXTRUDEDAREASOLID` retangulares (batente, folha, vidro, montantes, maçaneta...), cada um com `IFCSTYLEDITEM`, tudo numa única `IfcShapeRepresentation` `Body/SweptSolid`. Não há outra representação [V-exp: `[('Body','SweptSolid')]`].
- Tipo: `IFCDOORTYPE`/`IFCWINDOWTYPE` com `Name`, `Description`, `Tag` = `code` (Type Mark), `PredefinedType` fixo (`DOOR`/`WINDOW`), `OperationType`/`PartitioningType`, `HasPropertySets` = `IfcWindowPanelProperties` (só janela) e `Pset_ManufacturerTypeInformation` (se houver fabricante). `RepresentationMaps` vazio. `IFCRELDEFINESBYTYPE` agrupa as ocorrências. `IFCRELASSOCIATESMATERIAL` do material do batente no tipo e na ocorrência.
- Instância: `IFCWINDOWPANELPROPERTIES` por janela (via `IFCRELDEFINESBYPROPERTIES`), e `Pset_DoorCommon`/`Pset_WindowCommon` com `Reference`, `IsExternal`, `FireRating`, `ThermalTransmittance`, `AcousticRating` (texto `"30 dB"`), e, só janela, `SolarHeatGainTransmittance` e `GlazingAreaFraction` (estimado, `glazingAreaFraction`).
- Não exporta: `IfcDoorLiningProperties`, `IfcDoorPanelProperties`, `IfcWindowLiningProperties`, `IfcShapeAspect`, `IfcMappedItem`, `IfcRepresentationMap`, `Qto_DoorBaseQuantities`/`Qto_WindowBaseQuantities`, `Pset_DoorWindowGlazingType`, classificação (`IfcRelAssociatesClassification`), `SecurityRating`, `Infiltration`, `HandicapAccessible`, `FireExit`, `SelfClosing`, `SmokeStop`, `HasDrive`, `HasSillExternal/Internal`.
- Extensão privada: `Pset_Hestia_Element` (`HestiaJSON` com o `Opening` inteiro) e `Pset_Hestia_Project` (`TypesJSON` com os tipos) [V-código `ifcHestia.ts`, V-exp].

### 2.2 Importação (`packages/io/src/ifcImport/openingImport.ts`, `elementTypes.ts`, `openingHost.ts`)

[V-código]:

- Com `Pset_Hestia*` válido: reconstrução nativa, sem heurística.
- Sem ele (IFC de terceiros): `addOpening` pega o `IfcDoor`/`IfcWindow`; acha o `IfcOpeningElement` via `IfcRelFillsElement` e a parede via `IfcRelVoidsElement`. Sem vão no arquivo, deduz a parede pela geometria (`hostByGeometry`). Sem parede (laje, telhado, parede-cortina), vira objeto genérico com aviso.
- Largura/altura/peitoril saem da **caixa envolvente do corpo do vão** (prisma ou nuvem de triângulos), mínimo 0,30 m. Nada de `OverallWidth/OverallHeight`.
- Tipo `iot_<nome>_<l>x<a>` com `plan` deduzido: `double` se a operação do tipo casa `/DOUBLE|TWO|PANEL_2|BIFOLD/`, `sliding` se `/SLIDING|POCKET/`, senão `swing` (porta) ou `fixed` (janela). `leaves` = 2 ou 1. Material fixo `mat_aluminio`/`mat_vidro`. `flipHand` = `/RIGHT/` na operação do tipo.
- Propriedades: `psetOf` guarda todos os psets (instância + tipo) em `ifcProperties` (somente leitura). `fabricante` e `solarFactor` são promovidos a campos do tipo.
- Geometria: `IFCBOOLEANRESULT/CLIPPINGRESULT` fica com o primeiro operando e anota `corte-booleano-ignorado`; `IFCMAPPEDITEM` é seguido; extrusão não vertical anota `extrusao-inclinada` (a malha é preservada); `IFCSWEPTDISKSOLID` e outros viram `unsupported`.

---

## 3. IfcDoor, IfcWindow e os tipos (schema)

### 3.1 Atributos [V-schema]

| Entidade (IFC4 ADD2 e 4.3 iguais nestes) | Atributos próprios |
|---|---|
| `IfcDoor` | `OverallHeight`, `OverallWidth` (IfcPositiveLengthMeasure, opc.), `PredefinedType` (IfcDoorTypeEnum), `OperationType` (IfcDoorTypeOperationEnum), `UserDefinedOperationType` |
| `IfcWindow` | `OverallHeight`, `OverallWidth`, `PredefinedType` (IfcWindowTypeEnum), `PartitioningType` (IfcWindowTypePartitioningEnum), `UserDefinedPartitioningType` |
| `IfcDoorType` | `PredefinedType` (obrig.), `OperationType` (obrig.), `ParameterTakesPrecedence`, `UserDefinedOperationType` |
| `IfcWindowType` | `PredefinedType` (obrig.), `PartitioningType` (obrig.), `ParameterTakesPrecedence`, `UserDefinedPartitioningType` |

Observações:

- O IFC4 NÃO tem `OperationType` no `IfcWindow`/`IfcWindowType`. A operação da janela fica em `IfcWindowPanelProperties.OperationType` [V-schema]. O código do Hestia já sabe disso (comentário em `ifcOpeningTypes.ts`).
- `IfcDoorStyle`/`IfcWindowStyle` são o modelo IFC2x3 (herdados como entidades no schema IFC4, com `OperationType`, `ConstructionType`, `Sizeable`); no IFC4 o correto é `IfcDoorType`/`IfcWindowType` [V-schema: `IfcDoorStyle`/`IfcWindowStyle` existem no schema IFC4; `IfcDoorStyleOperationEnum` não existe no IFC4X3_ADD2; a remoção das próprias entidades em 4.3 é [I]]. Relatos de que o ArchiCAD usa `...Type` no IFC4 [V-web, seção 14].
- `ParameterTakesPrecedence`: se TRUE, os parâmetros do tipo (Lining/Panel properties) prevalecem sobre os da ocorrência. O Hestia deixa `$` [V-exp].
- Superclasse: IFC4 `IfcBuildingElement`; IFC4.3 `IfcBuiltElement` [V-schema]. `IfcDoor`/`IfcWindow` de IFC4 não se leem como IFC4.3 sem conversão de nome de schema (relevante se o Hestia for oferecer exportação IFC4.3).

### 3.2 PredefinedType completos [V-schema]

| Enum | IFC4 ADD2 | IFC4.3 ADD2 |
|---|---|---|
| `IfcDoorTypeEnum` | DOOR, GATE, TRAPDOOR, USERDEFINED, NOTDEFINED | BOOM_BARRIER, DOOR, GATE, TRAPDOOR, TURNSTILE, USERDEFINED, NOTDEFINED |
| `IfcWindowTypeEnum` | WINDOW, SKYLIGHT, LIGHTDOME, USERDEFINED, NOTDEFINED | LIGHTDOME, SKYLIGHT, WINDOW, USERDEFINED, NOTDEFINED |

Hestia: sempre `DOOR` e `WINDOW`. Portão de garagem seccionado deveria ser `GATE` [I: semântica de `GATE` = portão de acesso externo/veículos]. Clarabóia (janela em telhado) = `SKYLIGHT`; o Hestia não modela janela em telhado.

### 3.3 `IfcDoorTypeOperationEnum` completo [V-schema]

IFC4 ADD2 (18 + USERDEFINED/NOTDEFINED):
`SINGLE_SWING_LEFT`, `SINGLE_SWING_RIGHT`, `DOUBLE_DOOR_SINGLE_SWING`, `DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_LEFT`, `DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_RIGHT`, `DOUBLE_SWING_LEFT`, `DOUBLE_SWING_RIGHT`, `DOUBLE_DOOR_DOUBLE_SWING`, `SLIDING_TO_LEFT`, `SLIDING_TO_RIGHT`, `DOUBLE_DOOR_SLIDING`, `FOLDING_TO_LEFT`, `FOLDING_TO_RIGHT`, `DOUBLE_DOOR_FOLDING`, `REVOLVING`, `ROLLINGUP`, `SWING_FIXED_LEFT`, `SWING_FIXED_RIGHT`, `USERDEFINED`, `NOTDEFINED`.

IFC4.3 ADD2 mantém `REVOLVING`, remove nada dos demais, e acrescenta `REVOLVING_VERTICAL`, `DOUBLE_DOOR_LIFTING_VERTICAL`, `LIFTING_HORIZONTAL`, `LIFTING_VERTICAL_LEFT`, `LIFTING_VERTICAL_RIGHT` (portas de elevação/seccionais). Os demais valores são os mesmos.

Semântica de alguns valores [V-web: IFC 4.3 docs via busca]: `SINGLE_SWING_LEFT` = uma folha, dobradiças à esquerda vistas na direção do eixo +Y; `DOUBLE_DOOR_SINGLE_SWING` = duas folhas, uma abre para a esquerda e a outra para a direita; `REVOLVING` = porta giratória de quatro folhas em cruz; `ROLLINGUP` = abre enrolando. Convenção de lado: [V-web] "A direção de abertura é dada pelo eixo +Y do `ObjectPlacement`".

### 3.4 `IfcWindowTypePartitioningEnum` completo [V-schema] (igual em IFC4 e 4.3)

`SINGLE_PANEL`, `DOUBLE_PANEL_VERTICAL`, `DOUBLE_PANEL_HORIZONTAL`, `TRIPLE_PANEL_VERTICAL`, `TRIPLE_PANEL_BOTTOM`, `TRIPLE_PANEL_TOP`, `TRIPLE_PANEL_LEFT`, `TRIPLE_PANEL_RIGHT`, `TRIPLE_PANEL_HORIZONTAL`, `USERDEFINED`, `NOTDEFINED`.

Os `TRIPLE_PANEL_BOTTOM/TOP/LEFT/RIGHT` descrevem um painel grande de um lado e dois menores do outro (por exemplo `TOP` = um painel em cima e dois embaixo) [I: confirmar na figura oficial]. Não há valor para 4 ou mais painéis nem para grade n×m: usar `USERDEFINED` + `UserDefinedPartitioningType`.

### 3.5 Enums de painel [V-schema]

| Enum | Valores |
|---|---|
| `IfcDoorPanelOperationEnum` | SWINGING, DOUBLE_ACTING, SLIDING, FOLDING, REVOLVING, ROLLINGUP, FIXEDPANEL, USERDEFINED, NOTDEFINED |
| `IfcDoorPanelPositionEnum` | LEFT, MIDDLE, RIGHT, NOTDEFINED |
| `IfcWindowPanelOperationEnum` | SIDEHUNGRIGHTHAND, SIDEHUNGLEFTHAND, TILTANDTURNRIGHTHAND, TILTANDTURNLEFTHAND, TOPHUNG, BOTTOMHUNG, PIVOTHORIZONTAL, PIVOTVERTICAL, SLIDINGHORIZONTAL, SLIDINGVERTICAL, REMOVABLECASEMENT, FIXEDCASEMENT, OTHEROPERATION, NOTDEFINED |
| `IfcWindowPanelPositionEnum` | LEFT, MIDDLE, RIGHT, BOTTOM, TOP, NOTDEFINED |
| `IfcOpeningElementTypeEnum` | OPENING, RECESS, USERDEFINED, NOTDEFINED |

---

## 4. Propriedades predefinidas (Lining/Panel)

Atributos [V-schema] (idênticos em IFC4 ADD2 e IFC4.3 ADD2; `ShapeAspectStyle` é `IfcShapeAspect` opcional em todos).

**`IfcDoorLiningProperties`**: `LiningDepth`, `LiningThickness`, `ThresholdDepth`, `ThresholdThickness`, `TransomThickness`, `TransomOffset`, `LiningOffset`, `ThresholdOffset`, `CasingThickness`, `CasingDepth`, `ShapeAspectStyle`, `LiningToPanelOffsetX`, `LiningToPanelOffsetY`.

**`IfcDoorPanelProperties`**: `PanelDepth`, `PanelOperation` (obrig.), `PanelWidth` (razão 0..1 da largura livre), `PanelPosition` (obrig.), `ShapeAspectStyle`.

**`IfcWindowLiningProperties`**: `LiningDepth`, `LiningThickness`, `TransomThickness`, `MullionThickness`, `FirstTransomOffset`, `SecondTransomOffset`, `FirstMullionOffset`, `SecondMullionOffset` (razões 0..1), `ShapeAspectStyle`, `LiningOffset`, `LiningToPanelOffsetX`, `LiningToPanelOffsetY`.

**`IfcWindowPanelProperties`**: `OperationType` (obrig.), `PanelPosition` (obrig.), `FrameDepth`, `FrameThickness`, `ShapeAspectStyle`.

Anexação: via `HasPropertySets` do `IfcDoorType`/`IfcWindowType` (padrão) ou `IfcRelDefinesByProperties` na ocorrência. Em IFC4.3, as mesmas informações existem também como psets (`Pset_DoorLiningProperties`, `Pset_DoorPanelProperties`, `Pset_WindowLiningProperties`, `Pset_WindowPanelProperties`) [V-schema: presentes em `Pset_IFC4X3.ifc`, ausentes em `Pset_IFC4_ADD2.ifc`]. Para exportar IFC4.3, gravar os dois (entidade e pset) é a prática mais compatível [I].

Uso na prática: o `ifcopenshell.api.geometry.add_door_representation` / `add_window_representation` recebe `lining_properties` e `panel_properties` e cria geometria paramétrica a partir deles [V-código: IfcOpenShell instalado; assinatura com `overall_height`, `overall_width`, `operation_type`, `lining_properties`, `panel_properties`]. O Revit lê/escreve parte desses dados (seção 9) [I].

Mapa Hestia para essas entidades: ver matriz (seção 12).

---

## 5. Property sets e quantidades

### 5.1 `Pset_DoorCommon` [V-schema, IFC4 ADD2; IFC4.3 acrescenta `ApplicableEntity` = `IfcDoor,IfcDoorType`]

| Propriedade | Tipo | Observação |
|---|---|---|
| `Reference` | IfcIdentifier | "Reference ID for this specified type in this project (e.g. type 'A-1')": é código do TIPO (Type Mark), não marca da instância. |
| `Status` | IfcLabel (enum) | NEW/EXISTING/DEMOLISH/TEMPORARY/OTHER... (renovação) |
| `FireRating` | IfcLabel | segundo o código nacional (no Brasil: classe EI/E, ex. "EI 60"; ver NBR 11742 [I]) |
| `AcousticRating` | IfcLabel | idem (por exemplo "Rw 32") |
| `SecurityRating` | IfcLabel | |
| `DurabilityRating`, `HygrothermalRating`, `WaterTightnessRating`, `MechanicalLoadRating`, `WindLoadRating` | IfcLabel | |
| `Infiltration` | IfcVolumetricFlowRateMeasure | vazão de ar por área, a uma pressão de referência |
| `IsExternal` | IfcBoolean | |
| `ThermalTransmittance` | IfcThermalTransmittanceMeasure | U da construção toda (W/m²K) |
| `GlazingAreaFraction` | IfcPositiveRatioMeasure | fração vidrada da área do elemento (portas também têm!) |
| `HandicapAccessible`, `FireExit`, `HasDrive`, `SelfClosing`, `SmokeStop` | IfcBoolean | |

### 5.2 `Pset_WindowCommon` [V-schema]

`Reference`, `Status`, `AcousticRating`, `FireRating`, `SecurityRating`, `IsExternal`, `Infiltration`, `ThermalTransmittance`, `GlazingAreaFraction`, `HasSillExternal`, `HasSillInternal`, `HasDrive`, `SmokeStop`, `FireExit`, `WaterTightnessRating`, `MechanicalLoadRating`, `WindLoadRating`.

**`SolarHeatGainTransmittance` NÃO pertence ao `Pset_WindowCommon`** [V-schema]. Ele está em `Pset_DoorWindowGlazingType` (aplicável a `IfcDoor`, `IfcWindow`, e em 4.3 também aos tipos). O Hestia grava no lugar errado (seção 13, item E1).

### 5.3 Outros conjuntos úteis [V-schema]

- `Pset_DoorWindowGlazingType`: `GlassLayers`, `GlassThickness1/2/3`, `FillGas`, `GlassColor` (IFC4) / `GlassColour` (IFC4.3), `IsTempered`, `IsLaminated`, `IsCoated`, `IsWired`, `VisibleLightReflectance`, `VisibleLightTransmittance`, `SolarAbsorption`, `SolarReflectance`, `SolarTransmittance`, `SolarHeatGainTransmittance`, `ShadingCoefficient`, `ThermalTransmittanceSummer`, `ThermalTransmittanceWinter`. Cobre `glassKind` (laminado, temperado, aramado, fumê) e `glassThickness` do Hestia.
- `Qto_DoorBaseQuantities` / `Qto_WindowBaseQuantities`: `Width`, `Height`, `Perimeter`, `Area`. A definição diz que `Width`/`Height` só devem ser dados se o elemento for retangular [V-schema]. É a base natural do quadro de esquadrias por BIM; o Hestia não exporta.
- `Pset_ManufacturerTypeInformation`: `GlobalTradeItemNumber`, `ArticleNumber`, `ModelReference`, `ModelLabel`, `Manufacturer`, `ProductionYear`, `AssemblyPlace` (+ documentos em 4.3). O Hestia usa só `Manufacturer`.
- `Pset_OpeningElementCommon`: `Reference`, `Status`, `Purpose`, `FireExit`, `ProtectedOpening` (IFC4); IFC4.3 troca por `FireRating` e `AcousticRating`. Uso: `Purpose` = 'ventilation'/'access' para vãos livres. O Hestia não exporta.

### 5.4 Como o Hestia mapeia hoje

Ver matriz. Pontos de atenção [V-exp]: `ThermalTransmittance` sai como `IFCREAL(2.8)` (o IFC pede `IfcThermalTransmittanceMeasure`), `GlazingAreaFraction` como `IFCREAL` (pede `IfcPositiveRatioMeasure`), `Reference` como `IFCLABEL` (pede `IfcIdentifier`), e valores inteiros (por exemplo U = 3) saem `IFCINTEGER` (`singleValue` em `ifcProperties.ts` escolhe o tipo pelo valor). Validadores IDS/Solibri costumam acusar tipo de dado.

Semântica de `Reference`: o Hestia grava `Opening.mark || type.code || type.name`. Pela definição do IFC, `Reference` é identificador do TIPO; a marca da instância (J-1, P-2) tem lugar em `IfcDoor.Tag` (que o Hestia já usa) [V-schema + V-exp]. Sugestão: `Reference` = `type.code` (fallback nome); `Tag` = `mark`. Como o Revit trata isso: [I] `Reference` = Type Mark, mas confirmar.

---

## 6. Vão, preenchimento e hospedagem

[V-schema] `IfcRelVoidsElement(RelatingBuildingElement: IfcElement, RelatedOpeningElement: IfcFeatureElementSubtraction)` e `IfcRelFillsElement(RelatingOpeningElement: IfcOpeningElement, RelatedBuildingElement: IfcElement)`.

Regras do modelo [I, conhecimento do padrão; confirmar nas páginas oficiais]:

- Vão e preenchimento: um `IfcOpeningElement` pode ter vários `IfcRelFillsElement`? Em IFC4 a cardinalidade exige que um vão seja preenchido por no máximo um elemento (`RelatedBuildingElement` único; um vão com dois preenchimentos exige dois vãos). Importante para esquadrias compostas (porta com bandeira e janela ao lado): ou um vão com um `IfcDoor` que inclui as bandeiras, ou vãos separados.
- O `IfcOpeningElement` não deve ser contido espacialmente (`IfcRelContainedInSpatialStructure`); ele pertence ao elemento que fura, via `IfcRelVoidsElement`. O preenchimento deve ser contido na estrutura espacial. O Hestia faz assim: vãos não entram em `st.contained`, só `fillId` [V-código].
- A geometria do vão deve cruzar toda a espessura; o Hestia estende 1 cm de cada lado para evitar faces coplanares (decisão documentada no código) [V-código].
- `IfcOpeningElement` PredefinedType: `OPENING` (atravessa) ou `RECESS` (nicho cego) [V-schema]. O Hestia só usa `OPENING`. Nicho/reentrância (armário embutido) seria `RECESS`.
- `Pset_OpeningElementCommon` e `Qto_OpeningElementBaseQuantities` (quantidades do furo) [I].
- Hospedeiros: parede (`IfcWall`), laje (`IfcSlab`), telhado (`IfcRoof`/`IfcSlab ROOF`), viga. O importador do Hestia só aceita parede (e ignora paredes inclinadas/cortina para a heurística) [V-código]. Janelas de telhado (`SKYLIGHT`) e portas em laje viram genérico.

Round-trip de hospedagem (importação): se o IFC de terceiros não traz `IfcRelVoidsElement`/`IfcRelFillsElement`, o Hestia deduz a parede (`hostByGeometry`) com tolerâncias 0,10/0,05/0,15 m e recusa empates [V-código].

---

## 7. Vãos NÃO retangulares: como o IFC representa

### 7.1 Geometria do vão e do preenchimento

[V-schema] para os tipos; o padrão de uso é [I] (práticas dos exportadores).

1. **Vão** (`IfcOpeningElement.Representation`, `Body`, `SweptSolid`): um `IfcExtrudedAreaSolid` cujo `SweptArea` é o contorno da abertura e cuja extrusão atravessa a parede.
2. **Contorno**:
   - **Círculo**: `IfcCircleProfileDef(Radius)`. Elipse: `IfcEllipseProfileDef(SemiAxis1, SemiAxis2)`. Retângulo com cantos: `IfcRoundedRectangleProfileDef`. Todos paramétricos, leves e exatos [V-schema: atributos de `IfcCircleHollowProfileDef`, `IfcRectangleProfileDef` verificados; os demais por [I]].
   - **Arco pleno, abatido, ogival, trapézio, polígono**: `IfcArbitraryClosedProfileDef(ProfileType=AREA, OuterCurve=…)`.
   - **Moldura (batente) com furo**: `IfcArbitraryProfileDefWithVoids` com `OuterCurve` e `InnerCurves` [V-schema: `OuterCurve`, `InnerCurves`]. Serve para o batente (anel) e para o alizar.
3. **Curvas do contorno** (IFC4):
   - `IfcIndexedPolyCurve(Points: IfcCartesianPointList2D, Segments, SelfIntersect)`, em que `Segments` é uma lista de `IfcLineIndex` e `IfcArcIndex` [V-schema: `IfcSegmentIndexSelect` = `IfcArcIndex | IfcLineIndex`]. Um `IfcArcIndex` tem exatamente 3 índices (início, ponto intermediário, fim) e define um arco circular por três pontos. É a forma mais compacta e a recomendada em IFC4.
   - `IfcCompositeCurve` de `IfcCompositeCurveSegment` (`ParentCurve` = `IfcPolyline` ou `IfcTrimmedCurve`) [V-schema]. `IfcTrimmedCurve(BasisCurve=IfcCircle, Trim1, Trim2, SenseAgreement, MasterRepresentation)` define o arco por ângulos (PARAMETER, graus ou na unidade do projeto) ou por pontos (CARTESIAN). Forma herdada do IFC2x3; a única possível lá e universalmente lida.
4. **Preenchimento**: mesma curva, normalmente com a extrusão pela espessura da folha/batente. Esquadria detalhada: vários sólidos (batente `ArbitraryProfileDefWithVoids`, vidro = região interna, folha); cor por `IfcStyledItem`.

Exemplo STEP de abertura em arco pleno (0,50 m de raio, 1,50 m de reta + 0,5 m de flecha, verificado com o IfcOpenShell [V-exp: arquivo gerado e relido], mas o importador do Hestia perde o arco, ver seção 8):

```
#46=IFCCARTESIANPOINTLIST2D(((-0.5,0.),(0.5,0.),(0.5,1.5),(0.,2.),(-0.5,1.5)));
#47=IFCINDEXEDPOLYCURVE(#46,(IFCLINEINDEX((1,2)),IFCLINEINDEX((2,3)),IFCARCINDEX((3,4,5)),IFCLINEINDEX((5,1))),$);
#48=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,#47);
#50=IFCEXTRUDEDAREASOLID(#48,#45,#49,0.4);   /* #45 = plano XZ, #49 = direção de extrusão */
```

### 7.2 `IfcBooleanResult`

- Dentro do corpo de uma parede, o IFC permite `IfcBooleanResult(DIFFERENCE, parede, vão)`, mas a prática (Reference View, ver [V-web] seção 14) é furar por `IfcRelVoidsElement` e deixar o leitor aplicar o corte. Revit e ArchiCAD gravam a parede sem os furos e o `IfcOpeningElement` à parte [I].
- `IfcBooleanClippingResult` + `IfcPolygonalBoundedHalfSpace` aparecem para recortes de topo (parede abaixo de telhado) e em esquadrias com recorte em ângulo [I]. O Hestia importa só o 1º operando e registra `corte-booleano-ignorado` [V-código]: perde o recorte, preserva o sólido.
- Para vãos arredondados, usar a extrusão do perfil arbitrário e NÃO booleano: leitores simples (web-ifc, viewers) cortam bem `IfcRelVoidsElement`, mas comportam-se pior com boolean aninhado [I].

### 7.3 Representações 2D e `IfcShapeAspect`

- `IfcShapeRepresentation.RepresentationIdentifier`: `Body` (3D), `Axis`, `FootPrint` (planta, "double-line representation projected to ground view"), `Box`, `Annotation` [V-web: definições de Axis/FootPrint]. Em IFC4, a `FootPrint` da porta é um `GeometricCurveSet` ou `Annotation2D`, com a planta do arco de giro e a folha; no `IfcDoor`, espera-se a planta aberta [V-web: texto do IfcDoor 4.3].
- Pelo schema, `IfcShapeAspect(ShapeRepresentations, Name, Description, ProductDefinitional, PartOfProductDefinitionShape)` [V-schema] agrupa pedaços da representação por NOME: `Lining`/`Panel`/`Glazing`. O vínculo entra por `ShapeAspectStyle` das Lining/Panel Properties [V-schema]. Serve para que quem lê saiba qual sólido é o batente e qual é a folha, sem depender de cor.
- O Hestia gera as peças separadas internamente (`parts` com `materialId`), mas funde tudo em uma `Body`. Não há 2D no IFC [V-exp].

### 7.4 `IfcMappedItem` e tipos

[V-schema] `IfcMappedItem(MappingSource: IfcRepresentationMap, MappingTarget: IfcCartesianTransformationOperator)` e `IfcRepresentationMap(MappingOrigin, MappedRepresentation)`. O tipo (`IfcDoorType.RepresentationMaps`) carrega a geometria uma vez; cada ocorrência tem um `IfcMappedItem` apontando para ele (mais compacto e é o que ArchiCAD/Revit usam para famílias repetidas [I]). No IfcOpenShell, `type.assign_type` mapeia automaticamente as representações do tipo nas ocorrências [V-código: `should_map_representations`].

O importador do Hestia segue `IFCMAPPEDITEM` ao ler (portas, janelas e blocos compartilhados, com a transformação aplicada) [V-código `geometry.ts`, `docs/ifc/importacao.md`]. A exportação NÃO usa `IfcMappedItem` e deixa `RepresentationMaps` vazio.

Custo/benefício para o Hestia [I]: uma esquadria do Hestia tem dimensões por ocorrência (largura/altura vêm do tipo, mas `heightOverride`, `sillOverride`, parede de espessura diferente mudam a geometria). Mapear só se a geometria for idêntica; caso contrário, manter corpo por ocorrência. Ganho real: arquivos menores em projetos com centenas de esquadrias iguais e a geometria do tipo visível para classificadores.

### 7.5 Arcos e círculos: onde o Hestia já tem arcos

O Hestia já lida com arcos em parede (`wall.sag`) e `IfcTrimmedCurve` de círculo na leitura [V-código `profiles.ts::trimmedPoints`]. A leitura de `IfcCircle` com `Trim1/Trim2` por ponto ou parâmetro está implementada (amostra a 32 passos por volta). Já `IfcIndexedPolyCurve` com `IfcArcIndex` e `IfcCircleProfileDef` (que o código trata como círculo? ver `profiles.ts:147`, caso `IFCCIRCLEPROFILEDEF`) merecem teste dedicado. Inferência: o caso `IFCCIRCLEPROFILEDEF` está tratado, o arco indexado não [V-código para o segundo].

---

## 8. Experimento: abertura em arco entrando no Hestia [V-exp]

Montei com IfcOpenShell um IFC4 com parede de 4 m, `IfcOpeningElement` com perfil de arco pleno (largura 1,00 m, altura 2,00 m, `IfcArcIndex`) extrudado horizontalmente através da parede, e `IfcWindow` com o mesmo perfil, ligados por `IfcRelVoidsElement` e `IfcRelFillsElement`. Importei no Hestia.

Resultado:

- 1 janela importada, tipo `iot_arco_1000x2000` ("Arco 100x200"), **retangular 1,00 × 2,00 m**, `leaves: 1`, `plan: 'fixed'`, material padrão.
- `report.geometry = { 'extrusao-inclinada': 1 }`: a perda aparece só como contagem, sem aviso ao usuário (`warnings: []`).
- O topo arqueado vira reto: o vão retangular fura a parede por inteiro. Neste exemplo (a parte curva é um semicírculo de raio 0,50 m) a área do vão fica superestimada em 0,50 − π·0,25/2 ≈ 0,11 m² (cálculo meu).
- Leitura de arco: o `IfcIndexedPolyCurve` com `IfcArcIndex` passa por `curvePoints`, que ignora `Segments` (linhas 42–52 de `profiles.ts`); o ponto intermediário do arco entra como vértice (ponta em "telhado" no meio) [V-código]. Para o perfil de vão, o Hestia usa apenas a caixa envolvente, então isso não aparece na janela, mas aparece para quem usar o contorno (lajes, pisos com furos arqueados).

Conclusão: a limitação principal está no MODELO (sem forma de vão), não só no leitor.

---

## 9. Como Revit, ArchiCAD e Vectorworks tratam esquadrias

Esta seção tem poucas fontes confirmadas; a busca não achou documentação específica sobre esquadria em arco em nenhuma das três [V-web: três buscas dirigidas sem resultado específico].

**ArchiCAD** [V-web]:
- Ajuda oficial "Import/Save Openings with IFC" (versões 24–29): a importação cria `Opening` nativo do ArchiCAD só se o hospedeiro é parede, laje, malha ou viga e o vão está vazio; o oposto (vão com preenchimento) vira porta/janela ou objeto.
- Elementos classificados como "Openings" no tradutor IFC sempre saem como `IfcOpeningElement`; há opção "Export gross geometry" (geometria bruta sem furos).
- Relatos da comunidade: o `IfcOpeningElement` gerado por cada porta/janela falha em validadores (Solibri, BIMcollab) por `PredefinedType` e `Name` vazios; no IFC4 o ArchiCAD usa `...Type`, não `...Style` [V-web: títulos de discussões na seção 14].
- Importação no Revit: por padrão o Revit mapeia `IfcOpeningElement` para a categoria "Generic Models" [V-web], o que cria "caixas" soltas.

**Revit** [V-web + I]:
- O exportador (revit-ifc, código aberto) escreve `IfcDoor`/`IfcWindow` com `IfcDoorType`/`IfcWindowType`, `Pset_DoorCommon`/`Pset_WindowCommon` e o furo como `IfcOpeningElement`. A busca NÃO confirmou se escreve `IfcDoorLiningProperties`/`IfcDoorPanelProperties` [V-web: busca sem confirmação]; segundo [I], o exportador as grava, derivadas de parâmetros de família (Frame Width, Frame Thickness...), mas isso precisa de teste com um arquivo real.
- Relato de fórum: reveals feitos como "Generic Model Openings" exportam como tubos, enquanto o furo de janela exporta correto [V-web].
- Janelas em arco no Revit são famílias com recortes "Opening" no host (cut geometry). A geometria vazada sai no `IfcOpeningElement` como extrusão do contorno real [I]. Na reimportação, o Revit transforma em Generic Model.
- Importação: em `IfcDoor`/`IfcWindow` o Revit cria o elemento com forma genérica ("DirectShape") por padrão, e só vira família nativa quando o arquivo é aberto como link [I].

**Vectorworks** [V-web]: exporta objetos Porta/Janela como `IfcDoor`/`IfcWindow` (mapeamento editável em "IFC Data Mapping") e importa a maioria como objeto "IFC Entity" mantendo a classe IFC. Não achei relato de `IfcDoorStyle` ou de arco.

**IfcOpenShell/Bonsai** [V-código]: gera portas e janelas paramétricas retangulares com Lining/Panel properties; qualquer outro contorno vem de geometria livre.

Problemas de round-trip conhecidos (compilado, parte [I]):

| Problema | Origem | Efeito no Hestia |
|---|---|---|
| Porta/janela sem `IfcRelFillsElement` | ArchiCAD/Revit com opções de exportação | Hestia usa `hostByGeometry` |
| `IfcOpeningElement` virando objeto genérico na reimportação | Revit (Generic Models) | Hestia reimporta o vão como parte do preenchimento; ok |
| Vão com tamanho diferente do preenchimento (folga) | Todos | Hestia usa a caixa do vão como largura/altura e perde `roughOversize` |
| Esquadria em `Body` única, sem partes | Todos | Hestia não separa batente/folha/vidro |
| Operação em `IfcWindowPanelProperties` | Revit/ArchiCAD/Hestia | Hestia não lê (seção 2.2) |
| `Pset_*Common` no tipo vs. na instância | Revit 2025 removeu `IsExternal` do tipo [V-web: release notes do revit-ifc] | `psetOf` lê instância e tipo, ok |
| Unidades (mm vs. m) | Todos | Hestia aplica `units.length` [V-código]; vi isso falhar no meu IFC de teste quando misturei unidades, o que confirma que a escala vem da declaração do projeto [V-exp] |
| Esquadria em arco vira retângulo | Hestia (importação) | seção 8 |

---

## 10. Níveis de desenvolvimento e informação (LOD/LOIN), COBie, ISO 19650, bSDD

Pouco foi confirmado na web; abaixo está majoritariamente [I]. Fontes de partida na seção 14.

- **LOD (AIA/BIMForum LOD Spec)**: LOD 100–500. Para esquadrias: LOD 200 = caixa genérica com dimensões aproximadas e tipo; LOD 300 = dimensões reais, posição, operação e tipo específico; LOD 350 = conexões (batente com a parede, soleira); LOD 400 = fabricação (ferragens, perfis); LOD 500 = como construído. O Hestia exporta geometria LOD ~300 (batente, folha, vidro, maçaneta) e dados LOI baixos: falta desempenho, classificação, fabricante completo [I].
- **LOIN (ISO 7817-1:2024, substitui o LOD como conceito normativo)**: o requisito é por finalidade (quadro de esquadrias, orçamento, desempenho térmico, manutenção): define Geometria, Informação alfanumérica e Documentação. Para o quadro de esquadrias BR, o mínimo: tipo/código, largura, altura, peitoril, material do caixilho, vidro, operação, fabricante e, se NBR 15575, desempenho [I].
- **ISO 19650-1/-2/-3**: gestão da informação (EIR, BEP, MIDP/TIDP, CDE); relevante pelas convenções de nome/ID, status (`Pset_*Common.Status`) e GUID estável. O Hestia gera GlobalId determinístico (`gid('door:…')`) [V-código], o que ajuda em revisões sucessivas. Metadados de ISO 19650 (suitability/status) não são gravados [I].
- **COBie (NBIMS-US V3)**: planilhas `Type`, `Component`, `System`, `Space`, `Attribute`, `Connection`... Door/Window aparecem como elementos compartilhados em Type e Component [V-web: tabelas COBie V3 do NIBS]. Mapeamentos (por [I]): `Type.Name` = nome do `IfcDoorType`/`IfcWindowType` (via `IfcRelDefinesByType` [V-web]); `Type.Manufacturer` = `Pset_ManufacturerTypeInformation.Manufacturer`; `Type.ModelNumber` = `ModelReference`; `Type.NominalWidth/Height` = `Qto_*BaseQuantities` ou `OverallWidth/Height`; `Component.Name` = `IfcDoor.Name`; `Component.Space` = espaço pelos limites (`IfcRelSpaceBoundary`, o Hestia não exporta); `Connection` entre ambientes por porta. Para o Hestia as lacunas são: `ModelReference`, garantia, `Qto_*`, `IfcRelSpaceBoundary` e classificação.
- **bSDD / classificação** [V-web: apenas visão geral e API]: a bSDD (buildingSMART Data Dictionary) publica classificações (Uniclass, OmniClass, IFC...) e propriedades em domínios. A associação em IFC é `IfcRelAssociatesClassification` → `IfcClassificationReference(Identification, Name, ReferencedSource)` [V-schema para os atributos]. Busca por NBR 15965 na bSDD não retornou: verificar se há domínio brasileiro. Filtrar pesquisas pela entidade IFC (por exemplo `IfcDoor`) evita classificações incorretas [V-web, documentação do Bonsai]. Recomendação [I]: campo `classification: { system, code }` no `OpeningType`, exportado como `IfcClassificationReference` no tipo.

---

## 11. Bugs e riscos já visíveis no código de mapeamento

Todos [V-código] salvo quando indicado.

| # | Local | Problema | Correção sugerida |
|---|---|---|---|
| B1 | `doorOperation`, `'pivot'` | Mapeia para `REVOLVING` (porta giratória de 4 folhas). Porta pivotante não tem valor próprio. | `SINGLE_SWING_LEFT/RIGHT` com `IfcDoorPanelProperties.PanelOperation=SWINGING` e `UserDefinedOperationType='PIVOT'`, ou `USERDEFINED`. Confirmar com o enum [V-schema para os valores]. |
| B2 | `doorOperation`, `'double'` | `DOUBLE_DOOR_DOUBLE_SWING` = duas folhas de vai-e-vem [I: definição]. Porta de duas folhas de giro comum = `DOUBLE_DOOR_SINGLE_SWING`. | Trocar. `'dblact'` com 2 folhas: `DOUBLE_DOOR_DOUBLE_SWING`. |
| B3 | `doorOperation` | `leaves` é ignorado: correr com 2 folhas deveria ser `DOUBLE_DOOR_SLIDING`; sanfonada/bifold com 2, `DOUBLE_DOOR_FOLDING`. `SWING_FIXED_LEFT/RIGHT` (folha + painel fixo, caso de `sidelights`) não é usado. | Ler `leaves`, `sidelights` e `composition`. |
| B4 | `doorOperation`, `'garage'` | Seccionado sai `ROLLINGUP` (o comentário reconhece). IFC4.3 tem `LIFTING_VERTICAL_*`/`DOUBLE_DOOR_LIFTING_VERTICAL`. `PredefinedType` poderia ser `GATE`. | Em IFC4.3, usar `LIFTING_VERTICAL_*`; `GATE` em ambos. |
| B5 | `windowPartition` | Só conta folhas: 4+ folhas viram `TRIPLE_PANEL_VERTICAL`; `grid` (n×m), `transom` (bandeira) e `sidelights` não entram. | Mapear `grid`/`transom` para `*_HORIZONTAL`/`TRIPLE_PANEL_TOP|BOTTOM`; senão `USERDEFINED`. |
| B6 | `openingTypeEntity` | Um único `IfcWindowPanelProperties` por janela, `PanelPosition=NOTDEFINED`, e com o `Name` do tipo. Janela de 2 folhas deveria ter 2 painéis (`LEFT`/`RIGHT`) cada um com sua operação (a 2ª invertida). | Um painel por folha. |
| B7 | `windowOperation`, `'tilt'` | Basculante (eixo horizontal) → `BOTTOMHUNG`. `PIVOTHORIZONTAL` é o equivalente do basculante de eixo no centro [I]; `BOTTOMHUNG` é a "projetante de fundo/tombar". `tiltAxis` do Hestia (0,2 a 0,8) é de pivô. | Usar `PIVOTHORIZONTAL` quando `tiltAxis` ≈ 0,5; senão `OTHEROPERATION`. [I] |
| B8 | `windowOperation`, `'louver'` | `TILTANDTURN*` não é veneziana. `OTHEROPERATION` + `UserDefinedOperationType` no pset. | |
| B9 | `openingCommonProps` | `SolarHeatGainTransmittance` no `Pset_WindowCommon` (inexistente lá) [V-schema]. | Mover para `Pset_DoorWindowGlazingType`. A importação (`bimFieldsOf`) lê do lugar errado e precisa ler dos dois (para reler arquivos antigos do Hestia) e o do correto. |
| B10 | `openingCommonProps` | Tipos de dados (seção 5.4); `AcousticRating` como `"30 dB"`; `IsExternal` sempre presente (ok). | `IFCTHERMALTRANSMITTANCEMEASURE`, `IFCPOSITIVERATIOMEASURE`, `IFCIDENTIFIER`. |
| B11 | `openingCommonProps` | `GlazingAreaFraction` só para janela; `Pset_DoorCommon` também tem a propriedade [V-schema] e o Hestia tem `glassRatio` na porta. | Exportar para porta com vidro (`glassRatio` × altura da folha). |
| B12 | `openingTypeEntity` | Psets de desempenho vão só na instância; no IFC4 ADD2 `Pset_DoorCommon.ApplicableEntity` é `IfcDoor` apenas [V-schema], então o lugar canônico é a instância. Em IFC4.3 vale também no tipo. | Se for exportar IFC4.3, duplicar no tipo. |
| B13 | `bimFieldsOf` (importação) | Não lê `FireRating`, `ThermalTransmittance`, `AcousticRating` para o tipo (seção 1, item 6). | Promover para `fireRating`, `uValue`, `acousticRw` (com parse de "30 dB"/"Rw 32"). |
| B14 | `openingType` (importação) | Chave do tipo = nome + `l×a` em mm: variações de peitoril ou de fabricante colapsam num só tipo; `leaves` só 1 ou 2. | Incluir `OverallWidth/Height` do `IfcDoor` quando houver (em vez da caixa do vão) e `PartitioningType` completo. |
| B15 | `operationOf` (importação) | Procura o 1º enum que casa uma regex no tipo/ocorrência. Para `IfcWindowType`, o único enum é o `PartitioningType`; operação em `IfcWindowPanelProperties` ignorada. | Ler `HasPropertySets` e `IfcRelDefinesByProperties` do tipo/ocorrência para `IfcWindowPanelProperties`/`IfcDoorPanelProperties`. |
| B16 | Importação, arcos | `IfcIndexedPolyCurve` ignora `Segments`. | Amostrar `IfcArcIndex` (círculo por 3 pontos). |
| B17 | Importação, relatório | Perda de forma entra só em `report.geometry`, sem `warnings`. | Avisar quando o perfil não é retangular (área do perfil ≠ área da caixa). |

---

## 12. MATRIZ: parâmetro Hestia ↔ campo IFC ↔ perda hoje

Colunas: **Exp** = o que a exportação grava hoje; **Imp (terceiros)** = o que a importação recupera de um IFC sem `Pset_Hestia`; **Perda**. Em IFC próprio (com `Pset_Hestia`), tudo volta [V-exp].

### 12.1 Identificação, tipo e classificação

| Hestia | Campo IFC ideal | Exp | Imp (terceiros) | Perda hoje |
|---|---|---|---|---|
| `kind` ('door'/'window') | classe `IfcDoor`/`IfcWindow` | sim | sim | nenhuma (mas `SKYLIGHT`, `GATE`, `TRAPDOOR` não existem) |
| `OpeningType.name` | `IfcDoorType.Name` (+ `IfcDoor.Name`) | sim | sim (`name` + dimensões) | dimensões entram no nome da importação |
| `OpeningType.code` | `Tag` do tipo e `Pset_*Common.Reference` | só `Tag` do tipo | não | `Reference` carrega a marca da instância, não o código do tipo |
| `OpeningType.description` | `IfcDoorType.Description` | sim | não | descrição do tipo não volta |
| `Opening.mark` | `IfcDoor.Tag` | sim | sim (`f.text(filler,7)`) | ok; também em `Reference` (semântica trocada) |
| `plan` (família) | `OperationType` (porta) / `PartitioningType` + `IfcWindowPanelProperties.OperationType` (janela) | sim, com erros B1–B8 | só `double`/`sliding`/`swing`/`fixed` | `pivot`, `dblact`, `pocket`, `bifold`, `garage`, `hinged`, `hung`, `louver`, `casement`, `tilt` viram `swing`/`fixed` |
| `leaves` | `PartitioningType` (janela); nº de `IfcDoorPanelProperties` (porta) | só janela, 1–3 | 1 ou 2 | 3+ folhas; nº de folhas de porta de correr; `leaves = 0` (vão livre) sem representação própria |
| `flipHand` | `SINGLE_SWING_LEFT/RIGHT`, `SIDEHUNG*`, `SLIDING_TO_*`, `FOLDING_TO_*` | sim | porta: regex `/RIGHT/`; janela: não | janela: lado da dobradiça perdido |
| `flipFacing` | eixo +Y do `ObjectPlacement` (lado de abertura) | [não verificado se o `g.u` já incorpora] | não | possível inversão de face em terceiros [I] |
| `closure` | revestimento do vão (`IfcCovering`/`IfcRelCoversBldgElements`) ou camada da parede | não | não | retorno de acabamento do vão perdido |
| classificação (não existe) | `IfcRelAssociatesClassification` | não | não | NBR 15965/Uniclass/OmniClass inexistente no modelo |

### 12.2 Dimensões e posição

| Hestia | Campo IFC | Exp | Imp (terceiros) | Perda hoje |
|---|---|---|---|---|
| `width` | `OverallWidth`; `Qto_*BaseQuantities.Width`; `Dim` do perfil | `OverallWidth` | da caixa do VÃO | usa o furo, não o batente; sem `roughOversize` |
| `height` | `OverallHeight` | sim | da caixa do vão | idem |
| `heightOverride` (instância) | `OverallHeight` da ocorrência | sim (`openingHeight`) | n/a | tipo gerado por `l×a` |
| `sill` / `sillOverride` | `z` do `ObjectPlacement` do preenchimento | sim | derivado: z0 do vão menos base da parede | peitoril do tipo não vem de dado; só do furo |
| `offset` | `ObjectPlacement` (x ao longo da parede) | sim | sim | nenhuma |
| `nominalRef` (`'opening'`/`'leaf'`), `spanGap` | `OverallWidth` vs. vão (`IfcOpeningElement`) | só como diferença geométrica | não | a convenção "porta 80×210 é a folha" (NBR 15930) não viaja |
| `roughOversize` | geometria do `IfcOpeningElement` maior que a do preenchimento | sim | não (usa o vão como dimensão) | folga de assentamento perdida, vão importado = tamanho da esquadria |
| `plano` (parede inclinada) | extrusão do vão (inclinada vs. vertical) | geometria | `extrusao-inclinada` | parâmetro `plano` perdido |
| Forma do vão (NÃO EXISTE) | `IfcArbitraryClosedProfileDef`, `IfcCircleProfileDef`, `IfcIndexedPolyCurve` | não | caixa envolvente | arco, círculo, trapézio, polígono: seção 8 |

### 12.3 Esquadria (batente, folha, vidro)

| Hestia | Campo IFC | Exp | Imp (terceiros) | Perda hoje |
|---|---|---|---|---|
| `frameWidth` | `IfcWindowLiningProperties.LiningThickness` / `IfcDoorLiningProperties.LiningThickness`; `IfcWindowPanelProperties.FrameThickness` | só geometria | não | dado paramétrico inexistente |
| `frameDepth`, `frameDepthMode` | `LiningDepth` | só geometria | não | modo 'wall'/'core'/'fixed' perdido |
| `leafThickness` | `IfcDoorPanelProperties.PanelDepth` | só geometria | não | idem |
| `glassThickness`, `glassKind` | `Pset_DoorWindowGlazingType`: `GlassThickness1`, `IsTempered`, `IsLaminated`, `IsWired`, `GlassColor` | só cor do material | não | espessura e tipo de vidro como dado |
| `grid` (cols×rows) | `FirstMullionOffset`, `FirstTransomOffset`, `MullionThickness`, `TransomThickness`; `PartitioningType` | só geometria | não | divisões como dado |
| `transom` | `IfcDoorLiningProperties.TransomThickness`/`TransomOffset` | só geometria | não | idem |
| `sidelights` | `SWING_FIXED_LEFT/RIGHT`; painéis `IfcDoorPanelProperties` `FIXEDPANEL` | só geometria | não | idem |
| `threshold` | `IfcDoorLiningProperties.ThresholdDepth/ThresholdThickness/ThresholdOffset` | só geometria | não | soleira como dado |
| `casing` (alizar) | `CasingThickness`/`CasingDepth` | só geometria | não | idem |
| `sillBoard` | `Pset_WindowCommon.HasSillExternal/Internal`; ou `IfcCovering`/`IfcMember` | só geometria | não | peitoril como flag |
| `lintel`, `sillBeam` | `IfcBeam`/`IfcMember` (VERGA/CONTRAVERGA) | não verificado | não | provável perda [não verificado se vira elemento] |
| `reveal` | `LiningToPanelOffsetX/Y`, `LiningOffset` | só geometria | não | idem |
| `frameStyle`, `leafStyle`, `handle`, `hinges`, `handleHeight`, `handleInset`, `leafUndercut` | sem campo padrão; só geometria; ferragens como `IfcDiscreteAccessory` filho (`IfcRelAggregates`) | só geometria (corpo único) | não | peças viram um só corpo, sem hierarquia |
| `frameMaterialId`, `leafMaterialId`, `glassMaterialId` | `IfcMaterial`/`IfcMaterialConstituentSet` (`Frame`/`Panel`/`Glazing`) | `IfcRelAssociatesMaterial` do batente; estilos por item | nome de material "IFC #cor" | material de vidro/folha como constituinte perdido |
| `composition` (células + perfis) | sem equivalente; possível `IfcRelAggregates` com `IfcMember`/`IfcPlate` por peça | não | não | modelo composto perdido |
| `tiltAxis`, `angle2d`, `angle3d` | `IfcWindowPanelProperties` sem campo; ângulo = `Pset` próprio | não | não | |

### 12.4 Desempenho e BIM

| Hestia | Campo IFC | Exp | Imp (terceiros) | Perda hoje |
|---|---|---|---|---|
| `fireRating` | `Pset_*Common.FireRating` (IfcLabel) | instância | só `ifcProperties` (RO) | não repovoa `fireRating` do tipo (B13) |
| `acousticRw` (número) | `AcousticRating` (IfcLabel, ex. "Rw 32") | `"<n> dB"` | só `ifcProperties` | número perdido; formato livre |
| `uValue` | `ThermalTransmittance` (IfcThermalTransmittanceMeasure) | `IfcReal`/`IfcInteger` | só `ifcProperties` | tipo de dado; não repovoa `uValue` |
| `solarFactor` | `Pset_DoorWindowGlazingType.SolarHeatGainTransmittance` | **em `Pset_WindowCommon` (errado)** | lê do mesmo lugar errado | vira inválido para IDS; só é relido de arquivos do Hestia (B9) |
| `manufacturer` | `Pset_ManufacturerTypeInformation.Manufacturer` | sim, no tipo | sim | `ModelReference`, `ArticleNumber`, `GTIN` não existem |
| `cost` | `IfcCostItem`/`IfcCostValue` associado | não | não | custo do tipo perdido |
| `Opening.ifcProperties` | psets originais | reexporta | lê | ok (round-trip de terceiros preservado) |
| `IsExternal` (derivado da parede) | `Pset_*Common.IsExternal` | sim | só em `ifcProperties` | |
| `GlazingAreaFraction` (estimado) | `Pset_*Common.GlazingAreaFraction` | só janela | só em `ifcProperties` | porta com `glassRatio` fica sem; é estimativa e não medição |
| área, perímetro | `Qto_DoorBaseQuantities`/`Qto_WindowBaseQuantities` | não | não | quadro de esquadrias e orçamento por BIM |
| `SecurityRating`, `Infiltration`, `HandicapAccessible`, `FireExit`, `SelfClosing`, `SmokeStop`, `HasDrive` | `Pset_*Common` | não | `ifcProperties` | campos inexistentes no modelo |

### 12.5 Representação

| Aspecto | IFC | Exp | Imp (terceiros) | Perda |
|---|---|---|---|---|
| Corpo 3D | `Body/SweptSolid`, `Brep`, `Tessellation` | `SweptSolid` (retângulos) | lê `Extruded`, `Mapped`, `FacetedBrep`, `Tessellation`; boolean só 1º operando | recortes booleanos |
| Planta 2D (símbolo, arco de giro) | `FootPrint`/`Plan`, `Annotation` | não | não lê | desenho 2D do Hestia não viaja; viewers mostram só 3D |
| Eixo | `Axis` | não | n/a | |
| Tipo mapeado | `IfcRepresentationMap` + `IfcMappedItem` | não | segue o mapeado | arquivo maior |
| `IfcShapeAspect` | batente/painel/vidro | não | não | partes sem nome |

---

## 13. Recomendações priorizadas

Esforço: P pequeno (≤1 dia), M médio (2–4 dias), G grande.

| Prio | Item | Esforço | Por quê |
|---|---|---|---|
| 1 | **Forma do vão no modelo** (`OpeningType.shape`: `rect` \| `arch` (flecha) \| `round` \| `ellipse` \| `trapezoid` \| `polygon`) e exportar o vão e a esquadria com `IfcArbitraryClosedProfileDef`/`IfcIndexedPolyCurve` com `IfcArcIndex` (círculo: `IfcCircleProfileDef`) | G (modelo, kernel de corte, 2D, 3D, UI) | Maior perda de informação e de uso real (portas/janelas em arco são comuns). Sem isso a importação continua achatando. |
| 2 | **Importar arcos**: tratar `IfcArcIndex` em `curvePoints`; detectar perfil não retangular na abertura e, se o modelo ainda não tiver forma, gerar aviso em `warnings` e registrar `ifcProperties` com o contorno | P (leitura + aviso); M (detecção de forma) | B16/B17 |
| 3 | **Corrigir mapeamentos** B1–B8 (`pivot`, `double`, `leaves` em porta, `partition` com grade/bandeira, painel por folha, basculante, veneziana) com testes novos em `ifcWindowOperation.test.ts`/`ifcOpeningBim.test.ts` | P | Erros semânticos que quem lê o IFC vê. |
| 4 | **Corrigir psets** (B9–B11): `SolarHeatGainTransmittance` → `Pset_DoorWindowGlazingType`; tipos de medida corretos; `Reference` = código do tipo; `GlazingAreaFraction` na porta; exportar `GlassThickness1`, `IsTempered/IsLaminated/IsWired`, `GlassColor` | P/M | Conformidade e validação IDS. |
| 5 | **Importar desempenho para o tipo** (B13, B9): `fireRating`, `uValue`, `acousticRw`, `solarFactor` (dos dois psets), `leaves` por `PartitioningType` completo, operação por `IfcWindowPanelProperties`/`IfcDoorPanelProperties` (B15) | M | Quadro de esquadrias coerente com IFC de terceiros. |
| 6 | **Exportar `IfcDoorLiningProperties`/`IfcDoorPanelProperties`/`IfcWindowLiningProperties`/`IfcWindowPanelProperties`** a partir de `frameWidth`, `frameDepth`, `threshold`, `casing`, `grid`, `transom`, `leafThickness`; um painel por folha; em IFC4.3, duplicar nos psets `Pset_*LiningProperties` | M | Dados paramétricos da esquadria; permite ao Revit/Bonsai reconstruir. |
| 7 | **`Qto_DoorBaseQuantities`/`Qto_WindowBaseQuantities`** (Width, Height, Perimeter, Area) e `IfcRelAssociatesClassification` (campo `classification` no tipo) | P/M | LOIN para quantitativos e COBie. |
| 8 | **Representações 2D** (`FootPrint` com arco de giro por `IfcPolyline`/`IfcTrimmedCurve`; `Axis`) e `IfcMappedItem` com `RepresentationMaps` por tipo (só quando a geometria for idêntica) | G | Simbologia de planta fora do Hestia; arquivos menores. |
| 9 | **`IfcShapeAspect`** para batente/painel/vidro e `IfcRelAggregates` com `IfcDiscreteAccessory` para maçaneta/dobradiça | M | Partes identificáveis; necessário para classificação por parte. |
| 10 | **Skylight e portas em laje**: `hostByGeometry` e `IfcRelVoidsElement` com hospedeiro laje/telhado; `PredefinedType` `SKYLIGHT`/`GATE` | M | Hoje viram genéricos. |
| 11 | Suite de testes de interoperabilidade com arquivos públicos (buildingSMART sample files, Bonsai/IfcOpenShell demos, Revit/ArchiCAD exports) e validação com `ifcopenshell.validate` + IDS | M | Ainda não testei com projetos-exemplo públicos (rede bloqueada). |

Esboço de modelo para o item 1 [I]:

```ts
type OpeningShape =
  | { kind: 'rect' }
  | { kind: 'arch'; rise: number }                    // flecha (m); rise = width/2 => arco pleno
  | { kind: 'round' }                                 // diâmetro = width (=height)
  | { kind: 'ellipse' }                               // semi-eixos de width/height
  | { kind: 'trapezoid'; topWidth: number }
  | { kind: 'polygon'; points: Array<{ u: number; v: number }> }; // em 0..width, 0..height
```

Exportação: perfil de vão = contorno; perfil de esquadria = contorno reduzido por `frameWidth` (`IfcArbitraryProfileDefWithVoids` para o batente); `OverallWidth/Height` = caixa envolvente; `Qto.Width/Height` omitidos quando não retangular (o padrão pede isso [V-schema]); `Qto.Area` real. Importação: reconhecer `IfcCircleProfileDef`, `IfcEllipseProfileDef`, `IfcIndexedPolyCurve` com arcos, `IfcCompositeCurve` com `IfcTrimmedCurve`, classificar como `arch` quando houver exatamente 1 arco no topo, `round` quando o contorno for um círculo; senão `polygon` (arcos amostrados) com aviso.

---

## 14. Fontes e URLs

**Material local verificado ([V-schema], [V-código])**
- IfcOpenShell 0.9.0.post1 instalado em `/usr/local/lib/python3.13/dist-packages/ifcopenshell/` (schemas IFC4 e IFC4X3_ADD2 via `ifcopenshell_wrapper`; templates `util/schema/Pset_IFC4_ADD2.ifc` e `util/schema/Pset_IFC4X3.ifc`; `api/geometry/add_door_representation.py`, `add_window_representation.py`, `api/type/assign_type.py`).
- Código do Hestia: `packages/io/src/ifc/ifcOpeningTypes.ts`, `ifcExport.ts` (`addOpenings`), `ifcOpeningBim.test.ts`, `ifcWindowOperation.test.ts`, `ifcProperties.ts`, `ifcHestia.ts`; `packages/io/src/ifcImport/openingImport.ts`, `openingHost.ts`, `elementTypes.ts`, `geometry.ts`, `profiles.ts`, `psets.ts`; `packages/model/src/openingTypes.ts`; `docs/ifc/exportacao.md`, `docs/ifc/importacao.md`.

**buildingSMART (localizadas por busca; páginas NÃO abertas, acesso bloqueado)**
- IFC4 ADD2 TC1, `IfcDoorTypeOperationEnum`: https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcsharedbldgelements/lexical/ifcdoortypeoperationenum.htm
- IFC4.3, `IfcDoorTypeOperationEnum`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorTypeOperationEnum.htm
- IFC4.3, `IfcDoorPanelOperationEnum`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorPanelOperationEnum.htm
- IFC4.3, `IfcWindowTypePartitioningEnum`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindowTypePartitioningEnum.htm
- IFC4.3, `IfcDoor`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoor.htm
- IFC4.3, `IfcDoorType`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorType.htm
- IFC4.3, `IfcDoorTypeEnum`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorTypeEnum.htm
- IFC4.3, `Pset_DoorCommon`: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_DoorCommon.htm
- IFC4.3, atributos de tipo de porta: https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/concepts/Object_Attributes/Object_Type_Attributes/Door_Type_Attributes/content.html
- IFC2x3, `IfcDoorStyle`: https://standards.buildingsmart.org/IFC/RELEASE/IFC2x3/FINAL/HTML/ifcsharedbldgelements/lexical/ifcdoorstyle.htm
- Espelho da documentação IFC4 (BSI infra room, `Pset_DoorCommon`): https://bsi-infraroom.github.io/IFC-Documentation-Tunnel/4_4_0_0/general/HTML/schema/ifcsharedbldgelements/pset/pset_doorcommon.htm
- Espelho NIBS, `IfcShapeRepresentation`: https://nibs.org/files/docs/IFC4x2_Bridge/schema/ifcrepresentationresource/lexical/ifcshaperepresentation.htm
- Listagem EXPRESS (STEP Tools), `IfcWindowTypePartitioningEnum`: https://steptools.com/stds/ifc/html/t_ifcwindowtypepartitioningenum.html
- IfcOpenShell, classes IFC4 (`IfcDoor`, `IfcTypeProduct`): https://ifcopenshell.github.io/docs/rst_files/class_ifc4_1_1_ifc_door.html e https://ifcopenshell.github.io/docs/rst_files/class_ifc4_1_1_ifc_type_product.html

**Ferramentas e fóruns ([V-web], só títulos/trechos)**
- ArchiCAD, importar/salvar vãos com IFC: https://help.graphisoft.com/AC/29/INT/_AC29_Help/040_ElementsVB/040_ElementsVB-267.htm e https://helpcenter.graphisoft.com/user-guide/134942
- ArchiCAD, portas viram objetos no IFC: https://community.graphisoft.com/t5/Documentation/Doors-are-beign-transformed-into-Objects-in-IFC/td-p/330050
- ArchiCAD, doors e windows com `IfcOpeningElement`: https://community.graphisoft.com/t5/Project-data-BIM/Archicad-Doors-and-Windows-with-IfcOpeningElement/m-p/716492
- ArchiCAD, IFC4 e `IfcDoorType`: https://community.graphisoft.com/t5/Collaborate-forum/IFC-4-issue-with-Door-type/td-p/262342
- ArchiCAD para Revit, posição de portas e janelas: https://community.graphisoft.com/t5/Collaboration-with-other/ArchiCad-to-Revit-via-IFC-Windows-Doors-positions-Issues/m-p/288306/highlight/true
- ArchiCAD para Revit, doors e windows faltando: https://community.graphisoft.com/t5/Collaboration-with-other/Doors-and-windows-missing-from-IFC-model-Revit-Archicad/td-p/605688
- Revit, exportação de openings: https://forums.autodesk.com/t5/revit-structure-forum/ifc-export-openings-revit-2021/td-p/9824034
- Revit, classes IFC suportadas: https://help.autodesk.com/cloudhelp/2024/ENU/RevitLT-DocumentPresent/files/GUID-EE6C0CF8-7671-4DCC-B0C7-EEA7513C90A9.htm
- revit-ifc, releases (nota sobre `IsExternal`): https://github.com/Autodesk/revit-ifc/releases
- revit-ifc, propriedades de tipo que não exportam: https://github.com/Autodesk/revit-ifc/issues/160
- OSArch, Revit e classes IFC: https://wiki.osarch.org/revit-setup-for-openbim-revit-and-ifc-classes/
- Vectorworks, interoperabilidade IFC: https://app-help.vectorworks.net/2018/eng/VW2018_Guide/IFC/IFC_Format_Interoperability.htm e https://app-help.vectorworks.net/2026/eng/VW2026_Guide/IFC/Concept_IFC_overview.htm
- COBie V3 (NIBS): https://nibs.org/nbims/v3/cobie/6-2/ e https://www.nibs.org/sites/default/files/docs/40-Resource-COBie-V3_IFC.pdf
- COBie, ativo mantenível (OSArch): https://wiki.osarch.org/cobie-definition-of-a-maintainable-asset/
- bSDD e classificações IFC (OSArch): https://wiki.osarch.org/index.php/IFC_-_Industry_Foundation_Classes/IFC_classifications

**Pendências de verificação (precisam de acesso aos hosts da buildingSMART ou de arquivos reais)**
1. Cardinalidade e regras de `IfcRelFillsElement` / `IfcRelVoidsElement` e do `IfcOpeningElement` (seção 6).
2. Descrição das figuras de `TRIPLE_PANEL_*` e do valor correto de `DOUBLE_DOOR_DOUBLE_SWING` vs. `DOUBLE_DOOR_SINGLE_SWING` (B2, seção 3.4).
3. O que o exportador do Revit realmente grava para Lining/Panel properties e para esquadrias em arco; como o ArchiCAD e o Vectorworks exportam esquadria em arco. Pedir um IFC real exportado de cada um.
4. Definição de LOD/LOIN por esquadria (AIA/BIMForum LOD Spec; ISO 7817-1:2024) e do mapeamento COBie de Door/Window por campo.
5. Se existe domínio da NBR 15965 na bSDD.
6. Teste com projetos-exemplo públicos (a rede da sessão não os alcançou).
