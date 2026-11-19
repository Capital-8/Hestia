# Ficha F2-parede — encaixar o móvel na parede

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

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
`packages/engine/src/componentes/encaixeParede.ts`, `packages/engine/src/componentes/encaixeParede.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
