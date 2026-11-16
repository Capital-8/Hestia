import { describe, expect, it } from 'vitest';
import { createEmptyProject, ProjectStore, type AreaPlanAnnotations } from '@hestia/model';
import { alcaDoTextoEm, annotationHighlightOps, blocoEm, drawnAnnotations, linhasDoTexto, noteOps, textBlockModel } from './notes.ts';
import { defaultPaint } from './style.ts';

const LV0 = 'lv_0';
const ZOOM = 40;
const SCALE = 100;
const LOOK = { ink: '#000', select: '#f00', selection: [] as string[] };

/** Loja com um texto e uma cota no nível. */
function comTexto(over: { text?: string; width?: number; frame?: boolean } = {}): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
  s.exec({ type: 'addText', levelId: LV0, text: { id: 't1', at: { x: 2, y: 2 }, text: over.text ?? 'Sala', height: 3, rotation: 0, ...(over.width ? { width: over.width } : {}), ...(over.frame ? { frame: true } : {}) } });
  return s;
}

const paint = (): ReturnType<typeof defaultPaint> => defaultPaint('annotation', ZOOM);

/** Retângulo fechado (4 pontos) na cor dada. */
const retangulos = (ops: ReturnType<typeof noteOps>, color: string) => ops.strokes.filter((s) => s.closed && s.pts.length === 4 && s.color === color);

describe('texto de anotação · seleção e caixa', () => {
  it('texto selecionado: cor de seleção no rótulo, caixa em volta e quadradinho no ponto de ancoragem', () => {
    const p = comTexto().project;
    const ops = noteOps(p, LV0, paint(), { ...LOOK, selection: ['t1'] }, SCALE);
    const texto = ops.labels.find((l) => l.text === 'Sala')!;
    expect(texto.color).toBe(LOOK.select);
    // Caixa de seleção em volta do bloco, na cor de seleção.
    const caixas = retangulos(ops, LOOK.select);
    expect(caixas.length).toBeGreaterThanOrEqual(1);
    const bloco = textBlockModel({ text: 'Sala', height: 3 }, SCALE);
    const esperado = blocoEm({ x: 2, y: 2 }, bloco.w, bloco.h, 0);
    // A caixa cerca o bloco: os vértices ficam nas extremidades (com a folga) em torno de `at`.
    for (const q of caixas[0]!.pts) expect(Math.hypot(q.x - 2, q.y - 2)).toBeGreaterThanOrEqual(Math.hypot(esperado[1]!.x - 2, esperado[1]!.y - 2));
    // Alça: marcador em pixels ancorado no canto inferior esquerdo, fora do texto (o `selectTool` pega por ele).
    const alca = ops.strokes.find((s) => s.deslocamentoPx && s.color === LOOK.select);
    expect(alca).toBeDefined();
    const esperada = alcaDoTextoEm({ at: { x: 2, y: 2 }, text: 'Sala', height: 3, rotation: 0 }, SCALE);
    for (const q of alca!.pts) expect(q).toEqual(esperada);
    expect(ops.fills.some((f) => f.deslocamentoPx)).toBe(true);
  });

  it('texto sem seleção: sem caixa e sem alça (só o rótulo)', () => {
    const p = comTexto().project;
    const ops = noteOps(p, LV0, paint(), LOOK, SCALE);
    expect(retangulos(ops, LOOK.select)).toHaveLength(0);
    expect(ops.strokes.some((s) => s.deslocamentoPx)).toBe(false);
  });

  it('texto com `frame`: retângulo de papel atrás e contorno em volta do bloco', () => {
    const p = comTexto({ frame: true }).project;
    const ops = noteOps(p, LV0, paint(), LOOK, SCALE);
    // Um preenchimento de papel (fundo) e um contorno fechado de 4 pontos, ambos no bloco do texto.
    const fundo = ops.fills.find((f) => f.alpha === 1 && f.color === '#fbfbfa');
    expect(fundo).toBeDefined();
    expect(fundo!.polygons[0]![0]).toHaveLength(4);
    const contorno = retangulos(ops, LOOK.ink);
    expect(contorno).toHaveLength(1);
    // A moldura fica em volta do texto (maior que o bloco puro).
    const bloco = textBlockModel({ text: 'Sala', height: 3 }, SCALE);
    const larguraMoldura = Math.abs(fundo!.polygons[0]![0]![1]!.x - fundo!.polygons[0]![0]![0]!.x);
    expect(larguraMoldura).toBeGreaterThan(bloco.w);
  });

  it('texto com `\\n` e `width`: as quebras são preservadas no texto de tela (`whiteSpace: pre-wrap`) e o bloco cresce', () => {
    const p = comTexto({ text: 'Sala\nCozinha', width: 30 }).project;
    const ops = noteOps(p, LV0, paint(), LOOK, SCALE);
    const t = ops.labels.find((l) => l.text.startsWith('Sala'))!;
    expect(t.text).toBe('Sala\nCozinha');
    expect(t.whiteSpace).toBe('pre-wrap');
    expect(t.papel).toMatchObject({ escala: SCALE, fontMm: 3, widthMm: 30 });
    const duasLinhas = textBlockModel({ text: 'Sala\nCozinha', height: 3, width: 30 }, SCALE);
    const umaLinha = textBlockModel({ text: 'Sala', height: 3 }, SCALE);
    expect(duasLinhas.h).toBeGreaterThan(umaLinha.h);
    expect(duasLinhas.w).toBeCloseTo((30 * SCALE) / 1000, 9);
    expect(linhasDoTexto('aaa bbb ccc', 3, 6)).toEqual(['aaa', 'bbb', 'ccc']);
  });
});

