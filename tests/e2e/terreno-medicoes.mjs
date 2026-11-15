// Medições do A.8 item 5 no navegador: terreno grande (~50 000 vértices) criado por gancho; primeiro desenho da planta e do 3D.
import { abrir, medirDesenho, shot } from './terreno-base.mjs';
import { abrir3d, tempos } from './terreno-passos-a.mjs';

export async function medicoes(rep) {
  const ctx = await abrir();
  const { page, errors } = ctx;
  try {
    await rep.step('Medição. Terreno de ~50 000 vértices (gancho): primeiro desenho da planta e do 3D', async () => {
      // A vista já enquadra a área do terreno: o tempo medido vai da criação (comandos + kernel) até a planta parar de mudar.
      await page.evaluate(() => window.__hestia.editor.zoomToBox({ minX: -5, minY: -5, maxX: 275, maxY: 275 }));
      await page.waitForTimeout(500);
      let n = 0;
      const ms = await medirDesenho(page, async () => {
        n = await page.evaluate(() => {
          const { editor, model: m, useUi } = window.__hestia;
          const lado = 224;
          const pontos = [];
          for (let i = 0; i < lado; i++) for (let j = 0; j < lado; j++) {
            const x = i * 1.2; const y = j * 1.2;
            pontos.push(x, y, 5 + 3 * Math.sin(x / 17) * Math.cos(y / 23) + 0.0004 * ((i * 7919 + j * 104729) % 97));
          }
          editor.store.exec({ type: 'addTerrain', terrain: m.makeTerrain({ id: 'tn_grande', levelId: useUi.getState().levelId, name: 'grande' }) });
          editor.store.exec({ type: 'editTerrainFontes', terrenoId: 'tn_grande', ops: [{ op: 'substituirFontes', pontos, curvas: [], quebras: [] }] });
          return pontos.length / 3;
        });
      }, { calmaMs: 2000, limiteMs: 90000 });
      rep.check('terreno com 50 176 pontos criado', n === 50176, String(n));
      tempos.plantaTerrenoGrande50k = ms;
      await page.waitForTimeout(800);
      await shot(page, '11-terreno-grande-planta.png');
      const m3 = await medirDesenho(page, () => abrir3d(page), { calmaMs: 1500, limiteMs: 60000 });
      tempos.abertura3dTerrenoGrande50k = m3;
      await page.locator('.navbar button[aria-label="Enquadrar tudo"]').click();
      await page.waitForTimeout(1500);
      await shot(page, '11-terreno-grande-3d.png');
      rep.check('planta e 3D do terreno grande desenharam (houve mudança na captura)', ms !== null && m3 !== null, `${ms} ms / ${m3} ms`);
    });
    await rep.step('sem erro de console na sessão da medição', async () => {
      rep.check('nenhum erro de console ou de página', errors.length === 0, errors.slice(0, 3).join(' | '));
    });
  } finally {
    await ctx.fechar();
  }
}
