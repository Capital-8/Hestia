# Mapa dos contratos de teste (base para plantas por disciplina)

Leitura somente. Nenhum teste foi executado (vitest, tsc e npm não rodaram). Caminhos relativos a `hestia-wt/disc/`. Linhas conferidas no worktree.

Pergunta que este mapa responde: quais testes já provam que snap, cota, criação e seleção se comportam igual em qualquer planta, e onde a rede tem buraco antes de mexer em nível, disciplina ou planta de área.

## 0) Resumo

- Os quatro contratos de `packages/tools/src` (`contratoSnaps`, `contratoFerramentas`, `contratoModificacao`, `contratoCidadaniaBim`) são **guardas de texto**: leem o código-fonte com `readFileSync` e checam símbolos com `toContain`/`toMatch`. Não criam projeto nem executam ferramenta. A trava de compilação (`Record<Element['kind'], ...>`) só dispara com `tsc`, que o vitest não roda.
- O único contrato que **executa** comportamento é `contratoEscadaRampaCota.test.ts`, e só na planta, sempre no nível `lv_0`.
- O helper compartilhado `packages/tools/src/testEnv.ts` **fixa `levelId: () => 'lv_0'`** (linha 20). Não recebe nível, vista, elementos ocultos nem pavimento de referência. Quase todo teste de ferramenta herda isso.
- Testes com outro nível existem, mas são pontuais e feitos à mão (`snapRestricoes`, `stairRunTool`, `terrainRegion*`, `terrainAlinhar`, `clipboard`). Não há matriz "mesmo cenário em N níveis".
- Versão do esquema: `SCHEMA_VERSION = 30` (`packages/model/src/types.ts:47`). Migrações em `packages/model/src/migrate.ts`.

## 1) Contratos de `packages/tools/src`

| Arquivo | Tipo | O que garante | Como monta | Nível / vista |
|---|---|---|---|---|
| `contratoSnaps.test.ts` | guarda de texto | Todo `Element['kind']` tem fonte de snap (`fonte`) e ligação ao motor (`ligacao`), ou um `motivo` com TODO. Massa, curvas de nível e `ToolBase.ctx` como fonte única. Lê `packages/tools` e `packages/engine` (linha 21). | `readFileSync` + `toContain` sobre `apoioDeSnap.ts`, `base.ts`, `infer.ts` etc. Sem projeto. | Não se aplica. Nenhum nível ou vista é usado. |
| `contratoFerramentas.test.ts` | guarda de texto | Toda ferramenta de criação linear importa `desenhoPolilinha.ts` (LINEARES, linha 16). Todo `ToolId` do `registry.ts` está classificado. Parede e guarda-corpo não copiam o cálculo de comprimento. | Regex sobre o código de cada ferramenta. Lê o `ToolId` do `registry.ts` por regex. | Não se aplica. |
| `contratoModificacao.test.ts` | guarda de texto + 1 checagem de registro | Por `kind`: Mover/Girar/Copiar (`transform`), Copiar/Colar (`ClipBuffer`) e Alinhar têm símbolo que existe, ou motivo. Corte e elevação (`CORTE`, linha 114) têm Mover, Alinhar e prévia. Mover e Copiar da vista usam o mesmo `gestoDeslocamento.ts` da planta. Terreno e lote têm `semOperacao` com motivo. Confere `SECTION_TOOLS` em `controller.ts` e `case 'copy'/'move'` em `registry.ts`. | Só texto. Não há projeto. | Separa planta (`CLASSIFICACAO`) e corte/elevação (`CORTE`) em texto. Nenhum teste de execução. |
| `contratoCidadaniaBim.test.ts` | guarda de texto | Regras 7 a 12: seleção e visibilidade de estruturais em Planta, Corte e 3D (`selectionFilters`, `viewVisibility`, `pick.ts`, `transfer.ts`, `contextMenu`). TempDim e anel de cota para pilar, viga e sapata. Alinhar com segmento finito. Galeria `.pm-galbox`. Perfil I/T em modelo, 3D, corte, planta e IFC. | `readFileSync` + `toContain`. | Não se aplica. Nenhum nível ou vista. |
| `contratoEscadaRampaCota.test.ts` | **comportamental** (único contrato que executa) | Escada por croqui, lance livre, rampa livre, lance reto, rampa reta e cota linear e angular: Orto, Polar, comprimento digitado e cota dinâmica. Cota linear grava `levelDimensions(store.project, 'lv_0')`. Cota angular grava o raio. | `makeEnv()` + `clickAt`/`P`/`tool` de `testEnv.ts`. `cruz()` cria duas paredes com `ProjectStore`. | Planta, `lv_0`, sem corte, sem oculto, sem pavimento de referência. |

