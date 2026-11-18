# 30. IFC: vão com contorno no export, Lining/Panel, Qto e reconhecimento de forma no import

Data: 2026-11-18. Status: **implementado e testado em Vitest; não validado em visualizador nem em `ifcopenshell.validate`** (o módulo Python `ifcopenshell` não está instalado nesta sessão). Cobre os itens 1.1 e 1.2 da síntese (`00-sintese.md` §4), o B16/B17 do `06-ifc-interoperabilidade.md` (§11 e §13) e fecha a ponta de export de `23-ifc-perfil-contorno.md` (que não estava ligado ao `exportIfc`).

Marcas: **[V]** = verificado por código, teste ou comparação de arquivo gerado; **[I]** = inferência do significado de atributo IFC ou do comportamento de leitor, não conferida em visualizador.

## 1. O que mudou (arquivo:linha)

| Arquivo | Mudança |
|---|---|
| `packages/io/src/ifc/ifcExport.ts:230-232` | Vão com `forma` válida: `addOpeningProfile` (`ifcOpeningProfile.ts`) no peitoril (`atZ(g.sillZ - st.elev)`). Sem forma ou forma inválida: `rectVoid`. |
| `packages/io/src/ifc/ifcExport.ts:200-206` | `rectVoid`: o vazio retangular de sempre, movido para função. A ordem de criação das entidades é preservada (`place` é chamado depois do sólido). |
| `packages/io/src/ifc/ifcExport.ts:268` | `addOpeningQto` logo após o `IFCRELFILLSELEMENT`. |
| `packages/io/src/ifc/ifcOpeningTypes.ts:217` | `liningPanelIds` entra em `HasPropertySets` do `IFCDOORTYPE`/`IFCWINDOWTYPE`. |
| `packages/io/src/ifc/ifcTypes.ts:78` | `IfcOpeningGeo.forma?: OpeningShape` (opcional; ausente = retângulo como antes). |
| `packages/io/src/ifc/ifcQuantities.ts:44` | `addSet` exportado (uso do Qto dos vãos). |
| `packages/io/src/ifc/ifcOpeningLining.ts` (novo) | Lining/Panel do tipo; `addOpeningQto`. |
| `apps/web/src/editor/ifcExport.ts:147` | Producer repassa `forma: g.forma` (uma linha). Sem isso o export não recebe a forma. |
| `packages/io/src/ifcImport/openingShapeFit.ts` (novo) | `fitOpeningShape`: reconhece a forma a partir do contorno 2D do perfil. |
| `packages/io/src/ifcImport/openingImport.ts:36-44, 89-104, 123` | `nonRectLoopOf` (o contorno que não é retângulo); decisão de forma/aviso; forma passada ao tipo. |
| `packages/io/src/ifcImport/elementTypes.ts:91, 98, 121` | `openingType` aceita `shape`; o identificador do tipo leva a forma, para arco e retângulo de mesmas medidas não colapsarem. |
| `packages/io/src/ifcImport/openingFidelity.test.ts:99-104` | Asserção atualizada (ver §5). |
| `packages/io/src/ifcImport/openingShape.test.ts` (novo) | 16 testes: reconhecimento, ida e volta, Qto, lining, fallback. |

## 2. Export do vão com forma (item 1)

- O vazio segue o contorno de `outline(forma)` (`ifcOpeningProfile.ts`, já existente) extrudado na espessura da parede mais 1 cm por face, como o retângulo. **[V]** `ifcOpeningProfile.test.ts` (18 testes, verdes).
- Posição: no **peitoril** (`g.sillZ`), não em `roughBottomZ`. **[V]** `ifcExport.ts:231`. Na prática o app já preenche `roughBottomZ = sillZ` (`apps/web/src/editor/ifcExport.ts:143`), então o resultado coincide hoje; a escolha de `sillZ` evita depender disso.
- Forma em `forma` já vem dimensionada pelo vão bruto (`openingShapeOf`, `packages/model/src/openingShapeOf.ts:12`), igual ao `roughWidth`/`roughHeight` do retângulo. **[V]**
- **Retângulo idêntico [V].** Comparei o STEP exportado do `house2` antes e depois da mudança, normalizando as referências `#n` (a numeração muda porque as entidades novas entram no meio). Vãos (`IFCOPENINGELEMENT`), portas, janelas e paredes, expandidos até os valores, saem idênticos: 32 linhas canônicas nos dois lados, sem diferença. A comparação não é linha a linha porque a numeração muda.
- **[I] Limitações do vão com forma no export:**
  - Os batentes e folhas do corpo da esquadria continuavam retangulares dentro do vão arqueado; sobrava vazio nos cantos do arco. **Superado pela §8**: as peças com seção real saem recortadas. Não visto em visualizador.
  - Parede inclinada ou curva: o vazio segue o eixo reto da parede, a mesma limitação do retângulo no caminho de `addOpenings`. Não testado com forma.
  - Forma inválida (`validateOpeningShape` não vazio) cai em retângulo sem aviso. **[V]** código; **[I]** o usuário não é avisado.

