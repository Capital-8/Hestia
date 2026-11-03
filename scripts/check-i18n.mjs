#!/usr/bin/env node
/**
 * Varre os arquivos .ts e .tsx de apps/web/src atrás de strings provavelmente em
 * português que ainda estão fora do dicionário (nós de texto JSX e atributos de UI).
 *
 * Uso:
 *   node scripts/check-i18n.mjs            # relatório; nunca falha o processo
 *   node scripts/check-i18n.mjs --strict   # exit 1 quando houver ocorrência
 *
 * Saída: reports/i18n/check-i18n.csv (arquivo,linha,coluna,tipo,atributo,texto).
 * Allowlist: scripts/i18n-allowlist.txt (uma entrada por linha; # comenta).
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(RAIZ, 'apps', 'web', 'src');
const CSV = join(RAIZ, 'reports', 'i18n', 'check-i18n.csv');
const ALLOWLIST = join(RAIZ, 'scripts', 'i18n-allowlist.txt');
const ATRIBUTOS = new Set(['title', 'aria-label', 'placeholder', 'alt', 'label']);
const STRICT = process.argv.includes('--strict');

const ACENTO = /[áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ]/;
const PALAVRAS_PT = [
  'de', 'da', 'do', 'das', 'dos', 'para', 'com', 'sem', 'não', 'nao', 'uma', 'um', 'ao', 'aos',
  'é', 'são', 'sao', 'está', 'esta', 'selecione', 'criar', 'abrir', 'salvar', 'editar', 'excluir',
  'cancelar', 'fechar', 'aplicar', 'adicionar', 'remover', 'renomear', 'tipo', 'nome', 'nível',
  'nivel', 'parede', 'porta', 'janela', 'piso', 'laje', 'forro', 'telhado', 'escada', 'rampa',
  'vista', 'planta', 'cota', 'ambiente', 'material', 'projeto', 'arquivo', 'exportar', 'importar',
  'configurações', 'configuracoes', 'propriedades', 'ferramenta', 'selecionado', 'selecionados',
  'nenhum', 'nenhuma', 'todos', 'todas', 'mover', 'copiar', 'colar', 'medir', 'desenhar',
  'concluir', 'altura', 'largura', 'comprimento', 'espessura', 'número', 'numero', 'ângulo',
  'angulo', 'opções', 'opcoes', 'definir', 'alterar', 'restaurar', 'padrão', 'padrao',
];
const REGRA_PALAVRAS = new RegExp(
  `(^|[^\\p{L}])(${PALAVRAS_PT.join('|')})(?=[^\\p{L}]|$)`,
  'iu',
);

/** Heurística: acento, sufixo típico de PT ou palavra funcional portuguesa. */
function provavelPT(texto) {
  const t = texto.replace(/\s+/g, ' ').trim();
  if (t.length < 2 || !/\p{L}/u.test(t)) return false;
  if (/^(?:\{[^}]*\}|[<>=/\\|:;.,…·•—–-]+)$/.test(t)) return false;
  if (ACENTO.test(t)) return true;
  if (/(?:ção|ções|ão|õe)(?![a-z])/iu.test(t)) return true;
  return REGRA_PALAVRAS.test(t);
}

function lerAllowlist() {
  try {
    return readFileSync(ALLOWLIST, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function permitido(allowlist, arquivo, linha, texto) {
  return allowlist.some((entrada) => {
    if (entrada.startsWith('texto:')) return texto.includes(entrada.slice('texto:'.length));
    if (/:\d+$/.test(entrada)) return `${arquivo}:${linha}`.startsWith(entrada);
    return arquivo === entrada || arquivo.endsWith(entrada) || arquivo.includes(entrada);
  });
}

const IGNORAR_DIR = new Set(['node_modules', 'dist', '.git']);
const ehTeste = (arquivo) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(arquivo) || /[\\/]__tests__[\\/]/.test(arquivo);

function* percorrer(dir) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) {
      if (!IGNORAR_DIR.has(nome)) yield* percorrer(caminho);
    } else if (/\.[cm]?[jt]sx?$/.test(nome) && !ehTeste(caminho)) {
      yield caminho;
    }
  }
}

