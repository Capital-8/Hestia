# Retomada: móveis no branch de teste 0.2.5

Branch: `teste/0.2.5-com-moveis` (worktree `~/hestia-wt/i025-moveis`), criado de `integracao/0.2.5` (f385780d) com o merge de `origin/feat/familias-caixaria-3d` (15318e6f). Sem push, sem tag, sem mexer em `release/0.2.5`, `integracao/0.2.5`, PR #41 ou docs/releases.

## O que foi mesclado

A frente de móveis inteira: paleta Biblioteca, ferramenta Componente (colocar, escolher, mover, girar com R, espelhar com M), copiar/colar, encaixe na parede e nos vizinhos, gizmo 3D, agrupar/desagrupar, montar fila, propriedades da instância, orçamento, DXF (`dxfComponentes`, `dxfPecas`) e IFC (`ifcComponentes`), corte/elevação dos componentes. O kernel (`packages/geom`, `crates/`) não foi alterado pela frente de móveis: o diff contra a integração nessas pastas é vazio.

## Conflitos (43 arquivos) e como foram resolvidos

Regra geral: base da integração (i18n, multipainel `paneState()`, terreno, cortina, estrutural, massa, texturas) e os pontos de extensão de componente somados por cima.

- model: `types.ts` (Element ganha `Component`; `isComponent`), `commands.ts`, `index.ts`, `elementLevel.ts` (componente entra em `hasLevel` e acompanha a mudança de nível por `z`), `history.ts`/`historyRotulos.ts` (a integração moveu `labelOf` para `historyRotulos.ts`; os rótulos dos comandos de componente entram lá via `componentCommandLabel`).
- engine: `index.ts` (exporta `componentes/`), `section.ts` (`sectionOfComponents` ligado ao corte novo, depois das estruturais).
- io: `index.ts`, `ifcExport.ts` (`addComponents` ao lado de `addTerrenos`), `ifcGeneric.ts` (assinatura da integração de `faceSetOf`).
- render: `scene3d.ts` (sólidos e arestas dos componentes; material cai em `MATERIAIS_DE_COMPONENTE`), `materiais3d.ts` (material funde as duas frentes de textura: a textura do catálogo online tem prioridade; os mapas procedurais do mobiliário valem só quando o material não tem textura do catálogo), `section/build.ts`, `section/pick.ts`, `plan/planOverlay.ts`, `selecaoPorCaixa3d.ts` (versão da integração, que já resolve a esquadria virtual da cortina), `index.ts`.
- tools: `clipboard.ts` (buffer ganha `components`, `componentFamilies`, `groups`; colar leva a família e os conjuntos inteiros; resultado do colar com os ids de todas as categorias mais `componentIds`), `pasteTool.ts`, `selectTool.ts` (clique em componente seleciona o conjunto; subelemento da cortina preservado), `registry.ts`, `shortcutDefaults.ts` (CM e VC), `types.ts` (`onKey` da integração e `key` do Componente coexistem), `edit.ts` (novo `selectedComponents` em `selectedMovables`).
- web: `App.tsx`, `main.tsx`, `controller.ts` (espaço gira o encaixe do Componente; `tool.key` roda depois de `onKey`), `dxfExport.ts`, `typeActions.ts`, `OptionsBar.tsx`, `Properties.tsx`, `fields.tsx` (`title` do NumField), `ribbon/{actions,model,tabsMain}.ts`, `ViewportCanvas.tsx` (16 trechos: gizmo, prévia de bloco, arrasto de componente somados ao multipainel e à sombra adiada).
- Testes de esquema: ficaram com o valor da integração (29).
- Contratos novos da integração que exigem classificar todo `kind`: `component` entrou em `extensaoDoModelo` (entra pela pegada; teste com `FAMILIA_ARMARIO`), `contratoModificacao` (mover/colar sim; alinhar e corte com motivo escrito) e `contratoSnaps` (fonte nula com motivo). i18n: `tool_component` em pt/en e nos 5 idiomas de `base-core-1.ts`.

## Decisão sobre o esquema