## 3. Lining e Panel (item 2)

Entram **no tipo**, por `HasPropertySets` (padrão IFC4 para tipo). Só o que o `OpeningType` tem; campo que depende da parede não é inventado.

| Entidade | Campo IFC | Origem no modelo | Marca |
|---|---|---|---|
| `IFCDOORLININGPROPERTIES` | `LiningThickness` | `openingFrame(t).frameWidth`, ou 0,03 m com `frameStyle` aduela (regra de `openingFrameDims`, `packages/engine/src/openingModelContext.ts:146`) | [V] |
| | `ThresholdThickness` | `threshold.thickness` | [V] |
| | `CasingThickness` | `casing.width` (largura do alizar no plano da parede) | [I] |
| | `CasingDepth` | `casing.thickness` (projeção perpendicular) | [I] |
| | `LiningDepth` | **não exportado**: depende de `frameDepthMode` e da espessura da parede (`openingFrameDepth`, `packages/model/src/openingStyle.ts:74`). Só existe na ocorrência. | lacuna |
| `IFCDOORPANELPROPERTIES` (uma por folha) | `PanelDepth` | `openingFrame(t).leafThickness` | [V] |
| | `PanelOperation` | `plan` → enum (`PANEL_OPERATION`, `ifcOpeningLining.ts:24`): `swing`/`pivot`/`double` → `SWINGING`, `dblact` → `DOUBLE_ACTING`, `sliding`/`pocket` → `SLIDING`, `bifold`/`accordion` → `FOLDING`, `garage` → `ROLLINGUP` | [I] (pivô como `SWINGING`) |
| | `PanelPosition` | `leafPosition` (`:40`): 1 folha sem painel lateral = `NOTDEFINED`; 2 = `LEFT`/`RIGHT`; 3+ com centro = `MIDDLE` | [I] |
| | `PanelWidth` | **não exportado**: é razão da largura do vão, depende da instância | lacuna |
| | Painel fixo lateral | `sidelights.left`/`right` → `FIXEDPANEL` `LEFT`/`RIGHT` (`doorPanels`, `:103`) | [I] |
| `IFCWINDOWLININGPROPERTIES` | `LiningThickness` | igual à porta | [V] |
| | `LiningDepth`, `MullionThickness`, `TransomThickness` | não exportados: o modelo não guarda espessura de montante nem de travessa (`transom.height` é altura de vidro) | lacuna |

- Janela: os `IFCWINDOWPANELPROPERTIES` por folha **já existiam** (`windowPanels`, `ifcOpeningTypes.ts`); não foram alterados. `FrameDepth`/`FrameThickness` continuam `$`. O modelo tem `leafThickness` (folha), mas o significado de `FrameDepth` no IFC não foi conferido. **[I]**
- A ocorrência não recebe lining próprio. O tipo carrega os conjuntos; com `ParameterTakesPrecedence` ausente (`$`), vale o do tipo.
- **[V]** Teste `openingShape.test.ts` ("o tipo de janela traz o lining…") confere presença de `IFCWINDOWLININGPROPERTIES`/`IFCDOORLININGPROPERTIES`/`IFCDOORPANELPROPERTIES` no arquivo.
- Nomes e posições dos atributos seguem a definição de IFC4 ADD2 (`06-ifc-interoperabilidade.md` §4). A conferência contra o schema oficial não foi feita (os hosts buildingSMART estavam bloqueados na coleta, `coleta/17`). **[I]**

## 4. Quantitativos (item 3)

