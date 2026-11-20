# Análise de IFC de instalações (elétrica, gás/hidrossanitário) para o ADR de MEP

Status: concluído (lote de 23 arquivos). Escopo: somente leitura dos dados de terceiros, processados localmente; nenhum nome de cliente, endereço, pessoa, coordenada ou número de processo aparece aqui. Arquivos são referenciados por rótulo (arquivo A a W, em ordem alfabética do nome). Os dados foram lidos de `modelos-ifc/delta-projetos`, que tem 23 arquivos `.ifc` (o pedido falava em 24; não há um 24º arquivo .ifc na pasta).

Método: script em streaming linha a linha (uma passagem de statements e uma passagem para coordenadas de pontos), sem carregar o arquivo inteiro. Números de altura e diâmetro são calculados a partir da colocação (placement) e dos perfis, com a unidade do projeto (todos os 23 arquivos usam centímetro, `IFCSIUNIT` com prefixo CENTI, convertido para metro). Os agregados vêm dos JSON por arquivo; o consolidador e o gerador de tabelas estão na pasta de scripts, fora do repositório.

## 1. Esquema e software autor

| rótulo | esquema | preprocessador / origem (só nome do programa) | papel observado |
|---|---|---|---|
| A, C, D, F, G, H, I, J, K, M, N, O, P, Q, R, S, T, U, V, W | IFC4 | IfcPlusPlus | instalações (MEP) |
| L | IFC2X3 | IfcPlusPlus | instalações (MEP) |
| B | IFC2X3 | TQS 23.5.53 (origem) | estrutural (vigas, pilares, sapatas, lajes, aberturas) |
| E | IFC4 | IfcPlusPlus | estrutural (vigas, pilares, lajes) |

- Os psets MEP trazem `AltoQi_Builder` e `AltoQi_QiBuilder-Itens_Associados`: a autoria é do AltoQi Builder, exportado pelo IfcPlusPlus. Os psets estruturais trazem `AltoQi_Eberick_*` (B e E) e `TQS_*` (B).
- Total: 23 arquivos, cerca de 4,84 milhões de statements STEP, 60.958 produtos (soma por arquivo).
- Cada arquivo tem um `IFCPROJECT`, um `IFCSITE` e um `IFCBUILDING`. Pavimentos (`IFCBUILDINGSTOREY`): de 1 a 9 por arquivo.

## 2. Contagem de entidades por classe

Tabela 1 (anexo, por arquivo). As classes de produto mais frequentes nas instalações, somadas nos 23 arquivos:

| classe | produtos | disciplina típica (pelos psets e pela geometria) |
|---|---|---|
| IFCPIPESEGMENT | 15.211 | hidrossanitário / gás (tubo) |
| IFCCABLECARRIERSEGMENT | 12.797 | elétrica (eletroduto de perfil circular de ~22 mm; eletrocalha em alguns) |
| IFCPIPEFITTING | 9.713 | hidrossanitário / gás (conexão) |
| IFCJUNCTIONBOX | 6.789 | elétrica (caixa de passagem / de tomada) |
| IFCLIGHTFIXTURE | 5.131 | elétrica (luminária) |
| IFCSANITARYTERMINAL | 4.086 | hidrossanitário (ponto de água / ralo) |
| IFCVALVE | 1.016 | hidrossanitário / gás |
| IFCFLOWSEGMENT | 760 | fluxo genérico; 499 no arquivo L (elétrica, IFC2X3) |
| IFCWASTETERMINAL | 714 | hidrossanitário (esgoto) |
| IFCFIRESUPPRESSIONTERMINAL | 553 | incêndio (sprinkler / hidrante) |
| IFCCABLESEGMENT | 521 | elétrica (condutor, perfil circular de 6 mm) |
| IFCBEAM | 432 | estrutural (não é MEP) |
| IFCDISTRIBUTIONFLOWELEMENT | 371 | genérico, sem tipo específico |
| IFCBUILDINGELEMENTPROXY | 262 | genérico (tomadas e interruptores aparecem assim em alguns arquivos) |
| IFCFLOWFITTING | 256 | elétrica (conexão, arquivo L) |
| IFCFLOWTERMINAL | 218 | elétrica (terminal, arquivo L) |
| IFCELECTRICDISTRIBUTIONBOARD | 193 | elétrica (quadro) |
| IFCCOLUMN | 179 | estrutural (não é MEP) |
| IFCPROTECTIVEDEVICE | 168 | elétrica (disjuntor / DPS) |
| IFCFLOWMETER | 134 | gás / hidráulica (medidor) |
| IFCBURNER | 109 | gás (queimador) |
| IFCFOOTING | 102 | estrutural (não é MEP) |
| IFCCABLECARRIERFITTING | 89 | elétrica (conexão de eletrocalha) |
| IFCSTACKTERMINAL | 78 | exaustão / chaminé (terminal) |
| IFCDUCTFITTING | 59 | climatização (conexão de duto) |
| IFCTANK | 42 | hidrossanitário / gás (reservatório) |
| IFCCONDENSER, IFCEVAPORATOR | 31 cada | climatização |
| IFCINTERCEPTOR, IFCPUMP | 22 cada | hidrossanitário (caixa retentora, bomba) |
| IFCAIRTERMINAL | 13 | climatização (difusor) |
| IFCMEMBER | 13 | estrutural (não é MEP) |
| IFCBOILER | 10 | gás / aquecimento |
| IFCFILTER | 7 | hidráulica |
| IFCSWITCHINGDEVICE, IFCOUTLET | 7 e 5 | elétrica (interruptor e tomada, poucos arquivos) |
| IFCFLOWCONTROLLER | 1 | elétrica (arquivo L) |

Também aparecem `IFCDUCTSEGMENT`/`IFCDUCTFITTING` (climatização), `IFCOPENINGELEMENT` (601, só no arquivo B, ignorado pelo importador), `IFCSLAB`, `IFCSTAIR`, `IFCFOOTING`, `IFCBEAM`, `IFCCOLUMN`, `IFCMEMBER` (estrutura).

