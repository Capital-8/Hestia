// Estabilidade dos nós do painel de propriedades do móvel (e dos seletores de móveis): "a lista de acabamentos fecha sozinha".
// Um <select> nativo (ou um menu próprio) fecha quando o nó é substituído no DOM. Aqui marca-se CADA controle do painel com uma
// propriedade expando, dispara-se o que o app dispara sem o usuário mexer (hover, previewTick, outro comando, mesma seleção
// de novo, mouse sobre o 3D e sobre o painel) e confere-se se algum controle foi trocado por outro nó ou saiu do documento.
// Uso: APP='http://127.0.0.1:4201/?debug=1' node tests/e2e/moveis-seletores-estaveis.mjs
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { CHROME_ARGS, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:4201/?debug=1';
const EXE = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/opt/google/chrome/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && existsSync(p));
if (!EXE) { console.error('PENDENTE: Chrome não encontrado (defina CHROME_PATH)'); process.exit(2); }

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();

/** Marca todos os controles do painel; devolve quantos. */
const marcar = () => page.evaluate(() => {
  const nos = document.querySelectorAll('aside.side select, aside.side input, aside.side button, aside.side details, aside.side summary');
  let i = 0;
  for (const n of nos) n.__marca = `m${i++}`;
  return i;
});
/** Controles marcados que foram substituídos (sem marca) ou desconectados; mais as marcas que sumiram. */
const conferir = () => page.evaluate(() => {
  const nos = [...document.querySelectorAll('aside.side select, aside.side input, aside.side button, aside.side details, aside.side summary')];
  const novos = nos.filter((n) => n.__marca === undefined).map((n) => `${n.tagName.toLowerCase()}#${n.id}.${String(n.className).slice(0, 20)}`);
  return { total: nos.length, novos };
});

const preparar = async (selecaoJs) => {
  await page.evaluate(() => {
    const { editor, model } = window.__hestia;
    const p = editor.project;
    if (!p.componentFamilies?.[model.FAMILIA_ARMARIO.id]) editor.store.exec({ type: 'upsertFamily', family: structuredClone(model.FAMILIA_ARMARIO) });
    const lv = editor.project.levels[0].id;
    for (const [id, x] of [['mv1', 1], ['mv2', 3]]) {
      if (!editor.project.elements[id]) {
        editor.store.exec({ type: 'addComponent', component: { id, kind: 'component', familyId: model.FAMILIA_ARMARIO.id, typeId: 'A80', levelId: lv, x, y: 1, z: 0, rotation: 0, mirrored: false, mark: '' } });
      }
    }
  });
  await page.evaluate(selecaoJs);
  await page.waitForSelector('#p-comp-acabCorpo', { timeout: 30_000 });
};

