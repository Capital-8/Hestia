# HANDOFF · Esquadrias v3 (2026-10-27): como continuar em outro computador

> **ATUALIZAÇÃO (2026-11-17): documento histórico.** A v3 já foi integrada ao `main` (campos `frameDepthMode`, `tiltAxis`, `reveal`, `glassKind`, `openingNominal` presentes; ver `F-PROGRESSO.md` e `docs/PENDENCIAS-2026-10-28-cotas-padroes-esquadrias.md`). Os "108 testes quebrados" e as branches `feat/esquadrias-v3` e `feat/esq-BRD` abaixo não valem mais. Em 2026-11-17, 51 arquivos / 681 testes de esquadrias (model, engine, io, web) passaram no `main`. Pendências reais: validar alizar e maçanetas no 3D, IFC com peças, F8 (bay/bow/canto), baselines visuais, lacunas L-5 a L-16 do documento B.

Estado ao desligar: trabalho **interrompido no meio da integração da v3**. Nada foi perdido: tudo está commitado e enviado ao GitHub nas branches abaixo.

## 1 · Branches (repositório `engdennylsonsantos-cloud/Hestia`)

| Branch | O que é | Estado |
|---|---|---|
| `ccr-25143eb2-08pwa4` | branch de trabalho do dono; contém a **v2 mesclada** (merge `2bc5870`: modelo único, colocação, diálogo, 9 famílias novas) | estável, testes verdes |
| `feat/esquadrias-v3` | **v3 em integração**: v2 + pesquisa ArchiCAD/Brasil + BA + FR1 + FR2 + schema v3 | **108 testes falham de propósito** (ver §3); `tsc` e lint ok |
| `feat/esq-BRD` | tarefa BRD interrompida (diálogo completo + catálogo brasileiro), base = `feat/esquadrias-v3` | WIP, testes podem falhar |

## 2 · O que a v3 já tem (mesclado em `feat/esquadrias-v3`)

Pedido do dono (2026-10-26/27), spec em [E3](E3-spec-correcoes-v3.md) e decisão [0035](../decisoes/0035-esquadrias-v3.md):

- **Pesquisa** (4 dossiês, ~270 KB) em `docs/aberturas/archicad/`: `01-portas-configuracao`, `02-janelas-configuracao`, `03-logica-de-modelagem` (GDL, reveal, wall closure, casing, rebate), `04-brasil-tipos-e-normas` (NBR 15930, 10821, 9050, 6492; medidas; parâmetros recomendados).
- **FR1**: batente em **peça única** com seção em L (`PartProfile`), `frameDepthMode` (`wall` padrão, `core`, `fixed`), acabamento da parede **encosta** no batente (sem retorno por cima), alizar assentado na face acabada com `sides`, pivô da folha sem atravessar o batente, planta mostra **só a folha aberta**.
- **FR2**: 3D (prismas extrudados), corte e elevação para peças com perfil; silhueta unida do alizar.
- **BA**: janela **basculante** com eixo horizontal central/excêntrico (`tiltAxis`), bandeira em janelas (corrige a "metade da janela some": `windowLayout` única), catálogo `ot_jb80`.
- Schema novo em `packages/model/src/openingTypes.ts` e `openingModelTypes.ts`: `frameDepthMode`, `casing.sides`, `leafMaterialId`, `glassKind`, `tiltAxis`, `nominalRef` (NÃO implementado; fora do diálogo), `glassRatio`, `hinges`, `threshold`, `reveal`, estilos `boards`/`fullglass`, role `hinge`, `LeafOpening.kind 'tilt'` e `axisZ`.
- Tabela `openingOptionSupport(familyId)` (`packages/model/src/openingSupport.ts`): quais opções valem para cada família (diálogo e motor devem respeitá-la).

## 3 · O que falta (em ordem)

