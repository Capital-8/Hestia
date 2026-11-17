# A7 — Evidência de projetos reais (esquadrias)

Estudo de esquadrias do Hestia (BIM, mercado brasileiro). Data da coleta: 2026-11-17.
Convenção: **[V]** = verificado (medido por script nos arquivos baixados, ou lido literalmente da fonte); **[I]** = inferido / de segunda mão (resumo de busca, sem acesso ao documento).

## 0. Resumo executivo

1. **[V]** Em 5 modelos arquitetônicos IFC reais (Revit/ArchiCAD/outros; 804 portas e 761 janelas, sem contar a duplicata do Clinic) **99,6% dos vãos com esquadria são retangulares**: de 922 aberturas (`IfcOpeningElement`) que têm `IfcRelFillsElement`, só **4 (0,4%)** não são retângulo — todas no Schependomlaan (janelas "merk J" de empena). Zero arcos em vão de porta ou janela.
2. **[V]** Arcos/curvas existem nos modelos, mas **nunca como vão de esquadria**: aparecem em recortes de bancada (furo de pia, Duplex) e em recortes de parede (Clinic). Perfil composto com `IfcTrimmedCurve` sobre `IfcCircle` é como o Revit exporta curva em perfil de abertura.
3. **[V]** A **geometria da própria esquadria** raramente é paramétrica no IFC: Esplanades, Schependomlaan e Molio (3 de 5) exportam portas/janelas 100% como `IfcFacetedBrep`/`IfcShellBasedSurfaceModel` (malha). Só Duplex e Clinic (Revit 2011) usam extrusão (retângulo + polilinha arbitrária).
4. **[V]** Dimensões são muito concentradas: porta de folha simples = 1 a 3 tamanhos cobrem 72-87% do modelo (910x2130, 1000x2100). Janelas são mais dispersas (Esplanades: 12 tamanhos distintos; 2 cobrem 69%).
5. **[V]** `OverallWidth/OverallHeight` ausentes em 49% das portas e 74% das janelas do Schependomlaan: o consumidor não pode confiar neles; precisa cair para o Box/BoundingBox ou para o vão.
6. **[V]** `OperationType` é mal preenchido: 85% das portas do Schependomlaan = `NOTDEFINED`; 31% das janelas do Esplanades = `USERDEFINED`; janelas do Duplex/Clinic 100% `NOTDEFINED`.
7. **Não obtido**: nenhum quadro de esquadrias brasileiro real foi lido (hosts `*.gov.br`, `caixa.gov.br`, `aecweb`, `bimobject`, `cbic.org.br` bloqueados pelo proxy: ver seção 3). Seção 3 e 4 são **[I]**.

## 1. Método (IFC)

- Download via `git clone --filter=blob:none --sparse` + `media.githubusercontent.com` (arquivos estão em Git LFS; `curl` direto em `raw.githubusercontent` retorna só o ponteiro de 130 bytes). `api.github.com` e a API MCP do GitHub estavam bloqueados para esses repositórios.
- Arquivos tratados como dados não confiáveis, em `/tmp/claude-0/-home-user/downloads-a7/`; nunca executados. Parsing com `ifcopenshell 0.9.0.post1` (`pip`), scripts em `/tmp/claude-0/-home-user/scripts-a7/` (`an.py`, `op3.py`, `ps.py`), rodados com `python3 -I`.
- Contagem de `IfcDoor`/`IfcWindow`; tipo pelo `IfcRelDefinesByType`; `OperationType`/`PartitioningType` da instância ou do tipo (IFC4) ou do atributo `OperationType`/`PredefinedType` (IFC2x3 já traz `OperationType` no IfcDoorStyle/IfcWindowStyle: o script lê da instância, então valores de IFC2x3 vêm via atributo do próprio elemento quando existe); dimensões `OverallWidth x OverallHeight` arredondadas a 10 mm; representação: percorre `IfcMappedItem` e classifica item (`IfcExtrudedAreaSolid` + tipo de perfil, Brep, etc.); aberturas: para cada `IfcOpeningElement` com `HasFillings`, classifica o perfil (retângulo paramétrico, polilinha retangular testada por ortogonalidade, polilinha não retangular, curva composta).
- Limitação: a classificação de forma do vão **não foi feita** no Molio (aberturas = `IfcBoundingBox`+Brep) nem no BuildingBIMModel (`IfcIndexedPolyCurve`, não decodificado). A forma da folha em Brep também não foi testada.

