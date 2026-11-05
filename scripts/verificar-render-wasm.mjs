// Confere o artefato WebAssembly do render offline, sem precisar de Rust.
//
// Uso: node scripts/verificar-render-wasm.mjs      (npm run render-wasm:check)
//
// O `.wasm` é commitado de propósito (`scripts/build-render-wasm.mjs` compila e publica): assim
// `npm ci`, o CI e o deploy não precisam de toolchain Rust. Este porteiro garante que o artefato
// (1) existe, (2) é um módulo wasm de verdade, (3) tem tamanho plausível, (4) é o mesmo blob
// registrado em `render_wasm.sha256` (resultado de `git hash-object`, não sha256 do arquivo) e
// (5) exporta a ABI mínima do CONTRATO.md §7. Além disso, renderiza um quadro de fumaça 16x9
// (cena de dois triângulos) para provar que `alocar`/`carregar_cena`/`renderizar_bloco`/
// `saida_ptr` funcionam de ponta a ponta no wasm real — sem depender de Rust no CI.
//
// Sai com 0 quando está tudo certo e 1 em qualquer falha, sempre com a mensagem do que fazer.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoWasm = join(raiz, 'packages', 'render', 'assets', 'render_wasm.wasm');
const caminhoHash = join(raiz, 'packages', 'render', 'assets', 'render_wasm.sha256');

/** Piso de um módulo com BVH + path tracer + PNG; teto do asset separado (T7). */
const MIN_BYTES = 20 * 1024;
const MAX_BYTES = 2 * 1024 * 1024;
/** Todo módulo wasm começa com `\0asm`. */
const MAGICO = [0x00, 0x61, 0x73, 0x6d];
/** Exportações que o lado JS usa; faltar uma significa artefato errado, não build incompleto. */
const EXPORTS_ESPERADOS = [
  'alocar',
  'carregar_cena',
  'preparar_trabalho',
  'renderizar_bloco',
  'saida_ptr',
  'saida_len',
  'cancelar',
  'limpar_cancelamento',
  'atualizar_camera',
  'atualizar_sol',
  'versao_abi',
];

const erros = [];
const avisos = [];
const rel = (p) => relative(raiz, p).split('\\').join('/');
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

let info = null;

/** Lê o blob git gravado no `.sha256` e compara com o que o git calcula para o artefato. */
function conferirBlob() {
  if (!existsSync(caminhoHash)) {
    erros.push(
      `${rel(caminhoHash)} não existe. Rode \`npm run build:render-wasm\` para regravá-lo junto do artefato.`,
    );
    return;
  }
  const esperado = readFileSync(caminhoHash, 'utf8').trim().split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{40}$/i.test(esperado)) {
    erros.push(
      `${rel(caminhoHash)} não tem um blob git válido ("${esperado.slice(0, 60)}"). ` +
        'Rode `npm run build:render-wasm`.',
    );
    return;
  }
  let real;
  try {
    real = execFileSync('git', ['hash-object', rel(caminhoWasm)], { cwd: raiz, encoding: 'utf8' }).trim();
  } catch (e) {
    erros.push(
      `não consegui calcular o blob do artefato com \`git hash-object\` ` +
        `(${e instanceof Error ? e.message : String(e)}). Rode dentro do repositório git.`,
    );
    return;
  }
  info.blob = real;
  if (real.toLowerCase() !== esperado.toLowerCase()) {
    erros.push(
      `o artefato não bate com ${rel(caminhoHash)}: o arquivo é o blob ${real} e o hash gravado é ` +
        `${esperado}. O \`.wasm\` foi trocado sem regerar o hash; rode \`npm run build:render-wasm\`.`,
    );
  }
}

