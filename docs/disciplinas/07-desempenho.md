# Desempenho das disciplinas — medição de 2026-11-24

Projeto de referência: **“Teste de disciplinas (completo)”** (`buildTemplate('casa-disciplinas')`), 2 níveis, 8 plantas de disciplina, todas as categorias.

## Como foi medido

- **Navegador:** Chrome 157, GPU real (AMD Radeon RX 580, ANGLE/OpenGL), página **headful** a 60 Hz, app em **modo dev** (Vite), 5 repetições; mediana do tempo entre o comando e **dois `requestAnimationFrame`** depois (o quadro pintado).
- **CPU (Node):** `vite-node scripts/bench-disciplinas.mts`, sem navegador/GPU; `ModelScene.update`, `planStyleOf`, `planViewOf`, `buildPlanDrawList` e `ProjectStore.exec`.
- Baseline de UI: um `previewTick` (sem mudança de projeto) custa **33 ms**, que são basicamente os dois frames a 60 Hz — ou seja, sem trabalho de projeto o app responde no quadro seguinte.

## Resultados no navegador (dev, GPU real)

| Ação | Mediana | Mín. | Máx. |
|---|---:|---:|---:|
| `previewTick` (baseline, 2 frames) | **33 ms** | — | — |
| Mudar a seleção | **153 ms** | — | — |
| Comando de projeto sem mudança visual (no-op) | **240 ms** | — | — |
| 3D: mudar só o fundo | **242 ms** | — | — |
| 3D: perfil de disciplina (parede 50% ↔ 100%) | **354 ms** | 323 | 472 |
| 3D: estilo (sombreado ↔ linhas ocultas) | **293 ms** | 273 | 465 |
| 3D: transparência de categoria (0% ↔ 40%) | **203 ms** | 174 | 260 |
| Planta: tom/apresentação da parede | **160 ms** | 116 | 169 |

## Resultados no navegador (build de produção, GPU real)

O mesmo roteiro contra `apps/web/dist` (build de produção, sem `jsxDEV`):

| Ação | Mediana | Mín. | Máx. |
|---|---:|---:|---:|
| Abrir o projeto de referência | **809 ms** | — | — |
| 3D: perfil de disciplina (parede 50% ↔ 100%) | **123 ms** | 98 | 176 |
| 3D: estilo (sombreado ↔ linhas ocultas) | **127 ms** | 110 | 249 |
| 3D: transparência de categoria (0% ↔ 40%) | **84 ms** | 44 | 89 |
| Planta: tom/apresentação da parede | **48 ms** | 41 | 255 |

O modo dev é ~2,5–3× mais lento que o build de produção. O build já reduz bastante; o que sobra (48–127 ms) é o trabalho real de projeto/React/Three.js, não geometria.

## Resultados em CPU (Node)

| Operação | Tempo |
|---|---:|
| Comando `setDisciplineProfile` | ~0,6 ms |
| `planStyleOf` (com apresentações) | ~0,06 ms |
| `planViewOf` (cache) | ~0,03 ms |
| `ModelScene.update` com apresentação nova | ~14 ms |
| Montagem inicial da cena 3D | ~490 ms (frio) |

## Diagnóstico

1. **O gargalo não é a geometria nem o Rust.** A resolução/montagem da cena em CPU custa ~14 ms; o comando custa <1 ms. O Rust/WASM já resolve o kernel geométrico. O que pesa é o **pipeline de UI/projeto**: qualquer comando troca a identidade do `Project` e faz React + Three.js + caches de projeto refazerem trabalho.
2. **Até um comando sem mudança visual custa 240 ms.** O perfil de CPU mostra `jsxDEV`/React DEV, `(program)` nativo (paint/GPU) e reconstrução de cena/caches. `uiTick` puro custa 33 ms; é a mudança de projeto que dispara a cadeia.
3. **Caches por identidade do projeto.** `planViewOf` e outros derivados usam `WeakMap<Project, …>`; cada comando cria um `Project` novo, então o cache é perdido mesmo quando só a apresentação mudou. A planta reconstrói geometria/lista à toa.
4. **3D remonta por mudança de apresentação.** A chave da cena inclui a apresentação/tons; mudar opacidade deveria só trocar material/cor, não remontar os níveis.
5. **Modo dev vs produção.** No build de produção o mesmo gesto cai para **48–127 ms** (de 160–354 ms no dev). O `jsxDEV`/validações de desenvolvimento explicam boa parte da diferença; o restante é projeto/React/Three.js. Para sentir o app “instantâneo”, teste o build de produção; no dev, o número é pessimista.

## Otimizações já aplicadas nesta rodada

- **Sliders do configurador gravam um comando por gesto, não por pixel**: o slider global de opacidade atualiza o valor local durante o arraste e só grava no `pointerup`/`keyup`; os campos de clareamento/opacidade por categoria usam `NumField` (commit no blur/Enter). Antes, cada passo do arraste virava um comando de 200–350 ms, o que fazia o arraste parecer travado.

## Próximas otimizações (ordem de impacto)

1. **Cache por conteúdo, não por identidade do projeto.** `planViewOf`/resolvedores devem ser chaveados pela assinatura geométrica do nível (já existe em `chavesDeNivel`/`assinaturasDoProjeto`). Trocar só `view3d`/`tones` não pode invalidar geometria.
2. **Cena 3D: separar geometria de apresentação.** Tirar `apresentacoes`/`toneCategories` da chave do nível; para opacidade/clareamento, atualizar materiais in place e refazer só o pick layer. `text`/`transparência` não mudam triângulos.
3. **Caminho rápido para comandos de vista.** `updateView3d`/`updatePlanView.tones` não deveriam passar pelo mesmo pipeline de conteúdo; aplicar no quadro atual sem re-resolver níveis.
4. **React:** seletores estreitos/memo nos painéis que consomem o projeto inteiro; testar/medir o **build de produção** (sem `jsxDEV`).
5. **Rust:** não é a peça que falta para esta interação. O kernel geométrico já é Rust/WASM; mover React/Three.js para Rust não resolveria o custo de UI. Se depois de 1–4 ainda houver custo de geometria, aí sim vale medir o kernel.

## Ajuste final (2026-11-24)

O predefinido de **Arquitetura vista de outra disciplina** passa a ser `halftone`, clareamento 20% e **opacidade 12%** (antes 50%). A parede tem várias camadas e a opacidade por camada empilha no 3D; se ainda ficar forte, o slider do configurador permite baixar mais (ou “Restaurar predefinido” volta a 12%). Com isso o pacote de UX das disciplinas está **concluído**.

## Reprodução

```bash
npx vite-node scripts/bench-disciplinas.mts        # CPU
# navegador: ver o roteiro no histórico da sessão (Playwright headful + RX 580)
```
