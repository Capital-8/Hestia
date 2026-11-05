#!/usr/bin/env node
/**
 * Teste de fumaça de i18n em runtime (navegador real).
 *
 * Responde à pergunta "o app realmente troca de idioma?" — coisa que o checker de
 * chaves e o auditor estático NÃO provam. Ele abre o app, troca o idioma pelo
 * seletor do menu Arquivo e confere superfícies visíveis:
 *   - aba da faixa (Arquitetura/Architektur/...)
 *   - cabeçalho do Navegador de projeto
 *   - funções de camada no diálogo de tipo de parede
 *   - botão Aplicar
 *   - rótulo de desfazer (hoje conhecido como não traduzido: sai como WARN)
 *
 * Uso:
 *   node scripts/test-i18n-runtime.mjs                 # usa http://localhost:5190/
 *   node scripts/test-i18n-runtime.mjs --url http://localhost:5173/
 *   node scripts/test-i18n-runtime.mjs --strict        # WARN também derruba o teste
 *
 * Requer um servidor servindo o app (dev ou `vite preview`). Sai com código 1 se
 * alguma verificação obrigatória falhar.
 */
import { chromium } from 'playwright-core';

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};

const URL_APP = arg('--url', process.env.HESTIA_URL ?? 'http://localhost:5173/');
const ESTRITO = process.argv.includes('--strict');
const HEADLESS = !process.argv.includes('--headed');

/** Superfícies que devem mudar de idioma e o texto exato esperado em cada uma. */
const ESPERADO = {
  es: {
    aba: 'Arquitectura',
    navegador: 'Navegador de proyecto',
    camadas: ['Estructura', 'Sustrato', 'Aislamiento', 'Membrana', 'Acabado 1', 'Acabado 2'],
    aplicar: 'Aplicar',
  },
  de: {
    aba: 'Architektur',
    navegador: 'Projekt-Browser',
    camadas: ['Struktur', 'Substrat', 'Dämmung', 'Membran', 'Ausbau 1', 'Ausbau 2'],
    aplicar: 'Anwenden',
  },
  fr: {
    aba: 'Architecture',
    navegador: 'Navigateur de projet',
    camadas: ['Structure', 'Support', 'Isolation', 'Membrane', 'Finition 1', 'Finition 2'],
    aplicar: 'Appliquer',
  },
  it: {
    aba: 'Architettura',
    navegador: 'Browser di progetto',
    camadas: ['Struttura', 'Supporto', 'Isolamento', 'Membrana', 'Finitura 1', 'Finitura 2'],
    aplicar: 'Applica',
  },
  pl: {
    aba: 'Architektura',
    navegador: 'Przeglądarka projektu',
    camadas: ['Konstrukcja', 'Podłoże', 'Izolacja', 'Membrana', 'Wykończenie 1', 'Wykończenie 2'],
    aplicar: 'Zastosuj',
  },
};

/** Marcas de texto que só existem em PT e que ainda aparecem em outros idiomas. */
const RESIDUOS_PT = [
  /\bEditar tipo de (parede|piso|laje|forro|telhado|rampa|grade|categoria)\b/,
  /\bPlantas de (piso|área|cubierta|cobertura|techo|forro)\b/,
  /\bsem perfil\b/,
  /\bNível ativo\b/,
  /\bComprimento do percurso\b/,
  /\bContínuo \(linha inteira\)\b/,
  /\bDesnível\b/,
];

const resultados = [];
const registrar = (estado, lang, verificacao, detalhe = '') => {
  resultados.push({ estado, lang, verificacao, detalhe });
  const rotulo = estado === 'OK' ? 'OK  ' : estado === 'WARN' ? 'WARN' : 'FAIL';
  console.log(`${rotulo} [${lang}] ${verificacao}${detalhe ? ` — ${detalhe}` : ''}`);
};

