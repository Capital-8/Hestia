# Handoff — regressão de inserção (Hestia) — 2026-10-26

> **Atualização de fechamento (23:5x):** o HEAD passou de `ac430af` para o commit do documento de snaps
> (`docs/09-ANALISE-SNAP-E-JUNCOES.md`, feito por outro agente; **análise, sem correção de código**).
> Este handoff e as alterações de **gráficos de vista** (outra sessão) foram commitados juntos e enviados ao
> GitHub. Ao retomar, confira `git log --oneline -3`: o topo deve ser o commit
> "wip: gráficos de vista e handoff da inserção". O restante deste documento continua válido; onde se lê
> `ac430af`, entenda "o commit imediatamente anterior ao de gráficos/handoff".

Documento de retomada. **Não commitar** (a menos que o usuário peça). Escrito no fim do dia 25/10/2026
(hora local), com a máquina sendo desligada. O trabalho continua em outro PC.

---

## 0. Resumo em 10 linhas (leia isto primeiro)

- Ramo: `feat/revit-ui-theme`, HEAD **`ac430af`**, igual ao `origin/feat/revit-ui-theme`. **Nada foi commitado nem enviado hoje.**
- Objetivo do dia: (1) regressão de inserção (~17 ms → ~50 ms), (2) manter abertura de 20 pav ≤ 300 ms,
  (3) roteiro de conferência visual, (4) suíte completa duas vezes.
- Situação: **itens 3 e 4 não começaram**. O item 1 foi investigado a fundo, mas **não há correção aplicada**.
- Regressão confirmada com 10 repetições: porta/janela/parede nova ≈ **45–53 ms** (era ~17 ms no build sem interface nova).
- Descoberta principal: o desenho exato da planta custa **~48–55 ms nos dois builds**. O baseline de 17 ms
  **não incluía** esse desenho; a diferença é *quando* ele cai na janela de 2 rAF.
- **Forte suspeita a testar amanhã:** no build `file://` **nenhum Worker é criado** (`workers: []`, nenhum
  recurso `resolveWorker-*.js` carregado). A resolução parece cair no fallback em fatias na thread principal.
  Testar o mesmo build servido por **http://** antes de mexer no código.
- `apps/web/dist` está com build **sem minificação** (`vite build --minify false`, 6,1 MB). **Reconstruir normal**
  antes de qualquer medição nova.
- Apareceram alterações não commitadas **de outra sessão** às 23:33–23:37 (gráficos de vista). Não são minhas;
  não reverter, não commitar. Ver §7.
- No outro PC: recriar as configs do scratchpad e, se for comparar com o build sem interface, recriar o
  worktree em `bb72f2a` (§5).

---

## 1. Estado do repositório no momento em que parei

```
<raiz-do-repositorio>
ramo: feat/revit-ui-theme
HEAD: ac430af3aa9b7d38c49e6c7edb89d8cc765634ba
origin/feat/revit-ui-theme: ac430af (sincronizado; nada enviado hoje)
```

Modificados por outra sessão (NÃO MEUS, não tocar):
```
 M apps/web/src/editor/graphicsActions.test.ts
 M apps/web/src/editor/graphicsActions.ts
 M docs/07-STATUS-V1.md
 M docs/decisoes/0015-graficos-de-vista.md
 M packages/model/src/graphics.test.ts
 M packages/model/src/graphics.ts
 M tests/e2e/visual-regression-gpu.mjs
 M tests/e2e/visual-regression.mjs
```
Mtime: 25/10/2026 23:33–23:37. Apareceram **depois** da minha medição (dist construído 23:20), então os
números abaixo são do `ac430af` limpo.

Untracked conhecidos (não commitar):
```
?? .claude/
?? packages/model/src/.edit_room_sep.cjs
?? scripts/perf-baselines/browser-20-pav-2026-10-25-etapa0.json
?? scripts/perf-baselines/browser-20-pav-2026-10-26-insercao-antes.json   <- gerado hoje (medição "antes")
```

Worktrees relevantes (o registro é local; no outro PC alguns caminhos não existirão):
```
C:/.../Hestia                                            ac430af [feat/revit-ui-theme]
C:/.../Hestia/.claude/worktrees/integracao-final         ac430af (detached; tem HANDOFF-DESEMPENHO.md e a medição final não versionada)
C:/.../Hestia/.claude/worktrees/integracao-perf          bb72f2a (detached)
<usuario-local>/AppData/Local/Temp/opencode/hestia-perf/perf-etapas   bb72f2a (detached; build de comparação sem interface nova)
```
No outro PC, se aparecerem worktrees com caminho inexistente, `git worktree prune` (só remove o registro;
não apaga arquivos).

