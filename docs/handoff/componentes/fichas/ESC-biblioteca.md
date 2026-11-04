# Ficha ESC-biblioteca — escolhas internas nas famílias da biblioteca

Base: `feat/familias-interface`.   Nível 1 a 2 (mecânico, com regra)

## Contexto
`Familia.escolhas?: Escolha[]` (`id`, `nome`, `parametro`, `zona`) já existe e o painel de Propriedades já as mostra (veja `packages/model/src/familia/tipos.ts` e `validarEncaixe.ts`: o `parametro` precisa ser `enum`, `booleano` ou `inteiro`; a `zona` precisa ser igual ao `grupo` de ao menos uma peça). Falta declarar escolhas nas famílias de `packages/model/src/familia/biblioteca/` e em `exemplos.ts` (`FAMILIA_ARMARIO`). Siga a regra, sem inventar.

## Regra
Para cada família, para cada parâmetro `p` do tipo `enum`, `booleano` ou `inteiro` (sem `formula`) que aparece na fórmula `quando` ou `repetir` de ao menos uma peça (procure o id do parâmetro no texto da fórmula, como palavra inteira):
1. Dê a essas peças o `grupo` (se ainda não tiverem) conforme o `papel` da peça: `porta` → `'portas'`, `fundo` → `'fundo'`, `prateleira` → `'prateleiras'`, `gaveta` → `'gavetas'`, `tampo` → `'tampo'`, `rodape` → `'rodape'`, outro papel → o próprio papel (`papel`). Se a peça JÁ tem `grupo`, mantenha o dele e use-o como zona.
2. Acrescente a `escolhas` da família: `{ id: 'esc_' + p.id, nome: p.nome, parametro: p.id, zona: <grupo escolhido> }`. Se mais de uma peça com zonas diferentes usa o mesmo parâmetro, use a zona da primeira peça (na ordem da lista).
3. Não crie escolha para o mesmo parâmetro duas vezes. Parâmetros de dimensão (comprimento, número com unidade) nunca viram escolha.
4. NÃO mude fórmulas, parâmetros, valores nem a geometria: só `grupo` das peças e `escolhas`. O resultado de `resolverFamilia` de TODAS as famílias deve ficar idêntico ao de antes (o teste confirma).

## Faça
1. Aplique a regra a todas as famílias da biblioteca (28) e a `exemplos.ts`. Se um helper ajudar, crie `biblioteca/escolhas.ts`; senão edite cada arquivo.
2. Teste novo `biblioteca/escolhas.test.ts`: para cada família de `BIBLIOTECA_BASE` e `FAMILIA_ARMARIO`, `validarFamilia` sem erros; cada escolha tem `parametro` existente de tipo `enum`/`booleano`/`inteiro` e `zona` igual ao `grupo` de alguma peça; a quantidade de escolhas bate com a regra (calcule no teste varrendo as fórmulas `quando`/`repetir`, sem copiar a lista); `resolverFamilia` (de `@hestia/engine` não: este teste fica em `packages/engine/src/componentes/escolhasBiblioteca.test.ts`) devolve para o tipo padrão de cada família as MESMAS peças de antes: compare contra um instantâneo das peças calculado no próprio teste a partir da família SEM `grupo`/`escolhas` (copie a família, apague os `grupo` que você acrescentou e as `escolhas`, resolva as duas e compare `pecas` por `id`, `origem` e `extensao`).
3. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/model packages/engine/src/componentes` sem regressão. Textos em português.

## Arquivos permitidos
`packages/model/src/familia/biblioteca/*.ts` (só `grupo` das peças e `escolhas`), `packages/model/src/familia/exemplos.ts` (idem), `packages/model/src/familia/biblioteca/escolhas.test.ts` (NOVO), `packages/engine/src/componentes/escolhasBiblioteca.test.ts` (NOVO).

## Proibido
`tipos.ts`, fórmulas, parâmetros, valores, geometria, testes existentes, `apps/**`, `crates/**`, `docs/**`.

## Critério de parada
Teste existente que quebre por causa de `grupo` (ex.: algum filtro por `grupo` no detalhe 3D): PARE e relate o teste.

## Entrega
Commits pequenos e o relatório pedido nas regras.