/** Instancia o módulo (sem imports) e confere exportações + versão do ABI. Diagnóstico. */
function conferirAbi(bytes) {
  try {
    const modulo = new WebAssembly.Module(bytes);
    const imports = WebAssembly.Module.imports(modulo);
    if (imports.length > 0) {
      avisos.push(
        `o módulo tem ${imports.length} import(s) (${imports.map((i) => `${i.module}.${i.name}`).join(', ')}); ` +
          'o carregador atual espera um módulo autocontido.',
      );
    }
    const { exports } = new WebAssembly.Instance(modulo, {});
    const faltando = EXPORTS_ESPERADOS.filter((nome) => typeof exports[nome] !== 'function');
    if (faltando.length) {
      erros.push(`o módulo não exporta ${faltando.join(', ')}; a ABI do CONTRATO.md §7 está incompleta.`);
      return null;
    }
    info.versaoAbi = exports.versao_abi();
    return exports;
  } catch (e) {
    erros.push(
      `não consegui instanciar o módulo para conferir a ABI ` +
        `(${e instanceof Error ? e.message : String(e)}). Rode \`npm run build:render-wasm\`.`,
    );
    return null;
  }
}

// --- quadro de fumaça -------------------------------------------------------
// Bloco mínimo do formato HSTR (CONTRATO.md §4): um plano em z = -3 visto por uma câmera na
// origem olhando para -Z, sol no zênite. Serve só para provar que a ABI e os ponteiros andam.

const f32 = (valores) => {
  const bytes = Buffer.alloc(valores.length * 4);
  valores.forEach((v, i) => bytes.writeFloatLE(v, i * 4));
  return bytes;
};
const u32 = (valores) => {
  const bytes = Buffer.alloc(valores.length * 4);
  valores.forEach((v, i) => bytes.writeUInt32LE(v >>> 0, i * 4));
  return bytes;
};

function cenaDeFumaca() {
  // Projeção perspectiva (fov 0.9, 16:9, perto 0.1, longe 100), coluna maior.
  const projecao = [
    1.1588, 0, 0, 0, 0, 2.0601, 0, 0, 0, 0, -1.001, -1, 0, 0, -0.2002, 0,
  ];
  return Buffer.concat([
    Buffer.from('HSTR', 'binary'),
    u32([1, 4, 6, 0, 1, 1, 0]), // versão, vértices, índices, normais, materiais, lotes, flags
    f32([-5, -5, -3, 5, -5, -3, 5, 5, -3, -5, 5, -3]),
    u32([0, 1, 2, 0, 2, 3]),
    f32([0.6, 0.5, 0.35, 0.8, 0, 1, 0, 1.5, 0, 0, 0]), // material cinza/bege
    u32([0, 6, 0]),
    f32([0, 90, 2]), // sol no zênite
    f32([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, // view identidade
      ...projecao,
      0, 0, 0, // posição
      0.1, 100, // perto/longe
    ]),
  ]);
}

function trabalhoDeFumaca() {
  const bytes = Buffer.alloc(24);
  bytes.write('HSWK', 0, 'binary');
  bytes.writeUInt32LE(1, 4);
  bytes.writeUInt32LE(16, 8);
  bytes.writeUInt32LE(9, 12);
  bytes.writeFloatLE(1, 16);
  bytes.writeUInt32LE(0, 20);
  return bytes;
}

