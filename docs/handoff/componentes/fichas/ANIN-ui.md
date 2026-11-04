# Ficha ANIN-ui — criar, editar e excluir módulo aninhado pela interface (e conector novo válido)

Base: `feat/familias-interface`.   Nível 2

## Contexto
O QA achou: (a) na paleta de Nova peça, "Módulo aninhado" só troca a ferramenta da barra de status ("ainda não cria peças"), não há como escolher a família, nem listar ou excluir aninhados; (b) no diálogo Encaixe, "Adicionar conector" cria um conector com etiqueta vazia, que depois faz o arquivo da família NÃO reimportar ("a etiqueta precisa ser um texto não vazio"). O modelo já tem as operações `adicionarAninhado`, `editarAninhado`, `excluirAninhado` (contrato em `packages/model/src/familia/edicaoAninhados.ts`; outra ficha implementa o corpo: na sua cópia elas ainda lançam "não implementado", então os testes de interface devem usar funções puras e dublês; o orquestrador roda o conjunto depois de integrar). Leia: `apps/web/src/ui/familia/FamiliaNovaPeca.tsx` e `FamiliaPeca*.tsx` (como a paleta e o painel da peça funcionam), `familiaPecaAviso.ts` (`executarPeca`), `FamiliaEncaixeConectores.tsx` e `familiaEncaixe.ts` (como o conector novo é criado), `FamiliaJanela.tsx`, e `BIBLIOTECA_BASE` de `@hestia/model`.

## Faça
1. **Conector novo válido**: o botão "Adicionar conector" passa a criar com `lado: 'esquerda'`, `etiqueta: 'base'`, `aceita: []` e id livre (`conector_N` sem repetir), nunca com etiqueta vazia. A edição da etiqueta na célula que ficar vazia é recusada com o motivo ao lado (a linha volta ao valor anterior). Teste puro em `familiaEncaixe.test.ts` (acrescente casos; não altere os existentes).
2. **Diálogo de módulo aninhado** (`FamiliaAninhado.tsx` NOVO, lógica pura em `familiaAninhado.ts` NOVO): aberto pelo item "Módulo aninhado" da paleta Nova peça (troque o comportamento atual de só mudar a ferramenta; remova o selo "novo" do item). Campos: família (select com as famílias da biblioteca base e as do projeto aberto, exceto a própria família em edição), tipo da família (select; "Padrão" = ausente), nome (padrão = nome da família escolhida), id (gerado e livre; editável), origem x, y e z (texto de fórmula em mm, padrão `0`), rotação (select 0, 90, 180, 270; padrão 0). Criar chama `adicionarAninhado` por `executarPeca` (um passo de desfazer; a recusa aparece dentro do diálogo com o motivo). Depois de criar o diálogo fecha e a nova peça aparece resolvida no 3D.
3. **Lista de aninhados** no painel da família: onde o editor lista as peças ou o navegador da família (`NavegadorFamilia` em `FamiliaPaineis.tsx`), uma seção "Módulos aninhados" com cada um (nome, família), seleção (abre o diálogo em modo edição, `editarAninhado`) e botão Excluir (`excluirAninhado`, com desfazer). Mudanças mínimas em `FamiliaPaineis.tsx`.
4. **Testes puros** (`familiaAninhado.test.ts` NOVO): `familiasParaAninhar(...)` exclui a própria, mistura biblioteca e projeto sem repetir; `idLivreDeAninhado`; `montarAninhado(entrada)` (nome padrão, tipo padrão ausente, origem padrão, rotação em número); validação de entrada (nome vazio, família vazia) com motivo.
5. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run apps/web/src/ui/familia` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/familia/{FamiliaAninhado.tsx, familiaAninhado.ts, familiaAninhado.test.ts, FamiliaNovaPeca.tsx, FamiliaPaineis.tsx, FamiliaDialogos.tsx, familiaStore.ts, FamiliaEncaixeConectores.tsx, familiaEncaixe.ts, familiaEncaixe.test.ts}`, CSS novo `familiaAninhado.css`.

## Proibido
`packages/**`, `crates/**`, `docs/**`, qualquer outro arquivo, testes existentes (só acrescentar casos), snapshots.

## Critério de parada
Se `FamiliaNovaPeca.tsx` não permitir abrir um diálogo a partir do item: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
