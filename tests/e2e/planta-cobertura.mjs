// Planta de cobertura ponta a ponta na interface real: grupo "Plantas de cobertura" no Navegador, aba própria por nível,
// título da janela, telhado completo e opaco (pixels), troca entre piso e cobertura sem resíduo, propriedades da vista e
// o que não entra no projeto. Casa de exemplo; o telhado está no nível "Cobertura" (lv_2), não no "Pavimento 2" (lv_1).
//   npm run build && SHOTS=<pasta> node tests/e2e/planta-cobertura.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { launch, makeReporter, openApp, worldToPage } from './helpers.mjs';

const OUT = process.env.SHOTS ?? 'test-results/planta-cobertura';
mkdirSync(OUT, { recursive: true });

const rep = makeReporter();
const browser = await launch();
const { page, errors } = await openApp(browser);
const canvasWrap = page.locator('.canvas-wrap');
const shot = (name) => canvasWrap.screenshot({ path: path.join(OUT, name) });
const ui = () => page.evaluate(() => {
  const s = window.__hestia.useUi.getState();
  return { view: s.view, planViewId: s.planViewId, levelId: s.levelId, tabs: s.openViews.map((v) => `${v.kind}:${v.levelId ?? v.viewId ?? ''}${String(v.viewId ?? '').startsWith('pvr_') ? ':roof' : ''}`) };
});
/** Tipo da vista de planta a partir do id da vista ativa: cobertura ('pvr_'), piso ('pv_'); planta de área não tem prefixo. */
const ehCobertura = (s) => (s.planViewId ?? '').startsWith('pvr_');
const ehPiso = (s) => (s.planViewId ?? '').startsWith('pv_') && !ehCobertura(s);
/** Duplo clique no item do Navegador da cobertura (o título do item identifica o nível). */
const abrirCobertura = async (nivel) => {
  await page.locator(`[title^="Planta de cobertura do nível ${nivel}."]`).dblclick();
  await page.waitForTimeout(700);
};
/** Enquadra o telhado da casa (pelo mesmo viewport que a planta usa) para as capturas e as amostras de cor. */
const enquadrarCasa = () => page.evaluate(() => {
  const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
  window.__hestia.editor.setViewport({ cx: 5.875, cy: 7, zoom: Math.min(r.width, r.height) * 0.8 / 16, width: Math.round(r.width), height: Math.round(r.height) });
});
/** Cor (RGB) de cada ponto de mundo na captura da área de desenho. Decodifica a imagem no próprio navegador. */
const coresEm = async (pontos) => {
  const buf = await canvasWrap.screenshot();
  const coords = await page.evaluate((pts) => {
    const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
    const vp = window.__hestia.editor.viewport();
    return pts.map(([x, y]) => ({ x: (x - vp.cx) * vp.zoom + vp.width / 2, y: vp.height / 2 - (y - vp.cy) * vp.zoom, w: r.width, h: r.height }));
  }, pontos);
  return page.evaluate(async ({ b64, coords }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return coords.map((p) => {
      const d = g.getImageData(Math.round(p.x * img.width / p.w), Math.round(p.y * img.height / p.h), 1, 1).data;
      return [d[0], d[1], d[2]];
    });
  }, { b64: buf.toString('base64'), coords });
};
const clara = (c) => c[0] > 240 && c[1] > 240 && c[2] > 240;

// Pontos de mundo: dentro da pegada do telhado (sul-oeste, longe das linhas de água e da cumeeira) e fora dele, à esquerda
// do beiral e na altura do centro (dentro da área visível com o enquadramento da casa).
const DENTRO = [1, 3];
const FORA = [-2.5, 7];

