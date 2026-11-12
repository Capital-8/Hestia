/**
 * TESTE-GUARDA da regra 5 (docs/contratos/trabalho-de-agentes.md): nada de lixo de implementação no repositório.
 * A lógica fica em scripts/check-lixo.mjs (também roda sozinha: `node scripts/check-lixo.mjs`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs sem tipos
import { verificarLixo } from '../scripts/check-lixo.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('contrato: não deixar lixo ao implementar (regra 5)', () => {
  it('o repositório está limpo (sem crates/*/target, tmp-* rastreado ou depuração solta)', () => {
    const problemas: string[] = verificarLixo(raiz);
    expect(problemas, problemas.join('\n')).toEqual([]);
  });

  it('o detector pega os casos proibidos', () => {
    const p: string[] = verificarLixo(raiz, ['tmp-teste/a.ts', 'raiz.png', 'apps/web/depurar.mjs', 'x/saida.log', 'docs/ok.png', 'scripts/ok.mjs', 'tests/e2e/ok.mjs']);
    expect(p).toHaveLength(4);
  });

  it('o .gitignore cobre target/ e tmp-*', () => {
    const ig = readFileSync(join(raiz, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());
    expect(ig).toContain('crates/*/target/');
    expect(ig.some((l) => l === 'target/' || l === '**/target/')).toBe(true);
    expect(ig.some((l) => l === 'tmp-*' || l === 'tmp-*/' || l === '**/tmp-*')).toBe(true);
  });
});
