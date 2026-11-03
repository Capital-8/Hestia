# R1 — Fundação 3D GPU-first (Fase 2.1/2.2)

- **Data:** 2026-10-26
- **Squad:** 2 — 3D GPU (Fase 2)
- **Worktree:** `...\.local\share\opencode\worktree\8fed4c\gpu-r1-foundation`
- **Ramo:** `gpu/r1-foundation` (commit local; sem push)
- **Base:** `50536a8` (S1 + S2 integrados)
- **Plano:** plano de subagentes de 2026-10-26 (documento removido) (v3) §4/Fase 2.1/2.2 e brief R1
- **Fora do escopo (por brief):** culling/LOD/sombras/precisão (R2), picking/realce GPU (R3), clipping (R4), planta (R5), `apps/web/src`, `packages/engine`, `packages/model`.

## 1. Resultado

A cena 3D padrão passou a montar **todos os níveis em lotes globais por categoria e material** e a manter as caixas
(paredes retas e esquadrias) em `InstancedMesh` por grupo. O gestor de recursos reusa os buffers e envia só a faixa do
nível alterado; a montagem progressiva fecha a ordem canônica no último lote, então o resultado final é idêntico ao de
uma montagem completa.

| Cenário | Draw calls (antes → depois) | Triângulos/quadro (antes → depois) | Frame CPU ms (antes → depois) | Montagem 3D (antes → depois) |
|---|---:|---:|---:|---:|
| **60 pav × 128 paredes** (principal) | **251 → 14** | 853.022 → 853.022 | 3,2 → 1,0 | 32,5 s → **17,8 s** |
| **30 pav × 256 paredes** (secundário) | **131 → 14** | 852.542 → 852.542 | 2,2 → 1,0 | 21,0 s → **18,5 s** (S2: 20,0 s) |
| **60 pav × 256 paredes** (registro) | **251 → 14** | 1.705.022 → 1.705.022 | — → 1,0 | 56,0 s → **38,8 s** |

Leituras:

- **Meta de draw calls:** 14 por quadro (≤500) nos três cenários. O número não cresce com pavimentos nem paredes.
- **Meta de triângulos:** 60×128 e 30×256 ficam em **0,85 M** (≤3 M). O quadro estável de 60×256 fica em **1,71 M**.
- **1º quadro de 60×256:** ao sujar o mapa de sombra, o passe extra continua em **3,41 M triângulos** (com 25 draw
  calls, antes 439). Continua acima de 3 M, como previsto: é do R2 (sombras/LOD/culling), não do R1.
- **60×128 com sombra suja:** 25 draw calls / 1,71 M triângulos (dobra de triângulos do passe de sombra).
- **Uploads de montagem (S1):** 60×128 passou de 1.022 uploads/581,6 MB para 944/111,5 MB; 30×256 de 512/295,0 MB
  para 464/95,2 MB. O fecho da montagem faz uma última consolidação (buffer exato), mas o total ainda cai ~80%.
- **VRAM contábil:** 18,9 MiB (60×128), 18,5 MiB (30×256) e 37,0 MiB (60×256), com teto de 256 MiB — sem estouro.
- **Quadro estável:** `uploads = 0` e `rebuilds = 0` nas 60 amostras de câmera parada. Nenhuma geometria é
  criada/descartada por quadro.

### 1.1 Por categoria (60×128 estável)

| Categoria | Antes | Depois |
|---|---|---|
| Pisos | 1 malha por nível (60) | **1 lote global** |
| Lajes | 1 malha por nível (60) | **1 lote global** |
| Telhados / beirais | 1 malha por material em cada nível com telhado | **2 lotes globais** (telhado + beiral) |
| Arestas | 1 linha por nível (60) + 1 linha das caixas | **1 linha global** (arestas de sólidos + caixas) |
| Paredes retas e esquadrias | `InstancedMesh` por material, recriada a cada atualização | **`InstancedMesh` por material, reaproveitada** (6 grupos de parede + 1 de porta) |
| Escadas | 1 malha por material (no cenário sintético não há escada) | **1 lote global por material** (testado na fixture com escada) |
| Chão/grade | 2 | 2 |

