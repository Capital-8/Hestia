# Ficha E3-visual — visualizador 3D da família (three.js)

Base: branch `feat/familias-interface` (commit do contrato da E3).   Modelo: opencode-go/deepseek-v4.1-flash

## Contexto
O editor de famílias precisa de um 3D de verdade: órbita, zoom, clique para selecionar, explodir, transparência, corte e vistas rápidas. A lógica pura vai em `logica.ts` (testada em Node) e a classe do three em `visualizador.ts`.
Leia: `packages/render/src/familia/logica.ts` e `visualizador.ts` (especificações completas em comentário: siga literalmente), `logica.test.ts` (aceite da lógica), `packages/engine/src/componentes/malha.ts` e `pecas.ts` (outra ficha implementa `malhaDasPecas` em paralelo: use pelo contrato), e `packages/render/src/model3d/orbit.ts` só para se inspirar. O pacote já tem `three` 0.180; use `three/examples/jsm/controls/OrbitControls.js` para a órbita.

## Faça
1. Implemente as 6 funções de `logica.ts` (aceite: `logica.test.ts`).
2. Implemente `VisualizadorFamilia` em `visualizador.ts`:
   - o sistema da família é Z para cima; configure `camera.up.set(0, 0, 1)`;
   - uma `Mesh` por peça (use `malhaDasPecas` e `geometriaDaMalha`: monte uma geometria por peça separando os triângulos pelo `pecaDoTriangulo`), `MeshStandardMaterial` com a cor de `corDaPeca`, `flatShading` ligado; vazias com `transparent: true, opacity: 0.35` e `depthWrite: false`;
   - seleção por `Raycaster` no clique (sem arrasto: compare a posição de `pointerdown` e `pointerup`, limite de 4 px); realce com `EdgesGeometry` azul (0x0078d4) na peça selecionada e `emissive` leve; `aoSelecionar` devolve o cancelamento;
   - explodir usa `deslocamentoDeExplosao` com o centro da esfera de enquadramento; opacidade e detalhe/portas (`pecaVisivel`) só mudam materiais e visibilidade, sem recriar geometrias;
   - corte usa `renderer.clippingPlanes` com um `Plane` pelo eixo e posição pedidos (mantém o lado de menor coordenada) e `localClippingEnabled`;
   - `vista(nome)` posiciona a câmera olhando para o centro da esfera, à distância de `distanciaDeEnquadramento`: 'iso' em (+0.8, −1.1, +0.7) normalizado, 'frente' em −Y, 'lateral' em +X, 'planta' em +Z (com `up` em +Y só nesta vista);
   - desenhe sob demanda (`requestAnimationFrame` só quando algo muda, inclusive nos eventos de `OrbitControls`);
   - `destruir` libera tudo e é idempotente.
3. Nenhum arquivo passa de 420 linhas: se precisar, crie `visualizadorCena.ts` ou `visualizadorSelecao.ts` (prefixo `visualizador`).

## Arquivos permitidos
`packages/render/src/familia/logica.ts`, `packages/render/src/familia/visualizador.ts` e novos `packages/render/src/familia/visualizador*.ts`.

## Proibido
Todo o resto, em especial `logica.test.ts`, `index.ts` da pasta, `packages/render/src/index.ts`, `packages/engine` e `packages/model`.

## Aceite (o orquestrador roda)
`npx vitest run packages/render/src/familia/logica.test.ts` verde, `tsc`, `eslint --max-warnings 0`, `check-boundaries`. Depois o orquestrador abre o editor no navegador e confere órbita, clique, explodir, corte e vistas.

## Critério de parada
Teste que pareça contradizer a especificação: PARE e relate. Não altere testes.

## Entrega
Commits pequenos (`feat(familia): …`) e o relatório pedido nas regras.
