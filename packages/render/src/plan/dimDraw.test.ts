import { DEFAULT_DIMENSION_STYLE, angularDimensionData, angularDimensionGeometry, type Dimension, type DimensionStyle } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { boxCorners, dimensionLaneOffsetMm, drawDimension, layoutDimensions, type DimItem, type DimLook } from './dimDraw.ts';
import { annotationHighlightOps } from './notes.ts';
import { ProjectStore, createEmptyProject } from '@hestia/model';

const SCALE = 100;
const LOOK: DimLook = { color: '#000', fina: { widthPx: 1 }, marcador: { widthPx: 2 }, paper: '#fff' };
const item = (id: string, x0: number, x1: number, offset = 0.6, text = `${(x1 - x0).toFixed(2).replace('.', ',')} m`): DimItem => ({
  d: { id, a: { x: x0, y: 0 }, b: { x: x1, y: 0 }, offset },
  a: { x: x0, y: 0 }, b: { x: x1, y: 0 }, text,
});

/** Sobreposição de dois retângulos orientados (SAT simples, para o teste). */
function sobrepoe(p: ReturnType<typeof boxCorners>, q: ReturnType<typeof boxCorners>): boolean {
  for (const poly of [p, q]) {
    for (let i = 0; i < 2; i++) {
      const ex = poly[i + 1]!.x - poly[i]!.x; const ey = poly[i + 1]!.y - poly[i]!.y;
      const ax = -ey; const ay = ex;
      const pr = (pts: typeof p) => pts.map((v) => v.x * ax + v.y * ay);
      const a = pr(p); const b = pr(q);
      if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return false;
    }
  }
  return true;
}

describe('cotas: estilo CAD', () => {
  it('slash: dois ticks a 45° e a linha ultrapassa os ticks; extensões com folga e ultrapassagem do estilo', () => {
    const [l] = layoutDimensions([item('a', 0, 4)], { scale: SCALE });
    const ops = drawDimension(l!, SCALE, LOOK);
    const ticks = ops.strokes.filter((s) => s.widthPx === 2);
    expect(ticks).toHaveLength(2);
    const t = ticks[0]!.pts;
    expect(Math.abs(Math.abs(t[1]!.x - t[0]!.x) - Math.abs(t[1]!.y - t[0]!.y))).toBeLessThan(1e-9);
    const linha = ops.strokes.find((s) => s.pts.length === 2 && s.pts[0]!.y === 0.6 && s.pts[1]!.y === 0.6)!;
    expect(linha.pts[0]!.x).toBeLessThan(0);
    expect(linha.pts[1]!.x).toBeGreaterThan(4);
    // Extensão: começa a 1,5 mm de papel (0,15 m) do ponto e passa 2 mm (0,2 m) da linha de cota.
    const ext = ops.strokes.find((s) => s.pts[0]!.x === 0 && s.pts[0]!.y > 0 && s.pts[1]!.y > 0.6)!;
    expect(ext.pts[0]!.y).toBeCloseTo(0.15, 9);
    expect(ext.pts[1]!.y).toBeCloseTo(0.8, 9);
  });

  it('arrow-filled preenche o triângulo; dot preenche o círculo; arrow-open usa quatro traços', () => {
    const com = (tick: DimensionStyle['tick']) => drawDimension(layoutDimensions([item('a', 0, 4)], { scale: SCALE, style: { ...DEFAULT_DIMENSION_STYLE, tick } })[0]!, SCALE, LOOK);
    expect(com('arrow-filled').fills).toHaveLength(2);
    expect(com('dot').fills).toHaveLength(2);
    expect(com('arrow-open').fills).toHaveLength(0);
    expect(com('arrow-open').strokes.filter((s) => s.widthPx === 2)).toHaveLength(4);
  });

  it("textPlacement 'centered' interrompe a linha em volta do texto", () => {
    const st = { ...DEFAULT_DIMENSION_STYLE, textPlacement: 'centered' as const };
    const [l] = layoutDimensions([item('a', 0, 4)], { scale: SCALE, style: st });
    const ops = drawDimension(l!, SCALE, LOOK);
    expect(l!.textAt).toEqual({ x: 2, y: 0.6 });
    expect(ops.strokes.filter((s) => s.pts.length === 2 && s.pts[0]!.y === 0.6 && s.pts[1]!.y === 0.6)).toHaveLength(2);
  });

  it('o estilo vale: fonte no rótulo e altura do texto', () => {
    const [l] = layoutDimensions([item('a', 0, 4)], { scale: SCALE, style: { ...DEFAULT_DIMENSION_STYLE, font: 'Courier', textHeight: 3 } });
    const lab = drawDimension(l!, SCALE, LOOK).labels[0]!;
    expect(lab.fontFamily).toBe('Courier');
    expect(lab.papel?.fontMm).toBe(3);
  });
});