Composição do quadro de 14 draw calls: 6 grupos de parede + 1 piso + 1 laje + 2 telhado/beiral + 1 porta + 1 linha de
arestas + 1 grade + 1 chão. O `contar-r1` usado para conferir é temporário e não está versionado.

## 2. O que mudou

### Novos arquivos (`packages/render/src/gpu/`)

| Arquivo | Papel |
|---|---|
| `orcamento.ts` | Orçamento contábil de VRAM por chave; teto de 256 MiB e diagnóstico de estouro. |
| `loteGeometria.ts` | Lote de geometria por categoria/material: segmento por nível, `addUpdateRange`/`bufferSubData` na faixa alterada, compactação, consolidação e faixas de elemento globais. |
| `loteLinhas.ts` | Linha única das arestas, com um segmento por nível e o mesmo envio parcial. |
| `instanciasGpu.ts` | `InstancedMesh` por categoria/material com buffer de matrizes em segmentos por nível; envio parcial e consolidação. |
| `gestorRecursos.ts` | Sincroniza os níveis com os grupos; remove níveis ausentes, evita reenvio de entrada já aplicada e fecha a montagem na ordem do projeto. |
| `orcamento.test.ts` / `gestorRecursos3d.test.ts` | Testes do orçamento, dos lotes, das instâncias, do envio parcial, da compactação e do fecho da montagem. |

### Alterados (`packages/render/src/model3d/`)

- `scene3d.ts`: caminho padrão passa a montar lotes globais via `GestorRecursosGpu`; `instanciar: false` continua com
  a geometria por nível de antes. Arestas de sólidos e caixas viram uma linha. Expõe `memoriaGpu`/`orcamentoVram`.
- `cacheMalhas3d.ts`: a entrada do nível guarda os lotes, as arestas juntas e os materiais de beiral; o teto do cache
  passa a contar também esses arrays.
- `pick3d.ts`: o BVH é invalidado por versão da geometria (`userData.versao`) e cobre só o `drawRange`, não a
  capacidade do buffer (os lotes globais são atualizados no mesmo `BufferGeometry`).
- `fixturesInstanciada3d.ts`: leitura de triângulos/segmentos respeita o `drawRange`.
- `malhasInstanciadas3d.ts`: removido (substituído por `gpu/instanciasGpu.ts`).
- Testes: `instanciada3d.test.ts` (lotes globais por categoria, reuso das instâncias), `malhasPorNivel3d.test.ts`
  (envio parcial de caixas/arestas; grupos de nível filtrados), `scene3d.test.ts` (pisos/telhado/escada globais;
  caminho de referência intacto).

## 3. Arquitetura em uma página

1. `montarNivel` monta os sólidos do nível e devolve os `SolidBatch` (sem criar malha no caminho padrão), as matrizes
   das caixas, as arestas e a geometria de picking das caixas. A chave do nível continua sendo a do `chaveNivel3d.ts`.
2. `GestorRecursosGpu` agrupa por categoria+material e mantém um segmento por nível em cada buffer:
   - nível novo: acrescenta no fim;
   - nível com a mesma contagem: escreve só a faixa e marca `addUpdateRange` (posição, normal e índice);
   - contagem diferente/remoção: compacta o grupo afetado (não o modelo inteiro).
3. O fecho da montagem (último lote) reordena os segmentos pela ordem do projeto e corta a capacidade para o tamanho
   exato. Isso torna o resultado independente da ordem de chegada da montagem progressiva e reduz a VRAM.
4. O picking continua por faixas de elemento: o lote global leva `userData.ranges` com os offsets de cada nível; as
   caixas continuam com as malhas de picking invisíveis por nível. O BVH é reconstruído quando a versão da geometria
   muda. Realce e caixa da seleção leem as mesmas faixas.
5. O caminho `instanciar: false` não usa o gestor: mantém uma malha por material/nível, uma linha de arestas por
   nível e a geometria de picking do wireframe. É a referência de igualdade e o fallback.

