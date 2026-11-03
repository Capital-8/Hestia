# Capacidade de GPU real — sonda S0 (Fase 0)

- **Data:** 2026-10-26
- **Máquina:** `DESKTOP-BHIESE4` · Windows 10.0.19045 (x64) · Xeon E5-2620 v3 (12 threads) · 15,8 GB RAM
- **GPU:** AMD Radeon RX 580 2048SP (Polaris 20, `PCI\VEN_1002&DEV_6FDF`), driver AMD **31.0.21925.1001** (2026-05-19), **8 GB VRAM**
- **Navegadores:** Chrome **155.0.8059.86** · Edge **156.0.4314.42** · WebView2 Runtime **155.0.4283.62** (instalado, não testado)
- **Plano:** plano de subagentes de 2026-10-26 (documento removido) (v3) §4/0.1 · brief S0
- **Script:** `tests/e2e/gpu-probe.mjs` · **Dados brutos:** `scripts/perf-baselines/gpu-capacidade-2026-10-26*.json`
- **Nada foi alterado no app:** default continua WebGL2 (decisão 0003), WebGPU só com `?gpu=webgpu`.

## 0. Veredito

| Pergunta | Resposta |
|---|---|
| **WebGPU é viável nesta máquina?** | **SIM** — camada A completa: adapter, device, compute, render com leitura de pixel, timers e recuperação de dispositivo, em Chrome e Edge, headed e headless. |
| **WebGL2 é viável?** | **SIM** — camada B em hardware (ANGLE/D3D11), com `EXT_disjoint_timer_query_webgl2` funcional. É o piso. |
| **CPU (Canvas2D)?** | **SIM** — camada C disponível e acionada por `?cpu=1`. |
| **VRAM** | **8 GB físicos** (registro do Windows). O navegador **não expõe** VRAM para WebGPU nem WebGL2; o teto de projeto continua sendo o orçamento de **≤2 GB** do plano, medido em S1/M0. |
| **Camada por ambiente** | Chrome e Edge: **A** (headed e headless). Sem GPU (SwiftShader): **B em software** — nunca A. |

> A decisão 0003 dizia que o WebGPU perdia o dispositivo em **software (SwiftShader)**. Isso se confirma aqui: em SwiftShader
> não existe adapter. Em **hardware real** o resultado se inverte — WebGPU funciona e é estável nos testes de fumaça.
> Isso **não** autoriza promover o default: a decisão continua válida até a Fase 3/W1 (soak de 1 h + matriz).

## 1. Camada A — WebGPU

| Item | Chrome 155 (headed/headless) | Edge 156 (headed/headless) |
|---|---|---|
| `navigator.gpu` | presente | presente |
| `requestAdapter()` high-performance | ok em **131 ms** (1ª vez) | ok em **118 ms** |
| `requestAdapter({forceFallbackAdapter:true})` | **null** (não há fallback de software) | null |
| `adapter.info` | `vendor: amd`, `architecture: gcn-4`, `device: ""`, `description: ""`, subgroup 64 | idêntico |
| `requestDevice()` | ok em **14,4 ms** | ok em **16,6 ms** |
| Compute (dispatch + readback) | **ok** — `[42, 42, 1, 0]`, 31,8 ms (1ª compilação) | **ok** — 23,7 ms (1ª compilação) |
| Render (clear + `copyTextureToBuffer` + readback) | **ok** — pixel `[255,0,0,255]` em `bgra8unorm`, 30,4 ms | **ok** — 27,0 ms |
| Perda espontânea (300 ms) | não | não |
| `device.destroy()` → `lost` | `reason: "destroyed"` | idem |
| Recuperação (novo adapter + device) | **ok em 17,4 ms** | **ok em 18,9 ms** |

**Limites relevantes** (idênticos nos dois; dump completo no JSON):