function conferirRenderDeFumaca(exports) {
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    erros.push('o módulo não exporta `memory`; a ABI não consegue copiar entrada/saída.');
    return;
  }
  const enviar = (dados, chamada, codigoEsperado, rotulo) => {
    const ptr = exports.alocar(dados.length);
    if (!ptr) {
      erros.push(`alocar falhou no quadro de fumaça (${rotulo}).`);
      return false;
    }
    new Uint8Array(exports.memory.buffer, ptr, dados.length).set(dados);
    const codigo = chamada(ptr, dados.length);
    if (codigo !== codigoEsperado) {
      erros.push(`quadro de fumaça: ${rotulo} devolveu ${codigo}, esperava ${codigoEsperado}.`);
      return false;
    }
    return true;
  };

  if (!enviar(cenaDeFumaca(), exports.carregar_cena, 0, 'carregar_cena')) return;
  if (!enviar(trabalhoDeFumaca(), exports.preparar_trabalho, 0, 'preparar_trabalho')) return;
  if (exports.limpar_cancelamento() !== 0) {
    erros.push('quadro de fumaça: limpar_cancelamento devolveu diferente de 0.');
    return;
  }
  if (exports.renderizar_bloco(0, 0, 16, 9, 2, 123) !== 0) {
    erros.push('quadro de fumaça: renderizar_bloco devolveu diferente de 0.');
    return;
  }
  const tamanho = exports.saida_len();
  if (tamanho !== 16 * 9 * 4) {
    erros.push(`quadro de fumaça: saida_len é ${tamanho}, esperava ${16 * 9 * 4}.`);
    return;
  }
  const ptr = exports.saida_ptr();
  if (!ptr) {
    erros.push('quadro de fumaça: saida_ptr devolveu 0 com saída não vazia.');
    return;
  }
  const primeira = new Uint8Array(exports.memory.buffer, ptr, tamanho).slice();
  if (!primeira.some((v) => v !== 0)) {
    erros.push('quadro de fumaça: a imagem saiu toda preta.');
    return;
  }
  for (let i = 3; i < primeira.length; i += 4) {
    if (primeira[i] !== 255) {
      erros.push('quadro de fumaça: alfa diferente de 255 (saída deveria ser opaca).');
      return;
    }
  }

  if (exports.renderizar_bloco(0, 0, 16, 9, 2, 123) !== 0) {
    erros.push('quadro de fumaça: segunda renderização falhou.');
    return;
  }
  const segunda = new Uint8Array(exports.memory.buffer, exports.saida_ptr(), tamanho).slice();
  if (Buffer.compare(Buffer.from(primeira), Buffer.from(segunda)) !== 0) {
    erros.push('quadro de fumaça: mesma seed gerou bytes diferentes (render não determinístico).');
    return;
  }

  exports.cancelar();
  if (exports.renderizar_bloco(0, 0, 8, 8, 1, 1) !== 4 || exports.saida_len() !== 0) {
    erros.push('quadro de fumaça: cancelar não devolveu 4 / não limpou a saída.');
    return;
  }
  exports.limpar_cancelamento();
  info.fumaca = { bytes: tamanho, deterministica: true, cancelamento: true };
}

function conferirArtefato() {
  if (!existsSync(caminhoWasm)) {
    erros.push(
      `${rel(caminhoWasm)} não existe. Rode \`npm run build:render-wasm\` (exige Rust e o alvo ` +
        'wasm32-unknown-unknown) e commite o artefato junto com o código da crate.',
    );
    return;
  }
  const tamanho = statSync(caminhoWasm).size;
  const bytes = readFileSync(caminhoWasm);
  info = { tamanho, versaoAbi: null, blob: null };

  const comeco = bytes.subarray(0, 4);
  if (!MAGICO.every((b, i) => comeco[i] === b)) {
    erros.push(
      `${rel(caminhoWasm)} não é um módulo WebAssembly: começa com ${hex(comeco)} em vez de ` +
        '00 61 73 6d (\\0asm). Rode `npm run build:render-wasm`.',
    );
    return;
  }
  if (tamanho < MIN_BYTES) {
    erros.push(
      `${rel(caminhoWasm)} tem ${tamanho} bytes (${kb(tamanho)}), abaixo do piso de ${kb(MIN_BYTES)}: ` +
        'o build saiu incompleto (stub) ou o arquivo foi truncado. Rode `npm run build:render-wasm`.',
    );
  } else if (tamanho > MAX_BYTES) {
    erros.push(
      `${rel(caminhoWasm)} tem ${tamanho} bytes (${kb(tamanho)}), acima do teto de ${kb(MAX_BYTES)}: ` +
        'confira o perfil de release da crate (lto, strip, opt-level, panic=abort).',
    );
  }

  if (tamanho >= MIN_BYTES && tamanho <= MAX_BYTES) {
    const exports = conferirAbi(bytes);
    if (exports) conferirRenderDeFumaca(exports);
  }
  conferirBlob();
}

conferirArtefato();

for (const aviso of avisos) console.warn(`[render-wasm:check] aviso: ${aviso}`);
if (erros.length > 0) {
  for (const erro of erros) console.error(`[render-wasm:check] erro: ${erro}`);
  console.error(`[render-wasm:check] reprovado: ${erros.length} erro(s).`);
  process.exit(1);
}

const partes = [`[render-wasm:check] ok: ${rel(caminhoWasm)} — ${kb(info.tamanho)}`, `blob ${info.blob.slice(0, 12)}`];
if (info.versaoAbi !== null) partes.push(`ABI ${info.versaoAbi}`);
if (info.fumaca) partes.push(`fumaça ${info.fumaca.bytes} B determinística`);
console.log(partes.join(', '));
