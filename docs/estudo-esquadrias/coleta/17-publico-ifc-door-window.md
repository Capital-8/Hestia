# Coleta pública buildingSMART: IfcDoor e IfcWindow (IFC4 e IFC4.3)

Data da coleta: 2026-11-17
Status geral: **coleta incompleta.** Os hosts oficiais da buildingSMART não resolveram nesta sessão, então nenhuma página oficial foi lida na íntegra.

## 1. Bloqueio de acesso (registro)

| Host | URL tentada | Resultado |
|---|---|---|
| ifc43-docs.standards.buildingsmart.org | `.../IFC4x3/HTML/lexical/IfcDoor.htm` | `getaddrinfo ENOTFOUND` (falha de DNS) |
| ifc43-docs.standards.buildingsmart.org | `.../IfcDoorType.htm`, `.../IfcWindow.htm`, `.../IfcWindowType.htm`, `.../IfcWindowLiningProperties.htm`, `.../IfcWindowPanelProperties.htm` | `getaddrinfo ENOTFOUND` (mesma falha, 6 tentativas) |
| standards.buildingsmart.org | `.../IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcsharedbldgelements/lexical/ifcdoortypeoperationenum.htm` | `getaddrinfo ENOTFOUND` |

A mensagem de erro indica que o host precisa ser liberado nas configurações de rede da sessão. Não houve novas tentativas nesses hosts após a falha.

**Consequência:** nenhuma tabela abaixo foi confirmada lendo a página oficial. Tudo o que segue está classificado como:

- **[BUSCA]**: aparece apenas no trecho de resultado do WebSearch (página não lida), com a URL de origem.
- **[MEMÓRIA]**: conhecimento do modelo, **não verificado** nesta coleta. Deve ser conferido no schema oficial antes de uso.

## 2. Fontes consultadas

Fontes oficiais (buildingSMART), **apenas como trecho de busca, páginas não lidas**:

- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoor.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorType.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorLiningProperties.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcDoorPanelProperties.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindow.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindowType.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindowLiningProperties.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcWindowPanelProperties.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_DoorCommon.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_WindowCommon.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Qto_DoorBaseQuantities.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Qto_WindowBaseQuantities.htm
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/ifcsharedbldgelements/content.html
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/concepts/Object_Attributes/Object_Type_Attributes/Door_Type_Attributes/content.html
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/concepts/Object_Attributes/Object_Type_Attributes/Window_Type_Attributes/content.html
- https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/Pset_WindowLiningProperties.htm
- https://standards.buildingsmart.org/IFC/RELEASE/IFC4/ADD2_TC1/HTML/schema/ifcsharedbldgelements/lexical/ifcdoortypeoperationenum.htm
- https://forums.buildingsmart.org/t/what-exactly-is-the-area-measured-in-qto-doorbasequantities/2897 (fórum buildingSMART, não é norma)

Fontes secundárias (não oficiais, usadas só como pista):

- https://steptools.com/stds/ifc/html/t_ifcdoorliningproperties.html (EXPRESS do IFC4, mirror)
- https://steptools.com/stds/ifc/html/t_ifcdoorpanelproperties.html
- https://steptools.com/stds/ifc/html/t_ifcwindowliningproperties.html
- https://steptools.com/stds/ifc/html/t_ifcwindowpanelproperties.html
- https://ifcopenshell.github.io/docs/rst_files/class_ifc4_1_1_ifc_door_lining_properties.html
- https://ifcopenshell.github.io/docs/rst_files/class_ifc4_1_1_ifc_window.html
- https://docs.vertex.fi/bd2022en/html/bd/ifc/contentsofifcstdcommonpropsets.html (lista de ferramenta, não norma)
- https://community.osarch.org/discussion/comment/28629/ (fórum da comunidade)
- https://helpcenter.graphisoft.com/knowledgebase/63190/ (ajuda de ferramenta)

## 3. IfcDoor

### 3.1 Atributos de IfcDoor

