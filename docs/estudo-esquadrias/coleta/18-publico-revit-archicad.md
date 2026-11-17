# Coleta 18: documentação pública sobre esquadrias no Revit e no Archicad

Data da coleta: 2026-11-17.

## Como ler este documento

Cada fato traz uma das marcações abaixo:

- **[LIDO]**: o conteúdo da página foi aberto com WebFetch e o fato foi extraído dela.
- **[TRECHO DE BUSCA]**: o fato veio só do resumo retornado pelo WebSearch. A página não foi aberta, porque o domínio estava bloqueado ou porque não houve tentativa de leitura. Deve ser confirmado antes de uso.

## Bloqueios de rede

Os seguintes domínios falharam com `getaddrinfo ENOTFOUND` neste ambiente. Eles precisam ser liberados nas configurações de rede da sessão para que a coleta seja completada:

| Domínio | Fonte afetada |
|---|---|
| help.autodesk.com | Documentação oficial do Revit (Specify IFC Entities for Families; IFC Parameters, Revit 2026; About Revit and IFC) |
| help.graphisoft.com | Documentação oficial do Archicad (Model Attributes of Wall Opening; Door/Window Listing Parameters; Door/Window Settings and Opening) |
| community.graphisoft.com | Fórum da Graphisoft |
| wiki.osarch.org | Wiki OSArch (Revit setup for OpenBIM) |
| learning.cype.com | Recomendações de modelagem e exportação IFC |
| novedge.com | Dica sobre mapeamento de parâmetros IFC |
| bim-me-up.com | Exportação de parâmetros de tipo para IFC |
| knowledge.openingsstudio.com | Base de conhecimento do Openings Studio |
| sites.google.com | Tutorial de famílias de portas (faidtech) |

Por causa desses bloqueios, a documentação oficial das duas empresas não foi lida. Isso é a principal lacuna do estudo.

## Revit

### Lidos com sucesso

**R1. Issue #160 do exportador IFC de código aberto (Autodesk/revit-ifc).** [LIDO]
- URL: https://github.com/Autodesk/revit-ifc/issues/160
- Título: "Issue with Revit (type) properties not exporting to IFC".
- Versão do Revit relatada: 2020, com exportador 20.1.0.1.
- Problema: ao exportar todas as propriedades do Revit para IFC, algumas propriedades de tipo do grupo Identity Data não aparecem no arquivo. O caso apontado é uma família de porta.
- Resposta de jun/2025 (Artem Hnatko): o comportamento é intencional. Parâmetros com valor vazio ou nulo, de instância ou de tipo, não são exportados, para reduzir o tamanho do arquivo. A recomendação é preencher esses parâmetros com um valor não vazio, como "N/A", "—" ou "0".
- Status: fechada como concluída em 26/06/2025.

**R2. Releases do exportador IFC de código aberto.** [LIDO]
- URL: https://github.com/Autodesk/revit-ifc/releases
- Versão 25.4.3 (Revit 2025), 11 de agosto (ano não exibido na página):
  - "Fixed correct use of Operation Type attributes for Doors for IFC4 and 4x3." Ou seja, correção do uso dos atributos de tipo de operação de portas no IFC4 e no 4x3.
  - "Improved alignment of doors that are slightly off-axis."
  - "Fixed unexpected errors while exporting door elements to the IFC file at Doors-Shaft."
  - "Updated IfcDoorTypeOperationEnum for 4x3 to fix warnings during export to IFC."
- Versão 27.3.0.12 (Revit 2027), 13 de agosto (ano não exibido):
  - "Fixed doors within assemblies being vertically displaced."
  - Correção de portas deslocadas ao importar IFC gerado por outros aplicativos.
- Não há menção, na página, a janelas, painéis (panel), lining, IfcDoorPanelProperties, IfcDoorLiningProperties, IfcWindowPanelProperties ou IfcWindowLiningProperties.

**R3. Página do repositório do exportador IFC de código aberto.** [LIDO]
- URL: https://github.com/Autodesk/revit-ifc
- O código cobre o IFC para Revit 2019 e posteriores, incluindo Revit LT, e para Navisworks (2019 a 2024).
- A página não lista as entidades de esquadrias suportadas. Para isso, seria preciso consultar o código-fonte.

### Apenas trechos de busca (não lidos)

