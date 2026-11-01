// Copia o kernel geométrico experimental para a raiz do build do app.
//
// Roda DEPOIS do `vite build` de propósito: o `vite-plugin-singlefile` inlinaria o `.wasm` em base64
// no HTML (e nos workers), o que baixaria ~320 kB para todo usuário mesmo com o recurso desligado.
// Copiando depois, o arquivo fica ao lado do app, é cacheável e só é buscado quando o kernel é
// ligado (ver `packages/geom/src/kernel/carregador.ts`).
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(raiz, 'packages', 'geom', 'assets', 'geom_wasm.wasm');
const destinoDir = join(raiz, 'apps', 'web', 'dist');
const destino = join(destinoDir, 'geom_wasm.wasm');

if (!existsSync(destinoDir)) {
  console.error('[copiar-wasm] dist não existe: rode `npm run build` (vite) antes.');
  process.exit(1);
}
if (!existsSync(origem)) {
  // Não é erro: o kernel é opcional. O app funciona inteiro sem ele (cai no TypeScript).
  console.warn('[copiar-wasm] packages/geom/assets/geom_wasm.wasm não existe — app seguirá sem o kernel experimental.');
  process.exit(0);
}

mkdirSync(destinoDir, { recursive: true });
copyFileSync(origem, destino);
const kb = (statSync(destino).size / 1024).toFixed(1);
console.log(`[copiar-wasm] apps/web/dist/geom_wasm.wasm — ${kb} kB (asset separado, fora do bundle)`);
