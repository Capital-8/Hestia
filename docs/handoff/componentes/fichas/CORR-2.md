# Ficha CORR-2 — controles que faltam na paleta de peças e aviso do plano de corte

Base: `feat/familias-interface`.   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O QA achou: (a) na paleta de Nova peça, "Módulo aninhado" tem selo "novo" e não cria nada; "Contorno poligonal" e "peça vazia" não têm controle na interface; (b) o plano de corte da Cama com baú deixa 4 peças de fora ("Não couberam") sem destaque nem sugestão. Leia `docs/handoff/componentes/QA-2026-11-03.md`, `apps/web/src/ui/familia/FamiliaNovaPeca.tsx`, `FamiliaPeca*.tsx`, `familiaPecaAviso.ts`, `FamiliaListaCorte.tsx`, `familiaLista.ts`, `packages/model/src/familia/{tipos.ts (Peca.contorno, Peca.vazio, Aninhado), edicaoPecas.ts, edicao.ts}` e `packages/engine/src/componentes/planoCorte*.ts`.

## Faça
1. **Peça vazia**: caixa "Vazio (subtrai dos sólidos)" no painel da peça (`peca.vazio`), com desfazer.
2. **Contorno poligonal**: editor simples no painel da peça: lista de vértices (x, y como o tipo `Contorno` permite), adicionar/remover/reordenar vértices, "Remover contorno" (volta ao retângulo); valida mínimo 3 vértices e recusa com motivo. A malha 3D e o motor já suportam contorno.
3. **Módulo aninhado**: na paleta de Nova peça, "Módulo aninhado" abre um diálogo com a lista de famílias da biblioteca (`BIBLIOTECA_BASE` + as do projeto, exceto a própria), campo de nome, tipo da família, origem (x, y, z como fórmulas) e rotação (0, 90, 180, 270); cria o `Aninhado` com `valores` vazios. Remova o selo "novo" dos três itens quando funcionarem. Se `edicaoPecas`/`edicao.ts` não tiver operação para aninhado (procure `adicionarAninhado`), PARE e relate (o modelo é do orquestrador).
4. **Plano de corte**: peças que "não couberam" aparecem em destaque NO TOPO do plano (cor de aviso, lista com nome, medida e motivo) e com uma dica: "Troque a chapa ou reduza o refilo/permita girar a peça" (texto adaptado ao motivo quando o veio travar a rotação). Função pura de texto em arquivo novo e testada.
5. Testes de lógica (puros) para cada item que tiver lógica nova; `npx vitest run apps/web` sem regressão.
6. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, e os testes da ficha. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`; sem dependência nova.

## Arquivos permitidos
`apps/web/src/ui/familia/{FamiliaNovaPeca.tsx, FamiliaPeca*.tsx, FamiliaListaCorte.tsx, familiaPecaAviso.ts, familiaLista.ts}`, novos `apps/web/src/ui/familia/familia{Contorno,Aninhado,Corte}*.ts[x]` e CSS novo, testes novos ao lado.

## Proibido
`packages/**`, `crates/**`, `docs/**`, `FamiliaUsinagem*`, `FamiliaTipos.tsx`, `FamiliaCatalogo*`, `FamiliaParametros*` (são da CORR-1), testes existentes, snapshots.

## Critério de parada
Teste contraditório com a especificação, ou necessidade de mudar arquivo fora da lista: PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras (últimas linhas dos comandos, decisões, o que ficou de fora).