| Atributo | Tipo | Unidade | Obrigatório | Status | Fonte |
|---|---|---|---|---|---|
| PredefinedType | IfcDoorTypeEnum | — | OPTIONAL | [BUSCA] | IFC4x3 IfcDoor (trecho) |
| OperationType | (não é atributo de IfcDoor, ver nota) | — | — | [BUSCA] | IFC4x3 IfcDoorType (trecho) |
| OverallHeight | IfcPositiveLengthMeasure | m | OPTIONAL | [MEMÓRIA] | — |
| OverallWidth | IfcPositiveLengthMeasure | m | OPTIONAL | [MEMÓRIA] | — |
| ParameterTakesPrecedence | IfcBoolean | — | OPTIONAL | [MEMÓRIA] | — |
| UserDefinedOperationType | IfcLabel | — | OPTIONAL | [MEMÓRIA] | — |

**Nota de conflito sobre OperationType:** o trecho de busca diz que OperationType "vive no objeto de tipo" (IfcDoorType), com enum IfcDoorTypeOperationEnum, e que IfcDoorStyleOperationEnum é deprecated desde IFC4. Ao mesmo tempo, o trecho indica OperationType [1:1] em IfcDoorType, enquanto o PredefinedType de IfcDoor é OPTIONAL. Esses dois dados são difíceis de conciliar: confirmar na página IfcDoorType antes de usar.

**PredefinedType (trecho IFC4.3 de IfcDoor):** OPTIONAL. Pode ficar sem valor quando há IfcDoorType associado. Se for USERDEFINED, o atributo herdado ObjectType deve ser preenchido.

**PartitioningType:** a busca não encontrou nenhum resultado para IfcDoor. [MEMÓRIA] PartitioningType é atributo de IfcWindowType, não de IfcDoor nem de IfcDoorType. Confirmar.

### 3.2 Enums de porta

| Enum | Valores | Status |
|---|---|---|
| IfcDoorTypeEnum | não coletado (página não lida) | pendente |
| IfcDoorTypeOperationEnum | não coletado (página não lida) | pendente |
| IfcDoorPanelOperationEnum | não coletado | pendente |
| IfcDoorPanelPositionEnum | não coletado | pendente |

Obs.: o trecho cita IfcDoorStyleOperationEnum como substituído por IfcDoorTypeOperationEnum a partir do IFC4 (fonte: resultado de busca da página IfcDoorTypeOperationEnum do IFC4x3).

### 3.3 IfcDoorLiningProperties

Base: [BUSCA] é subtipo de IfcPreDefinedPropertySet. Trecho cita a declaração IFC4 com estes atributos OPTIONAL: LiningDepth (IfcPositiveLengthMeasure) e LiningThickness (IfcNonNegativeLengthMeasure), além de threshold, transom, casing e offset. A tabela explícita da mesma página omite LiningDepth, então a declaração é tratada como a referência mais confiável.

| Atributo | Tipo | Unidade | Obrigatório | Status |
|---|---|---|---|---|
| LiningDepth | IfcPositiveLengthMeasure | m | OPTIONAL | [BUSCA] (declaração IFC4, páginas não lidas) |
| LiningThickness | IfcNonNegativeLengthMeasure | m | OPTIONAL | [BUSCA] |
| LiningToPanelOffsetX | IfcLengthMeasure | m | OPTIONAL | [BUSCA] (adicionado no IFC2x4) |
| LiningToPanelOffsetY | IfcLengthMeasure | m | OPTIONAL | [BUSCA] (adicionado no IFC2x4) |
| ShapeAspectStyle | — | — | — | [BUSCA] deprecated, não usar |

Regras de validação [BUSCA]: o conjunto deve estar anexado a IfcDoorType ou IfcDoorStyle.
Definição [BUSCA, IFC4x3]: LiningDepth é medido perpendicularmente ao plano do batente.

Atributos de threshold, transom e casing citados no trecho, mas sem nomes/tipos confirmados: pendente.

### 3.4 IfcDoorPanelProperties

Base: [BUSCA] é subtipo de IfcPreDefinedPropertySet.

