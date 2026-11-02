// Hash SHA-256 das fontes do kernel Rust (decisão 0046 §2.8): `src/**/*.rs`, `schema/*.json`, `Cargo.toml`,
// `Cargo.lock` da crate e o `rust-toolchain.toml` da raiz. Ordem estável (caminho relativo POSIX, ordem
// byte a byte) e fim de linha normalizado: CRLF/LF não muda o hash. Compartilhado por `build-wasm.mjs`
// (grava `packages/geom/assets/geom_wasm.fonte.sha256`) e `verificar-wasm.mjs` (confere, sem Rust).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ARQUIVO_HASH_FONTE = 'geom_wasm.fonte.sha256';

/** Texto com `\n`; BOM de UTF-8 removido. */
export function normalizarConteudo(conteudo) {
  const texto = typeof conteudo === 'string' ? conteudo : Buffer.from(conteudo).toString('utf8');
  return texto.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Função pura: hash de uma lista `{ caminho, conteudo }` independente da ordem de entrada e do fim de linha. */
export function hashDeFontes(entradas) {
  const ordenadas = [...entradas].sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0));
  const h = createHash('sha256');
  for (const e of ordenadas) {
    h.update(`${e.caminho.split(String.fromCharCode(92)).join('/')}\n`);
    h.update(normalizarConteudo(e.conteudo));
    h.update('\n\0');
  }
  return h.digest('hex');
}

function* arquivosRs(dir, prefixo) {
  if (!existsSync(dir)) return;
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefixo}/${nome.name}`;
    if (nome.isDirectory()) yield* arquivosRs(join(dir, nome.name), rel);
    else if (nome.name.endsWith('.rs')) yield rel;
  }
}

/** Caminhos relativos (POSIX) das fontes que entram no hash. */
export function listarFontes(raiz) {
  const crate = 'crates/geom-wasm';
  const lista = [...arquivosRs(join(raiz, crate, 'src'), `${crate}/src`)];
  const schema = join(raiz, crate, 'schema');
  if (existsSync(schema)) {
    for (const n of readdirSync(schema)) if (n.endsWith('.json')) lista.push(`${crate}/schema/${n}`);
  }
  for (const f of [`${crate}/Cargo.toml`, `${crate}/Cargo.lock`, 'rust-toolchain.toml']) {
    if (existsSync(join(raiz, f))) lista.push(f);
  }
  return lista.sort();
}

export function calcularHashDasFontes(raiz) {
  return hashDeFontes(listarFontes(raiz).map((caminho) => ({ caminho, conteudo: readFileSync(join(raiz, caminho)) })));
}

/** Primeira palavra do arquivo gravado (64 hex), ou `null` se ausente. */
export function lerHashGravado(arquivo) {
  if (!existsSync(arquivo)) return null;
  return readFileSync(arquivo, 'utf8').trim().split(/\s+/)[0] ?? '';
}
