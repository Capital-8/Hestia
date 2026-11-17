# Massa conceitual: estado

Linha de base (2026-11-13, commit c1d30ac1): typecheck ✔ | lint ✔ | test:rapido 969 arquivos / 11316 testes (1 todo) | cargo test geom-wasm 474 testes | build:wasm ✔ | wasm:check ✔ | test:wasm 1334 testes (5 ignorados).
Observação: `npm run build:wasm` regrava `packages/geom/assets/geom_wasm.{wasm,sha256}`; o fiscal restaura com `git checkout packages/geom/assets` quando a ficha não é de Rust.
Modelo dos subagentes: R1 e R2 rodaram com fable (consumiu o limite do dono). **A partir da R3: só haiku 5.5 (effort high) ou sonnet 5.5 (effort medium), nunca opus/fable (emenda E5).**

| Ficha | Estado | Commit de mescla | Devoluções | Observações |
|---|---|---|---|---|
| M1 | mesclada | merge de massa/m1 | 0 | typecheck ✔, lint ✔ (8 avisos já existentes), test:rapido 971 arq / 11358 testes; escopo e atalhos conferidos pelo fiscal; emenda E1 no PLANO |
| M2 | mesclada | merge de massa/m2 | 0 | conferida pelo fiscal: typecheck ✔, lint ✔, test:rapido 971/11359, cargo test 477, test:wasm 1335, clippy sem erro novo; reiniciou o contêiner no meio (agente refeito); emenda E2 |
| R1 | mesclada | merge de massa/r1 | 0 | conferida pelo fiscal: typecheck ✔, lint ✔, test:rapido 971/11359, cargo test 502, test:wasm 55 arq/1338 (agora inclui kernel-massa), clippy 39 = base, mesmos locais; agente interrompido pelo limite de uso e retomado; emenda E3 |
| R2 | mesclada | merge de massa/r2 | 0 | conferida pelo fiscal: typecheck ✔, lint ✔, test:rapido 971/11359, cargo test 508, test:wasm 56 arq/1343 (inclui kernel-massa-planta), clippy 39 = base; interrompida pelo limite e retomada; emenda E4 |
| R3 | mesclada | merge de massa/r3 | 0 | sonnet medium; conferida pelo fiscal: typecheck ✔, lint ✔, test:rapido 971/11359, cargo test 518, test:wasm 57 arq/1347, clippy 39 = base; o fiscal corrigiu 2 linhas do teste da R2 (emenda E6) |
| E1 | mesclada | merge de massa/e1 | 0 | haiku high; o agente terminou sem relatório, o fiscal conferiu o worktree e o aceite pelos testes: typecheck ✔, lint ✔, test:rapido 976/11383, test:wasm 58/1356; emenda E7 |
| V1 | mesclada | merge de massa/v1 | 0 | haiku high; conferida: typecheck ✔, lint ✔, test:rapido 977/11398, test:wasm 58/1356; emenda E8 |
| V2 | mesclada | merge de massa/v2 | 0 | haiku high; árvore combinada V1+V2: typecheck ✔, lint ✔, test:rapido 980/11422, test:wasm 58/1356 (1 teste de tempo do guarda-corpo falhou sob carga na rodada do agente e passou sem carga); pendências para T1/U2/Q1 na E8 |
| G2 (portão visual) | mesclada | merge de massa/g2 | 0 | haiku high; script massa-visual.mjs sai 0, 0 erros de console; capturas olhadas pelo fiscal; achados na E10 |
| V1b (névoa do 3D) | mesclada | merge de massa/v1b | 0 | haiku high; conferida: typecheck ✔, lint ✔, test:rapido 983/11465; captura 3d-enquadrar-tudo.png agora mostra todas as massas (antes vazia) |
| V3 | mesclada | merge de massa/v3 | 0 | haiku high; conferida: typecheck ✔, lint ✔, test:rapido 982/11453, test:wasm 59/1359 (inclui kernel-massa-vista); emenda E9 |
| T1a (criação) | mesclada | merge de massa/t1a | 0 | haiku high; 2 ampliações de escopo autorizadas (shortcutDefaults.ts, types.ts) e ligação mínima em apps/web (E11); conferida |
| T1b (modificação) | mesclada | merge de massa/t1b | 0 | sonnet medium; pendências → T1c (E12); conferida |
| **Árvore combinada T1a+T1b** | verde | | | typecheck ✔, lint ✔, test:rapido 990/11537, test:wasm 59/1359 |
| T1c (pendências da T1b) | mesclada | merge de massa/t1c | 0 | haiku high; conferida; dívida de tamanho de sectionEditTools/alignFeatures anotada (E13) |
| U1 (interface) | mesclada | merge de massa/u1 | 0 | sonnet medium; conferida. **Árvore combinada T1c+U1: typecheck ✔, lint ✔, test:rapido 1001/11607, test:wasm 59/1359, check:ribbon-i18n 0 faltando** |
| U2 | mesclada | merge de massa/u2 | 0 | haiku high; conferida na árvore combinada: typecheck ✔, lint ✔, test:rapido 1004/11622, test:wasm 60/1363, check:ribbon-i18n 0 faltando; test:i18n não roda (Chromium 1248 ausente); emenda E14. **Fase 3 concluída em código** |
| G3 (teste de interface no navegador) | mesclada | merge de massa/g3 | 0 | haiku high; roteiro passa (0 erros de console), 2 falhas = defeito do app fora da massa (Enquadrar tudo); capturas olhadas pelo fiscal; emenda E15 |
| D1 | mesclada | merge de massa/d1 | 0 | haiku high; interrompida pelo limite de uso e retomada; conferida na árvore combinada: typecheck ✔, lint ✔, test:rapido 1007/11649, test:wasm 61/1365, check:ribbon-i18n 0 faltando; emenda E16 |
| D2 | mesclada | merge de massa/d2 | 0 | haiku high; conferida na árvore combinada: typecheck ✔, lint ✔, test:rapido 1011/11697, test:wasm 62/1369, check:ribbon-i18n 0 faltando; emenda E17. **Fase 4 concluída** |
| X1 | mesclada | merge de massa/x1 | 0 | sonnet medium; conferida na árvore combinada: typecheck ✔, lint ✔, test:rapido 1015/11723, test:wasm 63/1378, test:ifc-export 22 arq/170 testes, check:ribbon-i18n 0 faltando; emenda E18 |
| Q1 | mesclada | merge de massa/q1 | 0 | sonnet medium; conferida: typecheck ✔, lint ✔, test:rapido 1015/11724, test:wasm 63/1378, perf ✔; E2E massa.mjs 75 verificações 0 erros; o fiscal corrigiu planFrame (contador) e o defeito das paredes colineares da D2 (E19) |

