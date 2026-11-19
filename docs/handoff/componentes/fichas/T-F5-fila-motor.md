# Ficha T-F5-fila-motor — testes CEGOS de `montarFila e larguraDoModulo`

Base: `feat/familias-interface`.   Modelo: definido pelo orquestrador

## O que você faz
Outro executor está implementando `montarFila e larguraDoModulo` em `packages/engine/src/componentes/montarFila.ts` e escrevendo os testes dele. VOCÊ escreve testes INDEPENDENTES, só a partir da especificação abaixo, para o orquestrador cruzar os dois. NÃO leia, NÃO implemente e NÃO altere `montarFila.ts` (neste worktree ele só lança "não implementado": os seus testes vão falhar aqui, e isso é esperado). Seus testes são validados depois, contra a implementação do outro.

## Regras
1. Escreva UM arquivo: `packages/engine/src/componentes/montarFila.cego.test.ts` (vitest; importe de `./montarFila.ts` e de `./encaixeTipos.ts`; para geometria pode usar `retanguloNoMundo` de `./encaixeColisao.ts`, que já está pronta).
2. Cubra TODOS os casos numéricos da especificação e acrescente pelo menos 6 casos seus: bordas, simetria (espelhar a cena deve espelhar o resultado), idempotência, determinismo, entradas vazias, valores no limite da tolerância. Calcule os valores esperados À MÃO a partir da especificação e das convenções de `encaixeTipos.ts`, com a conta escrita num comentário curto ao lado de cada `expect`. Não calcule o esperado chamando a função testada.
3. Se a especificação for ambígua num ponto, NÃO invente: escreva o teste com `it.skip` e o motivo no nome, e liste a ambiguidade no relatório.
4. Rode `npx tsc -p tsconfig.json --noEmit` e `npx eslint --max-warnings 0 <seu arquivo>` e deixe verdes (o vitest vai falhar com "não implementado": diga isso no relatório e não tente "consertar").
5. Não altere nenhum outro arquivo. Textos em português. Máximo 420 linhas (se passar, divida em `montarFila.cego2.test.ts`).

## Especificação (copiada da ficha do implementador; ignore as partes sobre implementar e sobre arquivos permitidos)

## Contexto
Uma fila é uma sequência de módulos lado a lado, com o fundo na face de uma parede e a frente para o lado livre, fechando um vão (cozinha em linha, armários de um quarto). Já existem as peças: `preencherVao`, `ajustarLarguras`, `posicoesDaFila` (`packages/engine/src/componentes/encaixeFila.ts`), `facesDasParedes` (`encaixeProjeto.ts`), `resolverFamilia`/`resolverComponente`, e o conjunto (`ComponentGroup` com `linha`, comando `upsertComponentGroup`). Falta a função que, dado um pedido, devolve os componentes e o conjunto prontos para o projeto. Leia: `encaixeTipos.ts` (convenções: LEIA INTEIRO, em especial `PosicaoNaFila`), `encaixeFila.ts`, `encaixeProjeto.ts`, `instancia.ts`, `packages/model/src/types.ts` (`Component`, `ComponentGroup`), `packages/model/src/familia/tipos.ts` (`Parametro` com `min`/`max`; a LARGURA do módulo é o parâmetro de id `L`, em mm; a profundidade é `P`).

