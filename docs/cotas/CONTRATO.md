# Redesenho de cotas — contrato (feat/cotas)

Tipos: `packages/model/src/dimensionContract.ts` (só o orquestrador altera). Mapa do estado anterior: ver resumo no fim.

## Decisões
- Estilo de cotas **global** (`ProjectSettings.dimensionStyle: DimensionStyle`); campos da `Dimension` individual sobrepõem.
- Cotas **associativas**: `Dimension.refs.{a,b}` aceita `DimensionRef` (parede+ponta, antigo) **ou** `DimensionElementRef` (elementId+feature). Não há projetos salvos: sem migração.
- **Um** renderizador (`render/src/plan/notes.ts` + `dimLabels.ts`) e **um** hit test (`tools/src/annotationPick.ts`) para planta, planta de área, corte e elevação. Corte deixa de neutralizar refs/escala fixa 100.
- **Cota dirigida**: `tools/src/dims/driven.ts` -> `drivenEditCommands(project, dim, novoValor): DrivenEdit`. Digitar valor ajusta parede/porta/janela; recusa com motivo (conflito) sem alterar o modelo.
- Cota angular e de corte gravam na **vista** (SectionView.annotations / planta), nunca no nível.
- **Cota permanente selecionada (planta):** mostra as mesmas alças de ponta das cotas temporárias de parede/porta/janela (bolinhas que alternam a referência, `dimsView.gripOf` / `nextRef`). A troca grava em `Dimension.refs` (comando no histórico), não só em `dimOverrides`. Reaproveita `registerDimProvider`, `TempDim.ends[].options` e `drivenEditCommands`; não cria mecanismo novo.
- **Escopo do comportamento de valor e referência: só planta.** Corte e elevação não recebem alça de referência nem edição de valor nesta onda (cota vertical não move porta/janela na horizontal).
- **Família de cota = aparência** (`DimensionFamily`, `dimensionFamily.ts`). Editor de família segue o padrão do `OpeningTypeDialog`; propriedades da cota selecionada mostram só o que é da instância.

## Estado do que já existe (não recodar)
- `tools/src/dims/driven.ts`: `drivenEditCommands(project, dim, novoValor, fixed?)`, pura, simula e relê a cota; já move porta/janela (`setOpeningHost`) e parede (`translateWallsJoined`).
- `tools/src/dims/registry.ts`: `selectionDims` + provedores para `door`, `window`, `wall`, `floor`, `slab`, `ceiling`, `roof`, `detailLine`, `perimeterLine`, `grid`. **Falta provedor para `Dimension` permanente** (é a lacuna da frente H).
- `apps/web/src/ui/dims/dimsView.ts`: `gripOf`, `nextRef`, `viewOfDim` (alças só quando `options.length >= 2`).
- `apps/web/src/ui/dims/DimValueEditor.tsx` + `dimEditModel.ts`: editor de valor já existe para cotas temporárias.
- `tools/src/annotationPick.ts`: `dimGripAt` (alça de deslocamento) e `dimTextGripAt` (texto) para cota permanente; hoje **não** há alça de ponta.

