// Estilo de prancha técnica ponta a ponta na interface real: hachura em mm de papel na cena da tela (WebGL por software,
// SwiftShader), janela Conjuntos de penas (embutidos e do usuário) e seletor de hachura com miniaturas.
// Gera imagens em $SHOTS para inspeção.
//   npm run build && CHROME_PATH=/usr/bin/google-chrome SHOTS=<pasta> node tests/e2e/estilo-prancha.mjs
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CHROME_ARGS, chromeExecutable, distUrl, makeReporter } from './helpers.mjs';

const OUT = process.env.SHOTS ?? 'test-results/estilo-prancha';
mkdirSync(OUT, { recursive: true });
const FIXTURE = path.resolve('packages/engine/src/fixtures/casa-2-quartos.hestia.json');

const rep = makeReporter();
// O build serve o `geom_wasm.wasm` como arquivo separado: por file:// o Chrome só o carrega com esta flag.
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: [...CHROME_ARGS, '--allow-file-access-from-files'] });
// O app abre na tela de Projetos: "Novo projeto" entra no editor (depois o arquivo da fixture é aberto por #file-open).
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(`${distUrl()}?debug=1`);
await page.waitForFunction(() => window.__hestia);
await page.getByText('Novo projeto').first().click();
await page.waitForSelector('.canvas-wrap canvas');
await page.waitForTimeout(500);
const shotCanvas = (name) => page.locator('.canvas-wrap').screenshot({ path: path.join(OUT, name) });
const shotPage = (name) => page.screenshot({ path: path.join(OUT, name) });
const lvl = () => page.evaluate(() => window.__hestia.editor.project.levels.find((l) => l.id === 'lv_0').graphics ?? null);
const fixPlanView = (zoom = 70) => page.evaluate((z) => {
  const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
  window.__hestia.editor.setViewport({ cx: 5, cy: 3.5, zoom: z, width: Math.round(r.width), height: Math.round(r.height) });
}, zoom);

try {
  await rep.step('1 · Planta atual', async () => {
    await page.setInputFiles('#file-open', FIXTURE);
    await page.waitForFunction(() => window.__hestia.editor.fileName === 'casa-2-quartos.hestia.json');
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: /Térreo/ }).click();
    await page.waitForTimeout(250);
    await fixPlanView();
    await page.waitForTimeout(300);
    // O grupo "Gráficos da vista" das propriedades começa recolhido: abre se preciso.
    if (!(await page.locator('#lg-scale').isVisible())) {
      await page.getByText('Gráficos da vista', { exact: true }).first().click();
      await page.waitForTimeout(300);
    }
    await shotPage('00-propriedades-graficos.png');
    rep.check('grupo de gráficos aberto com a escala da planta', await page.locator('#lg-scale').isVisible());
    await shotCanvas('01-planta-atual.png');
  });

  await rep.step('2 · Escala 1:50', async () => {
    await page.locator('#lg-scale').selectOption('50');
    await page.waitForTimeout(500);
    const g = await lvl();
    rep.check('gravou a escala 50 e as linhas finas continuam ligadas (padrão)', g?.scale === 50 && g?.thinLines !== false, JSON.stringify({ s: g?.scale, t: g?.thinLines }));
    await shotCanvas('02-planta-prancha-1-50.png');
    await page.locator('#lg-scale').selectOption('100');
    await page.waitForTimeout(400);
    await shotCanvas('03-planta-prancha-1-100.png');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
  });

  await rep.step('3 · Janela Conjuntos de penas (menu Gerenciar, ícone de pena)', async () => {
    await page.locator('.rtab:visible', { hasText: 'Gerenciar' }).click();
    await page.waitForTimeout(300);
    await shotPage('03a-aba-gerenciar.png');
    // Os itens pequenos do Gerenciar só mostram o ícone: acha pela dica/título.
    const item = page.locator('button[aria-label="Conjuntos de penas"]:visible').first();
    rep.check('item "Conjuntos de penas" no Gerenciar', await item.isVisible());
    await item.click();
    await page.waitForTimeout(400);
    rep.check('janela aberta com os 3 conjuntos', (await page.getByText('Padrão do Hestia').count()) >= 1 && (await page.getByText('Executivo, linhas fortes').count()) >= 1 && (await page.getByText('Prancha técnica (CAD)').count()) === 0);
    await shotPage('04-conjuntos-de-penas.png');
    // aplica "Executivo, linhas fortes": grava os pesos no projeto
    const cartao = page.locator('div', { has: page.getByText('Executivo, linhas fortes', { exact: true }) }).last();
    await cartao.getByRole('button', { name: 'Aplicar' }).first().click();
    await page.waitForTimeout(400);
    const pesos = await page.evaluate(() => window.__hestia.editor.project.graphics?.categories?.wall ?? null);
    rep.check('aplicar "Executivo, linhas fortes" gravou os pesos', pesos?.cutWeight === 6, JSON.stringify(pesos));
    // salva o ajuste como conjunto do usuário
    await page.getByPlaceholder('Nome do conjunto').fill('Meu conjunto de teste');
    await page.getByRole('button', { name: 'Salvar ajuste atual como conjunto' }).click();
    await page.waitForTimeout(400);
    const ps = await page.evaluate(() => window.__hestia.editor.project.penSets ?? null);
    rep.check('conjunto do usuário gravado no projeto', ps && Object.values(ps).some((s) => s.name === 'Meu conjunto de teste'), JSON.stringify(ps)?.slice(0, 120));
    rep.check('"Meus conjuntos" mostra o nome', (await page.getByText('Meu conjunto de teste').count()) >= 1);
    await shotPage('05-meus-conjuntos.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.getByRole('tab', { name: /Térreo/ }).click();
    await page.waitForTimeout(300);
    await fixPlanView();
    await page.waitForTimeout(400);
    await shotCanvas('06-planta-apos-aplicar-prancha.png');
  });

  await rep.step('4 · Seletor de hachura com miniaturas (Materiais > Gráficos)', async () => {
    await page.locator('.rtab:visible', { hasText: 'Gerenciar' }).click();
    await page.waitForTimeout(300);
    await shotPage('04a-aba-gerenciar.png');
    await page.getByRole('button', { name: /^Materiais$/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('tab', { name: /Gráficos/ }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    const radios = await page.locator('[role="radiogroup"] [role="radio"]').count();
    rep.check('grade com os 21 padrões (ou 42, corte e superfície)', radios >= 21, radios);
    await shotPage('07-materiais-hachuras.png');
  });

  rep.check('sem erros no console do navegador', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 300));
} finally {
  await browser.close();
}
rep.summary();