## Lições de processo
- O worktree de `isolation: "worktree"` nasce do `main` local, não da branch de trabalho. Todo prompt de ficha deve mandar o agente rodar `git merge --ff-only claude/youthful-dirac-l4egd1` antes de qualquer coisa e conferir `SCHEMA_VERSION` (esperado 25 antes da M1).

- Isolamento de worktree: `isolation: "worktree"` não serve (base errada, e o worktree vazio é apagado). Usar worktree manual: `git worktree add /home/user/hestia-wt/<ficha> -b massa/<ficha> claude/youthful-dirac-l4egd1`, `npm ci` dentro dele (NUNCA symlink de node_modules: os pacotes @hestia apontariam para o checkout principal) e dar o caminho ao agente. Para fichas de Rust, o agente usa CARGO_TARGET_DIR=/tmp/hestia-target-massa.

- **Clippy:** o portão `cargo clippy -p geom-wasm -- -D warnings` JÁ FALHA na linha de base (39 erros em código antigo, medido em c1d30ac1+). O portão passa a ser: **nenhum erro novo** (mesmo número, mesmos locais) e **zero erro em arquivo novo ou linha tocada**. O fiscal compara com `/tmp/claude-0/clippy-base.log` (grep `-->`, sem linha/coluna).
- **Artefatos WASM:** todo merge que traz `.rs` exige `npm run build:wasm` depois da última alteração e commit dos 3 arquivos de `packages/geom/assets`; o `hash-fontes.test.ts` (dentro de `test:rapido`) confere. Duas fichas de Rust em paralelo conflitam nesses binários: por isso a fase 1 é sequencial.
- Contrato do kernel: **congelado** desde a M2 (versao 19, ids 140–142 e 140–145).

