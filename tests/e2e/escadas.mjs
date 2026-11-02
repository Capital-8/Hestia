// Escadas ponta a ponta na interface real (decisão 0011): casa de dois níveis, escada reta/L/U (Q), croqui (I) com erro,
// propriedades, furo derivado na laje, tabela e CSV, desfazer/refazer e corte. Gera imagens em $SHOTS para inspeção.
// Para no primeiro passo que não se confirma (exit 1), com a mensagem do passo e um resumo.
//   npm run build && SHOTS=<pasta> node tests/e2e/escadas.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { clickWorld, launch, makeReporter, openApp, pressTool } from './helpers.mjs';
import { checkShot } from './visual.mjs';

const OUT = process.env.SHOTS ?? 'test-results/escadas';
mkdirSync(OUT, { recursive: true });
const FIXTURE = path.resolve('packages/engine/src/fixtures/casa-2-quartos.hestia.json');

// Premissas (decisão 0011): pé-direito entre Térreo e Pavimento 2 = 3,00 m; espelho máximo do tipo = 0,18 m;
// piso mínimo = 0,28 m; regra do piso calculado p = clamp(0,63 − 2h; 0,28; 0,32).
const H_TERREO = 3.0;
const N_RETA = Math.ceil(H_TERREO / 0.18 - 1e-9); // 17 espelhos

const rep = makeReporter();
const browser = await launch();
const { page, errors } = await openApp(browser);
const shot = (name, target) => (target ?? page.locator('.canvas-wrap')).screenshot({ path: path.join(OUT, name) });
// Captura determinística da planta/3D comparada com tests/e2e/baseline (G6); as de corpo inteiro (status, relógio) seguem com `shot`.
const snap = (name) => checkShot(rep, page.locator('.canvas-wrap'), name, { out: OUT });
const statusText = () => page.locator('footer.statusbar .msg').innerText();
const counter = () => page.locator('.stair-counter').innerText();

const state = () => page.evaluate(() => {
  const { editor, useUi } = window.__hestia;
  const stairs = Object.values(editor.project.elements).filter((e) => e.kind === 'stair');
  return {
    tool: editor.activeTool?.id ?? null,
    view: useUi.getState().view,
    selection: useUi.getState().selection,
    canUndo: editor.store.canUndo,
    stairs: stairs.map((s) => ({
      id: s.id,
      levelId: s.levelId,
      topLevelId: s.topLevelId,
      openingMode: s.openingMode,
      generatedBy: s.generatedBy ?? s.components.find((c) => c.generatedBy)?.generatedBy ?? null,
      runs: s.components.filter((c) => c.kind === 'run').length,
      landings: s.components.filter((c) => c.kind === 'landing').length,
      risers: s.components.reduce((n, c) => n + (c.kind === 'run' ? c.risers.length : 0), 0),
      topOffset: s.topOffset,
    })),
    views: editor.project.views.map((v) => ({ id: v.id, name: v.name, kind: v.kind })),
  };
});

/** Furos da laje no nível: área líquida (contornos externos menos furos) e caixa de cada furo. */
const slabHoles = (levelId) => page.evaluate((lv) => {
  const { editor, resolveSlabs } = window.__hestia;
  const area = (r) => {
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i]; const q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; }
    return Math.abs(a) / 2;
  };
  const box = (r) => ({ minX: Math.min(...r.map((p) => p.x)), minY: Math.min(...r.map((p) => p.y)), maxX: Math.max(...r.map((p) => p.x)), maxY: Math.max(...r.map((p) => p.y)) });
  const slabs = resolveSlabs(editor.project, lv);
  let total = 0;
  const holes = [];
  for (const s of slabs) {
    for (const poly of s.polygon) {
      const [outer, ...inner] = poly;
      total += area(outer);
      for (const h of inner) { total -= area(h); holes.push(box(h)); }
    }
  }
  return { slabs: slabs.length, area: total, holes };
}, levelId);

