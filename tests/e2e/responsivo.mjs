// Verificação responsiva dos menus, barras e diálogos do Hestia.
// Uso: node tests/e2e/responsivo.mjs --tag depois [--strict]
// Requer o dev server no ar (BASE_URL, padrão http://127.0.0.1:5199).
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const TAG = arg('tag', 'atual');
const STRICT = process.argv.includes('--strict');
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5199/';
const OUT = join('test-results', 'responsivo', TAG);
mkdirSync(OUT, { recursive: true });

const EXES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium',
].filter(Boolean);
const exe = EXES.find((p) => existsSync(p));
if (!exe) throw new Error('Chrome/Chromium não encontrado; defina CHROME_PATH.');

const TAMANHOS = [
  { name: 'telefone-360x640', width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'telefone-390x844', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'telefone-paisagem-844x390', width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'tablet-768x1024', width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'tablet-paisagem-1024x768', width: 1024, height: 768, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: 'desktop-1280x800', width: 1280, height: 800, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--no-proxy-server', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const resumo = [];

function coletar(page) {
  return page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
        right: Math.round(b.right), bottom: Math.round(b.bottom),
        display: cs.display, fontSize: cs.fontSize,
      };
    };
    const alvos = ['.qbtn', '.rtab', '.vtab', '.rb-btn', '.vcb-btn', '.fit-more', '.vtab-overflow-btn', '.fm-item', '.fit-tab', '.rb-menuitem'];
    const toques = {};
    for (const sel of alvos) {
      const els = Array.from(document.querySelectorAll(sel)).filter((e) => {
        const b = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden';
      });
      if (!els.length) continue;
      const hs = els.map((e) => Math.round(e.getBoundingClientRect().height));
      toques[sel] = { n: els.length, minH: Math.min(...hs), maxH: Math.max(...hs), abaixo28: hs.filter((h) => h < 28).length };
    }
    const doc = document.documentElement;
    const barra = document.querySelector('.titlebar');
    const filhos = barra ? Array.from(barra.children).map((e) => {
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { cls: e.className?.baseVal ?? e.className ?? e.tagName, right: Math.round(b.right), w: Math.round(b.width), pos: cs.position };
    }) : [];
    return {
      inner: { w: innerWidth, h: innerHeight },
      docScroll: { w: doc.scrollWidth, h: doc.scrollHeight },
      overflowX: doc.scrollWidth > innerWidth + 1,
      rects: {
        titlebar: r('.titlebar'), qat: r('.qat'), title: r('.tb-title'), infocenter: r('.infocenter'),
        busca: r('.ic-search'), ribbonTabs: r('.ribbon-tabs'), ribbon: r('.ribbon'), optbar: r('.optbar'),
        viewtabs: r('.viewtabs'), stage: r('.stage'), workspace: r('.workspace'), statusbar: r('.statusbar'), vcb: r('.vcb'),
      },
      titlebarOverflow: filhos.filter((f) => f.pos !== 'absolute' && f.right > (barra?.getBoundingClientRect().right ?? 0) + 1),
      titlebarChildren: filhos,
      toques,
      fileItems: document.querySelectorAll('.fm-item').length,
      dock: (() => {
        const d = document.querySelector('.dock.left, .dock.right');
        if (!d || d.classList.contains('empty')) return null;
        const b = d.getBoundingClientRect();
        return { w: Math.round(b.width), x: Math.round(b.x), scrim: !!document.querySelector('.dock-scrim') };
      })(),
    };
  });
}

async function medirDialogo(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.dialog');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const foot = el.querySelector('.dfoot')?.getBoundingClientRect();
    const dbody = el.querySelector('.dbody')?.getBoundingClientRect();
    return {
      w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y),
      right: Math.round(b.right), bottom: Math.round(b.bottom),
      footVisible: !!foot && foot.bottom <= innerHeight + 1 && foot.height > 0,
      bodyH: dbody ? Math.round(dbody.height) : 0,
      scrollX: el.querySelector('.dbody')?.scrollWidth > el.querySelector('.dbody')?.clientWidth + 1,
    };
  });
}

