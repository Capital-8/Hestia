# Ficha E3-ed3 — 3D real no editor (three.js)

Base: branch `feat/familias-interface` (editor migrado; `VisualizadorFamilia` já existe em `@hestia/render`).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
A aba "Vista 3D" do editor ainda mostra um desenho oblíquo fixo em SVG (`Familia3D.tsx`). Troque por `VisualizadorFamilia` (`packages/render/src/familia/visualizador.ts`, exportado por `@hestia/render`): órbita, zoom, clique para selecionar, explodir, opacidade, corte e vistas rápidas. Leia: `visualizador.ts` e `logica.ts` (a API é pequena), `FamilyEditor.tsx`, `Familia3D.tsx` (contrato de props), `familiaStore.ts` (campos `explodir`, `opacidade`, `corte`, `detalhe`, `portas`, `sel`) e `FamiliaVista.tsx` (as vistas 2D continuam SVG).

## Faça
1. Reescreva `Familia3D.tsx` como wrapper React do `VisualizadorFamilia`:
   - cria o visualizador num `<canvas>` ao montar (useEffect) e `destruir()` ao desmontar; observa o tamanho do contêiner com `ResizeObserver` e chama `redimensionar`;
   - a cada mudança de `pecas` chama `definirPecas`; `sel` → `selecionar(índice da peça na lista resolvida)` (a seleção do store é o ID da peça; a lista resolvida pode ter várias com o mesmo id: realce todas as com o id selecionado se o visualizador permitir, senão a primeira; se precisar, descreva a limitação no relatório); `aoSelecionar(indice)` → `useFamilia.getState().selecionarPeca(pecas[indice].id)` (ou `null`);
   - `explodir`, `opacidade`, `detalhe` e `portas` e `corte` do store → `definirExplodir`, `definirOpacidade`, `definirDetalhe`, `definirCorte` (o `explodir` do store é número 0..1);
   - mapa de materiais `{}` por enquanto;
   - se `new WebGLRenderer` lançar (sem WebGL), mostre no lugar do canvas a mensagem "3D indisponível neste navegador (WebGL)" e as vistas 2D continuam funcionando.
2. Controles do 3D, em um componente NOVO `Familia3DControles.tsx` (barra sobre o canvas, canto superior esquerdo, discreta, com os tokens de cor do app):
   - botões de vista rápida: Iso, Frente, Lateral, Planta (chamam `vista(nome)` do visualizador — exponha-o por uma ref imperativa ou por um objeto de controle criado no wrapper);
   - Explodir (slider 0..1 ligado ao store, substituindo o checkbox atual da barra do editor), Opacidade (slider 0,1..1 ligado ao store), Corte: checkbox "Corte", select do eixo (X, Y, Z) e slider da posição de 0 até a dimensão da família no eixo (use a caixa envolvente das peças, `caixaEnvolvente` de `@hestia/engine`);
   - todos com rótulo, `aria-label` e foco visível.
3. Ajuste `FamilyEditor.tsx` o mínimo necessário: remova o checkbox "Explodir" antigo da barra de vistas (agora é o slider do 3D, que também vale para as vistas 2D? Não: as vistas 2D ignoram o fator), mantenha "Mostrar portas" e "Detalhe", e passe as props novas.
4. Estilos em NOVO `familia3d.css`. Nenhum arquivo passa de 420 linhas.
5. Desempenho: não recrie o visualizador a cada render; `definirPecas` só quando a lista resolvida mudar de referência (a store já memoiza `resolucaoCorrente`).

## Arquivos permitidos
`apps/web/src/ui/familia/Familia3D.tsx`, `apps/web/src/ui/familia/FamilyEditor.tsx` e novos `apps/web/src/ui/familia/Familia3D*.tsx`, `familia3d*.css`, `familia3d*.ts` (e testes novos `familia3d*.test.ts` para lógica pura que você extrair).

## Proibido
`packages/**` (se faltar método no `VisualizadorFamilia`, PARE e relate qual), os demais arquivos de `apps/web/src/ui/familia/` (outras fichas trabalham neles em paralelo: `FamiliaDialogos.tsx`, `FamiliaPaineis.tsx`, `familia.css`, `FamiliaFaixa.tsx`), `crates/**`, `docs/**`.

## Aceite (o orquestrador roda)
`tsc`, `eslint --max-warnings 0` nos arquivos, `npx vitest run apps/web`, `node scripts/check-units.mjs`, `check-boundaries`; depois o orquestrador abre o editor num Chrome com WebGL e confere: arrastar gira, roda dá zoom, clicar numa peça seleciona e o painel de propriedades acompanha, explodir separa as peças, opacidade deixa translúcido, corte atravessa o móvel, vistas rápidas enquadram.

## Critério de parada
Se algo da API do visualizador impedir um item, PARE e relate; não edite `packages/`.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
