# Ficha D6b — Detalhe da família como viewport da prancha

Modelo: **Sonnet 5.5** · Onda 8 · Depende de: D6, D4 · Base: `claude/lucid-euler-ddb7j6`

Leia primeiro `docs/familias-parametricas/REGRAS.md` e `CONTRATO.md` (§5). Vale o CONTRATO se algo aqui divergir.

## Contexto
A D6 deixou pronta a função pura `quadroDeDetalhe(detalhe, escala, origem?)` (engine; DetalheResolvido em metros → linhas e textos em mm de papel). A prancha não aceita ainda um viewport de detalhe de família: `SheetViewSource` (`packages/model/src/sheet.ts`) é uma união fechada (`plan | areaPlan | areaTable | section | 3d`) tratada em `packages/render/src/sheet/build.ts` (switch em `view.kind`), `packages/render/src/sheet/frame.ts`, `apps/web/src/editor/sheetInsert.ts` e em ~56 checagens de `view.kind` (descubra com `grep -rn "view.kind\|kind ===" packages apps/web/src --include=*.ts --include=*.tsx | grep -i sheet`). O viewport precisa guardar uma referência persistente à INSTÂNCIA do componente (ou à família + tipo + valores) e ao `detalheId`.

## Faça
1. Modelo: nova variante `{ kind: 'familyDetail'; componentId: Id; detailId: string; scale: number }` em `SheetViewSource` (campos aditivos; migração só avança a versão se o esquema exigir: se precisar subir `SCHEMA_VERSION`, 34 → 35 com a migração mais simples e atualize os testes de esquema e o hash do IFC sem plantas, como foi feito em 33 → 34).
2. Trate a variante em TODOS os pontos exaustivos que o `tsc` apontar (switches e checagens); onde não faz sentido (ex.: ferramenta de alinhar, recorte, vistas de planta), comporte-se como as vistas 'section' fixas ou ignore com comentário.
3. `render/sheet/build.ts`: ramo que resolve a instância (`resolverComponente`), chama `detalharFamilia` com o tipo e os valores da instância, `quadroDeDetalhe` na escala do viewport e desenha linhas/textos no quadro; mostre também a tabela de dimensões (`tabelaDaFamilia`) abaixo do desenho e os símbolos 2D do detalhe. Instância ou detalhe inexistente: quadro com aviso, sem exceção.
4. `sheetInsert.ts` e o botão "inserir no projeto" do `FamiliaDetalhePainel.tsx` (hoje desabilitado): insere o viewport na prancha ativa (ou cria uma) na escala do detalhe; ao mudar o tipo/valores da instância o quadro atualiza.
5. Testes: build do viewport (linhas e textos esperados para a caixa 1000 × 600 × 800 do teste de D4), instância inexistente, migração, e exaustividade. Roteiro de navegador `tests/e2e/familias-prancha.mjs` se o ambiente permitir (Chromium /opt/pw-browsers/chromium; app em `cd apps/web && npx vite --port 4700 --host 127.0.0.1`; encerre o seu vite).

## Aceitação
Detalhe de uma instância aparece numa prancha na escala pedida, com cotas e tabela, e atualiza ao mudar o tipo; suíte de pranchas sem regressão.

## Arquivos permitidos
- `packages/model/src/sheet.ts`
- `packages/model/src/types.ts` (só SCHEMA_VERSION, se preciso)
- `packages/model/src/migrate.ts`
- `packages/render/src/sheet/*.ts`
- `apps/web/src/editor/sheetInsert.ts`
- `apps/web/src/ui/sheet/*.ts`
- `apps/web/src/ui/familia/FamiliaDetalhePainel.tsx`
- `apps/web/src/editor/i18n/areas/familiasDetalhe.ts`
- `tests/e2e/familias-prancha.mjs` (NOVO)
- testes correspondentes (novos ou só acrescentar casos)

## Proibido
Tudo fora da lista (se o tsc exigir outro arquivo por exaustividade, edite só o necessário e relate); `crates/**`; `docs/**`. Não chame ferramentas fora da ficha.

## Parada
Contrato contraditório: PARE e relate.

## Entrega
Commits pequenos em português e o relatório de `REGRAS.md` §7.
