import { describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { ghostBands } from './edit.ts';
import { comandosCopiaTerreno, comandosVerticalTerreno, fontesComCotaSomada, ghostTerreno, regioesDoTerreno, selectedTerrains, selectedTerrenosComRegioes } from './terrainHandles.ts';

const cena = (nome: 'T3' | 'T5'): ProjectStore => {
  const s = new ProjectStore(createEmptyProject());
  adicionarFixtureTerreno(s, nome);
  return s;
};
const move = { kind: 'translate', d: { x: 1, y: 2 } } as const;

describe('terrainHandles: o terreno como grupo', () => {
  it('regioesDoTerreno e selectedTerrains', () => {
    const { project: p } = cena('T5');
    expect(regioesDoTerreno(p, 'tn_t5').map((r) => r.id)).toEqual(['rg_t5']);
    expect(regioesDoTerreno(p, 'outro')).toEqual([]);
    expect(selectedTerrains(p, ['rg_t5', 'tn_t5', 'inexistente'])).toEqual(['tn_t5']);
    expect(selectedTerrenosComRegioes(p, ['tn_t5'])).toEqual(['tn_t5', 'rg_t5']);
  });

  it('o fantasma do terreno traz a envoltória (sem borda), os pontos e, em ghostBands, também a região', () => {
    const { project: p } = cena('T5');
    const g = ghostTerreno(p, 'tn_t5', move);
    expect(g[0]).toMatchObject({ kind: 'polygon', dashed: true });
    expect(g.filter((i) => i.kind === 'point')).toHaveLength(4);
    const ring = (g[0] as { ring: Array<{ x: number; y: number }> }).ring;
    expect(ring.some((q) => q.x === 1 && q.y === 2)).toBe(true);
    const bands = ghostBands(p, ['tn_t5', 'rg_t5'], move);
    expect(bands.filter((i) => i.kind === 'polygon')).toHaveLength(2);
    expect(ghostTerreno(p, 'inexistente', move)).toEqual([]);
  });

  it('o fantasma das curvas desenha as curvas fechadas e respeita o limite de segmentos', () => {
    const s = cena('T3');
    s.exec({ type: 'editTerrainFontes', terrenoId: 'tn_t3', ops: [{ op: 'addCurva', z: 1, xy: [2, 2, 18, 2, 18, 18, 2, 18], fechada: true }] });
    const linhas = ghostTerreno(s.project, 'tn_t3', move).filter((i) => i.kind === 'line');
    expect(linhas).toHaveLength(4);
  });

  it('fontesComCotaSomada soma só o z; comandosVerticalTerreno devolve um editTerrainFontes e a cota da plataforma', () => {
    const { project: p } = cena('T5');
    const f = fontesComCotaSomada({ pontos: [0, 0, 1], curvas: [{ z: 2, xy: [0, 0, 1, 1], fechada: false }], quebras: [{ xyz: [0, 0, 3, 1, 1, 4] }] }, 10);
    expect(f).toEqual({ pontos: [0, 0, 11], curvas: [{ z: 12, xy: [0, 0, 1, 1], fechada: false }], quebras: [{ xyz: [0, 0, 13, 1, 1, 14] }] });
    expect(comandosVerticalTerreno(p, 'tn_t5', 1)).toHaveLength(1);
    expect(comandosVerticalTerreno(p, 'rg_t5', 1)).toEqual([{ type: 'updateTerrainRegion', id: 'rg_t5', patch: { cota: 9 } }]);
    expect(comandosVerticalTerreno(p, 'x', 1)).toEqual([]);
  });

  it('comandosCopiaTerreno com ids injetados: terreno novo antes das regiões, e o mapa de ids', () => {
    const { project: p } = cena('T5');
    let n = 0;
    const r = comandosCopiaTerreno(p, ['tn_t5', 'rg_t5'], move, 0, (prefixo) => `${prefixo}_${++n}`);
    expect(r.commands.map((c) => c.type)).toEqual(['addTerrain', 'addTerrainRegion']);
    expect(r.idMap).toEqual({ tn_t5: 'tn_1', rg_t5: 'rg_2' });
    expect(r.commands[1]).toMatchObject({ regiao: { terrenoId: 'tn_1', id: 'rg_2' } });
  });
});