describe('cotas: família de cotas', () => {
  const comFamilia = (style: DimensionStyle): DimItem => ({ ...item('a', 0, 4), style });

  it('o estilo da família vence o global e a fonte/altura chegam ao rótulo', () => {
    const [l] = layoutDimensions([comFamilia({ ...DEFAULT_DIMENSION_STYLE, font: 'Courier', textHeight: 4 })], { scale: SCALE, style: { ...DEFAULT_DIMENSION_STYLE, textHeight: 2.5 } });
    expect(l!.textMm).toBe(4);
    expect(l!.style.font).toBe('Courier');
    const lab = drawDimension(l!, SCALE, LOOK).labels[0]!;
    expect(lab.fontFamily).toBe('Courier');
    expect(lab.papel?.fontMm).toBe(4);
  });

  it('campos da cota ainda sobrepõem a família (textHeight da cota vence)', () => {
    const d = { ...item('a', 0, 4).d, textHeight: 6 };
    const [l] = layoutDimensions([{ d, a: d.a, b: d.b, text: '4,00 m', style: { ...DEFAULT_DIMENSION_STYLE, textHeight: 4 } }], { scale: SCALE });
    expect(l!.textMm).toBe(6);
  });

  it("readConvention 'horizontal' mantém o valor na horizontal em cota vertical", () => {
    const vertical: DimItem = { d: { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, offset: 0.6 }, a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, text: '4,00 m' };
    expect(layoutDimensions([vertical], { scale: SCALE })[0]!.rotation).toBe(90);
    const horizontal = { ...vertical, style: { ...DEFAULT_DIMENSION_STYLE, readConvention: 'horizontal' as const } };
    const l = layoutDimensions([horizontal], { scale: SCALE })[0]!;
    expect(l.rotation).toBe(0);
    // Com texto horizontal, o "acima da linha" é o eixo y: o valor fica sobre o meio do trecho, e não girado ao lado dele.
    expect(l.textAt.y).toBeCloseTo(2.275, 6);
    expect(l.textAt.x).toBeCloseTo(-0.6, 6);
  });

  it("textFit 'inside' nunca afasta o valor; 'outside' sempre afasta, mesmo cabendo", () => {
    const curto = { ...item('a', 0, 0.2), style: { ...DEFAULT_DIMENSION_STYLE, textFit: 'inside' as const } };
    expect(layoutDimensions([curto], { scale: SCALE })[0]!.moved).toBe(false);
    const fora = { ...comFamilia({ ...DEFAULT_DIMENSION_STYLE, textFit: 'outside' }), d: { id: 'a', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 0.6 } };
    const l = layoutDimensions([fora], { scale: SCALE })[0]!;
    expect(l.moved).toBe(true);
    expect(l.leader).toBeDefined();
  });

  it('stackSpacing define o passo das pistas de texto empilhadas', () => {
    expect(dimensionLaneOffsetMm(0, 2.5, 7)).toBeCloseTo(4, 9);
    expect(dimensionLaneOffsetMm(1, 2.5, 7)).toBeCloseTo(4 + 7, 9);
    expect(dimensionLaneOffsetMm(2, 2.5, 7)).toBeCloseTo(4 + 14, 9);
    // Muito pequeno: o mínimo de 1,4 altura de texto evita rótulos encostados.
    expect(dimensionLaneOffsetMm(1, 2.5, 0.5)).toBeCloseTo(4 + 3.5, 9);
  });
});

