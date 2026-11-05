import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO, compararVersoes, deveAvisarAutomatico, partesDaVersao } from './logica.ts';

describe('compararVersoes', () => {
  it('compara partes numéricas e ignora o prefixo v', () => {
    expect(compararVersoes('0.2.0', '0.1.0')).toBeGreaterThan(0);
    expect(compararVersoes('v1.0.0', '1.0.0')).toBe(0);
    expect(compararVersoes('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compararVersoes('1.0', '1.0.0')).toBe(0);
  });

  it('lê partes com sufixo de pré-lançamento sem quebrar', () => {
    expect(partesDaVersao('v1.2.3-beta.4')).toEqual([1, 2, 3, 4]);
  });
});

describe('deveAvisarAutomatico', () => {
  const nova = '0.3.0';

  it('não avisa sem versão nova', () => {
    expect(deveAvisarAutomatico(null, PREFERENCIAS_PADRAO, false)).toBe(false);
    expect(deveAvisarAutomatico('', PREFERENCIAS_PADRAO, false)).toBe(false);
  });

  it('não avisa com a preferência desligada', () => {
    expect(deveAvisarAutomatico(nova, { avisarAoAbrir: false, versaoRecusada: null }, false)).toBe(false);
  });

  it('não avisa quando o usuário adiou nesta sessão', () => {
    expect(deveAvisarAutomatico(nova, PREFERENCIAS_PADRAO, true)).toBe(false);
  });

  it('avisa quando não há versão recusada', () => {
    expect(deveAvisarAutomatico(nova, PREFERENCIAS_PADRAO, false)).toBe(true);
  });

  it('não avisa a mesma versão recusada nem uma menor', () => {
    expect(deveAvisarAutomatico(nova, { avisarAoAbrir: true, versaoRecusada: nova }, false)).toBe(false);
    expect(deveAvisarAutomatico(nova, { avisarAoAbrir: true, versaoRecusada: '0.4.0' }, false)).toBe(false);
  });

  it('volta a avisar quando a versão nova é maior que a recusada', () => {
    expect(deveAvisarAutomatico(nova, { avisarAoAbrir: true, versaoRecusada: '0.2.0' }, false)).toBe(true);
  });
});
