# Paridade · Massas (massa conceitual: extrusão, mistura, loft, bulbo, torção, arranjo polar)

Legenda: `[x]` feito e testado · `[ ]` pendente · `[-]` fora de escopo, com o motivo na própria linha.
Fonte: o plano [docs/massa/PLANO.md](../massa/PLANO.md) (Parte A, emendas E1 a E18) e a decisão [0057](../decisoes/0057-massa-conceitual.md). Não há pasta de pesquisa própria:
a referência é o conceito de "massa conceitual" do Revit (Conceptual Mass) e do ArchiCAD (Morph), reduzido a uma única primitiva, a pilha de seções horizontais.
Nenhum item `[ ]` está pendente: o que ficou de fora está em `[-]`, com o motivo. O fiscal registra o elemento em `ORDEM.json` depois.

## Modelo
- [x] M1 `Mass` (`kind: 'mass'`): origem, deslocamento da base, 2 a 64 seções, interpolação linear ou suave, resolução 16 a 128, arranjo opcional, cor — `packages/model/src/massTypes.ts`, `packages/model/src/mass.ts`
- [x] M2 Perfis `circulo`, `elipse`, `poligono` (3 a 64 lados, vértice em +x) e `livre` (3 a 256 pontos, sem arcos), sempre anti-horários — `packages/model/src/validateMass.test.ts`
- [x] M3 Validação (`massIssue`): uma recusa por regra de A.3 item 5, mensagens em pt e en — `packages/model/src/validateMass.test.ts`
- [x] M4 Migração do esquema 25 → 26 sem alterar dados, e ida e volta do JSON com massa — `packages/model/src/esquema.test.ts` (`migração 25 → 26 (massa conceitual)`)
- [x] M5 Categoria gráfica `mass` (peso de corte 2, de projeção 1, ACI 8, opacidade 0,35 no 3D) e nível próprio da massa — `packages/model/src/massCommands.test.ts`
- [x] M6 Fixtures de referência M1 a M5 (caixa, cilindro, torre torcida, bulbo, flor) — `packages/engine/src/fixtureMassa.ts`, `crates/geom-wasm/src/massa_fixture.rs`
- [-] M7 `MassType` (tipo reutilizável de massa): fora de escopo (A.9); a repetição de forma se faz com `arranjo` ou copiando

## Comandos
- [x] C1 `addMass` e `updateMass` recusam massa inválida e nível inexistente; desfazer e refazer — `packages/model/src/massCommands.test.ts`
- [x] C2 `setMassSecoes` (troca a pilha toda, normaliza o sentido do perfil livre) e `setMassArranjo` (`null` remove) — `packages/model/src/massCommands.test.ts`
- [x] C3 Apagar pelo comando genérico, com desfazer — `packages/model/src/massCommands.test.ts`
- [x] C4 Mover, girar (soma o ângulo a todas as rotações), espelhar (E1 item 1) e copiar — `packages/model/src/massCommands.test.ts`
- [x] C5 Copiar e colar entre pavimentos (id novo, seleção, frase "1 massa") — `apps/web/src/editor/transferMassa.test.ts`, `packages/tools/src/massaColar.test.ts`

