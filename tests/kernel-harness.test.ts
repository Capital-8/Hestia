import { describe, expect, it } from 'vitest';
import { gerenciadorFalso } from '../packages/geom/src/kernel/v2/falso.ts';
import { executarHarness, formatarTabela } from '../scripts/kernel-harness-nucleo.mts';
import { syntheticProject } from '../scripts/perf-baselines/projeto-sintetico.mts';

describe('harness do kernel v2 (autoteste com o falso)', () => {
  it('projeto sintético: 0 divergências, tabela com tempos e sem vazamento', async () => {
    const r = await executarHarness({ projeto: syntheticProject(3, 64) });
    expect(r.divergencias).toEqual([]);
    expect(r.paredes.length).toBe(3 * 64);
    expect(r.linhas.length).toBe(3 * 4);
    expect(r.linhas.every((l) => l.ok)).toBe(true);
    expect(formatarTabela(r)).toContain('paredes_na_caixa');
  }, 120_000);

  it('detecta divergência quando a implementação devolve resultado errado', async () => {
    const { ger } = gerenciadorFalso({ opcoesDaInstancia: () => ({ corromperSaidas: true }) });
    const r = await executarHarness({ projeto: syntheticProject(2, 32), gerenciador: ger });
    expect(r.divergencias.length).toBeGreaterThan(0);
    expect(r.linhas.some((l) => !l.ok)).toBe(true);
  }, 120_000);
});
