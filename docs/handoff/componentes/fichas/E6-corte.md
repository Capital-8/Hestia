# Ficha E6-corte — plano de corte (guilhotina com kerf)

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O plano de corte arranja as peças nas chapas brutas respeitando refilo, veio e a espessura da serra. É uma heurística determinística (o Rust vai reproduzir as MESMAS posições, então o método e os desempates descritos têm de ser seguidos à risca). Leia: `packages/engine/src/componentes/planoCorte.ts` (especificação completa em comentário: siga item por item), `planoCorte.test.ts` (aceite: casos exatos e invariantes sobre 200 conjuntos aleatórios) e `listaPecas.ts` (apenas os tipos `LinhaLista` e `VeioNaLista`; outra ficha implementa as funções em paralelo).

## Faça
1. Implemente `orientacoesPermitidas`, `planoDeCorte` e `pecasParaCorte` em `planoCorte.ts` mantendo assinaturas, tipos e comentários.
2. Divida em funções pequenas (por exemplo `melhorPosicao`, `dividirRetangulo`, `cabeNaChapaVazia`); arquivo de apoio com prefixo `planoCorte` se passar de 420 linhas.
3. Números exatos: trabalhe com os números como vêm (mm, podem ser decimais) e compare com tolerância `1e-9` onde precisar; NÃO arredonde posições.
4. Desempates exatamente como a especificação (menor sobrante do lado curto, depois do lado longo, depois não girada, depois retângulo mais antigo; peças ordenadas por área decrescente, depois comprimento decrescente, depois índice). Não altere a entrada.

## Arquivos permitidos
`packages/engine/src/componentes/planoCorte.ts` e novos `packages/engine/src/componentes/planoCorte*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `planoCorte.test.ts`, `listaPecas.ts`, `pecas.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/planoCorte.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