try {
  await rep.step('1 · Navegador: o grupo "Plantas de cobertura" lista os três níveis da casa', async () => {
    await page.evaluate(() => window.__hestia.editor.newProject('house-premium'));
    await page.waitForTimeout(600);
    const itens = await page.locator('[title^="Planta de cobertura do nível "]').count();
    rep.check('um item de cobertura por nível (3)', itens === 3, `${itens}`);
    const grupo = await page.getByRole('treeitem', { name: /Plantas de cobertura/ }).count();
    rep.check('grupo "Plantas de cobertura" no Navegador', grupo === 1, `${grupo}`);
    await shot('01-navegador.png');
  });

  await rep.step('2 · Abrir a cobertura do nível "Cobertura": aba própria, título e estado', async () => {
    await abrirCobertura('Cobertura');
    const s = await ui();
    rep.check('vista de planta de cobertura do lv_2', s.view === 'plan' && ehCobertura(s) && s.levelId === 'lv_2', JSON.stringify(s));
    rep.check('aba "Planta de cobertura: Cobertura" aberta', await page.getByRole('tab', { name: /Planta de cobertura: Cobertura/ }).count() === 1);
    const titulo = await page.locator('.tb-title').textContent();
    rep.check('título da janela "Planta de cobertura: Cobertura"', titulo.includes('Planta de cobertura: Cobertura'), titulo);
    const props = await page.locator('.rv-head').first().textContent();
    rep.check('propriedades mostram "Planta de cobertura"', props.includes('Planta de cobertura'), props);
    const telhados = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'roof').map((e) => `${e.id}@${e.levelId}`));
    rep.check('o telhado da casa está no nível lv_2 (R-01)', telhados.length === 1 && telhados[0] === 'R-01@lv_2', telhados.join(','));
    await enquadrarCasa();
    await page.waitForTimeout(500);
    await shot('02-cobertura-cobertura.png');
  });

  await rep.step('3 · Telhado completo e opaco: a casa aparece pintada (pixels de dentro e de fora do telhado)', async () => {
    const [dentro, fora] = await coresEm([DENTRO, FORA]);
    rep.check('dentro da pegada do telhado a cor não é o fundo', !clara(dentro), `rgb(${dentro})`);
    rep.check('fora do telhado é o fundo claro', clara(fora), `rgb(${fora})`);
  });

  await rep.step('4 · Trocar entre piso e cobertura do mesmo nível não deixa geometria velha', async () => {
    const pisoTerreo = page.getByRole('tab', { name: /^Térreo$/ });
    await pisoTerreo.click();
    await page.waitForTimeout(500);
    const s1 = await ui();
    rep.check('aba de piso do Térreo ativa', s1.view === 'plan' && ehPiso(s1) && s1.levelId === 'lv_0', JSON.stringify(s1));
    await shot('03-piso-terreo.png');
    await page.getByRole('tab', { name: /Planta de cobertura: Cobertura/ }).click();
    await page.waitForTimeout(500);
    await shot('04-volta-cobertura.png');
    const [dentro, fora] = await coresEm([DENTRO, FORA]);
    rep.check('voltar à cobertura: o telhado continua opaco', !clara(dentro) && clara(fora), `dentro rgb(${dentro}), fora rgb(${fora})`);
    const s2 = await ui();
    rep.check('voltar à cobertura: estado roof no lv_2', ehCobertura(s2) && s2.levelId === 'lv_2', JSON.stringify(s2));
  });

  await rep.step('5 · Pavimento 2: a cobertura do nível de baixo não tem telhado próprio (confere o que aparece em cada nível)', async () => {
    await abrirCobertura('Pavimento 2');
    const s = await ui();
    rep.check('aba de cobertura do lv_1 ativa', ehCobertura(s) && s.levelId === 'lv_1', JSON.stringify(s));
    const telhadoAqui = await page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'roof' && e.levelId === 'lv_1').length);
    rep.check('nenhum telhado no lv_1', telhadoAqui === 0, `${telhadoAqui}`);
    await shot('05-cobertura-pavimento2.png');
  });

  await rep.step('6 · Projeto: a aba não grava nada no modelo (só o estado de sessão)', async () => {
    const json = await page.evaluate(() => window.__hestia.editor.serialize());
    rep.check('o JSON do projeto não tem planKind nem openViews', !json.includes('planKind') && !json.includes('openViews'));
  });

  console.log('\nerros do navegador:', errors.length ? errors.join('\n') : 'nenhum');
  rep.check('sem erros no console', errors.length === 0, `${errors.length}`);
} catch (e) {
  console.log(`\nFALHA INESPERADA: ${e.stack ?? e.message}`);
  await page.screenshot({ path: path.join(OUT, 'erro-inesperado.png') }).catch(() => {});
  rep.summary();
  await browser.close();
  process.exit(1);
}

rep.summary();
const falhas = rep.steps.filter((s) => s.status === 'FAIL').length;
console.log(falhas ? `\nFALHOU: ${falhas} de ${rep.steps.length} passos (ver acima).` : `\nTodos os ${rep.steps.length} passos confirmados.`);
console.log(`Imagens em: ${path.resolve(OUT)}`);
await browser.close();
process.exit(falhas ? 1 : 0);
