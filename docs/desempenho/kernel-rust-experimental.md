# Kernel geométrico experimental — medição

Página de desempenho do kernel Rust → WebAssembly (decisão [0045](../decisoes/0045-kernel-rust-experimental.md)).
Recurso **desligado por padrão**, ativável em Arquivo → Opções → Experimentais ou por `?kernel=rust`.

## O que medir

- **Navegador** (`scripts/perf-kernel.mjs`): cenário de 20 pavimentos de `tests/e2e/perf-browser.mjs`, rodado duas
  vezes — `?kernel=ts` e `?kernel=rust`. Compara mediana e p95 de abertura, planta do nível do meio, edição de parede,
  inserções, pan, zoom e pick 3D; o ganho é percentual, com sinal positivo quando o kernel é mais rápido.
- **Node** (`npm run bench:interacao -- --save`): CPU pura, com `wallSolidBuildAllCold` e `resolveAllWarm`, que são os
  critérios de saída da decisão 0045 (≥ 25% de redução com o diferencial verde).

## Como rodar

    npm run build                      # o roteiro de navegador só mede build de produção
    node scripts/perf-kernel.mjs       # dois lados; grava scripts/perf-baselines/kernel-rust-20-pav-<data>.json
    node scripts/perf-kernel.mjs --simular                 # ensaia o relatório com JSONs de exemplo, sem navegador
    node scripts/perf-kernel.mjs --ts-json a.json --rust-json b.json   # compara dois JSONs já gravados

Variáveis: `PERF_RUNS` (repetições, padrão 5), `CHROME_PATH`, `PERF_HEADED=1`, `KERNEL_QUERY` (parâmetro que liga o
kernel, padrão `kernel=rust`). Se faltar build ou navegador, o script sai com código 2 e a mensagem do que falta.

O runner não aceita parâmetro extra de URL (`page.goto` sempre usa `${APP_URL}?debug=1`). Por isso o `perf-kernel`
sobe um servidor estático local sobre `apps/web/dist` e redireciona a primeira navegação de cada lado para a mesma
página com `?kernel=ts` ou `?kernel=rust`; o aplicativo lê o flag de `location.search`.

## Resultados

### Medi 1 — navegador, 20 pavimentos (2026-11-01, Chrome 156 headless, build de produção, 5 execuções por lado)

Mediana em ms; ganho positivo = kernel mais rápido. Arquivos em `scripts/perf-baselines/`.

| Medida (20 pavimentos) | TypeScript | Rust/WASM | Ganho |
|---|---:|---:|---:|
| Edição de parede (planta) | 75,8 | 42,1 | **+44,5%** |
| Inserir porta | 228,3 | 149,6 | **+34,5%** |
| Inserir janela | 213,6 | 144,9 | **+32,2%** |
| Abrir projeto (até o 2º quadro) | 446,8 | 390,4 | **+12,6%** |
| Abrir 3D — 1º quadro | 1.723 | 1.550 | +10,0% |
| Abrir 3D — carga completa | 1.755 | 1.567 | +10,7% |
| Planta do nível do meio | 92,7 | 94,9 | −2,4% |
| Seleção por clique | 18,8 | 19,2 | −2,1% |
| Órbita 3D / pick 3D | 18,9 / 24,5 | 18,4 / 23,9 | +2,6% / +2,5% |
| Pan 3D | 25,4 | 16,4 | +35,4% (ruído) |

### Medi 2 — micro-benchmark do seam (189 operações, 21 fixtures)

`node scripts/wasm-equivalencia.mjs` — mesma máquina, com aquecimento:

| Operação | TS (ms) | Rust (ms) | Ganho |
|---|---:|---:|---:|
| union | 11,13 | 1,68 | 6,6× |
| difference | 10,45 | 1,53 | 6,8× |
| intersection | 9,99 | 2,23 | 4,5× |
| unionClipper | 4,27 | 1,51 | 2,8× |
| differenceClipper | 2,93 | 1,43 | 2,0× |
| offsetMulti | 18,43 | 10,03 | 1,8× |
| **Total** | **57,19** | **18,41** | **3,1×** |

Equivalência: **189/189 operações, 0 divergências**; pior Δárea 6,9e-6 m², pior Δperímetro 4,9e-6 m.

### O que ainda falta medir

- `wallSolidBuildAllCold` e `resolveAllWarm` no bench de Node (`npm run bench:interacao -- --save`), que são os
  critérios de saída literais da decisão 0045. O proxy de navegador já supera os 25% em edição de parede.
- O boot **depois** da ativação ociosa: a primeira medição ativava o wasm durante o carregamento e o FCP saiu ~11%
  pior ("página até o app pronto" ~33% pior). Agora a ativação espera o navegador ficar ocioso
  (`requestIdleCallback`, fallback 2,5 s) e as primeiras chamadas caem no TypeScript; falta re-medir.

Arquivos: `kernel-rust-20-pav-<data>.json` (comparativo, `{ ts, rust, deltaPct }`),
`browser-20-pav-<data>-kernel-ts.json` e `browser-20-pav-<data>-kernel-rust.json` (brutos do runner) e
`node-<data>.json` (bench de Node).

## Ressalvas

- Comparação entre duas execuções no mesmo computador, não entre máquinas; ruído de outros processos entra nos dois
  lados, mas não igualmente.
- Ganho agregado do cenário não se atribui a uma função só: mistura carga do `.wasm`, geometria e pintura.
- Se todos os ganhos ficarem dentro de ±1%, o relatório avisa: provavelmente o kernel não ficou ativo e os dois lados
  rodaram TypeScript. Confira no diálogo "Experimentais" antes de registrar o número.