`Qto_DoorBaseQuantities` ou `Qto_WindowBaseQuantities` na **ocorrência** (`addOpeningQto`, `ifcOpeningLining.ts:132`), ligado por `IFCRELDEFINESBYPROPERTIES`:

- **Area** e **Perimeter** por `areaPerimetroDoContorno` (`packages/engine/src/furoContornoParede.ts:16`, o mesmo cálculo que `quantities.ts:127`). **[V]** Teste "Qto_WindowBaseQuantities…" compara com a função do engine.
- **Width** e **Height** = caixa envolvente da forma. Para retângulo, a própria esquadria (`g.width`/`g.height`).
- **[I] Convenção de vão bruto:** com forma, as quantidades usam o contorno do vão bruto (como o engine faz em `quantities.ts:127`). Por isso Width/Height podem diferir de `OverallWidth`/`OverallHeight` (esquadria) quando há `roughOversize`. Para retângulo, as quantidades são da esquadria, como no engine. O engine é inconsistente nesse ponto; o Qto segue o engine.
- A coleta 17 (`coleta/17` §3.6) registra que a definição do schema pede Width/Height só para elemento retangular. **[MEMÓRIA]**, não lido na íntegra. Mantido por pedido explícito; a conferência fica para o schema.

## 5. Import: reconhecimento de forma (item 4)

`fitOpeningShape` (`openingShapeFit.ts:121`) recebe o contorno 2D do perfil (`nonRectLoopOf`, `openingImport.ts:42`):

1. Normaliza: centro em x = 0, base em z = 0 (`normalize`, `:62`). Perfil de cabeça para baixo não é reconhecido. **[I]** premissa de orientação (a mesma de `outlineIsNotRect`).
2. Candidatas: retângulo, elipse/círculo, arco pleno (se H ≥ W/2), abatido (flecha em (0, W/2]) e ogival (flecha em [W/2, H]). Abatido e ogival são buscados numa grade de 60 passos com refinamento de seção áurea (`bestRise`, `:93`).
3. Distância: **Hausdorff** entre os vértices do contorno e os segmentos da forma, nos dois sentidos (`hausdorff`, `:59`; desvio por forma em `devOf`, `:84`). Forma gerada com cordas de 1 mm (`outline(shape, 0.001)`).
4. Decisão (`openingImport.ts:96-104`):
   - desvio ≤ **4 mm** (`FORMA_EXATA_TOL`, `openingShapeFit.ts:17`): forma exata, **sem aviso**; o tipo recebe `shape`;
   - 4 mm < desvio ≤ **50 mm** (`FORMA_PROXIMA_TOL`, `:19`): forma livre, aproximada pela mais próxima, com o aviso `… o vão tem forma livre; foi aproximado por <forma> (desvio máximo N mm).`;
   - acima de 50 mm, ou contorno sem ajuste: caixa envolvente com o aviso de sempre (`… não é retangular … caixa envolvente`).
5. Ogival com flecha igual a W/2 é o mesmo arco pleno: é reportada como `round` (`openingShapeFit.ts:139-146`). **[V]** teste do D.

O tipo ganha a forma (`elementTypes.ts:98`): o identificador inclui o tipo e a flecha, então arco e retângulo de mesmas medidas viram tipos distintos. **[V]**

**[I] Pontos em aberto do import:**
- O reconhecimento usa o perfil 2D como ele vem; não aplica a `Position` do sólido. Funciona para o export do Hestia e para o exemplo de `06` §7.1. Outros emissores com perfil em outro plano podem cair em caixa envolvente. Não testado com arquivos de terceiros.
- Forma livre aproximada (desvio entre 4 e 50 mm) fica como a forma mais próxima. Quem usa o arquivo precisa ler o aviso.
- A amostragem de arco usa o `curvePoints` existente (`IfcArcIndex` já é amostrado; `profiles.ts`). Não há tratamento específico de `IfcTrimmedCurve` sobre `IfcCircle` além do que já existia.

## 6. Testes e validação (item 5)

