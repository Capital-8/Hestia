import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno, projetoTerreno, type CurvaNivelTN, type LinhaPlantaTN } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeTerrain, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import { ALFA_REGIAO, CRUZ_PX, EXISTENTE_TRACO, FATOR_MESTRA, RESERVA_TRACO, bordaDeReserva, espessuraMestra, regiaoOps, regioesDoNivel, terrenoOps, terrenoSelectionOps, terrenosDoNivel, type DadosTerreno } from './terreno.ts';
import { rotulosDeCurva, rotuloDeCota, textoDaCota, anguloLegivel } from './terrenoRotulos.ts';
import { defaultPaint } from './style.ts';
import { LIGHT } from './types.ts';

const paint = defaultPaint('site', 50);
const T3 = 'tn_t3';
const quad = (l: number): Array<{ x: number; y: number }> => [{ x: 10 - l / 2, y: 10 - l / 2 }, { x: 10 + l / 2, y: 10 - l / 2 }, { x: 10 + l / 2, y: 10 + l / 2 }, { x: 10 - l / 2, y: 10 + l / 2 }];
const curva = (z: number, l: number, mestra: boolean): CurvaNivelTN => ({ terrenoId: T3, z, mestra, fechada: true, pontos: quad(l) });
const borda: LinhaPlantaTN = { terrenoId: T3, fechada: true, pontos: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
const dados = (over: Partial<DadosTerreno> = {}): DadosTerreno => ({
  propostas: [curva(1, 16, false), curva(2, 12, false), curva(5, 4, true)],
  existentes: [curva(1, 17, false)],
  bordas: [borda],
  cotas: (pts) => pts.map(() => ({ z: 3.5, declividade: 0, terrenoId: T3 })),
  ...over,
});
const comFontes = (nome: 'T3' | 'T5', ops: Parameters<ProjectStore['exec']>[0] extends never ? never : unknown[]): Project => {
  const p = projetoTerreno(nome);
  const s = new ProjectStore(p);
  s.exec({ type: 'editTerrainFontes', terrenoId: nome === 'T3' ? T3 : 'tn_t5', ops } as never);
  return s.project;
};
const terreno = (p: Project, id = T3): Terrain => p.elements[id] as Terrain;

describe('terrenoOps: curvas, borda e reserva', () => {
  it('curvas normais no peso de projeção e mestras um peso acima; borda no peso de corte', () => {
    const p = projetoTerreno('T3');
    const o = terrenoOps(p, terreno(p), dados(), LIGHT, false, paint, 100);
    const normais = o.strokes.filter((s) => s.widthPx === paint.proj.widthPx);
    expect(normais).toHaveLength(2);
    const mestra = o.strokes.find((s) => s.widthPx === paint.proj.widthPx * FATOR_MESTRA)!;
    expect(mestra.papel!.fator).toBeCloseTo(FATOR_MESTRA, 9);
    expect(mestra.pts).toHaveLength(4);
    const b = o.strokes.find((s) => s.widthPx === paint.cut.widthPx)!;
    expect(b.pts).toHaveLength(4);
    expect(b.dash).toBeUndefined();
    expect(o.strokes).toHaveLength(4);
  });

  it('espessuraMestra sem papel usa só o fator na largura em pixels', () => {
    const e = espessuraMestra({ ...paint, proj: undefined as never, projPx: 2 });
    expect(e.widthPx).toBeCloseTo(2 * FATOR_MESTRA, 9);
    expect(e.papel).toBeUndefined();
  });

  it('mostrarExistente liga as curvas da superfície existente, tracejadas', () => {
    const p = projetoTerreno('T3');
    expect(terrenoOps(p, terreno(p), dados(), LIGHT, false, paint, 100).strokes.some((s) => s.dash?.[0] === EXISTENTE_TRACO[0])).toBe(false);
    const q = { ...p, elements: { ...p.elements, [T3]: { ...terreno(p), mostrarExistente: true } } } as Project;
    const tr = terrenoOps(q, terreno(q), dados(), LIGHT, false, paint, 100).strokes.filter((s) => s.dash?.[0] === EXISTENTE_TRACO[0]);
    expect(tr).toHaveLength(1);
  });

  it('sem kernel: só a envoltória das fontes, tracejada, sem exceção', () => {
    const p = projetoTerreno('T3');
    const o = terrenoOps(p, terreno(p), { propostas: null, existentes: null, bordas: null, cotas: () => null }, LIGHT, false, paint, 100);
    expect(o.strokes).toHaveLength(1);
    expect(o.strokes[0]!.dash).toEqual(RESERVA_TRACO);
    expect(o.strokes[0]!.pts).toHaveLength(4);
    expect(o.labels).toHaveLength(0);
  });

  it('bordaDeReserva usa a borda do modelo quando existe, e vazia com menos de 3 pontos', () => {
    const p = projetoTerreno('T8');
    expect(bordaDeReserva(terreno(p, 'tn_t8'))).toEqual([{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }]);
    expect(bordaDeReserva(makeTerrain({ id: 'x', levelId: 'lv_0' }) as Terrain)).toEqual([]);
  });

  it('só as curvas do próprio terreno entram', () => {
    const p = projetoTerreno('T3');
    const o = terrenoOps(p, terreno(p), dados({ propostas: [{ ...curva(1, 16, false), terrenoId: 'outro' }], bordas: [] }), LIGHT, false, paint, 100);
    expect(o.strokes).toHaveLength(0);
  });
});

describe('terrenoOps: rótulos de curva e pontos cotados', () => {
  it('rótulo na interseção da linha com a curva mestra, alinhado à curva, valor por cotaExibida', () => {
    const p = comFontes('T3', [{ op: 'setLinhasRotulo', v: [10, 0, 10, 20] }]);
    const o = terrenoOps(p, terreno(p), dados(), LIGHT, false, paint, 100);
    // Mestra z=5: quadrado de lado 4 centrado em (10,10): a linha x=10 cruza y=8 e y=12.
    const r = o.labels;
    expect(r).toHaveLength(2);
    expect(r.map((l) => l.at.y).sort((a, b) => a - b)).toEqual([8, 12]);
    expect(r[0]!.rotation).toBe(0);
    expect(r[0]!.text).toBe(textoDaCota(p, 5));
    expect(r[0]!.text).toBe('5,00 m');
  });

  it('a cota exibida soma a cota zero da localização', () => {
    const p = { ...comFontes('T3', [{ op: 'setLinhasRotulo', v: [10, 0, 10, 20] }]), localizacao: { origemE: 0, origemN: 0, cotaZero: 700, norteVerdadeiro: 0 } } as Project;
    expect(rotulosDeCurva(p, terreno(p), [curva(5, 4, true)], 100)[0]!.text).toBe('705,00 m');
  });

  it('linha que não cruza mestra não gera rótulo; curva aberta usa só os segmentos', () => {
    const p = comFontes('T3', [{ op: 'setLinhasRotulo', v: [0, 1, 20, 1] }]);
    expect(rotulosDeCurva(p, terreno(p), [curva(5, 4, true)], 100)).toHaveLength(0);
    const aberta: CurvaNivelTN = { terrenoId: T3, z: 5, mestra: true, fechada: false, pontos: [{ x: 0, y: 5 }, { x: 20, y: 5 }] };
    const q = comFontes('T3', [{ op: 'setLinhasRotulo', v: [10, 0, 10, 20] }]);
    expect(rotulosDeCurva(q, terreno(q), [aberta], 100)).toHaveLength(1);
  });

  it('anguloLegivel mantém o texto de -90 (exclusive) a 90', () => {
    expect(anguloLegivel(-1, 0)).toBe(0);
    expect(anguloLegivel(0, -1)).toBe(90);
    expect(anguloLegivel(1, 1)).toBeCloseTo(45, 9);
  });

  it('pontos cotados: cruz em pixels e valor do kernel', () => {
    const p = comFontes('T3', [{ op: 'setPontosCotados', v: [10, 10, 5, 5] }]);
    const o = terrenoOps(p, terreno(p), dados({ propostas: [], bordas: [] }), LIGHT, false, paint, 100);
    expect(o.strokes).toHaveLength(4);
    expect(o.strokes[0]!.deslocamentoPx).toEqual([{ x: -CRUZ_PX, y: 0 }, { x: CRUZ_PX, y: 0 }]);
    expect(o.labels.map((l) => l.text)).toEqual(['3,50 m', '3,50 m']);
    expect(rotuloDeCota(p, { x: 1, y: 2 }, 7, 100).text).toBe('7,00 m');
  });

  it('sem kernel o ponto cotado fica só com a cruz', () => {
    const p = comFontes('T3', [{ op: 'setPontosCotados', v: [10, 10] }]);
    const o = terrenoOps(p, terreno(p), { propostas: null, existentes: null, bordas: null, cotas: () => null }, LIGHT, false, paint, 100);
    expect(o.labels).toHaveLength(0);
    expect(o.strokes.filter((s) => s.deslocamentoPx)).toHaveLength(2);
  });
});

describe('regiões e realce', () => {
  it('região: preenchimento translúcido na cor do material e contorno fechado', () => {
    const p = projetoTerreno('T5');
    const r = regioesDoNivel(p, 'lv_0')[0]!;
    const o = regiaoOps(p, r, false, paint);
    expect(o.fills).toHaveLength(1);
    expect(o.fills[0]!.alpha).toBe(ALFA_REGIAO);
    expect(o.fills[0]!.polygons[0]![0]).toHaveLength(4);
    expect(o.strokes[0]!.closed).toBe(true);
    const m = { ...p, materials: { ...p.materials, mx: { ...Object.values(p.materials)[0]!, id: 'mx', color: '#123456' } } } as Project;
    const rr = { ...r, materialId: 'mx' } as TerrainRegion;
    expect(regiaoOps(m, rr, false, paint).fills[0]!.color).toBe('#123456');
  });

  it('terrenosDoNivel e regioesDoNivel filtram por nível e ocultos', () => {
    const s = new ProjectStore(createEmptyProject());
    adicionarFixtureTerreno(s, 'T5');
    expect(terrenosDoNivel(s.project, 'lv_0')).toHaveLength(1);
    expect(terrenosDoNivel(s.project, 'lv_1')).toHaveLength(0);
    expect(terrenosDoNivel(s.project, 'lv_0', new Set(['tn_t5']))).toHaveLength(0);
    expect(regioesDoNivel(s.project, 'lv_0', new Set(['rg_t5']))).toHaveLength(0);
  });

  it('realce do terreno é a borda e da região o contorno; sem seleção nada', () => {
    const p = projetoTerreno('T5');
    expect(terrenoSelectionOps(p, 'lv_0', [], null, LIGHT, dados({ bordas: [{ ...borda, terrenoId: 'tn_t5' }] })).strokes).toHaveLength(0);
    const o = terrenoSelectionOps(p, 'lv_0', ['tn_t5', 'rg_t5'], null, LIGHT, dados({ bordas: [{ ...borda, terrenoId: 'tn_t5' }] }));
    expect(o.strokes).toHaveLength(2);
    expect(o.fills).toHaveLength(0);
    const h = terrenoSelectionOps(p, 'lv_0', [], 'tn_t5', LIGHT, null);
    expect(h.strokes[0]!.dash).toBeUndefined();
    expect(h.strokes).toHaveLength(1);
  });
});
