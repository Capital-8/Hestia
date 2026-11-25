// Conferência linha a linha dos catálogos de tubos e conexões (ficha P3, fase 2), em Chrome real:
//   abre o diálogo; no fabricante (Krona esgoto), confere 2 linhas do tubo de 6 m e vê "2 de 5"; recarrega a página e vê que a
//   conferência persistiu (e que o nome de quem confere ficou na sessão); confere as 3 restantes e vê o item conferido. Em
//   "Meus catálogos", importa um CSV de 2 linhas, confere as duas e edita uma célula: a conferência da linha editada volta.
// Uso: APP='http://127.0.0.1:5213/?debug=1' node tests/e2e/familias-conferencia.mjs  (suba `vite --port 5213 --host 127.0.0.1` em apps/web)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5213/?debug=1';
const EXE = chromeExecutable();
if (!EXE) { console.error('PENDENTE: Chrome não encontrado (defina CHROME_PATH)'); process.exit(2); }
const OUT = process.env.SHOTS ?? 'test-results/familias-conferencia';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexto.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const http4xx = [];
page.on('response', (r) => { if (r.status() >= 400) http4xx.push(`${r.status()} ${r.url().slice(0, 100)}`); });
const rep = makeReporter();
const DLG = '[aria-label="Catálogos de tubos e conexões"]';
const caixa = (rotulo) => page.locator(`${DLG} input[aria-label="${rotulo}"]`);
const texto = () => page.locator(DLG).innerText();

async function abrirDialogo() {
  await page.goto(APP);
  await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
  await page.getByRole('button', { name: /Novo projeto/ }).first().click();
  await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
  await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
  await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: /Catálogo MEP/ }).first().click();
  await page.waitForSelector(DLG, { timeout: 15_000 });
}

