# Ficha F5-fila-ui — diálogo "Montar fila" (cozinha em linha) a partir da parede selecionada

Base: `feat/familias-interface` (com F5-fila-motor, F3-core e CONJ-ui integrados).   Nível 3

## Contexto
O motor já monta uma fila: `montarFila(p, pedido)` em `packages/engine/src/componentes/montarFila.ts` (leia o contrato no código e em `docs/handoff/componentes/fichas/F5-fila-motor.md`) devolve os componentes e o conjunto; `facesDasParedes(p, levelId)` (`encaixeProjeto.ts`) dá as duas faces de cada parede reta (a face i da parede de ordem k é o índice `2k` (lado esquerdo do eixo) e `2k + 1` (lado direito), na ordem das paredes do nível devolvida por `wallsOnLevel`); `aplicarEscolhaDeFamilia`/`faltantes` (`ui/ComponentOptionsBar.tsx`, `ui/familia/carregarNoProjeto.ts`) carregam famílias da biblioteca com dependências. Falta a interface. Primeira versão SEM ferramenta nova: o usuário seleciona UMA parede reta, clica no botão "Fila" do ribbon e preenche um diálogo. Leia: `apps/web/src/ui/familia/FamiliaJanela.tsx` (janela modal reutilizável), `ui/OrcamentoProjeto.tsx` (outro diálogo do projeto com abas e ação no ribbon: copie o padrão de montagem em `App.tsx` e `ribbon/{actions,model,tabsMain}.ts`), `ui/PaletaMoveis.tsx` se já existir, `apps/web/src/editor/controller.ts` (`editor.store`, seleção por `useUi`), `packages/model/src/queries.ts` (`wallsOnLevel`).

## Faça
1. **Lógica pura** (`apps/web/src/ui/montarFilaLogica.ts` NOVO): 
   - `facesDaParede(p, levelId, wallId): Array<{ lado: 'esquerdo' | 'direito'; face: FaceDeParede }> | null` (usa `wallsOnLevel` e `facesDasParedes`; `null` se a parede não existe, é curva ou de outro nível).
   - `pedidoDaTela(p, entrada): PedidoDeFila | null`: converte a entrada do diálogo (`levelId`, `wallId`, `lado`, `inicio`, `comprimento`, `linhas: Array<{ familyId; typeId: Id | null; largura?: number }>`, `preencher`) no `PedidoDeFila`, com `idBase` = `fila_` + um id novo (`newId`), carregando a face certa; `null` se faltar algo.
   - `previaDaFila(p, entrada): ResultadoDeFila | null` (chama `montarFila`).
   - `criarFila(store, entrada): { ok: true; ids: Id[] } | { ok: false; erro: string }`: numa transação ('Montar fila'): carrega as famílias que faltam (com dependências, via `faltantes`/`upsertFamily`), faz `addComponent` de cada componente do resultado e `upsertComponentGroup`; seleciona os novos componentes; um passo de desfazer.
2. **Diálogo** (`apps/web/src/ui/MontarFila.tsx` + `montarFila.css`): janela com: a parede selecionada (nome/id) e o lado (esquerdo/direito do eixo, com a dica "o lado livre"); início e comprimento em metros (campos numéricos do projeto, `NumField`; padrão: início 0 e comprimento = comprimento da face); lista de módulos (cada linha: família em `select` com as famílias do projeto e da biblioteca base, tipo em `select`, largura opcional; botões Adicionar, Remover, Subir, Descer); caixa "Preencher o vão"; uma tabela de prévia (módulo, largura, posição) recalculada a cada mudança com os avisos do motor em destaque (sobra, painel, família ausente); botão Criar (desabilitado sem módulos ou com resultado vazio) e Cancelar. Se não há exatamente uma parede reta selecionada, o diálogo mostra a mensagem "Selecione uma parede reta" e só o botão Fechar.
3. **Ribbon**: ação nova `componentRun` (botão "Fila" ao lado de Componente e Orçamento; rótulo "Montar fila"; dica em português) que abre o diálogo (estado em `useUi` ou store local como as outras janelas); mudanças mínimas em `ribbon/{actions,model,tabsMain}.ts` e `App.tsx` (uma linha).
4. **Testes** (`montarFilaLogica.test.ts` NOVO), valores à mão: `facesDaParede` de uma parede de (0,0) a (4,0) com `makeWall` e o tipo de parede padrão do projeto vazio (espessura do tipo: confira a face esquerda em y = espessura/2); parede curva ou inexistente: `null`; `pedidoDaTela` null sem módulos; `previaDaFila` com [A60, A80] na parede devolve larguras [0.6, 0.8]; `criarFila` com `FAMILIA_ARMARIO` do projeto: 2 componentes + 1 conjunto com `linha`, `groupId` nos dois, desfazer em UM passo remove tudo; com família da biblioteca (`fam_comoda`) carrega também `fam_gaveta`.
5. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run apps/web packages/engine/src/componentes` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/{MontarFila.tsx, montarFila.css, montarFilaLogica.ts, montarFilaLogica.test.ts}` (NOVOS), `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}`, `apps/web/src/App.tsx` (uma linha), `apps/web/src/editor/state.ts` (só um campo de estado, se precisar).

## Proibido
`packages/**`, `crates/**`, `docs/**`, `ui/familia/**` (só leitura), testes existentes, snapshots.

## Critério de parada
Se o motor `montarFila` não existir ou tiver contrato diferente do descrito: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