**R4. Mapeamento de família para classe IFC por parâmetros compartilhados.** [TRECHO DE BUSCA]
- URL indicada: https://help.autodesk.com/cloudhelp/2023/ENU/Revit-DocumentPresent/files/GUID-7119A8C3-A0EE-4568-8C35-750410D867C9.htm (página "Specify IFC Entities for Families").
- Segundo o trecho, existem os parâmetros compartilhados IFCExportAs e IFCExportType, no grupo IFC Parameters da família. Ao exportar, os elementos da família são mapeados para a classe e o tipo IFC indicados.
- Segundo o trecho da versão 2018, ao adicionar esses parâmetros a um tipo, o Revit os adiciona automaticamente a todos os tipos da família.
- Tentativa de leitura: falhou por bloqueio de rede.

**R5. Parâmetro "Operation" de janelas.** [TRECHO DE BUSCA]
- URL indicada: https://help.autodesk.com/cloudhelp/2026/ENU/Revit-ArchDesign/files/GUID-1C03B7DF-89EE-48B1-B501-571745B1D513.htm
- Segundo o trecho, o grupo IFC Parameters tem um campo Operation, com valores como single_panel ou triple_panel_horizontal, sem diferenciar maiúsculas e minúsculas e com underscore opcional.
- Tentativa de leitura: falhou por bloqueio de rede.

