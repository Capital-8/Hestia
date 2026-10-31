# Redesenho de cotas — contrato (feat/cotas)

Tipos: `packages/model/src/dimensionContract.ts` (só o orquestrador altera). Mapa do estado anterior: ver resumo no fim.

## Decisões
- Estilo de cotas **global** (`ProjectSettings.dimensionStyle: DimensionStyle`); campos da `Dimension` individual sobrepõem.
- Cotas **associativas**: `Dimension.refs.{a,b}` aceita `DimensionRef` (parede+ponta, antigo) **ou** `DimensionElementRef` (elementId+feature). Não há projetos salvos: sem migração.
- **Um** renderizador (`render/src/plan/notes.ts` + `dimLabels.ts`) e **um** hit test (`tools/src/annotationPick.ts`) para planta, planta de área, corte e elevação. Corte deixa de neutralizar refs/escala fixa 100.
- **Cota dirigida**: `tools/src/dims/driven.ts` -> `drivenEditCommands(project, dim, novoValor): DrivenEdit`. Digitar valor ajusta parede/porta/janela; recusa com motivo (conflito) sem alterar o modelo.
- Cota angular e de corte gravam na **vista** (SectionView.annotations / planta), nunca no nível.

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

Ganchos em `controller.ts`/`state.ts`/`actions.ts`: no máx. 5 linhas e avisar no relatório.
Testes: cada frente roda só seus arquivos; a suíte completa é do orquestrador no fim da onda.
