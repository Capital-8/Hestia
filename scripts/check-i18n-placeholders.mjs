#!/usr/bin/env node
/**
 * Verifica se os placeholders `{nome}` das strings de tradução são idênticos entre
 * o idioma de referência `en` e cada outro idioma presente no dicionário `I18N`.
 *
 * Uso:
 *   node scripts/check-i18n-placeholders.mjs            # relatório; nunca falha o processo
 *   node scripts/check-i18n-placeholders.mjs --strict   # exit 1 quando houver divergência
 *
 * Saída: reports/i18n/placeholder-mismatches.csv
 *        (idioma,chave,tipo,placeholders_en,placeholders_idioma)
 *
 * O dicionário é lido direto do AST de apps/web/src/editor/i18n.ts, resolvendo os
 * spreads de módulos locais (i18nTabelas.ts, i18n/areas/*.ts) sem transpilar o TS.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const I18N_TS = join(RAIZ, 'apps', 'web', 'src', 'editor', 'i18n.ts');
const CSV = join(RAIZ, 'reports', 'i18n', 'placeholder-mismatches.csv');
const STRICT = process.argv.includes('--strict');
const REFERENCIA = 'en';
const RE_PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;
const CACHE = new Map();

/** Lê um arquivo TS e indexa as variáveis exportadas e os imports nomeados. */
function lerFonte(caminho) {
  const cacheado = CACHE.get(caminho);
  if (cacheado) return cacheado;

  const fonte = ts.createSourceFile(
    caminho,
    readFileSync(caminho, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const info = { fonte, exports: new Map(), imports: new Map() };

  for (const no of fonte.statements) {
    if (ts.isVariableStatement(no)) {
      for (const declaracao of no.declarationList.declarations) {
        if (ts.isIdentifier(declaracao.name) && declaracao.initializer) {
          info.exports.set(declaracao.name.text, declaracao.initializer);
        }
      }
    } else if (ts.isImportDeclaration(no)) {
      const modulo = no.moduleSpecifier;
      if (!ts.isStringLiteral(modulo) || !modulo.text.startsWith('.')) continue;
      const bindings = no.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      const destino = resolve(dirname(caminho), modulo.text);
      for (const elemento of bindings.elements) {
        const importado = elemento.propertyName?.text ?? elemento.name.text;
        info.imports.set(elemento.name.text, { destino, importado });
      }
    }
  }

  CACHE.set(caminho, info);
  return info;
}

/** Desembrulha `as const`, `satisfies`, parênteses e devolve o objeto literal, se houver. */
function objetoLiteral(expr) {
  let atual = expr;
  while (
    atual &&
    (ts.isParenthesizedExpression(atual) ||
      ts.isAsExpression(atual) ||
      ts.isSatisfiesExpression(atual) ||
      ts.isTypeAssertionExpression(atual))
  ) {
    atual = atual.expression;
  }
  return atual && ts.isObjectLiteralExpression(atual) ? atual : null;
}

/** Texto de um literal de string (aspas simples/duplas ou template sem interpolação). */
function textoLiteral(expr) {
  let atual = expr;
  while (
    atual &&
    (ts.isParenthesizedExpression(atual) ||
      ts.isAsExpression(atual) ||
      ts.isSatisfiesExpression(atual) ||
      ts.isTypeAssertionExpression(atual))
  ) {
    atual = atual.expression;
  }
  if (atual && (ts.isStringLiteral(atual) || ts.isNoSubstitutionTemplateLiteral(atual))) {
    return atual.text;
  }
  return null;
}

function nomePropriedade(nome) {
  if (ts.isIdentifier(nome) || ts.isStringLiteral(nome) || ts.isNoSubstitutionTemplateLiteral(nome)) {
    return nome.text;
  }
  return null;
}

/** Resolve um identificador (export local ou import relativo) até um objeto literal. */
function resolverNome(nome, arquivo, visitados) {
  const chave = `${arquivo}:${nome}`;
  if (visitados.has(chave)) return null;
  visitados.add(chave);

  const info = lerFonte(arquivo);
  const exprLocal = info.exports.get(nome);
  if (exprLocal) {
    const obj = objetoLiteral(exprLocal);
    return obj ? { objet: obj, arquivo } : null;
  }

  const importacao = info.imports.get(nome);
  if (importacao) {
    try {
      const alvo = lerFonte(importacao.destino);
      const exprImportada = alvo.exports.get(importacao.importado);
      if (exprImportada) {
        const obj = objetoLiteral(exprImportada);
        return obj ? { objet: obj, arquivo: importacao.destino } : null;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function resolverExpressao(expr, arquivo, visitados) {
  const obj = objetoLiteral(expr);
  if (obj) return { objet: obj, arquivo };
  if (ts.isIdentifier(expr)) return resolverNome(expr.text, arquivo, visitados);
  return null;
}

/** Achata um objeto literal em `{ chave: texto }`, resolvendo spreads de módulos locais. */
function achatarObjeto(obj, arquivo, visitados) {
  const saida = {};
  for (const propriedade of obj.properties) {
    if (ts.isSpreadAssignment(propriedade)) {
      const alvo = resolverExpressao(propriedade.expression, arquivo, visitados);
      if (alvo) Object.assign(saida, achatarObjeto(alvo.objet, alvo.arquivo, visitados));
      continue;
    }
    if (!ts.isPropertyAssignment(propriedade)) continue;
    const chave = nomePropriedade(propriedade.name);
    if (chave === null) continue;
    const valor = textoLiteral(propriedade.initializer);
    if (valor !== null) saida[chave] = valor;
  }
  return saida;
}

/** Extrai `{ pt: {...}, en: {...}, ... }` do objeto I18N. */
function lerDicionarios() {
  const info = lerFonte(I18N_TS);
  const expr = info.exports.get('I18N');
  const obj = objetoLiteral(expr);
  if (!obj) throw new Error(`I18N não encontrado em ${I18N_TS}`);

  const dicionarios = {};
  for (const propriedade of obj.properties) {
    if (!ts.isPropertyAssignment(propriedade)) continue;
    const idioma = nomePropriedade(propriedade.name);
    if (idioma === null) continue;
    const alvo = resolverExpressao(propriedade.initializer, I18N_TS, new Set());
    if (alvo) dicionarios[idioma] = achatarObjeto(alvo.objet, alvo.arquivo, new Set());
  }
  return dicionarios;
}

function placeholders(texto) {
  return new Set(String(texto).match(RE_PLACEHOLDER) ?? []);
}

function iguais(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function celulaCsv(valor) {
  const s = String(valor);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const dicionarios = lerDicionarios();
const en = dicionarios[REFERENCIA];
if (!en) throw new Error(`Idioma de referência "${REFERENCIA}" ausente em I18N`);

const registros = [];
const resumo = [];

for (const idioma of Object.keys(dicionarios)) {
  if (idioma === REFERENCIA) continue;
  const alvo = dicionarios[idioma];
  let divergencias = 0;
  let ausentes = 0;

  for (const chave of Object.keys(en)) {
    const phEn = placeholders(en[chave]);

    if (!Object.hasOwn(alvo, chave)) {
      ausentes += 1;
      registros.push({
        idioma,
        chave,
        tipo: 'ausente',
        placeholdersEn: [...phEn].sort().join(' '),
        placeholdersIdioma: '',
      });
      continue;
    }

    const phAlvo = placeholders(alvo[chave]);
    if (!iguais(phEn, phAlvo)) {
      divergencias += 1;
      registros.push({
        idioma,
        chave,
        tipo: 'divergente',
        placeholdersEn: [...phEn].sort().join(' '),
        placeholdersIdioma: [...phAlvo].sort().join(' '),
      });
    }
  }

  resumo.push({ idioma, chaves: Object.keys(en).length, divergencias, ausentes });
}

mkdirSync(dirname(CSV), { recursive: true });
const linhas = [
  ['idioma', 'chave', 'tipo', 'placeholders_en', 'placeholders_idioma'],
  ...registros.map((r) => [r.idioma, r.chave, r.tipo, r.placeholdersEn, r.placeholdersIdioma]),
];
writeFileSync(CSV, `\uFEFF${linhas.map((l) => l.map(celulaCsv).join(',')).join('\n')}\n`, 'utf8');

console.log(`check-i18n-placeholders: ${resumo.length} idioma(s) verificado(s) contra "${REFERENCIA}".`);
for (const r of resumo) {
  console.log(
    `  ${r.idioma}: ${r.chaves} chave(s) verificada(s), ${r.divergencias} divergência(s), ${r.ausentes} ausente(s).`,
  );
}
console.log(`CSV: ${relative(RAIZ, CSV).split(sep).join('/')}`);
if (registros.length === 0) console.log('Nenhuma divergência de placeholder ou chave ausente encontrada.');
else console.log('Modo padrão não falha o processo; use --strict para exit 1.');

if (STRICT && registros.length > 0) process.exit(1);
