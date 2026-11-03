# Ficha E8-tools — selecionar, copiar/colar e colocar componentes

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O elemento `component` (`Component` em `packages/model/src/types.ts`; comandos `addComponent`/`updateComponent` em `componentCommands.ts`) e o motor `pegadaDoComponente`/`caixaDoComponente`/`resolverComponente` (`@hestia/engine`, `instancia.ts`) já existem, e o render desenha a pegada (E8-render). Faltam as FERRAMENTAS: o clique seleciona o componente, copiar/colar o duplica e a ferramenta `component` coloca um novo no nível. Leia, como modelo: `packages/tools/src/pick.ts` (`genericAt`), `selectTool.ts` (cadeia de `AnyHit`, `MODELO`), `clipboard.ts` e `pasteTool.ts` (genéricos), `openingTool.ts` e `gridTool.ts` (ferramenta de um clique, prévia), `registry.ts` (`ToolId`, `TOOL_GROUPS`, `createTool`, `TOOL_LABEL`), `base.ts`, `types.ts` (`ToolEnv`, `ToolOptions`).

## Faça
1. **Pick** (`pick.ts`): `componentAt(p, levelId, at, mpp): Id | null`: o componente cuja pegada (`pegadaDoComponente`, qualquer anel externo) contém o ponto (com tolerância `4 * mpp` na borda); entre sobrepostos vence o de menor área. Ignora outros níveis. Teste: `componentPick.test.ts` (novo): dentro, na borda, fora, nível errado, menor área vence.
2. **Seleção** (`selectTool.ts`): novo `kind: 'component'` em `AnyHit` e em `MODELO`; consulte `componentAt` logo após o genérico (antes de ambiente). Seleção por janela inclui componentes cuja pegada está inteira na janela (como os genéricos/CAD). Mover por arrasto: como o genérico (use `updateComponent` com `x`/`y`); sem alças. Teste `componentSelect.test.ts` (novo): clique seleciona; arrastar move e desfaz em um passo.
3. **Clipboard** (`clipboard.ts`, `pasteTool.ts`): copiar/colar/cortar componentes (clona com `structuredClone`, novo id por `newId`, `mark` vazio, mesma família/tipo/valores; ao colar leva a família junto SE o projeto de destino não a tiver em `componentFamilies`, via comando `upsertFamily`). Teste `componentClipboard.test.ts` (novo).
4. **Ferramenta `component`** (arquivo novo `componentTool.ts`, registrada em `registry.ts`: `ToolId` `'component'`, rótulo "Componente", dentro de `TOOL_GROUPS` junto das de inserir objetos; atalho fica como está): 
   - `ToolOptions` ganha `componentFamilyId?: Id` e `componentTypeId?: Id | null` (opcionais, em `types.ts`).
   - Sem família escolhida: `env.say('Escolha uma família de componente.')` e nada é inserido. Família que não está em `p.componentFamilies`: mensagem e nada.
   - Prévia no movimento do ponteiro: contorno da pegada de um componente fantasma (como a prévia de `openingTool`/`pasteTool`: siga o mesmo mecanismo de `preview`).
   - Clique: `exec({ type: 'addComponent', component: {...} })` com id novo, `levelId: env.levelId()`, `x,y` no clique (com a captura/grade que as outras ferramentas usam), `z: 0`, `rotation` atual, `mirrored` atual, `values: undefined`, `mark: ''`. Permanece ativa para colocar vários; Esc/botão direito sai (`env.done()`).
   - Teclas: `R` gira 90° (anti-horário), `Shift+R` −90°; `M` espelha. A prévia acompanha.
   - Teste `componentTool.test.ts` (novo): sem família não insere; clique insere 1 componente com a posição; R gira 90°; M espelha; o desfazer remove.
5. **Excluir** (Delete) deve funcionar para componente: confira o caminho que já exclui genéricos (procure `deleteElements`/`removeElements` em `packages/model/src/commands.ts`) e, se `component` não for aceito lá, ajuste SÓ o necessário nesse caminho (um teste).
6. `npx vitest run packages/tools` verde SEM regressão (não atualize snapshots); `tsc`; `eslint --max-warnings 0` nos arquivos tocados; `check-boundaries`. Nenhum arquivo passa de 420 linhas; textos em português.

## Arquivos permitidos
`packages/tools/src/{pick.ts, selectTool.ts, clipboard.ts, pasteTool.ts, registry.ts, types.ts, index.ts}`, novos `packages/tools/src/component*.ts` e seus testes, e (só se o item 5 exigir) `packages/model/src/commands.ts`.

## Proibido
`packages/engine/**`, `packages/render/**`, `apps/**`, `docs/**`, `crates/**`, qualquer snapshot, testes existentes.

## Aceite (o orquestrador roda)
Testes novos verdes, `npx vitest run packages/tools packages/model` sem regressão, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Se algo exigir mudar o comportamento de outros elementos, PARE e relate. Teste contraditório: PARE.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