## 4. Validação (L1)

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erro |
| `npx vitest run packages/render/src/model3d` | ✅ **35 arquivos / 529 testes** |
| `npx eslint packages/render/src/model3d packages/render/src/gpu packages/render/src/index.ts` | ✅ sem erro |
| `npx vitest run apps/web/src/ui/montagem3dProgressiva.test.ts` | ✅ 17 testes (fora do L1, conferido porque toca o contrato do `ModelScene`) |
| Build de produção | ✅ `npm run build -w @hestia/web -- --target esnext --minify false` |
| Medição S1 | ✅ 3 execuções por cenário (60×128 e 30×256); 1 em 60×256 para registro |

Método da medição: Chrome 155.0.8059.86 headless, Radeon RX 580 2048SP (ANGLE/D3D11), build de produção em
`file://`, `?debug=1&perf=1&overlay=0`; 3 execuções, mediana do quadro estável (60 quadros de câmera parada) e do
primeiro quadro após sujar o mapa de sombra. O roteiro temporário usa `window.__hestiaPerf.reset()`/`snapshot()` do S1 e
não está versionado. Antes = `50536a8`; depois = este ramo. Os números de 60×256 "antes" vêm do S2
(`docs/desempenho/s2-projeto-grande-2026-10-26.md`), pois o build anterior não foi preservado.

## 5. Riscos e o que ficou fora

- **R2 (culling/LOD/sombras/precisão):** o 1º quadro de 60×256 continua em 3,41 M triângulos por causa do passe de
  sombra; o R1 só reduziu as draw calls de 439 para 25. Culling/LOD/CSM e reversed-Z continuam do R2.
- **R3 (picking/realce GPU):** o picking continua na CPU (BVH por lote e por malha de caixas); o R1 apenas manteve a
  igualdade e invalidou o BVH por versão. O realce ainda copia triângulos.
- **R4 (clipping):** não tocado.
- **`medir:gpu` (S2) estabiliza a montagem pela contagem de malhas.** Com lotes globais, a contagem de malhas para de
  crescer antes do conteúdo terminar; o roteiro de medição deste relatório passou a olhar `memoriaMalhas`/triângulos.
  O `scripts/medir-gpu-memoria.mjs` não foi alterado (fora do escopo do R1); o M0/H1 precisa trocar o critério.
- **Picking por nível:** as malhas de picking das caixas continuam uma por grupo de nível (invisíveis, sem draw call),
  então o número de objetos cresce com os pavimentos. É o alvo natural do R3 (ID buffer/instancing de picking).
- **Timer de GPU:** `gpu.ms` é a última amostra assíncrona do `EXT_disjoint_timer_query_webgl2`; varia com o driver
  (5,3 ms em 60×128 depois contra 1,4 ms antes) e não deve ser lido como regressão. O `frameMs` (CPU) caiu.
- **Igualdade visual por imagem:** não foi feita captura antes/depois (A2/H1). A igualdade coberta aqui é geométrica
  (caixa/volume/vértices por categoria, ocupação, arestas, picking, realce, seleção) nos testes existentes. Uma
  conferência de PNG em 60×128/30×256 fica para A2/H1.
- **Cache por nível:** o teto de 128 MB do `CacheMalhas` conta agora os arrays dos lotes e as arestas; em 60×256 o
  total fica em ~123 MiB, perto do teto. Projetos maiores podem expulsar níveis e remontá-los ao voltar — o LRU já
  cobre isso, mas o teto pode precisar de ajuste no H1.
- **Flags/limites:** nada muda no default (WebGL2). Nenhum push, `git stash` ou `reset --hard`.

## 6. Próximo passo

1. R2 herda `scene3d.ts` e o gestor: culling/LOD por grupo global e sombra em cascata; o 1º quadro de 60×256 precisa
   cair abaixo de 3 M.
2. R3: picking/realce por ID buffer (sem cópia) sobre as mesmas malhas; o picking por nível das caixas pode virar
   parte do buffer global.
3. M0/H1: trocar a estabilização de `medir:gpu` para conteúdo (memória/triângulos) e rodar a matriz WebGL2/WebGPU.