## Kernel Rust (contrato versão 19: seções 140 a 142, consultas 140 a 145)
- [x] K1 Contrato: seções e consultas no JSON, esquema TS regenerado — `crates/geom-wasm/src/esquema.rs` (`contrato_confere_com_json`), `packages/model/src/esquema.test.ts` (migração), `packages/engine/src/kernelMassa.test.ts`
- [x] K2 Leitura das seções com validação (`ENTRADA`), recusa atômica — `crates/geom-wasm/src/secoes_massa.rs`, `massa_testes.rs` (`leitura_tipada_recusa_pilha_invalida_e_pula_massa_sem_secoes`)
- [x] K3 Malha fechada por construção (cada aresta em 2 triângulos) em M1 a M5 e nos três `lod` — `massa_testes.rs` (`malha_fechada`, `m1_caixa_volume_exato`, `m2_cilindro_area_do_poligono`, `m3_torcida_area_constante`, `m4_bulbo_sem_ultrapassagem`, `m5_copias_sao_rotacoes`)
- [x] K4 Interpolação dos parâmetros locais, nunca dos pontos de mundo (a torre torcida não encolhe) — `massa_testes.rs` (`interpola_parametros_nao_mundo`)
- [x] K5 Fatias horizontais independentes do `lod` e da malha — `massa_testes_r2.rs` (`fatia_independe_de_lod`, `m1_fatia_z3`, `m3_fatias_64`, `m4_raio_em_z8`)
- [x] K6 Planta com os três estilos (cortado, projetado, acima) — `massa_testes_r2.rs` (`planta_estilos`)
- [x] K7 Corte vertical: cortado, projetado e feições; laços sempre fechados — `massa_corte_testes.rs` (`m1_corte_pelo_meio`, `m2_corte_pelo_eixo`, `plano_no_vertice`, `elevacao_m1`, `feicoes_m3`, `lacos_fechados_fuzz`)
- [x] K8 Quantidades: volume, áreas lateral, da base e do topo, altura — `massa_testes_r2.rs` (`quant_bate_com_malha`)
- [x] K9 Avisos 1 a 4 (anel autointersecta, cópias sobrepostas, limite, face inclinada), um positivo e um negativo cada — `massa_testes_r2.rs` (`aviso_anel_autointersecta`, `aviso_copias_sobrepostas`, `aviso_face_inclinada`, `aviso_limite_atingido`)
- [x] K10 Limites de defesa (`|T|` > 512, anéis por trecho e por cópia: `LIMITE`; `NaN`: `ENTRADA`) — `massa_testes_fuzz.rs` (`limites`)
- [x] K11 Fuzz de 200 massas (malha, volume, finitos, determinismo; quatro consultas) — `massa_testes_fuzz.rs` (`fuzz_200`), `massa_testes_r2_fuzz.rs` (`fuzz_200_fatias_planta_quant_avisos`)
- [x] K12 Pela ABI real do WASM: malha, planta, fatias, corte, quantidades e avisos — `tests/kernel-massa-malha.wasm.test.ts`, `kernel-massa-planta.wasm.test.ts`, `kernel-massa-corte.wasm.test.ts`, `kernel-massa-motor.wasm.test.ts`
- [x] K13 Tempo da flor de 12 pétalas dentro do dobro do alvo (malha lod 1, corte, planta) — `packages/engine/src/massaDesempenho.perf.test.ts` (`npm run test:perf`)

## Motor (engine)
- [x] E1 Serviço sobre o kernel: `null` sem kernel ou com erro, nunca lança — `packages/engine/src/massaServico.test.ts`
- [x] E2 Cache por assinatura: editar uma massa reenvia só as linhas dela; cor e nome não mudam a geometria — `packages/engine/src/massaProjeto.test.ts`, `packages/engine/src/kernelMassa.test.ts` (`envio por diferença`)
- [x] E3 Quantidades por pavimento somadas por cópia — `packages/engine/src/massaQuantities.test.ts`

## 3D
- [x] V1 Lote transparente posterior (opacidade 0,35, sem escrita de profundidade), peça por massa em cache, normais chapadas — `packages/render/src/model3d/massa3d.test.ts`
- [x] V2 Seleção e realce por massa (`ElementRange`, decisão 0016) — `packages/render/src/model3d/massa3d.test.ts`
- [x] V3 Categoria `mass` desligada e massa oculta saem do 3D — `packages/render/src/model3d/massa3d.test.ts`
- [x] V4 Sem kernel: contorno da base como reserva, sem lançar — `packages/render/src/model3d/massa3d.test.ts`; `tests/e2e/massa.mjs` (passo 7b)
- [x] V5 Edição só da massa editada (vizinhas vêm do cache) — `packages/render/src/model3d/massa3d.test.ts`
- [x] V6 Névoa do 3D acompanha a distância da câmera ("Enquadrar tudo" mostra as massas) — `packages/render/src/model3d/nevoa3d.ts` (ficha V1b); captura `docs/massa/evidencias/fase2/3d-enquadrar-tudo.png`
- [-] V7 Edição por alças no 3D: fora de escopo (A.9); as alças só existem em planta
- [-] V8 Reveal (revelar elementos ocultos) para a massa, no corte e no 3D: fora de escopo (E8, E13): o guarda-corpo não tem mecanismo genérico por categoria

