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

## Onda "cotas como no Revit" (planta)
- **Referência de LINHA** (`feature: 'wall-line'`, `line: axis | face-hi | face-lo | core-hi | core-lo`, `along`): a ponta da cota prende-se à linha da parede, não a um ponto. Entre duas linhas paralelas a cota alinhada mede a perpendicular (`perpendicularBetweenLines`). Escolha por ponta em `dimensionPick.ts` (`chooseRefs`): esquadria > linha perpendicular à medida > ponto de feição.
- **Ferramenta de cota:** o cursor "pega" a face/eixo/núcleo sob ele sem precisar de snap de ponto (realce + Tab alterna); barra de opções: Selecionar (pontos | parede inteira), Referência (faces | eixo | núcleo), Esquadrias (larguras | centros). "Parede inteira" (`dimensionWallChain.ts`) monta a cadeia com pontas, esquadrias e paredes que cruzam.
- **Restrições** (`dims/constraints.ts`, gancho `setStorePostHook` do `ProjectStore`): `Dimension.locked` + `lockedValue` mantém o valor (o elemento não preso se move junto; conflito recusa o passo inteiro); `chainId` + `eq` mantém trechos iguais; cota cujo elemento foi apagado sai no mesmo passo de desfazer.
- **Cadeia:** cotas criadas juntas compartilham `chainId`. "Adicionar referência" (`addRefCommands`) divide a cota; "Remover referência" (`mergeRefCommands`) junta com o vizinho.
- **Prévia ao vivo:** mover/girar/espelhar/arrastar parede redesenha as cotas presas a ela com o valor novo (`dimGhost.ts`).
- **Propriedades da cota** (`DimensionProps.tsx`): grupos Restrições, Referências, Dimensões (valor editável move o elemento), Texto da cota (usar valor real | substituir por texto), Gráficos e Identidade.
- **Fora do escopo desta onda:** texto acima/abaixo da cota, grips de texto por segmento da cadeia, arrastar a witness line direto no canvas (substituído por "Trocar/Adicionar/Remover referência" no painel).
