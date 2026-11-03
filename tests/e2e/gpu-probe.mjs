// S0 — Sonda de capacidade de GPU real (Fase 0, plano de subagentes de 2026-10-26 (documento removido; ver histórico do git) §4/0.1).
// Responde, com dados, qual camada cada ambiente suporta:
//   A = WebGPU (adapter + device + compute)
//   B = WebGL2 (contexto real, não SwiftShader)
//   C = CPU (Canvas2D)
// Usa o Chrome/Edge do sistema via playwright-core. NÃO altera o app, NÃO muda o default e NÃO liga WebGPU.
//
// Uso:
//   node tests/e2e/gpu-probe.mjs                 # headed (padrão), Chrome e Edge, com 2ª passada de flags
//   node tests/e2e/gpu-probe.mjs --headless      # headless=new (pode cair em SwiftShader: registra a limitação)
//   node tests/e2e/gpu-probe.mjs --browser=chrome
//   node tests/e2e/gpu-probe.mjs --no-flags      # só a passada sem flags
//   node tests/e2e/gpu-probe.mjs --app           # abre apps/web/dist com ?gpu=webgpu&debug=1 (se existir)
//   node tests/e2e/gpu-probe.mjs --no-save       # não grava o JSON
//   node tests/e2e/gpu-probe.mjs --force-flags   # roda também a passada com flags dev, mesmo com WebGPU ok
//   node tests/e2e/gpu-probe.mjs --out=headless  # grava gpu-capacidade-<data>-headless.json
//
// Variáveis: CHROME_PATH, EDGE_PATH (executáveis), GPU_PROBE_BROWSER=chrome|edge|both,
//            GPU_PROBE_HEADED=0 (força headless), GPU_PROBE_TIMEOUT (ms por navegador, padrão 120000).
// Saída: scripts/perf-baselines/gpu-capacidade-<AAAA-MM-DD>.json (+ resumo no terminal).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGS = process.argv.slice(2);
const temFlag = (n) => ARGS.includes(n);
const valor = (n) => ARGS.find((a) => a.startsWith(`${n}=`))?.slice(n.length + 1) ?? null;

const HEADLESS = temFlag('--headless') || process.env.GPU_PROBE_HEADED === '0';
const QUAIS = valor('--browser') ?? process.env.GPU_PROBE_BROWSER ?? 'both';
const COM_FLAGS = !temFlag('--no-flags');
const FORCAR_FLAGS = temFlag('--force-flags');
const SALVAR = !temFlag('--no-save');
const COM_APP = temFlag('--app');
const TIMEOUT_MS = Math.max(10_000, Number(process.env.GPU_PROBE_TIMEOUT ?? 120_000));

const agora = new Date();
const DATA = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

/** Executável do navegador: env primeiro, depois as instalações padrão do Windows e do Linux. */
function acharNavegador(nome) {
  const env = nome === 'chrome' ? process.env.CHROME_PATH : process.env.EDGE_PATH;
  if (env) return existsSync(env) ? env : `inexistente: ${env}`;
  const local = (p) => (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, p) : null);
  const candidatos = {
    chrome: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      local('Google\\Chrome\\Application\\chrome.exe'),
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
    ],
    edge: [
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      local('Microsoft\\Edge\\Application\\msedge.exe'),
      '/usr/bin/microsoft-edge',
    ],
  }[nome];
  return candidatos.find((c) => c && existsSync(c)) ?? null;
}

/** Args padrão: nada de SwiftShader (queremos a GPU real); desliga a oclusão nativa do Windows, que
 *  faria a janela escondida renderizar em segundo plano e falsearia timers. */
const ARGS_BASE = [
  '--no-sandbox',
  '--disable-features=CalculateNativeWinOcclusion',
  '--disable-backgrounding-occluded-windows',
  '--window-size=1280,720',
];
/** Flags de desenvolvimento citadas no plano (não servem para usuário final; servem para separar
 *  "bloqueio por blocklist" de "driver sem suporte"). Podem ser trocadas por GPU_PROBE_EXTRA_FLAGS
 *  (lista separada por espaço) para isolar qual flag derruba a GPU. */
const FLAGS_EXTRAS = (process.env.GPU_PROBE_EXTRA_FLAGS ?? '--enable-unsafe-webgpu --ignore-gpu-blocklist --use-angle=d3d12')
  .split(/\s+/)
  .filter(Boolean);
const ARGS_FLAGS = [...ARGS_BASE, ...FLAGS_EXTRAS];

const HTML_SONDA = '<!doctype html><html><head><meta charset="utf-8"><title>gpu-probe</title></head><body><canvas id="c"></canvas></body></html>';

/* ---------------------------------------------------------------------------------------------------
 * Sonda dentro da página. Uma única evaluate: WebGPU, WebGL2, Canvas2D, perda/recuperação.
 * ------------------------------------------------------------------------------------------------ */
