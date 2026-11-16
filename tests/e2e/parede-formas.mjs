// Portão visual da Fase 1 da frente Parede com formas (METODOLOGIA.md 5.3). Pela interface: desenha círculo, elipse, hexágono
// inscrito e spline fechada com a ferramenta Parede (botões do painel Desenhar e cliques na planta); insere uma porta numa
// parede da elipse (ferramenta Porta, clique na parede); desloca o hexágono com Deslocar, opção Cadeia (teclas OF, clique no
// lado, distância na barra de opções); abre o Modelo 3D. Capturas em docs/parede-formas/evidencias/fase1/. Sai com código 1 se
// algum passo falhar ou houver erro de console (o aviso de favicon ausente é ignorado: defeito conhecido).
//   node tests/e2e/parede-formas.mjs            (app já servido em http://127.0.0.1:4174/; HESTIA_URL troca a origem)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { clickWorld, pressTool, worldToPage } from './helpers.mjs';
import { botaoDoPainel, capturar, criarRelatorio, enquadrarPlanta, novoProjetoEmBranco } from './massaHelpers.mjs';

const BASE = process.env.HESTIA_URL ?? 'http://127.0.0.1:4174/';
const DIR = path.resolve('docs/parede-formas/evidencias/fase1');
const VIEWPORT = { width: 1440, height: 860 };
const ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const rel = criarRelatorio();
const check = rel.check;

const CIRCULO = { c: { x: -14, y: 0 }, r: 3 };
const ELIPSE = { c: { x: 0, y: 0 }, rx: 4, ry: 2.5 };
const HEX = { c: { x: 14, y: 0 }, r: 3 };
const SPLINE = [[-6, 10], [-2, 13], [3, 12], [5, 9], [1, 8], [-4, 8.5]];
const OFFSET = 0.5;

// Erros de console da página; o favicon ausente (404) é contado à parte e não conta como falha.
const erros = [];
let faviconIgnorado = 0;
const favicon = (texto, url) => /favicon/i.test(`${url ?? ''} ${texto}`);
function coletar(page) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (favicon(m.text(), m.location()?.url)) faviconIgnorado++;
    else erros.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() < 400) return;
    if (favicon('', r.url())) faviconIgnorado++;
    else erros.push(`[HTTP ${r.status()}] ${r.url()}`);
  });
}

const passo = async (nome, fn) => {
  console.log(`\n== ${nome}`);
  try {
    await fn();
  } catch (e) {
    check(`${nome}: sem exceção`, false, e.message.split('\n')[0]);
  }
};

/** Lê paredes e aberturas do projeto (só conferência). */
const estado = (page) => page.evaluate(() => {
  const els = Object.values(window.__hestia.editor.project.elements);
  const ponto = (q) => ({ x: q.x, y: q.y });
  return {
    walls: els.filter((e) => e.kind === 'wall').map((w) => ({ id: w.id, a: ponto(w.a), b: ponto(w.b), sag: w.sag ?? 0 })),
    aberturas: els.filter((e) => e.kind !== 'wall' && 'hostId' in e).map((o) => ({ id: o.id, hostId: o.hostId })),
  };
});

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const chave = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
/** Pontos distintos das extremidades das paredes. */
const pontosDe = (walls) => { const m = new Map(); for (const w of walls) for (const p of [w.a, w.b]) m.set(chave(p), p); return [...m.values()]; };
const centroDe = (ps) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
/** Anel fechado: cada extremidade é usada por exatamente duas paredes (sem emenda aberta). */
function fechado(walls) {
  const n = new Map();
  for (const w of walls) for (const p of [w.a, w.b]) n.set(chave(p), (n.get(chave(p)) ?? 0) + 1);
  return walls.length >= 3 && [...n.values()].every((k) => k === 2);
}
/** Distância do ponto `c` à reta que passa pelas extremidades da parede (reta, sem flecha). */
const distReta = (w, c) => Math.abs((w.b.x - w.a.x) * (c.y - w.a.y) - (w.b.y - w.a.y) * (c.x - w.a.x)) / dist(w.a, w.b);
const ids = (ws) => new Set(ws.map((w) => w.id));
const novas = (antes, depois) => depois.filter((w) => !antes.some((p) => p.id === w.id));

/** Mesmo passo de zoom da massa: afasta a planta até a vista abranger `largura` metros. */
async function afastar(page, largura) {
  const caixa = await page.locator('.canvas-wrap').boundingBox();
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  for (let i = 0; i < 40; i++) {
    const v = await page.evaluate(() => window.__hestia.editor.viewport());
    if (v.width / v.zoom >= largura) return;
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(120);
  }
}

/** Aproxima a planta com a roda sobre um ponto de mundo (o zoom mantém o ponto sob o cursor) até `zoomMin` px/m. */
async function aproximar(page, x, y, zoomMin) {
  const p = await worldToPage(page, x, y);
  await page.mouse.move(p.x, p.y);
  for (let i = 0; i < 30; i++) {
    const zoom = await page.evaluate(() => window.__hestia.editor.viewport().zoom);
    if (zoom >= zoomMin) return;
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(120);
  }
}

