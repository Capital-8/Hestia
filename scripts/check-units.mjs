// Trava de unidades: nenhum texto de interface formata medida por conta própria.
// Uso: `node scripts/check-units.mjs` (portão), `--report` (totais) e `--update` (reduz a linha de base).
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE = 'scripts/units-baseline.json';
const ROOTS = ['apps/web/src'];

/** Padrões proibidos em código de interface (cada linha conta uma vez). */
export const PATTERNS = [
  /\.toFixed\(/,
  /toLocaleString\(|Intl\.NumberFormat/,
  /\.replace\(\s*['"]\.['"]\s*,\s*['"],['"]\s*\)/,
  /m²|m³|R\$/,
  /unit="(?:m|cm|mm|m²|°|%)"/,
  /scale=\{\s*(?:100|1000)\s*\}/,
];

/** Isenção: `// units-ok: <motivo>` (ou `{/* units-ok: ... *\/}`) na linha ou na anterior. */
export const EXEMPT = /units-ok:\s*\S/;

/** Conta as linhas de um texto que casam com algum padrão e não estão isentas. */
export function scanText(src) {
  const lines = src.split(/\r?\n/);
  let total = 0;
  lines.forEach((line, i) => {
    if (!PATTERNS.some((re) => re.test(line))) return;
    if (EXEMPT.test(line) || (i > 0 && EXEMPT.test(lines[i - 1]))) return;
    total++;
  });
  return total;
}

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) yield* walk(file);
    else if (/\.(ts|tsx)$/.test(name)) yield file;
  }
}

/** Contagem por arquivo (caminho POSIX) em `packages/<pkg>/src` e `apps/web/src`. */
export function scanUnits() {
  const roots = [...ROOTS];
  for (const name of readdirSync('packages').sort()) {
    const src = path.join('packages', name, 'src');
    if (existsSync(src) && statSync(src).isDirectory()) roots.push(src);
  }
  const out = new Map();
  for (const root of roots) {
    for (const file of walk(root)) {
      const rel = file.split(path.sep).join('/');
      if (/\.(test|stories)\./.test(path.basename(rel))) continue;
      if (/^packages\/model\/src\/units[^/]*\.ts$/.test(rel)) continue;
      // Dicionários são texto traduzido, não formatação: "m²"/"m³"/"R$" aparecem nas próprias traduções.
      if (/(^|\/)(i18n\.ts|i18nTabelas\.ts|i18n\/)/.test(rel)) continue;
      const count = scanText(readFileSync(file, 'utf8'));
      if (count > 0) out.set(rel, count);
    }
  }
  return out;
}

function readBaseline() {
  if (!existsSync(BASELINE)) return {};
  return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

function report(counts) {
  const totals = new Map();
  for (const [file, count] of counts) {
    const pkg = file.startsWith('apps/') ? 'apps/web' : file.split('/').slice(0, 2).join('/');
    totals.set(pkg, (totals.get(pkg) ?? 0) + count);
  }
  for (const [pkg, count] of [...totals].sort((a, b) => b[1] - a[1])) console.log(`${pkg}: ${count}`);
  console.log(`total: ${[...counts.values()].reduce((s, n) => s + n, 0)} em ${counts.size} arquivo(s)`);
  for (const [file, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${count}  ${file}`);
}

/** Executa o portão; devolve o código de saída (0 ok, 1 violação). */
export function main(args = process.argv.slice(2)) {
  const counts = scanUnits();

  if (args.includes('--report')) {
    report(counts);
    return 0;
  }

  if (args.includes('--update')) {
    const base = readBaseline();
    const cresceu = [...counts].filter(([file, count]) => count > (base[file] ?? 0));
    if (Object.keys(base).length > 0 && cresceu.length > 0) {
      for (const [file, count] of cresceu) console.error(`${file}: ${count} ocorrência(s) (base ${base[file] ?? 0})`);
      console.error('A linha de base de unidades só pode diminuir.');
      return 1;
    }
    const data = Object.fromEntries([...counts].sort((a, b) => a[0].localeCompare(b[0])));
    writeFileSync(BASELINE, `${JSON.stringify(data, null, 2)}
`, 'utf8');
    console.log(`linha de base atualizada: ${counts.size} arquivo(s)`);
    return 0;
  }

  const base = readBaseline();
  let bad = 0;
  for (const [file, count] of counts) {
    const before = base[file] ?? 0;
    if (count > before) {
      console.error(`${file}: ${count} ocorrência(s) de formatação solta (base ${before})`);
      bad++;
    } else if (count < before) {
      console.warn(`aviso: ${file} diminuiu (${before} → ${count}); rode --update para baixar a base`);
    }
  }
  for (const file of Object.keys(base)) {
    if (!counts.has(file)) console.warn(`aviso: ${file} não tem mais ocorrências; rode --update para baixar a base`);
  }
  if (bad) {
    console.error('Use formatQuantity/parseQuantityText/NumField quantity ou isente com "// units-ok: <motivo>".');
    return 1;
  }
  console.log('unidades ok');
  return 0;
}

const executado = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executado) process.exit(main());
