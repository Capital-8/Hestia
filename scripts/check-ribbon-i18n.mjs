#!/usr/bin/env node
/**
 * Cobertura dos rótulos inline da faixa (o helper `t('PT', 'EN')`).
 *
 * A faixa não usa o dicionário central: cada rótulo é traduzido por
 * `ribbonTxt(pt, lang)` a partir de `ribbon-i18n-*.json`. Se a string PT não
 * tiver linha no JSON, ES/DE/FR/IT/PL caem para o inglês. Este check garante
 * que todo `t('...', '...')` estático tem tradução.
 *
 * Uso: node scripts/check-ribbon-i18n.mjs [--strict]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const DIR = 'apps/web/src/ui/ribbon';
const ESTRITO = process.argv.includes('--strict');
const rows = ['1', '2', '3', '4'].flatMap((n) =>
  JSON.parse(readFileSync(`${DIR}/ribbon-i18n-${n}.json`, 'utf8')),
);
const porPt = new Map(rows.map((r) => [r.pt, r]));

const arquivos = [];
const andar = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) andar(p);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) arquivos.push(p);
  }
};
andar(DIR);

const estaticos = new Map();
const dinamicos = [];
for (const arquivo of arquivos) {
  const texto = readFileSync(arquivo, 'utf8');
  const sf = ts.createSourceFile(
    arquivo,
    texto,
    ts.ScriptTarget.Latest,
    true,
    arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visitar = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(sf) === 't' && node.arguments.length >= 2) {
      const [a] = node.arguments;
      if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
        estaticos.set(a.text, arquivo);
      } else if (ts.isTemplateExpression(a)) {
        dinamicos.push({ arquivo, linha: sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(node, visitar);
  };
  visitar(sf);
}

const faltando = [...estaticos.keys()].filter((pt) => !porPt.has(pt));
console.log(`rótulos estáticos t('PT','EN'): ${estaticos.size}`);
console.log(`com tradução no JSON: ${estaticos.size - faltando.length}`);
console.log(`sem tradução (cairiam em EN): ${faltando.length}`);
for (const f of faltando) console.log(`  AUSENTE: ${JSON.stringify(f)}`);
console.log(`templates dinâmicos (não cobertos pelo JSON): ${dinamicos.length}`);
for (const d of dinamicos) console.log(`  ${d.arquivo}:${d.linha}`);

if (faltando.length > 0 || (ESTRITO && dinamicos.length > 0)) process.exitCode = 1;
