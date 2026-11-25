// Circuitos elétricos (ficha C4), em Chrome real: Sistemas > Elétrico > Circuitos. Um quadro de distribuição e 3 pontos (tomada,
// interruptor, luminária) entram por comando do programa; o diálogo cria 2 circuitos, atribui a seleção, edita a potência, confere
// os totais por circuito e por quadro e a cor (no diálogo e na planta).
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5217/?debug=1' node tests/e2e/circuitos.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5217/?debug=1';
const OUT = process.env.SHOTS ?? 'test-results/circuitos';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const QUADRO = 'fam_quadro_distribuicao_eletrico';
const circuitos = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.circuitosEletricos ?? {}).map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, quadroId: c.quadroId, pontos: c.pontos.map((p) => `${p.componenteId}:${p.potenciaVA}`) })));
const selecionar = (ids) => page.evaluate((x) => window.__hestia.useUi.setState({ selection: x }), ids);
/** Decodifica um PNG de 8 bits (RGB/RGBA, sem entrelaçamento) e conta os pixels próximos de cada cor #rrggbb. */
function contaCores(png, cores) {
  let o = 8, w = 0, h = 0, canais = 4;
  const partes = [];
  while (o < png.length) {
    const n = png.readUInt32BE(o), tipo = png.toString('latin1', o + 4, o + 8);
    if (tipo === 'IHDR') { w = png.readUInt32BE(o + 8); h = png.readUInt32BE(o + 12); canais = png[o + 17] === 6 ? 4 : 3; }
    if (tipo === 'IDAT') partes.push(png.subarray(o + 8, o + 8 + n));
    o += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(partes));
  const stride = w * canais, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= canais ? px[y * stride + x - canais] : 0, b = y > 0 ? px[(y - 1) * stride + x] : 0, c = x >= canais && y > 0 ? px[(y - 1) * stride + x - canais] : 0;
      const pr = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
      px[y * stride + x] = (v + pr) & 255;
    }
  }
  const alvo = cores.map((hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16)));
  const out = cores.map(() => 0);
  for (let i = 0; i < px.length; i += canais) alvo.forEach((a, k) => { if (Math.abs(px[i] - a[0]) < 40 && Math.abs(px[i + 1] - a[1]) < 40 && Math.abs(px[i + 2] - a[2]) < 40) out[k]++; });
  return out;
}
const diag = () => page.locator('[role="dialog"]');

