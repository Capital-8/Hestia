/**
 * Massa conceitual, ficha E1 (docs/massa/PLANO.md, A.5, A.8 item 4 e A.10): o serviço `ServicoMassa` do motor sobre o Rust REAL, com as massas de
 * referência M1 a M5 pelas seis funções (malha, planta, fatias, corte, quantidades e avisos). Confere o contrato de ponta a ponta: o TS envia as seções
 * 140 a 142 e `niveis`, o kernel calcula, e o TS só decodifica e traduz para ids do projeto. Roda só em `npm run test:wasm`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore } from '@hestia/model';
import { ServicoMassa, massaAvisosDoProjeto, type LinhaCorteMassaProjeto, type MalhaMassaProjeto } from '../packages/engine/src/index.ts';
import { projetoComMassas, RAIO_M3 } from '../packages/engine/src/fixtureMassa.ts';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const srv = (): ServicoMassa => new ServicoMassa(() => ger);

/** Vértice `i` da malha, como (x, y, z). */
const vert = (m: MalhaMassaProjeto, i: number): [number, number, number] => [m.vertices[3 * i]!, m.vertices[3 * i + 1]!, m.vertices[3 * i + 2]!];

/** Triângulos (três índices) dos grupos que passam no filtro. */
function triangulos(m: MalhaMassaProjeto, filtro: (g: MalhaMassaProjeto['grupos'][number]) => boolean): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (const g of m.grupos.filter(filtro)) for (let k = g.primeiro; k < g.primeiro + g.n; k += 3) out.push([m.indices[k]!, m.indices[k + 1]!, m.indices[k + 2]!]);
  return out;
}

