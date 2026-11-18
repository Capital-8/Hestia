# Ficha CORR-1 — correções de interface achadas pelo QA (2026-11-03)

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Testadores rodaram o editor de famílias e o componente no projeto no navegador e acharam falhas de INTERFACE que os testes unitários não pegam. O motor já limita os parâmetros à faixa `min`/`max` e devolve em `erros` a mensagem `valor X fora da faixa A a B; usado Y` (`onde: 'parametro:<id>'`). Leia o relatório em `docs/handoff/componentes/QA-2026-11-03.md` (seções de cada item) antes de começar. Código a ler: `ui/ComponentProperties*.tsx` e `ui/componentProp*` (painel da instância), `ui/familia/FamiliaParametros*.tsx`, `ui/familia/FamiliaTipos.tsx`, `ui/familia/FamiliaUsinagens.tsx` e `FamiliaUsinagemEditor.tsx`, `ui/familia/FamiliaCatalogo*.tsx`, `ui/ComponentOptionsBar.tsx`, `ui/familia/carregarNoProjeto.ts`, `ui/familia/familiaPecaAviso.ts`.

## Faça (um commit por item, com teste novo quando for lógica)
1. **Painel da instância** (`ComponentProperties*`): mostre os limites (`mín`/`máx` em mm, no `title` e ao lado do campo) dos parâmetros numéricos de instância. Valor digitado FORA da faixa ou NÃO numérico: NÃO grava e mostra aviso curto junto ao campo ("Fora da faixa: 200 a 1200 mm", "Valor inválido") até o próximo valor válido ou perda de foco. Teste: valor fora da faixa não altera `values`.
2. **Padrão de parâmetro no editor** (`FamiliaParametros*`): quando o valor digitado é recusado (texto, negativo, zero, fora da faixa mín./máx., vazio), mostre o motivo em aviso inline no próprio campo, como os campos mín./máx./passo já fazem. O campo volta ao valor válido DEPOIS de mostrar o aviso.
3. **Barra de status** (`ComponentOptionsBar.tsx`/ferramenta): ao ativar Componente com uma família já escolhida NÃO mostrar "Escolha uma família de componente."; e a mensagem de sucesso de "Carregar no projeto" (`carregarNoProjeto`) não pode ser sobrescrita de imediato pelo texto de ajuda da ferramenta (mostre a mensagem de sucesso por alguns segundos ou deixe o status como está até a próxima ação). Se a causa estiver em `packages/tools/**` (fora do escopo), PARE e relate.
4. **Usinagem inválida** (`FamiliaUsinagemEditor.tsx`/`FamiliaUsinagens.tsx`, `familiaUsinagem.ts`): diâmetro ≤ 0, profundidade ≤ 0 e furo fora da peça NÃO salvam nem fecham o editor; mostram o motivo dentro do editor da usinagem. Teste de `validarUsinagem`.
5. **Tipos** (`FamiliaTipos.tsx`): clicar na ★ só define o tipo PADRÃO; não troca o tipo corrente (`stopPropagation`). Teste simples se houver lógica; senão descreva no relatório.
6. **Catálogo** (`FamiliaCatalogo*.tsx`): id duplicado e valores negativos/zero em espessura, largura, comprimento e preço NÃO entram no catálogo: o campo fica marcado e o motivo aparece ao lado; o valor anterior permanece. Reaproveite `validarCatalogo` do modelo. Teste.
7. Rode `npx vitest run apps/web` sem regressão; `tsc`; `eslint --max-warnings 0` nos arquivos tocados; `check-boundaries`; `check-units`. Nada acima de 420 linhas; textos em português.

## Arquivos permitidos
`apps/web/src/ui/ComponentProperties*`, `apps/web/src/ui/componentProp*`, `apps/web/src/ui/ComponentOptionsBar.tsx`, `apps/web/src/ui/familia/**` (exceto `familiaStore.ts`), testes novos ao lado.

## Proibido
`packages/**`, `crates/**`, `docs/**`, `familiaStore.ts`, qualquer snapshot, testes existentes (não altere; se um existente contradizer, PARE e relate).

## Aceite (o orquestrador roda)
Testes novos verdes, `npx vitest run apps/web` sem regressão, tsc, eslint, boundaries, units; depois um testador reexecuta os roteiros do QA que falharam.

## Critério de parada
Se precisar mudar `packages/**`, PARE e relate o item. Teste contraditório: PARE.

## Entrega
Commits pequenos (`fix(componentes): …`) e o relatório pedido nas regras.
