// Compila a crate do kernel geométrico experimental para WebAssembly e publica o artefato em
// `packages/geom/assets/geom_wasm.wasm`.
//
// Uso:
//   node scripts/build-wasm.mjs           # compila e copia
//   node scripts/build-wasm.mjs --check   # compila e só confere se o artefato commitado está atual
//   node scripts/build-wasm.mjs --saida <pasta>  # compila e escreve o .wasm lá (CI/testes); não toca nos arquivos versionados
//
// Sem --saida/--check também grava `packages/geom/assets/geom_wasm.fonte.sha256` (hash das fontes, decisão 0046 §2.8).
//
// O artefato é commitado de propósito: assim `npm ci`, o CI do app e o deploy na Vercel não precisam
// de Rust. Quem mexe no kernel roda este script e commita o `.wasm` junto.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ARQUIVO_HASH_FONTE, calcularHashDasFontes } from './hash-fontes.mjs';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(raiz, 'crates', 'geom-wasm');
const destinoDir = join(raiz, 'packages', 'geom', 'assets');
const destino = join(destinoDir, 'geom_wasm.wasm');
const origens = [
  join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'geom_wasm.wasm'),
  join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'geom-wasm.wasm'),
];
const conferir = process.argv.includes('--check');
const idxSaida = process.argv.indexOf('--saida');
const pastaSaida = idxSaida >= 0 ? process.argv[idxSaida + 1] : null;
if (idxSaida >= 0 && (!pastaSaida || pastaSaida.startsWith('--'))) {
  console.error('[build-wasm] --saida exige uma pasta.');
  process.exit(1);
}

console.log(`[build-wasm] cargo build --release --target wasm32-unknown-unknown (${crate})`);
execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], {
  cwd: crate,
  stdio: 'inherit',
});

const origem = origens.find((p) => existsSync(p));
if (!origem) {
  console.error('[build-wasm] artefato não encontrado. Procurado em:\n  ' + origens.join('\n  '));
  process.exit(1);
}

const bytes = readFileSync(origem);
if (bytes.length < 1000) {
  console.error(`[build-wasm] artefato suspeito: ${bytes.length} bytes.`);
  process.exit(1);
}

if (conferir) {
  if (!existsSync(destino)) {
    console.error('[build-wasm] artefato commitado ausente: rode `node scripts/build-wasm.mjs`.');
    process.exit(1);
  }
  const atual = readFileSync(destino);
  if (!atual.equals(bytes)) {
    console.error('[build-wasm] o .wasm commitado está desatualizado. Rode `node scripts/build-wasm.mjs`.');
    process.exit(1);
  }
  console.log(`[build-wasm] ok: artefato atual (${(bytes.length / 1024).toFixed(0)} kB)`);
  process.exit(0);
}

if (pastaSaida) {
  const alvo = resolve(pastaSaida);
  mkdirSync(alvo, { recursive: true });
  copyFileSync(origem, join(alvo, 'geom_wasm.wasm'));
  console.log(`[build-wasm] escrito ${join(alvo, 'geom_wasm.wasm')} — ${(bytes.length / 1024).toFixed(1)} kB (arquivos versionados intactos)`);
  process.exit(0);
}

mkdirSync(destinoDir, { recursive: true });
copyFileSync(origem, destino);

// Assinatura de sanidade: todo módulo wasm começa com \0asm.
if (bytes.subarray(0, 4).toString('binary') !== '\0asm') {
  console.error('[build-wasm] o arquivo copiado não parece um módulo wasm.');
  process.exit(1);
}

const tamanho = statSync(destino).size;
const sha = execFileSync('git', ['hash-object', destino], { cwd: raiz }).toString().trim();
writeFileSync(join(destinoDir, 'geom_wasm.sha256'), `${sha}\n`, 'utf8');
const fonte = calcularHashDasFontes(raiz);
writeFileSync(join(destinoDir, ARQUIVO_HASH_FONTE), `${fonte}\n`, 'utf8');
console.log(`[build-wasm] hash das fontes ${fonte.slice(0, 12)} gravado em ${ARQUIVO_HASH_FONTE}`);
console.log(`[build-wasm] publicado packages/geom/assets/geom_wasm.wasm — ${(tamanho / 1024).toFixed(1)} kB (blob ${sha.slice(0, 12)})`);
