// Colar alinhado aos níveis selecionados: diálogo, prévia no 3D (fantasmas), V confirma e um undo desfaz.
import { mkdirSync } from 'node:fs';
import { launch, makeReporter, openApp } from './helpers.mjs';

const OUT = process.env.SHOTS ?? 'test-results/shots';
mkdirSync(OUT, { recursive: true });

const browser = await launch();
const { page, errors } = await openApp(browser, { query: '?gl=1&debug=1', width: 1440, height: 860 });
const r = makeReporter();

const wallsByLevel = () => page.evaluate(() => {
  const p = window.__hestia.editor.store.project;
  const out = {};
  for (const e of Object.values(p.elements)) if (e.kind === 'wall') out[e.levelId] = (out[e.levelId] ?? 0) + 1;
  return out;
});

await r.step('preparar: casa de exemplo + 3º nível + parede selecionada', async () => {
  await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    editor.newProject('house2');
    const p = editor.store.project;
    const base = p.levels[1] ?? p.levels[0];
    editor.store.exec({
      type: 'upsertLevel',
      level: { ...structuredClone(base), id: 'lv_2', name: 'Pavimento 3', elevation: base.elevation + 3 },
    });
    const wall = Object.values(editor.store.project.elements).find((e) => e.kind === 'wall' && e.levelId === editor.store.project.levels[0].id);
    window.__e2e = { wallId: wall.id, origem: wall.levelId };
    useUi.setState({ view: 'plan', planViewId: 'pv_' + wall.levelId, levelId: wall.levelId, sectionId: null, selection: [wall.id], tool: 'select', dialog: null, dialogArg: null, pastePreview: null });
    editor.copySelection();
  });
  r.check('nível de origem', await page.evaluate(() => window.__e2e.origem === 'lv_0'), await page.evaluate(() => window.__e2e.origem));
});

await r.step('seta do Colar → diálogo "Selecionar níveis"', async () => {
  await page.locator('.rb-split .rb-bottom:visible').first().click();
  const menu = await page.locator('.rb-menu:visible').innerText();
  r.check('menu tem "Alinhado aos níveis selecionados"', menu.includes('Alinhado aos níveis selecionados'), menu.replace(/\n/g, ' | '));
  const tMenu = Date.now();
  await page.locator('.rb-menuitem:visible', { hasText: 'Alinhado aos níveis selecionados' }).click();
  const tMenuClick = Date.now();
  await page.waitForSelector('text=Selecionar níveis');
  console.log(`tempos: clique no menu ${tMenuClick - tMenu} ms; diálogo visível ${Date.now() - tMenuClick} ms`);
  const aberto = await page.evaluate(() => window.__hestia.useUi.getState().dialog === 'selectLevels');
  r.check('diálogo aberto', aberto);
  r.check('origem desabilitada', await page.locator('#paste-level-lv_0').isDisabled());
  await page.locator('#paste-level-lv_1').check();
  await page.locator('#paste-level-lv_2').check();
  r.check('resumo com 2 níveis', (await page.locator('.dfoot').innerText()).includes('2 níveis'), await page.locator('.dfoot').innerText());
  await page.screenshot({ path: `${OUT}/60-dialogo-niveis.png` });
});

await r.step('Pré-visualizar → 3D com fantasmas e aba Modificar | Colar alinhado', async () => {
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  const tClick = Date.now();
  await page.waitForFunction(() => window.__hestia.useUi.getState().pastePreview !== null && window.__hestia.useUi.getState().view === '3d');
  const t1 = Date.now();
  const medidas = await page.evaluate(() => performance.getEntriesByType('measure').filter((e) => e.name.startsWith('colar-')).map((e) => ({ nome: e.name, ms: Math.round(e.duration) })));
  console.log(`tempos: clique ${tClick - t0} ms; estado da prévia ${t1 - tClick} ms; medidas ${JSON.stringify(medidas)}`);
  await page.waitForFunction(() => {
    const m = window.__hestia3dMontagem;
    const p = window.__hestia.editor.store.project;
    return m && m.montados >= p.levels.length;
  }, null, { timeout: 30000 });
  const t2 = Date.now();
  console.log(`tempos: total até a prévia ${t2 - t0} ms; montagem completa ${t2 - t1} ms`);
  r.check('prévia e montagem completas em menos de 2 s', t2 - t0 < 2000, `${t2 - t0} ms`);
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => window.__hestia.useUi.getState());
  r.check('vista 3D', st.view === '3d');
  r.check('2 níveis de destino', st.pastePreview.levelIds.length === 2, st.pastePreview.levelIds.join(','));
  r.check('aba de prévia na faixa', await page.evaluate(() => document.body.innerText.includes('Colar alinhado')));
  r.check('botões V/X presentes', (await page.locator('.rb-panel[aria-label="Modo"]:visible button').count()) === 2);
  await page.screenshot({ path: `${OUT}/61-previa-3d.png` });
});

