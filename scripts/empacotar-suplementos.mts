/**
 * Valida e empacota suplementos em arquivos `.hestiapkg` (zip) com o escritor zip de `packages/io`. O pacote tem
 * `manifest.json` na raiz e os demais arquivos da pasta com caminhos relativos e `/` (spec docs/plugins/08 §8).
 * ANTES de empacotar, o manifesto passa pelo MESMO validador do app (`validateManifestAny` e as regras do leitor de
 * pacote), e os erros saem legíveis; pasta com erro não gera pacote e o comando termina com código 1.
 *
 * Uso: npm run suplementos:empacotar                          (todas as pastas de plugins-exemplo)
 *      npm run suplementos:empacotar -- <pasta ou nome>       (uma pasta: caminho, ou nome dentro de plugins-exemplo)
 *      npm run suplementos:empacotar -- --validar <pasta>     (só valida, não grava)
 * Saída: `<pasta>/dist/<nome>.hestiapkg`; para os exemplos, `plugins-exemplo/dist/`. Ficam fora do pacote: `*.d.ts`,
 * testes do autor, `node_modules`, `dist` e arquivos ocultos.
 */
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createZip } from '../packages/io/src/zip.ts';
import { lerPasta } from '../sdk/pasta.ts';
import { formatarProblemas, validarArquivos } from '../sdk/validar.ts';

const RAIZ = path.resolve('plugins-exemplo');
const SO_VALIDAR = process.argv.includes('--validar');
const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const resolverPasta = (p: string): string => (existsSync(p) && statSync(p).isDirectory() ? path.resolve(p) : path.join(RAIZ, p));
const pastas = pedidas.length > 0
  ? pedidas.map(resolverPasta)
  : readdirSync(RAIZ).filter((n) => n !== 'dist' && statSync(path.join(RAIZ, n)).isDirectory()).map((n) => path.join(RAIZ, n));

for (const dir of pastas) {
  const nome = path.basename(dir);
  if (!existsSync(dir)) {
    console.error(`${nome}: pasta não encontrada (${dir})`);
    process.exitCode = 1;
    continue;
  }
  const arquivos = lerPasta(dir);
  const res = validarArquivos(arquivos);
  console.log(formatarProblemas(nome, res));
  if (!res.ok) {
    process.exitCode = 1;
    continue;
  }
  if (SO_VALIDAR) continue;
  const saida = path.dirname(dir) === RAIZ ? path.join(RAIZ, 'dist') : path.join(dir, 'dist');
  mkdirSync(saida, { recursive: true });
  const destino = path.join(saida, `${nome}.hestiapkg`);
  writeFileSync(destino, createZip(arquivos));
  console.log(`${path.relative(process.cwd(), destino)} (${arquivos.length} arquivos)`);
}
