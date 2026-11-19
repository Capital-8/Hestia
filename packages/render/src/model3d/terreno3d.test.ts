import { describe, expect, it } from 'vitest';
import type { MalhaTerreno } from '@hestia/engine';
import { createEmptyProject, makeTerrain, makeTerrainRegion, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import {
  bordaTracejadaDeReserva,
  chaveDoTerreno,
  COR_PADRAO_TERRENO,
  cotaDeReserva,
  materialDeCorTN,
  materialDoTerreno,
  poligonoDeReserva,
  solidosDoTerreno,
  tracejarAnel,
} from './terreno3d.ts';

const terreno = (extra: Partial<Terrain> = {}): Terrain => ({ ...makeTerrain({ id: 'tn1', levelId: 'lv_0', ...extra }), order: 0 });
const regiao = (extra: Partial<TerrainRegion> = {}): TerrainRegion => ({
  ...makeTerrainRegion({ id: 'rg1', levelId: 'lv_0', terrenoId: 'tn1', contorno: [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }], papel: 'plataforma', cota: 8, ...extra }),
  order: 0,
});
const proj = (): Project => createEmptyProject();

/** Quadrado (x0,y0)-(x1,y1) na cota z: 2 triângulos para cima. */
const quad = (x0: number, y0: number, x1: number, y1: number, z: number) => ({
  positions: [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z],
  indices: [0, 1, 2, 0, 2, 3],
});

function malhaFalsa(): MalhaTerreno {
  const base = quad(0, 0, 20, 20, 7);
  return {
    terrenoId: 'tn1',
    partes: [
      { regiaoId: null, papel: 'base', positions: base.positions, indices: [0, 2, 1, 0, 3, 2] },
      { regiaoId: 'rg1', papel: 'superficie', ...quad(5, 5, 15, 15, 8) },
      { regiaoId: null, papel: 'saia', positions: [0, 0, 7, 20, 0, 7, 20, 0, 10, 0, 0, 10], indices: [0, 1, 2, 0, 2, 3] },
      { regiaoId: null, papel: 'superficie', ...quad(0, 0, 20, 20, 10) },
    ],
  };
}

describe('material do terreno', () => {
  it('região: material do projeto, senão cor; depois terreno; por fim o padrão #b5a27a', () => {
    const p = proj();
    const matId = Object.keys(p.materials)[0]!;
    expect(materialDoTerreno(p, terreno(), null)).toBe('tn_cor_b5a27a');
    expect(COR_PADRAO_TERRENO).toBe('#b5a27a');
    expect(materialDoTerreno(p, terreno({ color: '#112233' }), null)).toBe('tn_cor_112233');
    expect(materialDoTerreno(p, terreno({ color: '#112233' }), regiao())).toBe('tn_cor_112233');
    expect(materialDoTerreno(p, terreno({ color: '#112233' }), regiao({ color: '#445566' }))).toBe('tn_cor_445566');
    expect(materialDoTerreno(p, terreno({ color: '#112233' }), regiao({ color: '#445566', materialId: matId }))).toBe(matId);
    expect(materialDoTerreno(p, terreno({ materialId: matId }), null)).toBe(matId);
    expect(materialDoTerreno(p, terreno({ materialId: 'inexistente' }), null)).toBe('tn_cor_b5a27a');
  });
  it('materialDeCorTN decodifica o id sintético e recusa os outros', () => {
    expect(materialDeCorTN('tn_cor_ff0000')?.color).toBe('#ff0000');
    expect(materialDeCorTN('mat_concreto')).toBeUndefined();
    expect(materialDeCorTN('tn_cor_zz')).toBeUndefined();
  });
});