PredefinedType: em praticamente todas as classes de instalação o último atributo é `$` (ausente). Os únicos valores preenchidos são de estrutura: `IFCFOOTING` (PAD_FOOTING, NOTDEFINED), `IFCSLAB` (FLOOR), `IFCSTAIR` (USERDEFINED). Conclusão: o tipo de instalação não vem do PredefinedType; vem da classe, do tipo (`IFCRELDEFINESBYTYPE`, 58.930 relações; tipos como `IFCPIPEFITTINGTYPE` 415, `IFCSANITARYTERMINALTYPE` 215, `IFCJUNCTIONBOXTYPE` 171, `IFCCABLECARRIERSEGMENTTYPE`, `IFCLIGHTFIXTURETYPE`) e dos psets.

Classes que mudam de nome entre arquivos: tomadas e interruptores aparecem como `IFCBUILDINGELEMENTPROXY` (16 arquivos), `IFCOUTLET`/`IFCSWITCHINGDEVICE` (poucos arquivos) e `IFCFLOWTERMINAL` (arquivo L). Para o mesmo elemento lógico, a classe muda por arquivo.

## 3. Sistemas e agrupamento

Não há agrupamento IFC nos 23 arquivos:
- `IFCDISTRIBUTIONSYSTEM`, `IFCSYSTEM`, `IFCZONE`, `IFCGROUP`: 0 entidades em todos os arquivos.
- `IFCRELASSIGNSTOGROUP`: 0.
- `IFCDISTRIBUTIONPORT`: 0. `IFCRELCONNECTSPORTS`, `IFCRELCONNECTSPORTTOELEMENT`, `IFCRELNESTS`, `IFCRELCONNECTSELEMENTS`, `IFCRELFLOWCONTROLELEMENTS`: 0.
- Portanto não há conectividade topológica (portas) e não há sistema de distribuição. A única ligação entre elementos é geométrica (contato).

O agrupamento real está nas propriedades (ver seção 4):
- `Identificação_Elemento.Rede` (texto, presente em 21 dos 21 arquivos de instalação): é o sistema/rede do elemento.
- `Circuito` (pset de luminárias, caixas e pontos): propriedades `Circuito_1`, `Circuito_2`, `Quadro_1`, `Quadro_2`, `Comando_1`, `Comando_2`, `Pavimento_do_circuito_1..3`. O circuito e o quadro de cada ponto ficam em texto; não há relação IFC entre o ponto e o quadro.
- `AltoQi_Builder`: `Quadro Alimentador`, `Proteção - Grupo`, `Proteção - Peça`, `DPS - Grupo`, `DPS - Peça`, `Proteção de Manutenção - Grupo/Peça`. Atribuições de proteção também são texto.
- Os nomes dos grupos (valores) não são lidos nem reproduzidos aqui.

Espacial: `IFCRELAGGREGATES` (2 a 3 por arquivo: site > edifício > pavimento). Os elementos ficam em `IFCRELCONTAINEDINSPATIALSTRUCTURE` (1 a 9 relações por arquivo, uma por pavimento). Somente os arquivos B e E têm elementos fora de pavimento (B: 614 produtos, abertura e estrutura).

## 4. Propriedades (psets, nomes e tipos)

Psets por classe (agregado; top por classe): `Pset_PipeSegmentTypeCommon`, `Pset_PipeFittingTypeCommon`, `Pset_CableCarrierSegmentTypeCommon`, `Pset_CableCarrierSegmentTypeCableLadderSegment`, `Pset_CableCarrierSegmentTypeCableTraySegment`, `Pset_CableSegmentTypeCommon`, `Pset_CableSegmentTypeConductorSegment`, `Pset_JunctionBoxTypeCommon`, `Pset_LightFixtureTypeCommon`, `Pset_ElectricalDeviceCommon`, `Pset_ElectricDistributionBoardTypeCommon`, `Pset_SanitaryTerminalTypeCommon`, `Pset_WasteTerminalTypeCommon`, `Pset_ValveTypeCommon`, `Pset_FireSuppressionTerminalTypeCommon`, `Pset_FlowMeterTypeCommon`, `Pset_BuildingElementProxyTypeCommon`, `Pset_DuctSegmentTypeCommon`. Estrutura: `Pset_BeamCommon`, `Pset_ConcreteElementGeneral`, `AltoQi_Eberick_*`, `TQS_Padrao`, `TQS_Armaduras`, `TQS_Geometria`. Psets de identificação do autor: `Identificação_Elemento` e `AltoQi_Builder`, `AltoQi_QiBuilder-Itens_Associados` (lista de itens associados: quantitativo de materiais), `AltoQi_Builder-Ponto1` e `-Ponto2` (pontos elétricos), `Circuito`. `IFCELEMENTQUANTITY` é 0 em todos os arquivos: quantitativos vêm como propriedades, não como quantidades IFC.

Tipos de valor (wrapper do `NominalValue`): `IFCTEXT` (a maioria), `IFCLENGTHMEASURE` (dimensões e comprimentos), `IFCREAL` (potência, rendimento, fator de potência, vazão), `IFCINTEGER` (número de polos, de lâmpadas, quantidade), `IFCCOUNTMEASURE` (quantidade de itens de catálogo), `IFCLUMINOUSFLUXMEASURE` (fluxo luminoso), `IFCELECTRICCURRENTMEASURE` (corrente nominal). Unidade: `IfcPropertySingleValue.Unit` é `$` em todos os casos; a unidade vem do projeto (centímetro) ou do nome da propriedade, por exemplo `(W)`, `(%)`, `(l/s)`.

Trinta propriedades mais úteis para quantitativo e circuito (nome, tipo, presença em arquivos):

