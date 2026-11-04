# Ficha ORC — orçamento e lista consolidada do projeto inteiro

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Hoje a lista de peças, o plano de corte e o custo são POR MÓVEL (editor de famílias). Falta o agregado do projeto: todos os componentes colocados, somados. Leia: `packages/engine/src/componentes/{instancia.ts (`resolverComponente`), listaPecas*.ts (`listaDePecas`, `resumirLista`, `custoEstimado`, `listaPecasCsv`), planoCorte*.ts (`planoDeCorte`, `pecasParaCorte`)}`, `packages/model/src/familia/catalogo*.ts`, `apps/web/src/ui/familia/FamiliaLista*.tsx` (como a interface mostra lista/corte/custo; reaproveite componentes e CSS), `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}` e `ui/familia/FamiliaJanela.tsx` (janela modal).

## Faça
1. **Motor** (arquivo NOVO `packages/engine/src/componentes/orcamento.ts`, exportado em `index.ts`): `orcamentoDoProjeto(p: Project, opcoes?: { catalogo?: Catalogo; nivel?: Id }): OrcamentoProjeto` puro: percorre os componentes (do nível dado ou de todos), resolve cada um (`resolverComponente`), e devolve `{ moveis: Array<{ familiaId, tipoId, nome, quantidade, ids: Id[], pecas: number, custo: number }>, linhas: LinhaLista[] (todas as peças consolidadas por chapa, espessura, medidas, veio e fita, quantidades somadas), resumo: ResumoLista, custo: CustoEstimado, ferragens: Array<{ id, nome, quantidade }>, avisos: string[] }`. Componentes com erro de resolução entram em `avisos` (com o id e a mensagem) e NÃO derrubam o resto. Móveis iguais (mesma família, tipo e valores) são agrupados com `quantidade`. Determinístico (ordem por nome e depois id). Sem componentes: tudo vazio e `avisos` vazio.
2. **Testes** (`orcamento.test.ts`, NOVO): projeto com 0 componentes; com 3 do mesmo armário (agrupados, quantidade 3, peças = 3× as de um); com 2 famílias diferentes; um componente com família ausente vira aviso e os outros continuam; filtro por nível; as quantidades consolidadas somam as de cada móvel; o custo total é a soma (tolerância 1e-6); determinismo; CSV (`listaPecasCsv(linhas)`) com cabeçalho.
3. **Interface**: janela "Orçamento do projeto" (`apps/web/src/ui/OrcamentoProjeto.tsx` NOVO + CSS próprio), aberta por uma ação nova `componentBudget` do ribbon (um botão pequeno ao lado de Componente e Editor de famílias; mudanças mínimas em `ribbon/{actions,model,tabsMain}.ts`). Abas: Resumo (móveis, quantidades, custo), Peças (lista consolidada com totais), Plano de corte (use `planoDeCorte` por chapa; reaproveite `FamiliaListaCorte` se der), Ferragens. Botões Baixar CSV e Copiar CSV. Sem componentes: mensagem "Nenhum componente no projeto". Teste da parte lógica da janela (funções puras em `orcamentoProjeto.ts` ao lado).
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova. Mais `npx vitest run packages/engine/src/componentes apps/web` sem regressão.

## Arquivos permitidos
`packages/engine/src/componentes/orcamento.ts` (NOVO), `orcamento.test.ts` (NOVO), `packages/engine/src/componentes/index.ts` (uma linha), `apps/web/src/ui/OrcamentoProjeto*` (NOVOS), `apps/web/src/ui/orcamentoProjeto*` (NOVOS), `apps/web/src/ui/ribbon/{actions.ts,model.ts,tabsMain.ts}` (mínimo), `apps/web/src/App.tsx` (uma linha para montar a janela, se for o padrão das outras).

## Proibido
`packages/model/**`, `packages/tools/**`, `packages/render/**`, `crates/**`, `docs/**`, testes existentes, snapshots.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