| Limite | Valor | Leitura para o projeto |
|---|---:|---|
| `maxBufferSize` | 2 147 483 648 (2 GiB) | um buffer por categoria fica bem abaixo; não tentar um único buffer gigante |
| `maxStorageBufferBindingSize` | 2 147 483 644 | binding quase do tamanho do buffer |
| `maxTextureDimension2D` | 16 384 | atlas de hachura/sombra com folga |
| `maxStorageBuffersPerShaderStage` | 16 | sobra para culling/compactação |
| `maxComputeInvocationsPerWorkgroup` | 1 024 | workgroup padrão ok |
| `maxComputeWorkgroupsPerDimension` | 65 535 | dispatch de culling sem fatiar |
| `maxBindGroups` | 4 | planejar bind groups com cuidado (ID buffer + uniforms + storage no mesmo grupo) |
| `maxColorAttachments` | 8 | MRT (ID buffer + cor + normal) cabe |
| `maxUniformBufferBindingSize` / `min*OffsetAlignment` | 65 536 / 256 | alinhamento de 256 B nos offsets dinâmicos |

**Features** (18, iguais nos dois; as 5 que o plano cita foram testadas pedindo device novo com `requiredFeatures`):

| Feature | Suportada | `requestDevice` com ela |
|---|---|---|
| `timestamp-query` | sim | **ok** |
| `float32-filterable` | sim | **ok** |
| `indirect-first-instance` | sim | **ok** |
| `depth-clip-control` | sim | **ok** |
| `shader-f16` | **não** | — (sem meia precisão; irrelevante para o plano) |

Também presentes: `core-features-and-limits`, `subgroups`, `texture-formats-tier1/2`, `float32-blendable`, `bgra8unorm-storage`,
`rg11b10ufloat-renderable`, `dual-source-blending`, `clip-distances`, `primitive-index`, `texture-component-swizzle`,
`depth32float-stencil8`, `texture-compression-bc`, `texture-compression-bc-sliced-3d`.

> **Detalhe que morde o W1:** no Chrome o `GPUAdapter` é **de uso único** — depois de `requestDevice()` ele fica
> "consumed" e um segundo `requestDevice()` falha. A primeira versão da sonda deu falso negativo por isso
> (`adapter is "consumed"`); a sonda agora pede um adapter novo por teste. Código de boot/recuperação tem de fazer o mesmo.

## 2. Camada B — WebGL2

| Item | Valor (Chrome e Edge, idêntico) |
|---|---|
| `WEBGL_debug_renderer_info` | `ANGLE (AMD, AMD Radeon RX 580 2048SP (0x00006FDF) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| Vendor | `Google Inc. (AMD)` |
| Versão | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` · GLSL ES 3.00 |
| `MAX_TEXTURE_SIZE` / `MAX_RENDERBUFFER_SIZE` | 16 384 / 16 384 |
| `MAX_VIEWPORT_DIMS` | 32 767 × 32 767 |
| `MAX_3D_TEXTURE_SIZE` / `MAX_ARRAY_TEXTURE_LAYERS` | 2 048 / 2 048 |
| `MAX_DRAW_BUFFERS` / `MAX_COLOR_ATTACHMENTS` | 8 / 8 (MRT do ID buffer ok) |
| `MAX_SAMPLES` | 8 (MSAA ok) |
| `MAX_UNIFORM_BLOCK_SIZE` / `MAX_UNIFORM_BUFFER_BINDINGS` | 65 536 / 24 |
| `MAX_ELEMENT_INDEX` | 4 294 967 294 |
| Extensões | 32 no total |
| `EXT_disjoint_timer_query_webgl2` | **presente e funcional** (clear medido: 4,75 ms Chrome / 2,78 ms Edge) |
| `EXT_color_buffer_float` / `OES_texture_float_linear` | **sim** / **sim** |
| `EXT_texture_filter_anisotropic` | sim, máx. **16×** |
| `WEBGL_compressed_texture_s3tc`, `KHR_parallel_shader_compile`, `OVR_multiview2`, `WEBGL_multi_draw` | sim |
| `OES_texture_half_float_linear` | **não** (irrelevante: WebGL2 usa `OES_texture_float_linear`) |
| Render + `readPixels` | ok, `[51,102,204,255]`, `gl.getError() = 0` |

