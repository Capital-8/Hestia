# Ficha F6-lateral — lateral compartilhada entre módulos vizinhos da fila (lista de peças e corte do projeto)

Base: `feat/familias-interface`.   Nível 3

## Contexto
Numa fila de módulos unidos (conjunto com `regras` contendo `'lateral-compartilhada'`; veja `ComponentGroup` em `packages/model/src/types.ts` e `montarFila.ts`), dois módulos vizinhos podem dividir UMA lateral em vez de ter duas encostadas, economizando chapa. Hoje `orcamentoDoProjeto` (`packages/engine/src/componentes/orcamento.ts`) soma todas as peças de todos os componentes. Faça a lista e o corte consolidados do projeto descontarem as laterais compartilhadas. Leia: `orcamento.ts` e `orcamento.test.ts`, `listaPecas*.ts` (`LinhaLista`, `listaDePecas`, `resumirLista`), `instancia.ts`, `encaixeTipos.ts` (sistema local: x = largura; no módulo da fila o x local corre no sentido de −d, veja `PosicaoNaFila`), `packages/model/src/familia/tipos.ts` (`Peca.papel`).

## Faça
1. Em `orcamento.ts` (ou arquivo novo `orcamentoLaterais.ts`, exportado em `index.ts`): função pura `lateraisCompartilhadas(p: Project): Array<{ grupoId: Id; descontadoDe: Id; peca: string }>` que, para cada conjunto com a regra `'lateral-compartilhada'` e `membros` em ordem, para cada par consecutivo (k, k+1) cujos módulos estejam ENCOSTADOS (a distância entre o lado de x local mínimo do módulo k e o lado de x local máximo do módulo k+1, medida em planta com `retanguloNoMundo` e as poses, é ≤ 2 mm e as rotações são iguais), indica UMA peça a descontar: no módulo k+1, a peça de `papel: 'lateral'` com maior origem x local (a lateral do lado direito do módulo) entre as peças resolvidas (`resolverComponente`). Se o módulo k+1 não tem peça lateral, nada é descontado para o par.
2. `orcamentoDoProjeto` passa a retirar essas peças das `linhas` consolidadas (uma unidade por par), reduzindo `resumo` e `custo` (recalcule a partir das linhas descontadas), e acrescenta `economia: { laterais: number; areaChapaM2: number }` ao resultado (quantidade descontada e área em m²). Sem conjuntos com a regra, o resultado é IDÊNTICO ao de antes (inclusive `economia = { laterais: 0, areaChapaM2: 0 }`).
3. Testes (`orcamentoLaterais.test.ts` NOVO; use `FAMILIA_ARMARIO` tipo `A60` e `montarFila` para criar a fila com `regras` incluindo a regra, e a mesma fila sem a regra): fila de 3 módulos colados → 2 laterais descontadas; módulos separados por 10 cm → 0; fila sem a regra → 0 e linhas idênticas; a soma de peças com a regra é a soma sem a regra menos 2; a área descontada é 2 × (profundidade × altura da lateral) calculada no teste a partir das peças; determinismo; um módulo sem lateral na família (use uma família sem peça de papel `lateral`) → 0.
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/engine/src/componentes apps/web/src/ui` sem regressão (a janela de orçamento mostra os mesmos campos; se um teste de interface fixar o objeto inteiro do orçamento, PARE e relate). Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`packages/engine/src/componentes/{orcamento.ts, orcamentoLaterais.ts, orcamentoLaterais.test.ts, index.ts}`.

## Proibido
Qualquer outro arquivo, `packages/model/**`, `apps/**`, `crates/**`, `docs/**`, testes existentes.

## Critério de parada
Se o resultado sem a regra mudar um byte: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