**R6. Painéis de janela gerando IfcWindowPanelProperties.** [TRECHO DE BUSCA]
- Fonte indicada: post de usuário no SourceForge (https://sourceforge.net/u/aparrella). Não foi lido.
- Segundo o trecho, adicionar parâmetros de instância a cada painel fez o exportador gerar IfcWindowPanelProperties. Esse relato é sobre janelas, não sobre portas.

**R7. Problema de sentido de abertura entre Revit e Archicad.** [TRECHO DE BUSCA]
- URL indicada: https://community.graphisoft.com/t5/Data-Exchange-articles/Revit-to-Archicad-Exchange-Door-Swing-Issue/ta-p/336721
- Tentativa de leitura: falhou por bloqueio de rede.

**R8. Porta com várias aberturas exportando incorretamente.** [TRECHO DE BUSCA]
- Segundo o trecho de fórum, uma família de porta com várias aberturas de parede exportou de forma incorreta. A solução de suporte foi manter uma abertura por família de porta.
- Fonte indicada: https://forums.autodesk.com/t5/revit-architecture-forum/revit-does-not-export-correct-wall-opening-to-ifc/m-p/9562208. Não foi lido.

**R9. Propriedades personalizadas compartilhadas não exportadas.** [TRECHO DE BUSCA]
- Artigo de suporte da Autodesk: https://autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/CHS/Custom-shared-parameters-not-exported-as-IFC-properties-on-export-to-IFC-from-Revit.html
- Segundo o trecho, parâmetros compartilhados personalizados atribuídos a uma família específica não eram exportados para IFC. O trecho diz que o problema foi resolvido no Revit 2022. Não foi lido.

### Lacunas do Revit

- **Lining e Panel Properties para portas**: não encontrados. A busca não retornou página que mapeie os conjuntos IfcDoorLiningProperties e IfcDoorPanelProperties a parâmetros do Revit. A documentação oficial, que deveria cobrir isso, estava bloqueada.
- **Tipos de forma (arco, ogival, círculo)** no Revit: não pesquisados nesta coleta.
- **Quadros de esquadrias (tabelas de agendamento)** no Revit: não pesquisados nesta coleta.

## Archicad

### Lidos com sucesso

**A1. Porta e janela não tiveram páginas da documentação lidas.** [LIDO, sem fato útil]
- As tentativas de leitura das páginas da Graphisoft falharam por bloqueio de rede. Não há fato do Archicad com marcação [LIDO] nesta coleta.

### Apenas trechos de busca (não lidos)

**A2. Model Attributes of Wall Opening, Masonry Arch.** [TRECHO DE BUSCA]
- URL indicada: https://help.graphisoft.com/AC/25/INT/_AC25_Help/150-1_DoorWindowCustomSettings/150-1_DoorWindowCustomSettings-23.htm (e equivalentes para AC 21, 22, 24, 26 e 29).
- Segundo o trecho, na seção Wall Opening do painel Custom Settings de portas e janelas existe a aba Model Attributes, usada para definir os atributos 3D do arco de alvenaria (Masonry Arch), quando houver.
- Tentativa de leitura: falhou por bloqueio de rede.

**A3. Split is Curved.** [TRECHO DE BUSCA]
- Segundo o trecho, o controle Hole Surface, Split is Curved, divide as superfícies ao longo de um arco, em GDL. A fonte é a mesma página de Custom Settings, não lida.
- Este trecho sugere que existe controle de abertura curva, mas não confirma a lista de formas (arco, ogival, círculo).

**A4. Parâmetros de listagem de portas e janelas.** [TRECHO DE BUSCA]
- URL indicada: https://help.graphisoft.com/SOLO/22/INT/_AC22_Help/060_ElementParameters/060_ElementParameters-10.htm (Door/Window Listing Parameters).
- Segundo o trecho, a lista inclui:
  - dimensões de egress (somente portas), definidas em Door Settings;
  - orientação;
  - dimensões de reveal;
  - dimensões de wallhole, vindas das configurações de vão;
  - sill height (altura do peitoril ou da soleira), medida a partir do pavimento-base da parede hospedeira.
- Tentativa de leitura: falhou por bloqueio de rede.

**A5. Adicionar campos de Library Part Parameters ao schedule.** [TRECHO DE BUSCA]
- Fonte indicada: https://community.graphisoft.com/t5/Project-data-BIM/Missing-Window-Door-Parameters/m-p/711523 (não lida, bloqueada).
- Segundo o trecho, em Scheme Settings, o botão Add Fields dá acesso a Library Part Parameters. Parâmetros que não aparecem na lista padrão podem ser incluídos a partir do objeto de biblioteca, por exemplo "Window 24". Essas janelas são baseadas em subtipos definidos pela Graphisoft.
- Segundo o trecho, também é possível criar um parâmetro personalizado no Library Editor e listá-lo no schedule.

**A6. Soma de quantidades em schedules.** [TRECHO DE BUSCA]
- Segundo o trecho de fórum, quando há várias portas ou janelas idênticas no schedule, o Archicad soma largura e altura. A solução citada é listar os parâmetros unitários de largura e altura do objeto.
- Fonte indicada: https://community.graphisoft.com/t5/Project-data-BIM/Door-Window-schedules-Wallhole-size-vs-unit-size/m-p/267346 (não lida).

### Lacunas do Archicad

- **Formas de abertura (arco, ogival, círculo)** no Door/Window tool: não confirmadas. A busca encontrou apenas a página de arco de alvenaria, sem a lista de formas. Não é possível afirmar quais formas existem nem quais parâmetros as controlam.
- **Parâmetros de forma do objeto de porta** (biblioteca INT): não confirmados.
- **Quadros de esquadrias** no Archicad: as listagens citadas acima (A4 a A6) são o único indício. Não há documentação lida.

## Resumo para o estudo de esquadrias

Fatos com maior grau de confiança, todos [LIDO]:

1. O exportador IFC de código aberto do Revit trata propriedades de tipo com valor vazio ou nulo como não exportadas, e recomenda preencher com valor não vazio (R1).
2. Versões recentes do exportador corrigiram o uso de IfcDoorTypeOperationEnum e os atributos de operação de portas para IFC4 e 4x3 (R2).
3. O repositório declara suporte a Revit 2019 e posteriores, incluindo Revit LT (R3).

Fatos citados por busca e ainda a confirmar:

1. IFCExportAs e IFCExportType como parâmetros compartilhados para mapeamento IFC (R4).
2. O campo Operation de janelas, com valores como single_panel (R5).
3. Archicad: arco de alvenaria em Model Attributes, parâmetros de listagem (sill height, wallhole, egress) e Library Part Parameters em Add Fields (A2, A4, A5).

Não foram encontrados fatos confiáveis sobre Lining e Panel Properties de portas no Revit, nem sobre formas de abertura em arco, ogiva ou círculo em nenhum dos dois programas.

## Próximo passo recomendado

Liberar help.autodesk.com, help.graphisoft.com e community.graphisoft.com nas configurações de rede da sessão, e repetir a leitura das páginas listadas em "Bloqueios de rede". A prioridade é a página Specify IFC Entities for Families (R4) e a página Model Attributes of Wall Opening (A2).
