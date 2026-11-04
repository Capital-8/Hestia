# Ficha F2-fila — preencher vão, ajustar larguras e posicionar a fila

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Leia: `packages/engine/src/componentes/encaixeTipos.ts` (contrato e convenções: LEIA INTEIRO), o esqueleto do seu arquivo, `instancia.ts` (a mesma transformação local→mundo) e `docs/handoff/componentes/PLANO-MODELAGEM-FLUIDA.md` (F2). Implemente `preencherVao`, `ajustarLarguras` e `posicoesDaFila` em `encaixeFila.ts`. Trabalhe internamente em inteiros de micrômetro (round(m × 1e6)) para não acumular erro de ponto flutuante e devolva metros arredondados a 1 µm.

## Faça
1. `preencherVao` conforme o comentário: busca exata por programação dinâmica ou enumeração limitada (no máximo 40 módulos; vão até 12 m); empates resolvidos pelo critério declarado e, por fim, lexicograficamente (determinismo). Painel sozinho (sem módulos) é permitido quando o vão cabe em [painelMin, painelMax].
2. `ajustarLarguras` conforme o comentário (soma exatamente `total` em µm quando couber nos limites: o resto de µm vai para o primeiro flexível, depois o segundo etc.).
3. `posicoesDaFila`: veja `PosicaoNaFila` em `encaixeTipos.ts` (leia com atenção: o x local corre no sentido de −d; origem local no ponto da linha a `inicio + largura` de `a`, deslocado `profundidade` à ESQUERDA de d).
4. Testes em `encaixeFila.test.ts` (NOVO), tolerância 1e-9:
   - `preencherVao(1.8, [0.6, 0.8])` = modulos [0.6, 0.6, 0.6], painel 0, sobra 0.
   - `preencherVao(1.5, [0.6, 0.8])` = modulos [0.8, 0.6], painel 0.1, sobra 0.
   - `preencherVao(0.1, [0.6])`: modulos [], painel 0.1, sobra 0.
   - `preencherVao(0.01, [0.6])`: modulos [], painel 0, sobra 0.01.
   - `preencherVao(0, [0.6])` e `preencherVao(1, [])`: casos de borda do comentário.
   - Determinismo: mesma entrada 3 vezes, mesma saída; ordem das larguras de entrada embaralhada dá o mesmo resultado.
   - `ajustarLarguras([0.6,0.6,0.6], [[0.4,0.8],[0.4,0.8],[0.4,0.8]], 2.0)`: soma exata 2.0 (em µm), cada uma entre 0.666666 e 0.666667.
   - `ajustarLarguras([0.6,0.6,0.6], [[0.6,0.6],[0.4,1.0],[0.4,1.0]], 2.0)` = [0.6, 0.7, 0.7].
   - Total além do máximo possível: todas no máximo; abaixo do mínimo: todas no mínimo.
   - Um flexível que bate no limite repassa o excedente aos outros (limites [0.5,0.65] e [0.4,1.0], total 1.5 com larguras [0.6,0.6]: [0.65, 0.85]).
   - `posicoesDaFila({0,0}, {4,0}, [0.6, 0.8], 0.56)`: índice 0: inicio 0, largura 0.6, pose x 0.6, y 0.56, rotation π, mirrored false; índice 1: inicio 0.6, largura 0.8, pose x 1.4, y 0.56. Confira também com `retanguloNoMundo` (de `encaixeColisao.ts`) que o fundo do móvel 0 fica em y = 0 e a frente em y = 0.56 e que x vai de 0 a 0.6.
   - Linha na vertical a=(0,0)→b=(0,4) (livre à esquerda = x < 0): rotation por `atan2(−d.y, −d.x)`; confira pelo retângulo que o fundo fica em x = 0 e a frente em x = −profundidade.
5. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova.

## Arquivos permitidos
`packages/engine/src/componentes/encaixeFila.ts`, `packages/engine/src/componentes/encaixeFila.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, snapshots.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
