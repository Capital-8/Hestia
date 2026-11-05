// Compila a crate `render-wasm` para WebAssembly e publica o artefato em
// `packages/render/assets/render_wasm.wasm` (+ `render_wasm.sha256`).
//
// Uso:
//   node scripts/build-render-wasm.mjs           # compila, copia e grava o hash
//   node scripts/build-render-wasm.mjs --check   # compila e confere se o asset commitado está atual
//
// O artefato é commitado de propósito, como o kernel geométrico experimental
// (`docs/decisoes/0045`): `npm ci`, CI e deploy não precisam de Rust. Quem mexe no render roda
// este script e commita o `.wasm` junto.
//
// Rust puro, alvo `wasm32-unknown-unknown`, sem C/C++. O perfil de release da crate já usa lto,
// strip e panic=abort; o teto de 2 MB é o mesmo do `render-wasm:check`.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const crate = join(raiz, 'crates', 'render-wasm');
const destinoDir = join(raiz, 'packages', 'render', 'assets');
const destino = join(destinoDir, 'render_wasm.wasm');
const caminhoHash = join(destinoDir, 'render_wasm.sha256');
const origens = [
  join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'render_wasm.wasm'),
  join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'render-wasm.wasm'),
];
const conferir = process.argv.includes('--check');

/** Piso de um módulo com BVH + path tracer + PNG; teto do asset separado (CONTRATO/PLANO T7). */
const MIN_BYTES = 20 * 1024;
const MAX_BYTES = 2 * 1024 * 1024;
const MAGICO = [0x00, 0x61, 0x73, 0x6d];

console.log(`[build:render-wasm] cargo build --release --target wasm32-unknown-unknown (${crate})`);
try {
  execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], {
    cwd: crate,
    stdio: 'inherit',
  });
} catch (e) {
  console.error(
    '[build:render-wasm] falha ao rodar cargo. Este build exige Rust com o alvo ' +
      'wasm32-unknown-unknown (`rustup target add wasm32-unknown-unknown`).\n' +
      (e instanceof Error ? e.message : String(e)),
  );
  process.exit(1);
}

const origem = origens.find((p) => existsSync(p));
if (!origem) {
  console.error('[build:render-wasm] artefato não encontrado. Procurado em:\n  ' + origens.join('\n  '));
  process.exit(1);
}

const bytes = readFileSync(origem);
const assinatura = bytes.subarray(0, 4);
if (!MAGICO.every((b, i) => assinatura[i] === b)) {
  console.error('[build:render-wasm] o arquivo compilado não é um módulo wasm (falta \\0asm).');
  process.exit(1);
}
if (bytes.length < MIN_BYTES || bytes.length > MAX_BYTES) {
  console.error(
    `[build:render-wasm] tamanho fora da faixa: ${bytes.length} bytes ` +
      `(${MIN_BYTES}..${MAX_BYTES}). Confira o perfil de release da crate.`,
  );
  process.exit(1);
}

if (conferir) {
  if (!existsSync(destino)) {
    console.error('[build:render-wasm] asset commitado ausente: rode `node scripts/build-render-wasm.mjs`.');
    process.exit(1);
  }
  const atual = readFileSync(destino);
  if (!atual.equals(bytes)) {
    console.error(
      '[build:render-wasm] o .wasm commitado está desatualizado. Rode `node scripts/build-render-wasm.mjs`.',
    );
    process.exit(1);
  }
  console.log(`[build:render-wasm] ok: artefato atual (${(bytes.length / 1024).toFixed(1)} kB)`);
  process.exit(0);
}

mkdirSync(destinoDir, { recursive: true });
copyFileSync(origem, destino);

const tamanho = statSync(destino).size;
const sha = execFileSync('git', ['hash-object', destino], { cwd: raiz }).toString().trim();
writeFileSync(caminhoHash, `${sha}\n`, 'utf8');
console.log(
  `[build:render-wasm] publicado packages/render/assets/render_wasm.wasm — ` +
    `${(tamanho / 1024).toFixed(1)} kB (blob ${sha.slice(0, 12)})`,
);
