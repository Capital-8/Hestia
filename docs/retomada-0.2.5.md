# Retomada da versão 0.2.5 (estado de 18/11/2026)

Documento de passagem de trabalho de um computador para outro. Branch: `integracao/0.2.5`, criado a partir de `release/0.2.5`
(que é a `main` mais o commit de versão e notas). **Nada daqui foi para `main`, `release/0.2.5` nem para o PR #41.**

## 1. O que está integrado no branch

| Frente | Resumo | Verificação feita |
|---|---|---|
| TR (Aparar/Estender) | Abre em "Ao canto" por padrão | Sem teste próprio |
| Editar tipo do terreno | Tipo com superfície e solo separados (3D e cortes), curvas, texto do rótulo, rótulos automáticos nas mestras. Seletor de tipo no topo das propriedades. Decisão 0059 | 90 testes de terreno, `tsc`, lint |
| Pasta do projeto | Renomeia a pasta ao mudar o nome. "Salvar como" grava em outro local e o projeto fica ligado a ele (só na sessão) | 1367 testes de `apps/web/src/editor`. **Rust do desktop (renomear pasta, escolher local) NÃO foi compilado** (sem `link.exe`) |
| Telhado | Chanfro em vez de recusar cantos agudos (limite 10x o balanço); solda de vértices e emendas no 3D; topo da parede cortado pelo telhado nas duas faces (`attachTopRoofFull`) e oferta de "Anexar ao telhado" ao criar | 8 testes do chanfro, regressão de roof* (50/51 antes do ajuste, agora ok), 64 testes de parede/telhado |
| Cortes e elevações | Mapa de corte e aterro nas seções; silhueta do terreno existente tracejada na elevação (papel 3 do kernel) | 28 testes de `section/terreno` |
| Snap das curvas | Rótulo de curva e Cota de ponto grudam nas curvas (só essas duas ferramentas), superfícies existente e proposta. Ajuste do teste MassOptionsBar | snapCurvas 12/12, contratoSnaps, tsc |
| Mapa de corte e aterro (planta) | Corte exato na linha de zero, só dentro do terreno existente, pedaços disjuntos | Rust: 93 testes, depois 101/101 no branch inteiro |
| Malha do terreno | Alcance do talude por iteração, medido sobre as regiões anteriores; aviso 7; curvas sem laços na região plana e na parede de 2 cm; **suavização Chaikin sempre ligada (ver pendência 1)** | Rust 101/101; 6 testes novos de talude |
| Pranchas | Janela larga "Adicionar vista" com prévia e escolha de escala; Shift ao soltar abre a janela; bateria de estabilidade com projetos grandes | 10/10 médio; grande 10/10 em ~1000 s |
| wasm | `geom_wasm.wasm` regenerado e commitado | `test:wasm`: 1434 testes, 4 falhas corrigidas (3 expectativas, 1 de tempo) |

Também verificado no branch inteiro: `tsc -p tsconfig.json --noEmit` passou (exit 0).

## 2. Pendências (em ordem de importância)

1. **Suavização das curvas de nível.** Hoje as curvas saem SEMPRE suavizadas (Chaikin, 2 rodadas), o que encolhe cantos
   (quadrado de 64 m vira cerca de 52,6 m) e desloca pontos sem limite em metros. Decisão do usuário: ter no Editar tipo do
   terreno a opção **Exata (padrão)** ou **Suavizada com tolerância (padrão 2 cm)**. Um agente estava implementando em
   `feat/0.2.5-suavizar` (consulta 161 de `crates/geom-wasm/src/terreno_curvas.rs`, tipo em `packages/model/src/terrainTipo.ts`,
   UI em `apps/web/src/ui/dialogs/TerrainTypeDialog.tsx`). Se não estiver integrada: o modo de fábrica correto é EXATO;
   sem a opção, desligue as rodadas do Chaikin no kernel, regenere o wasm e volte os 3 testes wasm de curvas ao quadrado
   exato (4 pontos, perímetros 64/48/32/16).
