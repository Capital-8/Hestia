# S2 — projeto grande: cenários 30/60 pavimentos × 128/256 paredes

- **Data:** 2026-10-26
- **Frente:** Squad 0 — Fase 0 (Verdade), agente **S2**
- **Worktree:** `<usuario-local>\.local\share\opencode\worktree\8fed4c\gpu-s2-stress`
- **Ramo:** `gpu/s2-stress` (commit local; sem push)
- **Base:** `181469f` (`docs(perimetro): estado atual e pendências para continuar localmente`)
- **Plano:** plano de subagentes de 2026-10-26 (documento removido) (v3), itens 0.3/0.4 e brief S2
- **Natureza:** validação exploratória, **não é a medição oficial M0**. Duas repetições por cenário (`PERF_RUNS=2`)
  no quadro estável, mais o primeiro quadro depois da montagem registrado à parte.

## 1. Resumo

O gerador passou a aceitar pavimentos e paredes por pavimento por CLI/env, sem alterar o projeto padrão de 32
paredes (que continua idêntico ao `fixtureSintetica`). `medir:gpu` aceita uma lista de cenários
(`MEDIR_PROJETOS`), mantendo `10,20,30 × 32` como padrão.

Os quatro cenários pedidos foram gerados, abertos no Chrome real e medidos em **WebGL2**:

| Cenário | `.hestia.json` | Abertura | Montagem 3D | Planta (draw/tris) | 3D estável (draw/tris) | 1º quadro 3D (draw/tris) | Processo Chrome (pico) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 30 pav × 128 paredes | 2,90 MB | 1.755 ms | 8,3 s | 58 / 10.644 | 131 / 426.542 | 229 / 853.082 | 939 MB |
| 30 pav × 256 paredes | 5,78 MB | 4.473 ms | 20,0 s | 90 / 20.560 | 131 / 852.542 | 229 / 1.705.082 | 1.234 MB |
| 60 pav × 128 paredes | 5,78 MB | 4.105 ms | 30,0 s | 58 / 10.644 | 251 / 853.022 | 439 / 1.706.042 | 1.099 MB |
| 60 pav × 256 paredes | 11,56 MB | 8.657 ms | 56,0 s | 90 / 20.560 | 251 / **1.705.022** | 439 / **3.410.042** | 1.797 MB |

**Não houve estouro de memória nem falha de abertura.** O limite encontrado no 60 × 256 é de **tempo**: abertura de
8,7 s e montagem progressiva de 56 s (metas de 300 ms e 2 s). No **quadro estável** a 3D fica em **251 draw calls e
1,71 M triângulos** (metas ≤500 e ≤3 M). O **primeiro quadro** depois da montagem envia exatamente o dobro de
triângulos (3,41 M) e 439 draw calls — consistente com um passe extra de sombra; ele estoura a meta de triângulos e
precisa entrar no M0 separado, não misturado com a mediana. O heap do V8 fica em 182 MB e o processo inteiro do
Chrome em 1,80 GB de pico (não é VRAM; VRAM não é medida por este script).

## 2. O que mudou

### `scripts/perf-baselines/projeto-sintetico.mts`

- `syntheticProject(pavimentos, paredesPorPavimento = 32)`.
- **32 paredes:** delega para `fixtureSintetica.syntheticProject` — layout, ids, portas e geometria idênticos ao
  baseline anterior. `SEGMENTS` e `WALLS_PER_LEVEL` continuam exportados, então `bench-interacao.mts`,
  `bench-fluxo-edicao*.mts` e `tests/e2e/perf-browser.mjs` não precisaram mudar.
- **> 32 paredes:** grade determinística de células de 4 × 4 m (sem sorteio), com divisórias no meio de células
  ímpares até fechar a contagem exata; um ambiente por célula par (gera rótulo na planta) e uma porta a cada
  `paredes/8` paredes da grade.
- **CLI/env:** `PROJETO_PAVIMENTOS` tem precedência sobre o argumento posicional; `PROJETO_PAREDES` define as paredes
  (padrão 32). A saída informa MB, níveis, paredes, aberturas, ambientes e tempo do gerador.
- Layouts gerados: **128** = grade 7 × 8 (28 × 32 m) + 1 divisória, 28 ambientes e 16 portas/pav; **256** = grade
  9 × 13 (36 × 52 m) exata, 59 ambientes e 32 portas/pav.

### `scripts/medir-gpu-memoria.mjs`

