# Retomada — 0.2.7: 3D no Linux e rótulo do ambiente na planta de piso

Branch `fix/0.2.7-3d-e-areas`, worktree `~/hestia-wt/027-3d-e-areas`.
Base: `frente/disciplinas` (`7bbd92e9`), que é a `main` da 0.2.6 (`02b773a8`) + os 4 commits do MEP.
Não há divergência: o merge na 0.2.7 é fast-forward se ninguém mexer nos mesmos arquivos.

## O que entrou

| Commit | Assunto |
|---|---|
| `8ede53dd` | modelo: `Room.labelFields` + `setRoomLabel` com `fields` |
| `4d732a1a` | diagnóstico: overlay por `Ctrl+Shift+P`, renderer no “Sobre”, `?bench=orbit` |
| `611bf221` | autopreparo do bench resiste a falha do `newProject` |
| `2c72bf6a` | render: área/perímetro/volume na planta de piso + DXF |
| `a5420a57` | UI: campos do rótulo + “aplicar aos níveis” |
| `f9dca013` | perf(3d): órbita a 60 fps no WebKitGTK |
| `098ca1a9` | DXF: categoria/nível coerentes com a tela |

### 1. Lag do 3D no app Linux

**Causa medida:** trabalho por quadro fora do `renderQuadro`. O WebKitGTK roda a mesma cena a 60 fps
em WebGL puro; o app ficava em 37 fps porque cada `pointermove`/`previewTick` re-renderizava React
(abas, propriedades, cubo) e, principalmente, reescrevia o `transform` de quatro `<text>` SVG da
bússola (~20 ms/quadro no WebKitGTK contra ~2 ms no Chrome).

**Correção:** coalescer deltas em um `orbit()`/`pan()` + um `previewTick` por rAF; `useShallow` nos
painéis; `ViewCube` escrevendo DOM direto (letras da bússola em `<div>`); `setSize` condicional;
`visibilityOf` memoizado.

**Resultado (mesma máquina/build):** 37,0 → **60,0 fps** no WebKitGTK; 60,0 → 60,3 no Chrome;
27 draw calls e 5.894 triângulos iguais. Detalhes e o que foi descartado em
[`investigacao-lag-orbita-3d.md`](investigacao-lag-orbita-3d.md), seção (e).

**Descartado por medição:** fill-rate/DPR, antialias, `WEBKIT_DISABLE_DMABUF_RENDERER`,
`WEBKIT_DMABUF_RENDERER_FORCE_SHM`, `WEBKIT_DISABLE_COMPOSITING_MODE`. Nenhuma mudança no
`desktop/src-tauri/src/lib.rs` foi necessária.

### 2. Rótulo do ambiente na planta de piso

`Room.labelFields` (opcional; ausente = `['name']`) é compartilhado por todas as vistas. A planta de
piso desenha até duas linhas usando `roomTagLines`, com os mesmos campos da planta de área. A UI fica
em **Rótulo (todas as vistas) → Campos**, com “Aplicar aos ambientes deste nível”. O DXF segue a tela.
Sem migração: projeto antigo abre e continua mostrando só o nome.

## Como validar

```bash
. ~/hestia-tools/env.sh && cd ~/hestia-wt/027-3d-e-areas
~/hestia-tools/pesado.sh npm run build
~/hestia-tools/pesado.sh npm run typecheck
~/hestia-tools/pesado.sh npm run lint
~/hestia-tools/pvitest.sh apps/web/src/ui packages/render/src/plan/rooms.test.ts \
  apps/web/src/editor/viewVisibility.test.ts apps/web/src/editor/paneView.test.ts
```

Bench do 3D (com `vite preview` na porta 5198 servindo `apps/web/dist`):

```bash
/tmp/opencode/bench.sh webkit "http://localhost:5198/?bench=orbit&perf=1" /tmp/opencode/bench.png
/tmp/opencode/bench.sh chrome "http://localhost:5198/?bench=orbit&perf=1" /tmp/opencode/bench-chrome.png
```

O título da janela sai como `HESTIA-BENCH fps=.. cpuMs=.. gpuMs=.. calls=.. tris=..`.

No app desktop: `Ctrl+Shift+P` liga o overlay; **Arquivo ▸ Sobre** mostra backend/renderer/WebKit.

## Não entrou (de propósito)

- **Ocultar/Isolar categorias** (pilar × parede etc.): adiado a pedido. Diagnóstico já levantado:
  `categoriaDoElemento` (`apps/web/src/editor/viewVisibility.ts`) mapeia `column → 'wall'`; o mesmo
  acontece com `ceiling → floor` e `beam/footing → slab`. A correção de menor risco é uma
  `HiddenCategory` (só de ocultação), sem mexer em `GraphicsCategory`.
- **A3 (variáveis do WebKit)**: não implementado porque não houve ganho na medição.
- Subir versão e escrever `docs/releases/v0.2.7.md`: fica para o fechamento da 0.2.7.