Demais testes de snap e ferramenta em `packages/tools/src` (≈286 arquivos `*.test.ts` no total) usam o mesmo `testEnv.ts`. Os que pedem nível diferente de `lv_0` fazem isso à mão.

### 1.1 Helper compartilhado `packages/tools/src/testEnv.ts`

- `makeEnv(store?)` devolve `{ store, env, options, done, sel, areaPlanId, setAreaPlanId, alertas, alertIds }`.
- `env.levelId` é fixo (`lv_0`, linha 20).
- `env.areaPlanId` lê uma variável local (`areaPlan`), que pode ser trocada com `setAreaPlanId`. Essa parte já é parametrizável.
- `env.hiddenInView` não existe no helper. Testes que precisam dele atribuem à mão (`ctx.env.hiddenInView = () => hidden`, `selectHidden.test.ts:18`).
- `env.section`, `env.isSectionView`, `env.underlayLevelId` também não vêm no helper.
- `drawWall(env, a, b)`, `clickAt`, `P` e `tool(id, env)` são os atalhos de ação.

### 1.2 Ribbon (`apps/web/src/ui/ribbon/*.test.ts`)

| Arquivo | O que cobre | Nível / vista |
|---|---|---|
| `ribbon.test.ts` (243 linhas) | Faixa guiada por dados: ordem das abas, título contextual traduzido, toda ferramenta e ação citada existe, pilha com no máximo 3 botões, ids de painel únicos, toda ferramenta do registro aparece na faixa (com lista de exceções), `pasteAligned`, `paintFace3d`. Usa `ctx({ view, p, selection })`, linha 161. | `view` recebe `plan`, `3d`, `section`, `sheet`. Nível não entra. |
| `sheetTools.test.ts` | Ferramentas desativadas na prancha (`toolDisabledOnSheet`). Em planta, 3D e corte nenhuma fica desativada. Na prancha, Selecionar, Mover e Alinhar ficam ativas. Massa é de modelo. | `view` recebe `plan`, `3d`, `section`, `sheet`. |
| `ribbonLote.test.ts`, `ribbonRegiao.test.ts`, `ribbonTerreno.test.ts` | Estado da faixa para lote, região e terreno. | `useUi.setState({ view:'plan', planKind:'floor', levelId:'lv_0' })` (linha 24 em `ribbonLote`). Nível fixo. |
| `perimeterFace`, `wallModes`, `wallTilt`, `fitCount`, `mostrarMassa`, `familyEditorAcao`, `detailLineGaleria`, `terrenoGaleria`, `ribbonRegiao` | Ações e painéis isolados. | Nível fixo ou não usado. |

Conclusão para o objetivo: os testes da faixa não variam nível. Eles variam vista (`plan`, `3d`, `section`, `sheet`), mas isso não entra em snap nem em cota.

## 2) Grupos de teste por tema

### 2.1 Cotas

