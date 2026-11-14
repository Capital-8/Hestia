/**
 * Cria um suplemento novo a partir de `sdk/template/` (comando `npm run suplementos:novo -- <id>`). Troca `__ID__` e
 * `__NOME__`, copia `LEIA-ME.md` como `README.md` e junta `hestia-plugin.d.ts` para o editor completar o `ctx`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export class NovoError extends Error {}

/** "com.empresa.contador-de-portas" -> "Contador De Portas" (nome padrão quando o autor não dá um). */
export function nomeDoId(id: string): string {
  const ultimo = id.split('.').pop() ?? id;
  return ultimo.split('-').filter(Boolean).map((p) => p[0]!.toUpperCase() + p.slice(1)).join(' ');
}

export interface OpcoesNovo {
  /** Pasta do SDK (onde está `template/`). */
  sdkDir: string;
  /** Pasta onde o suplemento será criado (`<destinoBase>/<último segmento do id>`). */
  destinoBase: string;
  nome?: string;
}

/** Cria a pasta e devolve o caminho dela. Recusa id inválido e pasta já existente (nunca sobrescreve). */
export function criarSuplemento(id: string, o: OpcoesNovo): string {
  if (!ID_RE.test(id)) throw new NovoError(`Id inválido: "${id}". Use reverso-DNS em minúsculas, por exemplo com.minhaempresa.contador.`);
  const nome = (o.nome ?? nomeDoId(id)).replace(/["\\\n\r]/g, '');
  const destino = path.join(o.destinoBase, id.split('.').pop()!);
  if (existsSync(destino)) throw new NovoError(`A pasta ${destino} já existe; escolha outro id ou apague-a.`);
  mkdirSync(destino, { recursive: true });
  const modelo = path.join(o.sdkDir, 'template');
  for (const f of readdirSync(modelo)) {
    const texto = readFileSync(path.join(modelo, f), 'utf8').replaceAll('__ID__', id).replaceAll('__NOME__', nome);
    writeFileSync(path.join(destino, f === 'LEIA-ME.md' ? 'README.md' : f), texto);
  }
  copyFileSync(path.join(o.sdkDir, 'hestia-plugin.d.ts'), path.join(destino, 'hestia-plugin.d.ts'));
  return destino;
}