- `MEDIR_PROJETOS` (padrão `10,20,30`) e `MEDIR_PAREDES` (padrão 32); cada item aceita `pavimentos:paredes`
  (ex.: `30:128,60:256`). A chave no JSON continua `10Pavimentos` no padrão e vira
  `30Pavimentos-256Paredes` quando as paredes diferem de 32.
- Cada cenário agora registra `gpu`, `paredesPorPavimento`, `arquivo` (bytes/MB/tempo do processo vite-node),
  `aberturaMs`, contagem de `elementos`, `montagemMs` e `montagemEstavel`.
- **Correção necessária:** no HEAD a medição da 3D procurava `button.leaf` e falhava com
  `locator.click: Timeout 30000ms exceeded` na interface atual. Passou a abrir a vista pelo `treeitem`
  “Modelo 3D” (com fallback para o botão antigo) e a esperar `window.__hestia3dModel`.
- A montagem 3D é progressiva; medir no meio subestima draw calls e malhas. O script espera a contagem de malhas parar
  por 1,5 s (limite `MEDIR_TIMEOUT_MS`, padrão 120 s) antes do `fit`, e registra o tempo e se estabilizou.
- Variáveis novas: `MEDIR_TIMEOUT_MS`, `MEDIR_ESPERA_3D_MS` (espera fixa opcional antes da estabilização).

### Novos arquivos

- `scripts/perf-baselines/cenarios-projeto-grande.json` — definição reproduzível dos cenários, layouts, tamanhos e
  SHA-256 dos `.hestia.json`.
- `scripts/perf-baselines/gpu-memoria-s2-exploratorio-2026-10-26.json` — medição dos quatro cenários.
- `scripts/perf-baselines/gpu-memoria-s2-validacao-padrao.json` — regressão do padrão 10/20/30 × 32 com o script novo.

Nenhum arquivo de `apps/web/src`, `packages/*/src` ou teste unitário foi alterado.

## 3. Comandos exatos

```powershell
# build usado (dist não existia no worktree)
npm run build -w @hestia/web -- --target esnext --minify false
# built in 20.18s; dist/index.html 7.151,38 kB (single-file)

# L1 — sintaxe
node --check scripts/medir-gpu-memoria.mjs
node --check scripts/perf-baselines/projeto-sintetico.mts

# geração (repetida para 10, 30/128, 30/256, 60/128, 60/256)
$env:PROJETO_SAIDA="$env:TEMP\hestia-s2-60-256.hestia.json"
$env:PROJETO_PAVIMENTOS="60"; $env:PROJETO_PAREDES="256"
npx vite-node scripts/perf-baselines/projeto-sintetico.mts 60

# regressão do padrão (10, 20 e 30 pavimentos × 32 paredes)
Remove-Item Env:MEDIR_PROJETOS, Env:MEDIR_PAREDES
$env:PERF_RUNS="2"; $env:PERF_ROTULO="s2-validacao-padrao"
npm run medir:gpu

# exploratório dos cenários grandes (2 repetições no quadro estável)
$env:MEDIR_PROJETOS="30:128,30:256,60:128,60:256"
$env:PERF_RUNS="2"; $env:PERF_ROTULO="s2-exploratorio-2026-10-26"
$env:MEDIR_TIMEOUT_MS="240000"; $env:MEDIR_ESPERA_3D_MS="0"
npm run medir:gpu
```

## 4. Tamanho, geração e determinismo

| Cenário | Bytes | MB | Gerador (s) | Processo vite-node (s) | SHA-256 |
|---|---:|---:|---:|---:|---|
| 10 × 32 (padrão) | 252.542 | 0,24 | 0,03–0,04 | ~12 (1ª execução) | `565c8e16…5a6a53` |
| 30 × 128 | 3.037.259 | 2,90 | 0,15 | 2,18 | `404c6f82…c242062` |
| 30 × 256 | 6.061.790 | 5,78 | 0,36 | 2,50 | `4d558174…b6639356` |
| 60 × 128 | 6.059.005 | 5,78 | 0,57 | 4,07 | `e6f754d5…dc7543` |
| 60 × 256 | 12.124.209 | 11,56 | 1,04 | 3,45 | `417129dc…5425ae` |

“Gerador” é o tempo interno impresso pelo próprio script. “Processo vite-node” inclui o boot do vite-node e varia
muito com a máquina (já foi 22 s no mesmo dia); não é tempo de geração do projeto. Duas gerações de 30 × 128
produziram o mesmo SHA-256 — o arquivo é determinístico.

