/**
 * Paridade da distribuição do guarda-corpo (decisão 0055, Fase 3c): a referência TS reproduz, em 1e-6 m e com contagens exatas, os casos de ouro que o
 * Rust (`gc_distribuicao`) confere no `cargo test`. O arquivo de ouro é um só, lido pelos dois lados.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { casoParaConfig, distribuir, saidaParaJson } from './distribuicao.ts';

const ouro = JSON.parse(readFileSync(new URL('./distribuicao.ouro.json', import.meta.url), 'utf8')) as { casos: Array<Record<string, any>> }; // eslint-disable-line @typescript-eslint/no-explicit-any

function proximo(obtido: unknown, esperado: unknown, caminho: string): void {
  if (typeof esperado === 'number') {
    expect(typeof obtido, caminho).toBe('number');
    expect(Math.abs((obtido as number) - esperado), caminho).toBeLessThan(2e-6);
  } else if (Array.isArray(esperado)) {
    expect(Array.isArray(obtido) ? obtido.length : -1, `${caminho} (tamanho)`).toBe(esperado.length);
    esperado.forEach((v, i) => proximo((obtido as unknown[])[i], v, `${caminho}[${i}]`));
  } else expect(obtido, caminho).toEqual(esperado);
}

describe('guarda-corpo, Fase 3c: referência TS da distribuição', () => {
  it('há casos de ouro', () => {
    expect(ouro.casos.length).toBeGreaterThanOrEqual(20);
  });
  for (const caso of ouro.casos) {
    it(`paridade: ${caso.nome as string}`, () => {
      const { trecho, cfg } = casoParaConfig(caso);
      const obtido = saidaParaJson(distribuir(trecho, cfg));
      for (const k of ['postes', 'balaustres', 'paineis', 'avisos'] as const) proximo(obtido[k], caso.esperado[k], `${caso.nome as string}.${k}`);
    });
  }
  it('padrão inválido é recusado e o limite de 20 000 estoura', () => {
    const base = ouro.casos.find((c) => c.nome === 'reta distribuir')!;
    const { trecho, cfg } = casoParaConfig(base);
    expect(() => distribuir(trecho, { ...cfg, padrao: { ...cfg.padrao!, periodo: 0 } })).toThrow('ENTRADA');
    const longo = { ...trecho, nos: [{ x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }] };
    expect(() => distribuir(longo, { ...cfg, padrao: { ...cfg.padrao!, periodo: 0.02 } })).toThrow('LIMITE');
  });
});