| Local | O que garante | Nível / planta |
|---|---|---|
| `packages/tools/src/dims/*.test.ts` (registry, refs, driven, parallel, permanent, roundtrip, roundtripLineGrid, structuralDims, validate) | Registro de provedores de cota. Ida e volta de cota editável (parede, esquadria, linha, grade). Cota dirigida e recusas. Cota permanente grava `refs` e `planId` (`permanent.test.ts:47`). Estruturais (pilar, sapata, viga). Cotas somente leitura ficam fora da ida e volta. | Nível principal. `planId` aparece em `permanent.test.ts` e `providers/dimension.test.ts:124,130` (`vistaDaCota` com `planId: 'ap1'`). |
| `packages/tools/src/dims/providers/*.test.ts` (parede, esquadria, linha, grade, piso/laje, contorno, vizinhos, deslocamento, exemplo) | Um provedor por tipo de sujeito. | Nível. Um caso com `planId` em `dimension.test.ts`. |
| `packages/tools/src/dimensionTool.test.ts` (338 linhas) | Ferramenta Cota: sequência de cliques, unidade do projeto, deslocamento digitado (sinal, inválido, exato). | `lv_0`. |
| `packages/tools/src/cotaPosicaoFinal.test.ts` (575 linhas) | Cota na planta só nasce no clique da posição final. Escada reta e com acabamento, guarda-corpo, parede, laje, bocel. | Planta, `lv_0`. |
| `packages/tools/src/wallDraftDims.test.ts`, `massaCotaAssociativa.test.ts` | Cota dinâmica de parede. Cota associativa à massa (referência `part`). | `lv_0`. |
| `packages/tools/src/snapsCorteCotaMedir.test.ts`, `sectionDimRefs.test.ts` | Cota e Medir no corte. | Corte. |
| `packages/model/src/dimension*.test.ts`, `cotasBase.test.ts`, `dimensionSettings.test.ts`, `dimensionRefs.test.ts`, `dimensionPartSecRefs.test.ts`, `sectionDimSecRefs.test.ts` | Texto e valor da cota, geometria da cota, estilo e famílias de cota. Coordenadas-base (Localização, survey, relativa). Cotas `part` (planta) e `secRefs` (corte) coexistem e abrem igual. | Modelo puro, sem ferramenta. |
| `packages/engine/src/autoCotas.test.ts`, `autoCotasRefs.test.ts`, `sectionCota.test.ts`, `angularDimension` | Cotas automáticas. Cota de corte decide o que fica por cima (P6). | Engine. |

### 2.2 Snap (captura)

| Local | O que garante | Nível / planta |
|---|---|---|
| `packages/engine/src/apoioDeSnap.test.ts` (391 linhas) | Apoio por elemento com chaves estáveis: escada (degraus, acabamento), rampa, guarda-corpo (poste, corrimão, eixo, hospedado), lote, terreno e região, massa. Mover o elemento mantém as chaves. Edição de irmão não muda a chave. Sem kernel, a massa sai vazia. | Engine, sem nível. |
| `packages/tools/src/snapRestricoes.test.ts` (≈30 casos) | Snap por restrições (S-01). Pavimento de referência (`underlayLevelId`): `lv_1` com `lv_0` como referência (linha 218-220). Elemento oculto via `isVisible` sintético (linha 188). Histerese, Tab, arco, ponto de tangência. | `lv_0` e `lv_1` (único caso com pavimento de referência). |
| `packages/tools/src/snapsPlantaEscadaGuardaCorpo.test.ts` (≈25 casos) | Pontos e arestas de escada e guarda-corpo na planta. `ignore` remove o elemento que está sendo movido. Oculto via `hiddenInView` (linha 336). Cota gravada com referência e acompanha a escada. | `lv_0`. |
| `packages/tools/src/componentSnap.test.ts`, `componentSnapLote/Resolvido/Terreno.test.ts`, `moveisSnapPlanta.test.ts`, `moveisSnapCorte.test.ts`, `moveisSnapPlantaPecas.test.ts` | Snap de componentes e móveis. `hiddenInView` remove o móvel e o componente da captura global (`componentSnap.test.ts:126`, `moveisSnapPlanta.test.ts:84,138`). Desempenho com 300 móveis. | `lv_0` com `levels[0]`. |
| `packages/tools/src/snapCad`, `snapCurvas`, `snapGrade`, `snapTopFace`, `snapFaces.test`, `snapAccel`, `openingSnap`, `gridSnapPoints`, `snapNaSelecao`, `detailSnap`, `detailSnapCorte`, `massSnaps`, `sectionSnapIndex`, `sectionSnapMassa`, `sectionMoverSnaps` | Um tipo de fonte de snap cada. Índice de corte. Snap de massa no corte. | Mistura de planta (`lv_0`) e corte. |
| `packages/tools/src/contratoSnaps.test.ts` | Ver seção 1. Garante que o kind existe no motor, não que o snap funcione. | — |