**Perda e recuperação de contexto (`WEBGL_lose_context`)** — o dado mais importante para o W1/H1:

| Passo | Chrome | Edge |
|---|---|---|
| `loseContext()` → evento `webglcontextlost` | 1,7 ms | 3,1 ms |
| 1ª tentativa de `restoreContext()` | **não restaurou** (esperou 6 s) | **não restaurou** (6 s) |
| 2ª tentativa, **um `requestAnimationFrame` depois** | **restaurou em 5,9 ms** | **restaurou em 6,1 ms** |
| Contexto vivo + render após restaurar | sim | sim |

Duas consequências:
1. O listener de `webglcontextlost` **precisa chamar `preventDefault()`** (o app já faz em `gpu.ts`); sem isso o contexto não volta nunca.
2. Nesta build, `restoreContext()` só pega na **segunda tentativa, depois de um quadro**. Um único `restoreContext()`
   síncrono deixa o 3D morto. O caminho de perda precisa de retry com rAF e um limite de tentativas (senão fica em loop).

## 3. `chrome://gpu` / CDP `SystemInfo.getInfo`

O `chrome://gpu` abre via Playwright desde que se use um **contexto explícito** (`browser.newContext()`), e o conteúdo
está em shadow roots. Status coletado (Chrome e Edge):

```
* Canvas: Hardware accelerated          * WebGL: Hardware accelerated
* Compositing: Hardware accelerated     * WebGPU: Hardware accelerated
* Rasterization: Hardware accelerated   * Vulkan: Not supported
* Video Decode: Hardware accelerated    * OpenGL: Enabled
* Video Encode: Hardware accelerated    * WebNN: Disabled
```

| Campo | Valor |
|---|---|
| `Driver D3D12 feature level` | **D3D 12.0** |
| `Driver Vulkan API version` | Not supported |
| `GL implementation parts` | `(gl=egl-angle, angle=d3d11)` |
| `Display type` | `ANGLE_D3D11` |
| GPU0 | `VENDOR=0x1002, DEVICE=0x6fdf [AMD Radeon RX 580 2048SP] · DRIVER_VERSION=31.0.21925.1001 *ACTIVE*` |
| GPU1 | `VENDOR=0x1414, DEVICE=0x008c [Microsoft Basic Render Driver]` (WARP, não usado) |
| GPU process crash count | 0 |
| Workaround aplicado | `exit_on_context_lost` (alguns drivers não resetam o device D3D no sandbox) |
| `In-process GPU` / `Sandboxed` | false / false (o Playwright sobe com `--no-sandbox`) |

Leitura: o WebGPU desta máquina roda em **D3D12** (o Vulkan não existe aqui) e o WebGL2 em **ANGLE/D3D11**. São dois
caminhos distintos no mesmo driver — o que explica o item 4 abaixo.

## 4. Flags de desenvolvimento: `--use-angle=d3d12` **piora** esta máquina

O plano cita `--enable-unsafe-webgpu`, `--ignore-gpu-blocklist`, `--use-angle=d3d12`. Testado nas duas combinações:

| Flags | WebGPU | WebGL2 | `chrome://gpu` |
|---|---|---|---|
| nenhuma (padrão) | **A** (adapter+device) | hardware (D3D11) | WebGPU/WebGL: Hardware accelerated |
| `--enable-unsafe-webgpu --ignore-gpu-blocklist` | **A** | hardware (D3D11) | idem |
| as duas + **`--use-angle=d3d12`** | **sem adapter** | **SwiftShader** (`angle=swiftshader`) | "Software only, hardware acceleration unavailable" |

Ou seja: as flags "seguras" não mudam nada (não havia blocklist — `webgpu: enabled`); e forçar ANGLE para D3D12
**derruba a aceleração inteira**, porque o backend D3D12 do ANGLE não inicializa neste driver/GCN4. Conclusão:
**nenhuma flag deve ser distribuída**; e, se algum dia for preciso testar D3D12, testar Dawn (WebGPU) e ANGLE (WebGL)
separadamente — o suporte de um não implica o do outro.

## 5. App real (`apps/web/dist`, build de produção)

