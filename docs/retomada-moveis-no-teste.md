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

## i18n dos móveis (ficha moveis-i18n)

- Migrou: propriedades do componente, barra de opções, menu de contexto, Biblioteca (paleta e categorias), Montar fila, Orçamento do projeto (abas, resumo, CSV), listas de peças do orçamento (`FamiliaListaTabela`, `FamiliaListaCorte`), rótulos de desfazer, mensagens de encaixe/arrasto/soltura e os 17 rótulos da faixa (`ribbon-i18n-4.json`). Ao todo, 209 chaves novas.
- Chaves: shard `apps/web/src/editor/i18n/areas/moveis.ts` (prefixo `mov_`, PT/EN/ES/DE/FR/IT/PL), ligado em `i18n.ts`; helper `ui/moveisTextos.ts` (`tm` fora do React e `nomeDoAcabamento`, com `mov_acab_<id>` e nome PT do catálogo como fallback). Ids de acabamento e `c.values` não mudaram; `acabamentos.ts` ficou intacto.
- Status e desfazer com chave (`say('mov_…')`, `transaction('mov_undo_…')`): o `resolveText` da barra de status e da barra de título traduz no render. Único toque fora da UI: `packages/tools/src/componentTool.ts` (dois `say`).
- Sobrou fixo: editor de famílias desativado (`ui/familia/*`, exceto as listas acima, `FamiliaLista.tsx` e diálogos; ~560 literais no audit). Também X/Y/OK e o `var(--fam-porta)` (falso positivo). Migrar junto com a reativação do editor.
- Portões: typecheck limpo; `check-ribbon-i18n` 435/435 com tradução; `check-i18n-placeholders` só `pct_mullion_copy_name` (outra área, já existia); eslint limpo nos 19 arquivos; `check-units` só as 3 falhas antigas; `check-boundaries` ok; vitest (16 arquivos de móveis + i18n + faixa) verde; uma expectativa EN do menu mantida no texto original (`Duplicate to the Side`).
- Não verificado no navegador: troca de idioma na tela (só por testes e tipos); conferir FR/IT com aspas escapadas em um passe visual.
- Arrasto de móvel pelo Selecionar: os móveis ficam fora da captura (`ignore` de todos os componentes do projeto) só quando a seleção tem componente, para os cantos dos móveis (inclusive de outro conjunto) não puxarem o deslocamento; o encaixe segue sendo o de `ArrastoComponentes`. Arrastar escada/parede sozinha continua capturando os móveis.

## Importar móvel (ficha importador, 2026-11-18)

Merge de `integracao/0.2.5` (HEAD 20187757) no branch primeiro; depois o importador por cherry-pick.

### Fonte escolhida e por quê
- `origin/import/blocos-limpo` (commit `4bb5a36b` do importador, mais o ajuste `4ae90976` do teste de esquema 28 para 29). Ele já é "só o importador, sem a pilha de plugins 1.1 a 1.3" e sem `crates/` nem wasm: 113 arquivos, +9800 linhas, quase todos novos. Descartados: `import/moveis-na-main` e `origin/import/moveis-sobre-main` (152 arquivos, +13355; trazem `packages/plugin-api`, `docs/plugins`, `crates/hestia-renderer` e protocolo 1.1 a 1.3, fora desta ficha). `23f00d2a` (botão Componente da aba Arquitetura abrindo o fluxo de blocos) NÃO foi trazido: aqui "Componente" é a ferramenta da Biblioteca de famílias.
- O 3D do importador é TS/Three (`packages/render/src/model3d/furniture*.ts`, instâncias compartilhando geometria, versão leve em fatias); não depende de `crates/hestia-renderer`. Funciona na versão web.

### Conflitos (23 arquivos, todos aditivos)
`App.tsx`, `controller.ts` (Espaço gira o encaixe também para `furniture`; aviso de tamanho ao salvar), `i18n`, `state.ts` (diálogo `importFurniture`), `Properties.tsx` (FurnitureProps ao lado de ComponentProperties), `ViewportCanvas.tsx` (`moveis.aoAtualizar`), faixa (`model.ts`, JSON de i18n), `types.ts` (`Element` ganha `Furniture` ao lado de `Component`; `Material.category` ao lado dos blocos da decisão 0056), `commands.ts`, `historyRotulos.ts`, `scene3d.ts` (cena de móveis ao lado de `buildComponentSolids`; chave de nível mantém `versaoTexturas`), `pick.ts`, `selectTool.ts` (móvel importado vence o genérico e fica antes do componente), `registry.ts`, `shortcutDefaults.ts`, contratos (`extensaoDoModelo`, `contratoModificacao`, `contratoFerramentas`, `sheetTools.test`). Furniture (blocos de arquivo) e Component (família paramétrica) são dois kinds; nenhum foi fundido.
- Atalhos: `furniture` = `MO` e `VW`; `component` = `CM` e `VC`. Sem colisão com os existentes (teste de atalhos da pasta tools passa).
- Esquema: sem bump; `Project.furniture` é opcional e aditivo (SCHEMA_VERSION continua 29). Arquivo salvo com móveis é aberto por 0.2.5 sem móveis, que ignora o campo.