async function sondaNaPagina() {
  const comTimeout = (p, ms, rotulo) =>
    Promise.race([
      Promise.resolve(p).then((v) => ({ ok: true, v })),
      new Promise((r) => setTimeout(() => r({ ok: false, erro: `timeout ${ms}ms (${rotulo})` }), ms)),
    ]);
  const erroDe = (e) => (e && (e.message || e.name)) || String(e);
  const r2 = (x) => Math.round(x * 100) / 100;
  const agora = () => performance.now();

  /** Nomes de todos os limites (as getters vivem no protótipo). */
  const nomesDosLimites = (lim, conhecidos) => {
    const nomes = new Set();
    try {
      for (let p = Object.getPrototypeOf(lim); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        for (const n of Object.getOwnPropertyNames(p)) if (n !== 'constructor') nomes.add(n);
      }
    } catch {
      /* usa a lista conhecida */
    }
    if (nomes.size === 0) for (const n of conhecidos) nomes.add(n);
    return [...nomes];
  };
  const LIMITES_WEBGPU = [
    'maxBufferSize',
    'maxTextureDimension1D',
    'maxTextureDimension2D',
    'maxTextureDimension3D',
    'maxTextureArrayLayers',
    'maxBindGroups',
    'maxBindingsPerBindGroup',
    'maxDynamicUniformBuffersPerPipelineLayout',
    'maxDynamicStorageBuffersPerPipelineLayout',
    'maxSampledTexturesPerShaderStage',
    'maxSamplersPerShaderStage',
    'maxStorageBuffersPerShaderStage',
    'maxStorageTexturesPerShaderStage',
    'maxUniformBuffersPerShaderStage',
    'maxUniformBufferBindingSize',
    'maxStorageBufferBindingSize',
    'minUniformBufferOffsetAlignment',
    'minStorageBufferOffsetAlignment',
    'maxVertexBuffers',
    'maxBufferSize',
    'maxVertexAttributes',
    'maxVertexBufferArrayStride',
    'maxInterStageShaderVariables',
    'maxColorAttachments',
    'maxColorAttachmentBytesPerSample',
    'maxComputeWorkgroupStorageSize',
    'maxComputeInvocationsPerWorkgroup',
    'maxComputeWorkgroupSizeX',
    'maxComputeWorkgroupSizeY',
    'maxComputeWorkgroupSizeZ',
    'maxComputeWorkgroupsPerDimension',
  ];
  const dumpLimites = (lim) => {
    const out = {};
    if (!lim) return out;
    for (const n of nomesDosLimites(lim, LIMITES_WEBGPU)) {
      try {
        const v = lim[n];
        if (typeof v === 'number') out[n] = v;
        else if (typeof v === 'bigint') out[n] = Number(v);
      } catch {
        /* getter indisponível */
      }
    }
    return out;
  };

  const base = {
    url: location.href,
    secureContext: window.isSecureContext,
    userAgent: navigator.userAgent,
    plataforma: navigator.platform,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: navigator.deviceMemory ?? null,
    uaBrands: navigator.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`) ?? null,
  };

  /* ---------------- Canvas2D (camada C) ---------------- */
  const canvas2d = (() => {
    try {
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      return { presente: !!ctx, ok: !!ctx };
    } catch (e) {
      return { presente: false, erro: erroDe(e) };
    }
  })();

  /* ---------------- WebGL2 (camada B) ---------------- */
  const webgl2 = { presente: false };
  let gl = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    gl = canvas.getContext('webgl2', {
      powerPreference: 'high-performance',
      antialias: false,
      alpha: false,
      depth: true,
      stencil: true,
      preserveDrawingBuffer: true,
    });
    webgl2.presente = !!gl;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      webgl2.unmaskedVendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null;
      webgl2.unmaskedRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
      webgl2.vendor = gl.getParameter(gl.VENDOR);
      webgl2.renderer = gl.getParameter(gl.RENDERER);
      webgl2.version = gl.getParameter(gl.VERSION);
      webgl2.glslVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      webgl2.atributos = gl.getContextAttributes?.() ?? null;
      const P = (n) => {
        try {
          return gl.getParameter(gl[n]);
        } catch {
          return null;
        }
      };
      webgl2.parametros = {
        MAX_TEXTURE_SIZE: P('MAX_TEXTURE_SIZE'),
        MAX_RENDERBUFFER_SIZE: P('MAX_RENDERBUFFER_SIZE'),
        MAX_VIEWPORT_DIMS: P('MAX_VIEWPORT_DIMS'),
        MAX_CUBE_MAP_TEXTURE_SIZE: P('MAX_CUBE_MAP_TEXTURE_SIZE'),
        MAX_3D_TEXTURE_SIZE: P('MAX_3D_TEXTURE_SIZE'),
        MAX_ARRAY_TEXTURE_LAYERS: P('MAX_ARRAY_TEXTURE_LAYERS'),
        MAX_TEXTURE_IMAGE_UNITS: P('MAX_TEXTURE_IMAGE_UNITS'),
        MAX_VERTEX_ATTRIBS: P('MAX_VERTEX_ATTRIBS'),
        MAX_VERTEX_UNIFORM_VECTORS: P('MAX_VERTEX_UNIFORM_VECTORS'),
        MAX_FRAGMENT_UNIFORM_VECTORS: P('MAX_FRAGMENT_UNIFORM_VECTORS'),
        MAX_VARYING_VECTORS: P('MAX_VARYING_VECTORS'),
        MAX_COMBINED_TEXTURE_IMAGE_UNITS: P('MAX_COMBINED_TEXTURE_IMAGE_UNITS'),
        MAX_DRAW_BUFFERS: P('MAX_DRAW_BUFFERS'),
        MAX_COLOR_ATTACHMENTS: P('MAX_COLOR_ATTACHMENTS'),
        MAX_SAMPLES: P('MAX_SAMPLES'),
        MAX_UNIFORM_BLOCK_SIZE: P('MAX_UNIFORM_BLOCK_SIZE'),
        MAX_UNIFORM_BUFFER_BINDINGS: P('MAX_UNIFORM_BUFFER_BINDINGS'),
        MAX_ELEMENT_INDEX: P('MAX_ELEMENT_INDEX'),
        MAX_CLIENT_WAIT_TIMEOUT_WEBGL: P('MAX_CLIENT_WAIT_TIMEOUT_WEBGL'),
        RENDERER: P('RENDERER'),
        VENDOR: P('VENDOR'),
      };
      const todas = gl.getSupportedExtensions() ?? [];
      webgl2.extensoesTotal = todas.length;
      webgl2.extensoes = todas;
      const tem = (n) => todas.includes(n);
      webgl2.extensoesRelevantes = {
        WEBGL_debug_renderer_info: tem('WEBGL_debug_renderer_info'),
        EXT_disjoint_timer_query_webgl2: tem('EXT_disjoint_timer_query_webgl2'),
        EXT_color_buffer_float: tem('EXT_color_buffer_float'),
        EXT_color_buffer_half_float: tem('EXT_color_buffer_half_float'),
        EXT_float_blend: tem('EXT_float_blend'),
        OES_texture_float_linear: tem('OES_texture_float_linear'),
        OES_texture_half_float_linear: tem('OES_texture_half_float_linear'),
        EXT_texture_filter_anisotropic: tem('EXT_texture_filter_anisotropic'),
        WEBGL_lose_context: tem('WEBGL_lose_context'),
        EXT_texture_compression_s3tc: tem('EXT_texture_compression_s3tc'),
        WEBGL_compressed_texture_s3tc: tem('WEBGL_compressed_texture_s3tc'),
        KHR_parallel_shader_compile: tem('KHR_parallel_shader_compile'),
        OVR_multiview2: tem('OVR_multiview2'),
        EXT_blend_minmax: tem('EXT_blend_minmax'),
      };
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      webgl2.anisotropiaMax = aniso ? gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : null;

      // Timer query funcional (não basta existir: em várias builds vem desligado e devolve deslocado).
      const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      webgl2.timerQueryFuncional = null;
      if (timer) {
        try {
          const q = gl.createQuery();
          gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.finish();
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          let disponivel = false;
          for (let i = 0; i < 50 && !disponivel; i++) {
            disponivel = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
            if (!disponivel) await new Promise((r) => setTimeout(r, 4));
          }
          const ns = disponivel ? gl.getQueryParameter(q, gl.QUERY_RESULT) : null;
          const deslocado = gl.getParameter(timer.GPU_DISJOINT_EXT);
          webgl2.timerQueryFuncional = !!disponivel && !deslocado && typeof ns === 'number';
          webgl2.timerQueryValorMs = typeof ns === 'number' ? r2(ns / 1e6) : null;
          gl.deleteQuery(q);
        } catch (e) {
          webgl2.timerQueryErro = erroDe(e);
        }
      }

      // Render + readPixels: prova que o contexto desenha de verdade, não só que existe.
      try {
        gl.viewport(0, 0, 64, 64);
        gl.clearColor(0.2, 0.4, 0.8, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.finish();
        const px = new Uint8Array(4);
        gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        webgl2.renderOk = Math.abs(px[0] - 51) <= 2 && Math.abs(px[1] - 102) <= 2 && Math.abs(px[2] - 204) <= 2;
        webgl2.pixelLido = [...px];
        webgl2.erro = gl.getError();
      } catch (e) {
        webgl2.renderErro = erroDe(e);
      }

      // Perda e recuperação de contexto (WEBGL_lose_context): simula o driver reiniciando.
      // O canvas precisa estar no DOM: fora dele o Chrome não dispara `webglcontextrestored`.
      const lose = gl.getExtension('WEBGL_lose_context');
      webgl2.perdaRecuperacao = { disponivel: !!lose };
      if (lose) {
        try {
          const canvas = gl.canvas;
          if (!canvas.isConnected) {
            canvas.width = 64;
            canvas.height = 64;
            document.body.appendChild(canvas);
          }
          const perdido = new Promise((res) => {
            canvas.addEventListener(
              'webglcontextlost',
              (e) => {
                // Sem preventDefault o contexto NÃO volta: é o mesmo caminho do app em gpu.ts (onLost).
                e.preventDefault();
                res('lost');
              },
              { once: true },
            );
            setTimeout(() => res('timeout'), 4000);
          });
          const t0 = agora();
          lose.loseContext();
          const evento = await perdido;
          webgl2.perdaRecuperacao.eventoPerda = evento;
          webgl2.perdaRecuperacao.msAtePerda = r2(agora() - t0);
          if (evento === 'lost') {
            const voltou = new Promise((res) => {
              canvas.addEventListener('webglcontextrestored', () => res('restored'), { once: true });
              setTimeout(() => res('timeout'), 6000);
            });
            const t1 = agora();
            lose.restoreContext();
            const eventoRec = await voltou;
            webgl2.perdaRecuperacao.msAteRecuperar = r2(agora() - t1);
            if (eventoRec === 'timeout') {
              // 2ª tentativa depois de um frame: algumas builds só restauram com a página visível.
              await new Promise((r) => requestAnimationFrame(() => r()));
              try {
                lose.restoreContext();
              } catch (e) {
                webgl2.perdaRecuperacao.erro2aTentativa = erroDe(e);
              }
              const voltou2 = new Promise((res) => {
                canvas.addEventListener('webglcontextrestored', () => res('restored'), { once: true });
                setTimeout(() => res('timeout'), 4000);
              });
              const t2 = agora();
              const ev2 = await voltou2;
              webgl2.perdaRecuperacao.eventoRecuperacao2aTentativa = ev2;
              webgl2.perdaRecuperacao.msAteRecuperar2aTentativa = r2(agora() - t2);
              webgl2.perdaRecuperacao.eventoRecuperacao = ev2;
            } else {
              webgl2.perdaRecuperacao.eventoRecuperacao = eventoRec;
            }
            webgl2.perdaRecuperacao.contextoVivo = !gl.isContextLost();
            // Depois de restaurar, o contexto desenha de novo?
            try {
              gl.viewport(0, 0, 64, 64);
              gl.clearColor(0.2, 0.4, 0.8, 1);
              gl.clear(gl.COLOR_BUFFER_BIT);
              const px2 = new Uint8Array(4);
              gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px2);
              webgl2.perdaRecuperacao.renderAposRecuperar = Math.abs(px2[0] - 51) <= 2 && Math.abs(px2[2] - 204) <= 2;
            } catch (e) {
              webgl2.perdaRecuperacao.renderAposRecuperar = false;
              webgl2.perdaRecuperacao.renderErro = erroDe(e);
            }
          }
        } catch (e) {
          webgl2.perdaRecuperacao.erro = erroDe(e);
        }
      }
    }
  } catch (e) {
    webgl2.erro = erroDe(e);
  }

  /* ---------------- WebGPU (camada A) ---------------- */
  const webgpu = { presente: false };
  try {
    const g = navigator.gpu;
    webgpu.presente = !!g;
    if (g) {
      webgpu.wgslLanguageFeatures = g.wgslLanguageFeatures ? [...g.wgslLanguageFeatures] : null;
      const pedirAdapter = async (rotulo, opcoes) => {
        const t0 = agora();
        try {
          const r = await comTimeout(g.requestAdapter(opcoes), 10_000, rotulo);
          return { rotulo, opcoes: opcoes ?? null, ok: r.ok, adapter: r.ok ? r.v : null, erro: r.ok ? null : r.erro, ms: r2(agora() - t0) };
        } catch (e) {
          return { rotulo, opcoes: opcoes ?? null, ok: false, adapter: null, erro: erroDe(e), ms: r2(agora() - t0) };
        }
      };
      const tentativas = [];
      tentativas.push(await pedirAdapter('high-performance', { powerPreference: 'high-performance' }));
      tentativas.push(await pedirAdapter('default', {}));
      tentativas.push(await pedirAdapter('forceFallbackAdapter', { forceFallbackAdapter: true }));
      webgpu.adapterTentativas = tentativas.map(({ adapter, ...resto }) => ({ ...resto, adapterObtido: !!adapter }));

      const escolhido = tentativas.find((t) => t.adapter);
      webgpu.adapter = !!escolhido;
      if (!escolhido) {
        webgpu.semAdapter = true;
      } else {
        const adapter = escolhido.adapter;
        webgpu.adapterVia = escolhido.rotulo;
        webgpu.isFallbackAdapter = adapter.isFallbackAdapter ?? null;
        try {
          const info = adapter.info ?? null;
          webgpu.info = info
            ? {
                vendor: info.vendor ?? null,
                architecture: info.architecture ?? null,
                device: info.device ?? null,
                description: info.description ?? null,
                subgroupMinSize: info.subgroupMinSize ?? null,
                subgroupMaxSize: info.subgroupMaxSize ?? null,
              }
            : null;
        } catch (e) {
          webgpu.infoErro = erroDe(e);
        }
        try {
          webgpu.features = [...adapter.features];
        } catch (e) {
          webgpu.featuresErro = erroDe(e);
        }
        webgpu.limites = dumpLimites(adapter.limits);
        webgpu.limitesResumo = {
          maxBufferSize: webgpu.limites.maxBufferSize ?? null,
          maxTextureDimension2D: webgpu.limites.maxTextureDimension2D ?? null,
          maxStorageBufferBindingSize: webgpu.limites.maxStorageBufferBindingSize ?? null,
          maxStorageBuffersPerShaderStage: webgpu.limites.maxStorageBuffersPerShaderStage ?? null,
          maxComputeInvocationsPerWorkgroup: webgpu.limites.maxComputeInvocationsPerWorkgroup ?? null,
          maxComputeWorkgroupsPerDimension: webgpu.limites.maxComputeWorkgroupsPerDimension ?? null,
          maxBindGroups: webgpu.limites.maxBindGroups ?? null,
          maxColorAttachments: webgpu.limites.maxColorAttachments ?? null,
        };

        // Features que interessam ao plano: existir e poder ser exigida no requestDevice.
        // O adapter do Chrome é de uso único ("consumed" ao criar um device), então cada teste pede
        // um adapter novo — reutilizar um adapter faria o teste falhar por engano.
        webgpu.featuresTestadas = {};
        for (const f of ['timestamp-query', 'float32-filterable', 'shader-f16', 'indirect-first-instance', 'depth-clip-control']) {
          const tem = Array.isArray(webgpu.features) && webgpu.features.includes(f);
          const r = { suportada: tem, deviceComFeature: null };
          if (tem) {
            try {
              const novo = await g.requestAdapter();
              if (!novo) throw new Error('adapter nulo no teste de feature');
              const req = await comTimeout(novo.requestDevice({ requiredFeatures: [f] }), 8000, `device ${f}`);
              r.deviceComFeature = req.ok;
              if (!req.ok) r.erro = req.erro;
              req.v?.destroy?.();
            } catch (e) {
              r.deviceComFeature = false;
              r.erro = erroDe(e);
            }
          }
          webgpu.featuresTestadas[f] = r;
        }

        // Dispositivo principal: adapter novo (o de cima pode ter sido consumido pelos testes).
        try {
          const t0 = agora();
          const fresco = (await g.requestAdapter({ powerPreference: 'high-performance' })) ?? (await g.requestAdapter());
          if (!fresco) throw new Error('adapter nulo ao pedir o device principal');
          const req = await comTimeout(fresco.requestDevice(), 10_000, 'requestDevice');
          webgpu.device = !!req.ok;
          webgpu.deviceMs = r2(agora() - t0);
          if (!req.ok) webgpu.deviceErro = req.erro;
          if (req.ok) {
            const device = req.v;
            try {
              webgpu.limitesDevice = dumpLimites(device.limits);
              webgpu.preferredCanvasFormat = g.getPreferredCanvasFormat?.() ?? null;
            } catch (e) {
              webgpu.limitesDeviceErro = erroDe(e);
            }

            // Compute: o que a camada A acrescenta de verdade (culling/hachura compactados).
            webgpu.compute = { ok: false };
            try {
              const t = agora();
              const modulo = device.createShaderModule({
                code: '@group(0) @binding(0) var<storage, read_write> out: array<u32>;\n@compute @workgroup_size(1) fn main() { out[0] = 42u; out[1] = 7u * 6u; out[2] = 1u; }',
              });
              const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: modulo, entryPoint: 'main' } });
              const saida = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
              const leitura = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
              const enc = device.createCommandEncoder();
              const pass = enc.beginComputePass();
              pass.setPipeline(pipeline);
              pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: saida } }] }));
              pass.dispatchWorkgroups(1);
              pass.end();
              enc.copyBufferToBuffer(saida, 0, leitura, 0, 16);
              device.queue.submit([enc.finish()]);
              await device.queue.onSubmittedWorkDone();
              await leitura.mapAsync(GPUMapMode.READ);
              const valores = [...new Uint32Array(leitura.getMappedRange().slice(0))];
              leitura.unmap();
              webgpu.compute = { ok: valores[0] === 42 && valores[1] === 42, valores, ms: r2(agora() - t) };
              saida.destroy();
              leitura.destroy();
            } catch (e) {
              webgpu.compute = { ok: false, erro: erroDe(e) };
            }

            // Render para canvas + leitura de pixel: prova que o caminho de desenho funciona.
            webgpu.render = { ok: false };
            try {
              const t = agora();
              const canvas = document.createElement('canvas');
              canvas.width = 64;
              canvas.height = 64;
              document.body.appendChild(canvas);
              const ctx = canvas.getContext('webgpu');
              const formato = g.getPreferredCanvasFormat();
              const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;
              ctx.configure({ device, format: formato, alphaMode: 'opaque', usage });
              const tex = ctx.getCurrentTexture();
              const enc = device.createCommandEncoder();
              const pass = enc.beginRenderPass({
                colorAttachments: [{ view: tex.createView(), clearValue: { r: 1, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
              });
              pass.end();
              const bytesPorLinha = 256;
              const destino = device.createBuffer({ size: bytesPorLinha * 64, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
              enc.copyTextureToBuffer({ texture: tex }, { buffer: destino, bytesPerRow: bytesPorLinha }, { width: 64, height: 64 });
              device.queue.submit([enc.finish()]);
              await device.queue.onSubmittedWorkDone();
              await destino.mapAsync(GPUMapMode.READ);
              const bytes = new Uint8Array(destino.getMappedRange()).slice(0, 4);
              destino.unmap();
              destino.destroy();
              canvas.remove();
              // bgra8unorm: byte 0 é B, 1 G, 2 R.
              const ehBGRA = formato.startsWith('bgra');
              const [b, gg, rr, aa] = bytes;
              const [R, G, B] = ehBGRA ? [rr, gg, b] : [b, gg, rr];
              webgpu.render = { ok: R > 240 && G < 15 && B < 15 && aa > 240, formato, pixel: [R, G, B, aa], ms: r2(agora() - t) };
            } catch (e) {
              webgpu.render = { ok: false, erro: erroDe(e) };
            }

            // Perda/recuperação: 300 ms sem perda = estável; destroy() força o caminho de perda;
            // depois pedimos adapter+device de novo para provar que a recuperação funciona.
            webgpu.perdaRecuperacao = {};
            try {
              const perdido = device.lost.then((info) => ({ reason: info?.reason ?? null, message: info?.message ?? null }));
              const antes = await comTimeout(perdido, 300, 'device.lost espontâneo');
              webgpu.perdaRecuperacao.perdeuSozinho300ms = antes.ok;
              if (antes.ok) webgpu.perdaRecuperacao.perdaEspontanea = antes.v;
              device.destroy();
              const depois = await comTimeout(perdido, 5000, 'device.lost após destroy');
              webgpu.perdaRecuperacao.aposDestroy = depois.ok ? depois.v : { erro: depois.erro };
              const t = agora();
              const r2adapter = await comTimeout(g.requestAdapter(), 8000, 'requestAdapter pós-perda');
              if (r2adapter.ok && r2adapter.v) {
                const dev2 = await comTimeout(r2adapter.v.requestDevice(), 8000, 'requestDevice pós-perda');
                webgpu.perdaRecuperacao.recuperou = !!dev2.ok;
                webgpu.perdaRecuperacao.msAteRecuperar = r2(agora() - t);
                if (dev2.ok) dev2.v.destroy();
              } else {
                webgpu.perdaRecuperacao.recuperou = false;
                webgpu.perdaRecuperacao.erroRecuperacao = r2adapter.erro ?? 'adapter nulo';
              }
            } catch (e) {
              webgpu.perdaRecuperacao = { ...(webgpu.perdaRecuperacao ?? {}), erro: erroDe(e) };
            }
          }
        } catch (e) {
          webgpu.device = false;
          webgpu.deviceErro = erroDe(e);
        }
      }
    }
  } catch (e) {
    webgpu.erro = erroDe(e);
  }

  return { base, canvas2d, webgl2, webgpu };
}

/** Classifica a camada: A (WebGPU com device), B (WebGL2), C (CPU). Marca software. */
function classificar(r) {
  const wg = r.webgpu ?? {};
  const gl = r.webgl2 ?? {};
  const renderer = (gl.unmaskedRenderer ?? gl.renderer ?? '').toString();
  const software = /swiftshader|basic render|llvmpipe|software|microsoft basic/i.test(renderer);
  const webgpuSoftware = /swiftshader|software|warp/i.test(JSON.stringify(wg.info ?? {}));
  if (wg.presente && wg.adapter && wg.device) {
    return { camada: 'A', caminho: software ? 'A sobre rasterizador de software' : 'GPU real', software, webgpuSoftware };
  }
  if (gl.presente) return { camada: 'B', caminho: software ? 'B sobre SwiftShader (software)' : 'GPU real', software, webgpuSoftware };
  return { camada: 'C', caminho: 'Canvas2D', software, webgpuSoftware };
}

/* ---------------------------------------------------------------------------------------------------
 * Host: GPU(s) do sistema (WMI + VRAM de 64 bits no registro, porque AdapterRAM trunca em 4 GB).
 * ------------------------------------------------------------------------------------------------ */
function infoDoHost() {
  const pwsh = (script) =>
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    }).trim();
  const host = {
    hostname: os.hostname(),
    plataforma: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpu: os.cpus()?.[0]?.model ?? null,
    nucleos: os.cpus()?.length ?? null,
    ramGb: Math.round((os.totalmem() / 2 ** 30) * 10) / 10,
    node: process.version,
  };
  let gpus = [];
  try {
    const json = pwsh(`
$vram = @{}
Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue |
  Where-Object { $_.PSChildName -match '^\\d{4}$' } | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($p.DriverDesc) { $vram[$p.DriverDesc] = [string]$p.'HardwareInformation.qwMemorySize' }
  }
$out = Get-CimInstance Win32_VideoController | ForEach-Object {
  [pscustomobject]@{
    nome = $_.Name
    driverVersion = $_.DriverVersion
    driverDate = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }
    adapterRamBytes = [string]$_.AdapterRAM
    vramRegistroBytes = if ($vram.ContainsKey($_.Name)) { $vram[$_.Name] } else { $null }
    processadorVideo = $_.VideoProcessor
    status = $_.Status
    pnpId = $_.PNPDeviceID
  }
}
ConvertTo-Json -InputObject @($out) -Compress -Depth 4
`);
    gpus = JSON.parse(json || '[]');
    if (!Array.isArray(gpus)) gpus = [gpus];
  } catch (e) {
    host.erroGpu = e.message;
  }
  return { host, gpus };
}

/* ---------------------------------------------------------------------------------------------------
 * CDP: SystemInfo.getInfo (status das features do Chromium) + chrome://gpu (evidência textual).
 * ------------------------------------------------------------------------------------------------ */
async function statusDoChromium(browser, context) {
  const out = { systemInfo: null, chromeGpu: null, erros: [] };
  try {
    const cdp = await browser.newBrowserCDPSession();
    const info = await cdp.send('SystemInfo.getInfo');
    const aux = info.gpu?.auxAttributes ?? null;
    const chavesAux = [
      'displayType',
      'glRenderer',
      'glVendor',
      'glVersion',
      'glImplementationParts',
      'supportsDx12',
      'dx12FeatureLevel',
      'supportsVulkan',
      'vulkanVersion',
      'directMLFeatureLevel',
      'skiaBackendType',
      'maxMsaaSamples',
      'processCrashCount',
      'inProcessGpu',
      'sandboxed',
      'directComposition',
      'supportsOverlays',
      'passthroughCmdDecoder',
      'bgra8OverlaySupport',
    ];
    out.auxRelevante = aux ? Object.fromEntries(chavesAux.filter((k) => k in aux).map((k) => [k, aux[k]])) : null;
    out.systemInfo = {
      gpu: info.gpu
        ? {
            auxAttributes: info.gpu.auxAttributes ?? null,
            featureStatus: info.gpu.featureStatus ?? null,
            devices: (info.gpu.devices ?? []).map((d) => ({
              vendorId: d.vendorId ?? null,
              deviceId: d.deviceId ?? null,
              vendorString: d.vendorString ?? null,
              deviceString: d.deviceString ?? null,
              driverVendor: d.driverVendor ?? null,
              driverVersion: d.driverVersion ?? null,
              active: d.active ?? null,
            })),
          }
        : null,
      modelName: info.modelName ?? null,
      commandLine: info.commandLine ?? null,
    };
    await cdp.detach();
  } catch (e) {
    out.erros.push(`SystemInfo: ${e.message}`);
  }
  // chrome://gpu: o conteúdo vive em shadow roots; as tabelas dão pares chave/valor confiáveis.
  // Precisa de um contexto explícito (browser.newPage() é recusado em chrome://).
  try {
    const gpuPage = await context.newPage();
    await gpuPage.goto('chrome://gpu', { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await gpuPage.waitForTimeout(2000);
    const dom = await gpuPage.evaluate(() => {
      const raizes = [];
      const visitar = (raiz) => {
        for (const el of raiz.querySelectorAll('*')) if (el.shadowRoot) visitar(el.shadowRoot);
        raizes.push(raiz);
      };
      visitar(document);
      const status = [];
      for (const r of raizes) {
        for (const li of r.querySelectorAll('li')) {
          const t = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (t && t.length < 200) status.push(t);
        }
      }
      const tabelas = [];
      for (const r of raizes) {
        for (const t of r.querySelectorAll('table.info-table')) {
          const linhas = [...t.querySelectorAll('tr')].map((tr) =>
            [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()),
          );
          if (linhas.some((l) => l.length >= 2)) tabelas.push(linhas);
        }
      }
      const texto = raizes.map((r) => r.textContent ?? '').join('\n');
      return {
        status: status.slice(0, 60),
        tabelas: tabelas.flat().filter((l) => l.length >= 2).slice(0, 120),
        texto: texto.slice(0, 80_000),
        tamanhoTexto: texto.length,
      };
    });
    // O painel de driver do chrome://gpu virou texto corrido (sem <table>): extrai por chave,
    // cortando no começo da próxima chave conhecida.
    const CHAVES = [
      'Driver D3D12 feature level',
      'Driver Vulkan API version',
      'GL implementation parts',
      'Display type',
      'GL_RENDERER',
      'GL_VENDOR',
      'GL_VERSION',
      'GPU0',
      'GPU1',
      'In-process GPU',
      'Sandboxed',
      'Skia Backend',
      'Direct composition',
      'DirectML feature level',
      'Max. MSAA samples',
      'GPU process crash count',
      'Optimus',
      'Reset notification strategy',
      'Direct rendering version',
      'Pixel shader version',
      'Vertex shader version',
      'GL_EXTENSIONS',
      'Supports overlays',
      'YUV2 overlay support',
      'NV12 overlay support',
      'BGRA8 overlay support',
      'RGB10A2 overlay support',
      'P010 overlay support',
      'Machine model name',
      'Machine model version',
      'AMD switchable',
      'Desktop compositing',
      'Driver Bug Workarounds',
      'Passthrough Command Decoder',
      'Initialization time',
    ];
    const info = {};
    for (const chave of CHAVES) {
      const i = dom.texto.indexOf(chave);
      if (i < 0) continue;
      let fim = dom.texto.length;
      for (const outra of CHAVES) {
        if (outra === chave) continue;
        const j = dom.texto.indexOf(outra, i + chave.length);
        if (j >= 0 && j < fim) fim = j;
      }
      const valor = dom.texto
        .slice(i + chave.length, Math.min(fim, i + chave.length + 240))
        .replace(/^\s*:?\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      info[chave] = valor;
    }
    // Se alguma build ainda usa tabela, ela ganha como fonte mais confiável.
    for (const [k, v] of dom.tabelas) if (CHAVES.includes(k)) info[k] = v;
    const status = dom.status.filter((l) => !/Frontend (features|workarounds)/.test(l));
    out.chromeGpu = { status, info, tamanhoTexto: dom.tamanhoTexto };
    await gpuPage.close();
  } catch (e) {
    out.erros.push(`chrome://gpu: ${e.message}`);
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------------
 * App real: abre apps/web/dist (se existir) e lê o motor da barra de status.
 * NÃO muda default: só visita ?gpu=webgpu&debug=1, ?debug=1 e ?cpu=1 para registrar o que acontece.
 * ------------------------------------------------------------------------------------------------ */
