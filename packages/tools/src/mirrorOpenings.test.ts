import { describe, expect, it } from 'vitest';
import { applyTransform, type Vec2 } from '@hestia/geom';
import { type Opening } from '@hestia/model';
import { frameOfWall, openingGeometry, type OpeningGeometry } from '@hestia/engine';
import { clickAt, drawWall, makeEnv, tool, walls } from './testEnv.ts';

/** Porta e janela completas, com os campos que o espelho deve preservar. */
const door = (id: string, hostId: string, offset: number, flipHand = false, flipFacing = false): Opening => ({
  id,
  kind: 'door',
  typeId: 'ot_p80',
  hostId,
  offset,
  flipHand,
  flipFacing,
  sillOverride: null,
  mark: '',
});
const window_ = (id: string, hostId: string, offset: number): Opening => ({
  id,
  kind: 'window',
  typeId: 'ot_j120',
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
});

type Ctx = ReturnType<typeof makeEnv>;

/** Parede (0,0)-(6,0) com porta em offset 2 e janela em offset 4, parede selecionada. */
function cena(mirrorCopy: boolean): Ctx {
  const ctx = makeEnv();
  drawWall(ctx.env, [0, 0], [6, 0]);
  const w = walls(ctx.store)[0]!;
  ctx.env.exec({ type: 'addOpening', opening: door('d', w.id, 2) });
  ctx.env.exec({ type: 'addOpening', opening: window_('j', w.id, 4) });
  ctx.env.setSelection([w.id]);
  ctx.options.mirrorCopy = mirrorCopy;
  return ctx;
}

function geo(ctx: Ctx, id: string): OpeningGeometry {
  const p = ctx.store.project;
  const o = p.elements[id] as Opening;
  return openingGeometry(p, o, frameOfWall(p, o.hostId)!);
}

/** Dobradiça a meia largura do centro, no lado indicado por `flipHand`. */
function hinge(g: OpeningGeometry): Vec2 {
  const hs = g.flipHand ? 1 : -1;
  return { x: g.center.x + g.u.x * hs * (g.width / 2), y: g.center.y + g.u.y * hs * (g.width / 2) };
}

function closeTo(actual: Vec2, expected: Vec2): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

/** Espelho pelo eixo vertical x = -1 (cliques em (-1,-1) e (-1,5)). */
const eixo = { kind: 'mirror', a: { x: -1, y: -1 }, b: { x: -1, y: 5 } } as const;

function espelhar(ctx: Ctx): void {
  const m = tool('mirror', ctx.env);
  clickAt(m, -1, -1);
  clickAt(m, -1, 5);
}

describe('espelhar pela ferramenta com aberturas hospedadas', () => {
  it('in-place: as duas aberturas invertem flipFacing e preservam flipHand, com centro e dobradiça refletidos', () => {
    const ctx = cena(false);
    const antes = { d: geo(ctx, 'd'), j: geo(ctx, 'j'), w: walls(ctx.store)[0]! };

    espelhar(ctx);

    const w = walls(ctx.store)[0]!;
    expect(w.a.x).toBeCloseTo(-2);
    expect(w.b.x).toBeCloseTo(-8);
    for (const id of ['d', 'j'] as const) {
      const g = geo(ctx, id);
      expect(g.flipFacing).toBe(!antes[id].flipFacing);
      expect(g.flipHand).toBe(antes[id].flipHand);
      expect(g.offset).toBe(antes[id].offset);
      expect(g.hostId).toBe(antes.w.id);
      // Centro e dobradiça são exatamente os reflexos dos originais: é a imagem especular da abertura.
      closeTo(g.center, applyTransform(eixo, antes[id].center));
      closeTo(hinge(g), applyTransform(eixo, hinge(antes[id])));
    }
  });

  it('com cópia: original intacta e cópia simétrica com a nova parede como anfitriã', () => {
    const ctx = cena(true);
    const p = ctx.store.project;
    const antes = {
      d: geo(ctx, 'd'),
      j: geo(ctx, 'j'),
      dEl: p.elements.d as Opening,
      jEl: p.elements.j as Opening,
      wEl: walls(ctx.store)[0]!,
    };

    espelhar(ctx);

    const copia = walls(ctx.store).find((w) => w.id !== antes.wEl.id)!;
    expect(copia).toBeTruthy();
    // Originais intocadas (parede e aberturas).
    expect(walls(ctx.store).find((w) => w.id === antes.wEl.id)).toEqual(antes.wEl);
    expect(ctx.store.project.elements.d).toEqual(antes.dEl);
    expect(ctx.store.project.elements.j).toEqual(antes.jEl);

    const copias = Object.values(ctx.store.project.elements).filter(
      (e): e is Opening => e.id !== 'd' && e.id !== 'j' && 'hostId' in e && e.hostId === copia.id,
    );
    expect(copias).toHaveLength(2);
    for (const kind of ['door', 'window'] as const) {
      const o = copias.find((c) => c.kind === kind)!;
      const original = kind === 'door' ? antes.dEl : antes.jEl;
      const g = openingGeometry(ctx.store.project, o, frameOfWall(ctx.store.project, o.hostId)!);
      const gAntes = kind === 'door' ? antes.d : antes.j;
      expect(o.hostId).toBe(copia.id);
      expect(o.offset).toBe(original.offset);
      expect(o.flipHand).toBe(original.flipHand);
      expect(o.flipFacing).toBe(!original.flipFacing);
      // Par simétrico: centro e dobradiça da cópia são os reflexos dos originais.
      closeTo(g.center, applyTransform(eixo, gAntes.center));
      closeTo(hinge(g), applyTransform(eixo, hinge(gAntes)));
    }
  });

  it('origem flipHand=true e flipFacing=true: a inversão não é "sempre para false"', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [6, 0]);
    const w = walls(ctx.store)[0]!;
    ctx.env.exec({ type: 'addOpening', opening: door('d', w.id, 2, true, true) });
    ctx.env.setSelection([w.id]);
    ctx.options.mirrorCopy = false;
    const gAntes = geo(ctx, 'd');
    expect(gAntes.flipHand).toBe(true);
    expect(gAntes.flipFacing).toBe(true);

    espelhar(ctx);

    const g = geo(ctx, 'd');
    expect(g.flipHand).toBe(true);
    expect(g.flipFacing).toBe(false);
    closeTo(g.center, applyTransform(eixo, gAntes.center));
    closeTo(hinge(g), applyTransform(eixo, hinge(gAntes)));
  });
});
