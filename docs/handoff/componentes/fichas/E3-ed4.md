# Ficha E3-ed4 — ações sobre peças no editor (criar, duplicar, espelhar, arranjar, promover cota)

Base: branch `feat/familias-interface` (editor migrado; operações de edição em `@hestia/model`).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
Hoje as peças só podem ser EDITADAS (campos de fórmula). Falta criar, duplicar, excluir, reordenar, espelhar, arranjar e promover uma medida a parâmetro. As operações puras já existem em `packages/model/src/familia/edicao.ts` (leia a especificação de `adicionarPeca`, `excluirPeca`, `duplicarPeca`, `moverPecaNaLista`, `espelharPecaEmX`, `arranjoLinear`, `promoverParaParametro`, `escreverCampo`). Toda alteração passa por `useFamilia.getState().executar(rotulo, receita)` (devolve `null` ou o motivo da recusa). Leia todos os arquivos de `apps/web/src/ui/familia/`, em especial `FamiliaPaineis.tsx` (navegador e propriedades da peça), `FamiliaFaixa.tsx` e `familiaStore.ts`.

## Faça
1. **Navegador da família** (árvore de Peças): barra de ícones pequenos sobre a lista com: Nova peça, Duplicar, Excluir, Subir, Descer, Espelhar em X (todos agem na peça selecionada; desabilitados sem seleção). Excluir pede confirmação inline ("Excluir 'Base'? Sim / Não"). Ao criar/duplicar/espelhar, a nova peça fica selecionada (o id novo é descoberto comparando as listas de ids antes e depois).
2. **Nova peça** (formulário em popover ao lado do botão, componente novo): Papel (select dos papéis de `PapelPeca`, com os rótulos em português), Nome (padrão = rótulo do papel), Id (padrão derivado do nome, único, editável), Eixo da espessura (x/y/z, com a dica da orientação do plano de cada um), Tamanho a, Tamanho b e Espessura (fórmulas, padrões coerentes com o papel: por exemplo lateral eixo x com a = `P`, b = `A`, espessura = `esp` se existir o parâmetro `esp`, senão `18`), Origem X/Y/Z (padrão `0`). "Criar" chama `adicionarPeca` e mostra a recusa no próprio popover.
3. **Propriedades da peça**, abaixo dos campos de fórmula, um grupo "Ações": "Arranjo linear…" (popover: eixo, n, passo → `arranjoLinear`), e ao lado de CADA campo de medida (origem, tamanho, espessura) um pequeno botão "→P" (título "Promover a parâmetro") que abre um popover com Id e Nome e chama `promoverParaParametro` (sem o botão em Repetir e Existe se). Depois de promover, o campo passa a mostrar o id do parâmetro.
4. **Nome da peça editável** (campo no grupo Identidade; mexe em `peca.nome` por `executar('Renomear peça', …)`) e Papel editável (select).
5. **Fabricação** na peça (grupo existente): Veio (a/b/livre), Material (texto livre de id de material ou de parâmetro chapa/material, com um select das opções que são parâmetros `chapa` ou `material`), e Fita nos 4 lados (norte, sul, leste, oeste, cada um com um campo de texto curto onde vazio = sem fita), tudo por `executar`.
6. **Atalhos** com o foco FORA de campo de texto, só com o editor aberto: Delete exclui a peça selecionada (com a mesma confirmação), Ctrl+D duplica.
7. Mensagens de recusa aparecem em uma faixa vermelha (`role="alert"`) no topo do painel de propriedades, limpa na próxima ação bem-sucedida.
8. Estilos em NOVO `familiaPeca.css`. Divida em componentes novos (`FamiliaPecaAcoes.tsx`, `FamiliaNovaPeca.tsx`, `FamiliaPromover.tsx`, `FamiliaFabricacao.tsx`…); nenhum arquivo passa de 420 linhas; `FamiliaPaineis.tsx` só ganha as inclusões necessárias.
9. Medidas formatadas precisam de `// units-ok: <motivo>` (portão `node scripts/check-units.mjs`).

## Arquivos permitidos
`apps/web/src/ui/familia/FamiliaPaineis.tsx` e novos `apps/web/src/ui/familia/FamiliaPeca*.tsx`, `FamiliaNovaPeca*.tsx`, `FamiliaPromover*.tsx`, `FamiliaFabricacao*.tsx`, `familiaPeca*.css`, `familiaPeca*.ts` (e testes novos `familiaPeca*.test.ts` para lógica pura que você extrair, como "id padrão único a partir do nome").

## Proibido
Os demais arquivos de `apps/web/src/ui/familia/` (outras fichas trabalham neles em paralelo: `FamiliaDialogos.tsx`, `FamilyEditor.tsx`, `Familia3D.tsx`, `FamiliaFaixa.tsx`, `familia.css`), `packages/**`, `crates/**`, `docs/**`. Se precisar de uma operação que não existe em `@hestia/model`, PARE e relate qual.

## Aceite (o orquestrador roda)
`tsc`, `eslint --max-warnings 0` nos arquivos, `npx vitest run apps/web`, `node scripts/check-units.mjs`, `check-boundaries`; depois o orquestrador abre o editor e confere: criar uma divisória, duplicar, espelhar a lateral, arranjar com n e passo, promover uma cota (ex. 80 da travessa) e ver o parâmetro aparecer em Flexionar; Ctrl+Z desfaz cada passo; Delete com confirmação.

## Critério de parada
Teste ou especificação contraditória: PARE e relate. Não altere `packages/`.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