## Frentes e donos de arquivo
| Id | Escopo | Pode tocar |
|---|---|---|
| A | caixa de seleção no corte (pronta) | entrada do canvas do corte |
| B | snap de escada/rampa em corte/elevação | engine/src/section*.ts (expor anéis), tools/src/sectionSnapIndex.ts |
| C | modelo: refs genéricas, estilo global, resolveDimRef, toPermanent com refs | packages/model/src/{types,dimension,dimensionSettings,annotations}.ts, tools/src/dims/permanent.ts |
| D | render: estilo CAD, texto, leader, anti-sobreposição, hover | render/src/plan/{notes,dimLabels}.ts, render/src/section/annotations.ts |
| E | diálogo do estilo global | ui/dialogs/dimensionSettings*.ts(x) |
| F | cota dirigida | tools/src/dims/driven.ts (+ teste) |
| G | seleção/hover/alças de cota no corte + angular no corte | tools/src/{selectTool,annotationPick,angularDimensionTool}.ts, editor/sectionPick.ts, render/src/section/handles.ts |
| H | **H1, H2a e H3 feitas**: provedor `dimension` com edição de valor (`drivenEditCommands`); alça de troca entre feições do **mesmo** elemento (`DimEnd.alt`, grava `Dimension.refs` com `updateDimension`, desfazível). **H2b pendente**: trocar para **outro** elemento (ex.: parede por parede), que exige um passo de clique no canvas usando `dimRefAt`. | tools/src/dims/providers/dimension.ts (novo, + teste), tools/src/dims/registry.ts (1 linha), tools/src/dims/permanent.ts (função de troca de ref), apps/web/src/ui/dims/* (ligação), tools/src/selectTool.ts (só se a alça de ponta precisar de hit test) |
| I | família de cota: editor no padrão do OpeningTypeDialog + painel enxuto da cota | apps/web/src/ui/dialogs/DimensionFamiliesDialog.tsx, ui/dialogs/dimensionSettings*.ts(x), painel de propriedades da cota |

Ganchos em `controller.ts`/`state.ts`/`actions.ts`: no máx. 5 linhas e avisar no relatório.
Testes: cada frente roda só seus arquivos; a suíte completa é do orquestrador no fim da onda.

## Estado final da onda (planta)
- **H (cota permanente):** selecionar a cota mostra uma só vez (o desenho dinâmico fica invisível; o desenho da planta é o que vale). Cada ponta ligada a elemento tem alça: clique alterna a feição do mesmo elemento; **Shift+clique** entra no modo de escolha e o próximo clique na planta (parede, porta, janela) vira a referência da ponta (`pickRefCommands`). Tudo grava `updateDimension` e desfaz com Ctrl+Z.
- **Planta de área:** cotas guardadas na planta de área são reconhecidas pela vista (`vistaDaCota`) e recebem as mesmas alças e edição de valor.
- **Valor:** editar o valor move a esquadria ou a parede (`drivenEditCommands`). **Trava** (`Dimension.locked`): cota travada recusa a edição de valor. Padrão: destravada.
- **I (família):** o botão "Editar família…" no painel da cota abre o diálogo de famílias já com a família dela. Ajustes individuais (unidade, casas decimais, prefixo, sufixo, altura, marca) ficam em "Avançado", porque sobrepõem a família só naquela cota.
- **Botão "I" (converter):** só aparece para cota dinâmica; cota permanente não o mostra.
- **Cotas automáticas:** a geração só adiciona cotas (`addDimension`); não apaga nem sobrescreve as existentes.
- **Fora do escopo:** corte e elevação (sem alça de referência nem edição de valor), cota angular editando valor, e a trava não impede mover o elemento pela ferramenta Mover (só bloqueia a edição de valor).
- **Testes:** `packages/tools/src/dims` (392 testes) e `tests/e2e/cotas-permanentes.mjs` (7 passos no navegador). Suíte completa: 822 arquivos de teste passando.

## Cota ligada a escada, rampa e guarda-corpo: dois mecanismos, duas vistas (integração)

Duas frentes entregaram a mesma ideia ("a cota acompanha o elemento") para vistas diferentes. Os dois mecanismos coexistem e **não se misturam**:

| | Planta (`part`) | Corte e elevação (`secRefs`) |
| --- | --- | --- |
| Onde grava | `Dimension.refs.{a,b}`: `DimensionElementRef` com `feature: 'part'` e `key` | `Dimension.secRefs.{a,b}`: `SectionDimRef` (`hostId`, `kind`, `ord`) |
| O que identifica | chave estável do ponto de apoio (`d0.t3.v1`), nomeada pelo motor | tipo e ordem do ponto de captura do elemento na vista |
| Resolvedor | `definirProvedorDeApoio` (`dimensionRefs.ts`, o motor se registra) e `resolveDimRef` | `setSectionDimensionResolver` (`sectionAnnotations.ts`, o app liga) e `sectionDimRefs.ts` |
| Quem lê | só a planta; a vista em corte ignora `refs` | só `sectionAnnotationsOf`; a planta ignora `secRefs` |

- Mudança no modelo **aditiva**: `'part'` é mais um membro de `DimFeature`, `key?` e `secRefs?` são campos opcionais. As feições antigas (`wall-*`, `opening-*`, `vertex`, `edge`) e `DimensionRef` ficam intactas. `SCHEMA_VERSION` não muda e projeto antigo abre e salva idêntico.
- Teste da convivência (abrir e salvar com `part` na planta e `secRefs` no corte, no mesmo projeto): `packages/model/src/dimensionPartSecRefs.test.ts`; `sectionDimSecRefs.test.ts` e `dimensionRefs.test.ts` cobrem cada lado.
- Captura (snap): a planta usa `SnapIndexado` (`ctx.indexed`, conjuntos do nível indexados uma vez, com `hiddenIds`); o corte usa `snapAccel.ts` (grade espacial por identidade do array de `extraPoints`, `extraSegments` e `extraTracks`). Não foram fundidos porque o primeiro recebe um índice explícito e filtrado por elementos ocultos, e o segundo é um cache transparente sobre listas já montadas; juntar os dois exigiria reescrever a consulta das duas vistas ao mesmo tempo, sem ganho. Cada uma atende listas diferentes dentro de `infer` e o resultado de cada vista continua o da varredura completa (testes de cada frente).