### Fontes IFC baixadas

| ID | Modelo | Origem / URL | Schema | Autor/ferramenta (header) |
|---|---|---|---|---|
| duplex | Duplex Apartment (Duplex_A_20110907.ifc, 2,4 MB) | https://github.com/buildingsmart-community/Community-Sample-Test-Files (pasta `IFC 2.3.0.1 (IFC 2x3)/Duplex Apartment/`) | IFC2X3 | Revit Architecture 2011 |
| clinic | Medical-Dental Clinic, Clinic_Architectural.ifc (13 MB) | mesmo repositório, `Medical-Dental Clinic/` | IFC2X3 | Revit Architecture 2011 (otimizado Solibri), famílias `M_*` |
| esplanades | Esplanades, 1807_EP_AR_v18.ifc (12 MB) | mesmo repositório, `Esplanades/` | IFC2X3 | ArchiCAD 22 (header), Tallinna Linnavaraamet, psets em estoniano |
| schep | Schependomlaan, IFC Schependomlaan.ifc (49 MB) | mesmo repositório, `Schependomlaan/Design model IFC/` | IFC2X3 | autoria ROOT bv, pré-processado EDM 5.0; ferramenta de origem não declarada no header [I: Revit, pelo estilo de nomes] |
| molio | Molio_with_URIs.ifc (74 MB) | mesmo repositório, `Molio/` | IFC2X3 | ArchiCAD 25 (header) |
| bbm | BuildingBIMModel.ifc | https://github.com/viktor-platform/ifc-sample-models | IFC4 | Mesmo projeto Clinic reexportado (mesmos tipos `M_Single-Flush`): **excluído dos totais** |
| ioh | IfcOpenHouse.ifc | https://github.com/cvillagrasa/IfcOpenHouse | IFC4 | gerado por script (IfcOpenShell) |
| wallwin | wall-with-opening-and-window.ifc | buildingSMART Sample-Test-Files / Community, `ISO Spec archive` | IFC4 | exemplo mínimo |

Tentados e **sem porta/janela** (verificado): `Building-Architecture.ifc` do buildingSMART Sample-Test-Files (IFC4, 0 IfcDoor/IfcWindow); `SampleBuilding.ifc`, `SampleBimModelWebinar.ifc` (viktor, só aberturas).
**Não localizados/baixados**: Seestrasse, Haus Z, Hitos, Technical School, AC20-FZK-Haus: não estão nos repositórios acessíveis e o host `ifcwiki.org` retornou 403 do proxy. Nada foi inventado sobre eles.

## 2. Resultados IFC

### 2.1 Contagens [V]

| Modelo | IfcDoor | IfcWindow | Aberturas | Aberturas com preenchimento | Tipos de porta distintos | Tipos de janela distintos |
|---|---:|---:|---:|---:|---:|---:|
| duplex | 14 | 24 | 50 | 38 | 4 | 5 |
| clinic | 254 | 58 | 403 | 302 | 13 | 1 |
| esplanades | 211 | 297 | 603 | 508 | 6 | 5 |
| schep | 205 | 259 | 79 | 74 | 10 | 7 |
| molio | 119 | 119 | 245 | 238 | 5 | 2 |
| ioh | 1 | 3 | 4 | 4 | 0 (sem tipo) | 0 |
| wallwin | 0 | 1 | 1 | 1 | – | 1 |
| **Total (sem bbm)** | **804** | **761** | 1384 | 1165 | | |

