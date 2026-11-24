import { describe, expect, it } from 'vitest';
import { malhaExtrusao } from './corposMalhaExtrusao.ts';
import { malhaRevolucao } from './corposMalhaRevolucao.ts';
import type { PerfilResolvido } from './corposTipos.ts';
import type { Malha } from './malha.ts';

/*
 * Teste CEGO das malhas de corpo (ADR 0061, ficha A5-cego). Escrito só a partir de CONTRATO.md (§2.2, §2.3, §10) e dos
 * tipos; não lê a implementação. Perfis montados à mão em metros, listas planas u,v. Volume por tetraedros assinados,
 * estanqueidade, normais para fora e os casos N1, N3, N5, anel e toro.
 */

type Ponto = [number, number, number];

/** Exato (CONTRATO §10): 1e-9. */
const TOL_EXATA = 1e-9;

/** Círculo regular de `n` lados e raio `r`, centro em (`du`, 0), começando em (r, 0), anti-horário. */
function circulo(r: number, n: number, du = 0): number[] {
  const pts: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    pts.push(du + r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}

/** O mesmo círculo no sentido horário (furos). */
function circuloHorario(r: number, n: number, du = 0): number[] {
  const pts: number[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const a = (2 * Math.PI * k) / n;
    pts.push(du + r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}

/** Área do polígono regular inscrito (CONTRATO §2.2): N/2 · r² · sin(2π/N). */
function areaPoligono(r: number, n: number): number {
  return (n / 2) * r * r * Math.sin((2 * Math.PI) / n);
}

function ponto(m: Malha, i: number): Ponto {
  return [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!];
}

function subtrai(a: Ponto, b: Ponto): Ponto {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cruz(a: Ponto, b: Ponto): Ponto {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function produto(a: Ponto, b: Ponto): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norma(a: Ponto): number {
  return Math.sqrt(produto(a, a));
}

/** Volume (m³) por tetraedros assinados: soma de a·(b×c)/6 sobre os triângulos. Positivo com normais para fora. */
function volume(m: Malha): number {
  let soma = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = ponto(m, m.indices[t]!);
    const b = ponto(m, m.indices[t + 1]!);
    const c = ponto(m, m.indices[t + 2]!);
    soma += produto(a, cruz(b, c)) / 6;
  }
  return soma;
}

function caixa(m: Malha): { min: Ponto; max: Ponto } {
  const pts = Array.from({ length: m.positions.length / 3 }, (_, i) => ponto(m, i));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const zs = pts.map((p) => p[2]);
  return {
    min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
  };
}

function centroCaixa(m: Malha): Ponto {
  const b = caixa(m);
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

/** Chave de soldagem: posições iguais a 1 µm são o mesmo vértice (costuras e tampas têm vértices próprios). */
function chave(p: Ponto): string {
  return `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
}

/** Estanque: após soldar vértices, cada aresta orientada aparece uma vez e a oposta também. */
function fechada(m: Malha): boolean {
  const ids = new Map<string, number>();
  const idDe = (i: number): number => {
    const k = chave(ponto(m, i));
    let id = ids.get(k);
    if (id === undefined) {
      id = ids.size;
      ids.set(k, id);
    }
    return id;
  };
  const arestas = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [idDe(m.indices[t]!), idDe(m.indices[t + 1]!), idDe(m.indices[t + 2]!)];
    for (let k = 0; k < 3; k++) {
      const a = v[k]!;
      const b = v[(k + 1) % 3]!;
      if (a === b) return false;
      const aresta = `${a}>${b}`;
      arestas.set(aresta, (arestas.get(aresta) ?? 0) + 1);
    }
  }
  for (const [aresta, n] of arestas) {
    if (n !== 1) return false;
    const [a, b] = aresta.split('>');
    if (!arestas.has(`${b}>${a}`)) return false;
  }
  return true;
}

/** Normais por vértice de comprimento 1. */
function normaisUnitarias(m: Malha): boolean {
  for (let i = 0; i < m.normals.length; i += 3) {
    const n: Ponto = [m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!];
    if (Math.abs(norma(n) - 1) > 1e-6) return false;
  }
  return true;
}

/** Cada triângulo, com a normal geométrica (anti-horária vista de fora), aponta para o mesmo lado das normais dos seus vértices. */
function normaisAlinhadas(m: Malha): boolean {
  for (let t = 0; t < m.indices.length; t += 3) {
    const i0 = m.indices[t]!;
    const i1 = m.indices[t + 1]!;
    const i2 = m.indices[t + 2]!;
    const a = ponto(m, i0);
    const g = cruz(subtrai(ponto(m, i1), a), subtrai(ponto(m, i2), a));
    const tam = norma(g);
    if (tam < 1e-12) return false;
    const soma: Ponto = [0, 0, 0];
    for (const i of [i0, i1, i2]) {
      soma[0] += m.normals[3 * i]!;
      soma[1] += m.normals[3 * i + 1]!;
      soma[2] += m.normals[3 * i + 2]!;
    }
    const u: Ponto = [g[0] / tam, g[1] / tam, g[2] / tam];
    if (produto(u, soma) / 3 <= 0.5) return false;
  }
  return true;
}

/** Tampas planas com normal ±Z: o centro da malha fica do lado oposto da normal. */
function tampasZParaFora(m: Malha): boolean {
  const c = centroCaixa(m);
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = ponto(m, m.indices[t]!);
    const g = cruz(subtrai(ponto(m, m.indices[t + 1]!), a), subtrai(ponto(m, m.indices[t + 2]!), a));
    const tam = norma(g);
    if (tam < 1e-12) return false;
    const u: Ponto = [g[0] / tam, g[1] / tam, g[2] / tam];
    if (Math.abs(u[2]) > 0.99 && produto(u, subtrai(c, a)) >= 0) return false;
  }
  return true;
}

/** Nenhum triângulo de área nula (CONTRATO §2.3: u = 0 não gera faces degeneradas). */
function semDegenerados(m: Malha): boolean {
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = ponto(m, m.indices[t]!);
    const g = cruz(subtrai(ponto(m, m.indices[t + 1]!), a), subtrai(ponto(m, m.indices[t + 2]!), a));
    if (norma(g) < 1e-12) return false;
  }
  return true;
}

describe('extrusão (teste cego A5): N1, N5 e anel', () => {
  const circ: PerfilResolvido = { externo: circulo(0.05, 64), furos: [] };
  const cil = malhaExtrusao(circ, 1.0);

  it('N1: círculo Ø100, 64 lados, L = 1 m: volume do polígono (exato, 1e-9)', () => {
    const esperado = areaPoligono(0.05, 64) * 1.0;
    expect(Math.abs(volume(cil) - esperado)).toBeLessThan(TOL_EXATA);
  });

  it('N1: volume a menos de 0,2 % de π·r²·L', () => {
    const cilindro = Math.PI * 0.05 * 0.05 * 1.0;
    expect(Math.abs(volume(cil) - cilindro) / cilindro).toBeLessThan(0.002);
  });

  it('N1: estanque, normais unitárias, alinhadas e tampas voltadas para fora', () => {
    expect(fechada(cil)).toBe(true);
    expect(normaisUnitarias(cil)).toBe(true);
    expect(normaisAlinhadas(cil)).toBe(true);
    expect(tampasZParaFora(cil)).toBe(true);
    expect(volume(cil)).toBeGreaterThan(0);
  });

  it('N1: caixa envolvente x,y em ±0,05 m e z em [0, 1] m', () => {
    const b = caixa(cil);
    expect(Math.abs(b.min[0] + 0.05)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.max[0] - 0.05)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.min[1] + 0.05)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.max[1] - 0.05)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.min[2])).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.max[2] - 1.0)).toBeLessThan(TOL_EXATA);
  });

  it('N1: é determinística (mesmos números a cada chamada)', () => {
    expect(malhaExtrusao(circ, 1.0)).toEqual(cil);
  });

  const perfilI: PerfilResolvido = {
    externo: [
      -0.05, -0.1, 0.05, -0.1, 0.05, -0.09, 0.003, -0.09, 0.003, 0.09, 0.05, 0.09, 0.05, 0.1, -0.05, 0.1, -0.05, 0.09,
      -0.003, 0.09, -0.003, -0.09, -0.05, -0.09,
    ],
    furos: [],
  };
  const i = malhaExtrusao(perfilI, 1.0);

  it('N5: perfil I (h 200, b 100, tw 6, tf 10), L = 1 m: área 3080 mm² e volume 3,08e-3 m³ (exato, 1e-9)', () => {
    expect(Math.abs(volume(i) - 3.08e-3)).toBeLessThan(TOL_EXATA);
  });

  it('N5: estanque, normais alinhadas e tampas voltadas para fora', () => {
    expect(fechada(i)).toBe(true);
    expect(normaisUnitarias(i)).toBe(true);
    expect(normaisAlinhadas(i)).toBe(true);
    expect(tampasZParaFora(i)).toBe(true);
  });

  const tuboAnel: PerfilResolvido = { externo: circulo(0.05, 64), furos: [circuloHorario(0.025, 64)] };
  const anel = malhaExtrusao(tuboAnel, 1.0);

  it('anel: volume (área externa − área do furo)·L (exato, 1e-9)', () => {
    const esperado = (areaPoligono(0.05, 64) - areaPoligono(0.025, 64)) * 1.0;
    expect(Math.abs(volume(anel) - esperado)).toBeLessThan(TOL_EXATA);
  });

  it('anel: estanque (túnel fechado), normais alinhadas e tampas voltadas para fora', () => {
    expect(fechada(anel)).toBe(true);
    expect(normaisUnitarias(anel)).toBe(true);
    expect(normaisAlinhadas(anel)).toBe(true);
    expect(tampasZParaFora(anel)).toBe(true);
  });
});

describe('revolução (teste cego A5): N3, 180° e toro', () => {
  const retangulo: PerfilResolvido = { externo: [0, 0, 0.05, 0, 0.05, 0.1, 0, 0.1], furos: [] };

  it('N3: retângulo u∈[0; 0,05], v∈[0; 0,1], 360°, 64 segmentos: volume do polígono 7,8413e-4 m³ (exato, 1e-9)', () => {
    const v360 = malhaRevolucao(retangulo, 2 * Math.PI, 64);
    expect(Math.abs(volume(v360) - areaPoligono(0.05, 64) * 0.1)).toBeLessThan(TOL_EXATA);
  });

  it('N3: volume a menos de 0,5 % de π·0,05²·0,1 = 7,854e-4 m³', () => {
    const v360 = malhaRevolucao(retangulo, 2 * Math.PI, 64);
    const esperado = Math.PI * 0.05 * 0.05 * 0.1;
    expect(Math.abs(volume(v360) - esperado) / esperado).toBeLessThan(0.005);
  });

  it('N3: 360° é sólido fechado sem faces degeneradas, normais para fora e caixa x,y ±0,05 e z [0; 0,1]', () => {
    const v360 = malhaRevolucao(retangulo, 2 * Math.PI, 64);
    expect(fechada(v360)).toBe(true);
    expect(normaisUnitarias(v360)).toBe(true);
    expect(normaisAlinhadas(v360)).toBe(true);
    expect(semDegenerados(v360)).toBe(true);
    expect(volume(v360)).toBeGreaterThan(0);
    const b = caixa(v360);
    expect(Math.abs(b.min[0] + 0.05)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.max[0] - 0.05)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.min[2])).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.max[2] - 0.1)).toBeLessThan(TOL_EXATA);
  });

  // AMBIGUIDADE: CONTRATO §2.3 diz que `segmentos` são passos por volta completa, proporcionais ao ângulo. Este teste
  // usa 64 e aceita tanto 32 passos (leitura por volta) quanto 64 (leitura total) dentro de 0,5 %.
  it('180° com tampas: fechado, normais para fora e volume a metade do de 360° (0,5 %)', () => {
    const v360 = malhaRevolucao(retangulo, 2 * Math.PI, 64);
    const v180 = malhaRevolucao(retangulo, Math.PI, 64);
    expect(fechada(v180)).toBe(true);
    expect(normaisAlinhadas(v180)).toBe(true);
    const metade = volume(v360) / 2;
    expect(Math.abs(volume(v180) - metade) / metade).toBeLessThan(0.005);
    const b = caixa(v180);
    expect(Math.abs(b.min[1])).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.max[1] - 0.05)).toBeLessThan(TOL_EXATA);
  });

  // Toro: círculo Ø50 com 32 lados, centro a 125 mm do eixo (menor u = afastamento 100 mm), 360°.
  const toro: PerfilResolvido = { externo: circulo(0.025, 32, 0.125), furos: [] };
  const valorToro = 1.5421e-3;

  // AMBIGUIDADE: o valor 1,5421e-3 m³ (±0,5 %) vale para círculo verdadeiro (CONTRATO §10, 2π·0,125·π·0,025²). Com 32 lados
  // a área do polígono é 0,64 % menor (Pappus com A₃₂: 2π·0,125·A₃₂ ≈ 1,5322e-3 m³), e a discretização da volta soma mais. O teste estrito
  // fica suspenso até o orquestrador decidir a tolerância; o teste de ordem de grandeza abaixo continua ativo.
  it.skip('toro Ø50 de 32 lados, afastamento 100 mm, 360°: volume 1,5421e-3 m³ ±0,5 %', () => {
    const vt = volume(malhaRevolucao(toro, 2 * Math.PI, 32));
    expect(Math.abs(vt - valorToro) / valorToro).toBeLessThan(0.005);
  });

  it('toro: volume na ordem de 1,5421e-3 m³ (a menos de 2 %)', () => {
    const vt = volume(malhaRevolucao(toro, 2 * Math.PI, 32));
    expect(Math.abs(vt - valorToro) / valorToro).toBeLessThan(0.02);
  });

  it('toro: fechado (sem tampas), caixa x,y em ±0,15 m e z em ±0,025 m', () => {
    const t = malhaRevolucao(toro, 2 * Math.PI, 32);
    expect(fechada(t)).toBe(true);
    expect(normaisAlinhadas(t)).toBe(true);
    const b = caixa(t);
    expect(Math.abs(b.max[0] - 0.15)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.min[0] + 0.15)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.max[2] - 0.025)).toBeLessThan(TOL_EXATA);
    expect(Math.abs(b.min[2] + 0.025)).toBeLessThan(TOL_EXATA);
  });
});