const browser = await chromium.launch({
  executablePath: chromium.executablePath(),
  headless: HEADLESS,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

const textoPagina = () => page.evaluate(() => document.body.innerText);
const botaoPorTexto = (re) =>
  page.locator('button', { hasText: re }).first();

await page.goto(URL_APP, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1500);

// A tela inicial é a biblioteca de projetos; cria um projeto para chegar ao editor.
if ((await page.locator('.rtab.file').count()) === 0) {
  const novo = botaoPorTexto(/Novo projeto|New project|Nuevo proyecto|Neues Projekt|Nouveau projet|Nuovo progetto|Nowy projekt/);
  if (await novo.count()) await novo.click();
  await page.waitForSelector('.rtab.file', { timeout: 30000 });
}

const abrirNavegador = async () => {
  if (await page.locator('[data-node="type:wall:wt_alv14"]').count()) return true;
  const alternar = page.locator('button[title]').filter({ hasText: '' });
  const alvos = await alternar.evaluateAll((bs) =>
    bs.map((b, i) => ({ i, title: b.getAttribute('title') ?? '' }))
      .filter((b) => /naveg|browser|navigat|przegl|explor/i.test(b.title)),
  );
  if (!alvos.length) return false;
  await alternar.nth(alvos[0].i).click();
  await page.waitForTimeout(700);
  return (await page.locator('[data-node="type:wall:wt_alv14"]').count()) > 0;
};

const selecionarIdioma = async (lang) => {
  await page.locator('.rtab.file').click();
  await page.waitForTimeout(400);
  const opcoes = page.locator('[role="dialog"] button').filter({
    hasText: /^(Opções|Opciones|Options|Optionen|Opzioni|Opcje)/,
  });
  if ((await page.locator('select.fm-lang').count()) === 0 && (await opcoes.count())) {
    await opcoes.first().click();
    await page.waitForTimeout(300);
  }
  await page.locator('select.fm-lang').selectOption(lang);
  await page.waitForTimeout(700);
  const fechar = page.locator('[role="dialog"] button').filter({
    hasText: /Cerrar menú|Fechar menu|Close menu|Menü schließen|Fermer le menu|Chiudi menu|Zamknij menu/,
  });
  if (await fechar.count()) await fechar.first().click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
};

const abrirDialogoParede = async () => {
  const linha = page.locator('[data-node="type:wall:wt_alv14"]');
  await linha.dblclick();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(400);
};

const opcoesDeCamada = () =>
  page.evaluate(() => {
    const selects = [...document.querySelectorAll('[role="dialog"] select')];
    return selects.map((s) => [...s.options].map((o) => o.textContent?.trim() ?? ''));
  });

for (const [lang, esperado] of Object.entries(ESPERADO)) {
  await selecionarIdioma(lang);

  const abas = (await page.locator('.rtab').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  if (abas.includes(esperado.aba)) registrar('OK', lang, 'aba da faixa', esperado.aba);
  else registrar('FAIL', lang, 'aba da faixa', `esperava "${esperado.aba}", achei ${JSON.stringify(abas.slice(0, 5))}`);

  const navegadorAberto = await abrirNavegador();
  if (!navegadorAberto) {
    registrar('FAIL', lang, 'Navegador de projeto', 'não abriu');
  } else {
    const texto = await textoPagina();
    if (texto.includes(esperado.navegador)) registrar('OK', lang, 'Navegador de projeto', esperado.navegador);
    else registrar('FAIL', lang, 'Navegador de projeto', `não achei "${esperado.navegador}"`);

    if (lang === 'es') {
      if (texto.includes('Planos de área') && !texto.includes('Plantas de área')) {
        registrar('OK', lang, 'terminologia ES', 'Planos de área');
      } else {
        registrar('FAIL', lang, 'terminologia ES', 'esperava "Planos de área" e nenhum "Plantas de área"');
      }
    }
  }

  await abrirDialogoParede();
  const listas = await opcoesDeCamada();
  const lista = listas.find((ops) => ops.includes(esperado.camadas[0]) && ops.includes(esperado.camadas[1]));
  if (lista && esperado.camadas.every((c) => lista.includes(c))) {
    registrar('OK', lang, 'funções de camada', lista.join(' / '));
  } else {
    const encontrada = listas.find((ops) => ops.length >= 6 && ops.length <= 8) ?? listas[0] ?? [];
    registrar('FAIL', lang, 'funções de camada', `esperava ${esperado.camadas.join(' / ')}; achei ${encontrada.join(' / ')}`);
  }

  const botoes = (await page.locator('[role="dialog"] button').allInnerTexts()).map((b) => b.trim());
  if (botoes.includes(esperado.aplicar)) registrar('OK', lang, 'botão Aplicar', esperado.aplicar);
  else registrar('FAIL', lang, 'botão Aplicar', `esperava "${esperado.aplicar}", achei ${JSON.stringify(botoes.slice(-6))}`);

  // Edita o nome do tipo para gerar um passo no histórico e lê o tooltip de desfazer.
  const campoNome = page.locator('#wt-name');
  const nomeAtual = await campoNome.inputValue();
  await campoNome.fill(`${nomeAtual} T`);
  const ok = page.locator('[role="dialog"] button').filter({ hasText: /^(OK|Aceptar|Übernehmen|Valider|Conferma|Zastosuj)$/ });
  if (await ok.count()) await ok.first().click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(700);

  const titulos = await page.locator('.qbtn').evaluateAll((bs) => bs.map((b) => b.getAttribute('title') ?? ''));
  const desfazer = titulos.find((t) => /^(Deshacer|Desfazer|Undo|Rückgängig|Annuler|Annulla|Cofnij)/i.test(t));
  if (!desfazer) {
    registrar('WARN', lang, 'rótulo de desfazer', 'não encontrei o botão');
  } else if (lang === 'pt' || !/(parede|piso|laje|forro|telhado|rampa|grade|categoria de ambiente|sem perfil|Nível ativo|Duplicar tipo de)/i.test(desfazer)) {
    registrar('OK', lang, 'rótulo de desfazer', desfazer);
  } else {
    registrar('WARN', lang, 'rótulo de desfazer (texto PT fixo)', desfazer);
  }

  // Resíduos de PT em qualquer lugar visível.
  const texto = await textoPagina();
  const residuos = RESIDUOS_PT.filter((re) => re.test(texto)).map((re) => re.source);
  if (residuos.length) registrar('WARN', lang, 'texto PT visível', residuos.join(' | '));
  else registrar('OK', lang, 'sem resíduos PT conhecidos');
}

await browser.close();

const falhas = resultados.filter((r) => r.estado === 'FAIL');
const avisos = resultados.filter((r) => r.estado === 'WARN');
console.log(`\nResumo: ${resultados.length - falhas.length - avisos.length} OK, ${avisos.length} aviso(s), ${falhas.length} falha(s).`);
if (erros.length) console.log(`Erros de página: ${erros.length} (${erros.slice(0, 2).join(' | ')})`);

if (falhas.length || (ESTRITO && avisos.length)) {
  process.exitCode = 1;
  console.error('\nFalhou. Veja as linhas FAIL/WARN acima.');
} else {
  console.log('Idiomas verificados no navegador: troca aplicada nas superfícies testadas.');
}
