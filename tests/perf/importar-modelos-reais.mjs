// Importa CADA .glb de uma pasta pelo leitor real (packages/io/src/furniture/gltf.ts) e monta o asset
// (buildFurnitureAsset). Os arquivos sao dados nao confiaveis: so leitura, nada e copiado para o repositorio.
// Uso: node tests/perf/importar-modelos-reais.mjs [pasta]   (ou MODELOS_DIR=...; pula com aviso se a pasta nao existir)
// Saida: tabela em Markdown (arquivo, estado, ms, triangulos, caixa em metros, materiais/texturas, avisos).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { importGltf } from '../../packages/io/src/furniture/gltf.ts';
import { buildFurnitureAsset } from '../../packages/model/src/furniture/asset.ts';

const dir = process.argv[2] ?? process.env.MODELOS_DIR ?? '/home/dennylson/hestia-modelos-gratis/cc0';
if (!existsSync(dir)) {
  console.warn(`AVISO: pasta de modelos nao encontrada (${dir}); nada a fazer.`);
  process.exit(0);
}

function* walk(d) {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(glb|gltf)$/i.test(n)) yield p;
  }
}

const f2 = (v) => v.toFixed(2);
const rows = [];
for (const path of walk(dir)) {
  const rel = relative(dir, path);
  const t0 = performance.now();
  try {
    const bytes = new Uint8Array(readFileSync(path));
    const m = await importGltf({ name: path.split('/').pop(), bytes });
    const a = buildFurnitureAsset({ ...m, instances: m.instances });
    const ms = Math.round(performance.now() - t0);
    const sz = [0, 1, 2].map((k) => a.bbox.max[k] - a.bbox.min[k]);
    const trans = m.materials.filter((x) => (x.transmission ?? 0) > 0).length;
    const alpha = m.materials.filter((x) => x.opacity < 1).length;
    const opMin = Math.min(1, ...m.materials.map((x) => x.opacity));
    const tex = m.materials.filter((x) => x.textureIndex !== undefined).length;
    // luminancia media das cores base dos materiais sem textura (0..1): perto de 0 = escuro
    const lum = m.materials.length ? m.materials.reduce((s, x) => s + 0.2126 * x.color[0] + 0.7152 * x.color[1] + 0.0722 * x.color[2], 0) / m.materials.length : 0;
    rows.push({ rel, ok: true, opMin, ms, tri: m.stats.triangles, sz, mats: m.materials.length, tex, texFiles: m.textures.length, trans, alpha, lum, warn: m.warnings });
  } catch (e) {
    rows.push({ rel, ok: false, ms: Math.round(performance.now() - t0), err: e instanceof Error ? e.message : String(e) });
  }
}

console.log('| arquivo | estado | ms | triangulos | caixa X x Y x Z (m) | materiais (textura/transmissao/translucido) | opacidade minima | luminancia | avisos |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (!r.ok) console.log(`| ${r.rel} | ERRO | ${r.ms} | - | - | - | - | - | ${r.err} |`);
  else console.log(`| ${r.rel} | ok | ${r.ms} | ${r.tri} | ${r.sz.map(f2).join(' x ')} | ${r.mats} (${r.tex}/${r.trans}/${r.alpha}) | ${f2(r.opMin)} | ${f2(r.lum)} | ${r.warn.join('; ') || '-'} |`);
}
const ok = rows.filter((r) => r.ok).length;
console.log(`\nTotal: ${rows.length} arquivos, ${ok} ok, ${rows.length - ok} com erro.`);
