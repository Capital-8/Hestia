/**
 * Cria um suplemento novo a partir do modelo do SDK.
 *
 * Uso: npm run suplementos:novo -- <id> [--nome "Nome visível"] [--pasta <diretório>]
 *   Exemplo: npm run suplementos:novo -- com.minhaempresa.contador --nome "Contador"
 * A pasta nasce em `suplementos-autor/<último segmento do id>/` (ou em --pasta). Nunca sobrescreve uma pasta existente.
 */
import path from 'node:path';
import { criarSuplemento, NovoError } from '../sdk/novo.ts';

const args = process.argv.slice(2);
const valorDe = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const id = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1]!.startsWith('--')));
if (!id) {
  console.error('Uso: npm run suplementos:novo -- <id> [--nome "Nome"] [--pasta <diretório>]\nExemplo: npm run suplementos:novo -- com.minhaempresa.contador');
  process.exit(1);
}
try {
  const nome = valorDe('--nome');
  const destino = criarSuplemento(id, { sdkDir: path.resolve('sdk'), destinoBase: path.resolve(valorDe('--pasta') ?? 'suplementos-autor'), ...(nome ? { nome } : {}) });
  console.log(`Suplemento criado em ${path.relative(process.cwd(), destino)}`);
  console.log('Próximos passos: edite manifest.json e main.js; depois');
  console.log(`  npm run suplementos:empacotar -- ${path.relative(process.cwd(), destino)}`);
} catch (e) {
  if (e instanceof NovoError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}