---

## 2. O que foi feito hoje (ordem cronológica)

1. Confirmei o estado (limpo, HEAD `ac430af`).
2. `vite build` em `apps/web` (produção normal) → dist com 2,879 MB/821 kB gzip.
3. Reproduzi a regressão com `PERF_RUNS=10`, rótulo `insercao-antes`:
   `scripts/perf-baselines/browser-20-pav-2026-10-26-insercao-antes.json`.
4. Criei um build de comparação **sem a interface nova** no commit `bb72f2a`:
   worktree temporário + junction de `node_modules` + `vite.integ.config.ts` (alias `@hestia/*`), também sem minificar.
5. Instrumentei o navegador (via Playwright/CDP) para decompor o clique:
   - marcas de `pointerup` (capture/bubble), notificação do store, rAF 1 e rAF 2;
   - duração e origem de cada callback de `requestAnimationFrame`;
   - `PerformanceObserver` de `longtask` e `long-animation-frame` (LoAF);
   - perfil de CPU (CDP `Profiler`) agregado por subárvore de `render`/`desenhar`;
   - tentativa de registrar mensagens do Worker;
   - testes de controle: esconder rótulos, esconder faixa/painéis, adiar o aviso de resolução exata.
6. Conclusões em §3/§4. Nenhuma mudança de código foi aplicada.

Todos os scripts de sondagem estão em
`<usuario-local>\AppData\Local\Temp\opencode\hestia-perf\` (não versionados; no outro PC não existirão —
o essencial está reproduzido em §6).

---

## 3. Medições (números para comparar amanhã)

### 3.1 Baseline final (referência, 5 repetições, do dia anterior)
Arquivo: `browser-20-pav-2026-10-26-final.json` (10 e 20 pav; está no worktree `integracao-final`, untracked).

| Medida (20 pav, mediana) | valor |
|---|---:|
| abrir projeto | 272,2 ms |
| carregar página | 1059 ms |
| FCP | 700 ms |
| planta do meio | 33,3 ms |
| seleção | 16,0 ms |
| edição de parede | 37,1 ms |
| porta / janela / parede nova | **57,2 / 52,6 / 49,4 ms** |
| pan / zoom | 17,6 / 16,6 ms |
| pick 3D | 36,3 ms |

### 3.2 Medição "antes" de hoje (10 repetições, máquina ociosa)
Arquivo: `scripts/perf-baselines/browser-20-pav-2026-10-26-insercao-antes.json` (untracked).

| Medida | 10 pav (med / p95) | 20 pav (med / p95) |
|---|---:|---:|
| abrir projeto | 218,1 / 320,6 | 259,8 / 346,5 |
| carregar página | 1022 / 1184 | 1010 / 1064 |
| FCP | 700 / 800 | 660 / 724 |
| planta do meio | 31,5 / 78,6 | 35,7 / 95,1 |
| seleção | 17,0 / 31,7 | 16,9 / 32,6 |
| edição de parede | 31,6 / 71,0 | 35,7 / 75,9 |
| **porta** | **51,7 / 67,2** | **49,4 / 66,2** |
| **janela** | **53,1 / 64,9** | **45,6 / 60,6** |
| **parede nova** | **49,4 / 60,1** | **51,2 / 75,3** |
| pan | 17,9 / 18,5 | 18,0 / 19,5 |
| zoom | 16,5 / 16,7 | 16,5 / 17,1 |
| pick 3D | 32,8 / 41,8 | **66,9 / 109,7** (outlier; re-medir) |

Abertura segue dentro da meta (≤ 300 ms).

### 3.3 Build de comparação `bb72f2a` (sem interface nova), mesma máquina
Sonda própria (10 inserções de porta, mesmo projeto sintético de 10 pav):

| | total pointerup→2º rAF | duração do desenho pesado |
|---|---:|---:|
| final `ac430af` | **51,3 ms** (p95 92,1) | 55,0 ms; caiu **antes** do 2º rAF em 5/10 |
| `bb72f2a` (sem interface) | **14,0 ms** (p95 36,6) | 48,1 ms; caiu **depois** do 2º rAF em 10/10 |

Ou seja: **o desenho pesado existe nos dois** (~48–55 ms); o que muda é o alinhamento com os 2 rAF.
LoAF (long-animation-frame) nos dois builds: duração ~90–117 ms, `script=0`, `render≈50–74 ms`.

---

## 4. Hipóteses testadas e o que foi descartado

| Teste | Resultado | Conclusão |
|---|---|---|
| Esconder a camada HTML de rótulos (`.labels`) | 68,1 ms (pior) | Não são os rótulos/DOM de anotações |
| Esconder faixa/título/painéis/status (`visibility:hidden`) | 50,2 ms | Não é repintura dos painéis |
| "Pump" de rAF contínuo | 51,6 ms | Não é throttling de quadro ocioso |
| Adiar o aviso de resolução exata (16 ms → 32/48/300 ms) | 51,7 / 53,5 / 63,5 ms | Não é o aviso do Worker (`ATRASO_AVISO_MS`) |
| Perfil de CPU dentro de `QuadroPlanta.desenhar` | 55,3 ms, dominado por Clipper/junção (`compare`, `groupEnds`, `run`, `process`, `wallBaseElevation`, `coreRange`, `getIntersection`) | O desenho exato reconstrói a junção do nível; igual nos dois builds |
| Desenho provisório na 1ª rAF | ~2–5 ms de JS | O provisório é barato; o pesado é o exato |
| Worker de resolução | `workers: []`, nenhum recurso `resolveWorker-*.js` em `file://` | **Principal suspeita:** resolução no fallback em fatias na thread principal |

