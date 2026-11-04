// Ferramenta de teste de mutação do kernel Rust (crates/geom-wasm): aplica UMA mutação por vez num .rs,
// reconstrói o wasm para uma pasta temporária, roda o teste indicado e classifica MORTA / SOBREVIVEU /
// COMPILA_ERRO / TIMEOUT. Retomável (ids já gravados em `<saida>/resultado.jsonl` são pulados) e SEMPRE
// restaura o arquivo original — inclusive em erro, exceção ou Ctrl+C (SIGINT/SIGTERM).
//
// Uso:
//   node scripts/mutar-rust.mjs --lista <arquivo.json> --saida <pasta> [--timeout-min 20] [--baseline] [--dry]
//
// A lista é um JSON: [{ "id": "m1", "arquivo": "crates/geom-wasm/src/b1.rs", "linha": 389,
//   "de": "<", "para": "<=", "teste": "tests/kernel-b1-limiares.wasm.test.ts", "recorte": "(A) membrana" }]
// (`linha` 1-based; `de` é trecho EXATO da linha; `teste` aceita caminho ou lista; `recorte` vira `-t`).
//
// Antes de qualquer coisa recusa trabalhar se `git status --porcelain crates` não estiver vazio.
// `--dry` só valida e imprime o plano. `--baseline` constrói o wasm sem mutação em `<saida>/base` e roda a
// união dos testes antes das mutações; se o baseline não passar, aborta (grava `<saida>/baseline-ok.json`
// para não repetir em execuções de retomada). Funções puras em `scripts/mutar-rust-lib.mjs`.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classificarResultado,
  editarTexto,
  idsProcessados,
  montarResumo,
  parsearArgs,
  testesDaMutacao,
  ultimasLinhas,
  uniaoTestes,
  validarLista,
} from './mutar-rust-lib.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestMjs = join(raiz, 'node_modules', 'vitest', 'vitest.mjs');

let filhoAtivo = null;
let restaurarAgora = null; // fn sem argumentos: regravar o conteúdo original (protege o intervalo entre a edição e o spawn do filho)
let interrompido = false;
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    interrompido = true;
    console.error(`\n[mutar] ${sinal} recebido: matando o processo filho e restaurando o arquivo...`);
    if (filhoAtivo) matarArvore(filhoAtivo.pid);
    else {
      if (restaurarAgora) { try { restaurarAgora(); } catch { /* melhor esforço */ } }
      process.exit(130);
    }
  });
}

/** Mata a árvore de processos (o filho é spawnado detached; no Windows o `taskkill /T` fecha a árvore toda). */
function matarArvore(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
  else {
    try { process.kill(-pid, 'SIGKILL'); }
    catch { try { process.kill(pid, 'SIGKILL'); } catch { /* já morreu */ } }
  }
}

/** Roda `cmd + args` na raiz do repo, captura stdout+stderr, estoura o tempo matando a árvore. */
function executar(cmd, args, { timeoutMs, env }) {
  return new Promise((res) => {
    const filho = spawn(cmd, args, {
      cwd: raiz,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      windowsHide: true,
    });
    filhoAtivo = filho;
    let saida = '';
    const capturar = (b) => {
      saida += b.toString('utf8');
      if (saida.length > 2_000_000) saida = saida.slice(-1_500_000);
    };
    filho.stdout.on('data', capturar);
    filho.stderr.on('data', capturar);
    let tempoEsgotado = false;
    const timer = setTimeout(() => {
      tempoEsgotado = true;
      console.error(`[mutar] estourou ${Math.round(timeoutMs / 1000)} s; matando pid ${filho.pid}`);
      matarArvore(filho.pid);
    }, timeoutMs);
    filho.on('error', (e) => {
      clearTimeout(timer);
      filhoAtivo = null;
      res({ exitCode: -1, sinal: null, tempoEsgotado: false, saida: `${saida}\nerro ao iniciar: ${e.message}` });
    });
    filho.on('close', (code, sig) => {
      clearTimeout(timer);
      filhoAtivo = null;
      res({ exitCode: code === null ? -1 : code, sinal: sig, tempoEsgotado, saida });
    });
  });
}