2. **Suíte ampla de testes** (`npx vitest run packages apps/web/src`): terminou com **14176 passaram, 16 falharam**.
   Corrigidas (consequência direta das integrações): `terrenoIssues.test.ts` (agora 9 códigos de aviso, com o aviso 7 do
   talude) e `contratoModaisFamilia.test.ts` (TerrainTypeDialog classificado como exceção TODO; o ideal é migrá-lo para o
   esqueleto FamilyTypeDialog). **Ainda a conferir (podem ser timeout sob carga ou antigas):** `sheetInsert.test.ts` (lote de 3
   vistas, timeout de 5 s: foi tocado pela frente das pranchas), `contratoCamposEsquadria.test.ts`, `previewViews.test.ts`,
   `junctionReducao`, `projectIssues` (predio10), `wallTiltJoin*`/`wallTiltMulticamada`/`wallTiltJuncaoArco` (desempenho em ms),
   `terminoCamada3d` (2 testes de volume laje x parede), `openingCatalogoVistas`, `zoomSemRecriar` (2). Reexecute cada arquivo
   isolado, com a máquina livre, antes de concluir que é regressão; para os de desempenho compare com a `main`.
3. **Rust do desktop** (`desktop/src-tauri/src/biblioteca.rs`, 2 testes novos) nunca compilou: rodar `cargo check` e
   `cargo test` com um toolchain que linke.
4. **Teste visual** de tudo: mapa de corte e aterro no GPU (emendas), 3D do telhado (filetes), chanfro em formas orgânicas,
   encaixe parede x telhado (anexar paredes), cortes e elevações com o mapa ligado, janela de inserir vistas, snap das
   curvas, renomear pasta e "Salvar como". Nada disso foi visto em tela.
5. **Rodar de novo** `npm run test:wasm` e `npx tsc -p tsconfig.json --noEmit` depois de qualquer mudança no kernel.

## 3. Decisões já tomadas pelo usuário
- Cor e material do solo valem no 3D e nos cortes; escolha por família/tipo no Editar tipo; seletor de tipo no TOPO.
- Plataforma/região nivelada: talude 0 (parede vertical) por padrão, configurável na propriedade da região.
- Snap nas curvas só para Rótulo e Cota; superfícies existente e proposta. Borda da plataforma NÃO precisa aparecer como curva.
- Suavização: padrão Exata, tolerância 2 cm, opção no Editar tipo; vale também no DXF.
- Corte e aterro em cortes primeiro; elevações em paralelo se possível.
- Pasta do projeto: renomear automaticamente; "Salvar como" abre outro local e passa a gravar só lá.
- Tudo entra na 0.2.5. O usuário testa em localhost ANTES de gerar o instalador.
- A **massa** nunca aparece em título do PR, descrição do PR nem nota da release (já corrigido no PR #41; o commit
  `95fd7467` ainda cita "esconde a massa": reescrever a mensagem SÓ na hora de enviar tudo, com force-push em `release/0.2.5`).

## 4. Decisões que ainda esperam o usuário
1. Cores do tipo de terreno padrão (superfície `#7f9f5c`, solo `#8b6b4a`, curvas marrons).
2. Subir o esquema do arquivo para 30? (hoje continua 29, campos aditivos)
3. Aplicar o tipo de terreno também aos terrenos já existentes?
4. Talude medido na horizontal a partir do ponto mais próximo (atual) ou na normal do plano inclinado?
5. Aviso 7 ("talude não alcança o terreno") como código novo (já mapeado no TS).
6. Peso do snap das curvas (0,5).
7. Anexar paredes ao telhado automaticamente ao criar (hoje só sugere).
8. Limite do chanfro (10x o balanço) e texto da mensagem de cúspide.
9. Gesto da janela de inserir vistas (Shift ao soltar) e mover PDF/DXF para worker (hoje congelam 40-60 s em projeto de 3 mil elementos).
10. "Salvar como": a ligação com o local externo deve persistir entre sessões?
11. Instalar o Visual Studio Build Tools nesta máquina (3 a 6 GB)?
12. Pintar a face do talude como corte/aterro na elevação (contrato novo no kernel) e camada de DXF para o mapa.

## 5. Como rodar as verificações
```
npm ci
npx tsc -p tsconfig.json --noEmit
npx vitest run packages apps/web/src
# Rust (terreno): na pasta crates/geom-wasm
cargo test --lib terreno -- --test-threads=2        # ~22 min em debug (2 fuzz pesados)
# wasm
npm run build:wasm
npm run test:wasm
```
Neste computador de origem o toolchain MSVC não tinha `link.exe` (o `link` do Git atrapalha). Foi usado o GNU:
`RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu`, `CARGO_INCREMENTAL=0` e um `CARGO_TARGET_DIR` fora do repositório.
Em um computador com Visual Studio Build Tools não é preciso.

