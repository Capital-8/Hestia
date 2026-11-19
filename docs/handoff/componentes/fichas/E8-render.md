# Ficha E8-render — componentes na vista 3D e na planta do projeto

Base: branch `feat/familias-interface` (com o motor `instancia.ts` do E8-motor integrado).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O projeto agora tem elementos `component` (móveis) e o motor `@hestia/engine` entrega a malha no mundo (`malhaDoComponente`), a pegada em planta (`pegadaDoComponente`) e a caixa (`caixaDoComponente`). Falta desenhá-los na vista 3D e na planta, com selecionar e realçar funcionando como nos demais elementos. Leia: `packages/render/src/model3d/componentSolids.ts` (especificação completa em comentário: siga literalmente), `componentSolids.test.ts` (aceite), `genericSolids.ts` e `genericSolids.test.ts` (o modelo a seguir), `solids.ts` (`SolidBatch`, `ofElement`), `scene3d.ts` (onde `buildGenericSolids` é usado: `const genericos = …`, a lista de `batches`, o trecho de arestas do realce "revelado" e `materialOf`), `packages/render/src/plan/build.ts` (trecho "Objetos importados": contorno tracejado dos genéricos), `plan/planOverlay.ts` (realce de seleção do genérico por contorno) e `packages/engine/src/componentes/instancia.ts`.

## Faça
1. Implemente `buildComponentSolids` e a paleta `MATERIAIS_DE_COMPONENTE` em `componentSolids.ts` (aceite: `componentSolids.test.ts`), exporte-os em `packages/render/src/index.ts` (uma linha).
2. **3D** (`scene3d.ts`, mudanças mínimas e com o comportamento atual intacto): onde o código monta `genericos` (sob `shown('generic')`) acrescente os sólidos dos componentes do nível à lista de lotes; no trecho de arestas do realce revelado inclua os componentes como os genéricos; e faça `materialOf` consultar também `MATERIAIS_DE_COMPONENTE` (depois de `p.materials` e do beiral). Componentes escondidos pelo "ocultar na vista" seguem o mesmo filtro (`oculto(id)`) usado nos genéricos: se os genéricos não o aplicam, os componentes também não precisam.
3. **Planta** (`plan/build.ts`): no bloco que desenha os objetos importados (sob `profile.generic && paint.generic.visible`), para cada componente do nível (não escondido: `hidden?.has(e.id)`) desenhe a pegada de `pegadaDoComponente` como traços fechados, finos, na tinta suave do tema (`theme.inkSoft`, largura 1 px, sólido, alfa 1) e, por dentro, os contornos das peças... NÃO: só a pegada (um traço por anel de cada polígono; furos também). Em `plan/planOverlay.ts`, no realce de seleção, trate componentes como o genérico (contorno da pegada em `theme.select` mais grosso quando o id está na seleção).
4. Teste de planta novo, ao lado dos existentes de planta com genérico (procure por `outline` nos testes de `packages/render/src/plan`), em arquivo NOVO `componentPlan.test.ts` na mesma pasta: um componente no nível gera ao menos 1 traço fechado com a cor do tema; sem componente nada muda; escondido não desenha.
5. Rode e deixe verde TODA a suíte de render: `npx vitest run packages/render` (nada pode regredir); não atualize snapshots.
6. Nenhum arquivo passa de 420 linhas; textos em português.

## Arquivos permitidos
`packages/render/src/model3d/componentSolids.ts`, `packages/render/src/model3d/scene3d.ts`, `packages/render/src/plan/build.ts`, `packages/render/src/plan/planOverlay.ts`, `packages/render/src/index.ts`, `packages/render/src/plan/componentPlan.test.ts` (NOVO) e novos `packages/render/src/model3d/componentSolids*.ts`.

## Proibido
`componentSolids.test.ts`, `packages/engine/**`, `packages/model/**`, `crates/**`, `apps/**`, `docs/**`, qualquer snapshot.

## Aceite (o orquestrador roda)
`npx vitest run packages/render/src/model3d/componentSolids.test.ts packages/render/src/plan/componentPlan.test.ts` verde e `npx vitest run packages/render` sem regressão, `tsc`, `eslint --max-warnings 0`, `check-boundaries`; depois o orquestrador coloca um componente no projeto pelo console e confere 3D e planta.

## Critério de parada
Se `scene3d.ts` exigir mudança que altere o comportamento de outros elementos, PARE e relate. Teste contraditório: PARE. Não altere testes existentes.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
