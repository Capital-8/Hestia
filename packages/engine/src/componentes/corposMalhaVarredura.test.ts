import type { Perfil } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { filetarCaminho } from './corposCaminho.ts';
import { malhaDosCorpos } from './corposMalha.ts';
import { malhaTransicao } from './corposMalhaTransicao.ts';
import { malhaVarredura } from './corposMalhaVarredura.ts';
import { resolverPerfil } from './corposPerfil.ts';
import type { CaminhoResolvido, CorpoResolvido, FormaCorpoResolvida, PerfilResolvido } from './corposTipos.ts';
import { volumeDaMalha, type Malha } from './malha.ts';

const mm = (expr: string): number => Number(expr);
const IDENTIDADE = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function perfil(p: Perfil): PerfilResolvido {
  const r = resolverPerfil(p, mm);
  if (!r.ok) throw new Error(r.erro);
  return r.perfil;
}

function caminho(pontosMm: Array<[number, number, number]>, raiosMm: number[]): CaminhoResolvido {
  const r = filetarCaminho(
    pontosMm.map((p) => [p[0] / 1000, p[1] / 1000, p[2] / 1000]),
    raiosMm.map((x) => x / 1000),
    12,
  );
  if (!r.ok) throw new Error(r.erro);
  return r.caminho;
}

function chave(m: Malha, i: number): string {
  const q = (x: number) => Math.round(x * 1e8);
  return `${q(m.positions[i * 3]!)},${q(m.positions[i * 3 + 1]!)},${q(m.positions[i * 3 + 2]!)}`;
}