(bbm, só para referência: 100 portas, 24 janelas, 129 aberturas, 107 com preenchimento.)
Observação: `IfcCurtainWall` = 31 no Clinic (34 no bbm); portas "Curtain Wall Sgl/Dbl Glass" (12 no Clinic) são **portas dentro de parede-cortina modeladas como IfcDoor**. Nenhum modelo usa `IfcBuildingElementProxy` com nome de porta/janela.

### 2.2 Distribuição de dimensões (OverallWidth x OverallHeight, mm) [V]

**Portas**

| Modelo | Tamanhos (qtd) | Concentração |
|---|---|---|
| duplex (14) | 860x2030 (6); 760x2030 (4); 1250x2010 (2); 810x2420 (2) | 4 tamanhos |
| clinic (254) | 910x2130 (222); 870x1500 (7, divisória de sanitário); 1830x2130 (5); 920x2130 (5); 900x2320 (4); 2700x1960 (4); 1220x2130 (2); 1800x2330 (2); 1730x2130, 1000x2130, 860x1500 (1 cada) | 910x2130 = **87,4%** |
| esplanades (211) | 1000x2100 (168); 900x2100 (10); 2200x2500 (10); 800x2100 (7); 1450x2180 (5); 1000x2500 (2); 2000x2500 (2); 1600x2500 (2); 1870x2500 (2); 1450x2500, 1450x2100, 1880x2100 (1 cada) | 1000x2100 = **79,6%**; larguras 800/900/1000 = 87,7% |
| molio (119) | 910x2100 (86); 1010x2100 (22); 1810x2100 (10); 2955x2400 (1) | 910x2100 = **72,3%**; top-2 = 90,8% |
| schep (104 com dimensão de 205) | 930x2620 (62); 1016x2640 (7); 680x2620 (6); 1715x2466 (4); 1715x2688 (4); 630x2620 (4); resto 1-2 cada (12 tamanhos) | 930x2620 = 59,6% dos 104; **18 tamanhos distintos** |

Altura de porta residencial/comercial: 2100-2134 mm (EUA/Dinamarca/Estônia) a 2620 mm (Países Baixos, altura de vão até o forro) — **não há um único "2,10 m"**, a altura do vão acompanha pé-direito local.

**Janelas**

| Modelo | Tamanhos (qtd) |
|---|---|
| duplex (24) | 820x760 (12); 750x2200 (4); 2800x2410 (4); 4830x2420 (2, claraboia); 1170x630 (2) |
| clinic (58) | 1000x1730 (58), tipo único `M_Fixed 1735 x 1000` |
| esplanades (297) | 700x2000 (112); 2300x2000 (93); 1000x2000 (21); 700x1325 (20); 1870x1325 (16); 600x1325 (16); 2850x1325 (10); 1300x2500 (2); 600x2500 (2); 2000x2000 (2); 1200x1200 (2); 2550x1500 (1) |
| molio (119) | 1812x1479 (89); 1800x1479 (10); 1812x3012 (8); 508x2400 (2); 1800x3012 (2); 1032x5200 (2); 1812x2991 (2); 3972x612 (1); 1032x4533, 1032x3800, 1032x3133 (1 cada) |
| schep (67 com dimensão de 259) | 1210x1850 (27); 1210x1330 (13); 940x1760 (5); 778x1790 (4); 1715x1866 (4); 916x1742 (4); 900x1500 (4); 1210x1790 (3); 916x1760 (3) |

Largura/altura de janela: mediana por modelo 700-1210 mm de largura; máximos 2850 mm (esplanades), 4830 mm (duplex, claraboia), **1032x5200 no Molio (esquadria de 5,2 m de altura)**. Em 4 de 5 modelos, ≥ 2 tamanhos cobrem ≥ 69% das janelas. [V] para os números; a leitura "poucos tamanhos dominam" é interpretação.

### 2.3 OperationType / PartitioningType [V]