- `packages/io/src/ifcImport/openingShape.test.ts` (16 testes, verdes):
  - reconhecimento exato de arco pleno, abatido, ogival e círculo a partir do contorno do próprio modelo; retângulo com pontos extras é retângulo; polígono aproximado não é exato; estrela não ajusta;
  - **ida e volta export → import** para retângulo, arco pleno, abatido, ogival, círculo e elipse; confere forma, largura, altura, flecha, peitoril (0,90 m) e ausência de aviso de forma;
  - Qto de janela com forma: Width, Height, Perimeter e Area batendo com `areaPerimetroDoContorno`;
  - fallback: estrela (perfil sem forma próxima) segue como caixa envolvente com o aviso de sempre.
- `openingFidelity.test.ts:99-104`: o arco "D" do fixture (semicírculo exato de 1,00 × 2,00 m) passou a ser reconhecido como `round`, sem aviso. **Mudança de comportamento intencional:** antes o teste afirmava o aviso de achatamento para essa mesma geometria; agora a forma é reconhecida, como o pedido do item 4.
- Suíte: `packages/io/src/ifc` e `packages/io/src/ifcImport` passam (35 arquivos, 288 testes). `apps/web` de export (`ifcExport`, `ifcExportCortina`, `wallShapesIntegracao`, `wallTiltIfcDxf`): 23 testes verdes.
- `tsc -p tsconfig.json --noEmit`: sem erro. `eslint` nos arquivos alterados: limpo. `scripts/check-boundaries.mjs`: "fronteiras ok".
- **Validação externa: não feita.** `python3 -c 'import ifcopenshell'` falhou (módulo ausente). O arquivo gerado não foi aberto em web-ifc nem IfcOpenShell. Por isso, a orientação do perfil, a extrusão centrada e a leitura do arco pelo visualizador continuam **[I]**.

## 7. Lacunas que sobram

1. `LiningDepth` e `PanelWidth`: dependem da parede ou da instância. Ficam fora do tipo; falta um conjunto por ocorrência com `ParameterTakesPrecedence`.
2. `TransomThickness`, `MullionThickness`: o modelo não guarda espessura de travessa nem de montante.
3. `FrameDepth`/`FrameThickness` da janela: não preenchidos (ver §3).
4. Corpo da esquadria dentro de vão arqueado: **superado pela §8** para as peças com seção (batente em ts, travessa, folha, vidro, maçaneta). Batente de janela em arco continua caixa.
5. Validação em visualizador ou `ifcopenshell.validate`: pendente.
6. `IFC4.3`: os psets equivalentes (`Pset_DoorLiningProperties` etc., `06` §4) não foram gravados.
7. `docs/estudo-esquadrias/23-ifc-perfil-contorno.md` §5 (itens 2 e 4) ficou desatualizado: o módulo já está ligado ao export. Não foi editado, por ser outro documento.

## 8. Peças em arco no IFC (vão com forma)

Antes, cada peça da esquadria saía como caixa em z: num vão em arco, a peça era a caixa envolvente, maior que o arco. Agora a peça recortada pelo contorno sai com a seção real. **[V]** para as quatro formas testadas abaixo; visualizador e `ifcopenshell.validate` continuam pendentes.

### 8.1 O que mudou (arquivo:linha)

| Arquivo | Mudança |
|---|---|
| `packages/io/src/ifc/ifcTypes.ts:50-60` | `IfcOpeningPartGeo.profile?` (plano `ts`/`sz`/`tz` e pontos). Ausente = caixa, como antes. |
| `packages/io/src/ifc/ifcOpeningParts.ts` (novo) | `openingPartSolid`: sólido da peça pelo plano. Sem `profile`, o caminho é o retângulo de sempre (`extrudeSolid`, mesmas linhas). `rectOfPart` saiu de `ifcExport.ts`. |
| `packages/io/src/ifc/ifcExport.ts:231` | Peças do vão passam por `openingPartSolid`. 378 para 367 linhas. |
| `apps/web/src/editor/ifcExport.ts:` `openingPartsOf` | Repassa `profile` **só** quando `g.forma` existe. 394 linhas (limite 420). |
| `apps/web/src/editor/ifcExportPecasArco.test.ts` (novo) | 7 testes (ver 8.3). |

### 8.2 Planos e eixos da extrusão

Coordenadas do sistema local do vão (t ao longo da parede, s na espessura, z acima do peitoril), as mesmas da caixa. O `IfcAxis2Placement3D` do sólido só troca o plano da seção.

