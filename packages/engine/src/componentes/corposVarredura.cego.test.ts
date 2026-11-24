import { describe, expect, it } from 'vitest';
import { malhaTransicao } from './corposMalhaTransicao.ts';
import { malhaVarredura } from './corposMalhaVarredura.ts';
import type { CaminhoResolvido, PerfilResolvido } from './corposTipos.ts';
import type { Malha } from './malha.ts';

/*
 * Teste CEGO da varredura e da transição (ADR 0061, ficha A6-cego). Escrito só a partir de CONTRATO.md (§2.2, §2.3,
 * §10) e dos tipos; não lê a implementação. Perfis e caminhos montados à mão em metros. Volume por tetraedros assinados,
 * estanqueidade, caixa envolvente e os casos N1, N2 e N4, além de tubo oco, caminho reto (igual à extrusão) e desvio.
 */

type Ponto = [number, number, number];

/** Exato (CONTRATO §10): 1e-9. */
const TOL_EXATA = 1e-9;

/** Precisão de posição (1 µm), para caixa envolvente e comparação de vértices. */
const TOL_POSICAO = 1e-6;

/** Discretização de 64 lados (CONTRATO §10): 0,5 %. */
const TOL_DISCRETA = 0.005;

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

function numeroPontos(m: Malha): number {
  return m.positions.length / 3;
}

function cruz(a: Ponto, b: Ponto): Ponto {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function produto(a: Ponto, b: Ponto): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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
  const pts = Array.from({ length: numeroPontos(m) }, (_, i) => ponto(m, i));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const zs = pts.map((p) => p[2]);
  return {
    min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
  };
}