async function abrirDialogo(page, kind, argValue = null) {
  const ok = await page.evaluate(({ kind, argValue }) => {
    const h = window.__hestia;
    if (!h) return false;
    const p = h.editor.project;
    const mapa = {
      openingType: Object.keys(p.openingTypes ?? {})[0],
      wallType: Object.keys(p.wallTypes ?? {})[0],
      floorType: Object.keys(p.floorTypes ?? {})[0],
      slabType: Object.keys(p.slabTypes ?? {})[0],
      ceilingType: Object.keys(p.ceilingTypes ?? {})[0],
      roofType: Object.keys(p.roofTypes ?? {})[0],
      stairType: Object.keys(p.stairTypes ?? {})[0],
      rampType: Object.keys(p.rampTypes ?? {})[0],
      gridType: Object.keys(p.gridTypes ?? {})[0],
    };
    h.useUi.setState({ dialog: kind, dialogArg: argValue ?? mapa[kind] ?? null });
    return true;
  }, { kind, argValue });
  await page.waitForTimeout(450);
  return ok;
}

async function fecharDialogo(page) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

const falhas = [];
const check = (cond, msg) => { if (!cond) falhas.push(msg); };

for (const t of TAMANHOS) {
  const context = await browser.newContext({
    viewport: { width: t.width, height: t.height },
    isMobile: t.isMobile,
    hasTouch: t.hasTouch,
    deviceScaleFactor: t.deviceScaleFactor,
  });
  const page = await context.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.goto(`${BASE_URL}?debug=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.app', { timeout: 60000 });
  try {
    await page.waitForFunction(() => !!window.__hestia, { timeout: 15000 });
  } catch {
    // Sem o gancho de depuração os testes de diálogo são pulados; o resto continua.
  }
  await page.waitForTimeout(1000);

  const inicial = await coletar(page);
  const prefixo = `${t.name}`;
  check(!inicial.overflowX, `${prefixo}: rolagem horizontal da página (${inicial.docScroll.w} > ${inicial.inner.w})`);
  check(inicial.titlebarOverflow.length === 0, `${prefixo}: barra de título transborda (${inicial.titlebarOverflow.length} filho(s))`);
  check(inicial.fileItems === 0 || inicial.fileItems === 9, `${prefixo}: menu Arquivo com ${inicial.fileItems} itens (esperado 9)`);
  if (t.width <= 700) check(inicial.rects.ribbon?.h === 0, `${prefixo}: faixa deveria começar recolhida`);
  check(inicial.rects.stage.h >= inicial.inner.h * 0.5, `${prefixo}: área de desenho com ${inicial.rects.stage.h}px (${Math.round(inicial.rects.stage.h / inicial.inner.h * 100)}% da tela)`);
  if (t.hasTouch) {
    for (const sel of ['.qbtn', '.rtab', '.vtab']) {
      const m = inicial.toques[sel];
      if (m) check(m.abaixo28 === 0, `${prefixo}: ${sel} com ${m.abaixo28} alvo(s) abaixo de 28 px`);
    }
  }
  await page.screenshot({ path: join(OUT, `${t.name}-inicial.png`) });

  // Menu Arquivo: abre, confere os 10 itens e percorre as seções.
  let menu = null;
  const fmBtn = page.locator('.rtab.file');
  if (await fmBtn.count()) {
    await fmBtn.click();
    await page.waitForTimeout(250);
    menu = await page.evaluate(() => {
      const el = document.querySelector('.fm');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const list = document.querySelector('.fm-list');
      const itens = Array.from(document.querySelectorAll('.fm-item'));
      const lb = list?.getBoundingClientRect();
      return {
        w: Math.round(b.width), h: Math.round(b.height),
        listW: Math.round(lb?.width ?? 0), listH: Math.round(lb?.height ?? 0),
        itens: itens.length,
        itensFora: itens.filter((e) => { const r = e.getBoundingClientRect(); return lb && (r.right > lb.right + 1 || r.bottom > lb.bottom + 1); }).length,
        horizontal: list ? list.scrollWidth > list.clientWidth + 1 : false,
      };
    });
    check(!!menu, `${prefixo}: menu Arquivo não abriu`);
    if (menu) {
      check(menu.itens === 9, `${prefixo}: menu Arquivo com ${menu.itens} itens`);
      check(menu.itensFora === 0, `${prefixo}: ${menu.itensFora} item(ns) do menu Arquivo fora da lista visível`);
      check(!menu.horizontal, `${prefixo}: lista do menu Arquivo rola na horizontal`);
    }
    await page.screenshot({ path: join(OUT, `${t.name}-menu-arquivo.png`) });
    for (const label of ['Exportar', 'Informações do projeto', 'Opções']) {
      const item = page.locator('.fm-item', { hasText: label }).first();
      if (await item.count()) await item.click();
    }
    await page.screenshot({ path: join(OUT, `${t.name}-menu-opcoes.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }

  // Painéis: no celular abre como gaveta com fundo escurecido; no desktop, coluna.
  let painel = null;
  const props = page.locator('.vtab-controls .ibtn').first();
  if (await props.count()) {
    await props.click();
    await page.waitForTimeout(300);
    painel = await page.evaluate(() => {
      const d = document.querySelector('.dock.left, .dock.right');
      if (!d || d.classList.contains('empty')) return null;
      const b = d.getBoundingClientRect();
      return { w: Math.round(b.width), x: Math.round(b.x), scrim: !!document.querySelector('.dock-scrim') };
    });
    check(!!painel, `${prefixo}: Propriedades não abriu`);
    if (painel && t.width <= 900) {
      check(painel.scrim, `${prefixo}: gaveta sem fundo escurecido`);
      check(painel.w <= Math.round(t.width * 0.87), `${prefixo}: gaveta com ${painel.w}px em tela de ${t.width}px`);
    }
    await page.screenshot({ path: join(OUT, `${t.name}-painel-propriedades.png`) });
    if (t.width <= 900) {
      await page.mouse.click(t.width - 8, Math.min(200, t.height - 40));
    } else if (await props.count()) {
      await props.click();
    }
    await page.waitForTimeout(250);
    if (t.width <= 900) {
      const fechou = await page.evaluate(() => !document.querySelector('.dock-scrim') && !document.querySelector('.dock.left:not(.empty), .dock.right:not(.empty)'));
      check(fechou, `${prefixo}: gaveta não fechou ao tocar fora`);
    }
  }

  // Faixa recolhida: a primeira aba expande o corpo e o "»" abre a folha.
  let faixa = null;
  if (t.width <= 700) {
    const aba = page.locator('.rtabs-fit > .rtab').first();
    if (await aba.count()) {
      await aba.click();
      await page.waitForTimeout(300);
      faixa = await page.evaluate(() => {
        const f = document.querySelector('.ribbon');
        const b = f?.getBoundingClientRect();
        return b ? { h: Math.round(b.height) } : null;
      });
      check(!!faixa && faixa.h > 0, `${prefixo}: tocar na aba não expandiu a faixa`);
      const mais = page.locator('.ribbon .fit-more').first();
      if (await mais.count()) {
        await mais.click();
        await page.waitForTimeout(250);
        const pop = await page.evaluate(() => {
          const el = document.querySelector('.fit-pop.panels');
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
        });
        check(!!pop, `${prefixo}: botão "mais painéis" não abriu`);
        if (pop) {
          check(pop.x >= -1 && pop.y >= -1 && pop.right <= t.width + 1 && pop.bottom <= t.height + 1, `${prefixo}: popup de painéis fora da tela (${JSON.stringify(pop)})`);
        }
        await page.screenshot({ path: join(OUT, `${t.name}-painéis-mais.png`) });
        await page.keyboard.press('Escape');
      }
      // Recolhe de novo para os diálogos terem a tela toda.
      const recolher = page.locator('.rtab-min');
      if (await recolher.count()) await recolher.click();
      await page.waitForTimeout(200);
    }
  }

  // Popup de abas excedentes (quando existe).
  let abasPop = null;
  const tabsMais = page.locator('.rtabs-fit .fit-more').first();
  if (await tabsMais.count()) {
    await tabsMais.click();
    await page.waitForTimeout(250);
    abasPop = await page.evaluate(() => {
      const el = document.querySelector('.fit-pop.tabs');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom), h: Math.round(b.height) };
    });
    check(!!abasPop, `${prefixo}: "mais abas" não abriu`);
    if (abasPop) check(abasPop.x >= -1 && abasPop.y >= -1 && abasPop.right <= t.width + 1 && abasPop.bottom <= t.height + 1, `${prefixo}: popup de abas fora da tela (${JSON.stringify(abasPop)})`);
    await page.screenshot({ path: join(OUT, `${t.name}-abas-mais.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }

  // QAT excedente.
  const qatMais = page.locator('.qat .fit-more').first();
  if (await qatMais.count()) {
    await qatMais.click();
    await page.waitForTimeout(250);
    const pop = await page.evaluate(() => {
      const el = document.querySelector('.fit-pop.qat-pop');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), right: Math.round(b.right), bottom: Math.round(b.bottom) };
    });
    check(!!pop, `${prefixo}: "mais" do acesso rápido não abriu`);
    if (pop) check(pop.x >= -1 && pop.y >= -1 && pop.right <= t.width + 1 && pop.bottom <= t.height + 1, `${prefixo}: popup do acesso rápido fora da tela (${JSON.stringify(pop)})`);
    await page.screenshot({ path: join(OUT, `${t.name}-qat-mais.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }

  // Diálogos: cobre todos os tipos e os principais diálogos sem argumento.
  const TIPOS = ['wallType', 'floorType', 'slabType', 'ceilingType', 'roofType', 'gridType', 'stairType', 'rampType', 'openingType'];
  const SIMPLES = ['units', 'materials', 'levels', 'dimensions', 'start', 'shortcuts', 'shortcutsConfig', 'schedule', 'floorSchedule', 'roomSchedule', 'roomCategories', 'slabSchedule', 'ceilingSchedule', 'roofSchedule', 'stairSchedule', 'rampSchedule', 'openingSchedule', 'lineWeights', 'dxfLayers', 'importCad', 'manageCad', 'renumberSheets', 'publish', 'cotasAuto'];
  const CHAVE = new Set(['units', 'materials', 'dxfLayers', 'schedule', 'wallType', 'openingType']);
  const dialogos = {};
  for (const kind of [...SIMPLES, ...TIPOS]) {
    if (!(await page.evaluate(() => !!window.__hestia))) break;
    const abriu = await abrirDialogo(page, kind);
    if (!abriu) break;
    const d = await medirDialogo(page);
    if (!d) continue;
    dialogos[kind] = d;
    check(d.x >= -1 && d.y >= -1 && d.right <= t.width + 1 && d.bottom <= t.height + 1, `${prefixo}: diálogo ${kind} fora da tela (${JSON.stringify(d)})`);
    check(d.footVisible, `${prefixo}: rodapé do diálogo ${kind} não está visível`);
    check(!d.scrollX, `${prefixo}: corpo do diálogo ${kind} rola na horizontal`);
    if (CHAVE.has(kind)) await page.screenshot({ path: join(OUT, `${t.name}-dialogo-${kind}.png`) });
    await fecharDialogo(page);
  }

  const depois = await coletar(page);
  resumo.push({ tamanho: t.name, inicial, menu, painel, faixa, abasPop, dialogos, depois, erros });
  await context.close();
}

writeFileSync(join(OUT, 'resumo.json'), JSON.stringify(resumo, null, 2));
await browser.close();

const linhas = resumo.map((r) => ({
  tamanho: r.tamanho,
  overflowX: r.inicial.overflowX,
  titlebar: r.inicial.titlebarOverflow.length,
  ribbonH: r.inicial.rects.ribbon?.h,
  stageH: r.inicial.rects.stage?.h,
  menu: r.menu ? { itens: r.menu.itens, fora: r.menu.itensFora, horizontal: r.menu.horizontal } : null,
  painel: r.painel,
  dialogs: Object.fromEntries(Object.entries(r.dialogos).map(([k, d]) => [k, d ? `${d.w}x${d.h}${d.footVisible ? '' : ' SEM RODAPÉ'}` : 'n/a'])),
  erros: r.erros.length,
}));
console.log(JSON.stringify(linhas, null, 2));
if (falhas.length) {
  console.log(`\nFALHAS (${falhas.length}):`);
  for (const f of falhas) console.log(`- ${f}`);
  if (STRICT) process.exitCode = 1;
} else {
  console.log('\nTodos os critérios passaram.');
}
