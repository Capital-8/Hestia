import { describe, expect, it } from 'vitest';
import { massaM1 } from '@hestia/engine/src/fixtureMassa.ts';
import { isMass, type Mass, type Project } from '@hestia/model';
import { clipboardFrom } from './clipboard.ts';
import { massRings } from './massPick.ts';
import { setPasteClip } from './pasteTool.ts';
import { makeEnv, P, tool } from './testEnv.ts';

/**
 * Colar por clique com a MASSA (ficha T1c, item a): a prévia leva a massa e o clique a grava deslocada pelo cursor, num só passo de desfazer.
 * A massa de teste é a M1 com origem (10, 0) e arranjo polar de 3 cópias em volta de (12, 0). A âncora do Colar é o centro da caixa de
 * todas as cópias do arranjo (o anel de cada uma, sem kernel, é o contorno da base girado).
 */
const massas = (p: Project): Mass[] => Object.values(p.elements).filter(isMass);

/** Centro da caixa de todos os anéis da massa (o mesmo critério da âncora do Colar). */
function centroDaCaixa(rings: Array<Array<{ x: number; y: number }>>): { x: number; y: number } {
  const pts = rings.flat();
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

describe('Colar por clique: massa', () => {
  it('copiar e colar em outro ponto: a cópia nasce com id novo e a origem e o centro do arranjo andam pelo mesmo vetor do cursor; desfazer remove', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'addMass', mass: { ...massaM1(), origem: { x: 10, y: 0 }, arranjo: { n: 3, cx: 12, cy: 0, anguloTotal: 2 * Math.PI } } });
    const c = centroDaCaixa(massRings(ctx.store.project, 'm1'));
    setPasteClip(clipboardFrom(ctx.store.project, ['m1'])!);
    const t = tool('paste', ctx.env);
    const destino = { x: 20, y: 5 };
    t.move(P(destino.x, destino.y));
    expect(t.preview().some((i) => i.kind === 'polygon')).toBe(true);
    t.click(P(destino.x, destino.y));
    const original = ctx.store.project.elements['m1'] as Mass;
    expect(original.origem).toEqual({ x: 10, y: 0 });
    expect(original.arranjo).toMatchObject({ cx: 12, cy: 0 });
    const copia = massas(ctx.store.project).find((m) => m.id !== 'm1')!;
    expect(copia.id).toMatch(/^ms/);
    const dx = destino.x - c.x;
    const dy = destino.y - c.y;
    expect(copia.origem.x).toBeCloseTo(10 + dx, 9);
    expect(copia.origem.y).toBeCloseTo(0 + dy, 9);
    expect(copia.arranjo).toMatchObject({ n: 3, anguloTotal: 2 * Math.PI });
    expect(copia.arranjo!.cx).toBeCloseTo(12 + dx, 9);
    expect(copia.arranjo!.cy).toBeCloseTo(dy, 9);
    expect(ctx.sel()).toEqual([copia.id]);
    expect(massas(ctx.store.project)).toHaveLength(2);
    ctx.store.undo();
    expect(massas(ctx.store.project).map((m) => m.id)).toEqual(['m1']);
    ctx.store.redo();
    expect(massas(ctx.store.project)).toHaveLength(2);
  });
});