### 2.3 Migração e esquema (arquivo antigo)

| Local | O que garante |
|---|---|
| `packages/model/src/esquema.test.ts` (528 linhas) | Vão livre e símbolo de planta. Migrações nomeadas: 5→6, 10→11, 11→12, 12→13, 13→14, 14→15, 15→16, 16→17, 17→18, 19→20, 20→21. Preservação de campos existentes. Ida e volta (JSON). Usa a função `legacyV5()`, no topo do arquivo, como arquivo sintético. |
| `packages/model/src/esquema30.test.ts` (127 linhas) | Versão atual é 30. Arquivo 29 com terreno, componente, móvel e família abre, vira 30 e preserva campos. Ciclo serializar → abrir → serializar é idêntico. Arquivo 31 é recusado com mensagem citando 31 e 30. Arquivo 25 percorre a cadeia 25→30. |
| `packages/model/src/migrate.minRiser.test.ts` (16 linhas) | Espelho mínimo de escada (pós-passo, fora da tabela). Idempotente. |
| Outros testes de modelo que citam "migra" (≈35 arquivos, p.ex. `wallCurtainMigracao`, `openingCompositionMigracao`, `dimensionPartSecRefs`, `sectionDimSecRefs`, `facePaintArquivo`, `furniture`, `viewRange`, `viewProfile`) | Migrações de campos específicos e de ida e volta. |
| `tests/` (`contratoLixo.test.ts`, `estabilidade-escadas.test.ts`, `aberturaVao.test.ts`, `integration/`, `kernel-*.wasm.test.ts`) | Lixo de implementação; estabilidade de escada; abertura em vão; integração; kernel WASM (fora do vitest padrão, ver `vitest.config.ts:10`). |

Não há fixture de arquivo `.hestia.json` real antigo em `tests/fixtures` (só `terreno`). Os arquivos antigos são montados em código.

### 2.4 Pranchas

| Local | O que garante |
|---|---|
| `packages/model/src/sheet.test.ts` (179 linhas) | Folha A3 em mm e área de desenho. Vista fora da folha é recusada. Comandos de prancha (criar, adicionar vista, atualizar, remover, desfazer). Nível inexistente é recusado. Persistência no arquivo. Deslocamento, recorte, legenda, âncora, ordem das pranchas, revisões e disciplina. |
| `apps/web/src/editor/pranchasEstabilidade.test.ts` | Agrupamento por plantas, cortes, elevações e 3D, com chaves de marcação `plan:`, `section:`, `3d:`. |
| `apps/web/src/editor/sheetInsert*.test.ts`, `sheetAlign.test.ts`, `sheetNumbering.test.ts`, `sheetActions.test.ts`, `sheetPdfVazio.test.ts` | Inserção de vista, origem, alinhamento e numeração. |
| `apps/web/src/ui/ribbon/sheetTools.test.ts` | Ferramentas na prancha (ver seção 1.2). |

