# Ficha E1-grafo — ordem de avaliação dos parâmetros (ordenação topológica)

Base: branch `feat/familias-interface` (commit do contrato da E1).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A família tem parâmetros e planos de referência cujas fórmulas se referenciam. Não há solver: avalia-se em ordem topológica e ciclo é erro.
O contrato e os testes já estão escritos. Leia nesta ordem: `packages/model/src/familia/tipos.ts`, `expressao.ts` (use `parse` e `referencias`, NÃO reescreva o parser), `exemplos.ts`, `grafo.ts` (esqueleto com a especificação em comentário) e `grafo.test.ts` (o aceite).

## Faça
1. Implemente `ordenar`, `dependenciasDaFamilia` e `ordemDeAvaliacao` em `packages/model/src/familia/grafo.ts`, trocando os `throw new Error('não implementado…')`. Mantenha os comentários de especificação e as assinaturas exatas.
2. `ordenar`: algoritmo de Kahn com desempate pela posição de entrada. Em caso de ciclo, ache UM ciclo como a especificação descreve (ande pelas dependências do resíduo cíclico escolhendo a de menor posição e corte no primeiro id repetido). Auto-dependência é ciclo de um id.
3. `dependenciasDaFamilia`: um item por parâmetro (ordem da família) e depois um por plano; para itens com fórmula use `compilar` + `referencias`; `corpo.esp` conta como `corpo` (tire o que vem depois do primeiro ponto); filtre para ids existentes de parâmetros ou planos; sem repetição; ordem alfabética.
4. `ordemDeAvaliacao(f)` = `ordenar(dependenciasDaFamilia(f))`.

## Arquivos permitidos
`packages/model/src/familia/grafo.ts` (e nenhum outro).

## Proibido
Qualquer outro arquivo, em especial `grafo.test.ts`, `tipos.ts`, `expressao.ts`, `exemplos.ts`, `index.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/model/src/familia/grafo.test.ts` verde (todos os testes), `tsc`, `eslint --max-warnings 0 packages/model/src/familia/grafo.ts`, `check-boundaries`.

## Critério de parada
Se um teste parecer contradizer a especificação do esqueleto, PARE e relate qual teste e por quê; não altere o teste.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório descrito nas regras.
