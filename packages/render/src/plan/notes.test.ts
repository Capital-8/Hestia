import { describe, expect, it } from 'vitest';
import { resolverRotulo } from './zoomOps.ts';
import { ProjectStore, createEmptyProject, angularDimensionData, makeWall, paperMmToPx } from '@hestia/model';
import { noteOps } from './notes.ts';
import { defaultPaint } from './style.ts';
import { Limiares, type VistaComLimiares } from './limiares.ts';
import { valorCabeNoTrecho } from './dimLabels.ts';

const LV0 = 'lv_0';
const ZOOM = 40;
const SCALE = 100;
const VISTA = { cx: 0, cy: 0, zoom: ZOOM, width: 800, height: 600 };
const LOOK = { ink: '#000', select: '#f00', selection: [] as string[] };

function comCota(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  s.exec({ type: 'addText', levelId: LV0, text: { id: 't1', at: { x: 2, y: 2 }, text: 'Sala', height: 3, rotation: 90 } });
  return s;
}

describe('anotações na planta', () => {
  it('cota: texto do valor "4,00 m" centrado acima da linha, com a fonte em mm de papel × escala', () => {
    const p = comCota().project;
    const ops = noteOps(p, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE);
    const cota = ops.labels[0]!;
    expect(cota.text).toBe('4,00 m');
    expect(cota.center).toBe(true);
    expect(cota.rotation).toBe(0);
    expect(resolverRotulo(cota, ZOOM).fontPx).toBeCloseTo(paperMmToPx(2.5, ZOOM, SCALE), 9);
    expect(cota.at.y).toBeGreaterThan(1);
  });

  it('o texto da cota segue as unidades do projeto', () => {
    const s = comCota();
    s.exec({ type: 'setSettings', patch: { units: { length: { unit: 'cm', decimals: 1 } } } });
    const ops = noteOps(s.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE);
    expect(ops.labels[0]!.text).toBe('400,0 cm');
  });

  it('cota gera linha, duas chamadas e duas marcas: 5 traços com a espessura de corte da categoria', () => {
    const p = comCota().project;
    const pt = defaultPaint('annotation', ZOOM);
    const ops = noteOps(p, LV0, pt, LOOK, SCALE);
    expect(ops.strokes).toHaveLength(5);
    for (const st of ops.strokes) expect(st.widthPx).toBe(pt.cutPx);
  });

  it('cota curta (valor maior que o trecho): rótulo afastado com linha de chamada, alternando alturas entre vizinhos', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'c1', a: { x: 0, y: 0 }, b: { x: 0.12, y: 0 }, offset: 1 } });
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'c2', a: { x: 0.12, y: 0 }, b: { x: 0.3, y: 0 }, offset: 1 } });
    const ops = noteOps(s.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE, VISTA);
    const [r1, r2] = [ops.labels[0]!, ops.labels[1]!];
    // Trecho de 0,12 m a 40 px/m (~4,8 px) não cabe o texto "0,12 m": o rótulo sai fora da linha (acima do centro, em y negativo do desenho)
    expect(r1.text).toBe('0,12 m');
    expect(r1.at.y).toBeGreaterThan(1.5);
    expect(r2.at.y).toBeGreaterThan(r1.at.y);
    expect(ops.strokes.filter((st) => st.pts.length === 2 && st.widthPx === defaultPaint('annotation', ZOOM).cutPx)).toHaveLength(2 * 5 + 2);
  });

  it('texto livre: valor, altura em mm de papel e rotação do próprio texto', () => {
    const p = comCota().project;
    const ops = noteOps(p, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE);
    const t = ops.labels[1]!;
    expect(t).toMatchObject({ text: 'Sala', rotation: 90, at: { x: 2, y: 2 } });
    expect(resolverRotulo(t, ZOOM).fontPx).toBeCloseTo(paperMmToPx(3, ZOOM, SCALE), 9);
  });

  it('categoria anotação oculta: nada sai', () => {
    const p = comCota().project;
    const off = { ...defaultPaint('annotation', ZOOM), visible: false };
    expect(noteOps(p, LV0, off, LOOK, SCALE)).toEqual({ fills: [], strokes: [], labels: [] });
  });

  it('nível sem anotações: nada sai', () => {
    const p = createEmptyProject();
    expect(noteOps(p, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE)).toEqual({ fills: [], strokes: [], labels: [] });
  });

  it('cota curta: a decisão "cabe no trecho" vira um limiar de zoom que o quadro registra', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'c1', a: { x: 0, y: 0 }, b: { x: 1.2, y: 0 }, offset: 1 } });
    const limiares = new Limiares();
    const v: VistaComLimiares = { ...VISTA, limiares };
    noteOps(s.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE, v);
    // "1,20 m" (6 caracteres) a 0,6 em por caractere, com a fonte no piso de 1 px: cabe em 1,2 m a partir de 0,6 × 6 / 1,2 = 3 px/m
    expect(limiares.lista()).toEqual([3]);
    // Trecho de 0,12 m: a fonte de papel (0,25 px por px/m) nunca deixa o texto caber, então não há limiar a registrar
    const curta = new ProjectStore(createEmptyProject());
    curta.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'c2', a: { x: 0, y: 0 }, b: { x: 0.12, y: 0 }, offset: 1 } });
    const l2 = new Limiares();
    noteOps(curta.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE, { ...VISTA, limiares: l2 } as VistaComLimiares);
    expect(l2.lista()).toEqual([]);
  });

  it('o limiar de zoom coincide com a conta direta de largura do texto em px (qualquer escala e trecho)', () => {
    for (const [escala, trecho, textMm] of [[100, 0.12, 2.5], [50, 0.3, 2.5], [200, 1, 3], [100, 4, 2.5], [20, 0.05, 1.8]] as const) {
      const { limiar } = valorCabeNoTrecho('0,12 m', trecho, textMm, escala, 1);
      for (const z of [1, 5, 12, 20, 30, 40, 60, 100, 220, 500, 2000]) {
        const { cabe } = valorCabeNoTrecho('0,12 m', trecho, textMm, escala, z);
        expect(cabe, `escala ${escala}, trecho ${trecho}, zoom ${z}`).toBe(z >= limiar);
      }
    }
  });

  it('texto com largura de caixa: a largura sai em mm de papel e vira px com o zoom', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addText', levelId: LV0, text: { id: 't1', at: { x: 0, y: 0 }, text: 'Texto longo', height: 3, rotation: 0, width: 40, bold: true } });
    const t = noteOps(s.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE).labels[0]!;
    expect(t.papel).toMatchObject({ escala: SCALE, fontMm: 3, widthMm: 40 });
    expect(t.bold).toBe(true);
    expect(resolverRotulo(t, ZOOM).widthPx).toBeCloseTo(paperMmToPx(40, ZOOM, SCALE), 9);
  });

  it('cota angular: arco, marcas e valor em graus', () => {
    const s = new ProjectStore(createEmptyProject());
    const angular = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, 2, 'minor', 'a', 'b');
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'ang', a: { x: 0, y: 0 }, b: { x: 0, y: 2 }, offset: 0, angular, precision: 1 } });
    const ops = noteOps(s.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE);
    expect(ops.labels).toHaveLength(1);
    expect(ops.labels[0]!.text).toContain('90');
    expect(ops.strokes.length).toBeGreaterThanOrEqual(3);
  });

  it('cota angular reflexa: arco > 180° segmentado e texto no meio do arco longo', () => {
    const s = new ProjectStore(createEmptyProject());
    const deg = Math.PI / 180;
    const to = { x: Math.cos(72.7 * deg), y: Math.sin(72.7 * deg) };
    const reflex = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, to, 2, 'reflex', 'a', 'b', 'major');
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'ang', a: { x: 0, y: 0 }, b: { x: reflex.to.x * 2, y: reflex.to.y * 2 }, offset: 0, angular: reflex, precision: 1 } });
    const ops = noteOps(s.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE);
    expect(ops.labels).toHaveLength(1);
    expect(ops.labels[0]!.text).toContain('252,7');
    // O arco reflexo tem mais segmentos que o de 180° e o texto fica no meio dele (126,35°). O valor interrompe o arco
    // (sem linha por baixo do número), então o desenho sai em mais de um trecho; o vão angular continua o mesmo.
    const arcos = ops.strokes.filter((st) => st.pts.length >= 2 && st.pts.every((p) => Math.abs(Math.hypot(p.x, p.y) - 2) < 0.01));
    expect(arcos.length).toBeGreaterThan(1);
    expect(arcos.reduce((n, st) => n + st.pts.length, 0)).toBeGreaterThan(30);
    const inicio = arcos[0]!.pts[0]!;
    const fim = arcos.at(-1)!.pts.at(-1)!;
    const volta = (Math.atan2(fim.y, fim.x) - Math.atan2(inicio.y, inicio.x) + Math.PI * 2) % (Math.PI * 2);
    expect(Math.atan2(inicio.y, inicio.x)).toBeCloseTo(0, 6);
    expect(volta).toBeCloseTo(252.7 * deg, 6);
    const mid = ops.labels[0]!.at;
    expect((Math.atan2(mid.y, mid.x) * 180) / Math.PI).toBeCloseTo(126.35, 6);
  });

  it('planta: as pontas da cota angular reflexa ficam nos eixos de parede referenciados', () => {
    const s = new ProjectStore(createEmptyProject());
    const angle = 30 * Math.PI / 180;
    s.exec({ type: 'addWall', wall: makeWall({ id: 'wa', typeId: 'wt_alv14', levelId: LV0, a: { x: -4, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'wb', typeId: 'wt_alv14', levelId: LV0, a: { x: -4 * Math.cos(angle), y: -4 * Math.sin(angle) }, b: { x: 4 * Math.cos(angle), y: 4 * Math.sin(angle) } }) });
    const angular = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: Math.cos(angle), y: Math.sin(angle) }, 1.5, 'reflex', 'wa:eixo', 'wb:eixo', 'minor');
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'ang-ref', a: { x: 0, y: 0 }, b: { x: angular.to.x * angular.radius, y: angular.to.y * angular.radius }, offset: 0, angular } });
    const ops = noteOps(s.project, LV0, defaultPaint('annotation', ZOOM), LOOK, SCALE);
    const arcos = ops.strokes.filter((st) => st.pts.length >= 2 && st.pts.every((p) => Math.abs(Math.hypot(p.x, p.y) - 1.5) < 0.01));
    const start = arcos[0]!.pts[0]!;
    const end = arcos.at(-1)!.pts.at(-1)!;
    expect(start.y).toBeCloseTo(0, 8);
    expect(end.x * Math.sin(angle) - end.y * Math.cos(angle)).toBeCloseTo(0, 8);
  });
});
