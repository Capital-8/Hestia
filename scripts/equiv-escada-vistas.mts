/**
 * Fotografia determinística das vistas e dos números de escadas, paredes e lajes: corte longitudinal, corte transversal e elevação (motor),
 * quantitativos, avisos de norma e corpo do desenho. Serve de prova de que uma otimização não mudou a geometria: gera o JSON antes e depois
 * e compara com `scripts/equiv-comparar.mjs` (ou `diff`). Números arredondados a 1e-9.
 * Uso: npx vite-node scripts/equiv-escada-vistas.mts saida.json
 */
import { writeFileSync } from 'node:fs';
import { computeSection, resolveStairs, stairBodyForDrawing, stairNormIssues, stairQuantities, stairFinishModel, iniciarDespachoKernel } from '@hestia/engine';
import { readFileSync, existsSync } from 'node:fs';
import { projetoDe, TIPOS, type Tipo } from './bench-escada-vistas.mts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';

const arred = (_: string, v: unknown): unknown => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v);
const N = 6;
const out: Record<string, unknown> = {};
const caminho = caminhoDoWasm();
if (existsSync(caminho)) {
  await iniciarDespachoKernel({ fatiaA: true, fatiaB: true, sombra: false }, async () => readFileSync(caminho));
  await new Promise((r) => setTimeout(r, 800));
}
for (const tipo of TIPOS.filter((t) => !t.includes('gc'))) {
  const { project: p } = projetoDe(tipo as Tipo, N);
  const larg = N * 7 + 6;
  const linhas = {
    longit: { a: { x: -2, y: 0.01 }, b: { x: larg, y: 0.01 }, depth: 6 },
    transv: { a: { x: 2.5, y: -6 }, b: { x: 2.5, y: 6 }, depth: larg },
    elev: { a: { x: -2, y: -20 }, b: { x: larg, y: -20 }, depth: 60 },
  };
  const secoes: Record<string, unknown> = {};
  for (const [nome, l] of Object.entries(linhas)) {
    const s = computeSection(p, l);
    secoes[nome] = { length: s.length, zMin: s.zMin, zMax: s.zMax, cut: s.cut, silhouette: s.silhouette, beyond: s.beyond.map((b) => ({ ...b })), openings: s.openings.length, membranes: s.membranes, snap: s.snapRings };
  }
  const escadas = resolveStairs(p).map((s) => ({
    id: s.id,
    issues: stairNormIssues(s).map((i) => `${i.code}|${i.message}`),
    q: stairQuantities(s),
    corpo: stairBodyForDrawing(s).pieces,
    acab: stairFinishModel(s)?.solids ?? null,
  }));
  out[tipo] = { secoes, escadas };
}
writeFileSync(process.argv[2]!, JSON.stringify(out, arred));
console.log('ok', process.argv[2]);
process.exit(0);
