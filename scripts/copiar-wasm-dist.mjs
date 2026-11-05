// Copia os artefatos WebAssembly opcionais para a raiz do build do app.
//
// Roda DEPOIS do `vite build` de propósito: o `vite-plugin-singlefile` inlinaria o `.wasm` em
// base64 no HTML (e nos workers), o que baixaria centenas de kB para todo usuário mesmo com o
// recurso desligado. Copiando depois, os arquivos ficam ao lado do app, são cacheáveis e só são
// buscados quando o recurso é ativado:
//
// - `geom_wasm.wasm` — kernel geométrico experimental (`docs/decisoes/0045`);
// - `render_wasm.wasm` — render final Rust (`docs/handoff/render-video`, T7/T8).
//
// Ausência de qualquer um dos dois não é erro: ambos são opcionais e o app funciona sem eles
// (geometria em TypeScript e render em rascunho).
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(raiz, 'apps', 'web', 'dist');

const assets = [
  {
    origem: join(raiz, 'packages', 'geom', 'assets', 'geom_wasm.wasm'),
    nome: 'geom_wasm.wasm',
    rotulo: 'kernel geométrico experimental',
  },
  {
    origem: join(raiz, 'packages', 'render', 'assets', 'render_wasm.wasm'),
    nome: 'render_wasm.wasm',
    rotulo: 'render final Rust',
  },
];

if (!existsSync(dist)) {
  console.error('[copiar-wasm] dist não existe: rode `npm run build` (vite) antes.');
  process.exit(1);
}

for (const asset of assets) {
  if (!existsSync(asset.origem)) {
    console.warn(
      `[copiar-wasm] ${asset.origem} não existe — app seguirá sem ${asset.rotulo}.`,
    );
    continue;
  }
  const destino = join(dist, asset.nome);
  mkdirSync(dist, { recursive: true });
  copyFileSync(asset.origem, destino);
  const kb = (statSync(destino).size / 1024).toFixed(1);
  console.log(`[copiar-wasm] apps/web/dist/${asset.nome} — ${kb} kB (asset separado, fora do bundle)`);
}