try {
  await rep.step('1. abre o app e insere o quadro e 3 pontos por comando do programa', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    const ok = await page.evaluate(({ QUADRO }) => {
      const { model, editor, useUi } = window.__hestia;
      const nivel = useUi.getState().levelId;
      for (const id of [QUADRO, 'fam_tomada', 'fam_interruptor', 'fam_luminaria_teto']) editor.store.exec({ type: 'upsertFamily', family: structuredClone(model.familiaDaBiblioteca(id)) });
      const mk = (id, fam, tipo, x, y, extra = {}) => ({ id, kind: 'component', familyId: fam, typeId: tipo, levelId: nivel, x, y, z: 0, rotation: 0, mirrored: false, mark: id, ...extra });
      const tp = (f) => model.familiaDaBiblioteca(f).tipos[0].id;
      editor.store.exec({ type: 'addComponent', component: mk('qd1', QUADRO, 'dn25', 1, 1) });
      editor.store.exec({ type: 'addComponent', component: mk('tom1', 'fam_tomada', tp('fam_tomada'), 3, 1) });
      editor.store.exec({ type: 'addComponent', component: mk('int1', 'fam_interruptor', tp('fam_interruptor'), 4, 1) });
      editor.store.exec({ type: 'addComponent', component: mk('lum1', 'fam_luminaria_teto', tp('fam_luminaria_teto'), 3, 3) });
      editor.setViewport({ ...editor.viewport(), cx: 2.5, cy: 2, zoom: 220 });
      return Object.values(editor.store.project.elements).filter((e) => e.kind === 'component').length;
    }, { QUADRO });
    rep.check('4 componentes no projeto', ok === 4, ok);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/01-planta-sem-circuitos.png` });
  });
  await rep.step('2. Sistemas > Elétrico tem o botão Circuitos e ele abre o diálogo', async () => {
    await page.locator('.ribbon-tabs .rtab:visible', { hasText: /^Sistemas$/ }).first().click();
    await page.screenshot({ path: `${OUT}/02-aba-sistemas.png` });
    await page.getByRole('button', { name: 'Circuitos', exact: true }).first().click();
    await page.waitForSelector('.circ-painel', { timeout: 15_000 });
    const txt = await diag().innerText();
    rep.check('diálogo "Circuitos elétricos"', /Circuitos elétricos/.test(txt), txt.slice(0, 60).replace(/\s+/g, ' '));
    const nomeQuadro = await page.locator('.circ-quadro input').first().inputValue();
    rep.check('lista o quadro QD 1 com 0 VA e orienta a criar circuito', nomeQuadro === 'QD 1' && /0 VA/.test(txt) && /Nenhum circuito/.test(txt), nomeQuadro);
    await page.screenshot({ path: `${OUT}/03-dialogo-vazio.png` });
  });
  await rep.step('3. cria 2 circuitos (nomes C1 e C2, cores diferentes, quadro único escolhido)', async () => {
    await page.getByRole('button', { name: 'Novo circuito', exact: true }).click();
    await page.getByRole('button', { name: 'Novo circuito', exact: true }).click();
    const cs = await circuitos();
    rep.check('2 circuitos C1 e C2', cs.length === 2 && cs[0].nome === 'C1' && cs[1].nome === 'C2', JSON.stringify(cs.map((c) => c.nome)));
    rep.check('cores diferentes', cs[0].cor !== cs[1].cor, `${cs[0].cor} ${cs[1].cor}`);
    rep.check('os dois no quadro qd1', cs.every((c) => c.quadroId === 'qd1'));
    await page.locator('select[aria-label="Quadro do circuito C1"]').selectOption('qd1');
    await page.screenshot({ path: `${OUT}/04-dois-circuitos.png` });
  });
  await rep.step('4. atribui: tomada + interruptor ao C1, luminária ao C2', async () => {
    await selecionar(['tom1', 'int1']);
    await page.waitForTimeout(200);
    const txt = await diag().innerText();
    rep.check('painel mostra 2 selecionados', /2 componente\(s\) selecionado\(s\)/.test(txt));
    await page.locator('[data-circuito]').nth(0).getByRole('button', { name: /Atribuir selecionados/ }).click();
    await selecionar(['lum1']);
    await page.waitForTimeout(200);
    await page.locator('[data-circuito]').nth(1).getByRole('button', { name: /Atribuir selecionados/ }).click();
    await page.waitForTimeout(200);
    const cs = await circuitos();
    rep.check('C1 tem tom1 e int1 (100 VA cada)', cs[0].pontos.join() === 'tom1:100,int1:100', cs[0].pontos.join());
    rep.check('C2 tem lum1 (100 VA)', cs[1].pontos.join() === 'lum1:100', cs[1].pontos.join());
    await page.screenshot({ path: `${OUT}/05-atribuido.png` });
  });
  await rep.step('5. define a potência por ponto e confere totais por circuito e por quadro', async () => {
    const campo = (id) => page.locator(`[data-ponto="${id}"] input`).first();
    for (const [id, va] of [['tom1', '600'], ['int1', '0'], ['lum1', '120']]) {
      await campo(id).fill(va);
      await campo(id).press('Enter');
      await page.waitForTimeout(150);
    }
    const tot = await page.evaluate(() => ({
      c: [...document.querySelectorAll('[data-total-circuito]')].map((e) => e.textContent.trim()),
      q: [...document.querySelectorAll('[data-total-quadro]')].map((e) => e.textContent.trim()),
    }));
    rep.check('totais por circuito 600 VA e 120 VA', tot.c.join('|') === '600 VA|120 VA', tot.c.join('|'));
    rep.check('total do quadro 720 VA', tot.q.join('|') === '720 VA', tot.q.join('|'));
    await page.screenshot({ path: `${OUT}/06-totais.png` });
  });
  await rep.step('6. cor: cada circuito mostra a sua cor, e a planta pinta os componentes', async () => {
    const cs = await circuitos();
    const cores = await page.locator('.circ-cor').evaluateAll((els) => els.map((e) => e.value));
    rep.check('seletor de cor de cada cartão = cor guardada', cores.join() === cs.map((c) => c.cor).join(), cores.join());
    await page.getByRole('button', { name: /^Fechar$|^Close$/ }).first().click().catch(() => {});
    await page.keyboard.press('Escape');
    await selecionar([]);
    // A planta padrão é de Arquitetura (os componentes elétricos aparecem só em meio-tom): passa a planta do nível para Elétrico.
    await page.evaluate(() => { const { editor, useUi } = window.__hestia; editor.store.exec({ type: 'setLevelDiscipline', levelId: useUi.getState().levelId, discipline: 'eletrico' }); });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/07-planta-com-cores.png` });
    // O canvas é WebGL (não dá para ler pelo 2D): conta os pixels da cor de cada circuito na própria captura de tela.
    const cont = contaCores(await page.screenshot(), cs.map((c) => c.cor));
    console.log('  info  pixels por cor na planta:', JSON.stringify(cont));
    rep.check('a cor de cada circuito aparece na planta', cont.every((n) => n > 20), JSON.stringify(cont));
  });
  await rep.step('7. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 200));
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