A integração está em 29; a frente de móveis usava 25 para conjuntos e 24 para componentes. Não se renumerou nada: `SCHEMA_VERSION = 29`. A cadeia da integração (23 → 24 guarda-corpo, 24 → 25 cortina, ..., 28 → 29 terreno) ficou intacta. `componentFamilies`, `componentGroups`, `Component` e `groupId` são campos aditivos e opcionais: arquivo sem eles abre sem conversão. Consequência: um arquivo salvo aqui com móveis tem `schemaVersion` 29 e uma versão 0.2.5 sem móveis o abriria sem recusar (ignorando os componentes); o ganho de bloquear com 29 → 30 não compensa mexer na numeração da release. Se o dono quiser a trava, é uma migração `29: (raw) => ({ ...raw })` mais 30 nos 8 testes de esquema.

## Portões e resultados

- `npm ci`: ok.
- `npm run typecheck`: limpo.
- eslint nos 45 arquivos tocados/conflitados: limpo (App.tsx ganhou `eslint-disable max-lines` com justificativa).
- `check-boundaries`: ok.
- `check-units`: só falham os 3 arquivos que já falham na base (`pranchasEstabilidadeSuite.ts`, `pranchasFixture.ts`, `model3d/solids.ts`).
- vitest: `model/src/familia` 144 ok; `engine/src/componentes` 680 ok (15 skipped); `ui/familia` 191 ok; `ui/viewport` 17 ok; `render/src/familia` 21 ok; `tools/src`: 3045 de 3052 ok na primeira rodada; os contratos novos da integração (`contratoFerramentas`, `contratoModificacao`) foram corrigidos para o kind `component`; sobraram 3 falhas em `componentEncaixePlanta.test.ts` (arrasto até a parede não gira π nem encosta o fundo). Essas 3 JÁ FALHAM no branch `feat/familias-caixaria-3d` isolado (conferido num worktree de referência, depois removido): não vêm do merge. Causa provável: o teste espera encaixe a 0,57 m do fundo, acima da distância padrão de 0,22 m. Encaixe real na parede pelo arrasto da planta deve ser conferido à mão.
- `selectedMovables` NÃO inclui componentes de propósito: o Selecionar já os move por `ArrastoComponentes`; incluí-los moveria duas vezes (teste `componentSelect`/`componentGroupMove` falhou assim e voltou a passar ao desfazer a inclusão). Mover/Copiar/Girar/Espelhar da faixa (ferramentas move/copy/rotate/mirror) portanto não atuam em componentes; use o arrasto, o gizmo e as teclas R/M.

## O que NÃO foi verificado

- Nada foi aberto no navegador. Gizmo 3D, arrasto, encaixe, prévia e atalhos só foram conferidos por tipos e testes.
- Suíte completa, e2e, build de produção, wasm: não rodados.
- `ViewportCanvas.tsx`: os trechos vindos da frente de móveis ainda leem `useUi.getState()` em vários pontos (gizmo, prévia de bloco); com mais de um painel aberto, só o painel ativo é o alvo certo. Testar com um painel só primeiro.
- Os rótulos novos (`Properties`, ribbon) estão em português/inglês no estilo da frente de móveis, sem passar pelas chaves i18n da integração.
- Texturas: a fusão em `materiais3d.ts` não foi vista renderizada.
- Atalhos CM e VC não foram conferidos contra colisão em execução (só o teste de atalhos da pasta tools).

## Editor de famílias desativado

Nenhuma entrada leva ao editor: a ação `familyEditor` da faixa está `disabled` com `run: () => {}` (commit d7a08330); nada chama `useFamilia.abrir()` fora do próprio editor; `<FamilyEditor />` continua montado em `App.tsx` mas só renderiza com `aberta = true`, que nada liga. Para reativar: trocar a ação `familyEditor` em `ui/ribbon/actions.ts`.

## Roteiro curto de teste manual

