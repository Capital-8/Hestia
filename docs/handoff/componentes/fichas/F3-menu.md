# Ficha F3-menu — menu de contexto do componente (planta e 3D)

Base: `feat/familias-interface` (com CONJ-ui integrado).   Nível 2

## Contexto
Clicar com o botão direito num elemento abre o menu de contexto (`apps/web/src/ui/useCanvasContextMenu.ts`: `abrirMenuDeContexto`, `executaComandoDoMenu`; `apps/web/src/editor/contextMenu.ts`: `buildContextMenu`, `MenuEntry`, `ContextMenuCtx`; `ui/CanvasContextMenu.tsx` e `ui/PopupMenu.tsx`: a exibição). Já existe um exemplo de entradas acrescentadas por fora: `comEditarPerimetro(buildContextMenu(ctx), lang, editavel)` em `ui/perimeter/perimeterEditavel.ts` (e seu teste). Faça o mesmo para componentes. Pronto no modelo/ferramentas: `updateComponent`, `addComponent`, comandos de conjunto, `agruparSelecao`/`desagruparSelecao` (`@hestia/tools`), `FamiliaDoComponente`/`familiaDoComponente` (`@hestia/model`), `caixaLocalDoComponente` (`@hestia/engine`).

## Faça
1. Arquivo novo `apps/web/src/ui/componenteMenu.ts`: `comComponente(entradas: MenuEntry[], ctx: ContextMenuCtx, lang, componentes: Component[], familias): MenuEntry[]` que, quando a seleção é só de componentes (`ctx.selectionKinds` todos `'component'`), acrescenta (antes de "Excluir", num grupo separado por divisor, como as outras entradas fazem):
   - "Girar 90°" e "Girar −90°" (somam ±π/2 à `rotation` de cada selecionado EM TORNO DO PRÓPRIO ponto de inserção; com conjunto selecionado, em torno do centro do conjunto via `rotateComponentGroup`);
   - "Espelhar" (inverte `mirrored`; não use o comando de espelho padrão: é `updateComponent { mirrored: !mirrored }` por componente);
   - "Duplicar ao lado" (novo componente igual, ao lado direito, deslocado pela largura da caixa local no eixo local x girado pela rotação; id novo; mesma família/tipo/valores; marca vazia; fica selecionado);
   - "Tipo ▸" (para UM componente: uma entrada por tipo da família, marcando o atual; para vários da mesma família igualmente; aplica `typeId`);
   - "Agrupar" / "Desagrupar" (habilitados conforme a seleção, reaproveitando `agruparSelecao`/`desagruparSelecao`).
   Cada entrada tem id estável (`comp:rot90`, `comp:rotm90`, `comp:mirror`, `comp:dup`, `comp:tipo:<idDoTipo>`, `comp:group`, `comp:ungroup`), rótulos em português e em inglês seguindo o padrão do arquivo `contextMenu.ts`.
2. Ligue em `useCanvasContextMenu.ts`: em `abrirMenuDeContexto`, aplicar `comComponente` ao lado de `comEditarPerimetro`; em `executaComandoDoMenu`, tratar os ids `comp:*` chamando funções de `componenteMenu.ts` (`executarComandoDeComponente(id)`); tudo em UMA transação (um passo de desfazer) por comando. Mudanças mínimas nesse arquivo.
3. Testes puros em `componenteMenu.test.ts` (NOVO): entradas aparecem só com seleção de componentes; ids estáveis; "Tipo" lista os tipos da família e marca o atual; cada comando aplicado a um projeto de teste (famílias `FAMILIA_ARMARIO`): girar soma π/2 (ex.: 0 → π/2; π/2 → π, normalizado em (−π, π]), espelhar inverte, duplicar cria um componente a `largura` à direita (calcule a largura a partir de `caixaLocalDoComponente`), tipo troca `typeId`, desfazer volta tudo em um passo; seleção de conjunto gira em torno do centro (use `rotateComponentGroup`).
4. Gates: `npx tsc -p tsconfig.json --noEmit`, `npx eslint --max-warnings 0` nos arquivos tocados, `node scripts/check-boundaries.mjs`, `node scripts/check-units.mjs`, `npx vitest run apps/web` sem regressão. Nada acima de 420 linhas; textos em português; sem `any`/`eslint-disable`.

## Arquivos permitidos
`apps/web/src/ui/componenteMenu.ts` (NOVO), `apps/web/src/ui/componenteMenu.test.ts` (NOVO), `apps/web/src/ui/useCanvasContextMenu.ts` (mínimo), `apps/web/src/editor/contextMenu.ts` (só se precisar de um novo tipo de entrada ou rótulo; mínimo).

## Proibido
`packages/**`, `crates/**`, `docs/**`, `ViewportCanvas.tsx`, testes existentes, snapshots.

## Critério de parada
Se o formato de `MenuEntry` não permitir marcar a opção atual ou agrupar sob "Tipo ▸": faça a lista plana com "Tipo: <nome>" e relate; se precisar mudar outro arquivo, PARE e relate.

## Entrega
Commits pequenos (`feat(componentes): …`) e o relatório pedido nas regras.