## Faça
1. Arquivo novo `packages/engine/src/componentes/montarFila.ts` (exportado em `index.ts`), função pura `montarFila(p: Project, pedido: PedidoDeFila): ResultadoDeFila`:
   - `PedidoDeFila`: `{ levelId: Id; face: FaceDeParede; inicio: number; comprimento: number; modulos: Array<{ familyId: Id; typeId: Id | null; largura?: number }>; preencher: boolean; nome?: string; idBase: string }`. `inicio` e `comprimento` em metros ao longo da face a partir de `face.a`. `largura` (m) é opcional: ausente = a largura do tipo (valor de `L` resolvido, em mm ÷ 1000).
   - `ResultadoDeFila`: `{ componentes: Array<Omit<Component, 'order'>>; grupo: ComponentGroup; larguras: number[]; painel: number; sobra: number; avisos: string[] }`.
   - Regras: resolve a largura de cada módulo (família ausente do projeto: aviso e módulo ignorado); com `preencher` verdadeiro, usa `ajustarLarguras` (limites `[min, max]` do parâmetro `L` em metros, ou a própria largura quando o parâmetro não tem faixa) para redistribuir a diferença entre `comprimento` e a soma das larguras; o que sobrar além dos limites vira `painel` (cabe se estiver entre 0,02 e 0,15 m, senão fica em `sobra` e há aviso). Cada componente recebe `values: { L: <largura em mm> }` quando a largura mudou em relação ao tipo, `typeId` do pedido, pose de `posicoesDaFila(a', b', larguras, profundidade)` onde a' = ponto da face a `inicio` de `face.a` na direção de `face.a → face.b`, b' = a' + `comprimento` na mesma direção, e `profundidade` = a profundidade do primeiro módulo (valor de `P` em mm ÷ 1000); `z` = 0; ids = `idBase` + `_1`, `_2`...; `mark` vazio. O grupo tem `id = idBase`, `nome` (padrão "Fila"), `levelId`, `membros` na ordem dos módulos e `linha: { a: a', b: b' }`, `regras: ['alinhar-frente']`.
   - Comprimento ≤ 0, módulos vazios ou face degenerada: resultado vazio com aviso (sem lançar).
   - Determinística.
2. Função auxiliar `larguraDoModulo(p, familyId, typeId): { largura: number; min: number; max: number } | null` (m), em `montarFila.ts`, exportada.
3. Testes (`montarFila.test.ts` NOVO; use `FAMILIA_ARMARIO` com os tipos `A60` (L=600) e `A80` (L=800); tolerância 1e-9; confira cada pose pelo retângulo de `retanguloNoMundo`):
   - Face de (0,0) a (4,0) (livre y>0), `inicio` 0, `comprimento` 2.0, módulos [A60, A80, A60] com `preencher: false`: larguras [0.6, 0.8, 0.6] (soma 2.0), 3 componentes, sem painel; o fundo de cada um fica em y = 0 e a frente em y = profundidade; os trechos em x são [0,0.6], [0.6,1.4], [1.4,2.0]; grupo com `linha` de (0,0) a (2,0).
   - `inicio` 0.5: a fila começa em x = 0.5.
   - `preencher: true`, `comprimento` 2.2 com [A60, A80, A60] e `L` do armário com faixa `min 300`/`max 1200`: as larguras passam a somar exatamente 2.2 (cada uma dentro da faixa) e os `values.L` correspondem.
   - `preencher: true` com `comprimento` 5.0 e os mesmos três módulos (faixa máxima insuficiente): `sobra` ou `painel` > 0 e há aviso.
   - Família inexistente: aviso e o módulo ignorado; os outros ficam; `membros` só com os criados.
   - Comprimento 0 ou módulos vazios: resultado vazio com aviso.
   - Face na vertical (de (0,0) a (0,4), livre x<0): fundo em x = 0 e frente em x = −profundidade.
   - Determinismo.
   - Aplicar o resultado a um projeto com `addComponent` (um por componente) e `upsertComponentGroup`: o projeto fica válido (todos os `groupId` coerentes) e `resolverComponente` não acusa erro.
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/engine/src/componentes` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.


## Arquivos permitidos
`packages/engine/src/componentes/montarFila.cego.test.ts` (NOVO) e, se passar de 420 linhas, `montarFila.cego2.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Contradição na especificação: PARE e relate.

## Entrega
Um commit (`test(componentes): testes cegos de montarFila e larguraDoModulo`) e o relatório pedido nas regras, mais a lista de ambiguidades.