IFC2x3 (instância): Duplex portas: `SINGLE_SWING_RIGHT` 8, `SINGLE_SWING_LEFT` 6. Clinic portas: RIGHT 127, LEFT 115, `DOUBLE_DOOR_SINGLE_SWING` 8, `NOTDEFINED` 4. Esplanades portas: LEFT 99, RIGHT 88, `USERDEFINED` 11 (sidelight), `DOUBLE_DOOR_SINGLE_SWING` 7, `SLIDING_TO_RIGHT` 5, `DOUBLE_DOOR_SLIDING` 1. Molio portas: LEFT 70, RIGHT 29, DOUBLE_SINGLE_SWING 10, `DOUBLE_DOOR_SLIDING` 8, `REVOLVING` 1, USERDEFINED 1. Schep portas: `NOTDEFINED` **175/205 (85%)**, DOUBLE_SINGLE_SWING 9, USERDEFINED 8, LEFT 7, RIGHT 6.
Janelas: Esplanades `DOUBLE_PANEL_HORIZONTAL` 159, `USERDEFINED` 93, `SINGLE_PANEL` 43; Molio `DOUBLE_PANEL_VERTICAL` 63, `SINGLE_PANEL` 56; Schep `NOTDEFINED` 196, `SINGLE_PANEL` 59, DOUBLE_PANEL_VERTICAL 4; Duplex e Clinic: 100% `NOTDEFINED` (nome da família "M_Fixed", "M_Casement" carrega a informação real).
IFC4 (PredefinedType/PartitioningType): bbm portas `DOOR` 100, OperationType por instância (RIGHT 36, LEFT 33, NOTDEFINED 23, DOUBLE_SINGLE 7, `DOUBLE_SWING_RIGHT` 1); janelas `WINDOW` 24, partitioning `NOTDEFINED` 24; IfcOpenHouse: `SINGLE_PANEL` 2, `TRIPLE_PANEL_VERTICAL` 1.

Leitura [inferido]: o enum IFC não é suficiente para tipologia brasileira (maxim-ar, basculante, pivotante, camarão, projetante, correr 2/3/4 folhas): em dados reais ele vem vazio/`USERDEFINED` em 31-100% dos casos de janela. A tipologia precisa ser dado próprio do Hestia, e o IFC exportado deve ser tratado como projeção com perda.

### 2.4 Forma das esquadrias e dos vãos

**Representação do corpo da esquadria [V]**
- Brep/malha apenas (sem extrusão paramétrica): esplanades 508/508 (100%), molio 238/238 (100%), schep 464/464 (100%; mais um `IfcBoundingBox` de apoio).
- Extrusão: duplex 100% das portas e 22/24 das janelas (2 claraboias = `IfcFaceBasedSurfaceModel`); clinic 248/254 portas (os 6 restantes = face set; são as `Curtain Wall Dbl Chain Link`) e 58/58 janelas. Em ambos, o corpo = `IfcExtrudedAreaSolid` com `IfcRectangleProfileDef` **mais** extrusões com `IfcArbitraryClosedProfileDef` (folha, moldura, painel) — polilinha com 7 ou mais pontos para a porta Revit típica (moldura em L/guarnição), 4 pontos para a janela.
- Consequência para o Hestia [inferido]: na importação, forma não retangular **não é detectável pela representação da esquadria** em 3 de 5 modelos (só malha); só o vão (`IfcOpeningElement`) e o tipo carregam a pista.

**Vãos (IfcOpeningElement) [V]**

| Modelo | Aberturas com preenchimento | Retângulo paramétrico (`IfcRectangleProfileDef`) | Polilinha retangular | Não retangular |
|---|---:|---:|---:|---:|
| duplex | 38 | 38 | 0 | **0** |
| clinic | 302 | 302 | 0 | **0** |
| esplanades | 508 | 508 | (92 itens em polilinha de 4 pontos, retangulares, mapeados no mesmo vão) | **0** |
| schep | 74 | 65 | 5 (portas) | **4** (janelas) |
| molio | 238 | não classificado (BoundingBox + Brep) | | n/d |