async function main() {
  const opts = parsearArgs(process.argv.slice(2));
  const pastaSaida = resolve(opts.saida);
  const jsonl = join(pastaSaida, 'resultado.jsonl');

  const status = spawnSync('git', ['status', '--porcelain', 'crates'], { cwd: raiz, encoding: 'utf8' });
  if (status.status !== 0) throw new Error(`falha ao rodar git status: ${status.stderr}`);
  if (status.stdout.trim() !== '') {
    throw new Error(`recuso rodar com crates/ sujo (a ferramenta edita e restaura arquivos lá). git status --porcelain crates:\n${status.stdout}`);
  }

  let lista;
  try { lista = JSON.parse(readFileSync(resolve(opts.lista), 'utf8')); }
  catch (e) { throw new Error(`não consegui ler a lista ${opts.lista}: ${e.message}`); }
  const erros = validarLista(lista, (a) => {
    const p = resolve(raiz, a);
    return existsSync(p) ? readFileSync(p, 'utf8') : null;
  });
  if (erros.length > 0) throw new Error(`lista inválida:\n${erros.map((e) => `  - ${e}`).join('\n')}`);

  mkdirSync(pastaSaida, { recursive: true });
  const textoJsonl = existsSync(jsonl) ? readFileSync(jsonl, 'utf8') : '';
  const registrosExistentes = [];
  for (const linha of textoJsonl.split('\n')) {
    const t = linha.trim();
    if (!t) continue;
    try { registrosExistentes.push(JSON.parse(t)); } catch { /* linha corrompida */ }
  }
  const feitos = idsProcessados(textoJsonl);

  if (opts.dry) {
    console.log(`[mutar] --dry: nada será editado. ${lista.length} mutação(ões), saida ${opts.saida}, timeout ${opts.timeoutMin} min.`);
    console.log(montarResumo(lista.map((m) => ({ ...m, duracao_s: undefined, resultado: feitos.has(m.id) ? '(já feito — será pulada)' : '(aplicaria)' }))));
    for (const m of lista) {
      console.log(`  ${m.id}: ${m.arquivo}:${m.linha}  ${JSON.stringify(m.de)} -> ${JSON.stringify(m.para)}  teste=${testesDaMutacao(m).join(', ')}${m.recorte ? `  -t ${JSON.stringify(m.recorte)}` : ''}${feitos.has(m.id) ? ' [PULARIA: já feito]' : ''}`);
    }
    return 0;
  }

  if (!existsSync(vitestMjs)) throw new Error(`node_modules/vitest/vitest.mjs não existe; rode npm ci.`);
  const orcamentoMs = Math.round(opts.timeoutMin * 60_000);

  if (opts.baseline) {
    const sentinel = join(pastaSaida, 'baseline-ok.json');
    const testes = uniaoTestes(lista);
    if (existsSync(sentinel)) {
      console.log(`[mutar] baseline já passou antes (${sentinel}); pulando. Delete o arquivo para refazer.`);
    } else {
      console.log(`[mutar] baseline: build -> ${join(resolve(opts.saida), 'base')} e testes ${testes.join(', ')}`);
      const build = await executar(process.execPath, [join(raiz, 'scripts', 'build-wasm.mjs'), '--saida', join(pastaSaida, 'base')], { timeoutMs: orcamentoMs, env: {} });
      if (interrompido) return 130;
      if (build.exitCode !== 0) {
        writeFileSync(join(pastaSaida, 'baseline-build.log'), build.saida, 'utf8');
        throw new Error(`baseline: o build sem mutação FALHOU (exit ${build.exitCode}). Log em baseline-build.log:\n${ultimasLinhas(build.saida, 15)}`);
      }
      const wasm = join(pastaSaida, 'base', 'geom_wasm.wasm');
      const t = await executar(process.execPath, [vitestMjs, 'run', '--config', 'vitest.wasm.config.ts', ...testes], { timeoutMs: orcamentoMs, env: { KERNEL_WASM_PATH: wasm } });
      if (interrompido) return 130;
      writeFileSync(join(pastaSaida, 'baseline-teste.log'), t.saida, 'utf8');
      if (t.tempoEsgotado || t.exitCode !== 0) {
        throw new Error(`baseline não passou (exit ${t.exitCode}${t.tempoEsgotado ? ', TIMEOUT' : ''}). Abortando — os testes da lista têm de passar sem mutação. Últimas linhas:\n${ultimasLinhas(t.saida, 15)}`);
      }
      writeFileSync(sentinel, JSON.stringify({ ok: true, em: new Date().toISOString(), testes }, null, 2) + '\n', 'utf8');
      console.log('[mutar] baseline ok.');
    }
  }

  const registrosNovos = [];
  for (const m of lista) {
    if (feitos.has(m.id)) { console.log(`[mutar] ${m.id}: já está em resultado.jsonl; pulando (retomável).`); continue; }
    const rec = await processarMutacao(m, pastaSaida, orcamentoMs);
    if (!rec) { console.error(`[mutar] interrompido durante ${m.id}; arquivo restaurado, resultado NÃO gravado (será refeito).`); break; }
    appendFileSync(jsonl, JSON.stringify(rec) + '\n');
    registrosNovos.push(rec);
    console.log(`[mutar] ${m.id}: ${rec.resultado} (${rec.duracao_s.toFixed(1)} s) -> ${jsonl}`);
  }

  const todos = lista.map((m) => [...registrosExistentes, ...registrosNovos].find((r) => r.id === m.id) ?? { ...m, resultado: '(interrompida)', duracao_s: undefined });
  const resumo = montarResumo(todos);
  writeFileSync(join(pastaSaida, 'resumo.md'), resumo, 'utf8');
  console.log(`\n${resumo}`);
  return interrompido ? 130 : 0;
}

