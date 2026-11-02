# Ficha E1-validar — validação estrutural da família

Base: branch `feat/familias-interface` (commit do contrato da E1).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Antes de salvar ou carregar uma família é preciso conferir estrutura, limites, fórmulas e referências. Esta fase NÃO avalia geometria.
Leia: `packages/model/src/familia/tipos.ts`, `expressao.ts` (use `compilar` e `referencias`), `grafo.ts` (use `ordemDeAvaliacao`; outra ficha o está implementando em paralelo — para o seu trabalho, assuma o contrato do esqueleto), `exemplos.ts`, `validar.ts` (esqueleto com as 8 REGRAS em comentário: siga-as literalmente, inclusive o texto de `onde`) e `validar.test.ts` (o aceite).

## Faça
1. Implemente `validarFamilia(f: Familia): Problema[]` em `validar.ts`. Como são 8 regras, divida em arquivos de apoio com prefixo `validar` (por exemplo `validarEstrutura.ts`, `validarParametros.ts`, `validarFormulas.ts`, `validarReferencias.ts`), cada um com no máximo 420 linhas; `validar.ts` só orquestra, na ordem das regras.
2. Entrada pode ser lixo (arquivo estranho): campos ausentes ou de tipo errado viram `Problema`, nunca exceção. Use verificações defensivas (`typeof`, `Array.isArray`).
3. Para a regra 8 (ciclo) use `ordemDeAvaliacao` de `./grafo.ts`; se o grafo ainda for esqueleto no seu worktree (lança 'não implementado'), capture a exceção apenas nessa regra para não derrubar o resto e deixe um comentário `// TODO: depende de E1-grafo`. O teste de ciclo só passará quando o grafo estiver integrado (o orquestrador integra as fichas antes do aceite final) — relate isso.
4. A família de exemplo (`FAMILIA_ARMARIO`) tem que dar lista VAZIA.

## Arquivos permitidos
`packages/model/src/familia/validar.ts` e novos `packages/model/src/familia/validar*.ts` (sem `.test.ts`).

## Proibido
`validar.test.ts`, `tipos.ts`, `expressao.ts`, `grafo.ts`, `exemplos.ts`, `index.ts` e todo o resto.

## Aceite (o orquestrador roda)
`npx vitest run packages/model/src/familia/validar.test.ts` verde (o teste de ciclo exige o grafo integrado), `tsc`, `eslint --max-warnings 0` nos arquivos, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer as regras: PARE e relate. Não altere testes.

## Entrega
Commits pequenos e o relatório das regras: diga, regra por regra (1 a 8), se implementou e se o(s) teste(s) correspondente(s) passam.
