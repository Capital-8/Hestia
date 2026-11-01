import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { ghostOpenings } from './edit.ts';
import { drawWall, makeEnv, walls } from './testEnv.ts';
import type { PreviewItem } from './types.ts';

/** Parede (0,0)-(6,0) com uma porta no offset 2. */
function cena(flipFacing = false) {
  const ctx = makeEnv();
  drawWall(ctx.env, [0, 0], [6, 0]);
  const wallId = walls(ctx.store)[0]!.id;
  ctx.store.exec({
    type: 'addOpening',
    opening: { id: 'd', kind: 'door', typeId: 'ot_p80', hostId: wallId, offset: 2, flipHand: false, flipFacing, sillOverride: null, mark: '' },
  });
  return { ctx, wallId };
}

type GhostLine = Extract<PreviewItem, { kind: 'line' }>;

const lines = (items: PreviewItem[]): GhostLine[] => items.filter((i): i is GhostLine => i.kind === 'line');
const points = (items: PreviewItem[]): Vec2[] => lines(items).flatMap((l) => [l.a, l.b]);

/** Média de y: o sinal diz para que lado da parede (eixo em y = 0) a folha e o arco abrem. */
function meanY(items: PreviewItem[]): number {
  const pts = points(items);
  return pts.reduce((s, q) => s + q.y, 0) / pts.length;
}

/** Eixo de simetria vertical em x = -1: o espelho da parede fica do lado x <= -2. */
const EIXO = { kind: 'mirror', a: { x: -1, y: -1 }, b: { x: -1, y: 5 } } as const;

describe('ghostOpenings', () => {
  it('no espelho, desenha a abertura do lado espelhado com o lado da folha invertido', () => {
    const base = cena(false);
    const espelhado = ghostOpenings(base.ctx.store.project, [base.wallId], EIXO);
    expect(espelhado.length).toBeGreaterThan(0);
    expect(espelhado.every((i) => i.kind === 'line')).toBe(true);
    for (const q of points(espelhado)) expect(q.x).toBeLessThanOrEqual(-2 + 1e-6);
    // O caso de origem com flipFacing = true é a imagem do caso sem espelho; espelhados, os dois trocam de lado.
    const outra = cena(true);
    const espelhadoOutra = ghostOpenings(outra.ctx.store.project, [outra.wallId], EIXO);
    expect(espelhadoOutra.length).toBe(espelhado.length);
    expect(meanY(espelhado)).toBeGreaterThan(0);
    expect(meanY(espelhadoOutra)).toBeLessThan(0);
    expect(Math.sign(meanY(espelhado))).toBe(-Math.sign(meanY(espelhadoOutra)));
  });

  it('mover desloca os pontos sem mudar o lado da folha', () => {
    const { ctx, wallId } = cena();
    const p = ctx.store.project;
    const parado = ghostOpenings(p, [wallId], { kind: 'translate', d: { x: 0, y: 0 } });
    const movido = ghostOpenings(p, [wallId], { kind: 'translate', d: { x: 0, y: 2 } });
    const a = points(parado);
    const b = points(movido);
    expect(b.length).toBe(a.length);
    b.forEach((q, i) => {
      expect(q.x).toBeCloseTo(a[i]!.x, 9);
      expect(q.y).toBeCloseTo(a[i]!.y + 2, 9);
    });
    expect(meanY(movido)).toBeCloseTo(meanY(parado) + 2, 9);
  });

  it('girar gira os pontos e mantém a orientação relativa da folha', () => {
    const { ctx, wallId } = cena();
    const p = ctx.store.project;
    const parado = ghostOpenings(p, [wallId], { kind: 'translate', d: { x: 0, y: 0 } });
    const girado = ghostOpenings(p, [wallId], { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 });
    const a = points(parado);
    const b = points(girado);
    expect(b.length).toBe(a.length);
    b.forEach((q, i) => {
      expect(q.x).toBeCloseTo(-a[i]!.y, 9);
      expect(q.y).toBeCloseTo(a[i]!.x, 9);
    });
  });

  it('parede sem aberturas não devolve nada', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [6, 0]);
    const wallId = walls(ctx.store)[0]!.id;
    expect(ghostOpenings(ctx.store.project, [wallId], { kind: 'translate', d: { x: 0, y: 2 } })).toEqual([]);
  });
});
