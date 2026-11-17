import { describe, expect, it } from 'vitest';
import { openingNormIssues, portaSoleiraIssues, portaVaoLivreIssues, portaVidroIssues, type PortaNormaInput } from './openingNormIssues.ts';

const base = (over: Partial<PortaNormaInput> = {}): PortaNormaInput => ({ id: 'p1', vaoLivreLarguraM: 0.9, vaoLivreAlturaM: 2.2, ...over });

describe('vão livre de porta (NBR 9050, aviso)', () => {
  it('0,80 x 2,10 m exatos: sem aviso', () => {
    expect(portaVaoLivreIssues(base({ vaoLivreLarguraM: 0.8, vaoLivreAlturaM: 2.1 }))).toEqual([]);
  });
  it('largura menor: um aviso citando a norma e o resumo público', () => {
    const r = portaVaoLivreIssues(base({ vaoLivreLarguraM: 0.75 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: 'warning', code: 'porta-vao-livre-menor', elementId: 'p1' });
    expect(r[0]!.message).toContain('NBR 9050');
    expect(r[0]!.message).toContain('resumo público, conferir a norma vigente');
    expect(r[0]!.message).toContain('0,75 x 2,2 m');
  });
  it('altura menor: aviso', () => {
    expect(portaVaoLivreIssues(base({ vaoLivreAlturaM: 2.05 }))).toHaveLength(1);
  });
  it('largura e altura menores: um único aviso por porta', () => {
    expect(portaVaoLivreIssues(base({ vaoLivreLarguraM: 0.7, vaoLivreAlturaM: 2 }))).toHaveLength(1);
  });
});

describe('soleira em rota acessível (NBR 9050, aviso)', () => {
  it('5 mm na rota acessível: sem aviso (limite é "acima de 5 mm")', () => {
    expect(portaSoleiraIssues(base({ rotaAcessivel: true, soleiraMm: 5 }))).toEqual([]);
  });
  it('6 mm na rota acessível: aviso', () => {
    const r = portaSoleiraIssues(base({ rotaAcessivel: true, soleiraMm: 6 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: 'warning', code: 'porta-soleira-acima-5mm', elementId: 'p1' });
    expect(r[0]!.message).toContain('NBR 9050');
    expect(r[0]!.message).toContain('resumo público, conferir a norma vigente');
  });
  it('6 mm fora da rota acessível: sem aviso', () => {
    expect(portaSoleiraIssues(base({ rotaAcessivel: false, soleiraMm: 6 }))).toEqual([]);
  });
  it('soleira não informada: sem aviso', () => {
    expect(portaSoleiraIssues(base({ rotaAcessivel: true, soleiraMm: null }))).toEqual([]);
    expect(portaSoleiraIssues(base({ rotaAcessivel: true }))).toEqual([]);
  });
});

describe('vidro em porta (NBR 7199:2025, aviso)', () => {
  it('porta com vidro não seguro: aviso citando a NBR 7199:2025', () => {
    const r = portaVidroIssues(base({ comVidro: true, vidroSeguro: false }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: 'warning', code: 'porta-vidro-nao-seguro', elementId: 'p1' });
    expect(r[0]!.message).toContain('NBR 7199:2025');
    expect(r[0]!.message).toContain('resumo público, conferir a norma vigente');
  });
  it('vidro seguro: sem aviso', () => {
    expect(portaVidroIssues(base({ comVidro: true, vidroSeguro: true }))).toEqual([]);
  });
  it('vidro sem classificação informada: sem aviso', () => {
    expect(portaVidroIssues(base({ comVidro: true }))).toEqual([]);
    expect(portaVidroIssues(base({ comVidro: true, vidroSeguro: null }))).toEqual([]);
  });
  it('porta sem vidro: sem aviso mesmo com vidroSeguro false', () => {
    expect(portaVidroIssues(base({ comVidro: false, vidroSeguro: false }))).toEqual([]);
  });
});

describe('openingNormIssues', () => {
  it('lista vazia para portas conformes', () => {
    expect(openingNormIssues([base({ vaoLivreLarguraM: 0.8, vaoLivreAlturaM: 2.1, rotaAcessivel: true, soleiraMm: 0, comVidro: true, vidroSeguro: true })])).toEqual([]);
    expect(openingNormIssues([])).toEqual([]);
  });
  it('junta avisos de várias portas na ordem vão, soleira, vidro', () => {
    const r = openingNormIssues([
      base({ id: 'a', vaoLivreLarguraM: 0.7, rotaAcessivel: true, soleiraMm: 10, comVidro: true, vidroSeguro: false }),
      base({ id: 'b', vaoLivreAlturaM: 2 }),
    ]);
    expect(r.map((i) => [i.code, i.elementId])).toEqual([
      ['porta-vao-livre-menor', 'a'],
      ['porta-soleira-acima-5mm', 'a'],
      ['porta-vidro-nao-seguro', 'a'],
      ['porta-vao-livre-menor', 'b'],
    ]);
    expect(r.every((i) => i.severity === 'warning')).toBe(true);
  });
  it('não altera a entrada', () => {
    const entrada = [base({ vaoLivreLarguraM: 0.7, rotaAcessivel: true, soleiraMm: 9, comVidro: true, vidroSeguro: false })];
    const copia = structuredClone(entrada);
    openingNormIssues(entrada);
    expect(entrada).toEqual(copia);
  });
});
