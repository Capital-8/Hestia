# Ficha ANIN-modelo — operações de edição dos módulos aninhados

Base: `feat/familias-interface`.   Nível 2

## Contexto
`Familia.aninhados: Aninhado[]` (veja `packages/model/src/familia/tipos.ts`: `id`, `nome`, `familiaId`, `tipoId?`, `valores: Record<string, Expr>`, `origem: [Expr, Expr, Expr]`, `rotacao?: Expr`, `repetir?`, `quando?`) existe e o motor resolve, mas não há operação de edição. O arquivo `packages/model/src/familia/edicaoAninhados.ts` já traz as três funções com a assinatura e o contrato nos comentários, lançando "não implementado", e já estão exportadas em `edicao.ts`. Implemente-as. Siga o estilo de `edicaoPecas.ts`, `edicaoTipos.ts` e `edicaoEncaixe.ts` (puras sobre o rascunho, `null` em sucesso ou o motivo em português; com erro a família fica exatamente como estava; use `clonarSeguro` de `dependencias.ts` se precisar clonar). Leia também `validar*.ts` (o que a validação já confere nos aninhados), `edicaoApoio.ts` (`lista`, `idLivre`) e `edicao.test.ts`.

## Faça
1. `adicionarAninhado(f, a)`: erros (nesta ordem): objeto inválido; `f.aninhados` existe mas não é lista; `id` vazio; `id` já usado por outro aninhado OU por uma peça (os ids de peça e aninhado compartilham o espaço de nomes dos `onde` da validação); `nome` vazio (se vazio use o `id`? NÃO: recuse com "o módulo aninhado precisa de um nome"); `familiaId` vazio; `familiaId` igual a `f.id` (módulo dentro de si mesmo); `rotacao` literal numérica (texto que é só um número) diferente de 0, 90, 180, 270 (fórmulas são aceitas: a validação cuida delas). Em sucesso, acrescenta ao fim (cria a lista se não existir) e devolve `null`.
2. `editarAninhado(f, id, patch)`: erros: patch inválido; inexistente (`módulo aninhado “id” não existe`); os mesmos de nome vazio, `familiaId` vazio/igual à própria e rotação literal inválida, aplicados ao resultado; só troca os campos presentes no patch (`valores` e `origem` substituídos por inteiro; `tipoId: undefined` explícito remove o campo).
3. `excluirAninhado(f, id)`: remove; erro se inexistente.
4. Testes em `packages/model/src/familia/edicaoAninhados.test.ts` (NOVO): cada operação com sucesso e cada recusa (ids duplicados com aninhado e com peça, nome vazio, familiaId vazio, familiaId própria, rotação 45, rotação '90', rotação 'giro' como fórmula aceita); a família não muda quando recusa (compare com cópia); funcionam por dentro de `HistoricoFamilia.exec` (rascunho do immer) com desfazer e refazer; uma família com aninhado criado por `adicionarAninhado` (de `fam_gaveta`, origem `['0','0','0']`) resolve sem erros em `resolverFamilia` com `biblioteca: familiaDaBiblioteca` — ESTE teste de resolução fica em `packages/engine/src/componentes/aninhadoEdicao.test.ts` (NOVO), que importa de `@hestia/model`.
5. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/model packages/engine/src/componentes` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`packages/model/src/familia/edicaoAninhados.ts`, `packages/model/src/familia/edicaoAninhados.test.ts` (NOVO), `packages/engine/src/componentes/aninhadoEdicao.test.ts` (NOVO).

## Proibido
`edicao.ts` (as exportações já existem), `tipos.ts`, qualquer outro arquivo, `apps/**`, `crates/**`, `docs/**`, testes existentes.

## Critério de parada
Teste contraditório ou necessidade de mexer fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
