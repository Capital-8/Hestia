// Gera `packages/geom/src/kernel/v2/esquema.gerado.ts` a partir de `crates/geom-wasm/schema/cena-v4.json`
// (decisão 0046). O JSON mora fora dos pacotes TypeScript, por isso as constantes são geradas.
//
// Uso: node scripts/gerar-esquema-kernel.mjs           (regrava o arquivo)
//      node scripts/gerar-esquema-kernel.mjs --check   (falha se o arquivo estiver defasado)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAMINHO_JSON = join(raiz, 'crates', 'geom-wasm', 'schema', 'cena-v4.json');
export const CAMINHO_GERADO = join(raiz, 'packages', 'geom', 'src', 'kernel', 'v2', 'esquema.gerado.ts');

const normalizar = (t) => t.replace(/\r\n/g, '\n');

/** Texto do arquivo gerado (sempre com `\n`; a comparação ignora o fim de linha). */
export function gerarTexto(esquema) {
  const secoes = {};
  for (const s of esquema.secoes) {
    secoes[s.nome] = { id: s.id, chave: s.chave, colunas: s.colunas.map((c) => ({ nome: c.nome, tipo: c.tipo })) };
  }
  const consultas = {};
  for (const c of esquema.consultas) {
    consultas[c.nome] = {
      id: c.id,
      args: c.args,
      ...(c.argsVariaveis ? { argsVariaveis: true } : {}),
      saidas: c.saidas.map((o) => ({ nome: o.nome, tipo: o.tipo, elementos: o.elementos })),
    };
  }
  const tipos = {};
  for (const [nome, t] of Object.entries(esquema.tipos)) tipos[nome] = { bytes: t.bytes, arrayTs: t.arrayTs, codigo: t.codigo };
  const codigos = {};
  for (const [nome, v] of Object.entries(esquema.codigos)) if (!nome.startsWith('$')) codigos[nome] = v;
  const j = (v) => JSON.stringify(v, null, 2);
  return [
    '// ARQUIVO GERADO por scripts/gerar-esquema-kernel.mjs a partir de crates/geom-wasm/schema/cena-v4.json.',
    '// Não edite à mão: mude o JSON e rode `node scripts/gerar-esquema-kernel.mjs`.',
    '',
    `export const ESQUEMA_VERSAO = ${esquema.versao};`,
    `export const ABI_VERSAO = ${esquema.abi};`,
    `export const NIVEL_TODOS = ${esquema.args.nivel_todos};`,
    '',
    `export const TIPOS = ${j(tipos)} as const;`,
    '',
    `export const SECOES = ${j(secoes)} as const;`,
    '',
    `export const CONSULTAS = ${j(consultas)} as const;`,
    '',
    `export const CODIGOS = ${j(codigos)} as const;`,
    '',
    `export const LIMITES = ${j(esquema.limites)} as const;`,
    '',
  ].join('\n');
}

export function lerEsquema() {
  return JSON.parse(readFileSync(CAMINHO_JSON, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const texto = gerarTexto(lerEsquema());
  if (process.argv.includes('--check')) {
    const atual = normalizar(readFileSync(CAMINHO_GERADO, 'utf8'));
    if (atual !== texto) {
      console.error('[esquema] esquema.gerado.ts está defasado: rode `node scripts/gerar-esquema-kernel.mjs`.');
      process.exit(1);
    }
    console.log('[esquema] ok');
  } else {
    writeFileSync(CAMINHO_GERADO, texto.replace(/\n/g, '\r\n'), 'utf8');
    console.log('[esquema] gerado', CAMINHO_GERADO);
  }
}