Build feito com `npm run build -w @hestia/web` (vite, single-file, 2,98 MB) — **sem erro**. Depois, no Chrome e no Edge:

| URL | `useUi.gpu` | Badge `.sb-engine` | Canvas 3D | Erros de página | Motor pronto |
|---|---|---|---|---|---|
| `index.html?debug=1` (default) | `webgl2` | **WebGL2** | sim | 0 | 1 889 ms (Chrome) / 1 731 ms (Edge) |
| `index.html?gpu=webgpu&debug=1` | `webgpu` | **WebGPU** | sim | 0 | 1 333 ms / 1 203 ms |
| `index.html?cpu=1&debug=1` | `cpu` | **CPU** | sim | 0 | 1 414 ms / 1 326 ms |

- `?gpu=webgpu` só marca `webgpu` porque `createGpu` exige `backend.isWebGPUBackend === true` (isto é, o
  `WebGPURenderer` do three inicializou de verdade e não caiu para WebGL). O caminho da camada A **está vivo no app**.
- “Motor pronto” = do `goto` até `useUi.gpu` sair de `pending` (bundle único em `file://`); **não** é a abertura de
  modelo (meta ≤300 ms, que é do A1/M0) nem tempo de quadro. Varia ±15% entre execuções.
- Igualdade visual da 3D em WebGPU/WebGL2 e o soak não são desta sonda: ficam para A2 e W1/H1.
- O default **não foi tocado**.

## 6. VRAM

| Fonte | Valor |
|---|---|
| Registro (`HardwareInformation.qwMemorySize`) | **8 589 934 592 B = 8 GiB** |
| WMI `AdapterRAM` | 4 293 918 720 B — **truncado em 32 bits**, não usar |
| `adapter.info` (WebGPU) | não informa memória |
| WebGL2 | não expõe VRAM (nenhuma extensão padrão informa) |

Portanto o teto físico é 8 GB, mas **nada no navegador informa consumo**. O orçamento do plano (≤2 GB) continua sendo
a regra, e quem mede é o S1 (`?perf=1`, contadores de upload/residência) + `medir:gpu`.

## 7. Camada e riscos por ambiente

| Ambiente | Camada | Observação |
|---|---|---|
| Chrome 155 headed | **A** | WebGPU completo; WebGL2 em hardware |
| Chrome 155 headless=new | **A** | **não** caiu em SwiftShader nesta máquina (a decisão 0003 viu SwiftShader em ambiente de CI/Linux) |
| Edge 156 headed | **A** | idêntico ao Chrome em limites/features |
| Edge 156 headless=new | **A** | idêntico |
| Chrome com `--use-angle=d3d12` | **B em software** | aceleração desligada; WebGPU sem adapter |
| Navegador sem GPU (SwiftShader) | **B em software** | `requestAdapter()` devolve null → app cai em WebGL2 (comportamento correto) |
| `?cpu=1` | **C** | Canvas2D |
| Tauri (WebView2 155) | **não testado** | runtime instalado é da mesma linha do Edge 156 → expectativa otimista, mas só um spike decide |
| Electron | **não testado** | não instalado (proibido instalar runtime pesado) |

Riscos, em ordem de impacto:

1. **Driver antigo/legado (Polaris, 2026-05).** Um update de driver pode ligar ou desligar o WebGPU. O app precisa
   detectar e cair para WebGL2 — o que já faz.
2. **Sem fallback de software para WebGPU** (`forceFallbackAdapter` → null). Se o adapter desaparecer em runtime,
   a única saída é o WebGL2. Bom para o produto, ruim para “promover WebGPU a padrão” sem matriz de máquinas.
3. **Restauração de contexto WebGL2 exige 2ª tentativa.** Sem retry com rAF, o 3D não volta depois de um reset de driver.
   Isso é bug de recuperação, não de desempenho — e é do W1/H1.