Total classificado: 922 vãos, 4 não retangulares = **0,43%**. **Zero com arco.**
Os 4 casos de Schependomlaan: janelas "merk J" / "merk Jsp", `OverallWidth x Height` declarado = 900x1500, mas o perfil do vão é uma polilinha de 5 pontos `(464.7, 2637), (-765.0, 0), (765.0, 0), (765.0, 2637), (464.7, 2637)`, ou seja, **um trapézio/"pentágono" de empena** (≈1530 mm de base, 2637 mm de altura) que não bate com as dimensões declaradas e é possivelmente auto-intersectante (ponto 1 = ponto 5, lado esquerdo cruza). **Caso-limite real**: (a) forma inclinada em janela, (b) dimensão nominal do IFC inconsistente com o vão real, (c) perfil possivelmente inválido que o importador precisa tolerar.

**Perfis curvos em outros recortes (não são esquadrias) [V]**
- Duplex: 2 aberturas `M_Counter Top w Sink Hole` com `IfcCompositeCurve` (4 `IfcPolyline` + 4 `IfcTrimmedCurve` de `IfcCircle`, ou seja, retângulo de cantos arredondados), profundidade 40 mm; sem preenchimento.
- Clinic: 36+2 aberturas com o mesmo padrão composto (sem preenchimento; nome `None`, profundidade 572 mm) e 18 `IfcArbitraryClosedProfileDef` triangulares/pentagonais, todos em paredes (`Basic Wall:...`) com `HasFillings` vazio: recortes de topo de parede (telhado inclinado).
- Padrão de exportação de arco no Revit/IFC2x3 [V no arquivo]: `IfcTrimmedCurve` sobre `IfcCircle`, `IfcParameterValue` em **graus** (ex.: 270 a ~0, 61,83 a 118,17).

### 2.5 Parâmetros que os modelos expõem (psets) [V]

Revit (Clinic), por porta (254): `Pset_DoorCommon` só `FireRating`, `IsExternal`, `Reference`; o resto vem de psets `PSet_Revit_*`: **Sill Height, Head Height, Width, Height, Thickness, Trim Projection Ext/Int, Trim Width, Wall Closure, Function, Construction Type, Door Material, Frame Material, Glazing Material, Fire Rating, Mark, Type Mark, Manufacturer, OmniClass**; janelas: **Default Sill Height, Window Inset, Frame Exterior/Interior Material, Glass Pane Material, Sash, ConfigurationType**. ~30 campos de gestão (`WarrantyDuration*`, `BarCode`, `AssetIdentifier`...) existem em 100% dos elementos e estão vazios por padrão.
ArchiCAD (Esplanades): `Door Lining Properties` (LiningDepth/Thickness/Offset, CasingDepth/Thickness), `Door Panel Properties - Panel N` (PanelDepth, PanelWidth, PanelPosition, **PanelOperation**), `Window Lining Properties` (**FirstTransomOffset, TransomThickness**), `Window Panel Properties - Panel N` (**OperationType, PanelPosition, FrameDepth/Thickness**), `Pset_*Common` com `AcousticRating`, `ThermalTransmittance`, `GlazingAreaFraction`, `IsExternal`. Mostra modelo **multi-painel** (Panel 1, Panel 2) com operação por painel; em Esplanades 8 portas têm 2 painéis e 159 janelas têm 2 painéis.

## 3. Quadros de esquadrias e projetos brasileiros [I]

**Não consegui baixar nenhum documento brasileiro.** O proxy bloqueou (`CONNECT tunnel failed 403` / `ENOTFOUND`): `ses.saude.sp.gov.br`, `guacui.es.gov.br`, `canoas.rs.gov.br`, `goias.gov.br`, `jau.sp.gov.br`, `pbqp-h.mdr.gov.br`, `prefeitura.pbh.gov.br`, `orse.cehop.se.gov.br`, `caixa.gov.br`, `lume.ufrgs.br`, `ric.cps.sp.gov.br`, `aecweb.com.br`, `bimobject.com`, `al.al.leg.br`. Para continuar seria preciso liberar esses hosts em Settings > Environment > Network. Abaixo, só o que apareceu em **resumos de busca** (não li os documentos; tratar como pista):