function coletarStrings(expr, fonte, saida) {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    saida.push({ texto: expr.text, pos: expr.getStart(fonte) });
    return;
  }
  if (ts.isTemplateExpression(expr)) {
    saida.push({ texto: expr.head.text, pos: expr.head.getStart(fonte) });
    for (const trecho of expr.templateSpans) {
      saida.push({ texto: trecho.literal.text, pos: trecho.literal.getStart(fonte) });
    }
    return;
  }
  // Não desce em JSX aninhado: os nós de texto de lá são visitados pelo passe principal.
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) return;
  ts.forEachChild(expr, (filho) => coletarStrings(filho, fonte, saida));
}

function analisarArquivo(caminho, allowlist) {
  const fonte = ts.createSourceFile(
    caminho,
    readFileSync(caminho, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    caminho.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const relativo = relative(RAIZ, caminho).split(sep).join('/');
  const achados = [];

  const registrar = (texto, pos, tipo, atributo) => {
    if (!provavelPT(texto)) return;
    const { line, character } = fonte.getLineAndCharacterOfPosition(pos);
    const linha = line + 1;
    const limpo = texto.replace(/\s+/g, ' ').trim();
    if (permitido(allowlist, relativo, linha, limpo)) return;
    achados.push({ arquivo: relativo, linha, coluna: character + 1, tipo, atributo, texto: limpo });
  };

  const visitar = (no) => {
    if (ts.isJsxText(no)) {
      registrar(no.getText(fonte), no.getStart(fonte), 'texto-jsx', '');
    } else if (ts.isJsxAttribute(no)) {
      const nome = no.name.getText(fonte);
      if (ATRIBUTOS.has(nome) && no.initializer) {
        if (ts.isStringLiteral(no.initializer)) {
          registrar(no.initializer.text, no.initializer.getStart(fonte), 'atributo', nome);
        } else if (ts.isJsxExpression(no.initializer) && no.initializer.expression) {
          const strings = [];
          coletarStrings(no.initializer.expression, fonte, strings);
          for (const s of strings) registrar(s.texto, s.pos, 'atributo', nome);
        }
      }
    }
    ts.forEachChild(no, visitar);
  };

  visitar(fonte);
  return achados;
}

function celulaCsv(valor) {
  const s = String(valor);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const allowlist = lerAllowlist();
const arquivos = [...percorrer(SRC)];
const achados = [];
for (const arquivo of arquivos) achados.push(...analisarArquivo(arquivo, allowlist));

mkdirSync(dirname(CSV), { recursive: true });
const linhas = [
  ['arquivo', 'linha', 'coluna', 'tipo', 'atributo', 'texto'],
  ...achados.map((a) => [a.arquivo, a.linha, a.coluna, a.tipo, a.atributo, a.texto]),
];
writeFileSync(CSV, `\uFEFF${linhas.map((l) => l.map(celulaCsv).join(',')).join('\n')}\n`, 'utf8');

const porArquivo = new Map();
for (const a of achados) porArquivo.set(a.arquivo, (porArquivo.get(a.arquivo) ?? 0) + 1);
const top = [...porArquivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

console.log(`check-i18n: ${achados.length} ocorrência(s) em ${porArquivo.size} de ${arquivos.length} arquivo(s) varrido(s).`);
console.log(`CSV: ${relative(RAIZ, CSV).split(sep).join('/')}`);
if (top.length > 0) {
  console.log('Top arquivos:');
  for (const [arquivo, n] of top) console.log(`  ${String(n).padStart(5)}  ${arquivo}`);
}
if (achados.length === 0) console.log('Nenhuma string PT provável encontrada.');
else console.log('Modo padrão não falha o processo; use --strict para exit 1.');

if (STRICT && achados.length > 0) process.exit(1);
