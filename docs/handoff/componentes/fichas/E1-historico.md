# Ficha E1-historico — desfazer e refazer do editor de famílias

Base: branch `feat/familias-interface` (commit do contrato da E1).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O editor de famílias tem desfazer/refazer próprio, independente do projeto. Molde: `packages/model/src/history.ts` (classe `ProjectStore`, patches do immer: leia-o inteiro antes de começar; é o estilo a seguir).
Leia também `packages/model/src/familia/historico.ts` (esqueleto com a especificação em comentário: siga literalmente) e `historico.test.ts` (o aceite).

## Faça
1. Implemente a classe `HistoricoFamilia<T extends object>` em `historico.ts` mantendo assinaturas e comentários. Use `produceWithPatches`, `applyPatches` e `enablePatches` do immer (já é dependência do pacote).
2. `exec`: um passo por chamada (patches + inversos + rótulo); sem patches não cria passo nem notifica; exceção da receita não deixa rastro. `agrupar`: acumula os patches de todos os `exec` internos num passo só e notifica UMA vez no fim; aninhado vale como um só; erro dentro do grupo restaura o estado de antes do grupo e não cria passo.
3. `versao` cresce a cada mudança de `atual`. Limite de passos de "desfazer" (descarte do mais antigo). `assinar` devolve o cancelamento; ouvinte que cancela dentro da notificação não deve quebrar a iteração (copie a lista antes de chamar).
4. O estado devolvido por `atual` é congelado pelo immer (o teste confere que atribuir direto lança).

## Arquivos permitidos
`packages/model/src/familia/historico.ts` (e nenhum outro).

## Proibido
`historico.test.ts`, `history.ts`, `tipos.ts`, `index.ts` e todo o resto.

## Aceite (o orquestrador roda)
`npx vitest run packages/model/src/familia/historico.test.ts` verde, `tsc`, `eslint --max-warnings 0 packages/model/src/familia/historico.ts`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate. Não altere testes.

## Entrega
Commits pequenos e o relatório pedido.
