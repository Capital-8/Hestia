import { describe, expect, it } from 'vitest';
import { configDoDespacho, gravarModoSombra, FATIAS_HABILITADAS, forcaDaUrl, gravarFatiasSalvas, lerFatiasSalvas, lerModoSombra, CHAVE_MODO_SOMBRA, type AmbienteKernel } from './preferenciasKernel.ts';

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
  it('só as fatias A e B estão habilitadas para o interruptor', () => {
    expect([...FATIAS_HABILITADAS]).toEqual(['A', 'B']);
  });

  it('lê a lista salva na chave hestia:kernel:fatias, no formato de fatias.ts', () => {
    expect([...lerFatiasSalvas(ambiente(null, { 'hestia:kernel:fatias': 'a, C' }))].sort()).toEqual(['A', 'C']);
    expect(lerFatiasSalvas(ambiente(null)).size).toBe(0);
  });

  it('grava as fatias ligadas em ordem, no mesmo formato lido por fatias.ts', () => {
    const amb = ambiente(null);
    gravarFatiasSalvas(new Set(['C', 'A']), amb);
    expect(amb.dados['hestia:kernel:fatias']).toBe('A,C');
    expect([...lerFatiasSalvas(amb)].sort()).toEqual(['A', 'C']);
  });

  it('lista vazia grava "-", que vence hestia:kernel=rust (nenhuma fatia ligada)', () => {
    const amb = ambiente(null, { 'hestia:kernel': 'rust' });
    gravarFatiasSalvas(new Set(), amb);
    expect(amb.dados['hestia:kernel:fatias']).toBe('-');
    expect(lerFatiasSalvas(amb).size).toBe(0);
  });

  it('forcaDaUrl aponta o parâmetro que trava o interruptor, ou null quando a URL não força', () => {
    expect(forcaDaUrl(ambiente('?kernelFatias=A'))).toBe('kernelFatias');
    expect(forcaDaUrl(ambiente('?kernel=rust'))).toBe('kernel');
    expect(forcaDaUrl(ambiente('?kernel=ts'))).toBe('kernel');
    expect(forcaDaUrl(ambiente('?kernelFatias='))).toBeNull();
    expect(forcaDaUrl(ambiente(''))).toBeNull();
    expect(forcaDaUrl(ambiente(null))).toBeNull();
  });

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

  it('configuração do despacho: nada liga sem flag; a sombra vale com ao menos uma fatia (A ou B) ligada', () => {
    expect(configDoDespacho(ambiente(''))).toEqual({ fatiaA: false, fatiaB: false, sombra: false });
    expect(configDoDespacho(ambiente('', { 'hestia:kernel:sombra': 'true' }))).toEqual({ fatiaA: false, fatiaB: false, sombra: false });
    expect(configDoDespacho(ambiente('?kernelFatias=A'))).toEqual({ fatiaA: true, fatiaB: false, sombra: false });
    expect(configDoDespacho(ambiente('?kernelFatias=B'))).toEqual({ fatiaA: false, fatiaB: true, sombra: false });
    expect(configDoDespacho(ambiente('?kernelFatias=A,B'))).toEqual({ fatiaA: true, fatiaB: true, sombra: false });
    expect(configDoDespacho(ambiente('?kernelFatias=B', { 'hestia:kernel:sombra': 'true' }))).toEqual({ fatiaA: false, fatiaB: true, sombra: true });
    expect(configDoDespacho(ambiente('?kernel=rust', { 'hestia:kernel:sombra': 'true' }))).toEqual({ fatiaA: true, fatiaB: true, sombra: true });
    expect(configDoDespacho(ambiente('', { 'hestia:kernel:fatias': 'A,B', 'hestia:kernel:sombra': 'true' }))).toEqual({ fatiaA: true, fatiaB: true, sombra: true });
    expect(configDoDespacho(ambiente('', { 'hestia:kernel:fatias': 'B' }))).toEqual({ fatiaA: false, fatiaB: true, sombra: false });
    expect(configDoDespacho(ambiente('?kernel=ts', { 'hestia:kernel:fatias': 'A,B' }))).toEqual({ fatiaA: false, fatiaB: false, sombra: false });
    expect(configDoDespacho(ambiente('?kernelFatias=C'))).toEqual({ fatiaA: false, fatiaB: false, sombra: false });
  });
});
