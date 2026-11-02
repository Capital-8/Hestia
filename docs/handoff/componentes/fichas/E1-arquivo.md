# Ficha E1-arquivo — arquivo de famílias `hestia-familia`

Base: branch `feat/familias-interface` (commit do contrato da E1).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Famílias são exportadas e importadas por arquivo JSON (molde: `packages/model/src/openingTypeLibrary.ts`, só como referência de estilo).
Leia: `packages/model/src/familia/tipos.ts`, `arquivo.ts` (esqueleto com a especificação em comentário: siga literalmente), `exemplos.ts`, `validar.ts` (use `validarFamilia`; outra ficha o implementa em paralelo — importe e use pelo contrato) e `arquivo.test.ts` (o aceite).

## Faça
1. Implemente `exportarFamilias`, `serializar`, `importarFamilias` e `lerArquivo` em `arquivo.ts`. Mantenha as constantes e as assinaturas.
2. `importarFamilias`: fatal só nos casos listados; por família, os motivos listados, nessa ordem de verificação. Cópia profunda com `structuredClone`; só as chaves de `Familia` (formato, versao, id, nome, categoria, descricao, unidade, hospedagem, origem, parametros, planos, pecas, aninhados, ferragens, tipos, tipoPadrao) são lidas do objeto de entrada; `formato` e `versao` da família importada viram os atuais. Detecte as chaves proibidas `__proto__`, `constructor`, `prototype` em qualquer nível (inclusive dentro de listas) ANTES de clonar, com função recursiva sem estourar a pilha em estruturas muito aninhadas (limite de profundidade 64 → motivo "aninhamento excessivo").
3. Como `validarFamilia` pode ainda ser esqueleto no seu worktree, os testes que dependem dele só passam com tudo integrado; faça o seu código correto pelo contrato e relate quais testes dependem disso.

## Arquivos permitidos
`packages/model/src/familia/arquivo.ts` (e nenhum outro).

## Proibido
`arquivo.test.ts`, `tipos.ts`, `expressao.ts`, `validar.ts`, `exemplos.ts`, `index.ts` e todo o resto.

## Aceite (o orquestrador roda)
`npx vitest run packages/model/src/familia/arquivo.test.ts` verde (com o validar integrado), `tsc`, `eslint --max-warnings 0 packages/model/src/familia/arquivo.ts`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate. Não altere testes.

## Entrega
Commits pequenos e o relatório pedido; diga quais testes dependem do `validarFamilia` real.