/** Centro (média) dos vértices cujo z está na altura `z` (anel e tampa de uma extremidade). */
function centroEmZ(m: Malha, z: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < numeroPontos(m); i++) {
    const p = ponto(m, i);
    if (Math.abs(p[2] - z) < TOL_POSICAO) {
      sx += p[0];
      sy += p[1];
      n++;
    }
  }
  return { x: sx / n, y: sy / n };
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
    const [a, b] = aresta.split('>').map(Number);
    if (arestas.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

function aproximado(valor: number, esperado: number, tolRelativa: number): void {
  expect(Math.abs(valor - esperado) / esperado).toBeLessThanOrEqual(tolRelativa);
}

/** Perfil circular sólido de 64 lados e raio `r`. */
function perfilCirculo(r: number): PerfilResolvido {
  return { externo: circulo(r, 64), furos: [] };
}

/** Caminho reto de (0,0,0) a (0,0,`L`) sem curvas: os dois pontos são vértices. */
function caminhoReto(L: number): CaminhoResolvido {
  return { pontos: [0, 0, 0, 0, 0, L], vertices: [0, 1] };
}

/**
 * Cotovelo N2 (CONTRATO §10), em metros: (0, 0, 0) → (0, 0, 0,5) → (0,5, 0, 0,5) com raio 0,1 no canto (0, 0, 0,5).
 * Pontos de tangência A = (0, 0, 0,4) e B = (0,1, 0, 0,5); centro (0,1, 0, 0,4); arco de 90° em 64 passos, que dá 65
 * pontos com A e B. Os vértices originais são a origem e a última ponta; o canto foi trocado pelo arco.
 */
function caminhoCotovelo(): CaminhoResolvido {
  const pontos: number[] = [0, 0, 0, 0, 0, 0.4];
  for (let k = 1; k <= 64; k++) {
    const th = (Math.PI / 2) * (k / 64);
    pontos.push(0.1 - 0.1 * Math.cos(th), 0, 0.4 + 0.1 * Math.sin(th));
  }
  pontos.push(0.5, 0, 0.5);
  return { pontos, vertices: [0, pontos.length / 3 - 1] };
}

describe('varredura cega (A6-cego)', () => {
  it('N1 caminho reto de círculo Ø100 mm, 64 lados, L = 1 m: volume igual à extrusão exata', () => {
    const m = malhaVarredura(perfilCirculo(0.05), caminhoReto(1));
    const esperado = areaPoligono(0.05, 64) * 1.0;
    expect(Math.abs(volume(m) - esperado)).toBeLessThanOrEqual(TOL_EXATA);
    expect(volume(m)).toBeGreaterThan(0);
  });

  it('caminho reto é estanque', () => {
    const m = malhaVarredura(perfilCirculo(0.05), caminhoReto(1));
    expect(fechada(m)).toBe(true);
  });

  it('tubo oco reto: volume = (área externa − área interna) · L, exato', () => {
    const perfil: PerfilResolvido = { externo: circulo(0.05, 64), furos: [circuloHorario(0.025, 64)] };
    const m = malhaVarredura(perfil, caminhoReto(1));
    const esperado = (areaPoligono(0.05, 64) - areaPoligono(0.025, 64)) * 1.0;
    expect(Math.abs(volume(m) - esperado)).toBeLessThanOrEqual(TOL_EXATA);
  });

  it('tubo oco reto é estanque (furo fechado, sem vazamento)', () => {
    const perfil: PerfilResolvido = { externo: circulo(0.05, 64), furos: [circuloHorario(0.025, 64)] };
    const m = malhaVarredura(perfil, caminhoReto(1));
    expect(fechada(m)).toBe(true);
  });

  it('N2 cotovelo de círculo Ø50 com raio 100 mm: volume A · 957,08 mm (±1 %)', () => {
    const m = malhaVarredura(perfilCirculo(0.025), caminhoCotovelo());
    const comprimento = 0.4 + (0.1 * Math.PI) / 2 + 0.4;
    const esperado = Math.PI * 0.025 * 0.025 * comprimento;
    aproximado(volume(m), esperado, 0.01);
  });

  it('cotovelo N2 é estanque', () => {
    const m = malhaVarredura(perfilCirculo(0.025), caminhoCotovelo());
    expect(fechada(m)).toBe(true);
  });

  it('cotovelo N2: caixa envolvente — a seção final fica em x = 0,5 m e o início em z = 0', () => {
    const m = malhaVarredura(perfilCirculo(0.025), caminhoCotovelo());
    const b = caixa(m);
    expect(Math.abs(b.max[0] - 0.5)).toBeLessThanOrEqual(TOL_POSICAO);
    expect(Math.abs(b.min[0] + 0.025)).toBeLessThanOrEqual(1e-4);
    expect(Math.abs(b.min[2])).toBeLessThanOrEqual(TOL_POSICAO);
    expect(Math.abs(b.max[2] - 0.525)).toBeLessThanOrEqual(1e-4);
  });
});

describe('transição cega (A6-cego)', () => {
  it('N4 tronco de cone Ø100 → Ø50, L = 100 mm: 4,5815e-4 m³ (±0,5 %)', () => {
    const m = malhaTransicao(perfilCirculo(0.05), perfilCirculo(0.025), 0.1, [0, 0]);
    const R = 0.05;
    const r = 0.025;
    const L = 0.1;
    const esperado = (Math.PI * L * (R * R + R * r + r * r)) / 3;
    aproximado(volume(m), esperado, TOL_DISCRETA);
  });

  it('transição sólida N4 é estanque', () => {
    const m = malhaTransicao(perfilCirculo(0.05), perfilCirculo(0.025), 0.1, [0, 0]);
    expect(fechada(m)).toBe(true);
  });

  it('transição com desvio desloca a seção B em x (0,02 m) e mantém a seção A no eixo', () => {
    const m = malhaTransicao(perfilCirculo(0.05), perfilCirculo(0.025), 0.1, [0.02, 0]);
    const centroB = centroEmZ(m, 0.1);
    const centroA = centroEmZ(m, 0);
    expect(Math.abs(centroB.x - 0.02)).toBeLessThanOrEqual(TOL_POSICAO);
    expect(Math.abs(centroB.y)).toBeLessThanOrEqual(TOL_POSICAO);
    expect(Math.abs(centroA.x)).toBeLessThanOrEqual(TOL_POSICAO);
    expect(Math.abs(centroA.y)).toBeLessThanOrEqual(TOL_POSICAO);
  });

  it('transição com desvio tem o mesmo volume do tronco reto (Cavalieri, ±0,5 %)', () => {
    const m = malhaTransicao(perfilCirculo(0.05), perfilCirculo(0.025), 0.1, [0.02, 0]);
    const R = 0.05;
    const r = 0.025;
    const esperado = (Math.PI * 0.1 * (R * R + R * r + r * r)) / 3;
    aproximado(volume(m), esperado, TOL_DISCRETA);
  });
});