Elementos por cenário (contados no app depois da abertura, sem pendências):

| Cenário | Paredes | Aberturas | Ambientes | Pisos | Lajes | Telhados |
|---|---:|---:|---:|---:|---:|---:|
| 30 × 128 | 3.840 | 480 | 840 | 30 | 30 | 1 |
| 30 × 256 | 7.680 | 960 | 1.770 | 30 | 30 | 1 |
| 60 × 128 | 7.680 | 960 | 1.680 | 60 | 60 | 1 |
| 60 × 256 | 15.360 | 1.920 | 3.540 | 60 | 60 | 1 |

## 5. Medição exploratória (WebGL2)

Chrome 155.0.8059.86, headless, Xeon E5-2620 v3, 15,8 GB RAM, build de produção em `file://`. `PERF_RUNS=2`
(não confundir com M0). Draw calls e triângulos são o **quadro cheio** (maior número de draws em uma janela de 1,2 s),
não a média. “Abertura” é `openFromText` → segundo quadro pintado, na página já carregada. **3D estável** é a mediana
de duas repetições depois de um quadro de aquecimento; **1º quadro** é o primeiro desenho depois da montagem, que
refaz o shadow map.

| Cenário | Abertura (ms) | Montagem 3D (ms) | Planta draws | Planta tris | 3D estável draws | 3D estável tris | 1º quadro draws | 1º quadro tris | Malhas (total/visíveis) | V8 isolado (MB) | Chrome pico/estável (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 × 128 | 1.755,1 | 8.298 | 58 | 10.644 | 131 | 426.542 | 229 | 853.082 | 279 / 99 | 60,2 | 939,1 / 718,0 |
| 30 × 256 | 4.473,3 | 20.045 | 90 | 20.560 | 131 | 852.542 | 229 | 1.705.082 | 279 / 99 | 102,7 | 1.234,3 / 863,1 |
| 60 × 128 | 4.104,7 | 29.998 | 58 | 10.644 | 251 | 853.022 | 439 | 1.706.042 | 549 / 189 | 100,5 | 1.098,8 / 1.032,8 |
| 60 × 256 | 8.657,1 | 56.045 | 90 | 20.560 | 251 | 1.705.022 | 439 | 3.410.042 | 549 / 189 | 181,9 | 1.796,9 / 1.155,6 |

Leituras:

- **Draw calls crescem com pavimentos, não com paredes** (131 em 30 pav, 251 em 60 pav no quadro estável; 128 e 256
  iguais). O caminho atual instancia as paredes e agrupa por material; as malhas totais também são iguais (279 em 30,
  549 em 60). O custo das paredes aparece em **triângulos**, que quase dobram de 128 para 256.
- **Primeiro quadro ≈ 2× o estável** em triângulos e cerca de 1,7× em draw calls nos quatro cenários. Isso é um passe
  extra no primeiro desenho depois da montagem (hipótese: atualização do shadow map; não instrumentei a causa dentro
  do renderer). O M0 precisa registrar os dois, senão a meta de 3 M triângulos muda conforme a repetição pega ou não
  esse quadro.
- **Planta** é barata em draw calls (58/90) e não cresce com pavimentos — a vista mostra um nível.
- **Quadro estável:** o pior cenário (60 × 256) fica em 251 draw calls e 1,71 M triângulos, **dentro** das metas de
  500 e 3 M. O **primeiro quadro** de 60 × 256 chega a 3,41 M (+13,7% sobre a meta) e 439 draw calls (ainda abaixo de
  500).
- A abertura e a montagem crescem com o tamanho: 60 × 256 gasta 8,7 s para o segundo quadro e 56 s até a cena 3D
  parar de montar. Isso é muito acima das metas de 300 ms/2 s da v3 e é a evidência de escala que o M0 precisa registrar.
- Não houve erro de página, pendência ou falha de GPU nos quatro cenários. O backend foi **webgl2** em todos.

### Regressão do padrão (`10Pavimentos`, `20Pavimentos`, `30Pavimentos`, 32 paredes)

| Cenário | Abertura (ms) | Montagem 3D (ms) | Planta draws/tris | 3D estável draws/tris | 1º quadro draws/tris | V8 isolado (MB) | Chrome pico (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 10 × 32 | 458,8 | 2.487 | 26 / 2.974 | 51 / 29.342 | 89 / 58.682 | 19,6 | 627,1 |
| 20 × 32 | 514,5 | 2.942 | 26 / 2.974 | 91 / 58.622 | 159 / 117.242 | 23,4 | 685,7 |
| 30 × 32 | 583,9 | 3.654 | 26 / 2.974 | 131 / 87.902 | 229 / 175.802 | 27,0 | 703,0 |

As chaves do JSON continuam `10Pavimentos`, `20Pavimentos` e `30Pavimentos`, e o padrão roda sem variáveis novas.

## 6. Limitações e o que ficou fora

- **Não é M0.** Duas repetições por cenário (mediana), máquina possivelmente com outros agentes, sem p95 oficial. Os
  números servem para provar que o cenário existe, abre e mede — não para comparar antes/depois.
- **VRAM não é medida.** `medir:gpu` mede heap JS, heap do V8 (CDP) e WorkingSet dos processos do Chrome. Não há
  contador de VRAM/`WEBGL_debug_renderer_info` no script; o teto de VRAM fica para S0/S1/M0.
- **`performance.memory` não acompanha o projeto** neste Chrome (fica em 9,5 MB); a referência é `isolateUsadoMB`.
  O processo do Chrome é a árvore inteira, não a aba.
- **Abertura** é medida com a página já carregada, então não se compara com o “Abrir projeto” do
  `browser-20-pav-*.json` (que abre página nova). As aberturas de 30 × 128 (1,8 s) e 60 × 128 (4,1 s) não são
  monotônicas; com duas execuções, ainda é ruído da máquina possivelmente ocupada.
- **Montagem 3D** é o tempo até a contagem de malhas ficar 1,5 s parada, incluindo resolução e montagem progressiva;
  não é FPS nem tempo de quadro.
- Os cenários >32 paredes têm **ambientes e layout diferentes** do padrão de 32 (12 × 12 m → 28 × 32 m / 36 × 52 m).
  A comparação 32 × 128 isola a contagem de paredes; a comparação com 32 paredes mistura layout, ambientes e rótulos.
- **Primeiro quadro × quadro estável.** O primeiro desenho depois da montagem envia cerca de 2× os triângulos e 1,7×
  as draw calls do quadro estável (hipótese: shadow map; não instrumentei a causa). Por isso `medir:gpu` separa
  `primeiroQuadro` de `drawCalls`/`triangulos`: usar só a mediana esconde o pico, e usar só o primeiro quadro
  superestima o custo de uma câmera parada.
- **60 × 256 não estourou memória** (pico de 1,80 GB no processo; 15,8 GB de RAM). O limite observado é de tempo
  (abertura 8,7 s; montagem 56 s). No quadro estável os triângulos ficam em 1,71 M; o primeiro quadro chega a 3,41 M.
  Para rodadas curtas, o cenário viável é **60 × 128** (30 s de montagem, 0,85 M estável, 5,78 MB) ou **30 × 256**
  (20 s, 0,85 M, 5,78 MB); 60 × 256 fica para medições dedicadas.
- `perf-browser.mjs` **não foi alterado**. Ele continua em 10/20 pavimentos × 32 paredes e não conhece os cenários
  novos; a validação de abertura/medição usou `medir:gpu`.
- O `medir:gpu` já estava quebrado no HEAD para a interface atual (`button.leaf`); a correção foi mínima e está neste
  ramo. O caminho de contagem (interceptação WebGL2) não mudou.
- Pelo funil L1, não rodei `test:completo`, `test:rapido` nem `test:perf`. Também não rodei `bench:interacao` nem o
  `perf:browser` completo.

## 7. Próximo passo para o M0

Com o script atual, o M0 pode rodar em janela exclusiva:

```powershell
# comparabilidade com o baseline antigo (32 paredes)
$env:MEDIR_PROJETOS="10,20,30"; $env:PERF_RUNS="10"; $env:PERF_ROTULO="m0-padrao"
npm run medir:gpu

# alvo grande (paredes por pavimento explícitas)
$env:MEDIR_PROJETOS="30:256,60:128,60:256"; $env:PERF_RUNS="10"; $env:PERF_ROTULO="m0-grande"
npm run medir:gpu
```

Recomendações para o M0: máquina ociosa, `PERF_HEADED=1` ou headless registrado no JSON, 10 repetições, e tratar
`montagemEstavel=false` como pendência (o script já faz). Para 60 × 256, reservar pelo menos 10 min por execução e
registrar VRAM com a instrumentação do S1/S0, que este script não cobre.
