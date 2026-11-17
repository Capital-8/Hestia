import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLot, type Project } from '@hestia/model';
import { distanciaAoContorno, lotesDoNivel, lotIdsInBox, pickLoteAt } from './lotPick.ts';

const v = (x: number, y: number) => ({ x, y });
const lotL1 = [v(0, 0), v(12, 0), v(12, 30), v(0, 30)];

/** Lote L1 (retângulo (0,0)-(12,30)) no `lv_0`. */
function addLot(): { project: Project; id: string } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addLot', lot: makeLot({ id: 'lt_l1', levelId: 'lv_0', contorno: lotL1, lados: lotL1.map(() => ({ papel: 'lateral' as const, recuo: 0 })) }) });
  return { project: s.project, id: 'lt_l1' };
}

describe('seleção do lote (funções puras)', () => {
  it('clique perto do contorno seleciona; o interior não', () => {
    const { project, id } = addLot();
    expect(pickLoteAt(project, 'lv_0', v(6, 0.05), 0.2)).toBe(id);
    expect(pickLoteAt(project, 'lv_0', v(12.1, 15), 0.2)).toBe(id);
    expect(pickLoteAt(project, 'lv_0', v(6, 15), 0.2)).toBeNull();
    expect(pickLoteAt(project, 'lv_0', v(6, -3), 0.2)).toBeNull();
  });

  it('oculto e outro nível não são alvo', () => {
    const { project, id } = addLot();
    expect(pickLoteAt(project, 'lv_0', v(6, 0), 0.2, new Set([id]))).toBeNull();
    expect(pickLoteAt(project, 'outro', v(6, 0), 0.2)).toBeNull();
    expect(lotesDoNivel(project, 'lv_0')).toHaveLength(1);
  });

  it('janela pega o lote inteiro dentro da caixa; caixa dentro do lote não pega', () => {
    const { project, id } = addLot();
    expect(lotIdsInBox(project, 'lv_0', v(-1, -1), v(13, 31))).toEqual([id]);
    expect(lotIdsInBox(project, 'lv_0', v(-1, -1), v(11, 31))).toEqual([]);
    expect(lotIdsInBox(project, 'lv_0', v(2, 2), v(10, 20))).toEqual([]);
  });

  it('cruzamento pega o lote cujo contorno toca a caixa (b.x < a.x); caixa interna não', () => {
    const { project, id } = addLot();
    expect(lotIdsInBox(project, 'lv_0', v(14, 12), v(8, 10))).toEqual([id]);
    expect(lotIdsInBox(project, 'lv_0', v(10, 20), v(2, 5))).toEqual([]);
    expect(lotIdsInBox(project, 'lv_0', v(30, 40), v(20, 35))).toEqual([]);
  });

  it('distância ao contorno', () => {
    expect(distanciaAoContorno(v(6, 15), lotL1)).toBeCloseTo(6, 9);
    expect(distanciaAoContorno(v(0, 0), lotL1)).toBe(0);
  });
});
