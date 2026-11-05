import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const RAIZ = process.cwd();
const DIRS = ['apps/web/src/ui', 'apps/web/src/editor'];
const IGNORAR = /(^|[\\/])(i18n|node_modules|dist)([\\/]|$)|\.test\.|\.spec\./;
const IGNORAR_ARQUIVO = /(^|[\\/])(i18n\.ts|i18nTabelas\.ts)$/;

const PALAVRAS_PT = /\b(não|com|sem|para|pelo|pela|dos|das|uma|um|vista|planta|prancha|nível|ambiente|parede|porta|janela|telhado|forro|laje|piso|escada|rampa|cota|etiqueta|selecionar|aplicar|editar|fechar|abrir|salvar|cancelar|excluir|remover|adicionar|novo|nova|nenhum|nenhuma|todos|todas|mais|menos|entre|sobre|abaixo|acima|esquerda|direita|centro|largura|altura|comprimento|espessura|área|perímetro|volume|material|tipo|família|camada|mover|copiar|colar|desfazer|refazer|confirmar|contínuo|tracejado|visível|oculto|bloqueado|salvo|carregando|erro|aviso|preencha|selecione|digite|clique|arraste|duplo)\b/i;
const ACENTOS = /[ãõçáéíóúâêôàèìòù]/i;

const arquivos = [];
function andar(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (IGNORAR.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) andar(p);
    else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(p);
  }
}
for (const d of DIRS) andar(join(RAIZ, d));

const achados = [];
const fala = (texto) => PALAVRAS_PT.test(texto) || ACENTOS.test(texto);
const tecnico = (texto) =>
  !/[A-Za-zÀ-ÿ]/.test(texto) ||
  /^[a-z0-9_-]+$/i.test(texto) ||
  /^(aria|data|role|type|button|checkbox|text|number|none|true|false|pt|en|es|de|fr|it|pl)$/i.test(texto) ||
  /^(https?:|\/|\.\/|\.\.\/|#|--|@)/.test(texto) ||
  /^[a-z0-9]+([.-][a-z0-9]+)+$/i.test(texto);

for (const arquivo of arquivos) {
  if (IGNORAR_ARQUIVO.test(arquivo)) continue;
  const texto = readFileSync(arquivo, 'utf8');
  const sf = ts.createSourceFile(arquivo, texto, ts.ScriptTarget.Latest, true, arquivo.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const linhas = texto.split(/\r?\n/);
  const rel = relative(RAIZ, arquivo).replaceAll('\\', '/');

  const registrar = (node, valor, tipo) => {
    const v = valor.trim().replace(/\s+/g, ' ');
    if (!v || tecnico(v) || !fala(v)) return;
    if (/^(Português|English|Español|Deutsch|Français|Italiano|Polski)$/i.test(v)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    achados.push({ arquivo: rel, linha: line + 1, tipo, texto: v, fonte: linhas[line]?.trim().slice(0, 180) });
  };

  /** `t(...)`, `tr(...)` etc. recebem chaves (ou o par PT/EN da faixa, coberto por RIBBON_EXTRA): não é texto fixo. */
  const chamadaDeTraducao = (pai) => {
    if (!ts.isCallExpression(pai)) return false;
    const nome = pai.expression.getText(sf);
    return ['t', 'tr', 'translate', 'tt', 'toolLabel', 'dictOf'].includes(nome);
  };

  const visitar = (node) => {
    if (ts.isJsxText(node)) registrar(node, node.getText(sf), 'jsx');
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const pai = node.parent;
      // chaves de objeto, imports, tipos e nomes de atributos não são texto de UI
      if (ts.isImportDeclaration(pai) || ts.isExportDeclaration(pai)) return;
      if (ts.isPropertyAssignment(pai) && pai.name === node) return;
      if (ts.isPropertySignature(pai) || ts.isMethodSignature(pai) || ts.isTypeLiteralNode(pai)) return;
      if (ts.isJsxAttribute(pai) && pai.name === node) return;
      if (chamadaDeTraducao(pai)) return;
      registrar(node, node.text, 'string');
    }
    // Template com interpolação (`${n} trechos · altura máx. ${v}`) também é texto de UI.
    if (ts.isTemplateExpression(node)) {
      if (chamadaDeTraducao(node.parent)) return;
      for (const parte of [node.head, ...node.templateSpans.map((s) => s.literal)]) {
        registrar(parte, parte.text, 'template');
      }
    }
    ts.forEachChild(node, visitar);
  };
  visitar(sf);
}

writeFileSync('reports/i18n/hardcoded-pt.json', JSON.stringify(achados, null, 2), 'utf8');
const porArquivo = {};
for (const a of achados) porArquivo[a.arquivo] = (porArquivo[a.arquivo] ?? 0) + 1;
console.log(`Strings fixas suspeitas: ${achados.length} em ${Object.keys(porArquivo).length} arquivos`);
for (const [f, n] of Object.entries(porArquivo).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(n).padStart(4), f);
console.log('\nExemplos:');
for (const a of achados.slice(0, 60)) console.log(`${a.arquivo}:${a.linha} [${a.tipo}] ${a.texto}`);

// Gate opcional para CI: `node scripts/audit-i18n-hardcoded.mjs --strict`
if (process.argv.includes('--strict') && achados.length > 0) {
  console.error(`\n${achados.length} string(s) fixa(s) suspeita(s): traduza com t(...) ou use chave do dicionário.`);
  process.exitCode = 1;
}