4. **`maxBufferSize` = 2 GiB.** Um buffer por categoria; nada de buffer único com o modelo inteiro.
5. **Flags de “ajuda” quebram a GPU** (item 4). Não distribuir flags; não confiar em `--use-angle=d3d12`.
6. **Uma máquina só.** A RX 580 2048SP é GCN4; GPUs integradas/antigas e WARP não foram testadas.
7. **`shader-f16` ausente.** Sem meia precisão (não bloqueia nada do plano).
8. **Headless com GPU real** depende de a sessão ter desktop/GPU; em CI Linux o resultado será SwiftShader e a sonda
   vai classificar como B-software. A sonda marca `renderizadorSoftware` justamente para não mentir.

## 8. Tauri/Electron — o que falta (não é pré-requisito do S0)

Nada foi instalado. Com WebGPU funcionando no navegador, o spike de container deixa de ser urgente e vira item do W1
**só se** a camada A for requisito de produto. O que precisaria ser testado:

**Tauri (WebView2)** — o Windows usa o **WebView2 155.0.4283.62** já instalado (mesma linha do Edge 156), então a
expectativa é a mesma camada A. Testar:
- `navigator.gpu` e `requestAdapter()` dentro da webview (o WebView2 roda com um conjunto próprio de args);
- `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` / `additionalBrowserArgs` com e sem `--ignore-gpu-blocklist`;
- boot do `WebGPURenderer` do three e perda/recuperação dentro da webview;
- o que o instalador do WebView2 garante (usuário pode ter runtime antigo → WebGPU ausente → WebGL2).

**Electron** — embute Chromium e controla flags; mais previsível, bundle maior. Testar:
- `app.commandLine.appendSwitch('enable-unsafe-webgpu')` e `ignore-gpu-blocklist` **sem** `use-angle=d3d12`;
- `app.disableHardwareAcceleration()` não deve ser chamado; conferir `gpuFeatureStatus` via `app.getGPUFeatureStatus()`;
- mesma matriz A/B/C e o mesmo teste de perda.

**Renderer nativo (wgpu/Rust)** — só se a camada A virar requisito com compute pesado; é reescrita, não configuração.

## 9. Reprodução

```powershell
# sonda principal (Chrome + Edge, headed, com app) — ~1 min por navegador
node tests/e2e/gpu-probe.mjs --app

# só um navegador / headless / sem gravar JSON
node tests/e2e/gpu-probe.mjs --browser=chrome
node tests/e2e/gpu-probe.mjs --headless --out=headless
node tests/e2e/gpu-probe.mjs --browser=chrome --no-save

# flags de desenvolvimento (com e sem --use-angle=d3d12 para isolar o culpado)
node tests/e2e/gpu-probe.mjs --browser=chrome --force-flags --out=flags
$env:GPU_PROBE_EXTRA_FLAGS='--enable-unsafe-webgpu --ignore-gpu-blocklist'
node tests/e2e/gpu-probe.mjs --browser=chrome --force-flags --out=flags-sem-d3d12

# build usado pelo --app (dist é ignorado pelo git)
npm run build -w @hestia/web
```

- `CHROME_PATH` / `EDGE_PATH` escolhem o executável; sem eles, procura as instalações padrão.
- `GPU_PROBE_HEADED=0` força headless; `GPU_PROBE_BROWSER=chrome|edge|both`; `GPU_PROBE_TIMEOUT` (ms).
- Saída: um JSON por execução em `scripts/perf-baselines/` e um resumo no terminal com camada por ambiente.
- A sonda roda em página `https://` servida por rota (contexto seguro, sem servidor), não em `file://`, para não
  depender de política de origem.

## 10. O que esta sonda **não** responde

- FPS/ms por quadro em 60 pavimentos (é M0, com S2).
- Consumo real de VRAM (é S1 + `medir:gpu`).
- Estabilidade de 1 h e vazamento (é W1/H1).
- Igualdade visual WebGPU × WebGL2 (é A2/H1).
- Tauri/Electron (item 8; só com spike autorizado).

**Para o gate G0:** “WebGPU viável na RX 580?” → **sim, condicional**: funciona hoje, em Chrome e Edge, com compute,
timers e recuperação; a promoção a default continua bloqueada por soak, matriz de máquinas e o bug de restore do WebGL2.
