// Catálogos de tubos e conexões no editor de famílias (ficha P3), em Chrome real:
//   abre o diálogo pela faixa; vê o catálogo da Krona (somente leitura); copia um item para "Meus catálogos"; importa um CSV
//   próprio; cria uma família a partir dele e confere ligações com encaixe e a família no editor. Lista erros de console.
// Uso: APP='http://127.0.0.1:5210/?debug=1' node tests/e2e/familias-catalogo-mep.mjs  (suba `vite --port 5210` em apps/web)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5210/?debug=1';
const EXE = chromeExecutable();
if (!EXE) { console.error('PENDENTE: Chrome não encontrado (defina CHROME_PATH)'); process.exit(2); }
const OUT = process.env.SHOTS ?? 'test-results/familias-catalogo-mep';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const DLG = '[aria-label="Catálogos de tubos e conexões"]';
const http4xx = [];
page.on('response', (r) => { if (r.status() >= 400) http4xx.push(`${r.status()} ${r.url().slice(0, 100)}`); });
const familia = () => page.evaluate(() => window.__hestia.useFamilia.getState().familia());

try {
  await rep.step('1. abre o app e o editor de famílias', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    rep.check('editor aberto', true);
  });

  await rep.step('2. botão Catálogo MEP abre o diálogo com o catálogo da Krona', async () => {
    const botao = page.getByRole('button', { name: /Catálogo MEP/ }).first();
    rep.check('botão Catálogo MEP visível', await botao.isVisible().catch(() => false));
    await botao.click();
    await page.waitForSelector('[aria-label="Catálogos de tubos e conexões"]', { timeout: 15_000 });
    const t = await page.locator('[aria-label="Tabela do item"]').innerText();
    rep.check('tabela do tubo da Krona com De 101.6', t.includes('101.6') && t.includes('0103'), t.slice(0, 60).replace(/\s+/g, ' '));
    rep.check('somente leitura (sem campo de célula)', (await page.locator('[aria-label="100 B"]').count()) === 0);
    await page.screenshot({ path: `${OUT}/01-krona.png` });
  });

  await rep.step('3. copia um item para Meus catálogos e vê as células editáveis', async () => {
    await page.locator(`${DLG} select[aria-label="Item do catálogo"]`).selectOption('joelho_90_esgoto_primario');
    await page.getByRole('button', { name: 'Copiar para Meus catálogos' }).click();
    await page.waitForSelector('[aria-label="100 B"]', { timeout: 10_000 });
    rep.check('células editáveis em Meus catálogos', true);
    await page.locator(`${DLG} select[aria-label="Receita de geometria"]`).selectOption('joelho90');
    await page.getByRole('button', { name: 'Criar família' }).click();
    const aviso = await page.locator('.fam-cat-erro').first().innerText();
    rep.check('criar sem a coluna e recusa com o nome dela', /Faltam as colunas: e/.test(aviso), aviso.slice(0, 80));
  });

  await rep.step('4. importa um CSV próprio e cria a família (água fria)', async () => {
    await page.getByRole('button', { name: 'Importar CSV…' }).click();
    await page.locator(`${DLG} textarea[aria-label="CSV"]`).fill('bitola;codigo;B;Z;Db;De;e\n25;1;18;14.4;25;25;1.7\n32;2;22;18;32;32;2.1');
    await page.getByRole('button', { name: 'Criar item' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Importado: 2 linha'), null, { timeout: 10_000 });
    rep.check('item importado e marcado CONFERIR', (await page.locator('.fam-cat-aviso').allInnerTexts()).some((x) => x.includes('CONFERIR')));
    await page.locator(`${DLG} select[aria-label="Receita de geometria"]`).selectOption('joelho90');
    await page.locator(`${DLG} select[aria-label="Domínio"]`).selectOption('agua_fria');
    await page.getByRole('button', { name: 'Criar família' }).click();
    await page.waitForFunction(() => window.__hestia.useFamilia.getState().dialogo === null, null, { timeout: 15_000 });
    const f = await familia();
    rep.check('família criada e em edição', f.id.startsWith('fam_usuario_') && f.categoria === 'conexao_tubo', `${f.id} / ${f.nome}`);
    rep.check('tipos por bitola do CSV', f.tipos.map((t) => t.id).join(',') === 'dn25,dn32');
    rep.check('ligações de água fria com encaixe bolsa', f.ligacoes.every((l) => l.dominio === 'agua_fria' && l.encaixe?.tipo === 'bolsa'));
    rep.check('descrição cita catálogo próprio e CONFERIR', /catálogo próprio/.test(f.descricao) && /CONFERIR/.test(f.descricao));
    await page.screenshot({ path: `${OUT}/02-familia-criada.png` });
  });

  await rep.step('5. a família criada resolve sem erro e aparece em Meus modelos', async () => {
    const r = await page.evaluate(() => {
      const s = window.__hestia.useFamilia.getState();
      return { dialogo: s.dialogo, meus: window.localStorage.getItem('hestia.familia.meus')?.includes('catálogo próprio') ?? false };
    });
    rep.check('guardada em Meus modelos', r.meus);
  });

  await rep.step('6. sem erro de console', async () => {
    const reais = erros.filter((e) => !/status of 404/.test(e));
    rep.check('sem erro de console (o 404 do favicon do servidor de desenvolvimento é ignorado)', reais.length === 0, `${reais.slice(0, 3).join(' | ').slice(0, 160)} ${http4xx.slice(0, 3).join(' ; ')}`);
  });
} finally {
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