## Planta
- [x] P1 Três estilos (cortado, projetado fino, acima tracejado) com os pesos da vista — `packages/render/src/plan/massa.test.ts`, `packages/render/src/plan/massaCamada.test.ts`
- [x] P2 Massa de outro nível que atravessa o nível ativo aparece; camada com chave própria — `packages/render/src/plan/massaCamada.test.ts`
- [x] P3 Sem kernel: contorno tracejado da base — `packages/render/src/plan/massa.test.ts`; `tests/e2e/massa.mjs` (passo 7b, captura `sem-kernel.png`)
- [x] P4 Extensão do modelo (a massa conta no enquadramento) — `packages/render/src/plan/extensaoDoModelo.test.ts`

## Corte e elevação
- [x] S1 Cortado com contorno pesado e preenchimento claro, projetado fino, feição mais fraca; prioridade de clique por estilo — `packages/render/src/section/massa.test.ts`
- [x] S2 Elevação: o plano de profundidade grande vai ao kernel, e um projeto só com massas gera a elevação (a massa entra na extensão do modelo) — `packages/render/src/section/massa.test.ts`, `packages/render/src/plan/extensaoDoModelo.test.ts`, `tests/kernel-massa-vista.wasm.test.ts`
- [x] S3 Seleção e realce no corte, caixa de seleção no corte — `packages/render/src/section/massa.test.ts`, `apps/web/src/editor/sectionBoxSelectMassa.test.ts`
- [x] S4 Corte e elevação abertos no app sem erro de console — `tests/e2e/massa.mjs` (passo 4, capturas `corte.png`, `elevacao.png`)
- [-] S5 Sem kernel o corte e a elevação não desenham a massa (sem reserva em `(s, z)`): decisão da V3 (E9); o aviso `massa-sem-kernel` cobre o caso
- [-] S6 Snaps e Alinhar completos no corte (E12, E13): entram os snaps de vértice, meio e aresta do anel cortado e o Alinhar pelas peças cortada e projetada; a feição (estilo 3) não vira peça

## Ferramentas de criação
- [x] T1 Extrusão: círculo, elipse, polígono regular e perfil livre; altura e lados digitáveis — `packages/tools/src/massTool.test.ts`
- [x] T2 Mistura (base e topo com perfis diferentes) — `packages/tools/src/massTool.test.ts`
- [x] T3 Loft (2 pontos de partida, abre o diálogo "Seções da massa") — `packages/tools/src/massTool.test.ts`, `tests/e2e/massa-ui.mjs`
- [x] T4 Bulbo (5 seções de círculo, suave; o raio do meio é o raio máximo) — `packages/tools/src/massTool.test.ts`, `tests/e2e/massa.mjs` (passo 2)
- [x] T5 Criação de M1, M2 e M4 pela ferramenta, iguais às fixtures — `packages/tools/src/massTool.test.ts`
- [x] T6 Pela interface: Extrusão com perfil livre 8 × 8 e 30 m, Bulbo, Loft e arranjo — `tests/e2e/massa.mjs` (passos 1 a 3)
- [-] T7 Ícone próprio da massa: fora desta entrega (E12, E13); os botões reaproveitam ícones existentes
- [-] T8 Perfis com arcos, varredura por caminho, revolução, NURBS: fora de escopo (A.9)

