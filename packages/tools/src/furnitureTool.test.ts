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
    // o bloco vem recentrado (centro da base na origem): a instância fica em z = 0 e x,y = ponto do clique
    expect(f!.z).toBeCloseTo(0, 6);
    expect(f!.x).toBeCloseTo(10, 6);
    expect(f!.y).toBeCloseTo(10, 6);
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

describe('contorno real e transformação do móvel importado', () => {
  /** Triângulo-prisma de base (0,0) (4,0) (0,2) m: o casco é o próprio triângulo (3 vértices), não a caixa de 4 cantos. */
  function prisma() {
    const positions = new Float32Array([0, 0, 0, 4, 0, 0, 0, 2, 0, 0, 0, 1, 4, 0, 1, 0, 2, 1]);
    return buildFurnitureAsset({
      name: 'Prisma',
      sourceFileName: 'p.glb',
      sourceFormat: 'glb',
      defs: [{ id: 'd', name: 'd', positions, normals: new Float32Array(18), uvs: new Float32Array(0), indices: new Uint32Array([0, 1, 2, 3, 5, 4]), groups: [{ start: 0, count: 6, materialIndex: 0 }] }],
      materials: [{ name: 'm', color: [1, 1, 1], opacity: 1 }],
      textures: [],
    });
  }

  it('o contorno em planta é o casco da projeção da malha (3 vértices, área 4 m²)', async () => {
    const { furnitureOutline } = await import('./furnitureFootprint.ts');
    const a = prisma();
    const ring = furnitureOutline({ x: 0, y: 0, z: 0, rotation: 0, scale: 1, mirrored: false }, a);
    expect(ring.length).toBe(3);
    let area = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; area += p.x * q.y - q.x * p.y; }
    expect(Math.abs(area) / 2).toBeCloseTo(4, 9);
  });

  it('o comando transform move, gira 90° e espelha o móvel (cópia com id novo)', () => {
    const ctx = setup();
    ctx.store.exec({ type: 'addFurniture', furniture: { id: 'fu_a', kind: 'furniture', assetId: ctx.a.id, levelId: ctx.store.project.levels[0]!.id, x: 1, y: 2, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'Mesa' } });
    ctx.store.exec({ type: 'transform', ids: ['fu_a'], transform: { kind: 'translate', d: { x: 3, y: -1 } } });
    let f = ctx.store.project.elements['fu_a'] as Furniture;
    expect([f.x, f.y]).toEqual([4, 1]);
    ctx.store.exec({ type: 'transform', ids: ['fu_a'], transform: { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    f = ctx.store.project.elements['fu_a'] as Furniture;
    expect(f.x).toBeCloseTo(-1, 9);
    expect(f.y).toBeCloseTo(4, 9);
    expect(f.rotation).toBeCloseTo(Math.PI / 2, 9);
    ctx.store.exec({ type: 'transform', ids: ['fu_a'], transform: { kind: 'translate', d: { x: 1, y: 0 } }, copy: { idMap: { fu_a: 'fu_b' } } });
    expect(items(ctx).map((i) => i.id).sort()).toEqual(['fu_a', 'fu_b']);
    expect((ctx.store.project.elements['fu_b'] as Furniture).x).toBeCloseTo(0, 9);
  });

  it('R gira 90° na ferramenta e Shift+R ao contrário', () => {
    const ctx = setup();
    setFurnitureToPlace(ctx.a.id);
    const t = tool('furniture', ctx.env);
    t.move(P(10, 10));
    expect(t.key?.('r')).toBe(true);
    t.click(P(10, 10));
    expect(items(ctx)[0]!.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(t.key?.('r', true)).toBe(true);
    t.click(P(12, 12));
    expect(items(ctx)[1]!.rotation).toBeCloseTo(0, 9);
  });
});
