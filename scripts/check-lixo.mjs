// Guarda da regra 5 do contrato (docs/contratos/trabalho-de-agentes.md): não deixar lixo ao implementar.
// Falha se houver: pasta crates/*/target dentro do repositório; pasta tmp-* rastreada pelo git; arquivo .png/.log/.mjs
// de depuração solto fora das pastas permitidas. Uso: node scripts/check-lixo.mjs (sai com código 1 se achar algo).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Pastas onde .png e .mjs rastreados são legítimos (ícones, capturas de referência, scripts e testes e2e). */
export const PASTAS_PERMITIDAS = ['docs/', 'tests/', 'scripts/', 'desktop/', 'reports/'];

/** Lista os arquivos rastreados pelo git (caminhos com "/"). */
function rastreados(raiz) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: raiz, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
}

/** Devolve a lista de problemas (vazia = limpo). `arquivos` permite testar sem git. */
export function verificarLixo(raiz, arquivos = rastreados(raiz)) {
  const problemas = [];
  const crates = join(raiz, 'crates');
  if (existsSync(crates)) {
    for (const e of readdirSync(crates, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(join(crates, e.name, 'target'))) {
        problemas.push(`crates/${e.name}/target dentro do repositório: compile com CARGO_TARGET_DIR=E:\\hestia-target-<frente> e apague a pasta`);
      }
    }
  }
  for (const f of arquivos) {
    if (f.split('/').some((seg) => seg.startsWith('tmp-'))) problemas.push(`${f}: pasta tmp-* não pode ser versionada`);
    else if (/\.log$/.test(f)) problemas.push(`${f}: arquivo .log versionado`);
    else if (/\.(png|mjs)$/.test(f) && !PASTAS_PERMITIDAS.some((p) => f.startsWith(p))) {
      problemas.push(`${f}: .png/.mjs solto fora de ${PASTAS_PERMITIDAS.join(' ')} (depuração vai para o scratchpad ou tmp-*)`);
    }
  }
  return problemas;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const problemas = verificarLixo(raiz);
  for (const p of problemas) console.error(`LIXO: ${p}`);
  if (problemas.length) process.exit(1);
  console.log('check-lixo: limpo');
}