describe('cotas: não cabe e anti-sobreposição', () => {
  it('trecho curto: texto sai com linha de chamada até o meio da cota', () => {
    const [l] = layoutDimensions([item('a', 0, 0.2)], { scale: SCALE });
    expect(l!.fits).toBe(false);
    expect(l!.moved).toBe(true);
    expect(l!.leader![0]).toEqual({ x: 0.1, y: 0.6 });
    const ops = drawDimension(l!, SCALE, LOOK);
    expect(ops.strokes.some((s) => s.pts.length === 2 && s.pts[0]!.x === 0.1 && s.pts[0]!.y === 0.6 && s.pts[1] !== undefined && s.pts[1].y > 0.6)).toBe(true);
    expect(ops.labels[0]!.rotation).toBe(0);
  });

  it('cadeia de trechos curtos: nenhum par de textos se sobrepõe, e é determinístico', () => {
    const itens = [0, 0.15, 0.3, 0.45, 0.6, 0.75].map((x, i) => item(`c${i}`, x, x + 0.15));
    const a = layoutDimensions(itens, { scale: SCALE });
    const b = layoutDimensions([...itens].reverse(), { scale: SCALE });
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
      expect(sobrepoe(boxCorners(a[i]!.box), boxCorners(a[j]!.box))).toBe(false);
    }
    const pos = (ls: ReturnType<typeof layoutDimensions>) => Object.fromEntries(ls.map((l) => [l.item.d.id, l.textAt]));
    expect(pos(b)).toEqual(pos(a));
    expect(a.some((l) => l.moved)).toBe(true);
  });

  it('sem leaderWhenNoFit o texto fica no lugar padrão', () => {
    const [l] = layoutDimensions([item('a', 0, 0.2)], { scale: SCALE, style: { ...DEFAULT_DIMENSION_STYLE, leaderWhenNoFit: false } });
    expect(l!.moved).toBe(false);
    expect(l!.leader).toBeUndefined();
  });
});

describe('cotas: hover e seleção', () => {
  const store = new ProjectStore(createEmptyProject());
  const dim: Dimension = { id: 'dv', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 };
  store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: dim });
  const anot = { dimensions: [dim], texts: [], detailLines: [], detailRegions: [], tags: [] };
  it('hover redesenha a cota inteira (linha, chamadas, ticks, texto) na cor de realce, mais grossa', () => {
    const ops = annotationHighlightOps(store.project, 'lv_0', SCALE, { select: '#f00', hoverColor: '#0af' }, { hover: 'dv' }, anot);
    const cor = ops.strokes.filter((s) => s.color === '#0af' && s.alpha === 1);
    expect(cor.length).toBeGreaterThanOrEqual(5);
    expect(ops.labels).toHaveLength(1);
    expect(ops.labels[0]!.color).toBe('#0af');
  });
  it('seleção troca a cor da cota inteira', () => {
    const ops = annotationHighlightOps(store.project, 'lv_0', SCALE, { select: '#f00' }, { selection: ['dv'] }, anot);
    expect(ops.labels).toHaveLength(0);
  });
});

/** Folga do intervalo em volta do texto, em mm de papel (a mesma do desenho). */
const FOLGA_MM = 0.45;
const mPerMm = SCALE / 1000;
/** Traços colineares com a linha de cota `y` (horizontal). */
const linhasEm = (ops: ReturnType<typeof drawDimension>, y: number) => ops.strokes.filter((s) => s.pts.length === 2 && s.pts[0]!.y === y && s.pts[1]!.y === y);
/** Distância de um ponto ao segmento p–q. */
const distanciaSegmento = (p: Vec2, a: Vec2, b: Vec2): number => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