## Ferramentas de modificação, seleção, snaps e alças
- [x] D1 Mover, copiar, girar, espelhar, matriz, apagar, colar — `packages/tools/src/massModificar.test.ts`, `packages/tools/src/contratoModificacao.test.ts`
- [x] D2 Alinhar (planta e corte) — `packages/tools/src/massaAlinhar.test.ts`, `packages/tools/src/massaCorteAlinhar.test.ts`
- [x] D3 Aparar, estender, dividir e deslocar: `null` com o motivo "massa não é elemento linear" — `packages/tools/src/contratoModificacao.test.ts`
- [x] D4 Seleção por clique e por caixa na planta e no corte — `packages/tools/src/massSelecao.test.ts`
- [x] D5 Snaps de vértice, meio e aresta do anel cortado, com chave estável — `packages/tools/src/massSnaps.test.ts`, `packages/tools/src/sectionSnapMassa.test.ts`, `packages/tools/src/contratoSnaps.test.ts`
- [x] D6 Cota associativa à massa — `packages/tools/src/massaCotaAssociativa.test.ts`
- [x] D7 Alças de origem e de vértice do perfil livre da base (planta) — `packages/tools/src/massHandles.test.ts`
- [x] D8 Mover no corte: horizontal move a origem, vertical muda `baseOffset` — `packages/tools/src/massModificar.test.ts`
- [-] D9 Booleana entre massas (unir, subtrair): fora de escopo (A.9)

## Interface
- [x] U1 Painel de propriedades: nome, nível, base, altura (leitura), interpolação, resolução, Torção total (graus), Arranjo polar, cor, Editar seções — `apps/web/src/ui/MassProperties.test.ts`, `tests/e2e/massa.mjs`
- [x] U2 Diálogo "Seções da massa": tabela, adicionar, remover, duplicar, prévia ao vivo, aplicar em um passo de desfazer — `apps/web/src/ui/massSecoesForm.test.ts`, `apps/web/src/ui/dialogs/MassSecoesDialog.test.ts`
- [x] U3 Barra de opções (modo, perfil, altura, lados), ajustes preservados ao trocar de modo — `apps/web/src/ui/MassOptionsBar.test.ts`
- [x] U4 Botões da aba "Massa e terreno": Extrusão, Mistura, Loft, Bulbo, Mostrar massa, Pisos da massa, Paredes da massa — `apps/web/src/ui/ribbon/mostrarMassa.test.ts`; `npm run check:ribbon-i18n`
- [x] U5 Categoria "Massas" no navegador de projeto — `apps/web/src/ui/browser/Massas.test.ts`
- [x] U6 Tabela "Massas por pavimento" com CSV (área e perímetro somados por cópia; rodapé com volume e áreas) — `packages/engine/src/massaSchedule.test.ts`, `apps/web/src/ui/dialogs/MassScheduleDialog.test.ts`, `tests/kernel-massa-tabela.wasm.test.ts`
- [x] U7 Avisos no painel de avisos com "Ir para": `massa-sem-kernel`, `massa-invalida` e os quatro do kernel — `packages/engine/src/massaIssues.test.ts`, `apps/web/src/ui/MassaAvisosGeometria.test.ts`
- [x] U8 Textos em pt e en (e os demais idiomas da faixa) pelo sistema de i18n; números por `formatQuantity` — `apps/web/src/editor/i18n/areas/massa*.ts`; `npm run check:ribbon-i18n`
- [x] U9 `npm run test:i18n` (interface em todos os idiomas, no navegador): roda neste ambiente com `PLAYWRIGHT_BROWSERS_PATH=/tmp/pw-massa` (links simbólicos `chromium-1248` e `chromium_headless_shell-1248` para os 1243, fora do repositório e de `/opt`): 31 OK, 0 avisos, 0 falhas (ficha Q1, relatório de 2026-11-14)
- [-] U10 Barra de estado pressionado de "Mostrar massa" reativa à troca entre cortes sem mudança no projeto: limitação aceita (E13)

## Derivação (massa vira projeto)
- [x] G1 Pisos da massa: um piso ou laje por componente conexo e por nível, contorno estático simplificado (5 mm), `origemMassa`, um desfazer, rodar de novo substitui — `packages/engine/src/massaDerivaPisos.test.ts`, `packages/model/src/massDerivaCommands.test.ts`, `tests/kernel-massa-pisos.wasm.test.ts`
- [x] G2 Paredes da massa: cadeia fechada de paredes retas (5 cm, segmento mínimo 0,40 m), do nível ao próximo ou ao topo, nota de face inclinada — `packages/engine/src/massaDerivaParedes.test.ts`, `packages/model/src/massDerivaParedesCommands.test.ts`, `tests/kernel-massa-paredes.wasm.test.ts`
- [x] G3 Pisos e paredes na torre torcida pela interface, com Ctrl+Z e Ctrl+Y — `tests/e2e/massa.mjs` (passo 6)
- [x] G4 Copiar piso, laje ou parede gerados remove `origemMassa` (E16, E17) — `packages/model/src/massDerivaParedesCommands.test.ts`, `packages/model/src/transformPlanar.test.ts`
- [-] G5 Vínculo automático massa → piso/parede (mudar a massa muda o piso): fora de escopo (A.9); o comando se roda de novo
- [-] G6 Furos nas paredes derivadas: só o anel externo de cada componente vira parede (E17)
- [-] G7 Telhado e forro por face, fachada em painéis: fora de escopo (A.9); os botões "por face" seguem `soon`
- [-] G8 Terreno e lote: fora de escopo (A.9)