### O que foi desbloqueado
- Faixa Inserir, painel "Móveis": "Importar móvel", "Meus blocos" e "Colocar móvel" já são ações ativas (não `soon`). "Carregar família"/"Carregar como grupo" (painel Carregar da biblioteca) continuam `soon` de propósito (são o roteiro do Revit para .rfa, não o importador). Novo botão "Importar móvel" no topo da paleta Biblioteca (`data-testid=pal-importar`), abre o mesmo diálogo.
- O seletor aceita .skp, .glb, .gltf, .obj, .dae, .fbx e .zip, vários arquivos; diálogo com unidade/escala, nome, categoria e materiais; Worker (`importInWorker`, `buildAssetWorker`), a tela não trava.
- Colocar: ferramenta `furniture` (clique na planta ou no 3D; R gira 90° e Shift+R ao contrário, Espaço também, Tab espelha, Esc sai). Selecionar, apagar e desfazer; Mover/Copiar/Girar/Espelhar/Matriz da faixa agora levam o móvel (novo `transformFurniture` no comando `transform`, `selectedFurnitures`).
- Planta: contorno REAL da projeção da malha (casco convexo dos vértices de todas as peças, amostrado até 40 mil vértices por definição; antes era o retângulo da caixa). Seleção por clique e fantasma de mover usam o mesmo contorno. A caixa do modelo (zoom total) inclui o móvel.
- 3D: malha com cor/textura do arquivo (sombreado e realista pelos materiais do projeto).
- Orçamento: é o orçamento de TRIÂNGULOS da vista (chip na barra de status; versão leve acima do teto). Móvel importado NÃO entra no orçamento de peças/custo da Biblioteca de famílias (não tem peças nem preço).

### Formatos e limites
Leitores: glTF/GLB, OBJ, COLLADA e FBX próprios (FBX usa `FBXLoader` do three), SKP por OpenSKP. Aviso acima de 300 mil vértices por bloco e recusa acima de 600 mil (`IMPORT_LIMITS`); arquivo até 50 MB; textura até 8 MiB; asset aviso 40 MB / recusa 128 MB. ZIP: até 50 MB, 500 entradas, 200 MB descompactado, recusa `..` e caminho absoluto (zip-slip, teste `fmt.test.ts`) e ZIP dentro de ZIP.

### Licenças das dependências novas (NOTICE/LICENSING.md não editados)
`openskp` 1.3.0 MIT; `fflate` 0.8.3 MIT; `flatbuffers` 25.9.23 Apache-2.0; `earcut` 3.2.4 ISC; `three` (FBXLoader) MIT, já dependência do render. `NOTICE`/`LICENSING.md` hoje não listam nenhuma dependência de terceiros: Apache-2.0 do flatbuffers (inclui o texto da licença na distribuição) e a ISC do earcut pedem apenas manter o aviso; decisão do dono se um NOTICE de terceiros é necessário. Atenção: `packages/io` importa `fflate` mas só declara `openskp` (fflate vem hoisted por ele); declarar `fflate` em `packages/io/package.json` seria mais limpo (não alterado para não mexer no lockfile).

### Limites conhecidos
- Corte e elevação NÃO projetam a malha importada (só a caixa do modelo entra no enquadramento). Pendente.
- Ctrl+C/Ctrl+V não leva o móvel (o asset teria de viajar no buffer); use Copiar da faixa ou "Meus blocos".
- Textos novos de UI do importador existem nos 7 idiomas (`i18n/areas/furniture.ts`); a faixa passa em `check-ribbon-i18n`.
- Testes de `.skp` reais ficam pulados (sem arquivo de fixture).