/** Estanque: cada aresta orientada aparece uma vez e a oposta também (vértices soldados por posição). */
function estanque(m: Malha): boolean {
  const contagem = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [0, 1, 2].map((k) => chave(m, m.indices[t + k]!));
    for (let k = 0; k < 3; k++) {
      const a = ids[k]!;
      const b = ids[(k + 1) % 3]!;
      if (a === b) continue;
      contagem.set(`${a}>${b}`, (contagem.get(`${a}>${b}`) ?? 0) + 1);
    }
  }
  for (const [cad, n] of contagem) {
    const [a, b] = cad.split('>') as [string, string];
    if (n !== 1 || contagem.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

function normaisUnitarias(m: Malha): boolean {
  for (let i = 0; i < m.normals.length; i += 3) {
    if (Math.abs(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!) - 1) > 1e-9) return false;
  }
  return true;
}

const circulo = (d: string, seg = '64'): PerfilResolvido => perfil({ tipo: 'circulo', diametro: d, segmentos: seg });

describe('malhaVarredura', () => {
  it('N2: cotovelo Ø50, raio 100: volume 1,8792e-3 m³ ±1 %, estanque, normais unitárias', () => {
    const c = caminho([[0, 0, 0], [0, 0, 500], [500, 0, 500]], [100]);
    const m = malhaVarredura(circulo('50'), c);
    expect(volumeDaMalha(m) / 1.8792e-3).toBeGreaterThan(0.99);
    expect(volumeDaMalha(m) / 1.8792e-3).toBeLessThan(1.01);
    expect(estanque(m)).toBe(true);
    expect(normaisUnitarias(m)).toBe(true);
    expect(m.pecaDoTriangulo.length).toBe(m.indices.length / 3);
  });

  it('junta de esquadro em canto vivo: volume = área × comprimento do eixo e estanque', () => {
    const c = caminho([[0, 0, 0], [0, 0, 500], [500, 0, 500]], [0]);
    const m = malhaVarredura(circulo('50'), c);
    const area = (64 / 2) * 0.025 ** 2 * Math.sin((2 * Math.PI) / 64);
    expect(volumeDaMalha(m) / (area * 1.0)).toBeCloseTo(1, 3);
    expect(estanque(m)).toBe(true);
  });

  it('tubo oco (anel) varrido: volume = área do anel × comprimento do eixo ±1 %, estanque', () => {
    const anel = perfil({ tipo: 'anel', diametroExterno: '60', diametroInterno: '40', segmentos: '64' });
    const c = caminho([[0, 0, 0], [0, 0, 500], [500, 0, 500]], [100]);
    const m = malhaVarredura(anel, c);
    const area = Math.PI * (0.03 ** 2 - 0.02 ** 2);
    const eixo = 0.4 + (0.1 * Math.PI) / 2 + 0.4;
    expect(volumeDaMalha(m) / (area * eixo)).toBeGreaterThan(0.99);
    expect(volumeDaMalha(m) / (area * eixo)).toBeLessThan(1.01);
    expect(estanque(m)).toBe(true);
    expect(normaisUnitarias(m)).toBe(true);
  });

  it('reta em +Z: tampas com normais ∓T nas pontas', () => {
    const m = malhaVarredura(circulo('50', '16'), caminho([[0, 0, 0], [0, 0, 1000]], []));
    expect(estanque(m)).toBe(true);
    let baixo = false;
    let cima = false;
    for (let i = 0; i < m.normals.length; i += 3) {
      if (m.normals[i + 2] === -1 && m.positions[i + 2] === 0) baixo = true;
      if (m.normals[i + 2] === 1 && Math.abs(m.positions[i + 2]! - 1) < 1e-12) cima = true;
    }
    expect(baixo && cima).toBe(true);
  });

  it('entrada inválida devolve malha vazia sem lançar', () => {
    expect(malhaVarredura(circulo('50'), { pontos: [0, 0, 0], vertices: [0] }).indices).toEqual([]);
  });
});

describe('malhaTransicao', () => {
  it('N4: Ø100 → Ø50, L = 100 mm: volume 4,5815e-4 m³ ±0,5 %, estanque, normais unitárias', () => {
    const m = malhaTransicao(circulo('100'), circulo('50'), 0.1, [0, 0]);
    expect(volumeDaMalha(m) / 4.5815e-4).toBeGreaterThan(0.995);
    expect(volumeDaMalha(m) / 4.5815e-4).toBeLessThan(1.005);
    expect(estanque(m)).toBe(true);
    expect(normaisUnitarias(m)).toBe(true);
  });

  it('desvio desloca a seção B; retângulo → círculo tem volume positivo e normais unitárias', () => {
    // sem checar estanqueidade por índice: `triangulate` (earcut) descarta pontos colineares da tampa do retângulo reamostrado
    const m = malhaTransicao(perfil({ tipo: 'retangulo', largura: '100', altura: '60' }), circulo('50'), 0.2, [0.03, 0.01]);
    expect(normaisUnitarias(m)).toBe(true);
    expect(volumeDaMalha(m)).toBeGreaterThan(0);
    let xMax = -Infinity;
    for (let i = 0; i < m.positions.length; i += 3) if (Math.abs(m.positions[i + 2]! - 0.2) < 1e-12) xMax = Math.max(xMax, m.positions[i]!);
    expect(xMax).toBeCloseTo(0.055, 6);
  });

  it('perfil com furo: malha vazia', () => {
    const anel = perfil({ tipo: 'anel', diametroExterno: '60', diametroInterno: '40' });
    expect(malhaTransicao(anel, circulo('50'), 0.1, [0, 0]).indices).toEqual([]);
  });
});

function corpo(forma: FormaCorpoResolvida, extra: Partial<CorpoResolvido> = {}): CorpoResolvido {
  return {
    id: 'c',
    nome: 'c',
    indice: 1,
    papel: 'estrutura' as CorpoResolvido['papel'],
    forma,
    origem: [0, 0, 0],
    rotacao: IDENTIDADE,
    vazio: false,
    material: null,
    detalhe3d: null,
    vistas: null,
    grupo: null,
    ...extra,
  };
}

/** Sub-malha só com os triângulos do corpo `indice`. */
function doCorpo(m: Malha, indice: number): Malha {
  const indices: number[] = [];
  m.pecaDoTriangulo.forEach((p, t) => {
    if (p === indice) indices.push(m.indices[t * 3]!, m.indices[t * 3 + 1]!, m.indices[t * 3 + 2]!);
  });
  return { ...m, indices, pecaDoTriangulo: indices.map(() => indice) };
}

function caixa(m: Malha): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const i of new Set(m.indices)) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, m.positions[i * 3 + k]!);
      max[k] = Math.max(max[k]!, m.positions[i * 3 + k]!);
    }
  }
  return { min, max };
}