async function sondarApp(context) {
  const dist = path.join(ROOT, 'apps', 'web', 'dist', 'index.html');
  if (!existsSync(dist)) return { executado: false, motivo: 'apps/web/dist/index.html ausente (rode `npm run build -w @hestia/web`)' };
  const url = pathToFileURL(dist).href;
  const casos = [
    { rotulo: 'padrão (sem ?gpu)', query: '?debug=1', esperado: 'WebGL2 (default da decisão 0003)' },
    { rotulo: '?gpu=webgpu', query: '?gpu=webgpu&debug=1', esperado: 'WebGPU se houver, senão WebGL2' },
    { rotulo: '?cpu=1', query: '?cpu=1&debug=1', esperado: 'CPU (camada C)' },
  ];
  const resultados = [];
  for (const caso of casos) {
    const page = await context.newPage();
    const errosPagina = [];
    page.on('pageerror', (e) => errosPagina.push(e.message));
    const t0 = Date.now();
    try {
      await page.goto(url + caso.query, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(() => window.__hestia && window.__hestia.useUi, null, { timeout: 60_000 });
      await page.waitForFunction(() => window.__hestia.useUi.getState().gpu !== 'pending', null, { timeout: 30_000 }).catch(() => {});
      const msAteMotor = Date.now() - t0;
      await page.waitForTimeout(600);
      const dados = await page.evaluate(() => {
        const estado = window.__hestia.useUi.getState();
        const badge = document.querySelector('.sb-engine');
        const canvas3d = document.querySelector('.canvas-wrap canvas');
        const webgl = (() => {
          try {
            const c = document.createElement('canvas');
            const g2 = c.getContext('webgl2');
            const g1 = c.getContext('webgl');
            return { webgl2: !!g2, webgl1: !!g1 };
          } catch {
            return null;
          }
        })();
        return {
          motor: estado.gpu,
          badge: badge?.textContent?.trim() ?? null,
          temCanvas3d: !!canvas3d,
          larguraCanvas: canvas3d?.width ?? null,
          alturaCanvas: canvas3d?.height ?? null,
          status: estado.status ?? null,
          webgl,
          possuiApiWebGpu: !!navigator.gpu,
        };
      });
      resultados.push({ ...caso, ...dados, msAteMotor, msTotal: Date.now() - t0, errosPagina });
    } catch (e) {
      resultados.push({ ...caso, erro: e.message, msTotal: Date.now() - t0, errosPagina });
    } finally {
      await page.close().catch(() => {});
    }
  }
  return { executado: true, url: `${url}?gpu=webgpu&debug=1`, casos: resultados };
}

/* ---------------------------------------------------------------------------------------------------
 * Execução: um navegador × uma variante de flags.
 * ------------------------------------------------------------------------------------------------ */
async function executar({ navegador, executavel, modo, variante, args }) {
  const inicio = Date.now();
  const registro = {
    ambiente: { navegador, executavel, modo, variante, argsDifere: args.filter((a) => !ARGS_BASE.includes(a)) },
    iniciadoEm: new Date().toISOString(),
    ok: false,
    erros: [],
  };
  let browser = null;
  try {
    browser = await chromium.launch({
      executablePath: executavel,
      headless: modo === 'headless',
      args,
      timeout: 60_000,
    });
    registro.versao = browser.version();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => registro.erros.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') registro.erros.push(`console: ${m.text()}`);
    });
    // Página local servida por rota (contexto seguro, sem servidor): file:// também é seguro no Chrome,
    // mas https garante navigator.gpu em qualquer build.
    await page.route('https://gpu.probe.local/', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: HTML_SONDA }));
    await page.goto('https://gpu.probe.local/', { waitUntil: 'domcontentloaded' });
    registro.pagina = await page.evaluate(sondaNaPagina);
    const c = classificar(registro.pagina);
    registro.camada = c.camada;
    registro.caminho = c.caminho;
    registro.renderizadorSoftware = c.software;
    registro.chromium = await statusDoChromium(browser, context);
    if (COM_APP) registro.app = await sondarApp(context);
    registro.ok = true;
  } catch (e) {
    registro.erros.push(`falha: ${e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    registro.duracaoMs = Date.now() - inicio;
  }
  return registro;
}

/** Um navegador por vez, headed primeiro; se headed não abrir, tenta headless e registra a limitação. */
async function rodarNavegador(nome, headed) {
  const executavel = acharNavegador(nome);
  if (!executavel) return [{ ambiente: { navegador: nome, modo: headed ? 'headed' : 'headless' }, ok: false, erros: [`não encontrado (defina ${nome.toUpperCase()}_PATH)`], camada: null }];
  if (executavel.startsWith('inexistente')) return [{ ambiente: { navegador: nome, modo: headed ? 'headed' : 'headless' }, ok: false, erros: [executavel], camada: null }];

  const modo = headed ? 'headed' : 'headless';
  const semFlags = await executar({ navegador: nome, executavel, modo, variante: 'sem-flags', args: ARGS_BASE });
  const saida = [semFlags];
  // Headed falhou antes de sondar? Registra e tenta headless=new, para não perder o dado.
  if (!semFlags.ok && semFlags.erros.some((e) => /falha: /.test(e)) && headed) {
    const alt = await executar({ navegador: nome, executavel, modo: 'headless', variante: 'sem-flags (headed falhou)', args: ARGS_BASE });
    alt.limitacao = 'headed não abriu; resultado é headless=new (pode usar SwiftShader)';
    alt.ambiente = { ...alt.ambiente, modo: 'headless (fallback)' };
    saida.push(alt);
    return saida;
  }
  // Só vale a 2ª passada se o WebGPU não veio: queremos separar blocklist de driver sem suporte.
  const wg = semFlags.pagina?.webgpu;
  const precisaFlags = COM_FLAGS && (FORCAR_FLAGS || !wg || !wg.adapter || !wg.device);
  if (precisaFlags) {
    const comFlags = await executar({ navegador: nome, executavel, modo, variante: 'flags-dev', args: ARGS_FLAGS });
    comFlags.observacao = `flags de desenvolvimento (${FLAGS_EXTRAS.join(' ')}): não servem para usuário final`;
    saida.push(comFlags);
  }
  return saida;
}

/* ---------------------------------------------------------------------------------------------------
 * main
 * ------------------------------------------------------------------------------------------------ */
const { host, gpus } = infoDoHost();
const alvos = QUAIS === 'both' ? ['chrome', 'edge'] : [QUAIS];
const execucoes = [];
for (const alvo of alvos) {
  // Headed é o padrão porque o headless pode cair em SwiftShader e falsear o veredito.
  process.stdout.write(`\n▶ ${alvo} (${HEADLESS ? 'headless=new' : 'headed'})…\n`);
  try {
    const r = await rodarNavegador(alvo, !HEADLESS);
    execucoes.push(...r);
    for (const e of r) {
      process.stdout.write(
        `  ${e.ambiente.navegador} ${e.ambiente.modo} ${e.ambiente.variante} → camada ${e.camada ?? '?'}` +
          `${e.pagina?.webgpu?.adapter ? ' · adapter ok' : ' · sem adapter'}` +
          `${e.pagina?.webgl2?.presente ? ' · webgl2 ok' : ' · sem webgl2'}` +
          `${e.erros?.length ? ` · ${e.erros.length} erro(s)` : ''}\n`,
      );
    }
  } catch (e) {
    execucoes.push({ ambiente: { navegador: alvo, modo: HEADLESS ? 'headless' : 'headed', variante: 'sem-flags' }, ok: false, camada: null, erros: [`exceção: ${e.message}`] });
    process.stdout.write(`  erro: ${e.message}\n`);
  }
}

const relatorio = {
  sonda: 'S0 — capacidade de GPU real (Hestia)',
  plano: 'plano de subagentes de 2026-10-26 (documento removido; ver histórico do git) (v3) §4/0.1',
  geradoEm: agora.toISOString(),
  data: DATA,
  maquina: host,
  gpusDoSistema: gpus,
  opcoes: { headless: HEADLESS, navegadores: alvos, comFlags: COM_FLAGS, comApp: COM_APP },
  execucoes,
};
if (SALVAR) {
  const dir = path.join(ROOT, 'scripts', 'perf-baselines');
  mkdirSync(dir, { recursive: true });
  const sufixo = valor('--out') ? `-${valor('--out')}` : '';
  const arquivo = path.join(dir, `gpu-capacidade-${DATA}${sufixo}.json`);
  writeFileSync(arquivo, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8');
  process.stdout.write(`\nJSON: ${path.relative(ROOT, arquivo)}\n`);
}

// Resumo no terminal: uma linha por ambiente, com os números que decidem a camada.
process.stdout.write('\nAmbiente | Camada | WebGPU adapter/device | WebGL2 | Renderer\n');
for (const e of execucoes) {
  const p = e.pagina ?? {};
  const wg = p.webgpu ?? {};
  const gl = p.webgl2 ?? {};
  const renderer = gl.unmaskedRenderer ?? gl.renderer ?? '—';
  process.stdout.write(
    `${e.ambiente.navegador}/${e.ambiente.modo}/${e.ambiente.variante} | ${e.camada ?? '?'} | ` +
      `${wg.presente ? 'api' : 'sem api'}/${wg.adapter ? 'adapter' : 'sem adapter'}/${wg.device ? 'device' : 'sem device'} | ` +
      `${gl.presente ? 'ok' : 'não'} | ${renderer}\n`,
  );
}
const qualquerA = execucoes.some((e) => e.camada === 'A');
const qualquerB = execucoes.some((e) => e.pagina?.webgl2?.presente);
const qualquerSofware = execucoes.some((e) => e.renderizadorSoftware);
const falhouTudo = execucoes.every((e) => !e.ok);
process.stdout.write(
  `\nCamada A (WebGPU com device) em algum ambiente: ${qualquerA ? 'SIM' : 'NÃO'} · ` +
    `Camada B (WebGL2) em algum ambiente: ${qualquerB ? 'SIM' : 'NÃO'}` +
    `${qualquerSofware ? ' · ATENÇÃO: algum ambiente caiu em rasterizador de software' : ''}\n`,
);
if (falhouTudo) process.exitCode = 2;