/** Valor de uma linha do painel de propriedades (campo editável ou quantitativo), pelo rótulo. */
const propValue = (label) => page.evaluate((l) => {
  const row = [...document.querySelectorAll('.prow')].find((r) => r.querySelector('label')?.textContent.trim() === l);
  if (!row) return null;
  return row.querySelector('.val')?.textContent ?? row.querySelector('input')?.value ?? null;
}, label);

const fixPlanView = () => page.evaluate(() => {
  // Vista fixa: zoom 28 px/m (grade de snap de 0,5 m; com zoom menor a grade vira 1 m e arredonda os cliques),
  // x de −7 a 25,6 m e y de −7,9 a 12,9 m: a casa, a escada reta, o L, o U e o croqui cabem na tela.
  const { editor } = window.__hestia;
  const r = document.querySelector('.canvas-wrap').getBoundingClientRect();
  editor.setViewport({ cx: 9.3, cy: 2.5, zoom: 28, width: Math.round(r.width), height: Math.round(r.height) });
});

async function goLevel(name) {
  await page.getByRole('tab', { name }).click();
  await page.waitForTimeout(250);
  await fixPlanView();
  await page.waitForTimeout(120);
}

const parseStairMsg = (msg) => {
  const m = msg.match(/Escada criada: (\d+) espelhos de ([\d,]+) cm, piso ([\d,]+) cm/);
  return m ? { n: Number(m[1]), riser: m[2], tread: m[3] } : null;
};

