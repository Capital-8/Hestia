// Layout da janela "Inserir vistas na prancha" (AddViewDialog) medido com getBoundingClientRect, sem abrir imagens: a
// lista aparece com altura, nada passa da janela, a janela cabe em 80% da altura e a lista rola sozinha, em 1024x640 e
// 1366x768, com uma fonte maior e com 250 vistas 3D. Usa o servidor de desenvolvimento já no ar (porta 4200):
//   ~/hestia-tools/pesado.sh node tests/e2e/prancha-inserir-layout.mjs
import { launch, makeReporter } from './helpers.mjs';

const URL = process.env.HESTIA_URL ?? 'http://127.0.0.1:4200/?debug=1';
const TAMANHOS = [
  [1024, 640],
  [1366, 768],
];
const VISTAS_3D = 250;

const rep = makeReporter();
const browser = await launch();

/** Cria uma prancha e as vistas 3D extras pelo próprio editor (módulos do servidor de desenvolvimento). */
async function preparar(page) {
  return page.evaluate(async (n) => {
    const { addSheetAction } = await import('/src/editor/sheetActions.ts');
    const store = window.__hestia.editor.store;
    const id = addSheetAction(store);
    for (let i = 1; i <= n; i++) {
      const name = `Ponto ${String(i).padStart(3, '0')}`;
      store.exec({ type: 'addView3DPoint', point: { id: `v3d_t${i}`, name, camera: { azimuth: 0, elevation: 0.5, distance: 10, target: { x: 0, y: 0, z: 0 }, ortho: false } } });
    }
    return id;
  }, VISTAS_3D);
}

/** Medidas da janela aberta: tudo em pixels da tela, pelo DOM. */
const medir = (page) =>
  page.evaluate(() => {
    const d = document.querySelector('.dialog.ins');
    if (!d) return null;
    const r = (el) => el.getBoundingClientRect();
    const dr = r(d);
    const lista = d.querySelector('.ins-list');
    const lr = r(lista);
    const linhas = [...d.querySelectorAll('.ins-row')];
    const rodape = r(d.querySelector('.dfoot'));
    const corpo = d.querySelector('.dbody');
    // Elementos fora da janela, sem contar o interior da lista (que rola de propósito).
    const foraDaJanela = [...d.querySelectorAll('*')]
      .filter((el) => el !== lista && !lista.contains(el))
      .filter((el) => {
        const b = r(el);
        if (b.width === 0 || b.height === 0) return false;
        return b.bottom > dr.bottom + 0.5 || b.right > dr.right + 0.5 || b.top < dr.top - 0.5 || b.left < dr.left - 0.5;
      }).length;
    const primeira = linhas[0] ? r(linhas[0]) : null;
    const segunda = linhas[1] ? r(linhas[1]) : null;
    return {
      janela: { w: dr.width, h: dr.height, top: dr.top, bottom: dr.bottom, vw: innerWidth, vh: innerHeight },
      lista: { h: lr.height, w: lr.width, bottom: lr.bottom, rolagemTotal: lista.scrollHeight, alturaVisivel: lista.clientHeight },
      linhasNoDom: linhas.length,
      linhaPx: primeira ? primeira.height : 0,
      passoEntreLinhas: primeira && segunda ? segunda.top - primeira.top : 0,
      rodape: { h: rodape.height, bottom: rodape.bottom },
      corpoRola: corpo.scrollHeight > corpo.clientHeight + 1,
      foraDaJanela,
    };
  });

/** Mede o tempo entre abrir a janela e a primeira linha aparecer (ms, relógio da página). */
const abrir = (page, id) =>
  page.evaluate(async (sheetId) => {
    const t0 = performance.now();
    window.__hestia.useUi.setState({ dialog: 'addView', dialogArg: sheetId });
    await new Promise((res) => {
      const f = () => (document.querySelector('.dialog.ins .ins-row') ? res() : requestAnimationFrame(f));
      f();
    });
    return performance.now() - t0;
  }, id);

