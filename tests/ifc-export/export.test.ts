import { describe, expect, it } from 'vitest';
import { buildTemplate } from '@hestia/model';
import { projectIfc } from '../../apps/web/src/editor/ifcExport.ts';
import { resumoCanonico } from './canonical.ts';

const DATA = new Date('2026-10-29T00:00:00Z');
const MODELOS = ['house2', 'studio', 'house-premium', 'predio10', 'esquadrias'] as const;

/** Todas as referências `#n` usadas existem como entidade declarada no arquivo. */
function referenciasIntegras(texto: string): boolean {
  const declaradas = new Set([...texto.matchAll(/^#(\d+)\s*=/gm)].map((m) => m[1]));
  // textos entre aspas (ex.: o JSON dos materiais, com cores `#222426`) não são referências
  for (const m of texto.replace(/'(?:[^']|'')*'/g, "''").matchAll(/#(\d+)/g)) {
    if (!declaradas.has(m[1]!)) return false;
  }
  return true;
}

describe('exportação IFC — linha de base', () => {
  it.each(MODELOS)('%s exporta de forma determinística e com referências íntegras', (id) => {
    const p = buildTemplate(id);
    const a = projectIfc(p, DATA);
    const b = projectIfc(p, DATA);
    expect(a).toBe(b);
    expect(a).toContain("FILE_SCHEMA(('IFC4'))");
    expect(a).not.toMatch(/NaN|undefined|Infinity/);
    expect(referenciasIntegras(a)).toBe(true);
    expect(resumoCanonico(p).counts.wall ?? 0).toBeGreaterThan(0);
  }, 30_000);
});
