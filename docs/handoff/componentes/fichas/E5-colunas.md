# Ficha E5-colunas — usinagens nas colunas (fronteira do Rust)

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
As peças resolvidas ganharam `chapa` e `usinagens` (`PecaResolvida`, em `pecas.ts`). As colunas numéricas que o Rust receberá (`colunas.ts`) já têm os campos novos declarados, mas ainda vazios (placeholder em `paraColunas`). Implemente de verdade. Leia: `colunas.ts` (comentários dos campos novos: siga literalmente), `pecas.ts` (`UsinagemResolvida`), `colunas.test.ts` (aceite; o bloco "usinagens em colunas (E5)" e os anteriores que já passam).

## Faça
1. `paraColunas`: preencha `usinagemIni` (índice, em USINAGENS, do primeiro furo/rasgo/recorte da peça), `usinagemN`, `usinagemTipo` (código em `TIPOS_USINAGEM`), `usinagemFace` (código em `FACES`) e `usinagemDados` (6 números por usinagem: u, v, diametro, largura, comprimento, profundidade). Tipo ou face desconhecidos: lance `Error('tipo de usinagem desconhecido: …')` / `Error('face de usinagem desconhecida: …')`.
2. `metaDasPecas` já traz `usinagens` (ids); `deColunas` reconstrói `usinagens` de cada peça (ids vêm do meta, códigos das colunas) e a ida e volta tem que ser exata.
3. `validarColunas`: some as verificações dos blocos de usinagem (tamanhos coerentes: `usinagemIni`/`usinagemN` com `n`, `usinagemTipo` e `usinagemFace` com `m`, `usinagemDados` com `6m` onde `m` = soma de `usinagemN`; para cada peça `usinagemIni + usinagemN <= m`; códigos dentro das tabelas; valores finitos). A mensagem de erro de cada falha cita a palavra "usinagem".
4. Nada de arquivo novo além do permitido; `colunas.ts` não pode passar de 420 linhas (se passar, extraia para `colunasUsinagem.ts`).

## Arquivos permitidos
`packages/engine/src/componentes/colunas.ts` e novo `packages/engine/src/componentes/colunasUsinagem.ts`.

## Proibido
Todo o resto, em especial `colunas.test.ts`, `pecas.ts`, `resolver.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/colunas.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