describe('cotas: texto CAD sem caixa e linha interrompida', () => {
  it('rótulo de cota linear não traz máscara/caixa de fundo', () => {
    const [l] = layoutDimensions([item('a', 0, 4)], { scale: SCALE });
    const lab = drawDimension(l!, SCALE, LOOK).labels[0]!;
    expect(lab.maskBoundary).toBeUndefined();
    expect(lab.maskColor).toBeUndefined();
    expect(lab.maskBorderColor).toBeUndefined();
  });

  it('texto centrado sobre a linha: a linha é interrompida em volta da caixa do texto', () => {
    const st = { ...DEFAULT_DIMENSION_STYLE, textPlacement: 'centered' as const };
    const [l] = layoutDimensions([item('a', 0, 4)], { scale: SCALE, style: st });
    const ops = drawDimension(l!, SCALE, LOOK);
    const segs = linhasEm(ops, 0.6);
    expect(segs).toHaveLength(2);
    const [esq, dir] = segs[0]!.pts[0]!.x < segs[1]!.pts[0]!.x ? [segs[0]!, segs[1]!] : [segs[1]!, segs[0]!];
    const fimEsq = Math.max(...esq.pts.map((p) => p.x));
    const iniDir = Math.min(...dir.pts.map((p) => p.x));
    const folga = FOLGA_MM * mPerMm;
    expect(fimEsq).toBeCloseTo(l!.box.c.x - l!.box.hw - folga, 9);
    expect(iniDir).toBeCloseTo(l!.box.c.x + l!.box.hw + folga, 9);
    // Nenhum traço passa por baixo do número.
    expect(iniDir - fimEsq).toBeGreaterThan(l!.w);
  });

  it('texto acima (fora) da linha: a linha de cota fica inteira', () => {
    const [l] = layoutDimensions([item('a', 0, 4)], { scale: SCALE });
    const segs = linhasEm(drawDimension(l!, SCALE, LOOK), 0.6);
    expect(segs).toHaveLength(1);
    expect(Math.min(...segs[0]!.pts.map((p) => p.x))).toBeLessThanOrEqual(0);
    expect(Math.max(...segs[0]!.pts.map((p) => p.x))).toBeGreaterThanOrEqual(4);
  });

  it('texto deslocado para fora com linha de chamada: a linha de cota não é interrompida', () => {
    const [l] = layoutDimensions([item('a', 0, 0.2)], { scale: SCALE });
    expect(l!.moved).toBe(true);
    const segs = linhasEm(drawDimension(l!, SCALE, LOOK), 0.6);
    expect(segs).toHaveLength(1);
  });

  it('cota vertical com texto girado: o intervalo acompanha o ângulo da linha', () => {
    const vertical: DimItem = { d: { id: 'v', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, offset: 0.6 }, a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, text: '4,00 m' };
    const st = { ...DEFAULT_DIMENSION_STYLE, textPlacement: 'centered' as const };
    const [l] = layoutDimensions([{ ...vertical, style: st }], { scale: SCALE });
    expect(l!.rotation).toBe(90);
    const xLinha = l!.g!.line[0]!.x;
    const verticais = drawDimension(l!, SCALE, LOOK).strokes.filter((s) => s.pts.length === 2 && s.pts[0]!.x === xLinha && s.pts[1]!.x === xLinha);
    expect(verticais).toHaveLength(2);
    const ys = verticais.map((s) => s.pts.map((p) => p.y).sort((a, b) => a - b)).sort((a, b) => a[0]! - b[0]!);
    expect(ys[1]![0]! - ys[0]![1]!).toBeCloseTo(l!.w + 2 * FOLGA_MM * mPerMm, 9);
  });

  it('texto sobre o arco: o arco é interrompido em volta do número; fora dele fica inteiro', () => {
    const angular = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, 2, 'minor', 'a', 'b');
    const d: Dimension = { id: 'ang', a: { x: 0, y: 0 }, b: { x: 0, y: 2 }, offset: 0, angular };
    const ang = angularDimensionGeometry(d)!;
    const meio = ang.arc[Math.floor(ang.arc.length / 2)]!;
    /** Subsegmentos do arco (o desenho pode mandar o arco inteiro num traço ou em vários, quando há intervalo). */
    const subArco = (ops: ReturnType<typeof drawDimension>): Array<[Vec2, Vec2]> => ops.strokes
      .filter((s) => s.widthPx === 1 && s.pts.every((p) => Math.abs(Math.hypot(p.x, p.y) - 2) < 1e-9))
      .flatMap((s) => s.pts.slice(1).map((p, i) => [s.pts[i]!, p] as [Vec2, Vec2]));
    const semTexto = layoutDimensions([{ d, a: d.a, b: d.b, text: '90°', ang }], { scale: SCALE })[0]!;
    const comTexto = layoutDimensions([{ d, a: d.a, b: d.b, text: '90°', ang: { ...ang, textAt: meio } }], { scale: SCALE })[0]!;
    const sem = subArco(drawDimension(semTexto, SCALE, LOOK));
    const com = subArco(drawDimension(comTexto, SCALE, LOOK));
    expect(sem).toHaveLength(ang.arc.length - 1);
    expect(com.length).toBeGreaterThan(sem.length);
    // O centro do arco (onde está o número) não é coberto por traço nenhum.
    for (const [a, b] of com) expect(distanciaSegmento(meio, a, b)).toBeGreaterThan(0.05);
  });
});