| Fato | Fonte (URL de busca) | Status |
|---|---|---|
| Quadro de esquadrias referenciado em edital: material, dimensões e acabamento "indicados em projeto e no quadro de esquadrias (janelas e portas)"; dimensões "confirmadas no local" | Banrisul pregão, https://pregaobanrisul.com.br/anexos/850707-6c4aa8bb9e57ef1583b020e9025963a20041d909c416170994e42e2ab9466475 | [I] |
| Folga e posição da esquadria no vão definidas entre contratante e fabricante / manual / projeto da esquadria | SUDECAP-PBH, cap. 13, https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/sudecap/normas-padroes/VA-CADERNO/Capitulo13/CAP13-25-07-31.pdf | [I] |
| Edital exige projeto de esquadrias por empresa especialista | Edital 26 GO, https://goias.gov.br/seguranca/wp-content/uploads/sites/56/2018/05/edital-26-anexo-ii-memorial-descritivo-de-arquitetura.pdf | [I] |
| Memorial de arquitetura traz item "Quadro de aberturas" | https://goias.gov.br/inovacao/wp-content/uploads/sites/26/2021/09/Memorialdescritivoarquitetura-361.pdf | [I] |
| Maxim-ar alumínio SINAPI: 60x80 cm (insumo 34381, perfil 25, vidro 4 mm); composição 94569 usa 90x110 cm (A x L) | https://orcamentor.com/insumo/34381/ , https://orcamentor.com/composicao/94569/ , Caderno Técnico SINAPI https://www.caixa.gov.br/Downloads/sinapi-cadernos-tecnicos/SINAPI-CT-ESQUADRIAS-JANELAS.pdf | [I] |
| PBQP-H: maxim-ar 1 folha nominal até 600x600 e até 800x800 mm conforme região e nº de pavimentos | https://pbqp-h.mdr.gov.br/wp-content/uploads/2021/09/PBQP-H-Classificacao-Empresas_RS024.pdf | [I] |
| Memorial AME-Ribeirão Preto: maxim-ar alumínio anodizado, vidro liso 4 mm, limitador de abertura 25 cm | https://ses.saude.sp.gov.br/resources/ses/perfil/cidadao/licitacoes-cga/pmrp-ame-arq-pe-026-063-r01-janelas_e_divisorias-layout1.pdf | [I] |
| Fabricante nacional oferece "esquadrias em arco, semi-arco" como formato especial sob encomenda | AECweb, https://www.aecweb.com.br/produto/esquadrias-especiais/136821 | [I] |
| Porta acessível: vão livre mínimo 0,80 m x 2,10 m (NBR 9050), citada por cartilhas municipais; valores da norma **não** conferidos no texto oficial | https://prefeitura.pbh.gov.br/sites/default/files/estrutura-de-governo/politica-urbana/Cartilha-Acessibilidade%20(2).pdf | [I] |
| Catálogo Técnico de Serviços FDE (2013) citado como fonte do caderno DER-ES; caderno FDE em si não encontrado | https://der.es.gov.br/media/Documentos/Tabela%20Referencial%20de%20Pre%C3%A7o/Referencial%20de%20Edifica%C3%A7%C3%B5es/CADERNO_ESPECIFICACOES/0717-esquadrias-metalicas-esquadrias-metalicas-m2-v2.pdf | [I] |

**Colunas de um quadro de esquadrias, tipologias, dimensões mais usadas e especificação de arcos em projeto brasileiro: não verificado** (nenhum quadro foi lido). A busca por "janela em arco / verga em arco" em memoriais **não retornou nenhum quadro com arco especificado**; só a menção de fabricante acima. O que se pode dizer com segurança: a forma especial não aparece padronizada na documentação pública indexada; ela é especificada em texto livre / projeto de fabricante [I, ausência de evidência, não evidência de ausência].