await r.step('V confirma numa transação e mantém o resultado', async () => {
  const antes = await wallsByLevel();
  await page.evaluate((a) => { window.__e2e.antes = a; }, antes);
  await page.locator('.rb-panel[aria-label="Modo"]:visible button[aria-label="Colar"]').first().click();
  await page.waitForFunction(() => window.__hestia.useUi.getState().pastePreview === null);
  const depois = await wallsByLevel();
  r.check('parede copiada para lv_1', (depois.lv_1 ?? 0) === (antes.lv_1 ?? 0) + 1, `${antes.lv_1} → ${depois.lv_1}`);
  r.check('parede copiada para lv_2', (depois.lv_2 ?? 0) === 1, `${depois.lv_2}`);
  r.check('status de colagem', (await page.evaluate(() => window.__hestia.useUi.getState().status)).includes('2 nível'), await page.evaluate(() => window.__hestia.useUi.getState().status));
  await page.screenshot({ path: `${OUT}/62-depois-de-colar.png` });
});

await r.step('um undo desfaz as duas cópias', async () => {
  await page.evaluate(() => window.__hestia.editor.undo());
  const depois = await wallsByLevel();
  const antes = await page.evaluate(() => window.__e2e.antes);
  r.check('lv_2 volta ao original', (depois.lv_2 ?? 0) === (antes.lv_2 ?? 0), `${antes.lv_2} → ${depois.lv_2}`);
  r.check('lv_1 volta ao original', (depois.lv_1 ?? 0) === (antes.lv_1 ?? 0), `${antes.lv_1} → ${depois.lv_1}`);
});

await r.step('X cancela e volta para a planta de origem', async () => {
  await page.evaluate(() => {
    const { editor, useUi } = window.__hestia;
    useUi.setState({ view: 'plan', planViewId: 'pv_lv_0', levelId: 'lv_0', selection: [window.__e2e.wallId], dialog: null, dialogArg: null, pastePreview: null });
    editor.copySelection();
    editor.openPasteLevelsDialog();
  });
  await page.waitForSelector('text=Selecionar níveis');
  const totalAntes = Object.values(await wallsByLevel()).reduce((a, b) => a + b, 0);
  await page.locator('#paste-level-lv_1').check();
  await page.locator('#paste-level-lv_2').check();
  const t3 = Date.now();
  await page.getByRole('button', { name: 'Pré-visualizar' }).click();
  await page.waitForFunction(() => window.__hestia.useUi.getState().pastePreview !== null);
  console.log(`tempos: segunda prévia (3D já montado) ${Date.now() - t3} ms`);
  await page.locator('.rb-panel[aria-label="Modo"]:visible button[aria-label="Cancelar"]').first().click();
  await page.waitForFunction(() => window.__hestia.useUi.getState().pastePreview === null);
  const st = await page.evaluate(() => window.__hestia.useUi.getState());
  r.check('voltou para a planta', st.view === 'plan');
  r.check('nível de origem', st.levelId === 'lv_0');
  r.check('modelo intacto', Object.values(await wallsByLevel()).reduce((a, b) => a + b, 0) === totalAntes);
});

r.summary();
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
process.exit(r.steps.some((s) => s.status !== 'PASS') ? 1 : 0);
