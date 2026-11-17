// Paredes da massa com torção (frente massa-paredes-torcidas, M2) no navegador, sobre o servidor de desenvolvimento (kernel Rust ligado). Cria a torre
// torcida (quadrado de lado 8, 9 m, giro de 60°) por comando do modelo, abre o diálogo "Paredes da massa" pela faixa, gera com ALVENARIA e depois com
// CORTINA DE VIDRO, confere por dados (n.º de paredes, tilt, base e altura, tipo, linha de localização, origemMassa), abre 3D e planta sem erro de console,
// põe uma porta numa parede inclinada de alvenaria e confere que Ctrl+Z desfaz cada geração num passo. Capturas: nenhuma (conferência por dados).
//   (em apps/web) npx vite --host 127.0.0.1 --port 4196 --strictPort    e depois    APP=http://127.0.0.1:4196/?gl=1&debug=1 node tests/e2e/massa-paredes-torcidas.mjs
import { chromium } from 'playwright-core';
import { abreVista3d } from './helpers.mjs';
import { aba, botaoDoPainel, criarRelatorio, coletarErros, dialogo, resumoErro } from './massaHelpers.mjs';

const URL_APP = process.env.APP ?? 'http://127.0.0.1:4196/?gl=1&debug=1';
const rel = criarRelatorio();
const { check, errosPagina } = rel;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
coletarErros(page, errosPagina);
// O servidor de desenvolvimento não responde ao favicon (o app não declara ícone, achado conhecido): 204 para o 404 não mascarar erros de verdade.
await page.route('**/favicon.ico', (r) => r.fulfill({ status: 204 }));

async function passo(nome, fn) {
  console.log(`\n== ${nome}`);
  try {
    await fn();
  } catch (e) {
    check(`${nome}: sem exceção`, false, resumoErro(e));
  }
}

const paredesDaMassa = () => page.evaluate(() => Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'wall' && e.origemMassa).map((w) => JSON.parse(JSON.stringify(w))));
/** Portas hospedadas nas paredes geradas pela massa (as da casa de exemplo não contam). */
const portasNasGeradas = () => page.evaluate(() => { const els = Object.values(window.__hestia.editor.project.elements); const ids = new Set(els.filter((e) => e.kind === 'wall' && e.origemMassa).map((w) => w.id)); return els.filter((e) => e.kind === 'door' && ids.has(e.hostId)).length; });
const quase = (a, b, tol) => Math.abs(a - b) <= tol;

