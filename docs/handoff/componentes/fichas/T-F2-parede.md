# Ficha T-F2-parede — testes CEGOS de `encaixarNaParede`

Base: `feat/familias-interface`.   Modelo: definido pelo orquestrador

## O que você faz
Outro executor está implementando `encaixarNaParede` em `packages/engine/src/componentes/encaixeParede.ts` e escrevendo os testes dele. VOCÊ escreve testes INDEPENDENTES, só a partir da especificação abaixo, para o orquestrador cruzar os dois. NÃO leia, NÃO implemente e NÃO altere `encaixeParede.ts` (neste worktree ele só lança "não implementado": os seus testes vão falhar aqui, e isso é esperado). Seus testes são validados depois, contra a implementação do outro.

## Regras
1. Escreva UM arquivo: `packages/engine/src/componentes/encaixeParede.cego.test.ts` (vitest; importe de `./encaixeParede.ts` e de `./encaixeTipos.ts`; para geometria pode usar `retanguloNoMundo` de `./encaixeColisao.ts`, que já está pronta).
2. Cubra TODOS os casos numéricos da especificação e acrescente pelo menos 6 casos seus: bordas, simetria (espelhar a cena deve espelhar o resultado), idempotência, determinismo, entradas vazias, valores no limite da tolerância. Calcule os valores esperados À MÃO a partir da especificação e das convenções de `encaixeTipos.ts`, com a conta escrita num comentário curto ao lado de cada `expect`. Não calcule o esperado chamando a função testada.
3. Se a especificação for ambígua num ponto, NÃO invente: escreva o teste com `it.skip` e o motivo no nome, e liste a ambiguidade no relatório.
4. Rode `npx tsc -p tsconfig.json --noEmit` e `npx eslint --max-warnings 0 <seu arquivo>` e deixe verdes (o vitest vai falhar com "não implementado": diga isso no relatório e não tente "consertar").
5. Não altere nenhum outro arquivo. Textos em português. Máximo 420 linhas (se passar, divida em `encaixeParede.cego2.test.ts`).

## Especificação (copiada da ficha do implementador; ignore as partes sobre implementar e sobre arquivos permitidos)

## Contexto
Leia: `packages/engine/src/componentes/encaixeTipos.ts` (contrato e convenções: LEIA INTEIRO), o esqueleto do seu arquivo, `instancia.ts` (a mesma transformação local→mundo) e `docs/handoff/componentes/PLANO-MODELAGEM-FLUIDA.md` (F2). Implemente `encaixarNaParede` em `encaixeParede.ts` (substitua o `throw`; a assinatura e o comentário já estão lá). Use `retanguloNoMundo` de `encaixeColisao.ts` para conferir geometria nos testes.

## Faça
1. Implemente a função: acha, entre as faces com o centro do móvel do lado LIVRE (esquerda de a→b) e a projeção do ponto central do fundo caindo dentro do segmento (tolerância 1 mm), a de menor distância do fundo até a face; se `distancia > distanciaMax` devolve null. Gira o móvel para o fundo ficar paralelo à face com a frente para o lado livre: `rotation = atan2(−d.y, −d.x)` (d = direção unitária de a→b), normalizado para (−π, π]; encosta o fundo na face preservando a posição do CENTRO do móvel ao longo da face (a projeção do centro em d não muda). `mirrored` e `z` não mudam. O centro do móvel é o centro do retângulo local (min+max)/2.
2. Testes em `encaixeParede.test.ts` (NOVO), todos numéricos, tolerância 1e-9:
   - Face a=(0,0)→b=(4,0) (sólido em y<0, livre y>0); caixa min [0,0,0] max [0.8,0.56,0.72]; pose (2.0, 0.7, rotation 0.1, mirrored false, z 0): depois do encaixe os dois cantos de TRÁS (local y = 0.56) do `retanguloNoMundo` têm y = 0 (|y| < 1e-9), os da FRENTE têm y = 0.56, e o x do centro do retângulo é igual ao de antes do encaixe.
   - Mesma situação com `mirrored: true`: continua encostado e `mirrored` continua true.
   - Fundo a 0,5 m da face com o padrão (0,30): null; com `distanciaMax` 0,6: encaixa; `distancia` reportada é a de antes (≈ 0,5).
   - Duas faces (uma em y=0 e outra em x=0 com o livre em x>0: escolha a orientação de a→b que deixa o livre à esquerda e confira): escolhe a mais próxima, `face` é o índice dela.
   - Móvel com o centro no lado SÓLIDO da face é ignorado (null).
   - Projeção fora do segmento (móvel além do fim da face) é ignorada.
   - Idempotência: encaixar o resultado de novo devolve a mesma pose (tolerância 1e-9) e `distancia ≈ 0`.
   - `z` preservado; rotação sempre em (−π, π].
3. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova.


## Arquivos permitidos
`packages/engine/src/componentes/encaixeParede.cego.test.ts` (NOVO) e, se passar de 420 linhas, `encaixeParede.cego2.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Contradição na especificação: PARE e relate.

## Entrega
Um commit (`test(componentes): testes cegos de encaixarNaParede`) e o relatório pedido nas regras, mais a lista de ambiguidades.