**Cuidado — teste inválido:** numa primeira tentativa de adiar o `setTimeout(…,16)` o injetor referenciou
`process` dentro da página e quebrou o callback; o valor 18,4 ms que apareceu **não vale** (o exato nunca
acontecia). O teste refeito corretamente está na tabela acima e **não** melhorou.

### Interpretação atual (a confirmar)
- O baseline de ~17 ms do build sem interface **não media o desenho exato**: ele caía depois do 2º rAF.
- A interface nova (anotações/mais DOM e mais assinaturas do projeto) faz o bloco pesado (resolução + desenho)
  cair **dentro** da janela de 2 rAF em ~metade das vezes.
- O bloco pesado parece ser: **resolução do nível (fallback sem Worker) ~40 ms + desenho exato ~55 ms**.
  O `longtask`/LoAF não mostra `script`, porque o trabalho pode estar em tarefas separadas ou fora da janela.
- Se o Worker funcionar em `http://`, a resposta real e a métrica podem voltar para ~20 ms **sem mudar o app** —
  por isso o próximo teste é decisivo.

---

## 5. Onde reiniciar (amanhã, no outro PC)

### Passo 0 — preparar o ambiente
```powershell
cd <caminho do repo no outro PC>
git status --short --branch          # deve estar em feat/revit-ui-theme / ac430af
git log --oneline -1                 # ac430af
npm install                          # se node_modules não existir
node -v                              # hoje: v24.14.1; Chrome 155.0.8059.86
```
- **Reconstruir o dist normal** (o atual está sem minificação):
```powershell
cd apps/web
& ..\..\node_modules\.bin\vite.cmd build
```
- Recriar as configs do scratchpad (typecheck/testes) — conteúdo em §6.1.
- Se for comparar com o build sem interface, recriar o worktree `bb72f2a` (§6.2).

### Passo 1 — teste decisivo: Worker em http:// (30–40 min)
Objetivo: saber se a resolução está realmente caindo no fallback em fatias e se isso responde pela regressão.

1. Servir `apps/web/dist` por HTTP (qualquer servidor estático; ex.: `npx serve apps/web/dist`,
   `python -m http.server`, ou `npm run dev` — mas **dev não é baseline**).
2. Rodar a sonda de criação de Worker (§6.3) apontando para `http://localhost:<porta>/index.html?debug=1`.
   Esperado: aparecer pelo menos 1 Worker e o recurso `resolveWorker-*.js`.
3. Rodar a sonda de medição (§6.4) contra a mesma URL:
   - se **porta ≈ 20 ms** e o desenho pesado cair depois do 2º rAF → a regressão é do modo `file://`
     (fallback sem Worker). Decisão: medir baseline por HTTP (ajustar `tests/e2e/perf-browser.mjs` para
     poder usar `APP_URL`, que já existe) **ou** corrigir o fallback em fatias para render prazo.
   - se continuar ~50 ms → seguir para o Passo 2.
