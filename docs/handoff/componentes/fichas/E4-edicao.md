# Ficha E4-edicao — operações de edição da família (puras)

Base: branch `feat/familias-interface` (commit do contrato da E4).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O editor altera a família por funções puras sobre um rascunho (objeto mutável do immer), para o desfazer funcionar de graça.
Leia: `packages/model/src/familia/edicao.ts` (cada função tem a especificação completa em comentário: siga literalmente), `edicao.test.ts` (o aceite, bem detalhado), `tipos.ts`, `expressao.ts` (use `compilar`, `referencias`, `renomearNoTexto`, `imprimir`), `grafo.ts` e `validar.ts` (já prontos; os testes usam `validarFamilia` como juiz) e `exemplos.ts` (a família dos testes).

## Faça
1. Implemente todas as funções de `edicao.ts` mantendo assinaturas, constantes e comentários.
2. Regra de ouro: erro devolve texto em português e NÃO altera a família. Para garantir, faça TODAS as verificações antes de qualquer alteração, ou trabalhe numa cópia e só aplique no fim.
3. Crie funções auxiliares pequenas e reaproveitáveis (ex.: `idValido`, `idLivre`, `todasAsExpressoes(f)` que percorre cada fórmula da família devolvendo `{ onde, texto, gravar }`) em um arquivo novo `edicaoApoio.ts`: `usosDoNome` e `renomearParametro` usam o mesmo percurso (parâmetros, planos, peças incluindo contorno e usinagens, aninhados incluindo `valores`, ferragens). O formato de `onde` é o de `Problema.onde` em `validar.ts`.
4. Nunca lance: família com campos faltando (listas indefinidas) vira erro de texto ou resultado vazio.
5. Cada arquivo com no máximo 420 linhas.

## Arquivos permitidos
`packages/model/src/familia/edicao.ts` e novos `packages/model/src/familia/edicao*.ts` (sem `.test.ts`).

## Proibido
`edicao.test.ts`, `expressao.ts`, `tipos.ts`, `index.ts` e todo o resto.

## Aceite (o orquestrador roda)
`npx vitest run packages/model/src/familia/edicao.test.ts packages/model/src/familia/expressao.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate qual e por quê. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
