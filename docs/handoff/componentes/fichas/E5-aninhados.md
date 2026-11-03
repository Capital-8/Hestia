# Ficha E5-aninhados — usinagens giradas junto com a peça aninhada

Base: branch `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
`girarPeca` (em `aninhadosGeometria.ts`) já gira caixa, eixo, tamanho e contorno de uma peça de módulo aninhado em 0, 90, 180 e 270 graus, mas as `usinagens` (furos, rasgos e recortes nas faces e bordas) passam sem mudar: erradas depois de girar. Faça-as acompanharem a peça. Leia: `aninhadosGeometria.ts` e `aninhados.ts` (já feitos por você em ficha anterior), `pecas.ts` (`UsinagemResolvida`: convenção de face e de (u, v), inclusive as BORDAS n, s, l, o) e o bloco "usinagens giradas junto com a peça (E5)" de `aninhados.test.ts` (aceite). O teste compara, no MUNDO, o ponto de entrada e a direção de cada furo, e os 4 cantos de cada rasgo e recorte, antes e depois de girar e transladar.

## Faça
1. Em `girarPeca`, transforme cada usinagem: calcule o ponto e a direção no mundo da peça ANTES (usando a origem, o eixo, o `tamanho` e a espessura originais), gire pelo mesmo ângulo e translade (a translação em XY já é aplicada à peça; aplique a mesma), e converta de volta para o plano da peça NOVA (novo eixo, nova origem, novo tamanho) achando a nova `face` (a face/borda cuja normal para dentro coincide com a direção girada) e os novos `u` e `v`.
   - Faces `a` e `b`: a direção é +T (face a) ou −T (face b) no eixo da espessura T; a face nova é a que tem a direção girada.
   - Bordas: o furo entra perpendicular à borda; para as bordas, `u` é a posição AO LONGO da borda e `v` a distância da face `a` na espessura (veja o comentário de `FaceUsinagem` em `packages/model/src/familia/tipos.ts`).
   - Rasgo e recorte (só nas faces a e b): gire os 4 cantos e ache o novo canto mínimo no plano novo; `comprimento` e `largura` trocam quando os eixos do plano trocam de papel. A área `largura × comprimento` e a `profundidade` não mudam.
   - Diâmetro, tipo, id e profundidade do furo não mudam.
2. Use tabelas por ângulo (0, 90, 180, 270) para as rotações, sem trigonometria, e arredonde o resultado a 6 casas (`Math.round(v * 1e6) / 1e6`).
3. Mantenha o arquivo em até 420 linhas (se precisar, crie `aninhadosUsinagem.ts`).

## Arquivos permitidos
`packages/engine/src/componentes/aninhadosGeometria.ts`, `packages/engine/src/componentes/aninhados.ts` e novos `packages/engine/src/componentes/aninhados*.ts` (sem `.test.ts`).

## Proibido
Todo o resto, em especial `aninhados.test.ts`, `pecas.ts`, `resolver.ts`, `furacao.ts`.

## Aceite (o orquestrador roda)
`npx vitest run packages/engine/src/componentes/aninhados.test.ts` verde (todos os testes, os antigos e os 14 novos de usinagem), `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