| Atributo | Tipo | Unidade | Obrigatório | Status |
|---|---|---|---|---|
| PanelDepth | IfcPositiveLengthMeasure | m | OPTIONAL | [BUSCA] |
| PanelOperation | IfcDoorPanelOperationEnum | — | obrigatório | [BUSCA] |
| PanelWidth | IfcPositiveLengthMeasure | m | — | [BUSCA] (nome citado, tipo não confirmado) |
| PanelPosition | IfcDoorPanelPositionEnum | — | — | [BUSCA] (nome citado, tipo não confirmado) |
| ShapeAspectStyle | — | — | — | [BUSCA] deprecated |

Definição [BUSCA]: PanelDepth é medido perpendicularmente ao plano da folha.

### 3.5 Pset_DoorCommon

| Propriedade | Status |
|---|---|
| Reference | [BUSCA] (listada na página IFC4.3 de Pset_DoorCommon, via resultado de busca) |
| Status | [BUSCA] |
| FireRating | [BUSCA] |
| AcousticRating | [BUSCA] |
| SecurityRating | [BUSCA] apenas em guia de terceiro (ifc-navigator), **não confirmado** no buildingSMART |

Tipo, unidade e cardinalidade de cada propriedade: não coletados (página não lida). Para ferramenta de referência, uma lista mais curta aparece em docs.vertex.fi (Label, Fire rating, Door type, U Value), mas é mapeamento de ferramenta, não norma.

### 3.6 Qto_DoorBaseQuantities

Definição de Area [BUSCA, IFC4x3]: área total do batente externo (outer lining). Há confusão na prática: um participante do fórum buildingSMART lê como largura × altura do batente, outro como largura × altura da folha em portas de batente. O fórum não resolve a questão.

Relatos de problema [BUSCA, OSArch]: em uma ferramenta, a largura calculada fica errada quando a largura é menor que a altura.

| Quantidade | Tipo | Unidade | Status |
|---|---|---|---|
| Width, Height, Area | — | m, m, m² | nomes confirmados só para Window; para Door, pendente |

## 4. IfcWindow

### 4.1 IfcWindow e IfcWindowType

| Atributo | Entidade | Tipo | Status |
|---|---|---|---|
| PredefinedType | IfcWindow | IfcWindowTypeEnum | [MEMÓRIA] |
| PartitioningType | IfcWindowType | IfcWindowTypePartitioningEnum | [MEMÓRIA] (busca não confirmou) |
| OperationType | IfcWindowType | IfcWindowTypeOperationEnum | [MEMÓRIA] |
| ParameterTakesPrecedence | IfcWindowType | IfcBoolean | [MEMÓRIA] |
| UserDefinedPartitioningType | IfcWindowType | IfcLabel | [MEMÓRIA] |

Relação [BUSCA, IFC4.3]: IfcWindowType referencia IfcWindowLiningProperties e IfcWindowPanelProperties (um por painel). A ocorrência IfcWindow recebe os parâmetros através do tipo.

Os nomes e cardinalidades acima não foram lidos na página. Confirmar.

### 4.2 IfcWindowLiningProperties

| Atributo | Tipo | Unidade | Status |
|---|---|---|---|
| LiningDepth | IfcPositiveLengthMeasure | m | [MEMÓRIA] |
| LiningThickness | IfcNonNegativeLengthMeasure | m | [MEMÓRIA] |
| LiningOffset | IfcLengthMeasure | m | [MEMÓRIA] |
| LiningToPanelOffsetX | IfcLengthMeasure | m | [MEMÓRIA] |
| LiningToPanelOffsetY | IfcLengthMeasure | m | [MEMÓRIA] |
| TransomThickness, MullionThickness, FirstTransomOffset, FirstMullionOffset | IfcPositiveLengthMeasure / IfcLengthMeasure | m | [MEMÓRIA] |

Restrição [BUSCA, Pset_WindowLiningProperties IFC4.3]: o offset lining-painel deve ser menor ou igual a PanelThickness de IfcWindowPanelProperties.
Obs.: o trecho aponta que IfcWindowLiningProperties não tem representação geométrica própria.