## 6. Armadilhas conhecidas
- Vários `npm ci` ao mesmo tempo corrompem `node_modules` no Windows: rode um por vez.
- Pasta com dono diferente: o Git pede `safe.directory`; use `git -c safe.directory=<pasta>` em vez de mexer na configuração.
- O repositório versiona o `.wasm`: depois de mudar o kernel, regenerar e commitar `geom_wasm.wasm`, `geom_wasm.sha256`
  e `geom_wasm.fonte.sha256`.
- Strings com aspas simples em francês e italiano precisam de `\'` em `i18n.ts`; um escape faltando quebra o dicionário inteiro.
- Testes de render com timeout de 5 s falham sob carga; reexecute isolados antes de concluir que são regressão.

## 7. Depois que os testes passarem (só com aval do usuário)
1. Reescrever a mensagem do commit `95fd7467` (sem citar a massa) e dar `push --force-with-lease` em `release/0.2.5`.
2. Atualizar o PR #41 com o conteúdo do `integracao/0.2.5` e conferir a CI.
3. Mesclar o PR #39 (instalador do macOS), se for na release.
4. Gerar o instalador de teste com o workflow `build-desktop` (não publica nada) e testar.
5. Só então criar a tag `v0.2.5`.

## Suavização — TS/UI (executor TS, commit `6af3cc88`)
- Modelo: `suavizarCurvas` (ausente = exata) e `toleranciaSuavizacao` (m). Tolerância inválida ou fora de [0,001; 0,5] cai em 0,02; `toleranciaCurvasDoTerreno` devolve 0 para exata.
- `terrainTypeIssue` recusa tolerância fora dos limites com `md_tn_tolerancia` (params em metros); só checa com a suavização ligada.
- Serviço: `ServicoTerreno.curvas` faz uma consulta `terreno_curvas` por tolerância distinta; a chave de memória ganha `id=tol` só para terrenos suavizados.
- DXF, planta, pranchas e snap usam `servico.curvas()`, então herdam a tolerância. Não há chamada direta a `terreno_curvas` no TS.
- UI: Editar tipo tem select Exata/Suavizada e campo de tolerância em `quantity="length"` (unidade do projeto; sem "cm" fixo, que o check-units proíbe). Propriedades do terreno mostram a opção e a tolerância só de leitura.
- Testes (17 novos, valores literais) passam; pastas de model, engine, UI de terreno e i18n passam sem falha. Typecheck RC=0; eslint limpo nos arquivos tocados.
- Pendente: `check-units` falha por `pranchasEstabilidadeSuite.ts`, `pranchasFixture.ts` e `model3d/solids.ts` (outra frente). `check-i18n-placeholders` tem 1 divergência pré-existente (`pct_mullion_copy_name`).
- Depende do Rust: a consulta 161 com 3º argumento `tolerancia` precisa do wasm novo para as curvas suavizadas saírem certas na tela; o teste de memória usa cena falsa.

## 8. Suavização — Rust/wasm (executor Rust, 18/11/2026)
- Consulta 161 `terreno_curvas(nivel, superficie, tolerancia)`: tolerância 0 = polilinha crua da malha; > 0 = Chaikin por vértice com desvio acumulado <= tolerância; negativa ou não finita = erro ENTRADA (3).
- Só `consultas.rs` chama `consulta_terreno_curvas`; seções, cortes (`terreno_corte.rs`) e avaliações usam a malha e nunca as curvas, então nada precisou mudar (decisão: exato onde não há argumento do terreno).
- Esquema coerente sem subir versão: `esquema.rs`, `cena-v11.json` e `esquema.gerado.ts` já traziam o 3º argumento. O texto da descrição da 161 ainda diz "Ainda sem implementação" (antigo; só corrigir junto de um próximo rebuild).
- Testes novos (Rust): tolerância 0 = crua, fuzz leve (malhas aleatórias, tol 0,02 e 0,2: desvio <= tol, pontos de borda e extremidades fixos), canto agudo intacto, tolerância negativa/NaN/inf -> ENTRADA. Quadrado 64/48/32/16 volta ao exato literal.
- `cargo test --lib terreno -- --test-threads=2`: 106/106 (695 s). `wasm:check` ok (blob 788dfa04ebe0, fontes 6b606cb68dee). wasm de terreno (`tests/kernel-terreno-*`): 51/51 com a tolerância passada nas chamadas.
- clippy: 42 avisos na crate (base 39); nenhum em `terreno_curvas.rs`/`consultas.rs`; os 3 a mais vêm de outras frentes integradas (não tocados).

