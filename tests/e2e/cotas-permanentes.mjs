// Cota permanente na planta (feat/cotas, frentes H/I): selecionada não duplica o desenho; a alça de ponta troca a
// referência (gravada em Dimension.refs e desfeita com Ctrl+Z); o valor digitado move a esquadria.
//   npm run build -w @hestia/web && CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe' node tests/e2e/cotas-permanentes.mjs
import { mkdirSync } from 'node:fs';
import { clickWorld, launch, makeReporter, openApp } from './helpers.mjs';

const OUT = process.env.SHOTS ?? 'test-results/shots';
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const { page, errors } = await openApp(browser, { query: '?debug=1', width: 1440, height: 860 });
const r = makeReporter();

const DIM = 'dm_teste';
const preparar = () => page.evaluate((dimId) => {
  const { editor, useUi } = window.__hestia;
  const m = window.__hestia.model;
  editor.load(m.createEmptyProject('Cotas permanentes'), 'cotas-permanentes.hestia.json');
  editor.store.exec({ type: 'addWall', wall: m.makeWall({ id: 'h', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  editor.store.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'h', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  // Segunda parede paralela, 3 m acima: alvo da troca de referência (parede por parede).
  editor.store.exec({ type: 'addWall', wall: m.makeWall({ id: 'p2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }) });
  editor.store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: dimId, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.5, refs: { a: { elementId: 'h', feature: 'wall-axis-a' }, b: { elementId: 'd1', feature: 'opening-center' } } } });
  useUi.setState({ selection: [dimId], status: '' });
}, DIM);

const estado = () => page.evaluate((dimId) => {
  const { editor } = window.__hestia;
  const d = window.__hestia.model.levelDimensions(editor.project, 'lv_0').find((x) => x.id === dimId);
  return { refsA: d?.refs?.a ?? null, door: editor.project.elements.d1?.offset, count: window.__hestia.model.levelDimensions(editor.project, 'lv_0').length };
}, DIM);

const desenhoOculto = () => page.evaluate(() => {
  // Os grupos de desenho das cotas dinâmicas recebem opacity 0 quando a cota permanente está selecionada.
  const grupos = [...document.querySelectorAll('svg g[stroke]')];
  return grupos.length > 0 && grupos.every((g) => g.getAttribute('opacity') === '0');
});

const campos = () => page.evaluate(() => document.querySelectorAll('input[aria-label^="Cota:"]').length);
const alcas = () => page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Referência:"]')].map((b) => b.getAttribute('aria-label')));

await r.step('(1) cota permanente selecionada: sem desenho duplicado e com alças de ponta', async () => {
  await preparar();
  await page.waitForTimeout(600);
  const c = await campos();
  r.check('há um campo de valor para a cota selecionada', c >= 1, String(c));
  r.check('o desenho dinâmico está oculto (sem texto duplicado)', await desenhoOculto());
  const a = await alcas();
  r.check('as pontas ligadas a elementos têm alça de referência', a.length === 2, a.join(' | '));
  const conv = await page.locator('button[aria-label="Converter em cotas permanentes"]').count();
  r.check('cota já permanente não mostra o botão "I"', conv === 0, String(conv));
  await page.screenshot({ path: `${OUT}/cp-01-selecionada.png` });
});

await r.step('(2) clicar na alça troca a referência da ponta e grava em Dimension.refs', async () => {
  const antes = await estado();
  await page.locator('button[aria-label^="Referência:"]').first().click();
  await page.waitForTimeout(300);
  const depois = await estado();
  r.check('refs.a mudou da feição original', depois.refsA && depois.refsA.feature !== antes.refsA.feature, `${antes.refsA?.feature} -> ${depois.refsA?.feature}`);
  r.check('a cota continua existindo (não duplicou)', depois.count === antes.count, `${antes.count} -> ${depois.count}`);
  await page.screenshot({ path: `${OUT}/cp-02-troca.png` });
});

await r.step('(3) Ctrl+Z desfaz a troca de referência', async () => {
  const antes = await estado();
  await page.evaluate(() => window.__hestia.editor.store.undo());
  await page.waitForTimeout(200);
  const depois = await estado();
  r.check('refs.a voltou à feição original', depois.refsA?.feature === 'wall-axis-a', `${antes.refsA?.feature} -> ${depois.refsA?.feature}`);
});

await r.step('(4) digitar o valor move a esquadria (porta)', async () => {
  // Valor atual 3 m (eixo da parede até o centro da porta). Digitar 2 m deve puxar a porta para o offset 2.
  const campo = page.locator('input[aria-label^="Cota:"]').first();
  await campo.click();
  await campo.selectText?.();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const e = await estado();
  r.check('porta foi para o offset 2', Math.abs((e.door ?? -1) - 2) < 0.01, String(e.door));
  await page.screenshot({ path: `${OUT}/cp-04-valor.png` });
});

await r.step('(5) Ctrl+Z desfaz a edição de valor', async () => {
  await page.evaluate(() => window.__hestia.editor.store.undo());
  await page.waitForTimeout(200);
  const e = await estado();
  r.check('porta voltou ao offset 3', Math.abs((e.door ?? -1) - 3) < 0.01, String(e.door));
});

await r.step('(6) Shift+clique na alça e um clique em outra parede troca a referência para essa parede', async () => {
  await preparar();
  await page.waitForTimeout(600);
  const antes = await estado();
  await page.locator('button[aria-label^="Referência:"]').first().click({ modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  const modo = await page.evaluate(() => window.__hestia.useUi.getState().dimRefPick);
  r.check('Shift+clique entra no modo de escolha da ponta a', modo?.slot === 'a', JSON.stringify(modo));
  await clickWorld(page, 0, 3); // ponto da parede p2
  await page.waitForTimeout(300);
  const depois = await estado();
  r.check('refs.a passou a apontar para a parede p2', depois.refsA?.elementId === 'p2', `${antes.refsA?.elementId} -> ${depois.refsA?.elementId}`);
  const aindaModo = await page.evaluate(() => window.__hestia.useUi.getState().dimRefPick);
  r.check('modo de escolha encerrado após o clique', aindaModo === null);
  await page.screenshot({ path: `${OUT}/cp-06-outra-parede.png` });
});


await r.step('(7) "Editar família…" abre o editor de famílias com a família desta cota', async () => {
  await preparar();
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'Editar família' }).first().click();
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => { const u = window.__hestia.useUi.getState(); return { dialog: u.dialog, focus: u.dimFamilyFocus }; });
  r.check('o diálogo de famílias abriu', st.dialog === 'dimensionFamilies', JSON.stringify(st));
  r.check('o pedido de foco da família foi consumido pelo diálogo', st.focus === null, String(st.focus));
  await page.screenshot({ path: `${OUT}/cp-07-familia.png` });
  await page.evaluate(() => window.__hestia.useUi.setState({ dialog: null }));
});

r.summary();
r.check('sem erros no console do navegador', errors.length === 0, errors.slice(0, 3).join(' | '));
if (errors.length) console.log('Erros do navegador:\n' + errors.join('\n'));
await browser.close();
process.exit(r.steps.some((s) => s.status === 'FAIL') || errors.length ? 1 : 0);
