import { afterEach, describe, expect, it, vi } from 'vitest';
import { projetoTerreno, servicoTerreno, type LinhaCorteTN, type SectionResult } from '@hestia/engine';
import { createEmptyProject } from '@hestia/model';
import { fantasmaDoMover, linhasDoTerrenoParaFantasma, SEM_NOTAS } from './sectionMoverPrevia.ts';

const pt = (s: number, z: number) => ({ s, z });
const LINHAS: LinhaCorteTN[] = [
  { terrenoId: 'tn_t5', papel: 'cortado', fechada: true, pontos: [pt(0, 10), pt(20, 10), pt(20, 5), pt(0, 5)] },
  { terrenoId: 'tn_t5', papel: 'perfilExistente', fechada: false, pontos: [pt(0, 10), pt(20, 10)] },
];
const secao = { length: 20, zMin: 0, zMax: 12, cut: [], openings: [], plano: { a: { x: 0, y: 10 }, b: { x: 20, y: 10 }, depth: 12 } } as unknown as SectionResult;
const alvos = (ids: string[]) => ({ movidos: ids, aberturas: [], notas: SEM_NOTAS });

afterEach(() => vi.restoreAllMocks());

describe('fantasma do Mover e do Copiar no corte para o terreno', () => {
  it('o terreno movido leva o contorno e as linhas deslocados de (dt, dz)', () => {
    const p = projetoTerreno('T5');
    const itens = fantasmaDoMover(p, secao, [], [], alvos(['tn_t5']), { x: 1, y: 0 }, 2, 3, LINHAS);
    const poli = itens.filter((i) => i.kind === 'polygon');
    expect(poli).toHaveLength(1);
    expect(poli[0]).toMatchObject({ kind: 'polygon', ring: [{ x: 2, y: 13 }, { x: 22, y: 13 }, { x: 22, y: 8 }, { x: 2, y: 8 }] });
    const linhas = itens.filter((i) => i.kind === 'line');
    expect(linhas).toEqual([{ kind: 'line', a: { x: 2, y: 13 }, b: { x: 22, y: 13 }, dashed: true }]);
  });

  it('a região selecionada leva o fantasma do terreno dela; terreno não selecionado não aparece', () => {
    const p = projetoTerreno('T5');
    expect(fantasmaDoMover(p, secao, [], [], alvos(['rg_t5']), { x: 1, y: 0 }, 1, 0, LINHAS).length).toBeGreaterThan(0);
    expect(fantasmaDoMover(p, secao, [], [], alvos([]), { x: 1, y: 0 }, 1, 0, LINHAS)).toEqual([]);
  });

  it('as linhas vêm do kernel; sem terreno ou sem kernel o fantasma é vazio', () => {
    const corte = vi.spyOn(servicoTerreno(), 'corte').mockReturnValue(LINHAS);
    expect(linhasDoTerrenoParaFantasma(projetoTerreno('T5'), secao)).toEqual(LINHAS);
    expect(corte).toHaveBeenCalledTimes(1);
    expect(linhasDoTerrenoParaFantasma(createEmptyProject(), secao)).toEqual([]);
    corte.mockReturnValue(null);
    expect(linhasDoTerrenoParaFantasma(projetoTerreno('T5'), secao)).toEqual([]);
  });
});
