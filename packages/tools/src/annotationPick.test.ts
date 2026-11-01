import { describe, expect, it } from 'vitest';
import { ProjectStore, angularDimensionData, angularDimensionGeometry, createEmptyProject, levelDimensions, levelTexts } from '@hestia/model';
import { annotationAt, annotationIdsInBox, dimHitGeometry, dimTextGripAt } from './annotationPick.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/** Texto 'Quarto' colocado em (9, 2) m, com a planta na escala padrão; o cursor mede 0,01 m por pixel. */
const MPP = 0.01;
const criaTexto = () => {
  const ctx = makeEnv();
  const t = tool('text', ctx.env);
  clickAt(t, 9, 2);
  t.type('Quarto');
  const id = levelTexts(ctx.store.project, 'lv_0')[0]!.id;
  return { ctx, id };
};

describe('seleção de texto: o retângulo do texto, não só a âncora (D1)', () => {
  it('clicar exatamente na âncora seleciona o texto', () => {
    const { ctx, id } = criaTexto();
    expect(annotationAt(ctx.store.project, 'lv_0', { x: 9, y: 2 }, MPP)).toEqual({ id, kind: 'text' });
  });

  it('clicar dentro do retângulo do texto, fora da âncora, seleciona', () => {
    const { ctx, id } = criaTexto();
    expect(annotationAt(ctx.store.project, 'lv_0', { x: 9.2, y: 2.1 }, MPP)).toEqual({ id, kind: 'text' });
    expect(annotationAt(ctx.store.project, 'lv_0', { x: 8.7, y: 1.9 }, MPP)).toEqual({ id, kind: 'text' });
  });

  it('a tolerância de pixels vale na borda do retângulo', () => {
    const { ctx, id } = criaTexto();
    // Meia largura do texto (6 caracteres) fica perto de 0,45 m; a tolerância (6 px = 0,06 m) cobre 0,5 m.
    expect(annotationAt(ctx.store.project, 'lv_0', { x: 9.5, y: 2 }, MPP)).toEqual({ id, kind: 'text' });
  });

  it('fora do retângulo e da tolerância não seleciona', () => {
    const { ctx } = criaTexto();
    expect(annotationAt(ctx.store.project, 'lv_0', { x: 10.5, y: 2 }, MPP)).toBeNull();
    expect(annotationAt(ctx.store.project, 'lv_0', { x: 9.4, y: 2.3 }, MPP)).toBeNull();
  });
});

describe('seleção da cota angular reflexa', () => {
  it('pega pelo arco longo e pelo texto, e entra na janela', () => {
    const store = new ProjectStore(createEmptyProject());
    const deg = Math.PI / 180;
    const to = { x: Math.cos(72.7 * deg), y: Math.sin(72.7 * deg) };
    const angular = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, to, 2, 'reflex', 'a', 'b', 'major');
    store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'ang', a: { x: 0, y: 0 }, b: { x: angular.to.x * 2, y: angular.to.y * 2 }, offset: 0, angular } });
    const dim = levelDimensions(store.project, 'lv_0')[0]!;
    const g = angularDimensionGeometry(dim)!;
    const arcMid = g.arc[Math.floor(g.arc.length / 2)]!;
    expect(annotationAt(store.project, 'lv_0', arcMid, MPP)).toEqual({ id: 'ang', kind: 'dimension' });
    expect(annotationAt(store.project, 'lv_0', g.textAt, MPP)).toEqual({ id: 'ang', kind: 'dimension' });
    expect(annotationIdsInBox(store.project, 'lv_0', { x: -3, y: -3 }, { x: 3, y: 3 }, MPP)).toContain('ang');
  });
});

describe('hit test da cota alinhado ao desenho (I2)', () => {
  const cria = (extra: Record<string, unknown>) => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, ...extra } });
    return store;
  };

  it('texto deslocado (textAt) seleciona pela posição desenhada, não pela padrão', () => {
    const store = cria({ textAt: { x: 6, y: 3 } });
    expect(annotationAt(store.project, 'lv_0', { x: 6, y: 3 }, MPP)).toEqual({ id: 'd1', kind: 'dimension' });
    // A posição padrão do texto (acima do meio da linha) já não é alvo do texto.
    expect(annotationAt(store.project, 'lv_0', { x: 2, y: 1.12 }, MPP)).toBeNull();
  });

  it('a linha de chamada do texto deslocado também seleciona', () => {
    const store = cria({ textAt: { x: 6, y: 3 } });
    expect(annotationAt(store.project, 'lv_0', { x: 4, y: 2 }, MPP)).toEqual({ id: 'd1', kind: 'dimension' });
  });

  it('o texto usa a altura do estilo global (maior texto sobe a posição padrão)', () => {
    const a = cria({});
    const b = cria({ textHeight: 10 });
    const ga = dimHitGeometry(a.project, levelDimensions(a.project, 'lv_0')[0]!, { x: 0, y: 0 }, { x: 4, y: 0 }, 50);
    const gb = dimHitGeometry(b.project, levelDimensions(b.project, 'lv_0')[0]!, { x: 0, y: 0 }, { x: 4, y: 0 }, 50);
    expect(gb.textAt.y).toBeGreaterThan(ga.textAt.y);
  });

  it('a alça do texto acompanha o texto deslocado', () => {
    const store = cria({ textAt: { x: 6, y: 3 } });
    expect(dimTextGripAt(store.project, 'lv_0', ['d1'], { x: 6, y: 3 }, MPP)).toBe('d1');
  });
});