4. Se for medir por HTTP, lembrar que `APP_URL` já é suportado por `perf-browser.mjs`; hoje ele usa
   `apps/web/dist/index.html` em `file://` quando `APP_URL` não está definido. Medir os dois e comparar.

### Passo 2 — se o Worker não for a causa
Investigar, nesta ordem, com as sondas de §6.4 (todas já validadas hoje):
1. **Resolução em fatias** (`apps/web/src/editor/resolucaoAssincrona.ts`, `resolveWorker.ts`):
   medir quanto tempo o handler do resultado exato segura a thread; ver `ATRASO_AVISO_MS = 16` e `avancar()`.
2. **Re-render React**: `App.tsx` assina `useProject()` só para `semVistas`; `TitleBar`, `Ribbon` (`useCtx`),
   `Dock`→`Browser`/`Properties`, `OptionsBar`, `StatusBar` também assinam o projeto inteiro.
   Candidato de correção: tirar a assinatura do `App` (mover `semVistas` para um componente pequeno) e/ou
   seletores derivados; medir de novo.
3. **Desenho exato incremental**: o desenho reconstrói a junção do nível inteiro (~55 ms). Um patch
   incremental por parede afetada (reaproveitando `fluxoPatch`) é a correção de fundo, mas é mudança grande;
   só com decisão do usuário.
4. Só depois pensar em adiar o desenho exato (rAF+setTimeout já existe em `ui/quadroPlanta.ts`,
   `depoisDaPintura`); o teste de adiar o aviso **não** resolveu.

### Passo 3 — itens ainda não iniciados
- **Conferência visual (item 3):** roteiro + o que deve aparecer para: cota individual/em cadeia nos zooms
  12/60/220; texto com caixa (negrito, itálico, alinhamento, quebra, máscara de região de detalhe);
  etiquetas/líderes/"Etiquetar todos"; linha de detalhe tracejada/pontilhada e seleção 1,7×; rótulos de
  corte/elevação; 3D com caixas instanciadas (paredes retas, portas/janelas; silhueta e seleção).
  Não foi gerado nenhum roteiro nem screenshot hoje.
- **Estabilidade (item 4):** rodar a suíte completa **duas vezes** e comparar. Baseline conhecido do dia
  anterior: **391 arquivos / 4.533 testes, 0 falhas**. Typecheck: só os 4 erros aceitáveis de
  `scripts/perf-baselines/projeto-sintetico.mts` (falta de `@types/node`).

### Passo 4 — regra de entrega
- Correção só se for regressão, em **commit separado** e documentada.
- Rodar suíte 2× e a medição antes/depois.
- **Não** fazer push sem relatar e receber confirmação.
- Atualizar este documento (ou substituí-lo) ao terminar.

---

## 6. Comandos e configs para recriar

### 6.1 Scratchpad de typecheck/testes (fora do repositório)
Criar uma pasta qualquer fora do repo (ex.: `%TEMP%\hestia-integracao`) e:

`tsconfig.integ.json` (aponta `@hestia/*` para `packages/*/src/index.ts`; inclui packages, apps, tests e
`scripts/perf-baselines` para reproduzir os 4 erros aceitáveis):
```json
{
  "extends": "<REPO>/tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@hestia/engine": ["<REPO>/packages/engine/src/index.ts"],
      "@hestia/engine/*": ["<REPO>/packages/engine/src/*"],
      "@hestia/geom": ["<REPO>/packages/geom/src/index.ts"],
      "@hestia/geom/*": ["<REPO>/packages/geom/src/*"],
      "@hestia/io": ["<REPO>/packages/io/src/index.ts"],
      "@hestia/io/*": ["<REPO>/packages/io/src/*"],
      "@hestia/model": ["<REPO>/packages/model/src/index.ts"],
      "@hestia/model/*": ["<REPO>/packages/model/src/*"],
      "@hestia/render": ["<REPO>/packages/render/src/index.ts"],
      "@hestia/render/*": ["<REPO>/packages/render/src/*"],
      "@hestia/tools": ["<REPO>/packages/tools/src/index.ts"],
      "@hestia/tools/*": ["<REPO>/packages/tools/src/*"]
    }
  },
  "include": ["<REPO>/packages/*/src", "<REPO>/apps/*/src", "<REPO>/tests", "<REPO>/scripts/perf-baselines"],
  "exclude": ["<REPO>/node_modules", "<REPO>/**/dist"]
}
```
Comandos:
```powershell
& <REPO>\node_modules\.bin\tsc.cmd -p <SCRATCH>\tsconfig.integ.json --noEmit
```

