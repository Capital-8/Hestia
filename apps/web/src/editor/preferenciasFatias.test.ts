import { describe, expect, it } from 'vitest';
import { configDoDespacho, gravarModoSombra, lerModoSombra, CHAVE_MODO_SOMBRA, type AmbienteKernel } from './preferenciasKernel.ts';

/** Armazenamento em memória que registra as gravações, no lugar do `localStorage`. */
function ambiente(busca: string | null, inicial: Record<string, string> = {}): AmbienteKernel & { dados: Record<string, string> } {
  const dados: Record<string, string> = { ...inicial };
  return {
    dados,
    busca,
    ler: (c) => dados[c] ?? null,
    gravar: (c, v) => {
      if (v === null) delete dados[c];
      else dados[c] = v;
    },
  };
}

describe('preferências de fatias do kernel v2', () => {
  it('modo sombra é boolean, padrão false, na chave hestia:kernel:sombra', () => {
    expect(CHAVE_MODO_SOMBRA).toBe('hestia:kernel:sombra');
    expect(lerModoSombra(ambiente(null))).toBe(false);
    expect(lerModoSombra(ambiente(null, { 'hestia:kernel:sombra': 'true' }))).toBe(true);
    expect(lerModoSombra(ambiente(null, { 'hestia:kernel:sombra': '1' }))).toBe(false);
  });

  it('grava e remove o modo sombra', () => {
    const amb = ambiente(null);
    gravarModoSombra(true, amb);
    expect(amb.dados['hestia:kernel:sombra']).toBe('true');
    gravarModoSombra(false, amb);
    expect(amb.dados['hestia:kernel:sombra']).toBeUndefined();
  });

  it('produção: A e B sempre ligadas, sem URL nem localStorage que as desliguem; só a sombra é preferência', () => {
    const prod = (busca: string, salvo: Record<string, string> = {}) => configDoDespacho(ambiente(busca, salvo), false);
    expect(prod('')).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(prod('', { 'hestia:kernel:sombra': 'true' })).toEqual({ fatiaA: true, fatiaB: true, sombra: true });
    expect(prod('?kernel=ts')).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(prod('?kernelFatias=A')).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(prod('?kernelFatias=C', { 'hestia:kernel:fatias': '-', 'hestia:kernel': 'ts' })).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(configDoDespacho(ambiente(null), false)).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
  });

  it('desenvolvimento e testes: padrão ligado; ?kernel=ts e ?kernelFatias desligam para depuração', () => {
    const dev = (busca: string, salvo: Record<string, string> = {}) => configDoDespacho(ambiente(busca, salvo), true);
    expect(dev('')).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(configDoDespacho(ambiente(''))).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(dev('?kernel=ts', { 'hestia:kernel:sombra': 'true' })).toEqual({ fatiaA: false, fatiaB: false, sombra: false });
    expect(dev('?kernelFatias=A')).toEqual({ fatiaA: true, fatiaB: false, sombra: false });
    expect(dev('?kernelFatias=B', { 'hestia:kernel:sombra': 'true' })).toEqual({ fatiaA: false, fatiaB: true, sombra: true });
    expect(dev('?kernelFatias=A,B')).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(dev('?kernelFatias=C')).toEqual({ fatiaA: false, fatiaB: false, sombra: false });
    expect(dev('?kernel=rust', { 'hestia:kernel:sombra': 'true' })).toEqual({ fatiaA: true, fatiaB: true, sombra: true });
  });
});
