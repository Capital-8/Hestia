// Portão da paleta de propriedades (docs/03 §painéis): a paleta tem de caber sem rolagem e nenhum rótulo, botão ou
// opção pode precisar de quebra de linha. Confere a densidade no CSS e o orçamento de caracteres dos rótulos visíveis.
// Uso: `node scripts/check-props-density.mjs` (roda no `npm run lint`).
import { readFileSync } from 'node:fs';

const CSS = 'apps/web/src/styles.css';
/** Arquivos que desenham a paleta (novos painéis de propriedades entram nesta lista). */
const PAINEL = [
  'apps/web/src/ui/Properties.tsx',
  'apps/web/src/ui/GraphicsProps.tsx',
  'apps/web/src/ui/FloorProperties.tsx',
  'apps/web/src/ui/SlabProperties.tsx',
  'apps/web/src/ui/RoofProperties.tsx',
  'apps/web/src/ui/StairProperties.tsx',
  'apps/web/src/ui/SectionViewProps.tsx',
  'apps/web/src/ui/DimensionProps.tsx',
];
/** Orçamento de caracteres do rótulo visível: a coluna de rótulo é 46% da paleta (~117 px a 11 px). */
const LABEL_MAX = 22;
/** Altura máxima da linha de parâmetro (px). */
const ROW_MAX = 22;
/** Largura mínima da paleta (px): coluna de rótulo (122) + coluna de valor útil. */
const PANEL_MIN = 250;

let bad = 0;
const fail = (msg) => {
  console.error(msg);
  bad++;
};

const css = readFileSync(CSS, 'utf8');
const block = (sel) => {
  const re = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  return m ? m[1] : null;
};
const px = (text, prop) => {
  const m = text?.match(new RegExp(`${prop}\\s*:\\s*([0-9.]+)px`));
  return m ? Number(m[1]) : null;
};

// 1. A paleta é larga o bastante para a coluna de rótulo e uma coluna de valor útil: o dock (ver editor/dockLayout.ts)
//    define a largura inicial e o mínimo ao arrastar a divisória.
const DOCK = 'apps/web/src/editor/dockLayout.ts';
const dockSrc = readFileSync(DOCK, 'utf8');
const dockMin = Number(dockSrc.match(/minW:\s*([0-9]+)/)?.[1] ?? NaN);
const dockInit = Number(dockSrc.match(/leftW:\s*([0-9]+)/)?.[1] ?? NaN);
if (!(dockMin >= PANEL_MIN)) fail(`${DOCK}: largura mínima do dock ${Number.isNaN(dockMin) ? 'ausente' : dockMin} px; o mínimo é ${PANEL_MIN} px`);
if (!(dockInit >= PANEL_MIN)) fail(`${DOCK}: largura inicial do dock ${Number.isNaN(dockInit) ? 'ausente' : dockInit} px; o mínimo é ${PANEL_MIN} px`);

// 3. Linha de parâmetro densa e com a coluna de rótulo fixa.
const prow = block('.prow');
if (!prow) fail(`${CSS}: falta a regra .prow`);
else {
  const h = px(prow, 'min-height');
  if (h === null || h > ROW_MAX) fail(`${CSS}: .prow com min-height ${h ?? 'ausente'} px; o máximo é ${ROW_MAX} px`);
  if (!/grid-template-columns:\s*(?:var\(--lbl,\s*)?46%/.test(prow)) fail(`${CSS}: .prow precisa dividir rótulo e valor em 46% (tabela de propriedades)`);
}

// 4. Botão nunca quebra linha (global e na classe .btn).
const btnGlobal = block('button');
if (!/white-space:\s*nowrap/.test(btnGlobal ?? '')) fail(`${CSS}: button precisa de white-space: nowrap`);
const btn = block('.btn');
if (!/white-space:\s*nowrap/.test(btn ?? '')) fail(`${CSS}: .btn precisa de white-space: nowrap`);

// 5. Cabeçalho de grupo compacto.
const summary = block('.pgroup > summary');
const pad = summary?.match(/padding:\s*([0-9.]+)px/);
if (!pad || Number(pad[1]) > 4) fail(`${CSS}: .pgroup > summary com padding vertical ${pad?.[1] ?? 'ausente'} px; o máximo é 4 px`);

// 6. Rótulo visível dentro do orçamento: é o que garante que o texto nunca precisa de quebra de linha.
//    Só o que é TEXTO na tela: `label="..."` das linhas e `<Group title="...">`. Tooltips (`title="..."` de outros
//    elementos) podem ser longos: eles não ocupam layout.
for (const file of PAINEL) {
  const src = readFileSync(file, 'utf8');
  const labels = [
    ...[...src.matchAll(/(?<![a-zA-Z-])label="([^"]+)"/g)].map((m) => m[1]),
    ...[...src.matchAll(/<Group title="([^"]+)"/g)].map((m) => m[1]),
  ];
  for (const label of labels) {
    if (label.length > LABEL_MAX) fail(`${file}: rótulo "${label}" tem ${label.length} caracteres; o máximo é ${LABEL_MAX} (cabe na coluna de 46%)`);
  }
}

if (bad) {
  console.error(`paleta de propriedades: ${bad} problema(s)`);
  process.exit(1);
}
console.log(`paleta de propriedades ok (linha ≤ ${ROW_MAX} px, painel ≥ ${PANEL_MIN} px, rótulo ≤ ${LABEL_MAX} caracteres)`);
