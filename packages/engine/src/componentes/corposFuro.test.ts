import { BIBLIOTECA_MEP, validarFamilia, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { subtrairMalha, volumeDaMalha } from './corposCsg.ts';
import { malhaDosCorpos } from './corposMalha.ts';
import type { CorpoResolvido } from './corposTipos.ts';
import type { Malha } from './malha.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * D2 / F-CSG: o ramal do tê e da junção abre a parede da corrida (e a corrida liberta o vão do ramal). Os testes comparam o volume
 * da malha com e sem `furar` e com uma amostragem em grade dos mesmos sólidos (cilindros ideais; a malha tem 128 lados no máximo).
 */

const fam = (id: string): Familia => BIBLIOTECA_MEP.find((f) => f.id === id)!;
const corposDe = (id: string, tipo = 'dn100'): CorpoResolvido[] => resolverFamilia(fam(id), { tipoId: tipo }).corpos ?? [];
const semFuro = (cs: CorpoResolvido[]): CorpoResolvido[] => cs.map(({ furar: _f, ...c }) => c);
const vol = (cs: CorpoResolvido[]): number => volumeDaMalha(malhaDosCorpos(cs).solidas);
const raio = (p: number[]): number => Math.hypot(p[0]!, p[1]!);

function caixa(m: Malha): number[] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k]!, m.positions[i + k]!); b[k + 3] = Math.max(b[k + 3]!, m.positions[i + k]!); }
  return b;
}