- **Limite de uso:** o modelo forte (R1) bateu o limite de 5 h; o agente deixa commit `wip` e é retomado por SendMessage. Em R2 e R3 pedir `wip` antes de cada comando longo.
- Pendência de limpeza (fiscal, no fim): `/tmp/hestia-target-massa` e worktrees `/home/user/hestia-wt/*`.

- **Fase 5 e fechamento em 2026-11-14:** X1 e Q1 mescladas; `massas` registrado em ORDEM.json; correções do fiscal na E19.
- **Fase 1 (kernel) concluída em 2026-11-14.** Portão da fase: valores de A.10 batem nos testes Rust (R1/R2/R3) e o fuzz de 200 massas passa em malha, fatias/planta/quantidades/avisos e corte.

- O fiscal apagou `crates/geom-wasm/target` do checkout principal (criado por `npm run build:wasm` rodado no passo 0 sem `CARGO_TARGET_DIR`). Rode SEMPRE `CARGO_TARGET_DIR=/tmp/hestia-target-massa` com build:wasm; `check-lixo` pega.
- Testes de tempo do guarda-corpo (`kernel-gc-estabilidade`) oscilam com carga alta do sistema; repetir sem outros processos antes de devolver ficha.

- **Fase 2 em código concluída em 2026-11-14; portão visual feito** (capturas e script na E10). Névoa do 3D corrigida (V1b).

- O `test:rapido` estoura o `timeout` do fiscal e o `kernel-gc-estabilidade` oscila quando 2 ou 3 suítes rodam ao mesmo tempo (carga > 8). Não rodar portão do fiscal enquanto agentes rodam testes; se falhar por tempo, repetir com a máquina livre.

## Decisões do dono durante a execução
- 2026-11-13: "sempre que possível seguir sem esperar nada" (o fiscal só para para perguntar se uma decisão de projeto bloquear).

## Pendências conhecidas (nenhuma bloqueia a massa; ver também docs/paridade/massas.md)
- Revelar (Reveal) elemento oculto para a massa: o guarda-corpo não tem mecanismo genérico por kind.
- Furos nas paredes derivadas (só o anel externo vira parede).
- O importador IFC não reconhece `mass` (volta como `Generic` sem seções e arranjo).
- Chave de i18n própria para "tipo de parede inexistente" nos 7 idiomas (hoje `md_cmd_element_missing_id`; `packages/model/src/i18n.ts`).
- Dívida de tamanho anterior à massa: `sectionEditTools.ts` (655 linhas, com `eslint-disable max-lines`) e `alignFeatures.ts` (478).
- Contraste do 3D (opacidade 0,35, decisão A.3): subir para 0,5 se a leitura for ruim (decisão do dono).
- 'Mostrar massa': o estado pressionado não é reativo à troca entre cortes sem mudança no projeto (`useCtx.ts`).
- Fora da massa, relatados ao dono: botão "Enquadrar tudo" da barra de navegação não recebe o clique na planta (hipótese: `setPointerCapture` em `ViewportCanvas.tsx` ~linha 780); app sem favicon; kernel não sobe pelo `dist` aberto por `file://` (CORS ao buscar o wasm).
- `npm run test:i18n` precisa de `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-massa` com links simbólicos para o Chromium 1243 (E19).

## Tempos medidos (A.8 item 5; WASM real, flor de 12 pétalas)
- `massa_malha` lod 1: 0,9 a 1,5 ms (alvo 50 ms; 22156 triângulos). `massa_corte`: 1,5 a 2,8 ms (alvo 50 ms; 63 linhas). `massa_planta`: 0,6 a 0,8 ms (alvo 10 ms; 66 linhas). Teste: `packages/engine/src/massaDesempenho.perf.test.ts`.

