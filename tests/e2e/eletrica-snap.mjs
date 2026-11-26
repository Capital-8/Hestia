// Snap visível nas portas dos elementos elétricos e mudança de cota durante o traçado (ficha F3), em Chrome real.
// Insere tomada, luminária, interruptor, caixa e quadro (Biblioteca), mostra o halo do snap em cada um com a ferramenta Eletroduto ativa
// (lê a prévia da ferramenta E tira captura), traça a partir de cada porta mudando a cota no meio (campo "z" do painel) até uma caixa,
// e confere a rede (sem afastada, incompatível nem coladas). Rígido e corrugado. Atalhos de programa, anotados onde aparecem:
// enquadramento da vista (setViewport) e leitura das posições das portas pelo motor (só para mirar o mouse).
// Uso: CHROME_PATH=/opt/pw-browsers/chromium APP='http://127.0.0.1:5226/?debug=1' node tests/e2e/eletrica-snap.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHROME_ARGS, chromeExecutable, clickWorld, makeReporter, worldToPage } from './helpers.mjs';

const APP = process.env.APP ?? 'http://127.0.0.1:5226/?debug=1';
const OUT = process.env.SHOTS ?? '/tmp/claude-0/-home-user-Hestia/e0b36f0f-5cd5-5bfc-b964-572e233c1fd8/scratchpad/eletrica-snap';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: chromeExecutable(), args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
const erros = [];
page.on('console', (m) => { if (m.type() === 'error' && !/status of 404|Failed to load resource/.test(m.text())) erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
const rep = makeReporter();
const shot = (nome) => page.screenshot({ path: `${OUT}/${nome}.png` });
const FAM = { tubo: 'fam_krona_eletrica_tubo_corte', curva: 'fam_krona_eletrica_curva90', caixa: 'fam_krona_eletrica_caixa_4x4', quadro: 'fam_quadro_distribuicao_eletrico', tom: 'fam_tomada_2p_t', int: 'fam_interruptor_simples', lum: 'fam_luminaria_plafon_redondo', corr: 'fam_tigre_tigreflex_amarelo' };
const comps = () => page.evaluate(() => Object.values(window.__hestia.editor.store.project.elements).filter((e) => e.kind === 'component').map((e) => ({ id: e.id, f: e.familyId, x: e.x, y: e.y, z: e.z })));
const idsDe = async (fam) => (await comps()).filter((c) => c.f === fam).map((c) => c.id);
const aba = async (nome) => { await page.locator('.ribbon-tabs .rtab:visible', { hasText: new RegExp(`^${nome}$`) }).first().click(); await page.waitForTimeout(150); };
const botao = (nome, indice = 0) => page.getByRole('button', { name: nome, exact: true }).nth(indice);
const fecharBiblioteca = async () => { if (await page.locator('.pal-janela').isVisible().catch(() => false)) await page.locator('.pal-fechar').click(); };
/** Portas de eletroduto de uma peça no mundo (m): leitura do motor, só para mirar o mouse. */
const portas = (id) => page.evaluate((id) => {
  const { engine, editor } = window.__hestia;
  const p = editor.store.project;
  const c = p.elements[id];
  return engine.resolverComponente(p, c).ligacoes.filter((l) => l.dominio === 'eletroduto').map((l) => {
    const m = engine.ligacaoNoMundo(l, c);
    return { nome: l.id, x: m.posicaoMundo[0], y: m.posicaoMundo[1], z: m.posicaoMundo[2], dir: [m.direcaoMundo[0], m.direcaoMundo[1], m.direcaoMundo[2]] };
  });
}, id);
const porta = async (id, nome) => (await portas(id)).find((q) => q.nome === nome);
const rede = () => page.evaluate(() => window.__hestia.engine.diagnosticarRede(window.__hestia.editor.store.project).filter((d) => ['conexao_afastada', 'incompativel', 'conexoes_coladas', 'conexao_invalida', 'curvatura_fechada'].includes(d.codigo)).map((d) => d.codigo));
/** Prévia da ferramenta ativa (os mesmos itens que a planta desenha). */
const previa = () => page.evaluate(() => window.__hestia.editor.activeTool.preview().map((i) => ({ k: i.kind, t: i.text ?? null })));
const mover = async (x, y) => { const p = await worldToPage(page, x, y); await page.mouse.move(p.x, p.y); await page.waitForTimeout(120); return p; };
async function colocar(busca, cartao, x, y) {
  const antes = (await comps()).map((c) => c.id);
  if (!(await page.locator('.pal-janela').isVisible().catch(() => false))) await botao('Dispositivos elétricos').click();
  await page.locator('.pal-busca').fill(busca);
  await page.waitForTimeout(250);
  await page.locator('.pal-movel', { hasText: cartao }).first().click();
  await page.waitForTimeout(200);
  await clickWorld(page, x, y);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return (await comps()).map((c) => c.id).filter((id) => !antes.includes(id));
}
/** Ativa a ferramenta Eletroduto (DN 20), com o tipo corrugado ou rígido escolhido no painel. */
async function ativar(corrugado) {
  await fecharBiblioteca();
  await page.keyboard.press('Escape');
  await botao('Eletroduto').click();
  await page.waitForSelector('#place-tubo-dn', { timeout: 15_000 });
  await page.locator('#place-tubo-dn').selectOption('20');
  await page.locator('#place-tubo-familia').selectOption(corrugado ? FAM.corr : FAM.tubo);
}
const cota = async (z) => { await page.locator('#place-tubo-z').fill(String(z)); await page.locator('#place-tubo-z').press('Enter'); };

// Layout: origens na coluna x = 0 (y = 0, 2, 4, 6, 8) e caixas de destino na coluna x = 7 (mesmos y).
const ORIGENS = [
  { chave: 'tom', fam: FAM.tom, busca: 'Tomada', cartao: 'Tomada 2P+T', y: 0, porta: 'eletroduto_dir' },
  { chave: 'lum', fam: FAM.lum, busca: 'Plafon', cartao: 'Plafon redondo', y: 2, porta: 'eletroduto_dir' },
  { chave: 'int', fam: FAM.int, busca: 'Interruptor', cartao: 'Interruptor simples', y: 4, porta: 'eletroduto_dir' },
  { chave: 'cx', fam: FAM.caixa, busca: 'Caixa de luz 4', cartao: /série 2/, y: 6, porta: 'd' },
  { chave: 'qd', fam: FAM.quadro, busca: 'Quadro', cartao: 'Quadro de distribuição', y: 8, porta: 'd' },
];
const ids = {};
const destinos = [];

try {
  await rep.step('1. abre o app, enquadra a planta e põe Elétrico como disciplina', async () => {
    await page.goto(APP);
    await page.waitForFunction(() => window.__hestia, null, { timeout: 180_000 });
    await page.getByRole('button', { name: /Novo projeto/ }).first().click();
    await page.waitForSelector('.canvas-wrap canvas', { timeout: 180_000 });
    await page.evaluate(() => { const e = window.__hestia.editor; e.setViewport({ ...e.viewport(), cx: 3.5, cy: 4, zoom: 58 }); });
    await aba('Sistemas');
    await botao('Dispositivos elétricos').click();
    await page.waitForSelector('.pal-janela', { timeout: 15_000 });
    const sel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Hidrossanitário' }) }).first();
    await sel.selectOption('Elétrico').catch((e) => console.log('  info  disciplina:', e.message.split('\n')[0]));
    rep.check('biblioteca elétrica aberta', await page.locator('.pal-janela').isVisible(), '');
  });

  await rep.step('2. insere tomada, luminária, interruptor, caixa e quadro (coluna da esquerda) e 5 caixas de destino (coluna da direita)', async () => {
    for (const o of ORIGENS) { const n = await colocar(o.busca, o.cartao, 0, o.y); ids[o.chave] = n[0]; rep.check(`${o.chave} colocado`, n.length === 1, n.join(',')); }
    for (const o of ORIGENS) { const n = await colocar('Caixa de luz 4', /série 2/, 7, o.y); destinos.push(n[0]); }
    await fecharBiblioteca();
    // O cartão coloca a peça com o ponto de inserção no clique; confere onde cada uma ficou e as enquadra todas.
    const t = await comps();
    rep.check('10 peças na planta', t.length === 10, String(t.length));
    await shot('01-planta-com-pecas');
  });

  await rep.step('3. com Eletroduto ativo, o halo do snap aparece em cada peça (prévia + captura)', async () => {
    await ativar(false);
    for (const o of ORIGENS) {
      const alvo = await porta(ids[o.chave], o.porta);
      await cota(alvo.z);
      await mover(alvo.x + 0.04, alvo.y + 0.02);
      const pv = await previa();
      const nomes = pv.filter((i) => i.k === 'label').map((i) => i.t);
      rep.check(`${o.chave}: halo (anéis) e nome da porta na prévia`, pv.filter((i) => i.k === 'polygon').length >= 2 && nomes.some((n) => /^Porta: /.test(n ?? '')), `anéis=${pv.filter((i) => i.k === 'polygon').length} nome=${nomes.join('|')}`);
      const p = await worldToPage(page, alvo.x, alvo.y);
      await page.screenshot({ path: `${OUT}/02-halo-${o.chave}.png`, clip: { x: Math.max(0, p.x - 160), y: Math.max(0, p.y - 110), width: 320, height: 220 } });
    }
    await mover(3.5, 5);
    rep.check('cursor longe de qualquer porta: sem halo', (await previa()).filter((i) => i.k === 'polygon').length === 0, '');
    await page.keyboard.press('Escape');
  });

  const traco = async (corrugado, nome, o, destino) => {
    const de = await porta(ids[o.chave], o.porta);
    const ate = await porta(destino, 'c');
    const antes = await comps();
    await ativar(corrugado);
    await cota(de.z);
    await clickWorld(page, de.x, de.y);
    // A cota muda no meio do traçado: 1,6 m num ponto livre, 2,4 m no seguinte e a da porta de destino no fim.
    await cota(1.6);
    await clickWorld(page, de.x + 1.8, de.y + 0.8);
    await cota(2.4);
    await clickWorld(page, ate.x - 1.8, ate.y + 0.8);
    await cota(ate.z);
    await clickWorld(page, ate.x, ate.y);
    const fala = await page.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => e.children.length === 0 && /^(Eletroduto|Bloqueado|Sem caminho)/.test(e.textContent.trim())).map((e) => e.textContent.trim()).slice(-1)[0] ?? '');
    console.log(`  info  fala (${nome}):`, fala.slice(0, 220));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const depois = await comps();
    const novos = depois.filter((c) => !antes.some((a) => a.id === c.id));
    return { novos, fala };
  };

  for (const corrugado of [false, true]) {
    await rep.step(`${corrugado ? '5' : '4'}. traça a partir de cada porta mudando a cota no meio (${corrugado ? 'corrugado' : 'rígido'})`, async () => {
      for (const [k, o] of ORIGENS.entries()) {
        const { novos, fala } = await traco(corrugado, o.chave, o, destinos[k]);
        const tubos = novos.filter((c) => c.f === (corrugado ? FAM.corr : FAM.tubo)).length;
        const zs = novos.map((c) => c.z);
        rep.check(`${o.chave} -> caixa: eletrodutos criados (${tubos}), sem bloqueio`, tubos >= 3 && !/Bloqueado|Sem caminho/.test(fala), `${tubos} trechos; ${fala.slice(0, 80)}`);
        rep.check(`${o.chave}: a cota mudou no meio do traçado (z dos trechos varia)`, Math.max(...zs) - Math.min(...zs) > 0.5, `z ${Math.min(...zs).toFixed(2)} a ${Math.max(...zs).toFixed(2)}`);
        const lig = await page.evaluate(([a, b]) => [a, b].map((id) => Object.keys(window.__hestia.editor.store.project.elements[id].ligacoes ?? {}).length), [ids[o.chave], destinos[k]]);
        rep.check(`${o.chave}: ligada na porta de saída e na caixa de destino`, lig[0] >= 1 && lig[1] >= 1, lig.join(','));
        await shot(`0${corrugado ? 4 : 3}-traco-${o.chave}`);
      }
      const r = await rede();
      rep.check('rede sem afastada, incompatível, coladas, inválida nem curvatura', r.length === 0, r.join(','));
    });
    if (!corrugado) {
      // Limpa os eletrodutos para o corrugado repetir o mesmo desenho (apaga trechos e curvas, mantém as peças).
      await page.evaluate((fam) => { const e = window.__hestia.editor; const ids = Object.values(e.store.project.elements).filter((c) => c.kind === 'component' && [fam.tubo, fam.curva].includes(c.familyId)).map((c) => c.id); e.store.exec({ type: 'deleteElements', ids }); }, FAM).catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  await rep.step('6. prumada: clicar de novo no mesmo ponto com outra cota cria o trecho vertical', async () => {
    const de = await porta(ids.int, 'eletroduto_esq');
    const antes = (await comps()).length;
    await ativar(false);
    await cota(de.z);
    await clickWorld(page, de.x, de.y);
    await clickWorld(page, de.x - 1.2, de.y);
    await cota(2.2);
    await clickWorld(page, de.x - 1.2, de.y);
    const n = (await comps()).length - antes;
    await shot('05-prumada-mesmo-ponto');
    await page.keyboard.press('Escape');
    rep.check('trechos novos (horizontal + joelho + vertical)', n >= 3, String(n));
  });

  await rep.step('7. sem erro de console', async () => {
    rep.check('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | ').slice(0, 300));
  });
} finally {
  await page.screenshot({ path: `${OUT}/zz-estado-final.png` }).catch(() => {});
  await browser.close();
}
rep.summary();
process.exit(rep.steps.some((s) => s.status === 'FAIL') ? 1 : 0);