function cubo(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Malha {
  const m: Malha = { positions: [], normals: [], indices: [], pecaDoTriangulo: [] };
  const face = (n: [number, number, number], q: number[][]): void => {
    const base = m.positions.length / 3;
    for (const p of q) { m.positions.push(...p); m.normals.push(...n); }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    m.pecaDoTriangulo.push(0, 0);
  };
  face([0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
  face([0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  face([0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  face([0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
  face([-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  face([1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
  return m;
}

/** Volume esperado do que muda: parede da corrida dentro do vão do ramal + parede do ramal dentro do vão da corrida (grade). */
function volumeRetirado(cs: CorpoResolvido[], grausDoRamal: number): number {
  const corrida = cs.find((c) => c.id === 'corrida')!;
  const ramal = cs.find((c) => c.id === 'ramal')!;
  if (corrida.forma.tipo !== 'extrusao' || ramal.forma.tipo !== 'extrusao') throw new Error('forma');
  const Rc = raio(corrida.forma.perfil.externo);
  const ric = raio(corrida.forma.perfil.furos[0]!);
  const Rr = raio(ramal.forma.perfil.externo);
  const rir = raio(ramal.forma.perfil.furos[0]!);
  const z0 = corrida.origem[2];
  const z1 = z0 + corrida.forma.comprimento;
  const a = (grausDoRamal * Math.PI) / 180;
  const d = [Math.sin(a), 0, Math.cos(a)];
  const L = ramal.forma.comprimento;
  const N = 130;
  const lado = 2 * Rr;
  const xs = (Rc + Rr) * 1.0;
  const h = lado / N;
  let soma = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < Math.round((2 * xs) / h); k++) {
    const y = -Rr + (j + 0.5) * h;
    const x = -xs + (k + 0.5) * h;
    const z = -Rr * 3.2 + (i + 0.5) * (Rr * 6.4 / N);
    const s = x * d[0]! + z * d[2]!;
    const lat = Math.hypot(x - s * d[0]!, y, z - s * d[2]!);
    const rc = Math.hypot(x, y);
    const noRamal = s >= 0 && s <= L;
    const noCorrida = z >= z0 && z <= z1;
    const paredeCorrida = noCorrida && rc > ric && rc < Rc;
    const paredeRamal = noRamal && lat > rir && lat < Rr;
    if (paredeCorrida && noRamal && lat < rir) soma += h * h * (Rr * 6.4 / N);
    if (paredeRamal && noCorrida && rc < ric) soma += h * h * (Rr * 6.4 / N);
  }
  return soma;
}

describe('subtrairMalha (BSP)', () => {
  it('cubo menos cubo interno que atravessa: volume exato', () => {
    const r = subtrairMalha(cubo(0, 0, 0, 1, 1, 1), cubo(0.25, 0.25, -1, 0.75, 0.75, 2));
    expect(volumeDaMalha(r)).toBeCloseTo(1 - 0.25, 9);
  });
  it('corte disjunto devolve o mesmo volume', () => {
    expect(volumeDaMalha(subtrairMalha(cubo(0, 0, 0, 1, 1, 1), cubo(5, 5, 5, 6, 6, 6)))).toBeCloseTo(1, 12);
  });
  it('é determinística (mesma entrada, mesma saída)', () => {
    const f = (): Malha => subtrairMalha(cubo(0, 0, 0, 1, 1, 1), cubo(0.2, 0.3, -1, 0.6, 0.7, 2));
    expect(f()).toEqual(f());
  });
});

describe.each([
  ['tê 90°', 'fam_krona_esgoto_te', 90],
  ['junção 45°', 'fam_krona_esgoto_juncao45', 45],
  ['tê reforçado 90°', 'fam_krona_esgoto_reforcado_te', 90],
] as const)('%s da Krona', (_n, id, graus) => {
  it('a corrida e o ramal declaram a subtração um do outro', () => {
    const cs = corposDe(id);
    expect(cs.find((c) => c.id === 'corrida')!.furar).toEqual(['ramal']);
    expect(cs.find((c) => c.id === 'ramal')!.furar).toEqual(['corrida']);
    expect(cs.find((c) => c.id === 'bolsa')!.furar).toBeUndefined();
  });
  it('o volume com furo é menor que o sem furo e a diferença é o trecho do ramal dentro da corrida', () => {
    const cs = corposDe(id);
    const diff = vol(semFuro(cs)) - vol(cs);
    expect(diff).toBeGreaterThan(0);
    expect(Math.abs(diff - volumeRetirado(cs, graus)) / diff).toBeLessThan(0.06);
  });
  it('o furo não vaza: a caixa da malha não muda e nenhum vértice cai dentro do vão do ramal', () => {
    const cs = corposDe(id);
    const com = malhaDosCorpos(cs).solidas;
    const sem = malhaDosCorpos(semFuro(cs)).solidas;
    caixa(com).forEach((v, k) => expect(v).toBeCloseTo(caixa(sem)[k]!, 6));
    const corrida = cs.find((c) => c.id === 'corrida')!;
    const ramal = cs.find((c) => c.id === 'ramal')!;
    if (corrida.forma.tipo !== 'extrusao' || ramal.forma.tipo !== 'extrusao') throw new Error('forma');
    const ric = raio(corrida.forma.perfil.furos[0]!);
    const rir = raio(ramal.forma.perfil.furos[0]!);
    const a = (graus * Math.PI) / 180;
    let dentro = 0;
    for (let i = 0; i < com.positions.length; i += 3) {
      const [x, y, z] = [com.positions[i]!, com.positions[i + 1]!, com.positions[i + 2]!];
      const s = x * Math.sin(a) + z * Math.cos(a);
      const lat = Math.hypot(x - s * Math.sin(a), y, z - s * Math.cos(a));
      if (s > 1e-4 && s < ramal.forma.comprimento - 1e-4 && lat < rir - 1e-4 ) dentro += Math.hypot(x, y) > ric + 1e-4 ? 1 : 0;
      if (z > corrida.origem[2] && z < corrida.origem[2] + corrida.forma.comprimento && Math.hypot(x, y) < ric - 1e-4 && s > 1e-4 && s < ramal.forma.comprimento - 1e-4 && lat > rir + 1e-4 && lat < raio(ramal.forma.perfil.externo) - 1e-4) dentro += 1;
    }
    expect(dentro).toBe(0);
  });
  it('a malha é válida (índices, números finitos, normais unitárias, volume positivo) e determinística', () => {
    const cs = corposDe(id);
    const a = malhaDosCorpos(cs).solidas;
    expect(malhaDosCorpos(cs).solidas).toEqual(a);
    expect(Math.max(...a.indices)).toBeLessThan(a.positions.length / 3);
    expect(a.positions.every(Number.isFinite) && a.normals.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < a.normals.length; i += 3) expect(Math.hypot(a.normals[i]!, a.normals[i + 1]!, a.normals[i + 2]!)).toBeCloseTo(1, 5);
    expect(a.pecaDoTriangulo.length).toBe(a.indices.length / 3);
    expect(vol(cs)).toBeGreaterThan(0);
  });
  it('a família continua válida', () => {
    expect(validarFamilia(fam(id)).filter((p) => p.onde.includes('furar'))).toEqual([]);
  });
});

describe('casos de borda e compatibilidade', () => {
  it('sem furo quando o ramal não atravessa a corrida (ramal longe)', () => {
    const cs = corposDe('fam_krona_esgoto_te').map((c) => (c.id === 'ramal' ? { ...c, origem: [1, 1, 1] as [number, number, number] } : c));
    expect(vol(cs)).toBeCloseTo(vol(semFuro(cs)), 12);
  });
  it('furar com id inexistente ou o próprio corpo não muda nada', () => {
    const cs = corposDe('fam_krona_esgoto_te');
    const base = vol(semFuro(cs));
    const so = (furar: string[]): CorpoResolvido[] => semFuro(cs).map((c) => (c.id === 'corrida' ? { ...c, furar } : c));
    expect(vol(so(['nada']))).toBeCloseTo(base, 12);
    expect(vol(so(['corrida']))).toBeCloseTo(base, 12);
  });
  it('tê soldável de três bolsas também abre a corrida', () => {
    const cs = corposDe('fam_krona_soldavel_te', 'dn50');
    expect(cs.length).toBeGreaterThan(0);
    expect(vol(cs)).toBeLessThan(vol(semFuro(cs)));
  });
  it('família sem corpo negativo (joelho) sai igual ao caminho antigo, bit a bit', () => {
    const cs = corposDe('fam_krona_esgoto_curva90_curta');
    expect(cs.some((c) => c.furar !== undefined)).toBe(false);
    const todo = malhaDosCorpos(cs).solidas;
    const concat: number[] = [];
    cs.forEach((c, i) => {
      const parte = malhaDosCorpos([c]).solidas;
      concat.push(...parte.positions);
      expect(parte.pecaDoTriangulo.every((x) => x === 0)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
    });
    expect(todo.positions).toEqual(concat);
  });
  it('corpo resolvido de família sem furar não ganha a chave', () => {
    const c = corposDe('fam_krona_esgoto_curva90_curta')[0]!;
    expect('furar' in c).toBe(false);
  });
  it('validação recusa furar para corpo inexistente', () => {
    const f = structuredClone(fam('fam_krona_esgoto_te')) as Familia;
    f.corpos![0]!.furar = ['fantasma'];
    expect(validarFamilia(f).some((p) => p.onde.includes('furar'))).toBe(true);
  });
});
