import { describe, expect, it } from 'vitest';
import { assetUsage, buildFurnitureAsset, isFurniture, type Furniture } from '@hestia/model';
import { furnitureAt } from './pick.ts';
import { furnitureFootprint, furniturePoseAt } from './furnitureFootprint.ts';
import { furnitureToPlace, setFurnitureToPlace } from './furnitureTool.ts';
import { makeEnv, P, tool } from './testEnv.ts';

/** Bloco 2 x 1 x 0,5 m com a origem fora do centro e o piso em z = 0,25 (para conferir centralização e apoio no piso). */
function asset() {
  const positions = new Float32Array([5, 5, 0.25, 7, 5, 0.25, 7, 6, 0.25, 5, 6, 0.25, 5, 5, 0.75, 7, 5, 0.75, 7, 6, 0.75, 5, 6, 0.75]);
  return buildFurnitureAsset({
    name: 'Mesa',
    sourceFileName: 'mesa.glb',
    sourceFormat: 'glb',
    defs: [{ id: 'd', name: 'd', positions, normals: new Float32Array(24), uvs: new Float32Array(0), indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]), groups: [{ start: 0, count: 12, materialIndex: 0 }] }],
    materials: [{ name: 'm', color: [1, 1, 1], opacity: 1 }],
    textures: [],
  });
}

function setup() {
  const ctx = makeEnv();
  const a = asset();
  ctx.store.exec({ type: 'addFurnitureAsset', asset: a });
  return { ...ctx, a };
}

const items = (ctx: ReturnType<typeof setup>): Furniture[] => Object.values(ctx.store.project.elements).filter(isFurniture);

describe('ferramenta Móvel', () => {
  it('a prévia é o contorno centrado no cursor e o clique grava uma instância com a base no piso', () => {
    const ctx = setup();
    setFurnitureToPlace(ctx.a.id);
    const t = tool('furniture', ctx.env);
    t.move(P(10, 10));
    const poly = t.preview().find((i) => i.kind === 'polygon');
    if (poly?.kind !== 'polygon') throw new Error('sem contorno');
    const xs = poly.ring.map((q) => q.x);
    const ys = poly.ring.map((q) => q.y);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(10, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(10, 6);

    t.click(P(10, 10));
    const [f] = items(ctx);
    expect(f).toMatchObject({ assetId: ctx.a.id, levelId: 'lv_0', rotation: 0, scale: 1, mirrored: false, name: 'Mesa' });
    expect(f!.z).toBeCloseTo(-0.25, 6);
    expect(furnitureFootprint(f!, ctx.a)).toEqual(poly.ring.map((q) => ({ x: expect.closeTo(q.x, 6), y: expect.closeTo(q.y, 6) })));
  });

  it('várias cópias seguidas sem reabrir; a ferramenta continua ativa; cada clique é um passo de desfazer', () => {
    const ctx = setup();
    setFurnitureToPlace(ctx.a.id);
    const t = tool('furniture', ctx.env);
    t.click(P(0, 0));
    t.click(P(3, 0));
    t.click(P(6, 0));
    expect(items(ctx)).toHaveLength(3);
    expect(assetUsage(ctx.store.project, ctx.a.id).count).toBe(3);
    expect(ctx.done()).toBe(0);
    ctx.store.undo();
    expect(items(ctx)).toHaveLength(2);
  });

  it('Espaço gira 90 graus, Tab espelha e Esc sai sem alterar o modelo', () => {
    const ctx = setup();
    setFurnitureToPlace(ctx.a.id);
    const t = tool('furniture', ctx.env);
    t.move(P(1, 1));
    t.space?.();
    t.tab();
    t.click(P(1, 1));
    const [f] = items(ctx);
    expect(f!.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect(f!.mirrored).toBe(true);
    const n = items(ctx).length;
    t.cancel();
    expect(items(ctx)).toHaveLength(n);
    expect(ctx.done()).toBe(1);
  });

  it('sem bloco escolhido sai direto', () => {
    const ctx = setup();
    setFurnitureToPlace(null);
    expect(furnitureToPlace()).toBeNull();
    tool('furniture', ctx.env);
    expect(ctx.done()).toBe(1);
  });

  it('a seleção acha o móvel pelo contorno em planta (e respeita a rotação)', () => {
    const ctx = setup();
    const pose = furniturePoseAt(ctx.a, { x: 4, y: 4 }, Math.PI / 2, false);
    ctx.store.exec({ type: 'addFurniture', furniture: { id: 'F1', kind: 'furniture', assetId: ctx.a.id, levelId: 'lv_0', ...pose, name: 'Mesa' } });
    // girada 90°: 1 m em X e 2 m em Y em volta de (4, 4)
    expect(furnitureAt(ctx.store.project, 'lv_0', { x: 4, y: 4.9 }, 0.01)).toBe('F1');
    expect(furnitureAt(ctx.store.project, 'lv_0', { x: 4.9, y: 4 }, 0.01)).toBeNull();
    expect(furnitureAt(ctx.store.project, 'lv_1', { x: 4, y: 4 }, 0.01)).toBeNull();
  });
});
