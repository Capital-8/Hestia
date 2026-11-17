// Base do E2E do terreno: abertura do app por HTTP (o kernel Rust só carrega assim), capturas, medição de tempo e
// pequenos auxiliares de interface (faixa, campos numéricos, desenho estável da planta).
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch } from './helpers.mjs';
import { subirServidor } from './terreno-servidor.mjs';

export const FINAL = path.resolve('docs/terreno/evidencias/final');
export const DXF = path.resolve('tests/fixtures/terreno/levantamento.dxf');
mkdirSync(FINAL, { recursive: true });

/** Sobe servidor e navegador, abre o app com `?debug=1` e cria um projeto em branco pela interface. */
export async function abrir({ width = 1760, height = 960 } = {}) {
  const servidor = await subirServidor();
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
  await page.goto(`${servidor.base}/?debug=1&gl=1`);
  await page.waitForFunction(() => window.__hestia);
  await page.waitForFunction(() => window.__hestiaKernel.estado().ativo, undefined, { timeout: 30000 });
  await page.getByRole('button', { name: /Novo projeto/ }).click();
  await page.waitForSelector('.canvas-wrap canvas');
  await page.waitForTimeout(600);
  const fechar = async () => { await browser.close(); await servidor.fechar(); };
  return { page, errors, browser, servidor, fechar };
}

/** Captura de tela da página inteira em `docs/terreno/evidencias/final/<nome>`. */
export const shot = (page, nome) => page.screenshot({ path: path.join(FINAL, nome) });

/** Aba da faixa (visível). */
export const aba = (page, nome) => page.locator('.rtab:visible', { hasText: nome }).click();

/** Botão da faixa pelo rótulo (a faixa tem uma cópia invisível para medir o transbordo, então só o visível). */
export const botao = (page, nome) => page.locator(`.rb-btn:visible[aria-label="${nome}"], .rb-btn:visible:has(.rb-lbl:text-is("${nome}"))`).first().click();

/** Abre o menu do botão dividido (a parte do rótulo com ▾) e escolhe um item. */
export async function menuDividido(page, rotulo, item) {
  await page.locator('.rb-bottom:visible', { hasText: rotulo }).first().click();
  await page.getByText(item, { exact: true }).click();
}

/** Digita num campo numérico e confirma com Enter. */
export async function digitar(loc, valor) {
  await loc.fill(String(valor));
  await loc.press('Enter');
}

export const km = (page) => page.evaluate(() => window.__hestiaKernel.estado());

/**
 * Mede o tempo (ms) de uma ação até o canvas parar de mudar: roda `acao()` e tira capturas seguidas da área da vista (a planta
 * e o 3D são WebGL, então ler o canvas por `drawImage` devolve vazio); o resultado é o instante da última captura diferente da
 * anterior, depois de `calmaMs` sem mudança. Resolução de ~100 ms (custo de cada captura). Sem mudança alguma, devolve `null`.
 */
export async function medirDesenho(page, acao, { calmaMs = 600, limiteMs = 25000 } = {}) {
  const clip = await page.locator('.canvas-wrap').boundingBox();
  const cap = async () => (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
  let ultimo = await cap();
  const t0 = Date.now();
  await acao();
  let tMudou = null; let tFim = Date.now();
  while (Date.now() - tFim < calmaMs && Date.now() - t0 < limiteMs) {
    const h = await cap();
    if (h !== ultimo) { ultimo = h; tMudou = Date.now() - t0; tFim = Date.now(); }
  }
  return tMudou;
}

/** Coordenadas de tela de um ponto de mundo, pela vista atual (planta). */
export async function paraTela(page, x, y) {
  const v = await page.evaluate(() => {
    const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
    const vp = window.__hestia.editor.viewport();
    return { left: r.x, top: r.y, cx: vp.cx, cy: vp.cy, zoom: vp.zoom, width: vp.width, height: vp.height };
  });
  return { x: v.left + v.width / 2 + (x - v.cx) * v.zoom, y: v.top + v.height / 2 - (y - v.cy) * v.zoom };
}

export async function clicar(page, x, y, opts = {}) {
  const p = await paraTela(page, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y, opts);
  await page.waitForTimeout(60);
}

/** Primeiro terreno do projeto (resumo serializável). */
export const terreno = (page) => page.evaluate(() => {
  const t = Object.values(window.__hestia.editor.project.elements).find((e) => e.kind === 'terrain');
  return t ? { id: t.id, pontos: t.pontos, curvas: t.curvas.length, linhasRotulo: t.linhasRotulo, pontosCotados: t.pontosCotados, levelId: t.levelId } : null;
});