1. Faixa Arquitetura, painel Construir: ver Componente, Biblioteca, Agrupar/Desagrupar, Editor de famílias (cinza), Orçamento, Fila.
2. Biblioteca: abrir a paleta, clicar num armário; mover o cursor na planta (prévia tracejada) e clicar para colocar. Repetir arrastando da paleta para o 3D.
3. Girar: com o Componente ativo, R gira 90 graus, Shift+R ao contrário, M espelha, Espaço alterna o encaixe. Selecionado, o gizmo 3D gira e move.
4. Mover/encaixar: arrastar o móvel até uma parede (encosta) e até outro móvel (alinha/encaixa); Alt solta o encaixe.
5. Copiar/colar (Ctrl+C, Ctrl+V) e Ctrl+Z em cada passo.
6. Agrupar dois móveis e mover um: o conjunto todo acompanha; Desagrupar.
7. Fila: selecionar uma parede reta, Fila, montar 3 módulos.
8. Propriedades: mudar L/A/P do móvel e ver o 3D atualizar.
9. Orçamento: abrir e conferir peças e custo.
10. Exportar DXF e IFC da planta com móveis (camada COMPONENTES; IfcFurniture).
11. Salvar, recarregar e ver os móveis voltarem; conferir que terreno, telhado e multitelas continuam funcionando.

## Pendências

- Decidir sobre a trava de esquema (29 → 30).
- Migrar os pontos `useUi.getState()` do `ViewportCanvas` para `paneState()` (multitelas).
- Trocar os textos fixos por chaves i18n.
- Reativar o editor de famílias quando o gizmo estiver final.
- O estado de 17/11 de `docs/componentes-familias/PROGRESSO.md` segue desatualizado (data de 06/11).

## Cor e snaps (ficha moveis-cor-snaps)

- Planta `shaded`: o móvel pinta a pegada na cor do acabamento do corpo (`acabCorpo`), as frentes de porta/gaveta na cor de `acabPorta` e o tampo na de `acabTampo` (mesma resolução do 3D: `resolverMaterialVisualPeca` + `MATERIAIS_DE_COMPONENTE`). `hiddenLine` mantém o cinza de antes e `wireframe` só linhas. `consistentColors` não existe na planta/corte (3 estilos), então cai em `hiddenLine`; nenhum estilo realista foi criado.
- Aéreo (zMin >= 1,10 m): segue tracejado; em `shaded` ganha um véu na cor do corpo (alpha 0,25), emitido ANTES dos fills de piso para nunca cobrir os balcões (os fills dos balcões vêm por cima e os traços de todos por último).
- Corte/elevação: já usava a cor do acabamento (`materialComponente`); conferido por teste em shaded (cor literal), hiddenLine (cor esmaecida rumo ao papel) e wireframe (sem fill). Categoria gráfica `generic`: hachura e contorno seguem as demais camadas.
- Snaps na planta: novo `packages/tools/src/moveisSnapPlanta.ts` (`moveisSnapIndex`, `SnapIndexado` por projeto e nível, ligado em `ToolBase.ctx` junto do `componentSnapIndex`; NÃO tem relação com o `componentSnap` de escada/rampa nem com o encaixe). Pontos: cantos (endpoint) e meios (midpoint); arestas: nearest/perpendicular, da pegada, frentes, tampo e recortes. `hostId` = id do componente, então `ignore` e ocultar na vista funcionam; `endpoint`/`midpoint`/`faces` são respeitados.
- Corte: o índice já recebia os contornos (cortados e `beyond`), mas sem dono: `sectionOriginId` ignorava `componentId`. Corrigido (e região com várias origens do mesmo dono agora tem dono), então ignore/ocultar valem para o móvel no corte.
- Limites: o meio da frente cai na fresta entre duas portas, onde o canto da porta (a 2 mm) vence; peças internas (laterais, prateleiras) só aparecem no corte, não na planta; contornos de usinagem que não sejam recorte retangular de tampo não são capturados; a elevação/corte só enxerga o que o motor deixa visível (oclusão).
- A mão: planta em Sombreado com armário de acabamentos diferentes (cor do corpo, portas e tampo); aéreo sobre balcão; Cota/Medir/Alinhar pegando canto, meio e aresta do móvel (planta, corte e elevação); arrastar o móvel sem capturar a si mesmo; desempenho com muitos móveis (teste automático com 300 passou).
