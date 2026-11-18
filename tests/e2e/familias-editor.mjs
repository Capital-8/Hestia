// Smoke do Editor de famílias reativado (experimental), em Chrome real:
//   abre pelo botão da faixa Construir; cria família pela galeria Novo; adiciona uma peça; guarda em "Meus modelos";
//   carrega no projeto; coloca uma instância pela ferramenta Componente; confere o estado do projeto; desfaz; fecha o
//   editor sem perder estado; exporta e importa "Meus modelos" pelo arquivo. Mede os tempos e lista os erros de console.
// Uso: APP='http://127.0.0.1:4700/?debug=1' node tests/e2e/familias-editor.mjs
//   Sem APP, usa o servidor de desenvolvimento em http://127.0.0.1:4700 (suba com `vite --port 4700` em apps/web).
//   CHROME_PATH aponta o navegador; sem ele, procura o Chrome do sistema. Sai com código 1 se algum passo falhar.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CHROME_ARGS, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:4700/?debug=1';
const EXE = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find((p) => p && existsSync(p));
if (!EXE) {
  console.error('PENDENTE: Chrome não encontrado (defina CHROME_PATH)');
  process.exit(2);
}
const OUT = process.env.SHOTS ?? 'test-results/familias-editor';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 860 } });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const http4xx = [];
page.on('response', (r) => { if (r.status() >= 400) http4xx.push(`${r.status()} ${r.url().slice(0, 120)}`); });

const rep = makeReporter();
const tempos = {};
const medir = async (nome, fn) => {
  const t0 = Date.now();
  const r = await fn();
  tempos[nome] = Date.now() - t0;
  return r;
};
// O estado do Zustand não atravessa o page.evaluate com o getter `historico.atual`: lê-se a família dentro da página.
const store = () => page.evaluate(() => {
  const s = window.__hestia.useFamilia.getState();
  return { aberta: s.aberta, tipoId: s.tipoId, vista: s.vista, dialogo: s.dialogo };
});
const familiaAtual = () => page.evaluate(() => window.__hestia.useFamilia.getState().familia());
const projeto = () => page.evaluate(() => {
  const p = window.__hestia.editor.store.project;
  const els = Object.values(p.elements);
  return {
    componentes: els.filter((e) => e.kind === 'component').map((e) => ({ id: e.id, familyId: e.familyId })),
    familias: Object.keys(p.componentFamilies ?? {}),
    canUndo: window.__hestia.editor.store.canUndo,
  };
});
let famId = null;
let nomeFamilia = null;
let snapAntesEditor = null;