try {
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__hestia, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__hestiaKernel?.estado().ativo === true, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__hestia.editor.newProject('house2');
    window.__hestia.useUi.setState({ tela: 'editor' });
  });
  await page.waitForTimeout(800);

  let ids = {};
  await passo('1. Torre torcida e níveis (comando do modelo)', async () => {
    ids = await page.evaluate(() => {
      const { editor, model } = window.__hestia;
      const base = [...editor.project.levels].sort((a, b) => a.elevation - b.elevation)[0];
      const e0 = base.elevation;
      const niv = [3, 6].map((d) => ({ id: `e2e_${d}`, d }));
      for (const n of niv) editor.applyCommand({ type: 'upsertLevel', level: model.makeLevel({ id: n.id, name: `E2E ${n.d} m`, elevation: e0 + n.d }) });
      const sec = (z, rotacao) => ({ z, perfil: { forma: 'poligono', lados: 4, raio: 4 * Math.SQRT2 }, rotacao, escala: 1, dx: 0, dy: 0 });
      // Giro de 60° em 9 m (20° por nível de 3 m); o topo da massa (9 m) cai sem nível acima.
      const m = model.makeMass({ id: 'm_e2e', levelId: base.id, name: 'Torre torcida', secoes: [sec(0, 0), sec(9, Math.PI / 3)] });
      editor.applyCommand({ type: 'addMass', mass: m });
      return { base: base.id, e0, niveis: [base.id, 'e2e_3', 'e2e_6'] };
    });
    const p = await page.evaluate(() => ({ massas: Object.values(window.__hestia.editor.project.elements).filter((e) => e.kind === 'mass').length, niveis: window.__hestia.editor.project.levels.length }));
    check('torre torcida criada', p.massas === 1, `${p.massas} massa(s), ${p.niveis} níveis`);
  });

  /** Abre o diálogo com a massa selecionada, deixa só os 3 níveis da torre e escolhe modo e tipo; devolve o diálogo. */
  const abrirDialogo = async ({ modo, tipo }) => {
    await page.evaluate((m) => window.__hestia.useUi.setState({ selection: [m], view: 'plan' }), 'm_e2e');
    await aba(page, 'Massa e terreno');
    await botaoDoPainel(page, 'Modelo por massa', 'Paredes da massa').click();
    const d = dialogo(page, 'Paredes da massa');
    await d.waitFor({ timeout: 8000 });
    const todos = await d.locator('[id^="mw-nivel-"]').evaluateAll((els) => els.map((e) => e.id));
    for (const id of todos) {
      const c = d.locator(`#${id}`);
      if (ids.niveis.some((n) => id === `mw-nivel-${n}`)) await c.check(); else await c.uncheck();
    }
    await d.locator('#mw-modo').selectOption(modo);
    await d.locator('#mw-tipo-id').selectOption(tipo);
    await page.waitForTimeout(600);
    return d;
  };

  let alvenaria = [];
  await passo('2. Alvenaria, um passo por nível: 12 paredes inclinadas', async () => {
    const tipoAlv = await page.evaluate(() => Object.values(window.__hestia.editor.project.wallTypes).find((t) => t.family !== 'curtain').id);
    const d = await abrirDialogo({ modo: 'porNivel', tipo: tipoAlv });
    const previa = await d.locator('.hint').allInnerTexts();
    check('prévia mostra 12 paredes em 3 passos', previa.some((t) => /12 parede/.test(t) && /3 passo/.test(t)), previa.join(' | ').slice(0, 160));
    await d.getByRole('button', { name: 'Gerar', exact: true }).click();
    await d.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    alvenaria = await paredesDaMassa();
    check('12 paredes com origemMassa', alvenaria.length === 12, String(alvenaria.length));
    check('todas do tipo de alvenaria', alvenaria.every((w) => w.typeId === tipoAlv));
    // Giro de 20° por nível, apótema 4: d = 4(1/cos20° − 1) = 0,25738; tilt = atan(d/3) = 4,9047° (o kernel mede 4,891°: giro de 20,016° no nível de 3 m).
    check('tilt de 4,90° (±0,02) em todas', alvenaria.every((w) => quase(w.tilt ?? 0, 4.9, 0.02)), [...new Set(alvenaria.map((w) => (w.tilt ?? 0).toFixed(3)))].join(','));
    check('base 0 (relativa ao nível) e altura 3 m; nível de topo nos 8 dos dois primeiros níveis e altura fixa nos 4 do último (sem nível acima)', alvenaria.every((w) => quase(w.baseOffset, 0, 1e-9) && quase(w.height, 3, 1e-9)) && alvenaria.filter((w) => w.topLevelId).length === 8 && alvenaria.filter((w) => !w.topLevelId && w.levelId === ids.niveis[2]).length === 4, String(alvenaria.filter((w) => w.topLevelId).length));
    check('linha de localização: face externa (finishExterior)', alvenaria.every((w) => w.locationLine === 'finishExterior'));
    check('as paredes ficam nos 3 níveis, 4 em cada', ids.niveis.every((n) => alvenaria.filter((w) => w.levelId === n).length === 4));
  });

  await passo('3. 3D e planta abrem sem erro', async () => {
    const antes = errosPagina.length;
    await abreVista3d(page);
    await page.waitForTimeout(2500);
    const malhas = await page.evaluate(() => { let n = 0; window.__hestia3dModel?.scene.traverse((o) => { if (o.isMesh && o.userData.kind === 'wall') n++; }); return n; });
    check('3D: malhas de parede na cena', malhas > 0, String(malhas));
    await page.evaluate(() => window.__hestia.editor.setView('plan'));
    await page.waitForTimeout(1200);
    check('3D e planta: nenhum erro novo de console', errosPagina.length === antes, errosPagina.slice(antes).join(' | ').slice(0, 200));
  });

  await passo('4. Porta numa parede inclinada de alvenaria', async () => {
    const r = await page.evaluate((id) => {
      const { editor, model } = window.__hestia;
      const oid = model.newId('op');
      try {
        editor.applyCommand({ type: 'addOpening', opening: { id: oid, kind: 'door', typeId: 'ot_p80', hostId: id, offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
      } catch (e) { return { erro: String(e) }; }
      const o = editor.project.elements[oid];
      return { ok: !!o, host: o?.hostId };
    }, alvenaria[0].id);
    check('porta criada na parede inclinada, sem erro', r.ok === true && r.host === alvenaria[0].id, JSON.stringify(r));
    await page.evaluate(() => window.__hestia.editor.setView('3d'));
    await page.waitForTimeout(1500);
  });

  await passo('5. Gerar de novo substitui e pede confirmação (a porta sai junto)', async () => {
    const d = await abrirDialogo({ modo: 'porNivel', tipo: alvenaria[0].typeId });
    const aviso = await d.locator('.hint').allInnerTexts();
    check('aviso de abertura hospedada que será removida', aviso.some((t) => /1 abertura/.test(t)), aviso.join(' | ').slice(0, 200));
    await d.getByRole('button', { name: 'Gerar', exact: true }).click();
    await page.waitForTimeout(300);
    check('1º clique só pede confirmação (nada mudou, diálogo aberto)', (await d.isVisible()) && (await paredesDaMassa()).length === 12 && (await portasNasGeradas()) === 1);
    await d.getByRole('button', { name: 'Confirmar e substituir', exact: true }).click();
    await d.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    const ws = await paredesDaMassa();
    const portas = await portasNasGeradas();
    check('ainda 12 paredes (substituiu, não duplicou) e a porta saiu', ws.length === 12 && portas === 0, `${ws.length} paredes, ${portas} portas`);
    await page.evaluate(() => window.__hestia.editor.undo());
    await page.waitForTimeout(300);
    check('Ctrl+Z restaura as 12 paredes antigas e a porta num passo', (await paredesDaMassa()).length === 12 && (await portasNasGeradas()) === 1);
    await page.evaluate(() => window.__hestia.editor.undo());
    await page.waitForTimeout(300);
    check('mais um Ctrl+Z desfaz só a porta (as 12 paredes ficam)', (await paredesDaMassa()).length === 12 && (await portasNasGeradas()) === 0);
    await page.evaluate(() => window.__hestia.editor.undo());
    await page.waitForTimeout(300);
    const aposTres = await paredesDaMassa();
    check('mais um Ctrl+Z desfaz a 1ª geração inteira (12 paredes de uma vez)', aposTres.length === 0, String(aposTres.length));
  });

  await passo('6. Cortina de vidro: um passo por nível, tipo de cortina, tilt aceito', async () => {
    const tipoCortina = await page.evaluate(() => Object.values(window.__hestia.editor.project.wallTypes).find((t) => t.family === 'curtain').id);
    const d = await abrirDialogo({ modo: 'porNivel', tipo: tipoCortina });
    check('escolher cortina põe o modo "Um passo por nível"', (await d.locator('#mw-modo').inputValue()) === 'porNivel');
    await d.getByRole('button', { name: 'Gerar', exact: true }).click();
    await d.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    const ws = await paredesDaMassa();
    check('12 paredes de cortina com tilt de 4,90°', ws.length === 12 && ws.every((w) => w.typeId === tipoCortina && quase(w.tilt ?? 0, 4.9, 0.02)), `${ws.length}`);
    check('linha de localização: face externa', ws.every((w) => w.locationLine === 'finishExterior'));
    await abreVista3d(page);
    await page.waitForTimeout(4000);
    const vidros = await page.evaluate(() => { let n = 0; window.__hestia3dModel?.scene.traverse((o) => { if (o.isMesh && o.material?.transparent) n++; }); return n; });
    check('3D: há malha transparente (vidro) na cena', vidros > 0, String(vidros));
    const erros = await page.evaluate(() => window.__hestia.model.validateProject(window.__hestia.editor.project).filter((i) => i.severity === 'error').map((i) => i.code));
    check('projeto sem erro de validação com a cortina inclinada', erros.length === 0, erros.join(','));
    await page.evaluate(() => window.__hestia.editor.undo());
    await page.waitForTimeout(300);
    check('Ctrl+Z desfaz as 12 paredes de cortina', (await paredesDaMassa()).length === 0);
  });

  await passo('7. Tipo diferente por fachada: alvenaria nas faces N e S, cortina nas demais', async () => {
    const t = await page.evaluate(() => { const ts = Object.values(window.__hestia.editor.project.wallTypes); return { alv: ts.find((x) => x.family !== 'curtain').id, cor: ts.find((x) => x.family === 'curtain').id }; });
    const d = await abrirDialogo({ modo: 'porNivel', tipo: t.alv });
    await d.locator('#mw-por-fachada').check();
    await d.locator('#mw-fachada-l').selectOption(t.cor);
    await d.locator('#mw-fachada-o').selectOption(t.cor);
    await d.locator('#mw-modo').selectOption('porNivel');
    await d.getByRole('button', { name: 'Gerar', exact: true }).click();
    await d.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    const ws = await paredesDaMassa();
    const nCor = ws.filter((w) => w.typeId === t.cor).length;
    check('12 paredes, metade em cortina e metade em alvenaria (2 de cada fachada por nível... 6 e 6)', ws.length === 12 && nCor === 6, `${nCor} cortina`);
  });
} catch (e) {
  check('roteiro sem exceção', false, resumoErro(e));
}

check('nenhum erro de console ou de página no roteiro inteiro', errosPagina.length === 0, errosPagina.slice(0, 3).join(' | ').slice(0, 300));
await browser.close();
console.log(`\n${rel.falhas() === 0 ? 'TUDO OK' : `${rel.falhas()} FALHA(S)`}`);
process.exit(rel.falhas() === 0 ? 0 : 1);