try {
  await rep.step('1 · Abrir a casa de dois níveis (Abrir > arquivo)', async () => {
    await page.setInputFiles('#file-open', FIXTURE);
    await page.waitForFunction(() => window.__hestia.editor.fileName === 'casa-2-quartos.hestia.json');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const { editor } = window.__hestia;
      const els = Object.values(editor.project.elements);
      return {
        walls: els.filter((e) => e.kind === 'wall' && e.levelId === 'lv_0').length,
        levels: editor.project.levels.map((l) => `${l.name}@${l.elevation}`).join(', '),
        schema: editor.project.schemaVersion,
      };
    });
    rep.check('10 paredes no Térreo', s.walls === 10, `${s.walls}`);
    rep.check('dois níveis: Térreo 0 m, Pavimento 2 a 3 m', s.levels === 'Térreo@0, Pavimento 2@3', s.levels);
    await fixPlanView();
    await snap('00-casa');
  });

  await rep.step('2 · Laje retangular no Pavimento 2 cobrindo a casa (para ver o furo)', async () => {
    await goLevel(/Pavimento 2/);
    await pressTool(page, 'b');
    await page.locator('select', { has: page.locator('option[value="rect"]') }).selectOption('rect');
    await page.waitForTimeout(100);
    await clickWorld(page, 0, 0);
    await clickWorld(page, 10, 7);
    await page.waitForTimeout(200);
    const h = await slabHoles('lv_1');
    rep.check('uma laje no Pavimento 2', h.slabs === 1, `${h.slabs}`);
    rep.check('área ≈ 70 m² (10 × 7), sem furo', Math.abs(h.area - 70) < 0.5 && h.holes.length === 0, `${h.area.toFixed(3)} m², ${h.holes.length} furos`);
    await snap('01-nivel2-laje');
  });

  await rep.step('3 · Escada reta (Q, forma Reta): clique no 1º espelho e na direção', async () => {
    await goLevel(/Térreo/);
    await pressTool(page, 'q');
    await page.waitForTimeout(100);
    rep.check('ferramenta Escada reta/L/U ativa (Q)', (await state()).tool === 'stairrun');
    await page.locator('#opt-stairshape').selectOption('straight');
    await clickWorld(page, 4.5, 4.5);
    await clickWorld(page, 5.5, 4.5);
    await page.waitForTimeout(200);
    const msg = await statusText();
    const m = parseStairMsg(msg);
    rep.check(`mensagem "Escada criada: ${N_RETA} espelhos…"`, !!m && m.n === N_RETA, msg.slice(0, 110));
    rep.check('espelho de 3,00 / 17 ≈ 17,6 cm', !!m && Math.abs(parseFloat(m.riser.replace(',', '.')) - (H_TERREO / N_RETA) * 100) < 0.06, m?.riser);
    rep.check('piso mínimo 28,0 cm', !!m && m.tread === '28,0', m?.tread);
    const s = await state();
    const reta = s.stairs.find((x) => x.generatedBy === 'straight');
    rep.check('1 escada no projeto, gerada como Reta', s.stairs.length === 1 && !!reta, `${s.stairs.length} escada(s)`);
    rep.check(`${N_RETA} linhas de espelho no modelo`, reta?.risers === N_RETA, `${reta?.risers}`);
    rep.check('nível de topo automático (o Pavimento 2)', reta?.topLevelId === null && reta?.runs === 1, JSON.stringify({ topo: reta?.topLevelId, lances: reta?.runs }));
    await snap('planta-reta');
  });

  await rep.step('4 · Escada em L (forma Em L)', async () => {
    await page.locator('#opt-stairshape').selectOption('lshape');
    await clickWorld(page, 13.5, 0.6);
    await clickWorld(page, 14.5, 0.6);
    await page.waitForTimeout(200);
    const msg = await statusText();
    const m = parseStairMsg(msg);
    rep.check(`mensagem "Escada criada: ${N_RETA} espelhos…"`, !!m && m.n === N_RETA, msg.slice(0, 110));
    const s = await state();
    const l = s.stairs.find((x) => x.generatedBy === 'lshape');
    rep.check('2 escadas no projeto', s.stairs.length === 2, `${s.stairs.length}`);
    rep.check(`L: 2 lances, 1 patamar e ${N_RETA} espelhos`, l?.runs === 2 && l?.landings === 1 && l?.risers === N_RETA, JSON.stringify(l));
    await snap('planta-L');
  });

  await rep.step('5 · Escada em U (forma Em U)', async () => {
    await page.locator('#opt-stairshape').selectOption('ushape');
    await clickWorld(page, 19.5, 0.6);
    await clickWorld(page, 20.5, 0.6);
    await page.waitForTimeout(200);
    const msg = await statusText();
    const m = parseStairMsg(msg);
    rep.check(`mensagem "Escada criada: ${N_RETA} espelhos…"`, !!m && m.n === N_RETA, msg.slice(0, 110));
    const s = await state();
    const u = s.stairs.find((x) => x.generatedBy === 'ushape');
    rep.check('3 escadas no projeto', s.stairs.length === 3, `${s.stairs.length}`);
    rep.check(`U: 2 lances, 1 patamar e ${N_RETA} espelhos`, u?.runs === 2 && u?.landings === 1 && u?.risers === N_RETA, JSON.stringify(u));
    await snap('planta-U');
  });

  await rep.step('6 · Furo derivado na laje do Pavimento 2 sobre a escada reta', async () => {
    const h = await slabHoles('lv_1');
    const retirada = 70 - h.area;
    rep.check('a laje perdeu área (furo)', retirada > 1.0, `${retirada.toFixed(2)} m² retirados`);
    // Geometria real da escada reta: espelhos (linhas) de x_min a x_max, centrados em y_c. O furo começa nos degraus altos
    // (cota acima de topo − laje − folga) e vai até o último espelho, dentro da largura do lance.
    const g = await page.evaluate(() => {
      const s = Object.values(window.__hestia.editor.project.elements).find((e) => e.kind === 'stair' && e.components.some((c) => c.generatedBy === 'straight'));
      const risers = s.components.filter((c) => c.kind === 'run').flatMap((c) => c.risers);
      const xs = risers.map((r) => r.a.x);
      const yc = risers.reduce((acc, r) => acc + (r.a.y + r.b.y) / 2, 0) / risers.length;
      return { xmin: Math.min(...xs), xmax: Math.max(...xs), yc };
    });
    const sobre = h.holes.find((b) => b.minX >= g.xmin && b.minX < g.xmax - 1 && b.maxX >= g.xmax - 0.3 && b.minY <= g.yc - 0.5 && b.maxY >= g.yc + 0.5);
    rep.check(`furo sobre a escada reta (x ${g.xmin.toFixed(2)}–${g.xmax.toFixed(2)}; y ${g.yc.toFixed(2)} ± 0,6)`, !!sobre, JSON.stringify(sobre ?? h.holes));
    const fora = h.holes.every((b) => b.maxX < 12);
    rep.check('L e U (fora da laje) não furam a laje', fora, `${h.holes.length} furo(s)`);
    await goLevel(/Pavimento 2/);
    await snap('planta-nivel2-furo');
    await page.getByRole('tab', { name: /Modelo 3D/ }).click();
    await page.waitForTimeout(1500);
    rep.check('vista 3D ativa', (await state()).view === '3d');
    await snap('3d-escada');
    await goLevel(/Térreo/);
  });

  await rep.step('7 · Croqui (I): limites, espelhos, contador e erro de espelho', async () => {
    await pressTool(page, 'i');
    await page.waitForTimeout(150);
    rep.check('ferramenta Escada (croqui, I) ativa', (await state()).tool === 'stair');
    // Topo 2 m abaixo do Pavimento 2: H = 1,00 m; 1,00 / 0,18 → 6 espelhos desejados.
    await page.locator('#opt-stairtopoff').fill('-2');
    await page.locator('#opt-stairtopoff').evaluate((el) => el.blur());
    await page.waitForTimeout(150);
    rep.check('contador: 6 espelhos desejados (H = 1,00 m)', (await counter()) === 'Espelhos: 0 criados, 6 restantes', await counter());
    // Limites: cada um com 2 cliques e Enter (esquerdo, depois direito).
    await clickWorld(page, -6.0, 0.0);
    await clickWorld(page, -6.0, 5.0);
    await page.keyboard.press('Enter');
    rep.check('Enter fecha o limite esquerdo', /Limite esquerdo fechado/.test(await statusText()), await statusText());
    await clickWorld(page, -5.0, 0.0);
    await clickWorld(page, -5.0, 5.0);
    await page.keyboard.press('Enter');
    const espelhos = page.locator('.stair-modes button', { hasText: 'Espelhos' });
    rep.check('Enter fecha o direito e passa a Espelhos', (await espelhos.getAttribute('aria-pressed')) === 'true');
    const riser = async (y, x1 = -6.5, x2 = -4.5) => { await clickWorld(page, x1, y); await clickWorld(page, x2, y); };
    for (const y of [0.5, 1.0, 1.5]) await riser(y);
    rep.check('3 espelhos: "Espelhos: 3 criados, 3 restantes"', (await counter()) === 'Espelhos: 3 criados, 3 restantes', await counter());
    await shot('croqui-andamento.png', page.locator('body'));
    // Erro: espelho que não liga os dois limites (termina antes do direito).
    await riser(6.0, -6.0, -5.5);
    await page.waitForTimeout(150);
    const note = await page.locator('.stair-note').innerText().catch(() => '');
    rep.check('erro na barra: "Cada espelho deve ligar o limite esquerdo ao direito."', note.includes('Cada espelho deve ligar o limite esquerdo ao direito.'), note);
    rep.check('contador conta o espelho com erro', (await counter()) === 'Espelhos: 4 criados, 2 restantes', await counter());
    await shot('croqui-erro.png', page.locator('body'));
    await page.locator('button[title^="Grava a escada"]').click();
    await page.waitForTimeout(150);
    rep.check('Concluir recusado com a mesma causa', (await statusText()).includes('Não é possível concluir: Cada espelho deve ligar'), await statusText());
    rep.check('nada criado enquanto o croqui tem erro', (await state()).stairs.length === 3);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(120);
    rep.check('Delete remove o espelho com erro', (await counter()) === 'Espelhos: 3 criados, 3 restantes', await counter());
    for (const y of [2.5, 3.5, 4.5]) await riser(y);
    rep.check('6 espelhos: "Espelhos: 6 criados, 0 restantes"', (await counter()) === 'Espelhos: 6 criados, 0 restantes', await counter());
    await page.locator('button[title^="Grava a escada"]').click();
    await page.waitForTimeout(200);
    const msg = await statusText();
    rep.check('"Escada criada: 6 espelhos"', /Escada criada: 6 espelhos/.test(msg), msg.slice(0, 110));
    const s = await state();
    rep.check('4 escadas; a do croqui tem 6 espelhos e não é gerada', s.stairs.length === 4 && s.stairs.some((x) => x.risers === 6 && x.generatedBy === null), `${s.stairs.length} escadas`);
    await snap('escada-croqui-concluida');
  });

  await rep.step('8 · Desfazer (Ctrl+Z) e refazer (Ctrl+Y) a escada do croqui', async () => {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(150);
    let s = await state();
    rep.check('Ctrl+Z remove a escada do croqui', s.stairs.length === 3 && !s.stairs.some((x) => x.risers === 6), `${s.stairs.length} escadas`);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(150);
    s = await state();
    rep.check('Ctrl+Y recria a escada do croqui', s.stairs.length === 4 && s.stairs.some((x) => x.risers === 6), `${s.stairs.length} escadas`);
  });

  await rep.step('9 · Seleção da escada reta: painel de propriedades', async () => {
    await pressTool(page, 'v');
    await clickWorld(page, 7.2, 4.5);
    await page.waitForTimeout(200);
    const s = await state();
    const reta = s.stairs.find((x) => x.generatedBy === 'straight');
    rep.check('escada reta selecionada', s.selection.length === 1 && s.selection[0] === reta?.id, JSON.stringify(s.selection));
    rep.check('abertura da laje "Pé-direito livre"', (await page.locator('#p-sopenmode').inputValue()) === 'headroom');
    rep.check('campos de tipo, níveis e deslocamentos', (await page.locator('#prop-stairtype').count()) === 1 && (await page.locator('#p-sbase').count()) === 1 && (await page.locator('#p-stopoff').count()) === 1);
    const n = await propValue('Nº de espelhos');
    rep.check(`quantitativo "Nº de espelhos" = ${N_RETA}`, n === String(N_RETA), `${n}`);
    const alt = await propValue('Altura do espelho');
    rep.check('quantitativo "Altura do espelho" ≈ 0,176 m', alt?.startsWith('0,17') || alt?.startsWith('0.17'), `${alt}`);
    const area = await propValue('Área em planta');
    const vol = await propValue('Volume');
    console.log(`  info: área em planta ${area}, volume ${vol}`);
    await shot('propriedades-escada.png', page.locator('body'));
  });

  await rep.step('10 · Abertura "Sem abertura" remove o furo; "Pé-direito livre" o recria', async () => {
    await page.locator('#p-sopenmode').selectOption('none');
    await page.waitForTimeout(200);
    let h = await slabHoles('lv_1');
    rep.check('desligado: laje inteira (≈ 70 m², sem furo)', Math.abs(h.area - 70) < 0.5 && h.holes.length === 0, `${h.area.toFixed(3)} m²`);
    await goLevel(/Pavimento 2/);
    await snap('nivel2-furo-desligado');
    await goLevel(/Térreo/);
    await clickWorld(page, 7.2, 4.5);
    await page.waitForTimeout(200);
    await page.locator('#p-sopenmode').selectOption('headroom');
    await page.waitForTimeout(200);
    h = await slabHoles('lv_1');
    rep.check('ligado de novo: furo volta', 70 - h.area > 1.0, `${(70 - h.area).toFixed(2)} m² retirados`);
  });

  await rep.step('11 · Tabela de escadas (Vista > Documentar) e exportação CSV', async () => {
    await page.locator('.rtab:visible', { hasText: 'Vista' }).click();
    await page.locator('.rb-bottom', { hasText: 'Tabelas' }).click();
    await page.getByRole('menuitem', { name: 'Tabela de escadas' }).click();
    await page.waitForTimeout(300);
    const dlg = page.getByRole('dialog', { name: 'Tabela de escadas' });
    rep.check('diálogo "Tabela de escadas" abriu', await dlg.isVisible());
    const linhas = await dlg.locator('table.wsched tbody tr').count();
    rep.check('4 linhas (uma por escada)', linhas === 4, `${linhas}`);
    const texto = await dlg.innerText();
    rep.check('linha da escada reta com 17 espelhos', texto.includes(String(N_RETA)), '');
    await shot('tabela-escadas.png', page.locator('[role=dialog]'));
    const [dl] = await Promise.all([page.waitForEvent('download'), dlg.getByRole('button', { name: 'Exportar CSV' }).click()]);
    const file = path.join(OUT, 'tabela-escadas.csv');
    await dl.saveAs(file);
    const linhasCsv = readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    rep.check('CSV: cabeçalho + 4 escadas', linhasCsv.length >= 5, `${linhasCsv.length} linhas`);
    rep.check('CSV contém a escada reta (17) e a do croqui (6)', linhasCsv.some((l) => /\b17\b/.test(l)) && linhasCsv.some((l) => /\b6\b/.test(l)));
    console.log(`  info: ${linhasCsv.slice(0, 2).join(' | ')}`);
    await dlg.getByRole('button', { name: 'Fechar' }).first().click();
    await page.waitForTimeout(150);
  });

  await rep.step('12 · Corte: linha pela escada e vista de corte', async () => {
    await goLevel(/Térreo/);
    await pressTool(page, 'k');
    await clickWorld(page, 7.0, 1.0);
    await clickWorld(page, 7.0, 6.0);
    await page.waitForTimeout(200);
    const s = await state();
    const sec = s.views.find((v) => v.kind === 'section');
    rep.check('vista de corte criada', !!sec, sec?.name ?? 'nenhum corte');
    await page.locator('button.leaf', { hasText: sec.name }).dblclick();
    await page.waitForTimeout(400);
    rep.check('vista de corte aberta', (await state()).view === 'section');
    const r = await page.evaluate(async (id) => { const x = await window.__hestia.editor.sectionReady(id); return x ? { cortes: x.cut.length, alcance: x.beyond.length } : null; }, sec.id);
    rep.check('o corte tem regiões cortadas', !!r && r.cortes > 0, JSON.stringify(r));
    await snap('corte-escada');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    rep.check('Esc volta à planta', (await state()).view === 'plan');
  });

  await rep.step('13 · Sem erros de console ou de página', async () => {
    rep.check('nenhum erro de console/página', errors.length === 0, errors.slice(0, 3).join(' | '));
  });
} catch (e) {
  // Só chega aqui um erro fora dos passos (navegador caiu, por exemplo).
  console.log(`\nFALHA INESPERADA: ${e.stack ?? e.message}`);
  await page.screenshot({ path: path.join(OUT, 'erro.png') }).catch(() => {});
  rep.summary();
  await browser.close();
  process.exit(1);
}

rep.summary();
const falhas = rep.steps.filter((s) => s.status === 'FAIL').length;
console.log(falhas ? `\nFALHOU: ${falhas} de ${rep.steps.length} passos (ver acima).` : `\nTodos os ${rep.steps.length} passos confirmados.`);
console.log(`Imagens em: ${path.resolve(OUT)}`);
await browser.close();
process.exit(falhas ? 1 : 0);