/** Volume pelo teorema da divergência: soma de det(a, b, c) / 6 sobre os triângulos (normais para fora). */
function volume(m: MalhaMassaProjeto, filtro: (g: MalhaMassaProjeto['grupos'][number]) => boolean): number {
  let v = 0;
  for (const [i, j, k] of triangulos(m, filtro)) {
    const [a, b, c] = [vert(m, i), vert(m, j), vert(m, k)];
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return v;
}

/** Malha fechada por posição: cada aresta dirigida tem a oposta, uma vez cada (superfície orientada e sem buraco). */
function fechada(m: MalhaMassaProjeto, filtro: (g: MalhaMassaProjeto['grupos'][number]) => boolean): boolean {
  const chave = (i: number): string => vert(m, i).map((x) => x.toFixed(9)).join(',');
  const arestas = new Map<string, number>();
  for (const [i, j, k] of triangulos(m, filtro))
    for (const [u, v] of [
      [i, j],
      [j, k],
      [k, i],
    ] as const)
      arestas.set(`${chave(u)}>${chave(v)}`, (arestas.get(`${chave(u)}>${chave(v)}`) ?? 0) + 1);
  return [...arestas].every(([a, n]) => n === 1 && arestas.get(a.split('>').reverse().join('>')) === 1);
}

/** Área (em módulo) de um anel `[x, y, x, y, ...]` de `n` pontos. */
function areaDoAnel(pts: Array<{ x: number; y: number }>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Área do polígono regular de 64 lados inscrito num círculo de raio `r` (a resolução de A.10). */
const areaInscrita = (r: number): number => 0.5 * 64 * r * r * Math.sin((2 * Math.PI) / 64);

describe('massa E1: serviço sobre o kernel real (M1 a M5 pelas seis funções)', () => {
  it.skipIf(!bytes)('M1 caixa: a malha fecha e o volume é 540 (teorema da divergência, 1e-6)', () => {
    const p = projetoComMassas();
    const m = srv().malha(p)!;
    const eM1 = (g: MalhaMassaProjeto['grupos'][number]): boolean => g.massaId === 'm1';
    expect(Math.abs(volume(m, eM1) - 540)).toBeLessThan(1e-6);
    expect(fechada(m, eM1)).toBe(true);
    expect(m.grupos.filter(eM1).map((g) => g.papel).sort()).toEqual([0, 1, 2]);
  });

  it.skipIf(!bytes)('M2 cilindro: a fatia tem a área do polígono inscrito de 64 pontos (1e-6)', () => {
    const p = projetoComMassas();
    const f = srv().fatias(p)!.find((x) => x.massaId === 'm2' && x.nivelId === 'lv_2')!;
    expect(f).toBeDefined();
    expect(Math.abs(f.area - areaInscrita(5))).toBeLessThan(1e-6);
  });

  it.skipIf(!bytes)('M3 torre torcida: uma fatia por nível de 0 a 30 m, todas com área 64 (1e-6)', () => {
    const p = projetoComMassas();
    const f = srv().fatias(p)!.filter((x) => x.massaId === 'm3');
    expect(f).toHaveLength(11);
    for (const x of f) expect(Math.abs(x.area - 64)).toBeLessThan(1e-6);
    expect(RAIO_M3 * RAIO_M3 * 2).toBeCloseTo(64, 9);
  });

  it.skipIf(!bytes)('M4 bulbo: o anel em z = 8 tem raio 6 (nenhum ponto passa de 6 + 1e-9)', () => {
    const p = projetoComMassas();
    const cortes = srv().planta(p, null, 8, 0, 30)!.filter((l) => l.massaId === 'm4' && l.estilo === 0);
    expect(cortes).toHaveLength(1);
    const anel = cortes[0]!.pontos;
    expect(Math.abs(areaDoAnel(anel) - areaInscrita(6))).toBeLessThan(1e-6);
    for (const q of anel) expect(Math.hypot(q.x, q.y)).toBeLessThanOrEqual(6 + 1e-9);
  });

  it.skipIf(!bytes)('M5 flor: 12 cópias da pétala, e a cópia i é a cópia 0 girada i · 30° (1e-9)', () => {
    const p = projetoComMassas();
    const m = srv().malha(p)!;
    const copias = new Set(m.grupos.filter((g) => g.massaId === 'm5p').map((g) => g.copia));
    expect(copias.size).toBe(12);
    const lateral = (c: number) => m.grupos.find((g) => g.massaId === 'm5p' && g.copia === c && g.papel === 0)!;
    const [g0, g1] = [lateral(0), lateral(1)];
    expect(g1.n).toBe(g0.n);
    const th = (2 * Math.PI) / 12;
    for (let q = 0; q < g0.n; q++) {
      const [x0, y0, z0] = vert(m, m.indices[g0.primeiro + q]!);
      const [x1, y1, z1] = vert(m, m.indices[g1.primeiro + q]!);
      expect(Math.abs(x1 - (Math.cos(th) * x0 - Math.sin(th) * y0))).toBeLessThan(1e-9);
      expect(Math.abs(y1 - (Math.sin(th) * x0 + Math.cos(th) * y0))).toBeLessThan(1e-9);
      expect(Math.abs(z1 - z0)).toBeLessThan(1e-9);
    }
  });

  it.skipIf(!bytes)('corte de M1: um polígono cortado, retângulo 10 × 9 (área 90)', () => {
    const p = projetoComMassas();
    const linhas: LinhaCorteMassaProjeto[] = srv().corte(p, null, 0, 0, 1, 0, 100)!;
    const cortados = linhas.filter((l) => l.massaId === 'm1' && l.estilo === 0);
    expect(cortados).toHaveLength(1);
    expect(Math.abs(areaDoAnel(cortados[0]!.pontos.map((q) => ({ x: q.s, y: q.z }))) - 90)).toBeLessThan(1e-6);
  });

  it.skipIf(!bytes)('quantidades de M1: volume 540 e altura 9', () => {
    const q = srv().quantidades(projetoComMassas())!.find((x) => x.massaId === 'm1')!;
    expect(Math.abs(q.volume - 540)).toBeLessThan(1e-6);
    expect(q.altura).toBeCloseTo(9, 9);
  });

  it.skipIf(!bytes)('avisos: M1 em 4 cópias sobrepostas dá o aviso 2; M5 não dá', () => {
    const s = new ProjectStore(projetoComMassas());
    s.exec({ type: 'updateMass', id: 'm1', patch: { arranjo: { n: 4, cx: 0, cy: 0, anguloTotal: 2 * Math.PI } } });
    const avisos = srv().avisos(s.project)!;
    expect(avisos.some((a) => a.massaId === 'm1' && a.codigo === 2)).toBe(true);
    expect(srv().avisos(projetoComMassas())!.some((a) => a.massaId === 'm5p' && a.codigo === 2)).toBe(false);
    expect(massaAvisosDoProjeto(s.project, srv(), 'pt').some((a) => a.code === 'massa-copias-sobrepostas')).toBe(true);
  });

  it.skipIf(!bytes)('cache: mudar só a cor devolve as mesmas respostas; editar M1 deixa M2 igual na malha', () => {
    const s = srv();
    const p = projetoComMassas();
    const antes = s.malha(p)!;
    const cor = new ProjectStore(p);
    cor.exec({ type: 'updateMass', id: 'm1', patch: { color: '#123456' } });
    expect(s.malha(cor.project)).toBe(antes);
    const edit = new ProjectStore(p);
    edit.exec({ type: 'updateMass', id: 'm1', patch: { origem: { x: 3, y: 0 } } });
    const depois = s.malha(edit.project)!;
    const vertM2 = (m: MalhaMassaProjeto): number[] => m.grupos.filter((g) => g.massaId === 'm2').flatMap((g) => Array.from(m.indices.slice(g.primeiro, g.primeiro + g.n), (i) => vert(m, i)).flat());
    expect(vertM2(depois)).toEqual(vertM2(antes));
  });
});