## Frente massa-forma-livre (cotas, caixa de formas, união por TR)
- Cotas absolutas (m, zero do projeto): base = elevação do nível da massa + `baseOffset`; topo = base + altura (z da última seção). Editar a BASE move a pilha (só `baseOffset`); editar ALTURA ou TOPO reescala todos os z (z·nova/atual), preservando forma, interpolação e a distribuição da torção. Altura <= 0 recusada com mensagem i18n; um `updateMass` = um desfazer (`apps/web/src/ui/massCotas.ts`).
- "De nível a nível": base = elevação do nível inicial, topo = a do final (final mais alto); no painel e na barra de criação (que também tem Altura, Cota da base e Cota do topo; `options.mass.cotaBase`).
- A massa é o 5º alvo do esboço (`SketchTarget 'mass'`): a extrusão (botões Massa e Extrusão) abre o esboço com a galeria completa, TR, Excluir e validação. Mistura, loft e bulbo continuam na ferramenta de perfis; `options.mass.galeria = false` volta a extrusão por perfis (usado pelos E2E antigos).
- Concluir grava o laço externo como perfil `livre` (3 a 256 pontos), duas seções (z 0 e altura). Arcos e círculos já chegam em cordas de 2 mm; acima de 256 pontos, Douglas-Peucker dobrando a tolerância (2, 4, 8... até 50 mm).
- Furos: o perfil da seção não tem furos, então laço interno é RECUSADO com mensagem (não se mexeu no formato salvo nem em M1 a M5).
- Editar contorno (painel, menu de contexto, "Editar perímetro"): carrega o anel da base (círculo em 64 cordas) e, ao concluir, troca o perfil das seções iguais à base (extrusão) ou só o da base (mistura/loft), mantendo z, cotas, torção e arranjo.
- Achado e correção: a tecla C nunca fechava o contorno livre (massa, lote, guarda-corpo, terreno), porque a letra inicial não entra no campo numérico; agora as ferramentas com `fechaComC` recebem 'c' do controlador.
- Faixa: Extrusão, Mistura, Loft e Bulbo empilhados (pilha de 4 com botões de 16 px; `rb-stack-4`), e os botões "ainda não" em pilhas; em 1760 px o último painel termina em x = 1362.
- Sem verificar: massa do esboço em corte/elevação e o kernel Rust (nada de Rust foi tocado).


## Frente massa-paredes-torcidas (M2, branch massa/paredes-torcidas, 2026-11-17)
Paredes da massa que respeitam torção, loft e bulbo, de alvenaria ou de cortina de vidro. Código: `packages/engine/src/massaParedesTorcidas.ts` (motor), `massaFatiasEmCotas.ts` (fatias em cotas arbitrárias), `massaParedesGeom.ts`, `cortinaInclinada.ts`; comando em `packages/model/src/massDerivaCommands.ts`; diálogo em `apps/web/src/ui/dialogs/MassParedesDialog.tsx`.

**Decisão geométrica.** A face lateral entre duas fatias de massa torcida NÃO é plana, então uma parede reta só a aproxima. Cada nível vira N passos de altura; em cada passo [z0, z1] cada aresta da fatia de z0 vira uma parede reta com LINHA DE BASE na aresta da fatia inferior (vértices compartilhados: a cadeia fecha em z0 e as junções são as do motor) e `tilt = atan(d/H)`, com d = deslocamento ao longo da normal esquerda (externa) do ponto médio da aresta até o contorno SIMPLIFICADO da fatia z1. A rotação do eixo da face entre as fatias (torção) não cabe num plano: é dividida em passos por bisseção (um passo cujo desvio medido passa de `desvioMax` é partido ao meio, até `maxPassosPorNivel`). `location_line = finishExterior` (face externa na superfície da massa); `baseOffset`/`height` do passo; só o último passo do nível aponta `topLevelId`. Extrusão reta (qualquer contorno igual em todas as cotas, inclusive cilindro) dá tilt 0, nenhum passo extra e as mesmas cadeias de `derivarContornosParedesDaMassa`.

**Fatias em cotas arbitrárias sem duplicar malha:** projeto sintético com níveis auxiliares nas cotas pedidas, fatiado pelo kernel (consulta 142) num segundo `ServicoMassa` (`servicoMassaAuxiliar`); nenhuma mudança de Rust, contrato do kernel e SCHEMA_VERSION (29) intactos.

