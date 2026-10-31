import { DEFAULT_DIMENSION_STYLE, type Dimension, type DimensionStyle } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { boxCorners, drawDimension, layoutDimensions, type DimItem, type DimLook } from './dimDraw.ts';
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