try {
  await rep.step('1. abre o diálogo e vê o fabricante com 0 de 5 linhas conferidas', async () => {
    await abrirDialogo();
    const t = await texto();
    rep.check('progresso inicial 0 de 5', t.includes('0 de 5 linhas conferidas'), t.match(/\d+ de \d+ linhas conferidas/)?.[0] ?? '');
    rep.check('caixa "Conferida 100" existe no fabricante', (await page.locator(`${DLG} input[aria-label="Conferida 100"]`).count()) === 1);
    rep.check('link do PDF na página 10', (await page.locator(`${DLG} a[href$="#page=10"]`).count()) === 1);
    await page.screenshot({ path: `${OUT}/01-fabricante-0de5.png` });
  });

  await rep.step('2. "Marcar todas" pede confirmação na própria página e Cancelar não marca nada', async () => {
    await caixa('Conferido por').fill('Fulana');
    await page.getByRole('button', { name: 'Marcar todas as linhas' }).click();
    rep.check('bloco de confirmação aparece', (await page.locator(`${DLG} [aria-label="Confirmar conferência de todas as linhas"]`).count()) === 1);
    await page.locator(`${DLG} [role="group"][aria-label="Confirmar conferência de todas as linhas"] button`, { hasText: 'Cancelar' }).click();
    rep.check('cancelar fecha a confirmação sem marcar', (await page.locator(`${DLG} [aria-label="Confirmar conferência de todas as linhas"]`).count()) === 0 && (await texto()).includes('0 de 5 linhas conferidas'));
  });

  await rep.step('3. confere 2 linhas do tubo da Krona esgoto e vê "2 de 5"', async () => {
    await page.locator(`${DLG} input[aria-label="Conferida 50"]`).check();
    await page.locator(`${DLG} input[aria-label="Conferida 75"]`).check();
    const t = await texto();
    rep.check('progresso 2 de 5', t.includes('2 de 5 linhas conferidas'), t.match(/\d+ de \d+ linhas conferidas/)?.[0] ?? '');
    rep.check('item continua CONFERIR com 2 linhas', t.includes('CONFERIR') && !t.includes('conferido por'));
    rep.check('caixas marcadas', await page.locator(`${DLG} input[aria-label="Conferida 50"]`).isChecked() && await page.locator(`${DLG} input[aria-label="Conferida 75"]`).isChecked());
  });

  await rep.step('4. recarrega a página: a conferência persiste e o nome fica na sessão', async () => {
    const guardado = await page.evaluate(() => window.localStorage.getItem('hestia.catalogoMep.conferencias') ?? '');
    rep.check('localStorage tem a conferência do item', guardado.includes('tubo_de_pvc_esgoto_primario_6m') && guardado.includes('"50"') && guardado.includes('"75"'));
    await page.reload();
    await abrirDialogo();
    const t = await texto();
    rep.check('após recarregar: 2 de 5 linhas conferidas', t.includes('2 de 5 linhas conferidas'), t.match(/\d+ de \d+ linhas conferidas/)?.[0] ?? '');
    rep.check('caixa 50 continua marcada após recarregar', await page.locator(`${DLG} input[aria-label="Conferida 50"]`).isChecked());
    rep.check('nome de quem confere lembrado na sessão', (await caixa('Conferido por').inputValue()) === 'Fulana');
    await page.screenshot({ path: `${OUT}/02-apos-recarregar-2de5.png` });
  });

  await rep.step('5. exporta as conferências em JSON', async () => {
    const [baixa] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), page.getByRole('button', { name: 'Exportar conferências' }).click()]);
    rep.check('arquivo conferencias-catalogo_krona_esgoto.json', baixa.suggestedFilename() === 'conferencias-catalogo_krona_esgoto.json', baixa.suggestedFilename());
  });

  await rep.step('6. confere as 3 restantes e vê o item conferido por Fulana', async () => {
    for (const b of ['100', '150', '200']) await page.locator(`${DLG} input[aria-label="Conferida ${b}"]`).check();
    const t = await texto();
    rep.check('progresso 5 de 5', t.includes('5 de 5 linhas conferidas'), t.match(/\d+ de \d+ linhas conferidas/)?.[0] ?? '');
    rep.check('selo conferido e "conferido por Fulana em AAAA-MM-DD"', /conferido por Fulana em \d{4}-\d{2}-\d{2}/.test(t));
    await page.screenshot({ path: `${OUT}/03-fabricante-5de5.png` });
  });

  await rep.step('7. Meus catálogos: importa 2 linhas, confere as duas e edita uma célula', async () => {
    await page.locator(`${DLG} button[role="tab"]`, { hasText: 'Meus catálogos' }).click();
    await page.getByRole('button', { name: 'Importar CSV…' }).click();
    await page.locator(`${DLG} textarea[aria-label="CSV"]`).fill('bitola;codigo;B;Db;De;e\n25;1;18;25;25;1.7\n32;2;22;32;32;2.1');
    await page.getByRole('button', { name: 'Criar item' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Importado: 2 linha'), null, { timeout: 10_000 });
    await page.locator(`${DLG} input[aria-label="Conferida 25"]`).check();
    await page.locator(`${DLG} input[aria-label="Conferida 32"]`).check();
    let t = await texto();
    rep.check('item próprio conferido: 2 de 2 e selo conferido', t.includes('2 de 2 linhas conferidas') && /conferido por Fulana em/.test(t));
    await page.locator(`${DLG} input[aria-label="25 B"]`).fill('19');
    await page.locator(`${DLG} input[aria-label="25 B"]`).press('Tab');
    await page.waitForFunction(() => !document.querySelector('[aria-label="Conferida 25"]')?.checked, null, { timeout: 5_000 }).catch(() => undefined);
    t = await texto();
    rep.check('editar a célula apaga a conferência da linha 25', !(await page.locator(`${DLG} input[aria-label="Conferida 25"]`).isChecked()));
    rep.check('a outra linha (32) continua conferida: 1 de 2', t.includes('1 de 2 linhas conferidas'), t.match(/\d+ de \d+ linhas conferidas/)?.[0] ?? '');
    rep.check('item volta para CONFERIR', t.includes('CONFERIR') && !/conferido por Fulana em/.test(t));
    await page.screenshot({ path: `${OUT}/04-meus-editado.png` });
  });

  await rep.step('8. sem erro de console', async () => {
    const reais = erros.filter((e) => !/status of 404/.test(e));
    rep.check('sem erro de console (o 404 do favicon do servidor de desenvolvimento é ignorado)', reais.length === 0, `${reais.slice(0, 3).join(' | ').slice(0, 160)} ${http4xx.slice(0, 3).join(' ; ')}`);
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