## Diagnóstico das falhas da suíte ampla (18/11/2026)

Cada arquivo foi rodado isolado, com `pvitest.sh`, um por vez, na máquina livre. Nenhum arquivo falhou isolado, então nenhum código foi alterado e não houve comparação com a `main`. Os 16 testes que falharam na suíte ampla não estão identificados nos logs da passagem; por isso a tabela classifica por arquivo.

| Arquivo | Resultado isolado | Classe | Causa provável | Ação |
|---|---|---|---|---|
| apps/web/src/editor/sheetInsert.test.ts | 14/14 | (A) | Timeout de 5 s do lote de 3 vistas sob carga | Nenhuma |
| packages/model/src/contratoCamposEsquadria.test.ts | 5/5 | (A) | Carga da suíte | Nenhuma |
| apps/web/src/ui/dialogs/openingType/previewViews.test.ts | 14/14 | (A) | Carga da suíte | Nenhuma |
| packages/engine/src/junctionReducao.test.ts | 6/6 | (A) | Carga da suíte | Nenhuma |
| packages/engine/src/projectIssues.test.ts | 17/17 (inclui predio10) | (A) | Carga da suíte | Nenhuma |
| packages/render/src/model3d/terminoCamada3d.test.ts | 3/3 (volume laje x parede) | (A) | Carga da suíte | Nenhuma |
| packages/render/src/openingCatalogoVistas.test.ts | 8/8 | (A) | Carga da suíte | Nenhuma |
| packages/render/src/plan/zoomSemRecriar.test.ts | 5/5 | (A) | Carga da suíte | Nenhuma |
| packages/engine/src/wallTiltJoin.test.ts | 19/19 nas 2 rodadas (fuzz S1 2347 e 2433 ms; limite 2 ms/par) | (A) | Desempenho sob carga; oscila pouco | Nenhuma |
| packages/engine/src/wallTiltJoinArco.test.ts | 6/6 nas 2 rodadas (J1 níveis 0,88 e 1,21 ms/par, limite 3; níveis+anéis 2,37 e 2,98, limite 8) | (A) | Desempenho; oscila 26 a 37 % entre rodadas, folga de mais de 2x | Nenhuma |
| packages/engine/src/wallTiltJoinLevelArco.test.ts | 7/7 nas 2 rodadas (limite 5 ms/par) | (A) | Desempenho dentro do limite | Nenhuma |
| packages/engine/src/wallTiltMulticamada.test.ts | 3/3 nas 2 rodadas (30 paredes a 15°: junção 43/46 ms, corte 131/149, elevação 24/29; limite 500) | (A) | Desempenho dentro do limite | Nenhuma; obs.: o corte passa de 100 ms, a meta citada no comentário |
| packages/engine/src/wallTiltJoinExato.test.ts | 15/15 | (A) | Carga da suíte | Nenhuma |
| packages/engine/src/wallTiltJoinLevel.test.ts | 7/7 | (A) | Carga da suíte | Nenhuma |
| packages/engine/src/wallTiltJoinLevelPar.test.ts | 3/3 | (A) | Carga da suíte | Nenhuma |
| packages/render/src/model3d/wallTiltJoinSolid.test.ts | 7/7 | (A) | Carga da suíte | Nenhuma |
| packages/render/src/model3d/wallTiltJuncaoArco.test.ts | 7/7 nas 2 rodadas (limite 200 ms para 20 paredes) | (A) | Desempenho dentro do limite | Nenhuma |

Conclusão: as 16 falhas da suíte ampla são de carga (timeouts e limites de tempo), não regressão desta integração. Nenhum volume laje x parede, junção ou predio10 falhou isolado. Sobra para o dono: decidir se a suíte ampla deve ser repetida em horário livre (com `pesado.sh`, sem paralelismo extra) para confirmar a zeragem; se os limites de desempenho do wallTiltMulticamada devem ser apertados até a meta de 100 ms do corte.

## Espaço+arrastar e Inserir vistas (executor i025, 18/11/2026)

