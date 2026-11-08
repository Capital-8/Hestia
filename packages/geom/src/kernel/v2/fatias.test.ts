import { describe, expect, it } from 'vitest';
import { FATIAS, fatiasLigadas, kernelFatiaLigada, type AmbienteFatias } from './fatias.ts';

const amb = (busca: string | null, armazenado: Record<string, string> = {}): AmbienteFatias => ({
  busca,
  ler: (c) => armazenado[c] ?? null,
});

describe('chaves por fatia', () => {
  it('desligado por padrão (sem URL nem localStorage) e em ambiente sem location', () => {
    for (const f of FATIAS) expect(kernelFatiaLigada(f, amb(null))).toBe(false);
    expect(fatiasLigadas().size).toBe(0);
  });

  it('?kernelFatias=A,B liga só essas (ignora caixa e lixo)', () => {
    const a = amb('?kernelFatias=a, B ,Z');
    expect([...fatiasLigadas(a)].sort()).toEqual(['A', 'B']);
    expect(kernelFatiaLigada('A', a)).toBe(true);
    expect(kernelFatiaLigada('C', a)).toBe(false);
  });

  it('localStorage hestia:kernel:fatias', () => {
    const a = amb('', { 'hestia:kernel:fatias': 'C,D' });
    expect([...fatiasLigadas(a)].sort()).toEqual(['C', 'D']);
  });

  it('?kernel=rust liga todas; ?kernel=ts desliga todas, mesmo com localStorage', () => {
    expect(fatiasLigadas(amb('?kernel=rust')).size).toBe(FATIAS.length);
    expect(fatiasLigadas(amb('?kernel=ts', { 'hestia:kernel:fatias': 'A', 'hestia:kernel': 'rust' })).size).toBe(0);
  });

  it('a preferência atual (hestia:kernel=rust) liga todas; hestia:kernel=ts não liga', () => {
    expect(fatiasLigadas(amb('', { 'hestia:kernel': 'rust' })).size).toBe(FATIAS.length);
    expect(fatiasLigadas(amb('', { 'hestia:kernel': 'ts' })).size).toBe(0);
  });

  it('precedência: URL das fatias > ?kernel > localStorage das fatias > preferência geral', () => {
    const ls = { 'hestia:kernel:fatias': 'E', 'hestia:kernel': 'rust' };
    expect([...fatiasLigadas(amb('?kernelFatias=A&kernel=rust', ls))]).toEqual(['A']);
    expect([...fatiasLigadas(amb('', ls))]).toEqual(['E']);
    expect([...fatiasLigadas(amb('?kernelFatias=', ls))]).toEqual(['E']);
  });
});
