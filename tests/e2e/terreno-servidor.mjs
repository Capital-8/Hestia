// Servidor estático mínimo sobre apps/web/dist para o E2E do terreno. O kernel Rust (WASM) só carrega por HTTP:
// `fetch` de file:// é bloqueado no Chrome, então o terreno (que depende do kernel) não funciona abrindo o dist por arquivo.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const DIST = resolve('apps/web/dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wasm': 'application/wasm', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Sobe o servidor numa porta livre; devolve `{ base, fechar }`. */
export async function subirServidor() {
  const servidor = createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    // O Chromium pede o favicon sozinho; o app não tem um, e um 404 viraria erro de console sem relação com o terreno.
    if (caminho === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const arquivo = caminho === '/' ? join(DIST, 'index.html') : join(DIST, caminho);
    if (!arquivo.startsWith(DIST) || !existsSync(arquivo) || !statSync(arquivo).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('nao encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(readFileSync(arquivo));
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const porta = servidor.address().port;
  return { base: `http://127.0.0.1:${porta}`, fechar: () => new Promise((ok) => servidor.close(ok)) };
}