## 3) Lacunas para "snap, cota, criação e seleção iguais em qualquer planta"

Ordem de prioridade.

1. **Nenhum teste compara o mesmo cenário entre níveis.** `testEnv.ts` fixa `lv_0`. Os quatro contratos de texto não executam nada. A única verificação parametrizada de nível é `snapRestricoes` (`lv_1` com `lv_0` de referência). Falta uma matriz: mesmo projeto, mesma geometria, em `lv_0` e `lv_k`, e o mesmo resultado de snap, cota e seleção (com id e coordenada mapeados). Isso é o teste de caracterização a fazer antes de mexer.
2. **Mover, copiar e colar com `planId` (planta de área) não têm teste de transform.** `planId` aparece em `dims/permanent.test.ts`, `dims/providers/dimension.test.ts`, `areaPlanSelect.test.ts` (1 caso), `annotationPlanPick.test.ts` e no modelo (`areaPlan.test.ts`, `planAnnotations.test.ts`: etiquetas e anotações). `transformTools`, `transformSession`, `transformEdge`, `clipboard` e `pasteLevels` não variam `planId`. Falta caracterizar: o que muda de planta ao mover um elemento, e se cota e anotação de uma planta de área somem ou vazam para a planta de piso do mesmo nível.
3. **Elemento oculto na captura de parede e abertura não tem caso direto.** `base.ts` transforma `hiddenInView` em `isVisible` (linha 111) e `infer.ts` usa `isVisible` só para paredes (linha 322). Os casos existentes cobrem escada, guarda-corpo, móvel e componente (`componentSnap`, `moveisSnapPlanta`, `snapsPlantaEscadaGuardaCorpo`) e seleção (`selectHidden`). Não encontrei teste que pegue parede oculta por `ToolBase` (o `isVisible` em `snapRestricoes:188` é sintético). Falta o mesmo para piso e abertura, e para o pavimento de referência (`underlayLevelId`) com elemento oculto.
4. **Cota por vista não tem matriz.** Há cota de planta (`part`), de corte (`secRefs`) e de planta de área (`planId`), cada uma com testes próprios. Não encontrei teste de isolamento entre elas no mesmo nível (uma cota da planta de área não aparece na planta de piso, e vice-versa).
5. **Arquivo antigo: lacunas nas migrações.** Sem título nomeado: 1→2, 2→3, 3→4, 4→5, 6→7, 7→8, 8→9, 9→10, 23→24. Só citadas em comentário ou título secundário: 18→19, 21→22, 22→23. Não há arquivo `.hestia.json` real em versão antiga. Antes de introduzir campos por disciplina, convém um fixture real por versão (ou pelo menos 1, 9 e 22).
6. **Seleção em planta de área e em outro nível** tem testes (`areaPlanSelect`, `colarNiveis` na web, `terrainRegionPick` em `lv_1`), mas não há cenário de seleção cruzada entre dois níveis com a mesma geometria.

Observação de método: os contratos de texto são úteis para impedir `kind` ou ferramenta nova sem classificação, mas não provam comportamento. Ao acrescentar a planta por disciplina, eles continuam válidos, mas não vão acusar regressão de snap por nível.

## 4) Mínimo de helpers para um "contrato parametrizado por planta"

