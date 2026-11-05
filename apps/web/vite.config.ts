import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Os WebAssemblies do Hestia são **assets separados**, servidos ao lado do app:
 *
 * - `geom_wasm.wasm`: kernel geométrico experimental (docs/decisoes/0045);
 * - `render_wasm.wasm`: render final offline (docs/handoff/render-video, T7/T8).
 *
 * Eles NÃO podem entrar no bundle: com o recurso desligado nenhum byte deles deve ser baixado, e
 * o app é single-file — inlinar centenas de kB em base64 no HTML penalizaria todo mundo. Duas
 * peças garantem isso:
 *
 * - `scripts/copiar-wasm-dist.mjs` copia os `.wasm` para a raiz do `dist` **depois** do build
 *   (assim o plugin single-file não os vê e não os inlina);
 * - os plugins abaixo servem os mesmos arquivos no servidor de desenvolvimento.
 */

const ARQUIVO_GEOM_WASM = fileURLToPath(
  new URL('../../packages/geom/assets/geom_wasm.wasm', import.meta.url),
);
const ARQUIVO_RENDER_WASM = fileURLToPath(
  new URL('../../packages/render/assets/render_wasm.wasm', import.meta.url),
);

function servirWasmNoDev(rota: string, arquivo: string, mensagemAusente: string) {
  return {
    name: `hestia-wasm-dev:${rota}`,
    configureServer(servidor: { middlewares: { use: (fn: unknown) => void } }) {
      servidor.middlewares.use(
        (
          req: { url?: string },
          res: {
            writeHead: (n: number, h: Record<string, string>) => void;
            end: (b: Buffer) => void;
          },
          next: () => void,
        ) => {
          if ((req.url ?? '').split('?')[0] !== rota) {
            next();
            return;
          }
          if (!existsSync(arquivo)) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end(Buffer.from(mensagemAusente));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/wasm', 'cache-control': 'no-store' });
          res.end(readFileSync(arquivo));
        },
      );
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    servirWasmNoDev(
      '/geom_wasm.wasm',
      ARQUIVO_GEOM_WASM,
      'kernel wasm ausente: rode `npm run build:wasm`',
    ),
    servirWasmNoDev(
      '/render_wasm.wasm',
      ARQUIVO_RENDER_WASM,
      'render wasm ausente: rode `npm run build:render-wasm`',
    ),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, cssCodeSplit: false },
});