### 4.3 IfcWindowPanelProperties

| Atributo | Tipo | Unidade | Status |
|---|---|---|---|
| PanelDepth | IfcPositiveLengthMeasure | m | [MEMÓRIA] |
| PanelThickness | — | m | [BUSCA] (citado como referência, tipo não confirmado) |
| PanelOperation | IfcWindowPanelOperationEnum | — | [MEMÓRIA] |
| PanelPosition | IfcWindowPanelPositionEnum | — | [BUSCA] (enum citado: IfcWindowPanelPositionEnum) |
| FrameDepth, FrameThickness | IfcPositiveLengthMeasure | m | [MEMÓRIA] |

Exemplo [BUSCA]: janela de duas folhas verticais usa dois conjuntos de painel, um com PanelPosition = LEFT e outro com PanelPosition = RIGHT.

### 4.4 Pset_WindowCommon

| Propriedade | Status |
|---|---|
| FireRating | [BUSCA] (Graphisoft help) |
| AcousticRating | [BUSCA] (Graphisoft help) |
| SoundRating, UValue, Label | [BUSCA] apenas em lista de ferramenta (Vertex), não norma |

Lista completa e tipos: não coletados (página IFC4.3 de Pset_WindowCommon não teve o conteúdo lido).

### 4.5 Qto_WindowBaseQuantities

| Quantidade | Tipo | Unidade | Definição | Status |
|---|---|---|---|---|
| Width | IfcAreaMeasure/IfcLengthMeasure | m | Largura total do batente externo; só é fornecida quando a espessura é constante | [BUSCA] |
| Height | IfcLengthMeasure | m | Altura total do batente externo; só para janelas retangulares | [BUSCA] |
| Area | IfcAreaMeasure | m² | Área calculada do batente externo | [BUSCA] (adicionada no IFC4) |
| Perimeter | IfcLengthMeasure | m | Perímetro | [BUSCA] (adicionada no IFC4) |

Tipos exatos de Width e Height não confirmados na página.

## 5. Como representar arco

Nada oficial coletado. Apenas trechos de busca (fonte: OSArch e documentação ODA/IfcOpenShell):

- [BUSCA] Perfil 2D: IfcArbitraryClosedProfileDef, cuja curva externa é do tipo IfcCurve e precisa ser 2D.
- [BUSCA] Arco: IfcCompositeCurve misturando IfcPolyline e IfcTrimmedCurve, onde o arco é uma IfcTrimmedCurve sobre IfcCircle. Ângulos de trim são lidos na unidade de ângulo do projeto e convertidos para radianos (relato de commit do IfcOpenShell/Bonsai).
- [BUSCA] A abertura da janela geralmente é específica de cada ocorrência, não do tipo. Comunidade BlenderBIM usa uma representação 2D "Profile" no tipo como solução de contorno.
- [BUSCA] Relato de problema: janela com topo em arco exportada pelo BlenderBIM gerou abertura retangular na parede.

**Inferência (não validada):** para janela em arco, uma opção é IfcArbitraryClosedProfileDef com IfcCompositeCurve (IfcPolyline para lados e base, IfcTrimmedCurve de IfcCircle para o topo), usada na representação da abertura. Confirmar com o schema e testar no visualizador alvo.

## 6. Pendências

1. Liberar `ifc43-docs.standards.buildingsmart.org` e `standards.buildingsmart.org` na rede da sessão e repetir a coleta.
2. Ler as páginas listadas na seção 2, extrair tabelas completas de atributos, enums e Psets/Qtos.
3. Resolver o conflito de OperationType (IfcDoor x IfcDoorType).
4. Confirmar se IfcDoor/IfcDoorType tem PartitioningType (hipótese: não).
5. Confirmar tipos e unidades de Width/Height de Qto_DoorBaseQuantities.
6. Confirmar lista completa de Pset_DoorCommon e Pset_WindowCommon na versão alvo.
7. Confirmar representação de arco na especificação (IfcGeometricRepresentation, IfcOpeningElement) com exemplo oficial.