try {
  await rep.step('abre o app e coloca 2 móveis', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await preparar(() => window.__hestia.useUi.setState({ selection: ['mv1'] }));
    rep.check('painel do móvel aberto', true);
  });

  await rep.step('estímulos sem o usuário mexer no painel', async () => {
    const n = await marcar();
    rep.check('controles marcados', n > 10, String(n));
    // mouse sobre o 3D e sobre o painel
    const cv = await page.locator('.canvas-wrap canvas').first().boundingBox();
    for (let i = 0; i < 8; i++) await page.mouse.move(cv.x + 100 + i * 30, cv.y + 100 + i * 10);
    const pn = await page.locator('#p-comp-acabCorpo').boundingBox();
    for (let i = 0; i < 8; i++) await page.mouse.move(pn.x + 40 + i * 5, pn.y + 200 + i * 10);
    await page.evaluate(() => {
      const { useUi, editor } = window.__hestia;
      for (let i = 0; i < 5; i++) useUi.setState({ previewTick: useUi.getState().previewTick + 1 });
      useUi.setState({ hover: 'mv1' }); useUi.setState({ hover: 'mv2' }); useUi.setState({ hover: null });
      // outro comando (outro móvel): o projeto muda de versão
      editor.store.exec({ type: 'updateComponent', id: 'mv2', patch: { x: 3.5 } });
      // mesma seleção em array novo
      useUi.setState({ selection: ['mv1'] });
    });
    await page.waitForTimeout(2000);
    const r = await conferir();
    rep.check('nenhum controle do painel foi substituído', r.novos.length === 0, r.novos.slice(0, 6).join(' | '));
    rep.check('seletor Corpo ainda é o mesmo nó e conectado', await page.evaluate(() => { const s = document.querySelector('#p-comp-acabCorpo'); return !!s && s.__marca !== undefined && s.isConnected; }));
  });

  await rep.step('mudança que afeta o móvel selecionado (valor novo) mantém os nós', async () => {
    await marcar();
    await page.evaluate(() => window.__hestia.editor.store.exec({ type: 'updateComponent', id: 'mv1', patch: { mark: 'A1' } }));
    await page.waitForTimeout(500);
    const r = await conferir();
    rep.check('nenhum controle substituído após editar o próprio móvel', r.novos.length === 0, r.novos.slice(0, 6).join(' | '));
  });

  await rep.step('seletores nativos (Tipo etc.) não são tocados pelo React em re-render do painel', async () => {
    // O React reatribui `option.selected` em todo commit de um <select> controlado e o Chrome fecha a lista nativa aberta por isso.
    await page.evaluate(() => {
      window.__toques = [];
      const d = Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'selected');
      Object.defineProperty(HTMLOptionElement.prototype, 'selected', { configurable: true, get() { return d.get.call(this); }, set(v) { const sel = this.closest('select'); if (sel && sel.closest('aside.side')) window.__toques.push(sel.id || sel.getAttribute('aria-label') || 'select'); d.set.call(this, v); } });
    });
    await page.evaluate(() => {
      const { useUi, editor } = window.__hestia;
      useUi.setState({ selection: ['mv1'] });
      editor.store.exec({ type: 'updateComponent', id: 'mv2', patch: { x: 4 } });
      editor.store.exec({ type: 'updateComponent', id: 'mv1', patch: { mark: 'B2' } });
      useUi.setState({ selection: ['mv1'] });
    });
    await page.waitForTimeout(1500);
    const toques = await page.evaluate(() => window.__toques);
    rep.check('nenhum <select> do painel foi tocado nos re-renders', toques.length === 0, toques.join(','));
    rep.check('há ao menos um select nativo no painel (Tipo)', (await page.locator('aside.side select#p-comp-type').count()) >= 1);
  });

  await rep.step('lista de acabamentos fica aberta durante re-renders e escolhe Vidro Incolor com UM desfazer', async () => {
    await page.evaluate(() => window.__hestia.useUi.setState({ selection: ['mv1'] }));
    const btn = page.locator('#p-comp-acabCorpo');
    await btn.click();
    const lista = page.locator('[role=listbox]');
    await lista.waitFor({ state: 'visible', timeout: 5000 });
    await lista.evaluate((n) => { n.__marca = 'lista'; });
    await page.evaluate(() => {
      const { useUi, editor } = window.__hestia;
      for (let i = 0; i < 5; i++) useUi.setState({ previewTick: useUi.getState().previewTick + 1 });
      useUi.setState({ hover: 'mv2' }); useUi.setState({ hover: null });
      editor.store.exec({ type: 'updateComponent', id: 'mv2', patch: { x: 3.2 } });
      useUi.setState({ selection: ['mv1'] });
      document.activeElement?.blur();
    });
    await page.waitForTimeout(2000);
    rep.check('lista continua aberta e é o mesmo nó', await page.evaluate(() => { const l = document.querySelector('[role=listbox]'); return !!l && l.__marca === 'lista' && l.isConnected; }));
    const opcoes = await page.locator('[role=option]').allInnerTexts();
    rep.check('lista tem Padrão do móvel + 17 acabamentos', opcoes.length === 18 && opcoes[0] === 'Padrão do móvel', `${opcoes.length} ${opcoes[0]}`);
    const antes = await page.evaluate(() => ({ undo: window.__hestia.editor.store.canUndo }));
    await page.locator('[role=option]', { hasText: 'Vidro Incolor' }).click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const els = window.__hestia.editor.project.elements;
      return { mv1: els.mv1.values?.acabCorpo, mv2: els.mv2.values?.acabCorpo, aberta: !!document.querySelector('[role=listbox]') };
    });
    rep.check('mv1.values.acabCorpo = comp_vidro_incolor', r.mv1 === 'comp_vidro_incolor', String(r.mv1));
    rep.check('mv2 não mudou', r.mv2 === undefined);
    rep.check('lista fechou ao escolher', !r.aberta);
    rep.check('botão mostra Vidro Incolor', (await btn.innerText()).includes('Vidro Incolor'), await btn.innerText());
    await page.evaluate(() => window.__hestia.editor.store.undo());
    const depois = await page.evaluate(() => window.__hestia.editor.project.elements.mv1.values?.acabCorpo);
    rep.check('UM desfazer volta ao padrão', depois === undefined, String(depois));
    await page.evaluate(() => window.__hestia.editor.store.redo());
    rep.check('refazer reaplica', (await page.evaluate(() => window.__hestia.editor.project.elements.mv1.values?.acabCorpo)) === 'comp_vidro_incolor');
    void antes;
  });

  await rep.step('teclado: Esc fecha sem alterar; setas + Enter escolhem; Padrão do móvel (valor vazio) é escolhível', async () => {
    const btn = page.locator('#p-comp-acabCorpo');
    await btn.click();
    await page.locator('[role=listbox]').waitFor({ state: 'visible' });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    rep.check('Esc fechou a lista', (await page.locator('[role=listbox]').count()) === 0);
    rep.check('valor inalterado após Esc', (await page.evaluate(() => window.__hestia.editor.project.elements.mv1.values?.acabCorpo)) === 'comp_vidro_incolor');
    await btn.click();
    await page.locator('[role=listbox]').waitFor({ state: 'visible' });
    await page.keyboard.press('Home'); // Padrão do móvel
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const v = await page.evaluate(() => window.__hestia.editor.project.elements.mv1.values?.acabCorpo);
    rep.check('Home+Enter grava o padrão (acabCorpo removido)', v === undefined, String(v));
    await btn.click();
    await page.locator('[role=listbox]').waitFor({ state: 'visible' });
    await page.mouse.click(5, 5);
    await page.waitForTimeout(200);
    rep.check('clicar fora fecha a lista', (await page.locator('[role=listbox]').count()) === 0);
  });

  await rep.step('seleção com 2 móveis de valores diferentes mostra "variados"', async () => {
    await page.evaluate(() => {
      const { editor, useUi } = window.__hestia;
      editor.store.exec({ type: 'updateComponent', id: 'mv1', patch: { values: { acabCorpo: 'comp_vidro_incolor' } } });
      useUi.setState({ selection: ['mv1', 'mv2'] });
    });
    await page.waitForTimeout(500);
    const btn = page.locator('#p-comp-acabCorpo');
    rep.check('botão diz variados', (await btn.innerText()).trim().toLowerCase().includes('variados'), await btn.innerText());
    await btn.click();
    await page.locator('[role=listbox]').waitFor({ state: 'visible' });
    rep.check('nenhuma opção marcada', (await page.locator('[role=option][aria-selected=true]').count()) === 0);
    await page.locator('[role=option]', { hasText: 'Laca Branca' }).click();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const e = window.__hestia.editor.project.elements; return [e.mv1.values?.acabCorpo, e.mv2.values?.acabCorpo]; });
    rep.check('escolher grava nos dois móveis', r[0] === 'comp_branco' && r[1] === 'comp_branco', r.join(','));
  });
} finally {
  await browser.close();
}
console.log(erros.length ? `\nerros de página: ${erros.join(' / ')}` : '\nsem erros de página');
rep.summary?.();
process.exit(rep.steps.some((s) => s.status !== 'PASS') ? 1 : 0);
