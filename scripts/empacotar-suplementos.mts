/**
 * Empacota os suplementos de exemplo (`plugins-exemplo/<pasta>/`) em arquivos `.hestiapkg` (zip) em
 * `plugins-exemplo/dist/`, usando o escritor zip de `packages/io`. O pacote tem `manifest.json` na raiz e os demais
 * arquivos da pasta com caminhos relativos e `/` (spec docs/plugins/08 §8). Só empacota: nada é validado nem executado
 * aqui (o Hestia valida ao instalar).
 *
 * Uso: npm run suplementos:empacotar            (todas as pastas de plugins-exemplo)
 *      npm run suplementos:empacotar -- <pasta> (uma pasta)
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createZip, type ZipFile } from '../packages/io/src/zip.ts';

const RAIZ = path.resolve('plugins-exemplo');
const SAIDA = path.join(RAIZ, 'dist');

/** Arquivos da pasta, em ordem estável, com caminho relativo separado por `/`. */
function arquivosDe(dir: string, base = dir): ZipFile[] {
  const out: ZipFile[] = [];
  for (const nome of readdirSync(dir).sort()) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivosDe(p, base));
    else out.push({ path: path.relative(base, p).split(path.sep).join('/'), data: new Uint8Array(readFileSync(p)) });
  }
  return out;
}

const pedidas = process.argv.slice(2);
const pastas = pedidas.length > 0 ? pedidas : readdirSync(RAIZ).filter((n) => n !== 'dist' && statSync(path.join(RAIZ, n)).isDirectory());
mkdirSync(SAIDA, { recursive: true });
for (const nome of pastas) {
  const dir = path.join(RAIZ, nome);
  const arquivos = arquivosDe(dir);
  if (!arquivos.some((a) => a.path === 'manifest.json')) {
    console.error(`${nome}: sem manifest.json na raiz; ignorado`);
    process.exitCode = 1;
    continue;
  }
  const destino = path.join(SAIDA, `${nome}.hestiapkg`);
  writeFileSync(destino, createZip(arquivos));
  console.log(`${path.relative(process.cwd(), destino)} (${arquivos.length} arquivos)`);
}