### Roteiro de teste manual (app em http://localhost:4201 ou o servidor do branch)
1. Aba Inserir, painel Móveis, "Importar móvel": escolher um .glb (ou .obj/.skp/.zip) baixado. Conferir nome, escala (unidade do arquivo) e categoria; "Adicionar e colocar".
2. Na planta, mover o cursor (contorno tracejado), apertar R para girar 90°, clicar para colocar; Esc termina.
3. Ver o contorno do móvel na planta (formato real, não retângulo) e na aba 3D com cor/textura.
4. Selecionar o móvel e mover/girar/copiar pela faixa; Ctrl+Z desfaz cada passo.
5. Abrir a Biblioteca e usar o botão "Importar móvel" da paleta; "Meus blocos" lista os blocos para colocar mais cópias.
6. Salvar, fechar e reabrir: o móvel volta. Importar um arquivo muito grande para ver a mensagem de limite.

## Famílias novas (ficha "famílias novas da Biblioteca", branch `moveis/familias`)

- Mobiliário (+24): mesas de jantar retangular, redonda (64 lados), oval (pista de 66 pontos) e extensível (parâmetro Extensão aberta); mesa de centro, lateral, bancada alta, escritório reta, em L e com gavetas; aparador; conjunto de 2/3 mesas de centro e mesa com 2 a 8 cadeiras (aninhados com `repetir`, espaçamento automático); cadeira, cadeira com braços, banqueta, banco corrido, puff; sofá (2 a 4 lugares), sofá em L, poltrona; cama (solteiro a king) e beliche.
- Marcenaria (+6): closet aberto, nicho embutido, home office, bancada de banheiro com gabinete e cuba, painel ripado vertical com fundo e horizontal (variações do `fam_painel_ripado`, que já existia). Equipamentos (+11): geladeira (1 e 2 portas), fogão, cooktop, forno, micro-ondas, lava-louças, máquina de lavar, coifa, split, TV com suporte e TV com painel. Genéricos (+3): bloco em caixa, painel plano, perfil linear; `fam_modulo_branco` e `fam_bloco_livre` foram recategorizados para `generico`. Louças (+7): cuba de inox, cuba de embutir, bancada com recorte para cuba (`fam_bancada_recorte_cuba`, pois `fam_bancada_cuba` já existia na marcenaria), box reto e de canto, prateleira/porta-toalha, espelho com moldura.
- Decisões: as mesas vêm de UM gerador (`mesasGerador.ts`): enum `tipoTampo` (madeira 30, vidro 12, mármore e quartzo 20 mm) e enum `base` (4 pés, pedestal octogonal, cavalete, trapézio, cruz, laterais, prateleira); só as peças da escolha existem. O tampo escolhe o material (`mat_tampo`, `mat_vidro_incolor`, `mat_marmore`, `mat_quartzo`) e o acabamento da instância (`acabTampo`, `acabPorta`, `acabCorpo`) continua mandando por cima. Medidas nominais: mesa 0,75 m, assento da cadeira 0,45 m, geladeira 0,70 × 0,70 × 1,80 m.
- Acabamentos novos (nomes nos 7 idiomas, textura procedural): `comp_vidro_incolor`, `comp_vidro_bronze`, `comp_vidro_verde`, `comp_marmore_escuro`, `comp_madeira_clara`; materiais de peça novos mapeados em `resolverMaterialVisualPeca`: `mat_vidro_incolor/bronze/verde`, `mat_marmore`, `mat_quartzo`, `mat_madeira_clara`, `mat_estofado`, `mat_eletro`, `mat_ceramica` (tingíveis pelo acabamento da zona) e `mat_preto`, `mat_espelho` (fixos). Todo vidro do 3D (`comp_vidro_*`) não grava profundidade.
- Limites do editor: só chapas planas. Tampo redondo/oval é polígono; pedestal é octógono; sofá, poltrona, puff e cadeira estofada são blocos retos (sem estofado curvo); coifa é perfil trapezoidal; visor da máquina é octógono; sem bacia, lavatório de coluna, banheira, torneira nem escada do beliche (virão por importação de blocos).
- Testes: `packages/engine/src/componentes/familiasNovas.test.ts` (201 da bateria geral + 71 de caixas e detalhes), `apps/web/src/ui/paletaFamiliasNovas.test.ts`; alterado `biblioteca/conectores.test.ts` (as novas têm teste próprio) e a regra de dobradiças por altura passou a valer para as novas por construção.
- A ver em tela: abrir a Biblioteca em cada aba (nenhuma vazia), colocar mesa redonda de vidro e conferir a transparência incolor; trocar `Tipo de tampo` e `Base` nas propriedades; mesa extensível com extensão 600; mesa com 4 e com 8 cadeiras; sofá em L e beliche em 3D; geladeira, fogão e máquina (portas e botões); box de canto com acabamento de vidro bronze; espelho com moldura na parede; cuba na bancada (recorte); texturas dos 5 acabamentos novos.
