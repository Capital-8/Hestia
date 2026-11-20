# Eixos da origem (planta e 3D)

- Cores: X vermelho #e5484d, Y verde #30a46c, Z azul #3e63dd (padrão de CAD e three.js), iguais nos temas claro e escuro. Origem = (0, 0, 0) interna do modelo (não usa `projectBasePoint`/`surveyPoint`).
- Planta: `packages/render/src/plan/origemEixos.ts`; entra na camada viva do quadro (`comEixosDaOrigem`, ligado em `ViewportCanvas.tsx` junto de `comEdicaoDoTerreno`). Eixos de 32 px na tela (0,48 m a 100 px/m), 1,5 px de espessura, rótulos X/Y e círculo azul de 4 px (Z). Só na tela: prancha, PDF, DXF e plotagem usam `buildPlanDrawList`, que não os conhece. Sem snap nem seleção (só desenho).
- 3D: `packages/render/src/model3d/eixosOrigem3d.ts`, grupo filho da cena (`ModelScene.eixosOrigem`), fora do modelo, do picking, do enquadramento e das exportações. Z para cima (a câmera orbital usa up = Z). Tamanho constante na tela (36 px, escala pela distância da câmera ou altura ortogonal a cada quadro), `depthTest: false`, `renderOrder` 1000, `raycast` vazio.
- Opção: "Eixos da origem" em Propriedades > Vista (`OrigemEixosRow` em `ViewOptionRows.tsx`), estado `useUi.showOrigemEixos`, padrão ligado, guardado no navegador (`hestia.origemEixos`); não está no arquivo do projeto (esquema 30 intacto). Para desligar: desmarcar a caixa. A cena 3D nasce com eixos desligados (prancha e miniaturas não os mostram).
- Não visto em tela: cores nos dois temas, direção do Z, legibilidade dos rótulos e das linhas de 1 px no 3D, comportamento em ortogonal e em vários painéis.
- `roofs.test.ts` (telhado em arco) falha na pasta plan; não toca em nada deste trabalho.