1. **FIX** (reconciliar testes): rodando `npx vitest run packages/engine packages/model packages/render apps/web/src --exclude "**/property.test.ts" --exclude "**/*perf.test.ts"` em `feat/esquadrias-v3` há ~108 falhas: 84 são a referência de ouro `packages/render/src/plan/ouroZoom.json` (regravar **por último**, com teste temporário que percorre `cenarios()` × zooms [12, 60, 220]); ~20 são testes de v2 com contagens/posições antigas (batente de 3 peças em vez de 11 caixas, profundidade 18,4 cm no modo `wall`, pivô novo, alizar na face): atualizar mantendo a intenção, ou defeito real a corrigir (`instanciada3d` silhueta de arestas; invariantes do catálogo). `shortcutConfig.test.ts` estoura 5 s só sob carga (ignorar). Prompt pronto: `agentes/prompts/FIX.md`.
2. **BRM** (motor/3D/corte/planta dos campos novos: `boards`, `fullglass`, `glassRatio`, `hinges`, `threshold`, `leafMaterialId`, `glassKind`, `reveal`): prompt `agentes/prompts/BRM.md`. Rodar **depois** do FIX.
3. **BRD** (diálogo mostrando só as opções que se aplicam + catálogo brasileiro + auditoria): prompt `agentes/prompts/BRD.md`; há WIP em `feat/esq-BRD` (ver `git log`). Mesclar em `feat/esquadrias-v3` e resolver conflitos com `defaults.ts` (materiais do BRM × tipos do BRD).
4. **Verificação visual no navegador** (planta, elevação, 3D por tipo): conferir de novo o mostruário (template `esquadrias`) e as prévias do diálogo; pontos a olhar: basculante (planta com eixo), portão seccionado, janela com bandeira, alizar em planta.
5. **Limite de linhas**: `npm run lint` tem `max-lines 420`; se algum arquivo estourar, dividir sem mudar comportamento (tarefa Rf já fez isso na v2).
6. Quando tudo verde: `npm run lint`, `npx tsc -p tsconfig.json --noEmit`, `node scripts/check-boundaries.mjs`, suíte rápida; depois **mesclar `feat/esquadrias-v3` em `ccr-25143eb2-08pwa4`** (cuidado: `apps/web/src/editor/controller.ts` tem alterações locais de outra frente do dono, não commitadas na época).
7. Pendências antigas da v2: baselines visuais de `tests/e2e/baseline*` (regravar no ambiente de referência: `UPDATE_BASELINE=1 npm run test:visual`), V de abertura no corte transversal, portão seccionado sem recolher, orçamento de draw calls do plano em 100 (`gpuPlan.test.ts`).
8. Ideia ainda não feita: `nominalRef 'leaf'` (dimensões do tipo referidas à folha, como "porta 80×210" no Brasil; vão = folha + 80/50 mm, NBR 15930-2) — exige trocar usos de `type.width/height` por um tamanho de vão derivado.

## 4 · Convenções decididas pelo dono (não reverter)

- Linha de abertura (V): vértice no lado **oposto** à dobradiça, configurável (`ProjectSettings.openingLine`); tracejado quando a folha abre para o observador. Bandeira/vidro fixo sem linha.
- Planta de porta: **só a folha aberta**. Batente: **uma peça**; profundidade acompanha a parede por padrão. Basculante: eixo horizontal central/excêntrico.
- Agentes de código: **apenas** `opencode-go/deepseek-v4.1-flash` ("nada de pro, gasta muito token"); sem `--auto` (o classificador de segurança bloqueia).

## 5 · Como retomar com agentes opencode (Windows, Git Bash)

Os prompts e utilitários estão neste repositório em `docs/aberturas/agentes/` (`prompts/*.md`, `tools/*`). Eles usam o diretório irmão `../hestia-wt` e caminhos absolutos do PC original (`<pasta-local>/...`): **ajuste os caminhos no topo de `tools/setup-wt.mjs` e `tools/rm-wt.sh`**.

1. `git fetch && git checkout feat/esquadrias-v3`. `npm install` na raiz.
2. Criar uma worktree por agente: `node setup-wt.mjs <NOME> feat/esquadrias-v3` (cria `feat/esq-<NOME>` e um `node_modules` por **junções** para o do repositório principal, com `@hestia/*` apontando para a worktree). Copie `opencode.dev.json` como `opencode.json` dentro da worktree (permissões restritas: edição, vitest/tsc/eslint, git add/commit; nada de `--auto`).
3. Rodar (de dentro da worktree): `opencode run "Execute integralmente as instruções dos arquivos anexos (COMMON.md e a tarefa <NOME>.md), nesta worktree. Só encerre quando todos os critérios estiverem provados e o RELATORIO.md estiver escrito." -m opencode-go/deepseek-v4.1-flash --dir "$PWD" -f ../prompts/COMMON.md -f ../prompts/<NOME>.md > ../logs/<NOME>.log 2>&1 &` (os `.md` ficam na pasta `prompts` ao lado das worktrees).
4. Revisar o relatório e o diff de cada agente; mesclar em `feat/esquadrias-v3` (`git merge --no-ff`), apagar o `RELATORIO.md` da raiz antes de commitar a mescla; rodar testes.
5. **Remover worktree com segurança**: `bash rm-wt.sh <pasta>` **antes** de `git worktree remove` (remove só as junções; um `rm -r` direto seguiria as junções e apagaria o `node_modules` principal).
6. Ordem sugerida: FIX → BRM → (mesclar BRD) → verificação visual → lint/testes → mesclar na branch do dono.

## 6 · Atalhos de verificação visual

Há scripts de captura (Playwright com Edge, `channel: 'msedge'`) usados nesta rodada; a ideia: abrir `apps/web/dist/index.html?gl=1&debug=1` (após `npm run build`), `window.__hestia.editor.newProject('esquadrias')` (mostruário com todos os tipos e etiquetas), `window.__hestia.useUi.setState({ dialog: 'openingType', dialogArg: '<id do tipo>' })` abre o diálogo com as prévias (planta, elevação, corte, 3D). O 3D do projeto principal não responde ao `animateTo` da órbita em script; as prévias do diálogo dão a conferência 3D por tipo.