describe('anotações da vista · destaque', () => {
  const anotacoes = (): AreaPlanAnnotations => ({
    dimensions: [{ id: 'dv', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 }],
    texts: [{ id: 'tv', at: { x: 2, y: 3 }, text: 'NOTA DA VISTA', height: 3, rotation: 0 }],
    detailLines: [],
    detailRegions: [],
    tags: [],
  });

  it('cota e texto da vista selecionados continuam destacados pela cor de seleção', () => {
    const p = comTexto().project;
    const ops = noteOps(p, LV0, paint(), { ...LOOK, selection: ['dv', 'tv'] }, SCALE, undefined, anotacoes());
    expect(ops.labels.find((l) => l.text === 'NOTA DA VISTA')!.color).toBe(LOOK.select);
    // A linha de cota e as chamadas da cota selecionada saem na cor de seleção.
    expect(ops.strokes.some((s) => s.color === LOOK.select && !s.closed)).toBe(true);
    // E a caixa do texto da vista é desenhada.
    expect(retangulos(ops, LOOK.select).length).toBeGreaterThanOrEqual(1);
  });

  it('hover do texto da vista: realce leve e sem alça; hover da cota cerca o valor', () => {
    const p = comTexto().project;
    const alvo = { hover: 'tv' };
    const noTexto = annotationHighlightOps(p, LV0, SCALE, LOOK, alvo, anotacoes());
    expect(noTexto.fills.length).toBeGreaterThan(0);
    expect(noTexto.strokes.some((s) => s.closed && s.pts.length === 4)).toBe(true);
    expect(noTexto.strokes.some((s) => s.deslocamentoPx)).toBe(false);
    const naCota = annotationHighlightOps(p, LV0, SCALE, LOOK, { hover: 'dv' }, anotacoes());
    expect(naCota.fills.length).toBeGreaterThan(0);
    expect(naCota.strokes.some((s) => s.closed && s.pts.length === 4)).toBe(true);
    // Sem alvo, nada é desenhado.
    expect(annotationHighlightOps(p, LV0, SCALE, LOOK, {}, anotacoes())).toEqual({ fills: [], strokes: [], labels: [] });
  });

  it('seleção do texto na camada de destaque: caixa e alça; sem tocar nos rótulos', () => {
    const p = comTexto().project;
    const ops = annotationHighlightOps(p, LV0, SCALE, LOOK, { selection: ['tv'] }, anotacoes());
    expect(ops.labels).toHaveLength(0);
    expect(ops.strokes.filter((s) => s.closed && s.pts.length === 4 && !s.deslocamentoPx)).toHaveLength(1);
    expect(ops.strokes.some((s) => s.deslocamentoPx)).toBe(true);
  });

  it('sem anotações próprias da vista, as do nível são as desenhadas', () => {
    const p = comTexto().project;
    const a = drawnAnnotations(p, LV0);
    expect(a.texts.map((t) => t.id)).toEqual(['t1']);
    expect(a.dimensions.map((d) => d.id)).toEqual(['d1']);
  });
});

describe('alças da cota selecionada na planta (quadrado do afastamento e losango do texto)', () => {
  it('quadrado no meio da linha de cota (2,1) e losango no texto (2,1.5), ambos em pixels de tela', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, textAt: { x: 2, y: 1.5 } } });
    const ops = annotationHighlightOps(s.project, LV0, SCALE, { select: LOOK.select, paper: '#fff' }, { selection: ['d1'] });
    const naCota = (x: number, y: number) => ops.strokes.filter((st) => st.deslocamentoPx && st.pts.every((q) => q.x === x && q.y === y));
    const quadrado = naCota(2, 1);
    expect(quadrado).toHaveLength(1);
    expect(quadrado[0]!.deslocamentoPx).toEqual([{ x: -4.5, y: -4.5 }, { x: 4.5, y: -4.5 }, { x: 4.5, y: 4.5 }, { x: -4.5, y: 4.5 }]);
    const losango = naCota(2, 1.5);
    expect(losango).toHaveLength(1);
    expect(losango[0]!.deslocamentoPx).toEqual([{ x: 0, y: -6 }, { x: 6, y: 0 }, { x: 0, y: 6 }, { x: -6, y: 0 }]);
  });
});
