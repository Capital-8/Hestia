import { describe, expect, it } from 'vitest';
import type { CurvaNivelTN, MalhaTerreno } from '@hestia/engine';
import { createEmptyProject, makeTerrain, TERRAIN_TYPES_DEFAULT, type Project, type Terrain } from '@hestia/model';
import { chaveDoTerreno, solidosDoTerreno } from './model3d/terreno3d.ts';
import { rotulosAutomaticosDeCurva, rotulosDeCurva } from './plan/terrenoRotulos.ts';
import { terrenoOps, type DadosTerreno } from './plan/terreno.ts';
import { defaultPaint } from './plan/style.ts';
import { LIGHT } from './plan/types.ts';

const tipo = { ...TERRAIN_TYPES_DEFAULT[0]!, id: 'tt_x', superficieColor: '#00aa00', soloColor: '#663300', rotularCurvas: true };
const projeto = (t: Partial<Terrain> = { tipoId: 'tt_x' }): { p: Project; t: Terrain } => {
  const p = createEmptyProject();
  p.settings = { ...p.settings, terrainTypes: [tipo] };
  return { p, t: { ...makeTerrain({ id: 'tn1', levelId: 'lv_0', ...t }), order: 0 } };
};
const quad = (z: number): { positions: number[]; indices: number[] } => ({ positions: [0, 0, z, 20, 0, z, 20, 20, z, 0, 20, z], indices: [0, 1, 2, 0, 2, 3] });
const malha = (): MalhaTerreno => ({
  terrenoId: 'tn1',
  partes: [
    { regiaoId: null, papel: 'base', ...quad(7) },
    { regiaoId: null, papel: 'saia', ...quad(8) },
    { regiaoId: null, papel: 'superficie', ...quad(10) },
  ],
});

describe('3D: solo e superfície separados pelo tipo', () => {
  it('com tipo: superfície verde, saia e base marrons (lotes distintos)', () => {
    const { p, t } = projeto();
    const lotes = solidosDoTerreno(p, t, [], malha());
    expect(lotes.map((l) => l.materialId).sort()).toEqual(['tn_cor_00aa00', 'tn_cor_663300']);
    const solo = lotes.find((l) => l.materialId === 'tn_cor_663300')!;
    expect(solo.indices.length).toBe(12);
  });

  it('sem tipo: tudo na cor do terreno, como antes', () => {
    const { p, t } = projeto({ color: '#112233' });
    const lotes = solidosDoTerreno(p, t, [], malha());
    expect(lotes.map((l) => l.materialId)).toEqual(['tn_cor_112233']);
  });

  it('a cor do solo entra na chave de conteúdo da cena', () => {
    const { p, t } = projeto();
    const a = chaveDoTerreno(p, t, [], 'm');
    p.settings = { ...p.settings, terrainTypes: [{ ...tipo, soloColor: '#000000' }] };
    expect(chaveDoTerreno(p, t, [], 'm')).not.toBe(a);
  });
});

const curva = (z: number, r: number, cx = 50, cy = 50): CurvaNivelTN => ({
  terrenoId: 'tn1',
  z,
  mestra: true,
  fechada: true,
  pontos: Array.from({ length: 72 }, (_, i) => ({ x: cx + r * Math.cos((i / 72) * 2 * Math.PI), y: cy + r * Math.sin((i / 72) * 2 * Math.PI) })),
});

describe('rótulos automáticos das curvas mestras', () => {
  it('coloca a cota da curva, alinhada a ela, e nenhum par de rótulos se sobrepõe', () => {
    const { p, t } = projeto();
    const cs = [curva(5, 10), curva(10, 20), curva(15, 30), curva(20, 40)];
    const r = rotulosAutomaticosDeCurva(p, t, cs, 500, 1, []);
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(new Set(r.map((l) => l.text)).size).toBe(4);
    for (const l of r) expect(Math.abs(l.rotation ?? 0)).toBeLessThanOrEqual(90);
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(Math.hypot(r[i]!.at.x - r[j]!.at.x, r[i]!.at.y - r[j]!.at.y)).toBeGreaterThan(1);
  });

  it('a quantidade acompanha a escala da vista: mais zoom, mais rótulos; menos zoom, menos', () => {
    const { p, t } = projeto();
    const cs = [curva(5, 40)];
    const perto = rotulosAutomaticosDeCurva(p, t, cs, 100, 1, []).length;
    const longe = rotulosAutomaticosDeCurva(p, t, cs, 1000, 1, []).length;
    expect(perto).toBeGreaterThan(longe);
  });

  it('rotularCada = 2 rotula só uma mestra a cada duas; curva curta demais para o texto fica sem rótulo', () => {
    const { p, t } = projeto();
    const cs = [curva(5, 10), curva(10, 20), curva(15, 30), curva(20, 40)];
    const r = rotulosAutomaticosDeCurva(p, t, cs, 500, 2, []);
    expect([...new Set(r.map((l) => l.text))]).toHaveLength(2);
    expect(rotulosAutomaticosDeCurva(p, t, [curva(5, 0.2)], 500, 1, [])).toHaveLength(0);
  });

  it('evita os rótulos manuais já postos e é determinístico', () => {
    const { p } = projeto();
    const t = { ...projeto().t, linhasRotulo: [50, 0, 50, 100] };
    const cs = [curva(5, 30)];
    const ocupados: Parameters<typeof rotulosAutomaticosDeCurva>[5] = [];
    const manuais = rotulosDeCurva(p, t, cs, 500, ocupados);
    expect(manuais.length).toBe(2);
    const a = rotulosAutomaticosDeCurva(p, t, cs, 500, 1, ocupados);
    for (const l of a) for (const m of manuais) expect(Math.hypot(l.at.x - m.at.x, l.at.y - m.at.y)).toBeGreaterThan(1);
    const b = rotulosAutomaticosDeCurva(p, t, cs, 500, 1, []);
    const c = rotulosAutomaticosDeCurva(p, t, cs, 500, 1, []);
    expect(b).toEqual(c);
  });
});

describe('terrenoOps com tipo', () => {
  const paint = defaultPaint('site', 50);
  const dados: DadosTerreno = { propostas: [curva(5, 20)], existentes: null, bordas: [], cotas: () => [] };

  it('rotularCurvas liga os rótulos; desligado, só valem as linhas manuais', () => {
    const { p, t } = projeto();
    expect(terrenoOps(p, t, dados, LIGHT, false, paint, 200).labels.length).toBeGreaterThan(0);
    p.settings = { ...p.settings, terrainTypes: [{ ...tipo, rotularCurvas: false }] };
    expect(terrenoOps(p, t, dados, LIGHT, false, paint, 200).labels).toHaveLength(0);
  });

  it('as curvas usam a cor e o peso do tipo, não o verde da superfície', () => {
    const { p, t } = projeto();
    p.settings = { ...p.settings, terrainTypes: [{ ...tipo, curvaCor: '#ff0000', mestraPeso: 3 }] };
    const o = terrenoOps(p, t, dados, LIGHT, false, paint, 200);
    const s = o.strokes.find((x) => x.pts.length === 72)!;
    expect(s.color).toBe('#ff0000');
    expect(s.widthPx).toBeCloseTo(paint.proj.widthPx * 3, 9);
  });
});
