import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * O kernel geométrico experimental é um **asset separado**, servido ao lado do app
 * (docs/decisoes/0045). Ele NÃO pode entrar no bundle: com o recurso desligado (o padrão) nenhum
 * byte dele deve ser baixado, e o app é single-file — inlinar 300 kB em base64 no HTML penalizaria
 * todo mundo. Duas peças garantem isso:
 *
 * - `scripts/copiar-wasm-dist.mjs` copia o `.wasm` para a raiz do `dist` **depois** do build
 *   (assim o plugin single-file não o vê e não o inlina);
 * - o plugin abaixo serve o mesmo arquivo no servidor de desenvolvimento.
 */

const ARQUIVO_WASM = fileURLToPath(new URL('../../packages/geom/assets/geom_wasm.wasm', import.meta.url));
const ROTA = '/geom_wasm.wasm';
/** Versão da raiz (a mesma que o workflow da release confere contra a tag). */
const VERSAO_APP = (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;

function servirWasmNoDev() {
  return {
    name: 'hestia-kernel-wasm-dev',
    configureServer(servidor: { middlewares: { use: (fn: unknown) => void } }) {
      servidor.middlewares.use((req: { url?: string }, res: { writeHead: (n: number, h: Record<string, string>) => void; end: (b: Buffer) => void }, next: () => void) => {
        if ((req.url ?? '').split('?')[0] !== ROTA) {
          next();
          return;
        }
        if (!existsSync(ARQUIVO_WASM)) {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end(Buffer.from('kernel wasm ausente: rode `npm run build:wasm`'));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/wasm', 'cache-control': 'no-store' });
        res.end(readFileSync(ARQUIVO_WASM));
      });
    },
  };
}

/**
 * Carimba a versão no HTML publicado.
 *
 * O site (repo `hestia-web`) copia `dist/` para `app/` e um verificador compara esta meta com a tag
 * da release. Sem isso não há como saber, de fora, qual versão está no ar — foi assim que o /app
 * ficou dois releases atrasado sem ninguém notar.
 */
function carimbarVersao() {
  return {
    name: 'hestia-carimbar-versao',
    transformIndexHtml(html: string): string {
      return html.replace('</head>', `  <meta name="hestia-version" content="${VERSAO_APP}" />\n  </head>`);
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(VERSAO_APP),
  },
  plugins: [react(), viteSingleFile(), servirWasmNoDev(), carimbarVersao()],
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, cssCodeSplit: false },
});
