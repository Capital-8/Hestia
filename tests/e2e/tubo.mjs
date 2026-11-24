// Roteiro da ferramenta Tubo (ficha C5), em Chrome real: desenha 3 trechos em L (cadeia) e confere as conexões.
//   1. abre o app (projeto novo) e carrega no projeto uma família de tubo mínima (varredura reta + 2 ligações);
//   2. escolhe a ferramenta Tubo pelo botão da faixa Inserir (com o painel de colocação visível);
//   3. clica 4 pontos em L (3 trechos encadeados); confere 3 instâncias, L em mm e conexões recíprocas fim→início;
//   4. Esc encerra a cadeia; desfaz o último trecho num passo só;
//   5. (C6) com as famílias de esgoto no projeto: curva 90° no encontro em L e tê no meio de um tubo (divide o trecho), desfazer num passo.
// Uso: APP='http://127.0.0.1:5199/?debug=1' node tests/e2e/tubo.mjs
//   Sem APP, usa o servidor de desenvolvimento em http://127.0.0.1:5199 (suba com `npx vite --port 5199 --host 127.0.0.1` em apps/web).
//   CHROME_PATH aponta o navegador. Sai com código 1 se algum passo falhar.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5199/?debug=1';
const EXE = chromeExecutable();
if (!EXE) {
  console.error('PENDENTE: Chrome não encontrado (defina CHROME_PATH)');
  process.exit(2);
}
const OUT = process.env.SHOTS ?? 'test-results/tubo';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: CHROME_ARGS });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();

/** Tubos do projeto, na ordem de criação. */
const tubos = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements)
  .filter((e) => e.kind === 'component')
  .map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z, L: e.values?.L, DN: e.values?.DN, lig: e.ligacoes ?? null })));