/**
 * Uma mutação completa: guarda o conteúdo original em memória, edita, build, teste, classifica e SEMPRE
 * restaura o arquivo no finally (ou `git checkout --` como reserva). Retorna o registro, ou `null` se foi
 * interrompida por sinal (nesse caso nada é gravado em resultado.jsonl).
 */
async function processarMutacao(m, pastaSaida, orcamentoMs) {
  const arquivo = resolve(raiz, m.arquivo);
  const original = readFileSync(arquivo, 'utf8');
  const inicio = Date.now();
  const prazo = inicio + orcamentoMs;
  const restante = () => prazo - Date.now();
  const dirMut = join(pastaSaida, m.id);
  mkdirSync(dirMut, { recursive: true });
  const base = { id: m.id, arquivo: m.arquivo, linha: m.linha, de: m.de, para: m.para };
  const registro = (resultado, saidaCompleta, extra = {}) => ({
    ...base,
    ...extra,
    resultado,
    duracao_s: Number(((Date.now() - inicio) / 1000).toFixed(1)),
    saida_resumo: ultimasLinhas(saidaCompleta ?? '', 15),
  });

  try {
    const edit = editarTexto(original, m.linha, m.de, m.para);
    restaurarAgora = () => restaurar(arquivo, original, m.id);
    writeFileSync(arquivo, edit.texto);
    console.log(`[mutar] ${m.id}: aplicada em ${m.arquivo}:${m.linha}`);
    try {
      if (restante() <= 0) return registro('TIMEOUT', 'orçamento de tempo estourado antes do build', { linha_antes: edit.linhaAntes, linha_depois: edit.linhaDepois });

      const build = await executar(process.execPath, [join(raiz, 'scripts', 'build-wasm.mjs'), '--saida', dirMut], { timeoutMs: Math.max(1000, restante()), env: {} });
      if (interrompido) return null;
      writeFileSync(join(dirMut, 'build.log'), build.saida, 'utf8');
      if (build.tempoEsgotado) return registro('TIMEOUT', build.saida, { linha_antes: edit.linhaAntes, linha_depois: edit.linhaDepois });
      if (build.exitCode !== 0) return registro('COMPILA_ERRO', build.saida, { linha_antes: edit.linhaAntes, linha_depois: edit.linhaDepois });

      if (restante() <= 0) return registro('TIMEOUT', 'orçamento estourado antes do teste (build ok)', { linha_antes: edit.linhaAntes, linha_depois: edit.linhaDepois });
      const args = [vitestMjs, 'run', '--config', 'vitest.wasm.config.ts', ...testesDaMutacao(m)];
      if (m.recorte) args.push('-t', m.recorte);
      const teste = await executar(process.execPath, args, { timeoutMs: Math.max(1000, restante()), env: { KERNEL_WASM_PATH: join(dirMut, 'geom_wasm.wasm') } });
      if (interrompido) return null;
      writeFileSync(join(dirMut, 'teste.log'), teste.saida, 'utf8');
      return registro(classificarResultado(teste), teste.saida, { linha_antes: edit.linhaAntes, linha_depois: edit.linhaDepois });
    } catch (e) {
      if (interrompido) return null;
      return registro('COMPILA_ERRO', `exceção durante a mutação: ${e && e.stack ? e.stack : String(e)}`, { linha_antes: edit.linhaAntes, linha_depois: edit.linhaDepois });
    }
  } finally {
    restaurarAgora = null;
    restaurar(arquivo, original, m.id);
  }
}

/** Restaura o conteúdo original (memória); se a escrita falhar, cai no `git checkout --` como reserva. */
function restaurar(arquivo, original, id) {
  try {
    writeFileSync(arquivo, original, 'utf8');
    console.log(`[mutar] ${id}: arquivo restaurado (${arquivo.replace(`${raiz}${process.platform === 'win32' ? '\\' : '/'}`, '')})`);
  } catch (e) {
    console.error(`[mutar] ${id}: falha ao restaurar (${e.message}); tentando git checkout -- ${arquivo}`);
    const gt = spawnSync('git', ['checkout', '--', arquivo], { cwd: raiz, encoding: 'utf8' });
    if (gt.status !== 0) console.error(`[mutar] ${id}: git checkout também falhou (${gt.stderr}). RESTAURE MANUALMENTE.`);
    else console.log(`[mutar] ${id}: restaurado via git checkout.`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`[mutar] ERRO: ${e && e.message ? e.message : String(e)}`);
    process.exit(1);
  });