## Saídas
- [x] X1 IFC: um `IfcBuildingElementProxy` por massa com a malha lod 2 e `Pset_Hestia_Massa`; sem kernel a massa sai omitida com aviso — `packages/io/src/ifc/ifcMassa.test.ts`, `apps/web/src/editor/ifcExportMassa.test.ts`; `npm run test:ifc-export`
- [x] X2 DXF: planta na camada `MASSA`, corte e elevação em `CORTE_MASSA` e `CORTE_MASSA_PROJECAO` — `packages/io/src/dxfMassa.test.ts`, `apps/web/src/editor/dxfExportMassa.test.ts`
- [x] X3 Prancha com planta, corte, elevação e 3D vetorial; PDF com as quatro vistas — `tests/kernel-massa-exporta.wasm.test.ts`; `tests/e2e/massa.mjs` (passo 4, captura `prancha.png`)
- [-] X4 Reimportação de IFC com a parametrização: o importador devolve a massa como `Generic` com a malha, sem seções nem arranjo (E18); importação de massa por IFC/OBJ é fora de escopo (A.9)
- [-] X5 Conferência do IFC, do DXF e do PDF em programa externo (CAD, leitor de PDF): não feita (E18)

## Estabilidade (A.8)
- [x] A1 Nenhuma entrada derruba o app: massa inválida recusada pelo comando, erro do kernel vira aviso — `packages/model/src/massCommands.test.ts`, `packages/engine/src/massaServico.test.ts`
- [x] A2 Fuzz de 200 massas — `massa_testes_fuzz.rs` (`fuzz_200`), `massa_corte_testes.rs` (`lacos_fechados_fuzz`), `massa_testes_r2_fuzz.rs` (`fuzz_200_fatias_planta_quant_avisos`)
- [x] A3 Valores de referência M1 a M5 — `crates/geom-wasm/src/massa_testes.rs`, `tests/kernel-massa-motor.wasm.test.ts`
- [x] A4 Cache por assinatura — `packages/engine/src/massaProjeto.test.ts`, `packages/engine/src/kernelMassa.test.ts`, `packages/render/src/model3d/massa3d.test.ts`
- [x] A5 Tempo — `packages/engine/src/massaDesempenho.perf.test.ts`
- [x] A6 3D (lote transparente, seleção, picking) — `packages/render/src/model3d/massa3d.test.ts`; captura `docs/massa/evidencias/final/3d.png`
- [x] A7 Desfazer, refazer, copiar/colar, salvar/abrir e migração — `packages/model/src/esquema.test.ts`, `packages/model/src/massCommands.test.ts`, `apps/web/src/editor/transferMassa.test.ts`, `tests/e2e/massa.mjs` (passo 7a)
- [x] A8 E2E no navegador, sem erro de console — `tests/e2e/massa.mjs`, `tests/e2e/massa-ui.mjs`, `tests/e2e/massa-visual.mjs`
- [x] A9 `massa_planta` sem kernel e com kernel desligado em tempo de execução: o app recusa abrir projeto sem o kernel no build de produção; o caminho "sem kernel" só existe no modo de desenvolvimento (`?kernel=ts`), onde `tests/e2e/massa.mjs` (passo 7b) o prova
- [-] A10 Teste de desempenho em máquina de referência fixa: os limites são o dobro do alvo e valem para a máquina de quem roda; os tempos medidos ficam no relatório da ficha Q1