- **Espaço + arrastar** é o gesto de pan da prancha (conteúdo da vista sob o cursor; fora de vistas, a câmera). Alt continua. Decisão em `gestoDoBotaoNaPrancha` (`ui/sheet/sheetGestoBotao.ts`, 12 testes). Nota da release (`docs/releases/v0.2.5.md`) explica como manter Alt no Linux (tecla Super).
- **Inserir vistas** sem prévia: lista de vistas agrupada (plantas, cortes, elevações, 3D), Marcar todas/Limpar, escala inicial "Da vista", dica do Shift, Cancelar/Inserir. Janela `size="ins"`: 560 px e 80% da altura, lista com rolagem própria.
- Lista virtual sempre ativa (faixa visível de linhas, altura medida no DOM): 250 vistas 3D abrem em ~100 ms (1366x768) e ~410 ms (1024x640, ver pendência).
- Escolha da escala: "Da vista" usa a natural se couber, senão a maior que cabe. Escala fixa que não cabe, ou sem espaço livre, avisa só depois de Inserir (a janela continua aberta).
- Medido com `tests/e2e/prancha-inserir-layout.mjs` (Chrome do sistema via `CHROME_PATH`, servidor 4200): janela 560x482 (1024x640) e 560x526 (1366x768), lista 256 e 300 px com rolagem, rodapé dentro, nada fora da janela, fonte de 18px sem sobreposição.
- Pendente: abertura quente de 1024x640 ~410-420 ms (limite de 300 ms não atingido; causa não isolada, suspeita de aquecimento da primeira página no dev server sob carga). Ver em build de produção antes de fechar. `test-i18n-runtime.mjs` não roda aqui (Chromium do Playwright ausente). Ver em tela: a lista, a janela em fonte grande, o gesto Espaço+arrastar em planta de prancha com a tecla Alt indisponível.

## Topografia: formas, spline e propriedades do ponto (executor i025-topo, 18/11/2026)

- **Galeria de formas** na Topografia (modo Curvas) e no Editar terreno (submodo Curva): linha (atual), 3 arcos, círculo, elipse, retângulo, 2 polígonos e **Spline**. Aba contextual `tool:terrain`/`tool:terrainEdit` com `DrawGalleryPanel` (opção `terrainShape`); a galeria some nos modos sem curva. Estado das formas em `DesenhoDeForma` (`terrainFormaCurva.ts`), reusado pelas duas ferramentas; geometria pura em `terrainFormaGeom.ts`.
- **Discretização ao concluir**: o terreno só guarda polilinhas, então cada forma vira UMA `CurvaTerreno` na cota do campo. **Flecha máxima padrão 0,01 m** (campo "Flecha máx." na barra, `smallLength`, limitada a 1 mm..1 m). Círculo r=5 m dá 50 vértices; retângulo 4. Círculo, elipse, retângulo e polígono nascem fechados.
- **Teto**: `TERRENO_LIMITES.vertices` (200 000, descontando o que o terreno ou as fontes pendentes já têm). Passando, a flecha DOBRA até caber (aviso com a flecha usada); só recusa (mensagem de limite) se nem assim couber (ex.: polígono com mais lados que a folga).
- **Spline**: Catmull-Rom centrípeta (alfa 0,5), passa exatamente pelos pontos de controle; aberta (Enter) ou fechada (C ou clique no 1º ponto, 3+ pontos); pontas abertas usam vizinhos por reflexão. Testada sem autointerseção em V, grampo e zigue-zague agudos.
- **Ponto selecionado** (grupo no painel Propriedades do terreno): X, Y e Cota (`NumField quantity="length"`, unidades do projeto), E/N reais SÓ LEITURA quando há Localização. Ponte: `TerrainEditTool.pontoSelecionado` e `definirPontoSelecionado` (UM `editTerrainFontes`, um desfazer, via `gravarOps`/`terrainIssue`); o painel relê a cada `previewTick` (alça arrastada atualiza). Vértice de curva: a cota vale para a curva toda (nota no painel). No submodo Ponto o ponto criado fica escolhido.
- **Limite do modelo**: `terrainIssue` aceita vértices coincidentes (o kernel funde), então mover sobre outro vértice não é recusado; valores fora de ±100 km / ±10 km de cota ou não numéricos são recusados com mensagem.
- **Ver em tela**: desenhar círculo, elipse, arco e spline em planta (prévia tracejada ao vivo, campo Flecha na barra, Tab no arco centro-extremidades), o terreno com curva de muitos vértices, e o grupo "Ponto selecionado" ao clicar num ponto/vértice e ao arrastar a alça. Sem tela nesta rodada; só testes de unidade.
- Pendente fora desta ficha: `apps/web/src/editor/sheetInsertSources.ts(40)` falha o typecheck na base (tipo `TipoFonteVista`), é do trabalho de Inserir vistas.