1. **`makeEnv` com opções**, sem quebrar os testes atuais (padrões iguais aos de hoje): `{ store?, levelId?, hiddenIds?, underlayLevelId?, areaPlanId?, section? }`. Hoje só `store` e `areaPlanId` (por `setAreaPlanId`) existem. `levelId` é o ponto que mais falta.
2. **Construtor de projeto com N níveis** que repete uma mesma geometria em cada nível. Usar `makeLevel({ id, name, elevation })` (`packages/model/src/level.ts:13`), como o `createEmptyProject` já faz para `lv_0` (`defaults.ts:210`). Sugestão: `comNiveis(n, geometria)` devolvendo `{ store, levelIds }`.
3. **Oráculo de equivalência**: `mesmoResultadoEmNivel(cenario, nivelA, nivelB)` que roda o mesmo gesto nos dois níveis e compara ponto, tipo de snap, valor de cota e ids mapeados (elemento por posição ou por ordem).
4. **Matriz de cenários**: uma função que recebe uma lista de cenários (planta de piso, planta de área, corte, oculto, com pavimento de referência) e roda o gesto em cada um. `describe.each` já é usado no repositório (ex.: `cotaPosicaoFinal.test.ts`, sobre a lista `cenas`), então a forma está pronta.
5. **Guarda por execução**: converter pelo menos `contratoSnaps` e `contratoModificacao` para um teste que cria um projeto por `kind` e confirma que o snap e o mover funcionam em `lv_0` e `lv_1`. Hoje são só textos.

Não é preciso criar nada novo de assertiva: `expect(...).toBeCloseTo`, `toEqual` e `toMatchObject` já cobrem os casos.

## 5) Versão do esquema e migrações

- Constante: `SCHEMA_VERSION = 30` em `packages/model/src/types.ts:47`.
- Tabela de migrações: `const migrations: Record<number, Migration>` em `packages/model/src/migrate.ts:34`. A chave `n` leva a versão `n` para `n+1`. Existem entradas de 1 a 29. A entrada `29` é só um incremento (`({ ...raw })`, linha 302), que serve para o bump 29→30.
- Runner: `migrateProject(raw)` em `packages/model/src/migrate.ts:310`. Recusa arquivo sem versão, arquivo mais novo que o programa (`SchemaError`) e arquivo sem as chaves principais. Aplica as migrações em sequência e depois o pós-passo do espelho mínimo de escada (fora da tabela, idempotente).
- Para subir a versão: acrescentar `migrations[30]` e aumentar `SCHEMA_VERSION` para 31. Os testes `esquema30.test.ts` (arquivo 31 recusado) e `esquema.test.ts` precisam acompanhar.
- Atenção ao contrato de cota: `dimensionFamily.ts:11` diz que a família de cota não aumenta a versão. Campos aditivos opcionais, como `part` e `secRefs`, também não aumentam.

## 6) Arquivos lidos

- `packages/tools/src/contratoSnaps.test.ts`, `contratoFerramentas.test.ts`, `contratoModificacao.test.ts`, `contratoCidadaniaBim.test.ts`, `contratoEscadaRampaCota.test.ts`, `testEnv.ts`
- `apps/web/src/ui/ribbon/ribbon.test.ts`, `sheetTools.test.ts`, `ribbonLote.test.ts`, `ribbonRegiao.test.ts`, `ribbonTerreno.test.ts`
- `packages/engine/src/apoioDeSnap.test.ts`
- `packages/model/src/esquema.test.ts`, `esquema30.test.ts`, `migrate.minRiser.test.ts`, `migrate.ts`, `sheet.test.ts`, `dimensionRefs.test.ts` (títulos), `dimensionPartSecRefs.test.ts` (títulos)
- `packages/tools/src/dims/*.test.ts` (títulos), `snapRestricoes.test.ts` (títulos e linhas 188, 218-220), `snapsPlantaEscadaGuardaCorpo.test.ts` (títulos e linha 336), `componentSnap.test.ts` (linha 126), `moveisSnapPlanta.test.ts` (títulos), `cotaPosicaoFinal.test.ts` (linha 195+), `clipboard.test.ts` (títulos), `selectHidden.test.ts` (linha 18)
- `packages/tools/src/base.ts` (linhas 107-133), `infer.ts` (linhas 47-90, 319-322)

Buscas por `planId`, `lv_1`, `hiddenInView`, `underlayLevelId`, `isSectionView` e `migra` foram feitas com `rg` sobre `packages/` e `apps/web/src/` (apenas arquivos `*.test.ts*`).