| # | pset | propriedade | tipo | arquivos | uso |
|---|---|---|---|---|---|
| 1 | AltoQi_QiBuilder-Itens_Associados | Cabo Unipolar ... 2.5 mm² (cores: branco, verde-amarelo, preto, azul claro) | IFCLENGTHMEASURE | 17 a 19 | comprimento de cabo por bitola e cor |
| 2 | AltoQi_QiBuilder-Itens_Associados | Cabo Unipolar ... 4 mm² (verde-amarelo, preto, azul claro) | IFCLENGTHMEASURE | 15 a 17 | comprimento de cabo 4 mm² |
| 3 | AltoQi_QiBuilder-Itens_Associados | Eletroduto PVC flexível (leve 3/4", leve 1", pesado 1.1/4") | IFCLENGTHMEASURE | 16 a 17 | comprimento de eletroduto por bitola |
| 4 | AltoQi_QiBuilder-Itens_Associados | Dispositivo Elétrico - embutido - Placa 2x4" (1, 2 funções; com furo) | IFCCOUNTMEASURE | 19 a 20 | quantidade de placas |
| 5 | AltoQi_QiBuilder-Itens_Associados | Dispositivo Elétrico - S/ placa - Tomada hexagonal NBR 14136 (10A, 20A) | IFCCOUNTMEASURE | 17 a 20 | quantidade de tomadas |
| 6 | AltoQi_QiBuilder-Itens_Associados | Caixa de passagem - embutir - aço pintada 100x100x80 mm | IFCCOUNTMEASURE | 19 | quantidade de caixas |
| 7 | AltoQi_QiBuilder-Itens_Associados | Acessórios p/ eletrodutos (caixa PVC 4x2", octogonal 4x4") | IFCCOUNTMEASURE | 19 a 20 | quantidade de acessórios |
| 8 | AltoQi_QiBuilder-Itens_Associados | Dispositivo de proteção contra surto (175 V, 8 kA) | IFCCOUNTMEASURE | 15 | DPS |
| 9 | AltoQi_QiBuilder-Itens_Associados | PVC acessórios - válvula p/ lavatório e tanque 1" | IFCCOUNTMEASURE | 15 | quantidade hidráulica |
| 10 | AltoQi_Builder | Diâmetro (bitola) | IFCLENGTHMEASURE (em outros arquivos, IFCTEXT) | 15 | diâmetro de elemento linear |
| 11 | AltoQi_Builder | Diâmetro interno; Comprimento máximo | IFCLENGTHMEASURE | 21 | dimensão de conduto |
| 12 | Pset_PipeSegmentTypeCommon | InnerDiameter | IFCLENGTHMEASURE | 15 | diâmetro interno do tubo |
| 13 | Pset_CableCarrierSegmentTypeCableLadderSegment | NominalLength | IFCLENGTHMEASURE | 20 | comprimento nominal do trecho |
| 14 | AltoQi_Builder | Vazão de projeto (l/s) | IFCREAL | 15 | vazão hidráulica |
| 15 | AltoQi_Builder | Tensão | IFCTEXT | 20 | tensão do circuito |
| 16 | AltoQi_Builder | Fases | IFCTEXT | 20 | fases do circuito |
| 17 | AltoQi_Builder | Número de polos | IFCINTEGER | 20 | polaridade |
| 18 | AltoQi_Builder | Quadro Alimentador | IFCTEXT | 20 | quadro de origem |
| 19 | AltoQi_Builder | Proteção - Grupo; Proteção - Peça | IFCTEXT | 20 | proteção do circuito |
| 20 | AltoQi_Builder | DPS - Quantidade; DPS - Grupo; DPS - Peça | IFCINTEGER / IFCTEXT | 20 | proteção contra surto |
| 21 | AltoQi_Builder | Padrão das proteções; Proteção de Manutenção - Grupo/Peça | IFCTEXT | 19 a 20 | padrão de proteção |
| 22 | AltoQi_Builder-Ponto1 | Potência (W); Fator de potência (%); Rendimento (%) | IFCREAL | 20 | carga do ponto |
| 23 | AltoQi_Builder-Ponto1 | Fluxo luminoso para tensão 127V / 12V / 220V | IFCLUMINOUSFLUXMEASURE | 20 | luminária |
| 24 | AltoQi_Builder-Ponto1 | Tipo de ponto; Tipo de luminária; Requer aterramento | IFCTEXT | 20 | tipo do ponto |
| 25 | AltoQi_Builder-Ponto1 | Número de lâmpadas; Quantidade | IFCINTEGER | 20 | quantidade por ponto |
| 26 | Pset_ElectricalDeviceCommon-Ponto1 | NominalCurrent | IFCELECTRICCURRENTMEASURE | 20 | corrente nominal |
| 27 | Pset_ElectricalDeviceCommon-Ponto1 | NumberOfPoles; HasProtectiveEarth | IFCINTEGER / IFCTEXT | 20 | polos e aterramento |
| 28 | Circuito | Circuito_1, Circuito_2, Quadro_1, Quadro_2 | IFCTEXT | 20 | circuito e quadro do ponto |
| 29 | Circuito | Comando_1, Comando_2, Pavimento_do_circuito_1..3 | IFCTEXT | 15 a 20 | comando e pavimento do circuito |
| 30 | Identificação_Elemento | Rede; Classe; Tipo; Nome; Aplicação; Descrição | IFCTEXT | 21 | sistema/rede e classificação do elemento |

Nota: `AltoQi_Builder-Ponto1` aparece em `IFCJUNCTIONBOX`, `IFCLIGHTFIXTURE` e `IFCBUILDINGELEMENTPROXY`; é o ponto elétrico (tomada, interruptor, luminária). Por isso as tomadas e interruptores estão em proxies: a classe não distingue o tipo do ponto, o pset sim.

## 5. Geometria

Representações (`IFCPRODUCTDEFINITIONSHAPE` > `IFCSHAPEREPRESENTATION`):
- Elementos de instalação: `Body/SolidModel` (quase tudo). `Body/SweptSolid` aparece em `IFCSANITARYTERMINAL` (1.034) e `IFCWASTETERMINAL` (1). `Axis/Curve2D` só em vigas e lajes estruturais (B, E). `Body/Brep` só em alguns estruturais.
- Itens geométricos (contagem total): `IFCEXTRUDEDAREASOLID` é o item dominante (perfil circular ou retangular, profundidade = comprimento). `IFCSPHERE` marca conexões e terminais (ex.: 9.863 em `IFCPIPEFITTING`, 5.579 em `IFCCABLECARRIERSEGMENT`). `IFCFACETEDBREP` é pequeno (1.428 no arquivo E, estrutural; 146 em `IFCFLOWSEGMENT`; ~1 a 13 em alguns).
- Zero em todos os arquivos: `IFCSWEPTDISKSOLID`, `IFCMAPPEDITEM`, `IFCREPRESENTATIONMAP`, `IFCTRIANGULATEDFACESET`, `IFCPOLYGONALFACESET`. Conclusão: não há repetição por mapeamento (símbolo de luminária ou tomada) e não há tubo varrido. Cada trecho e cada terminal tem a própria geometria.

Trechos lineares:
- Eletroduto (`IFCCABLECARRIERSEGMENT`): perfil circular com diâmetro do perfil (2 x raio) p50 de 0,021 a 0,032 m (21 a 32 mm), por arquivo; é uma extrusão por trecho, comprimento = profundidade da extrusão (p50 de 0,04 m a 0,9 m por arquivo).
- Tubo (`IFCPIPESEGMENT`): perfil circular, diâmetro p50 de 0,025 m; comprimento = extrusão.
- Condutor (`IFCCABLESEGMENT`): perfil circular de 0,006 m.
- Direção das extrusões: não medida nesta análise. Pela seção 7, a direção não vertical é o caso que o importador marca como `extrusao-inclinada`; a medição fica como pendência.

Alturas (tabela 2 do anexo; cota Z do ponto de colocação relativa ao pavimento, em metros, p50 por arquivo):
- Eletroduto e eletrocalha: 1,0 a 4,3 m (em laje/forro).
- Luminárias: 1,9 a 4,3 m.
- Caixas de passagem: 0,4 a 2,3 m (duas alturas recorrentes, 0,375 m e 1,275 m, sem interpretação de uso).
- Quadros: 1,25 a 1,53 m.
- Tubos: 0,03 a 0,8 m; em um arquivo a mediana é 4,0 m, a verificar (não investigado).
- Pontos de água e de esgoto: 0,50 a 0,53 m (ponto padrão).
- Válvulas: 0,35 a 1,84 m.
- Terminal de sprinkler: 4,0 m.
Os valores negativos (-0,4 a -1,45 m) são de estruturas ou de elementos cuja colocação está abaixo do nível do pavimento (sapatas, pilares), não de instalações.

## 6. Estrutura espacial

- Por arquivo: 1 a 9 pavimentos (`IFCBUILDINGSTOREY`), 1 `IFCBUILDING` e 1 `IFCSITE`, exceto o arquivo B, que não tem `IFCSITE`.
- Elementos por pavimento: de 1 pavimento (arquivos com 1 nível) a 9 pavimentos com até 2.854 elementos cada (arquivo U). Ver a última linha de cada arquivo no resumo.
- Vinculação: todo elemento de instalação está num pavimento (`IFCRELCONTAINEDINSPATIALSTRUCTURE`). Não há elemento de instalação "sem pavimento" (exceto 614 produtos do arquivo B, estruturais e aberturas).
- A cota relativa é a cota absoluta do produto menos a cota absoluta do pavimento (colocação do pavimento). Produtos sem pavimento ou sem colocação são contados à parte no script (`sem_pavimento_por_classe`, `sem_placement_por_classe`).

## 7. Comparação com o importador atual do Hestia

Lido de `packages/io/src/ifcImport` (somente leitura, na worktree `disc`).

Classes com tratamento nativo no importador: `IFCWALL` (e StandardCase), `IFCDOOR`, `IFCWINDOW`, `IFCSLAB`, `IFCCOVERING`, `IFCSPACE`, `IFCROOF`, `IFCCURTAINWALL`, `IFCSTAIR`, `IFCRAILING`, `IFCGRID`. Ignoradas: `IFCOPENINGELEMENT`, `IFCANNOTATION`, `IFCPROJECT`, `IFCSITE`, `IFCBUILDING`, `IFCBUILDINGSTOREY`.

Todas as outras classes de produto com `IFCPRODUCTDEFINITIONSHAPE` viram `Generic` (função `addGenericObjects`): a malha triangular, `sourceClass`, nome, cor e `ifcProperties` são preservados. Na prática, para esta amostra:
- Produtos nativos ou ignorados: 813 (de 60.958). Destes, 601 são aberturas (ignoradas), 90 lajes e 3 escadas (nativos), 119 espaciais.
- Produtos que viram `Generic`: 60.145, por classe (top): IFCPIPESEGMENT 15.211; IFCCABLECARRIERSEGMENT 12.797; IFCPIPEFITTING 9.713; IFCJUNCTIONBOX 6.789; IFCLIGHTFIXTURE 5.131; IFCSANITARYTERMINAL 4.086; IFCVALVE 1.016; IFCFLOWSEGMENT 760; IFCWASTETERMINAL 714; IFCFIRESUPPRESSIONTERMINAL 553; IFCCABLESEGMENT 521; IFCBEAM 432; IFCDISTRIBUTIONFLOWELEMENT 371; IFCBUILDINGELEMENTPROXY 262; IFCFLOWFITTING 256; IFCFLOWTERMINAL 218; IFCELECTRICDISTRIBUTIONBOARD 193; IFCCOLUMN 179; IFCPROTECTIVEDEVICE 168; IFCFLOWMETER 134; IFCBURNER 109; IFCFOOTING 102; IFCCABLECARRIERFITTING 89; IFCSTACKTERMINAL 78; IFCDUCTFITTING 59; IFCTANK 42; IFCCONDENSER e IFCEVAPORATOR 31 cada; IFCINTERCEPTOR e IFCPUMP 22 cada; IFCAIRTERMINAL 13; IFCMEMBER 13; IFCBOILER 10; IFCFILTER 7; IFCSWITCHINGDEVICE 7; IFCOUTLET 5; IFCFLOWCONTROLLER 1.

Classes que viram "genérico sem significado" (sem nenhuma interpretação de sistema, circuito, tipo de ponto ou conexão): praticamente todas acima. As cinco mais numerosas são IFCPIPESEGMENT, IFCCABLECARRIERSEGMENT, IFCPIPEFITTING, IFCJUNCTIONBOX e IFCLIGHTFIXTURE, que juntas somam 49.641 produtos (cerca de 82 por cento dos 60.145 genéricos).

O que se perde ou fica sem tratamento:
- Sistema/circuito: não lidos (`IFCDISTRIBUTIONSYSTEM`, `IFCRELASSIGNSTOGROUP` não existem nesta amostra; mesmo assim o importador não os interpreta). O circuito e o quadro, que estão no pset `Circuito`, ficam só como `ifcProperties` opacas.
- Conectividade: não há portas nesta amostra. Mesmo quando houver (outras fontes), o importador não lê `IFCRELCONNECTS*`.
- Tipos de elemento: a classe de origem é preservada (`sourceClass`), mas tomada e interruptor (proxy) não se distinguem de outros proxies; o tipo está no pset `AltoQi_Builder-Ponto1`.
- `predefinedType` do genérico lê o índice fixo 8 (`src.f.enum(e, 8)`). Para `IFCBUILDINGELEMENTPROXY` o PredefinedType é o índice 9, então o campo sai errado. Nesta amostra o campo é `$` em todos os casos, então não mudou o resultado, mas o índice fixo é um risco.
- Esfera (`IFCSPHERE`): `readItem` em `geometry.ts` não trata `IFCSPHERE`; pelo código, cai no `default` e vira `unsupported`, sem triângulo. Em toda conexão e terminal com esfera (9.863 em conexões de tubo, 5.579 em eletroduto, 4.304 em terminais hidráulicos e outros), a esfera some da malha; o terminal fica sem o volume da conexão.
- Extrusão não vertical: pelo código, `readExtrusion` adiciona os triângulos antes de checar a direção. Assim a malha fica no genérico, mas o trecho é reportado como `extrusao-inclinada` e não gera prisma. Para o genérico a malha basta; para nativos (parede, laje) o prisma faz falta. A proporção de trechos não verticais nesta amostra não foi medida.
- Varrido (`IFCSWEPTDISKSOLID`): não aparece nesta amostra, mas é `unsupported` no importador; tubo varrido em outra fonte ficaria sem malha.

Importante: o importador NÃO foi executado nesta análise. Os itens acima vêm da leitura do código (`geometry.ts`, `genericImport.ts`, `genericElement.ts`). O efeito esperado no relatório do importador (`geometry` com `extrusao-inclinada` e `IFCSPHERE`, `generic` com as classes da lista, `skipped` com as entidades sem triângulo) é uma previsão, a confirmar com uma execução real.

## 8. Recomendações para o ADR de MEP

Vocabulário de classes para suportar primeiro (elétrico, pela amostra):
1. `IFCCABLECARRIERSEGMENT` (eletroduto/eletrocalha; 12.797 + 521 de condutor em `IFCCABLESEGMENT`).
2. `IFCCABLECARRIERFITTING` (conexão de eletrocalha) e `IFCFLOWFITTING` (conexão em arquivo IFC2X3).
3. `IFCJUNCTIONBOX` (caixa de passagem e de ponto; 6.789).
4. `IFCLIGHTFIXTURE` (luminária; 5.131).
5. `IFCELECTRICDISTRIBUTIONBOARD` (quadro; 193).
6. `IFCPROTECTIVEDEVICE` (disjuntor e DPS; 168).
7. Tomada e interruptor: mapear por pset `AltoQi_Builder-Ponto1.Tipo de ponto` (aparecem em `IFCBUILDINGELEMENTPROXY`, `IFCOUTLET`, `IFCSWITCHINGDEVICE`, `IFCFLOWTERMINAL`). A classe não basta.
Depois: hidrossanitário (`IFCPIPESEGMENT`, `IFCPIPEFITTING`, `IFCSANITARYTERMINAL`, `IFCVALVE`, `IFCWASTETERMINAL`) e gás (`IFCFLOWMETER`, `IFCBURNER`, `IFCBOILER`), que são os volumes seguintes.

Campos mínimos de um elemento linear (eletroduto, tubo, condutor):
- id, classe IFC de origem, rede (`Identificação_Elemento.Rede`), bitola (diâmetro interno do perfil circular, em metro; `Pset_PipeSegmentTypeCommon.InnerDiameter` quando houver), comprimento (profundidade da extrusão ou comprimento da diretriz), eixo (dois pontos: início e fim, em coordenada de projeto, convertida da unidade do arquivo), cota de altura relativa ao pavimento de cada extremo, pavimento (id), circuito/quadro quando houver (`Circuito.Circuito_n`, `Circuito.Quadro_n`), material (de psets quando houver) e a malha de referência (opcional, para exibição).

Campos mínimos de um terminal (luminária, tomada, interruptor, ponto hidráulico):
- id, classe IFC de origem, tipo do ponto (`AltoQi_Builder-Ponto1.Tipo de ponto`), pavimento, cota de altura relativa ao pavimento (da colocação), posição em planta, potência (W, `AltoQi_Builder-Ponto1.Potência (W)`), tensão e fases (`AltoQi_Builder.Tensão`, `Fases`), número de polos, circuito e quadro (`Circuito`), proteção (`AltoQi_Builder.Proteção - Grupo/Peça`), quantidade (`AltoQi_Builder-Ponto1.Quantidade`), e lista de portas (vazia nesta amostra).

Modelo de sistema e circuito:
- Não depender de `IfcDistributionSystem` (inexistente aqui). Ler o agrupamento quando existir, mas o modelo deve aceitar o agrupamento por propriedade.
- Modelar circuito como atributo do terminal e como grupo derivado: quadro > circuito > terminais e trechos de mesma `Rede`. Derivar o grupo pelo texto do pset, com validação (quadro existente, circuito com ao menos um terminal).
- Guardar `sourceClass` e o pset original sem alteração (é o que permite a exportação de volta).

Portas de conexão:
- Tornar portas opcionais: nesta amostra a contagem é zero em 23 arquivos. Quando faltam, a conectividade pode ser inferida por contato dos extremos (proximidade do ponto de início e fim de trechos com a conexão ou o terminal), com tolerância declarada no ADR.
- Quando houver `IFCDISTRIBUTIONPORT`, usar `IFCRELCONNECTSPORTS` e `IFCRELCONNECTSPORTTOELEMENT`, mas sem depender deles.

Correções imediatas no importador (fora do escopo do ADR, mas bloqueiam a leitura das instalações):
- Tratar `IFCSPHERE` (esfera) em `readItem`, ou pelo menos registrar o caso como geometria perdida com contagem por classe.
- Trocar o índice fixo do `predefinedType` do genérico pela leitura por atributo (último enum) ou pelo nome do atributo.

Fixture sintética FICTÍCIA para teste de importação e exportação (escrita pela equipe, não derivada dos arquivos; valores literais, calculados à mão, sem dados de cliente):
- Esquema IFC4, unidade de comprimento CENTI (0,01 m), 2 pavimentos: térreo em cota 0 cm, superior em cota 300 cm.
- 1 quadro `IFCELECTRICDISTRIBUTIONBOARD` no térreo, em cota 125 cm (1,25 m), com pset `Circuito` (`Quadro_1 = "Q-TESTE"`) e `Identificação_Elemento.Rede = "ELE-TESTE"`.
- 2 circuitos com eletroduto `IFCCABLECARRIERSEGMENT` de perfil circular de raio 1,1 cm (diâmetro 2,2 cm, valor literal), um trecho horizontal de 300 cm e um vertical de 50 cm, com `IFCRELDEFINESBYTYPE` apontando para um `IFCCABLECARRIERSEGMENTTYPE` vazio de propriedades, mais 1 conexão `IFCCABLECARRIERFITTING` com `IFCSPHERE` de raio 1,5 cm.
- 1 caixa `IFCJUNCTIONBOX` (perfil retangular de 10 x 10 cm, extrusão de 8 cm) em cota 127,5 cm.
- 1 luminária `IFCLIGHTFIXTURE` (perfil retangular 10 x 10 cm, extrusão de 5 cm) em cota 280 cm, pset `Circuito.Circuito_1 = "C1-TESTE"`, `AltoQi_Builder-Ponto1.Potência (W) = 60.0`.
- 1 ponto de tomada `IFCBUILDINGELEMENTPROXY` em cota 30 cm, com `AltoQi_Builder-Ponto1.Tipo de ponto = "TOMADA-TESTE"`; 1 interruptor `IFCSWITCHINGDEVICE` em cota 127,5 cm.
- 1 tubo `IFCPIPESEGMENT` de perfil circular de diâmetro 2,5 cm em cota 50 cm, horizontal, comprimento 200 cm, com `IFCSPHERE` de raio 1,25 cm em uma conexão `IFCPIPEFITTING`.
- 1 elemento com `IFCFACETEDBREP` (cubo de 10 cm) para testar a malha sem extrusão.
- Casos de erro: um elemento com `IFCSWEPTDISKSOLID` (tubo varrido) para testar a notificação de geometria perdida; um elemento sem pavimento para testar a validação espacial.
- Sem portas, sem `IFCDISTRIBUTIONSYSTEM` (o caso real), e um caso alternativo com `IFCDISTRIBUTIONSYSTEM` para o caminho de leitura quando existir.

Limitações deste levantamento:
- As alturas são a cota do ponto de colocação do produto, não a base da caixa geométrica.
- Os diâmetros vêm do perfil circular (raio x 2), não de propriedade; a propriedade `InnerDiameter` aparece em 15 arquivos.
- Os valores das propriedades não foram lidos nem reproduzidos (só nomes, tipos e presença).
- Os tempos do script são internos (sem fila de execução): soma de 55 segundos no lote inteiro.

## Medidas de execução

- Arquivos processados: 23 de 23, todos com código de saída 0.
- Tempo do script por arquivo: de 0,1 s (menor, 0,56 MB) a 15,6 s (maior, 83,8 MB). Soma do lote: cerca de 55 s.
- Pico de memória (RSS máximo do processo Python): de 15 MB a 304 MB.
- Os dois maiores: arquivo T (83,8 MB, 1.468.863 statements, 15,6 s, pico 303,7 MB) e arquivo U (65,0 MB, 1.145.772 statements, 13,3 s, pico 253,1 MB).
- Nenhuma execução foi abortada pela guarda; a fila esperou o typecheck de outro executor no início do lote.

## Anexo: tabelas geradas

### Tabela 1: produtos por classe x arquivo (classes com 20 ou mais produtos)

| classe | A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IFCPIPESEGMENT | 170 | 0 | 419 | 681 | 0 | 469 | 376 | 591 | 393 | 189 | 0 | 0 | 0 | 730 | 568 | 0 | 259 | 0 | 1474 | 0 | 8617 | 196 | 79 | 15211 |
| IFCCABLECARRIERSEGMENT | 232 | 0 | 226 | 349 | 0 | 292 | 212 | 318 | 174 | 4 | 129 | 0 | 917 | 1094 | 326 | 292 | 629 | 80 | 1285 | 5985 | 0 | 133 | 120 | 12797 |
| IFCPIPEFITTING | 119 | 0 | 286 | 419 | 0 | 324 | 256 | 407 | 272 | 118 | 0 | 0 | 0 | 237 | 332 | 0 | 174 | 0 | 938 | 0 | 5665 | 116 | 50 | 9713 |
| IFCJUNCTIONBOX | 149 | 0 | 130 | 114 | 0 | 181 | 93 | 132 | 91 | 40 | 68 | 0 | 495 | 217 | 240 | 163 | 178 | 49 | 522 | 3828 | 0 | 36 | 63 | 6789 |
| IFCLIGHTFIXTURE | 99 | 0 | 76 | 215 | 0 | 104 | 105 | 171 | 74 | 43 | 56 | 0 | 406 | 846 | 73 | 126 | 265 | 30 | 707 | 1591 | 0 | 88 | 56 | 5131 |
| IFCSANITARYTERMINAL | 62 | 0 | 97 | 128 | 0 | 96 | 83 | 131 | 77 | 47 | 0 | 0 | 0 | 72 | 133 | 0 | 99 | 0 | 267 | 0 | 2721 | 38 | 35 | 4086 |
| IFCVALVE | 9 | 0 | 34 | 45 | 0 | 39 | 32 | 44 | 32 | 10 | 0 | 0 | 0 | 11 | 50 | 0 | 15 | 0 | 128 | 0 | 547 | 17 | 3 | 1016 |
| IFCFLOWSEGMENT | 24 | 0 | 22 | 0 | 0 | 0 | 0 | 25 | 0 | 0 | 0 | 499 | 0 | 41 | 0 | 0 | 147 | 0 | 0 | 2 | 0 | 0 | 0 | 760 |
| IFCWASTETERMINAL | 7 | 0 | 23 | 28 | 0 | 21 | 14 | 32 | 18 | 17 | 0 | 0 | 0 | 118 | 40 | 0 | 17 | 0 | 77 | 0 | 284 | 15 | 3 | 714 |
| IFCOPENINGELEMENT | 0 | 601 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 601 |
| IFCFIRESUPPRESSIONTERMINAL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 432 | 0 | 0 | 121 | 0 | 0 | 0 | 0 | 0 | 0 | 553 |
| IFCCABLESEGMENT | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | 511 | 1 | 0 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 521 |
| IFCBEAM | 0 | 119 | 0 | 0 | 313 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 432 |
| IFCDISTRIBUTIONFLOWELEMENT | 0 | 0 | 0 | 51 | 0 | 3 | 5 | 20 | 3 | 2 | 0 | 0 | 0 | 73 | 24 | 0 | 1 | 0 | 19 | 0 | 161 | 9 | 0 | 371 |
| IFCBUILDINGELEMENTPROXY | 4 | 0 | 12 | 19 | 0 | 2 | 2 | 1 | 3 | 0 | 0 | 11 | 2 | 13 | 6 | 0 | 41 | 1 | 71 | 73 | 0 | 1 | 0 | 262 |
| IFCFLOWFITTING | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 256 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 256 |
| IFCFLOWTERMINAL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 218 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 218 |
| IFCELECTRICDISTRIBUTIONBOARD | 2 | 0 | 3 | 2 | 0 | 3 | 3 | 3 | 3 | 3 | 1 | 0 | 8 | 4 | 7 | 3 | 5 | 1 | 9 | 130 | 0 | 2 | 1 | 193 |
| IFCCOLUMN | 0 | 35 | 0 | 0 | 144 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 179 |
| IFCPROTECTIVEDEVICE | 0 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 1 | 1 | 0 | 0 | 1 | 159 | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | 168 |
| IFCFLOWMETER | 1 | 0 | 3 | 3 | 0 | 3 | 3 | 3 | 3 | 3 | 1 | 0 | 1 | 1 | 3 | 1 | 1 | 0 | 4 | 1 | 98 | 1 | 0 | 134 |
| IFCBURNER | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8 | 0 | 96 | 0 | 0 | 109 |
| IFCFOOTING | 0 | 30 | 0 | 0 | 72 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 102 |
| IFCSLAB | 0 | 40 | 0 | 0 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 90 |
| IFCCABLECARRIERFITTING | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 81 | 0 | 0 | 8 | 0 | 0 | 0 | 89 |
| IFCSTACKTERMINAL | 0 | 0 | 0 | 11 | 0 | 5 | 4 | 6 | 4 | 5 | 0 | 0 | 0 | 4 | 12 | 0 | 0 | 0 | 18 | 0 | 8 | 1 | 0 | 78 |
| IFCBUILDINGSTOREY | 1 | 5 | 3 | 2 | 2 | 4 | 4 | 3 | 3 | 3 | 1 | 2 | 6 | 3 | 3 | 2 | 3 | 1 | 3 | 8 | 9 | 2 | 1 | 74 |
| IFCDUCTFITTING | 0 | 0 | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 43 | 0 | 0 | 0 | 0 | 0 | 0 | 59 |
| IFCTANK | 0 | 0 | 4 | 1 | 0 | 1 | 2 | 4 | 1 | 1 | 0 | 0 | 0 | 2 | 3 | 0 | 0 | 0 | 7 | 0 | 14 | 2 | 0 | 42 |
| IFCEVAPORATOR | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 31 |
| IFCCONDENSER | 0 | 0 | 6 | 0 | 0 | 0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 31 |
| IFCBUILDING | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 23 |
| IFCSITE | 1 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 22 |
| IFCINTERCEPTOR | 0 | 0 | 1 | 1 | 0 | 2 | 2 | 2 | 1 | 1 | 0 | 0 | 0 | 0 | 4 | 0 | 2 | 0 | 5 | 0 | 0 | 0 | 1 | 22 |
| IFCPUMP | 0 | 0 | 0 | 2 | 0 | 1 | 2 | 1 | 2 | 0 | 0 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 7 | 0 | 3 | 0 | 1 | 22 |

Classes com menos de 20 produtos (somadas, 8 classes): 59 produtos.

### Tabela 2: altura relativa ao pavimento (m), p50 por arquivo, por classe

| classe | arquivos com a classe | faixa do p50 entre arquivos (m) | produtos |
|---|---|---|---|
| IFCPIPESEGMENT | 15 | 0.03 a 4.00 | 15211 |
| IFCCABLECARRIERSEGMENT | 19 | 1.01 a 4.26 | 12797 |
| IFCPIPEFITTING | 15 | 0.03 a 0.81 | 9713 |
| IFCJUNCTIONBOX | 19 | 0.38 a 2.27 | 6789 |
| IFCLIGHTFIXTURE | 19 | 1.88 a 4.32 | 5131 |
| IFCSANITARYTERMINAL | 15 | 0.50 a 0.53 | 4086 |
| IFCVALVE | 15 | 0.35 a 1.84 | 1016 |
| IFCFLOWSEGMENT | 7 | 0.15 a 3.56 | 760 |
| IFCWASTETERMINAL | 15 | -0.08 a 0.05 | 714 |
| IFCFIRESUPPRESSIONTERMINAL | 2 | 4.00 a 4.02 | 553 |
| IFCCABLESEGMENT | 10 | 0.00 a 1.27 | 521 |
| IFCBEAM | 2 | -0.40 a 0.00 | 432 |
| IFCDISTRIBUTIONFLOWELEMENT | 12 | -1.45 a 4.01 | 371 |
| IFCBUILDINGELEMENTPROXY | 16 | -0.37 a 3.17 | 262 |
| IFCFLOWFITTING | 1 | 0.38 a 0.38 | 256 |
| IFCFLOWTERMINAL | 1 | 3.62 a 3.62 | 218 |
| IFCELECTRICDISTRIBUTIONBOARD | 19 | 0.45 a 1.53 | 193 |
| IFCCOLUMN | 2 | -3.15 a 0.00 | 179 |
| IFCPROTECTIVEDEVICE | 10 | 0.00 a 0.25 | 168 |
| IFCFLOWMETER | 18 | 0.03 a 2.52 | 134 |
| IFCBURNER | 4 | 0.62 a 0.92 | 109 |
| IFCFOOTING | 2 | -1.15 a -0.40 | 102 |
| IFCSLAB | 2 | -0.12 a 0.00 | 90 |
| IFCCABLECARRIERFITTING | 2 | 0.05 a 3.18 | 89 |
| IFCSTACKTERMINAL | 11 | -0.15 a 2.00 | 78 |
| IFCDUCTFITTING | 2 | 2.57 a 3.65 | 59 |
| IFCTANK | 12 | 0.02 a 6.16 | 42 |
| IFCEVAPORATOR | 3 | 2.23 a 2.58 | 31 |
| IFCCONDENSER | 3 | 0.12 a 1.52 | 31 |
| IFCINTERCEPTOR | 11 | 0.00 a 0.00 | 22 |
| IFCPUMP | 10 | 0.06 a 0.83 | 22 |
| IFCAIRTERMINAL | 1 | 2.96 a 2.96 | 13 |
| IFCBOILER | 7 | -0.65 a 1.34 | 10 |
| IFCFILTER | 2 | -0.09 a 2.86 | 7 |
| IFCSWITCHINGDEVICE | 1 | 1.18 a 1.18 | 7 |
| IFCOUTLET | 3 | 1.18 a 1.35 | 5 |
| IFCSTAIR | 1 | -3.15 a -3.15 | 3 |
| IFCFLOWCONTROLLER | 1 | 0.03 a 0.03 | 1 |

### Tabela 3: diametro interno de perfil circular (m), p50 por arquivo, por classe

| classe | arquivos | faixa do p50 (m) | perfis |
|---|---|---|---|
| IFCCABLECARRIERSEGMENT | 19 | 0.021 a 0.053 | 126727 |
| IFCPIPEFITTING | 15 | 0.035 a 0.072 | 47319 |
| IFCPIPESEGMENT | 15 | 0.020 a 0.051 | 25158 |
| IFCSANITARYTERMINAL | 15 | 0.041 a 0.050 | 14626 |
| IFCFLOWSEGMENT | 7 | 0.021 a 0.300 | 5855 |
| IFCVALVE | 15 | 0.026 a 0.036 | 4147 |
| IFCWASTETERMINAL | 15 | 0.055 a 0.624 | 2876 |
| IFCDISTRIBUTIONFLOWELEMENT | 11 | 0.029 a 0.154 | 1497 |
| IFCFIRESUPPRESSIONTERMINAL | 2 | 0.037 a 0.150 | 1269 |
| IFCCABLESEGMENT | 10 | 0.006 a 0.008 | 760 |
| IFCBUILDINGELEMENTPROXY | 15 | 0.026 a 0.079 | 641 |
| IFCBURNER | 4 | 0.019 a 0.030 | 445 |
| IFCFLOWMETER | 10 | 0.026 a 0.042 | 438 |
| IFCSTACKTERMINAL | 11 | 0.055 a 0.055 | 78 |
| IFCEVAPORATOR | 3 | 0.050 a 0.056 | 76 |
| IFCDUCTFITTING | 2 | 0.050 a 0.050 | 68 |
| IFCBOILER | 7 | 0.029 a 0.060 | 68 |
| IFCTANK | 12 | 0.025 a 3.170 | 56 |
| IFCCONDENSER | 3 | 0.038 a 0.057 | 45 |
| IFCPUMP | 10 | 0.044 a 0.272 | 43 |
| IFCAIRTERMINAL | 1 | 0.310 a 0.310 | 38 |
| IFCFILTER | 2 | 0.106 a 0.154 | 28 |
| IFCINTERCEPTOR | 5 | 0.300 a 0.300 | 7 |
| IFCCOLUMN | 1 | 0.300 a 0.300 | 6 |
| IFCJUNCTIONBOX | 1 | 0.026 a 0.026 | 6 |
| IFCCABLECARRIERFITTING | 1 | 0.040 a 0.040 | 2 |

### Tabela 4: entidades de geometria e relacoes (contagem total)

| entidade | total nos 23 arquivos |
|---|---|
| IFCSWEPTDISKSOLID | 0 |
| IFCMAPPEDITEM | 0 |
| IFCREPRESENTATIONMAP | 0 |
| IFCFACETEDBREP | 1616 |
| IFCTRIANGULATEDFACESET | 0 |
| IFCPOLYGONALFACESET | 0 |
| IFCEXTRUDEDAREASOLID | 249138 |
| IFCSPHERE | 26281 |
| IFCPOLYLINE | 16228 |
| IFCCIRCLEPROFILEDEF | 232279 |
| IFCRECTANGLEPROFILEDEF | 14591 |
| IFCDISTRIBUTIONPORT | 0 |
| IFCRELCONNECTSPORTS | 0 |
| IFCRELASSIGNSTOGROUP | 0 |
| IFCDISTRIBUTIONSYSTEM | 0 |
| IFCSYSTEM | 0 |
| IFCZONE | 0 |
| IFCRELDEFINESBYTYPE | 58930 |
| IFCRELCONTAINEDINSPATIALSTRUCTURE | 73 |
| IFCBUILDINGSTOREY | 74 |
| IFCPROPERTYSET | 288017 |
| IFCELEMENTQUANTITY | 0 |
| IFCPROPERTYSINGLEVALUE | 54368 |
| IFCCARTESIANPOINT | 969721 |