try {
  await rep.step('1. abre o app e carrega a família de tubo mínima', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    const erro = await page.evaluate(() => {
      const { model, editor } = window.__hestia;
      const lig = (id, posicao, direcao) => ({ id, nome: id, dominio: 'esgoto', secao: 'redonda', posicao, direcao, diametro: 'DN', fluxo: 'ambos' });
      const base = structuredClone(model.FAMILIA_ARMARIO);
      const familia = {
        ...base,
        id: 'tubo-padrao',
        nome: 'Tubo reto',
        pecas: [], ferragens: [], conectores: [], planos: [], escolhas: [], tipos: [], tipoPadrao: undefined,
        parametros: [
          { id: 'L', nome: 'Comprimento', tipo: 'comprimento', escopo: 'instancia', padrao: 1000 },
          ...base.parametros.filter((q) => ['A', 'P'].includes(q.id)),
          { id: 'DN', nome: 'Diâmetro nominal', tipo: 'comprimento', escopo: 'instancia', padrao: 50 },
        ],
        corpos: [{ id: 'tubo', nome: 'Tubo', papel: 'tubo', forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'DN' }, comprimento: 'L' }, quadro: { origem: ['0', '0', '0'] } }],
        ligacoes: [lig('ini', ['0', '0', '0'], ['0', '0', '-1']), lig('fim', ['0', '0', 'L'], ['0', '0', '1'])],
      };
      try {
        editor.store.exec({ type: 'upsertFamily', family: familia });
        return null;
      } catch (e) {
        return e.message;
      }
    });
    rep.check('família carregada no projeto', erro === null, String(erro));
  });

  await rep.step('2. a faixa Inserir tem o botão Tubo e ele ativa a ferramenta', async () => {
    await page.locator('.rtab:visible', { hasText: /^(Inserir|Insert)$/ }).first().click();
    const botao = page.getByRole('button', { name: /^(Tubo|Pipe)$/ }).first();
    rep.check('botão Tubo visível', await botao.isVisible().catch(() => false));
    await botao.click();
    const ferramenta = await page.evaluate(() => window.__hestia.useUi.getState().tool);
    rep.check('ferramenta ativa = tubo', ferramenta === 'tubo', ferramenta);
    rep.check('painel de colocação mostra o DN', await page.locator('#place-tubo-dn').isVisible().catch(() => false));
  });

  await rep.step('3. três trechos em L: (0,0)→(3,0)→(3,2)→(6,2)', async () => {
    await clickWorld(page, 0, 0);
    await clickWorld(page, 3, 0);
    await clickWorld(page, 3, 2);
    await clickWorld(page, 6, 2);
    await page.screenshot({ path: `${OUT}/tubo-em-L.png` });
    const t = await tubos();
    rep.check('3 instâncias', t.length === 3, String(t.length));
    rep.check('comprimentos 3000, 2000 e 3000 mm', t.map((c) => Math.round(c.L)).join(',') === '3000,2000,3000', t.map((c) => Math.round(c.L)).join(','));
    rep.check('todos com DN 50', t.every((c) => c.DN === 50));
    const ok = (a, b) => a?.lig?.fim?.componenteId === b?.id && b?.lig?.ini?.componenteId === a?.id;
    rep.check('trecho 1 conectado ao 2 (fim→início, recíproco)', ok(t[0], t[1]));
    rep.check('trecho 2 conectado ao 3 (fim→início, recíproco)', ok(t[1], t[2]));
    rep.check('pontas livres: início do 1 e fim do 3', !t[0]?.lig?.ini && !t[2]?.lig?.fim);
  });

  await rep.step('4. Esc encerra a cadeia e o desfazer remove só o último trecho', async () => {
    await page.keyboard.press('Escape');
    const aindaTubo = await page.evaluate(() => window.__hestia.useUi.getState().tool);
    rep.check('1º Esc mantém a ferramenta (só encerra a cadeia)', aindaTubo === 'tubo', aindaTubo);
    await page.evaluate(() => window.__hestia.editor.store.undo());
    const t = await tubos();
    rep.check('2 instâncias depois de desfazer', t.length === 2, String(t.length));
    rep.check('a conexão do trecho removido sumiu', t[1] && !t[1].lig?.fim, JSON.stringify(t[1]?.lig));
  });

  await rep.step('5. conexões automáticas: curva 90° no encontro e tê no meio de um trecho (família de esgoto)', async () => {
    const erro = await page.evaluate(() => {
      const { model, editor } = window.__hestia;
      const lig = (id, direcao, diametro = 'DN') => ({ id, nome: id, dominio: 'esgoto', secao: 'redonda', posicao: ['0', '0', '0'], direcao, diametro, fluxo: 'ambos' });
      const base = structuredClone(model.FAMILIA_ARMARIO);
      const comum = { ...base, pecas: [], ferragens: [], conectores: [], planos: [], escolhas: [], tipos: [], tipoPadrao: undefined };
      const DN = { id: 'DN', nome: 'Diâmetro nominal', tipo: 'comprimento', escopo: 'instancia', padrao: 50 };
      const DN2 = { id: 'DN2', nome: 'DN2', tipo: 'comprimento', escopo: 'instancia', padrao: 50 };
      const L = { id: 'L', nome: 'Comprimento', tipo: 'comprimento', escopo: 'instancia', padrao: 1000 };
      const parametros = [L, ...base.parametros.filter((q) => ['A', 'P'].includes(q.id)), DN, DN2];
      const tubo = { ...comum, id: 'fam_tubo_esgoto', nome: 'Tubo de esgoto', parametros, corpos: [{ id: 'tubo', nome: 'Tubo', papel: 'tubo', forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'DN' }, comprimento: 'L' }, quadro: { origem: ['0', '0', '0'] } }], ligacoes: [lig('ini', ['0', '0', '-1']), { ...lig('fim', ['0', '0', '1']), posicao: ['0', '0', 'L'] }] };
      const conexao = (id, ligacoes) => ({ ...comum, id, nome: id, parametros, corpos: [], ligacoes });
      const familias = [
        tubo,
        conexao('fam_esgoto_curva90', [lig('a', ['1', '0', '0']), lig('b', ['0', '1', '0'])]),
        conexao('fam_esgoto_te', [lig('p1', ['-1', '0', '0']), lig('p2', ['1', '0', '0']), lig('r', ['0', '1', '0'], 'DN2')]),
      ];
      try {
        for (const f of familias) editor.store.exec({ type: 'upsertFamily', family: f });
        return null;
      } catch (e) {
        return e.message;
      }
    });
    rep.check('famílias de esgoto carregadas', erro === null, String(erro));
    await page.evaluate(() => window.__hestia.useUi.setState((u) => ({ options: { ...u.options, componentFamilyId: 'fam_tubo_esgoto', componentTypeId: null } })));
    // Curva: (0,4)→(3,4)→(3,6). A família padrão agora é o tubo de esgoto (tem prioridade sobre 'tubo-padrao').
    await clickWorld(page, 0, 4);
    await clickWorld(page, 3, 4);
    await clickWorld(page, 3, 6);
    await page.keyboard.press('Escape');
    let t = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => e.familyId));
    rep.check('uma curva 90° inserida no encontro', t.filter((f) => f === 'fam_esgoto_curva90').length === 1, JSON.stringify(t));
    // Tê: tubo (4,5;4)→(8,5;4) e ramal clicado no meio (6,5;4) até (6,5;6).
    await clickWorld(page, 4.5, 4);
    await clickWorld(page, 8.5, 4);
    await page.keyboard.press('Escape');
    await clickWorld(page, 6.5, 4);
    await clickWorld(page, 6.5, 6);
    await page.screenshot({ path: `${OUT}/tubo-curva-e-te.png` });
    t = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => e.familyId));
    rep.check('um tê inserido', t.filter((f) => f === 'fam_esgoto_te').length === 1, JSON.stringify(t));
    rep.check('o tubo do tê foi dividido em dois, mais o ramal (5 tubos com os 2 da curva)', t.filter((f) => f === 'fam_tubo_esgoto').length === 5, JSON.stringify(t));
    await page.evaluate(() => window.__hestia.editor.store.undo());
    t = await page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => e.familyId));
    rep.check('desfazer remove o tê e o ramal num passo só', t.filter((f) => f === 'fam_esgoto_te').length === 0 && t.filter((f) => f === 'fam_tubo_esgoto').length === 3, JSON.stringify(t));
  });

  rep.check('sem erros de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} finally {
  rep.summary();
  await browser.close();
}
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
