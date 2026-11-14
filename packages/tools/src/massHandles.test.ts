import { describe, expect, it } from 'vitest';
import { massaM1, massaM2 } from '@hestia/engine/src/fixtureMassa.ts';
import type { Vec2 } from '@hestia/geom';
import { isMass, massIssue, type Mass } from '@hestia/model';
import { alcaDaMassaEm, alcasDaMassa, massHandlePreview, massaComVerticeMovido } from './massHandles.ts';
import { makeEnv, P, tool } from './testEnv.ts';

/**
 * Alças da massa em planta, pela ferramenta Selecionar: a de ORIGEM move a massa; a de VÉRTICE (perfil livre da base) muda só aquele ponto;
 * arraste que deixa o perfil inválido não grava nada. Cada arraste é um passo de desfazer.
 */
const get = (ctx: ReturnType<typeof makeEnv>, id: string): Mass => ctx.store.project.elements[id] as Mass;
const base = (m: Mass): Vec2[] => (m.secoes[0]!.perfil.forma === 'livre' ? m.secoes[0]!.perfil.pontos : []);

function arrastar(t: ReturnType<typeof tool>, de: Vec2, para: Vec2): void {
  t.move(P(de.x, de.y));
  t.down!(P(de.x, de.y));
  t.drag!(P(para.x, para.y));
  t.up!(P(para.x, para.y));
}

function cena(m: Mass = massaM1()) {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addMass', mass: m });
  ctx.env.setSelection([m.id]);
  return { ctx, t: tool('select', ctx.env) };
}

describe('alças da massa (geometria)', () => {
  it('M1 (perfil livre) tem a origem e os 4 vértices da base; M2 (círculo) só a origem', () => {
    expect(alcasDaMassa(massaM1()).map((a) => a.tipo)).toEqual(['origem', 'vertice', 'vertice', 'vertice', 'vertice']);
    expect(alcasDaMassa(massaM2()).map((a) => a.tipo)).toEqual(['origem']);
  });

  it('as alças só aparecem para a massa selecionada e saem como pontos na prévia', () => {
    const { ctx } = cena();
    expect(massHandlePreview(ctx.store.project, ['m1'])).toHaveLength(5);
    expect(massHandlePreview(ctx.store.project, [])).toHaveLength(0);
    expect(alcaDaMassaEm(ctx.store.project, [], { x: 0, y: 0 }, 0.01)).toBeNull();
    expect(alcaDaMassaEm(ctx.store.project, ['m1'], { x: 5.02, y: 3.01 }, 0.01)).toMatchObject({ tipo: 'vertice', indice: 2 });
  });

  it('o vértice leva em conta origem, deslocamento, rotação e escala da primeira seção', () => {
    const m = massaM1();
    m.origem = { x: 10, y: 0 };
    m.secoes[0] = { ...m.secoes[0]!, rotacao: Math.PI / 2, escala: 2, dx: 1, dy: 0 };
    const a = alcasDaMassa(m).filter((x) => x.tipo === 'vertice')[0]!;
    // Ponto local (-5, -3) · escala 2 = (-10, -6); girado 90 graus = (6, -10); mais (1, 0) e a origem (10, 0).
    expect(a.at.x).toBeCloseTo(17, 9);
    expect(a.at.y).toBeCloseTo(-10, 9);
    const movido = massaComVerticeMovido(m, 0, { x: 17.5, y: -10 })!;
    expect(isMass(movido)).toBe(true);
    // Ida e volta pela geometria: o vértice cai exatamente onde foi pedido.
    expect(alcasDaMassa(movido).filter((x) => x.tipo === 'vertice')[0]!.at.x).toBeCloseTo(17.5, 9);
  });
});

describe('alças da massa pela ferramenta Selecionar', () => {
  it('arrastar a alça de origem move a massa (e o centro do arranjo) num só passo; desfaz e refaz', () => {
    const { ctx, t } = cena({ ...massaM1(), arranjo: { n: 2, cx: 3, cy: 0, anguloTotal: Math.PI } });
    arrastar(t, { x: 0, y: 0 }, { x: 2, y: 4 });
    expect(get(ctx, 'm1').origem).toEqual({ x: 2, y: 4 });
    expect(get(ctx, 'm1').arranjo).toMatchObject({ cx: 5, cy: 4 });
    expect(base(get(ctx, 'm1'))).toEqual(base(massaM1()));
    ctx.store.undo();
    expect(get(ctx, 'm1').origem).toEqual({ x: 0, y: 0 });
    expect(get(ctx, 'm1').arranjo).toMatchObject({ cx: 3, cy: 0 });
    ctx.store.redo();
    expect(get(ctx, 'm1').origem).toEqual({ x: 2, y: 4 });
  });

  it('arrastar a alça de vértice muda só aquele ponto do perfil da base (e não as demais seções); um passo de desfazer', () => {
    const { ctx, t } = cena();
    const antes = massaM1();
    arrastar(t, { x: 5, y: 3 }, { x: 6, y: 4 });
    const m = get(ctx, 'm1');
    const pts = base(m);
    expect(pts[2]).toEqual({ x: 6, y: 4 });
    expect(pts[0]).toEqual(base(antes)[0]);
    expect(pts[1]).toEqual(base(antes)[1]);
    expect(pts[3]).toEqual(base(antes)[3]);
    // A seção de cima (z = 9) não é tocada.
    expect(m.secoes[1]).toEqual(antes.secoes[1]);
    expect(m.origem).toEqual({ x: 0, y: 0 });
    ctx.store.undo();
    expect(base(get(ctx, 'm1'))[2]).toEqual({ x: 5, y: 3 });
    ctx.store.redo();
    expect(base(get(ctx, 'm1'))[2]).toEqual({ x: 6, y: 4 });
  });

  it('arraste inválido (o perfil se cruza) não grava: o projeto fica como estava e nada entra no desfazer', () => {
    const { ctx, t } = cena();
    const antes = ctx.store.project;
    // Levar o vértice (5, 3) para (-8, -6) cruza as arestas do retângulo (perfil deixa de ser simples).
    expect(massaComVerticeMovido(massaM1(), 2, { x: -8, y: -6 })).toBeNull();
    arrastar(t, { x: 5, y: 3 }, { x: -8, y: -6 });
    expect(ctx.store.project).toBe(antes);
    expect(massIssue(get(ctx, 'm1'))).toBeNull();
    expect(base(get(ctx, 'm1'))[2]).toEqual({ x: 5, y: 3 });
    // O único passo de desfazer é a criação da massa: o arraste inválido não deixou entrada própria.
    ctx.store.undo();
    expect(ctx.store.project.elements['m1']).toBeUndefined();
  });
});