| Plano | Pontos da seção | Extrusão | Position (origem; eixo Z; X) |
|---|---|---|---|
| `ts` | (t, s) | +z de z0 a z1 | padrão (sem placement próprio) |
| `sz` | (s, z) | +t de t0 a t1 | (t0, 0, 0); Z = +t; X = +s; Y = +z |
| `tz` | (t, z) | -s de s1 a s0 | (0, s1, 0); Z = -s; X = +t; Y = +z |

Em todos os casos Z × X = Y, então a seção fica no plano certo. [V] pelos testes de caixa do mundo (8.3).

### 8.3 Verificação [V]

- **Vão retangular idêntico.** Exportei os seis modelos de partida (`blank`, `esquadrias`, `house-premium`, `house2`, `predio10`, `studio`) antes e depois, com a mesma data. O texto STEP sai **byte a byte igual** nos seis. É mais forte que a comparação normalizada de §2, que ficou só por causa da numeração. O snapshot era temporário e foi apagado.
- **Peças em arco, 4 casos.** Porta `ot_p90` com arco pleno (`round` 0,9 × 2,1) e abatido (`segmental` 0,9 × 2,1, flecha 0,3); janela `ot_j120` com arco pleno (`round` 1,2 × 1,2) e abatido (flecha 0,3). Para cada peça, o teste lê o texto de volta com `parseStep` (o leitor do importador) e confere:
  - **número de peças**: uma por peça do modelo, sem cavidade, tracejada, verga nem soleira;
  - **caixa do mundo** do sólido lido = caixa da peça (1 µm). Isso valida plano e eixo da extrusão;
  - **volume** do sólido = `partQuantity(peça).volume` do engine, com tolerância perímetro da seção × profundidade × 1 µm. Essa é a precisão da escrita (`num`, 6 casas). Uma tolerância relativa de 1e-5 falhou na roseta da maçaneta (1,4e-5 m³), por isso a tolerância é absoluta por peça;
  - vidro e folha em arco têm volume **menor** que a caixa envolvente.
- **Cobertura dos planos.** Porta: batente em `ts`, travessa, folha e roseta em `tz`, alavanca da maçaneta em `sz`. Janela: travessa, folha e vidro em `tz`. [V] pelo levantamento das peças de cada caso.
- **Regressão do IFC.** 43 arquivos de IFC (`packages/io/src/ifc`, `packages/io/src/ifcImport`, `apps/web` de export, `wallShapesIntegracao`, `wallTiltIfcDxf`, `wallTiltJuncaoIfc`): 328 testes verdes. `tsc`: nenhum erro nos arquivos tocados; os erros que restam são de `engine/furoContornoDespacho.ts`, `engine/openingModelContorno.ts` (importa `openingModelMuntinsContorno.ts`, que ainda não existe) e `model/openingExtras.ts`, de outras frentes. `eslint` nos arquivos tocados: limpo. `check-boundaries`: "fronteiras ok".

### 8.4 Decisões e limites

- **Só vão com forma.** O perfil entra apenas quando o vão tem `forma`. Motivo: a maçaneta (roseta `tz`, alavanca `sz`) e o rebaixo do batente (`ts`) também têm perfil em vão retangular. Exportá-los mudaria o IFC retangular, que tem que ficar idêntico.
  - Consequência [V]: num vão com forma, a maçaneta sai com a roseta de verdade (disco), e o batente em `ts` sai com o rebaixo. No vão retangular a mesma peça continua caixa.
  - [I] Generalizar o perfil para o vão retangular é uma mudança de IFC retangular. Fica para decisão, não para este passo.
- **Batente de janela em arco continua caixa.** No modelo de `ot_j120`, a ombreira não tem perfil `ts`; o arco é coberto pela travessa e pela folha. [V] pelo levantamento das peças.
- **Não validado externamente.** Sem visualizador e sem `ifcopenshell` nesta sessão. A orientação dos planos foi checada pela caixa do mundo que o próprio leitor reconstrói, não visualmente. [I] a leitura pelo web-ifc e pelo IfcOpenShell.
- **Alizar em arco não tem teste dedicado.** O caminho é o mesmo (`tz` do grupo), mas os casos acima não têm alizar configurado. [I]
- **Quantitativos IFC intocados.** O Qto do `IfcOpeningElement` (§4) continua calculado pelo contorno do vão, não pelas peças. As quantidades de peça do engine (`partQuantity`) não foram ligadas ao IFC.
