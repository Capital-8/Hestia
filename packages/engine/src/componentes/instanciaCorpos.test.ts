import { createEmptyProject, FAMILIA_ARMARIO, matrizDoComponente, type Component, type Corpo, type Familia, type Project } from '@hestia/model';
import { multiArea } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { caixaDoComponente, malhaDoComponente, pegadaDoComponente, resolverComponente } from './instancia.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Ficha A7b: a caixa e a pegada do componente incluem os corpos; símbolos aparecem no resolvedor. Família sem corpos fica igual.
 */

/** Projeto com a família direto na biblioteca (sem o comando, que exige peça na zona do fundo; o fixture de corpos não tem peças). */
const projetoCom = (f: Familia): Project => {
  const p = createEmptyProject('t');
  p.componentFamilies = { [f.id]: structuredClone(f) };
  return p;
};
const comp = (p: Project, extra: Partial<Component> = {}): Component => ({
  id: 'c1', kind: 'component', familyId: 'fam-corpos', typeId: null, levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'T', ...extra,
});

/** Cilindro Ø100 × 1000 mm na origem da família (eixo Z), salvo o que `extra` sobrescrever. */
const tubo = (extra: Partial<Corpo> = {}): Corpo => ({
  id: 'tubo',
  nome: 'Tubo',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '100' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'] },
  ...extra,
});

/** Família só com o tubo (sem peças), para a caixa ser exatamente a dos corpos. */
const familiaDoTubo = (extra: Partial<Corpo> = {}): Familia => ({ ...structuredClone(FAMILIA_ARMARIO), id: 'fam-corpos', pecas: [], corpos: [tubo(extra)] });

describe('caixa e pegada com corpos (ficha A7b)', () => {
  it('tubo de pé: caixa de ±50 mm em X e Y, 0 a 1 m em Z, e pegada de área ~ o polígono do círculo', () => {
    const p = projetoCom(familiaDoTubo());
    const c = comp(p);
    const caixa = caixaDoComponente(p, c);
    expect(caixa).not.toBeNull();
    expect(caixa!.min[0]).toBeCloseTo(0.95, 6);
    expect(caixa!.max[0]).toBeCloseTo(1.05, 6);
    expect(caixa!.min[1]).toBeCloseTo(1.95, 6);
    expect(caixa!.max[1]).toBeCloseTo(2.05, 6);
    expect(caixa!.min[2]).toBeCloseTo(0, 6);
    expect(caixa!.max[2]).toBeCloseTo(1, 6);
    // Pegada: o retângulo XY da caixa dos corpos (ficha A7b), 0,1 m × 0,1 m = 0,01 m².
    expect(multiArea(pegadaDoComponente(p, c))).toBeCloseTo(0.01, 6);
  });

  it('tubo inclinado 90° (inclinacao [π/2, 0]): caixa e pegada seguem a matrizDoComponente', () => {
    const p = projetoCom(familiaDoTubo());
    const c = comp(p, { inclinacao: [Math.PI / 2, 0] });
    // A matriz manda o eixo Z local para +X (Ry de 90°): o tubo deita ao longo de X, de x = 1 a 2 m, com ±50 mm em Y e em Z.
    const m = matrizDoComponente(c);
    expect(Math.abs(m[0]! - 0)).toBeLessThan(1e-9);
    const caixa = caixaDoComponente(p, c)!;
    expect(caixa.min[0]).toBeCloseTo(1, 6);
    expect(caixa.max[0]).toBeCloseTo(2, 6);
    expect(caixa.min[1]).toBeCloseTo(1.95, 6);
    expect(caixa.max[1]).toBeCloseTo(2.05, 6);
    expect(caixa.min[2]).toBeCloseTo(-0.05, 6);
    expect(caixa.max[2]).toBeCloseTo(0.05, 6);
    // Pegada deitada: retângulo de 1 m por 0,1 m, área 0,1 m² (com a ficha, 0,1 e não uma linha).
    expect(multiArea(pegadaDoComponente(p, c))).toBeCloseTo(0.1, 2);
  });

  it('família sem corpos: caixa igual à das peças dos vértices da malha, e nenhum corpo resolvido', () => {
    const f = structuredClone(FAMILIA_ARMARIO);
    const p = projetoCom({ ...f, id: 'fam-armario' });
    const c = comp(p, { familyId: 'fam-armario', typeId: 'A80', x: 1, y: 2 });
    const res = resolverComponente(p, c);
    expect(res.caixaCorpos).toBeNull();
    const pontos = malhaDoComponente(p, c, res).solidas.positions;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pontos.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, pontos[i + k]!);
        max[k] = Math.max(max[k]!, pontos[i + k]!);
      }
    }
    const caixa = caixaDoComponente(p, c, res)!;
    expect(caixa.min).toEqual(min);
    expect(caixa.max).toEqual(max);
  });
});

describe('símbolos no resolvedor (ficha A7b)', () => {
  it('símbolo válido aparece em simbolos; família sem símbolos devolve lista vazia', () => {
    const f = structuredClone(FAMILIA_ARMARIO);
    f.simbolos = [{ id: 'linha', nome: 'linha', vistas: ['planta'], plano: 'xy', primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['L', '0'] }] }] as Familia['simbolos'];
    const r = resolverFamilia(f);
    expect(r.erros).toEqual([]);
    expect(r.simbolos).toHaveLength(1);
    expect(r.simbolos![0]).toMatchObject({ id: 'linha' });
    expect(resolverFamilia(structuredClone(FAMILIA_ARMARIO)).simbolos).toEqual([]);
  });

  it('símbolo com fórmula ruim não entra em simbolos e o erro sai com onde simbolos[id]...', () => {
    const f = structuredClone(FAMILIA_ARMARIO);
    f.simbolos = [{ id: 'ruim', nome: 'ruim', vistas: ['planta'], plano: 'xy', primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['nao_existe', '0'] }] }] as Familia['simbolos'];
    const r = resolverFamilia(f);
    expect(r.simbolos).toEqual([]);
    expect(r.erros.some((e) => e.onde.startsWith('simbolos[ruim]'))).toBe(true);
  });
});