for (const [w, h] of TAMANHOS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await rep.step(`janela Inserir vistas em ${w}x${h}`, async () => {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180000 });
    // A tela inicial não tem projeto: abre um novo (como o dono faria) e espera o canvas.
    await page.getByText('Novo projeto', { exact: true }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180000 });
    await page.waitForTimeout(500);
    const id = await preparar(page);
    // Primeira abertura da página: inclui o carregamento sob demanda do servidor de desenvolvimento (informativo).
    const msFria = await abrir(page, id);
    const m = await medir(page);
    console.log(JSON.stringify(m, null, 1));
    // Abertura quente: fecha e reabre na mesma página. É ela que o limite de 300 ms mede.
    await page.evaluate(() => window.__hestia.useUi.setState({ dialog: null, dialogArg: null }));
    await page.waitForTimeout(100);
    const ms = await abrir(page, id);
    console.log(`abertura fria ${msFria.toFixed(0)} ms; quente ${ms.toFixed(0)} ms`);
    rep.check('janela aberta', m !== null);
    rep.check('largura até 560 px', m && m.janela.w <= 560.5, m && `${m.janela.w.toFixed(1)} px`);
    rep.check('altura até 80% da janela', m && m.janela.h <= 0.8 * m.janela.vh + 0.5, m && `${m.janela.h.toFixed(1)} de ${(0.8 * m.janela.vh).toFixed(1)} px`);
    rep.check('janela dentro da tela', m && m.janela.top >= 0 && m.janela.bottom <= m.janela.vh + 0.5);
    rep.check('lista visível (altura > 0)', m && m.lista.h > 0, m && `${m.lista.h.toFixed(1)} px`);
    rep.check('lista rola sozinha (conteúdo maior que a caixa)', m && m.lista.rolagemTotal > m.lista.alturaVisivel, m && `${m.lista.rolagemTotal} > ${m.lista.alturaVisivel}`);
    rep.check('lista dentro da janela', m && m.lista.bottom <= m.janela.bottom + 0.5);
    rep.check('rodapé com Cancelar e Inserir dentro da janela', m && m.rodape.bottom <= m.janela.bottom + 0.5, m && `rodapé ${m.rodape.h.toFixed(1)} px`);
    rep.check('nada fora da janela (exceto a lista)', m && m.foraDaJanela === 0, m && `${m.foraDaJanela} elementos`);
    rep.check('corpo da janela não corta (sem rolagem própria)', m && !m.corpoRola);
    rep.check('linhas no DOM só a faixa visível', m && m.linhasNoDom > 0 && m.linhasNoDom < 40, m && `${m.linhasNoDom} linhas no DOM`);
    rep.check('linha com altura medida', m && m.linhaPx > 0, m && `${m.linhaPx.toFixed(1)} px`);
    rep.check('abertura quente em menos de 300 ms com 250 vistas 3D', ms < 300, `${ms.toFixed(0)} ms`);

    // Rolagem até o fim: a última vista aparece e a faixa acompanha.
    await page.evaluate(() => {
      const l = document.querySelector('.dialog.ins .ins-list');
      l.scrollTop = l.scrollHeight;
      l.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(150);
    const fim = await page.evaluate(() => [...document.querySelectorAll('.dialog.ins .ins-name')].map((s) => s.textContent));
    rep.check('rolando ao fim aparece Ponto 250', fim.includes(`Ponto ${String(VISTAS_3D).padStart(3, '0')}`), `${fim.length} nomes na faixa`);

    // Fonte maior: a linha acompanha (sem sobreposição) depois de remedir.
    await page.evaluate(() => {
      document.body.style.fontSize = '18px';
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(150);
    const grande = await medir(page);
    rep.check('fonte maior: linhas sem sobreposição', grande && Math.abs(grande.passoEntreLinhas - grande.linhaPx) < 0.5, grande && `passo ${grande.passoEntreLinhas.toFixed(1)} altura ${grande.linhaPx.toFixed(1)}`);
    rep.check('fonte maior: janela continua dentro da tela', grande && grande.janela.bottom <= grande.janela.vh + 0.5 && grande.foraDaJanela === 0, grande && `${grande.foraDaJanela} fora`);
    rep.check('sem erro de página', erros.length === 0, erros.join(' | '));
    console.log(`medidas ${w}x${h}: abrir ${ms.toFixed(0)} ms; janela ${m.janela.w.toFixed(0)}x${m.janela.h.toFixed(0)}; lista ${m.lista.h.toFixed(0)} px; linha ${m.linhaPx.toFixed(1)} px; fonte 18px linha ${grande.linhaPx.toFixed(1)} px`);
    await page.evaluate(() => window.__hestia.useUi.setState({ dialog: null, dialogArg: null }));
  });
  await page.close();
}

await browser.close();
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