describe('solidosDoTerreno', () => {
  it('um lote por material (categoria site), com superfície, saia e base', () => {
    const p = proj();
    const t = terreno({ color: '#112233' });
    const lotes = solidosDoTerreno(p, t, [regiao({ color: '#445566' })], malhaFalsa());
    expect(lotes.map((b) => b.materialId).sort()).toEqual(['tn_cor_112233', 'tn_cor_445566']);
    expect(lotes.every((b) => b.category === 'site')).toBe(true);
    const doTerreno = lotes.find((b) => b.materialId === 'tn_cor_112233')!;
    const nz = (i: number): number => doTerreno.normals[i * 3 + 2]!;
    const nTri = doTerreno.indices.length / 3;
    expect(nTri).toBe(6); // base 2 + saia 2 + superfície 2
    const zs = Array.from({ length: doTerreno.positions.length / 3 }, (_, i) => nz(i));
    expect(zs.some((z) => z > 0.99)).toBe(true); // superfície
    expect(zs.some((z) => z < -0.99)).toBe(true); // base
    expect(zs.some((z) => Math.abs(z) < 1e-9)).toBe(true); // saia
  });
  it('faixas: a região tem a sua, o resto (superfície sem região, saia, base) é do terreno', () => {
    const lotes = solidosDoTerreno(proj(), terreno(), [regiao()], malhaFalsa());
    expect(lotes).toHaveLength(1);
    const ids = lotes[0]!.ids;
    expect(ids.filter((r) => r.id === 'rg1').reduce((s, r) => s + r.count, 0)).toBe(6);
    expect(ids.filter((r) => r.id === 'tn1').reduce((s, r) => s + r.count, 0)).toBe(18);
    expect(ids.reduce((s, r) => s + r.count, 0)).toBe(lotes[0]!.indices.length);
  });
  it('região oculta fica na faixa do terreno, com a cor dela', () => {
    const lotes = solidosDoTerreno(proj(), terreno(), [regiao({ color: '#445566' })], malhaFalsa(), (id) => id === 'rg1');
    expect(lotes.flatMap((b) => b.ids).some((r) => r.id === 'rg1')).toBe(false);
    expect(lotes).toHaveLength(2);
  });
  it('triângulo degenerado é descartado', () => {
    const m: MalhaTerreno = { terrenoId: 'tn1', partes: [{ regiaoId: null, papel: 'superficie', positions: [0, 0, 0, 1, 1, 1, 2, 2, 2], indices: [0, 1, 2] }] };
    expect(solidosDoTerreno(proj(), terreno(), [], m)).toEqual([]);
  });
});

describe('chaveDoTerreno', () => {
  const p = proj();
  it('nome, rótulos e pontos cotados não mudam a chave; fontes, cor e regiões mudam', () => {
    const t = terreno({ pontos: [0, 0, 1, 1, 0, 1, 0, 1, 1] });
    const a = chaveDoTerreno(p, t, [], 'm');
    expect(chaveDoTerreno(p, { ...t, name: 'outro', linhasRotulo: [0, 0, 1, 1], pontosCotados: [1, 1], mostrarExistente: true }, [], 'm')).toBe(a);
    expect(chaveDoTerreno(p, { ...t, pontos: [0, 0, 2, 1, 0, 1, 0, 1, 1] }, [], 'm')).not.toBe(a);
    expect(chaveDoTerreno(p, { ...t, color: '#000000' }, [], 'm')).not.toBe(a);
    expect(chaveDoTerreno(p, t, [regiao()], 'm')).not.toBe(a);
    expect(chaveDoTerreno(p, t, [], 'n')).not.toBe(a);
    expect(chaveDoTerreno(p, t, [regiao()], 'm', (id) => id === 'rg1')).not.toBe(chaveDoTerreno(p, t, [regiao()], 'm'));
  });
});

describe('reserva sem kernel', () => {
  it('usa a borda do modelo quando existe', () => {
    const t = terreno({ borda: [0, 0, 10, 0, 10, 10, 0, 10] });
    expect(poligonoDeReserva(t)).toHaveLength(4);
  });
  it('sem borda, usa a envoltória convexa de pontos, curvas e quebras', () => {
    const t = terreno({
      pontos: [0, 0, 1, 10, 0, 1, 5, 5, 1],
      curvas: [{ z: 2, xy: [10, 10, 0, 10], fechada: false }],
      quebras: [{ xyz: [3, 3, 1, 4, 4, 1] }],
    });
    const h = poligonoDeReserva(t)!;
    expect(h).toHaveLength(4);
    expect(Math.max(...h.map((q) => q.x))).toBe(10);
  });
  it('menos de 3 pontos distintos: sem polígono nem desenho, sem exceção', () => {
    expect(poligonoDeReserva(terreno())).toBeNull();
    expect(bordaTracejadaDeReserva(terreno({ pontos: [0, 0, 1, 1, 1, 1] }))).toBeNull();
  });
  it('cota de reserva é a média das fontes', () => {
    expect(cotaDeReserva(terreno({ pontos: [0, 0, 2, 1, 0, 4, 0, 1, 6] }))).toBe(4);
    expect(cotaDeReserva(terreno())).toBe(0);
  });
  it('tracejado: traços e vãos alternados, comprimento total dentro do esperado', () => {
    const anel = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const seg = tracejarAnel(anel, 3, 1, 1);
    expect(seg.length % 6).toBe(0);
    let total = 0;
    for (let i = 0; i < seg.length; i += 6) total += Math.hypot(seg[i + 3]! - seg[i]!, seg[i + 4]! - seg[i + 1]!);
    expect(total).toBeCloseTo(20, 6);
    expect(seg.filter((_, i) => i % 3 === 2).every((z) => z === 3)).toBe(true);
    expect(tracejarAnel(anel, 0, 0, 1)).toEqual([]);
  });
  it('borda tracejada de um terreno com fontes devolve segmentos', () => {
    const seg = bordaTracejadaDeReserva(terreno({ borda: [0, 0, 20, 0, 20, 20, 0, 20], pontos: [0, 0, 5] }))!;
    expect(seg.length).toBeGreaterThan(0);
    expect(seg.length % 6).toBe(0);
  });
});
