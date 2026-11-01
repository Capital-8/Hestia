// Confere o artefato WebAssembly do kernel geométrico experimental, sem precisar de Rust.
//
// Uso: node scripts/verificar-wasm.mjs      (npm run wasm:check)
//
// O `.wasm` é commitado de propósito (`scripts/build-wasm.mjs` compila e publica): assim `npm ci`, o CI e
// o deploy não precisam de toolchain Rust. Este script é o portão barato que garante que o artefato
// commitado (1) existe, (2) é um módulo wasm de verdade, (3) tem tamanho plausível e (4) é o mesmo blob
// registrado em `geom_wasm.sha256` — que guarda o resultado de `git hash-object`, não um sha256 do
// arquivo, porque é isso que o build-wasm.mjs grava.
//
// Sai com 0 quando está tudo certo e 1 quando alguma coisa falha; toda falha sai com uma mensagem que
// diz o que fazer. A versão do ABI é lida quando o módulo instancia sem imports, mas é diagnóstico: não
// reprova o artefato.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoWasm = join(raiz, 'packages', 'geom', 'assets', 'geom_wasm.wasm');
const caminhoHash = join(raiz, 'packages', 'geom', 'assets', 'geom_wasm.sha256');

/** Piso de um módulo com o ABI e a geometria; teto do que faz sentido servir como asset separado. */
const MIN_BYTES = 10 * 1024;
const MAX_BYTES = 2 * 1024 * 1024;
/** Todo módulo wasm começa com os quatro bytes `\0asm`. */
const MAGICO = [0x00, 0x61, 0x73, 0x6d];
/** Exportações que o lado JS usa; faltar uma significa artefato errado, não build incompleto. */
const EXPORTS_ESPERADOS = ['preparar_entrada', 'executar', 'saida_area', 'versao_abi'];

const erros = [];
const avisos = [];
const rel = (p) => relative(raiz, p).split('\\').join('/');
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

let info = null;

/** Lê o blob git gravado no `.sha256` e compara com o que o git calcula para o artefato. */
function conferirBlob() {
  if (!existsSync(caminhoHash)) {
    erros.push(`${rel(caminhoHash)} não existe. Rode \`npm run build:wasm\` para regravá-lo junto do artefato.`);
    return;
  }
  const esperado = readFileSync(caminhoHash, 'utf8').trim().split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/i.test(esperado)) {
    erros.push(`${rel(caminhoHash)} não tem um blob git válido ("${esperado.slice(0, 60)}"). Rode \`npm run build:wasm\`.`);
    return;
  }
  let real;
  try {
    real = execFileSync('git', ['hash-object', rel(caminhoWasm)], { cwd: raiz, encoding: 'utf8' }).trim();
  } catch (e) {
    erros.push(
      `não consegui calcular o blob do artefato com \`git hash-object\` (${e instanceof Error ? e.message : String(e)}). ` +
        'O hash não foi conferido; rode dentro do repositório git.',
    );
    return;
  }
  info.blob = real;
  if (real.toLowerCase() !== esperado.toLowerCase()) {
    erros.push(
      `o artefato não bate com ${rel(caminhoHash)}: o arquivo é o blob ${real} e o hash gravado é ${esperado}. ` +
        'O `.wasm` foi trocado sem regerar o hash; rode `npm run build:wasm`.',
    );
  }
}

/** Lê a versão do ABI e confere as exportações, quando o módulo instancia (sem imports). Diagnóstico. */
function conferirAbi(bytes) {
  try {
    const modulo = new WebAssembly.Module(bytes);
    const { exports } = new WebAssembly.Instance(modulo, {});
    const faltando = EXPORTS_ESPERADOS.filter((nome) => typeof exports[nome] !== 'function');
    if (faltando.length) {
      avisos.push(`o módulo não exporta ${faltando.join(', ')}; a versão do ABI não pôde ser conferida.`);
      return;
    }
    info.versaoAbi = exports.versao_abi();
  } catch (e) {
    avisos.push(`não consegui instanciar o módulo para ler a versão do ABI (${e instanceof Error ? e.message : String(e)}).`);
  }
}

function conferirArtefato() {
  if (!existsSync(caminhoWasm)) {
    erros.push(
      `${rel(caminhoWasm)} não existe. Rode \`npm run build:wasm\` (exige Rust e o alvo wasm32-unknown-unknown) ` +
        'e commite o artefato junto com o código da crate.',
    );
    return;
  }
  const tamanho = statSync(caminhoWasm).size;
  const bytes = readFileSync(caminhoWasm);
  info = { tamanho, versaoAbi: null, blob: null };

  const comeco = bytes.subarray(0, 4);
  if (!MAGICO.every((b, i) => comeco[i] === b)) {
    erros.push(
      `${rel(caminhoWasm)} não é um módulo WebAssembly: começa com ${hex(comeco)} em vez de 00 61 73 6d (\\0asm). ` +
        'Rode `npm run build:wasm` para regerar.',
    );
    return;
  }
  if (tamanho < MIN_BYTES) {
    erros.push(
      `${rel(caminhoWasm)} tem ${tamanho} bytes (${kb(tamanho)}), abaixo do piso de ${kb(MIN_BYTES)}: ` +
        'o build saiu incompleto (stub) ou o arquivo foi truncado. Rode `npm run build:wasm`.',
    );
  } else if (tamanho > MAX_BYTES) {
    erros.push(
      `${rel(caminhoWasm)} tem ${tamanho} bytes (${kb(tamanho)}), acima do teto de ${kb(MAX_BYTES)}: ` +
        'confira o perfil de release da crate (lto, strip, opt-level) antes de commitar.',
    );
  }

  if (tamanho >= MIN_BYTES && tamanho <= MAX_BYTES) conferirAbi(bytes);
  conferirBlob();
}

conferirArtefato();

for (const aviso of avisos) console.warn(`[wasm:check] aviso: ${aviso}`);
if (erros.length > 0) {
  for (const erro of erros) console.error(`[wasm:check] erro: ${erro}`);
  console.error(`[wasm:check] reprovado: ${erros.length} erro(s).`);
  process.exit(1);
}

const partes = [`[wasm:check] ok: ${rel(caminhoWasm)} — ${kb(info.tamanho)}`, `blob ${info.blob.slice(0, 12)}`];
if (info.versaoAbi !== null) partes.push(`ABI ${info.versaoAbi}`);
console.log(partes.join(', '));
