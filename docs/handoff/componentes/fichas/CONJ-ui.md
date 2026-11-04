# Ficha CONJ-ui — conjuntos de componentes na interface (agrupar, mover junto, copiar junto)

Base: `feat/familias-interface` (com F1-modelo integrado).   Nível 3

## Contexto
O modelo já tem conjuntos: `Project.componentGroups`, `Component.groupId` e os comandos `upsertComponentGroup`, `deleteComponentGroup`, `moveComponentGroup`, `rotateComponentGroup` (veja `packages/model/src/componentCommands.ts` e `componentGroups.test.ts`; excluir membros já limpa o conjunto). Falta a interface e as ferramentas. Leia: `packages/tools/src/{selectTool.ts (cadeia de clique, `moveComponents`, caixa de seleção), pick.ts (`componentAt`, `componentIdsInBox`), clipboard.ts, pasteTool.ts, testEnv.ts}`, os testes `componentSelect.test.ts` e `componentClipboard.test.ts` (estilo), `apps/web/src/ui/ComponentProperties.tsx` e `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}`.

## Faça (um commit por item)
1. **Agrupar e desagrupar** (arquivo novo `packages/tools/src/componentGroupActions.ts`, exportado em `index.ts`): `agruparSelecao(env: ToolEnv): string | null` cria um conjunto com os componentes selecionados (id novo `newId('g')`, nome "Conjunto N" com N = próximo número livre, `levelId` do nível, `membros` na ordem de seleção); recusa com a mensagem (e devolve o texto) se: menos de 2 componentes, níveis diferentes, algum já está em outro conjunto; usa `env.exec` (um passo de desfazer) e `env.say`. `desagruparSelecao(env)` desfaz os conjuntos de TODOS os componentes selecionados que estão em conjunto (`deleteComponentGroup`, um passo). Testes `componentGroupActions.test.ts`.
2. **Selecionar o conjunto inteiro**: no `selectTool`, clicar num componente que está num conjunto seleciona TODOS os membros do conjunto (a seleção vira a lista de `membros`); com Shift/Ctrl, alterna o conjunto inteiro; a caixa de seleção que pega um membro pega o conjunto todo. Teste `componentGroupSelect.test.ts`.
3. **Mover junto**: o arrasto na planta (`moveComponents` do `selectTool`) usa `moveComponentGroup` para cada conjunto cuja lista de membros esteja INTEIRA na seleção, e `updateComponent` só para os componentes soltos; tudo em UMA transação (um passo de desfazer). A prévia (fantasma) já mostra todos. Teste: mover um conjunto de 3 move os 3 e a `linha` junto, e um único desfazer volta tudo.
4. **Copiar e colar o conjunto**: `clipboard` guarda `groups?: ComponentGroup[]` com os conjuntos CUJOS membros estão todos copiados; `pasteTool` cria o novo conjunto (id novo, nome com "(cópia)", membros mapeados para os ids novos, `linha` transladada junto com os componentes) na mesma transação do colar; conjuntos parcialmente copiados não são recriados (os componentes colam soltos). Compatível com buffers antigos (sem `groups`). Teste `componentGroupClipboard.test.ts`.
5. **Interface**: no ribbon, dois botões pequenos ao lado de Componente: "Agrupar" e "Desagrupar" (ações novas `groupComponents` e `ungroupComponents` em `ribbon/{actions,model,tabsMain}.ts`, habilitadas só com componentes selecionados, se o padrão do ribbon permitir); no painel `ComponentProperties.tsx`, uma linha "Conjunto: <nome>" com o botão "Desagrupar" quando os selecionados pertencem a um conjunto. Teste de lógica pura se extrair função.
6. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/tools apps/web packages/model` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`packages/tools/src/{selectTool.ts, pick.ts, clipboard.ts, pasteTool.ts, index.ts, componentGroupActions.ts (NOVO)}` e testes novos `componentGroup*.test.ts`; `apps/web/src/ui/ComponentProperties.tsx`; `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}`.

## Proibido
`packages/model/**`, `packages/engine/**`, `packages/render/**`, `crates/**`, `docs/**`, testes existentes, snapshots.

## Critério de parada
Se um item exigir mudar o modelo ou o comportamento de outros elementos: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
