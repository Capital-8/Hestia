# Ficha FERR-biblioteca — dobradiças por altura da porta nas famílias da biblioteca

Base: `feat/familias-interface`.   Nível 2

## Contexto
`Ferragem.quantidade` é uma fórmula (`packages/model/src/familia/tipos.ts`). Hoje as famílias da biblioteca usam quantidades fixas (ex.: `FAMILIA_ARMARIO`: dobradiça `4 * nPortas`, isto é 4 POR PORTA, 8 no A80), mesmo para portas baixas e altas. Regra de marcenaria: o número de dobradiças por porta cresce com a altura da porta: até 900 mm → 2; acima de 900 até 1600 → 3; acima de 1600 até 2200 → 4; acima de 2200 → 5. Aplique a regra aos arquivos de `packages/model/src/familia/biblioteca/` e `exemplos.ts`. A linguagem de fórmulas suporta `cond ? a : b` (veja `exemplos.ts`) e referência a parâmetros e derivados.

## Faça
1. Em cada família que tenha uma ferragem de id `dobradica` (procure no texto das ferragens): encontre a peça de `papel: 'porta'` (ou, na ausência, a de id `porta`); a ALTURA DA PORTA é a fórmula de `tamanho[1]` dessa peça (copie a expressão; se ela usa `i`, `n` ou outras variáveis só visíveis dentro da peça, crie um parâmetro derivado novo `hPorta` (fórmula = a mesma expressão, sem `i`/`n`) na família e use-o). Substitua a quantidade por `(hPorta <= 900 ? 2 : hPorta <= 1600 ? 3 : hPorta <= 2200 ? 4 : 5) * <número de portas>`, onde `<número de portas>` é a expressão que a família já usa hoje para multiplicar (o fator depois do `4 *`, p. ex. `nPortas`); mantenha o `quando` e as demais ferragens.
2. Famílias com DUAS portas de alturas diferentes (ex.: `FAMILIA_TORRE_FORNO`): some a regra de cada porta (cada uma com a própria altura). Famílias com `dobradica` mas SEM peça de porta própria (`FAMILIA_CANTO_L`, `FAMILIA_CAMA_BAU`) e a basculante (`FAMILIA_AEREO_BASCULANTE`) NÃO mudam: liste no relatório. Famílias sem ferragem `dobradica` não mudam. Famílias com portas basculantes ou de correr (veja `nome`/`papel`) que já tenham outra regra: não mexa e liste no relatório.
3. Teste novo `packages/engine/src/componentes/ferragensAltura.test.ts`: para cada família alterada (descubra varrendo `BIBLIOTECA_BASE` e `FAMILIA_ARMARIO`: as que têm `dobradica`), resolva com `resolverFamilia(..., { biblioteca: familiaDaBiblioteca })` e confira, para a altura de porta resultante, a regra (calcule o esperado no teste a partir da altura da peça `porta` resolvida: `extensao` em metros × 1000, sem copiar a fórmula); varie o tipo e, quando houver parâmetro de altura, os extremos; confira também que o armário `A80` (porta de 0,72 m) fica com 2 por porta = 4 e que uma altura de porta acima de 1600 mm dá 4 por porta (monte uma cópia da família com a altura alterada).
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/model packages/engine/src/componentes` sem regressão (a custo/lista de ferragens muda só onde a altura passa de 900 mm; se um teste existente fixar a quantidade antiga, PARE e relate o teste). Textos em português.

## Arquivos permitidos
`packages/model/src/familia/biblioteca/*.ts` (só ferragens e o parâmetro derivado `hPorta`), `packages/model/src/familia/exemplos.ts` (idem), `packages/engine/src/componentes/ferragensAltura.test.ts` (NOVO).

## Proibido
`tipos.ts`, geometria, outras fórmulas, testes existentes, `apps/**`, `crates/**`, `docs/**`.

## Critério de parada
Teste existente que quebre pela mudança de quantidade: PARE e relate.

## Entrega
Commits pequenos e o relatório pedido nas regras (liste as famílias alteradas e as não alteradas).
