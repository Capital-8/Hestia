import { describe, expect, it } from 'vitest';
import { PERFIS_CATALOGO, presetPerfil } from './perfisCatalogo.ts';
import { validarPerfil } from './perfis.ts';

describe('catálogo de perfis (A.2)', () => {
  it('todos os presets têm perfil válido e ids e nomes únicos', () => {
    for (const p of PERFIS_CATALOGO) expect(validarPerfil(p.perfil), p.id).toBeNull();
    expect(new Set(PERFIS_CATALOGO.map((p) => p.id)).size).toBe(PERFIS_CATALOGO.length);
    expect(new Set(PERFIS_CATALOGO.map((p) => `${p.familia}:${p.nome}`)).size).toBe(PERFIS_CATALOGO.length);
  });

  it('cobre concreto, madeira e aço com as séries pedidas', () => {
    const nomes = (f: string): string[] => PERFIS_CATALOGO.filter((p) => p.familia === f).map((p) => p.nome);
    expect(nomes('concreto')).toEqual(expect.arrayContaining(['15 × 30', '20 × 20', '20 × 40', '25 × 25', '30 × 30', '30 × 60', 'Ø 30', 'Ø 40']));
    expect(nomes('madeira')).toEqual(['6 × 12', '6 × 16', '6 × 20', '8 × 8', '10 × 10', '12 × 12']);
    const aco = nomes('aco');
    for (const n of ['IPE 100', 'IPE 400', 'HEA 100', 'HEA 300', 'HEB 100', 'HEB 300', 'UPN 80', 'UPN 300', 'L 50 × 5', 'L 150 × 15']) expect(aco).toContain(n);
    expect(aco.some((n) => n.startsWith('Tubo '))).toBe(true);
  });

  it('IPE 200 tem as medidas de tabela em metros', () => {
    expect(presetPerfil('aco_ipe200')?.perfil).toEqual({ forma: 'I', b: 0.1, h: 0.2, tf: 0.0085, tw: 0.0056 });
    expect(presetPerfil('conc_20x40')?.perfil).toEqual({ forma: 'retangular', b: 0.2, h: 0.4 });
    expect(presetPerfil('nao_existe')).toBeUndefined();
  });

  it('usa só as formas permitidas: retangular, circular, I, U, L e tubos', () => {
    const formas = new Set(PERFIS_CATALOGO.map((p) => p.perfil.forma));
    expect([...formas].sort()).toEqual(['I', 'L', 'U', 'circular', 'retangular', 'tuboCircular', 'tuboRetangular']);
  });
});
