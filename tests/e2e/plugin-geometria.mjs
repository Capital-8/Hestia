// Geometria entregue a plugins, DENTRO do app (navegador + WebGL por software), contra a cena 3D viva.
// Uso: HESTIA_URL=http://localhost:5199 CHROME_PATH=<chrome.exe> node tests/e2e/plugin-geometria.mjs <projeto.hestia.json>...
// Para cada projeto: (A) abre o projeto SEM abrir a vista 3D e tenta ler a cena como o plugin faria;
// (B) abre a vista 3D, espera os níveis montarem e compara a extração com `exportarVetores()` da cena viva (multiconjunto exato).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { abreVista3d, CHROME_ARGS, chromeExecutable } from './helpers.mjs';

const base = process.env.HESTIA_URL ?? 'http://localhost:5199';
const projetos = process.argv.slice(2);
if (projetos.length === 0) { console.error('informe ao menos um projeto'); process.exit(2); }

const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const resultados = [];
for (const caminho of projetos) {
  const texto = readFileSync(caminho, 'utf8');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erros = [];
  page.on('crash', () => erros.push('[crash] a aba do navegador caiu'));
  page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}/?debug=1`);
  await page.waitForFunction(() => window.__hestia?.plugins, null, { timeout: 60000 });
  // O projeto é aberto pelo próprio editor (como o menu Arquivo faz) e a tela passa de "projetos" para o editor.
  const aberto = await page.evaluate((t) => { const r = window.__hestia.editor.openFromText(t, 'validacao.hestia.json'); if (r.ok) window.__hestia.useUi.setState({ tela: 'editor' }); return r; }, texto);
  await page.waitForSelector('.canvas-wrap canvas', { timeout: 60000 });
  if (!aberto.ok) { resultados.push({ projeto: caminho, erro: aberto.error }); await page.close(); continue; }

  // (A) Plugin lendo a cena antes de qualquer vista 3D ter sido aberta.
  const antes = await page.evaluate(() => {
    const { plugins, editor } = window.__hestia;
    const montou = plugins.prepararCena3D();
    const cena = plugins.lerCena3D();
    const c = plugins.buildSceneContent(editor.project, cena?.scene ?? null);
    return { prepararCena3D: montou, haCena3D: !!cena, entidades: c.entities.length, comMalha: c.entities.filter((e) => e.mesh).length };
  });

  // (B) Com a vista 3D aberta e os níveis montados.
  await abreVista3d(page);
  await page.waitForFunction(() => window.__hestia3dModel, null, { timeout: 120000 });
  // Estável: o total de triângulos da cena não muda em 2 leituras seguidas (montagem terminada).
  let ultimo = -1;
  for (let i = 0; i < 120; i++) {
    const n = await page.evaluate(() => window.__hestia3dModel.exportarVetores().trianglePositions.length);
    if (n > 0 && n === ultimo) break;
    ultimo = n;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(500);
  const depois = await page.evaluate(() => {
    const { plugins, editor } = window.__hestia;
    const m = window.__hestia3dModel;
    const t0 = performance.now();
    plugins.prepararCena3D();
    const cena = plugins.lerCena3D();
    const t1 = performance.now();
    const exatas = plugins.extractElementMeshes(cena.scene, false);
    const t2 = performance.now();
    const content = plugins.buildSceneContent(editor.project, cena.scene);
    const t3 = performance.now();
    const json = JSON.stringify({ t: 'scene.snapshot', snapshot: { entities: content.entities, materials: content.materials } });
    const t4 = performance.now();

    const verdade = m.exportarVetores().trianglePositions;
    const f = Math.fround;
    const chave = (pos, idx, i) => {
      const v = [0, 1, 2].map((q) => { const j = idx ? idx[i + q] : i + q; return `${f(pos[j * 3])},${f(pos[j * 3 + 1])},${f(pos[j * 3 + 2])}`; });
      return v.sort().join('|');
    };
    const mapaV = new Map();
    for (let i = 0; i + 2 < verdade.length / 3; i += 3) { const k = chave(verdade, null, i); mapaV.set(k, (mapaV.get(k) ?? 0) + 1); }
    const mapaO = new Map();
    let triExtraidos = 0;
    for (const mesh of exatas.values()) {
      for (let i = 0; i + 2 < mesh.indices.length; i += 3) { const k = chave(mesh.positions, mesh.indices, i); mapaO.set(k, (mapaO.get(k) ?? 0) + 1); triExtraidos += 1; }
    }
    let faltando = 0, sobrando = 0;
    for (const [k, c] of mapaV) faltando += Math.max(0, c - (mapaO.get(k) ?? 0));
    for (const [k, c] of mapaO) sobrando += Math.max(0, c - (mapaV.get(k) ?? 0));
    const porTipo = {};
    for (const e of Object.values(editor.project.elements)) porTipo[e.kind] = (porTipo[e.kind] ?? 0) + 1;
    return {
      niveis: editor.project.levels.length,
      elementos: Object.keys(editor.project.elements).length,
      porTipo,
      triangulosDaCena: verdade.length / 9,
      triangulosExtraidos: triExtraidos,
      faltandoNoPlugin: faltando,
      sobrandoNoPlugin: sobrando,
      igual: faltando === 0 && sobrando === 0,
      entidades: content.entities.length,
      semMalha: content.entities.filter((e) => !e.mesh).length,
      snapshotMiB: Math.round((json.length / 1048576) * 100) / 100,
      tempos_ms: { prepararLer: Math.round(t1 - t0), extrairExato: Math.round(t2 - t1), buildSceneContent: Math.round(t3 - t2), serializar: Math.round(t4 - t3) },
    };
  });
  resultados.push({ projeto: caminho.split(/[\\/]/).pop(), antesDeAbrirA3D: antes, comA3DAberta: depois, errosDaPagina: erros.slice(0, 3) });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(resultados, null, 2));
