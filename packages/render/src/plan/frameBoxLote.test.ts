import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLot, makeWall } from '@hestia/model';
import { elevationFrameBox, levelFrameBox } from './molduraDoNivel.ts';

const quadrado = [{ x: 20, y: 30 }, { x: 40, y: 30 }, { x: 40, y: 50 }, { x: 20, y: 50 }];
const lado = { papel: 'lateral' as const, recuo: 0 };

describe('enquadrar tudo e o lote', () => {
  it('um projeto só com lote é enquadrado no lote (antes a caixa era nula e a vista ficava fora do lote)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: quadrado, lados: [lado, lado, lado, lado] }) });
    const b = levelFrameBox(s.project, 'lv_0')!;
    expect(b).toEqual({ minX: 19.5, minY: 29.5, maxX: 40.5, maxY: 50.5 });
  });

  it('o lote soma-se às paredes do nível', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: quadrado, lados: [lado, lado, lado, lado] }) });
    const b = levelFrameBox(s.project, 'lv_0')!;
    expect(b.minX).toBeLessThanOrEqual(0);
    expect(b.maxX).toBeGreaterThanOrEqual(40);
    expect(b.maxY).toBeGreaterThanOrEqual(50);
  });

  it('a caixa das elevações não ganha o lote (ele não aparece em elevação)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addLot', lot: makeLot({ id: 'lt1', levelId: 'lv_0', contorno: quadrado, lados: [lado, lado, lado, lado] }) });
    expect(elevationFrameBox(s.project, 'lv_0')!.maxX).toBeLessThan(10);
  });
});