try {
  await rep.step('1. abre o app sem erro de console', async () => {
    await medir('abrirApp', async () => {
      await page.goto(APP);
      await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
      // A tela inicial (Abrir arquivo / Novo projeto) esconde o canvas: "Novo projeto" abre o projeto em branco.
      await page.getByRole('button', { name: /Novo projeto/ }).first().click();
      await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    });
    rep.check('canvas e ganchos de depuração prontos (projeto novo)', true, `${tempos.abrirApp} ms`);
  });

  await rep.step('2. botão Editor de famílias na faixa Construir, habilitado e com aviso experimental', async () => {
    const botao = page.getByRole('button', { name: 'Editor de famílias', exact: true }).first();
    const visivel = await botao.isVisible().catch(() => false);
    rep.check('botão visível na faixa', visivel);
    if (!visivel) return;
    rep.check('botão habilitado', await botao.isEnabled());
    const dica = (await botao.getAttribute('title')) ?? '';
    rep.check('dica diz Experimental', dica.includes('Experimental: cria e edita móveis paramétricos (Meus modelos).'), dica.slice(0, 60));
  });

  await rep.step('3. clique abre o editor (aba) com aviso experimental', async () => {
    await medir('abrirEditor', async () => {
      await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
      await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    });
    rep.check('janela do editor visível', true, `${tempos.abrirEditor} ms`);
    const aviso = await page.locator('.fam-aviso').innerText();
    rep.check('aviso Experimental: nada entra no projeto até “Carregar no projeto”.', aviso === 'Experimental: nada entra no projeto até “Carregar no projeto”.', aviso);
    rep.check('selo Experimental', (await page.locator('.fam-selo-exp').innerText()) === 'Experimental');
    rep.check('estado aberta = true', (await store()).aberta === true);
    snapAntesEditor = await projeto();
  });

  await rep.step('4. Novo: cria família nova pela galeria (cópia de Armário baixo)', async () => {
    await page.locator('.fam-novo-btn').click();
    await page.waitForSelector('.fam-tpl', { timeout: 30_000 });
    await page.locator('.fam-tpl', { hasText: 'Armário baixo' }).first().click();
    await medir('criarFamilia', async () => {
      await page.locator('.fam-bt.pri', { hasText: 'Criar' }).click();
      await page.waitForFunction(() => window.__hestia.useFamilia.getState().historico.atual.nome.endsWith('(nova)'), null, { timeout: 30_000 });
    });
    const f = await familiaAtual();
    famId = f.id;
    nomeFamilia = f.nome;
    rep.check('família criada e em edição', nomeFamilia === 'Armário baixo (nova)', `${nomeFamilia} / ${famId} / ${tempos.criarFamilia} ms`);
    rep.check('família nova não entrou no projeto ainda', !(await projeto()).familias.includes(famId));
  });

  await rep.step('5. adiciona uma peça pela store do editor (executar) e a resolução a enxerga', async () => {
    const antes = (await familiaAtual()).pecas.length;
    const erro = await page.evaluate(() => {
      const st = window.__hestia.useFamilia.getState();
      const base = st.familia().pecas[0];
      return st.executar('Adicionar peça de teste', (r) => {
        r.pecas.push({ ...structuredClone(base), id: 'peca_teste', nome: 'Peça de teste' });
        return null;
      });
    });
    const depois = (await familiaAtual()).pecas.length;
    rep.check('executar aceita a peça (sem motivo de recusa)', erro === null, String(erro));
    rep.check('peças +1', depois === antes + 1, `${antes} -> ${depois}`);
    const noResolvido = await page.evaluate(() => {
      const st = window.__hestia.useFamilia.getState();
      const r = window.__hestia.engine.resolverFamilia(st.historico.atual, { tipoId: st.tipoId ?? undefined, valores: st.valores });
      return JSON.stringify(r.pecas).includes('peca_teste');
    });
    rep.check('resolução contém a peça nova', noResolvido);
  });

  await rep.step('6. Abrir e salvar: guarda em Meus modelos (localStorage do navegador)', async () => {
    await page.getByRole('button', { name: 'Abrir e salvar', exact: true }).first().click();
    await page.waitForSelector('.fam-arquivo', { timeout: 30_000 });
    await medir('guardarMeusModelos', async () => {
      await page.getByRole('button', { name: 'Guardar em Meus modelos', exact: true }).click();
      await page.waitForSelector('.fam-arquivo .fam-msg', { timeout: 30_000 });
    });
    const msg = await page.locator('.fam-arquivo .fam-msg').innerText();
    rep.check('mensagem de guardada', msg.includes('guardada em Meus modelos'), msg);
    const guardado = await page.evaluate(() => localStorage.getItem('hestia.familia.meus') ?? '');
    rep.check('localStorage tem a família', guardado.includes(famId), `${guardado.length} caracteres`);
    await page.locator('.fam-dwin button[aria-label="Fechar"]').click();
  });

  await rep.step('7. Carregar no projeto: grava componentFamilies e ativa a ferramenta Componente', async () => {
    await medir('carregarNoProjeto', async () => {
      await page.getByRole('button', { name: 'Carregar no projeto', exact: true }).click();
      await page.waitForFunction((id) => !!window.__hestia.editor.store.project.componentFamilies?.[id], famId, { timeout: 30_000 });
    });
    const p = await projeto();
    rep.check('componentFamilies tem a família', p.familias.includes(famId), `${tempos.carregarNoProjeto} ms`);
    rep.check('ferramenta Componente ativa', (await page.evaluate(() => window.__hestia.useUi.getState().tool)) === 'component');
    rep.check('editor ocultado ao carregar', !(await store()).aberta);
  });

  await rep.step('8. volta ao projeto e reabre o editor sem perder a família em edição', async () => {
    await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    const f = await familiaAtual();
    rep.check('família em edição preservada', f.id === famId && f.nome === nomeFamilia);
    await page.locator('.fam-doctabs > button').first().click();
    await page.waitForSelector('.fam-root', { state: 'detached', timeout: 30_000 }).catch(() => undefined);
    rep.check('"Projeto" fecha a aba do editor', !(await store()).aberta);
    const antes = await projeto();
    rep.check('estado do projeto intacto ao fechar o editor', antes.familias.includes(famId) && antes.componentes.length === snapAntesEditor.componentes.length);
  });

  await rep.step('9. coloca uma instância: clique na planta com a ferramenta Componente', async () => {
    const box = await page.locator('.canvas-wrap').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await medir('colocarInstancia', async () => {
      await page.mouse.move(cx - 40, cy - 40);
      await page.mouse.move(cx, cy);
      await page.mouse.click(cx, cy);
      await page.waitForFunction((id) => Object.values(window.__hestia.editor.store.project.elements).some((e) => e.kind === 'component' && e.familyId === id), famId, { timeout: 20_000 }).catch(() => undefined);
    });
    const p = await projeto();
    const instancias = p.componentes.filter((c) => c.familyId === famId);
    rep.check('projeto tem um component da família', instancias.length === 1, `${instancias.length} em ${tempos.colocarInstancia} ms`);
    rep.check('componentFamilies com a família', p.familias.includes(famId));
  });

  await rep.step('10. desfazer do projeto remove só a instância; a família continua no projeto', async () => {
    await page.evaluate(() => window.__hestia.editor.store.undo());
    const depoisDesfazer = await projeto();
    rep.check('undo tira o component', depoisDesfazer.componentes.filter((c) => c.familyId === famId).length === 0);
    rep.check('undo mantém componentFamilies', depoisDesfazer.familias.includes(famId));
    await page.evaluate(() => window.__hestia.editor.store.redo());
    rep.check('refazer devolve o component', (await projeto()).componentes.filter((c) => c.familyId === famId).length === 1);
  });

  await rep.step('11. Meus modelos: exporta arquivo, importa arquivo válido e recusa arquivo inválido', async () => {
    await page.getByRole('button', { name: 'Editor de famílias', exact: true }).first().click();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    await page.locator('.fam-novo-btn').click();
    await page.waitForSelector('.fam-tpl', { timeout: 30_000 });
    await page.locator('.fam-novo-categorias button', { hasText: 'Meus modelos' }).click();
    await page.waitForSelector('.fam-meus-acoes', { timeout: 30_000 });
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Exportar meus modelos', exact: true }).click(),
    ]);
    const arquivo = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(arquivo);
    const exportado = JSON.parse(readFileSync(arquivo, 'utf8'));
    rep.check('arquivo exportado tem formato hestia-familia', exportado.formato === 'hestia-familia', dl.suggestedFilename());
    rep.check('arquivo exportado tem a família guardada', exportado.familias.some((f) => f.id === famId));

    const entrada = page.locator('.fam-meus-acoes input[type=file]');
    await entrada.setInputFiles({ name: 'ruim.json', mimeType: 'application/json', buffer: Buffer.from('{quebrado') });
    const erroMsg = await page.locator('.fam-meus-acoes .fam-msg.erro').innerText({ timeout: 15_000 });
    rep.check('arquivo inválido é recusado com mensagem', erroMsg.startsWith('Não foi possível importar:'), erroMsg.slice(0, 80));

    await entrada.setInputFiles({ name: 'meus-modelos.hestia-familia.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exportado)) });
    await page.waitForFunction(() => document.querySelector('.fam-meus-acoes .fam-msg')?.textContent?.includes('guardado'), null, { timeout: 30_000 });
    rep.check('arquivo válido é importado', true, await page.locator('.fam-meus-acoes .fam-msg').innerText());
    await page.locator('.fam-dwin button[aria-label="Fechar"]').click();
  });

  await rep.step('12. fechar o editor com o projeto intacto (Projeto volta ao desenho)', async () => {
    await page.locator('.fam-doctabs > button').first().click();
    await page.waitForFunction(() => !window.__hestia.useFamilia.getState().aberta, null, { timeout: 15_000 });
    const depois = await projeto();
    rep.check('editor fechado', !(await store()).aberta);
    rep.check('projeto com a família e a instância', depois.familias.includes(famId) && depois.componentes.some((c) => c.familyId === famId));
  });

  await rep.step('12b. Biblioteca: "Criar/editar modelo" abre o editor; limitações medidas na faixa do editor', async () => {
    await page.getByRole('button', { name: 'Biblioteca', exact: true }).first().click();
    await page.waitForSelector('[data-testid=pal-criar-modelo]', { timeout: 30_000 });
    rep.check('paleta tem o botão Criar/editar modelo ao lado de Importar', (await page.locator('[data-testid=pal-importar]').count()) === 1);
    await page.locator('[data-testid=pal-criar-modelo]').click();
    await page.waitForSelector('.fam-root', { state: 'visible', timeout: 60_000 });
    rep.check('botão da Biblioteca abre o editor', (await store()).aberta === true);
    const abas = await page.locator('.fam-root .rtab').evaluateAll((els) => els.map((e) => ({ nome: e.textContent, off: e.disabled })));
    const placeholders = abas.filter((a) => a.nome !== 'Criar');
    rep.check('LIMITAÇÃO medida: abas Inserir/Modificar/Vista/Gerenciar desabilitadas (placeholder)', placeholders.length === 4 && placeholders.every((a) => a.off), placeholders.map((a) => a.nome).join(','));
    const soon = await page.locator('.fam-root .rb-btn.soon').count();
    const desabilitados = await page.locator('.fam-root .rb-btn:disabled').count();
    rep.check('LIMITAÇÃO medida: botões da faixa marcados em breve (soon)', true, `${soon} soon, ${desabilitados} desabilitados`);
    await page.locator('.fam-doctabs > button').first().click();
    await page.waitForFunction(() => !window.__hestia.useFamilia.getState().aberta, null, { timeout: 15_000 });
  });

  await rep.step('13. erros de console durante o smoke', async () => {
    const pageErr = erros.filter((e) => e.startsWith('[pageerror]'));
    rep.check('nenhum pageerror', pageErr.length === 0, pageErr.slice(0, 2).join(' | '));
    const outrosErros = erros.filter((e) => !e.startsWith('[pageerror]') && !e.includes('Failed to load resource'));
    rep.check('nenhum console.error (exceto recurso 404 registrado abaixo)', outrosErros.length === 0, outrosErros.slice(0, 3).map((e) => e.slice(0, 90)).join(' | '));
    rep.check('recursos 4xx durante o smoke (achado, não bloqueia)', true, http4xx.length === 0 ? 'nenhum' : [...new Set(http4xx)].join(' ; '));
  });
} catch (e) {
  console.log(`FALHA fora dos passos: ${e.message.split('\n')[0]}`);
  process.exitCode = 1;
} finally {
  console.log('\nTEMPOS (ms):', JSON.stringify(tempos));
  rep.summary();
  await browser.close();
}
const falhou = rep.steps.some((s) => s.status === 'FAIL');
if (falhou) process.exitCode = 1;
