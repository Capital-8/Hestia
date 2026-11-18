# Ficha E5-furacao — furação automática de cavilhas entre peças em contato

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Onde uma peça encosta em outra, a marcenaria fura as duas (cavilha): um furo na FACE da chapa que recebe e outro na BORDA da que encosta, alinhados. A função calcula isso a partir das caixas das peças resolvidas. É geometria que o Rust vai espelhar: só números, funções pequenas, sem dependências. Leia: `packages/engine/src/componentes/furacao.ts` (especificação COMPLETA em comentário: siga item por item), `furacao.test.ts` (aceite, com números exatos), `pecas.ts` (convenção de eixos, faces a/b e bordas n, s, l, o de `UsinagemResolvida`).

## Faça
1. Implemente `detectarContatos`, `gerarCavilhas` e `aplicarFuracao` em `furacao.ts` mantendo assinaturas, constantes e comentários.
2. Organize em funções pequenas e testáveis (por exemplo `sobreposicao(a0, a1, b0, b1)`, `posicoesDosFuros(s0, L, regra)`, `usinagemNaFace(...)`, `usinagemNaBorda(...)`); se o arquivo passar de 420 linhas, divida em `furacaoGeometria.ts` (prefixo `furacao`).
3. Cuidado com a ordem de saída: para cada contato, para cada furo `k`, primeiro a entrada da peça da FACE e depois a da BORDA, exatamente como a especificação e os testes descrevem.
4. Contatos que envolvem peças de papel `porta`, `frente_gaveta` ou `fundo` são ignorados por `gerarCavilhas` (mas `detectarContatos` os devolve).

## Arquivos permitidos
`packages/engine/src/componentes/furacao.ts` e novos `packages/engine/src/componentes/furacao*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `furacao.test.ts`, `pecas.ts`, `resolver.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/furacao.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
