import { describe, expect, it } from 'vitest';
import type { DetailLine } from '@hestia/model';
import { clickAt, makeEnv, tool } from './testEnv.ts';

// Encadeamento da forma "Linha" (opção `chain`, como a Parede). Valores literais, à mão.
const dl = (s: ReturnType<typeof makeEnv>['store']): DetailLine[] => s.project.levels[0]!.detailLines ?? [];

function ambiente(chain: boolean) {
  const e = makeEnv();
  e.options.detailLineShape = 'line';
  e.options.chain = chain;
  return { ...e, t: tool('detailLine', e.env) };
}

describe('linha de detalhe: encadeamento', () => {
  it('chain ligado: 3 cliques (0,0), (2,0), (2,3) geram 2 linhas ligadas: (0,0)-(2,0) e (2,0)-(2,3)', () => {
    const { store, t } = ambiente(true);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    const ls = dl(store);
    expect(ls).toHaveLength(2);
    expect(ls[0]!.a).toEqual({ x: 0, y: 0 });
    expect(ls[0]!.b).toEqual({ x: 2, y: 0 });
    expect(ls[1]!.a).toEqual({ x: 2, y: 0 });
    expect(ls[1]!.b).toEqual({ x: 2, y: 3 });
  });

  it('chain ligado: voltar ao ponto inicial fecha o circuito e o próximo clique começa outra cadeia', () => {
    const { store, t } = ambiente(true);
    for (const [x, y] of [[0, 0], [2, 0], [2, 2], [0, 0]] as const) clickAt(t, x, y);
    expect(dl(store)).toHaveLength(3);
    clickAt(t, 5, 5);
    clickAt(t, 6, 5);
    const ls = dl(store);
    expect(ls).toHaveLength(4);
    expect(ls[3]!.a).toEqual({ x: 5, y: 5 });
  });

  it('chain ligado: Esc encerra a cadeia; o clique seguinte começa uma linha nova', () => {
    const { store, t } = ambiente(true);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.cancel();
    clickAt(t, 7, 7);
    clickAt(t, 9, 7);
    const ls = dl(store);
    expect(ls).toHaveLength(2);
    expect(ls[1]!.a).toEqual({ x: 7, y: 7 });
    expect(ls[1]!.b).toEqual({ x: 9, y: 7 });
  });

  it('chain desligado: cada linha são 2 cliques (comportamento antigo)', () => {
    const { store, t } = ambiente(false);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 5, 5);
    clickAt(t, 5, 8);
    const ls = dl(store);
    expect(ls).toHaveLength(2);
    expect(ls[1]!.a).toEqual({ x: 5, y: 5 });
  });

  it('chain ligado: comprimento digitado também encadeia (3 + Enter, depois 2 + Enter)', () => {
    const { store, t } = ambiente(true);
    clickAt(t, 0, 0);
    t.move({ raw: { x: 1, y: 0 }, shift: false } as never);
    expect(t.type!('3')).toBe(true);
    t.move({ raw: { x: 3, y: 1 }, shift: false } as never);
    expect(t.type!('2')).toBe(true);
    const ls = dl(store);
    expect(ls).toHaveLength(2);
    expect(ls[0]!.b.x).toBeCloseTo(3, 9);
    expect(ls[1]!.a.x).toBeCloseTo(3, 9);
    expect(ls[1]!.b.y).toBeCloseTo(2, 9);
  });

  it('formas fechadas (retângulo) não encadeiam mesmo com chain ligado', () => {
    const e = makeEnv();
    e.options.detailLineShape = 'rect';
    e.options.chain = true;
    const t = tool('detailLine', e.env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 1);
    clickAt(t, 9, 9);
    clickAt(t, 11, 10);
    expect(dl(e.store)).toHaveLength(8);
  });
});

describe('linha de detalhe: cota da prévia na cadeia', () => {
  it('ao encadear, a cota de comprimento zero não aparece até o mouse se mover; depois cota o próximo traço (3,4) -> (3,8) = 4', () => {
    const { t } = ambiente(true);
    clickAt(t, 0, 0);
    t.move({ raw: { x: 3, y: 4 }, shift: false } as never);
    clickAt(t, 3, 4);
    expect(t.tempDims!()).toEqual([]);
    t.move({ raw: { x: 3, y: 8 }, shift: false } as never);
    const [dim] = t.tempDims!();
    expect(dim?.value).toBeCloseTo(4, 9);
  });
});