describe('malhaDosCorpos', () => {
  const retangulo = perfil({ tipo: 'retangulo', largura: '100', altura: '50' });
  // rotação de 90° em Y: x' = z, y' = y, z' = −x
  const RY90 = [0, 0, 1, 0, 1, 0, -1, 0, 0];

  it('quadro rotacionado 90° em Y com origem: bounding box confere e pecaDoTriangulo = índice do corpo', () => {
    const r = malhaDosCorpos([
      corpo({ tipo: 'extrusao', perfil: circulo('20'), comprimento: 0.1 }),
      corpo({ tipo: 'extrusao', perfil: retangulo, comprimento: 1 }, { id: 'b', rotacao: RY90, origem: [1, 2, 3] }),
    ]);
    expect(r.erros).toEqual([]);
    expect(new Set(r.solidas.pecaDoTriangulo)).toEqual(new Set([0, 1]));
    const { min, max } = caixa(doCorpo(r.solidas, 1));
    // local: x ∈ ±0,05, y ∈ ±0,025, z ∈ [0, 1] → x' = z + 1, y' = y + 2, z' = −x + 3
    expect(min[0]).toBeCloseTo(1, 9);
    expect(max[0]).toBeCloseTo(2, 9);
    expect(min[1]).toBeCloseTo(1.975, 9);
    expect(max[1]).toBeCloseTo(2.025, 9);
    expect(min[2]).toBeCloseTo(2.95, 9);
    expect(max[2]).toBeCloseTo(3.05, 9);
  });

  it('as normais giram com o quadro (tampa +Z vira +X) e o volume se conserva', () => {
    const r = malhaDosCorpos([corpo({ tipo: 'extrusao', perfil: retangulo, comprimento: 1 }, { rotacao: RY90 })]);
    expect(volumeDaMalha(r.solidas)).toBeCloseTo(0.1 * 0.05 * 1, 9);
    let achou = false;
    for (let i = 0; i < r.solidas.normals.length; i += 3) {
      if (Math.abs(r.solidas.normals[i]! - 1) < 1e-9 && Math.abs(r.solidas.positions[i]! - 1) < 1e-9) achou = true;
    }
    expect(achou).toBe(true);
  });

  it('vazio vai para `vazios`; as quatro formas são atendidas (toro de Pappus na revolução)', () => {
    const c = caminho([[0, 0, 0], [0, 0, 500]], []);
    const r = malhaDosCorpos([
      corpo({ tipo: 'extrusao', perfil: retangulo, comprimento: 1 }),
      corpo({ tipo: 'revolucao', perfil: circulo('50'), angulo: 2 * Math.PI, segmentos: 64, afastamento: 0.1, centradoNoEixo: true }),
      corpo({ tipo: 'varredura', perfil: circulo('50'), caminho: c }, { vazio: true }),
      corpo({ tipo: 'transicao', perfilA: circulo('100'), perfilB: circulo('50'), comprimento: 0.1, desvio: [0, 0] }, { vazio: true }),
    ]);
    expect(r.erros).toEqual([]);
    expect(new Set(r.solidas.pecaDoTriangulo)).toEqual(new Set([0, 1]));
    expect(new Set(r.vazios.pecaDoTriangulo)).toEqual(new Set([2, 3]));
    expect(volumeDaMalha(doCorpo(r.solidas, 1)) / 1.5421e-3).toBeGreaterThan(0.99);
    expect(volumeDaMalha(doCorpo(r.solidas, 1)) / 1.5421e-3).toBeLessThan(1.01);
  });

  it('erros viram diagnóstico: perfil que cruza o eixo e transição com furos', () => {
    const anel = perfil({ tipo: 'anel', diametroExterno: '60', diametroInterno: '40' });
    const poligono = perfil({ tipo: 'poligono', pontos: [['-10', '0'], ['10', '0'], ['0', '10']] });
    const r = malhaDosCorpos([
      corpo({ tipo: 'revolucao', perfil: poligono, angulo: Math.PI, segmentos: 8, afastamento: 0, centradoNoEixo: false }, { id: 'r' }),
      corpo({ tipo: 'transicao', perfilA: anel, perfilB: anel, comprimento: 0.1, desvio: [0, 0] }, { id: 't' }),
    ]);
    expect(r.erros).toEqual(['corpos[r]: perfil de revolução cruza o eixo', 'corpos[t]: transição não aceita perfil com furos']);
    expect(r.solidas.indices).toEqual([]);
  });

  it('estouro de triângulos devolve erro em vez de malha enorme', () => {
    const grande = corpo(
      { tipo: 'revolucao', perfil: circulo('50', '128'), angulo: 2 * Math.PI, segmentos: 1000, afastamento: 0.1, centradoNoEixo: true },
      { id: 'g' },
    );
    const r = malhaDosCorpos([grande]);
    expect(r.erros[0]).toContain('corpos[g]');
    expect(r.solidas.indices).toEqual([]);
  });
});
