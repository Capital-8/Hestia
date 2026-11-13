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
// reprova o artefato. Se o módulo é ABI v2 (exporta `abi2_versao`), as exportações da v2 são obrigatórias
// (`verificar-wasm-exportacoes.mjs`).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ARQUIVO_HASH_FONTE, calcularHashDasFontes, lerHashGravado } from './hash-fontes.mjs';
import { conferirExportacoes } from './verificar-wasm-exportacoes.mjs';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoWasm = join(raiz, 'packages', 'geom', 'assets', 'geom_wasm.wasm');
const caminhoHash = join(raiz, 'packages', 'geom', 'assets', 'geom_wasm.sha256');
/** Hash das fontes Rust (decisão 0046 §2.8). `FONTE_SHA256_ARQUIVO` troca o arquivo (testes). */
const caminhoFonte = process.env.FONTE_SHA256_ARQUIVO || join(raiz, 'packages', 'geom', 'assets', ARQUIVO_HASH_FONTE);
/** `--estrito` (CI): a ausência do arquivo do hash das fontes reprova; sem a flag vira aviso. */
const estrito = process.argv.includes('--estrito');

/** Piso de um módulo com o ABI e a geometria; teto do que faz sentido servir como asset separado. */
const MIN_BYTES = 10 * 1024;
// 3 MB: a parede cortina (decisão 0056) levou o módulo de 1,95 para 2,28 MB e as fases 3 a 5 (junção, porta, recorte) ainda somam código;
// o teto anterior era 2,25 MB (antes disso, 2 MB). Decisão do coordenador em 2026-11-12, a confirmar com o dono.
const MAX_BYTES = 3 * 1024 * 1024;
/** Todo módulo wasm começa com os quatro bytes `\0asm`. */
const MAGICO = [0x00, 0x61, 0x73, 0x6d];
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

/**
 * Confere as exportações (v1, ou v2 quando o módulo exporta `abi2_versao`) e lê a versão do ABI v1 quando o módulo
 * instancia (sem imports). A leitura é diagnóstico; a falta de exportações da v2 reprova.
 */
function conferirAbi(bytes) {
  try {
    const modulo = new WebAssembly.Module(bytes);
    const funcoes = WebAssembly.Module.exports(modulo)
      .filter((e) => e.kind === 'function')
      .map((e) => e.name);
    const resultado = conferirExportacoes(funcoes);
    erros.push(...resultado.erros);
    avisos.push(...resultado.avisos);
    if (!resultado.v1Completa) return;
    const { exports } = new WebAssembly.Instance(modulo, {});
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

/** Recalcula o hash das fontes Rust (sem Rust instalado) e reprova se divergir do gravado. */
function conferirFonte() {
  const gravado = lerHashGravado(caminhoFonte);
  if (gravado === null) {
    const msg = `${rel(caminhoFonte)} não existe: o hash das fontes Rust ainda não foi gravado. Rode \`npm run build:wasm\`.`;
    if (estrito) erros.push(msg);
    else avisos.push(msg);
    return;
  }
  const real = calcularHashDasFontes(raiz);
  if (gravado.toLowerCase() !== real) {
    erros.push(
      `as fontes Rust mudaram desde que o .wasm foi gerado: hash gravado ${gravado.slice(0, 12)}, atual ${real.slice(0, 12)}. ` +
        'Rode `npm run build:wasm` e commite o binário junto (conflito de binário se resolve recompilando).',
    );
  } else if (info) info.fonte = real;
}

conferirArtefato();
conferirFonte();

for (const aviso of avisos) console.warn(`[wasm:check] aviso: ${aviso}`);
if (erros.length > 0) {
  for (const erro of erros) console.error(`[wasm:check] erro: ${erro}`);
  console.error(`[wasm:check] reprovado: ${erros.length} erro(s).`);
  process.exit(1);
}

const partes = [`[wasm:check] ok: ${rel(caminhoWasm)} — ${kb(info.tamanho)}`, `blob ${info.blob.slice(0, 12)}`];
if (info.versaoAbi !== null) partes.push(`ABI ${info.versaoAbi}`);
if (info.fonte) partes.push(`fontes ${info.fonte.slice(0, 12)}`);
console.log(partes.join(', '));
