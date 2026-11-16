/**
 * Lê uma pasta de suplemento do disco para a lista de arquivos do pacote. Ficam de fora o que não faz parte do pacote:
 * tipos do SDK (`*.d.ts`, não aceitos no `.hestiapkg`), testes do autor (`*.test.*`, pasta `testes/`), `node_modules`,
 * `dist`, `.git` e arquivos ocultos.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ZipEntryData } from '@hestia/io';

const PASTAS_FORA = new Set(['node_modules', 'dist', '.git', 'testes']);

export const ficaForaDoPacote = (relativo: string): boolean => {
  const partes = relativo.split('/');
  const nome = partes[partes.length - 1]!;
  return partes.slice(0, -1).some((p) => PASTAS_FORA.has(p)) || nome.startsWith('.') || nome.endsWith('.d.ts') || /\.test\.[cm]?[jt]s$/.test(nome);
};

/** Arquivos da pasta em ordem estável, com caminho relativo separado por `/`. */
export function lerPasta(dir: string, base = dir): ZipEntryData[] {
  const out: ZipEntryData[] = [];
  for (const nome of readdirSync(dir).sort()) {
    const p = path.join(dir, nome);
    const rel = path.relative(base, p).split(path.sep).join('/');
    if (statSync(p).isDirectory()) {
      if (!PASTAS_FORA.has(nome) && !nome.startsWith('.')) out.push(...lerPasta(p, base));
    } else if (!ficaForaDoPacote(rel)) out.push({ path: rel, data: new Uint8Array(readFileSync(p)) });
  }
  return out;
}