`vitest.integ.config.ts` (config fora do repo; **importante**: aliases de subpath `@hestia/x/*` apontam para a
raiz do pacote, não para `src/`; a primeira versão errada fazia `src/src/...` e derrubava 20 arquivos):
```ts
import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
const raiz = '<REPO>';
const pkg = (nome: string) => resolve(raiz, 'packages', nome, 'src');
export default defineConfig({
  root: raiz,
  resolve: { alias: [
    { find: /^@hestia\/engine$/, replacement: resolve(pkg('engine'), 'index.ts') },
    { find: /^@hestia\/engine\//, replacement: resolve(raiz, 'packages', 'engine') + '/' },
    { find: /^@hestia\/geom$/, replacement: resolve(pkg('geom'), 'index.ts') },
    { find: /^@hestia\/geom\//, replacement: resolve(raiz, 'packages', 'geom') + '/' },
    { find: /^@hestia\/io$/, replacement: resolve(pkg('io'), 'index.ts') },
    { find: /^@hestia\/io\//, replacement: resolve(raiz, 'packages', 'io') + '/' },
    { find: /^@hestia\/model$/, replacement: resolve(pkg('model'), 'index.ts') },
    { find: /^@hestia\/model\//, replacement: resolve(raiz, 'packages', 'model') + '/' },
    { find: /^@hestia\/render$/, replacement: resolve(pkg('render'), 'index.ts') },
    { find: /^@hestia\/render\//, replacement: resolve(raiz, 'packages', 'render') + '/' },
    { find: /^@hestia\/tools$/, replacement: resolve(pkg('tools'), 'index.ts') },
    { find: /^@hestia\/tools\//, replacement: resolve(raiz, 'packages', 'tools') + '/' },
  ] },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*perf.test.ts'],
    environment: 'node',
    setupFiles: [resolve(raiz, 'tests/vitestSetup.ts')],
  },
});
```
A config fora do repo não acha `vitest/config` sozinha: criar uma junction
`<SCRATCH>\node_modules` → `<REPO>\node_modules` (Windows: `New-Item -ItemType Junction`).

Rodar:
```powershell
& <REPO>\node_modules\.bin\vitest.cmd run --config <SCRATCH>\vitest.integ.config.ts
```

### 6.2 Build de comparação sem interface nova (`bb72f2a`)
```powershell
$t = "$env:TEMP\hestia-perf\perf-etapas"
git worktree add --detach $t bb72f2a
New-Item -ItemType Junction -Path "$t\node_modules" -Target "<REPO>\node_modules"
# criar $t\apps\web\vite.integ.config.ts com plugins [react(), viteSingleFile()] e os mesmos aliases,
# mas apontando para $t\packages\...; build.minify = false
cd $t\apps\web
& <REPO>\node_modules\.bin\vite.cmd build --config vite.integ.config.ts
```
O arquivo de config já existia em
`<usuario-local>\AppData\Local\Temp\opencode\hestia-perf\perf-etapas\apps\web\vite.integ.config.ts`
(no outro PC, recriar). Remover o worktree só com confirmação do usuário.

### 6.3 Sonda: o Worker é criado?
Injetar antes da página carregar (`page.addInitScript`) uma subclasse de `Worker` que registra
`{url, erro}` em `window.__workers`; depois de abrir o projeto, ler `window.__workers` e
`performance.getEntriesByType('resource')` filtrando `resolveWorker`.
Resultado de hoje em `file://`: `workers: []`, `recursos: []`.

### 6.4 Sonda de medição (essencial; recriar)
Projeto de teste:
```powershell
$env:PROJETO_SAIDA="$env:TEMP\hestia-perf\proj10.json"
npx vite-node scripts/perf-baselines/projeto-sintetico.mts 10
```
Sonda (Playwright + Chrome headless), resumo:
1. abrir `apps/web/dist/index.html?debug=1`; esperar `.canvas-wrap canvas` e `window.__hestia`;
2. `openFromText(proj10)`, `selectLevel('perf_lv_5')`, `setViewport({cx:6,cy:6,zoom:30,...})`;
3. em cada rodada: `setTool('door')`, esperar 2 quadros, contar aberturas em `perf_w_5_25`;
4. no `pointerup` (capture): gravar `t0`, registrar `rAF` → `rAF` (raf1/raf2);
5. clicar no centro da parede (`(6,6)` convertido por viewport+rect do canvas);
6. ler marcas, duração de cada callback de rAF (patch de `requestAnimationFrame`), LoAF e `longtask`;
7. `undo()` e esperar 2 quadros.
Variáveis úteis: `APP` (caminho/URL do index), `RUNS`, e injeções de controle (`PUMP`, esconder CSS).
Os arquivos completos de hoje estão em `%TEMP%\opencode\hestia-perf\probe-*.mjs`:
`probe-draw.mjs` (resumo), `probe-sched.mjs` (registro/duração de rAF), `probe-loaf.mjs`,
`probe-fases.mjs` (microtask/timeout/rAF), `probe-worker-cria.mjs`, `perfil-render.mjs`
(perfil por subárvore de `render`/`desenhar`), `perfil-focado.mjs`.