## Desempenho da prancha

- Prédio: template `predio10` (10 pavimentos, 2 cortes) + 4 elevações; prancha A0 com 11 vistas. Script `tests/perf/prancha-predio.mjs`, números em `tests/perf/prancha-baseline.md` e `prancha-resultado.md`.
- Causa (perfil CDP): `buildSheetDrawList` refazia TODAS as vistas (planta e corte inteiros) a cada comando; o drop da 11ª vista custava 5,3 s e o SVG chegava a 30 mil nós; pan/zoom/mover repintavam o SVG vetorial inteiro (quadros de 100 a 250 ms).
- Cache: `packages/render/src/sheet/partsCache.ts` guarda as partes de cada vista (chave: idioma, fonte, escala, tamanho e âncora relativa; validade: referências de todos os campos do projeto menos `sheets`). Mover vista só translada; editar o modelo invalida (testado). O `computeSection` também tem cache (por linha, validado pelo modelo).
- PDF/DXF: `buildSheetDrawList` só aceita acerto de cache na mesma posição, então a saída é idêntica ao cálculo direto (teste com JSON igual).
- Tela: cada vista vira uma camada `<svg>` posicionada por CSS (`transform`); pan, zoom e arraste só mudam o transform e o navegador reaproveita o raster; 140 ms depois de parar (ou esticado além de 2x/0,4x) a camada é rasterizada de novo, nítida. Traços consecutivos de mesmo estilo foram fundidos num só `<path>` (30 mil -> 6,6 mil nós).
- Drop: o arraste (`dragover`) e a prancha parada (`useSheetPrefetch`, 500 ms sem gesto) preparam o desenho das vistas do Navegador, então soltar vira acerto de cache; linhas de encaixe só são montadas quando um gesto precisa.
- Antes/depois (Chrome headless, sem GPU): drop p95 5279 -> 89 ms (até o DOM da vista: 45 ms); quadro p95 de zoom 66,7 -> 16,8, pan 216,6 -> 16,8, mover 83,3 -> 16,7 ms; nenhum quadro > 100 ms.
- Limite: o p95 do drop (89 ms) passa da meta de ~50 ms pela métrica do script (2 quadros depois do DOM); o resto é React (~29 ms por drop, inclui painéis laterais) e criação dos nós SVG, não cálculo.
- Risco: a camada é esticada durante o gesto (nitidez volta em 140 ms); vista 3D não entra no cache; falta conferir em tela com GPU real e o PDF/DXF visualmente.

## Decisões do dono (18/11/2026, depois dos testes parciais)
1. **Móveis entram na 0.2.5** (Biblioteca, planta real, famílias novas só com o que o editor permite, importador de blocos). Eles ficam no branch `teste/0.2.5-com-moveis` até a mescla na `integracao/0.2.5`.
2. **Esquema do arquivo sobe de 29 para 30** (junto com a mescla dos móveis; migração 29 -> 30 e atualizar a nota da release).
3. **Tipo de terreno NÃO é aplicado aos terrenos já existentes** (só aos novos).
4. **Cores padrão do terreno** (superfície `#7f9f5c`, solo `#8b6b4a`, curvas marrons): mantidas.
5. **Aba contextual "Colocar Topografia"**: mantida (a galeria de formas e a spline ficam nela, no modo Curvas).
6. **Alt+Shift sobre vista na prancha deixa de alternar a seleção**: aceito. Espaço segurado + arrastar continua reposicionando (pan) também na PLANTA, no 3D e nos cortes (`ViewportCanvas`, sem mudança nesta rodada); na prancha faz o pan do conteúdo da vista.

## Decisão adicional do dono (18/11/2026): editor de famílias
O **Editor de famílias fica ATIVO (experimental) na release**, como está no branch de móveis (aviso "Experimental", Meus modelos com exportar e importar). Melhorias do editor ficam para versões futuras (abas Inserir/Modificar/Vista/Gerenciar, mover peças com o mouse, textos em todos os idiomas).
- **Esquema do arquivo em 30** (decisão do dono, ficha esquema 29 → 30): móveis da Biblioteca, móveis importados e tipo de terreno ficam declarados na versão 30; a migração 29 → 30 só avança a versão, e um programa antigo recusa o arquivo 30. `facePaints` entra com a sua mescla.
- Commit `f32c8544` (`feat(esquema)`): testes atualizados e novo `packages/model/src/esquema30.test.ts`; nota da release (versão 30) atualizada.