**Desvio medido** (Hausdorff amostrado em planta entre as arestas das paredes e as fatias reais, na base, no meio e no topo de cada passo; kernel real, `tests/kernel-massa-paredes-torcidas.wasm.test.ts`):
| Caso | Paredes | Passos | Desvio máx. |
|---|---|---|---|
| M3 torre torcida (30 m, 90°), 1 passo por andar (10 níveis) | 40 | 10 | 0,6257 m (= 4·sen 9°) e tilt 0,9522° |
| M3, tolerância padrão 5 cm | 640 | 160 (16 por andar) | 0,0393 m (= 4·sen 0,5625°) |
| M3, tolerância 2 cm | 640 | 160 | 0,0393 m, aviso de limite de passos (160) |
| M4 bulbo (5 níveis), padrão | 480 | 15 | 0,0647 m (aproximação 0,0486) |
| M4, 1 passo por andar | 160 | 5 | 0,2665 m |
| M2 cilindro, padrão | 128 | 4 | 0,0241 m (só a corda do contorno de 5 cm), 0 inclinadas |
| Loft quadrado → círculo (6 m) | 432 | 26 | 0,0819 m, aviso de limite em 4 passos |
O padrão de desvio ficou em 5 cm (e não 2 cm): com 16 passos por andar o limite do passo domina na torre M3 (0,0393 m); com 2 cm o resultado é o mesmo com 160 avisos de limite. O custo é inerente: o erro é L/2·sen(giro do passo), então torção forte pede centenas de paredes curtas.

**Fase 1a (junções).** Parede de alvenaria com tilt fecha em par com a vizinha da mesma cadeia (`joinStatus` `pair` em todas as pontas; `tests/kernel-massa-paredes-juncoes.wasm.test.ts`): M3, 64 paredes empilhadas num andar, 128 pontas em par, nenhuma junção entre passos empilhados, 0 avisos de junção inclinada. O bulbo M4 (5 níveis, 480 paredes) tem 38 avisos `inclinacaoInviavelNaJuncao` (faces de 0,5 a 1 m com tilt de 27 a 43°): o motor usa o plano B (corte simples), com possíveis frestas pequenas. Correção feita: `wall-overlap` (C14) ignorava a cota e acusava paredes colineares EMPILHADAS (faixas de cota disjuntas); agora as compara por faixa vertical (`packages/model/src/validate.ts`).

**Fase 1b (cortina inclinada).** A cortina NÃO aceitava `tilt` (a validação deixava gravar, mas a grade e a malha saíam verticais). Agora, para cortina RETA: o adaptador entrega ao kernel a altura inclinada H/cos(tilt) (grade, peças e quantidades medidas na face inclinada) e a malha 3D (matrizes das instâncias e vértices das peças avulsas) é girada em torno da linha de base por `tilt` (`cortinaInclinada.ts`); sem Rust. `wallTiltIssue` recusa tilt em cortina em arco (`md_cmd_tilt_curtain_arc`, 7 idiomas). Provado no kernel real: 6×3 m a 30° mantém a grade 4×2, altura vertical 3 m e topo deslocado 1,7321 m (`tests/kernel-cortina-inclinada.wasm.test.ts`). NÃO coberto: planta da cortina (continua a seção vertical na base), corte/elevação, junção de topo e de canto da cortina com vizinhas inclinadas (o kernel as calcula na vertical), esquadrias de célula em cortina inclinada, quantidade de vãos; porta/janela não se hospeda em cortina (ADR 0056 §7: nasce da célula). No diálogo, escolher cortina põe "Um passo por nível" (passos de menos de 0,6 m avisam).

**Diálogo (fase 3).** Seletor de tipo (projeto, incluindo cortina de vidro, e os modelos de cortina ausentes entram na mesma transação), tipo diferente por fachada (quadrante da normal externa N/L/S/O; índice de face não serve porque o início do anel gira com a torção), modo por nível ou por tolerância (desvio e passos máx.), prévia (paredes, passos, inclinadas, desvio máx.) e avisos (limite de passos, inclinação limitada a 60°, fusão de segmentos, cortina fora do limite, aberturas que serão removidas). Política: GERAR UMA VEZ E TRAVAR: mudar a massa depois não move paredes nem aberturas; gerar de novo substitui e, havendo aberturas hospedadas, o botão vira "Confirmar e substituir". O comando aceita `tilts`, `baseOffset`, `typeIds` por parede e `locationLine` (sem eles o comportamento é o de antes).
**Furos** continuam fora (só o anel externo). **Pendências:** as junções de cantos do bulbo com faces curtas muito inclinadas e a planta/corte da cortina inclinada; porte da cortina inclinada para o Rust (hoje a rotação é em TS no 3D).
