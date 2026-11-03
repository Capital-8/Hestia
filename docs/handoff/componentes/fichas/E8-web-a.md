# Ficha E8-web-a — colocar componente e carregar a família no projeto

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A ferramenta `component` (`packages/tools/src/componentTool.ts`, `ToolOptions.componentFamilyId`/`componentTypeId`) já existe e o render desenha a instância. Falta a interface: (1) o botão "Componente" do ribbon ativar a ferramenta de colocar, com um botão pequeno ao lado "Editor de famílias" (ação `familyEditor` atual, que chama `useFamilia.getState().abrir()`); (2) a barra de opções da ferramenta escolher a família e o tipo; (3) o editor ter "Carregar no projeto". Leia: `ui/ribbon/tabsMain.ts` (linha do `act('familyEditor'…)`; veja como outros botões grandes têm `tool(...)`), `ui/ribbon/actions.ts`, `ui/ribbon/model.ts`, `ui/OptionsBar.tsx` (bloco `tool === 'wall'`) e `RampOptionsBar.tsx` (barra própria, modelo), `editor/state.ts` (`DEFAULT_OPTIONS`), `ui/familia/familiaStore.ts`, `ui/familia/FamiliaFaixa.tsx` (botões da faixa do editor), `ui/familia/acoes.ts`, `packages/model/src/componentCommands.ts` (`upsertFamily`), `packages/model/src/familia/biblioteca/index.ts` (`BIBLIOTECA_BASE`).

## Faça
1. **Ribbon**: o botão "Componente" ativa `tool('component')` (ícone atual); acrescente um botão pequeno ao lado, "Editor de famílias", com a ação `familyEditor` existente. Mantenha atalhos e demais botões intactos; ajuste testes de ribbon existentes SÓ se contarem botões (e diga no relatório).
2. **Barra de opções** (novo `ui/ComponentOptionsBar.tsx`, ligado em `OptionsBar.tsx` com UMA linha `{tool === 'component' && <ComponentOptionsBar />}`): um `select` "Família" com as famílias do projeto (`p.componentFamilies`) e, num grupo "Biblioteca", as de `BIBLIOTECA_BASE` que ainda não estão no projeto (escolher uma da biblioteca a carrega no projeto com `upsertFamily` e a seleciona); um `select` "Tipo" com os tipos da família (primeira opção "Padrão da família" = `null`); dica "R gira, M espelha". Grava em `componentFamilyId`/`componentTypeId` das opções. Sem família escolhida, a primeira da lista é escolhida ao ativar a ferramenta.
3. **Carregar no projeto** (em `ui/familia/`): botão "Carregar no projeto" na faixa do editor (`FamiliaFaixa.tsx`) que aplica `upsertFamily` com a família atual do histórico do editor no projeto aberto (um passo de desfazer do PROJETO), fecha o editor e deixa a ferramenta `component` ativa com essa família escolhida (`componentFamilyId`). Se a família tem erros de validação (use o validador do modelo que o editor já usa), mostre a mensagem e NÃO carregue. Lógica em arquivo novo `ui/familia/carregarNoProjeto.ts` (pura o quanto der) com teste `carregarNoProjeto.test.ts`.
4. Testes novos (vitest, ambiente como os testes existentes de `apps/web/src/ui`): barra de opções muda `componentFamilyId`; carregar insere a família em `project.componentFamilies` e a validação ruim recusa.
5. `npx vitest run apps/web` sem regressão; `tsc`; `eslint --max-warnings 0` nos arquivos tocados; `check-boundaries`; `check-units`. Nada acima de 420 linhas; textos em português.

## Arquivos permitidos
`apps/web/src/ui/ribbon/{tabsMain.ts,actions.ts,model.ts,panelsShared.ts}`, `apps/web/src/ui/OptionsBar.tsx`, `apps/web/src/ui/ComponentOptionsBar.tsx` (NOVO), `apps/web/src/editor/state.ts` (só `DEFAULT_OPTIONS`, se preciso), `apps/web/src/ui/familia/{FamiliaFaixa.tsx,acoes.ts,familiaStore.ts}`, novos `apps/web/src/ui/familia/carregarNoProjeto*.ts` e testes novos ao lado.

## Proibido
`packages/**`, `crates/**`, `docs/**`, `Properties.tsx` e `ComponentProperties*` (outra ficha), qualquer snapshot.

## Aceite (o orquestrador roda)
Testes novos verdes, `npx vitest run apps/web` sem regressão, tsc, eslint, boundaries, units; depois confiro no navegador: colocar um armário na planta.

## Critério de parada
Se precisar mudar `packages/**`, PARE e relate. Teste contraditório: PARE.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