/** Preenche uma opção numérica da barra (campo digitado + Enter, como a massa). */
const opcao = async (page, seletor, valor) => { await page.locator(seletor).fill(String(valor)); await page.keyboard.press('Enter'); await page.waitForTimeout(150); };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ARGS });
mkdirSync(DIR, { recursive: true });
try {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  coletar(page);
  await page.goto(`${BASE}index.html?gl=1&debug=1`);
  await passo('0. App e projeto em branco', async () => {
    await page.waitForFunction(() => window.__hestia, null, { timeout: 120000 });
    await page.waitForFunction(() => window.__hestiaKernel?.estado().ativo === true, null, { timeout: 60000 });
    check('kernel ligado no app (ativo)', true);
    await novoProjetoEmBranco(page);
    await afastar(page, 60);
    check('projeto em branco sem paredes', (await estado(page)).walls.length === 0);
  });

  // 1. Círculo: centro e um ponto do raio. Anel fechado de raio 3 m.
  await passo('1a. Círculo (raio 3 m)', async () => {
    await pressTool(page, 'w');
    await botaoDoPainel(page, 'Desenhar', 'Círculo').click();
    const antes = (await estado(page)).walls;
    await clickWorld(page, CIRCULO.c.x, CIRCULO.c.y);
    await clickWorld(page, CIRCULO.c.x + CIRCULO.r, CIRCULO.c.y);
    const nv = novas(antes, (await estado(page)).walls);
    const ps = pontosDe(nv);
    const c = centroDe(ps);
    const raio = ps.reduce((s, p) => s + dist(p, c), 0) / ps.length;
    check('círculo: anel fechado', fechado(nv), `${nv.length} paredes`);
    check('círculo: centro em (-14, 0) (±0,1 m)', dist(c, CIRCULO.c) < 0.1, `${c.x.toFixed(3)}, ${c.y.toFixed(3)}`);
    check('círculo: raio 3 m (±0,1 m)', Math.abs(raio - CIRCULO.r) < 0.1, raio.toFixed(3));
    await capturar(page, DIR, 'planta-circulo.png', check);
  });

  // 2. Elipse: centro, ponta do eixo maior (rx 4 m) e o outro raio (ry 2,5 m).
  await passo('1b. Elipse (4 x 2,5 m)', async () => {
    await botaoDoPainel(page, 'Desenhar', 'Elipse').click();
    const antes = (await estado(page)).walls;
    await clickWorld(page, ELIPSE.c.x, ELIPSE.c.y);
    await clickWorld(page, ELIPSE.c.x + ELIPSE.rx, ELIPSE.c.y);
    await clickWorld(page, ELIPSE.c.x, ELIPSE.c.y + ELIPSE.ry);
    const nv = novas(antes, (await estado(page)).walls);
    const ps = pontosDe(nv);
    const fora = ps.reduce((m, p) => Math.max(m, Math.abs(((p.x / ELIPSE.rx) ** 2 + (p.y / ELIPSE.ry) ** 2) - 1)), 0);
    check('elipse: anel fechado', fechado(nv), `${nv.length} paredes`);
    check('elipse: extremidades sobre 4 x 2,5 m (erro de (x/a)²+(y/b)² < 0,05)', fora < 0.05, fora.toFixed(4));
    await capturar(page, DIR, 'planta-elipse.png', check);
  });

  // 3. Hexágono inscrito: centro e um vértice (raio 3 m), 6 lados.
  await passo('1c. Hexágono inscrito (6 lados, raio 3 m)', async () => {
    await botaoDoPainel(page, 'Desenhar', 'Polígono inscrito').click();
    await opcao(page, '#opt-poly-sides', 6);
    const antes = (await estado(page)).walls;
    await clickWorld(page, HEX.c.x, HEX.c.y);
    await clickWorld(page, HEX.c.x + HEX.r, HEX.c.y);
    const nv = novas(antes, (await estado(page)).walls);
    const ps = pontosDe(nv);
    const c = centroDe(ps);
    const raio = ps.reduce((s, p) => s + dist(p, c), 0) / Math.max(1, ps.length);
    check('hexágono: 6 paredes', nv.length === 6, `${nv.length}`);
    check('hexágono: anel fechado', fechado(nv));
    check('hexágono: centro em (14, 0) (±0,1 m)', dist(c, HEX.c) < 0.1, `${c.x.toFixed(3)}, ${c.y.toFixed(3)}`);
    check('hexágono: vértices a 3 m (±0,1 m)', Math.abs(raio - HEX.r) < 0.1, raio.toFixed(3));
    await capturar(page, DIR, 'planta-hexagono.png', check);
  });

  // 4. Spline fechada: pontos clicados e fecha clicando no primeiro (ou Enter, que termina aberta).
  await passo('1d. Spline fechada', async () => {
    await botaoDoPainel(page, 'Desenhar', 'Spline').click();
    const antes = (await estado(page)).walls;
    for (const [x, y] of SPLINE) await clickWorld(page, x, y);
    await clickWorld(page, SPLINE[0][0], SPLINE[0][1]);
    const nv = novas(antes, (await estado(page)).walls);
    const ps = pontosDe(nv);
    const dentro = ps.every((p) => p.x > -6.5 && p.x < 5.5 && p.y > 7.5 && p.y < 13.5);
    check('spline: anel fechado', fechado(nv), `${nv.length} paredes`);
    check('spline: extremidades dentro da região dos pontos clicados', dentro);
    await capturar(page, DIR, 'planta-spline.png', check);
  });

  // 5. Porta numa parede da elipse: ferramenta Porta (teclas DR) e clique no meio de uma parede da elipse.
  await passo('2. Porta numa parede da elipse', async () => {
    const s0 = await estado(page);
    const naElipse = s0.walls.filter((w) => dist(w.a, ELIPSE.c) < 4.5 && dist(w.b, ELIPSE.c) < 4.5);
    check('elipse tem paredes no nível', naElipse.length >= 4, `${naElipse.length}`);
    const alvo = naElipse.reduce((m, w) => ((w.a.x + w.b.x) / 2 > (m.a.x + m.b.x) / 2 ? w : m));
    const meio = { x: (alvo.a.x + alvo.b.x) / 2, y: (alvo.a.y + alvo.b.y) / 2 };
    await pressTool(page, 'd');
    await clickWorld(page, meio.x, meio.y);
    await pressTool(page, 'v');
    const s1 = await estado(page);
    const abertas = s1.aberturas.filter((o) => !s0.aberturas.some((p) => p.id === o.id));
    check('porta inserida (1 abertura nova)', abertas.length === 1, `${abertas.length}`);
    check('porta hospedada numa parede da elipse', abertas.some((o) => ids(naElipse).has(o.hostId)));
    await capturar(page, DIR, 'planta-porta.png', check);
  });

  // 6. Deslocar com Cadeia no hexágono, para dentro, 0,5 m. Passo: tecla OF, opção Cadeia marcada, distância, clique no lado.
  await passo('3. Deslocar em cadeia no hexágono (0,5 m para dentro)', async () => {
    await pressTool(page, 'v');
    await page.keyboard.press('o');
    await page.keyboard.press('f');
    check('ferramenta Deslocar ativa (opção de distância visível)', await page.locator('#opt-offset').isVisible());
    if (!(await page.locator('#opt-ochain').isChecked())) await page.locator('#opt-ochain').click();
    check('opção Cadeia marcada', await page.locator('#opt-ochain').isChecked());
    await opcao(page, '#opt-offset', String(OFFSET).replace('.', ','));
    const antes = (await estado(page)).walls;
    const hex = antes.filter((w) => dist(w.a, HEX.c) < 3.5 && dist(w.b, HEX.c) < 3.5);
    check('hexágono com 6 paredes antes de deslocar', hex.length === 6, `${hex.length}`);
    const C = centroDe(pontosDe(hex));
    const apotemas = hex.map((w) => distReta(w, C));
    const A = apotemas.reduce((s, d) => s + d, 0) / apotemas.length;
    await aproximar(page, HEX.c.x, HEX.c.y, 60);
    const w0 = hex[0];
    const m = { x: (w0.a.x + w0.b.x) / 2, y: (w0.a.y + w0.b.y) / 2 };
    const du = dist(m, C);
    // Cursor 0,08 m para dentro da parede: o lado do cursor define o sentido do deslocamento.
    const alvo = { x: m.x + ((C.x - m.x) / du) * 0.08, y: m.y + ((C.y - m.y) / du) * 0.08 };
    await clickWorld(page, alvo.x, alvo.y);
    const depois = (await estado(page)).walls;
    const dentro = depois.filter((w) => dist(w.a, C) < 4 && dist(w.b, C) < 4 && Math.abs(distReta(w, C) - (A - OFFSET)) < 0.005);
    const original = depois.filter((w) => dist(w.a, C) < 4 && dist(w.b, C) < 4 && Math.abs(distReta(w, C) - A) < 0.005);
    check('cadeia: 6 lados deslocados a 0,5 m para dentro', dentro.length === 6, `${dentro.length} lados; apótema ${A.toFixed(4)} m`);
    check('cadeia: lados deslocados formam anel fechado', fechado(dentro));
    check('lados originais: 6 mantidos (cópia) ou 0 (movidos)', original.length === 6 || original.length === 0, `${original.length}`);
    await capturar(page, DIR, 'hexagono-deslocado.png', check);
  });

  // 7. Modelo 3D.
  await passo('4. Modelo 3D', async () => {
    await pressTool(page, 'v');
    await enquadrarPlanta(page);
    await page.getByRole('treeitem', { name: /Modelo 3D/ }).first().click();
    await page.waitForTimeout(1500);
    await capturar(page, DIR, '3d.png', check);
  });
} finally {
  await browser.close();
}

console.log(`\nerros de console (exceto favicon): ${erros.length}`);
for (const e of erros) console.log(`  ${e}`);
console.log(`favicon ausente ignorado: ${faviconIgnorado}`);
const falhas = rel.falhas() + erros.length;
console.log(`verificações falhas: ${rel.falhas()}`);
process.exit(falhas ? 1 : 0);
