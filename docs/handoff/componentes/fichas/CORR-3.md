# Ficha CORR-3 — folga inválida no painel de conectores e escolha órfã ao excluir peça

Base: `feat/familias-interface`.   Nível 2

## Contexto (achados do QA de 2026-11-04)
1. No diálogo Encaixe, aba Conectores, digitar uma fórmula inválida na **folga** (por exemplo `(`) grava a fórmula no modelo; só a validação acusa depois. As outras telas do editor recusam fórmula inválida ao salvar e mostram o erro junto do campo.
2. Excluir a última peça de uma zona deixa uma escolha apontando para uma `zona` sem peça: a família passa a ser inválida (`validarEncaixe` acusa) e o "Carregar no projeto" recusa.

## Faça
1. **Folga**: em `apps/web/src/ui/familia/FamiliaEncaixeConectores.tsx` (e funções puras em `familiaEncaixe.ts`: `validarFolga(texto, parametros): string | null`, devolvendo o motivo em português ou `null`), antes de gravar a folga confira com `compilar` de `@hestia/model` (veja como `FamiliaParametrosCampos.tsx` valida fórmulas e como mostra o erro inline) que a fórmula é válida e só referencia parâmetros existentes; inválida: NÃO grava, o campo fica marcado com o motivo até corrigir ou sair do campo com um valor válido. Vazio continua removendo a folga. Teste puro em `familiaEncaixe.test.ts` (acrescente casos; NÃO altere os existentes): `(`, texto enorme (10 000 caracteres), parâmetro inexistente, fórmula válida `L / 2`, vazio.
2. **Escolha órfã**: em `packages/model/src/familia/edicaoPecas.ts`, ao EXCLUIR uma peça (função de excluir peça), se depois dela alguma `escolha` ficou com `zona` sem nenhuma peça com esse `grupo`, remova essa escolha junto (e devolva `null` como sucesso; a mensagem de aviso não é necessária no retorno). Mesmo comportamento ao editar o `grupo` de uma peça para outro valor (`editarPeca` que muda `grupo`): escolhas cuja zona ficou sem peças saem. Teste novo `packages/model/src/familia/edicaoPecasEscolhas.test.ts` (NOVO), pelo `HistoricoFamilia.exec` (rascunho do immer): excluir a única peça da zona 'portas' remove a escolha `esc_nPortas` do armário; excluir uma peça de zona com outra peça NÃO remove; desfazer devolve a peça e a escolha juntas; a família continua válida (`validarFamilia` sem erros novos).
3. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run packages/model apps/web/src/ui/familia` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/familia/{FamiliaEncaixeConectores.tsx, familiaEncaixe.ts, familiaEncaixe.test.ts}`, `packages/model/src/familia/edicaoPecas.ts`, `packages/model/src/familia/edicaoPecasEscolhas.test.ts` (NOVO).

## Proibido
Qualquer outro arquivo, `crates/**`, `docs/**`, testes existentes (só acrescentar casos em `familiaEncaixe.test.ts`), snapshots.

## Critério de parada
Se a exclusão de peça estiver implementada em outro arquivo que não `edicaoPecas.ts`: PARE e relate onde.

## Entrega
Commits pequenos (`fix(componentes): …`) e o relatório pedido nas regras.