Próximo passo sugerido: liberar os hosts acima e baixar (i) SUDECAP cap. 12/13, (ii) memorial AME-RP, (iii) CEMEI Guaçuí volume único, (iv) Canoas anexos VI/VIII, (v) Caderno Técnico SINAPI Esquadrias-Janelas e extrair as tabelas por `pdftotext -layout`.

## 4. Bibliotecas de objetos BIM [I]

Também não consegui abrir BIMobject, plataforma BIMbr (ABDI) ou catálogos de fabricantes (hosts bloqueados). Resumo de busca:
- Biblioteca Nacional BIM / BIMbr (ABDI): "Regulamento Técnico da Biblioteca Nacional BIM" define requisitos obrigatórios/recomendados de objetos; propriedades preferencialmente no tipo; nomes de parâmetros nativos podem ser mantidos. https://plataformabimbr.abdi.com.br/docs/Regulamento_Tecnico_Biblioteca_Nacional_BIM.pdf [I, não li]
- CBIC, Guia de Esquadrias para Edificações (2017): desempenho/especificação, não parametrização BIM. https://cbic.org.br/wp-content/uploads/2017/11/Guia_de_Esquadrias_para_Edificacoes_2017.pdf [I]
- Pormade: primeira fabricante brasileira de portas com biblioteca Revit (2015). https://www.baguete.com.br/noticias/pormade-biblioteca-para-revit [I]
- Parâmetros efetivamente observados em famílias reais: ver 2.5 (Revit `M_*` e ArchiCAD), **[V]**, mas são famílias dos EUA/Estônia, não de fabricante brasileiro.

## 5. Casos-limite e implicações para o Hestia

1. **Esquadria em parede-cortina/fachada** modelada como `IfcDoor` ("Curtain Wall Dbl Glass", 2700x1960; 12 no Clinic). [V]
2. **Esquadria muito alta**: 1032x5200 (janela), 1812x3012 (Molio); portas 2500 mm (Esplanades), 2620-2688 mm (Schependomlaan). A altura de vão não é padronizável. [V]
3. **Vão não retangular com dimensão nominal incompatível** (Schep "merk J": nominal 900x1500, vão trapezoidal ≈1530x2637). Importador deve preferir o perfil do vão e sinalizar divergência. [V]
4. **Claraboia** como `IfcWindow` com `IfcFaceBasedSurfaceModel`, 4830x2420 (Duplex). [V]
5. **Portas com bandeira/sidelight** modeladas como uma só (`Double Door with Sidelight`, `USERDEFINED`; 11 no Esplanades). Multi-painel via psets por painel. [V]
6. **Dimensões ausentes**: `OverallWidth/Height` vazios em 49% das portas e 74% das janelas do Schep. [V]
7. **Arcos**: nenhum vão de esquadria em arco nos 922 vãos analisados; o padrão de arco em IFC existe (`IfcTrimmedCurve`+`IfcCircle`) e é o que o Revit gera. Para o mercado brasileiro (esquadria em arco é "formato especial sob encomenda") não há evidência pública lida; considerar suporte a arco como requisito de baixa frequência, não de núcleo, até ver quadros reais. [I]
8. **Qualquer exportação deve tolerar**: tipo ausente (`IfcOpenHouse`: 0 tipos), `OperationType` vazio/USERDEFINED, geometria só em Brep, nomes de pset específicos da ferramenta.

## 6. Reprodutibilidade

Comandos-chave: `git clone --filter=blob:none --sparse <repo>`; arquivos LFS via `https://media.githubusercontent.com/media/<org>/<repo>/<branch>/<path url-encoded>`; análise `python3 -I an.py <arquivo.ifc>`. Números de dimensão arredondados a 10 mm (Revit em metros, converte ft para m com ruído, p.ex. 0,864 m = 34 in); em Esplanades/Schep/Molio a unidade já é mm.
