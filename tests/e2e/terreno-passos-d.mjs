// Passo 10 do roteiro B.5: prancha com planta, corte e 3D; salvar e reabrir; console limpo.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { shot, FINAL } from './terreno-base.mjs';
import { abrirPlanta } from './terreno-passos-a.mjs';

/** Serialização estável (chaves ordenadas): compara o projeto antes e depois de salvar e reabrir. */
const estavel = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const projeto = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__hestia.editor.project)));

export async function passo10(rep, { page, errors }) {
  await rep.step('10a. Prancha com planta, corte e 3D [interface + gancho para criar a prancha vazia]', async () => {
    await abrirPlanta(page);
    await page.evaluate(() => {
      const { editor, useUi } = window.__hestia;
      const p = editor.project;
      editor.store.exec({ type: 'addSheet', sheet: { id: 'sh_terreno', number: 'A-101', name: 'Terreno', size: 'A1', orientation: 'landscape', margin: 10, discipline: 'Arquitetura', titleBlock: { project: p.name, client: 'Cliente', author: 'Equipe', date: '15/11/2026', revision: '0' }, viewports: [] } }, 'Criar prancha');
      useUi.setState({ view: 'sheet', sheetId: 'sh_terreno' });
    });
    await page.waitForSelector('.sheet-stage svg');
    await page.locator('.sheet-vcb').getByRole('button', { name: 'Adiciona uma planta, corte ou 3D a esta prancha' }).click();
    await page.getByText('Adicionar vistas', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Limpar', exact: true }).click();
    for (const nome of ['Planta · Térreo', 'Corte · Corte A', 'Modelo 3D (enquadramento padrão)']) await page.getByRole('checkbox', { name: nome }).check();
    // Uma escala só para as três vistas: o terreno tem 90 m, então 1:500 (a automática 1:20 não cabe) numa prancha A1.
    await page.locator('[role=dialog] select').selectOption({ label: '1:500' });
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page.waitForTimeout(1500);
    const recusa = await page.locator('[role=dialog]').last().innerText().catch(() => '');
    if (/não cabe/.test(recusa)) console.log('  diálogo recusou:', recusa.replace(/\n+/g, ' | ').slice(0, 200));
    await page.waitForFunction(() => window.__hestia.editor.project.sheets?.find((s) => s.id === 'sh_terreno')?.viewports.length === 3, undefined, { timeout: 15000 });
    const tipos = await page.evaluate(() => window.__hestia.editor.project.sheets.find((s) => s.id === 'sh_terreno').viewports.map((v) => v.view.kind));
    rep.check('três vistas na prancha: planta, corte e 3D', ['plan', 'section', '3d'].every((k) => tipos.includes(k)), tipos.join(','));
    await page.waitForFunction(() => document.querySelectorAll('[data-vp-layer] path').length > 40, undefined, { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const svg = await page.evaluate(() => ({ paths: document.querySelectorAll('[data-vp-layer] path').length, camadas: document.querySelectorAll('[data-vp-layer]').length }));
    rep.check('a prancha desenhou traços nas vistas', svg.paths > 40, `${svg.paths} caminhos em ${svg.camadas} vistas`);
    await shot(page, '10-prancha.png');
    await page.locator('.sheet-stage').screenshot({ path: path.join(FINAL, '10-prancha-folha.png') });
  });

  let antes;
  // 10c (kernel desligado) não cabe aqui: sem o wasm o build nem abre projeto (ver RELATORIO-E2E.md); o caso foi verificado no servidor de desenvolvimento com ?kernel=ts.
  const arquivo = path.join(mkdtempSync(path.join(tmpdir(), 'hestia-terreno-')), 'terreno.hestia.json');
  await rep.step('10b. Salvar (download) e reabrir: o projeto volta igual [interface]', async () => {
    antes = await projeto(page);
    // Sem pasta de biblioteca, Ctrl+S abre o diálogo "Salvar sem pasta"; o caminho do arquivo é "Baixar arquivo".
    await page.keyboard.press('Control+s');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar arquivo' }).click()]);
    await dl.saveAs(arquivo);
    rep.check('o arquivo foi baixado', dl.suggestedFilename().endsWith('.json'), dl.suggestedFilename());
    await page.evaluate(() => window.__hestia.editor.newProject('house2'));
    await page.waitForTimeout(800);
    await page.setInputFiles('#file-open', arquivo);
    await page.waitForFunction(() => Object.values(window.__hestia.editor.project.elements).some((e) => e.kind === 'terrain'), undefined, { timeout: 15000 });
    await page.waitForTimeout(1500);
    const depois = await projeto(page);
    const chaves = ['localizacao', 'sheets', 'views'];
    for (const k of chaves) rep.check(`${k} igual após reabrir`, estavel(antes[k]) === estavel(depois[k]));
    const tipos = ['terrain', 'terrainRegion', 'lot', 'wall', 'slab'];
    for (const t of tipos) {
      const f = (p) => estavel(Object.values(p.elements).filter((e) => e.kind === t).map(({ order, ...r }) => r).sort((a, b) => (a.id < b.id ? -1 : 1)));
      rep.check(`elementos ${t} iguais após reabrir`, f(antes) === f(depois), `${Object.values(depois.elements).filter((e) => e.kind === t).length} elemento(s)`);
    }
    await abrirPlanta(page);
    await page.evaluate(() => window.__hestia.editor.zoomExtents());
    await page.waitForTimeout(1200);
    await shot(page, '10-reaberto-planta.png');
    rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });

  await rep.step('sem erro de console em nenhum passo (sessão com kernel)', async () => {
    rep.check('nenhum erro de console ou de página', errors.length === 0, errors.slice(0, 4).join(' | '));
  });
}