### 6.5 Medição oficial
```powershell
$env:PERF_ROTULO="depois"; $env:PERF_RUNS="10"
node tests/e2e/perf-browser.mjs --save
```
Grava `scripts/perf-baselines/browser-20-pav-<data UTC>-depois.json`. Conferir `pendencias: []`.

---

## 7. Arquivos/paths importantes

- `tests/e2e/perf-browser.mjs` — medição; usa `apps/web/dist` em `file://` se `APP_URL` não existir.
  Já foi ajustado no commit `ac430af` para abrir o 3D pelo nó da árvore (`role=treeitem`, duplo clique).
- `tests/e2e/perf-acoes.mjs` — porta/janela/parede nova; mede `pointerup → 2 rAF`.
- `apps/web/src/ui/quadroPlanta.ts` — provisório na hora, exato depois (`depoisDaPintura` = rAF + setTimeout 0).
- `apps/web/src/editor/resolucaoAssincrona.ts` — resolução progressiva; `ATRASO_AVISO_MS = 16`,
  fallback em fatias quando não há Worker.
- `apps/web/src/editor/controller.ts` — `store.subscribe` (pruneSelection, autosave, `fluxo.atualizar`,
  `previewTick++`); `bump()`.
- `apps/web/src/editor/fluxoEdicao.ts` — provisório/exato; `calcularAlteracao`, patches.
- `apps/web/src/App.tsx` — assina `useProject()` só por causa de `semVistas`; candidato de otimização.
- `packages/render/src/plan/*` — `PlanFrame`, `planFrame`, `zoomOps`, `limiares`; desenho exato caro.
- `docs/desempenho/ordem-implementacao.md` — plano e tabela de referência (onda 7).

---

## 8. Regras (continuam valendo)

- Não usar `git stash`; não usar `git reset --hard` em worktree com trabalho não commitado.
- Não apagar ramos nem worktrees sem confirmação.
- Não commitar `HANDOFF-DESEMPENHO.md`, `.claude/`, `packages/model/src/.edit_room_sep.cjs` nem
  `scripts/perf-baselines/browser-20-pav-2026-10-25-etapa0.json` se estiver solto.
  Este arquivo também não deve ser commitado sem pedido.
- Não force push. Push só para `feat/revit-ui-theme`, normal, e só depois de relatar e receber confirmação.
- Mudança de comportamento só para corrigir regressão, em commit separado e explicada.
- Se um teste/medição mudar de resultado sem explicação, parar e relatar.

---

## 9. Números a bater amanhã (critérios)

- Inserção: **meta ~20 ms** (mediana, 10 repetições, máquina ociosa). Hoje: 45–53 ms.
- Abertura 20 pav: **não piorar** 272 ms (limite 300 ms).
- Planta/pan/zoom/pick: manter ~33/18/16,5/36 ms.
- Suíte completa 2×: 391 arquivos / 4.533 testes, 0 falhas em **ambas**.
- Typecheck: só os 4 erros de `projeto-sintetico.mts`.
- Conferência visual: gerar roteiro e descrever o observado para todos os itens do §5/Passo 3.

---

## 10. Observações finais

- Não houve commit, push, remoção de ramo nem de worktree hoje.
- O dist atual está **sem minificação**; reconstruir antes de medir.
- O pick 3D em 20 pav apareceu 66,9 ms (p95 109,7) na medição de hoje, contra 36,3 ms da referência;
  provavelmente carga/variação, mas vale re-medir antes de concluir qualquer coisa.
- Se amanhã o teste por HTTP mostrar que com Worker a inserção fica ~20 ms, o "conserto" pode ser só de
  método de medição/ambiente (medir por HTTP), e isso deve ser explicado ao usuário antes de qualquer
  mudança de código.
